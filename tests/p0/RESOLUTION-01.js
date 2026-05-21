/**
 * MICRO RAVE V3 — Test P0 : RESOLUTION-01
 * ============================================================
 * Valide DisputeResolutionGuard via transitionEngagement().
 * Source : D-074 · Phase 2.3
 *
 * T-01 : TALENT_WINS → disputed→payable avec decisionRecord → passe
 * T-02 : sans decisionRecord → RESOLUTION_MISSING_DECISION
 * T-03 : SPLIT sans settlementInstructionId → RESOLUTION_SPLIT_MISSING_INSTRUCTION
 * T-04 : actorRole non autorise (talent) → RESOLUTION_UNAUTHORIZED_ROLE
 * ============================================================
 */

'use strict';

process.env.STRIPE_SECRET_KEY     = 'sk_test_MOCK_RESOLUTION';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_MOCK_RESOLUTION';
process.env.BASE44_API_KEY        = 'sk_test_MOCK_RESOL_KEY';
require.cache[require.resolve('stripe')] = {
  id: require.resolve('stripe'), filename: require.resolve('stripe'), loaded: true,
  exports: () => ({ transfers: { create: async () => ({ id: 'tr_MOCK_RESOL' }) } }),
};

const { transitionEngagement } = require('../../src/core/transitionEngagement');

let passed = 0; let failed = 0;

const ENG_ID   = 'ENG-RESOL-TEST001';
const ACTOR_ID = 'USR-RESOL-ACTOR01';
const DECISION_TALENT_WINS = { systemId: 'ADM-DEC-T01', decision: 'TALENT_WINS' };
const DECISION_SPLIT = { systemId: 'ADM-DEC-SPLIT', decision: 'SPLIT' };

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
console.log('Test P0 : RESOLUTION-01 -- DisputeResolutionGuard (D-074)');
console.log('=======================================================\n');

async function run() {

  await testAsync('T-01 : TALENT_WINS → disputed→payable avec decisionRecord → passe', async () => {
    const result = await transitionEngagement({
      engagementId: ENG_ID, currentState: 'disputed', targetState: 'payable',
      actor: ACTOR_ID,
      context: { decisionRecord: DECISION_TALENT_WINS, actorRole: 'admin' },
      repositories,
    });
    assert(result.success === true, `success attendu true. Recu : ${result.success}`);
    assert(result.newState === 'payable', `newState attendu 'payable'. Recu : '${result.newState}'`);
    assert(result.resolutionRecord !== undefined,
      `resolutionRecord doit etre present. Cles : ${JSON.stringify(Object.keys(result))}`);
    assert(result.resolutionRecord.decision === 'TALENT_WINS',
      `decision attendu TALENT_WINS. Recu : '${result.resolutionRecord.decision}'`);
  });

  await testAsync('T-02 : sans decisionRecord → RESOLUTION_MISSING_DECISION', async () => {
    let threw = false;
    try {
      await transitionEngagement({
        engagementId: ENG_ID, currentState: 'disputed', targetState: 'payable',
        actor: ACTOR_ID,
        context: { actorRole: 'admin' },
        repositories,
      });
    } catch (err) {
      threw = true;
      assert(err.message.includes('RESOLUTION_MISSING_DECISION') || err.message.includes('GUARD_FAILED'),
        `Attendu RESOLUTION_MISSING_DECISION. Recu : "${err.message}"`);
    }
    assert(threw, 'decisionRecord absent devait bloquer.');
  });

  await testAsync('T-03 : SPLIT sans settlementInstructionId → RESOLUTION_SPLIT_MISSING_INSTRUCTION', async () => {
    let threw = false;
    try {
      await transitionEngagement({
        engagementId: ENG_ID, currentState: 'disputed', targetState: 'partially_settled',
        actor: ACTOR_ID,
        context: {
          decisionRecord: DECISION_SPLIT,
          actorRole: 'admin',
          deliveryRecognizedRatio: 500_000,
          // settlementInstructionId absent
        },
        repositories,
      });
    } catch (err) {
      threw = true;
      assert(
        err.message.includes('RESOLUTION_SPLIT_MISSING_INSTRUCTION') || err.message.includes('GUARD_FAILED'),
        `Attendu RESOLUTION_SPLIT_MISSING_INSTRUCTION. Recu : "${err.message}"`);
    }
    assert(threw, 'SPLIT sans settlementInstructionId devait bloquer.');
  });

  await testAsync('T-04 : actorRole non autorise (talent) → RESOLUTION_UNAUTHORIZED_ROLE', async () => {
    let threw = false;
    try {
      await transitionEngagement({
        engagementId: ENG_ID, currentState: 'disputed', targetState: 'payable',
        actor: ACTOR_ID,
        context: { decisionRecord: DECISION_TALENT_WINS, actorRole: 'talent' },
        repositories,
      });
    } catch (err) {
      threw = true;
      assert(
        err.message.includes('RESOLUTION_UNAUTHORIZED_ROLE') || err.message.includes('GUARD_FAILED'),
        `Attendu RESOLUTION_UNAUTHORIZED_ROLE. Recu : "${err.message}"`);
    }
    assert(threw, 'actorRole talent devait etre bloque. D-074 : admin/FOUNDER uniquement.');
  });

  console.log('\n=======================================================');
  console.log(`RESULTAT : ${passed} passes, ${failed} echoues sur ${passed + failed} tests`);
  if (failed === 0) { console.log('\u2713 RESOLUTION-01 PASSED'); }
  else { console.log('\u2717 RESOLUTION-01 FAILED'); process.exitCode = 1; }
  console.log('=======================================================');
}
run().catch(err => { console.error('ERREUR FATALE :', err.message); process.exitCode = 1; });