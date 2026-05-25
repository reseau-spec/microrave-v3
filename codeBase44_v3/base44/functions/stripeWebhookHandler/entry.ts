/**
 * stripeWebhookHandler — Base44 Function v4
 * ============================================================
 * Valide la signature Stripe, persiste le log d'idempotence,
 * dispatche les événements, et GRAVE les LedgerRecords.
 *
 * ── CHANGEMENTS v3 → v4 ────────────────────────────────────
 *
 * À l'encaissement, on crédite désormais 4110 (Créances clients
 * nettes) au lieu de 4335. C'est l'extinction de la créance
 * gravée au placement par createEngagement v6.
 *
 * Nouvelle waterfall encaissement (D-038) :
 *   5200 DR depositCents    FLUX  ENC-DEPOT  encaissement_depot
 *   4110 CR depositCents    FLUX  ENC-DEPOT  encaissement_depot
 *        (extinction partielle créance organisateur)
 *
 * Clé PolicyConfig requise : ledger_account_organizer_receivable
 * (seedée par scripts/seed-policy-organizer-receivable.js)
 *
 * ── ÉVÉNEMENTS GÉRÉS (inchangés) ───────────────────────────
 *   checkout.session.completed  → deposit_pending → deposit_secured
 *   payment_intent.succeeded    → idem (fallback si pas de session)
 *
 * Source : D-038, D-097, LOI LEDGER-01/02, OS V15
 * ============================================================
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

function generateId(prefix) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const s1 = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  const s2 = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `${prefix}-${s1}-${s2}`;
}

// ── Validation signature Stripe HMAC-SHA256 ───────────────────
async function validateStripeSignature(rawBody, signature, secret) {
  try {
    const parts  = signature.split(',');
    const tPart  = parts.find(p => p.startsWith('t='));
    const v1Parts = parts.filter(p => p.startsWith('v1='));
    if (!tPart || !v1Parts.length) return false;
    const payload = `${tPart.slice(2)}.${rawBody}`;
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    const mac    = await crypto.subtle.sign('HMAC', key, enc.encode(payload));
    const hexMac = Array.from(new Uint8Array(mac)).map(b => b.toString(16).padStart(2,'0')).join('');
    return v1Parts.some(p => p.slice(3) === hexMac);
  } catch { return false; }
}

// ── Charger les comptes depuis PolicyConfig ───────────────────
// Market Pivot V3 : aucun code comptable en dur. Fail-hard si manquant.
async function loadLedgerAccounts(base44) {
  const keys = [
    'ledger_account_organizer_receivable',
    'ledger_account_talent_payable',
    'ledger_account_commission_escrow',
    'ledger_account_encaissement',
  ];

  const accounts = {};
  const missing  = [];

  for (const key of keys) {
    const records = await base44.entities.PolicyConfig
      .filter({ key }, '-created_date', 1).catch(() => []);
    if (records?.length && records[0].value) {
      accounts[key] = records[0].value;
    } else {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `LEDGER_ACCOUNTS_MISSING: Clés PolicyConfig absentes : ${missing.join(', ')}. ` +
      `Source : D-038, D-060, Market Pivot V3.`
    );
  }

  return {
    organizerReceivable: accounts['ledger_account_organizer_receivable'],
    talentPayable:       accounts['ledger_account_talent_payable'],
    commissionEscrow:    accounts['ledger_account_commission_escrow'],
    encaissement:        accounts['ledger_account_encaissement'],
  };
}

// ── Écriture ledger encaissement dépôt ───────────────────────
// 5200 DR (argent reçu dans Stripe)
// 4110 CR (extinction partielle créance organisateur)
async function writeLedgerEncaissement({ base44, eng, depositCents, stripeEventId, accounts, now }) {
  const txgId = `TXG-ENC-${eng.systemId.slice(4)}-${stripeEventId.slice(-6)}`;
  const dr = depositCents;
  const cr = depositCents;
  if (dr !== cr) throw new Error(`LOI_LEDGER_02: DR=${dr} CR=${cr}`);

  const entries = [
    {
      systemId:           generateId('LDG'),
      transactionGroupId: txgId,
      transactionType:    'encaissement_depot',
      economicEvent:      'encaissement_depot',
      financialStatement: 'FLUX',
      flowCode:           'ENC-DEPOT',
      lineIndex:          0,
      engagementId:       eng.systemId,
      eventId:            eng.eventId || '',
      skuCode:            'SKU-COURTAGE',
      subSkuCode:         'SUB-COURT-DEPOT',
      account:            accounts.encaissement,
      direction:          'DEBIT',
      amountCents:        depositCents,
      currency:           'cad',
      reconciliationKey:  `stripe:${stripeEventId}`,
      note:               `Encaissement dépôt Stripe — ${(depositCents/100).toFixed(2)}$`,
      metadata:           JSON.stringify({ stripeEventId, txgId, lineCount: 2 }),
      createdAt:          now,
    },
    {
      systemId:           generateId('LDG'),
      transactionGroupId: txgId,
      transactionType:    'encaissement_depot',
      economicEvent:      'encaissement_depot',
      financialStatement: 'FLUX',
      flowCode:           'ENC-DEPOT',
      lineIndex:          1,
      engagementId:       eng.systemId,
      eventId:            eng.eventId || '',
      skuCode:            'SKU-COURTAGE',
      subSkuCode:         'SUB-COURT-DEPOT',
      account:            accounts.organizerReceivable,
      direction:          'CREDIT',
      amountCents:        depositCents,
      currency:           'cad',
      reconciliationKey:  `stripe:${stripeEventId}`,
      note:               `Extinction partielle créance organisateur — engagement ${eng.systemId}`,
      metadata:           JSON.stringify({ stripeEventId, txgId, lineCount: 2 }),
      createdAt:          now,
    },
  ];

  for (const entry of entries) {
    await base44.entities.LedgerRecord.create(entry);
  }
  return txgId;
}

// ── Dispatch payment_intent.succeeded ────────────────────────
async function handlePaymentIntentSucceeded(paymentIntent, base44) {
  const metadata     = paymentIntent.metadata || {};
  const engagementId = metadata.engagementId;
  const phase        = metadata.phase;
  const amountCents  = Number(paymentIntent.amount_received ?? paymentIntent.amount ?? 0);

  if (!engagementId) return { action: 'SKIPPED_NO_ENGAGEMENT_ID' };

  const engagements = await base44.entities.Engagement.filter(
    { systemId: engagementId }, '-created_date', 1
  );
  if (!engagements?.length) return { action: 'SKIPPED_ENGAGEMENT_NOT_FOUND', engagementId };

  const eng = engagements[0];
  const now = new Date().toISOString();

  // Créer StripePaymentSignal (audit)
  await base44.entities.StripePaymentSignal.create({
    engagementId,
    stripePaymentIntentId: String(paymentIntent.id),
    stripeEventType:       'payment_intent.succeeded',
    amountReceivedCents:   amountCents,
    currency:              String(paymentIntent.currency || 'cad'),
    phase:                 phase || 'deposit',
    receivedAt:            now,
    processed:             false,
    createdAt:             now,
  }).catch(() => {});

  if (phase === 'deposit' && eng.status === 'deposit_pending') {
    // Charger les comptes
    const accounts = await loadLedgerAccounts(base44);

    // ÉCRITURE LEDGER — encaissement dépôt
    const depositCents = eng.depositCents ? Number(eng.depositCents) : amountCents;
    const txgId = await writeLedgerEncaissement({
      base44, eng, depositCents,
      stripeEventId: String(paymentIntent.id),
      accounts, now,
    });

    // Transition deposit_pending → deposit_secured
    await base44.entities.Engagement.update(eng.id, {
      status:                'deposit_secured',
      depositSecuredAt:      now,
      stripeDepositIntentId: String(paymentIntent.id),
      updatedAt:             now,
    });

    return {
      action:        'DEPOSIT_SECURED',
      engagementId,
      txgId,
      depositCents,
      previousState: 'deposit_pending',
      newState:      'deposit_secured',
    };
  }

  if (phase === 'balance' && eng.status === 'payable') {
    await base44.entities.Engagement.update(eng.id, {
      status:     'settled',
      settledAt:  now,
      updatedAt:  now,
    });
    return { action: 'BALANCE_SETTLED', engagementId };
  }

  return { action: 'PAYMENT_RECEIVED_NO_TRANSITION', engagementId, status: eng.status, phase };
}

// ── Main ─────────────────────────────────────────────────────
Deno.serve(async (req) => {
  const rawBody = await req.text();

  try {
    const base44           = createClientFromRequest(req);
    const stripeSignature  = req.headers.get('stripe-signature') || '';
    const webhookSecret    = Deno.env.get('STRIPE_WEBHOOK_SECRET') || '';

    if (!webhookSecret) {
      console.error('[stripeWebhookHandler] STRIPE_WEBHOOK_SECRET absent');
      return Response.json({ received: true, warning: 'WEBHOOK_SECRET_MISSING' });
    }

    const isValid = await validateStripeSignature(rawBody, stripeSignature, webhookSecret);
    if (!isValid) {
      return Response.json({ error: 'SIGNATURE_INVALID' }, { status: 400 });
    }

    let event;
    try { event = JSON.parse(rawBody); }
    catch { return Response.json({ error: 'INVALID_JSON' }, { status: 400 }); }

    const stripeEventId = String(event.id || '');
    const eventType     = String(event.type || '');

    // Idempotence
    const existing = await base44.entities.WebhookProcessedLog.filter(
      { stripeEventId }, '-created_date', 1
    ).catch(() => []);

    if (existing?.length && existing[0].processingStatus === 'COMPLETED') {
      return Response.json({ received: true, idempotent: true });
    }

    const now = new Date().toISOString();
    await base44.entities.WebhookProcessedLog.create({
      stripeEventId, eventType, receivedAt: now, processingStatus: 'IN_PROGRESS', createdAt: now,
    }).catch(() => {});

    // Dispatch
    let dispatchResult = { action: 'UNHANDLED_EVENT_TYPE', details: undefined };
    const obj = event.data?.object || {};

    if (eventType === 'payment_intent.succeeded') {
      dispatchResult = await handlePaymentIntentSucceeded(obj, base44);
    } else if (eventType === 'checkout.session.completed') {
      const syntheticIntent = {
        id:              obj.payment_intent,
        amount_received: obj.amount_total || 0,
        currency:        obj.currency || 'cad',
        metadata:        obj.metadata || {},
      };
      dispatchResult = await handlePaymentIntentSucceeded(syntheticIntent, base44);
    }

    // Mettre à jour le log
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

    return Response.json({ received: true, eventId: stripeEventId, eventType, ...dispatchResult });

  } catch (error) {
    console.error('[stripeWebhookHandler]', error.message);
    return Response.json({ received: true, error: error.message });
  }
});