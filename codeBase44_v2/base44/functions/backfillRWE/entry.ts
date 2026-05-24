/**
 * backfillRWE — Rejoue l'accumulation RWE sur toutes les sessions historiques.
 *
 * CONTEXTE :
 *   Les sessions completed/sots_submitted avant le déploiement de commitParticipantUsage v4
 *   n'ont pas de rweTotal. Cette fonction recalcule rweTotal, rweAvgPerSession,
 *   rweSessionCount et rweCommittedSessionIds pour tous les talents concernés.
 *
 * IDEMPOTENT :
 *   Vérifie rweCommittedSessionIds avant chaque accumulation.
 *   Sûr à rejouer autant de fois que nécessaire.
 *
 * ADMIN ONLY.
 */

// deploy: v1
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function asArray(v) { return Array.isArray(v) ? v : []; }
function normalizeId(v) {
  if (!v) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'object') return String(v.systemId || v.id || v._id || v.value || '');
  return String(v);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return json(403, { ok: false, error: 'Admin only' });
    }

    const body = await req.json().catch(() => ({}));
    const dryRun = body.dryRun === true;
    const limitSessions = body.limit ? Number(body.limit) : null;

    const svc = base44.asServiceRole;

    // Charger toutes les sessions terminées de type event
    const TERMINAL = ['completed', 'sots_submitted', 'archived'];
    const allSessionBatches = await Promise.all(
      TERMINAL.map(st => svc.entities.Session.filter({ sessionType: 'event', status: st }).catch(() => []))
    );
    let sessions = allSessionBatches.flat().filter(s => s?.audienceCountFrozen > 0);

    if (limitSessions) sessions = sessions.slice(0, limitSessions);

    console.log(`[backfillRWE] ${sessions.length} sessions avec audienceCountFrozen > 0`);

    const results = {
      sessionsProcessed: 0,
      sessionsSkipped: 0,
      talentsUpdated: 0,
      talentsSkipped: 0,
      errors: [],
    };

    // Index des mises à jour par talent (pour batch)
    const talentUpdates = {}; // talentUserId → { rweTotal, rweSessionCount, sessionIds }

    for (const session of sessions) {
      const sessionId = session.id;
      const audienceCountFrozen = Number(session.audienceCountFrozen) || 0;
      if (audienceCountFrozen <= 0) { results.sessionsSkipped++; continue; }

      // Extraire les participants (artistes uniquement — pas organisateur, pas audience)
      const participants = asArray(session.participants).filter(p => {
        const role = normalizeId(p?.roleSystemId);
        return p?.userId && role && role !== 'RL-ORGANIZER';
      });

      if (participants.length === 0) { results.sessionsSkipped++; continue; }
      results.sessionsProcessed++;

      for (const p of participants) {
        const talentId = normalizeId(p.userId);
        if (!talentId) continue;

        if (!talentUpdates[talentId]) {
          talentUpdates[talentId] = { additions: [], totalToAdd: 0 };
        }
        talentUpdates[talentId].additions.push({ sessionId, audienceCountFrozen });
        talentUpdates[talentId].totalToAdd += audienceCountFrozen;
      }
    }

    // Appliquer les mises à jour talent par talent
    const talentIds = Object.keys(talentUpdates);
    console.log(`[backfillRWE] ${talentIds.length} talents à mettre à jour`);

    for (const talentId of talentIds) {
      try {
        const profiles = await svc.entities.TalentProfile.filter({ userId: talentId }).catch(() => []);
        const profile = profiles?.[0];
        if (!profile) continue;

        const committed = asArray(profile.rweCommittedSessionIds);
        const { additions } = talentUpdates[talentId];

        // Filtrer les sessions déjà commitées (idempotence)
        const newAdditions = additions.filter(a => !committed.includes(a.sessionId));
        if (newAdditions.length === 0) {
          results.talentsSkipped++;
          continue;
        }

        const addedRwe = newAdditions.reduce((sum, a) => sum + a.audienceCountFrozen, 0);
        const currentRwe   = Number(profile.rweTotal)        || 0;
        const currentCount = Number(profile.rweSessionCount)  || 0;
        const newRwe       = currentRwe + addedRwe;
        const newCount     = currentCount + newAdditions.length;
        const newAvg       = Math.round((newRwe / newCount) * 10) / 10;
        const newCommitted = [...committed, ...newAdditions.map(a => a.sessionId)];

        if (!dryRun) {
          await svc.entities.TalentProfile.update(profile.id, {
            rweTotal:               newRwe,
            rweSessionCount:        newCount,
            rweAvgPerSession:       newAvg,
            rweCommittedSessionIds: newCommitted,
          });
        }

        console.log(`[backfillRWE] ${dryRun ? 'DRY' : 'WROTE'} talentId=${talentId} +${addedRwe} (${newAdditions.length} sessions) → total=${newRwe}`);
        results.talentsUpdated++;

      } catch (e) {
        results.errors.push({ talentId, error: e?.message });
        console.error(`[backfillRWE] Error talentId=${talentId}:`, e?.message);
      }
    }

    return json(200, {
      ok: true,
      dryRun,
      ...results,
      message: dryRun
        ? `DRY RUN — ${results.talentsUpdated} talents auraient été mis à jour`
        : `${results.talentsUpdated} talents mis à jour, ${results.talentsSkipped} déjà à jour`,
    });

  } catch (err) {
    console.error('[backfillRWE]', err?.message);
    return json(500, { ok: false, error: err?.message });
  }
});