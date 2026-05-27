/**
 * MICRO RAVE V3 — WebhookProcessor
 * ============================================================
 * Traitement des webhooks Stripe entrants.
 *
 * Responsabilités :
 *   1. Valider la signature Stripe (D-097)
 *   2. Vérifier l'idempotency via WebhookProcessedLog en database
 *   3. Dispatcher vers le handler approprié selon event.type
 *   4. Logger chaque event dans WebhookProcessedLog (append-only)
 *
 * RÈGLE CRITIQUE (D-097) :
 *   Le raw body doit être préservé intact pour la validation de signature.
 *   Ne jamais parser le body avant constructWebhookEvent().
 *   → Le proxy stripe-webhook-proxy/index.js gère ça avec express.raw().
 *
 * Events Stripe couverts pour J9 :
 *   payment_intent.succeeded        → deposit_pending → deposit_secured
 *   payment_intent.payment_failed   → deposit_pending → deposit_failed
 *   account.updated                 → mise à jour KYC TalentPaymentProfile
 *   transfer.created                → confirmation payout (audit only)
 *
 * Events futurs (documentés, non implémentés MVP) :
 *   payment_intent.canceled         → annulation côté Stripe
 *   charge.refunded                 → confirmation remboursement
 *
 * Source : D-097 · OS V14 section 7 · WEBHOOK-RAWBODY-01
 * ============================================================
 */

'use strict';

import StripeAdapter from './StripeAdapter.js';
import StripeConnectService from './StripeConnectService.js';
// ── Types d'events couverts ───────────────────────────────────

const HANDLED_EVENT_TYPES = new Set([
  'payment_intent.succeeded',
  'payment_intent.payment_failed',
  'account.updated',
  'transfer.created',
]);

/**
 * Point d'entrée principal — traite un webhook Stripe entrant.
 *
 * @param {object} params
 * @param {Buffer|string} params.rawBody          — body brut préservé (CRITIQUE)
 * @param {string}        params.stripeSignature  — header 'stripe-signature'
 * @param {object}        params.repositories
 * @param {object}        params.repositories.webhookProcessedLogs  — { findByEventId, create }
 * @param {object}        params.repositories.engagements           — { findByPaymentIntentId }
 * @param {object}        params.repositories.talentPaymentProfiles — { findByStripeAccountId, upsert }
 *
 * @returns {{ processed: boolean, eventId, eventType, action, alreadyProcessed? }}
 */
async function processWebhook({ rawBody, stripeSignature, repositories }) {
  if (!rawBody)         throw new Error('WEBHOOK_ERROR: rawBody requis');
  if (!stripeSignature) throw new Error('WEBHOOK_ERROR: stripeSignature requis');

  // ── Étape 1 : Valider la signature Stripe ─────────────────
  const signatureResult = StripeAdapter.constructWebhookEvent(rawBody, stripeSignature);
  if (!signatureResult.ok) {
    throw new Error(
      `WEBHOOK_SIGNATURE_INVALID: ${signatureResult.error.message}`
    );
  }

  const event = signatureResult.data;

  // ── Étape 2 : Idempotency via WebhookProcessedLog ─────────
  const alreadyProcessed = await repositories.webhookProcessedLogs.findByEventId(event.id);
  if (alreadyProcessed) {
    return {
      processed:      false,
      alreadyProcessed: true,
      eventId:        event.id,
      eventType:      event.type,
      action:         'SKIPPED_IDEMPOTENT',
    };
  }

  // ── Étape 3 : Logger AVANT dispatch (fail-safe D-097) ─────
  await repositories.webhookProcessedLogs.create({
    stripeEventId: event.id,
    eventType:     event.type,
    receivedAt:    new Date().toISOString(),
    processingStatus: 'IN_PROGRESS',
  });

  // ── Étape 4 : Dispatcher ──────────────────────────────────
  let dispatchResult;

  if (!HANDLED_EVENT_TYPES.has(event.type)) {
    dispatchResult = { action: 'UNHANDLED_EVENT_TYPE', eventType: event.type };
  } else {
    dispatchResult = await dispatchEvent(event, repositories);
  }

  // ── Étape 5 : Mettre à jour le log ────────────────────────
  await repositories.webhookProcessedLogs.markCompleted(event.id, {
    processingStatus: 'COMPLETED',
    completedAt:      new Date().toISOString(),
    action:           dispatchResult.action,
  });

  return {
    processed:  true,
    eventId:    event.id,
    eventType:  event.type,
    ...dispatchResult,
  };
}

// ── Dispatcher ────────────────────────────────────────────────

async function dispatchEvent(event, repositories) {
  switch (event.type) {
    case 'payment_intent.succeeded':
      return handlePaymentIntentSucceeded(event.data.object, repositories);

    case 'payment_intent.payment_failed':
      return handlePaymentIntentFailed(event.data.object, repositories);

    case 'account.updated':
      return handleAccountUpdated(event.data.object, repositories);

    case 'transfer.created':
      return handleTransferCreated(event.data.object, repositories);

    default:
      return { action: 'UNHANDLED_EVENT_TYPE' };
  }
}

// ── Handlers ─────────────────────────────────────────────────

/**
 * payment_intent.succeeded → signal pour deposit_pending → deposit_secured
 *
 * Ce handler ne déclenche PAS transitionEngagement directement.
 * Il persiste le signal dans StripePaymentSignal.
 * L'appelant (couche Base44 / API) est responsable de déclencher la transition.
 * Cette séparation garantit que la transition passe par transitionEngagement().
 */
async function handlePaymentIntentSucceeded(paymentIntent, repositories) {
  const engagementId = paymentIntent.metadata?.engagementId;
  const phase        = paymentIntent.metadata?.phase; // 'deposit' ou 'balance'

  if (!engagementId) {
    return {
      action:  'PAYMENT_INTENT_NO_ENGAGEMENT_METADATA',
      detail:  `PaymentIntent ${paymentIntent.id} sans engagementId dans metadata.`,
    };
  }

  // Persister le signal de confirmation
  await repositories.stripePaymentSignals?.create({
    engagementId,
    stripePaymentIntentId: paymentIntent.id,
    stripeEventType:       'payment_intent.succeeded',
    amountReceivedCents:   paymentIntent.amount_received,
    currency:              paymentIntent.currency,
    phase,
    receivedAt:            new Date().toISOString(),
    processed:             false,
  });

  return {
    action:        'PAYMENT_SIGNAL_PERSISTED',
    engagementId,
    phase,
    amountCents:   paymentIntent.amount_received,
    paymentIntentId: paymentIntent.id,
  };
}

/**
 * payment_intent.payment_failed → signal pour deposit_pending → deposit_failed
 * Conforme à SC-DEPOSIT-FAIL : zéro écriture ledger, aucun fonds capturé.
 */
async function handlePaymentIntentFailed(paymentIntent, repositories) {
  const engagementId = paymentIntent.metadata?.engagementId;
  const phase        = paymentIntent.metadata?.phase;

  if (!engagementId) {
    return {
      action: 'PAYMENT_INTENT_NO_ENGAGEMENT_METADATA',
      detail: `PaymentIntent ${paymentIntent.id} sans engagementId.`,
    };
  }

  const lastError = paymentIntent.last_payment_error;

  await repositories.stripePaymentSignals?.create({
    engagementId,
    stripePaymentIntentId: paymentIntent.id,
    stripeEventType:       'payment_intent.payment_failed',
    amountReceivedCents:   0, // SC-DEPOSIT-FAIL : zéro
    currency:              paymentIntent.currency,
    phase,
    stripeFailureCode:     lastError?.code     || 'unknown',
    stripeFailureMessage:  lastError?.message  || 'Paiement échoué',
    receivedAt:            new Date().toISOString(),
    processed:             false,
  });

  return {
    action:          'PAYMENT_FAILURE_SIGNAL_PERSISTED',
    engagementId,
    phase,
    failureCode:     lastError?.code    || 'unknown',
    paymentIntentId: paymentIntent.id,
  };
}

/**
 * account.updated → vérification KYC mise à jour
 * Déclenché par Stripe quand un talent complète ou modifie son onboarding.
 */
async function handleAccountUpdated(account, repositories) {
  // Trouver le profil talent associé à ce compte Stripe
  const profile = await repositories.talentPaymentProfiles?.findByStripeAccountId(account.id);
  if (!profile) {
    return {
      action:  'ACCOUNT_UPDATED_NO_PROFILE',
      detail:  `Aucun TalentPaymentProfile pour stripeAccountId ${account.id}.`,
    };
  }

  // Recalculer le statut KYC
  const { details_submitted, charges_enabled, payouts_enabled } = account;
  let kycStatus;
  if (!details_submitted) {
    kycStatus = StripeConnectService.KYC_STATUS.PENDING;
  } else if (details_submitted && !charges_enabled) {
    kycStatus = StripeConnectService.KYC_STATUS.IN_REVIEW;
  } else if (details_submitted && charges_enabled && !payouts_enabled) {
    kycStatus = StripeConnectService.KYC_STATUS.RESTRICTED;
  } else {
    kycStatus = StripeConnectService.KYC_STATUS.VERIFIED;
  }

  await repositories.talentPaymentProfiles.upsert({
    ...profile,
    kycStatus,
    detailsSubmitted: details_submitted,
    chargesEnabled:   charges_enabled,
    payoutsEnabled:   payouts_enabled,
    updatedAt:        new Date().toISOString(),
  });

  return {
    action:    'KYC_STATUS_UPDATED',
    talentUserId: profile.talentUserId,
    kycStatus,
    stripeAccountId: account.id,
  };
}

/**
 * transfer.created → confirmation audit du payout (read-only)
 */
async function handleTransferCreated(transfer, repositories) {
  const engagementId = transfer.metadata?.engagementId;

  // Log audit — pas d'action métier, le PayoutExecutor a déjà tout persisté
  return {
    action:      'TRANSFER_CONFIRMED',
    transferId:  transfer.id,
    engagementId: engagementId || 'unknown',
    amountCents: transfer.amount,
  };
}

export default {
processWebhook,
  HANDLED_EVENT_TYPES,

};
export { processWebhook, HANDLED_EVENT_TYPES };