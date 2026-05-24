/**
 * unconfirmSlot.ts
 * L'organisateur déconfirme UN candidat spécifique.
 * Input: { sessionId, slotId, candidateUserId }
 *
 * FIX IMPORTANT
 * - supprime aussi tous les placements dans lineupPlacements
 *   pour éviter qu'un talent reste placé après déconfirmation
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

function asArray(v) {
  return Array.isArray(v) ? v : [];
}

function normalizeSlots(raw) {
  if (!Array.isArray(raw)) return [];

  return raw
    .filter(s => s?.slotId && s?.roleSystemId)
    .map(s => ({
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

    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();

    const { sessionId, slotId, candidateUserId } = body;

    if (!sessionId || !slotId || !candidateUserId) {
      return Response.json(
        { error: "sessionId, slotId and candidateUserId required" },
        { status: 400 }
      );
    }

    const sessions = await base44.asServiceRole.entities.Session.filter({
      id: sessionId
    });

    const session = sessions?.[0];

    if (!session) {
      return Response.json({ error: "Session not found" }, { status: 404 });
    }

    let authOrganizerId =
      session.organizerId ||
      session.hostUserId ||
      null;

    if (!authOrganizerId && session.eventId) {
      const events = await base44.asServiceRole.entities.Event
        .filter({ id: session.eventId })
        .catch(() => []);

      authOrganizerId =
        events?.[0]?.organizerId ||
        events?.[0]?.organizerUserId ||
        null;
    }

    if (!authOrganizerId || authOrganizerId !== user.id) {
      return Response.json(
        { error: "Forbidden", code: "NOT_ORGANIZER" },
        { status: 403 }
      );
    }

    const slots = normalizeSlots(asArray(session.slots));

    const slotIndex = slots.findIndex(s => s.slotId === slotId);

    if (slotIndex === -1) {
      return Response.json(
        { error: "Slot not found", code: "SLOT_NOT_FOUND" },
        { status: 404 }
      );
    }

    const slot = slots[slotIndex];

    const candIndex = slot.candidates.findIndex(
      c => c.userId === candidateUserId
    );

    if (candIndex === -1) {
      return Response.json(
        { error: "Candidate not found", code: "CANDIDATE_NOT_FOUND" },
        { status: 404 }
      );
    }

    /*
     ------------------------------------
     PASSAGE DU CANDIDAT EN PENDING
     ------------------------------------
    */

    slot.candidates[candIndex] = {
      ...slot.candidates[candIndex],
      status: "pending",
      confirmedAt: null
    };

    /*
     ------------------------------------
     RECALCUL DU SLOT
     ------------------------------------
    */

    const confirmedCandidates = slot.candidates.filter(
      c => c.status === "confirmed"
    );

    if (confirmedCandidates.length === 0) {

      const hasPending = slot.candidates.some(
        c => c.status === "pending"
      );

      slot.status = hasPending ? "pending" : "open";

      slot.candidateUserId = null;

      slot.candidateStyleSystemIds = [];

      slot.confirmedAt = null;

      slot.confirmedBy = null;

    } else {

      const first = confirmedCandidates[0];

      slot.candidateUserId = first.userId;

      slot.candidateStyleSystemIds = first.styleSystemIds;

    }

    /*
     ------------------------------------
     RETIRER LES PLACEMENTS DU LINEUP
     ------------------------------------
    */

    const snapshot = session.moodFilterSnapshot || {};

    const placements = { ...(snapshot.lineupPlacements || {}) };

    for (const [key, value] of Object.entries(placements)) {

      if (
        value?.slotId === slotId &&
        value?.userId === candidateUserId
      ) {
        delete placements[key];
      }
    }

    const moodFilterSnapshot = {
      ...snapshot,
      lineupPlacements: placements
    };

    /*
     ------------------------------------
     PARTICIPANTS
     ------------------------------------
    */

    const participants = asArray(session.participants).map(p => {
      if (p.userId === candidateUserId) {
        return {
          ...p,
          status: "lobby"
        };
      }
      return p;
    });

    /*
     ------------------------------------
     AUDIT LOG
     ------------------------------------
    */

    const auditLog = asArray(session.auditLog);

    auditLog.push({
      action: "SLOT_UNCONFIRMED",
      slotId,
      candidateUserId,
      by: user.id,
      at: new Date().toISOString()
    });

    /*
     ------------------------------------
     UPDATE SESSION
     ------------------------------------
    */

    const updated = await base44.asServiceRole.entities.Session.update(
      session.id,
      {
        slots,
        participants,
        auditLog,
        moodFilterSnapshot
      }
    );

    return Response.json({
      ok: true,
      session: updated
    });

  } catch (error) {

    return Response.json(
      { error: error.message },
      { status: 500 }
    );

  }
});