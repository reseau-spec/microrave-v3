// deploy: v12
// CHANGEMENTS v12 — Fix finalPrice=0 : fallback sur rounds[last].price si currentOfferPrice absent.
//
//   PROBLÈME v11 :
//   respondToPriceProposal, action='accept':
//     const finalPrice = Number(proposal.currentOfferPrice);
//   currentOfferPrice est vide en DB sur les proposals créées avant v2 de proposePriceToTalent
//   (ou si le champ n'a pas été propagé). Number('') ou Number(undefined) = 0.
//   Conséquence en cascade:
//     - LineupPlacement.assignedPrice = 0       → Contrat affiche 0.00 $
//     - Session.slots[].placements.assignedPrice = 0 → Programme affiche 0.00 $
//     - Event.budget = 0                         → Paiement affiche 0.00 $
//
//   FIX :
//   Fallback sur rounds[last].price si currentOfferPrice est absent/vide.
//   rounds[] est toujours présent et fiable — c'est la source canonique du prix négocié.
//   Cohérent avec le fix côté frontend (LineupBoard.jsx).
//
//   Sur les sessions créées avant assignLineupSlot v6, candidates[] est vide → retourne 0.
//   respondToPriceProposal écrivait Event.budget = 0, effaçant une valeur correcte.
//   Résultat : sendPaymentRequest retournait "L'événement n'a pas de budget défini".
//
//   FIX :
//   Remplacer calcBudgetFromSlots par resolveCanonicalBudget — même logique que
//   requestBalancePayment v6 — cascade sur 3 sources :
//     PRIORITÉ 1 : LineupPlacement.filter({eventId, status:'confirmed'}) — source contractuelle
//     PRIORITÉ 2 : session.moodFilterSnapshot.lineupPlacements[isPlaced=true] — snapshot
//     PRIORITÉ 3 : session.slots[].candidates[].placements[] — format v6+
//   Si toutes retournent 0 : NE PAS écrire Event.budget (conserver la valeur existante).
//   Logger l'anomalie pour diagnostic.
//
// CHANGEMENTS v9 — 3 bugs silencieux corrigés (réponse organisateur complètement cassée) :
//
//   BUG 1 — placementKey introuvable côté organisateur :
//     La recherche utilisait actorUserId, mais le placement dans le snapshot
//     appartient toujours au TALENT. Résultat : placementKey === undefined pour toute
//     réponse organisateur → snapshot non mis à jour, assignedPrice non propagé,
//     LineupPlacement jamais upserted, budget non recalculé.
//     Fix : recherche par placementOwnerUserId = isTalent ? actorUserId : proposal.talentUserId
//     + fallback par userId+slotId pour les vieilles entrées sans proposalId dans le snapshot.
//
//   BUG 2 — proposedBy hardcodé à 'talent' dans le bloc COUNTER :
//     Quand l'organisateur contre-proposait, rounds[n].proposedBy = 'talent'.
//     Le prochain chargement interprétait que le talent avait la balle → statut divergent,
//     frontend affichait le mauvais état, négociation bloquée visuellement.
//     Fix : proposedBy = respondingAs ('organizer' ou 'talent').
//
//   BUG 3 — actorUserId utilisé comme talentUserId dans le bloc ACCEPT :
//     slots price propagation, LineupPlacement.filter, LineupPlacement.create
//     utilisaient tous actorUserId — correct quand le talent accepte, incorrect
//     quand l'organisateur accepte (actorUserId = organisateur ≠ talent).
//     Fix : talentUserIdForSlots = proposal.talentUserId partout dans le bloc ACCEPT.
//
// CHANGEMENTS v10 — Snapshot commission complet propagé dans LineupPlacement :
//   LineupPlacement devient auto-suffisant pour audit financier sans rejoindre PriceProposal.
//   Ajout dans LineupPlacement.create ET update :
//   - commissionTier          : tier actif au moment de l'acceptation
//   - commissionBaseRate      : taux brut avant modulation SOTS
//   - sotsScoreAtAcceptance   : score SOTS figé
//   - sotsModulationFactor    : facteur appliqué
//   - priceProposalId         : FK vers PriceProposal source
//   Invariant vérifiable : effectiveCommissionRate = round4(commissionBaseRate × sotsModulationFactor)
//
// CHANGEMENTS v11 — Fix Bug budget=0 (IMPLANTATION 2) :
//   PROBLÈME v10 :
//   calcBudgetFromSlots() lit session.slots[].candidates[].placements[].assignedPrice.
//   Sur les sessions créées avant assignLineupSlot v6, candidates[] est vide.
//   Résultat : newBudget = 0, et Event.budget est écrasé à 0 en DB — silencieusement.
//   Cela bloque sendPaymentRequest ("L'événement n'a pas de budget défini")
//   et requestBalancePayment (guard budget <= 0 filtre l'event).
//
//   FIX :
//   Remplacer calcBudgetFromSlots par resolveCanonicalBudget — même ordre de
//   priorité que requestBalancePayment v8 :
//     PRIORITÉ 1 : LineupPlacement.filter({eventId, status:'confirmed'}) — source contractuelle
//     PRIORITÉ 2 : session.moodFilterSnapshot.lineupPlacements[isPlaced=true] — snapshot
//     PRIORITÉ 3 : session.slots[].candidates[].placements[] — format v6+
//     PRIORITÉ 4 : event.budget DB existant — fallback final
//
//   GUARD ANTI-ÉCRASEMENT :
//   Si newBudget === 0 ET ev.budget > 0 → NE PAS écraser. Logger l'anomalie.
//   Un budget valide ne doit jamais être effacé par un recalcul basé sur des slots vides.
//
// CHANGEMENTS v8 — Organisateur peut répondre aux contre-offres du talent :
//   Guard précédent : seul le talent pouvait appeler respondToPriceProposal.
//   Corrigé : guard basé sur proposal.status + rôle de l'acteur.
//   pending_talent → talent répond | pending_organizer → organisateur répond.
//   Quand l'organisateur contre-propose → status repasse à pending_talent.
//
6
// respondToPriceProposal
//
// CHANGEMENTS v5 :
//   CommissionSnapshot figé à l'acceptation (T1 du flux financier).
//   Règle métier : le taux de commission est contractualisé au moment où
//   le talent accepte la proposition — pas au moment du payout.
//   Protège les deux parties si le tier ou le SOTS change avant le jour J.
//
//   À l'acceptation, on calcule et on stocke sur PriceProposal :
//   - commissionTier          : tier actif du talent (A/B/C/D/E)
//   - commissionBaseRate      : taux de base depuis MembershipPlan
//   - sotsScoreAtAcceptance   : sotsRecent30Score au moment de l'acceptation
//   - sotsModulationFactor    : facteur de modulation appliqué
//   - effectiveCommissionRate : taux final = baseRate × modulation
//   - commissionSnapshotAt    : horodatage du snapshot
//
//   generatePayoutSplits lira ces champs depuis PriceProposal → LineupPlacement
//   au lieu de recalculer à la volée depuis TalentProfile (risque de dérive).
//
// CHANGEMENTS v4 :
//   Budget recalcul : lecture depuis session.slots[].candidates[].placements[]
//   au lieu de moodFilterSnapshot.lineupPlacements.
//   Même source que ProgrammeView et EventLobby — garantit la cohérence
//   entre ce que l'organisateur voit et ce que le backend calcule.
//
// CHANGEMENTS v6 :
//   Correction 3 — Prix canonique propagé dans session.slots après acceptation.
//   PriceProposal.finalPrice est maintenant écrit dans
//   session.slots[].candidates[c.userId === talentUserId].placements[].assignedPrice
//   pour chaque plage concernée par la proposition.
//   Garantit que ProgrammeView, sendPaymentRequest, et EventLobby lisent
//   tous le même prix final — sans dépendre du snapshot moodFilterSnapshot.
//
// Appelé par le talent depuis son onglet Actions > Propositions de cachet.
//
// Actions possibles :
//   'accept'  → finalise la proposition, écrit finalPrice, notifie l'organisateur
//   'reject'  → refuse, retire le talent du lineup (isPlaced=false), notifie
//   'counter' → contre-propose un prix, passe status=pending_organizer, notifie
//
// CHANGEMENTS v3 :
//   Bloc ACCEPT — après mise à jour du snapshot :
//   1. Recalcule Event.budget = somme des assignedPrice de tous les placements
//      isPlaced=true dans le snapshot mis à jour.
//      Résout la divergence entre contrats acceptés et budget affiché / escrow calculé.
//   2. Upsert LineupPlacement entity en DB pour ce talent + cet event.
//      generatePayoutSplits v6 lit LineupPlacement en priorité — sans cet upsert,
//      il tombait toujours dans le fallback snapshot, exposé aux dérives futures.
//      Upsert = create si absent, update si existant (idempotent).
//
// Contrainte "1 event par plage horaire" :
//   Avant d'écrire 'accepted', vérifie que le talent n'a pas déjà un placement
//   accepted sur une plage qui chevauche targetPlageIds.

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


// ── Commission snapshot au moment de l'acceptation (v5) ─────────────────────
// Calcule et retourne le taux effectif figé pour un talent.
// Appelé UNE SEULE FOIS : à l'acceptation de la PriceProposal.
// Ce snapshot est ensuite lu par generatePayoutSplits via PriceProposal/LineupPlacement.
const COMMISSION_RATES_FALLBACK = {
  A: 0.120, B: 0.090, C: 0.060, D: 0.035, E: 0.050,
};
// ── GRILLE DE MODULATION SOTS ────────────────────────────────────────────────
// ⚠️  SYNCHRONISATION OBLIGATOIRE — Cette grille existe en 2 endroits backend :
//   1. respondToPriceProposal — T1 : acceptation du contrat (snapshot figé)
//   2. generatePayoutSplits   — T6 : génération des virements (fallback si pas de snapshot)
//
// + 1 endroit frontend :
//   3. ContractView.jsx — affichage de la ventilation dans le contrat talent
//
// Toute modification de seuil DOIT être répercutée dans les 3 endroits simultanément.
//
// Grille actuelle (mise à jour avril 2026) :
//   score ≥ 4.5 → ×0.90  (−10%, bonus fort)
//   score ≥ 4.0 → ×0.95  (−5%,  bonus)
//   score ≥ 3.5 → ×1.00  (neutre)
//   score <  3.5 → ×1.05  (+5%,  malus léger)
//   score ≤ 3.0 → ×1.10  (+10%, malus)
//   score ≤ 2.5 → ×1.15  (+15%, malus fort)
//   score ≤ 2.0 → ×1.20  (+20%, malus très fort)
//   score = 0   → ×1.00  (pas de score = pas de modulation)
function sotsModulationFactor(score) {
  if (!score || score <= 0) return 1.00;
  if (score >= 4.5) return 0.90;
  if (score >= 4.0) return 0.95;
  if (score >= 3.5) return 1.00;
  if (score <= 2.0) return 1.20;
  if (score <= 2.5) return 1.15;
  if (score <= 3.0) return 1.10;
  return 1.05;
}
async function buildCommissionSnapshot(service, talentUserId) {
  try {
    // Tier : chercher UserMembership actif
    const memberships = await service.entities.UserMembership.filter({
      userId: talentUserId, status: 'active',
    }, '-startedAt', 1).catch(() => []);
    const tier = memberships?.[0]?.tier || 'A';

    // Taux de base depuis MembershipPlan
    let baseRate = COMMISSION_RATES_FALLBACK[tier] ?? 0.120;
    try {
      const now   = new Date().toISOString();
      const plans = await service.entities.MembershipPlan.filter({ tier }).catch(() => []);
      const active = (plans || []).filter(p =>
        p.activeFrom <= now && (!p.activeTo || p.activeTo > now) && !p.isLegacy
      ).sort((a, b) => a.commissionRate - b.commissionRate);
      if (active[0]?.commissionRate != null) baseRate = active[0].commissionRate;
    } catch { /* fallback */ }

    // SOTS au moment de l'acceptation
    const profiles   = await service.entities.TalentProfile.filter({ userId: talentUserId }).catch(() => []);
    const profile    = profiles?.[0];
    const sotsScore  = Number(profile?.sotsRecent30Score || profile?.sotsGlobalScore || 0);
    const modulation = sotsModulationFactor(sotsScore);
    const effective  = Math.round(baseRate * modulation * 10000) / 10000; // 4 décimales max

    return {
      commissionTier:          tier,
      commissionBaseRate:      baseRate,
      sotsScoreAtAcceptance:   sotsScore,
      sotsModulationFactor:    modulation,
      effectiveCommissionRate: effective,
      commissionSnapshotAt:    new Date().toISOString(),
    };
  } catch (err) {
    console.warn('[buildCommissionSnapshot] failed, using fallback:', err?.message);
    return {
      commissionTier:          'A',
      commissionBaseRate:      0.120,
      sotsScoreAtAcceptance:   0,
      sotsModulationFactor:    1.0,
      effectiveCommissionRate: 0.120,
      commissionSnapshotAt:    new Date().toISOString(),
    };
  }
}

// ── v11 : resolveCanonicalBudget — source de vérité budget ──────────────────
// Cascade stricte, identique à requestBalancePayment v6 :
//   PRIORITÉ 1 : LineupPlacement.filter({eventId, status:'confirmed'}) sum(assignedPrice)
//   PRIORITÉ 2 : session.moodFilterSnapshot.lineupPlacements[isPlaced=true] sum(assignedPrice)
//   PRIORITÉ 3 : session.slots[].candidates[].placements[] sum(assignedPrice) (format v6+)
//
// RÈGLE CRITIQUE : la fonction resolveCanonicalBudget est définie localement dans le handler
// pour accéder à `service` via closure. Voir définition dans Deno.serve() ci-dessous.

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user   = await base44.auth.me().catch(() => null);
    if (!user) return jsonError(401, 'UNAUTHORIZED', 'Non authentifié');

    const actorUserId = normalizeId(user.id);
    const service     = base44.asServiceRole;

    const {
      proposalId,
      action,          // 'accept' | 'reject' | 'counter'
      counterPrice,    // number — requis si action='counter'
      counterNote,     // string | null
      styleSystemIds,  // v11 — styles sélectionnés par le talent à l'acceptation (optionnel)
    } = await req.json();

    if (!proposalId || !action) {
      return jsonError(400, 'MISSING_PARAMS', 'proposalId et action sont requis');
    }
    if (!['accept', 'reject', 'counter'].includes(action)) {
      return jsonError(400, 'INVALID_ACTION', 'action doit être accept, reject ou counter');
    }
    if (action === 'counter' && (counterPrice == null || isNaN(Number(counterPrice)))) {
      return jsonError(400, 'COUNTER_PRICE_REQUIRED', 'counterPrice requis pour une contre-proposition');
    }

    // ── 1. Charger la PriceProposal ───────────────────────────────────────────
    const proposalRows = await service.entities.PriceProposal.filter({ id: proposalId }).catch(() => []);
    const proposal     = proposalRows?.[0];
    if (!proposal) return jsonError(404, 'PROPOSAL_NOT_FOUND', 'Proposition introuvable');

    // Guard rôle-statut : qui peut répondre selon le tour de jeu
    // pending_talent    → seul le talent peut répondre
    // pending_organizer → seul l'organisateur peut répondre
    const isTalent    = normalizeId(proposal.talentUserId)    === actorUserId;
    const isOrganizer = normalizeId(proposal.organizerUserId) === actorUserId;

    if (proposal.status === 'pending_talent' && !isTalent) {
      return jsonError(403, 'NOT_TALENT', "C'est au talent de répondre à cette proposition.");
    }
    if (proposal.status === 'pending_organizer' && !isOrganizer) {
      return jsonError(403, 'NOT_ORGANIZER', "C'est à l'organisateur de répondre à cette contre-offre.");
    }
    if (!['pending_talent', 'pending_organizer'].includes(proposal.status)) {
      return jsonError(409, 'WRONG_STATUS', `Cette proposition est déjà "${proposal.status}" — impossible de répondre`);
    }

    const nowIso      = new Date().toISOString();
    const rounds      = Array.isArray(proposal.rounds) ? [...proposal.rounds] : [];
    const lastIdx     = rounds.length - 1;
    const respondingAs = isTalent ? 'talent' : 'organizer';

    if (lastIdx >= 0) {
      rounds[lastIdx] = {
        ...rounds[lastIdx],
        status:      action === 'accept' ? 'accepted' : action === 'reject' ? 'rejected' : 'countered',
        respondedAt: nowIso,
        // v11 — styles validés par le talent lors de l'acceptation (mis à jour sur le round)
        ...(action === 'accept' && Array.isArray(styleSystemIds) && styleSystemIds.length > 0
          ? { styleSystemIds }
          : {}),
      };
    }

    // ── 2. Charger la session pour lire/écrire les placements ─────────────────
    const sessions = await service.entities.Session.filter({ id: proposal.sessionId }).catch(() => []);
    const session  = sessions?.[0];
    if (!session) return jsonError(404, 'SESSION_NOT_FOUND', 'Session introuvable');

    const snap       = session.moodFilterSnapshot || {};
    const placements = { ...(snap.lineupPlacements || {}) };

    // ── Budget recalcul (v11) — resolveCanonicalBudget ───────────────────────
    // Ordre de priorité :
    //   1. LineupPlacement DB (source contractuelle immuable)
    //   2. moodFilterSnapshot.lineupPlacements (snapshot opérationnel)
    //   3. session.slots[].candidates[].placements[] (format v6+ uniquement)
    //   4. event.budget DB existant (fallback final)
    //
    // Guard : ne JAMAIS écrire budget=0 si ev.budget > 0.
    // Les sessions en ancien format (candidates=[]) retourneraient 0 depuis les slots
    // et écriraient un budget nul en DB, bloquant sendPaymentRequest et requestBalancePayment.
    async function resolveCanonicalBudget(sess, eventId, existingBudget) {
      let canonicalBudget = 0;
      let budgetSource    = 'none';

      // PRIORITÉ 1 : LineupPlacement DB (contractuel, le plus fiable)
      try {
        const lps = await service.entities.LineupPlacement.filter({
          eventId,
          status: 'confirmed',
        }).catch(() => []);
        const lpBudget = (lps || []).reduce((sum, lp) => sum + (Number(lp.assignedPrice) || 0), 0);
        if (lpBudget > 0) {
          canonicalBudget = lpBudget;
          budgetSource    = 'lineup_placement_db';
        }
      } catch { /* fallback */ }

      // PRIORITÉ 2 : moodFilterSnapshot.lineupPlacements (sessions pré-v6)
      if (canonicalBudget === 0) {
        const snapPlacements = sess?.moodFilterSnapshot?.lineupPlacements || {};
        const snapBudget = Object.values(snapPlacements)
          .filter(p => p?.isPlaced === true && p?.assignedPrice != null)
          .reduce((sum, p) => sum + Number(p.assignedPrice), 0);
        if (snapBudget > 0) {
          canonicalBudget = snapBudget;
          budgetSource    = 'snapshot_lineupPlacements';
        }
      }

      // PRIORITÉ 3 : session.slots (format v6+)
      if (canonicalBudget === 0) {
        const slotsBudget = (sess?.slots || [])
          .flatMap(sl => (sl.candidates || []))
          .flatMap(c  => (c.placements  || []))
          .reduce((sum, p) => sum + (Number(p.assignedPrice) || 0), 0);
        if (slotsBudget > 0) {
          canonicalBudget = slotsBudget;
          budgetSource    = 'session_slots';
        }
      }

      // PRIORITÉ 4 : event.budget DB (fallback final — ne jamais écraser si > 0)
      if (canonicalBudget === 0 && existingBudget > 0) {
        canonicalBudget = existingBudget;
        budgetSource    = 'event_budget_db_preserved';
      }

      return { budget: canonicalBudget, source: budgetSource };
    }


    // Fix v9 — le placement dans le snapshot appartient TOUJOURS au talent,
    // même quand c'est l'organisateur qui répond. L'ancienne version cherchait
    // actorUserId, donc placementKey était undefined pour toute réponse organisateur
    // → snapshot jamais mis à jour → budget/assignedPrice non propagés.
    const placementOwnerUserId = isTalent ? actorUserId : normalizeId(proposal.talentUserId);
    const placementKey = Object.keys(placements).find(k => {
      const p = placements[k];
      return normalizeId(p?.userId) === placementOwnerUserId
        && normalizeId(p?.proposalId) === proposalId;
    }) ?? Object.keys(placements).find(k => {
      // Fallback : proposalId absent du snapshot (vieilles entrées) → matcher par userId + slotId
      const p = placements[k];
      return normalizeId(p?.userId) === placementOwnerUserId
        && (p?.slotId === proposal.slotId || !p?.slotId);
    });

    // ── 3. ACCEPT ─────────────────────────────────────────────────────────────
    if (action === 'accept') {
      // Fallback sur rounds[last].price si currentOfferPrice est absent.
      // currentOfferPrice peut être vide sur les proposals créées avant la v2 de
      // proposePriceToTalent, ou si le champ n'a pas été propagé correctement.
      // rounds[last] est TOUJOURS présent et fiable — c'est la source canonique du prix.
      // Même logique que le fallback dans LineupBoard.jsx (fix côté frontend).
      const lastRoundPrice = rounds.length > 0 ? rounds[rounds.length - 1]?.price : null;
      const finalPrice = Number(
        proposal.currentOfferPrice ?? lastRoundPrice ?? 0
      );

      // ── Détection de conflit horaire ─────────────────────────────────────
      const targetPlageIds = Array.isArray(proposal.targetPlageIds) ? proposal.targetPlageIds : [];
      if (targetPlageIds.length > 0) {
        const currentSnap     = session.moodFilterSnapshot || {};
        const lineupSchedule  = Array.isArray(currentSnap.lineupSchedule) ? currentSnap.lineupSchedule : [];

        const targetWindows = targetPlageIds
          .map(pid => lineupSchedule.find(p => p?.plageId === pid))
          .filter(p => p?.timeStart && p?.timeEnd)
          .map(p => ({
            startMs: new Date(p.timeStart).getTime(),
            endMs:   new Date(p.timeEnd).getTime(),
          }))
          .filter(w => !isNaN(w.startMs) && !isNaN(w.endMs) && w.endMs > w.startMs);

        if (targetWindows.length > 0) {
          const allSessions = await service.entities.Session.filter({
            sessionType: 'event',
            status: { $in: ['lobby', 'in_progress'] },
          }).catch(() => []);

          for (const otherSession of (allSessions || [])) {
            if (normalizeId(otherSession.id) === normalizeId(session.id)) continue;

            const otherSnap     = otherSession.moodFilterSnapshot || {};
            const otherPls      = otherSnap.lineupPlacements || {};
            const otherSchedule = Array.isArray(otherSnap.lineupSchedule) ? otherSnap.lineupSchedule : [];

            for (const otherPlacement of Object.values(otherPls)) {
              const op = otherPlacement;
              if (
                normalizeId(op?.userId) !== placementOwnerUserId ||  // Fix v9 — vérifier conflits du TALENT
                op?.isPlaced !== true ||
                !['accepted', null, undefined].includes(op?.proposalStatus)
              ) continue;

              const otherPlage = otherSchedule.find(p => p?.plageId === op?.plageId);
              if (!otherPlage?.timeStart || !otherPlage?.timeEnd) continue;

              const otherStartMs = new Date(otherPlage.timeStart).getTime();
              const otherEndMs   = new Date(otherPlage.timeEnd).getTime();
              if (isNaN(otherStartMs) || isNaN(otherEndMs)) continue;

              const hasOverlap = targetWindows.some(tw =>
                tw.startMs < otherEndMs && tw.endMs > otherStartMs
              );

              if (hasOverlap) {
                let conflictTitle = 'un autre événement';
                if (otherSession.eventId) {
                  const confEv = await service.entities.Event.filter({ id: otherSession.eventId }).catch(() => []);
                  if (confEv?.[0]?.title) conflictTitle = confEv[0].title;
                }
                return jsonError(409, 'CONFLICT_SCHEDULE',
                  `Conflit horaire avec « ${conflictTitle} » — les plages se chevauchent`,
                  { conflictEventTitle: conflictTitle, conflictSessionId: otherSession.id }
                );
              }
            }
          }
        }
      }

      // ── Mettre à jour le placement dans le snapshot ───────────────────────
      if (placementKey) {
        placements[placementKey] = {
          ...placements[placementKey],
          assignedPrice:  finalPrice,
          proposalStatus: 'accepted',
        };
      }

      // ── Finaliser la PriceProposal ────────────────────────────────────────
      // ── v5 : CommissionSnapshot figé à l'acceptation ────────────────────
      // Le taux de commission est contractualisé maintenant — jamais recalculé après.
      const talentIdForSnapshot = respondingAs === 'talent' ? actorUserId : normalizeId(proposal.talentUserId);
      const commissionSnapshot = await buildCommissionSnapshot(service, talentIdForSnapshot);

      await service.entities.PriceProposal.update(proposalId, {
        status:      'accepted',
        finalStatus: 'accepted',
        finalPrice,
        rounds,
        updatedAt:   nowIso,
        finalizedAt: nowIso,
        // CommissionSnapshot — figé ici, lu par generatePayoutSplits
        commissionTier:          commissionSnapshot.commissionTier,
        commissionBaseRate:      commissionSnapshot.commissionBaseRate,
        sotsScoreAtAcceptance:   commissionSnapshot.sotsScoreAtAcceptance,
        sotsModulationFactor:    commissionSnapshot.sotsModulationFactor,
        effectiveCommissionRate: commissionSnapshot.effectiveCommissionRate,
        commissionSnapshotAt:    commissionSnapshot.commissionSnapshotAt,
      });

      // ── Écrire le snapshot mis à jour ─────────────────────────────────────
      await service.entities.Session.update(proposal.sessionId, {
        moodFilterSnapshot: {
          ...snap,
          lineupPlacements: placements,
          // v-fix : préserver lineupScenes/lineupSchedule — ne jamais les effacer
          ...(Array.isArray(snap.lineupScenes)   && snap.lineupScenes.length   > 0 ? { lineupScenes:   snap.lineupScenes }   : {}),
          ...(Array.isArray(snap.lineupSchedule) && snap.lineupSchedule.length > 0 ? { lineupSchedule: snap.lineupSchedule } : {}),
        },
      });

      // ── Correction 3 (v6) : Propager finalPrice dans session.slots ─────────
      // ProgrammeView lit session.slots[].candidates[].placements[].assignedPrice.
      // Si ce champ n'est pas mis à jour après l'acceptation, ProgrammeView continue
      // d'afficher l'ancien prix calculé (taux horaire) au lieu du prix accepté.
      // On met à jour les placements de ce talent sur ces plages dans session.slots.
      const targetPlageIdsForProp = Array.isArray(proposal.targetPlageIds) ? proposal.targetPlageIds : [];
      // Fix v9 — actorUserId est l'organisateur quand il accepte une contre-offre.
      // La propagation du prix doit cibler le TALENT, pas l'acteur courant.
      const talentUserIdForSlots = normalizeId(proposal.talentUserId);
      const updatedSlots = (session.slots || []).map(sl => {
        const updatedCandidates = (sl.candidates || []).map(c => {
          if (normalizeId(c.userId) !== talentUserIdForSlots) return c;
          const updatedPlacements = (c.placements || []).map(p => {
            if (targetPlageIdsForProp.length > 0 && !targetPlageIdsForProp.includes(p.plageId)) return p;
            return { ...p, assignedPrice: finalPrice };
          });
          // Si ce candidat n'avait pas encore de placements dans slots[], en créer un minimal
          const hasAnyPlacement = updatedPlacements.length > 0;
          return {
            ...c,
            placements: hasAnyPlacement ? updatedPlacements : c.placements,
            assignedPrice: finalPrice,
          };
        });
        return { ...sl, candidates: updatedCandidates };
      });

      await service.entities.Session.update(proposal.sessionId, {
        slots: updatedSlots,
      }).catch(e => console.warn('[respondToPriceProposal] session.slots price propagation failed:', e?.message));

      console.log(`[respondToPriceProposal] v9 SLOTS_PRICE_PROPAGATED talentUserId=${talentUserIdForSlots} actorUserId=${actorUserId} finalPrice=${finalPrice} plages=${targetPlageIdsForProp.join(',')}`);

      // ── v11 : Recalculer Event.budget — cascade LP → snapshot → slots ────────
      // RÈGLE : ne jamais écrire budget=0. Si toutes sources = 0, conserver la valeur DB.
      // Corrige le bug où calcBudgetFromSlots retournait 0 sur sessions ancien format
      // (candidates[] vide) et écrasait un budget valide.
      if (session.eventId) {
        const evRows = await service.entities.Event.filter({ id: session.eventId }).catch(() => []);
        const ev = evRows?.[0];
        if (ev) {
          // Re-fetch session pour avoir slots à jour après l'écriture snapshot ET slots
          const sessRefresh = (await service.entities.Session.filter({ id: proposal.sessionId }).catch(() => []))?.[0];
          const resolved = await resolveCanonicalBudget(sessRefresh || session, session.eventId, Number(ev.budget) || 0);

          if (resolved && resolved.budget > 0) {
            await service.entities.Event.update(session.eventId, {
              budget:              resolved.budget,
              pendingProposalCount: Math.max(0, (Number(ev.pendingProposalCount) || 0) - 1),
            }).catch(e => console.warn('[respondToPriceProposal] Event.budget update failed:', e?.message));
            console.log(`[respondToPriceProposal] v11 BUDGET_RECALCULATED eventId=${session.eventId} budget=${resolved.budget} source=${resolved.source}`);
          } else {
            // Budget introuvable dans toutes les sources — conserver la valeur DB, ne pas écrire 0
            await service.entities.Event.update(session.eventId, {
              pendingProposalCount: Math.max(0, (Number(ev.pendingProposalCount) || 0) - 1),
            }).catch(() => {});
            console.warn(`[respondToPriceProposal] v11 BUDGET_UNRESOLVED eventId=${session.eventId} — toutes sources=0, budget DB conservé (${ev.budget})`);
          }
        }
      }

      // ── BUG #3 FIX — Partie 2 : Upsert LineupPlacement entity en DB ──────
      // generatePayoutSplits v6 lit LineupPlacement en priorité sur le snapshot.
      // Sans cet upsert, l'entité LineupPlacement n'existe jamais → fallback snapshot permanent.
      // On cherche un LineupPlacement existant pour ce talent + cet event + ce slot,
      // on met à jour son assignedPrice. Sinon on en crée un.
      if (session.eventId && placementKey) {
        try {
          const currentPlacement = placements[placementKey];
          const slotId   = currentPlacement?.slotId   || proposal.slotId   || null;
          const roleId   = currentPlacement?.roleSystemId || proposal.roleSystemId || null;
          const sceneId  = currentPlacement?.sceneId  || proposal.targetSceneId || null;
          const plageId  = currentPlacement?.plageId  || (Array.isArray(proposal.targetPlageIds) ? proposal.targetPlageIds[0] : null) || null;

          // Résoudre les horaires de plage depuis le schedule
          const schedule = Array.isArray(snap.lineupSchedule) ? snap.lineupSchedule : [];
          const plageData = plageId ? schedule.find(s => s?.plageId === plageId) : null;

          // Chercher un LineupPlacement existant pour cet event + talent + slot
          // Fix v9 — actorUserId peut être l'organisateur → chercher par talentUserId
          const talentUserIdForLp = normalizeId(proposal.talentUserId);
          const existing = await service.entities.LineupPlacement.filter({
            eventId: session.eventId,
            userId:  talentUserIdForLp,
          }).catch(() => []);

          // Filtrer par slotId si disponible
          const match = slotId
            ? (existing || []).find(lp => lp.slotId === slotId)
            : (existing || [])[0];

          if (match) {
            // Mettre à jour le prix sur l'enregistrement existant
            await service.entities.LineupPlacement.update(match.id, {
              assignedPrice:           finalPrice,
              status:                  'confirmed',
              // v10 — Snapshot contractuel complet : LineupPlacement auto-suffisant pour audit
              effectiveCommissionRate: commissionSnapshot.effectiveCommissionRate,
              commissionSnapshotAt:    commissionSnapshot.commissionSnapshotAt,
              commissionTier:          commissionSnapshot.commissionTier,
              commissionBaseRate:      commissionSnapshot.commissionBaseRate,
              sotsScoreAtAcceptance:   commissionSnapshot.sotsScoreAtAcceptance,
              sotsModulationFactor:    commissionSnapshot.sotsModulationFactor,
              priceProposalId:         proposalId,
              // v11 — Styles sélectionnés par le talent à l'acceptation
              ...(Array.isArray(styleSystemIds) && styleSystemIds.length > 0
                ? { styleSystemIds }
                : {}),
            }).catch(e => console.warn('[respondToPriceProposal] LineupPlacement.update failed:', e?.message));
            console.log(`[respondToPriceProposal] v10 LINEUP_PLACEMENT_UPDATED id=${match.id} assignedPrice=${finalPrice} tier=${commissionSnapshot.commissionTier} rate=${commissionSnapshot.effectiveCommissionRate}`);
          } else {
            // Créer un nouvel enregistrement
            await service.entities.LineupPlacement.create({
              eventId:      session.eventId,
              sessionId:    proposal.sessionId,
              userId:       talentUserIdForLp,  // Fix v9 — toujours le talent
              roleId:       roleId || '',
              slotId:       slotId || placementKey,
              sceneId:      sceneId || null,
              assignedPrice:           finalPrice,
              status:                  'confirmed',
              // v10 — Snapshot contractuel complet : LineupPlacement auto-suffisant pour audit
              effectiveCommissionRate: commissionSnapshot.effectiveCommissionRate,
              commissionSnapshotAt:    commissionSnapshot.commissionSnapshotAt,
              commissionTier:          commissionSnapshot.commissionTier,
              commissionBaseRate:      commissionSnapshot.commissionBaseRate,
              sotsScoreAtAcceptance:   commissionSnapshot.sotsScoreAtAcceptance,
              sotsModulationFactor:    commissionSnapshot.sotsModulationFactor,
              priceProposalId:         proposalId,
              // v11 — Styles sélectionnés par le talent à l'acceptation
              ...(Array.isArray(styleSystemIds) && styleSystemIds.length > 0
                ? { styleSystemIds }
                : {}),
              confirmedAt:  nowIso,
              plageLabel:   plageData?.label || null,
              plageStartAt: plageData?.timeStart || null,
              plageEndAt:   plageData?.timeEnd   || null,
            }).catch(e => console.warn('[respondToPriceProposal] LineupPlacement.create failed:', e?.message));
            console.log(`[respondToPriceProposal] v10 LINEUP_PLACEMENT_CREATED eventId=${session.eventId} userId=${talentUserIdForLp} actorUserId=${actorUserId} assignedPrice=${finalPrice} tier=${commissionSnapshot.commissionTier} rate=${commissionSnapshot.effectiveCommissionRate} snapshotAt=${commissionSnapshot.commissionSnapshotAt}`);
          }
        } catch (e) {
          // Non-fatal : le fallback snapshot dans generatePayoutSplits couvre ce cas
          console.warn('[respondToPriceProposal] LineupPlacement upsert failed (non-fatal):', e?.message);
        }
      }

      await notifyOrganizer(service, session, proposal, actorUserId, 'accepted', finalPrice, null, nowIso);
      return json(200, { ok: true, action: 'accepted', finalPrice });
    }

    // ── 4. REJECT ─────────────────────────────────────────────────────────────
    if (action === 'reject') {
      if (placementKey) {
        placements[placementKey] = {
          ...placements[placementKey],
          isPlaced:       false,
          proposalStatus: 'rejected',
        };
      }

      await service.entities.PriceProposal.update(proposalId, {
        status:      'rejected',
        finalStatus: 'rejected',
        rounds,
        updatedAt:   nowIso,
        finalizedAt: nowIso,
      });

      await service.entities.Session.update(proposal.sessionId, {
        moodFilterSnapshot: {
          ...snap,
          lineupPlacements: placements,
          // v-fix : préserver lineupScenes/lineupSchedule — ne jamais les effacer
          ...(Array.isArray(snap.lineupScenes)   && snap.lineupScenes.length   > 0 ? { lineupScenes:   snap.lineupScenes }   : {}),
          ...(Array.isArray(snap.lineupSchedule) && snap.lineupSchedule.length > 0 ? { lineupSchedule: snap.lineupSchedule } : {}),
        },
      });

      // v11 : Recalculer Event.budget après rejet — cascade LP → snapshot → slots
      // RÈGLE : ne jamais écrire budget=0 si toutes sources = 0
      if (session.eventId) {
        try {
          const evRows = await service.entities.Event.filter({ id: session.eventId }).catch(() => []);
          const ev = evRows?.[0];
          if (ev) {
            const sessRefresh2 = (await service.entities.Session.filter({ id: proposal.sessionId }).catch(() => []))?.[0];
            const resolved = await resolveCanonicalBudget(sessRefresh2 || session, session.eventId, Number(ev.budget) || 0);

            if (resolved && resolved.budget > 0) {
              await service.entities.Event.update(session.eventId, {
                budget:              resolved.budget,
                pendingProposalCount: Math.max(0, (Number(ev.pendingProposalCount) || 0) - 1),
              }).catch(() => {});
              console.log(`[respondToPriceProposal] v11 BUDGET_RECALCULATED_ON_REJECT eventId=${session.eventId} budget=${resolved.budget} source=${resolved.source}`);
            } else {
              await service.entities.Event.update(session.eventId, {
                pendingProposalCount: Math.max(0, (Number(ev.pendingProposalCount) || 0) - 1),
              }).catch(() => {});
              console.warn(`[respondToPriceProposal] v11 BUDGET_UNRESOLVED_ON_REJECT eventId=${session.eventId} — budget DB conservé (${ev.budget})`);
            }
          }
        } catch (e) {
          console.warn('[respondToPriceProposal] budget recalc on reject failed:', e?.message);
        }
      }

      await notifyOrganizer(service, session, proposal, actorUserId, 'rejected', null, counterNote, nowIso);
      return json(200, { ok: true, action: 'rejected' });
    }

    // ── 5. COUNTER ────────────────────────────────────────────────────────────
    if (action === 'counter') {
      const counterPriceNum = Math.round(Number(counterPrice) * 100) / 100;
      const expiresAt       = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();

      rounds.push({
        roundIndex:  rounds.length,
        proposedBy:  respondingAs,
        price:       counterPriceNum,
        isGratuit:   counterPriceNum === 0,
        message:     counterNote || '',
        status:      'pending',
        createdAt:   nowIso,
        respondedAt: null,
        expiresAt,
        // v11 — styles proposés dans ce round
        styleSystemIds: Array.isArray(styleSystemIds) && styleSystemIds.length > 0
          ? styleSystemIds
          : [],
      });

      if (placementKey) {
        placements[placementKey] = {
          ...placements[placementKey],
          proposalStatus:    respondingAs === 'organizer' ? 'pending_talent' : 'pending_organizer',
          talentCounterPrice: counterPriceNum,
          talentResponseNote: counterNote || null,
        };
      }

      await service.entities.PriceProposal.update(proposalId, {
        status:           respondingAs === 'organizer' ? 'pending_talent' : 'pending_organizer',
        currentOfferPrice: counterPriceNum,
        isGratuit:        counterPriceNum === 0,
        rounds,
        updatedAt:        nowIso,
        expiresAt,
        // v11 — styles mis à jour dans la contre-offre (organisateur OU talent)
        ...(Array.isArray(styleSystemIds) && styleSystemIds.length > 0
          ? { styleSystemIds }
          : {}),
      });

      await service.entities.Session.update(proposal.sessionId, {
        moodFilterSnapshot: {
          ...snap,
          lineupPlacements: placements,
          // v-fix : préserver lineupScenes/lineupSchedule — ne jamais les effacer
          ...(Array.isArray(snap.lineupScenes)   && snap.lineupScenes.length   > 0 ? { lineupScenes:   snap.lineupScenes }   : {}),
          ...(Array.isArray(snap.lineupSchedule) && snap.lineupSchedule.length > 0 ? { lineupSchedule: snap.lineupSchedule } : {}),
        },
      });

      await notifyOrganizer(service, session, proposal, actorUserId, 'countered', counterPriceNum, counterNote, nowIso);
      return json(200, { ok: true, action: 'countered', counterPrice: counterPriceNum });
    }

    return jsonError(400, 'INVALID_ACTION', 'Action non reconnue');

  } catch (err) {
    console.error('[respondToPriceProposal]', err?.message);
    return json(500, { ok: false, error: err?.message });
  }
});

// ── Notification organisateur ─────────────────────────────────────────────────
async function notifyOrganizer(service, session, proposal, talentUserId, eventType, price, note, nowIso) {
  try {
    const organizerUserId = normalizeId(proposal.organizerUserId);
    if (!organizerUserId) return;

    const [orgUsers, talentUsers, evRows] = await Promise.all([
      service.entities.User.filter({ id: organizerUserId }).catch(() => []),
      service.entities.User.filter({ id: talentUserId }).catch(() => []),
      session.eventId
        ? service.entities.Event.filter({ id: session.eventId }).catch(() => [])
        : Promise.resolve([]),
    ]);

    const orgUser    = orgUsers?.[0];
    const talentUser = talentUsers?.[0];
    const eventData  = evRows?.[0];
    const talentName = talentUser?.displayName || 'Le talent';
    const eventTitle = eventData?.title || 'votre événement';

    if (!orgUser?.email) return;

    const profileUrl = `${Deno.env.get('VITE_APP_URL') || 'https://microrave.ca'}/EventLobby?eventId=${session.eventId}&tab=lineup`;

    let subject = '';
    let body    = '';

    if (eventType === 'accepted') {
      subject = `✅ ${talentName} a accepté votre proposition — ${eventTitle}`;
      body    = `Bonjour,\n\n${talentName} a accepté votre proposition de cachet de ${price} $ CAD pour « ${eventTitle} ».\n\nIl/elle est maintenant confirmé(e) dans le programme.\n\n→ Voir le programme : ${profileUrl}\n\nMicro Rave`;
    } else if (eventType === 'rejected') {
      subject = `❌ ${talentName} a refusé votre proposition — ${eventTitle}`;
      body    = `Bonjour,\n\n${talentName} a refusé votre proposition pour « ${eventTitle} ».\n\nVous pouvez lui soumettre une meilleure offre depuis le Lineup Board, ou choisir un autre talent.\n\n→ Ouvrir le Lineup Board : ${profileUrl}\n\nMicro Rave`;
    } else if (eventType === 'countered') {
      subject = `💬 ${talentName} contre-propose ${price} $ — ${eventTitle}`;
      body    = `Bonjour,\n\n${talentName} vous propose un cachet de ${price} $ CAD pour « ${eventTitle} ».\n\n${note ? `Message : "${note}"\n\n` : ''}Vous avez 72h pour accepter ou faire une nouvelle offre.\n\n→ Répondre depuis le Lineup Board : ${profileUrl}\n\nMicro Rave`;
    }

    await service.integrations.Core.SendEmail({
      to:        orgUser.email,
      subject,
      from_name: 'Micro Rave',
      body,
    });
  } catch (e) {
    console.warn('[respondToPriceProposal] notifyOrganizer failed:', e?.message);
  }
}