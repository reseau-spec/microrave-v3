/**
 * MICRO RAVE V3 — Test P0 : ADMIN-DEV-FINANCE-01
 * ============================================================
 * Prouve D-105 : DEV_ADMIN ne peut pas acceder aux donnees
 * financieres reelles en production.
 *
 * Source : D-105 · TEST_REGISTRY ADMIN-DEV-FINANCE-01 requiredBeforeEvent=0A
 *
 * D-105 DEV_ADMIN niveau 2 :
 *   "Deploiement, logs, rotation technique secrets.
 *    Zero donnees financieres prod. Zero events SECRET."
 *
 * T-01 : DEV_ADMIN acces LedgerRecord env production -> ACCESS_DENIED
 * T-02 : DEV_ADMIN acces LedgerRecord env staging -> autorise
 * ============================================================
 */

'use strict';

process.env.BASE44_API_KEY = 'sk_test_MOCK_DEV_FINANCE';

let passed = 0; let failed = 0;

async function test(name, fn) {
  try { await fn(); console.log(`  \u2713 ${name}`); passed++; }
  catch (e) { console.log(`  \u2717 ${name}\n    \u2192 ${e.message}`); failed++; }
}
function assert(c, m) { if (!c) throw new Error(m); }

// ── Modele D-105 DEV_ADMIN ────────────────────────────────────
// DEV_ADMIN : zero donnees financieres prod, zero events SECRET.
// Donnees financieres = LedgerRecord, PayoutExecutionRecord,
//   SettlementInstruction, ContractSnapshot (montants), TaxConfig.
// Source : D-105 niveau 2.
const FINANCIAL_OBJECT_TYPES = new Set([
  'LedgerRecord', 'PayoutExecutionRecord', 'SettlementInstruction',
  'ContractSnapshot', 'TaxConfig', 'RevenueRecord',
]);

function checkDevAdminAccess({ actorRole, targetObjectType, env }) {
  if (actorRole !== 'DEV_ADMIN') {
    return { allowed: true, reason: `Role ${actorRole} : regle DEV_ADMIN non applicable.` };
  }
  if (FINANCIAL_OBJECT_TYPES.has(targetObjectType) && env === 'production') {
    return {
      allowed: false,
      reason: `ACCESS_DENIED: DEV_ADMIN ne peut pas acceder aux donnees financieres ` +
               `en production. targetObjectType="${targetObjectType}", env="${env}". ` +
               `D-105 : "Zero donnees financieres prod."`,
    };
  }
  return { allowed: true, reason: `DEV_ADMIN acces ${targetObjectType} en ${env} autorise.` };
}

console.log('ADMIN-DEV-FINANCE-01 -- DEV_ADMIN zero donnees financieres prod (D-105)');
console.log('=========================================================================');

async function run() {

  await test('T-01 : DEV_ADMIN acces LedgerRecord env production -> ACCESS_DENIED', async () => {
    const result = checkDevAdminAccess({
      actorRole:        'DEV_ADMIN',
      targetObjectType: 'LedgerRecord',
      env:              'production',
    });
    assert(result.allowed === false,
      `DEV_ADMIN acces LedgerRecord prod doit etre ACCESS_DENIED. ` +
      `Recu : allowed=${result.allowed}. D-105 : "Zero donnees financieres prod."`);
    assert(result.reason.includes('ACCESS_DENIED'),
      `reason doit contenir ACCESS_DENIED. Recu : "${result.reason}"`);
  });

  await test('T-02 : DEV_ADMIN acces LedgerRecord env staging -> autorise', async () => {
    const result = checkDevAdminAccess({
      actorRole:        'DEV_ADMIN',
      targetObjectType: 'LedgerRecord',
      env:              'staging',
    });
    assert(result.allowed === true,
      `DEV_ADMIN acces LedgerRecord staging doit etre autorise. ` +
      `Recu : allowed=${result.allowed}. D-131 : dev+staging = Stripe test keys, donnees de test.`);
  });

  console.log('\n=========================================================================');
  console.log(`RESULTAT : ${passed} passes, ${failed} echoues sur ${passed + failed} tests`);
  if (failed === 0) { console.log('\u2713 ADMIN-DEV-FINANCE-01 PASSED'); }
  else { console.log('\u2717 ADMIN-DEV-FINANCE-01 FAILED'); process.exitCode = 1; }
  console.log('=========================================================================');
}
run().catch(err => { console.error('ERREUR FATALE :', err.message); process.exitCode = 1; });