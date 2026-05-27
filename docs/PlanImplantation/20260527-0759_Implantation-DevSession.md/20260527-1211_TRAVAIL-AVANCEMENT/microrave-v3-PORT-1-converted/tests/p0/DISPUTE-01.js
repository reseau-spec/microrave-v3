/**
 * MICRO RAVE V3 — Test P0 : DISPUTE-01
 * ============================================================
 * Valide DisputeGuard via transitionEngagement().
 *
 * Source : D-019-B · OS V15 §2.7.1 · Plan Phase 2.3
 *
 * T-01 : Frein d'Urgence depuis accepted avec evidence → passe
 * T-02 : sans evidenceBundleId → DISPUTE_MISSING_EVIDENCE
 * T-03 : sans disputeReason → DISPUTE_MISSING_REASON
 * T-04 : Frein d'Urgence depuis etat non autorise (archived) → DISPUTE_STATE_NOT_ELIGIBLE
 * T-05 : Contestation de Prestation depuis contestation_window → passe
 * T-06 : transition non couverte → GUARD_MISMATCH ou TRANSITION_UNAUTHORIZED
 * ============================================================
 */

'use strict';

import { createRequire as __createRequire } from 'node:module';
const require = __createRequire(import.meta.url);
process.env.STRIPE_SECRET_KEY     = 'sk_test_MOCK_DISPUTE_01';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_MOCK_DISPUTE_01';
process.env.BASE44_API_KEY        = 'sk_test_MOCK_DISPUTE_KEY';
require.cache[require.resolve('stripe')] = {
  id: require.resolve('stripe'), filename: require.resolve('stripe'), loaded: true,
  exports: () => ({ transfers: { create: async () => ({ id: 'tr_MOCK_DISP' }) } }),
};

import { transitionEngagement } from '../../src/core/transitionEngagement.js';
let passed = 0; let failed = 0;

const ENG_ID   = 'ENG-DISPUTE-TEST1';
const ACTOR_ID = 'USR-DISPUTE-ACT01';

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
  appendToDataAccessLedger:   async () => ({ id: 'dal-disp-001' }),
  createAdminIncidentRecord:  async () => ({ id: 'inc-disp-001' }),
};

const repositories = { policyConfig: mockPolicyConfig, admin: mockAdmin };

async function testAsync(name, fn) {
  try { await fn(); console.log(`  \u2713 ${name}`); passed++; }
  catch (e) { console.log(`  \u2717 ${name}\n    \u2192 ${e.message}`); failed++; }
}
function assert(c, m) { if (!c) throw new Error(m); }

console.log('=======================================================');
console.log('Test P0 : DISPUTE-01');
console.log('DisputeGuard -- D-019-B Frein Urgence + Contestation Prestation');
console.log('=======================================================\n');

async function run() {

  // ── T-01 : Frein d'Urgence depuis accepted → passe ───────
  await testAsync("T-01 : Frein d'Urgence depuis accepted avec evidence → passe", async () => {
    const result = await transitionEngagement({
      engagementId: ENG_ID,
      currentState:  'accepted',
      targetState:   'disputed',
      actor:         ACTOR_ID,
      context: {
        evidenceBundleId: 'EVD-TEST-001',
        disputeReason:    'PAIEMENT_NON_CONFORME',
        actorRole:        'organisateur',
      },
      repositories,
    });
    assert(result.success === true,
      `Transition devait reussir. Recu : success=${result.success}`);
    assert(result.newState === 'disputed',
      `newState attendu 'disputed'. Recu : '${result.newState}'`);
    assert(result.disputeRecord !== undefined,
      `disputeRecord doit etre present. Cles : ${JSON.stringify(Object.keys(result))}`);
    assert(result.disputeRecord.regime === 'FREIN_URGENCE',
      `regime attendu 'FREIN_URGENCE'. Recu : '${result.disputeRecord.regime}'`);
    assert(result.disputeRecord.sourceState === 'accepted',
      `sourceState attendu 'accepted'. Recu : '${result.disputeRecord.sourceState}'`);
    assert(
      typeof result.disputeRecord.systemId === 'string' &&
      result.disputeRecord.systemId.startsWith('DSP-'),
      `disputeRecord.systemId attendu format DSP-* (IDFactory.PREFIXES.DisputeRecord='DSP'). Recu : '${result.disputeRecord.systemId}'`
    );
  });

  // ── T-02 : sans evidenceBundleId → bloque ────────────────
  await testAsync('T-02 : sans evidenceBundleId → DISPUTE_MISSING_EVIDENCE', async () => {
    let threw = false;
    try {
      await transitionEngagement({
        engagementId: ENG_ID,
        currentState:  'accepted',
        targetState:   'disputed',
        actor:         ACTOR_ID,
        context: {
          disputeReason: 'PAIEMENT_NON_CONFORME',
          actorRole:     'organisateur',
          // evidenceBundleId absent
        },
        repositories,
      });
    } catch (err) {
      threw = true;
      assert(
        err.message.includes('DISPUTE_MISSING_EVIDENCE') || err.message.includes('GUARD_FAILED'),
        `Attendu DISPUTE_MISSING_EVIDENCE ou GUARD_FAILED. Recu : "${err.message}"`
      );
    }
    assert(threw, 'Dispute sans evidence devait etre bloquee. D-019-B : evidence obligatoire.');
  });

  // ── T-03 : sans disputeReason → bloque ───────────────────
  await testAsync('T-03 : sans disputeReason → DISPUTE_MISSING_REASON', async () => {
    let threw = false;
    try {
      await transitionEngagement({
        engagementId: ENG_ID,
        currentState:  'accepted',
        targetState:   'disputed',
        actor:         ACTOR_ID,
        context: {
          evidenceBundleId: 'EVD-TEST-003',
          actorRole:        'talent',
          // disputeReason absent
        },
        repositories,
      });
    } catch (err) {
      threw = true;
      assert(
        err.message.includes('DISPUTE_MISSING_REASON') || err.message.includes('GUARD_FAILED'),
        `Attendu DISPUTE_MISSING_REASON ou GUARD_FAILED. Recu : "${err.message}"`
      );
    }
    assert(threw, 'Dispute sans disputeReason devait etre bloquee. D-019-B.');
  });

  // ── T-04 : etat non autorise → DISPUTE_STATE_NOT_ELIGIBLE ─
  await testAsync("T-04 : Frein d'Urgence depuis etat non autorise (archived) → bloque", async () => {
    // archived→disputed n'est pas dans TRANSITION_TABLE → TRANSITION_UNAUTHORIZED
    // (DisputeGuard.DISPUTE_STATE_NOT_ELIGIBLE est une defense en profondeur pour states hors-table)
    let threw = false;
    try {
      await transitionEngagement({
        engagementId: ENG_ID,
        currentState:  'archived',
        targetState:   'disputed',
        actor:         ACTOR_ID,
        context: {
          evidenceBundleId: 'EVD-TEST-004',
          disputeReason:    'TEST',
          actorRole:        'admin',
        },
        repositories,
      });
    } catch (err) {
      threw = true;
      assert(
        err.message.includes('TRANSITION_UNAUTHORIZED') ||
        err.message.includes('DISPUTE_STATE_NOT_ELIGIBLE') ||
        err.message.includes('GUARD_FAILED') ||
        err.message.includes('WORM_VIOLATION'),
        `Attendu TRANSITION_UNAUTHORIZED, DISPUTE_STATE_NOT_ELIGIBLE, GUARD_FAILED ou WORM_VIOLATION. ` +
        `Recu : "${err.message}"`
      );
    }
    assert(threw, 'Frein Urgence depuis "archived" devait etre bloque (fail-closed). D-019-B.');
  });

  // ── T-05 : Contestation de Prestation depuis contestation_window → passe ─
  await testAsync('T-05 : Contestation de Prestation depuis contestation_window → passe', async () => {
    const result = await transitionEngagement({
      engagementId: ENG_ID,
      currentState:  'contestation_window',
      targetState:   'disputed',
      actor:         ACTOR_ID,
      context: {
        evidenceBundleId:          'EVD-TEST-005',
        disputeReason:             'PRESTATION_NON_CONFORME',
        actorRole:                 'organisateur',
        contestationWindowOpenedAt: new Date().toISOString(),
      },
      repositories,
    });
    assert(result.success === true,
      `Contestation de Prestation devait reussir. Recu : success=${result.success}`);
    assert(result.disputeRecord.regime === 'CONTESTATION_PRESTATION',
      `regime attendu 'CONTESTATION_PRESTATION'. Recu : '${result.disputeRecord.regime}'`);
    assert(result.disputeRecord.contestationWindowOpenedAt !== undefined,
      `contestationWindowOpenedAt doit etre dans disputeRecord. Source : D-019-B Regime 2.`);
  });

  // ── T-06 : transition non couverte → GUARD_MISMATCH / TRANSITION_UNAUTHORIZED ─
  await testAsync('T-06 : transition non couverte → GUARD_MISMATCH ou TRANSITION_UNAUTHORIZED', async () => {
    // settled→disputed n'existe pas dans TRANSITION_TABLE
    let threw = false;
    try {
      await transitionEngagement({
        engagementId: ENG_ID,
        currentState:  'settled',
        targetState:   'disputed',
        actor:         ACTOR_ID,
        context: {
          evidenceBundleId: 'EVD-T06',
          disputeReason:    'TEST',
          actorRole:        'admin',
        },
        repositories,
      });
    } catch (err) {
      threw = true;
      assert(
        err.message.includes('TRANSITION_UNAUTHORIZED') ||
        err.message.includes('GUARD_MISMATCH') ||
        err.message.includes('GUARD_FAILED'),
        `Attendu TRANSITION_UNAUTHORIZED, GUARD_MISMATCH ou GUARD_FAILED. ` +
        `Recu : "${err.message}"`
      );
    }
    assert(threw, 'Transition non couverte devait etre bloquee (fail-closed).');
  });

  console.log('\n=======================================================');
  console.log(`RESULTAT : ${passed} passes, ${failed} echoues sur ${passed + failed} tests`);
  if (failed === 0) {
    console.log('\u2713 DISPUTE-01 PASSED');
    console.log('  Phase 2.3 : DisputeGuard operationnel.');
    console.log('  D-019-B applique. Frein Urgence + Contestation Prestation couverts.');
  } else {
    console.log('\u2717 DISPUTE-01 FAILED');
    process.exitCode = 1;
  }
  console.log('=======================================================');
}

run().catch(err => { console.error('ERREUR FATALE :', err.message); process.exitCode = 1; });