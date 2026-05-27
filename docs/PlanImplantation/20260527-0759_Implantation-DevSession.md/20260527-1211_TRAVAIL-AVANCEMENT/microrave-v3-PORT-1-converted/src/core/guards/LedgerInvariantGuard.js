/**
 * MICRO RAVE V3 — LedgerInvariantGuard
 * ============================================================
 * Guard pour les transitions financières vers payable et settled :
 *   contestation_window → payable   (via PresenceProofGuard — appelé en GUARD 4)
 *   payable → settled               (directement)
 *
 * ATTENTION : Ce guard est le GUARD 4 (FinancialInvariantGuard) dans
 * transitionEngagement, pas le GUARD 3. Il s'exécute APRÈS le guard
 * spécifique (PresenceProofGuard pour →payable, LedgerInvariantGuard
 * lui-même pour →settled).
 *
 * Responsabilités :
 *   1. Vérifier que le waterfall du ContractSnapshot phase 2 est complet
 *   2. Vérifier LOI LEDGER-02 : Σ talentNetCents + Σ commissionMrCents = prixVenduClientCents
 *   3. Vérifier que le résidu d'arrondi est dans la tolérance documentée
 *   4. Vérifier que tout résidu est tracé vers le compte 6591 (D-070)
 *
 * LOI LEDGER-02 (VT-11) :
 *   sum(nets) + sum(commissions) + roundingCents = prix_vendu_client
 *   roundingCents tolérance : ≤ nombre de talents dans le lineup
 *
 * Ce guard NE touche PAS la database directement.
 * Il reçoit les données via context, retourne un résultat.
 *
 * Source : LOI LEDGER-02 · D-070 · OS V14 · Action 5 Audit Nobel-Licorne
 * ============================================================
 */

'use strict';

import MoneyMath from '../MoneyMath.js';
/**
 * Transitions financières couvertes par ce guard.
 * Utilisé pour valider que le guard est appelé dans le bon contexte.
 */
const COVERED_TRANSITIONS = new Set([
  'contestation_window->payable',
  'performed->payable',
  'payable->settled',
]);

/**
 * Vérifie l'invariant comptable du waterfall avant toute transition financière critique.
 *
 * Champs obligatoires dans context :
 * @param {object}   context.contractSnapshotPhase2           — snapshot W2 complet
 * @param {number}   context.contractSnapshotPhase2.prixVenduClientCents — total TTC encaissé
 * @param {Array}    context.contractSnapshotPhase2.waterfall — [{talentNetCents, commissionMrCents, talentUserId}]
 */
async function validate({
  engagementId,
  currentState,
  targetState,
  actor,
  context = {},
  repositories = {},
}) {
  const transitionKey = `${currentState}->${targetState}`;

  // ── Validation contexte de transition ────────────────────
  if (!COVERED_TRANSITIONS.has(transitionKey)) {
    return {
      passed: false,
      reason: `GUARD_MISMATCH: LedgerInvariantGuard ne couvre pas "${transitionKey}". ` +
              `Transitions couvertes : ${[...COVERED_TRANSITIONS].join(', ')}.`,
    };
  }

  const { contractSnapshotPhase2 } = context;

  // ── Vérification snapshot présent ────────────────────────
  if (!contractSnapshotPhase2) {
    return {
      passed: false,
      reason: 'LEDGER_MISSING_SNAPSHOT: contractSnapshotPhase2 absent dans context. ' +
              'Le ContractSnapshot W2 (event_sealed) est requis pour valider l\'invariant comptable.',
    };
  }

  const { prixVenduClientCents, waterfall } = contractSnapshotPhase2;

  // ── Vérification prixVenduClientCents ────────────────────
  if (!Number.isInteger(prixVenduClientCents) || prixVenduClientCents <= 0) {
    return {
      passed: false,
      reason: `LEDGER_INVALID_PRICE: prixVenduClientCents=${prixVenduClientCents} ` +
              `doit être un entier positif en centimes (standard D-064).`,
    };
  }

  // ── Vérification waterfall présent et non vide ────────────
  if (!Array.isArray(waterfall) || waterfall.length === 0) {
    return {
      passed: false,
      reason: 'LEDGER_EMPTY_WATERFALL: contractSnapshotPhase2.waterfall absent ou vide. ' +
              'Le waterfall doit contenir au moins une entrée talent. ' +
              'LOI LINEUP-01 : aucun event sans talent.',
    };
  }

  // ── Vérification structure de chaque entrée ──────────────
  for (let i = 0; i < waterfall.length; i++) {
    const entry = waterfall[i];

    if (!entry.talentUserId) {
      return {
        passed: false,
        reason: `LEDGER_ENTRY_INVALID: waterfall[${i}] sans talentUserId.`,
      };
    }
    if (!Number.isInteger(entry.talentNetCents) || entry.talentNetCents < 0) {
      return {
        passed: false,
        reason: `LEDGER_ENTRY_INVALID: waterfall[${i}].talentNetCents=${entry.talentNetCents} ` +
                `doit être un entier >= 0. Standard D-064.`,
      };
    }
    if (!Number.isInteger(entry.commissionMrCents) || entry.commissionMrCents < 0) {
      return {
        passed: false,
        reason: `LEDGER_ENTRY_INVALID: waterfall[${i}].commissionMrCents=${entry.commissionMrCents} ` +
                `doit être un entier >= 0. Standard D-064.`,
      };
    }
  }

  // ── LOI LEDGER-02 : invariant zéro cent ──────────────────
  // sum(nets) + sum(commissions) + roundingCents = prix_vendu_client
  // Source : OS V14 section 4.2 · SealingGuard (référence)
  const totalNets        = waterfall.reduce((sum, w) => sum + w.talentNetCents, 0);
  const totalCommissions = waterfall.reduce((sum, w) => sum + w.commissionMrCents, 0);
  const roundingCents    = prixVenduClientCents - totalNets - totalCommissions;

  // Tolérance : ≤ nombre de talents (1 centime de résidu d'arrondi par talent max)
  // Source : LOI LEDGER-02, SealingGuard ligne 241
  const toleranceCents = waterfall.length;

  if (Math.abs(roundingCents) > toleranceCents) {
    return {
      passed: false,
      reason: `LEDGER_INVARIANT_VIOLATED: LOI LEDGER-02 — ` +
              `sum(nets=${totalNets}) + sum(commissions=${totalCommissions}) + ` +
              `rounding(${roundingCents}) ≠ prix_vendu_client(${prixVenduClientCents}). ` +
              `Résidu ${roundingCents} dépasse la tolérance de ${toleranceCents} centime(s) ` +
              `(1 par talent dans le lineup). ` +
              `Vérifier le waterfall du ContractSnapshot phase 2.`,
    };
  }

  // ── Traçabilité du résidu (D-070) ─────────────────────────
  // Le résidu positif va au compte 6591 (MR conserve l'avantage de l'arrondi floor)
  // Le résidu négatif indique une sur-distribution — ne doit pas arriver avec floor()
  let roundingNote = null;
  if (roundingCents !== 0) {
    roundingNote = {
      roundingCents,
      ledgerAccount: '6591',
      direction: roundingCents > 0 ? 'CREDIT_MR' : 'DEBIT_MR',
      note: roundingCents > 0
        ? `Résidu d'arrondi floor() de ${roundingCents} centime(s) — crédit MR compte 6591 (D-070)`
        : `Résidu négatif inattendu de ${roundingCents} centime(s) — vérifier le waterfall`,
    };
  }

  // ── Vérification additionnelle : cohérence interne waterfall ─
  // Chaque talent : cachetBrutFinalCents = talentNetCents + commissionMrCents
  // Si cachetBrutFinalCents est présent dans le waterfall, vérifier la cohérence
  for (let i = 0; i < waterfall.length; i++) {
    const entry = waterfall[i];
    if (entry.cachetBrutFinalCents !== undefined) {
      const expectedBrut = entry.talentNetCents + entry.commissionMrCents;
      if (entry.cachetBrutFinalCents !== expectedBrut) {
        return {
          passed: false,
          reason: `LEDGER_WATERFALL_INCOHERENT: waterfall[${i}] talent ${entry.talentUserId} — ` +
                  `cachetBrutFinalCents(${entry.cachetBrutFinalCents}) ≠ ` +
                  `talentNetCents(${entry.talentNetCents}) + commissionMrCents(${entry.commissionMrCents}) ` +
                  `= ${expectedBrut}. Corruption du snapshot détectée.`,
        };
      }
    }
  }

  return {
    passed: true,
    roundingNote,
    audit: {
      transitionKey,
      prixVenduClientCents,
      totalNets,
      totalCommissions,
      roundingCents,
      toleranceCents,
      lineupSize:   waterfall.length,
      invariantOk:  true,
    },
  };
}

export default {
validate, COVERED_TRANSITIONS 
};
export { validate, COVERED_TRANSITIONS };