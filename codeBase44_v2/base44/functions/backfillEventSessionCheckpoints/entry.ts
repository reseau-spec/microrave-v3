// deploy: v2
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

/**
 * backfillEventSessionCheckpoints — ONE-SHOT admin
 *
 * Corrige les 57 sessions event historiques qui n'ont pas de checkpointSystemId.
 * Résout le checkpoint depuis Event.checkpointId et le propage dans la Session.
 *
 * Après exécution, relancer dans l'ordre :
 *   1. rebuildCheckpointStats (reset=true)
 *   2. recomputeCheckpointLiveStats
 *   3. recomputeCulturalMoments
 *   4. recomputeScenes
 *
 * Options (body JSON) :
 *   dryRun: true → ne modifie rien, retourne un rapport
 *   commitDomains: true → appelle aussi commitCheckpointDomainUsage pour chaque session patchée
 *                          (recommandé pour alimenter CheckpointDomainLedger + CheckpointDomainStats)
 *
 * ADMIN ONLY — exécuter UNE SEULE FOIS
 */

// v2 — VALID_CP_DOMAINS construit dynamiquement dans le handler depuis StyleHierarchy.
// Retirer la constante hardcodée — elle sera peuplée après le chargement des styles.

function normalizeId(v) {
  if (!v) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  if (typeof v === 'object') return String(v.systemId || v.id || v._id || '');
  return '';
}

function asArray(value, fallback = []) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch { return fallback; }
  }
  return fallback;
}

function jsonRes(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return jsonRes({ error: 'Admin required' }, 403);
    }

    const service = base44.asServiceRole;
    const body = await req.json().catch(() => ({}));
    const dryRun = body.dryRun === true;
    const commitDomains = body.commitDomains === true;

    // v2 — VALID_CP_DOMAINS dynamique depuis StyleHierarchy
    const _stylesForDomains = await service.entities.StyleHierarchy.filter({}).catch(() => []);
    const VALID_CP_DOMAINS = new Set((_stylesForDomains || []).map(s => s.domainKey).filter(Boolean));

    const startTs = Date.now();

    console.log(`[backfillEventSessionCheckpoints] Starting... dryRun=${dryRun} commitDomains=${commitDomains}`);

    // Charger toutes les sessions event
    const allSessions = await service.entities.Session.filter({ sessionType: 'event' });

    // Filtrer celles sans checkpointSystemId
    const sessionsToFix = allSessions.filter(s => !s.checkpointSystemId && s.eventId);

    console.log(`[backfillEventSessionCheckpoints] Found ${sessionsToFix.length} sessions to fix out of ${allSessions.length} event sessions`);

    let patched = 0;
    let domainCommitted = 0;
    let skippedNoEvent = 0;
    let skippedNoCheckpoint = 0;
    let errors = [];
    const patchedDetails = [];

    for (const session of sessionsToFix) {
      try {
        // Résoudre le checkpoint depuis l'Event
        const events = await service.entities.Event.filter({ id: session.eventId });
        const ev = events?.[0];

        if (!ev) {
          skippedNoEvent++;
          continue;
        }

        if (!ev.checkpointId) {
          skippedNoCheckpoint++;
          continue;
        }

        const cpId = ev.checkpointId;

        // Patcher la session
        if (!dryRun) {
          await service.entities.Session.update(session.id, {
            checkpointSystemId: cpId
          });
        }

        patched++;
        patchedDetails.push({
          sessionId: session.id,
          eventId: session.eventId,
          checkpointId: cpId,
          status: session.status,
        });

        // Pause globale anti-429 après chaque update
        if (!dryRun) {
          await new Promise(r => setTimeout(r, 500));
        }

        // Optionnel : commiter les domain stats pour alimenter le pipeline historique
        if (commitDomains && !dryRun && ['completed', 'sots_submitted', 'archived'].includes(session.status)) {
          try {
            // Dériver domainKeys depuis les rôles des participants
            const participants = asArray(session.participants);
            const eligibleRoleIds = [...new Set(
              participants
                .map(p => normalizeId(p?.roleSystemId))
                .filter(r => r && r !== 'RL-ORGANIZER')
            )];

            const domainKeySet = new Set();
            for (const roleId of eligibleRoleIds) {
              try {
                const domainMaps = await service.entities.RoleDomainMap.filter({ roleSystemId: roleId, isActive: true });
                for (const dm of domainMaps) {
                  if (dm.domainKey && VALID_CP_DOMAINS.has(dm.domainKey)) {
                    domainKeySet.add(dm.domainKey);
                  }
                }
              } catch { /* non-fatal */ }
            }

            // Fallback depuis les styles de l'event
            if (domainKeySet.size === 0 && ev.styles?.length > 0) {
              const styleIds = asArray(ev.styles);
              for (const styleId of styleIds) {
                try {
                  const styles = await service.entities.StyleHierarchy.filter({ systemId: styleId });
                  if (styles?.[0]?.domainKey && VALID_CP_DOMAINS.has(styles[0].domainKey)) {
                    domainKeySet.add(styles[0].domainKey);
                  }
                } catch { /* non-fatal */ }
              }
            }

            // Fallback depuis le checkpoint dominant
            if (domainKeySet.size === 0) {
              try {
                const cps = await service.entities.Checkpoint.filter({ systemId: cpId });
                if (cps?.[0]?.domainDominantKey && VALID_CP_DOMAINS.has(cps[0].domainDominantKey)) {
                  domainKeySet.add(cps[0].domainDominantKey);
                }
              } catch { /* non-fatal */ }
            }

            if (domainKeySet.size === 0) domainKeySet.add('music');

            const domainKeysSnapshot = [...domainKeySet];

            await service.functions.invoke('commitCheckpointDomainUsage', {
              sessionId: session.id,
              checkpointSystemId: cpId,
              domainKeysSnapshot,
            });

            domainCommitted++;
          } catch (e) {
            console.warn(`[backfillEventSessionCheckpoints] commitDomains failed for session=${session.id}: ${e?.message}`);
          }

          // Pause pour éviter rate limit 429
          await new Promise(r => setTimeout(r, 150));
        }

      } catch (e) {
        errors.push({ sessionId: session.id, error: e?.message });
        console.warn(`[backfillEventSessionCheckpoints] Error patching session=${session.id}: ${e?.message}`);
      }
    }

    const durationMs = Date.now() - startTs;

    console.log(`[backfillEventSessionCheckpoints] Done. patched=${patched} domainCommitted=${domainCommitted} skippedNoEvent=${skippedNoEvent} skippedNoCheckpoint=${skippedNoCheckpoint} errors=${errors.length} durationMs=${durationMs}`);

    return jsonRes({
      ok: true,
      dryRun,
      commitDomains,
      totalEventSessions: allSessions.length,
      sessionsToFix: sessionsToFix.length,
      patched,
      domainCommitted,
      skippedNoEvent,
      skippedNoCheckpoint,
      errors: errors.length,
      errorDetails: errors.slice(0, 10),
      durationMs,
      // En dryRun, montrer ce qui serait patché
      ...(dryRun ? { wouldPatch: patchedDetails } : {}),
    });

  } catch (error) {
    console.error('[backfillEventSessionCheckpoints] error:', error);
    return jsonRes({ ok: false, error: error.message }, 500);
  }
});