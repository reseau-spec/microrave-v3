/**
 * MICRO RAVE V3 — Test P0 : ADMIN-ABS-BUGREPLAY
 * ============================================================
 * Prouve que BugReplayRecord est immuable apres creation.
 * D-107 interdit #10 : "Supprimer ou falsifier un BugReplayRecord"
 *
 * Source : D-107 · D-134 · D-137 · TEST_REGISTRY requiredBeforeEvent=0A
 *
 * Phrase canonique D-134 :
 *   "Un bug corrige mais non rejoue est un bug qui attend de revenir."
 *
 * T-01 : AdminRepository n'expose pas deleteBugReplay
 * T-02 : AdminRepository n'expose pas updateBugReplay
 * T-03 : createAdminAction() avec type SOLO_FOUNDER_OVERRIDE produit un AdminAction
 * T-04 : AdminAction payload contient reasonCode (obligatoire D-107)
 * ============================================================
 */

'use strict';

process.env.BASE44_API_KEY = 'sk_test_MOCK_BUGREPLAY_IMMUT';

import AdminRepository from '../../src/repositories/AdminRepository.js';
let passed = 0; let failed = 0;

async function test(name, fn) {
  try { await fn(); console.log(`  \u2713 ${name}`); passed++; }
  catch (e) { console.log(`  \u2717 ${name}\n    \u2192 ${e.message}`); failed++; }
}
function assert(c, m) { if (!c) throw new Error(m); }

console.log('ADMIN-ABS-BUGREPLAY -- BugReplayRecord immutable (D-107 #10)');
console.log('===============================================================');

async function run() {

  await test('T-01 : AdminRepository n\'expose pas deleteBugReplayRecord', async () => {
    assert(
      typeof AdminRepository.deleteBugReplayRecord === 'undefined' &&
      typeof AdminRepository.deleteBugReplay === 'undefined' &&
      typeof AdminRepository.purgeBugReplay === 'undefined',
      'AdminRepository NE DOIT PAS exposer de suppression sur BugReplayRecord. ' +
      'D-107 interdit #10 : "Supprimer ou falsifier un BugReplayRecord".'
    );
  });

  await test('T-02 : AdminRepository n\'expose pas updateBugReplayRecord', async () => {
    // Exception : replayStatus peut passer de PENDING -> PASSED via un appel dedié
    // Mais ce chemin doit passer par createAdminAction(), pas par une methode directe
    assert(
      typeof AdminRepository.updateBugReplayRecord === 'undefined' &&
      typeof AdminRepository.falsifyBugReplay === 'undefined',
      'AdminRepository NE DOIT PAS exposer de modification directe sur BugReplayRecord. ' +
      'D-107 interdit #10 : falsification architecturalement impossible.'
    );
  });

  await test('T-03 : createAdminAction() sans reasonCode → ADMIN_ERROR (D-107)', async () => {
    // BugReplayRecord est cree via AdminAction avec reasonCode obligatoire
    // Sans reasonCode : echec fail-closed
    let threw = false;
    try {
      await AdminRepository.createAdminAction({
        actorUserId: 'USR-BUG-TEST001',
        actionType: 'BUG_REPLAY_SUBMITTED',
        targetObjectType: 'BugReplayRecord',
        targetObjectId: 'BUG-TEST-001',
        // reasonCode absent intentionnellement
      });
    } catch (err) {
      threw = true;
      assert(err.message.includes('ADMIN_ERROR') || err.message.includes('reasonCode'),
        `Attendu ADMIN_ERROR ou mention reasonCode. Recu : "${err.message}"`);
    }
    assert(threw, 'createAdminAction() sans reasonCode devait echouer. D-107 : toute action admin requiert un reasonCode.');
  });

  await test('T-04 : createAdminAction() emet POST avec reasonCode dans le payload', async () => {
    let capturedBody = null;
    global.fetch = async (url, opts) => {
      capturedBody = JSON.parse(opts.body);
      return { ok: true, json: async () => ({ id: 'adm-001' }) };
    };
    try {
      await AdminRepository.createAdminAction({
        actorUserId: 'USR-BUG-TEST002',
        actionType: 'BUG_REPLAY_SUBMITTED',
        targetObjectType: 'BugReplayRecord',
        targetObjectId: 'BUG-TEST-002',
        reasonCode: 'REPLAY_AFTER_FIX',
      });
    } finally { delete global.fetch; }
    assert(capturedBody !== null, 'body non capture');
    assert(capturedBody.reasonCode === 'REPLAY_AFTER_FIX',
      `reasonCode attendu 'REPLAY_AFTER_FIX'. Recu : "${capturedBody.reasonCode}". ` +
      `D-107 : traçabilite institutionnelle obligatoire.`);
    assert(typeof capturedBody.createdAt === 'string', 'createdAt doit etre present');
  });

  console.log('\n===============================================================');
  console.log(`RESULTAT : ${passed} passes, ${failed} echoues sur ${passed + failed} tests`);
  if (failed === 0) { console.log('\u2713 ADMIN-ABS-BUGREPLAY PASSED'); }
  else { console.log('\u2717 ADMIN-ABS-BUGREPLAY FAILED'); process.exitCode = 1; }
  console.log('===============================================================');
}
run().catch(err => { console.error('ERREUR FATALE :', err.message); process.exitCode = 1; });