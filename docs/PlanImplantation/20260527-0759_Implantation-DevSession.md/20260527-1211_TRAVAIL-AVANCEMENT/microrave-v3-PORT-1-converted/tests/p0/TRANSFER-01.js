/**
 * MICRO RAVE V3 — Test P0 : TRANSFER-01
 * ============================================================
 * Valide TransferGuard via transitionEngagement().
 * Source : D-074 · Phase 2.3
 *
 * T-01 : deposit_secured→transfer_requested avec newTalentUserId → passe
 * T-02 : sans transferApprovedByOrganizer → TRANSFER_MISSING_ORGANIZER_APPROVAL
 * T-03 : newTalentUserId === originalTalentUserId → TRANSFER_SAME_TALENT
 * ============================================================
 */

'use strict';

import { createRequire as __createRequire } from 'node:module';
const require = __createRequire(import.meta.url);
process.env.STRIPE_SECRET_KEY     = 'sk_test_MOCK_TRANSFER_01';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_MOCK_TRANSFER_01';
process.env.BASE44_API_KEY        = 'sk_test_MOCK_TRANS_KEY';
require.cache[require.resolve('stripe')] = {
  id: require.resolve('stripe'), filename: require.resolve('stripe'), loaded: true,
  exports: () => ({ transfers: { create: async () => ({ id: 'tr_MOCK_TRANS' }) } }),
};

import { transitionEngagement } from '../../src/core/transitionEngagement.js';
let passed = 0; let failed = 0;

const ENG_ID     = 'ENG-TRANSFER-TEST1';
const ACTOR_ID   = 'USR-TRANS-ACTOR01';
const TALENT_ORI = 'USR-TRANS-ORIG001';
const TALENT_NEW = 'USR-TRANS-NEW0001';

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
console.log('Test P0 : TRANSFER-01 -- TransferGuard (D-074)');
console.log('=======================================================\n');

async function run() {

  await testAsync('T-01 : deposit_secured→transfer_requested avec newTalentUserId → passe', async () => {
    const result = await transitionEngagement({
      engagementId: ENG_ID, currentState: 'deposit_secured', targetState: 'transfer_requested',
      actor: ACTOR_ID,
      context: {
        newTalentUserId:             TALENT_NEW,
        originalTalentUserId:        TALENT_ORI,
        transferApprovedByOrganizer: true,
      },
      repositories,
    });
    assert(result.success === true, `success attendu true. Recu : ${result.success}`);
    assert(result.newState === 'transfer_requested',
      `newState attendu 'transfer_requested'. Recu : '${result.newState}'`);
    assert(result.transferRecord !== undefined,
      `transferRecord doit etre present. Cles : ${JSON.stringify(Object.keys(result))}`);
    assert(result.transferRecord.newTalentUserId === TALENT_NEW,
      `transferRecord.newTalentUserId attendu ${TALENT_NEW}. Recu : ${result.transferRecord.newTalentUserId}`);
  });

  await testAsync('T-02 : sans transferApprovedByOrganizer → TRANSFER_MISSING_ORGANIZER_APPROVAL', async () => {
    let threw = false;
    try {
      await transitionEngagement({
        engagementId: ENG_ID, currentState: 'deposit_secured', targetState: 'transfer_requested',
        actor: ACTOR_ID,
        context: { newTalentUserId: TALENT_NEW, originalTalentUserId: TALENT_ORI },
        repositories,
      });
    } catch (err) {
      threw = true;
      assert(
        err.message.includes('TRANSFER_MISSING_ORGANIZER_APPROVAL') || err.message.includes('GUARD_FAILED'),
        `Attendu TRANSFER_MISSING_ORGANIZER_APPROVAL. Recu : "${err.message}"`);
    }
    assert(threw, 'transferApprovedByOrganizer absent devait bloquer.');
  });

  await testAsync('T-03 : newTalentUserId === originalTalentUserId → TRANSFER_SAME_TALENT', async () => {
    let threw = false;
    try {
      await transitionEngagement({
        engagementId: ENG_ID, currentState: 'deposit_secured', targetState: 'transfer_requested',
        actor: ACTOR_ID,
        context: {
          newTalentUserId:             TALENT_ORI,   // identique a l'original
          originalTalentUserId:        TALENT_ORI,
          transferApprovedByOrganizer: true,
        },
        repositories,
      });
    } catch (err) {
      threw = true;
      assert(
        err.message.includes('TRANSFER_SAME_TALENT') || err.message.includes('GUARD_FAILED'),
        `Attendu TRANSFER_SAME_TALENT. Recu : "${err.message}"`);
    }
    assert(threw, 'Transfert vers soi-meme devait etre bloque.');
  });

  console.log('\n=======================================================');
  console.log(`RESULTAT : ${passed} passes, ${failed} echoues sur ${passed + failed} tests`);
  if (failed === 0) { console.log('\u2713 TRANSFER-01 PASSED'); }
  else { console.log('\u2717 TRANSFER-01 FAILED'); process.exitCode = 1; }
  console.log('=======================================================');
}
run().catch(err => { console.error('ERREUR FATALE :', err.message); process.exitCode = 1; });