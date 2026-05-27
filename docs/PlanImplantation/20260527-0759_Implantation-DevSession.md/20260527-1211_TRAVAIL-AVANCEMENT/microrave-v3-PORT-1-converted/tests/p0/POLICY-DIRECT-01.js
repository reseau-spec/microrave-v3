/**
 * MICRO RAVE V3 — Test P0 : POLICY-DIRECT-01
 * ============================================================
 * Prouve D-108 : toute modification de PolicyConfig produit
 * AdminAction + PolicyConfigChangeRecord. Modification directe
 * sans adminActionId rejetee.
 *
 * Source : D-108 · TEST_REGISTRY requiredBeforeEvent=0A
 *
 * Phrase canonique D-131 :
 *   "Un changement de PolicyConfig sans PolicyConfigChangeRecord
 *    est un interdit absolu — meme si le code GitHub est a jour."
 *
 * T-01 : createPolicyConfigChangeRecord() sans adminActionId -> ADMIN_ERROR
 * T-02 : modification avec adminActionId valide -> PolicyConfigChangeRecord cree
 * T-03 : PolicyConfigChangeRecord contient configKey, changedBy, adminActionId
 * T-04 : createAdminAction() prealable a la modification -> AdminAction cree
 * T-05 : createPolicyConfigChangeRecord() sans changedBy -> ADMIN_ERROR
 * T-06 : createPolicyConfigChangeRecord() sans configKey -> ADMIN_ERROR
 * ============================================================
 */

'use strict';

process.env.BASE44_API_KEY = 'sk_test_MOCK_POLICY_DIRECT';

import AdminRepository from '../../src/repositories/AdminRepository.js';
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

console.log('POLICY-DIRECT-01 -- PolicyConfig change via AdminAction+ChangeRecord (D-108)');
console.log('==============================================================================');

async function run() {

  // ── T-01 : sans adminActionId -> rejete ───────────────────
  await test('T-01 : createPolicyConfigChangeRecord() sans adminActionId -> ADMIN_ERROR', async () => {
    await expectThrows(
      () => AdminRepository.createPolicyConfigChangeRecord({
        configKey:  'deposit_ratio_ppm',
        previousValue: '200000',
        newValue:      '180000',
        changedBy:  'USR-FOUNDER-001',
        justification: 'ajustement taux depot',
        // adminActionId absent intentionnellement
      }),
      'ADMIN_ERROR'
    );
  });

  // ── T-02 : avec adminActionId valide -> ChangeRecord cree ──
  await test('T-02 : modification avec adminActionId -> PolicyConfigChangeRecord cree (POST)', async () => {
    let method = null;
    global.fetch = async (url, opts) => {
      method = opts.method;
      return { ok: true, json: async () => ({ id: 'pcr-001' }) };
    };
    try {
      await AdminRepository.createPolicyConfigChangeRecord({
        configKey:     'deposit_ratio_ppm',
        previousValue: '200000',
        newValue:      '180000',
        changedBy:     'USR-FOUNDER-001',
        justification: 'ajustement taux depot',
        adminActionId: 'ADM-POLICY-TEST01',
      });
    } finally { delete global.fetch; }
    assert(method === 'POST',
      `PolicyConfigChangeRecord doit etre cree via POST. Recu : ${method}. ` +
      `D-108 : creation uniquement, jamais modification.`);
  });

  // ── T-03 : payload contient les champs obligatoires ────────
  await test('T-03 : PolicyConfigChangeRecord payload contient configKey, changedBy, adminActionId', async () => {
    let body = null;
    global.fetch = async (url, opts) => {
      body = JSON.parse(opts.body);
      return { ok: true, json: async () => ({ id: 'pcr-002' }) };
    };
    try {
      await AdminRepository.createPolicyConfigChangeRecord({
        configKey:     'balanceDeadlineDays',
        previousValue: 6,
        newValue:      7,
        changedBy:     'USR-FOUNDER-001',
        justification: 'test payload',
        adminActionId: 'ADM-POLICY-TEST02',
      });
    } finally { delete global.fetch; }
    assert(body !== null, 'body non capture');
    assert(body.configKey === 'balanceDeadlineDays',
      `configKey attendu 'balanceDeadlineDays'. Recu : '${body.configKey}'.`);
    assert(body.changedBy === 'USR-FOUNDER-001',
      `changedBy attendu 'USR-FOUNDER-001'. Recu : '${body.changedBy}'.`);
    assert(body.adminActionId === 'ADM-POLICY-TEST02',
      `adminActionId attendu 'ADM-POLICY-TEST02'. Recu : '${body.adminActionId}'. ` +
      `D-108 : toute modification requiert AdminAction prealable.`);
    assert(typeof body.createdAt === 'string', 'createdAt absent du payload');
  });

  // ── T-04 : AdminAction prealable -> cree correctement ──────
  await test('T-04 : createAdminAction() prealable a la modification PolicyConfig -> AdminAction cree', async () => {
    let body = null;
    global.fetch = async (url, opts) => {
      body = JSON.parse(opts.body);
      return { ok: true, json: async () => ({ id: 'adm-pol-001', ...body }) };
    };
    try {
      await AdminRepository.createAdminAction({
        actorUserId:      'USR-FOUNDER-001',
        actionType:       'POLICY_CONFIG_CHANGE',
        targetObjectType: 'PolicyConfig',
        targetObjectId:   'balanceDeadlineDays',
        reasonCode:       'BALANCE_DEADLINE_ADJUSTMENT',
        policyId:         'balanceDeadlineDays',
      });
    } finally { delete global.fetch; }
    assert(body.actionType === 'POLICY_CONFIG_CHANGE',
      `actionType attendu 'POLICY_CONFIG_CHANGE'. Recu : '${body.actionType}'.`);
    assert(body.reasonCode === 'BALANCE_DEADLINE_ADJUSTMENT',
      `reasonCode obligatoire dans AdminAction. Recu : '${body.reasonCode}'. D-108.`);
  });

  // ── T-05 : sans changedBy -> rejete ────────────────────────
  await test('T-05 : createPolicyConfigChangeRecord() sans changedBy -> ADMIN_ERROR', async () => {
    await expectThrows(
      () => AdminRepository.createPolicyConfigChangeRecord({
        configKey:    'deposit_ratio_ppm',
        previousValue: '200000',
        newValue:     '180000',
        adminActionId: 'ADM-POLICY-T05',
        justification: 'test',
        // changedBy absent
      }),
      'ADMIN_ERROR'
    );
  });

  // ── T-06 : sans configKey -> rejete ────────────────────────
  await test('T-06 : createPolicyConfigChangeRecord() sans configKey -> ADMIN_ERROR', async () => {
    await expectThrows(
      () => AdminRepository.createPolicyConfigChangeRecord({
        changedBy:     'USR-FOUNDER-001',
        adminActionId: 'ADM-POLICY-T06',
        justification: 'test',
        // configKey absent
      }),
      'ADMIN_ERROR'
    );
  });

  console.log('\n==============================================================================');
  console.log(`RESULTAT : ${passed} passes, ${failed} echoues sur ${passed + failed} tests`);
  if (failed === 0) { console.log('\u2713 POLICY-DIRECT-01 PASSED'); }
  else { console.log('\u2717 POLICY-DIRECT-01 FAILED'); process.exitCode = 1; }
  console.log('==============================================================================');
}
run().catch(err => { console.error('ERREUR FATALE :', err.message); process.exitCode = 1; });