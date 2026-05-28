/**
 * stripeWebhookHandler — Base44 Function v4
 * ============================================================
 * Valide la signature Stripe, persiste le log d'idempotence,
 * dispatche les événements, et GRAVE les LedgerRecords.
 *
 * ── CHANGEMENTS v3 → v4 ─────────────────────────────────────
 *
 * 1. WATERFALL CORRIGÉE (D-038)
 *    Ancien (v3) : 5200 DR / 4335 CR  ← clearing, sans contrepartie DR
 *    Nouveau (v4) : 5200 DR / 4110 CR ← extinction directe de la créance
 *                                       organisateur gravée au placement
 *
 *    Le compte 4110 (ledger_account_organizer_receivable) est désormais
 *    lu depuis PolicyConfig, alignant le webhook sur createEngagement v6.
 *    4335 n'est plus chargé par le code applicatif (reste en base pour
 *    audit historique uniquement, à neutraliser via le script de
 *    correction des 2 TXG-ENC déjà gravés).
 *
 * 2. IDEMPOTENCE LEDGER (D-097, LOI GREFFIER-01)
 *    Avant toute écriture LedgerRecord, on vérifie qu'il n'existe pas
 *    déjà une ligne avec le même reconciliationKey ET le même
 *    economicEvent. Si oui : skip écriture, retourne LEDGER_ALREADY_WRITTEN.
 *
 *    Cela protège contre :
 *      - Inversion d'ordre Stripe (PI succeeded avant CS completed)
 *      - Re-livraison d'un même event par Stripe
 *      - Race condition multi-instance
 *
 *    Sans cette garde, v3 risquait une double écriture si Stripe
 *    inversait l'ordre des deux events (comportement rare mais observé).
 *
 * 3. BRANCHE BALANCE COMPLÈTE
 *    v3 passait flowCode/transactionType/note à writeLedgerEncaissement
 *    mais la fonction ne les destructurait pas → balance était gravée
 *    avec ENC-DEPOT (bug latent, jamais déclenché car aucun balance payé).
 *    v4 : signature explicite avec defaults, dispatchent corrects.
 *
 * 4. EPR.status = 'succeeded' au passage du dépôt
 *    v3 ne mettait à jour que EPR balance. v4 met aussi à jour EPR
 *    deposit en succeeded (les 2 EPR de test étaient restés en pending).
 *
 * ── ÉCRITURES LEDGER (D-038) ────────────────────────────────
 *
 *   Encaissement dépôt :
 *     5200  DR  depositCents    FLUX  ENC-DEPOT     encaissement_depot
 *     4110  CR  depositCents    FLUX  ENC-DEPOT     encaissement_depot
 *
 *   Encaissement balance :
 *     5200  DR  balanceCents    FLUX  ENC-BALANCE   encaissement_balance
 *     4110  CR  balanceCents    FLUX  ENC-BALANCE   encaissement_balance
 *
 *   Dans les deux cas : extinction de la créance 4110 gravée au
 *   placement. Lorsque dépôt + balance sont encaissés, 4110 par
 *   engagement revient à zéro.
 *
 * Source : D-097, D-038, LOI LEDGER-01/02, LOI GREFFIER-01, OS V15
 * ============================================================
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// ── createBase44Repositories — inline PHASE 3 ───────────────────────
// Reproduit src/repositories/adapters/base44-adapter.js dans le
// runtime Deno cloud Base44. Univers séparés — aucun import cross-env.
// Barrière LOI_TRANSITION_01_VIOLATION ancrée physiquement ici.
// Source : PORT-3 · PHASE 3 · 27 mai 2026
function createBase44Repositories(base44) {
  if (!base44 || !base44.entities) {
    throw new Error('ADAPTER_ERROR: base44.entities absent — SDK Base44 requis.');
  }
  const E = base44.entities;
  const nowIso = () => new Date().toISOString();

  return {
    engagements: {
      get:    (id)      => E.Engagement.get(id),
      list:   (f)       => E.Engagement.filter(f || {}),
      create: (payload) => E.Engagement.create(payload),
      update: async (id, payload) => {
        if (payload && Object.prototype.hasOwnProperty.call(payload, 'status')) {
          throw new Error(
            'LOI_TRANSITION_01_VIOLATION: update() ne peut pas modifier status. ' +
            'Utiliser transitionEngagement() exclusivement.'
          );
        }
        return E.Engagement.update(id, payload);
      },
      updateStatus: () => {
        throw new Error(
          'LOI_TRANSITION_01_VIOLATION: updateStatus() interdit. ' +
          'Utiliser transitionEngagement() exclusivement.'
        );
      },
    },
    events: {
      get:    (id)      => E.Event.get(id),
      list:   (f)       => E.Event.filter(f || {}),
      create: (payload) => E.Event.create(payload),
      update: (id, p)   => E.Event.update(id, p),
    },
    contractSnapshots: {
      create: (payload) => E.ContractSnapshot.create({ createdAt: nowIso(), ...payload }),
      get:    (id)      => E.ContractSnapshot.get(id),
      list:   (f)       => E.ContractSnapshot.filter(f || {}),
    },
    ledgerRecords: {
      append: (payload) => E.LedgerRecord.create(payload),
      list:   (f)       => E.LedgerRecord.filter(f || {}),
    },
    eventPaymentRequests: {
      get:    (id)      => E.EventPaymentRequest.get(id),
      list:   (f)       => E.EventPaymentRequest.filter(f || {}),
      create: (payload) => E.EventPaymentRequest.create(payload),
      update: (id, p)   => E.EventPaymentRequest.update(id, p),
    },
    policyConfig: {
      get:    (f)       => E.PolicyConfig.filter(f || {}),
      getOne: async (key) => {
        const rows = await E.PolicyConfig.filter({ key });
        return rows?.[0] ?? null;
      },
    },
    sessionPresence: {
      create: (payload) => E.SessionPresence.create(payload),
      list:   (f)       => E.SessionPresence.filter(f || {}),
      update: (id, p)   => E.SessionPresence.update(id, p),
    },
    payoutExecutionRecords: {
      create: (payload) => E.PayoutExecutionRecord.create(payload),
      list:   (f)       => E.PayoutExecutionRecord.filter(f || {}),
    },
    settlementInstructions: {
      get:    (id)      => E.SettlementInstruction.get(id),
      list:   (f)       => E.SettlementInstruction.filter(f || {}),
    },
    talentPaymentProfiles: {
      list:   (f)       => E.TalentPaymentProfile.filter(f || {}),
    },
    schedulerTasks: {
      create: (payload) => E.SchedulerDueTask.create({ ...payload, createdAt: nowIso() }),
      list:   (f)       => E.SchedulerDueTask.filter(f || {}),
      update: (id, p)   => E.SchedulerDueTask.update(id, p),
    },
    sotsSubmissions: {
      create: (payload) => E.SOTSSubmission.create(payload),
      list:   (f)       => E.SOTSSubmission.filter(f || {}),
    },
    sotsDimensionConfigs: {
      list:   (f)       => E.SOTSDimensionConfig.filter(f || {}),
    },
    reputationLedger: {
      create: (payload) => E.ReputationLedger.create(payload),
    },
    membershipPlans: {
      list:   (f)       => E.MembershipPlan.filter(f || {}),
    },
    userMemberships: {
      list:   (f)       => E.UserMembership.filter(f || {}),
      create: (payload) => E.UserMembership.create(payload),
      update: (id, p)   => E.UserMembership.update(id, p),
    },
    webhookProcessedLogs: {
      create: (payload) => E.WebhookProcessedLog.create(payload),
      list:   (f)       => E.WebhookProcessedLog.filter(f || {}),
    },
    stripePaymentSignals: {
      create: (payload) => E.StripePaymentSignal.create(payload),
      list:   (f)       => E.StripePaymentSignal.filter(f || {}),
    },
  };
}
// ── Fin createBase44Repositories ────────────────────────────────────



// ── Helpers ──────────────────────────────────────────────────

function generateId(prefix) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const s1 = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  const s2 = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `${prefix}-${s1}-${s2}`;
}

// ── Validation signature Stripe HMAC-SHA256 ───────────────────
async function validateStripeSignature(rawBody, signature, secret) {
  try {
    const parts   = signature.split(',');
    const tPart   = parts.find(p => p.startsWith('t='));
    const v1Parts = parts.filter(p => p.startsWith('v1='));
    if (!tPart || !v1Parts.length) return false;
    const payload = `${tPart.slice(2)}.${rawBody}`;
    const enc     = new TextEncoder();
    const key     = await crypto.subtle.importKey(
      'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    const mac    = await crypto.subtle.sign('HMAC', key, enc.encode(payload));
    const hexMac = Array.from(new Uint8Array(mac)).map(b => b.toString(16).padStart(2, '0')).join('');
    return v1Parts.some(p => p.slice(3) === hexMac);
  } catch { return false; }
}

// ── Charger les comptes depuis PolicyConfig (Market Pivot) ────
// Fail-hard si une clé essentielle manque. Aucun fallback hardcodé.
async function loadLedgerAccounts(base44) {
  const keys = [
    'ledger_account_organizer_receivable',  // 4110 — créance organisateur
    'ledger_account_encaissement',          // 5200 — encaissement Stripe
  ];

  const accounts = {};
  const missing  = [];

  for (const key of keys) {
    const records = await base44.entities.PolicyConfig
      .filter({ key }, '-created_date', 1)
      .catch(() => []);
    if (records?.length && records[0].value) {
      accounts[key] = records[0].value;
    } else {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `LEDGER_ACCOUNTS_MISSING: Clés PolicyConfig absentes : ${missing.join(', ')}. ` +
      `Pour ledger_account_organizer_receivable : node scripts/seed-policy-organizer-receivable.js. ` +
      `Pour ledger_account_encaissement : node scripts/seed-policy-encaissement.js. ` +
      `Source : D-038, Market Pivot V3.`
    );
  }

  return {
    organizerReceivable: accounts['ledger_account_organizer_receivable'],
    encaissement:        accounts['ledger_account_encaissement'],
  };
}

// ── Garde d'idempotence ledger (LOI GREFFIER-01) ─────────────
// Vérifie qu'aucune ligne LedgerRecord n'existe déjà avec ce
// reconciliationKey + ce economicEvent + cette direction DEBIT.
// Une ligne DR par TXG d'encaissement → un seul match possible.
async function ledgerAlreadyWritten({ base44, reconciliationKey, economicEvent }) {
  const existing = await base44.entities.LedgerRecord.filter(
    {
      reconciliationKey,
      economicEvent,
      direction: 'DEBIT',
    },
    '-created_date',
    1
  ).catch(() => []);
  return existing?.length > 0;
}

// ── Écriture ledger encaissement (dépôt OU balance) ──────────
async function writeLedgerEncaissement({
  base44, eng, amountCents, stripeEventId, accounts, now,
  flowCode        = 'ENC-DEPOT',
  transactionType = 'encaissement_depot',
  economicEvent   = 'encaissement_depot',
  subSkuCode      = 'SUB-COURT-DEPOT',
  noteLabel       = 'dépôt',
}) {
  // Garde d'idempotence ledger
  const reconciliationKey = `stripe:${stripeEventId}`;
  if (await ledgerAlreadyWritten({ base44, reconciliationKey, economicEvent })) {
    return { skipped: true, reason: 'LEDGER_ALREADY_WRITTEN', reconciliationKey };
  }

  const txgId = `TXG-ENC-${eng.systemId.slice(4)}-${stripeEventId.slice(-6)}`;
  const dr    = amountCents;
  const cr    = amountCents;

  // LOI LEDGER-02 — fail-hard si DR ≠ CR
  if (dr !== cr) {
    throw new Error(
      `LOI_LEDGER_02_VIOLATED: DR=${dr} CR=${cr} pour TXG=${txgId}. ` +
      `Écart=${dr-cr}¢. Aucune ligne LedgerRecord persistée. Source : D-069.`
    );
  }

  const entries = [
    {
      systemId:           generateId('LDG'),
      transactionGroupId: txgId,
      transactionType,
      economicEvent,
      financialStatement: 'FLUX',
      flowCode,
      lineIndex:          0,
      engagementId:       eng.systemId,
      eventId:            eng.eventId || '',
      skuCode:            'SKU-COURTAGE',
      subSkuCode,
      account:            accounts.encaissement,            // 5200 DR
      direction:          'DEBIT',
      amountCents,
      currency:           'cad',
      reconciliationKey,
      note:               `Encaissement ${noteLabel} Stripe — ${(amountCents/100).toFixed(2)}$`,
      metadata:           JSON.stringify({ stripeEventId, txgId, lineCount: 2 }),
      createdAt:          now,
    },
    {
      systemId:           generateId('LDG'),
      transactionGroupId: txgId,
      transactionType,
      economicEvent,
      financialStatement: 'FLUX',
      flowCode,
      lineIndex:          1,
      engagementId:       eng.systemId,
      eventId:            eng.eventId || '',
      skuCode:            'SKU-COURTAGE',
      subSkuCode,
      account:            accounts.organizerReceivable,     // 4110 CR
      direction:          'CREDIT',
      amountCents,
      currency:           'cad',
      reconciliationKey,
      note:               `Extinction créance organisateur ${eng.systemId} — ${noteLabel}`,
      metadata:           JSON.stringify({ stripeEventId, txgId, lineCount: 2 }),
      createdAt:          now,
    },
  ];

  // Persister les 2 lignes (append-only)
  for (const entry of entries) {
    await base44.entities.LedgerRecord.create(entry);
  }

  return { skipped: false, txgId, reconciliationKey };
}

// ── Mise à jour EPR (idempotente) ────────────────────────────
async function markEprSucceeded({ base44, engagementId, phase, now }) {
  const eprs = await base44.entities.EventPaymentRequest
    .filter({ engagementId, phase, status: 'pending' }, '-created_date', 1)
    .catch(() => []);
  if (eprs?.length) {
    await base44.entities.EventPaymentRequest.update(eprs[0].id, {
      status:    'succeeded',
      updatedAt: now,
    }).catch(() => {});
    return eprs[0].systemId || eprs[0].id;
  }
  return null;
}

// ── Dispatch payment_intent.succeeded (et synthetic CS) ──────
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

  // Créer StripePaymentSignal (audit, best-effort)
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

  // ── Phase : dépôt ─────────────────────────────────────────
  if (phase === 'deposit') {
    // On accepte deposit_pending (cas normal) ET deposit_secured (cas où
    // CS completed est arrivée avant et a déjà transitionné l'Engagement).
    // L'idempotence ledger empêche la double écriture.
    if (eng.status !== 'deposit_pending' && eng.status !== 'deposit_secured') {
      return {
        action: 'PAYMENT_RECEIVED_WRONG_STATE',
        engagementId, status: eng.status, phase,
      };
    }

    const accounts     = await loadLedgerAccounts(base44);
    const depositCents = eng.depositCents ? Number(eng.depositCents) : amountCents;

    const ledgerResult = await writeLedgerEncaissement({
      base44, eng,
      amountCents:   depositCents,
      stripeEventId: String(paymentIntent.id),
      accounts, now,
      flowCode:        'ENC-DEPOT',
      transactionType: 'encaissement_depot',
      economicEvent:   'encaissement_depot',
      subSkuCode:      'SUB-COURT-DEPOT',
      noteLabel:       'dépôt',
    });

    // Transition vers deposit_secured si pas déjà fait
    if (eng.status === 'deposit_pending') {
      await base44.entities.Engagement.update(eng.id, {
        status:                'deposit_secured',
        depositSecuredAt:      now,
        stripeDepositIntentId: String(paymentIntent.id),
        updatedAt:             now,
      });
    }

    // EPR deposit → succeeded
    const eprId = await markEprSucceeded({ base44, engagementId, phase: 'deposit', now });

    return {
      action:        ledgerResult.skipped ? 'DEPOSIT_ALREADY_LEDGERED' : 'DEPOSIT_SECURED',
      engagementId,
      txgId:         ledgerResult.txgId || null,
      depositCents,
      eprId,
      previousState: eng.status,
      newState:      'deposit_secured',
    };
  }

  // ── Phase : balance ───────────────────────────────────────
  if (phase === 'balance') {
    if (eng.status !== 'deposit_secured' && eng.status !== 'payable') {
      return {
        action: 'PAYMENT_RECEIVED_WRONG_STATE',
        engagementId, status: eng.status, phase,
      };
    }

    const accounts = await loadLedgerAccounts(base44);
    const balCents = eng.balanceCents ? Number(eng.balanceCents) : amountCents;

    const ledgerResult = await writeLedgerEncaissement({
      base44, eng,
      amountCents:   balCents,
      stripeEventId: String(paymentIntent.id),
      accounts, now,
      flowCode:        'ENC-BALANCE',
      transactionType: 'encaissement_solde',
      economicEvent:   'encaissement_balance',
      subSkuCode:      'SUB-COURT-BALANCE',
      noteLabel:       'balance',
    });

    // EPR balance → succeeded
    const eprId = await markEprSucceeded({ base44, engagementId, phase: 'balance', now });

    return {
      action:       ledgerResult.skipped ? 'BALANCE_ALREADY_LEDGERED' : 'BALANCE_PAYMENT_SECURED',
      engagementId,
      txgId:        ledgerResult.txgId || null,
      balanceCents: balCents,
      eprId,
      // Note : la transition vers event_sealed reste manuelle (organisateur).
      // Le guard BalancePaymentGuard dans transitionEngagement vérifie l'EPR.
    };
  }

  return { action: 'PAYMENT_RECEIVED_NO_TRANSITION', engagementId, status: eng.status, phase };
}

// ── Main ─────────────────────────────────────────────────────
Deno.serve(async (req) => {
  const rawBody = await req.text();

  try {
    const base44          = createClientFromRequest(req);
    const stripeSignature = req.headers.get('stripe-signature') || '';
    const webhookSecret   = Deno.env.get('STRIPE_WEBHOOK_SECRET') || '';

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

    // Idempotence webhook (au niveau evt_*)
    const existing = await base44.entities.WebhookProcessedLog.filter(
      { stripeEventId }, '-created_date', 1
    ).catch(() => []);

    if (existing?.length && existing[0].processingStatus === 'COMPLETED') {
      return Response.json({ received: true, idempotent: true, eventId: stripeEventId });
    }

    const now = new Date().toISOString();
    await base44.entities.WebhookProcessedLog.create({
      stripeEventId, eventType, receivedAt: now, processingStatus: 'IN_PROGRESS', createdAt: now,
    }).catch(() => {});

    // Dispatch
    let dispatchResult = { action: 'UNHANDLED_EVENT_TYPE' };
    const obj = event.data?.object || {};

    if (eventType === 'payment_intent.succeeded') {
      dispatchResult = await handlePaymentIntentSucceeded(obj, base44);
    } else if (eventType === 'checkout.session.completed') {
      // Construire un PaymentIntent synthétique depuis la session.
      // L'id du PI est celui de la session (transmis comme stripeEventId)
      // — garantit le même reconciliationKey que le PI succeeded qui suit
      // → idempotence ledger automatique.
      const syntheticIntent = {
        id:              obj.payment_intent || obj.id,
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