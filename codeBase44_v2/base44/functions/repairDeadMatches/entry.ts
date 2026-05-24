/**
 * repairDeadMatches — Scheduled maintenance (every 2 hours)
 *
 * Répare les UserQueueState status='matched' orphelins :
 *  - session manquante / archived
 *  - user absent des participants
 *  - participants < 2
 *  - matchedAt > MATCHED_STALE_MS sans progression
 *
 * Peut être appelé manuellement par un admin (dryRun=true pour audit sans écriture).
 *
 * Garde-fous :
 *  - Idempotent : remettre en 'queueing' un état déjà queueing est sans effet
 *  - R1 : filter sur status='matched' (indexé), GET par sessionId (indexé)
 *  - MATCHED_STALE_MS calibré à 5 min pour cron 2h (pas 10s comme en one-shot)
 *  - Batch cap : BATCH_SIZE pour éviter timeout
 *  - dryRun : si true, retourne ce qui serait fait sans écrire
 *  - Logs structurés : jobName, startedAt, finishedAt, durationMs, processedCount, sampleIds
 */
// deploy: v2
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

function json(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function normalizeArray(v) {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string') { try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch { return []; } }
  return [];
}

function normalizeParticipants(raw) {
  return normalizeArray(raw).map(p => (typeof p === 'string' ? { userId: p } : p));
}

// 5 minutes — seuil raisonnable pour un cron 2h (vs 10s en one-shot manuel)
const MATCHED_STALE_MS = 5 * 60_000;
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

    // R1 : filter sur status (indexé)
    const matchedRows = await service.entities.UserQueueState.filter({ status: 'matched' }).catch(() => []);
    const withSession = (matchedRows || []).filter(q => !!q.matchedSessionId);

    if (withSession.length === 0) {
      const finishedAt = new Date().toISOString();
      const logEntry = {
        jobName: 'repairDeadMatches',
        startedAt,
        finishedAt,
        durationMs: Date.now() - startMs,
        processedCount: 0,
        successCount: 0,
        errorCount: 0,
        sampleIds: [],
        dryRun,
        message: 'Nothing to repair.',
      };
      console.log(JSON.stringify(logEntry));
      return json(200, { ok: true, ...logEntry });
    }

    // Charger les sessions en parallèle (GET par id = indexé)
    const sessionIds = [...new Set(withSession.map(q => q.matchedSessionId))];
    const sessionMap = {};
    await Promise.all(
      sessionIds.map(async (sid) => {
        sessionMap[sid] = await service.entities.Session.get(sid).catch(() => null);
      })
    );

    const toRepair = [];
    const reasonsCount = {};

    for (const qs of withSession) {
      const sess = sessionMap[qs.matchedSessionId] || null;
      const parts = normalizeParticipants(sess?.participants);
      const inSession = parts.some(p => String(p?.userId) === String(qs.userId));
      const matchedAgeMs = qs.matchedAt ? (now - new Date(qs.matchedAt).getTime()) : Infinity;

      let reason = null;
      if (!sess) reason = 'missingSession';
      else if (['archived', 'aborted', 'completed'].includes(sess.status)) reason = 'deadSession';
      else if (parts.length < 2) reason = 'participantsEmpty';
      else if (!inSession) reason = 'notInSession';
      else if (matchedAgeMs > MATCHED_STALE_MS) reason = 'stale5min';

      if (reason) {
        reasonsCount[reason] = (reasonsCount[reason] || 0) + 1;
        toRepair.push({ qs, reason });
      }
    }

    const sampleIds = toRepair.slice(0, 10).map(r => r.qs.userId || r.qs.id);
    let repaired = 0;
    let errorCount = 0;

    if (!dryRun) {
      for (let i = 0; i < toRepair.length; i += BATCH_SIZE) {
        const batch = toRepair.slice(i, i + BATCH_SIZE);
        const results = await Promise.allSettled(
          batch.map(({ qs }) =>
            service.entities.UserQueueState.update(qs.id, {
              status: 'queueing',
              matchedSessionId: null,
              activeSessionId: null,
              matchedAt: null,
              lastHeartbeatAt: nowIso,
            })
          )
        );
        repaired += results.filter(r => r.status === 'fulfilled').length;
        errorCount += results.filter(r => r.status === 'rejected').length;
      }
    }

    const finishedAt = new Date().toISOString();
    const durationMs = Date.now() - startMs;

    const logEntry = {
      jobName: 'repairDeadMatches',
      startedAt,
      finishedAt,
      durationMs,
      processedCount: toRepair.length,
      successCount: dryRun ? 0 : repaired,
      errorCount,
      sampleIds,
      reasonsCount,
      dryRun,
      scanned: withSession.length,
    };
    console.log(JSON.stringify(logEntry));

    return json(200, { ok: true, ...logEntry });
  } catch (err) {
    console.error(JSON.stringify({ jobName: 'repairDeadMatches', startedAt, error: err.message }));
    return json(500, { ok: false, error: err.message });
  }
});