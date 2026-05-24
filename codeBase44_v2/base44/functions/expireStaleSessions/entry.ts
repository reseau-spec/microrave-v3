/**
 * expireStaleSessions — Scheduled maintenance (every hour)
 *
 * Archive les sessions completed/aborted sans SOTS depuis plus de 72h.
 * Peut être appelé manuellement par un admin (dryRun=true pour audit sans écriture).
 *
 * Garde-fous :
 *  - Idempotent : archiver une session déjà archived est sans effet (double-check statut)
 *  - R1 : filter sur status='completed' ET status='aborted' séparément (un seul champ),
 *         filtrage JS sur age. PAS de $in multi-champs.
 *  - Batch cap : BATCH_SIZE pour éviter timeout
 *  - dryRun : si true, retourne ce qui serait fait sans écrire
 *  - Logs structurés : jobName, startedAt, finishedAt, durationMs, processedCount, sampleIds
 *  - Skip sots_submitted : ces sessions ne sont pas orphelines
 */
// deploy: v2
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

function json(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

const STALE_THRESHOLD_MS = 72 * 60 * 60_000; // 72 heures
const BATCH_SIZE = 50;

Deno.serve(async (req) => {
  const startedAt = new Date().toISOString();
  const startMs = Date.now();

  try {
    const base44 = createClientFromRequest(req);

    // Auth : admin requis pour appels manuels, toléré sans user pour scheduled calls
    const user = await base44.auth.me().catch(() => null);
    if (user && user.role !== 'admin') return json(403, { ok: false, code: 'FORBIDDEN' });

    const body = await req.json().catch(() => ({}));
    const dryRun = body.dryRun === true;

    const service = base44.asServiceRole;
    const now = Date.now();
    const nowIso = new Date(now).toISOString();

    // R1 : deux requêtes séparées sur champ indexé, PAS de $in
    const [completedSessions, abortedSessions] = await Promise.all([
      service.entities.Session.filter({ status: 'completed' }).catch(() => []),
      service.entities.Session.filter({ status: 'aborted' }).catch(() => []),
    ]);

    const candidates = [...(completedSessions || []), ...(abortedSessions || [])];

    // Filtrage JS : age > seuil, skip sots_submitted (déjà traités), skip déjà archived
    const stale = candidates.filter(s => {
      if (s.status === 'sots_submitted' || s.status === 'archived') return false;
      const completedAt = s.actualEndAt || s.updated_date;
      if (!completedAt) return false;
      const age = now - new Date(completedAt).getTime();
      return age > STALE_THRESHOLD_MS;
    });

    const sampleIds = stale.slice(0, 10).map(s => s.id);
    let archived = 0;
    let errorCount = 0;

    if (!dryRun) {
      for (let i = 0; i < stale.length; i += BATCH_SIZE) {
        const batch = stale.slice(i, i + BATCH_SIZE);
        const results = await Promise.allSettled(
          batch.map(s =>
            service.entities.Session.update(s.id, {
              status: 'archived',
              archivedAt: nowIso,
              sotsMissing: true,
            })
          )
        );
        archived += results.filter(r => r.status === 'fulfilled').length;
        errorCount += results.filter(r => r.status === 'rejected').length;
      }
    }

    const finishedAt = new Date().toISOString();
    const durationMs = Date.now() - startMs;

    const logEntry = {
      jobName: 'expireStaleSessions',
      startedAt,
      finishedAt,
      durationMs,
      processedCount: stale.length,
      successCount: dryRun ? 0 : archived,
      errorCount,
      sampleIds,
      dryRun,
      checked: candidates.length,
    };
    console.log(JSON.stringify(logEntry));

    return json(200, { ok: true, ...logEntry });
  } catch (err) {
    console.error(JSON.stringify({ jobName: 'expireStaleSessions', startedAt, error: err.message }));
    return json(500, { ok: false, error: err.message });
  }
});