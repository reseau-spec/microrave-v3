/**
 * MICRO RAVE V3 — SignalConsumerService
 * ============================================================
 * Consommateur des StripePaymentSignal non traités.
 *
 * Source : Plan d'implantation Phase 0.1 · D-097 · WebhookProcessor.js
 *
 * PROBLÈME RÉSOLU (Phase 0.1) :
 *   WebhookProcessor persiste le signal dans StripePaymentSignal.
 *   Sans ce service, le signal restait `processed: false` indéfiniment.
 *   Le dépôt Stripe confirmé ne faisait jamais avancer la machine d'état.
 *
 * RESPONSABILITÉS :
 *   1. Lire les StripePaymentSignal où processed = false
 *   2. Retrouver l'Engagement via engagementId
 *   3. Appeler transitionEngagement() avec le contexte approprié
 *   4. Marquer le signal processed = true
 *   5. En cas d'échec : créer un AdminIncidentRecord, NE PAS marquer consumed
 *
 * RÈGLE ARCHITECTURE :
 *   Ce service ne contient AUCUNE logique financière.
 *   Toute logique métier est dans les guards via transitionEngagement().
 *   Ce service est un câblage, pas un guard.
 *
 * APPEL :
 *   L'appelant Base44 (fonction API ou cron) appelle
 *   SignalConsumerService.processUnhandledSignals() après chaque webhook reçu.
 *
 * Signals couverts :
 *   payment_intent.succeeded  → deposit_pending → deposit_secured
 *   payment_intent.payment_failed → deposit_pending → deposit_failed
 *
 * Source : D-097 · WebhookProcessor.js · transitionEngagement.js
 * ============================================================
 */

'use strict';

const { transitionEngagement } = require('../core/transitionEngagement');

// ── Acteur système pour les transitions déclenchées par webhook ──
// Le webhook Stripe EST l'acteur — on utilise un ID système souverain.
// Source : D-097 règle 1 — traçabilité complète.
const SYSTEM_ACTOR_ID = 'USR-SYSTEM-STRIPE01';

/**
 * Traite tous les StripePaymentSignal non consommés.
 * Point d'entrée appelé par la couche Base44 après chaque webhook.
 *
 * @param {object} params
 * @param {object}  params.repositories
 * @param {object}    params.repositories.payment       — PaymentRepository
 * @param {object}    params.repositories.engagements   — EngagementRepository
 * @param {object}    params.repositories.admin         — AdminRepository
 * @param {object}    [params.repositories.policyConfig] — PolicyConfigRepository (passé aux guards)
 * @param {object}    [params.repositories.ledger]      — LedgerRepository
 * @param {object}    [params.repositories.scheduler]   — SchedulerRepository
 *
 * @returns {Promise<{
 *   processed: number,
 *   failed: number,
 *   skipped: number,
 *   results: Array
 * }>}
 */
async function processUnhandledSignals({ repositories }) {
  const { payment, engagements, admin } = repositories;

  if (!payment || !engagements || !admin) {
    throw new Error(
      'SIGNAL_CONSUMER_ERROR: repositories.payment, .engagements et .admin obligatoires.'
    );
  }

  // ── Étape 1 : Lire les signaux non traités ─────────────────
  const unprocessedSignals = await payment.findAllUnprocessedSignals();

  const results = [];
  let processed = 0;
  let failed = 0;
  let skipped = 0;

  for (const signal of unprocessedSignals) {
    const result = await processOneSignal({ signal, repositories });
    results.push(result);

    if (result.outcome === 'processed') processed++;
    else if (result.outcome === 'failed') failed++;
    else skipped++;
  }

  return { processed, failed, skipped, results };
}

/**
 * Traite un seul StripePaymentSignal.
 * Appelé par processUnhandledSignals() — peut aussi être appelé directement
 * pour un signal spécifique (ex: retry manuel).
 *
 * @param {object} params
 * @param {object}  params.signal        — StripePaymentSignal record
 * @param {object}  params.repositories
 * @returns {Promise<{ signalId, outcome, transitionResult?, error? }>}
 */
async function processOneSignal({ signal, repositories }) {
  const { payment, engagements, admin } = repositories;

  const signalSummary = {
    signalId:       signal.id,
    engagementId:   signal.engagementId,
    stripeEventType: signal.stripeEventType,
    phase:          signal.phase,
  };

  // ── Étape 2 : Retrouver l'Engagement ──────────────────────
  const engagement = await engagements.findEngagementById(signal.engagementId);

  if (!engagement) {
    // Signal orphelin — pas d'engagement correspondant
    // Marque consommé pour éviter la boucle, mais crée un incident
    await payment.markSignalConsumed(signal.id);
    await admin.createAdminIncidentRecord({
      incidentType: 'SIGNAL_ORPHAN_NO_ENGAGEMENT',
      severity:     'P1',
      description:  `StripePaymentSignal ${signal.id} sans Engagement correspondant.`,
      context:      signalSummary,
    });
    return { ...signalSummary, outcome: 'skipped', reason: 'NO_ENGAGEMENT' };
  }

  // ── Étape 3 : Vérifier que l'état est deposit_pending ─────
  if (engagement.status !== 'deposit_pending') {
    // Signal arrivé hors-séquence (déjà traité ou état inattendu)
    await payment.markSignalConsumed(signal.id);
    return {
      ...signalSummary,
      outcome: 'skipped',
      reason: `UNEXPECTED_STATE_${engagement.status}`,
    };
  }

  // ── Étape 4 : Construire le contexte de transition ─────────
  const context = buildTransitionContext(signal);

  // ── Étape 5 : Déterminer la transition cible ───────────────
  const targetState = signal.stripeEventType === 'payment_intent.succeeded'
    ? 'deposit_secured'
    : 'deposit_failed';

  // ── Étape 6 : Appeler transitionEngagement() ──────────────
  let transitionResult;
  try {
    transitionResult = await transitionEngagement({
      engagementId:  signal.engagementId,
      currentState:  'deposit_pending',
      targetState,
      actor:         SYSTEM_ACTOR_ID,
      context,
      repositories,
    });
  } catch (err) {
    // Transition bloquée par un guard — NE PAS marquer consumed
    // L'incident permettra une intervention manuelle
    await admin.createAdminIncidentRecord({
      incidentType: 'SIGNAL_TRANSITION_FAILED',
      severity:     'P0',
      engagementId: signal.engagementId,
      description:  `Transition ${targetState} bloquée pour signal ${signal.id}: ${err.message}`,
      context:      { ...signalSummary, errorMessage: err.message },
    });
    return { ...signalSummary, outcome: 'failed', error: err.message };
  }

  // ── Étape 7 : Marquer le signal comme consommé ─────────────
  await payment.markSignalConsumed(signal.id);

  // ── Étape 8 : Persister le nouvel état de l'Engagement ─────
  // RÈGLE : le status de l'engagement doit être mis à jour en base.
  // L'appelant est responsable de cette persistence.
  if (engagements.updateEngagementStatus && engagement.id) {
    await engagements.updateEngagementStatus(engagement.id, targetState, {
      ...(targetState === 'deposit_secured' && {
        stripePaymentIntentId: signal.stripePaymentIntentId,
        depositConfirmedAt: new Date().toISOString(),
      }),
      ...(targetState === 'deposit_failed' && {
        stripeFailureCode: signal.stripeFailureCode,
        depositFailedAt: new Date().toISOString(),
      }),
    });
  }

  return {
    ...signalSummary,
    outcome: 'processed',
    transitionResult,
    targetState,
  };
}

// ── Builders de contexte ──────────────────────────────────────

/**
 * Construit le context approprié pour transitionEngagement()
 * selon le type de signal Stripe.
 */
function buildTransitionContext(signal) {
  if (signal.stripeEventType === 'payment_intent.succeeded') {
    // Context pour deposit_pending → deposit_secured
    // Source : EventPaymentGuard.validateDepositConfirmation()
    return {
      stripePaymentIntentId: signal.stripePaymentIntentId,
      confirmedAmountCents:  signal.amountReceivedCents,
      // expectedDepositCents doit venir de l'Engagement (contractSnapshot phase 1)
      // L'appelant doit enrichir ce contexte si nécessaire —
      // EventPaymentGuard valide l'écart (tolérance ±2 centimes)
      expectedDepositCents:  signal.expectedDepositCents || signal.amountReceivedCents,
    };
  }

  if (signal.stripeEventType === 'payment_intent.payment_failed') {
    // Context pour deposit_pending → deposit_failed
    // Source : EventPaymentGuard.validateDepositFailure() · SC-DEPOSIT-FAIL
    return {
      stripePaymentIntentId: signal.stripePaymentIntentId,
      stripeFailureCode:     signal.stripeFailureCode    || 'unknown',
      stripeFailureMessage:  signal.stripeFailureMessage || 'Paiement échoué',
    };
  }

  throw new Error(
    `SIGNAL_CONSUMER_ERROR: stripeEventType non supporté : "${signal.stripeEventType}". ` +
    `Signaux couverts : payment_intent.succeeded, payment_intent.payment_failed.`
  );
}

module.exports = {
  processUnhandledSignals,
  processOneSignal,
  SYSTEM_ACTOR_ID,
};