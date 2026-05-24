/**
 * getEventLobby.ts — expose slots avec candidates[] multi-candidats
 */

// deploy: v2
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const VALID = ['open', 'pending', 'confirmed'];
function asArray(v) { return Array.isArray(v) ? v : []; }

function normalizeSlots(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  return raw
    .filter(s => s?.slotId && s?.roleSystemId && !seen.has(s.slotId) && seen.add(s.slotId))
    .map(s => ({
      slotId: s.slotId,
      roleSystemId: s.roleSystemId,
      status: VALID.includes(s.status) ? s.status : 'open',
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
    const user = await base44.auth.me().catch(() => null);
    const { eventId } = await req.json().catch(() => ({}));
    if (!eventId) return Response.json({ error: 'Missing eventId' }, { status: 400 });

    // Chercher par eventId d'abord, fallback par id direct
    let sessions = await base44.asServiceRole.entities.Session.filter({ eventId }).catch(() => []);
    if (!sessions?.length) {
      // Fallback : l'eventId passé est peut-être directement l'id de la session
      const byId = await base44.asServiceRole.entities.Session.filter({ id: eventId }).catch(() => []);
      sessions = (byId || []).filter(s => s.sessionType === 'event');
    }
    if (!sessions?.length) return Response.json({ ok: false, code: 'NO_LOBBY' });

    const session = sessions[0];
    const slots = normalizeSlots(session.slots);
    const participants = asArray(session.participants);

    const snap = session.moodFilterSnapshot || {};
    const lineupPlacements = snap.lineupPlacements || {};
    // v-fix : fallback sur event.scenes/schedule si le snapshot ne les contient pas encore
    // (cas d'un premier chargement avant toute assignation)
    const sessionScenes   = asArray(snap.lineupScenes);
    const sessionSchedule = asArray(snap.lineupSchedule);

    // Helper : trouver tous les placements d'un slot:user
    // Nouveau modèle : clé = "slotId:userId:sceneId:plageId"
    // Ancien modèle : clé = "slotId:userId" ou "slotId" → rétrocompat
    const getSlotUserPlacements = (slotId, userId) => {
      const results = [];
      for (const [key, p] of Object.entries(lineupPlacements)) {
        // Nouveau format : slotId:userId:sceneId:plageId
        if (p && p.slotId === slotId && p.userId === userId) {
          results.push(p);
          continue;
        }
        // Ancien format : slotId:userId → 1 placement
        if (key === `${slotId}:${userId}` && p?.isPlaced) {
          results.push({ slotId, userId, sceneId: p.sceneId, plageId: p.plageId, isPlaced: true, assignedPrice: p.assignedPrice });
          continue;
        }
        // Très ancien format : slotId seul
        if (key === slotId && p?.isPlaced && !userId) {
          results.push({ slotId, userId: null, sceneId: p.sceneId, plageId: p.plageId, isPlaced: true, assignedPrice: p.assignedPrice });
        }
      }
      return results;
    };

    const evList = await base44.asServiceRole.entities.Event.filter({ id: eventId }).catch(() => []);
    const ev = evList?.[0];
    const isOrganizer = user && (
      (ev?.organizerId || ev?.organizerUserId) === user.id ||
      session.hostUserId === user.id
    );
    const isParticipant = user && participants.some(p => p.userId === user.id);

    // Budget canonique — calculé ici depuis lineupPlacements (source figée T1)
    // pour éviter de passer tout moodFilterSnapshot au frontend.
    // Priorité 1 : lineupPlacements isPlaced=true (prix contractuels finaux)
    // Priorité 2 : event.budget DB
    const lpBudget = Object.values(lineupPlacements)
      .filter(p => p?.isPlaced === true && p?.assignedPrice != null)
      .reduce((sum, p) => sum + (Number(p.assignedPrice) || 0), 0);
    const canonicalBudget = lpBudget > 0 ? lpBudget : (Number(ev?.budget) || 0);

    const result = {
      id: session.id,
      eventId,
      status: session.status,
      sessionType: session.sessionType,
      slots: slots.map(s => {
        // Pour les sessions 'event', slot.candidates[] est souvent vide.
        // On le reconstruit depuis participants[] filtrés par roleSystemId.
        // Cela permet au LineupBoard de générer une carte par talent confirmé.
        let effectiveCandidates = asArray(s.candidates);
        if (effectiveCandidates.length === 0) {
          const byRole = participants.filter(p =>
            p.roleSystemId === s.roleSystemId && p.userId && p.status === 'confirmed'
          );
          // Toujours inclure le candidateUserId officiel du slot
          const knownUserIds = new Set(byRole.map(p => p.userId));
          if (s.candidateUserId && !knownUserIds.has(s.candidateUserId)) {
            byRole.push({
              userId: s.candidateUserId,
              styleSystemIds: asArray(s.candidateStyleSystemIds),
              status: s.status === 'confirmed' ? 'confirmed' : 'pending',
              joinedAt: s.confirmedAt || null,
            });
          }
          effectiveCandidates = byRole.map(p => ({
            userId: p.userId,
            styleSystemIds: asArray(p.styleSystemIds),
            status: p.status === 'confirmed' ? 'confirmed' : 'pending',
            appliedAt: p.joinedAt || null,
            confirmedAt: p.confirmedAt || null,
          }));
        }

        // Filtrer candidates[] selon qui regarde :
        // L'organisateur voit tout ; le talent voit sa propre candidature + les confirmés
        const filteredCandidates = effectiveCandidates.filter(c => {
          if (isOrganizer) return true; // l'organisateur voit tout
          if (c.userId === user?.id) return true; // sa propre candidature
          if (c.status === 'confirmed') return true; // les confirmés sont publics
          return false;
        });

        // Enrichir chaque candidat confirmé avec TOUS ses placements
        const confirmedCands = filteredCandidates.filter(c => c.status === 'confirmed');

        const candidatesWithPlacement = filteredCandidates.map(c => {
          if (c.status !== 'confirmed') return c;
          const userPlacements = getSlotUserPlacements(s.slotId, c.userId);
          return {
            ...c,
            isPlaced: userPlacements.length > 0,
            placements: userPlacements,
            // Compat : premier placement pour le Lineup Board legacy
            sceneId: userPlacements[0]?.sceneId ?? null,
            plageId: userPlacements[0]?.plageId ?? null,
            // Styles retenus lors du dernier placement (pour affichage Programme)
            assignedStyleSystemIds: userPlacements[0]?.assignedStyleSystemIds ?? [],
          };
        });

        // Placement principal = premier confirmé
        const primaryConfirmed = confirmedCands[0];
        const primaryPlacements = primaryConfirmed
          ? getSlotUserPlacements(s.slotId, primaryConfirmed.userId)
          : getSlotUserPlacements(s.slotId, s.candidateUserId);

        return {
          slotId: s.slotId,
          roleSystemId: s.roleSystemId,
          status: s.status,
          candidateUserId: s.candidateUserId,
          candidateStyleSystemIds: s.candidateStyleSystemIds,
          confirmedAt: s.confirmedAt,
          confirmedBy: isOrganizer ? s.confirmedBy : undefined,
          candidates: candidatesWithPlacement,
          // Compat legacy : premier placement
          isPlaced: primaryPlacements.length > 0,
          sceneId:  primaryPlacements[0]?.sceneId  ?? null,
          plageId:  primaryPlacements[0]?.plageId  ?? null,
          placements: primaryPlacements,
          assignedPrice: (isOrganizer || s.candidateUserId === user?.id)
            ? (primaryPlacements[0]?.assignedPrice ?? null)
            : undefined,
        };
      }),
      participants: participants.map(p => ({
        userId: p.userId,
        roleSystemId: p.roleSystemId,
        styleSystemIds: p.styleSystemIds,
        status: p.status,
      })),
      scenes:   sessionScenes.length > 0   ? sessionScenes   : asArray(ev?.scenes),
      schedule: sessionSchedule.length > 0 ? sessionSchedule : asArray(ev?.schedule),
      canonicalBudget, // v — budget contractuel figé (sum LP isPlaced) pour PaymentRequestPanel
    };

    // Instrumentation
    const totalConfirmed = result.slots.flatMap(s => (s.candidates||[]).filter(c => c.status === 'confirmed')).length;
    const totalPlacements = result.slots.flatMap(s => (s.candidates||[]).flatMap(c => c.placements||[])).length;
    console.log('[getEventLobby] RETURN', {
      slotsCount: result.slots.length,
      totalConfirmed,
      totalPlacements,
      detail: result.slots.map(s => ({
        slotId: s.slotId,
        candidateCount: (s.candidates||[]).length,
        confirmedCount: (s.candidates||[]).filter(c => c.status === 'confirmed').length,
        placementsCount: (s.candidates||[]).filter(c => c.status === 'confirmed')
          .reduce((n, c) => n + (c.placements?.length || 0), 0),
      })),
    });

    return Response.json({ ok: true, session: result, isOrganizer, isParticipant });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});