/**
 * MICRO RAVE V3 — Test P0 : DATAACCESS-WRITE-01
 * ============================================================
 * Prouve que Guard 5 de transitionEngagement() appelle
 * repositories.admin.appendToDataAccessLedger() sur chaque transition.
 *
 * SOURCE : D-095 · D-107 · LOI TRANSITION-01
 *   "Toute mutation du champ status declenche un DataAccessLedger entry."
 *   Sans cette ecriture, les contournements depuis l'UI Base44
 *   sont indetectables. LOI GREFFIER-01 non verifiable.
 *
 * CE QUE CE TEST PROUVE :
 *   T-01 : transitionEngagement() appelle appendToDataAccessLedger() — capture via mock
 *   T-02 : l'entree contient actorUserId, targetObjectId, transitionKey, guardApplied
 *   T-03 : si repositories.admin absent, la transition reussit quand meme
 *   T-04 : si appendToDataAccessLedger leve une erreur, la transition reussit quand meme
 *
 * Source : D-095 · D-107 · Plan Phase 0.5 · 2026-05-21
 * ============================================================
 */

'use strict';

// Mock Stripe (GUARD 4.5)
import { createRequire as __createRequire } from 'node:module';
const require = __createRequire(import.meta.url);
process.env.STRIPE_SECRET_KEY     = 'sk_test_MOCK_DAL_WRITE';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_MOCK_DAL_WRITE';
require.cache[require.resolve('stripe')] = {
  id: require.resolve('stripe'), filename: require.resolve('stripe'), loaded: true,
  exports: () => ({ transfers: { create: async () => ({ id: 'tr_MOCK_DAL' }) } }),
};

import { transitionEngagement } from '../../src/core/transitionEngagement.js';
let passed = 0;
let failed = 0;

const ENG_ID   = 'ENG-DALWRITE-TEST1';
const ACTOR_ID = 'USR-DALWRITE-ACT01';

const mockPolicyConfig = {
  async getConfig(key) {
    const db = {
      deposit_ratio_ppm:        200000,
      event_payment_cap_cents:  350000,
      balanceDeadlineDays:      6,
      maxDistancePolicy:        500,
      minDurationFloorMinutes:  30,
      minDurationRatioPpm:      950000,
      contestationWindowDurationHours: 24,
      checkInWindowMinutes:     60,
      sots_window_duration_hours: 24,
    };
    if (!(key in db)) throw new Error(`POLICY_CONFIG_MISSING: "${key}" absent du mock`);
    return db[key];
  },
};

async function testAsync(name, fn) {
  try {
    await fn();
    console.log(`\u2713 ${name}`);
    passed++;
  } catch (err) {
    console.log(`\u2717 ${name}`);
    console.log(`  \u2192 ${err.message}`);
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

console.log('=======================================================');
console.log('Test P0 : DATAACCESS-WRITE-01');
console.log('Guard 5 DataAccessLedger -- D-095, D-107, LOI TRANSITION-01');
console.log('=======================================================\n');

async function run() {

  // ── T-01 : appendToDataAccessLedger() est appele ──────────
  await testAsync('T-01 : transitionEngagement() appelle appendToDataAccessLedger() sur chaque transition', async () => {
    let capturedEntry = null;
    const mockAdmin = {
      appendToDataAccessLedger: async (entry) => { capturedEntry = entry; },
    };

    const result = await transitionEngagement({
      engagementId: ENG_ID,
      currentState:  'proposed',
      targetState:   'negotiating',
      actor:         ACTOR_ID,
      context:       { talentUserId: 'USR-DALWRITE-TAL01', organizerUserId: 'USR-DALWRITE-ORG01', roleMetier: 'DJ', tauxPpm: 120000 },
      repositories:  { policyConfig: mockPolicyConfig, admin: mockAdmin },
    });

    assert(result.success === true, `success attendu true. Recu : ${result.success}`);
    assert(
      capturedEntry !== null,
      'appendToDataAccessLedger() aurait du etre appele. ' +
      'Guard 5 doit ecrire une DataAccessLedgerEntry sur chaque transition. ' +
      'Source : D-095, LOI TRANSITION-01.'
    );
  });

  // ── T-02 : l'entree contient les champs requis ─────────────
  await testAsync('T-02 : l\'entree DAL contient actorUserId, targetObjectId, transitionKey, guardApplied', async () => {
    let capturedEntry = null;
    const mockAdmin = {
      appendToDataAccessLedger: async (entry) => { capturedEntry = entry; },
    };

    await transitionEngagement({
      engagementId: ENG_ID,
      currentState:  'proposed',
      targetState:   'negotiating',
      actor:         ACTOR_ID,
      context:       { talentUserId: 'USR-DALWRITE-TAL01', organizerUserId: 'USR-DALWRITE-ORG01', roleMetier: 'DJ', tauxPpm: 120000 },
      repositories:  { policyConfig: mockPolicyConfig, admin: mockAdmin },
    });

    assert(capturedEntry !== null, 'appendToDataAccessLedger() non appele');
    assert(
      capturedEntry.actorUserId === ACTOR_ID,
      `actorUserId attendu "${ACTOR_ID}". Recu : "${capturedEntry.actorUserId}"`
    );
    assert(
      capturedEntry.targetObjectId === ENG_ID,
      `targetObjectId attendu "${ENG_ID}". Recu : "${capturedEntry.targetObjectId}"`
    );
    assert(
      capturedEntry.transitionKey === 'proposed->negotiating',
      `transitionKey attendu "proposed->negotiating". Recu : "${capturedEntry.transitionKey}"`
    );
    assert(
      capturedEntry.guardApplied === 'MissionConversionGuard',
      `guardApplied attendu "MissionConversionGuard". Recu : "${capturedEntry.guardApplied}"`
    );
    assert(
      capturedEntry.accessType === 'TRANSITION',
      `accessType attendu "TRANSITION". Recu : "${capturedEntry.accessType}"`
    );
    assert(
      capturedEntry.targetObjectType === 'Engagement',
      `targetObjectType attendu "Engagement". Recu : "${capturedEntry.targetObjectType}"`
    );
  });

  // ── T-03 : admin absent -> transition reussit quand meme ──
  await testAsync('T-03 : si repositories.admin absent, la transition reussit quand meme (SoloFounderOverride)', async () => {
    const result = await transitionEngagement({
      engagementId: ENG_ID,
      currentState:  'proposed',
      targetState:   'negotiating',
      actor:         ACTOR_ID,
      context:       { talentUserId: 'USR-DALWRITE-TAL01', organizerUserId: 'USR-DALWRITE-ORG01', roleMetier: 'DJ', tauxPpm: 120000 },
      repositories:  { policyConfig: mockPolicyConfig },
      // admin absent intentionnellement
    });
    assert(result.success === true, `Transition doit reussir sans repositories.admin. Recu success=${result.success}`);
    assert(result.newState === 'negotiating', `newState attendu "negotiating". Recu : "${result.newState}"`);
  });

  // ── T-04 : erreur DAL non-bloquante ────────────────────────
  await testAsync('T-04 : si appendToDataAccessLedger leve une erreur, la transition reussit quand meme', async () => {
    let incidentCreated = false;
    const mockAdminFailing = {
      appendToDataAccessLedger: async () => {
        throw new Error('BASE44_HTTP_500: Simulated DAL write failure');
      },
      createAdminIncidentRecord: async (data) => {
        assert(data.incidentType === 'DAL_WRITE_FAILED', `incidentType attendu DAL_WRITE_FAILED. Recu : ${data.incidentType}`);
        assert(data.severity === 'P0', `severity attendu P0. Recu : ${data.severity}`);
        incidentCreated = true;
      },
    };

    const result = await transitionEngagement({
      engagementId: ENG_ID,
      currentState:  'proposed',
      targetState:   'negotiating',
      actor:         ACTOR_ID,
      context:       { talentUserId: 'USR-DALWRITE-TAL01', organizerUserId: 'USR-DALWRITE-ORG01', roleMetier: 'DJ', tauxPpm: 120000 },
      repositories:  { policyConfig: mockPolicyConfig, admin: mockAdminFailing },
    });

    assert(result.success === true, `Transition doit reussir meme si DAL echoue. Recu success=${result.success}`);
    assert(incidentCreated, 'AdminIncidentRecord DAL_WRITE_FAILED aurait du etre cree. Source : D-133 alerte 10.');
  });

  // ── Rapport ───────────────────────────────────────────────
  console.log('\n=======================================================');
  console.log(`RESULTAT : ${passed} passes, ${failed} echoues sur ${passed + failed} tests`);
  if (failed === 0) {
    console.log('\u2713 DATAACCESS-WRITE-01 PASSED');
    console.log('  Phase 0.5 validee : Guard 5 ecrit DataAccessLedgerEntry.');
    console.log('  LOI TRANSITION-01 / D-095 / D-107 appliques.');
  } else {
    console.log('\u2717 DATAACCESS-WRITE-01 FAILED');
    process.exitCode = 1;
  }
  console.log('=======================================================');
}

run().catch(err => {
  console.error('ERREUR FATALE :', err.message);
  process.exitCode = 1;
});