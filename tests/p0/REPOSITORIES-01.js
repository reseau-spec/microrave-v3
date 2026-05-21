/**
 * MICRO RAVE V3 — Test P0 : REPOSITORIES-01
 * ============================================================
 * Valide les invariants de chaque repository sans réseau.
 * Tests de logique pure : validations d'entrée, format systemId,
 * rejet des données invalides, interface PayoutExecutor.
 *
 * Source : D-128 · D-097 · D-101 · D-064 · D-107
 * requiredBeforeEvent : 0B
 *
 * Tests :
 *   --- LedgerRepository ---
 *   T-01 : append() avec systemId LDG-* valide passe
 *   T-02 : append() sans systemId → génère automatiquement LDG-*
 *   T-03 : append() avec amountCents float → rejetée
 *   T-04 : append() avec amountCents négatif → rejetée
 *
 *   --- PaymentRepository ---
 *   T-05 : interface payoutExecutionRecords exposée (D-101 Verrou 2)
 *   T-06 : interface settlementInstructions exposée (D-101 Verrou 3)
 *   T-07 : payoutExecutionRecords.findByEngagementId est une fonction
 *   T-08 : payoutExecutionRecords.create est une fonction
 *   T-09 : settlementInstructions.markConsumed est une fonction
 *
 *   --- SchedulerRepository ---
 *   T-10 : createTask() sans systemId SCH-* → rejetée
 *   T-11 : createTask() sans taskType → rejetée
 *   T-12 : createTask() avec dueAt float → rejetée
 *   T-13 : findDueTasks() filtre correctement par timestamp
 *
 *   --- SessionPresenceRepository ---
 *   T-14 : create() sans systemId SPR-* → rejetée
 *   T-15 : updateCheckout() avec finalDurationMinutes négatif → rejetée
 *   T-16 : updateCheckout() avec finalDurationMinutes float → rejetée
 *
 *   --- AdminRepository ---
 *   T-17 : appendToDataAccessLedger() sans actorUserId → rejetée
 *   T-18 : appendToDataAccessLedger() sans targetObjectId → rejetée
 *   T-19 : createAdminAction() sans reasonCode → rejetée
 *   T-20 : createAdminIncidentRecord() sans severity → rejetée
 *
 *   --- ReputationRepository ---
 *   T-21 : append() sans systemId REP-* → rejetée
 *   T-22 : append() sans engagementId → rejetée
 *
 *   --- SOTSRepository ---
 *   T-23 : create() sans systemId SOT-* → rejetée
 *
 *   --- ContractSnapshotRepository ---
 *   T-24 : create() phase 1 avec préfixe CS2-* → rejetée
 *   T-25 : create() phase 2 avec préfixe CS1-* → rejetée
 *   T-26 : create() sans systemId → rejetée
 *
 *   --- Interface D-101 complète ---
 *   T-27 : PaymentRepository satisfait l'interface complète PayoutExecutor
 *   T-28 : LedgerRepository.append auto-génère un systemId LDG-* cohérent
 *
 *   --- MembershipRepository ---
 *   T-29 : findActiveByUserId() sans userId -> MEMBERSHIP_REPOSITORY_ERROR
 *   T-30 : findPlanById() sans planId -> MEMBERSHIP_REPOSITORY_ERROR
 * ============================================================
 */

'use strict';

// ── Mock fetch — aucun appel réseau dans ce test ─────────────
// Les fonctions qui valident les entrées AVANT de faire un appel HTTP
// doivent lever des erreurs sans jamais atteindre fetch().
// Les fonctions qui ne valident pas en amont (ex: base44Get direct)
// atteindraient fetch — on le mock pour que le test reste unitaire.
global.fetch = async () => {
  throw new Error('FETCH_NOT_EXPECTED: Ce test ne doit pas faire d\'appels réseau. ' +
    'Si ce message apparaît, une validation d\'entrée manque dans le repository.');
};

// ── Charger les repositories ──────────────────────────────────
process.env.BASE44_API_KEY = 'sk_test_MOCK_REPOS_01';

const LedgerRepository        = require('../../src/repositories/LedgerRepository');
const PaymentRepository        = require('../../src/repositories/PaymentRepository');
const SchedulerRepository      = require('../../src/repositories/SchedulerRepository');
const SessionPresenceRepository = require('../../src/repositories/SessionPresenceRepository');
const AdminRepository          = require('../../src/repositories/AdminRepository');
const ReputationRepository     = require('../../src/repositories/ReputationRepository');
const SOTSRepository           = require('../../src/repositories/SOTSRepository');
const ContractSnapshotRepository = require('../../src/repositories/ContractSnapshotRepository');
const MembershipRepository     = require('../../src/repositories/MembershipRepository');
const IDFactory                = require('../../src/core/IDFactory');

// ── Helpers ───────────────────────────────────────────────────
let passed = 0; let failed = 0;

async function test(name, fn) {
  try { await fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (err) { console.log(`  ✗ ${name}\n    → ${err.message}`); failed++; }
}

function assert(cond, msg) { if (!cond) throw new Error(msg); }

async function expectThrows(fn, substr) {
  let threw = false;
  try { await fn(); }
  catch (e) {
    threw = true;
    if (substr) assert(e.message.includes(substr),
      `Attendu "${substr}" dans: ${e.message}`);
  }
  assert(threw, `Doit lever une erreur${substr ? ` contenant "${substr}"` : ''}`);
}

// ─────────────────────────────────────────────────────────────
async function run() {
  console.log('REPOSITORIES-01 — Invariants repositories (sans réseau)');
  console.log('═══════════════════════════════════════════════');

  // ── LedgerRepository ─────────────────────────────────────
  console.log('\n  — LedgerRepository —');

  await test('T-01 append() avec systemId LDG-* valide passe la validation', async () => {
    // Mock fetch pour ce test spécifique — l'entrée est valide donc on atteint fetch
    const originalFetch = global.fetch;
    global.fetch = async () => ({ ok: true, json: async () => ({ id: 'db-001' }) });
    try {
      const result = await LedgerRepository.append({
        systemId:     'LDG-TEST00001-AAAAAA',
        engagementId: 'ENG-TEST00001-BBBBBB',
        amountCents:  5000,
        currency:     'cad',
      });
      assert(result.id === 'db-001', 'Doit retourner le record créé');
    } finally {
      global.fetch = originalFetch;
    }
  });

  await test('T-02 append() sans systemId → génère automatiquement LDG-*', async () => {
    const originalFetch = global.fetch;
    let capturedData;
    global.fetch = async (url, opts) => {
      capturedData = JSON.parse(opts.body);
      return { ok: true, json: async () => ({ id: 'db-002', ...capturedData }) };
    };
    try {
      const result = await LedgerRepository.append({
        engagementId: 'ENG-TEST00001-BBBBBB',
        amountCents:  3000,
        currency:     'cad',
      });
      assert(capturedData.systemId.startsWith('LDG-'),
        `systemId auto-généré doit commencer par LDG-, reçu: ${capturedData.systemId}`);
    } finally {
      global.fetch = originalFetch;
    }
  });

  await test('T-03 append() avec amountCents float → LEDGER_ERROR', async () => {
    await expectThrows(
      () => LedgerRepository.append({ systemId: 'LDG-T03-AAAAAA', amountCents: 50.5, currency: 'cad' }),
      'LEDGER_ERROR'
    );
  });

  await test('T-04 append() avec amountCents négatif → LEDGER_ERROR', async () => {
    await expectThrows(
      () => LedgerRepository.append({ systemId: 'LDG-T04-AAAAAA', amountCents: -1, currency: 'cad' }),
      'LEDGER_ERROR'
    );
  });

  // ── PaymentRepository ─────────────────────────────────────
  console.log('\n  — PaymentRepository (interface D-101) —');

  await test('T-05 interface payoutExecutionRecords exposée', async () => {
    assert(PaymentRepository.payoutExecutionRecords !== undefined,
      'payoutExecutionRecords doit être exporté');
  });

  await test('T-06 interface settlementInstructions exposée', async () => {
    assert(PaymentRepository.settlementInstructions !== undefined,
      'settlementInstructions doit être exporté');
  });

  await test('T-07 payoutExecutionRecords.findByEngagementId est une fonction', async () => {
    assert(typeof PaymentRepository.payoutExecutionRecords.findByEngagementId === 'function',
      'findByEngagementId doit être une fonction — D-101 Verrou 2');
  });

  await test('T-08 payoutExecutionRecords.create est une fonction', async () => {
    assert(typeof PaymentRepository.payoutExecutionRecords.create === 'function',
      'create doit être une fonction');
  });

  await test('T-09 settlementInstructions.markConsumed est une fonction', async () => {
    assert(typeof PaymentRepository.settlementInstructions.markConsumed === 'function',
      'markConsumed doit être une fonction — D-101 Verrou 3');
  });

  // ── SchedulerRepository ───────────────────────────────────
  console.log('\n  — SchedulerRepository —');

  await test('T-10 createTask() sans systemId SCH-* → SCHEDULER_ERROR', async () => {
    await expectThrows(
      () => SchedulerRepository.createTask({ taskType: 'BALANCE_DEADLINE_CHECK', dueAt: Date.now() }),
      'SCHEDULER_ERROR'
    );
  });

  await test('T-11 createTask() sans taskType → SCHEDULER_ERROR', async () => {
    await expectThrows(
      () => SchedulerRepository.createTask({ systemId: 'SCH-T11-AAAAAA', dueAt: Date.now() }),
      'SCHEDULER_ERROR'
    );
  });

  await test('T-12 createTask() avec dueAt float → SCHEDULER_ERROR', async () => {
    await expectThrows(
      () => SchedulerRepository.createTask({
        systemId: 'SCH-T12-AAAAAA', taskType: 'SOTS_WINDOW_CLOSE', dueAt: 1716300000.5
      }),
      'SCHEDULER_ERROR'
    );
  });

  await test('T-13 findDueTasks() filtre par timestamp — passé inclus, futur exclu', async () => {
    // Mock fetch pour simuler un retour de tâches pending
    const originalFetch = global.fetch;
    const now = Date.now();
    const pastTask   = { id: 'db-past',   dueAt: now - 1000, status: 'pending', lockedByRunId: null };
    const futureTask = { id: 'db-future', dueAt: now + 1000, status: 'pending', lockedByRunId: null };
    global.fetch = async () => ({ ok: true, json: async () => [pastTask, futureTask] });
    try {
      const due = await SchedulerRepository.findDueTasks(now);
      assert(due.length === 1, `Doit retourner 1 tâche due, reçu: ${due.length}`);
      assert(due[0].id === 'db-past', 'La tâche due doit être pastTask');
    } finally {
      global.fetch = originalFetch;
    }
  });

  // ── SessionPresenceRepository ─────────────────────────────
  console.log('\n  — SessionPresenceRepository —');

  await test('T-14 create() sans systemId SPR-* → PRESENCE_ERROR', async () => {
    await expectThrows(
      () => SessionPresenceRepository.create({
        engagementId: 'ENG-T14-AAAAAA',
        talentUserId: 'USR-T14-AAAAAA',
        checkInAt: Date.now(),
      }),
      'PRESENCE_ERROR'
    );
  });

  await test('T-15 updateCheckout() avec finalDurationMinutes négatif → PRESENCE_ERROR', async () => {
    await expectThrows(
      () => SessionPresenceRepository.updateCheckout('db-t15', { finalDurationMinutes: -5 }),
      'PRESENCE_ERROR'
    );
  });

  await test('T-16 updateCheckout() avec finalDurationMinutes float → PRESENCE_ERROR', async () => {
    await expectThrows(
      () => SessionPresenceRepository.updateCheckout('db-t16', { finalDurationMinutes: 45.5 }),
      'PRESENCE_ERROR'
    );
  });

  // ── AdminRepository ───────────────────────────────────────
  console.log('\n  — AdminRepository —');

  await test('T-17 appendToDataAccessLedger() sans actorUserId → ADMIN_ERROR', async () => {
    await expectThrows(
      () => AdminRepository.appendToDataAccessLedger({ targetObjectId: 'ENG-T17' }),
      'ADMIN_ERROR'
    );
  });

  await test('T-18 appendToDataAccessLedger() sans targetObjectId → ADMIN_ERROR', async () => {
    await expectThrows(
      () => AdminRepository.appendToDataAccessLedger({ actorUserId: 'USR-T18' }),
      'ADMIN_ERROR'
    );
  });

  await test('T-19 createAdminAction() sans reasonCode → ADMIN_ERROR', async () => {
    await expectThrows(
      () => AdminRepository.createAdminAction({
        actorUserId: 'USR-T19', actionType: 'TEST_ACTION',
      }),
      'ADMIN_ERROR'
    );
  });

  await test('T-20 createAdminIncidentRecord() sans severity → ADMIN_ERROR', async () => {
    await expectThrows(
      () => AdminRepository.createAdminIncidentRecord({ incidentType: 'TEST' }),
      'ADMIN_ERROR'
    );
  });

  // ── ReputationRepository ──────────────────────────────────
  console.log('\n  — ReputationRepository —');

  await test('T-21 append() sans systemId REP-* → REPUTATION_ERROR', async () => {
    await expectThrows(
      () => ReputationRepository.append({
        userId: 'USR-T21', engagementId: 'ENG-T21',
      }),
      'REPUTATION_ERROR'
    );
  });

  await test('T-22 append() sans engagementId → REPUTATION_ERROR', async () => {
    await expectThrows(
      () => ReputationRepository.append({
        systemId: 'REP-T22-AAAAAA', userId: 'USR-T22',
      }),
      'REPUTATION_ERROR'
    );
  });

  // ── SOTSRepository ────────────────────────────────────────
  console.log('\n  — SOTSRepository —');

  await test('T-23 create() sans systemId SOT-* → SOTS_ERROR', async () => {
    await expectThrows(
      () => SOTSRepository.create({
        engagementId: 'ENG-T23', submittedBy: 'USR-T23', role: 'talent',
      }),
      'SOTS_ERROR'
    );
  });

  // ── ContractSnapshotRepository ────────────────────────────
  console.log('\n  — ContractSnapshotRepository —');

  await test('T-24 create() phase 1 avec préfixe CS2-* → CONTRACT_SNAPSHOT_ERROR', async () => {
    await expectThrows(
      () => ContractSnapshotRepository.create({
        systemId: 'CS2-T24-AAAAAA', phase: 1, engagementId: 'ENG-T24',
      }),
      'CONTRACT_SNAPSHOT_ERROR'
    );
  });

  await test('T-25 create() phase 2 avec préfixe CS1-* → CONTRACT_SNAPSHOT_ERROR', async () => {
    await expectThrows(
      () => ContractSnapshotRepository.create({
        systemId: 'CS1-T25-AAAAAA', phase: 2, engagementId: 'ENG-T25',
      }),
      'CONTRACT_SNAPSHOT_ERROR'
    );
  });

  await test('T-26 create() sans systemId → CONTRACT_SNAPSHOT_ERROR', async () => {
    await expectThrows(
      () => ContractSnapshotRepository.create({ phase: 1, engagementId: 'ENG-T26' }),
      'CONTRACT_SNAPSHOT_ERROR'
    );
  });

  // ── Interface complète D-101 ──────────────────────────────
  console.log('\n  — Interface D-101 complète —');

  await test('T-27 PaymentRepository satisfait l\'interface complète PayoutExecutor', async () => {
    // PayoutExecutor attend exactement ces 4 sous-objets / fonctions
    // Source : PayoutExecutor.js lignes 68-71
    const P = PaymentRepository;
    assert(typeof P.payoutExecutionRecords?.findByEngagementId === 'function',
      'payoutExecutionRecords.findByEngagementId manquant');
    assert(typeof P.payoutExecutionRecords?.create === 'function',
      'payoutExecutionRecords.create manquant');
    assert(typeof P.settlementInstructions?.markConsumed === 'function',
      'settlementInstructions.markConsumed manquant');
    // ledgerRecords.append est fourni par LedgerRepository directement
    // (le caller assemble repositories = { ...PaymentRepository, ledgerRecords: LedgerRepository })
    assert(typeof LedgerRepository.append === 'function',
      'LedgerRepository.append manquant');
  });

  await test('T-28 LedgerRepository.append auto-génère un systemId LDG-* cohérent', async () => {
    const originalFetch = global.fetch;
    let capturedSystemId;
    global.fetch = async (url, opts) => {
      const body = JSON.parse(opts.body);
      capturedSystemId = body.systemId;
      return { ok: true, json: async () => ({ id: 'db-t28', systemId: capturedSystemId }) };
    };
    try {
      // Appel sans systemId — doit être auto-généré
      await LedgerRepository.append({ amountCents: 100, currency: 'cad', engagementId: 'ENG-T28' });
      assert(capturedSystemId.startsWith('LDG-'),
        `systemId auto-généré doit être LDG-*, reçu: ${capturedSystemId}`);
      // Vérifier que le format IDFactory est respecté
      const parts = capturedSystemId.split('-');
      assert(parts.length === 3, `Format LDG-XXXXXXXX-XXXXXX attendu, reçu: ${capturedSystemId}`);
      assert(parts[0] === 'LDG', `Préfixe LDG attendu, reçu: ${parts[0]}`);
    } finally {
      global.fetch = originalFetch;
    }
  });


  // -- MembershipRepository ------------------------------------------
  console.log('\n  — MembershipRepository —');

  await test('T-29 findActiveByUserId() sans userId -> MEMBERSHIP_REPOSITORY_ERROR', async () => {
    await expectThrows(
      () => MembershipRepository.findActiveByUserId(undefined),
      'MEMBERSHIP_REPOSITORY_ERROR'
    );
  });

  await test('T-30 findPlanById() sans planId -> MEMBERSHIP_REPOSITORY_ERROR', async () => {
    await expectThrows(
      () => MembershipRepository.findPlanById(undefined),
      'MEMBERSHIP_REPOSITORY_ERROR'
    );
  });

  // ── Résumé ────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════');
  if (failed === 0) {
    console.log(`REPOSITORIES-01 : ✓ PASSED (${passed}/${passed + failed})`);
    console.log('');
    console.log('Les 9 repositories respectent leurs invariants.');
    console.log('Interface PayoutExecutor D-101 : conforme.');
    console.log('LedgerRepository.append : systemId auto-généré si absent.');
  } else {
    console.log(`REPOSITORIES-01 : ✗ FAILED (${passed} ✓ / ${failed} ✗)`);
    process.exit(1);
  }
  console.log('═══════════════════════════════════════════════');
}

run();