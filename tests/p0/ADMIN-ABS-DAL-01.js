/**
 * MICRO RAVE V3 — Test P0 : ADMIN-ABS-DAL-01
 * ============================================================
 * Prouve que DataAccessLedgerEntry est immuable apres creation.
 * D-107 interdit #9 : "Supprimer un DataAccessLedgerEntry"
 *
 * Source : D-107 · D-095 · TEST_REGISTRY requiredBeforeEvent=0A
 *
 * T-01 : AdminRepository n'expose pas de methode DELETE sur DAL
 * T-02 : AdminRepository n'expose pas de methode UPDATE/PUT sur DAL
 * T-03 : appendToDataAccessLedger() cree (POST) — jamais modifie
 * T-04 : une entree cree ne peut pas etre ecrasee (idempotency structurelle)
 * ============================================================
 */

'use strict';

process.env.BASE44_API_KEY = 'sk_test_MOCK_DAL_IMMUTABLE';

const AdminRepository = require('../../src/repositories/AdminRepository');

let passed = 0; let failed = 0;

async function test(name, fn) {
  try { await fn(); console.log(`  \u2713 ${name}`); passed++; }
  catch (e) { console.log(`  \u2717 ${name}\n    \u2192 ${e.message}`); failed++; }
}
function assert(c, m) { if (!c) throw new Error(m); }

console.log('ADMIN-ABS-DAL-01 -- DataAccessLedgerEntry immutable (D-107 #9)');
console.log('=================================================================');

async function run() {

  await test('T-01 : AdminRepository n\'expose pas deleteDataAccessLedger', async () => {
    assert(
      typeof AdminRepository.deleteDataAccessLedger === 'undefined' &&
      typeof AdminRepository.deleteDataAccessLedgerEntry === 'undefined' &&
      typeof AdminRepository.deleteDal === 'undefined',
      'AdminRepository NE DOIT PAS exposer de methode de suppression sur DAL. D-107 interdit #9.'
    );
  });

  await test('T-02 : AdminRepository n\'expose pas updateDataAccessLedger', async () => {
    assert(
      typeof AdminRepository.updateDataAccessLedger === 'undefined' &&
      typeof AdminRepository.updateDataAccessLedgerEntry === 'undefined' &&
      typeof AdminRepository.patchDal === 'undefined',
      'AdminRepository NE DOIT PAS exposer de methode de modification sur DAL. D-107 interdit #9.'
    );
  });

  await test('T-03 : appendToDataAccessLedger() emet POST (creation), jamais PUT/DELETE', async () => {
    const methods = [];
    global.fetch = async (url, opts) => {
      methods.push(opts.method);
      return { ok: true, json: async () => ({ id: 'dal-001' }) };
    };
    try {
      await AdminRepository.appendToDataAccessLedger({
        actorUserId: 'USR-DAL-TEST001',
        targetObjectId: 'ENG-DAL-TEST001',
        accessType: 'TRANSITION',
        justification: 'test',
      });
    } finally { delete global.fetch; }
    assert(methods.length === 1, `Exactement 1 appel HTTP attendu. Recu : ${methods.length}`);
    assert(methods[0] === 'POST',
      `Methode attendue POST (creation). Recu : ${methods[0]}. ` +
      `APPEND-ONLY : DataAccessLedgerEntry ne peut etre que creee. D-107 interdit #9.`
    );
  });

  await test('T-04 : DataAccessLedgerEntry sans updatedAt dans le payload (immutable)', async () => {
    let capturedBody = null;
    global.fetch = async (url, opts) => {
      capturedBody = JSON.parse(opts.body);
      return { ok: true, json: async () => ({ id: 'dal-002' }) };
    };
    try {
      await AdminRepository.appendToDataAccessLedger({
        actorUserId: 'USR-DAL-TEST002',
        targetObjectId: 'ENG-DAL-TEST002',
        accessType: 'TRANSITION',
        justification: 'test',
      });
    } finally { delete global.fetch; }
    assert(capturedBody !== null, 'body non capture');
    assert(
      capturedBody.updatedAt === undefined,
      `updatedAt ne doit PAS etre present dans une DataAccessLedgerEntry (immutable). ` +
      `Recu : updatedAt=${capturedBody.updatedAt}. D-107 -- APPEND-ONLY, pas de modification.`
    );
    assert(typeof capturedBody.createdAt === 'string', 'createdAt doit etre present');
  });

  console.log('\n=================================================================');
  console.log(`RESULTAT : ${passed} passes, ${failed} echoues sur ${passed + failed} tests`);
  if (failed === 0) { console.log('\u2713 ADMIN-ABS-DAL-01 PASSED'); }
  else { console.log('\u2717 ADMIN-ABS-DAL-01 FAILED'); process.exitCode = 1; }
  console.log('=================================================================');
}
run().catch(err => { console.error('ERREUR FATALE :', err.message); process.exitCode = 1; });