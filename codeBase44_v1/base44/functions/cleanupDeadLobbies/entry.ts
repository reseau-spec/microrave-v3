/**
 * cleanupDeadLobbies — Scheduled maintenance (every 5 min)
 **
 * Abort les sessions status='lobby' ouvertes depuis > 2min.
 * Peut être appelé manuellement par un admin (dryRun=true pour audit sans écriture).
 *
 * Garde-fous :
 *  - Idempotent : re-aborder un lobby déjà aborted est sans effet (filter status='lobby')
 *  - R1 : filter sur status (indexé), filtrage JS sur lobbyOpenedAt
 *  - Batch cap : BATCH_SIZE pour éviter timeout
 *  - dryRun : si true, retourne ce qui serait fait sans écrire
 *  - Logs structurés : jobName, startedAt, finishedAt, durationMs, processedCount, sampleIds
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

function json(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

const DEAD_LOBBY_TTL_MS = 2 * 60_000; // 2 minutes
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

    // R1 : filter sur champ indexé uniquement
    const allLobbies = await service.entities.Session.filter({ status: 'lobby' }).catch(() => []);

    const dead = (allLobbies || []).filter(s => {
      const opened = s.lobbyOpenedAt ? new Date(s.lobbyOpenedAt).getTime() : null;
      if (!opened || Number.isNaN(opened)) return false;
      return (now - opened) > DEAD_LOBBY_TTL_MS;
    });

    const sampleIds = dead.slice(0, 10).map(s => s.id);
    let aborted = 0;
    let errorCount = 0;

    if (!dryRun) {
      for (let i = 0; i < dead.length; i += BATCH_SIZE) {
        const batch = dead.slice(i, i + BATCH_SIZE);
        const results = await Promise.allSettled(
          batch.map(s => service.entities.Session.update(s.id, { status: 'aborted', actualEndAt: nowIso }))
        );
        aborted += results.filter(r => r.status === 'fulfilled').length;
        errorCount += results.filter(r => r.status === 'rejected').length;
      }
    }

    const finishedAt = new Date().toISOString();
    const durationMs = Date.now() - startMs;

    const logEntry = {
      jobName: 'cleanupDeadLobbies',
      startedAt,
      finishedAt,
      durationMs,
      processedCount: dead.length,
      successCount: dryRun ? 0 : aborted,
      errorCount,
      sampleIds,
      dryRun,
    };
    console.log(JSON.stringify(logEntry));

    return json(200, { ok: true, ...logEntry, checked: allLobbies.length });
  } catch (err) {
    console.error(JSON.stringify({ jobName: 'cleanupDeadLobbies', startedAt, error: err.message }));
    return json(500, { ok: false, error: err.message });
  }
});