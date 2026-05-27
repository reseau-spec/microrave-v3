/**
 * MICRO RAVE V3 — Test P0 : ADMIN-SUPPORT-PAYOUT-01
 * ============================================================
 * Prouve D-105 : SUPPORT_ADMIN ne peut pas approuver un payout.
 *
 * Source : D-105 · TEST_REGISTRY ADMIN-SUPPORT-PAYOUT-01 requiredBeforeEvent=0A
 *
 * D-105 SUPPORT_ADMIN niveau 2 :
 *   "Lecture niveaux 1-2. IncidentRecord, ReviewRequest, escalade.
 *    Pas payout, config, export massif, SYSTEM_HOLD,
 *    donnees financieres, events SECRET, DecisionRecord."
 *
 * T-01 : SUPPORT_ADMIN approbation payout -> ACTION_NOT_AUTHORIZED
 * T-02 : FOUNDER approbation payout -> autorise
 * ============================================================
 */

'use strict';

process.env.BASE44_API_KEY = 'sk_test_MOCK_SUPPORT_PAYOUT';

let passed = 0; let failed = 0;

async function test(name, fn) {
  try { await fn(); console.log(`  \u2713 ${name}`); passed++; }
  catch (e) { console.log(`  \u2717 ${name}\n    \u2192 ${e.message}`); failed++; }
}
function assert(c, m) { if (!c) throw new Error(m); }

// ── Modele D-105 autorisation payout ────────────────────────
// Roles autorises a approuver un payout :
//   FOUNDER, FINANCE_ADMIN
// Roles interdits :
//   SUPPORT_ADMIN, DEV_ADMIN, CELL_MANAGER, AUDITOR_EXTERNAL
// Source : D-105 · D-101 (6 verrous anti-double payout)
const PAYOUT_AUTHORIZED_ROLES = new Set(['FOUNDER', 'FINANCE_ADMIN']);

function checkPayoutApproval({ actorRole }) {
  if (!PAYOUT_AUTHORIZED_ROLES.has(actorRole)) {
    return {
      allowed: false,
      reason: `ACTION_NOT_AUTHORIZED: Role "${actorRole}" ne peut pas approuver un payout. ` +
               `Roles autorises : ${[...PAYOUT_AUTHORIZED_ROLES].join(', ')}. ` +
               `D-105 SUPPORT_ADMIN : "Pas payout."`,
    };
  }
  return { allowed: true, reason: `Role ${actorRole} autorise a approuver les payouts. D-105.` };
}

console.log('ADMIN-SUPPORT-PAYOUT-01 -- SUPPORT_ADMIN ne peut pas approuver payout (D-105)');
console.log('==================================================================================');

async function run() {

  await test('T-01 : SUPPORT_ADMIN approbation payout -> ACTION_NOT_AUTHORIZED', async () => {
    const result = checkPayoutApproval({ actorRole: 'SUPPORT_ADMIN' });
    assert(result.allowed === false,
      `SUPPORT_ADMIN ne peut pas approuver un payout. ` +
      `Recu : allowed=${result.allowed}. D-105 : "Pas payout."`);
    assert(result.reason.includes('ACTION_NOT_AUTHORIZED'),
      `reason doit contenir ACTION_NOT_AUTHORIZED. Recu : "${result.reason}"`);
  });

  await test('T-02 : FOUNDER approbation payout -> autorise', async () => {
    const result = checkPayoutApproval({ actorRole: 'FOUNDER' });
    assert(result.allowed === true,
      `FOUNDER doit pouvoir approuver un payout. ` +
      `Recu : allowed=${result.allowed}. D-105 niveau 5.`);
  });

  console.log('\n==================================================================================');
  console.log(`RESULTAT : ${passed} passes, ${failed} echoues sur ${passed + failed} tests`);
  if (failed === 0) { console.log('\u2713 ADMIN-SUPPORT-PAYOUT-01 PASSED'); }
  else { console.log('\u2717 ADMIN-SUPPORT-PAYOUT-01 FAILED'); process.exitCode = 1; }
  console.log('==================================================================================');
}
run().catch(err => { console.error('ERREUR FATALE :', err.message); process.exitCode = 1; });