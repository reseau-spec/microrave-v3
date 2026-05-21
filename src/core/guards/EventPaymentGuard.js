/**
 * MICRO RAVE V3 — EventPaymentGuard
 * ============================================================
 * Guard spécifique aux transitions de paiement :
 *   - placed → deposit_pending       (calcul dépôt 20%)
 *   - deposit_pending → deposit_secured (confirmation Stripe + SchedulerDueTask)
 *   - deposit_pending → deposit_failed  (SC-DEPOSIT-FAIL)
 *
 * Source : OS V14 · D-014-A
 * [D-014-A] deposit_pending → deposit_secured :
 *   SchedulerDueTask `balance_deadline_check` créée au passage de ce moment.
 *   Surveillance solde activée. Notifications progressives armées.
 *   Sans cette tâche, LOI ANNULATION-02 ne s'arme jamais.
 *   La tâche est retournée dans le résultat — l'appelant la persiste
 *   via repositories.scheduler.createTask() (transitionEngagement.js après Guard 5).
 *
 * CONTRAT D'INTERFACE — totalCents :
 *   totalCents = prix_vendu_client TTC
 *   = prix_vendu_HT + TPS + TVQ + frais_Stripe
 *   C'est le montant réel encaissé sur la carte du client.
 *   Source : OS V10 section 3.3 LOI WATERFALL-01
 *      ici OS V10 référence l'origine historique de LOI WATERFALL-01, pas la version du guard. Acceptable pour l'instant, à normaliser lors d'une passe de nettoyage documentaire Phase 3.
 *
 * TOLÉRANCE STRIPE (deposit_pending→deposit_secured) :
 *   Stripe peut arrondir de ±2 centimes selon devise et réseau.
 *   Écart ≤ 2 centimes : accepté avec console.warn.
 *   Écart > 2 centimes : DEPOSIT_AMOUNT_MISMATCH bloquant.
 *
 * Standard numérique invariant :
 *   - Montants en centimes entiers (jamais float) (D-064)
 *   - Taux en ppm (jamais float) (D-064)
 *   Source : OS V14 section 3.2
 * ============================================================
 */

'use strict';

const IDFactory = require('../IDFactory');
const MoneyMath = require('../MoneyMath');

const STRIPE_TOLERANCE_CENTS = 2;

const COVERED_TRANSITIONS = new Set([
  'placed->deposit_pending',
  'deposit_pending->deposit_secured',
  'deposit_pending->deposit_failed',  // [SC-DEPOSIT-FAIL] webhook Stripe payment_intent.payment_failed
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
      reason: `GUARD_MISMATCH: EventPaymentGuard ne couvre pas "${transitionKey}". ` +
              `Transitions couvertes : ${[...COVERED_TRANSITIONS].join(', ')}`,
    };
  }

  switch (transitionKey) {
    case 'placed->deposit_pending':
      return validateDepositCreation({ engagementId, actor, context });
    case 'deposit_pending->deposit_secured':
      // [D-014-A] repositories requis pour lire balanceDeadlineDays — fail-closed si absent
      return validateDepositConfirmation({ engagementId, actor, context, repositories });
    case 'deposit_pending->deposit_failed':
      return validateDepositFailure({ engagementId, actor, context });
    default:
      return { passed: false, reason: `GUARD_UNKNOWN_TRANSITION: "${transitionKey}"` };
  }
}

// ── placed → deposit_pending ──────────────────────────────────
// totalCents = prix_vendu_client TTC (TPS + TVQ + frais Stripe inclus)
// Source : OS V10 section 3.3 LOI WATERFALL-01
function validateDepositCreation({ engagementId, actor, context }) {
  const {
    eventId,
    contractSnapshotId,
    totalCents,
    depositRatioPpm,
    eventPaymentCapCents,
  } = context;

  if (!contractSnapshotId || !contractSnapshotId.startsWith('CS1-')) {
    return {
      passed: false,
      reason: 'MISSING_CONTRACT_SNAPSHOT: ContractSnapshot phase 1 (CS1-*) obligatoire.',
    };
  }

  if (!eventId || !eventId.startsWith('EVT-')) {
    return {
      passed: false,
      reason: `MISSING_EVENT: eventId valide (EVT-*) obligatoire. Reçu : "${eventId}"`,
    };
  }

  if (!Number.isInteger(totalCents) || totalCents <= 0) {
    return {
      passed: false,
      reason: `INVALID_TOTAL: totalCents doit être un entier positif en centimes TTC. ` +
              `Reçu : ${totalCents}. ` +
              `Rappel : totalCents = prix_vendu_HT + TPS + TVQ + frais_Stripe (OS V10 section 3.3).`,
    };
  }

  if (!Number.isInteger(eventPaymentCapCents) || eventPaymentCapCents <= 0) {
    return {
      passed: false,
      reason: 'MISSING_CAP: eventPaymentCapCents obligatoire. Provient de getConfig("event_payment_cap_cents").',
    };
  }

  if (totalCents > eventPaymentCapCents) {
    return {
      passed: false,
      reason: `PAYMENT_CAP_EXCEEDED: Total ${totalCents} centimes > plafond MVP ` +
              `${eventPaymentCapCents} centimes. SoloFounderOverride requis. ` +
              `Source : OS V10 section 9.6.`,
    };
  }

  if (!Number.isInteger(depositRatioPpm) || depositRatioPpm <= 0 || depositRatioPpm > 1_000_000) {
    return {
      passed: false,
      reason: `INVALID_DEPOSIT_RATIO: depositRatioPpm entier entre 1 et 1 000 000. ` +
              `Reçu : ${depositRatioPpm}. Provient de getConfig("deposit_ratio_ppm").`,
    };
  }

  const depositCents    = MoneyMath.depositAmount(totalCents, depositRatioPpm);
  const balanceDueCents = totalCents - depositCents;

  if (depositCents <= 0) {
    return {
      passed: false,
      reason: `DEPOSIT_ZERO: Dépôt calculé = 0. total=${totalCents}, ratio=${depositRatioPpm}ppm.`,
    };
  }

  return {
    passed: true,
    depositCents,
    balanceDueCents,
    audit: { totalCents, depositRatioPpm, depositCents, balanceDueCents, eventPaymentCapCents },
  };
}

// ── deposit_pending → deposit_secured ────────────────────────
// Confirmation webhook Stripe payment_intent.succeeded
// Moment WORM 2 — "Liaison contractuelle des parties"
// Source : OS V14 · D-014-A
// Tolérance Stripe ±2 centimes
//
// [D-014-A] SchedulerDueTask balance_deadline_check :
//   Créée ici, retournée dans le résultat, persistée par l'appelant.
//   dueAt = Date.now() + balanceDeadlineDays × 86_400_000
//   balanceDeadlineDays lu depuis repositories.policyConfig.getConfig('balanceDeadlineDays')
//   Fail-closed si config absente — jamais de valeur par défaut silencieuse.
async function validateDepositConfirmation({ engagementId, actor, context, repositories }) {
  const {
    stripePaymentIntentId,
    confirmedAmountCents,
    expectedDepositCents,
  } = context;

  if (!stripePaymentIntentId) {
    return {
      passed: false,
      reason: 'MISSING_STRIPE_INTENT: stripePaymentIntentId obligatoire (webhook Stripe validé).',
    };
  }

  if (!Number.isInteger(confirmedAmountCents) || confirmedAmountCents <= 0) {
    return {
      passed: false,
      reason: `INVALID_CONFIRMED_AMOUNT: confirmedAmountCents entier positif. Reçu : ${confirmedAmountCents}.`,
    };
  }

  if (!Number.isInteger(expectedDepositCents) || expectedDepositCents <= 0) {
    return {
      passed: false,
      reason: `INVALID_EXPECTED_DEPOSIT: expectedDepositCents entier positif. Reçu : ${expectedDepositCents}.`,
    };
  }

  const ecart = Math.abs(confirmedAmountCents - expectedDepositCents);

  if (ecart > STRIPE_TOLERANCE_CENTS) {
    return {
      passed: false,
      reason: `DEPOSIT_AMOUNT_MISMATCH: Montant confirmé (${confirmedAmountCents}) ` +
              `vs attendu (${expectedDepositCents}) — écart ${ecart} centimes ` +
              `dépasse la tolérance de ${STRIPE_TOLERANCE_CENTS} centimes. ` +
              `Vérifier manuellement — AdminIncidentRecord recommandé.`,
    };
  }

  if (ecart > 0) {
    console.warn(
      `[EventPaymentGuard] Arrondi Stripe accepté : confirmé=${confirmedAmountCents}, ` +
      `attendu=${expectedDepositCents}, écart=${ecart} centime(s). EngagementId: ${engagementId}`
    );
  }

  // ── [D-014-A] SchedulerDueTask balance_deadline_check ─────
  // Lire balanceDeadlineDays depuis la config — fail-closed si absent.
  // Source : D-014-A · OS V15 §2.7 tableau ligne deposit_pending→deposit_secured
  const policyConfig = repositories.policyConfig;
  if (!policyConfig || typeof policyConfig.getConfig !== 'function') {
    return {
      passed: false,
      reason: 'MISSING_POLICY_CONFIG: repositories.policyConfig.getConfig() requis pour ' +
              'lire balanceDeadlineDays. [D-014-A] SchedulerDueTask balance_deadline_check ' +
              'ne peut pas être créée sans cette config.',
    };
  }

  // getConfig est fail-closed — lève POLICY_CONFIG_MISSING si clé absente
  const balanceDeadlineDays = await policyConfig.getConfig('balanceDeadlineDays');

  if (!Number.isInteger(balanceDeadlineDays) || balanceDeadlineDays <= 0) {
    return {
      passed: false,
      reason: `INVALID_BALANCE_DEADLINE: balanceDeadlineDays="${balanceDeadlineDays}" ` +
              `doit être un entier > 0. Source : D-014-A · policy-config-schema.js.`,
    };
  }

  // Construire la SchedulerDueTask — l'appelant la persiste via repositories.scheduler
  const schedulerTask = {
    systemId:      IDFactory.generate('SchedulerDueTask'),
    taskType:      'BALANCE_DEADLINE_CHECK',
    engagementId,
    dueAt:         Date.now() + balanceDeadlineDays * 86_400_000,
    status:        'pending',
    attemptCount:  0,
    lockedByRunId: null,
    // Traçabilité — permet au dispatcher de retrouver l'origine
    sourceEventType: 'deposit_pending->deposit_secured',
    policyId:        'balanceDeadlineDays',
    createdAt:       new Date().toISOString(),
  };

  return {
    passed: true,
    schedulerTask,
    audit: {
      stripePaymentIntentId,
      confirmedAmountCents,
      expectedDepositCents,
      ecart,
      balanceDeadlineDays,
      schedulerTaskSystemId: schedulerTask.systemId,
      schedulerTaskDueAt:    schedulerTask.dueAt,
    },
  };
}

// ── deposit_pending → deposit_failed ─────────────────────────
// [SC-DEPOSIT-FAIL] Webhook Stripe payment_intent.payment_failed
// Source : OS V14 ligne 260 — aucun fonds capturé, zéro écriture ledger
// EPR.status = FAILED · SchedulerDueTasks = CANCELLED
function validateDepositFailure({ engagementId, actor, context }) {
  const {
    stripePaymentIntentId,
    stripeFailureCode,
    stripeFailureMessage,
  } = context;

  if (!stripePaymentIntentId) {
    return {
      passed: false,
      reason: 'DEPOSIT_FAIL_MISSING_INTENT: stripePaymentIntentId obligatoire pour ' +
              "documenter l'échec Stripe. Source : D-097 règle 1 — traçabilité complète.",
    };
  }

  if (!stripeFailureCode) {
    return {
      passed: false,
      reason: 'DEPOSIT_FAIL_MISSING_CODE: stripeFailureCode obligatoire. ' +
              'Doit provenir du webhook Stripe payment_intent.payment_failed. ' +
              '[SC-DEPOSIT-FAIL] Source : OS V14 ligne 260.',
    };
  }

  return {
    passed: true,
    failureRecord: {
      stripePaymentIntentId,
      stripeFailureCode,
      stripeFailureMessage: stripeFailureMessage || null,
      failedAt:             new Date().toISOString(),
      scenario:             'SC-DEPOSIT-FAIL',
      ledgerEntries:        [],  // zéro écriture ledger (OS V14 [SC-DEPOSIT-FAIL])
    },
    audit: {
      engagementId,
      stripePaymentIntentId,
      stripeFailureCode,
      noFundsCaptured: true,
      zeroLedgerEntries: true,
    },
  };
}

module.exports = { validate, COVERED_TRANSITIONS, STRIPE_TOLERANCE_CENTS };