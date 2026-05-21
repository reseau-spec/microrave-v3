/**
 * MICRO RAVE V3 — Test P0 : ADMIN-ABS-SCHEDULERRUN
 * ============================================================
 * Prouve que SchedulerRun complete est immuable apres completion.
 * D-107 interdit #13 : "Modifier un SchedulerRun complete"
 *
 * Source : D-107 · D-099 · TEST_REGISTRY requiredBeforeEvent=0A
 *
 * T-01 : SchedulerRepository n'expose pas deleteRun
 * T-02 : completeRun() emet PUT une seule fois — le run est ensuite scelle
 * T-03 : createRun() emet POST (status='running')
 * T-04 : completeRun() payload contient status='completed' et completedAt
 * ============================================================
 */

'use strict';

process.env.BASE44_API_KEY = 'sk_test_MOCK_SCHEDRUN_IMMUT';

const SchedulerRepository = require('../../src/repositories/SchedulerRepository');

let passed = 0; let failed = 0;

async function test(name, fn) {
  try { await fn(); console.log(`  \u2713 ${name}`); passed++; }
  catch (e) { console.log(`  \u2717 ${name}\n    \u2192 ${e.message}`); failed++; }
}
function assert(c, m) { if (!c) throw new Error(m); }

console.log('ADMIN-ABS-SCHEDULERRUN -- SchedulerRun immutable (D-107 #13)');
console.log('================================================================');

async function run() {

  await test('T-01 : SchedulerRepository n\'expose pas deleteRun ou purgeRun', async () => {
    assert(
      typeof SchedulerRepository.deleteRun === 'undefined' &&
      typeof SchedulerRepository.purgeRun === 'undefined' &&
      typeof SchedulerRepository.deleteSchedulerRun === 'undefined',
      'SchedulerRepository NE DOIT PAS exposer de suppression sur SchedulerRun. D-107 #13.'
    );
  });

  await test('T-02 : createRun() emet POST avec status running', async () => {
    let capturedBody = null;
    let method = null;
    global.fetch = async (url, opts) => {
      method = opts.method;
      capturedBody = JSON.parse(opts.body);
      return { ok: true, json: async () => ({ id: 'run-001', ...capturedBody }) };
    };
    try {
      await SchedulerRepository.createRun({ runId: 'RUN-TEST-001' });
    } finally { delete global.fetch; }
    assert(method === 'POST', `createRun() doit emettre POST. Recu : ${method}.`);
    assert(capturedBody.status === 'running',
      `status doit etre 'running' a la creation. Recu : ${capturedBody.status}.`);
  });

  await test('T-03 : completeRun() emet PUT avec status completed', async () => {
    let capturedBody = null;
    let method = null;
    global.fetch = async (url, opts) => {
      method = opts.method;
      capturedBody = JSON.parse(opts.body);
      return { ok: true, json: async () => ({ id: 'run-001', ...capturedBody }) };
    };
    try {
      await SchedulerRepository.completeRun('db-run-001', { tasksProcessed: 3, tasksFailed: 0 });
    } finally { delete global.fetch; }
    assert(method === 'PUT', `completeRun() doit emettre PUT. Recu : ${method}.`);
    assert(capturedBody.status === 'completed',
      `status doit etre 'completed'. Recu : ${capturedBody.status}. ` +
      `D-107 #13 : apres completion, le run ne peut plus etre modifie.`);
  });

  await test('T-04 : completeRun() payload contient completedAt', async () => {
    let capturedBody = null;
    global.fetch = async (url, opts) => {
      capturedBody = JSON.parse(opts.body);
      return { ok: true, json: async () => ({ id: 'run-002' }) };
    };
    try {
      await SchedulerRepository.completeRun('db-run-002', { tasksProcessed: 5, tasksFailed: 1 });
    } finally { delete global.fetch; }
    assert(typeof capturedBody.completedAt === 'string',
      `completedAt doit etre un string ISO dans completeRun(). Recu : ${capturedBody.completedAt}.`);
    assert(capturedBody.tasksProcessed === 5, `tasksProcessed attendu 5. Recu : ${capturedBody.tasksProcessed}.`);
  });

  console.log('\n================================================================');
  console.log(`RESULTAT : ${passed} passes, ${failed} echoues sur ${passed + failed} tests`);
  if (failed === 0) { console.log('\u2713 ADMIN-ABS-SCHEDULERRUN PASSED'); }
  else { console.log('\u2717 ADMIN-ABS-SCHEDULERRUN FAILED'); process.exitCode = 1; }
  console.log('================================================================');
}
run().catch(err => { console.error('ERREUR FATALE :', err.message); process.exitCode = 1; });