import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

/**
 * cleanupOldSessions
 * ---------------------------------------------------------------------------
 * Supprime les Sessions inactives depuis plus de 30 jours.
 *
 * "Inactive" = session dont le statut est terminal ET dont updated_date
 * (ou actualEndAt si disponible) est antérieure à now - 30 jours.
 *
 * Statuts terminaux éligibles :
 *   completed, aborted, archived, disputed, sots_submitted
 *
 * Statuts exclus (actifs ou sensibles) :
 *   idle, queueing, matched, lobby, ready, in_progress
 *
 * La fonction est idempotente : elle peut être relancée sans risque.
 */

const TERMINAL_STATUSES = new Set([
  'completed',
  'aborted',
  'archived',
  'disputed',
  'sots_submitted',
]);

const RETENTION_DAYS = 30;

function jsonRes(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Auth — admin only (ou appel schedulé sans user → service role direct)
    try {
      const user = await base44.auth.me();
      if (user && user.role !== 'admin') {
        return jsonRes({ error: 'Admin required' }, 403);
      }
    } catch {
      // appel automatisé sans token — OK
    }

    const service = base44.asServiceRole;
    const body = await req.json().catch(() => ({}));
    const dryRun = body?.dryRun === true;

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - RETENTION_DAYS);
    const cutoffIso = cutoffDate.toISOString();

    console.log(`[cleanupOldSessions] cutoff=${cutoffIso} dryRun=${dryRun}`);

    // Charger toutes les sessions terminales (filtre client-side sur la date)
    const allSessions = await service.entities.Session.list('-updated_date', 500);

    const toDelete = (allSessions || []).filter((s) => {
      if (!TERMINAL_STATUSES.has(s?.status)) return false;

      // Date de référence : actualEndAt > updated_date > created_date
      const refDate = s?.actualEndAt || s?.updated_date || s?.created_date || null;
      if (!refDate) return false;

      try {
        return new Date(refDate).getTime() < cutoffDate.getTime();
      } catch {
        return false;
      }
    });

    console.log(`[cleanupOldSessions] found ${toDelete.length} sessions to delete`);

    let deleted = 0;
    let errors = 0;

    if (!dryRun) {
      // Supprimer par batch de 20 pour éviter les timeouts
      const BATCH_SIZE = 20;
      for (let i = 0; i < toDelete.length; i += BATCH_SIZE) {
        const batch = toDelete.slice(i, i + BATCH_SIZE);
        await Promise.allSettled(
          batch.map(async (s) => {
            try {
              await service.entities.Session.delete(s.id);
              deleted++;
            } catch (err) {
              console.error(`[cleanupOldSessions] failed to delete session ${s.id}:`, err.message);
              errors++;
            }
          })
        );
      }
    } else {
      deleted = toDelete.length; // simulé
    }

    const result = {
      ok: true,
      dryRun,
      cutoffDate: cutoffIso,
      retentionDays: RETENTION_DAYS,
      found: toDelete.length,
      deleted,
      errors,
      sample: toDelete.slice(0, 5).map((s) => ({
        id: s.id,
        status: s.status,
        actualEndAt: s.actualEndAt || null,
        updated_date: s.updated_date || null,
      })),
    };

    console.log(`[cleanupOldSessions] done`, { deleted, errors, dryRun });

    return jsonRes(result);
  } catch (err) {
    console.error('[cleanupOldSessions] error:', err);
    return jsonRes({ ok: false, error: err.message }, 500);
  }
});