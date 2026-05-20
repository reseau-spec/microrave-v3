/**
 * MICRO RAVE V3 — ArchiveWORMGuard
 * ============================================================
 * Guard pour toutes les transitions vers `archived` (Moment WORM 6, W3).
 *
 * archived = état W3 — architecturalement immuable définitif.
 * Une fois archivé, aucune transition n'est possible (WORMGuard niveau 3).
 *
 * 9 transitions couvertes :
 *   settled            → archived  [chemin nominal post-paiement]
 *   refunded           → archived  [remboursement exécuté]
 *   no_show_pre_event  → archived  [SC-NO-SHOW-PRE]
 *   deposit_failed     → archived  [SC-DEPOSIT-FAIL]
 *   cancelled_pre_deposit → archived [annulation avant dépôt]
 *   cancelled_J30      → archived  [annulation J-30 remboursée]
 *   cancelled_J7       → archived  [annulation J-7 payout prorata]
 *   withdrawn          → archived  [retrait avant accord]
 *   partially_settled  → archived  [SC-08-PARTIEL résolu]
 *
 * Principe : chaque chemin d'archivage a ses préconditions propres.
 * Le dispatch se fait sur currentState.
 * Les chemins sans argent (deposit_failed, cancelled_pre_deposit, withdrawn)
 * sont les plus simples — ils vérifient surtout l'absence d'écritures parasites.
 * Les chemins financiers vérifient que l'argent est sorti correctement.
 *
 * Ce guard NE touche PAS la database directement.
 * Il retourne { passed, archiveRecord } — la persistence appartient à l'appelant.
 *
 * Source : OS V14 · D-014 Moment 6 · SC-NO-SHOW-PRE · SC-DEPOSIT-FAIL · LOI LEDGER-02
 * ============================================================
 */

'use strict';

const IDFactory = require('../IDFactory');

const COVERED_TRANSITIONS = new Set([
  'settled->archived',
  'refunded->archived',
  'no_show_pre_event->archived',
  'deposit_failed->archived',
  'cancelled_pre_deposit->archived',
  'cancelled_J30->archived',
  'cancelled_J7->archived',
  'withdrawn->archived',
  'partially_settled->archived',
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
      reason: `GUARD_MISMATCH: ArchiveWORMGuard ne couvre pas "${transitionKey}". ` +
              `Transitions couvertes : ${[...COVERED_TRANSITIONS].join(', ')}.`,
    };
  }

  // Dispatch par état source
  switch (currentState) {
    case 'settled':
      return validateSettledToArchived({ engagementId, actor, context });
    case 'refunded':
      return validateRefundedToArchived({ engagementId, actor, context });
    case 'no_show_pre_event':
      return validateNoShowPreEventToArchived({ engagementId, actor, context });
    case 'deposit_failed':
      return validateDepositFailedToArchived({ engagementId, actor, context });
    case 'cancelled_pre_deposit':
      return validateCancelledPreDepositToArchived({ engagementId, actor, context });
    case 'cancelled_J30':
      return validateCancelledJ30ToArchived({ engagementId, actor, context });
    case 'cancelled_J7':
      return validateCancelledJ7ToArchived({ engagementId, actor, context });
    case 'withdrawn':
      return validateWithdrawnToArchived({ engagementId, actor, context });
    case 'partially_settled':
      return validatePartiallySettledToArchived({ engagementId, actor, context });
    default:
      return { passed: false, reason: `ARCHIVE_UNKNOWN_SOURCE: "${currentState}" non géré dans ArchiveWORMGuard.` };
  }
}

// ── Constructeur d'archiveRecord partagé ────────────────────
function buildArchiveRecord({ engagementId, actor, archivePath, financialSummary, notes }) {
  return {
    systemId:        IDFactory.generate('AdminAction'),
    type:            'ARCHIVE_W3',
    engagementId,
    archivePath,
    financialSummary: financialSummary || null,
    archivedByActor: actor,
    archivedAt:      new Date().toISOString(),
    wormLevel:       'W3',
    notes:           notes || null,
  };
}

// ══════════════════════════════════════════════════════════════
// settled → archived [chemin nominal]
// OS V14 : SOTS window closed · tous LedgerRecords finaux · GoNoGoDecisionRecord = GO
// ══════════════════════════════════════════════════════════════
function validateSettledToArchived({ engagementId, actor, context }) {
  const { goNoGoDecisionRecord, contractSnapshotPhase2, ledgerBalanced } = context;

  // GoNoGoDecisionRecord requis — décision formelle avant archivage définitif
  if (!goNoGoDecisionRecord) {
    return {
      passed: false,
      reason: 'ARCHIVE_MISSING_GONOGO: GoNoGoDecisionRecord absent. ' +
              'L\'archivage du chemin nominal exige une décision formelle GO. ' +
              'Source : OS V14 ligne 278.',
    };
  }
  if (goNoGoDecisionRecord.decision !== 'GO') {
    return {
      passed: false,
      reason: `ARCHIVE_GONOGO_NOT_GO: GoNoGoDecisionRecord.decision="${goNoGoDecisionRecord.decision}". ` +
              `Attendu : "GO". L'archivage est bloqué sur décision NO_GO.`,
    };
  }
  if (goNoGoDecisionRecord.engagementId !== engagementId) {
    return {
      passed: false,
      reason: `ARCHIVE_GONOGO_MISMATCH: GoNoGoDecisionRecord.engagementId="${goNoGoDecisionRecord.engagementId}" ≠ "${engagementId}".`,
    };
  }

  // Ledger équilibré requis (LOI LEDGER-02)
  if (ledgerBalanced !== true) {
    return {
      passed: false,
      reason: 'ARCHIVE_LEDGER_NOT_BALANCED: ledgerBalanced doit être true avant l\'archivage nominal. ' +
              'Vérifier que LedgerInvariantGuard a passé sur payable→settled. ' +
              'Source : LOI LEDGER-02.',
    };
  }

  const archiveRecord = buildArchiveRecord({
    engagementId, actor,
    archivePath: 'settled->archived',
    financialSummary: contractSnapshotPhase2
      ? { prixVenduClientCents: contractSnapshotPhase2.prixVenduClientCents }
      : null,
    notes: 'Chemin nominal — paiement complet, SOTS clôturé, ledger équilibré.',
  });

  return { passed: true, archiveRecord, audit: { archivePath: 'settled->archived', goNoGoDecisionRecord: goNoGoDecisionRecord.systemId } };
}

// ══════════════════════════════════════════════════════════════
// refunded → archived
// OS V14 : Remboursement exécuté · ledger équilibré
// ══════════════════════════════════════════════════════════════
function validateRefundedToArchived({ engagementId, actor, context }) {
  const { refundExecuted, ledgerBalanced } = context;

  if (!refundExecuted) {
    return {
      passed: false,
      reason: 'ARCHIVE_REFUND_NOT_EXECUTED: refundExecuted doit être true. ' +
              'Le remboursement doit avoir été exécuté avant l\'archivage. ' +
              'Source : OS V14 ligne 286.',
    };
  }
  if (ledgerBalanced !== true) {
    return {
      passed: false,
      reason: 'ARCHIVE_LEDGER_NOT_BALANCED: ledgerBalanced doit être true pour refunded→archived.',
    };
  }

  const archiveRecord = buildArchiveRecord({
    engagementId, actor,
    archivePath: 'refunded->archived',
    notes: 'Remboursement exécuté, ledger équilibré.',
  });

  return { passed: true, archiveRecord, audit: { archivePath: 'refunded->archived' } };
}

// ══════════════════════════════════════════════════════════════
// no_show_pre_event → archived [SC-NO-SHOW-PRE]
// OS V14 : reversal complet · remboursement organisateur (dépôt brut − frais Stripe)
//          Talent A = 0$ · MR = 0$ commission · DecisionRecord NO_SHOW_CONFIRMED requis
//
// SC-NO-SHOW-PRE : le talent s'est absent AVANT l'event (pre-event).
// C'est différent de no_show post-SOTS : ici MR ne conserve PAS sa commission
// (la prestation n'a jamais commencé — OS V14 section 16.1).
// ══════════════════════════════════════════════════════════════
function validateNoShowPreEventToArchived({ engagementId, actor, context }) {
  const {
    decisionRecord,
    depositRefundExecuted,      // remboursement dépôt brut − frais Stripe
    depositRefundAmountCents,   // montant remboursé
  } = context;

  // DecisionRecord NO_SHOW_CONFIRMED requis (GREFFIER-01)
  if (!decisionRecord) {
    return {
      passed: false,
      reason: 'ARCHIVE_NO_SHOW_PRE_NO_DECISION: DecisionRecord NO_SHOW_CONFIRMED absent. ' +
              '[SC-NO-SHOW-PRE] Aucune conséquence irréversible sans DecisionRecord. ' +
              'Source : GREFFIER-01 · OS V14 ligne 284.',
    };
  }
  if (decisionRecord.type !== 'NO_SHOW_CONFIRMED') {
    return {
      passed: false,
      reason: `ARCHIVE_WRONG_DECISION_TYPE: DecisionRecord.type="${decisionRecord.type}". Attendu : "NO_SHOW_CONFIRMED".`,
    };
  }

  // Remboursement dépôt exécuté
  if (!depositRefundExecuted) {
    return {
      passed: false,
      reason: 'ARCHIVE_NO_SHOW_PRE_REFUND_MISSING: depositRefundExecuted doit être true. ' +
              '[SC-NO-SHOW-PRE] Reversal complet depuis deposit_secured requis avant archivage. ' +
              'Remboursement = dépôt brut − frais Stripe. Talent = 0$. MR = 0$ commission.',
    };
  }

  if (depositRefundAmountCents !== undefined && depositRefundAmountCents !== null) {
    if (!Number.isInteger(depositRefundAmountCents) || depositRefundAmountCents <= 0) {
      return {
        passed: false,
        reason: `ARCHIVE_NO_SHOW_PRE_REFUND_INVALID: depositRefundAmountCents=${depositRefundAmountCents} invalide. Standard D-064.`,
      };
    }
  }

  // Écritures comptables SC-NO-SHOW-PRE (waterfall documenté)
  // Talent = 0$ · MR = 0$ commission · Organisateur = dépôt brut − frais Stripe
  // Comptes : 4310 (dette talent → 0), 4530 (revenus différés MR → 0), 4320 (remboursement)
  const ledgerEntries = [
    { account: '4310', direction: 'DEBIT',  amountCents: 0,                       note: '[SC-NO-SHOW-PRE] Talent = 0$ — aucune dette à honorer' },
    { account: '4530', direction: 'DEBIT',  amountCents: 0,                       note: '[SC-NO-SHOW-PRE] MR = 0$ commission — prestation jamais commencée' },
    { account: '4320', direction: 'DEBIT',  amountCents: depositRefundAmountCents || 0, note: '[SC-NO-SHOW-PRE] Remboursement organisateur : dépôt brut − frais Stripe' },
  ];

  const archiveRecord = buildArchiveRecord({
    engagementId, actor,
    archivePath: 'no_show_pre_event->archived',
    financialSummary: {
      talentPaymentCents:    0,
      mrCommissionCents:     0,
      depositRefundCents:    depositRefundAmountCents || null,
      scenario:              'SC-NO-SHOW-PRE',
    },
    notes: '[SC-NO-SHOW-PRE] No-show pré-event. Reversal complet. Talent=0$. MR=0$.',
  });
  archiveRecord.ledgerEntries = ledgerEntries;

  return {
    passed: true, archiveRecord,
    audit: { archivePath: 'no_show_pre_event->archived', scenario: 'SC-NO-SHOW-PRE', decisionRecordId: decisionRecord.systemId },
  };
}

// ══════════════════════════════════════════════════════════════
// deposit_failed → archived [SC-DEPOSIT-FAIL]
// OS V14 : Aucun fonds · zéro écriture ledger · ReputationLedger organisateur mis à jour
// ══════════════════════════════════════════════════════════════
function validateDepositFailedToArchived({ engagementId, actor, context }) {
  const { stripeFailureConfirmed, noLedgerEntries } = context;

  // Confirmation Stripe failure requise
  if (!stripeFailureConfirmed) {
    return {
      passed: false,
      reason: 'ARCHIVE_DEPOSIT_FAIL_UNCONFIRMED: stripeFailureConfirmed doit être true. ' +
              '[SC-DEPOSIT-FAIL] L\'échec Stripe doit être confirmé (webhook payment_intent.payment_failed). ' +
              'Source : OS V14 ligne 260.',
    };
  }

  // Vérification zéro écriture ledger — aucun argent n'a circulé
  if (noLedgerEntries !== true) {
    return {
      passed: false,
      reason: 'ARCHIVE_DEPOSIT_FAIL_LEDGER_EXISTS: noLedgerEntries doit être true. ' +
              '[SC-DEPOSIT-FAIL] Aucun fonds capturé → zéro écriture ledger. ' +
              'Des écritures ledger indiquent une incohérence dans la machine d\'état. ' +
              'Source : OS V14 ligne 265.',
    };
  }

  // SC-DEPOSIT-FAIL : pas d'écritures comptables (aucun argent)
  const archiveRecord = buildArchiveRecord({
    engagementId, actor,
    archivePath: 'deposit_failed->archived',
    financialSummary: {
      talentPaymentCents: 0,
      mrCommissionCents:  0,
      scenario:           'SC-DEPOSIT-FAIL',
      note:               'Aucun fonds capturé — zéro écriture ledger.',
    },
    notes: '[SC-DEPOSIT-FAIL] Échec Stripe. Aucun fonds. Zéro écriture ledger.',
  });

  return {
    passed: true, archiveRecord,
    audit: { archivePath: 'deposit_failed->archived', scenario: 'SC-DEPOSIT-FAIL' },
  };
}

// ══════════════════════════════════════════════════════════════
// cancelled_pre_deposit → archived
// OS V14 : Aucun fonds · SchedulerDueTasks annulées
// ══════════════════════════════════════════════════════════════
function validateCancelledPreDepositToArchived({ engagementId, actor, context }) {
  const { schedulerTasksCancelled } = context;

  if (schedulerTasksCancelled !== true) {
    return {
      passed: false,
      reason: 'ARCHIVE_CANCELLED_TASKS_PENDING: schedulerTasksCancelled doit être true. ' +
              'Toutes les SchedulerDueTasks associées doivent être annulées avant l\'archivage. ' +
              'Source : OS V14 ligne 266.',
    };
  }

  const archiveRecord = buildArchiveRecord({
    engagementId, actor,
    archivePath: 'cancelled_pre_deposit->archived',
    notes: 'Annulation avant dépôt. Aucun fonds. SchedulerDueTasks annulées.',
  });

  return { passed: true, archiveRecord, audit: { archivePath: 'cancelled_pre_deposit->archived' } };
}

// ══════════════════════════════════════════════════════════════
// cancelled_J30 → archived
// OS V14 : Remboursement exécuté · ledger équilibré
// ══════════════════════════════════════════════════════════════
function validateCancelledJ30ToArchived({ engagementId, actor, context }) {
  const { refundExecuted, ledgerBalanced } = context;

  if (!refundExecuted) {
    return {
      passed: false,
      reason: 'ARCHIVE_J30_REFUND_MISSING: refundExecuted doit être true. ' +
              'Le remboursement J-30 doit avoir été exécuté avant l\'archivage.',
    };
  }
  if (ledgerBalanced !== true) {
    return {
      passed: false,
      reason: 'ARCHIVE_J30_LEDGER_NOT_BALANCED: ledgerBalanced doit être true pour cancelled_J30→archived.',
    };
  }

  const archiveRecord = buildArchiveRecord({
    engagementId, actor,
    archivePath: 'cancelled_J30->archived',
    notes: 'Annulation J-30. Remboursement exécuté. Ledger équilibré.',
  });

  return { passed: true, archiveRecord, audit: { archivePath: 'cancelled_J30->archived' } };
}

// ══════════════════════════════════════════════════════════════
// cancelled_J7 → archived
// OS V14 : Payout prorata talents exécuté · ledger équilibré
// ══════════════════════════════════════════════════════════════
function validateCancelledJ7ToArchived({ engagementId, actor, context }) {
  const { payoutProrataExecuted, ledgerBalanced } = context;

  if (!payoutProrataExecuted) {
    return {
      passed: false,
      reason: 'ARCHIVE_J7_PAYOUT_MISSING: payoutProrataExecuted doit être true. ' +
              'Le payout prorata des talents doit avoir été exécuté avant l\'archivage J-7. ' +
              'Source : OS V14 ligne 268.',
    };
  }
  if (ledgerBalanced !== true) {
    return {
      passed: false,
      reason: 'ARCHIVE_J7_LEDGER_NOT_BALANCED: ledgerBalanced doit être true pour cancelled_J7→archived.',
    };
  }

  const archiveRecord = buildArchiveRecord({
    engagementId, actor,
    archivePath: 'cancelled_J7->archived',
    notes: 'Annulation J-7. Payout prorata talents exécuté. Ledger équilibré.',
  });

  return { passed: true, archiveRecord, audit: { archivePath: 'cancelled_J7->archived' } };
}

// ══════════════════════════════════════════════════════════════
// withdrawn → archived
// OS V14 : retrait avant accord · aucun fonds
// ══════════════════════════════════════════════════════════════
function validateWithdrawnToArchived({ engagementId, actor, context }) {
  // withdrawn = talent ou organisateur s'est retiré avant proposed→accepted
  // Pas de fonds capturés → archivage simple
  const archiveRecord = buildArchiveRecord({
    engagementId, actor,
    archivePath: 'withdrawn->archived',
    notes: 'Retrait avant accord. Aucun fonds impliqué.',
  });

  return { passed: true, archiveRecord, audit: { archivePath: 'withdrawn->archived' } };
}

// ══════════════════════════════════════════════════════════════
// partially_settled → archived [SC-08-PARTIEL résolu]
// OS V14 : Ledger équilibré · LOI LEDGER-02 vérifiée
// ══════════════════════════════════════════════════════════════
function validatePartiallySettledToArchived({ engagementId, actor, context }) {
  const { ledgerBalanced, disputeResolutionRecord } = context;

  if (!disputeResolutionRecord) {
    return {
      passed: false,
      reason: 'ARCHIVE_PARTIAL_NO_RESOLUTION: disputeResolutionRecord absent. ' +
              '[SC-08-PARTIEL] La résolution partielle exige un DecisionRecord DISPUTE_RESOLVED_PARTIAL. ' +
              'Source : OS V14 ligne 290.',
    };
  }
  if (ledgerBalanced !== true) {
    return {
      passed: false,
      reason: 'ARCHIVE_PARTIAL_LEDGER_NOT_BALANCED: ledgerBalanced doit être true. ' +
              'LOI LEDGER-02 doit être vérifiée avant archivage d\'une résolution partielle.',
    };
  }

  const archiveRecord = buildArchiveRecord({
    engagementId, actor,
    archivePath: 'partially_settled->archived',
    financialSummary: {
      scenario: 'SC-08-PARTIEL',
      deliveryRecognizedRatio: disputeResolutionRecord.deliveryRecognizedRatio || null,
    },
    notes: '[SC-08-PARTIEL] Résolution partielle archivée. Ledger équilibré.',
  });

  return {
    passed: true, archiveRecord,
    audit: { archivePath: 'partially_settled->archived', scenario: 'SC-08-PARTIEL', disputeResolutionRecordId: disputeResolutionRecord.systemId },
  };
}

module.exports = { validate, COVERED_TRANSITIONS };