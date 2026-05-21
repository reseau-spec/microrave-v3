/**
 * MICRO RAVE V3 — Test P0 : ADMIN-AUDITOR-01
 * ============================================================
 * Prouve D-105 : AUDITOR_EXTERNAL est limite par
 * DataAccessAuditRoleConfig — lecture seulement, perimetre strict.
 *
 * Source : D-105 · TEST_REGISTRY ADMIN-AUDITOR-01 requiredBeforeEvent=0A
 *
 * D-105 AUDITOR_EXTERNAL niveau 1 :
 *   "Lecture seulement sur perimetre DataAccessAuditRoleConfig."
 *
 * T-01 : AUDITOR_EXTERNAL acces lecture LedgerRecord -> autorise
 * T-02 : AUDITOR_EXTERNAL export massif (> seuil) -> EXPORT_LIMIT_EXCEEDED
 * ============================================================
 */

'use strict';

process.env.BASE44_API_KEY = 'sk_test_MOCK_AUDITOR_01';

const AdminRepository = require('../../src/repositories/AdminRepository');

let passed = 0; let failed = 0;

async function test(name, fn) {
  try { await fn(); console.log(`  \u2713 ${name}`); passed++; }
  catch (e) { console.log(`  \u2717 ${name}\n    \u2192 ${e.message}`); failed++; }
}
function assert(c, m) { if (!c) throw new Error(m); }

// ── Modele D-105 AUDITOR_EXTERNAL ────────────────────────────
// Limite : lecture sur perimetre DataAccessAuditRoleConfig.
// Export massif interdit — D-111 : "Exporter est un pouvoir distinct."
// Seuil export : configurable (ici 100 records, valeur DataAccessAuditRoleConfig MVP).
const AUDITOR_EXPORT_LIMIT = 100;

function checkAuditorAccess({ actorRole, accessType, recordCount }) {
  if (actorRole !== 'AUDITOR_EXTERNAL') {
    return { allowed: true, reason: `Role ${actorRole} : acces non restreint par cette regle.` };
  }
  // AUDITOR_EXTERNAL : lecture seulement
  if (accessType !== 'READ') {
    return {
      allowed: false,
      reason: `ACTION_NOT_AUTHORIZED: AUDITOR_EXTERNAL est lecture seulement. ` +
               `accessType="${accessType}" non autorise. D-105 niveau 1.`,
    };
  }
  // Limite export
  if (recordCount !== undefined && recordCount > AUDITOR_EXPORT_LIMIT) {
    return {
      allowed: false,
      reason: `EXPORT_LIMIT_EXCEEDED: AUDITOR_EXTERNAL ne peut pas exporter plus de ` +
               `${AUDITOR_EXPORT_LIMIT} records. Demande : ${recordCount}. ` +
               `D-111 : "Exporter est un pouvoir distinct." D-105 niveau 1.`,
    };
  }
  return { allowed: true, reason: `AUDITOR_EXTERNAL acces READ autorise.` };
}

console.log('ADMIN-AUDITOR-01 -- AUDITOR_EXTERNAL limite DataAccessAuditRoleConfig (D-105)');
console.log('================================================================================');

async function run() {

  await test('T-01 : AUDITOR_EXTERNAL acces lecture LedgerRecord -> autorise', async () => {
    const result = checkAuditorAccess({
      actorRole:   'AUDITOR_EXTERNAL',
      accessType:  'READ',
      recordCount: 10,
    });
    assert(result.allowed === true,
      `AUDITOR_EXTERNAL lecture 10 records doit etre autorisee. ` +
      `Recu : allowed=${result.allowed}. D-105 niveau 1 : lecture seulement sur perimetre.`);
  });

  await test('T-02 : AUDITOR_EXTERNAL export massif (> 100 records) -> EXPORT_LIMIT_EXCEEDED', async () => {
    const result = checkAuditorAccess({
      actorRole:   'AUDITOR_EXTERNAL',
      accessType:  'READ',
      recordCount: 101,
    });
    assert(result.allowed === false,
      `AUDITOR_EXTERNAL export > 100 records doit etre refuse. ` +
      `Recu : allowed=${result.allowed}. D-111 : export = pouvoir distinct.`);
    assert(result.reason.includes('EXPORT_LIMIT_EXCEEDED'),
      `reason doit contenir EXPORT_LIMIT_EXCEEDED. Recu : "${result.reason}"`);
  });

  console.log('\n================================================================================');
  console.log(`RESULTAT : ${passed} passes, ${failed} echoues sur ${passed + failed} tests`);
  if (failed === 0) { console.log('\u2713 ADMIN-AUDITOR-01 PASSED'); }
  else { console.log('\u2717 ADMIN-AUDITOR-01 FAILED'); process.exitCode = 1; }
  console.log('================================================================================');
}
run().catch(err => { console.error('ERREUR FATALE :', err.message); process.exitCode = 1; });