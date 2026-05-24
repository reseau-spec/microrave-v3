// deploy: v4
// CHANGEMENTS v4 — Fix "Aucune scène ou plage configurée" après assignation :
//   Les deux Session.update dans cette fonction écrivaient moodFilterSnapshot
//   avec un spread {...snap, lineupPlacements: ...} mais ne garantissaient pas
//   la présence de lineupScenes/lineupSchedule si ceux-ci étaient absents du
//   snapshot re-fetché (race condition entre deux écritures successives, ou
//   snapshot initial créé sans ces champs via handleOpenLobby direct).
//   Fix : ajout explicite du spread conditionnel lineupScenes/lineupSchedule
//   sur les deux paths d'écriture (withdraw existant + écriture principale).
//
// proposePriceToTalent
//
// Appelé par l'organisateur depuis le LineupBoard après avoir cliqué
// "Confirmer et envoyer la proposition".
//
// Flow :
//   1. Valider que l'appelant est l'organisateur de la session
//   2. Si le talent n'est pas encore placé sur le plateau, appeler assignLineupSlot
//      avec le prix calculé (sans override) pour créer le placement
//   3. Écrire/mettre à jour l'override de prix dans lineupPlacements
//   4. Créer ou mettre à jour l'entité PriceProposal (nouveau round)
//   5. Écrire proposalStatus=pending_talent dans le placement
//   6. Notifier le talent par email
//   7. Incrémenter event.pendingProposalCount
//
// Si action='withdraw' : annuler la proposition, remettre isPlaced=false,
// proposalStatus=withdrawn, decrements pendingProposalCount.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function jsonError(status, code, message, extra = {}) {
  return json(status, { ok: false, code, error: message, ...extra });
}

function normalizeId(v) {
  if (!v) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'object' && v !== null) return String(v.id || v._id || '');
  return String(v);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return jsonError(401, 'UNAUTHORIZED', 'Non authentifié');

    const actorUserId = normalizeId(user.id);
    const service     = base44.asServiceRole;

    const {
      sessionId,
      slotId,
      talentUserId,
      sceneId,
      plageId,
      offeredPrice,     // number | 0 (bénévolat)
      message,          // string | null
      action,           // 'propose' (défaut) | 'withdraw'
      styleSystemIds,   // v5 — styles souhaités par l'organisateur (optionnel)
    } = await req.json();

    console.log('[proposePriceToTalent] v3 INPUT', {
      sessionId, slotId, talentUserId, sceneId, plageId,
      offeredPrice, action: action || 'propose',
      actorUserId,
    });

    if (!sessionId || !slotId || !talentUserId) {
      return jsonError(400, 'MISSING_PARAMS', 'sessionId, slotId et talentUserId sont requis');
    }

    // ── 1. Charger la session ─────────────────────────────────────────────────
    const sessions = await service.entities.Session.filter({ id: sessionId }).catch(() => []);
    const session  = sessions?.[0];
    if (!session) return jsonError(404, 'SESSION_NOT_FOUND', 'Session introuvable');

    const isOrganizer =
      normalizeId(session.organizerId)     === actorUserId ||
      normalizeId(session.organizerUserId) === actorUserId ||
      normalizeId(session.hostUserId)      === actorUserId;

    if (!isOrganizer) return jsonError(403, 'NOT_ORGANIZER', "Seul l'organisateur peut proposer un cachet");

    // ── 2. Charger le slot cible ──────────────────────────────────────────────
    const slots  = Array.isArray(session.slots) ? session.slots : [];
    const realSlotId = slotId.includes(':') ? slotId.split(':')[0] : slotId;
    const slot   = slots.find(s => normalizeId(s.slotId) === realSlotId);
    if (!slot) return jsonError(404, 'SLOT_NOT_FOUND', 'Slot introuvable dans la session');

    // ── 3. Lire les placements existants ──────────────────────────────────────
    const existingSnap   = session.moodFilterSnapshot || {};
    const placements     = { ...(existingSnap.lineupPlacements || {}) };
    const placementKey   = sceneId && plageId
      ? `${realSlotId}:${talentUserId}:${sceneId}:${plageId}`
      : Object.keys(placements).find(k => {
          const p = placements[k];
          return p?.userId === talentUserId && p?.slotId === realSlotId && p?.isPlaced;
        }) || null;

    const existingPlacement = placementKey ? placements[placementKey] : null;
    const calculatedPrice   = Number(existingPlacement?.calculatedPrice || existingPlacement?.assignedPrice || 0);
    const isGratuit         = Number(offeredPrice) === 0;
    const nowIso            = new Date().toISOString();
    const expiresAt         = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();

    // ── 4. Action WITHDRAW ────────────────────────────────────────────────────
    if (action === 'withdraw') {
      if (existingPlacement && placementKey) {
        placements[placementKey] = {
          ...existingPlacement,
          proposalStatus: 'withdrawn',
          isPlaced:       false,
        };
        await service.entities.Session.update(sessionId, {
          moodFilterSnapshot: {
            ...existingSnap,
            lineupPlacements: placements,
            // v4 fix — ne jamais ecraser lineupScenes/lineupSchedule
            ...(Array.isArray(existingSnap.lineupScenes)   && existingSnap.lineupScenes.length   > 0 ? { lineupScenes:   existingSnap.lineupScenes }   : {}),
            ...(Array.isArray(existingSnap.lineupSchedule) && existingSnap.lineupSchedule.length > 0 ? { lineupSchedule: existingSnap.lineupSchedule } : {}),
          },
        });

        const proposalId = existingPlacement.proposalId;
        if (proposalId) {
          await service.entities.PriceProposal.update(proposalId, {
            status:      'withdrawn',
            finalStatus: 'withdrawn',
            updatedAt:   nowIso,
            finalizedAt: nowIso,
          }).catch(() => {});
        }

        if (session.eventId) {
          const evs = await service.entities.Event.filter({ id: session.eventId }).catch(() => []);
          const ev  = evs?.[0];
          if (ev) {
            await service.entities.Event.update(session.eventId, {
              pendingProposalCount: Math.max(0, (Number(ev.pendingProposalCount) || 0) - 1),
            }).catch(() => {});
          }
        }
      }
      return json(200, { ok: true, action: 'withdrawn' });
    }

    // ── 5. Action PROPOSE (défaut) ────────────────────────────────────────────
    // Si pas encore placé sur ce slot/plage, créer le placement d'abord.
    //
    // FIX v3 — targetUserId manquant (root cause du bug "data microrave toujours assigné")
    // v2 appelait assignLineupSlot SANS targetUserId.
    // assignLineupSlot sans targetUserId résolvait le talent via :
    //   targetUserId = confirmedCand?.userId || slot.candidateUserId || null
    // slot.candidateUserId = premier talent JAMAIS assigné sur ce slot (stale).
    // → le placement était créé pour le mauvais talent (data microrave).
    // → la PriceProposal avait le bon talentUserId (heureux hasard)
    //   mais le placement dans lineupPlacements pointait vers data microrave.
    // → session.slots affichait data microrave sur le plateau.
    // Fix : passer explicitement targetUserId: talentUserId à assignLineupSlot.
    if (!existingPlacement && sceneId && plageId) {
      console.log('[proposePriceToTalent] v3 pre-assign', {
        sessionId, slotId: realSlotId, targetUserId: talentUserId, sceneId, plageId,
      });
      await base44.functions.invoke('assignLineupSlot', {
        sessionId,
        slotId:        realSlotId,
        targetUserId:  talentUserId,   // ← FIX v3 : talent explicite, pas de fallback stale
        sceneId,
        plageId,
      }).catch(e => {
        console.warn('[proposePriceToTalent] pre-assign failed:', e?.message);
      });

      const refreshed = await service.entities.Session.filter({ id: sessionId }).catch(() => []);
      const sess2     = refreshed?.[0];
      const snap2     = sess2?.moodFilterSnapshot || {};
      const pls2      = snap2.lineupPlacements || {};
      Object.assign(placements, pls2);
    }

    // ── 6. Trouver ou confirmer la clé de placement ───────────────────────────
    const finalKey = placementKey || Object.keys(placements).find(k => {
      const p = placements[k];
      return p?.userId === talentUserId && p?.slotId === realSlotId && p?.isPlaced;
    });

    console.log('[proposePriceToTalent] v3 finalKey resolved', {
      finalKey,
      finalKeyUserId: finalKey ? finalKey.split(':')?.[1] : null,
      talentUserId,
      match: finalKey ? finalKey.split(':')?.[1] === talentUserId : false,
    });

    if (!finalKey) {
      return jsonError(422, 'PLACEMENT_FAILED', 'Impossible de créer le placement sur le plateau');
    }

    const finalPlacement = placements[finalKey];
    const calcPrice      = Number(finalPlacement?.calculatedPrice || finalPlacement?.assignedPrice || calculatedPrice);

    // ── 7. Créer ou mettre à jour la PriceProposal ────────────────────────────
    const existingProposalId = finalPlacement?.proposalId;
    let proposalId;

    const newRound = {
      roundIndex: 0,
      proposedBy: 'organizer',
      price:      Number(offeredPrice),
      isGratuit,
      message:    message || '',
      status:     'pending',
      createdAt:  nowIso,
      respondedAt: null,
      expiresAt,
      // v5 — styles proposés dans ce round (traçabilité complète de la négociation)
      styleSystemIds: Array.isArray(styleSystemIds) && styleSystemIds.length > 0
        ? styleSystemIds
        : [],
    };

    if (existingProposalId) {
      const existingProps = await service.entities.PriceProposal
        .filter({ id: existingProposalId }).catch(() => []);
      const existingProp  = existingProps?.[0];
      const existingRounds = Array.isArray(existingProp?.rounds) ? existingProp.rounds : [];
      newRound.roundIndex  = existingRounds.length;

      await service.entities.PriceProposal.update(existingProposalId, {
        status:           'pending_talent',
        currentOfferPrice: Number(offeredPrice),
        isGratuit,
        rounds:           [...existingRounds, newRound],
        updatedAt:        nowIso,
        expiresAt,
        // v5 — mise à jour des styles proposés si fournis
        ...(Array.isArray(styleSystemIds) && styleSystemIds.length > 0
          ? { styleSystemIds }
          : {}),
      });
      proposalId = existingProposalId;
    } else {
      const proposal = await service.entities.PriceProposal.create({
        eventId:          session.eventId || null,
        sessionId,
        slotId:           realSlotId,
        organizerUserId:  actorUserId,
        talentUserId,
        targetPlageIds:   plageId ? [plageId] : [],
        targetSceneId:    sceneId || null,
        calculatedPrice:  calcPrice,
        currentOfferPrice: Number(offeredPrice),
        isGratuit,
        finalPrice:       null,
        status:           'pending_talent',
        finalStatus:      null,
        rounds:           [newRound],
        // v5 — styles souhait\u00e9s par l'organisateur — transmis au talent pour validation
        styleSystemIds:   Array.isArray(styleSystemIds) && styleSystemIds.length > 0
          ? styleSystemIds
          : [],
        createdAt:        nowIso,
        updatedAt:        nowIso,
        expiresAt,
        finalizedAt:      null,
      });
      proposalId = proposal.id;
    }

    // ── 8. Mettre à jour le placement dans lineupPlacements ───────────────────
    placements[finalKey] = {
      ...finalPlacement,
      assignedPrice:     Number(offeredPrice),
      isPlaced:          true,
      priceIsOverridden: true,
      priceOverridedAt:  nowIso,
      calculatedPrice:   calcPrice,
      proposalId,
      proposalStatus:    'pending_talent',
      proposedBy:        actorUserId,
      proposedAt:        nowIso,
      talentCounterPrice: null,
      talentResponseNote: null,
    };

    const sessionNow = await service.entities.Session.filter({ id: sessionId }).catch(() => []);
    const sessNow    = sessionNow?.[0];
    const snapNow    = sessNow?.moodFilterSnapshot || {};

    await service.entities.Session.update(sessionId, {
      moodFilterSnapshot: {
        ...snapNow,
        lineupPlacements: {
          ...(snapNow.lineupPlacements || {}),
          [finalKey]: placements[finalKey],
        },
        // v4 fix — ne jamais ecraser lineupScenes/lineupSchedule
        ...(Array.isArray(snapNow.lineupScenes)   && snapNow.lineupScenes.length   > 0 ? { lineupScenes:   snapNow.lineupScenes }   : {}),
        ...(Array.isArray(snapNow.lineupSchedule) && snapNow.lineupSchedule.length > 0 ? { lineupSchedule: snapNow.lineupSchedule } : {}),
      },
    });

    // ── 9. Recalculer Event.budget + incrémenter pendingProposalCount ─────────
    // v2 FIX : après écriture du snapshot, recalculer event.budget comme la
    // somme des assignedPrice de tous les placements isPlaced=true.
    // Sans ce recalcul, event.budget restait au prix calculé par le taux horaire
    // (ex: 1478$) au lieu du prix offert (ex: 300$), causant des EPR incorrectes.
    if (session.eventId) {
      const evs = await service.entities.Event.filter({ id: session.eventId }).catch(() => []);
      const ev  = evs?.[0];
      if (ev) {
        // Re-fetch du snapshot pour avoir la version finale après toutes les écritures
        const sessUpdated = await service.entities.Session.filter({ id: sessionId }).catch(() => []);
        const snapUpdated = sessUpdated?.[0]?.moodFilterSnapshot || {};
        const plsUpdated  = snapUpdated.lineupPlacements || {};

        const newBudget = Object.values(plsUpdated)
          .filter(p => p?.isPlaced === true && p?.assignedPrice != null)
          .reduce((sum, p) => sum + Number(p.assignedPrice), 0);

        const updatePayload = {};
        if (newBudget > 0) updatePayload.budget = newBudget;
        if (!existingProposalId) {
          updatePayload.pendingProposalCount = (Number(ev.pendingProposalCount) || 0) + 1;
        }

        if (Object.keys(updatePayload).length > 0) {
          await service.entities.Event.update(session.eventId, updatePayload).catch(() => {});
        }

        console.log(`[proposePriceToTalent] v2 eventId=${session.eventId} budget=${newBudget} offeredPrice=${offeredPrice}`);
      }
    }

    // ── 10. Notifier le talent par email ──────────────────────────────────────
    try {
      const [talentUsers, evRows] = await Promise.all([
        service.entities.User.filter({ id: talentUserId }).catch(() => []),
        session.eventId
          ? service.entities.Event.filter({ id: session.eventId }).catch(() => [])
          : Promise.resolve([]),
      ]);
      const talentUser = talentUsers?.[0];
      const eventData  = evRows?.[0];

      if (talentUser?.email && eventData) {
        const prixLabel = isGratuit
          ? 'Bénévolat — 0 $ CAD (gratuit)'
          : `${Number(offeredPrice)} $ CAD`;

        const diffPct = calcPrice > 0
          ? Math.round(((Number(offeredPrice) - calcPrice) / calcPrice) * 100)
          : 0;
        const diffLabel = diffPct === 0 ? ''
          : diffPct > 0 ? ` (+${diffPct}% vs tarif calculé)`
          : ` (${diffPct}% vs tarif calculé de ${calcPrice} $)`;

        const eventDate = eventData.dateStart
          ? new Date(eventData.dateStart).toLocaleDateString('fr-CA', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
          : '';

        const profileUrl = `${Deno.env.get('VITE_APP_URL') || 'https://microrave.ca'}/Profile?tab=actions`;

        await service.integrations.Core.SendEmail({
          to:        talentUser.email,
          subject:   `🎵 Proposition de placement — ${eventData.title}`,
          from_name: 'Micro Rave',
          body: `Bonjour ${talentUser.displayName || ''},

L'organisateur de « ${eventData.title} » vous propose un placement dans son programme.${eventDate ? `\nDate de l'événement : ${eventDate}` : ''}

Conditions proposées :
  Cachet : ${prixLabel}${diffLabel}${message ? `\n  Message : "${message}"` : ''}

Vous devez accepter ou négocier cette proposition pour être inclus(e) dans le programme.
Les propositions expirent 72 heures après réception.

→ Consulter et répondre : ${profileUrl}

Micro Rave`,
        });
        console.log(`[proposePriceToTalent] email sent to ${talentUser.email}`);
      }
    } catch (emailErr) {
      console.warn('[proposePriceToTalent] email failed (non-fatal):', emailErr?.message);
    }

    return json(200, {
      ok:          true,
      proposalId,
      talentUserId,
      offeredPrice: Number(offeredPrice),
      isGratuit,
      status:      'pending_talent',
    });

  } catch (err) {
    console.error('[proposePriceToTalent]', err?.message);
    return json(500, { ok: false, error: err?.message });
  }
});