/**
 * MICRO RAVE V3 — Test P0 : ADMIN-SOLO-02
 * ============================================================
 * Prouve D-106 : SoloFounderOverride produit un AdminAction
 * de type SOLO_FOUNDER_OVERRIDE + un AdminIncidentRecord.
 *
 * Source : D-106 · TEST_REGISTRY ADMIN-SOLO-02 requiredBeforeEvent=0A
 *
 * Phrase canonique D-106 :
 *   "SoloFounderOverride est une exception documentee.
 *    Ce n'est pas une validation — c'est une exception
 *    qui doit rester exceptionnelle."
 *
 * Conditions D-106 :
 *   - AdminIncidentRecord type SOLO_FOUNDER_OVERRIDE
 *   - DataAccessLedgerEntry marqueur FOUNDER_SOLO_OVERRIDE
 *   - reasonCode obligatoire
 *
 * T-01 : createAdminAction({ actionType: 'SOLO_FOUNDER_OVERRIDE' }) cree un AdminAction
 * T-02 : sans reasonCode -> ADMIN_ERROR (reasonCode obligatoire D-106)
 * T-03 : payload AdminAction contient actionType='SOLO_FOUNDER_OVERRIDE'
 * T-04 : createAdminIncidentRecord SOLO_FOUNDER_OVERRIDE cree un record P1
 * T-05 : DAL entry avec accessType FOUNDER_SOLO_OVERRIDE cree correctement
 * ============================================================
 */

'use strict';

process.env.BASE44_API_KEY = 'sk_test_MOCK_ADMIN_SOLO02';

const AdminRepository = require('../../src/repositories/AdminRepository');

let passed = 0; let failed = 0;

async function test(name, fn) {
  try { await fn(); console.log(`  \u2713 ${name}`); passed++; }
  catch (e) { console.log(`  \u2717 ${name}\n    \u2192 ${e.message}`); failed++; }
}
function assert(c, m) { if (!c) throw new Error(m); }
async function expectThrows(fn, substr) {
  let threw = false;
  try { await fn(); }
  catch (e) {
    threw = true;
    if (substr) assert(e.message.includes(substr), `Attendu "${substr}" dans: ${e.message}`);
  }
  assert(threw, `Doit lever une erreur${substr ? ` contenant "${substr}"` : ''}`);
}

console.log('ADMIN-SOLO-02 -- SoloFounderOverride trace obligatoire (D-106)');
console.log('=================================================================');

async function run() {

  // ── T-01 : AdminAction SOLO_FOUNDER_OVERRIDE cree ──────────
  await test('T-01 : createAdminAction SOLO_FOUNDER_OVERRIDE -> AdminAction cree (POST)', async () => {
    let method = null;
    global.fetch = async (url, opts) => {
      method = opts.method;
      return { ok: true, json: async () => ({ id: 'adm-solo-001' }) };
    };
    try {
      await AdminRepository.createAdminAction({
        actorUserId:      'USR-FOUNDER-001',
        actionType:       'SOLO_FOUNDER_OVERRIDE',
        targetObjectType: 'Engagement',
        targetObjectId:   'ENG-SOLO-TEST01',
        reasonCode:       'MANUAL_TRANSITION_EVENT_0_PILOT',
      });
    } finally { delete global.fetch; }
    assert(method === 'POST',
      `AdminAction doit etre cree via POST. Recu : ${method}.`);
  });

  // ── T-02 : sans reasonCode -> rejete ───────────────────────
  await test('T-02 : createAdminAction SOLO_FOUNDER_OVERRIDE sans reasonCode -> ADMIN_ERROR', async () => {
    await expectThrows(
      () => AdminRepository.createAdminAction({
        actorUserId:      'USR-FOUNDER-001',
        actionType:       'SOLO_FOUNDER_OVERRIDE',
        targetObjectType: 'Engagement',
        targetObjectId:   'ENG-SOLO-TEST02',
        // reasonCode absent — D-106 : obligatoire
      }),
      'ADMIN_ERROR'
    );
  });

  // ── T-03 : payload contient actionType SOLO_FOUNDER_OVERRIDE
  await test('T-03 : payload AdminAction contient actionType=SOLO_FOUNDER_OVERRIDE', async () => {
    let body = null;
    global.fetch = async (url, opts) => {
      body = JSON.parse(opts.body);
      return { ok: true, json: async () => ({ id: 'adm-solo-002' }) };
    };
    try {
      await AdminRepository.createAdminAction({
        actorUserId:      'USR-FOUNDER-001',
        actionType:       'SOLO_FOUNDER_OVERRIDE',
        targetObjectType: 'Engagement',
        targetObjectId:   'ENG-SOLO-TEST03',
        reasonCode:       'MANUAL_TRANSITION_EVENT_0_PILOT',
      });
    } finally { delete global.fetch; }
    assert(body.actionType === 'SOLO_FOUNDER_OVERRIDE',
      `actionType attendu 'SOLO_FOUNDER_OVERRIDE'. Recu : '${body.actionType}'. D-106.`);
    assert(body.reasonCode === 'MANUAL_TRANSITION_EVENT_0_PILOT',
      `reasonCode absent du payload. D-106 : obligatoire.`);
    assert(typeof body.createdAt === 'string', 'createdAt absent du payload AdminAction');
  });

  // ── T-04 : AdminIncidentRecord SOLO_FOUNDER_OVERRIDE ───────
  await test('T-04 : AdminIncidentRecord SOLO_FOUNDER_OVERRIDE cree avec severity P1', async () => {
    let body = null;
    global.fetch = async (url, opts) => {
      body = JSON.parse(opts.body);
      return { ok: true, json: async () => ({ id: 'inc-solo-001' }) };
    };
    try {
      await AdminRepository.createAdminIncidentRecord({
        incidentType: 'SOLO_FOUNDER_OVERRIDE',
        severity:     'P1',
        engagementId: 'ENG-SOLO-TEST04',
        description:  'SoloFounderOverride : transition manuelle performed->payable event 0 pilote.',
        context:      { actionType: 'SOLO_FOUNDER_OVERRIDE', reasonCode: 'MANUAL_TRANSITION_EVENT_0_PILOT' },
      });
    } finally { delete global.fetch; }
    assert(body.incidentType === 'SOLO_FOUNDER_OVERRIDE',
      `incidentType attendu 'SOLO_FOUNDER_OVERRIDE'. Recu : '${body.incidentType}'. D-106.`);
    assert(body.severity === 'P1',
      `severity attendu 'P1' pour SoloFounderOverride (exception documentee, non-P0). Recu : '${body.severity}'.`);
    assert(body.resolvedAt === null,
      `resolvedAt doit etre null a la creation. D-107 #14 : immuable.`);
  });

  // ── T-05 : DAL entry FOUNDER_SOLO_OVERRIDE ─────────────────
  await test('T-05 : DataAccessLedgerEntry avec accessType FOUNDER_SOLO_OVERRIDE cree correctement', async () => {
    let body = null;
    global.fetch = async (url, opts) => {
      body = JSON.parse(opts.body);
      return { ok: true, json: async () => ({ id: 'dal-solo-001' }) };
    };
    try {
      await AdminRepository.appendToDataAccessLedger({
        actorUserId:      'USR-FOUNDER-001',
        actorRole:        'FOUNDER',
        targetObjectType: 'Engagement',
        targetObjectId:   'ENG-SOLO-TEST05',
        accessType:       'FOUNDER_SOLO_OVERRIDE',   // marqueur D-106
        justification:    'SoloFounderOverride performed->payable event 0 pilote',
      });
    } finally { delete global.fetch; }
    assert(body.accessType === 'FOUNDER_SOLO_OVERRIDE',
      `accessType attendu 'FOUNDER_SOLO_OVERRIDE'. Recu : '${body.accessType}'. ` +
      `D-106 : DataAccessLedgerEntry doit porter ce marqueur specifique.`);
    assert(body.actorRole === 'FOUNDER',
      `actorRole attendu 'FOUNDER'. Recu : '${body.actorRole}'.`);
    assert(body.updatedAt === undefined,
      `updatedAt ne doit pas etre present (DAL immuable). D-107 #9.`);
  });

  console.log('\n=================================================================');
  console.log(`RESULTAT : ${passed} passes, ${failed} echoues sur ${passed + failed} tests`);
  if (failed === 0) { console.log('\u2713 ADMIN-SOLO-02 PASSED'); }
  else { console.log('\u2717 ADMIN-SOLO-02 FAILED'); process.exitCode = 1; }
  console.log('=================================================================');
}
run().catch(err => { console.error('ERREUR FATALE :', err.message); process.exitCode = 1; });