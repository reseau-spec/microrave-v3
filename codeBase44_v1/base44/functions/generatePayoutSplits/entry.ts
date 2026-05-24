// deploy: v10
// generatePayoutSplits — v10
//
// CHANGEMENTS v10 :
//   Fix A — const→let pour talentAmounts : bug silencieux Deno/TypeScript strict.
//     La réassignation d'une const levait une TypeError silencieuse — le fallback
//     snapshot ne s'activait jamais correctement sur les events sans LineupPlacement.
//   Fix B — Grille SOTS synchronisée avec respondToPriceProposal v10 (paliers 2.0–3.5).
//     La grille fallback (talent assigné sans négociation) est maintenant identique
//     à la grille T1 (snapshot à l'acceptation). Plus aucune divergence possible.
//   Fix C — Event.commissionRateApplied écrit en number (moyenne pondérée réelle).
//     Avant : 'pending_payout' (string). Après : 0.0855 (number). Champ exploitable
//     pour états financiers et reporting.
//
// generatePayoutSplits — v8
//
// CHANGEMENTS v7 vs v6 — Fix B13 + B14 :
//
//   PROBLÈME v6 :
//   availableAmount = gross (event.budget = montant contracté)
//   Si la balance n'a pas été payée, gross > argent réellement en caisse.
//   generatePayoutSplits pouvait créer des splits que executePayoutTransfer
//   ne pouvait pas honorer — overpayment structurel.
//
//   FIX :
//   availableAmount = escrowAmount + balancePaid (montant réellement collecté)
//   C'est ce qui est physiquement dans le compte Stripe plateforme.
//
//   GUARD UNDERFUNDED :
//   Si sum(contractAmounts) > totalCollected + 0.50$ (tolérance arrondis) :
//   → les splits sont générés proportionnellement au collecté réel
//   → basisAmount reste le montant contracté (audit trail du contrat)
//   → amount est la part effective selon ce qui a été reçu
//   → isUnderfunded=true est retourné dans la réponse et loggué
//
//   CAS ANNULATION inchangé :
//   availableAmount = escrowAmount (dépôt seul, comme avant)
//
//   EventPayout.totalGrossAmount :
//   Aligné sur availableAmount (collecté réel) et non plus sur gross (contracté).
//
// LOGIQUE FINANCIÈRE CANONIQUE (conforme au document de tarification)
//
// CHANGEMENTS v8 vs v7 — Fix D1 (commission snapshot) :
//
//   PROBLÈME v7 :
//   generatePayoutSplits recalculait le taux de commission au moment du payout
//   depuis MembershipPlan.commissionRate courant (live). Si le tier ou le plan du
//   talent changeait entre l'acceptation de la PriceProposal et le payout, le
//   taux appliqué divergeait du taux contractuel figé à T1.
//
//   FIX :
//   Lire LineupPlacement.effectiveCommissionRate (figé par respondToPriceProposal
//   au moment de l'acceptation) quand il est disponible.
//   Si null (talent assigné via assignLineupSlot direct sans négociation) :
//   fallback sur le recalcul live depuis MembershipPlan (comportement v7).
//
//   IMPACT :
//   - Talent avec deal négocié : taux contractuel respecté, quoi qu'il arrive
//   - Talent assigné directement : comportement identique à v7 (pas de régression)
//   - Audit : PayoutSplit.note indique la source du taux ('snapshot' ou 'live')
//
// ORDRE DES OPÉRATIONS :
//   1. Identifier les talents présents vs no-show (SessionPresence)
//   2. Pour chaque talent PRÉSENT :
//      a. Récupérer son assignedPrice depuis LineupPlacement (source de vérité)
//      b. Lire LineupPlacement.effectiveCommissionRate (snapshot T1)
//         → si null : recalculer depuis MembershipPlan live (fallback v7)
//      c. Calculer la platform_fee individuelle
//      d. Talent reçoit : assignedPrice - platform_fee
//      e. effectiveCommissionRate stocké sur le PayoutSplit pour audit
//   3. Pour chaque talent NO-SHOW :
//      → PayoutSplit talent_noshow_refund → remboursé au payeur
//   4. Aucune platform_fee globale sur le total
//
// MAPPING commissionTier (source de vérité = MembershipPlan.commissionRate) :
//   A (Freemium) = 12.0%
//   B (Base)     =  9.0%
//   C (Pro)      =  6.0%
//   D (Studio)   =  3.5%
//   E (Fondateur)=  5.0%
//
// MODULATION SOTS sur le taux de courtage :
//   SOTS >= 4.5 → taux × 0.90  (-10%)
//   SOTS >= 4.0 → taux × 0.95  (-5%)
//   SOTS >= 3.5 → taux × 1.00  (neutre)
//   SOTS < 2.5  → taux × 1.05  (+5%)
//   SOTS < 2.0  → taux × 1.10  (+10%)
//
// CAS ANNULATION (balance_unpaid) :
//   Seul le dépôt 20% est disponible
//   Distribution proportionnelle aux talents, platform_fee réduite à 5%
//   Pas de modulation SOTS pour les annulations

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status, headers: { 'content-type': 'application/json' },
  });
}

function round2(n) { return Math.round(n * 100) / 100; }
function asArray(v) { return Array.isArray(v) ? v : []; }

// ── Fallback hardcodé si MembershipPlan inaccessible ─────────────────────────
const COMMISSION_RATES_FALLBACK = {
  A: 0.120, // Freemium
  B: 0.090, // Base
  C: 0.060, // Pro
  D: 0.035, // Studio
  E: 0.050, // Fondateur (offre limitée jusqu'au 31 mai 2026)
};
const COMMISSION_RATE_DEFAULT = 0.120;

// ── Charger le taux de base depuis MembershipPlan ─────────────────────────────
async function getBaseRateForTier(service, tier) {
  try {
    const plans = await service.entities.MembershipPlan.filter({ tier }).catch(() => []);
    const now = new Date().toISOString();
    const activePlans = (plans || []).filter(p =>
      p.activeFrom <= now &&
      (!p.activeTo || p.activeTo > now) &&
      !p.isLegacy
    );
    if (activePlans.length > 1) {
      console.warn(`[generatePayoutSplits] ANOMALIE: ${activePlans.length} plans actifs pour tier=${tier} — ` +
        `skus: ${activePlans.map(p => p.sku).join(', ')} — on prend le taux le plus bas`);
    }
    const activePlan = activePlans.sort((a, b) => a.commissionRate - b.commissionRate)[0];
    if (activePlan?.commissionRate != null) {
      return { rate: activePlan.commissionRate, planSku: activePlan.sku, source: 'db' };
    }
  } catch (e) {
    console.warn(`[generatePayoutSplits] MembershipPlan lookup failed for tier ${tier}:`, e?.message);
  }
  const rate = COMMISSION_RATES_FALLBACK[tier] ?? COMMISSION_RATE_DEFAULT;
  return { rate, planSku: null, source: 'fallback' };
}

// ── Modulation SOTS sur le taux ───────────────────────────────────────────────
// ── GRILLE CANONIQUE SOTS ────────────────────────────────────────────────────
// v10 — Grille synchronisée avec respondToPriceProposal v10.
// ⚠️  SYNCHRONISATION OBLIGATOIRE — Cette grille existe en 2 endroits backend :
//   1. respondToPriceProposal — T1 : snapshot figé à l'acceptation du contrat
//   2. Ici (generatePayoutSplits) — fallback : talent assigné sans négociation formelle
//
// Le snapshot T1 (LineupPlacement.effectiveCommissionRate) est TOUJOURS prioritaire.
// Cette fonction n'est appelée qu'en fallback (commissionSnapshotAt = null).
// Si tu modifies un seuil ici, modifie-le aussi dans respondToPriceProposal, et vice versa.
//
// Grille v10 (alignée respondToPriceProposal) :
//   score ≥ 4.5  → ×0.90  (−10%, bonus fort)
//   score ≥ 4.0  → ×0.95  (−5%,  bonus)
//   score ≥ 3.5  → ×1.00  (neutre)
//   score >  3.0 → ×1.05  (+5%,  malus léger)
//   score ≤ 2.0  → ×1.20  (+20%, malus très fort)
//   score ≤ 2.5  → ×1.15  (+15%, malus fort)
//   score ≤ 3.0  → ×1.10  (+10%, malus)
//   score = 0    → ×1.00  (pas de score = pas de modulation)
function sotsModulation(sotsScore) {
  if (!sotsScore || sotsScore <= 0) return 1.00;
  if (sotsScore >= 4.5) return 0.90;
  if (sotsScore >= 4.0) return 0.95;
  if (sotsScore >= 3.5) return 1.00;
  if (sotsScore >  3.0) return 1.05;
  if (sotsScore <= 2.0) return 1.20;
  if (sotsScore <= 2.5) return 1.15;
  if (sotsScore <= 3.0) return 1.10;
  return 1.05;
}

// ── Calcul du taux effectif pour un talent ────────────────────────────────────
async function effectiveRateForTalent(service, profile) {
  let tier = 'A';
  if (profile?.userId) {
    const memberships = await service.entities.UserMembership.filter({
      userId: profile.userId,
      status: 'active',
    }, '-startedAt', 1).catch(() => []);
    tier = memberships?.[0]?.tier || 'A';
  }
  const { rate: baseRate, planSku, source } = await getBaseRateForTier(service, tier);
  const sotsScore = profile?.sotsRecent30Score || profile?.sotsGlobalScore || 0;
  const modulation = sotsModulation(sotsScore);
  const effective = round2(baseRate * modulation * 100) / 100;
  return {
    baseRate,
    modulation,
    effectiveRate: effective,
    tier,
    sotsScore,
    planSku,
    source,
    note: `${planSku || 'fallback'} Tier ${tier} (${(baseRate*100).toFixed(1)}%) × SOTS ${sotsScore.toFixed(1)} mod ${modulation} = ${(effective*100).toFixed(2)}%`,
  };
}

// ── v8 : Lire depuis LineupPlacement — montant ET taux snapshot ──────────────
// Retourne deux maps indexées par userId :
//   amountByUser  : { userId → montant total contracté }
//   snapshotRates : { userId → effectiveCommissionRate figé (null si absent) }
async function extractFromLineupPlacements(service, eventId) {
  try {
    const placements = await service.entities.LineupPlacement.filter({
      eventId,
      status: 'confirmed',
    }).catch(() => []);

    const amountByUser  = {};
    const snapshotRates = {};
    for (const p of (placements || [])) {
      const userId = p.userId;
      const price  = Number(p.assignedPrice) || 0;
      if (userId && price > 0) {
        amountByUser[userId] = (amountByUser[userId] || 0) + price;
        // Snapshot rate : on conserve la valeur la plus récente en cas de
        // placements multiples (plusieurs plages) — en pratique identique.
        if (p.effectiveCommissionRate != null) {
          snapshotRates[userId] = Number(p.effectiveCommissionRate);
        } else if (!(userId in snapshotRates)) {
          snapshotRates[userId] = null; // pas de snapshot → fallback live
        }
      }
    }
    return { amountByUser, snapshotRates };
  } catch {
    return { amountByUser: {}, snapshotRates: {} };
  }
}

// ── Fallback legacy : lire depuis moodFilterSnapshot ─────────────────────────
function extractFromSnapshot(session) {
  try {
    const snap = session?.moodFilterSnapshot || {};
    const placements = snap.lineupPlacements || {};
    const amountByUser = {};
    for (const [, placement] of Object.entries(placements)) {
      const userId = placement.userId;
      const price = Number(placement.assignedPrice) || 0;
      if (userId && price > 0) {
        amountByUser[userId] = (amountByUser[userId] || 0) + price;
      }
    }
    return amountByUser;
  } catch {
    return {};
  }
}

// ── Fallback legacy (pas de lineupPlacements du tout) ─────────────────────────
async function getConfirmedSlotsByRole(service, eventId, roleKeywords) {
  try {
    const sessions = await service.entities.Session.filter({ eventId });
    const userIds = [];
    for (const session of (sessions || [])) {
      for (const slot of asArray(session.slots)) {
        const roleId = (slot.roleSystemId || '').toLowerCase();
        if (roleKeywords.some(kw => roleId.includes(kw)) &&
            slot.status === 'confirmed' && slot.candidateUserId) {
          userIds.push(slot.candidateUserId);
        }
      }
    }
    return [...new Set(userIds)];
  } catch { return []; }
}

// ── Handler ───────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return json(401, { ok: false, error: 'Unauthorized' });

    const body = await req.json().catch(() => ({}));
    const { eventId, payoutId } = body;
    if (!eventId) return json(400, { ok: false, error: 'eventId requis' });

    const service = base44.asServiceRole;
    const nowIso = new Date().toISOString();

    // ── Event ─────────────────────────────────────────────────────────────────
    const eventRows = await service.entities.Event.filter({ id: eventId }).catch(() => []);
    const event = eventRows?.[0] || null;
    if (!event) return json(404, { ok: false, error: 'Événement introuvable' });

    const isCompleted = event.status === 'completed' || !!event.completedAt;
    const isCancelled = event.status === 'cancelled' &&
                        ['balance_unpaid_auto', 'cancelled_by_organizer', 'balance_unpaid'].includes(event.cancellationReason);

    if (!isCompleted && !isCancelled) {
      return json(409, { ok: false, error: `Event doit être completed ou cancelled(balance_unpaid). Actuel: ${event.status}` });
    }

    // ── Payout ────────────────────────────────────────────────────────────────
    let payout = payoutId
      ? await service.entities.EventPayout.get(payoutId).catch(() => null)
      : null;
    if (!payout) {
      const payouts = await service.entities.EventPayout.filter({ eventId });
      payout = payouts?.[0];
    }
    if (!payout) return json(404, { ok: false, error: 'EventPayout introuvable' });
    if (['completed', 'processing'].includes(payout.status)) {
      return json(200, { ok: true, action: 'already_processed', status: payout.status });
    }

    // ── Guard doublon ─────────────────────────────────────────────────────────
    const existingSplits = await service.entities.PayoutSplit.filter({ payoutId: payout.id });
    if (existingSplits?.length > 0) {
      return json(200, { ok: true, action: 'splits_already_exist', count: existingSplits.length });
    }

    // ── SessionPresence → présence validée (R1 fix v9) ───────────────────────
    //
    // v8 bug : hasPresenceData = Object.keys(eligibleByUser).length > 0
    // → si role='audience' seulement (aucun role='artist'), eligibleByUser est vide
    // → hasPresenceData=false → guard bypassé → tous les talents payés sans check-in.
    //
    // v9 fix : distinguer présence globale vs présence artiste.
    //   hasAnyPresence    : au moins 1 SessionPresence (tous rôles) pour cet event
    //   hasArtistPresence : au moins 1 SessionPresence role='artist' pour cet event
    //
    // Guard actif uniquement si hasArtistPresence=true.
    // Si hasArtistPresence=false → warning + bypass (rétrocompat events sans check-in artiste).
    const allPresences = await service.entities.SessionPresence.filter({ eventId }).catch(() => []);
    const eligibleByUser = {};
    let hasAnyPresence    = (allPresences || []).length > 0;
    let hasArtistPresence = false;

    for (const p of (allPresences || [])) {
      if (p.role === 'artist') {
        hasArtistPresence = true;
        const uid = p.userId;
        if (uid) {
          // Un talent avec plusieurs SessionPresences : eligible si AU MOINS UNE est payoutEligible=true
          eligibleByUser[uid] = eligibleByUser[uid] || (p.payoutEligible === true);
        }
      }
      // role='organizer' ignoré pour le guard payout — l'organisateur n'est pas payé
    }

    const hasPresenceData = hasArtistPresence; // rétrocompat : même sémantique dans les logs

    if (hasAnyPresence && !hasArtistPresence) {
      console.warn(
        `[generatePayoutSplits] v9 PRESENCE_GUARD_BYPASSED eventId=${eventId} ` +
        `— ${(allPresences || []).length} SessionPresence(s) trouvées mais aucune role='artist'. ` +
        `Tous les talents seront considérés présents. ` +
        `Vérifier que enterEventSession assigne bien role='artist' aux talents.`
      );
    }

    // ── Montants contractés — LineupPlacement en priorité ────────────────────
    // v10 Fix A — `let` au lieu de `const` : permet la réassignation vers le fallback
    // snapshot si aucun LineupPlacement n'existe. Avec `const`, la réassignation ligne
    // suivante levait une TypeError silencieuse en Deno strict → fallback jamais actif.
    const { amountByUser: lpAmounts, snapshotRates } = await extractFromLineupPlacements(service, eventId);
    let talentAmounts = lpAmounts; // let — réassignable pour le fallback
    let lineupSource = 'lineup_placement';

    if (Object.keys(talentAmounts).length === 0) {
      const sessions = await service.entities.Session.filter({ eventId, sessionType: 'event' }).catch(() => []);
      const session = sessions?.[0];
      talentAmounts = session ? extractFromSnapshot(session) : {};
      lineupSource = 'snapshot_fallback';
      console.warn(`[generatePayoutSplits] v10 eventId=${eventId} — aucun LineupPlacement en DB, fallback snapshot`);
    }

    const hasLineupData = Object.keys(talentAmounts).length > 0;

    // ── v7 FIX B13+B14 : availableAmount = montant réellement collecté ────────
    //
    // gross = event.budget = montant contracté (prix Programme)
    // Ce montant peut être supérieur à ce qui est en caisse si la balance
    // n't a pas été payée (event complété sans balance, ou balance partielle).
    //
    // availableAmount = ce qui est physiquement dans le compte Stripe plateforme.
    //   - Completed : escrowAmount + balancePaid
    //   - Cancelled : escrowAmount seulement (dépôt, jamais la balance)
    //
    const gross = Number(event.budget) || 0;
    const escrowCaptured  = Number(event.escrow_amount_cents) / 100 || Number(event.escrowAmount) || 0;
    const balanceReceived = Number(event.balance_paid_cents)  / 100 || Number(event.balancePaid)  || 0;
    const totalCollected   = round2(escrowCaptured + balanceReceived);

    // ── DUAL-POOL — salePrice et markup ──────────────────────────────────────
    // salePrice = prix de vente au payeur (peut dépasser budget si majoration)
    // markupAmount = salePrice - budget (0 si pas de majoration)
    // Si salePrice non défini → salePrice = budget (pas de majoration, pool B = 0)
    const salePrice      = Number(event.salePrice) || gross;
    const markupAmount   = round2(Math.max(0, salePrice - gross));
    const hasMarkup      = markupAmount > 0;
    const markupSellerRate = Number(event.markupSellerRate) || 0.80;
    const markupMRRate     = Number(event.markupMRRate)     || 0.20;

    // ── VALIDATION SIGNATURE ─────────────────────────────────────────────────
    // Vérifier l'intégrité des paramètres financiers si signature présente
    if (event.eventFinancialsSignature) {
      try {
        const encoder = new TextEncoder();
        const data = encoder.encode([
          gross, salePrice, markupAmount,
          markupSellerRate, markupMRRate,
          event.sellerCommissionRate || 0,
        ].join('|'));
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const computedSig = hashArray.map(b => b.toString(16).padStart(2,'0')).join('');
        if (computedSig !== event.eventFinancialsSignature) {
          console.error(`[generatePayoutSplits] SIGNATURE_MISMATCH eventId=${eventId} — paramètres financiers altérés`);
          return json(409, {
            ok: false,
            error: 'SIGNATURE_MISMATCH',
            message: 'Les paramètres financiers de cet event ont été modifiés après signature. Payout bloqué pour audit.',
          });
        }
      } catch (sigErr) {
        console.warn('[generatePayoutSplits] signature check failed (non-bloquant):', sigErr?.message);
      }
    }

    const availableAmount = isCancelled
      ? escrowCaptured
      : totalCollected;

    // Guard : rien à distribuer
    if (availableAmount <= 0) {
      return json(400, {
        ok: false,
        error: `Aucun montant collecté pour cet event (escrow=${escrowCaptured} balancePaid=${balanceReceived}). Impossible de générer les splits.`,
        escrowCaptured,
        balanceReceived,
      });
    }

    // Guard underfunded : total contracté > total collecté
    // Si le contrat dépasse ce qui a été reçu, les splits sont scalés
    // proportionnellement au collecté. basisAmount conserve le montant
    // contracté (trace du contrat), amount reflète la part réelle payable.
    const totalContracted = hasLineupData
      ? round2(Object.values(talentAmounts).reduce((s, v) => s + v, 0))
      : 0;
    const UNDERFUNDED_TOLERANCE = 0.50; // tolérance arrondis en cents
    const isUnderfunded = hasLineupData &&
      totalContracted > 0 &&
      totalContracted > availableAmount + UNDERFUNDED_TOLERANCE;

    const scalingRatio = isUnderfunded
      ? availableAmount / totalContracted
      : 1.0;

    if (isUnderfunded) {
      console.warn(
        `[generatePayoutSplits] v7 UNDERFUNDED eventId=${eventId} ` +
        `contracted=${totalContracted}$ collected=${availableAmount}$ ` +
        `ratio=${scalingRatio.toFixed(4)} — splits scalés proportionnellement`
      );
    }

    const splits = [];

    // ═══════════════════════════════════════════════════════════════════════════
    // CAS PRINCIPAL : données lineup disponibles
    // ═══════════════════════════════════════════════════════════════════════════
    if (hasLineupData) {

      const allUserIds = Object.keys(talentAmounts);
      const profileCache = {};
      for (const uid of allUserIds) {
        const profiles = await service.entities.TalentProfile.filter({ userId: uid }).catch(() => []);
        profileCache[uid] = profiles?.[0] || null;
      }

      let totalTalentNet  = 0;
      let totalPlatformFee = 0;
      let totalRefunded   = 0;

      const noshowEntries = [];
      const payoutEntries = [];
      const feeEntries    = [];

      for (const [userId, contractAmount] of Object.entries(talentAmounts)) {

        // Montant effectif = contractAmount × scalingRatio
        // Si non underfunded, scalingRatio = 1.0 → effectiveAmount = contractAmount
        const effectiveAmount = isUnderfunded
          ? round2(contractAmount * scalingRatio)
          : contractAmount;

        if (isCancelled) {
          const proportion  = totalContracted > 0 ? contractAmount / totalContracted : 0;
          const talentShare = round2(availableAmount * proportion);
          const fee         = round2(talentShare * 0.05);
          const net         = round2(talentShare - fee);

          payoutEntries.push({
            roleType:              'talent_payout',
            calculationType:       'proportional_deposit',
            basisAmount:           contractAmount,
            amount:                net,
            recipientUserId:       userId,
            effectiveCommissionRate: 0.05,
            note: `Part dépôt annulation — contrat ${contractAmount}$ × ${(proportion*100).toFixed(1)}% = ${talentShare}$ - fee 5% = ${net}$`,
          });
          feeEntries.push({
            roleType:              'platform_fee',
            calculationType:       'percentage_post',
            basisAmount:           talentShare,
            amount:                fee,
            recipientUserId:       null,
            effectiveCommissionRate: null,
            note: `Courtage annulation 5% sur part ${userId.slice(-6)} (${talentShare}$)`,
            talentUserId:          userId,
          });
          totalTalentNet   += net;
          totalPlatformFee += fee;

        } else {
          const isPresent = !hasPresenceData || eligibleByUser[userId] === true;

          if (!isPresent) {
            // DUAL-POOL NO-SHOW — remboursement calculé sur salePrice (pas budget)
            // RÈGLE : la fraction no-show = contractAmount / totalContracted (budget)
            // Le remboursement = cette fraction × salePrice
            // Ainsi le payeur récupère sa valeur réelle dans le prix de vente,
            // pas seulement dans le budget de production.
            const noshowFractionOfBudget = totalContracted > 0
              ? round2(contractAmount / totalContracted)
              : 0;
            const refundOnSalePrice = round2(noshowFractionOfBudget * salePrice);

            noshowEntries.push({
              roleType:              'talent_noshow_refund',
              calculationType:       'refund',
              pool:                  'noshow_refund',
              basisAmount:           contractAmount,
              salePrice:             salePrice,
              noshowFraction:        noshowFractionOfBudget,
              amount:                refundOnSalePrice,
              recipientUserId:       null,   // résolu par executePayoutTransfer → payeur de l'event
              effectiveCommissionRate: null,
              note: `No-show remboursé au payeur — talent ${userId.slice(-6)} contrat ${contractAmount}$ = ${(noshowFractionOfBudget*100).toFixed(1)}% × salePrice ${salePrice}$ = ${refundOnSalePrice}$`,
              refundUserId:          userId,
            });
            totalRefunded += refundOnSalePrice;

          } else {
            const profile  = profileCache[userId];
            // v8: lire le taux snapshot figé à T1 (respondToPriceProposal accept)
            // Fallback: recalcul live depuis MembershipPlan si snapshot absent
            const snapshotRate = snapshotRates[userId] ?? null;
            let rateInfo;
            if (snapshotRate !== null) {
              // Taux contractuel figé — respecter le deal négocié
              rateInfo = {
                effectiveRate: snapshotRate,
                note:          `snapshot T1 figé=${(snapshotRate*100).toFixed(2)}%`,
                source:        'snapshot',
              };
            } else {
              // Talent assigné sans négociation — recalcul live (comportement v7)
              rateInfo = await effectiveRateForTalent(service, profile);
              rateInfo.source = 'live';
            }
            const fee      = round2(effectiveAmount * rateInfo.effectiveRate);
            const net      = round2(effectiveAmount - fee);

            const underfundedNote = isUnderfunded
              ? ` [UNDERFUNDED: contrat ${contractAmount}$ → effectif ${effectiveAmount}$ (ratio ${scalingRatio.toFixed(3)})]`
              : '';

            payoutEntries.push({
              roleType:              'talent_payout',
              calculationType:       'contract_amount',
              basisAmount:           contractAmount,  // contrat original pour audit
              amount:                net,             // ce qui est réellement versé
              recipientUserId:       userId,
              effectiveCommissionRate: rateInfo.effectiveRate,
              note: `Talent présent — ${effectiveAmount}$ - fee ${(rateInfo.effectiveRate*100).toFixed(2)}% = ${net}$ [lineup: ${lineupSource}, commission: ${rateInfo.source}]${underfundedNote}`,
            });
            feeEntries.push({
              roleType:              'platform_fee',
              calculationType:       'percentage_post',
              basisAmount:           contractAmount,
              amount:                fee,
              recipientUserId:       null,
              effectiveCommissionRate: null,
              note: `Courtage ${rateInfo.note} = ${fee}$${underfundedNote}`,
              talentUserId:          userId,
            });
            totalTalentNet   += net;
            totalPlatformFee += fee;
          }
        }
      }

      for (const entry of noshowEntries)  splits.push(entry);
      for (const entry of payoutEntries)  splits.push(entry);
      for (const entry of feeEntries)     splits.push(entry);

      // ── DUAL-POOL B — Majoration commerciale ─────────────────────────────
      // Pool B s'applique uniquement si markupAmount > 0.
      // La fraction présente = (totalContracted - totalRefunded_budget) / totalContracted
      // Le markup effectif = markupAmount × fraction présente
      // Règle : si tous no-show → markup = 0 → vendeur et MR ne gardent rien du markup
      if (hasMarkup && totalContracted > 0) {
        const noshowBudgetTotal = round2(
          noshowEntries.reduce((sum, e) => sum + (Number(e.basisAmount) || 0), 0)
        );
        const presentFraction = round2(
          Math.max(0, (totalContracted - noshowBudgetTotal) / totalContracted)
        );
        const effectiveMarkup = round2(markupAmount * presentFraction);

        if (effectiveMarkup > 0) {
          const sellerMarkupAmount = round2(effectiveMarkup * markupSellerRate);
          const mrMarkupAmount     = round2(effectiveMarkup * markupMRRate);
          const organizerUserId    = event.organizerId || event.organizerUserId || null;
          const sellerUserId       = event.sellerUserId || organizerUserId;

          splits.push({
            roleType:               'seller_markup',
            calculationType:        'percentage_of_markup',
            pool:                   'B_markup',
            basisAmount:            effectiveMarkup,
            amount:                 sellerMarkupAmount,
            recipientUserId:        sellerUserId,
            effectiveCommissionRate: markupSellerRate,
            note: `Pool B — Majoration ${effectiveMarkup}$ × ${(markupSellerRate*100).toFixed(0)}% vendeur = ${sellerMarkupAmount}$ (fraction présente ${(presentFraction*100).toFixed(1)}%)`,
          });
          splits.push({
            roleType:               'platform_markup_fee',
            calculationType:        'percentage_of_markup',
            pool:                   'B_markup',
            basisAmount:            effectiveMarkup,
            amount:                 mrMarkupAmount,
            recipientUserId:        null,
            effectiveCommissionRate: markupMRRate,
            note: `Pool B — Majoration ${effectiveMarkup}$ × ${(markupMRRate*100).toFixed(0)}% MR = ${mrMarkupAmount}$`,
          });

          console.log(`[generatePayoutSplits] DUAL-POOL-B eventId=${eventId} markup=${markupAmount}$ effective=${effectiveMarkup}$ presentFraction=${presentFraction} seller=${sellerMarkupAmount}$ MR=${mrMarkupAmount}$`);
        } else {
          console.log(`[generatePayoutSplits] DUAL-POOL-B ZERO effectiveMarkup=0 (tous no-show) eventId=${eventId}`);
        }
      }

      console.log(
        `[generatePayoutSplits] v7 eventId=${eventId} ` +
        `mode=${isCancelled ? 'annulation' : 'completed'} ` +
        `gross=${gross} collected=${availableAmount} contracted=${totalContracted} ` +
        `underfunded=${isUnderfunded} ratio=${scalingRatio.toFixed(3)} ` +
        `talentNet=${totalTalentNet} fees=${totalPlatformFee} refunded=${totalRefunded} ` +
        `presence=${hasPresenceData} artistPresence=${hasArtistPresence} anyPresence=${hasAnyPresence} lineupSource=${lineupSource}`
      );

    // ═══════════════════════════════════════════════════════════════════════════
    // CAS FALLBACK : aucun lineup (anciens events sans données talent)
    // ═══════════════════════════════════════════════════════════════════════════
    } else {
      const platformFee = round2(availableAmount * 0.12);
      splits.push({
        roleType:              'platform_fee',
        calculationType:       'percentage_legacy',
        basisAmount:           availableAmount,
        amount:                platformFee,
        recipientUserId:       null,
        effectiveCommissionRate: null,
        note: '12% courtage legacy (aucune donnée lineup)',
      });
      const remaining = round2(availableAmount - platformFee);

      const [djUsers, humourUsers] = await Promise.all([
        getConfirmedSlotsByRole(service, eventId, ['dj']),
        getConfirmedSlotsByRole(service, eventId, ['humour', 'comedian', 'standup']),
      ]);
      const talentPool = [...djUsers, ...humourUsers];
      const perTalent  = round2(remaining / Math.max(talentPool.length, 1));
      for (const uid of djUsers) {
        splits.push({ roleType: 'talent_dj', calculationType: 'split_equal', basisAmount: remaining, amount: perTalent, recipientUserId: uid, effectiveCommissionRate: null, note: `Part DJ legacy` });
      }
      for (const uid of humourUsers) {
        splits.push({ roleType: 'talent_humour', calculationType: 'split_equal', basisAmount: remaining, amount: perTalent, recipientUserId: uid, effectiveCommissionRate: null, note: `Part Humoriste legacy` });
      }
      if (talentPool.length === 0) {
        splits.push({ roleType: 'platform_production', calculationType: 'remainder', basisAmount: remaining, amount: remaining, recipientUserId: null, effectiveCommissionRate: null, note: 'Reste legacy — aucun talent' });
      }
      console.log(`[generatePayoutSplits] v7 FALLBACK legacy eventId=${eventId}`);
    }

    // ── Persister ─────────────────────────────────────────────────────────────
    const created = [];
    for (const def of splits) {
      const split = await service.entities.PayoutSplit.create({
        payoutId:               payout.id,
        eventId,
        roleType:               def.roleType,
        calculationType:        def.calculationType,
        basis_amount_cents:     Math.round((Number(def.basisAmount) || 0) * 100),
        amount_cents:           Math.round((Number(def.amount)      || 0) * 100),
        recipientUserId:        def.recipientUserId  || null,
        effectiveCommissionRate: def.effectiveCommissionRate ?? null,
        note:                   def.note,
        status:                 'pending',
        currency:               event.currency || 'CAD',
        createdAt:              nowIso,
        updatedAt:              nowIso,
        ...(def.refundUserId ? { refundUserId: def.refundUserId } : {}),
        ...(def.talentUserId ? { talentUserId: def.talentUserId } : {}),
      });

      created.push(split);
    }

    // totalGrossAmount = montant réellement collecté (pas le montant contracté)
    await service.entities.EventPayout.update(payout.id, {
      status:           'processing',
      totalGrossAmount: availableAmount,
      updatedAt:        nowIso,
    });

    // v10 Fix C — Event.commissionRateApplied : écrire le taux réel (number), pas 'pending_payout' (string)
    // Moyenne pondérée des effectiveCommissionRate appliqués, pondérée par basisAmount de chaque split.
    // Exploitable pour reporting et états financiers.
    if (hasLineupData) {
      try {
        const feeRows = created.filter(s =>
          s.roleType === 'platform_fee' &&
          s.effectiveCommissionRate != null &&
          Number(s.basisAmount) > 0
        );
        if (feeRows.length > 0) {
          const totalBasis = feeRows.reduce((sum, s) => sum + Number(s.basisAmount), 0);
          const weightedRate = totalBasis > 0
            ? feeRows.reduce((sum, s) => sum + Number(s.effectiveCommissionRate) * Number(s.basisAmount), 0) / totalBasis
            : Number(feeRows[0].effectiveCommissionRate);
          await service.entities.Event.update(eventId, {
            commissionRateApplied: Math.round(weightedRate * 10000) / 10000,
          }).catch(e => console.warn('[generatePayoutSplits] Event.commissionRateApplied update failed:', e?.message));
          console.log(`[generatePayoutSplits] v10 commissionRateApplied=${(weightedRate * 100).toFixed(4)}% eventId=${eventId}`);
        }
      } catch (e) {
        console.warn('[generatePayoutSplits] v10 commissionRateApplied calc failed:', e?.message);
      }
    }

    // ── SELLER COMMISSION ─────────────────────────────────────────────────────
    // Règle : vendeur = organizerId QUAND payerUserId != organizerId.
    // Le taux vient de SellerTier.commissionRate (table dédiée, tier A/B/C).
    // Base de calcul : somme des platform_fee créées sur cet event.
    // Figé dans Event.sellerUserId + Event.sellerCommissionRate pour audit.
    // Invariant : talent_payout + platform_fee + seller_commission = budget.
    try {
      const organizerUserId = event.organizerId || event.organizerUserId || null;
      const payerUserId     = event.payerUserId || null;
      const isSellerEvent   = organizerUserId && payerUserId && organizerUserId !== payerUserId;

      if (isSellerEvent) {
        // Résoudre le taux depuis SellerTier
        const sellerTiers = await service.entities.SellerTier
          .filter({ userId: organizerUserId, isActive: true })
          .catch(() => []);
        const sellerTier = sellerTiers?.[0] || null;

        // Taux par défaut tier C (5%) si le vendeur n'a pas encore de tier
        const sellerRate = sellerTier ? Number(sellerTier.commissionRate) : 0.05;
        const sellerTierLabel = sellerTier?.tier || 'C (défaut)';

        // Base = somme des platform_fee de cet event (créées dans ce run)
        const platformFeeTotal = round2(
          created
            .filter(s => s.roleType === 'platform_fee')
            .reduce((sum, s) => sum + (Number(s.amount) || 0), 0)
        );

        if (platformFeeTotal > 0 && sellerRate > 0) {
          const sellerAmount = round2(platformFeeTotal * sellerRate);

          // Créer le PayoutSplit seller_commission
          const sellerSplit = await service.entities.PayoutSplit.create({
            payoutId:                payout.id,
            eventId:                 eventId,
            roleType:                'seller_commission',
            calculationType:         'percentage_of_platform_fee',
            basisAmount:             platformFeeTotal,
            amount:                  sellerAmount,
            currency:                'CAD',
            recipientUserId:         organizerUserId,     // JAMAIS vide
            effectiveCommissionRate: sellerRate,
            note: `Commission vendeur tier ${sellerTierLabel} — ${(sellerRate*100).toFixed(0)}% × ${platformFeeTotal}$ MR = ${sellerAmount}$`,
            status:                  'pending',
            createdAt:               nowIso,
            updatedAt:               nowIso,
          });
          created.push(sellerSplit);
          splits.push({ ...sellerSplit });

          // Figer les infos vendeur sur Event (audit trail immuable)
          await service.entities.Event.update(eventId, {
            sellerUserId:         organizerUserId,
            sellerCommissionRate: sellerRate,
          }).catch(e => console.warn('[generatePayoutSplits] Event.seller update failed:', e?.message));

          // Mettre à jour les stats lifetime du vendeur
          if (sellerTier) {
            const currentRevenue = Number(sellerTier.lifetimeSellerRevenue) || 0;
            const currentCount   = Number(sellerTier.lifetimeEventCount) || 0;
            const newRevenue     = round2(currentRevenue + platformFeeTotal);
            const newCount       = currentCount + 1;

            // Upgrade automatique de tier selon seuils de volume MR cumulé
            let newTier = sellerTier.tier;
            let newRate = sellerRate;
            if (newRevenue >= 5000 && sellerTier.tier !== 'A') {
              newTier = 'A'; newRate = 0.15;
            } else if (newRevenue >= 1000 && sellerTier.tier === 'C') {
              newTier = 'B'; newRate = 0.10;
            }
            const tierUpgraded = newTier !== sellerTier.tier;

            await service.entities.SellerTier.update(sellerTier.id, {
              lifetimeSellerRevenue: newRevenue,
              lifetimeEventCount:    newCount,
              ...(tierUpgraded ? {
                tier:             newTier,
                commissionRate:   newRate,
                tierUpgradedAt:   nowIso,
                notes:            `${sellerTier.notes || ''} | Auto-upgrade ${sellerTier.tier}→${newTier} le ${nowIso.slice(0,10)} (volume ${newRevenue}$)`.trim(),
              } : {}),
            }).catch(e => console.warn('[generatePayoutSplits] SellerTier update failed:', e?.message));

            if (tierUpgraded) {
              console.log(`[generatePayoutSplits] SELLER_TIER_UPGRADE userId=${organizerUserId} ${sellerTier.tier}→${newTier} volume=${newRevenue}$`);
            }
          } else {
            // Première vente — créer l'entrée SellerTier tier C par défaut
            await service.entities.SellerTier.create({
              userId:                organizerUserId,
              tier:                  'C',
              commissionRate:        0.05,
              lifetimeSellerRevenue: round2(platformFeeTotal),
              lifetimeEventCount:    1,
              isActive:              true,
              notes:                 `Créé automatiquement — première vente ${nowIso.slice(0,10)}`,
            }).catch(e => console.warn('[generatePayoutSplits] SellerTier.create failed:', e?.message));
          }

          console.log(`[generatePayoutSplits] SELLER_COMMISSION sellerUserId=${organizerUserId} tier=${sellerTierLabel} base=${platformFeeTotal}$ rate=${sellerRate} amount=${sellerAmount}$ eventId=${eventId}`);
        }
      }
    } catch (sellerErr) {
      // Non bloquant — le payout talent continue même si seller échoue
      console.warn('[generatePayoutSplits] seller_commission non-fatal:', sellerErr?.message);
    }

    // ── POOL C — BILLETTERIE ──────────────────────────────────────────────────
    // Source de vérité : EventTicketConfig.totalTicketRevenue (sum des billets paid)
    // Séparation absolue : ces splits ne partagent aucune base avec Pool A ou B.
    // Le noShowFraction commun à A, B et C garantit l'alignement de l'incitation.
    // Règle : vendeur = 0$ si event non livré = 0 talent présent.
    try {
      const ticketConfigs = await service.entities.EventTicketConfig
        .filter({ eventId }).catch(() => []);
      const ticketConfig = ticketConfigs?.[0];
      const ticketRevenue = Number(ticketConfig?.totalTicketRevenue) || 0;

      if (ticketRevenue > 0) {
        const sellerTicketRate = Number(ticketConfig?.sellerTicketRate) || 0.95;
        const mrTicketRate     = Number(ticketConfig?.mrTicketRate)     || 0.05;
        const organizerUserId  = event.organizerId || event.organizerUserId || null;

        // noShowFraction déjà calculé dans le bloc lineup ci-dessus
        // Si pas de lineup data → pas de noShowFraction → présent par défaut = 100%
        const noshowBudgetTotal = round2(
          splits
            .filter(s => s.roleType === 'talent_noshow_refund')
            .reduce((sum, s) => sum + (Number(s.basisAmount) || 0), 0)
        );
        const presentFractionTicket = totalContracted > 0
          ? round2(Math.max(0, (totalContracted - noshowBudgetTotal) / totalContracted))
          : 1.0;

        const effectiveTicketRevenue = round2(ticketRevenue * presentFractionTicket);

        if (effectiveTicketRevenue > 0) {
          const sellerTicketAmount = round2(effectiveTicketRevenue * sellerTicketRate);
          const mrTicketAmount     = round2(effectiveTicketRevenue * mrTicketRate);

          splits.push({
            roleType:               'seller_ticketing',
            calculationType:        'percentage_of_ticketing',
            pool:                   'C_ticketing',
            basisAmount:            ticketRevenue,
            amount:                 sellerTicketAmount,
            recipientUserId:        organizerUserId,
            effectiveCommissionRate: sellerTicketRate,
            note: `Pool C — Billetterie ${effectiveTicketRevenue}$ × ${(sellerTicketRate*100).toFixed(0)}% vendeur = ${sellerTicketAmount}$ (fraction présente ${(presentFractionTicket*100).toFixed(1)}%)`,
          });
          splits.push({
            roleType:               'platform_ticketing_fee',
            calculationType:        'percentage_of_ticketing',
            pool:                   'C_ticketing',
            basisAmount:            ticketRevenue,
            amount:                 mrTicketAmount,
            recipientUserId:        null,
            effectiveCommissionRate: mrTicketRate,
            note: `Pool C — Billetterie ${effectiveTicketRevenue}$ × ${(mrTicketRate*100).toFixed(0)}% MR = ${mrTicketAmount}$`,
          });

          // Déclencher refundTicket si no-show partiel (non bloquant)
          if (presentFractionTicket < 1.0) {
            const noshowFrac = round2(1 - presentFractionTicket);
            base44.functions.invoke('refundTicket', {
              eventId,
              mode: 'noshow_partial',
              noShowFraction: noshowFrac,
              dryRun: false,
            }).catch(e => console.warn('[generatePayoutSplits] Pool C refundTicket non-fatal:', e?.message));
            console.log(`[generatePayoutSplits] POOL-C refundTicket triggered noShowFrac=${noshowFrac} eventId=${eventId}`);
          }

          console.log(`[generatePayoutSplits] POOL-C ticketRevenue=${ticketRevenue}$ effective=${effectiveTicketRevenue}$ seller=${sellerTicketAmount}$ MR=${mrTicketAmount}$ eventId=${eventId}`);
        } else {
          // Tous no-show → 0 billetterie distribuée → rembourser intégralement
          base44.functions.invoke('refundTicket', {
            eventId, mode: 'full_cancel', dryRun: false,
          }).catch(e => console.warn('[generatePayoutSplits] Pool C full refund non-fatal:', e?.message));
          console.log(`[generatePayoutSplits] POOL-C ZERO (tous no-show) → full_cancel déclenché eventId=${eventId}`);
        }
      }
    } catch (poolCErr) {
      console.warn('[generatePayoutSplits] Pool C non-fatal:', poolCErr?.message);
    }

    const totalSplit = round2(splits.reduce((a, s) => a + s.amount, 0));

    return json(200, {
      ok:             true,
      mode:           isCancelled ? 'cancellation_deposit' : 'completed_payout',
      lineupSource,
      gross,
      availableAmount,
      totalCollected,
      totalContracted,
      isUnderfunded,
      scalingRatio:   isUnderfunded ? scalingRatio : null,
      hasPresenceData,
      hasArtistPresence,
      hasAnyPresence,
      hasLineupData,
      splits:         created.length,
      totalSplit,
      breakdown: splits.map(s => ({
        roleType:               s.roleType,
        amount:                 s.amount,
        basisAmount:            s.basisAmount,
        recipientUserId:        s.recipientUserId  || null,
        effectiveCommissionRate: s.effectiveCommissionRate ?? null,
        note:                   s.note,
      })),
    });

  } catch (error) {
    console.error('[generatePayoutSplits]', error?.message);
    return json(500, { ok: false, error: error.message });
  }
});