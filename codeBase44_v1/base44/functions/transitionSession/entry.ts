// deploy: v4
// FIX: G1 dans le branch sans placements + lecture _cents compatible migration centimes
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

// Session states - source unique de vérité
const SESSION_STATUS = {
  IDLE: 'idle',
  QUEUEING: 'queueing',
  MATCHED: 'matched',
  LOBBY: 'lobby',
  READY: 'ready',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  ABORTED: 'aborted',
  SOTS_SUBMITTED: 'sots_submitted',
  ARCHIVED: 'archived'
};

// ─── Utilities ────────────────────────────────────────────────────────────────
function normalizeId(v) {
  if (!v) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  if (typeof v === 'object') return String(v.systemId || v.id || v._id || v.value || '');
  return '';
}

function jsonError(status, code, message, extra = {}) {
  return new Response(JSON.stringify({ ok: false, code, error: message, ...extra }), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

function asArray(value, fallback = []) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch { return fallback; }
  }
  return fallback;
}

async function getServiceClientOrThrow(base44) {
  try {
    if (!base44?.asServiceRole) return null;
    return base44.asServiceRole;
  } catch (e) {
    return null;
  }
}

// ── MOMENT ENGINE HELPER ──────────────────────────────────────────────────────
// Émet un signal dans CulturalMomentSignal + met à jour CheckpointLiveStats.
// Toujours appelé en fire-and-forget (.catch(() => {})) — ne bloque jamais la réponse.
// Idempotent : le CulturalMoment est créé (seeded) s'il n'existe pas encore.
async function emitMomentSignal(serviceRole, session, signalType) {
  const cpId = session.checkpointSystemId;
  if (!cpId) return;
  const nowSignal = new Date().toISOString();
  const dateStr = nowSignal.slice(0, 10);

  // Domaine : snapshot de la session si disponible, fallback music
  const domainKey = session.domainDominantKey ||
    (session.domainWeightsSnapshot ? Object.keys(session.domainWeightsSnapshot)[0] : null) ||
    'music';

  const momentKey = `${cpId}_${domainKey}_${dateStr}`;

  // Trouver ou créer le CulturalMoment du jour
  const existing = await serviceRole.entities.CulturalMoment.filter({ momentKey }).catch(() => []);
  let momentId = existing?.[0]?.id || null;

  if (!momentId) {
    const cpList = await serviceRole.entities.Checkpoint.filter({ systemId: cpId }).catch(() => []);
    const cpName = cpList?.[0]?.name || cpId;
    const created = await serviceRole.entities.CulturalMoment.create({
      momentKey,
      checkpointSystemId: cpId,
      domainKey,
      momentType: 'emergence',
      status: 'seeded',
      headline: `${cpName} — activité en cours`,
      subheadline: '1 session active',
      ctaType: 'join_session',
      momentScore: 20,
      momentumScore: 20,
      momentumDelta: 10,
      startedAt: nowSignal,
      expiresAt: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
      isPublishedInExplore: false,
    }).catch(() => null);
    momentId = created?.id || null;
  }

  if (!momentId) {
    console.warn('[MomentSignal] Could not create CulturalMoment, skipping signal', { cpId, momentKey });
    return;
  }

  // Écrire le signal
  await serviceRole.entities.CulturalMomentSignal.create({
    culturalMomentId: momentId,
    checkpointSystemId: cpId,
    signalType,
    signalValue: 1,
    sourceTable: 'Session',
    sourceId: session.id,
    recordedAt: nowSignal,
  }).catch(() => {});

  console.log('[MomentSignal] emitted', { signalType, sessionId: session.id, cpId, momentId });

  // Incrémenter CheckpointLiveStats
  const statField = signalType === 'session_confirmed' ? 'recentSessionsConfirmed' : 'recentSessionsOpened';
  const lsRows = await serviceRole.entities.CheckpointLiveStats.filter({ checkpointSystemId: cpId }).catch(() => []);
  const ls = lsRows?.[0];
  if (ls) {
    await serviceRole.entities.CheckpointLiveStats.update(ls.id, {
      [statField]: (Number(ls[statField]) || 0) + 1,
      lastActivityAt: nowSignal,
    }).catch(() => {});
  } else {
    await serviceRole.entities.CheckpointLiveStats.create({
      checkpointSystemId: cpId,
      [statField]: 1,
      lastActivityAt: nowSignal,
      lastComputedAt: nowSignal,
    }).catch(() => {});
  }
}
// ── FIN MOMENT ENGINE HELPER ──────────────────────────────────────────────────

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return jsonError(401, 'UNAUTHENTICATED', 'Non authentifié');
    }
    const actorUserId = user.id;

    const body = await req.json().catch(() => ({}));
    const { sessionId, action, roleSystemId, styleSystemId } = body || {};

    if (!sessionId || typeof sessionId !== 'string') {
      return jsonError(400, 'BAD_REQUEST', 'sessionId requis (string)');
    }
    if (!action || typeof action !== 'string') {
      return jsonError(400, 'BAD_REQUEST', 'action requise (string)');
    }

    const serviceRole = await getServiceClientOrThrow(base44);
    if (!serviceRole) {
      return new Response(JSON.stringify({
        ok: false,
        code: 'SERVICE_ROLE_UNAVAILABLE',
        error: 'Service role unavailable (Base44). Publish/permissions issue.'
      }), { status: 503, headers: { 'content-type': 'application/json' }});
    }

    // v — VALID_DOMAINS dynamique depuis StyleHierarchy (une fois par invocation)
    // Remplace tous les arrays/sets hardcodés VALID_CHECKPOINT_DOMAINS + VALID_DOMAINS_SET
    const _allStylesForDomains = await serviceRole.entities.StyleHierarchy.filter({}).catch(() => []);
    const VALID_DOMAINS_DYNAMIC = new Set(
      (_allStylesForDomains || []).map(s => s.domainKey).filter(Boolean)
    );

    const sessions = await serviceRole.entities.Session.filter({ id: sessionId });
    const session = sessions?.[0];
    if (!session) {
      return jsonError(404, 'SESSION_NOT_FOUND', 'Session introuvable');
    }

    const participants = asArray(session.participants, []);
    const participantIds = participants.map(p => normalizeId(p?.userId)).filter(Boolean);
    const isParticipant = participantIds.includes(actorUserId);

    // Fallback host deterministic si hostUserId absent
    const fallbackHostId = participantIds[0] || null;
    const hostId = normalizeId(session.hostUserId) || fallbackHostId;
    const isHost = !!hostId && hostId === actorUserId;

    const hostRequired = new Set(['SET_LOBBY']);

    // Anti-accès: si pas participant, jamais autorisé à muter la session
    // EXCEPTION: event session organizer is identified by organizerId, not participants array
    const isEventOrganizer = session.sessionType === 'event' &&
      (normalizeId(session.organizerId) === actorUserId ||
       normalizeId(session.hostUserId) === actorUserId);

    if (!isParticipant && !isEventOrganizer) {
      return jsonError(403, 'FORBIDDEN_NOT_PARTICIPANT', 'Utilisateur non participant à la session');
    }

    const status = session.status;

    // ── EVENT SESSION ROUTING ─────────────────────────────────────────────
    const EVENT_ALLOWED_ACTIONS = ['START_SESSION', 'COMPLETE_SESSION', 'DISPUTE', 'ARCHIVE', 'MARK_SOTS_SUBMITTED', 'ABORT'];
    if (session.sessionType === 'event') {
      if (!EVENT_ALLOWED_ACTIONS.includes(action)) {
        return jsonError(400, 'EVENT_ACTION_FORBIDDEN',
          `Action "${action}" is not allowed on event sessions. ` +
          `Allowed: ${EVENT_ALLOWED_ACTIONS.join(', ')}. ` +
          `Use applyToSlot / confirmSlot / unconfirmSlot / withdrawFromSlot for slot management.`
        );
      }
    }
    // ── END EVENT SESSION ROUTING ─────────────────────────────────────────

    // Claim host (best effort) si action host-required et hostId absent
    const shouldClaimHost = hostRequired.has(action) && !session.hostUserId;

    if (hostRequired.has(action) && normalizeId(session.hostUserId) && !isHost) {
      return jsonError(403, 'FORBIDDEN_NOT_HOST', 'Seul le host peut effectuer cette transition');
    }
    if (hostRequired.has(action) && !normalizeId(session.hostUserId) && !isHost) {
      const implicitHostOk = (fallbackHostId && fallbackHostId === actorUserId);
      if (!implicitHostOk) {
        return jsonError(403, 'FORBIDDEN_NOT_HOST', 'Seul le host implicite (1er participant) peut effectuer cette transition');
      }
    }

    console.log(`[transitionSession] action=${action} sessionId=${sessionId} currentStatus=${status} actor=${actorUserId} sessionType=${session.sessionType}`);

    let update = {};
    let okTransition = true;
    const fromStatus = status;
    const nowIso = new Date().toISOString();
    const maxPlayers = session.maxPlayers || 6;

    if (action === 'SET_LOBBY') {
      if (status === 'lobby') {
        return json(200, { ok: true, sessionId: session.id, session, idempotent: true });
      }
      if (status !== 'matched') okTransition = false;
      update.status = SESSION_STATUS.LOBBY;
      update.lobbyOpenedAt = nowIso;
    } else if (action === 'SET_READY') {
        // EVENT sessions do not use ready-check
        if (session.sessionType === 'event') {
          return jsonError(400, 'EVENT_LOBBY_NO_READY_CHECK',
            'Event sessions do not use SET_READY. Use confirmSlot instead.'
          );
        }
        if (status === 'in_progress') {
          return json(200, { ok: true, sessionId: session.id, session, idempotent: true });
        }
        if (!['lobby', 'ready'].includes(status)) okTransition = false;

        const roleSid = normalizeId(roleSystemId);
        const styleSid = normalizeId(styleSystemId);

        const rawStyleIds = body?.styleSystemIds;
        const finalStyleIds = Array.isArray(rawStyleIds) ? rawStyleIds : (styleSid ? [styleSid] : []);
        const normalizedStyles = [...new Set(finalStyleIds.map(normalizeId).filter(Boolean))];

        if (!roleSid || normalizedStyles.length === 0) {
          return jsonError(400, 'INCOMPLETE_SELECTION', 'Un rôle et au moins un style sont requis');
        }

        try {
          const styles = await serviceRole.entities.StyleHierarchy.filter({
            systemId: { $in: normalizedStyles }
          });

          const unknownStyles = normalizedStyles.filter(
            sid => !styles.some(s => normalizeId(s.systemId) === sid)
          );
          if (unknownStyles.length > 0) {
            return jsonError(400, 'UNKNOWN_STYLES', 'Styles inconnus dans le système', {
              unknownStyles
            });
          }
        } catch (validationError) {
          console.error('Style validation error (non-fatal):', validationError);
        }

        const updatedParticipants = participants.map((p) => {
          if (normalizeId(p.userId) === actorUserId) {
            return {
              ...p,
              status: 'ready',
              roleSystemId: roleSid,
              styleSystemIds: normalizedStyles,
              styleSystemId: normalizedStyles[0]
            };
          }
          return p;
        });
        update.participants = updatedParticipants;

        const minPlayers = session.minPlayers || 2;
        const quorumReady = 4;

        const allReady = updatedParticipants.length === maxPlayers && updatedParticipants.every((p) => p.status === 'ready');
        const quorumMet = updatedParticipants.length >= minPlayers &&
                         updatedParticipants.filter(p => p.status === 'ready').length >= quorumReady;
        const lobbyOldEnough = session.lobbyOpenedAt &&
                              (Date.now() - new Date(session.lobbyOpenedAt).getTime()) > 30000;

        if (allReady || (quorumMet && lobbyOldEnough)) {
            update.status = SESSION_STATUS.IN_PROGRESS;
            update.actualStartAt = nowIso;
            update.startAt = nowIso;
            update.lockedAt = nowIso;
            // ── MOMENT ENGINE — signal session_opened (SET_READY auto-start) ──
            if (session.checkpointSystemId) {
              emitMomentSignal(serviceRole, session, 'session_opened').catch(() => {});
            }
        }
    } else if (action === 'UNREADY') {
      if (!['lobby', 'ready'].includes(status)) okTransition = false;

      const updatedParticipants = participants.map((p) =>
        normalizeId(p.userId) === actorUserId ? { ...p, status: 'lobby' } : p
      );
      update.participants = updatedParticipants;
    } else if (action === 'START_SESSION') {
      // EVENT sessions: any confirmed participant or organizer can start
      if (session.sessionType === 'event') {
        const isHost = normalizeId(session.hostUserId) === actorUserId ||
                       normalizeId(session.organizerId) === actorUserId;
        const isConfirmedParticipant = participants.some(p =>
          normalizeId(p?.userId) === actorUserId && p?.status === 'confirmed'
        );
        if (!isHost && !isConfirmedParticipant) {
          return jsonError(403, 'FORBIDDEN',
            'Only the organizer or a confirmed participant can start an event session'
          );
        }
        // ── Guards contractuels et financiers — BLOQUANTS ──────────────────
        // Un event ne peut pas démarrer si l'une de ces conditions n'est pas remplie.
        // Ces guards sont des contrats : toutes les parties prenantes doivent avoir
        // signé, et tout l'argent doit être récolté avant de démarrer.
        //
        // G1 — Toutes les PriceProposals doivent être en statut terminal
        //      (accepted, rejected, withdrawn, expired)
        //      Une proposition pending_talent ou pending_organizer = contrat non signé.
        //
        // G2 — Tous les talents dans le lineup ont accepté (finalStatus='accepted')
        //      Un LineupPlacement confirmed sans PriceProposal accepted = talent
        //      assigné sans accord → contrat inexistant.
        //
        // G3 — Le dépôt ET la balance doivent couvrir 100% du budget contracté
        //      totalCollected = escrowAmount + balancePaid
        //      budgetContracté = SUM(LineupPlacement.assignedPrice confirmed)
        //      Si totalCollected < budgetContracté → argent manquant, session bloquée.
        //
        // G4 — escrowStatus doit être 'secured' ou 'released'
        //      (conservé pour les events sans paiement — budget=0 autorisé)

        if (session.eventId) {
          try {
            const evRows = await serviceRole.entities.Event.filter({ id: session.eventId }).catch(() => []);
            const ev = evRows?.[0];

            if (ev) {
              const escrow = ev.escrowStatus || 'none';

              // ── G1 : Aucune PriceProposal ouverte ──────────────────────────
              const OPEN_STATUSES = ['pending_talent', 'pending_organizer', 'countered'];
              const allProps = await serviceRole.entities.PriceProposal
                .filter({ eventId: session.eventId })
                .catch(() => []);
              const openProps = (allProps || []).filter(p => OPEN_STATUSES.includes(p.status));

              if (openProps.length > 0) {
                const details = openProps.map(p => {
                  const who = p.status === 'pending_talent' ? 'en attente du talent' : "en attente de l'organisateur";
                  return `${p.currentOfferPrice}$ (${who})`;
                }).join(', ');
                return jsonError(409, 'OPEN_PROPOSALS',
                  `${openProps.length} offre(s) de cachet en attente de réponse : ${details}. Tous les talents doivent accepter leurs conditions avant de démarrer.`,
                  { openProposals: openProps.length }
                );
              }

              // ── G2 + G3 : Budget contracté vs montant récolté ──────────────
              const placements = await serviceRole.entities.LineupPlacement
                .filter({ eventId: session.eventId, status: 'confirmed' })
                .catch(() => []);

              const confirmedPlacements = (placements || []);

              if (confirmedPlacements.length > 0) {
                // G2 : Tous les placements doivent avoir une PriceProposal accepted
                // (sauf les placements bénévoles à 0$ qui sont auto-acceptés)
                const acceptedProposals = (allProps || []).filter(p =>
                  p.finalStatus === 'accepted' || p.status === 'accepted'
                );
                const acceptedTalentIds = new Set(acceptedProposals.map(p => p.talentUserId));

                const unconfirmedTalents = confirmedPlacements.filter(lp => {
                  if (Number(lp.assignedPrice) === 0) return false; // bénévole = ok
                  return !acceptedTalentIds.has(lp.userId);
                });

                if (unconfirmedTalents.length > 0) {
                  return jsonError(409, 'UNACCEPTED_PLACEMENTS',
                    `${unconfirmedTalents.length} talent(s) n'ont pas encore accepté leurs conditions de cachet. Tous les contrats doivent être signés avant de démarrer.`,
                    { unconfirmedCount: unconfirmedTalents.length }
                  );
                }

                // G3 : Montant récolté = budget contracté (à 1$ de tolérance)
                const budgetContracte = confirmedPlacements.reduce((sum, lp) => {
                    const price = (lp.assigned_price_cents != null && lp.assigned_price_cents !== '')
                      ? Number(lp.assigned_price_cents) / 100
                      : Number(lp.assignedPrice) || 0;
                    return sum + price;
                  }, 0);
                const escrowAmount = (ev.escrow_amount_cents != null && ev.escrow_amount_cents !== '')
                  ? Number(ev.escrow_amount_cents) / 100
                  : Number(ev.escrowAmount) || 0;
                const balancePaid = (ev.balance_paid_cents != null && ev.balance_paid_cents !== '')
                  ? Number(ev.balance_paid_cents) / 100
                  : Number(ev.balancePaid) || 0;
                const totalCollecte = Math.round((escrowAmount + balancePaid) * 100) / 100;
                const TOLERANCE     = 1.00; // 1$ de tolérance pour arrondis

                if (budgetContracte > 0 && totalCollecte < budgetContracte - TOLERANCE) {
                  const manquant = Math.round((budgetContracte - totalCollecte) * 100) / 100;
                  return jsonError(402, 'INSUFFICIENT_FUNDS',
                    `Le montant récolté (${totalCollecte}$ CAD) ne couvre pas le budget contracté (${budgetContracte}$ CAD). Il manque ${manquant}$ CAD. La balance doit être payée avant de démarrer.`,
                    {
                      budgetContracte,
                      totalCollecte,
                      escrowAmount,
                      balancePaid,
                      manquant,
                    }
                  );
                }

                // G4 : escrowStatus doit être secured ou released si budget > 0
                if (budgetContracte > 0 && !['secured', 'released'].includes(escrow)) {
                  return jsonError(402, 'PAYMENT_REQUIRED',
                    `Le dépôt doit être sécurisé avant de démarrer la session (statut actuel : ${escrow}).`,
                    { escrowStatus: escrow }
                  );
                }

              } else {
                // Pas de placements confirmés — G1 + guard escrow
                // G1 aussi ici : une proposal ouverte bloque même sans placements
                if (openProps.length > 0) {
                  const details = openProps.map(p => {
                    const price = (p.current_offer_price_cents != null && p.current_offer_price_cents !== '')
                      ? `${Number(p.current_offer_price_cents)/100}$`
                      : `${p.currentOfferPrice || '?'}$`;
                    const who = p.status === 'pending_talent' ? 'en attente du talent' : "en attente de l'organisateur";
                    return `${price} (${who})`;
                  }).join(', ');
                  return jsonError(409, 'OPEN_PROPOSALS',
                    `${openProps.length} offre(s) en attente : ${details}. Tous les talents doivent accepter avant de démarrer.`,
                    { openProposals: openProps.length }
                  );
                }
                // Guard escrow — supporte _cents et legacy
                const programmeBudget = (ev.budget_cents != null && ev.budget_cents !== '')
                  ? Number(ev.budget_cents) / 100
                  : Number(ev.budget) || 0;
                if (programmeBudget > 0 && !['secured', 'released'].includes(escrow)) {
                  return jsonError(402, 'PAYMENT_REQUIRED',
                    `Le dépôt de ${Math.round(programmeBudget * 0.20)}$ CAD doit être réglé avant de démarrer la session.`,
                    { programmeBudget, escrowStatus: escrow, depositRequired: Math.round(programmeBudget * 0.20) }
                  );
                }
              }
            }
          } catch (guardErr) {
            // Si le guard échoue (erreur réseau/DB), on bloque par sécurité
            console.error('[transitionSession] v3 guard check failed:', guardErr?.message);
            return jsonError(500, 'GUARD_ERROR',
              `Impossible de vérifier les conditions de démarrage : ${guardErr?.message}. Réessayez.`
            );
          }
        }

        update.status = 'in_progress';
        update.actualStartAt = nowIso;

        // Ajouter l'organisateur dans participants[] s'il n'y est pas déjà
        const currentParticipants = asArray(session.participants);
        const organizerAlreadyIn = currentParticipants.some(p => normalizeId(p?.userId) === actorUserId);
        if (!organizerAlreadyIn) {
          const allSessionStyles = Array.from(new Set(
            currentParticipants.flatMap(p => asArray(p?.styleSystemIds).map(s => typeof s === 'string' ? s : normalizeId(s)).filter(Boolean))
          ));
          update.participants = [
            ...currentParticipants,
            {
              userId:        actorUserId,
              roleSystemId:  'RL-ORGANIZER',
              styleSystemIds: allSessionStyles,
              status:        'confirmed',
              isOrganizer:   true,
              joinedAt:      nowIso,
              submittedBallot: false,
              sotsSubmitted:   false,
            }
          ];
        }

        await serviceRole.entities.Session.update(sessionId, update);
        return json(200, { ok: true, status: 'in_progress', sessionId, sessionType: 'event' });
      }
      return jsonError(400, 'BAD_REQUEST', 'START_SESSION is only for event sessions. Use START_MANUAL for quickplay.');

    // COMPLETE_SESSION → handled by completeEventSession function
    } else if (action === 'COMPLETE_SESSION') {
      return jsonError(400, 'USE_COMPLETE_EVENT_SESSION',
        'Use completeEventSession function for COMPLETE_SESSION action.');

    // ══════════════════════════════════════════════════════════════════════
    } else if (action === 'START_MANUAL' || action === 'START') {
      if (status === 'in_progress') {
        return json(200, { ok: true, sessionId: session.id, session, idempotent: true });
      }
      if (!['lobby', 'ready'].includes(status)) okTransition = false;

      if (session.captainUserId && session.captainUserId !== actorUserId) {
        return jsonError(403, 'NOT_CAPTAIN', 'Only the captain can launch the session', {
          captainUserId: session.captainUserId,
          yourUserId: actorUserId
        });
      }

      const minPlayers = session.minPlayers || 2;

      if (participants.length < minPlayers) {
        return jsonError(400, 'NOT_ENOUGH_PLAYERS', `Need at least ${minPlayers} players, have ${participants.length}`);
      }

      const allReady = participants.every(p => p.status === 'ready');
      if (!allReady) {
        return jsonError(400, 'NOT_ALL_READY', 'All participants must be ready before launch');
      }

      if (!session.checkpointSystemId) {
        return jsonError(400, 'MISSING_CHECKPOINT', 'Captain must select a checkpoint before launch');
      }

      update.status = SESSION_STATUS.IN_PROGRESS;
      update.actualStartAt = nowIso;
      update.startAt = nowIso;
      update.lockedAt = nowIso;
      update.checkpointLockedAt = nowIso;
      update.checkpointLockedByUserId = actorUserId;
      update.launchedByUserId = actorUserId;
      update.launchRequestedAt = nowIso;

      // ── MOMENT ENGINE — signal session_opened (START_MANUAL) ──────────────
      if (session.checkpointSystemId) {
        console.log(`[MomentSignal] about to emit session_opened sessionId=${session.id} cpId=${session.checkpointSystemId}`);
        emitMomentSignal(serviceRole, session, 'session_opened')
          .then(() => console.log(`[MomentSignal] session_opened OK sessionId=${session.id}`))
          .catch(e => console.error(`[MomentSignal] session_opened FAILED sessionId=${session.id}:`, e?.message));
      } else {
        console.warn(`[MomentSignal] session_opened SKIPPED — no checkpointSystemId sessionId=${session.id}`);
      }

    // ══════════════════════════════════════════════════════════════════════
    // ██  COMPLETE — quickplay sessions                                   ██
    // ══════════════════════════════════════════════════════════════════════
    } else if (action === 'COMPLETE') {
      if (status === 'completed') {
        return json(200, { ok: true, sessionId: session.id, session, idempotent: true });
      }
      if (status !== 'in_progress') okTransition = false;
      update.status = SESSION_STATUS.COMPLETED;
      update.actualEndAt = nowIso;

      if (session.checkpointSystemId) {
        try {
          // v — utiliser VALID_DOMAINS_DYNAMIC (construit depuis StyleHierarchy au-dessus)
          const VALID_CHECKPOINT_DOMAINS = VALID_DOMAINS_DYNAMIC;

          // ── Règle canonique: domaine session = répartition des rôles réellement joués ──
          // Source de vérité: roleSystemId de chaque participant compté (pas styleSystemIds complet)
          const countedParticipants = participants.filter(p => {
            const uid = normalizeId(p?.userId);
            const rid = normalizeId(p?.roleSystemId);
            if (!uid || !rid) return false;
            if (p?.isNoShow || p?.status === 'cancelled' || p?.status === 'removed') return false;
            return true;
          });

          // Pré-charger les rôles uniques (éviter N+1)
          const uniqueRoleIds = [...new Set(countedParticipants.map(p => normalizeId(p.roleSystemId)).filter(Boolean))];
          const roleMap = {};
          for (const rid of uniqueRoleIds) {
            try {
              const roles = await serviceRole.entities.RoleHierarchy.filter({ systemId: rid });
              if (roles?.[0]) roleMap[rid] = roles[0];
            } catch (e) { /* non-fatal */ }
          }

          const domainCounts = {};
          const roleCounts = {};

          for (const p of countedParticipants) {
            const rid = normalizeId(p.roleSystemId);
            roleCounts[rid] = (roleCounts[rid] || 0) + 1;

            // Source primaire: rôle → domaine via RoleHierarchy.domainKey
            let domainKey = roleMap[rid]?.domainKey || null;

            // Fallback strict: style actif de la session uniquement (pas l'inventaire complet)
            if (!domainKey || !VALID_CHECKPOINT_DOMAINS.has(domainKey)) {
              const activeStyleId = normalizeId(p?.styleSystemId) || normalizeId(asArray(p?.styleSystemIds)[0]);
              if (activeStyleId) {
                try {
                  const styles = await serviceRole.entities.StyleHierarchy.filter({ systemId: activeStyleId });
                  if (styles?.[0]?.domainKey && VALID_CHECKPOINT_DOMAINS.has(styles[0].domainKey)) {
                    domainKey = styles[0].domainKey;
                  }
                } catch (e) { /* non-fatal */ }
              }
            }

            if (!domainKey || !VALID_CHECKPOINT_DOMAINS.has(domainKey)) continue;
            domainCounts[domainKey] = (domainCounts[domainKey] || 0) + 1;
          }

          // Calculer les poids au prorata des participants comptés
          const totalDomainCount = Object.values(domainCounts).reduce((s, v) => s + v, 0);
          const domainWeightsSnapshot = {};

          if (totalDomainCount > 0) {
            for (const [dk, count] of Object.entries(domainCounts)) {
              domainWeightsSnapshot[dk] = Math.round((count / totalDomainCount) * 10000) / 10000;
            }
          } else {
            // Fallback ultime si aucun rôle mappé
            domainWeightsSnapshot['music'] = 1.0;
          }

          const domainDominantKey = Object.entries(domainWeightsSnapshot)
            .sort((a, b) => b[1] - a[1])[0]?.[0] || null;

          // Snapshot audit sur la session
          update.roleCountsSnapshot = roleCounts;
          update.domainCountsSnapshot = domainCounts;
          update.domainWeightsSnapshot = domainWeightsSnapshot;
          update.domainDominantKey = domainDominantKey;
          update.domainKeysSnapshot = Object.keys(domainWeightsSnapshot); // compat legacy

          console.log('[transitionSession] COMPLETE domainWeightsSnapshot:', JSON.stringify(domainWeightsSnapshot));

          // Inline commitCheckpointDomainUsage via serviceRole (évite le 401 backend->backend)
          try {
            const cpId = session.checkpointSystemId;
            const sessId = session.id;
            // v — utiliser VALID_DOMAINS_DYNAMIC (construit depuis StyleHierarchy en début de handler)
            const VALID_DOMAINS_SET = VALID_DOMAINS_DYNAMIC;

            // A. Idempotence: supprimer les ledger rows existantes pour cette session
            const existingLedger = await serviceRole.entities.CheckpointDomainLedger.filter({ sessionId: sessId }).catch(() => []);
            for (const row of existingLedger) {
              await serviceRole.entities.CheckpointDomainLedger.delete(row.id).catch(() => {});
            }

            // B. Écrire 1 ligne ledger par domaine réel avec son weight exact
            for (const [dk, w] of Object.entries(domainWeightsSnapshot)) {
              if (!VALID_DOMAINS_SET.has(dk) || w <= 0) continue;
              await serviceRole.entities.CheckpointDomainLedger.create({
                checkpointSystemId: cpId,
                sessionId: sessId,
                domainKey: dk,
                weight: w,
                participantCount: countedParticipants.length,
                occurredAt: nowIso,
                timestamp: nowIso,
              }).catch(e => console.warn('[transitionSession] ledger insert failed:', e.message));
            }

            // C. Recompute CheckpointDomainStats depuis tous les ledger rows
            const allLedger = await serviceRole.entities.CheckpointDomainLedger.filter({ checkpointSystemId: cpId }).catch(() => []);
            const domainTotals = {};
            let totalLedgerWeight = 0;
            for (const row of allLedger) {
              const w = Number(row.weight) || Number(row.delta) || 1;
              if (w <= 0 || !VALID_DOMAINS_SET.has(row.domainKey)) continue;
              domainTotals[row.domainKey] = (domainTotals[row.domainKey] || 0) + w;
              totalLedgerWeight += w;
            }

            const domainRanking = Object.entries(domainTotals)
              .map(([key, total]) => ({ key, weight: totalLedgerWeight > 0 ? Math.round((total / totalLedgerWeight) * 10000) / 10000 : 0 }))
              .sort((a, b) => b.weight - a.weight);

            const domainDominantKey = domainRanking[0]?.key || null;

            // Upsert CheckpointDomainStats (1 row par domaine)
            const existingStats = await serviceRole.entities.CheckpointDomainStats.filter({ checkpointSystemId: cpId }).catch(() => []);
            for (const entry of domainRanking) {
              const sessionCount = allLedger.filter(r => r.domainKey === entry.key).length;
              const existing = existingStats.find(s => s.domainKey === entry.key);
              if (existing) {
                await serviceRole.entities.CheckpointDomainStats.update(existing.id, {
                  weight: entry.weight, countSessions: sessionCount, lastSessionAt: nowIso, updatedAt: nowIso,
                }).catch(() => {});
              } else {
                await serviceRole.entities.CheckpointDomainStats.create({
                  checkpointSystemId: cpId, domainKey: entry.key,
                  weight: entry.weight, countSessions: sessionCount, lastSessionAt: nowIso, updatedAt: nowIso,
                }).catch(() => {});
              }
            }

            // D. Sync Checkpoint.domainRanking + domainDominantKey
            const cps = await serviceRole.entities.Checkpoint.filter({ systemId: cpId }).catch(() => []);
            if (cps.length > 0) {
              await serviceRole.entities.Checkpoint.update(cps[0].id, { domainDominantKey, domainRanking }).catch(() => {});
            }

            console.log(`[transitionSession] COMPLETE domainCommit OK ${cpId} dominant=${domainDominantKey} ranking=${JSON.stringify(domainRanking)}`);
          } catch (domainCommitErr) {
            console.error('[transitionSession] domainCommit failed:', domainCommitErr.message);
          }

          // commitParticipantUsage en fire-and-forget via serviceRole (évite le timeout HTTP)
          // CRITIQUE: ne jamais await cette boucle dans le chemin principal —
          // elle peut prendre N×500ms et faire 500 toute la transition.
          const domainKeysForCommit = Object.keys(domainWeightsSnapshot);
          const sessionIdForCommit = session.id;
          const checkpointIdForCommit = session.checkpointSystemId;
          const participantsForCommit = [...participants];

          Promise.allSettled(
            participantsForCommit
              .filter(p => !!normalizeId(p?.userId))
              .map(p =>
                serviceRole.functions.invoke('commitParticipantUsage', {
                  sessionId: sessionIdForCommit,
                  checkpointSystemId: checkpointIdForCommit,
                  participant: p,
                  domainKeysSnapshot: domainKeysForCommit,
                }).catch(e => console.warn('[transitionSession] commitParticipantUsage fire-and-forget error:', e?.message))
              )
          ).catch(() => {});

        } catch (statsError) {
          console.error('commitSessionUsage failed (non-fatal):', statsError);
        }
      }

      // applySessionToStats en fire-and-forget — même raison : ne jamais bloquer la réponse HTTP
      serviceRole.functions.invoke('applySessionToStats', { sessionId: session.id })
        .catch(e => console.warn('[transitionSession] applySessionToStats fire-and-forget error:', e?.message));

      // ── LIBÉRATION DES PARTICIPANTS post-COMPLETE ─────────────────────────
      // Fire-and-forget : sans ce nettoyage, les users restent "occupés" et
      // matchmakerTick ne crée plus de nouveau match après 1-2 cycles.
      Promise.allSettled(
        participants
          .map(p => normalizeId(p?.userId))
          .filter(Boolean)
          .map(async (pUserId) => {
            try {
              const qsRows = await serviceRole.entities.UserQueueState.filter({ userId: pUserId }).catch(() => []);
              const qs = qsRows?.[0];
              if (!qs) return;
              const pointsToThisSession = qs.matchedSessionId === session.id || qs.activeSessionId === session.id;
              if (pointsToThisSession || qs.status === 'matched') {
                await serviceRole.entities.UserQueueState.update(qs.id, {
                  status: 'cancelled',
                  matchedSessionId: null,
                  activeSessionId: null,
                  matchedAt: null,
                  lastHeartbeatAt: new Date().toISOString(),
                }).catch(() => {});
                console.log(`[transitionSession] COMPLETE released userId=${pUserId}`);
              }
            } catch (e) {
              console.warn(`[transitionSession] COMPLETE release failed for ${pUserId}:`, e?.message);
            }
          })
      ).catch(() => {});

      // ── MOMENT ENGINE — signal session_confirmed ──────────────────────────
      if (session.checkpointSystemId) {
        console.log(`[MomentSignal] about to emit session_confirmed sessionId=${session.id} cpId=${session.checkpointSystemId}`);
        emitMomentSignal(serviceRole, session, 'session_confirmed')
          .then(() => console.log(`[MomentSignal] session_confirmed OK sessionId=${session.id}`))
          .catch(e => console.error(`[MomentSignal] session_confirmed FAILED sessionId=${session.id}:`, e?.message));
      } else {
        console.warn(`[MomentSignal] session_confirmed SKIPPED — no checkpointSystemId sessionId=${session.id}`);
      }

    } else if (action === 'DISPUTE') {
      const DISPUTABLE_STATES = ['completed', 'in_progress', 'aborted'];
      if (!DISPUTABLE_STATES.includes(status)) {
        return json(400, {
          ok: false,
          code: 'INVALID_TRANSITION',
          error: `Cannot dispute a session with status: ${status}. Must be completed, in_progress, or aborted.`
        });
      }
      await serviceRole.entities.Session.update(sessionId, {
        status: 'disputed',
        disputedAt: nowIso,
        disputedBy: actorUserId,
      });
      return json(200, {
        ok: true,
        status: 'disputed',
        message: 'Session marked as disputed. Admin review required.'
      });
    } else if (action === 'MARK_SOTS_SUBMITTED') {
      // Guard: disputed sessions cannot submit SOTS*
      if (status === 'disputed') {
        return jsonError(409, 'DISPUTED_SESSION', 'Cannot submit SOTS on a disputed session.');
      }
      if (status !== 'completed') okTransition = false;

      const updatedParticipants = participants.map(p =>
        normalizeId(p.userId) === actorUserId ? { ...p, sotsSubmitted: true } : p
      );
      update.participants = updatedParticipants;

      const allSubmitted = updatedParticipants.length >= 2 && updatedParticipants.every(p => p.sotsSubmitted === true);
      if (allSubmitted) {
        update.status = SESSION_STATUS.SOTS_SUBMITTED;
      }
    } else if (action === 'ARCHIVE') {
      if (status !== SESSION_STATUS.SOTS_SUBMITTED) okTransition = false;
      update.status = SESSION_STATUS.ARCHIVED;
      update.archivedAt = nowIso;
      if (session.sessionType === 'event' && session.eventId) {
        try {
          await serviceRole.entities.Event.update(session.eventId, {
            status: 'completed',
            completedAt: nowIso,
          });
        } catch (e) {
          console.warn('[transitionSession] Could not close Event on ARCHIVE:', e?.message);
        }
      }
    } else if (action === 'ABORT') {
      if (status === 'aborted') {
        return json(200, { ok: true, sessionId: session.id, session, idempotent: true });
      }
      if ([SESSION_STATUS.ARCHIVED].includes(status)) okTransition = false;
      update.status = SESSION_STATUS.ABORTED;
      update.abortedAt = nowIso;
      if (session.sessionType === 'event' && session.eventId) {
        try {
          await serviceRole.entities.Event.update(session.eventId, {
            status: 'completed',
            completedAt: nowIso,
          });
        } catch (e) {
          console.warn('[transitionSession] Could not close Event on ABORT:', e?.message);
        }
      }
    } else if (action === 'CANCEL_QUEUE' || action === 'LEAVE_LOBBY') {
      if (![SESSION_STATUS.QUEUEING, SESSION_STATUS.LOBBY, SESSION_STATUS.READY].includes(status)) okTransition = false;

      const remainingParticipants = participants.filter(p => normalizeId(p?.userId) !== actorUserId);

      if (remainingParticipants.length === 0) {
        update.status = SESSION_STATUS.ABORTED;
        update.participants = remainingParticipants;
        update.actualEndAt = nowIso;
      } else {
        update.participants = remainingParticipants;

        if (session.captainUserId === actorUserId) {
          const sortedByJoinTime = [...remainingParticipants].sort((a, b) => {
            const aTime = a.joinedAt ? new Date(a.joinedAt).getTime() : 0;
            const bTime = b.joinedAt ? new Date(b.joinedAt).getTime() : 0;
            return aTime - bTime;
          });
          const newCaptain = sortedByJoinTime[0];
          update.captainUserId = normalizeId(newCaptain?.userId) || null;
        }
      }

      try {
        const qsRows = await serviceRole.entities.UserQueueState.filter({ userId: actorUserId }).catch(() => []);
        const qs = qsRows?.[0] || null;
        if (qs) {
          await serviceRole.entities.UserQueueState.update(qs.id, {
            status: 'cancelled',
            activeSessionId: null,
            matchedSessionId: null,
            matchedAt: null,
            cancelledAt: nowIso,
            lastHeartbeatAt: nowIso,
          }).catch(() => {});
        }
        console.log(`[transitionSession] leaveLobby userId=${actorUserId} sessionId=${sessionId} remaining=${remainingParticipants.length} updatedUserQueueState=${!!qs}`);
      } catch (e) {
        console.warn(`[transitionSession] leaveLobby QueueState update failed (non-fatal): ${e.message}`);
      }
    } else if (action === 'SET_CHECKPOINT') {
      if (![SESSION_STATUS.QUEUEING, SESSION_STATUS.LOBBY].includes(status)) okTransition = false;

      if (session.lockedAt) {
        return jsonError(400, 'SESSION_LOCKED', 'Session is locked, cannot change checkpoint');
      }

      if (session.captainUserId !== actorUserId) {
        return jsonError(403, 'NOT_CAPTAIN', 'Only the captain can select checkpoint');
      }

      const { checkpointSystemId } = body;
      if (!checkpointSystemId) {
        return jsonError(400, 'MISSING_CHECKPOINT', 'checkpointSystemId required');
      }

      const checkpoints = await serviceRole.entities.Checkpoint.filter({ systemId: checkpointSystemId });
      const checkpoint = checkpoints?.[0];

      if (!checkpoint || checkpoint.isActive === false) {
        return jsonError(400, 'INVALID_CHECKPOINT', 'Checkpoint not found or inactive');
      }

      update.checkpointSystemId = checkpointSystemId;
    } else if (action === 'UPDATE_PARTICIPANT') {
      if (!['lobby', 'ready'].includes(status)) okTransition = false;

      const roleSid = normalizeId(roleSystemId);
      const styleSid = normalizeId(styleSystemId);

      const rawStyleIds = body?.styleSystemIds;
      let styleSids = [];
      if (Array.isArray(rawStyleIds)) {
        styleSids = rawStyleIds.map(normalizeId).filter(Boolean);
      }

      const updatedParticipants = participants.map((p) => {
        if (normalizeId(p.userId) === actorUserId) {
          const updated = { ...p };
          if ('roleSystemId' in body) updated.roleSystemId = roleSid;
          if ('styleSystemId' in body) updated.styleSystemId = styleSid;
          if ('styleSystemIds' in body) {
            updated.styleSystemIds = styleSids;
            if (!('styleSystemId' in body) && styleSids.length > 0) {
              updated.styleSystemId = styleSids[0];
            }
          }
          return updated;
        }
        return p;
      });
      update.participants = updatedParticipants;
    } else {
      return jsonError(400, 'BAD_REQUEST', `Action inconnue: ${action}`);
    }

    if (!okTransition) {
      return jsonError(409, 'INVALID_TRANSITION', `Transition invalide: ${status} -> ${action}`, {
        currentStatus: status,
        action
      });
    }

    if (shouldClaimHost) {
      update.hostUserId = actorUserId;
    }

    const updated = await serviceRole.entities.Session.update(session.id, update);

    if (fromStatus !== updated.status) {
      console.log(JSON.stringify({ action, from: fromStatus, to: updated.status }));
    }

    return json(200, { ok: true, sessionId: updated.id, session: updated });

  } catch (err) {
    console.error('transitionSession error:', err);
    return jsonError(500, 'TRANSITION_FAILED', err?.message || 'Erreur interne');
  }
});