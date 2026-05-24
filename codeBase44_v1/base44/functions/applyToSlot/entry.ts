/**
 * applyToSlot.ts
 * Un candidat postule sur un slot d'une session event.
 * MULTI-CANDIDATS : un slot peut recevoir autant de candidatures que souhaité.
 * Le slot ne se "ferme" jamais — status reste 'open' tant que non clôturé manuellement.
 * candidates[] stocke toutes les candidatures du slot.
 */

// deploy: v2
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

function asArray(v) { return Array.isArray(v) ? v : []; }

function normalizeSlots(input) {
  if (!Array.isArray(input)) return [];
  const seen = new Set();
  return input.filter(s => {
    if (!s?.slotId || !s?.roleSystemId || seen.has(s.slotId)) return false;
    seen.add(s.slotId);
    return true;
  }).map(s => ({
    slotId: s.slotId,
    roleSystemId: s.roleSystemId,
    status: ['open','pending','confirmed'].includes(s.status) ? s.status : 'open',
    // Legacy (Lineup Board) — 1er candidat confirmé
    candidateUserId: s.candidateUserId || null,
    candidateStyleSystemIds: asArray(s.candidateStyleSystemIds),
    confirmedAt: s.confirmedAt || null,
    confirmedBy: s.confirmedBy || null,
    // Multi-candidats
    candidates: asArray(s.candidates).map(c => ({
      userId: c.userId,
      styleSystemIds: asArray(c.styleSystemIds),
      status: ['pending','confirmed','rejected','withdrawn'].includes(c.status) ? c.status : 'pending',
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

    const { sessionId, slotId, roleSystemId, styleSystemIds } = await req.json().catch(() => ({}));
    if (!sessionId || !slotId || !roleSystemId) {
      return Response.json({ error: 'Missing sessionId, slotId or roleSystemId' }, { status: 400 });
    }

    const styles = asArray(styleSystemIds).filter(Boolean);

    const sessions = await base44.asServiceRole.entities.Session.filter({ id: sessionId });
    const session = sessions?.[0];
    if (!session) return Response.json({ error: 'Session not found' }, { status: 404 });

    if (session.sessionType !== 'event') {
      return Response.json({ error: 'applyToSlot only valid for event sessions', code: 'NOT_EVENT_SESSION' }, { status: 400 });
    }
    if (session.status !== 'lobby') {
      return Response.json({ error: 'Session is not in lobby state', code: 'SESSION_NOT_LOBBY' }, { status: 400 });
    }

    const slots = normalizeSlots(session.slots);
    const idx = slots.findIndex(s => s.slotId === slotId);
    if (idx === -1) return Response.json({ error: 'Slot not found', code: 'SLOT_NOT_FOUND' }, { status: 404 });

    const slot = slots[idx];

    if (slot.roleSystemId !== roleSystemId) {
      return Response.json({ error: `roleSystemId mismatch`, code: 'ROLE_MISMATCH' }, { status: 400 });
    }

    // Vérifier si l'user a déjà postulé sur ce slot (éviter doublon)
    const existingCandidacy = slot.candidates.find(c => c.userId === user.id && c.status !== 'withdrawn' && c.status !== 'rejected');
    if (existingCandidacy) {
      return Response.json({ error: 'Vous avez déjà postulé pour ce slot', code: 'ALREADY_APPLIED' }, { status: 409 });
    }

    // Ajouter la candidature dans candidates[]
    const newCandidate = {
      userId: user.id,
      styleSystemIds: styles,
      status: 'pending',
      appliedAt: new Date().toISOString(),
      confirmedAt: null,
    };
    slot.candidates.push(newCandidate);

    // Le slot devient 'pending' (indique qu'il y a des candidatures en attente)
    // mais NE SE FERME PAS — d'autres peuvent encore postuler
    if (slot.status === 'open') {
      slot.status = 'pending';
    }

    // Mettre à jour participants (accès à la session lobby)
    const participants = asArray(session.participants);
    const existingIdx = participants.findIndex(p => p.userId === user.id);
    const participantData = {
      userId: user.id,
      roleSystemId,
      styleSystemIds: styles,
      status: 'lobby',
      slotId,
      joinedAt: existingIdx >= 0 ? participants[existingIdx].joinedAt : new Date().toISOString(),
    };
    if (existingIdx >= 0) {
      participants[existingIdx] = { ...participants[existingIdx], ...participantData };
    } else {
      participants.push(participantData);
    }

    const auditLog = asArray(session.auditLog);
    auditLog.push({ ts: new Date().toISOString(), action: 'slot_applied', actorUserId: user.id, slotId, roleSystemId });

    await base44.asServiceRole.entities.Session.update(session.id, { slots, participants, auditLog });
    return Response.json({ ok: true, session: { ...session, slots, participants, auditLog } });

  } catch (error) {
    console.error('[applyToSlot]', error?.message || error);
    return Response.json({ error: error.message || String(error) }, { status: 500 });
  }
});