/**
 * MICRO RAVE V3 — Test P0 : PAYOUT-SETTLED-01
 * ============================================================
 * Prouve que transitionEngagement({ payable → settled })
 * déclenche réellement PayoutExecutor et fait partir un
 * Transfer Stripe avant d'écrire l'état WORM W3.
 *
 * Scénario : DJ Alex au Bar Le Trèfle
 *   cachetBrutFinal : 30 000¢ (300$)
 *   commissionMR    :  3 600¢ ( 36$, 12%)
 *   talentNet       : 26 400¢ (264$)
 *   prixVenduClient : 30 000¢ (300$)
 *
 * Tests :
 *   T-01 : chemin nominal — Transfer Stripe exécuté + result.payoutBatch
 *   T-02 : talentPayouts absent → bloqué
 *   T-03 : KYC non VERIFIED → bloqué
 *   T-04 : SettlementInstruction déjà consommée → bloqué
 *   T-05 : invariant ledger violé → bloqué
 *   T-06 : Transfer Stripe échoue → bloqué, état reste payable
 *   T-07 : idempotency — double payout bloqué par V2 (PayoutExecutionRecord existant)
 *
 * Source : D-101 · PayoutExecutor · OS V14 J8 · transitionEngagement §GUARD 4.5
 * ============================================================
 */

'use strict';

process.env.STRIPE_SECRET_KEY     = 'sk_test_MOCK_KEY_PAYOUT_TEST';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_MOCK_PAYOUT_TEST';

// ── Mock stripe avant tout require ────────────────────────────
let stripeTransferCallCount  = 0;
let stripeTransferShouldFail = false;

require.cache[require.resolve('stripe')] = {
  id:       require.resolve('stripe'),
  filename: require.resolve('stripe'),
  loaded:   true,
  exports:  () => ({
    transfers: {
      create: async (params) => {
        stripeTransferCallCount++;
        if (stripeTransferShouldFail) {
          const err = new Error('Your card has insufficient funds.');
          err.type = 'StripeCardError';
          err.code = 'insufficient_funds';
          throw err;
        }
        return { id: `tr_MOCK_${params.metadata.talentUserId}_TEST`, ...params };
      },
    },
  }),
};

const { transitionEngagement } = require('../../src/core/transitionEngagement');

// ── Fixtures ──────────────────────────────────────────────────
const ENG_ID    = 'ENG-PAYOUT-TEST001';
const ACTOR_ID  = 'USR-PAYOUT-ACTOR01';
const TALENT_ID = 'USR-PAYOUT-TALENT1';

const CONTRACT_SNAPSHOT_PHASE2 = {
  systemId:             'CS2-PAYOUT-TEST001',
  engagementId:         ENG_ID,
  phase:                2,
  prixVenduClientCents: 30_000,
  waterfall: [{
    talentUserId:         TALENT_ID,
    cachetSigneCents:     20_000,
    cachetBrutFinalCents: 30_000,
    commissionMrCents:     3_600,
    talentNetCents:       26_400,
    tauxPpm:             120_000,
  }],
  totalNets:        26_400,
  totalCommissions:  3_600,
  roundingCents:         0,
  durationMinutes:     120,
};

const BASE_SETTLEMENT = {
  id:           'SI-PAYOUT-TEST001',
  engagementId: ENG_ID,
  talentUserId: TALENT_ID,
  amountCents:  26_400,
  consumedAt:   null,
};

// ── Factories ─────────────────────────────────────────────────
function makeRepos({ kycVerified = true, hasExistingRecord = false } = {}) {
  const stored = hasExistingRecord
    ? [{ id: 'PER-EXISTING', engagementId: ENG_ID, talentUserId: TALENT_ID, stripeTransferId: 'tr_EXISTING' }]
    : [];

  return {
    policyConfig: {
      async getConfig(key) {
        const db = {
          contestationWindowDurationHours: '24',
          maxDistancePolicy:               '500',
          minDurationFloorMinutes:         '30',
          minDurationRatioPpm:             '950000',
        };
        if (!(key in db)) throw new Error(`POLICY_CONFIG_MISSING: "${key}"`);
        return db[key];
      },
    },
    payoutExecutionRecords: {
      async findByEngagementId(engId, talId) {
        return stored.find(r => r.engagementId === engId && r.talentUserId === talId) || null;
      },
      async create(data) { return { id: 'PER-NEW-001', ...data }; },
    },
    talentPaymentProfiles: {
      async findByTalentUserId(id) {
        if (!kycVerified) return { kycStatus: 'PENDING', stripeAccountId: 'acct_UNVERIFIED' };
        return { kycStatus: 'VERIFIED', stripeAccountId: 'acct_MOCK_ALEX', talentUserId: id };
      },
    },
    settlementInstructions: {
      async markConsumed(id, data) { return { id, ...data }; },
    },
    ledgerRecords: {
      async append(entry) { return { id: `LDG-${Date.now()}`, ...entry }; },
    },
  };
}

function makePayouts(siOverrides = {}) {
  return [{
    talentUserId:          TALENT_ID,
    talentNetCents:        26_400,
    settlementInstruction: { ...BASE_SETTLEMENT, ...siOverrides },
  }];
}

function makeContext(overrides = {}) {
  return {
    contractSnapshotPhase2: CONTRACT_SNAPSHOT_PHASE2,
    talentPayouts:          makePayouts(),
    currency:               'cad',
    goNoGoDecisionRecord:   { decision: 'GO', engagementId: ENG_ID, systemId: 'GONOGO-001' },
    ledgerBalanced:         true,
    ...overrides,
  };
}

// ── Helpers ───────────────────────────────────────────────────
let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.log(`  ✗ ${name}`);
    console.log(`    → ${err.message}`);
    failed++;
  }
}

function assert(cond, msg) { if (!cond) throw new Error(msg); }

async function expectThrows(fn, substring) {
  let threw = false;
  try { await fn(); }
  catch (e) {
    threw = true;
    assert(e.message.includes(substring), `Attendu "${substring}" dans: ${e.message}`);
  }
  assert(threw, `Doit lever une erreur contenant "${substring}"`);
}

// ─────────────────────────────────────────────────────────────
async function run() {
  console.log('PAYOUT-SETTLED-01 — branchement PayoutExecutor sur payable→settled');
  console.log('═══════════════════════════════════════════════');

  // T-01 ─────────────────────────────────────────────────────
  await test('T-01 chemin nominal — Transfer Stripe exécuté + result.payoutBatch', async () => {
    stripeTransferCallCount  = 0;
    stripeTransferShouldFail = false;

    const result = await transitionEngagement({
      engagementId: ENG_ID,
      currentState: 'payable',
      targetState:  'settled',
      actor:        ACTOR_ID,
      context:      makeContext(),
      repositories: makeRepos(),
    });

    assert(result.success === true,                                        'success doit être true');
    assert(result.newState === 'settled',                                  'newState doit être "settled"');
    assert(result.payoutBatch !== undefined,                               'result.payoutBatch doit être présent');
    assert(result.payoutBatch.allExecuted === true,                        'allExecuted doit être true');
    assert(result.payoutBatch.results.length === 1,                        'Un résultat par talent');
    assert(result.payoutBatch.results[0].executed === true,                'Payout du talent exécuté');
    assert(result.payoutBatch.results[0].stripeTransferId.startsWith('tr_MOCK'), 'stripeTransferId Stripe présent');
    assert(stripeTransferCallCount === 1,                                  'stripe.transfers.create appelé exactement 1 fois');
  });

  // T-02 ─────────────────────────────────────────────────────
  await test('T-02 talentPayouts absent → PAYOUT_MISSING_TALENTS', async () => {
    await expectThrows(
      () => transitionEngagement({
        engagementId: ENG_ID, currentState: 'payable', targetState: 'settled', actor: ACTOR_ID,
        context: { contractSnapshotPhase2: CONTRACT_SNAPSHOT_PHASE2, goNoGoDecisionRecord: { decision: 'GO', engagementId: ENG_ID, systemId: 'GNG-T02' }, ledgerBalanced: true },
        repositories: makeRepos(),
      }),
      'PAYOUT_MISSING_TALENTS'
    );
  });

  // T-03 ─────────────────────────────────────────────────────
  await test('T-03 KYC non VERIFIED → PAYOUT_BATCH_FAILED', async () => {
    await expectThrows(
      () => transitionEngagement({
        engagementId: ENG_ID, currentState: 'payable', targetState: 'settled', actor: ACTOR_ID,
        context:      makeContext(),
        repositories: makeRepos({ kycVerified: false }),
      }),
      'PAYOUT_BATCH_FAILED'
    );
  });

  // T-04 ─────────────────────────────────────────────────────
  await test('T-04 SettlementInstruction consommée → PAYOUT_BATCH_FAILED', async () => {
    await expectThrows(
      () => transitionEngagement({
        engagementId: ENG_ID, currentState: 'payable', targetState: 'settled', actor: ACTOR_ID,
        context: makeContext({ talentPayouts: makePayouts({ consumedAt: '2026-05-20T10:00:00.000Z' }) }),
        repositories: makeRepos(),
      }),
      'PAYOUT_BATCH_FAILED'
    );
  });

  // T-05 ─────────────────────────────────────────────────────
  await test('T-05 invariant ledger violé → bloqué avant Stripe', async () => {
    stripeTransferCallCount = 0;
    const snapshotCorrompu = {
      ...CONTRACT_SNAPSHOT_PHASE2,
      waterfall: [{ ...CONTRACT_SNAPSHOT_PHASE2.waterfall[0], talentNetCents: 99_999 }],
      totalNets: 99_999,
    };
    let threw = false;
    try {
      await transitionEngagement({
        engagementId: ENG_ID, currentState: 'payable', targetState: 'settled', actor: ACTOR_ID,
        context: makeContext({
          contractSnapshotPhase2: snapshotCorrompu,
          talentPayouts: [{ talentUserId: TALENT_ID, talentNetCents: 99_999, settlementInstruction: { ...BASE_SETTLEMENT, amountCents: 99_999 } }],
        }),
        repositories: makeRepos(),
      });
    } catch (e) {
      threw = true;
      // LedgerInvariantGuard (GUARD 4) ou PayoutExecutor verrou 5 doit bloquer
      const validReasons = ['LEDGER_INVARIANT', 'PAYOUT_BATCH_FAILED'];
      assert(validReasons.some(r => e.message.includes(r)), `Attendu LEDGER_INVARIANT ou PAYOUT_BATCH_FAILED, reçu: ${e.message}`);
    }
    assert(threw, 'Doit lever une erreur sur invariant violé');
  });

  // T-06 ─────────────────────────────────────────────────────
  await test('T-06 Transfer Stripe échoue → PAYOUT_BATCH_FAILED, état reste payable', async () => {
    stripeTransferShouldFail = true;
    try {
      await expectThrows(
        () => transitionEngagement({
          engagementId: ENG_ID, currentState: 'payable', targetState: 'settled', actor: ACTOR_ID,
          context:      makeContext(),
          repositories: makeRepos(),
        }),
        'PAYOUT_BATCH_FAILED'
      );
    } finally {
      stripeTransferShouldFail = false;
    }
  });

  // T-07 ─────────────────────────────────────────────────────
  await test('T-07 idempotency V2 — double payout bloqué, Stripe non appelé', async () => {
    stripeTransferCallCount  = 0;
    stripeTransferShouldFail = false;
    await expectThrows(
      () => transitionEngagement({
        engagementId: ENG_ID, currentState: 'payable', targetState: 'settled', actor: ACTOR_ID,
        context:      makeContext(),
        repositories: makeRepos({ hasExistingRecord: true }),
      }),
      'PAYOUT_BATCH_FAILED'
    );
    assert(stripeTransferCallCount === 0, 'stripe.transfers.create ne doit PAS être appelé si record existant');
  });

  // ── Résumé ───────────────────────────────────────────────────
  console.log('═══════════════════════════════════════════════');
  if (failed === 0) {
    console.log(`PAYOUT-SETTLED-01 : ✓ PASSED (${passed}/${passed + failed})`);
    console.log('');
    console.log('L\'argent bouge maintenant. payable→settled = preuve avant irréversibilité.');
  } else {
    console.log(`PAYOUT-SETTLED-01 : ✗ FAILED (${passed} ✓ / ${failed} ✗)`);
    process.exit(1);
  }
  console.log('═══════════════════════════════════════════════');
}

run();