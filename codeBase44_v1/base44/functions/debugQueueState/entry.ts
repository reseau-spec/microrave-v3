/**
 * debugQueueState — Outil de validation BUG 1
 *
 * Retourne l'état exact d'un user dans la queue tel que le matchmaker le voit :
 *  - données DB brutes
 *  - matchabilité runtime calculée avec la même logique que matchmakerTick
 *  - raison d'exclusion explicite
 *
 * Usage : POST { userId: "..." }  (admin uniquement)
 *
 * Réservé aux tests / audit. Ne modifie rien.
 */
// deploy: v2
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

function json(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

// Doit rester en SYNC avec matchmakerTick
const HEARTBEAT_TTL_MS = 15_000;

function computeMatchability(qs, now) {
  if (!qs) return { matchable: false, reason: 'no_queue_state' };
  if (qs.status !== 'queueing') return { matchable: false, reason: `status_${qs.status}` };
  if (qs.matchedSessionId) return { matchable: false, reason: 'already_matched' };
  if (qs.activeSessionId)  return { matchable: false, reason: 'already_active' };

  const hb = qs.lastHeartbeatAt ? new Date(qs.lastHeartbeatAt).getTime() : null;
  if (!hb || Number.isNaN(hb)) return { matchable: false, reason: 'no_heartbeat' };

  const hbAgeMs = now - hb;
  if (hbAgeMs > HEARTBEAT_TTL_MS) return { matchable: false, reason: 'heartbeat_stale', hbAgeMs };

  return { matchable: true, reason: 'ok', hbAgeMs };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user || user.role !== 'admin') return json(403, { ok: false, code: 'FORBIDDEN' });

    const body = await req.json().catch(() => ({}));
    const targetUserId = body.userId;
    if (!targetUserId) return json(400, { ok: false, code: 'MISSING_userId' });

    const service = base44.asServiceRole;
    const now = Date.now();

    // Récupérer le UserQueueState (R1 : filter sur champ indexé)
    const rows = await service.entities.UserQueueState.filter({ userId: targetUserId }).catch(() => []);
    const qs = rows?.[0] || null;

    if (!qs) {
      return json(200, {
        ok: true,
        userId: targetUserId,
        found: false,
        matchable: false,
        reason: 'no_queue_state',
        checkedAt: new Date(now).toISOString(),
      });
    }

    const { matchable, reason, hbAgeMs } = computeMatchability(qs, now);

    const hbMs = qs.lastHeartbeatAt ? new Date(qs.lastHeartbeatAt).getTime() : null;
    const heartbeatAgeMs = hbMs ? (now - hbMs) : null;

    return json(200, {
      ok: true,
      userId: targetUserId,
      found: true,
      checkedAt: new Date(now).toISOString(),

      // Données DB brutes
      db: {
        status: qs.status,
        queuedAt: qs.queuedAt || null,
        lastHeartbeatAt: qs.lastHeartbeatAt || null,
        matchedSessionId: qs.matchedSessionId || null,
        activeSessionId: qs.activeSessionId || null,
        cancelledAt: qs.cancelledAt || null,
        updated_date: qs.updated_date || null,
      },

      // Matchabilité runtime (logique identique à matchmakerTick)
      matchable,
      reason,
      heartbeatAgeMs: hbAgeMs ?? heartbeatAgeMs,
      heartbeatTtlMs: HEARTBEAT_TTL_MS,
      heartbeatMarginMs: heartbeatAgeMs !== null ? (HEARTBEAT_TTL_MS - heartbeatAgeMs) : null,
    });

  } catch (err) {
    return json(500, { ok: false, error: err.message });
  }
});