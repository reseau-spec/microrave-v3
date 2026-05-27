/**
 * MICRO RAVE V3 — Test P0 : PORT-2-ADAPTER-01
 * ============================================================
 * Valide PORT-2 : l'adaptateur Base44 Deno expose l'interface
 * repositories complète attendue par les guards canoniques, et
 * implémente la barrière LOI TRANSITION-01 comme une Error
 * physique (pas une convention).
 *
 * Conditions de DONE PORT-2 (STATE.md V2 + fil souverain) :
 *   1. import('./src/repositories/adapters/base44-adapter.js')
 *      retourne createBase44Repositories comme function.
 *   2. createBase44Repositories(mockBase44).engagements.updateStatus()
 *      lance effectivement une Error LOI_TRANSITION_01_VIOLATION.
 *   3. L'interface complète est exposée (≥ 17 sous-objets).
 *   4. Les méthodes principales (append, create, filter) routent
 *      vers les bons base44.entities.X.
 *
 * Source : PORT-2 · 27 mai 2026
 * ============================================================
 */

'use strict';

import { createBase44Repositories } from '../../src/repositories/adapters/base44-adapter.js';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.log(`  ✗ ${name}`);
    console.log(`    → ${err.message}`);
    failed++;
  }
}

async function testAsync(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.log(`  ✗ ${name}`);
    console.log(`    → ${err.message}`);
    failed++;
  }
}

// Mock base44 SDK : capture les appels et retourne des stubs.
function makeMockBase44() {
  const calls = [];
  const stubEntity = (entityName) => ({
    create: (data) => { calls.push({ entity: entityName, op: 'create', data }); return { id: 'mock-id', ...data }; },
    filter: (q)    => { calls.push({ entity: entityName, op: 'filter', q });    return []; },
    update: (id, data) => { calls.push({ entity: entityName, op: 'update', id, data }); return { id, ...data }; },
  });

  return {
    calls,
    entities: new Proxy({}, {
      get: (target, prop) => {
        if (!target[prop]) target[prop] = stubEntity(prop);
        return target[prop];
      },
    }),
  };
}

async function main() {
  console.log('\n═══════════════════════════════════════════════');
  console.log('Test P0 : PORT-2-ADAPTER-01');
  console.log('═══════════════════════════════════════════════\n');

  // ── Bloc 1 : Import et signature ─────────────────────────
  console.log('  — Import et signature —');

  test('T-01 createBase44Repositories est une fonction', () => {
    if (typeof createBase44Repositories !== 'function') {
      throw new Error(`Attendu function, reçu ${typeof createBase44Repositories}`);
    }
  });

  test('T-02 lance une Error si base44 absent', () => {
    let threw = false;
    try { createBase44Repositories(); } catch { threw = true; }
    if (!threw) throw new Error('Devrait lancer une Error sans argument');
  });

  test('T-03 lance une Error si base44.entities absent', () => {
    let threw = false;
    try { createBase44Repositories({}); } catch { threw = true; }
    if (!threw) throw new Error('Devrait lancer une Error si base44.entities manque');
  });

  // ── Bloc 2 : Surface de l'interface ──────────────────────
  console.log('\n  — Surface de l\'interface —');

  const mock = makeMockBase44();
  const repos = createBase44Repositories(mock);

  const expectedSubObjects = [
    'engagements', 'contractSnapshots', 'ledgerRecords',
    'ledgerRecordStatusHistory', 'admin', 'scheduler',
    'policyConfig', 'sessionPresence', 'sots', 'reputation',
    'membership', 'payoutExecutionRecords', 'settlementInstructions',
    'talentPaymentProfiles', 'webhookProcessedLogs',
    'engagementAmendments', 'commercialOperationLock', 'kpiSnapshots',
  ];

  for (const key of expectedSubObjects) {
    test(`T-04 sous-objet '${key}' exposé`, () => {
      if (typeof repos[key] !== 'object' || repos[key] === null) {
        throw new Error(`repos.${key} doit être un objet`);
      }
    });
  }

  // ── Bloc 3 : Barrière LOI TRANSITION-01 ──────────────────
  console.log('\n  — Barrière LOI TRANSITION-01 —');

  test('T-05 engagements.updateStatus() lance LOI_TRANSITION_01_VIOLATION', () => {
    let threw = false;
    let msg = '';
    try { repos.engagements.updateStatus('ENG-X', 'deposit_secured'); }
    catch (err) { threw = true; msg = err.message; }
    if (!threw) throw new Error('updateStatus DOIT lancer une Error');
    if (!msg.includes('LOI_TRANSITION_01_VIOLATION')) {
      throw new Error(`Message attendu LOI_TRANSITION_01_VIOLATION, reçu : ${msg}`);
    }
  });

  await testAsync('T-06 engagements.update() avec status:X est aussi bloqué', async () => {
    let threw = false;
    let msg = '';
    try { await repos.engagements.update('id', { status: 'deposit_secured' }); }
    catch (err) { threw = true; msg = err.message; }
    if (!threw) throw new Error('update avec status DOIT lancer une Error');
    if (!msg.includes('LOI_TRANSITION_01_VIOLATION')) {
      throw new Error(`Message attendu LOI_TRANSITION_01_VIOLATION, reçu : ${msg}`);
    }
  });

  await testAsync('T-07 engagements.update() avec champs non-status est autorisé', async () => {
    // Ne doit PAS lancer
    await repos.engagements.update('id', { cs2SystemId: 'CS2-X' });
  });

  // ── Bloc 4 : Routing vers base44.entities ────────────────
  console.log('\n  — Routing vers base44.entities —');

  await testAsync('T-08 ledgerRecords.append → base44.entities.LedgerRecord.create', async () => {
    const before = mock.calls.length;
    await repos.ledgerRecords.append({
      systemId: 'LDG-TEST-01',
      engagementId: 'ENG-TEST',
      amountCents: 1000,
      direction: 'DEBIT',
      account: '4310',
    });
    const lastCall = mock.calls[mock.calls.length - 1];
    if (mock.calls.length !== before + 1) throw new Error('Aucun appel généré');
    if (lastCall.entity !== 'LedgerRecord') throw new Error(`Entité ${lastCall.entity}, attendu LedgerRecord`);
    if (lastCall.op !== 'create') throw new Error(`Op ${lastCall.op}, attendu create`);
    if (lastCall.data.systemId !== 'LDG-TEST-01') throw new Error('systemId non transmis');
    if (!lastCall.data.createdAt) throw new Error('createdAt non auto-rempli');
  });

  await testAsync('T-09 admin.appendToDataAccessLedger → DataAccessLedgerEntry.create', async () => {
    const before = mock.calls.length;
    await repos.admin.appendToDataAccessLedger({
      actorUserId: 'USR-X',
      targetObjectId: 'ENG-X',
      accessType: 'WRITE',
    });
    const lastCall = mock.calls[mock.calls.length - 1];
    if (mock.calls.length !== before + 1) throw new Error('Aucun appel généré');
    if (lastCall.entity !== 'DataAccessLedgerEntry')
      throw new Error(`Entité ${lastCall.entity}, attendu DataAccessLedgerEntry`);
  });

  await testAsync('T-10 contractSnapshots.create → ContractSnapshot.create avec createdAt', async () => {
    const before = mock.calls.length;
    await repos.contractSnapshots.create({
      engagementId: 'ENG-X',
      phase: 1,
      cachetSigneCents: 20000,
    });
    const lastCall = mock.calls[mock.calls.length - 1];
    if (lastCall.entity !== 'ContractSnapshot') throw new Error(`Entité ${lastCall.entity}`);
    if (lastCall.data.phase !== 1) throw new Error('phase non transmise');
    if (!lastCall.data.createdAt) throw new Error('createdAt non auto-rempli');
  });

  await testAsync('T-11 scheduler.createTask → SchedulerDueTask.create avec status PENDING', async () => {
    const before = mock.calls.length;
    await repos.scheduler.createTask({
      engagementId: 'ENG-X',
      taskType: 'sots_window_close',
      dueAt: '2026-06-01T00:00:00Z',
    });
    const lastCall = mock.calls[mock.calls.length - 1];
    if (lastCall.entity !== 'SchedulerDueTask') throw new Error(`Entité ${lastCall.entity}`);
    if (lastCall.data.status !== 'PENDING') throw new Error(`status ${lastCall.data.status}, attendu PENDING`);
    if (lastCall.data.attemptCount !== 0) throw new Error('attemptCount doit être 0');
  });

  await testAsync('T-12 policyConfig.getConfig retourne la valeur (pas le record)', async () => {
    // Override le mock pour cette entité
    mock.entities.PolicyConfig.filter = (q) => [{
      id: 'mock-id',
      key: q.key,
      value: 'DEBOURS',
      value_type: 'string',
    }];
    const val = await repos.policyConfig.getConfig('payment_fees_tax_treatment');
    if (val !== 'DEBOURS') throw new Error(`Valeur ${val}, attendu DEBOURS`);
  });

  await testAsync('T-13 ledgerRecords.findByTransactionGroupId route vers LedgerRecord.filter', async () => {
    const before = mock.calls.length;
    await repos.ledgerRecords.findByTransactionGroupId('TXG-TEST');
    const lastCall = mock.calls[mock.calls.length - 1];
    if (lastCall.entity !== 'LedgerRecord') throw new Error(`Entité ${lastCall.entity}`);
    if (lastCall.op !== 'filter') throw new Error(`Op ${lastCall.op}`);
    if (lastCall.q.transactionGroupId !== 'TXG-TEST') throw new Error('Filtre incorrect');
  });

  // ── Résultat ──────────────────────────────────────────────
  console.log(`\n═══════════════════════════════════════════════`);
  console.log(`Résultat : ${passed} PASSED / ${failed} FAILED`);
  if (failed === 0) {
    console.log('PORT-2-ADAPTER-01 : ✓ PASSED');
    console.log('');
    console.log('PORT-2 conditions de DONE satisfaites :');
    console.log('  · createBase44Repositories importable et fonctionnel');
    console.log('  · 18 sous-objets exposés (≥ 17 attendus)');
    console.log('  · Barrière LOI TRANSITION-01 ancrée physiquement');
    console.log('  · Routing vers base44.entities.X confirmé');
    console.log('═══════════════════════════════════════════════');
  } else {
    console.log('PORT-2-ADAPTER-01 : ✗ FAILED');
    console.log('═══════════════════════════════════════════════');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
