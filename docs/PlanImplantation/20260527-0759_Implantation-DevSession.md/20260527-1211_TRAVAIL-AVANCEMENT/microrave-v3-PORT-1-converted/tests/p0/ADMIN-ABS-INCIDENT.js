/**
 * MICRO RAVE V3 — Test P0 : ADMIN-ABS-INCIDENT
 * ============================================================
 * Prouve que AdminIncidentRecord est immuable apres creation.
 * D-107 interdit #14 : "Supprimer un AdminIncidentRecord"
 *
 * Source : D-107 · TEST_REGISTRY requiredBeforeEvent=0A
 *
 * T-01 : AdminRepository n'expose pas de methode DELETE sur AdminIncidentRecord
 * T-02 : AdminRepository n'expose pas de methode UPDATE sur AdminIncidentRecord
 * T-03 : createAdminIncidentRecord() emet POST (creation), jamais PUT/DELETE
 * T-04 : payload ne contient pas updatedAt (immutable a la creation)
 * ============================================================
 */

'use strict';

process.env.BASE44_API_KEY = 'sk_test_MOCK_INCIDENT_IMMUT';

import AdminRepository from '../../src/repositories/AdminRepository.js';
let passed = 0; let failed = 0;

async function test(name, fn) {
  try { await fn(); console.log(`  \u2713 ${name}`); passed++; }
  catch (e) { console.log(`  \u2717 ${name}\n    \u2192 ${e.message}`); failed++; }
}
function assert(c, m) { if (!c) throw new Error(m); }

console.log('ADMIN-ABS-INCIDENT -- AdminIncidentRecord immutable (D-107 #14)');
console.log('==================================================================');

async function run() {

  await test('T-01 : AdminRepository n\'expose pas deleteAdminIncidentRecord', async () => {
    assert(
      typeof AdminRepository.deleteAdminIncidentRecord === 'undefined' &&
      typeof AdminRepository.deleteIncident === 'undefined',
      'AdminRepository NE DOIT PAS exposer de methode de suppression sur AdminIncidentRecord. D-107 #14.'
    );
  });

  await test('T-02 : AdminRepository n\'expose pas updateAdminIncidentRecord', async () => {
    assert(
      typeof AdminRepository.updateAdminIncidentRecord === 'undefined' &&
      typeof AdminRepository.resolveAdminIncidentRecord === 'undefined',
      'AdminRepository NE DOIT PAS exposer de methode de modification sur AdminIncidentRecord. D-107 #14. ' +
      'Note : resolvedAt ne peut etre set que via un AdminAction separe, jamais par modification du record.'
    );
  });

  await test('T-03 : createAdminIncidentRecord() emet POST (creation), jamais PUT/DELETE', async () => {
    const methods = [];
    global.fetch = async (url, opts) => {
      methods.push(opts.method);
      return { ok: true, json: async () => ({ id: 'inc-001' }) };
    };
    try {
      await AdminRepository.createAdminIncidentRecord({
        incidentType: 'TEST_INCIDENT',
        severity: 'P1',
        description: 'test',
      });
    } finally { delete global.fetch; }
    assert(methods[0] === 'POST',
      `Methode attendue POST. Recu : ${methods[0]}. ` +
      `AdminIncidentRecord = creation uniquement. D-107 interdit #14.`
    );
  });

  await test('T-04 : payload AdminIncidentRecord sans updatedAt (immutable)', async () => {
    let capturedBody = null;
    global.fetch = async (url, opts) => {
      capturedBody = JSON.parse(opts.body);
      return { ok: true, json: async () => ({ id: 'inc-002' }) };
    };
    try {
      await AdminRepository.createAdminIncidentRecord({
        incidentType: 'LEDGER_IMBALANCE',
        severity: 'P0',
        engagementId: 'ENG-INC-TEST01',
        description: 'test immuabilite',
      });
    } finally { delete global.fetch; }
    assert(capturedBody.updatedAt === undefined,
      `updatedAt ne doit PAS etre present (immutable). Recu : ${capturedBody.updatedAt}.`
    );
    assert(capturedBody.resolvedAt === null,
      `resolvedAt doit etre null a la creation. Recu : ${capturedBody.resolvedAt}.`
    );
  });

  console.log('\n==================================================================');
  console.log(`RESULTAT : ${passed} passes, ${failed} echoues sur ${passed + failed} tests`);
  if (failed === 0) { console.log('\u2713 ADMIN-ABS-INCIDENT PASSED'); }
  else { console.log('\u2717 ADMIN-ABS-INCIDENT FAILED'); process.exitCode = 1; }
  console.log('==================================================================');
}
run().catch(err => { console.error('ERREUR FATALE :', err.message); process.exitCode = 1; });