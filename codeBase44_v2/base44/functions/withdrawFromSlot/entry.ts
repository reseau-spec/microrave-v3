/**
 * withdrawFromSlot.ts
 * Un talent retire sa candidature d'un slot.
 * Input: { sessionId, slotId }
 */

// deploy: v2
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

function asArray(v) { return Array.isArray(v) ? v : []; }

function normalizeSlots(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.filter(s => s?.slotId && s?.roleSystemId).map(s => ({
    slotId: s.slotId,
    roleSystemId: s.roleSystemId,
    status: s.status || 'open',
    candidateUserId: s.candidateUserId || null,
    candidateStyleSystemIds: asArray(s.candidateStyleSystemIds),
    confirmedAt: s.confirmedAt || null,
    confirmedBy: s.confirmedBy || null,
    candidates: asArray(s.candidates).map(c => ({
      userId: c.userId,
      styleSystemIds: asArray(c.styleSystemIds),
      status: c.status || 'pending',
      appliedAt: c.appliedAt || null,
      confirmedAt: c.confirmedAt || null,
    })),
  }));
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { sessionId, slotId } = await req.json().catch(() => ({}));
    if (!sessionId || !slotId) {
      return Response.json({ error: 'Missing sessionId or slotId' }, { status: 400 });
    }

    const sessions = await base44.asServiceRole.entities.Session.filter({ id: sessionId });
    const session = sessions?.[0];
    if (!session) return Response.json({ error: 'Session not found' }, { status: 404 });

    if (session.sessionType !== 'event') {
      return Response.json({ error: 'Not an event session', code: 'NOT_EVENT_SESSION' }, { status: 400 });
    }
    if (session.status !== 'lobby') {
      return Response.json({ error: 'Session not in lobby state', code: 'SESSION_NOT_LOBBY' }, { status: 400 });
    }

    const slots = normalizeSlots(asArray(session.slots));
    const slotIdx = slots.findIndex(s => s.slotId === slotId);
    if (slotIdx === -1) return Response.json({ error: 'Slot not found', code: 'SLOT_NOT_FOUND' }, { status: 404 });

    const slot = slots[slotIdx];
    const candIdx = slot.candidates.findIndex(c => c.userId === user.id && c.status !== 'withdrawn');
    if (candIdx === -1) {
      return Response.json({ error: 'Vous n\'avez pas de candidature active sur ce slot', code: 'NOT_CANDIDATE' }, { status: 403 });
    }

    // Marquer comme withdrawn (on garde l'historique)
    slot.candidates[candIdx] = { ...slot.candidates[candIdx], status: 'withdrawn' };

    // Recalculer status legacy du slot
    const activeCandidates = slot.candidates.filter(c => !['withdrawn','rejected'].includes(c.status));
    const confirmedCandidates = activeCandidates.filter(c => c.status === 'confirmed');
    const pendingCandidates = activeCandidates.filter(c => c.status === 'pending');

    if (confirmedCandidates.length === 0 && pendingCandidates.length === 0) {
      slot.status = 'open';
      slot.candidateUserId = null;
      slot.candidateStyleSystemIds = [];
      slot.confirmedAt = null;
      slot.confirmedBy = null;
    } else if (confirmedCandidates.length > 0) {
      slot.candidateUserId = confirmedCandidates[0].userId;
      slot.candidateStyleSystemIds = confirmedCandidates[0].styleSystemIds;
    }

    // Retirer le participant si plus de candidature active sur aucun slot
    const hasOtherActiveSlot = slots.some(s =>
      s.slotId !== slotId &&
      s.candidates.some(c => c.userId === user.id && !['withdrawn','rejected'].includes(c.status))
    );
    let participants = asArray(session.participants);
    if (!hasOtherActiveSlot) {
      participants = participants.filter(p => p.userId !== user.id);
    }

    const auditLog = asArray(session.auditLog);
    auditLog.push({ ts: new Date().toISOString(), action: 'slot_withdrawn', actorUserId: user.id, slotId });

    await base44.asServiceRole.entities.Session.update(session.id, { slots, participants, auditLog });
    return Response.json({ ok: true, session: { ...session, slots, participants, auditLog } });

  } catch (error) {
    console.error('[withdrawFromSlot]', error?.message || error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});