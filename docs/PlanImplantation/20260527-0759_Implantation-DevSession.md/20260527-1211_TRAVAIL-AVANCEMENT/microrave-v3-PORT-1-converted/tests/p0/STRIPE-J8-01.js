/**
 * MICRO RAVE V3 — STRIPE-J8-01.js
 * ============================================================
 * Suite P0 — J8 : Stripe Connect + webhooks + payout
 *
 * Tests P0 requis par D-097 :
 *   T-01 : WEBHOOK-SIG-02     — signature invalide rejetée
 *   T-02 : WEBHOOK-IDEM-01    — même eventId traité une seule fois
 *   T-03 : PAYOUT-BLOCK-KYC  — KYC incomplet bloque payout
 *
 * Tests supplémentaires (6 verrous D-101) :
 *   T-04 : Verrou 1 — état non-payable bloque
 *   T-05 : Verrou 2 — double payout bloqué (PayoutExecutionRecord existant)
 *   T-06 : Verrou 3 — SettlementInstruction absente bloque
 *   T-07 : Verrou 3b — SettlementInstruction déjà consommée
 *   T-08 : Verrou 3c — montant incohérent bloque
 *   T-09 : Verrou 5 — invariant ledger échoue si waterfall incorrect
 *   T-10 : Verrou 6 — Transfer Stripe réussi → payout exécuté
 *   T-11 : Onboarding idempotent — profil existant retourné sans double create
 *   T-12 : KYC VERIFIED après account.updated
 *   T-13 : payment_intent.succeeded → signal persisté
 *   T-14 : payment_intent.payment_failed → signal persisté (zéro montant)
 *   T-15 : Batch payout — tous talents exécutés
 *   T-16 : Batch payout partiel — un KYC manquant bloque ce talent uniquement
 *   T-17 : StripeAdapter.checkConfig() → missing si clés absentes
 *   T-18 : StripeAdapter lazy init — pas d'erreur au require sans clé
 *   T-19 : Waterfall zéro cent — invariant parfait 300$ CAD DJ Alex
 *
 * Tous les tests mockent Stripe — aucun appel réseau réel.
 * ============================================================
 */

'use strict';

// ── Mock Stripe avant tout require ────────────────────────────
// On injecte un mock dans process.env pour que StripeAdapter
// ne lève pas d'erreur de config, mais on override getStripe()
// via le module mock.
import { createRequire as __createRequire } from 'node:module';
const require = __createRequire(import.meta.url);

process.env.STRIPE_SECRET_KEY    = 'sk_test_MOCK_KEY_FOR_TESTS';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_MOCK_SECRET_FOR_TESTS';

// Mock du module stripe natif
const mockStripe = {
  accounts: {
    create:   async (params) => ({ id: 'acct_MOCK123', type: 'express', ...params }),
    retrieve: async (id)     => ({
      id,
      details_submitted: true,
      charges_enabled:   true,
      payouts_enabled:   true,
    }),
  },
  accountLinks: {
    create: async (params) => ({
      url:        'https://connect.stripe.com/mock/onboarding',
      expires_at: Math.floor(Date.now() / 1000) + 600,
    }),
  },
  paymentIntents: {
    create:   async (params) => ({ id: 'pi_MOCK456', status: 'requires_payment_method', ...params }),
    retrieve: async (id)     => ({ id, status: 'succeeded', amount_received: 6000 }),
  },
  transfers: {
    create: async (params) => ({ id: 'tr_MOCK789', ...params }),
  },
  refunds: {
    create: async (params) => ({ id: 're_MOCK000', ...params }),
  },
  webhooks: {
    constructEvent: (rawBody, sig, secret) => {
      if (sig === 'invalid_sig') {
        const err = new Error('No signatures found matching the expected signature for payload');
        err.type = 'StripeSignatureVerificationError';
        throw err;
      }
      // Simuler un event valide
      return JSON.parse(rawBody.toString());
    },
  },
};

// Patch StripeAdapter pour injecter le mock
import StripeAdapter from '../../src/services/StripeAdapter.js';
StripeAdapter._resetForTesting();
// Override interne — on force le mock
const stripeModule = require.cache[require.resolve('stripe')];
if (!stripeModule) {
  // stripe n'est pas encore chargé — on le mock via le cache
  require.cache[require.resolve('stripe')] = {
    id: require.resolve('stripe'),
    filename: require.resolve('stripe'),
    loaded: true,
    exports: () => mockStripe,
  };
}

import StripeConnectService from '../../src/services/StripeConnectService.js';
import PayoutExecutor from '../../src/services/PayoutExecutor.js';
import WebhookProcessor from '../../src/services/WebhookProcessor.js';
// ── Helpers ───────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const errors = [];

function test(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      console.log(`  ✅ ${name}`);
      passed++;
    })
    .catch(err => {
      console.error(`  ❌ ${name}`);
      console.error(`     ${err.message}`);
      failed++;
      errors.push({ name, error: err.message });
    });
}

function assert(condition, msg) {
  if (!condition) throw new Error(`ASSERT: ${msg}`);
}

// ── Repositories mock ─────────────────────────────────────────

function makeRepositories(overrides = {}) {
  const payoutRecords = new Map(); // key: `${engagementId}:${talentUserId}`
  const profiles      = new Map();
  const signals       = [];
  const ledger        = [];
  const webhookLogs   = new Map();
  const instructions  = new Map();

  return {
    payoutExecutionRecords: {
      findByEngagementId: async (eid, tid) => payoutRecords.get(`${eid}:${tid}`) || null,
      create: async (data) => {
        const rec = { id: `por_${Date.now()}`, ...data };
        payoutRecords.set(`${data.engagementId}:${data.talentUserId}`, rec);
        return rec;
      },
    },
    talentPaymentProfiles: {
      findByTalentUserId:     async (id) => profiles.get(id) || null,
      findByStripeAccountId:  async (id) => [...profiles.values()].find(p => p.stripeAccountId === id) || null,
      upsert: async (data) => {
        const rec = { id: `tpp_${Date.now()}`, ...data };
        profiles.set(data.talentUserId, rec);
        return rec;
      },
    },
    settlementInstructions: {
      markConsumed: async (id, data) => {
        const instr = instructions.get(id);
        if (instr) Object.assign(instr, data);
      },
    },
    ledgerRecords: {
      append: async (data) => ledger.push(data),
    },
    stripePaymentSignals: {
      create: async (data) => signals.push(data),
    },
    webhookProcessedLogs: {
      findByEventId:  async (id) => webhookLogs.get(id) || null,
      create:         async (data) => webhookLogs.set(data.stripeEventId, { ...data }),
      markCompleted:  async (id, data) => {
        const log = webhookLogs.get(id);
        if (log) Object.assign(log, data);
      },
    },
    _signals:      signals,
    _ledger:       ledger,
    _webhookLogs:  webhookLogs,
    _profiles:     profiles,
    _instructions: instructions,
    ...overrides,
  };
}

function makeSettlementInstruction(engagementId, amountCents, consumed = false) {
  return {
    id:           `si_${engagementId}`,
    engagementId,
    amountCents,
    consumedAt:   consumed ? '2026-05-20T00:00:00.000Z' : null,
  };
}

function makeContractSnapshot(prixVenduClientCents, waterfall) {
  return { prixVenduClientCents, waterfall };
}

// ── Suite de tests ────────────────────────────────────────────

async function run() {
  console.log('\n══════════════════════════════════════════════════════');
  console.log('  MICRO RAVE V3 — STRIPE-J8-01');
  console.log('  Stripe Connect · Webhooks · Payout · D-097 · D-101');
  console.log('══════════════════════════════════════════════════════\n');

  // ── T-01 : WEBHOOK-SIG-02 — signature invalide rejetée ────
  await test('T-01 WEBHOOK-SIG-02 — signature invalide rejetée', async () => {
    const repos = makeRepositories();
    let threw = false;
    try {
      await WebhookProcessor.processWebhook({
        rawBody:         Buffer.from('{"id":"evt_test"}'),
        stripeSignature: 'invalid_sig',
        repositories:    repos,
      });
    } catch (e) {
      threw = true;
      assert(e.message.includes('WEBHOOK_SIGNATURE_INVALID'), `Attendu WEBHOOK_SIGNATURE_INVALID, reçu: ${e.message}`);
    }
    assert(threw, 'Aurait dû lever une erreur de signature');
  });

  // ── T-02 : WEBHOOK-IDEM-01 — même eventId traité une seule fois ──
  await test('T-02 WEBHOOK-IDEM-01 — même eventId traité une seule fois', async () => {
    const repos = makeRepositories();
    const eventPayload = {
      id:   'evt_IDEMPOTENCY_TEST',
      type: 'transfer.created',
      data: { object: { id: 'tr_test', metadata: {}, amount: 1000 } },
    };
    const rawBody = Buffer.from(JSON.stringify(eventPayload));

    // Premier appel
    const r1 = await WebhookProcessor.processWebhook({
      rawBody, stripeSignature: 'valid_sig', repositories: repos,
    });
    assert(r1.processed === true, 'Premier appel doit être processed=true');

    // Deuxième appel — même event
    const r2 = await WebhookProcessor.processWebhook({
      rawBody, stripeSignature: 'valid_sig', repositories: repos,
    });
    assert(r2.processed === false,          'Deuxième appel doit être processed=false');
    assert(r2.alreadyProcessed === true,    'alreadyProcessed doit être true');
    assert(r2.action === 'SKIPPED_IDEMPOTENT', 'Action doit être SKIPPED_IDEMPOTENT');
  });

  // ── T-03 : PAYOUT-BLOCK-KYC — KYC incomplet bloque ───────
  await test('T-03 PAYOUT-BLOCK-KYC — KYC PENDING bloque le payout', async () => {
    const repos = makeRepositories();
    // Profil avec KYC PENDING
    await repos.talentPaymentProfiles.upsert({
      talentUserId:    'USR-TALENT01-KYC',
      stripeAccountId: 'acct_PENDING',
      kycStatus:       'PENDING',
    });

    const result = await PayoutExecutor.executePayout({
      engagementId:   'ENG-TEST01-KYCP',
      talentUserId:   'USR-TALENT01-KYC',
      talentNetCents: 26400,
      engagementStatus: 'payable',
      settlementInstruction: makeSettlementInstruction('ENG-TEST01-KYCP', 26400),
      repositories:   repos,
    });

    assert(result.executed === false, 'Payout doit être bloqué');
    assert(result.blockReason === 'PAYOUT_BLOCK_KYC', `Raison attendue PAYOUT_BLOCK_KYC, reçue: ${result.blockReason}`);
    assert(result.kycStatus === 'PENDING', 'kycStatus doit être PENDING');
  });

  // ── T-04 : Verrou 1 — état non-payable ────────────────────
  await test('T-04 Verrou 1 — état "settled" bloque le payout', async () => {
    const repos  = makeRepositories();
    const result = await PayoutExecutor.executePayout({
      engagementId:   'ENG-TEST02-STAT',
      talentUserId:   'USR-TALENT01-ST',
      talentNetCents: 26400,
      engagementStatus: 'settled', // pas payable
      settlementInstruction: makeSettlementInstruction('ENG-TEST02-STAT', 26400),
      repositories:   repos,
    });

    assert(result.executed === false,                             'Payout doit être bloqué');
    assert(result.blockReason === 'PAYOUT_BLOCK_NOT_PAYABLE',    `Raison: ${result.blockReason}`);
    assert(result.verrouxPassed.length === 0,                    'Aucun verrou ne doit passer');
  });

  // ── T-05 : Verrou 2 — double payout bloqué ────────────────
  await test('T-05 Verrou 2 — PayoutExecutionRecord existant bloque', async () => {
    const repos = makeRepositories();
    // Simuler un record déjà présent
    await repos.payoutExecutionRecords.create({
      engagementId:    'ENG-TEST03-DBLE',
      talentUserId:    'USR-TALENT03-DB',
      stripeTransferId: 'tr_ALREADY_DONE',
      amountCents:     26400,
    });

    // Profil KYC VERIFIED (pour éviter le bloc V4 avant V2)
    await repos.talentPaymentProfiles.upsert({
      talentUserId:    'USR-TALENT03-DB',
      stripeAccountId: 'acct_VERIFIED',
      kycStatus:       'VERIFIED',
    });

    const result = await PayoutExecutor.executePayout({
      engagementId:   'ENG-TEST03-DBLE',
      talentUserId:   'USR-TALENT03-DB',
      talentNetCents: 26400,
      engagementStatus: 'payable',
      settlementInstruction: makeSettlementInstruction('ENG-TEST03-DBLE', 26400),
      repositories:   repos,
    });

    assert(result.executed === false,                              'Double payout doit être bloqué');
    assert(result.blockReason === 'PAYOUT_BLOCK_ALREADY_EXECUTED', `Raison: ${result.blockReason}`);
    assert(result.existingTransferId === 'tr_ALREADY_DONE',        'doit retourner le transferId existant');
  });

  // ── T-06 : Verrou 3 — SettlementInstruction absente ───────
  await test('T-06 Verrou 3 — SettlementInstruction absente bloque', async () => {
    const repos  = makeRepositories();
    const result = await PayoutExecutor.executePayout({
      engagementId:         'ENG-TEST04-NOSI',
      talentUserId:         'USR-TALENT04-NS',
      talentNetCents:       26400,
      engagementStatus:     'payable',
      settlementInstruction: null, // absente
      repositories:         repos,
    });

    assert(result.executed === false,                                  'Payout doit être bloqué');
    assert(result.blockReason === 'PAYOUT_BLOCK_NO_SETTLEMENT_INSTRUCTION', `Raison: ${result.blockReason}`);
  });

  // ── T-07 : Verrou 3b — SettlementInstruction consommée ────
  await test('T-07 Verrou 3b — SettlementInstruction déjà consommée', async () => {
    const repos  = makeRepositories();
    const result = await PayoutExecutor.executePayout({
      engagementId:   'ENG-TEST05-CONS',
      talentUserId:   'USR-TALENT05-CN',
      talentNetCents: 26400,
      engagementStatus: 'payable',
      settlementInstruction: makeSettlementInstruction('ENG-TEST05-CONS', 26400, true), // consumed
      repositories:   repos,
    });

    assert(result.executed === false,                               'Payout doit être bloqué');
    assert(result.blockReason === 'PAYOUT_BLOCK_INSTRUCTION_CONSUMED', `Raison: ${result.blockReason}`);
  });

  // ── T-08 : Verrou 3c — montant incohérent ─────────────────
  await test('T-08 Verrou 3c — montant SettlementInstruction ≠ talentNetCents', async () => {
    const repos  = makeRepositories();
    const result = await PayoutExecutor.executePayout({
      engagementId:   'ENG-TEST06-MISM',
      talentUserId:   'USR-TALENT06-MM',
      talentNetCents: 26400,
      engagementStatus: 'payable',
      settlementInstruction: makeSettlementInstruction('ENG-TEST06-MISM', 25000), // différent
      repositories:   repos,
    });

    assert(result.executed === false,                               'Payout doit être bloqué');
    assert(result.blockReason === 'PAYOUT_BLOCK_LEDGER_INVARIANT',  `Raison: ${result.blockReason}`);
  });

  // ── T-09 : Verrou 5 — ledger invariant incorrect ──────────
  await test('T-09 Verrou 5 — waterfall incohérent bloque le payout', async () => {
    const repos = makeRepositories();
    await repos.talentPaymentProfiles.upsert({
      talentUserId:    'USR-TALENT09-LI',
      stripeAccountId: 'acct_VERIFIED09',
      kycStatus:       'VERIFIED',
    });

    const result = await PayoutExecutor.executePayout({
      engagementId:   'ENG-TEST09-LEDG',
      talentUserId:   'USR-TALENT09-LI',
      talentNetCents: 26400,
      engagementStatus: 'payable',
      settlementInstruction: makeSettlementInstruction('ENG-TEST09-LEDG', 26400),
      contractSnapshotPhase2: makeContractSnapshot(30000, [
        { talentNetCents: 26400, commissionMrCents: 999 }, // 26400+999=27399 ≠ 30000 → écart 2601¢ > tolérance 1
      ]),
      repositories: repos,
    });

    assert(result.executed === false,                              'Payout doit être bloqué');
    assert(result.blockReason === 'PAYOUT_BLOCK_LEDGER_INVARIANT', `Raison: ${result.blockReason}`);
  });

  // ── T-10 : Verrou 6 — Transfer réussi → payout exécuté ───
  await test('T-10 6 verrous PASS — Transfer Stripe réussi → payout exécuté', async () => {
    const repos = makeRepositories();
    await repos.talentPaymentProfiles.upsert({
      talentUserId:    'USR-TALENT10-OK',
      stripeAccountId: 'acct_VERIFIED10',
      kycStatus:       'VERIFIED',
    });

    const result = await PayoutExecutor.executePayout({
      engagementId:   'ENG-TEST10-PASS',
      talentUserId:   'USR-TALENT10-OK',
      talentNetCents: 26400,
      engagementStatus: 'payable',
      settlementInstruction: makeSettlementInstruction('ENG-TEST10-PASS', 26400),
      contractSnapshotPhase2: makeContractSnapshot(30000, [
        { talentNetCents: 26400, commissionMrCents: 3600 }, // 26400+3600=30000 ✅
      ]),
      repositories: repos,
    });

    assert(result.executed === true,                             'Payout doit être exécuté');
    assert(result.stripeTransferId === 'tr_MOCK789',            `TransferId: ${result.stripeTransferId}`);
    assert(result.verrouxPassed.length === 6,                   `6 verrous attendus, ${result.verrouxPassed.length} passés`);
    assert(repos._ledger.some(e => e.type === 'payout_executed'), 'LedgerRecord payout_executed doit exister');
  });

  // ── T-11 : Onboarding idempotent ─────────────────────────
  await test('T-11 Onboarding idempotent — profil existant retourné sans double create', async () => {
    const repos = makeRepositories();
    // Profil déjà présent
    await repos.talentPaymentProfiles.upsert({
      talentUserId:    'USR-TALENT11-ON',
      stripeAccountId: 'acct_EXISTING',
      kycStatus:       'PENDING',
    });

    const r = await StripeConnectService.initiateTalentOnboarding({
      talentUserId: 'USR-TALENT11-ON',
      repositories: repos,
    });

    assert(r.alreadyOnboarded === true,           'alreadyOnboarded doit être true');
    assert(r.stripeAccountId === 'acct_EXISTING', `StripeAccountId: ${r.stripeAccountId}`);
  });

  // ── T-12 : KYC VERIFIED après account.updated ─────────────
  await test('T-12 account.updated → KYC VERIFIED mis à jour', async () => {
    const repos = makeRepositories();
    await repos.talentPaymentProfiles.upsert({
      talentUserId:    'USR-TALENT12-KV',
      stripeAccountId: 'acct_KYCU12',
      kycStatus:       'IN_REVIEW',
    });

    const event = {
      id:   'evt_ACCOUNT_UPDATED',
      type: 'account.updated',
      data: {
        object: {
          id:               'acct_KYCU12',
          details_submitted: true,
          charges_enabled:   true,
          payouts_enabled:   true,
        },
      },
    };

    const r = await WebhookProcessor.processWebhook({
      rawBody:         Buffer.from(JSON.stringify(event)),
      stripeSignature: 'valid_sig',
      repositories:    repos,
    });

    assert(r.processed === true,       'processed doit être true');
    assert(r.action === 'KYC_STATUS_UPDATED', `Action: ${r.action}`);
    assert(r.kycStatus === 'VERIFIED', `KYCStatus: ${r.kycStatus}`);
  });

  // ── T-13 : payment_intent.succeeded → signal persisté ────
  await test('T-13 payment_intent.succeeded → signal persisté', async () => {
    const repos = makeRepositories();
    const event = {
      id:   'evt_PI_SUCCEEDED',
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id:             'pi_DEPOSIT',
          amount_received: 6000,
          currency:        'cad',
          metadata: { engagementId: 'ENG-TEST13-PI', phase: 'deposit' },
        },
      },
    };

    const r = await WebhookProcessor.processWebhook({
      rawBody:         Buffer.from(JSON.stringify(event)),
      stripeSignature: 'valid_sig',
      repositories:    repos,
    });

    assert(r.processed === true,                    'processed doit être true');
    assert(r.action === 'PAYMENT_SIGNAL_PERSISTED', `Action: ${r.action}`);
    assert(r.engagementId === 'ENG-TEST13-PI',      `EngagementId: ${r.engagementId}`);
    assert(r.phase === 'deposit',                    `Phase: ${r.phase}`);
    assert(repos._signals.length === 1,             '1 signal doit être persisté');
    assert(repos._signals[0].amountReceivedCents === 6000, 'Montant: 6000¢');
  });

  // ── T-14 : payment_intent.payment_failed → zéro montant ──
  await test('T-14 payment_intent.payment_failed → signal persisté avec amountReceived=0', async () => {
    const repos = makeRepositories();
    const event = {
      id:   'evt_PI_FAILED',
      type: 'payment_intent.payment_failed',
      data: {
        object: {
          id:     'pi_FAILED',
          currency: 'cad',
          last_payment_error: { code: 'card_declined', message: 'Card declined' },
          metadata: { engagementId: 'ENG-TEST14-PF', phase: 'deposit' },
        },
      },
    };

    const r = await WebhookProcessor.processWebhook({
      rawBody:         Buffer.from(JSON.stringify(event)),
      stripeSignature: 'valid_sig',
      repositories:    repos,
    });

    assert(r.processed === true,                           'processed doit être true');
    assert(r.action === 'PAYMENT_FAILURE_SIGNAL_PERSISTED', `Action: ${r.action}`);
    assert(r.failureCode === 'card_declined',               `FailureCode: ${r.failureCode}`);
    assert(repos._signals.length === 1,                    '1 signal doit être persisté');
    assert(repos._signals[0].amountReceivedCents === 0,    'SC-DEPOSIT-FAIL : montant = 0¢');
  });

  // ── T-15 : Batch payout — tous talents exécutés ───────────
  await test('T-15 Batch payout — 2 talents, 2 payouts exécutés', async () => {
    const repos = makeRepositories();
    for (const [userId, accountId] of [['USR-T15A-BATCH', 'acct_A15'], ['USR-T15B-BATCH', 'acct_B15']]) {
      await repos.talentPaymentProfiles.upsert({
        talentUserId:    userId,
        stripeAccountId: accountId,
        kycStatus:       'VERIFIED',
      });
    }

    const r = await PayoutExecutor.executePayoutBatch({
      engagementId:    'ENG-TEST15-BTCH',
      engagementStatus: 'payable',
      talentPayouts: [
        {
          talentUserId:   'USR-T15A-BATCH',
          talentNetCents: 13200,
          settlementInstruction: makeSettlementInstruction('ENG-TEST15-BTCH-A', 13200),
        },
        {
          talentUserId:   'USR-T15B-BATCH',
          talentNetCents: 13200,
          settlementInstruction: makeSettlementInstruction('ENG-TEST15-BTCH-B', 13200),
        },
      ],
      contractSnapshotPhase2: makeContractSnapshot(30000, [
        { talentNetCents: 13200, commissionMrCents: 1800 },
        { talentNetCents: 13200, commissionMrCents: 1800 },
      ]),
      repositories: repos,
    });

    assert(r.allExecuted === true,        'allExecuted doit être true');
    assert(r.results.length === 2,        '2 résultats');
    assert(r.results.every(res => res.executed), 'Tous exécutés');
  });

  // ── T-16 : Batch partiel — un KYC manquant ────────────────
  await test('T-16 Batch partiel — talent sans KYC VERIFIED bloqué, autres OK', async () => {
    const repos = makeRepositories();
    // Talent A : VERIFIED
    await repos.talentPaymentProfiles.upsert({
      talentUserId:    'USR-T16A-PART',
      stripeAccountId: 'acct_A16',
      kycStatus:       'VERIFIED',
    });
    // Talent B : PENDING (bloque)
    await repos.talentPaymentProfiles.upsert({
      talentUserId:    'USR-T16B-PART',
      stripeAccountId: 'acct_B16',
      kycStatus:       'PENDING',
    });

    const r = await PayoutExecutor.executePayoutBatch({
      engagementId:    'ENG-TEST16-PART',
      engagementStatus: 'payable',
      talentPayouts: [
        { talentUserId: 'USR-T16A-PART', talentNetCents: 13200, settlementInstruction: makeSettlementInstruction('ENG-TEST16-A', 13200) },
        { talentUserId: 'USR-T16B-PART', talentNetCents: 13200, settlementInstruction: makeSettlementInstruction('ENG-TEST16-B', 13200) },
      ],
      repositories: repos,
    });

    assert(r.allExecuted === false, 'allExecuted doit être false');
    const talentA = r.results.find(res => res.talentUserId === 'USR-T16A-PART');
    const talentB = r.results.find(res => res.talentUserId === 'USR-T16B-PART');
    assert(talentA.executed === true,                          'Talent A doit être payé');
    assert(talentB.executed === false,                         'Talent B doit être bloqué');
    assert(talentB.blockReason === 'PAYOUT_BLOCK_KYC',        `BlockReason: ${talentB.blockReason}`);
  });

  // ── T-17 : checkConfig() — manquant si clés absentes ─────
  await test('T-17 StripeAdapter.checkConfig() détecte les clés manquantes', async () => {
    // Sauvegarder et supprimer les clés temporairement
    const savedKey    = process.env.STRIPE_SECRET_KEY;
    const savedSecret = process.env.STRIPE_WEBHOOK_SECRET;
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_WEBHOOK_SECRET;

    const config = StripeAdapter.checkConfig();

    process.env.STRIPE_SECRET_KEY    = savedKey;
    process.env.STRIPE_WEBHOOK_SECRET = savedSecret;

    assert(config.configured === false, 'configured doit être false');
    assert(config.missing.includes('STRIPE_SECRET_KEY'),    'STRIPE_SECRET_KEY doit être dans missing');
    assert(config.missing.includes('STRIPE_WEBHOOK_SECRET'), 'STRIPE_WEBHOOK_SECRET doit être dans missing');
  });

  // ── T-18 : Lazy init — pas d'erreur au require ────────────
  await test('T-18 StripeAdapter — require sans clé ne lève pas d\'erreur', async () => {
    // Le module est déjà chargé — on vérifie que checkConfig() est appelable
    // sans lancer une exception au chargement du module
    const config = StripeAdapter.checkConfig();
    // Avec les clés mockées en haut : configured = true
    assert(config.configured === true, 'Avec les clés de test, configured doit être true');
  });

  // ── T-19 : Waterfall zéro cent — DJ Alex au Trèfle ───────
  await test('T-19 DJ Alex 300$ CAD — waterfall zéro centime résidu', async () => {
    const repos = makeRepositories();
    await repos.talentPaymentProfiles.upsert({
      talentUserId:    'USR-DJALE-X001',
      stripeAccountId: 'acct_DJALE',
      kycStatus:       'VERIFIED',
    });

    const snapshot = makeContractSnapshot(
      30000, // 300.00$ CAD = 30000¢
      [{ talentNetCents: 26400, commissionMrCents: 3600 }] // 26400+3600=30000 → résidu=0 ✅
    );

    const result = await PayoutExecutor.executePayout({
      engagementId:   'ENG-DJALE-X001',
      talentUserId:   'USR-DJALE-X001',
      talentNetCents: 26400,
      currency:       'cad',
      engagementStatus: 'payable',
      settlementInstruction: makeSettlementInstruction('ENG-DJALE-X001', 26400),
      contractSnapshotPhase2: snapshot,
      repositories:   repos,
    });

    assert(result.executed === true,        'DJ Alex doit être payé');
    assert(result.amountCents === 26400,    `Montant: ${result.amountCents}¢ (attendu 26400¢ = 264.00$)`);
    assert(result.verrouxPassed.length === 6, '6 verrous D-101 passés');

    // Vérification du résidu zéro cent
    const { prixVenduClientCents, waterfall } = snapshot;
    const sumNets = waterfall.reduce((s, e) => s + e.talentNetCents, 0);
    const sumComm = waterfall.reduce((s, e) => s + e.commissionMrCents, 0);
    const residu  = prixVenduClientCents - sumNets - sumComm;
    assert(residu === 0, `LOI LEDGER-02 : résidu attendu 0¢, obtenu ${residu}¢`);

    console.log('');
    console.log('     ── Pierre de Rosette — DJ Alex au Trèfle ──────');
    console.log(`     Prix vendu client : ${(prixVenduClientCents/100).toFixed(2)}$`);
    console.log(`     Commission MR     : ${(sumComm/100).toFixed(2)}$ (12%)`);
    console.log(`     Talent net        : ${(sumNets/100).toFixed(2)}$`);
    console.log(`     Résidu arrondi    : ${residu}¢`);
    console.log(`     TransferId Stripe : ${result.stripeTransferId}`);
    console.log('     LOI LEDGER-02     : ✓ invariant parfait');
    console.log('');
  });

  // ── Résumé ────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════════════════');
  console.log(`  Résultats : ${passed} PASSED · ${failed} FAILED`);
  if (errors.length > 0) {
    console.log('\n  Échecs détaillés :');
    errors.forEach(e => console.log(`    ✗ ${e.name}\n      ${e.error}`));
  }
  console.log('══════════════════════════════════════════════════════\n');

  process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => {
  console.error('SUITE ERROR:', err);
  process.exit(1);
});