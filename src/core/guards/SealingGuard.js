/**
 * MICRO RAVE V3 — SealingGuard
 * ============================================================
 * Guard spécifique à la transition : balance_pending → event_sealed
 * Source : OS V10 section 2.7.1
 *
 * C'est le moment WORM le plus critique du chemin nominal.
 * event_sealed = Moment WORM 3, Niveau 2 (Fraude si touché).
 * Après ce point : aucun montant, taux, taxe ou donnée Stripe
 * ne peut être modifié sans AdminIncidentRecord P0 + SYSTEM_HOLD.
 *
 * Responsabilités :
 *   1. Vérifier que le dépôt a été reçu (deposit_secured confirmé)
 *   2. Vérifier que la balance a été reçue (balanceReceivedCents)
 *   3. Vérifier LOI LINEUP-01 : coefficient de répartition cohérent
 *   4. Vérifier LOI LINEUP-02 : talents gratuits avec freeWeightCents
 *   5. Vérifier LOI LEDGER-02 : sum(nets) + sum(commissions) = prix_vendu_client
 *   6. Construire et retourner le ContractSnapshot phase 2 (WORM W2)
 *
 * Source des lois :
 *   LOI LINEUP-01 : coefficient = max(1, prix_vendu_client / total_lineup_effectif)
 *   LOI LINEUP-02 : talent gratuit → freeWeightCents (100 cents) comme poids
 *   LOI LEDGER-02 : sum(nets) + sum(commissions) + rounding = prix_vendu_client
 *   Source : OS V10 sections 3.3, 2.7.1, lois invariantes section 16
 *
 * Ce guard NE touche PAS Base44 directement.
 * Il construit le ContractSnapshot phase 2 et le retourne.
 * La persistence appartient à l'appelant via repositories.contracts.
 * ============================================================
 */

'use strict';

const MoneyMath = require("../MoneyMath");
const IDFactory = require('../IDFactory');

/**
 * Valide la transition balance_pending → event_sealed.
 *
 * @param {object} params
 * @param {string} params.engagementId
 * @param {string} params.actor
 * @param {object} params.context
 *
 * Champs obligatoires dans context :
 * @param {string} params.context.contractSnapshotPhase1Id  — systemId CS1-* (Moment WORM 1)
 * @param {string} params.context.eventId                   — systemId EVT-*
 * @param {number} params.context.depositReceivedCents      — dépôt confirmé (entier)
 * @param {number} params.context.balanceReceivedCents      — solde reçu (entier)
 * @param {number} params.context.prixVenduClientCents      — prix vendu TTC (entier)
 * @param {Array}  params.context.lineupEntries             — tableau de talents avec leurs cachets
 *   Chaque entrée : { talentUserId, cachetSigneCents, tauxPpm, tier }
 * @param {number} params.context.freeWeightCents           — poids symbolique talent gratuit
 *   (depuis getConfig('free_weight_cents') — défaut 100 si absent)
 */
async function validate({
  engagementId,
  currentState,
  targetState,
  actor,
  context = {},
  repositories = {},
}) {

  const {
    contractSnapshotPhase1Id,
    eventId,
    depositReceivedCents,
    balanceReceivedCents,
    prixVenduClientCents,
    lineupEntries,
    freeWeightCents: freeWeightCentsFromConfig,
  } = context;

  // freeWeightCents depuis config — défaut 100 (1,00 $) si absent
  // TODO : passer via getConfig('free_weight_cents') quand PolicyConfig branché
  // Source : OS V10 section 3.3 LOI LINEUP-02 + lois invariantes section 16
  const freeWeightCents = (
    Number.isInteger(freeWeightCentsFromConfig) && freeWeightCentsFromConfig > 0
      ? freeWeightCentsFromConfig
      : 100
  );

  // ── Vérification 1 : ContractSnapshot phase 1 obligatoire ─
  if (!contractSnapshotPhase1Id || !contractSnapshotPhase1Id.startsWith('CS1-')) {
    return {
      passed: false,
      reason: 'MISSING_CONTRACT_SNAPSHOT_PHASE1: Le ContractSnapshot phase 1 (CS1-*) est ' +
              'obligatoire pour créer le phase 2 à event_sealed. ' +
              'Source : OS V10 section 2.7, Moment 1.',
    };
  }

  // ── Vérification 2 : eventId obligatoire ──────────────────
  if (!eventId || !eventId.startsWith('EVT-')) {
    return {
      passed: false,
      reason: `MISSING_EVENT: eventId valide (EVT-*) obligatoire. Reçu : "${eventId}"`,
    };
  }

  // ── Vérification 3 : Dépôt reçu ──────────────────────────
  // Le dépôt doit avoir été confirmé (deposit_secured) avant le scellement.
  if (!Number.isInteger(depositReceivedCents) || depositReceivedCents <= 0) {
    return {
      passed: false,
      reason: `DEPOSIT_NOT_RECEIVED: depositReceivedCents doit être un entier positif. ` +
              `Reçu : ${depositReceivedCents}. ` +
              `Le dépôt doit être confirmé (deposit_secured) avant event_sealed.`,
    };
  }

  // ── Vérification 4 : Balance reçue ───────────────────────
  // La balance est le solde après le dépôt.
  // balanceReceivedCents peut être 0 si le dépôt couvrait 100% (cas rare documenté).
  if (!Number.isInteger(balanceReceivedCents) || balanceReceivedCents < 0) {
    return {
      passed: false,
      reason: `BALANCE_NOT_RECEIVED: balanceReceivedCents doit être un entier positif ou nul. ` +
              `Reçu : ${balanceReceivedCents}.`,
    };
  }

  // ── Vérification 5 : Total cohérent ──────────────────────
  const totalReçuCents = depositReceivedCents + balanceReceivedCents;

  if (!Number.isInteger(prixVenduClientCents) || prixVenduClientCents <= 0) {
    return {
      passed: false,
      reason: `INVALID_PRIX_VENDU: prixVenduClientCents doit être un entier positif. ` +
              `Reçu : ${prixVenduClientCents}.`,
    };
  }

  // Tolérance de 2 centimes sur le total reçu (arrondis Stripe)
  const ecartTotal = Math.abs(totalReçuCents - prixVenduClientCents);
  if (ecartTotal > 2) {
    return {
      passed: false,
      reason: `PAYMENT_TOTAL_MISMATCH: Total reçu (${totalReçuCents}) ≠ prix vendu ` +
              `(${prixVenduClientCents}). Écart : ${ecartTotal} centimes > tolérance 2. ` +
              `Vérifier manuellement avant de sceller.`,
    };
  }

  // ── Vérification 6 : Lineup obligatoire ──────────────────
  if (!lineupEntries || !Array.isArray(lineupEntries) || lineupEntries.length === 0) {
    return {
      passed: false,
      reason: 'EMPTY_LINEUP: lineupEntries obligatoire pour calculer le waterfall. ' +
              'Source : OS V10 section 3.3 LOI LINEUP-01/02.',
    };
  }

  // ── Vérification 7 : Standard numérique sur le lineup ────
  for (let i = 0; i < lineupEntries.length; i++) {
    const entry = lineupEntries[i];
    if (!entry.talentUserId) {
      return { passed: false, reason: `LINEUP_ENTRY_INVALID: Entrée ${i} sans talentUserId.` };
    }
    if (!Number.isInteger(entry.cachetSigneCents) || entry.cachetSigneCents < 0) {
      return {
        passed: false,
        reason: `LINEUP_ENTRY_INVALID: cachetSigneCents de l'entrée ${i} doit être un entier ≥ 0. ` +
                `Reçu : ${entry.cachetSigneCents}. Les virgules flottantes sont interdites.`,
      };
    }
    if (!Number.isInteger(entry.tauxPpm) || entry.tauxPpm < 0 || entry.tauxPpm > 1_000_000) {
      return {
        passed: false,
        reason: `LINEUP_ENTRY_INVALID: tauxPpm de l'entrée ${i} doit être entre 0 et 1 000 000. ` +
                `Reçu : ${entry.tauxPpm}.`,
      };
    }
  }

  // ── LOI LINEUP-01 : coefficient de répartition ───────────
  // coefficient = max(1, prix_vendu_client / total_lineup_effectif)
  // Source : OS V10 section 3.3 + lois invariantes section 16
  const totalLineupSigneCents = lineupEntries.reduce((sum, e) => sum + e.cachetSigneCents, 0);

  const totalLineupEffectifCents = lineupEntries.reduce((sum, e) => {
    return sum + (e.cachetSigneCents > 0 ? e.cachetSigneCents : freeWeightCents);
  }, 0);

  const coefficientPpm = totalLineupEffectifCents > 0
    ? MoneyMath.lineupCoefficientPpm(prixVenduClientCents, totalLineupEffectifCents)
    : 1_000_000;

  // ── LOI LINEUP-02 : calcul waterfall complet ─────────────
  // Formule deux couches : base contractuelle + prorata du surplus
  // Source : OS V10 section 3.3 LOI LINEUP-02
  const surplusPoolCents = totalLineupSigneCents > 0
    ? prixVenduClientCents - totalLineupSigneCents
    : prixVenduClientCents;

  const waterfall = lineupEntries.map(entry => {
    const baseContractuelle   = entry.cachetSigneCents;
    const poidsEffectif       = entry.cachetSigneCents > 0 ? entry.cachetSigneCents : freeWeightCents;
    const prorataPool         = totalLineupEffectifCents > 0
      ? MoneyMath.prorataCents(surplusPoolCents, poidsEffectif, totalLineupEffectifCents)
      : 0;
    const cachetBrutFinalCents = baseContractuelle + prorataPool;
    const commissionMrCents   = MoneyMath.applyRatePpm(cachetBrutFinalCents, entry.tauxPpm);
    const talentNetCents      = cachetBrutFinalCents - commissionMrCents;

    // Plancher contractuel — aucun talent ne reçoit moins que son cachet signé
    if (cachetBrutFinalCents < entry.cachetSigneCents) {
      return {
        passed: false,
        reason: `LINEUP_FLOOR_VIOLATED: Le talent ${entry.talentUserId} recevrait ` +
                `${cachetBrutFinalCents} cents < cachet signé ${entry.cachetSigneCents} cents. ` +
                `LOI LINEUP-02 : plancher contractuel violé.`,
        talentUserId: entry.talentUserId,
      };
    }

    return {
      talentUserId:          entry.talentUserId,
      cachetSigneCents:      entry.cachetSigneCents,
      cachetBrutFinalCents,
      commissionMrCents,
      talentNetCents,
      tauxPpm:               entry.tauxPpm,
    };
  });

  // Vérifier si un talent viole le plancher
  const floorViolation = waterfall.find(w => w.passed === false);
  if (floorViolation) {
    return { passed: false, reason: floorViolation.reason };
  }

  // ── LOI LEDGER-02 : invariant zéro cent ──────────────────
  // sum(nets) + sum(commissions) + rounding = prix_vendu_client
  // Source : OS V10 section 4.2 + lois invariantes section 16
  const totalNets        = waterfall.reduce((sum, w) => sum + w.talentNetCents, 0);
  const totalCommissions = waterfall.reduce((sum, w) => sum + w.commissionMrCents, 0);
  const roundingCents    = prixVenduClientCents - totalNets - totalCommissions;

  // LOI LEDGER-02 : le résidu d'arrondi doit être minimal
  if (Math.abs(roundingCents) > lineupEntries.length) {
    return {
      passed: false,
      reason: `LEDGER_INVARIANT_VIOLATED: LOI LEDGER-02 — sum(nets=${totalNets}) + ` +
              `sum(commissions=${totalCommissions}) + rounding(${roundingCents}) ≠ ` +
              `prix_vendu_client(${prixVenduClientCents}). ` +
              `Résidu ${roundingCents} > tolérance ${lineupEntries.length} centimes.`,
    };
  }

  // ── Construction du ContractSnapshot phase 2 ─────────────
  // WORM Niveau 2 — retourné, pas persisté ici.
  // Source : OS V10 section 2.7, Moment 3
  const contractSnapshotPhase2 = {
    systemId:                  IDFactory.generate('ContractSnapshotV2'),
    engagementId,
    phase:                     2,
    wormLevel:                 'W2',
    // Référence au phase 1
    contractSnapshotPhase1Id,
    eventId,
    // Paiements reçus
    depositReceivedCents,
    balanceReceivedCents,
    totalReceivedCents:        totalReçuCents,
    prixVenduClientCents,
    roundingCents,
    // Waterfall complet
    waterfall,
    totalNets,
    totalCommissions,
    coefficientPpm,
    surplusPoolCents,
    freeWeightCents,
    // Métadonnées
    sealedByActor:             actor,
    sealedAt:                  new Date().toISOString(),
  };

  return {
    passed: true,
    contractSnapshot: contractSnapshotPhase2,
    audit: {
      totalNets,
      totalCommissions,
      roundingCents,
      coefficientPpm,
      lineupCount:   lineupEntries.length,
    },
  };
}

module.exports = { validate };