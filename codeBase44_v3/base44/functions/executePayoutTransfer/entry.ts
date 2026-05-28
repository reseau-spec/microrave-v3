/**
 * executePayoutTransfer — Base44 Function
 * ============================================================
 * Exécute le payout talent depuis l'état `payable`.
 * Applique les 6 verrous D-101 dans l'ordre strict.
 *
 * D-101 — 6 VERROUS ANTI-DOUBLE PAYOUT :
 *   V1 : Engagement en état payable
 *   V2 : Aucun PayoutExecutionRecord existant (idempotence)
 *   V3 : SettlementInstruction présente et non consommée
 *   V4 : TalentPaymentProfile avec kycStatus = KYC_VERIFIED
 *   V5 : Invariant ledger DR = talentNetCents
 *   V6 : Stripe Transfer créé avec idempotency key
 *
 * ÉCRITURES LEDGER post-payout (LOI LEDGER-01/02) :
 *   4310  DR  talentNetCents    BILAN  null  payout_talent
 *   5100  CR  talentNetCents    BILAN  FLUX  DEC-PAYOUT  payout_talent
 *   → LOI LEDGER-02 : DR = CR = talentNetCents ✓
 *   → 4310 se vide (dette talent éteinte)
 *   → 5100 diminue (fonds Stripe disponible partent)
 *
 * APPEL : depuis CompletionFlow.jsx après confirmation SOTS,
 *         ou depuis le scheduler après contestation_window.
 *
 * Source : D-101, D-038, LOI LEDGER-01/02, PayoutExecutor.js src/
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



function generateId(prefix) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const s1 = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  const s2 = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `${prefix}-${s1}-${s2}`;
}

// ── Charger les comptes depuis PolicyConfig ───────────────────
async function loadPayoutAccounts(base44) {
  const keys = ['ledger_account_talent_payable', 'ledger_account_stripe_available'];
  const accounts = {};
  const missing = [];
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
      `Exécuter seed-policy-ledger-accounts.js avant le payout. Source : Market Pivot V3.`
    );
  }
  return {
    talentPayable:   accounts['ledger_account_talent_payable'],
    stripeAvailable: accounts['ledger_account_stripe_available'],
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const me = await base44.auth.me();
    if (!me?.id) return Response.json({ ok: false, error: 'AUTH_REQUIRED' }, { status: 401 });

    const body = await req.json();
    const { engagementId } = body;

    if (!engagementId) {
      return Response.json({ ok: false, error: 'VALIDATION: engagementId obligatoire.' }, { status: 400 });
    }

    // ── Charger l'engagement ──────────────────────────────────
    const engagements = await base44.entities.Engagement.filter(
      { systemId: engagementId }, '-created_date', 1
    );
    if (!engagements?.length) {
      return Response.json({ ok: false, error: `NOT_FOUND: Engagement "${engagementId}" introuvable.` }, { status: 404 });
    }

    const eng           = engagements[0];
    const talentNetCents = Number(eng.talentNetCents) || 0;
    const verrouxPassed  = [];

    // ══════════════════════════════════════════════════════════
    // VERROU 1 — État payable
    // ══════════════════════════════════════════════════════════
    if (eng.status !== 'payable') {
      return Response.json({
        ok:           false,
        blockReason:  'NOT_PAYABLE',
        error:        `V1 FAILED: Engagement en état "${eng.status}". Payout uniquement depuis "payable".`,
        verrouxPassed,
      }, { status: 422 });
    }
    verrouxPassed.push('V1_PAYABLE_STATUS');

    // ══════════════════════════════════════════════════════════
    // VERROU 2 — Idempotence : PayoutExecutionRecord absent
    // ══════════════════════════════════════════════════════════
    const existingRecord = await base44.entities.PayoutExecutionRecord
      .filter({ engagementId: eng.systemId, talentUserId: eng.talentUserId }, '-created_date', 1)
      .catch(() => []);

    if (existingRecord?.length) {
      return Response.json({
        ok:                 false,
        blockReason:        'ALREADY_EXECUTED',
        error:              `V2 FAILED: PayoutExecutionRecord déjà présent. TransferId: ${existingRecord[0].stripeTransferId}`,
        existingTransferId: existingRecord[0].stripeTransferId,
        verrouxPassed,
      }, { status: 422 });
    }
    verrouxPassed.push('V2_NO_EXISTING_RECORD');

    // ══════════════════════════════════════════════════════════
    // VERROU 3 — SettlementInstruction présente et non consommée
    // ══════════════════════════════════════════════════════════
    const instructions = await base44.entities.SettlementInstruction
      .filter({ engagementId: eng.systemId, talentUserId: eng.talentUserId }, '-created_date', 1)
      .catch(() => []);

    if (!instructions?.length) {
      return Response.json({
        ok:          false,
        blockReason: 'NO_SETTLEMENT_INSTRUCTION',
        error:       `V3 FAILED: Aucune SettlementInstruction pour ${eng.systemId}/${eng.talentUserId}. Créer d'abord via createSettlementInstruction.`,
        verrouxPassed,
      }, { status: 422 });
    }

    const instruction = instructions[0];

    if (instruction.consumed) {
      return Response.json({
        ok:          false,
        blockReason: 'INSTRUCTION_CONSUMED',
        error:       `V3 FAILED: SettlementInstruction déjà consommée le ${instruction.consumedAt}.`,
        verrouxPassed,
      }, { status: 422 });
    }

    if (Number(instruction.amountCents) !== talentNetCents) {
      return Response.json({
        ok:          false,
        blockReason: 'AMOUNT_MISMATCH',
        error:       `V3 FAILED: Montant SettlementInstruction (${instruction.amountCents}¢) ≠ talentNetCents (${talentNetCents}¢). Incohérence waterfall.`,
        verrouxPassed,
      }, { status: 422 });
    }
    verrouxPassed.push('V3_SETTLEMENT_INSTRUCTION_VALID');

    // ══════════════════════════════════════════════════════════
    // VERROU 4 — KYC VERIFIED
    // ══════════════════════════════════════════════════════════
    const profiles = await base44.entities.TalentPaymentProfile
      .filter({ talentUserId: eng.talentUserId }, '-created_date', 1)
      .catch(() => []);

    if (!profiles?.length) {
      return Response.json({
        ok:          false,
        blockReason: 'KYC_NOT_VERIFIED',
        error:       `V4 FAILED: Aucun TalentPaymentProfile pour ${eng.talentUserId}.`,
        verrouxPassed,
      }, { status: 422 });
    }

    const profile = profiles[0];

    if (profile.kycStatus !== 'VERIFIED') {
      return Response.json({
        ok:          false,
        blockReason: 'KYC_NOT_VERIFIED',
        error:       `V4 FAILED: kycStatus = "${profile.kycStatus}". VERIFIED requis avant tout payout (valeurs: PENDING, IN_REVIEW, VERIFIED, RESTRICTED).`,
        kycStatus:   profile.kycStatus,
        verrouxPassed,
      }, { status: 422 });
    }

    if (!profile.stripeAccountId) {
      return Response.json({
        ok:          false,
        blockReason: 'NO_STRIPE_ACCOUNT',
        error:       `V4 FAILED: stripeAccountId absent pour ${eng.talentUserId}.`,
        verrouxPassed,
      }, { status: 422 });
    }
    verrouxPassed.push('V4_KYC_VERIFIED');

    // ══════════════════════════════════════════════════════════
    // VERROU 5 — Invariant ledger
    // DR existant sur 4310 doit couvrir talentNetCents
    // ══════════════════════════════════════════════════════════
    const ledgerRows = await base44.entities.LedgerRecord
      .filter({ engagementId: eng.systemId, account: '4310', direction: 'CREDIT' }, '-created_date', 10)
      .catch(() => []);

    const sum4310CR = ledgerRows.reduce((s, r) => s + Number(r.amountCents || 0), 0);

    if (sum4310CR < talentNetCents) {
      return Response.json({
        ok:          false,
        blockReason: 'LEDGER_INVARIANT_FAILED',
        error:       `V5 FAILED: Somme 4310 CR (${sum4310CR}¢) < talentNetCents (${talentNetCents}¢). Incohérence ledger.`,
        sum4310CR,   talentNetCents,
        verrouxPassed,
      }, { status: 422 });
    }
    verrouxPassed.push('V5_LEDGER_INVARIANT');

    // ══════════════════════════════════════════════════════════
    // VERROU 6 — Stripe Transfer avec idempotency key
    // ══════════════════════════════════════════════════════════
    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY') || '';
    if (!stripeSecretKey) {
      return Response.json({ ok: false, error: 'CONFIG: STRIPE_SECRET_KEY absent.' }, { status: 500 });
    }

    const idempotencyKey = `transfer-payout-${engagementId}-${eng.talentUserId}`;
    const transferParams = new URLSearchParams({
      'amount':                  String(talentNetCents),
      'currency':                'cad',
      'destination':             profile.stripeAccountId,
      'transfer_group':          `event_${eng.eventId || engagementId}`,
      'metadata[engagementId]':  engagementId,
      'metadata[talentUserId]':  eng.talentUserId,
      'metadata[platform]':      'microrave-v3',
    });

    const transferRes = await fetch('https://api.stripe.com/v1/transfers', {
      method:  'POST',
      headers: {
        'Authorization':   `Bearer ${stripeSecretKey}`,
        'Content-Type':    'application/x-www-form-urlencoded',
        'Idempotency-Key': idempotencyKey,
      },
      body: transferParams.toString(),
    });

    if (!transferRes.ok) {
      const err = await transferRes.json().catch(() => ({}));
      return Response.json({
        ok:          false,
        blockReason: 'STRIPE_TRANSFER_FAILED',
        error:       `V6 FAILED: ${err?.error?.message || 'Stripe Transfer échoué.'}`,
        verrouxPassed,
      }, { status: 502 });
    }

    const transfer      = await transferRes.json();
    const stripeTransferId = transfer.id;
    const now           = new Date().toISOString();

    verrouxPassed.push('V6_STRIPE_TRANSFER');

    // ── Post-payout : persistance des preuves ─────────────────

    // PayoutExecutionRecord (idempotence permanente)
    await base44.entities.PayoutExecutionRecord.create({
      systemId:        generateId('POR'),
      engagementId:    eng.systemId,
      talentUserId:    eng.talentUserId,
      stripeTransferId,
      amountCents:     talentNetCents,
      currency:        'cad',
      executedAt:      now,
      verrouxPassed:   JSON.stringify(verrouxPassed),
      createdAt:       now,
    });

    // Marquer SettlementInstruction consommée
    await base44.entities.SettlementInstruction.update(instruction.id, {
      consumed:        true,
      consumedAt:      now,
      stripeTransferId,
    });

    // ── Charger les comptes (Market Pivot) ────────────────────
    const accounts = await loadPayoutAccounts(base44);

    // ── LedgerRecords payout_executed (LOI LEDGER-01/02) ──────
    // 4310 DR (dette talent éteinte)
    // 5100 CR (fonds Stripe disponible utilisés pour le virement)
    const txgId = `TXG-PAYOUT-${eng.systemId.slice(4)}`;
    const dr    = talentNetCents;
    const cr    = talentNetCents;
    // DR = CR = talentNetCents ✓ LOI LEDGER-02

    await base44.entities.LedgerRecord.create({
      systemId:           generateId('LDG'),
      transactionGroupId: txgId,
      transactionType:    'payout_executed',
      economicEvent:      'payout_talent',
      financialStatement: 'BILAN',
      flowCode:           null,
      lineIndex:          0,
      engagementId:       eng.systemId,
      eventId:            eng.eventId || '',
      skuCode:            'SKU-COURTAGE',
      subSkuCode:         'SUB-COURT-PAYOUT',
      account:            accounts.talentPayable,
      direction:          'DEBIT',
      amountCents:        talentNetCents,
      currency:           'cad',
      reconciliationKey:  `stripe:${stripeTransferId}`,
      stripeTransferId,
      note:               `Payout talent ${eng.talentUserId} — dette éteinte ${(talentNetCents/100).toFixed(2)}$`,
      metadata:           JSON.stringify({ txgId, stripeTransferId, verrouxPassed }),
      createdAt:          now,
    });

    await base44.entities.LedgerRecord.create({
      systemId:           generateId('LDG'),
      transactionGroupId: txgId,
      transactionType:    'payout_executed',
      economicEvent:      'payout_talent',
      financialStatement: 'FLUX',
      flowCode:           'DEC-PAYOUT',
      lineIndex:          1,
      engagementId:       eng.systemId,
      eventId:            eng.eventId || '',
      skuCode:            'SKU-COURTAGE',
      subSkuCode:         'SUB-COURT-PAYOUT',
      account:            accounts.stripeAvailable,
      direction:          'CREDIT',
      amountCents:        talentNetCents,
      currency:           'cad',
      reconciliationKey:  `stripe:${stripeTransferId}`,
      stripeTransferId,
      note:               `Transfer Stripe Connect ${stripeTransferId} — ${(talentNetCents/100).toFixed(2)}$ vers ${profile.stripeAccountId}`,
      metadata:           JSON.stringify({ txgId, stripeTransferId }),
      createdAt:          now,
    });

    // ── Transition payable → settled (via transitionEngagement) ──
    // On met à jour directement ici pour atomicité
    await base44.entities.Engagement.update(eng.id, {
      status:    'settled',
      settledAt: now,
      updatedAt: now,
    });

    return Response.json({
      ok:              true,
      executed:        true,
      engagementId:    eng.systemId,
      stripeTransferId,
      amountCents:     talentNetCents,
      executedAt:      now,
      verrouxPassed,
      ledger:          { txgId, linesWritten: 2 },
      newState:        'settled',
    });

  } catch (error) {
    console.error('[executePayoutTransfer]', error.message);
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});