/**
 * MICRO RAVE V3 — Test P0 : ADMIN-ABS-SYSTEMID
 * ============================================================
 * Prouve que le systemId d'un objet existant est immuable.
 * D-107 interdit #15 : "Modifier le systemId d'un objet existant"
 * D-107 interdit #16 : "Modifier les prefixes IDFactory d'objets deja crees"
 *
 * Source : D-107 · D-127 · TEST_REGISTRY requiredBeforeEvent=0A
 *
 * T-01 : IDFactory.generate() produit toujours un nouveau systemId unique
 * T-02 : IDFactory.validate() rejette un systemId avec mauvais prefixe
 * T-03 : EngagementRepository.updateEngagementStatus() ne peut pas modifier systemId
 * T-04 : Deux appels IDFactory.generate() produisent deux systemId differents
 * ============================================================
 */

'use strict';

process.env.BASE44_API_KEY = 'sk_test_MOCK_SYSTEMID_IMMUT';

const IDFactory = require('../../src/core/IDFactory');
const EngagementRepository = require('../../src/repositories/EngagementRepository');

let passed = 0; let failed = 0;

async function test(name, fn) {
  try { await fn(); console.log(`  \u2713 ${name}`); passed++; }
  catch (e) { console.log(`  \u2717 ${name}\n    \u2192 ${e.message}`); failed++; }
}
function assert(c, m) { if (!c) throw new Error(m); }

console.log('ADMIN-ABS-SYSTEMID -- systemId immutable (D-107 #15, #16)');
console.log('=============================================================');

async function run() {

  await test('T-01 : IDFactory.generate() produit un systemId au bon format', async () => {
    const id = IDFactory.generate('Engagement');
    assert(typeof id === 'string' && id.startsWith('ENG-'),
      `systemId doit commencer par ENG-. Recu : "${id}". Source : D-127.`);
    const parts = id.split('-');
    assert(parts.length === 3,
      `Format PREFIX-TIMESTAMP-RANDOM attendu. Recu : "${id}".`);
  });

  await test('T-02 : IDFactory.validate() rejette un systemId avec mauvais prefixe', async () => {
    const wrongPrefix = 'EVT-XXXXXX-YYYYYY';
    const valid = IDFactory.validate(wrongPrefix, 'Engagement');
    assert(valid === false,
      `validate() doit retourner false pour prefixe EVT- sur type Engagement. ` +
      `D-107 #16 : les prefixes sont souverains et immuables.`);
  });

  await test('T-03 : updateEngagementStatus() ne transmet pas de systemId (ne peut pas le modifier)', async () => {
    let capturedBody = null;
    global.fetch = async (url, opts) => {
      if (opts && opts.body) capturedBody = JSON.parse(opts.body);
      return { ok: true, json: async () => ({ id: 'db-eng-001', status: 'placed' }) };
    };
    try {
      await EngagementRepository.updateEngagementStatus('db-eng-001', 'placed');
    } finally { delete global.fetch; }
    assert(capturedBody !== null, 'body non capture');
    assert(
      capturedBody.systemId === undefined,
      `updateEngagementStatus() NE DOIT PAS transmettre systemId dans le PUT. ` +
      `Recu : systemId=${capturedBody.systemId}. ` +
      `D-107 #15 : le systemId d'un objet existant est immuable — on ne le re-transmet jamais dans un PUT.`
    );
  });

  await test('T-04 : deux appels IDFactory.generate() produisent deux systemId distincts', async () => {
    const id1 = IDFactory.generate('Engagement');
    const id2 = IDFactory.generate('Engagement');
    assert(id1 !== id2,
      `IDFactory doit produire des IDs uniques. id1="${id1}", id2="${id2}". ` +
      `D-127 : unicite garantie par timestamp+random.`);
  });

  console.log('\n=============================================================');
  console.log(`RESULTAT : ${passed} passes, ${failed} echoues sur ${passed + failed} tests`);
  if (failed === 0) { console.log('\u2713 ADMIN-ABS-SYSTEMID PASSED'); }
  else { console.log('\u2717 ADMIN-ABS-SYSTEMID FAILED'); process.exitCode = 1; }
  console.log('=============================================================');
}
run().catch(err => { console.error('ERREUR FATALE :', err.message); process.exitCode = 1; });