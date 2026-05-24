/**
 * stripeWebhookHandler — Base44 Function
 * ============================================================
 * Point d'entrée des webhooks Stripe. Valide la signature,
 * persiste le log d'idempotence, et dispatche les événements.
 *
 * ÉVÉNEMENTS GÉRÉS (MVP) :
 *   payment_intent.succeeded → deposit_pending → deposit_secured
 *                             ou balance_pending → settled
 *
 * SÉCURITÉ (D-097) :
 *   1. Validation signature Stripe (STRIPE_WEBHOOK_SECRET)
 *   2. Idempotence via WebhookProcessedLog (stripeEventId unique)
 *   3. Log AVANT dispatch (fail-safe)
 *   4. Retourne 200 immédiatement pour éviter les retries Stripe
 *
 * CONFIGURATION STRIPE :
 *   - Variable d'environnement : STRIPE_WEBHOOK_SECRET
 *   - Variable d'environnement : STRIPE_SECRET_KEY
 *
 * Source : D-097, WebhookProcessor.js, OS V15
 * ============================================================
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// ── Validation signature Stripe (HMAC-SHA256) ─────────────────
async function validateStripeSignature(
  rawBody,
  signature,
  secret,
) {
  try {
    const parts = signature.split(',');
    const tPart = parts.find(p => p.startsWith('t='));
    const v1Parts = parts.filter(p => p.startsWith('v1='));

    if (!tPart || !v1Parts.length) return false;

    const timestamp = tPart.slice(2);
    const payload   = `${timestamp}.${rawBody}`;

    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw', encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false, ['sign']
    );
    const mac = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
    const hexMac = Array.from(new Uint8Array(mac))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    return v1Parts.some(p => p.slice(3) === hexMac);
  } catch {
    return false;
  }
}

// ── Dispatch payment_intent.succeeded ────────────────────────
async function handlePaymentIntentSucceeded(
  paymentIntent,
  base44
) {
  const metadata     = (paymentIntent.metadata || {});
  const engagementId = metadata.engagementId;
  const phase        = metadata.phase;
  const amountReceived = Number(paymentIntent.amount_received ?? paymentIntent.amount ?? 0);

  if (!engagementId) {
    return { action: 'SKIPPED_NO_ENGAGEMENT_ID', details: { paymentIntentId: paymentIntent.id } };
  }

  // Charger l'engagement
  const engagements = await (base44).entities.Engagement.filter(
    { systemId: engagementId }, '-created_date', 1
  );
  if (!engagements?.length) {
    return { action: 'SKIPPED_ENGAGEMENT_NOT_FOUND', details: { engagementId } };
  }

  const eng = engagements[0];

  // Créer le StripePaymentSignal (pour audit + SignalConsumerService)
  await (base44).entities.StripePaymentSignal.create({
    engagementId,
    stripePaymentIntentId: String(paymentIntent.id),
    stripeEventType:       'payment_intent.succeeded',
    amountReceivedCents:   amountReceived,
    currency:              String(paymentIntent.currency || 'cad'),
    phase:                 phase || 'deposit',
    receivedAt:            new Date().toISOString(),
    processed:             false,
    createdAt:             new Date().toISOString(),
  }).catch(() => {}); // Non-bloquant

  // Transition deposit_pending → deposit_secured
  if (phase === 'deposit' && eng.status === 'deposit_pending') {
    await (base44).entities.Engagement.update(eng.id, {
      status:             'deposit_secured',
      depositSecuredAt:   new Date().toISOString(),
      stripeDepositIntentId: String(paymentIntent.id),
      updatedAt:          new Date().toISOString(),
    });

    return {
      action: 'DEPOSIT_SECURED',
      details: { engagementId, previousState: 'deposit_pending', newState: 'deposit_secured', amountReceived },
    };
  }

  // Transition balance_pending → settled (Phase 2)
  if (phase === 'balance' && eng.status === 'payable') {
    await (base44).entities.Engagement.update(eng.id, {
      status:           'settled',
      settledAt:        new Date().toISOString(),
      stripeBalanceIntentId: String(paymentIntent.id),
      updatedAt:        new Date().toISOString(),
    });

    return {
      action: 'BALANCE_SETTLED',
      details: { engagementId, previousState: 'payable', newState: 'settled', amountReceived },
    };
  }

  return {
    action:  'PAYMENT_RECEIVED_NO_TRANSITION',
    details: { engagementId, engagementStatus: eng.status, phase, amountReceived },
  };
}

// ── Main ─────────────────────────────────────────────────────

Deno.serve(async (req) => {
  // Lire le raw body AVANT tout parsing JSON (requis pour la validation de signature)
  const rawBody = await req.text();

  try {
    const base44 = createClientFromRequest(req);

    const stripeSignature  = req.headers.get('stripe-signature') || '';
    const webhookSecret    = Deno.env.get('STRIPE_WEBHOOK_SECRET') || '';

    if (!webhookSecret) {
      console.error('[stripeWebhookHandler] STRIPE_WEBHOOK_SECRET absent');
      // Retourner 200 pour éviter les retries Stripe, mais logguer l'erreur
      return Response.json({ received: true, warning: 'WEBHOOK_SECRET_MISSING' });
    }

    // ── Validation signature ──────────────────────────────────
    const isValid = await validateStripeSignature(rawBody, stripeSignature, webhookSecret);
    if (!isValid) {
      console.error('[stripeWebhookHandler] Signature invalide');
      return Response.json({ error: 'SIGNATURE_INVALID' }, { status: 400 });
    }

    let event;
    try {
      event = JSON.parse(rawBody);
    } catch {
      return Response.json({ error: 'INVALID_JSON' }, { status: 400 });
    }

    const stripeEventId = String(event.id || '');
    const eventType     = String(event.type || '');

    // ── Idempotence ───────────────────────────────────────────
    const existing = await base44.entities.WebhookProcessedLog.filter(
      { stripeEventId }, '-created_date', 1
    ).catch(() => []);

    if (existing?.length && existing[0].processingStatus === 'COMPLETED') {
      return Response.json({ received: true, idempotent: true, eventId: stripeEventId });
    }

    const now = new Date().toISOString();

    // ── Log AVANT dispatch (D-097 règle fail-safe) ────────────
    await base44.entities.WebhookProcessedLog.create({
      stripeEventId,
      eventType,
      receivedAt:       now,
      processingStatus: 'IN_PROGRESS',
      createdAt:        now,
    }).catch(() => {});

    // ── Dispatch ──────────────────────────────────────────────
    let dispatchResult = { action: 'UNHANDLED_EVENT_TYPE', details: undefined };

    if (eventType === 'payment_intent.succeeded') {
      dispatchResult = await handlePaymentIntentSucceeded(
        (event.data)?.object,
        base44
      );
    } else if (eventType === 'checkout.session.completed') {
      // Checkout Session complétée — extraire le payment_intent et dispatcher
      const session = (event.data)?.object || {};
      const paymentIntentId = session.payment_intent;
      const sessionMeta = session.metadata || {};

      if (paymentIntentId && sessionMeta.engagementId) {
        // Construire un objet compatible avec handlePaymentIntentSucceeded
        const syntheticIntent = {
          id:              paymentIntentId,
          amount_received: session.amount_total || 0,
          currency:        session.currency || 'cad',
          metadata:        sessionMeta,
        };
        dispatchResult = await handlePaymentIntentSucceeded(syntheticIntent, base44);
      } else {
        dispatchResult = { action: 'CHECKOUT_SESSION_NO_ENGAGEMENT_ID', details: { sessionId: session.id } };
      }
    }
    // Phase 2 : account.updated → KYC Stripe Connect
    // Phase 2 : transfer.created → payout talent confirmé

    // ── Mettre à jour le log ──────────────────────────────────
    // Trouver l'ID du log créé pour le mettre à jour
    const logs = await base44.entities.WebhookProcessedLog.filter(
      { stripeEventId, processingStatus: 'IN_PROGRESS' }, '-created_date', 1
    ).catch(() => []);

    if (logs?.length) {
      await base44.entities.WebhookProcessedLog.update(logs[0].id, {
        processingStatus: 'COMPLETED',
        completedAt:      new Date().toISOString(),
        action:           dispatchResult.action,
      }).catch(() => {});
    }

    return Response.json({
      received:   true,
      eventId:    stripeEventId,
      eventType,
      ...dispatchResult,
    });

  } catch (error) {
    console.error('[stripeWebhookHandler]', error.message);
    // Toujours 200 pour éviter les retries Stripe inutiles
    return Response.json({ received: true, error: error.message });
  }
});