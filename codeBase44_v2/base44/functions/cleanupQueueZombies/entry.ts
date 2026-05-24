/**
 * cleanupQueueZombies — Scheduled maintenance (every 15 min)
 *
 * Expire les UserQueueState status='queueing' dont lastHeartbeatAt > 30s.
 * Peut être appelé manuellement par un admin (dryRun=true pour audit sans écriture).
 *
 * Garde-fous :
 *  - Idempotent : expirer un état déjà expired est sans effet (filter status='queueing')
 *  - R1 : filter sur status (indexé), filtrage JS sur lastHeartbeatAt
 *  - Batch cap : BATCH_SIZE pour éviter timeout
 *  - dryRun : si true, retourne ce qui serait fait sans écrire
 *  - Logs structurés : jobName, startedAt, finishedAt, durationMs, processedCount, sampleIds
 */
// deploy: v2
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

function json(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

// TTL augmenté à 60s — le heartbeat s'écrit toutes les 5s côté serveur.
// Avec 30s, la marge était trop faible en cas de latence réseau ou pic DB.
// 60s = 12 cycles de heartbeat manqués avant d'expirer.
const ZOMBIE_TTL_MS = 60_000;
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
    const allQueueing = await service.entities.UserQueueState.filter({ status: 'queueing' }).catch(() => []);

    const zombies = (allQueueing || []).filter(q => {
      const hb = q.lastHeartbeatAt ? new Date(q.lastHeartbeatAt).getTime() : null;
      if (!hb || Number.isNaN(hb)) return false;
      return (now - hb) > ZOMBIE_TTL_MS;
    });

    const sampleIds = zombies.slice(0, 10).map(z => z.userId || z.id);
    let expired = 0;
    let errorCount = 0;

    if (!dryRun) {
      for (let i = 0; i < zombies.length; i += BATCH_SIZE) {
        const batch = zombies.slice(i, i + BATCH_SIZE);
        const results = await Promise.allSettled(
          batch.map(z =>
            service.entities.UserQueueState.update(z.id, { status: 'expired', lastHeartbeatAt: nowIso })
          )
        );
        expired += results.filter(r => r.status === 'fulfilled').length;
        errorCount += results.filter(r => r.status === 'rejected').length;
      }
    }

    const finishedAt = new Date().toISOString();
    const durationMs = Date.now() - startMs;

    const logEntry = {
      jobName: 'cleanupQueueZombies',
      startedAt,
      finishedAt,
      durationMs,
      processedCount: zombies.length,
      successCount: dryRun ? 0 : expired,
      errorCount,
      sampleIds,
      dryRun,
    };
    console.log(JSON.stringify(logEntry));

    return json(200, { ok: true, ...logEntry, checked: allQueueing.length });
  } catch (err) {
    console.error(JSON.stringify({ jobName: 'cleanupQueueZombies', startedAt, error: err.message }));
    return json(500, { ok: false, error: err.message });
  }
});