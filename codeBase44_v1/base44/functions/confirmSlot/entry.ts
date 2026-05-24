/**
 * confirmSlot.ts
 * L'organisateur confirme UN candidat spécifique pour un slot.
 * MULTI-CANDIDATS : on confirme par (slotId + candidateUserId).
 * Le slot reste visible pour d'autres candidatures.
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

    const body = await req.json();
    const { sessionId, slotId, candidateUserId } = body;
    if (!sessionId || !slotId || !candidateUserId) {
      return Response.json({ error: 'sessionId, slotId and candidateUserId are required' }, { status: 400 });
    }

    const sessions = await base44.asServiceRole.entities.Session.filter({ id: sessionId });
    const session = sessions?.[0];
    if (!session) return Response.json({ error: 'Session not found' }, { status: 404 });

    // Auth organisateur
    let authOrganizerId = session.organizerId || session.hostUserId || null;
    if (!authOrganizerId && session.eventId) {
      const events = await base44.asServiceRole.entities.Event.filter({ id: session.eventId }).catch(() => []);
      authOrganizerId = events?.[0]?.organizerId || events?.[0]?.organizerUserId || null;
    }
    if (!authOrganizerId || authOrganizerId !== user.id) {
      return Response.json({ error: 'Forbidden: only organizer can confirm slots', code: 'NOT_ORGANIZER' }, { status: 403 });
    }

    const slots = normalizeSlots(asArray(session.slots));
    const slotIdx = slots.findIndex(s => s.slotId === slotId);
    if (slotIdx === -1) return Response.json({ error: 'Slot not found', code: 'SLOT_NOT_FOUND' }, { status: 404 });

    const slot = slots[slotIdx];

    // Trouver la candidature dans candidates[]
    // Fallback : si candidates[] vide (sessions legacy), injecter depuis participants[]
    if (slot.candidates.length === 0) {
      const parts = asArray(session.participants);
      parts
        .filter(p => p.roleSystemId === slot.roleSystemId && !['withdrawn','rejected'].includes(p.status))
        .forEach(p => {
          slot.candidates.push({
            userId: p.userId,
            styleSystemIds: asArray(p.styleSystemIds),
            status: p.status === 'confirmed' ? 'confirmed' : 'pending',
            appliedAt: p.joinedAt || null,
            confirmedAt: null,
          });
        });
      // Aussi fallback candidateUserId legacy
      if (slot.candidateUserId && !slot.candidates.find(c => c.userId === slot.candidateUserId)) {
        slot.candidates.push({
          userId: slot.candidateUserId,
          styleSystemIds: asArray(slot.candidateStyleSystemIds),
          status: slot.status === 'confirmed' ? 'confirmed' : 'pending',
          appliedAt: null,
          confirmedAt: slot.confirmedAt || null,
        });
      }
    }

    let candIdx = slot.candidates.findIndex(c => c.userId === candidateUserId);

    // Si toujours introuvable : créer la candidature à la volée (cas participants sans slotId)
    if (candIdx === -1) {
      const parts = asArray(session.participants);
      const part = parts.find(p => p.userId === candidateUserId);
      if (!part) {
        return Response.json({ error: 'Candidate not found in this slot', code: 'CANDIDATE_NOT_FOUND' }, { status: 404 });
      }
      slot.candidates.push({
        userId: candidateUserId,
        styleSystemIds: asArray(part.styleSystemIds),
        status: 'pending',
        appliedAt: part.joinedAt || null,
        confirmedAt: null,
      });
      candIdx = slot.candidates.length - 1;
    }

    const now = new Date().toISOString();

    // Confirmer ce candidat
    slot.candidates[candIdx] = {
      ...slot.candidates[candIdx],
      status: 'confirmed',
      confirmedAt: now,
    };

    // Legacy : mettre à jour candidateUserId/Styles si c'est le premier confirmé
    const confirmedCandidates = slot.candidates.filter(c => c.status === 'confirmed');
    if (confirmedCandidates.length === 1) {
      // Premier confirmé : mettre les champs legacy pour la compatibilité Lineup Board
      slot.candidateUserId = candidateUserId;
      slot.candidateStyleSystemIds = slot.candidates[candIdx].styleSystemIds;
      slot.confirmedAt = now;
      slot.confirmedBy = user.id;
      slot.status = 'confirmed';
    }
    // Si déjà plusieurs confirmés, on NE change PAS slot.status (resterait 'confirmed')
    // Le Lineup Board utilisera candidates[] directement

    // Mettre à jour participant status → 'confirmed'
    const participants = asArray(session.participants).map(p => {
      if (p.userId === candidateUserId) return { ...p, status: 'confirmed' };
      return p;
    });

    const auditLog = asArray(session.auditLog);
    auditLog.push({ action: 'SLOT_CONFIRMED', slotId, candidateUserId, by: user.id, at: now });

    const updated = await base44.asServiceRole.entities.Session.update(session.id, { slots, participants, auditLog });
    return Response.json({ ok: true, session: updated });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});