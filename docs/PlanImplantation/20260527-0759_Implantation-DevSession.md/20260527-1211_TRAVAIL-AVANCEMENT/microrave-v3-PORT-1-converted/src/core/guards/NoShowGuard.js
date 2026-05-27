/**
 * MICRO RAVE V3 — NoShowGuard
 * ============================================================
 * Guard pour deux transitions :
 *   sots_window_closed → no_show    (confirmation absence post-SOTS)
 *   no_show → refunded              (déclenchement remboursement organisateur)
 *
 * LOI NO-SHOW-01 (OS V14 section 16.1, D-147, CT-014) :
 *   No-show confirmé =
 *     - Talent : 0$ (aucun paiement)
 *     - Organisateur : remboursé du cachet_net_final du talent absent
 *     - Micro Rave : conserve sa commission sur ce talent
 *   cachet_net_final = cachet_brut_final_i − commission_MR_i
 *   Base = ContractSnapshot phase 2 (WORM W2, gravé à event_sealed)
 *   Les Engagements des autres talents ne sont PAS affectés (D-044).
 *
 * GREFFIER-01 (VT-04, F-05) :
 *   Aucune conséquence réputationnelle irréversible sans DecisionRecord.
 *   Ce guard crée un DecisionRecord NO_SHOW_CONFIRMED retourné à l'appelant.
 *   L'appelant est responsable de le persister en database.
 *
 * Déclencheur (F-05 résolu) :
 *   La transition sots_window_closed→no_show est déclenchée par SchedulerDueTask
 *   après fermeture de la fenêtre SOTS sans SOTSSubmission du talent.
 *   Acteur autorisé : system (scheduler) ou admin avec AdminActionRecord.
 *
 * Ce guard NE touche PAS la database directement.
 * Il retourne { passed, decisionRecord, refundInstruction } à l'appelant.
 *
 * Source : LOI NO-SHOW-01 · D-041 · D-044 · D-147 · CT-014 · OS V14
 * ============================================================
 */

'use strict';

import IDFactory from '../IDFactory.js';
import MoneyMath from '../MoneyMath.js';
const COVERED_TRANSITIONS = new Set([
  'sots_window_closed->no_show',
  'no_show->refunded',
]);

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
      reason: `GUARD_MISMATCH: NoShowGuard ne couvre pas "${transitionKey}". ` +
              `Transitions couvertes : ${[...COVERED_TRANSITIONS].join(', ')}.`,
    };
  }

  // Dispatch selon la transition
  if (transitionKey === 'sots_window_closed->no_show') {
    return validateNoShowConfirmation({ engagementId, actor, context });
  }

  return validateRefundTrigger({ engagementId, actor, context });
}

// ══════════════════════════════════════════════════════════════
// TRANSITION 1 : sots_window_closed → no_show
// Confirme l'absence et crée le DecisionRecord NO_SHOW_CONFIRMED.
// Déclenché par SchedulerDueTask ou admin.
// ══════════════════════════════════════════════════════════════
function validateNoShowConfirmation({ engagementId, actor, context }) {
  const {
    triggerSource,       // 'SCHEDULER' | 'ADMIN'
    sotsSubmission,      // null attendu — si présent, le talent a soumis → pas un no-show
    contractSnapshotPhase2,
    adminActionRecordId, // requis si triggerSource === 'ADMIN'
  } = context;

  // ── Vérification déclencheur autorisé ────────────────────
  // GREFFIER-01 : décision irréversible → source documentée obligatoire
  const validSources = ['SCHEDULER', 'ADMIN'];
  if (!triggerSource || !validSources.includes(triggerSource)) {
    return {
      passed: false,
      reason: `NO_SHOW_TRIGGER_INVALID: triggerSource="${triggerSource}" non autorisé. ` +
              `Valeurs valides : ${validSources.join(', ')}. ` +
              `Le no-show est déclenché par SchedulerDueTask (SCHEDULER) ou admin (ADMIN). ` +
              `Source : GREFFIER-01, F-05.`,
    };
  }

  // Si déclencheur admin : AdminActionRecord requis pour traçabilité
  if (triggerSource === 'ADMIN' && !adminActionRecordId) {
    return {
      passed: false,
      reason: 'NO_SHOW_ADMIN_RECORD_MISSING: triggerSource="ADMIN" exige adminActionRecordId. ' +
              'Aucune conséquence réputationnelle irréversible sans trace administrative. ' +
              'Source : GREFFIER-01 (VT-04).',
    };
  }

  // ── Vérification absence réelle de SOTSSubmission ────────
  // Si le talent a soumis son SOTS, ce n'est pas un no-show
  if (sotsSubmission) {
    return {
      passed: false,
      reason: 'NO_SHOW_SOTS_PRESENT: Le talent a soumis une SOTSSubmission. ' +
              'Ce n\'est pas un no-show — le chemin passe par contestation_window. ' +
              `SOTSSubmission ID: ${sotsSubmission.id || 'inconnu'}.`,
    };
  }

  // ── ContractSnapshot phase 2 requis ──────────────────────
  if (!contractSnapshotPhase2) {
    return {
      passed: false,
      reason: 'NO_SHOW_MISSING_SNAPSHOT: contractSnapshotPhase2 absent. ' +
              'Le ContractSnapshot W2 est requis pour calculer cachet_net_final ' +
              'et documenter l\'impact financier dans le DecisionRecord. ' +
              'Source : D-147, CT-014.',
    };
  }

  const { cachetBrutFinalCents, commissionMrCents, talentUserId, tauxPpm } = contractSnapshotPhase2;

  if (!talentUserId) {
    return {
      passed: false,
      reason: 'NO_SHOW_SNAPSHOT_INCOMPLETE: contractSnapshotPhase2.talentUserId absent.',
    };
  }

  if (!Number.isInteger(cachetBrutFinalCents) || cachetBrutFinalCents <= 0) {
    return {
      passed: false,
      reason: `NO_SHOW_INVALID_AMOUNT: cachetBrutFinalCents=${cachetBrutFinalCents} ` +
              `doit être un entier > 0 (ContractSnapshot phase 2, WORM W2). Standard D-064.`,
    };
  }

  if (!Number.isInteger(commissionMrCents) || commissionMrCents < 0) {
    return {
      passed: false,
      reason: `NO_SHOW_INVALID_COMMISSION: commissionMrCents=${commissionMrCents} ` +
              `doit être un entier >= 0. Standard D-064.`,
    };
  }

  // ── Calcul cachet_net_final (LOI NO-SHOW-01, CT-014) ─────
  // cachet_net_final = cachet_brut_final_i − commission_MR_i
  // Base = ContractSnapshot phase 2 (WORM W2)
  const cachetNetFinalCents = cachetBrutFinalCents - commissionMrCents;

  if (cachetNetFinalCents < 0) {
    return {
      passed: false,
      reason: `NO_SHOW_NET_NEGATIVE: cachet_net_final=${cachetNetFinalCents} cents < 0. ` +
              `commissionMrCents(${commissionMrCents}) > cachetBrutFinalCents(${cachetBrutFinalCents}). ` +
              `Corruption du ContractSnapshot phase 2 détectée.`,
    };
  }

  // ── Construction du DecisionRecord NO_SHOW_CONFIRMED ─────
  // GREFFIER-01 : toute conséquence réputationnelle irréversible
  // exige un DecisionRecord. L'appelant le persiste en database.
  const decisionRecord = {
    systemId:           IDFactory.generate('AdminAction'),   // AdminAction préfixe ADM pour DecisionRecord
    type:               'NO_SHOW_CONFIRMED',
    engagementId,
    talentUserId,
    triggerSource,
    adminActionRecordId: adminActionRecordId || null,
    createdByActor:     actor,
    createdAt:          new Date().toISOString(),
    // Impact financier documenté (LOI NO-SHOW-01)
    financialImpact: {
      talentPaymentCents:        0,              // talent = 0$
      organizerRefundCents:      cachetNetFinalCents,  // remboursement = cachet_net_final
      mrCommissionRetainedCents: commissionMrCents,    // MR conserve sa commission
      cachetBrutFinalCents,
      cachetNetFinalCents,
      basis: 'CONTRACT_SNAPSHOT_PHASE_2_WORM_W2',      // CT-014 : base = phase 2, pas phase 1
    },
    // Impact réputationnel WORM (irréversible)
    reputationalImpact: {
      talentUserId,
      entry: 'NO_SHOW_CONFIRMED',
      wormLevel: 'W1',
      note: 'Absence confirmée post-SOTS. Impact réputationnel permanent. Source : D-018.',
    },
  };

  return {
    passed: true,
    decisionRecord,
    audit: {
      transitionKey:         'sots_window_closed->no_show',
      triggerSource,
      talentUserId,
      cachetBrutFinalCents,
      commissionMrCents,
      cachetNetFinalCents,
      talentPaymentCents:    0,
      organizerRefundCents:  cachetNetFinalCents,
    },
  };
}

// ══════════════════════════════════════════════════════════════
// TRANSITION 2 : no_show → refunded
// Déclenche le remboursement organisateur.
// Le DecisionRecord NO_SHOW_CONFIRMED doit déjà exister.
// ══════════════════════════════════════════════════════════════
function validateRefundTrigger({ engagementId, actor, context }) {
  const {
    decisionRecord,          // DecisionRecord NO_SHOW_CONFIRMED existant (requis)
    contractSnapshotPhase2,
    payerUserId,             // Destinataire du remboursement
  } = context;

  // ── DecisionRecord requis (GREFFIER-01) ──────────────────
  if (!decisionRecord) {
    return {
      passed: false,
      reason: 'NO_SHOW_REFUND_NO_DECISION: DecisionRecord NO_SHOW_CONFIRMED absent. ' +
              'Le remboursement ne peut pas être déclenché sans DecisionRecord préalable. ' +
              'La transition sots_window_closed→no_show doit avoir eu lieu. ' +
              'Source : GREFFIER-01 (VT-04).',
    };
  }

  if (decisionRecord.type !== 'NO_SHOW_CONFIRMED') {
    return {
      passed: false,
      reason: `NO_SHOW_WRONG_DECISION_TYPE: DecisionRecord.type="${decisionRecord.type}". ` +
              `Attendu : "NO_SHOW_CONFIRMED".`,
    };
  }

  if (decisionRecord.engagementId !== engagementId) {
    return {
      passed: false,
      reason: `NO_SHOW_DECISION_MISMATCH: DecisionRecord.engagementId="${decisionRecord.engagementId}" ` +
              `≠ engagementId="${engagementId}". Corruption détectée.`,
    };
  }

  // ── ContractSnapshot phase 2 requis ──────────────────────
  if (!contractSnapshotPhase2) {
    return {
      passed: false,
      reason: 'NO_SHOW_REFUND_MISSING_SNAPSHOT: contractSnapshotPhase2 absent. ' +
              'Requis pour construire l\'instruction de remboursement. Source : CT-014.',
    };
  }

  // ── Payeur requis ─────────────────────────────────────────
  if (!payerUserId) {
    return {
      passed: false,
      reason: 'NO_SHOW_REFUND_MISSING_PAYER: payerUserId absent. ' +
              'Le destinataire du remboursement doit être identifié.',
    };
  }

  const { cachetBrutFinalCents, commissionMrCents } = contractSnapshotPhase2;
  const cachetNetFinalCents = cachetBrutFinalCents - commissionMrCents;

  // Cohérence avec le DecisionRecord
  if (decisionRecord.financialImpact?.organizerRefundCents !== cachetNetFinalCents) {
    return {
      passed: false,
      reason: `NO_SHOW_REFUND_AMOUNT_MISMATCH: DecisionRecord.organizerRefundCents=` +
              `${decisionRecord.financialImpact?.organizerRefundCents} ≠ ` +
              `cachetNetFinalCents calculé=${cachetNetFinalCents}. ` +
              `Vérifier la cohérence entre DecisionRecord et ContractSnapshot phase 2.`,
    };
  }

  // ── Construction de l'instruction de remboursement ───────
  // L'appelant persiste cette instruction en database (LOI LEDGER-01)
  const refundInstruction = {
    systemId:             IDFactory.generate('PayoutExecution'),
    type:                 'NO_SHOW_REFUND',
    engagementId,
    decisionRecordId:     decisionRecord.systemId,
    payerUserId,
    refundAmountCents:    cachetNetFinalCents,   // cachet_net_final (CT-014)
    mrCommissionCents:    commissionMrCents,     // MR conserve (LOI NO-SHOW-01)
    talentPaymentCents:   0,                     // talent = 0$
    createdByActor:       actor,
    createdAt:            new Date().toISOString(),
    // Écritures comptables (D-070, plan comptable)
    ledgerEntries: [
      { account: '4310', direction: 'DEBIT',  amountCents: cachetNetFinalCents,  note: 'Annulation dette talent — no-show confirmé' },
      { account: '4530', direction: 'CREDIT', amountCents: commissionMrCents,    note: 'Commission MR conservée — no-show (LOI NO-SHOW-01)' },
      { account: '4320', direction: 'DEBIT',  amountCents: cachetNetFinalCents,  note: 'Remboursement organisateur — cachet_net_final (CT-014)' },
    ],
  };

  return {
    passed: true,
    refundInstruction,
    audit: {
      transitionKey:          'no_show->refunded',
      payerUserId,
      refundAmountCents:      cachetNetFinalCents,
      mrCommissionRetained:   commissionMrCents,
      talentPaymentCents:     0,
      decisionRecordId:       decisionRecord.systemId,
      basis:                  'CONTRACT_SNAPSHOT_PHASE_2_WORM_W2',
    },
  };
}

export default {
validate, COVERED_TRANSITIONS 
};
export { validate, COVERED_TRANSITIONS };