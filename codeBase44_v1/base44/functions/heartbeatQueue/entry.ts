/**
 * heartbeatQueue.ts — PRESENCE / KEEP-ALIVE CANONIQUE
 *
 * RÈGLES CANONIQUES À NE PAS CASSER
 * ---------------------------------
 * 1) heartbeatQueue ne décide PAS de la qualité des matchs.
 * 2) heartbeatQueue ne fait que maintenir la fraîcheur de présence du joueur.
 * 3) Le matching canonique vit dans matchmakerTick.ts.
 * 4) heartbeatQueue peut déclencher matchmakerTick en fire-and-forget,
 *    mais ne doit pas contenir les règles hiérarchiques de matching.
 *
 * IMPORTANT
 * ---------
 * - ne jamais transformer heartbeat en moteur métier caché
 * - ne jamais casser status / matchedSessionId sauf recovery d’un état mort
 * - lastHeartbeatAt est écrit avec throttle pour éviter le spam DB
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function safeDateMs(iso) {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : t;
}

function validateStyleIds(raw) {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const ids = raw
    .filter((s) => typeof s === 'string' && s.startsWith('ST-') && s.length <= 80)
    .slice(0, 50);
  return ids.length > 0 ? ids : null;
}

function validateShortString(val) {
  if (typeof val !== 'string') return null;
  const trimmed = val.trim();
  return trimmed.length > 0 && trimmed.length <= 80 ? trimmed : null;
}

function normalizeArray(v) {
  if (Array.isArray(v)) return v;

  if (typeof v === 'string') {
    try {
      const p = JSON.parse(v);
      return Array.isArray(p) ? p : [];
    } catch {
      return [];
    }
  }

  return [];
}

function normalizeParticipants(raw) {
  const arr = normalizeArray(raw);
  return arr.map((p) => {
    if (typeof p === 'string') return { userId: p };
    return p;
  });
}

// Écrire lastHeartbeatAt max toutes les 5s (était 10s).
// HEARTBEAT_TTL_MS dans matchmakerTick = 15s.
// Avec 5s de throttle, la fenêtre de sécurité est de 10s (était 5s).
// Cela réduit le risque qu'un user soit exclu du pool par stale heartbeat.
const HEARTBEAT_WRITE_MIN_MS = 5_000;
// 5 minutes — le lobby peut légitimement prendre du temps à s'hydrater.
// 30s était trop court : le heartbeat resetait à queueing alors que l'user
// était encore en train de charger le lobby, causant une désync UI/DB.
const MATCHED_STALE_MS = 5 * 60 * 1000;

function shouldWriteHeartbeat(qs, now) {
  const last = qs?.lastHeartbeatAt ? new Date(qs.lastHeartbeatAt).getTime() : null;
  if (!last || Number.isNaN(last)) return true;
  return now - last >= HEARTBEAT_WRITE_MIN_MS;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);

    if (!user) {
      return json(401, { ok: false, code: 'UNAUTHENTICATED' });
    }

    const service = base44.asServiceRole;
    if (!service) {
      return json(503, { ok: false, code: 'SERVICE_ROLE_UNAVAILABLE' });
    }

    const now = Date.now();
    const nowIso = new Date().toISOString();
    const currentUserId = user.id;

    let body = {};
    if (req.headers.get('content-type')?.includes('application/json')) {
      body = await req.json().catch(() => ({}));
    }

    // Ne pas masquer les erreurs DB avec catch([]) — un filter qui throw ≠ "pas de record"
    // Si le filter échoue, retourner queueing plutôt que not_queued pour éviter
    // d'interrompre une queue active à cause d'une erreur réseau intermittente.
    let rows;
    try {
      rows = await service.entities.UserQueueState.filter({ userId: currentUserId });
    } catch (filterErr) {
      console.warn('[heartbeatQueue] DB filter failed — keeping alive', {
        userId: currentUserId,
        error: filterErr?.message || 'unknown',
      });
      return json(200, { ok: true, status: 'queueing', recoveredFromDbError: true });
    }

    const qs = rows?.[0] || null;

    if (!qs) {
      return json(200, { ok: true, status: 'not_queued' });
    }

    if (qs.status === 'matched' && qs.matchedSessionId) {
      let sessionValid = false;
      let reason = 'unknown';
      let partsLen = 0;
      let sessStatus = 'missing';
      let inSession = false;

      try {
        const sess = await service.entities.Session.get(qs.matchedSessionId).catch(() => null);
        const parts = normalizeParticipants(sess?.participants);
        partsLen = parts.length;
        sessStatus = sess?.status || 'missing';
        inSession = parts.some((p) => String(p?.userId) === String(currentUserId));

        const matchedAgeMs = qs.matchedAt
          ? now - new Date(qs.matchedAt).getTime()
          : Infinity;

        const DEAD_STATUSES = new Set(['completed', 'aborted', 'archived', 'disputed', 'sots_submitted']);

        if (!sess) reason = 'missingSession';
        else if (DEAD_STATUSES.has(sess.status)) reason = `deadSession_${sess.status}`;
        else if (parts.length < 2) reason = 'participantsEmpty';
        else if (!inSession) reason = 'notInSession';
        else if (matchedAgeMs > MATCHED_STALE_MS) reason = 'timeout5min';
        else {
          sessionValid = true;
          reason = 'ok';
        }

        console.log(
          '[heartbeatQueue] matchedGuard',
          JSON.stringify({
            userId: currentUserId,
            sessionId: qs.matchedSessionId,
            sessStatus,
            partsLen,
            inSession,
            matchedAgeMs,
            action: sessionValid ? 'keep' : 'recover',
            reason,
          })
        );
      } catch (e) {
        reason = 'lookupError';
        console.log(
          '[heartbeatQueue] matchedGuard lookupError',
          JSON.stringify({
            userId: currentUserId,
            error: e?.message || 'unknown',
          })
        );
      }

      if (!sessionValid) {
        await service.entities.UserQueueState.update(qs.id, {
          status: 'queueing',
          matchedSessionId: null,
          activeSessionId: null,
          matchedAt: null,
          lastHeartbeatAt: nowIso,
        }).catch(() => {});

        return json(200, {
          ok: true,
          status: 'queueing',
          recoveredFromDeadMatch: true,
          reason,
          queueStateId: qs.id,
        });
      }

      if (shouldWriteHeartbeat(qs, now)) {
        await service.entities.UserQueueState.update(qs.id, {
          lastHeartbeatAt: nowIso,
        }).catch(() => {});
      }

      return json(200, {
        ok: true,
        status: 'matched',
        matchedSessionId: qs.matchedSessionId,
        queueStateId: qs.id,
      });
    }

    if (qs.status === 'queueing') {
      const prefUpdate = {};

      const styleIds = validateStyleIds(body?.styleSystemIds);
      if (styleIds) prefUpdate.styleSystemIds = styleIds;

      const roleSystemId = validateShortString(body?.roleSystemId);
      if (roleSystemId) prefUpdate.roleSystemId = roleSystemId;

      const checkpointSystemId = validateShortString(body?.checkpointSystemId);
      if (checkpointSystemId) prefUpdate.checkpointSystemId = checkpointSystemId;

      const writingPrefs = Object.keys(prefUpdate).length > 0;

      const queuedAtMs = safeDateMs(qs.queuedAt) ?? safeDateMs(qs.created_date) ?? now;

      const response = json(200, {
        ok: true,
        status: 'queueing',
        queueStateId: qs.id,
        queuedAt: qs.queuedAt,
        waitMs: Math.max(0, now - queuedAtMs),
      });

      // Écrire le heartbeat AVANT de déclencher le tick.
      // Garantit que le tick voit un lastHeartbeatAt frais pour cet user.
      // Sans ça, le tick peut arriver avec un heartbeat stale → user exclu.
      if (writingPrefs || shouldWriteHeartbeat(qs, now)) {
        prefUpdate.lastHeartbeatAt = nowIso;
        await service.entities.UserQueueState.update(qs.id, prefUpdate).catch(() => {});
      }

      // fire-and-forget matchmaker (après écriture heartbeat)
      try {
        const reqUrl = new URL(req.url);
        const tickUrl = `${reqUrl.origin}/matchmakerTick`;

        fetch(tickUrl, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: req.headers.get('authorization') || '',
          },
          body: '{}',
        }).catch(() => {});
      } catch {
        // silent
      }

      return response;
    }

    if (shouldWriteHeartbeat(qs, now)) {
      await service.entities.UserQueueState.update(qs.id, {
        lastHeartbeatAt: nowIso,
      }).catch(() => {});
    }

    return json(200, {
      ok: true,
      status: qs.status,
      queueStateId: qs.id,
    });
  } catch (err) {
    return json(500, {
      ok: false,
      code: 'HEARTBEAT_FAILED',
      error: err?.message || 'unknown',
    });
  }
});