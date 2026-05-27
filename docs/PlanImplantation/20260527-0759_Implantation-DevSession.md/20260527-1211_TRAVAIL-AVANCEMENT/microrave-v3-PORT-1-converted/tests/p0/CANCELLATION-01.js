/**
 * MICRO RAVE V3 — Test P0 : CANCELLATION-01
 * ============================================================
 * Valide CancellationGuard via transitionEngagement().
 *
 * Source : D-039 · D-040 · D-043 · LOI ANNULATION-01 · LOI ANNULATION-02
 *          Plan Phase 2.3
 *
 * T-01 : accepted→cancelled_pre_deposit avec reasonCode → passe
 * T-02 : accepted→cancelled_pre_deposit sans reasonCode → bloque
 * T-03 : actorRole non autorise → bloque (CANCELLATION_UNAUTHORIZED_ROLE)
 * T-04 : deposit_secured→cancelled_J7 → cancellationRecord frais nuls (LOI ANNULATION-02)
 * T-05 : transition non couverte → GUARD_MISMATCH
 * ============================================================
 */

'use strict';

import { createRequire as __createRequire } from 'node:module';
const require = __createRequire(import.meta.url);
process.env.STRIPE_SECRET_KEY     = 'sk_test_MOCK_CANCEL_01';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_MOCK_CANCEL_01';
process.env.BASE44_API_KEY        = 'sk_test_MOCK_CANCEL_KEY';
require.cache[require.resolve('stripe')] = {
  id: require.resolve('stripe'), filename: require.resolve('stripe'), loaded: true,
  exports: () => ({ transfers: { create: async () => ({ id: 'tr_MOCK_CANCEL' }) } }),
};

import { transitionEngagement } from '../../src/core/transitionEngagement.js';
let passed = 0; let failed = 0;

const ENG_ID   = 'ENG-CANCEL-TEST01';
const ACTOR_ID = 'USR-CANCEL-ACTOR1';

const mockPolicyConfig = {
  async getConfig(key) {
    const db = {
      deposit_ratio_ppm: 200000, event_payment_cap_cents: 350000,
      balanceDeadlineDays: 6, maxDistancePolicy: 500,
      minDurationFloorMinutes: 30, minDurationRatioPpm: 950000,
      contestationWindowDurationHours: 24, checkInWindowMinutes: 60,
      sots_window_duration_hours: 24,
    };
    if (!(key in db)) throw new Error(`POLICY_CONFIG_MISSING: "${key}"`);
    return db[key];
  },
};

const mockAdmin = {
  appendToDataAccessLedger: async () => ({ id: 'dal-cancel-001' }),
  createAdminIncidentRecord: async () => ({ id: 'inc-cancel-001' }),
};

const repositories = { policyConfig: mockPolicyConfig, admin: mockAdmin };

async function testAsync(name, fn) {
  try { await fn(); console.log(`  \u2713 ${name}`); passed++; }
  catch (e) { console.log(`  \u2717 ${name}\n    \u2192 ${e.message}`); failed++; }
}
function assert(c, m) { if (!c) throw new Error(m); }

console.log('=======================================================');
console.log('Test P0 : CANCELLATION-01');
console.log('CancellationGuard -- D-039, D-040, LOI ANNULATION-01/02');
console.log('=======================================================\n');

async function run() {

  // ── T-01 : accepted→cancelled_pre_deposit avec reasonCode ─
  await testAsync('T-01 : accepted→cancelled_pre_deposit avec reasonCode → passe', async () => {
    const result = await transitionEngagement({
      engagementId: ENG_ID,
      currentState:  'accepted',
      targetState:   'cancelled_pre_deposit',
      actor:         ACTOR_ID,
      context: {
        reasonCode: 'ORGANISATEUR_ANNULE_AVANT_DEPOT',
        actorRole:  'organisateur',
      },
      repositories,
    });
    assert(result.success === true,
      `Transition devait reussir. Recu : success=${result.success}`);
    assert(result.newState === 'cancelled_pre_deposit',
      `newState attendu 'cancelled_pre_deposit'. Recu : '${result.newState}'`);
    assert(result.cancellationRecord !== undefined,
      `cancellationRecord doit etre present dans le result. ` +
      `Cles : ${JSON.stringify(Object.keys(result))}`);
    assert(result.cancellationRecord.cancellationType === 'PRE_DEPOSIT',
      `cancellationType attendu 'PRE_DEPOSIT'. Recu : '${result.cancellationRecord.cancellationType}'`);
    assert(result.cancellationRecord.refundAmountCents === 0,
      `refundAmountCents attendu 0 (aucun fonds engage). Recu : ${result.cancellationRecord.refundAmountCents}`);
    assert(
      typeof result.cancellationRecord.systemId === 'string',
      `cancellationRecord.systemId doit etre present.`
    );
  });

  // ── T-02 : sans reasonCode → bloque ─────────────────────
  await testAsync('T-02 : accepted→cancelled_pre_deposit sans reasonCode → bloque (CANCELLATION_MISSING_REASON)', async () => {
    let threw = false;
    try {
      await transitionEngagement({
        engagementId: ENG_ID,
        currentState:  'accepted',
        targetState:   'cancelled_pre_deposit',
        actor:         ACTOR_ID,
        context: {
          // reasonCode absent
          actorRole: 'organisateur',
        },
        repositories,
      });
    } catch (err) {
      threw = true;
      assert(
        err.message.includes('CANCELLATION_MISSING_REASON') || err.message.includes('GUARD_FAILED'),
        `Attendu CANCELLATION_MISSING_REASON ou GUARD_FAILED. Recu : "${err.message}"`
      );
    }
    assert(threw, 'Annulation sans reasonCode devait etre bloquee. Source : D-039.');
  });

  // ── T-03 : actorRole non autorise → bloque ───────────────
  await testAsync('T-03 : actorRole non autorise → bloque (CANCELLATION_UNAUTHORIZED_ROLE)', async () => {
    let threw = false;
    try {
      await transitionEngagement({
        engagementId: ENG_ID,
        currentState:  'accepted',
        targetState:   'cancelled_pre_deposit',
        actor:         ACTOR_ID,
        context: {
          reasonCode: 'TEST',
          actorRole:  'vendeur',  // non autorise
        },
        repositories,
      });
    } catch (err) {
      threw = true;
      assert(
        err.message.includes('CANCELLATION_UNAUTHORIZED_ROLE') || err.message.includes('GUARD_FAILED'),
        `Attendu CANCELLATION_UNAUTHORIZED_ROLE ou GUARD_FAILED. Recu : "${err.message}"`
      );
    }
    assert(threw, 'actorRole "vendeur" devait etre refuse. Source : CancellationGuard AUTHORIZED_ROLES.');
  });

  // ── T-04 : deposit_secured→cancelled_J7, frais nuls LOI ANNULATION-02 ─
  await testAsync('T-04 : deposit_secured→cancelled_J7 → cancellationRecord frais nuls (LOI ANNULATION-02)', async () => {
    const result = await transitionEngagement({
      engagementId: ENG_ID,
      currentState:  'deposit_secured',
      targetState:   'cancelled_J7',
      actor:         ACTOR_ID,
      context: {
        reasonCode:         'BALANCE_DEADLINE_EXCEEDED',
        actorRole:          'SYSTEM',
        depotBrutRecuCents: 20_000,  // 200$
      },
      repositories,
    });
    assert(result.success === true,
      `Transition deposit_secured→cancelled_J7 devait reussir. Recu : success=${result.success}`);
    assert(result.cancellationRecord !== undefined,
      `cancellationRecord doit etre present. Cles : ${JSON.stringify(Object.keys(result))}`);
    assert(result.cancellationRecord.cancellationType === 'CANCELLED_J7',
      `cancellationType attendu 'CANCELLED_J7'. Recu : '${result.cancellationRecord.cancellationType}'`);
    assert(result.cancellationRecord.refundAmountCents === 0,
      `LOI ANNULATION-02 : payeur defaillant = zero remboursement. ` +
      `Recu : refundAmountCents=${result.cancellationRecord.refundAmountCents}`);
    assert(result.cancellationRecord.mrRetainsCommission === true,
      `MR doit retenir sa commission (D-040). Recu : mrRetainsCommission=${result.cancellationRecord.mrRetainsCommission}`);
    assert(result.cancellationRecord.legalBasis.includes('LOI-ANNULATION-02'),
      `legalBasis doit referencer LOI-ANNULATION-02. Recu : '${result.cancellationRecord.legalBasis}'`);
  });

  // ── T-05 : transition non couverte → GUARD_MISMATCH ──────
  await testAsync('T-05 : transition non couverte par CancellationGuard → GUARD_MISMATCH ou TRANSITION_UNAUTHORIZED', async () => {
    // placed→cancelled_J30 n'existe pas dans TRANSITION_TABLE (deposit_secured obligatoire pour J30)
    // On utilise une transition qui n'est pas dans TRANSITION_TABLE → TRANSITION_UNAUTHORIZED
    let threw = false;
    try {
      await transitionEngagement({
        engagementId: ENG_ID,
        currentState:  'placed',
        targetState:   'cancelled_J30',  // non liste dans TRANSITION_TABLE
        actor:         ACTOR_ID,
        context: { reasonCode: 'TEST', actorRole: 'organisateur' },
        repositories,
      });
    } catch (err) {
      threw = true;
      assert(
        err.message.includes('TRANSITION_UNAUTHORIZED') ||
        err.message.includes('GUARD_MISMATCH') ||
        err.message.includes('GUARD_FAILED'),
        `Attendu TRANSITION_UNAUTHORIZED, GUARD_MISMATCH ou GUARD_FAILED. Recu : "${err.message}"`
      );
    }
    assert(threw, 'Transition non couverte devait etre bloquee (fail-closed).');
  });

  console.log('\n=======================================================');
  console.log(`RESULTAT : ${passed} passes, ${failed} echoues sur ${passed + failed} tests`);
  if (failed === 0) {
    console.log('\u2713 CANCELLATION-01 PASSED');
    console.log('  Phase 2.3 validee : CancellationGuard operationnel.');
    console.log('  LOI ANNULATION-01/02 appliquees. Placeholder elimine.');
  } else {
    console.log('\u2717 CANCELLATION-01 FAILED');
    process.exitCode = 1;
  }
  console.log('=======================================================');
}

run().catch(err => { console.error('ERREUR FATALE :', err.message); process.exitCode = 1; });