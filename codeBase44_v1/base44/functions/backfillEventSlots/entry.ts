/**
 * backfillEventSlots.js
 * Script de backfill SAFE + PRODUCTION-GRADE pour peupler Session.slots
 * à partir de Event.rolesNeeded.
 *
 * Règles absolues:
 * - Ne traite QUE sessionType === "event"
 * - Ne modifie PAS QuickPlay (double garde-fou)
 * - Ne modifie PAS les sessions qui ont déjà des slots
 * - Idempotent (peut être relancé N fois sans effet si déjà backfillé)
 * - Admin uniquement
 * - DRY_RUN supporté (aucun update si DRY_RUN=true dans le body)
 * - Pagination robuste (ne suppose jamais que filter() retourne tout)
 * - Continue sur erreur par session (ne stop pas tout)
 *
 * Invocation: POST /backfillEventSlots (admin seulement)
 * Body (optionnel): { dryRun: true }
 *
 * How to test via curl:
 *   DRY RUN  : POST body { "dryRun": true }
 *   REAL RUN : POST body {} (ou body vide)
 */

// deploy: v2
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const VALID_SLOT_STATUSES = ['open', 'pending', 'confirmed'];
function normalizeSlots(input) {
  if (!input || !Array.isArray(input)) return [];
  const seen = new Set();
  const valid = [];
  for (const s of input) {
    if (!s || typeof s !== 'object') continue;
    const slotId = typeof s.slotId === 'string' ? s.slotId.trim() : '';
    if (!slotId || seen.has(slotId)) continue;
    const roleSystemId = typeof s.roleSystemId === 'string' ? s.roleSystemId.trim() : '';
    if (!roleSystemId) continue;
    seen.add(slotId);
    valid.push({ slotId, roleSystemId, status: VALID_SLOT_STATUSES.includes(s.status) ? s.status : 'open', candidateUserId: typeof s.candidateUserId === 'string' && s.candidateUserId.trim() ? s.candidateUserId : null, candidateStyleSystemIds: Array.isArray(s.candidateStyleSystemIds) ? s.candidateStyleSystemIds.filter(x => typeof x === 'string' && x.trim()) : [], confirmedAt: typeof s.confirmedAt === 'string' ? s.confirmedAt : null, confirmedBy: typeof s.confirmedBy === 'string' ? s.confirmedBy : null });
  }
  return valid;
}
function findSlot(slots, slotId) {
  const index = slots.findIndex(s => s.slotId === slotId);
  if (index === -1) { const err = new Error(`Slot not found: ${slotId}`); err.code = 'SLOT_NOT_FOUND'; throw err; }
  return { slot: slots[index], index };
}
function assertSlotState(slot, allowed, context) {
  if (!allowed.includes(slot.status)) { const err = new Error(`Invalid slot state for "${slot.slotId}": current="${slot.status}", allowed=[${allowed.join(',')}]` + (context ? ` (${context})` : '')); err.code = 'INVALID_SLOT_STATE'; throw err; }
}
function buildSlotsFromRolesNeeded(sessionId, rolesNeeded) {
  if (!Array.isArray(rolesNeeded) || rolesNeeded.length === 0) return [];
  return rolesNeeded.map((roleSystemId, index) => ({ slotId: `SL-${sessionId}-${index}`, roleSystemId, status: 'open', candidateUserId: null, candidateStyleSystemIds: [], confirmedAt: null, confirmedBy: null }));
}

// Taille de page pour la pagination défensive
const PAGE_SIZE = 100;
// Log de progression toutes les N sessions
const LOG_EVERY_N = 20;

/**
 * fetchAllEventSessions(base44)
 * Pagination robuste: itère jusqu'à obtenir toutes les sessions event.
 * Base44 SDK: list(sort, limit, skip) — on utilise skip/limit.
 * @returns {Promise<Array>}
 */
async function fetchAllEventSessions(base44) {
  const all = [];
  let skip = 0;

  while (true) {
    // list(sort, limit, skip) — tri neutre, PAGE_SIZE, offset
    const page = await base44.asServiceRole.entities.Session.list(
      'created_date',
      PAGE_SIZE,
      skip,
    );

    if (!Array.isArray(page) || page.length === 0) break;

    // Filtrer côté client pour sessionType === "event"
    // (filter() avec $eq sur sessionType pourrait ne pas paginer correctement)
    const eventOnly = page.filter(s => s.sessionType === 'event');
    all.push(...eventOnly);

    if (page.length < PAGE_SIZE) break; // dernière page
    skip += PAGE_SIZE;
  }

  return all;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    // Lire le flag DRY_RUN depuis le body
    const body = await req.json().catch(() => ({}));
    const DRY_RUN = body?.dryRun === true;

    if (DRY_RUN) {
      console.log('[backfill] *** DRY_RUN MODE — aucun update ne sera effectué ***');
    }

    const stats = {
      scanned:                 0,
      eventSessions:           0,
      backfilled:              0,
      dryRunWouldBackfill:     0,
      skippedAlreadyHasSlots:  0,
      skippedNoRolesNeeded:    0,
      skippedNoEvent:          0,
      errors:                  0,
      warningsDuplicates:      0,
      errorDetails:            [],
    };

    // ── 1. Pagination robuste ───────────────────────────────────────────────
    console.log('[backfill] Fetching all event sessions (paginated)...');
    const allSessions = await fetchAllEventSessions(base44);

    stats.scanned       = allSessions.length;
    stats.eventSessions = allSessions.length;
    console.log(`[backfill] Found ${allSessions.length} event session(s) total`);

    // ── 2. Charger tous les Events référencés (chunked) ────────────────────
    const eventIds = [...new Set(allSessions.map(s => s.eventId).filter(Boolean))];
    const eventMap = {};

    if (eventIds.length > 0) {
      const CHUNK = 50;
      for (let i = 0; i < eventIds.length; i += CHUNK) {
        const chunk = eventIds.slice(i, i + CHUNK);
        const events = await base44.asServiceRole.entities.Event.filter({
          id: { $in: chunk },
        }).catch(() => []);
        for (const ev of (events || [])) {
          eventMap[ev.id] = ev;
        }
      }
    }

    // ── 3. Traiter chaque session event ────────────────────────────────────
    for (let i = 0; i < allSessions.length; i++) {
      const session = allSessions[i];

      // Log progression
      if ((i + 1) % LOG_EVERY_N === 0 || i === allSessions.length - 1) {
        console.log(`[backfill] Progress: ${i + 1}/${allSessions.length} — backfilled=${stats.backfilled} errors=${stats.errors}`);
      }

      try {
        // Garde-fou QuickPlay (double sécurité — ne jamais toucher quickplay)
        if (session.sessionType !== 'event') continue;

        // normalizeSlots durci: filtre invalides + déduplique
        const existingSlots = normalizeSlots(session.slots);

        // Comptabiliser les warnings de duplicates détectés lors de la normalisation
        const rawLen = Array.isArray(session.slots) ? session.slots.length : 0;
        if (rawLen > existingSlots.length && rawLen > 0) {
          const dupes = rawLen - existingSlots.length;
          stats.warningsDuplicates += dupes;
          console.warn(`[backfill] session=${session.id} had ${dupes} duplicate/invalid slot(s) in stored data`);
        }

        // Skip si slots déjà présents (idempotence)
        if (existingSlots.length > 0) {
          stats.skippedAlreadyHasSlots++;
          continue;
        }

        // Résoudre l'event
        const event = session.eventId ? eventMap[session.eventId] : null;
        if (!event) {
          stats.skippedNoEvent++;
          console.warn(`[backfill] session=${session.id} skipped — event not found (eventId=${session.eventId})`);
          continue;
        }

        const rolesNeeded = Array.isArray(event.rolesNeeded)
          ? event.rolesNeeded.filter(r => typeof r === 'string' && r.trim())
          : [];

        if (rolesNeeded.length === 0) {
          stats.skippedNoRolesNeeded++;
          console.warn(`[backfill] session=${session.id} skipped — event has no rolesNeeded (eventId=${session.eventId})`);
          continue;
        }

        // Générer les slots
        const slots = buildSlotsFromRolesNeeded(session.id, rolesNeeded);

        if (DRY_RUN) {
          // DRY_RUN: log seulement, pas d'update
          stats.dryRunWouldBackfill++;
          console.log(`[backfill][DRY_RUN] wouldBackfill: session=${session.id} — ${slots.length} slot(s) from event=${event.id}`);
        } else {
          // REAL: sauvegarder
          await base44.asServiceRole.entities.Session.update(session.id, { slots });
          stats.backfilled++;
          console.log(`[backfill] session=${session.id} backfilled ${slots.length} slot(s) from event=${event.id}`);
        }

      } catch (sessionErr) {
        // Continue — ne pas bloquer les autres sessions
        stats.errors++;
        const msg = `session=${session.id}: ${sessionErr?.message || sessionErr}`;
        stats.errorDetails.push(msg);
        console.error(`[backfill] ERROR ${msg}`);
      }
    }

    // ── 4. Résumé final ────────────────────────────────────────────────────
    const summary = {
      dryRun:                  DRY_RUN,
      scanned:                 stats.scanned,
      eventSessions:           stats.eventSessions,
      backfilled:              stats.backfilled,
      dryRunWouldBackfill:     stats.dryRunWouldBackfill,
      skippedAlreadyHasSlots:  stats.skippedAlreadyHasSlots,
      skippedNoRolesNeeded:    stats.skippedNoRolesNeeded,
      skippedNoEvent:          stats.skippedNoEvent,
      errors:                  stats.errors,
      warningsDuplicates:      stats.warningsDuplicates,
    };

    console.log('[backfill] ══ SUMMARY ══', JSON.stringify(summary, null, 2));

    if (stats.errors > 0) {
      console.error('[backfill] ERRORS_PRESENT — voir errorDetails');
      return Response.json({
        ok:           false,
        ERRORS_PRESENT: true,
        summary,
        errorDetails: stats.errorDetails,
      }, { status: 207 }); // 207 Multi-Status: partiel
    }

    return Response.json({ ok: true, summary });

  } catch (error) {
    console.error('[backfill] Fatal error:', error?.message || error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});