/**
 * MICRO RAVE V3 — Test P0 : DATAACCESS-FAIL-01
 * ============================================================
 * Prouve que l'echec d'ecriture DAL dans Guard 5 est non-bloquant
 * et cree un AdminIncidentRecord DAL_WRITE_FAILED P0.
 *
 * Source : D-133 alerte 10 · transitionEngagement.js Guard 5 (Phase 0.5)
 *          requiredBeforeEvent=0B
 *
 * COMPORTEMENT ATTENDU (Guard 5 Phase 0.5) :
 *   1. appendToDataAccessLedger() echoue → catch
 *   2. console.error DAL_WRITE_FAILED
 *   3. createAdminIncidentRecord(DAL_WRITE_FAILED, P0) appele
 *   4. La transition reussit quand meme (non-bloquant)
 *
 * T-01 : echec ecriture DAL → AdminIncidentRecord DAL_WRITE_FAILED P0 cree
 * T-02 : AdminIncidentRecord cree meme si createAdminIncidentRecord throw aussi
 *         → log console uniquement, transition ne bloque pas (double resilience)
 * ============================================================
 */

'use strict';

process.env.STRIPE_SECRET_KEY     = 'sk_test_MOCK_DAL_FAIL';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_MOCK_DAL_FAIL';
process.env.BASE44_API_KEY        = 'sk_test_MOCK_DAL_FAIL_KEY';
require.cache[require.resolve('stripe')] = {
  id: require.resolve('stripe'), filename: require.resolve('stripe'), loaded: true,
  exports: () => ({ transfers: { create: async () => ({ id: 'tr_MOCK_DALFAIL' }) } }),
};

const { transitionEngagement } = require('../../src/core/transitionEngagement');

let passed = 0; let failed = 0;

const ENG_ID   = 'ENG-DALFAIL-TEST1';
const ACTOR_ID = 'USR-DALFAIL-ACT01';

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

async function testAsync(name, fn) {
  try { await fn(); console.log(`  \u2713 ${name}`); passed++; }
  catch (e) { console.log(`  \u2717 ${name}\n    \u2192 ${e.message}`); failed++; }
}
function assert(c, m) { if (!c) throw new Error(m); }

console.log('=======================================================');
console.log('Test P0 : DATAACCESS-FAIL-01');
console.log('Guard 5 DAL echec non-bloquant -- D-133 alerte 10 -- 0B');
console.log('=======================================================\n');

async function run() {

  // ── T-01 : echec DAL → incident cree, transition reussit ──
  await testAsync('T-01 : echec ecriture DAL → AdminIncidentRecord DAL_WRITE_FAILED P0 cree, transition reussit', async () => {
    let incidentCreated = null;

    const repositories = {
      policyConfig: mockPolicyConfig,
      admin: {
        // appendToDataAccessLedger throw — simule echec ecriture DAL
        appendToDataAccessLedger: async () => {
          throw new Error('BASE44_HTTP_503: Service Unavailable — DAL write failed');
        },
        // createAdminIncidentRecord doit etre appele avec DAL_WRITE_FAILED
        createAdminIncidentRecord: async (data) => {
          incidentCreated = data;
          return { id: 'inc-dal-fail-001' };
        },
      },
    };

    // La transition doit reussir meme si DAL echoue
    const result = await transitionEngagement({
      engagementId: ENG_ID,
      currentState:  'proposed',
      targetState:   'negotiating',
      actor:         ACTOR_ID,
      context: {
        talentUserId:    'USR-DALFAIL-TAL1',
        organizerUserId: 'USR-DALFAIL-ORG1',
        roleMetier:      'DJ',
        tauxPpm:         120000,
      },
      repositories,
    });

    assert(result.success === true,
      `La transition doit reussir meme si DAL echoue (non-bloquant). ` +
      `Recu : success=${result.success}. ` +
      `Source : transitionEngagement.js Guard 5 Phase 0.5.`);
    assert(incidentCreated !== null,
      `AdminIncidentRecord doit etre cree apres echec DAL. ` +
      `Source : D-133 alerte 10.`);
    assert(incidentCreated.incidentType === 'DAL_WRITE_FAILED',
      `incidentType attendu 'DAL_WRITE_FAILED'. Recu : '${incidentCreated.incidentType}'.`);
    assert(incidentCreated.severity === 'P0',
      `severity attendu 'P0'. Recu : '${incidentCreated.severity}'. ` +
      `Un echec d'ecriture DAL est une alerte P0 — traçabilite compromise.`);
  });

  // ── T-02 : double resilience — incident throw aussi → log, pas de blocage ─
  await testAsync('T-02 : createAdminIncidentRecord throw aussi → log console, transition reussit quand meme', async () => {
    // Les deux echecs (DAL + incident) ne doivent pas bloquer la transition.
    // Guard 5 a un try/catch sur l'incident lui-meme.
    // Source : transitionEngagement.js Guard 5 — "catch (_) { /* incident non-bloquant */ }"

    const repositories = {
      policyConfig: mockPolicyConfig,
      admin: {
        appendToDataAccessLedger: async () => {
          throw new Error('DAL_WRITE_FAILED: simulated');
        },
        createAdminIncidentRecord: async () => {
          // L'incident lui-meme echoue (ex: Base44 down)
          throw new Error('INCIDENT_WRITE_FAILED: simulated');
        },
      },
    };

    const result = await transitionEngagement({
      engagementId: ENG_ID,
      currentState:  'proposed',
      targetState:   'negotiating',
      actor:         ACTOR_ID,
      context: {
        talentUserId:    'USR-DALFAIL-TAL2',
        organizerUserId: 'USR-DALFAIL-ORG2',
        roleMetier:      'DJ',
        tauxPpm:         120000,
      },
      repositories,
    });

    assert(result.success === true,
      `La transition doit reussir meme si DAL ET incident echouent. ` +
      `Recu : success=${result.success}. ` +
      `Source : transitionEngagement.js Guard 5 — double resilience.`);
    assert(result.newState === 'negotiating',
      `newState attendu 'negotiating'. Recu : '${result.newState}'`);
  });

  console.log('\n=======================================================');
  console.log(`RESULTAT : ${passed} passes, ${failed} echoues sur ${passed + failed} tests`);
  if (failed === 0) {
    console.log('\u2713 DATAACCESS-FAIL-01 PASSED');
    console.log('  D-133 alerte 10 validee. DAL echec non-bloquant prouve.');
  } else {
    console.log('\u2717 DATAACCESS-FAIL-01 FAILED');
    process.exitCode = 1;
  }
  console.log('=======================================================');
}
run().catch(err => { console.error('ERREUR FATALE :', err.message); process.exitCode = 1; });