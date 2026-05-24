/***
 * cancelQueue.ts — Annule la présence en queue (W2)
 *
 * Règles:
 * - Met status = cancelled + cancelledAt sur UserQueueState
 * - Ne touche PAS Session
 * - Ne supprime PAS participants
 * - Ne modifie PAS queuedAt
 * - La sortie du lobby passe UNIQUEMENT par transitionSession (LEAVE_LOBBY)
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

function json(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return json(401, { ok: false, code: 'UNAUTHENTICATED' });

    const service = base44.asServiceRole;
    if (!service) return json(503, { ok: false, code: 'SERVICE_ROLE_UNAVAILABLE' });

    const nowIso = new Date().toISOString();

    const rows = await service.entities.UserQueueState.filter({ userId: user.id }).catch(() => []);
    const qs = rows?.[0] || null;

    if (!qs) return json(200, { ok: true, cancelled: false, reason: 'not_queued' });

    // Allow cancel from queueing OR matched (matched users may be stuck on a dead session)
    if (qs.status !== 'queueing' && qs.status !== 'matched') {
      return json(200, { ok: true, cancelled: false, reason: 'not_queueable', status: qs.status });
    }

    await service.entities.UserQueueState.update(qs.id, {
      status: 'cancelled',
      cancelledAt: nowIso,
      matchedSessionId: null,
      matchedAt: null,
    });

    return json(200, { ok: true, cancelled: true });
  } catch (err) {
    return json(500, { ok: false, code: 'CANCEL_FAILED', error: err.message });
  }
});