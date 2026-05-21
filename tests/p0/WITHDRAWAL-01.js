/**
 * MICRO RAVE V3 — Test P0 : WITHDRAWAL-01
 * ============================================================
 * Valide WithdrawalGuard via transitionEngagement().
 * Source : D-074 · Phase 2.3
 *
 * T-01 : proposed→withdrawn avec withdrawalReason → passe
 * T-02 : sans withdrawalReason → WITHDRAWAL_MISSING_REASON
 * T-03 : actorRole non autorise (admin) → WITHDRAWAL_UNAUTHORIZED_ROLE
 * ============================================================
 */

'use strict';

process.env.STRIPE_SECRET_KEY     = 'sk_test_MOCK_WITHDRAW';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_MOCK_WITHDRAW';
process.env.BASE44_API_KEY        = 'sk_test_MOCK_WITHDR_KEY';
require.cache[require.resolve('stripe')] = {
  id: require.resolve('stripe'), filename: require.resolve('stripe'), loaded: true,
  exports: () => ({ transfers: { create: async () => ({ id: 'tr_MOCK_WITHDR' }) } }),
};

const { transitionEngagement } = require('../../src/core/transitionEngagement');

let passed = 0; let failed = 0;

const ENG_ID   = 'ENG-WITHDRAW-TEST1';
const ACTOR_ID = 'USR-WITHDR-ACT001';

const mockPolicyConfig = {
  async getConfig(key) {
    const db = {
      deposit_ratio_ppm: 200000, event_payment_cap_cents: 350000, balanceDeadlineDays: 6,
      maxDistancePolicy: 500, minDurationFloorMinutes: 30, minDurationRatioPpm: 950000,
      contestationWindowDurationHours: 24, checkInWindowMinutes: 60, sots_window_duration_hours: 24,
    };
    if (!(key in db)) throw new Error(`POLICY_CONFIG_MISSING: "${key}"`);
    return db[key];
  },
};

const repositories = {
  policyConfig: mockPolicyConfig,
  admin: { appendToDataAccessLedger: async () => ({}), createAdminIncidentRecord: async () => ({}) },
};

async function testAsync(name, fn) {
  try { await fn(); console.log(`  \u2713 ${name}`); passed++; }
  catch (e) { console.log(`  \u2717 ${name}\n    \u2192 ${e.message}`); failed++; }
}
function assert(c, m) { if (!c) throw new Error(m); }

console.log('=======================================================');
console.log('Test P0 : WITHDRAWAL-01 -- WithdrawalGuard (D-074)');
console.log('=======================================================\n');

async function run() {

  await testAsync('T-01 : proposed→withdrawn avec withdrawalReason → passe', async () => {
    const result = await transitionEngagement({
      engagementId: ENG_ID, currentState: 'proposed', targetState: 'withdrawn',
      actor: ACTOR_ID,
      context: { withdrawalReason: 'INDISPONIBILITE_TALENT', actorRole: 'talent' },
      repositories,
    });
    assert(result.success === true, `success attendu true. Recu : ${result.success}`);
    assert(result.newState === 'withdrawn', `newState attendu 'withdrawn'. Recu : '${result.newState}'`);
    assert(result.withdrawalRecord !== undefined,
      `withdrawalRecord doit etre present. Cles : ${JSON.stringify(Object.keys(result))}`);
    assert(result.withdrawalRecord.withdrawalReason === 'INDISPONIBILITE_TALENT',
      `withdrawalReason attendu 'INDISPONIBILITE_TALENT'. Recu : '${result.withdrawalRecord.withdrawalReason}'`);
    assert(result.withdrawalRecord.financialImpact === 'NONE',
      `financialImpact attendu 'NONE' (aucun fonds engage). Recu : '${result.withdrawalRecord.financialImpact}'`);
  });

  await testAsync('T-02 : sans withdrawalReason → WITHDRAWAL_MISSING_REASON', async () => {
    let threw = false;
    try {
      await transitionEngagement({
        engagementId: ENG_ID, currentState: 'proposed', targetState: 'withdrawn',
        actor: ACTOR_ID,
        context: { actorRole: 'organisateur' },
        repositories,
      });
    } catch (err) {
      threw = true;
      assert(
        err.message.includes('WITHDRAWAL_MISSING_REASON') || err.message.includes('GUARD_FAILED'),
        `Attendu WITHDRAWAL_MISSING_REASON. Recu : "${err.message}"`);
    }
    assert(threw, 'withdrawalReason absent devait bloquer.');
  });

  await testAsync('T-03 : actorRole non autorise (admin) → WITHDRAWAL_UNAUTHORIZED_ROLE', async () => {
    let threw = false;
    try {
      await transitionEngagement({
        engagementId: ENG_ID, currentState: 'negotiating', targetState: 'withdrawn',
        actor: ACTOR_ID,
        context: { withdrawalReason: 'TEST', actorRole: 'admin' },
        repositories,
      });
    } catch (err) {
      threw = true;
      assert(
        err.message.includes('WITHDRAWAL_UNAUTHORIZED_ROLE') || err.message.includes('GUARD_FAILED'),
        `Attendu WITHDRAWAL_UNAUTHORIZED_ROLE. Recu : "${err.message}"`);
    }
    assert(threw, 'actorRole admin devait etre bloque. D-074 : talent/organisateur uniquement.');
  });

  console.log('\n=======================================================');
  console.log(`RESULTAT : ${passed} passes, ${failed} echoues sur ${passed + failed} tests`);
  if (failed === 0) { console.log('\u2713 WITHDRAWAL-01 PASSED'); }
  else { console.log('\u2717 WITHDRAWAL-01 FAILED'); process.exitCode = 1; }
  console.log('=======================================================');
}
run().catch(err => { console.error('ERREUR FATALE :', err.message); process.exitCode = 1; });