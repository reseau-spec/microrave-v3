/**
 * MICRO RAVE V3 — CancellationGuard
 * ============================================================
 * Guard pour les transitions d'annulation :
 *   accepted → cancelled_pre_deposit    (annulation avant depot, zero frais)
 *   placed   → cancelled_pre_deposit    (idem depuis placed)
 *   deposit_secured → cancelled_J7      (LOI ANNULATION-02 — balance impayee J-6)
 *   deposit_secured → cancelled_J30     (LOI ANNULATION-01 — annulation > J-30)
 *
 * Source : D-039 · D-040 · D-043 · LOI ANNULATION-01 · LOI ANNULATION-02
 *
 * LOI ANNULATION-01 (D-039, annulation > J-30) :
 *   Remboursement total depot moins frais Stripe.
 *   formule : remboursePayer = depotBrutRecuCents - fraisStripeCents
 *   MR ne retient aucune commission.
 *
 * LOI ANNULATION-02 (D-040, balance impayee a J-6) :
 *   Annulation automatique. Payeur defaillant = zero remboursement.
 *   Talents payes sur le depot au prorata. MR retient sa commission.
 *   Source : D-043 — coefficient force a 1 (event_sealed non atteint).
 *
 * PRE-DEPOT (accepted/placed → cancelled_pre_deposit) :
 *   Aucun fonds engage. Zero frais. Zero ledger.
 *
 * CONDITIONS COMMUNES :
 *   - reasonCode obligatoire
 *   - actorRole dans AUTHORIZED_ROLES
 *
 * CE GUARD NE TOUCHE PAS LA DATABASE.
 *   Il retourne { passed, cancellationRecord } a l'appelant.
 *   L'appelant persiste via le repository approprie.
 * ============================================================
 */

'use strict';

import IDFactory from '../IDFactory.js';
const COVERED_TRANSITIONS = new Set([
  'accepted->cancelled_pre_deposit',
  'placed->cancelled_pre_deposit',
  'deposit_secured->cancelled_J7',
  'deposit_secured->cancelled_J30',
]);

// Roles autorises a declencher une annulation
// SYSTEM = SchedulerService (LOI ANNULATION-02 automatique)
const AUTHORIZED_ROLES = new Set(['talent', 'organisateur', 'admin', 'SYSTEM']);

async function validate({
  engagementId,
  currentState,
  targetState,
  actor,
  context = {},
  repositories = {},
}) {
  const transitionKey = `${currentState}->${targetState}`;

  if (!COVERED_TRANSITIONS.has(transitionKey)) {
    return {
      passed: false,
      reason: `GUARD_MISMATCH: CancellationGuard ne couvre pas "${transitionKey}". ` +
              `Transitions couvertes : ${[...COVERED_TRANSITIONS].join(', ')}.`,
    };
  }

  switch (transitionKey) {
    case 'accepted->cancelled_pre_deposit':
    case 'placed->cancelled_pre_deposit':
      return validatePreDeposit({ engagementId, actor, context });

    case 'deposit_secured->cancelled_J7':
      return validateCancelledJ7({ engagementId, actor, context });

    case 'deposit_secured->cancelled_J30':
      return validateCancelledJ30({ engagementId, actor, context });

    default:
      return { passed: false, reason: `GUARD_UNKNOWN_TRANSITION: "${transitionKey}"` };
  }
}

// ── Validation commune (reasonCode + actorRole) ───────────────

function validateCommon({ actor, context, transitionKey }) {
  const { reasonCode, actorRole } = context;

  if (!reasonCode) {
    return {
      passed: false,
      reason: `CANCELLATION_MISSING_REASON: reasonCode obligatoire pour "${transitionKey}". ` +
               `Fournir une raison documentee. Source : D-039 · D-040.`,
    };
  }

  if (!actorRole || !AUTHORIZED_ROLES.has(actorRole)) {
    return {
      passed: false,
      reason: `CANCELLATION_UNAUTHORIZED_ROLE: actorRole "${actorRole}" non autorise ` +
               `pour une annulation. Roles autorises : ${[...AUTHORIZED_ROLES].join(', ')}.`,
    };
  }

  return null; // pas d'erreur
}

// ── accepted/placed → cancelled_pre_deposit ──────────────────
// Aucun fonds engage. Zero frais. Zero ecriture ledger.
// Source : D-039 — si annulation avant depot, aucune obligation financiere.

function validatePreDeposit({ engagementId, actor, context }) {
  const commonError = validateCommon({ actor, context, transitionKey: `*->cancelled_pre_deposit` });
  if (commonError) return commonError;

  const { reasonCode, actorRole } = context;

  const cancellationRecord = {
    systemId:        IDFactory.generate('CancellationRecord'),
    engagementId,
    cancellationType: 'PRE_DEPOSIT',
    actorRole,
    reasonCode,
    // Zero frais — aucun fonds engage
    refundAmountCents:     0,
    mrCommissionCents:     0,
    talentPaymentCents:    0,
    fraisStripeCents:      0,
    ledgerEntries:         [],
    cancelledAt:           new Date().toISOString(),
    legalBasis:            'LOI-ANNULATION-PRE-DEPOT',
  };

  return {
    passed: true,
    cancellationRecord,
    audit: {
      engagementId,
      cancellationType: 'PRE_DEPOSIT',
      reasonCode,
      zeroFinancialImpact: true,
    },
  };
}

// ── deposit_secured → cancelled_J7 ───────────────────────────
// LOI ANNULATION-02 : balance impayee a J-6, annulation automatique.
// Payeur defaillant = zero remboursement.
// MR retient sa commission (D-043 : coefficient force a 1).
// Talents payes sur depot au prorata (hors scope guard — PayoutExecutor).
// Source : D-040 · D-043

function validateCancelledJ7({ engagementId, actor, context }) {
  const commonError = validateCommon({ actor, context, transitionKey: 'deposit_secured->cancelled_J7' });
  if (commonError) return commonError;

  const {
    reasonCode,
    actorRole,
    contractSnapshotPhase1,
    // depotBrutRecuCents — montant reel recu par Stripe
    depotBrutRecuCents,
    // Si absent : on documente sans calculer les frais (SchedulerService peut omettre)
  } = context;

  // Validation : cancelled_J7 doit etre declenche par SYSTEM (scheduler) ou admin
  // Un talent ou organisateur ne peut pas s'auto-annuler sur LOI ANNULATION-02
  if (actorRole === 'talent' || actorRole === 'organisateur') {
    return {
      passed: false,
      reason: `CANCELLATION_J7_WRONG_ACTOR: cancelled_J7 est reserve au systeme automatique ` +
               `(SchedulerService, LOI ANNULATION-02) ou a un admin. ` +
               `actorRole="${actorRole}" non autorise pour cette transition.`,
    };
  }

  const cancellationRecord = {
    systemId:         IDFactory.generate('CancellationRecord'),
    engagementId,
    cancellationType: 'CANCELLED_J7',
    actorRole,
    reasonCode,
    // LOI ANNULATION-02 : payeur defaillant = zero remboursement
    refundAmountCents:       0,
    payerGetsRefund:         false,
    // MR retient sa commission — calculee par PayoutExecutor sur depot au prorata
    // Ce guard ne calcule pas le montant exact (depend du lineup) — il documente la regle
    mrRetainsCommission:     true,
    // D-043 : coefficient force a 1
    coefficientForce:        1,
    depotBrutRecuCents:      Number.isInteger(depotBrutRecuCents) ? depotBrutRecuCents : null,
    ledgerEntries:            [],  // ecritures produites par PayoutExecutor, pas par ce guard
    cancelledAt:              new Date().toISOString(),
    legalBasis:               'LOI-ANNULATION-02-D040-D043',
  };

  return {
    passed: true,
    cancellationRecord,
    audit: {
      engagementId,
      cancellationType: 'CANCELLED_J7',
      reasonCode,
      payerRefund: 0,
      mrRetainsCommission: true,
      legalBasis: 'LOI-ANNULATION-02',
    },
  };
}

// ── deposit_secured → cancelled_J30 ──────────────────────────
// LOI ANNULATION-01 : annulation > J-30.
// Remboursement total depot moins frais Stripe.
// MR ne retient aucune commission.
// Source : D-039

function validateCancelledJ30({ engagementId, actor, context }) {
  const commonError = validateCommon({ actor, context, transitionKey: 'deposit_secured->cancelled_J30' });
  if (commonError) return commonError;

  const {
    reasonCode,
    actorRole,
    depotBrutRecuCents,
    fraisStripeCents,
  } = context;

  // depotBrutRecuCents obligatoire pour LOI ANNULATION-01 (calcul remboursement)
  if (!Number.isInteger(depotBrutRecuCents) || depotBrutRecuCents <= 0) {
    return {
      passed: false,
      reason: `CANCELLATION_J30_MISSING_DEPOSIT: depotBrutRecuCents obligatoire pour ` +
               `calculer le remboursement LOI ANNULATION-01. ` +
               `Recu : ${depotBrutRecuCents}. Source : D-039.`,
    };
  }

  // fraisStripeCents : obligatoire si connu, sinon 0 (non bloquant — D-039 dit "deduire les frais")
  const fraisStripe = (Number.isInteger(fraisStripeCents) && fraisStripeCents >= 0)
    ? fraisStripeCents
    : 0;

  // LOI ANNULATION-01 : remboursePayer = depotBrut - fraisStripe
  // MoneyMath pour garantir l'arithmetique entiere (D-064)
  // D-064 : arithmetique entiere — verifier avant de soustraire
  const refundAmountCents = depotBrutRecuCents - fraisStripe;

  if (refundAmountCents < 0) {
    return {
      passed: false,
      reason: `CANCELLATION_J30_NEGATIVE_REFUND: fraisStripeCents (${fraisStripe}) > ` +
               `depotBrutRecuCents (${depotBrutRecuCents}). Impossible. Verifier les montants.`,
    };
  }

  const cancellationRecord = {
    systemId:          IDFactory.generate('CancellationRecord'),
    engagementId,
    cancellationType:  'CANCELLED_J30',
    actorRole,
    reasonCode,
    // LOI ANNULATION-01 : remboursement total moins frais Stripe
    refundAmountCents,
    depotBrutRecuCents,
    fraisStripeCents:   fraisStripe,
    mrCommissionCents:  0,    // MR ne retient aucune commission
    talentPaymentCents: 0,    // talent non paye (event annule)
    ledgerEntries:      [],
    cancelledAt:        new Date().toISOString(),
    legalBasis:         'LOI-ANNULATION-01-D039',
  };

  return {
    passed: true,
    cancellationRecord,
    audit: {
      engagementId,
      cancellationType:  'CANCELLED_J30',
      reasonCode,
      refundAmountCents,
      depotBrutRecuCents,
      fraisStripeCents:  fraisStripe,
      mrCommission:      0,
      legalBasis:        'LOI-ANNULATION-01',
    },
  };
}

export default {
validate, COVERED_TRANSITIONS, AUTHORIZED_ROLES 
};
export { validate, COVERED_TRANSITIONS, AUTHORIZED_ROLES };