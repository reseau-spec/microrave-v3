/**
 * MICRO RAVE V3 — Test P0 : LEDGER-V4-01
 * ============================================================
 * Valide l'intégralité des livrables post-Pierre de Rosette :
 *   D-038-B : stripeTransferId champ natif + propagation
 *   D-060-B : Account6690Guard (interventionType + contrepartie fiscale)
 *   D-060-C : reconciliationKey universelle (auto-génération + guard)
 *   D-060-E : detectReversal + writeStatusHistoryForReversal
 *   LedgerRepository : findByTransactionGroupId
 *
 * Tests :
 *   T-01 : recordTransaction nominal — passe sans Stripe ni 6690
 *   T-02 : reconciliationKey auto-générée depuis stripeTransferId
 *   T-03 : reconciliationKey explicite — utilisée telle quelle
 *   T-04 : reconciliationKey absente, pas de Stripe → BLOQUÉ
 *   T-05 : stripeTransferId propagé sur toutes les lignes du groupe
 *   T-06 : reconciliationKey propagée sur toutes les lignes du groupe
 *   T-07 : Account6690Guard — interventionType absent → BLOQUÉ
 *   T-08 : Account6690Guard — interventionType invalide → BLOQUÉ
 *   T-09 : Account6690Guard — contrepartie non-fiscale → BLOQUÉ
 *   T-10 : Account6690Guard — cas valide → passe
 *   T-11 : detectReversal — transaction non-reversal → isReversal false
 *   T-12 : detectReversal — cas 1 : reversedLedgerRecordIds explicite
 *   T-13 : detectReversal — cas 2 : reversalOf + lookup repository
 *   T-14 : detectReversal — cas 3 : reversal_* sans cible → warn + continue
 *   T-15 : writeStatusHistoryForReversal — sans repository → rétrocompat OK
 *   T-16 : writeStatusHistoryForReversal — avec repository → transitions écrites
 *   T-17 : writeStatusHistoryForReversal — échec écriture → throw atomique
 *   T-18 : recordTransaction complet avec reversal → statusHistory peuplé
 *   T-19 : VALID_ACCOUNTS contient 6690 avec annotation D-060-B
 *   T-20 : recordTransaction — DR ≠ CR → BLOQUÉ (invariant LOI LEDGER-02)
 *   T-21 : findByTransactionGroupId — méthode présente dans LedgerRepository
 *
 * Source : D-038-B · D-060-B · D-060-C · D-060-E · LedgerCodeMap V4
 * ============================================================
 */

'use strict';

import svc from '../../src/services/FinancialLedgerService.js';
import LedgerRepo from '../../src/repositories/LedgerRecordRepository.js';
// ── Compteurs ─────────────────────────────────────────────────
let passed = 0;
let failed = 0;

async function test(name, fn) {
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

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function assertThrows(fn, substr) {
  // Version synchrone
  let threw = false;
  try { fn(); }
  catch (err) {
    threw = true;
    if (substr) assert(
      err.message.includes(substr),
      `Attendu "${substr}" dans : ${err.message}`
    );
  }
  assert(threw, `Aurait dû lancer une erreur${substr ? ` contenant "${substr}"` : ''}`);
}

async function assertThrowsAsync(fn, substr) {
  let threw = false;
  try { await fn(); }
  catch (err) {
    threw = true;
    if (substr) assert(
      err.message.includes(substr),
      `Attendu "${substr}" dans : ${err.message}`
    );
  }
  assert(threw, `Aurait dû lancer une erreur${substr ? ` contenant "${substr}"` : ''}`);
}

// ── Repositories mock ─────────────────────────────────────────
// Simule un repositories complet sans appels réseau.
// Chaque append() retourne l'objet reçu enrichi d'un id.

let appendedRecords   = [];   // LedgerRecord persistés
let appendedStatuses  = [];   // LedgerRecordStatusHistory persistés

function makeMockRepositories({ failStatusHistory = false } = {}) {
  appendedRecords  = [];
  appendedStatuses = [];

  return {
    ledgerRecords: {
      append: async (entry) => {
        const record = { ...entry, id: `mock-id-${appendedRecords.length}` };
        appendedRecords.push(record);
        return record;
      },
      findByTransactionGroupId: async (groupId) => {
        return appendedRecords.filter(r => r.transactionGroupId === groupId);
      },
      findByEngagementId: async () => [],
    },
    ledgerRecordStatusHistory: {
      append: async (entry) => {
        if (failStatusHistory) {
          throw new Error('MOCK_STATUS_HISTORY_FAILURE');
        }
        const record = { ...entry, id: `status-id-${appendedStatuses.length}` };
        appendedStatuses.push(record);
        return record;
      },
    },
  };
}

// ── Entrées de test réutilisables ─────────────────────────────
const ENTRIES_NOMINAL = [
  { account: '5200', direction: 'DEBIT',  amountCents: 30000, note: 'Encaissement' },
  { account: '4310', direction: 'CREDIT', amountCents: 26400, note: 'Talent payable' },
  { account: '4530', direction: 'CREDIT', amountCents:  3600, note: 'Commission MR' },
];

const ENTRIES_6690_VALID = [
  { account: '6690', direction: 'DEBIT',  amountCents: 4492, note: 'Taxes absorbées' },
  { account: '4410', direction: 'CREDIT', amountCents: 1500, note: 'TPS' },
  { account: '4420', direction: 'CREDIT', amountCents: 2992, note: 'TVQ' },
];

// ══════════════════════════════════════════════════════════════
// SUITE 1 — reconciliationKey (D-060-C)
// ══════════════════════════════════════════════════════════════
async function suiteReconciliationKey() {
  console.log('\n  — D-060-C : reconciliationKey —');

  await test('T-02 : reconciliationKey auto-générée depuis stripeTransferId', async () => {
    const key = svc.resolveReconciliationKey(null, 'tr_TEST123', 'TXG-x', 'int_capture');
    assert(key === 'stripe:tr_TEST123', `Attendu stripe:tr_TEST123, reçu ${key}`);
  });

  await test('T-03 : reconciliationKey explicite — utilisée telle quelle', async () => {
    const key = svc.resolveReconciliationKey('journal:JNL-001', null, 'TXG-x', 'adjustment');
    assert(key === 'journal:JNL-001', `Attendu journal:JNL-001, reçu ${key}`);
  });

  await test('T-04 : reconciliationKey absente + pas de Stripe → BLOQUÉ', () => {
    assertThrows(
      () => svc.resolveReconciliationKey(null, null, 'TXG-x', 'fiscal_absorption'),
      'RECONCILIATION_KEY_GUARD'
    );
  });

  await test('T-05 : stripeTransferId propagé sur toutes les lignes', async () => {
    const repos = makeMockRepositories();
    const result = await svc.recordTransaction({
      transactionType: 'encaissement_depot',
      engagementId: 'ENG-TEST-001',
      stripeTransferId: 'pi_TEST456',
      entries: ENTRIES_NOMINAL,
      repositories: repos,
    });
    assert(result.stripeTransferId === 'pi_TEST456', 'stripeTransferId absent du retour');
    const allHaveStripe = appendedRecords.every(r => r.stripeTransferId === 'pi_TEST456');
    assert(allHaveStripe, `Certaines lignes n'ont pas stripeTransferId`);
  });

  await test('T-06 : reconciliationKey propagée sur toutes les lignes', async () => {
    const repos = makeMockRepositories();
    await svc.recordTransaction({
      transactionType: 'encaissement_depot',
      engagementId: 'ENG-TEST-002',
      stripeTransferId: 'pi_TEST789',
      reconciliationKey: 'stripe:pi_TEST789',
      entries: ENTRIES_NOMINAL,
      repositories: repos,
    });
    const allHaveKey = appendedRecords.every(r => r.reconciliationKey === 'stripe:pi_TEST789');
    assert(allHaveKey, `Certaines lignes n'ont pas reconciliationKey`);
  });
}

// ══════════════════════════════════════════════════════════════
// SUITE 2 — Account6690Guard (D-060-B)
// ══════════════════════════════════════════════════════════════
async function suiteAccount6690Guard() {
  console.log('\n  — D-060-B : Account6690Guard —');

  await test('T-07 : 6690 sans interventionType → BLOQUÉ', () => {
    assertThrows(
      () => svc.validateAccount6690(
        [{ account: '6690', direction: 'DEBIT', amountCents: 100 }],
        {}
      ),
      'ACCOUNT_6690_GUARD'
    );
  });

  await test('T-08 : 6690 avec interventionType invalide → BLOQUÉ', () => {
    assertThrows(
      () => svc.validateAccount6690(
        [{ account: '6690', direction: 'DEBIT', amountCents: 100 }],
        { interventionType: 'VALEUR_INVALIDE' }
      ),
      'ACCOUNT_6690_GUARD'
    );
  });

  await test('T-09 : 6690 sans contrepartie fiscale → BLOQUÉ', () => {
    assertThrows(
      () => svc.validateAccount6690(
        [
          { account: '6690', direction: 'DEBIT',  amountCents: 100 },
          { account: '4310', direction: 'CREDIT', amountCents: 100 }, // passif talent ≠ passif fiscal
        ],
        { interventionType: 'PRINCIPAL_TAX_REGULARIZATION_PILOT' }
      ),
      'ACCOUNT_6690_GUARD'
    );
  });

  await test('T-10 : 6690 valide — interventionType + contrepartie fiscale → passe', () => {
    // Ne doit pas lancer
    svc.validateAccount6690(ENTRIES_6690_VALID, {
      interventionType: 'PRINCIPAL_TAX_REGULARIZATION_PILOT',
    });
  });

  await test('T-10b : recordTransaction complet avec 6690 valide → persiste', async () => {
    const repos = makeMockRepositories();
    const result = await svc.recordTransaction({
      transactionType:  'fiscal_absorption_pilote',
      engagementId:     'ENG-TEST-003',
      reconciliationKey: 'journal:TEST-6690-VALIDE',
      metadata: { interventionType: 'PRINCIPAL_TAX_REGULARIZATION_PILOT' },
      entries: ENTRIES_6690_VALID,
      repositories: repos,
    });
    assert(result.balanced, 'Transaction doit être équilibrée');
    assert(result.lineCount === 3, `3 lignes attendues, reçu ${result.lineCount}`);
  });
}

// ══════════════════════════════════════════════════════════════
// SUITE 3 — detectReversal (D-060-E)
// ══════════════════════════════════════════════════════════════
async function suiteDetectReversal() {
  console.log('\n  — D-060-E : detectReversal —');

  await test('T-11 : transaction non-reversal → isReversal false', async () => {
    const r = await svc.detectReversal({
      transactionType: 'encaissement_depot',
      metadata: {},
      repositories: {},
    });
    assert(r.isReversal === false, 'Attendu isReversal=false');
    assert(r.reversedIds.length === 0, 'reversedIds doit être vide');
  });

  await test('T-12 : cas 1 — reversedLedgerRecordIds explicite', async () => {
    const r = await svc.detectReversal({
      transactionType: 'reversal_test',
      metadata: {
        reversedLedgerRecordIds: ['LDG-AAA', 'LDG-BBB'],
        reversalOf: 'TXG-ORIGINAL',
      },
      repositories: {},
    });
    assert(r.isReversal === true, 'Attendu isReversal=true');
    assert(r.reversedIds.length === 2, `2 ids attendus, reçu ${r.reversedIds.length}`);
    assert(r.reversedIds[0] === 'LDG-AAA', 'Premier id incorrect');
    assert(r.reversedGroupId === 'TXG-ORIGINAL', 'reversedGroupId incorrect');
  });

  await test('T-13 : cas 2 — reversalOf + lookup repository', async () => {
    // Préparer un mock avec des lignes dans le groupe original
    const repos = makeMockRepositories();
    // Simuler un groupe existant dans le repository
    appendedRecords = [
      { systemId: 'LDG-ORIG-1', transactionGroupId: 'TXG-ORIGINAL-ABC' },
      { systemId: 'LDG-ORIG-2', transactionGroupId: 'TXG-ORIGINAL-ABC' },
      { systemId: 'LDG-ORIG-3', transactionGroupId: 'TXG-ORIGINAL-ABC' },
    ];
    const r = await svc.detectReversal({
      transactionType: 'reversal_test',
      metadata: { reversalOf: 'TXG-ORIGINAL-ABC' },
      repositories: repos,
    });
    assert(r.isReversal === true, 'Attendu isReversal=true');
    assert(r.reversedIds.length === 3, `3 ids attendus, reçu ${r.reversedIds.length}`);
    assert(r.reversedGroupId === 'TXG-ORIGINAL-ABC', 'reversedGroupId incorrect');
  });

  await test('T-14 : cas 3 — reversal_* sans cible → warn + isReversal true + ids vide', async () => {
    const r = await svc.detectReversal({
      transactionType: 'reversal_sans_cible',
      metadata: {},
      repositories: {},
    });
    assert(r.isReversal === true, 'Attendu isReversal=true');
    assert(r.reversedIds.length === 0, 'reversedIds doit être vide (avertissement émis)');
  });
}

// ══════════════════════════════════════════════════════════════
// SUITE 4 — writeStatusHistoryForReversal (D-060-E)
// ══════════════════════════════════════════════════════════════
async function suiteWriteStatusHistory() {
  console.log('\n  — D-060-E : writeStatusHistoryForReversal —');

  await test('T-15 : sans repository ledgerRecordStatusHistory → rétrocompat OK', async () => {
    const r = await svc.writeStatusHistoryForReversal({
      transactionType: 'reversal_test',
      metadata: { reversedLedgerRecordIds: ['LDG-X'] },
      transactionGroupId: 'TXG-NEW',
      persistedRecords: [{ systemId: 'LDG-NEW-1' }],
      decidedBy: 'user-test',
      decisionRecordId: null,
      repositories: {}, // pas de ledgerRecordStatusHistory
    });
    assert(r.historyWritten === false, 'historyWritten doit être false en mode rétrocompat');
  });

  await test('T-16 : avec repository → transitions écrites (REVERSED + REVERSAL_OF)', async () => {
    const repos = makeMockRepositories();
    const r = await svc.writeStatusHistoryForReversal({
      transactionType: 'reversal_test',
      metadata: {
        reversedLedgerRecordIds: ['LDG-ORIG-A', 'LDG-ORIG-B'],
        reversalOf: 'TXG-ORIGINAL',
      },
      transactionGroupId: 'TXG-REVERSAL',
      persistedRecords: [{ systemId: 'LDG-REV-1' }, { systemId: 'LDG-REV-2' }],
      decidedBy: 'user-test',
      decisionRecordId: 'DR-TEST',
      repositories: repos,
    });
    assert(r.historyWritten === true, 'historyWritten doit être true');
    // 2 REVERSED (lignes originales) + 2 REVERSAL_OF (nouvelles lignes) = 4
    assert(r.transitions.length === 4, `4 transitions attendues, reçu ${r.transitions.length}`);

    const reversedEntries  = appendedStatuses.filter(s => s.status === 'REVERSED');
    const reversalOfEntries = appendedStatuses.filter(s => s.status === 'REVERSAL_OF');
    assert(reversedEntries.length === 2,   `2 REVERSED attendus, reçu ${reversedEntries.length}`);
    assert(reversalOfEntries.length === 2, `2 REVERSAL_OF attendus, reçu ${reversalOfEntries.length}`);
    assert(reversedEntries[0].ledgerRecordId === 'LDG-ORIG-A', 'Premier REVERSED incorrect');
    assert(reversalOfEntries[0].ledgerRecordId === 'LDG-REV-1', 'Premier REVERSAL_OF incorrect');
  });

  await test('T-17 : échec écriture statusHistory → throw atomique', async () => {
    const repos = makeMockRepositories({ failStatusHistory: true });
    await assertThrowsAsync(
      () => svc.writeStatusHistoryForReversal({
        transactionType: 'reversal_test',
        metadata: { reversedLedgerRecordIds: ['LDG-X'] },
        transactionGroupId: 'TXG-REVERSAL-FAIL',
        persistedRecords: [],
        decidedBy: 'user-test',
        decisionRecordId: null,
        repositories: repos,
      }),
      'LEDGER_STATUS_HISTORY_WRITE_FAILED'
    );
  });
}

// ══════════════════════════════════════════════════════════════
// SUITE 5 — Tests d'intégration recordTransaction
// ══════════════════════════════════════════════════════════════
async function suiteIntegration() {
  console.log('\n  — Intégration : recordTransaction —');

  await test('T-01 : transaction nominale — passe sans Stripe ni 6690', async () => {
    const repos = makeMockRepositories();
    const result = await svc.recordTransaction({
      transactionType: 'encaissement_depot',
      engagementId: 'ENG-TEST-NOM',
      reconciliationKey: 'journal:TEST-NOMINAL',
      entries: ENTRIES_NOMINAL,
      repositories: repos,
    });
    assert(result.balanced === true, 'Transaction doit être équilibrée');
    assert(result.lineCount === 3, `3 lignes attendues, reçu ${result.lineCount}`);
    assert(result.reconciliationKey === 'journal:TEST-NOMINAL', 'reconciliationKey absente du retour');
    assert(result.statusHistoryWritten === false, 'Pas de statusHistory pour une transaction normale');
  });

  await test('T-18 : recordTransaction avec reversal → statusHistory peuplé', async () => {
    const repos = makeMockRepositories();
    // Préparer des lignes originales dans le mock
    appendedRecords = [
      { systemId: 'LDG-G1-LINE-1', transactionGroupId: 'TXG-G1-ORIGINAL' },
      { systemId: 'LDG-G1-LINE-2', transactionGroupId: 'TXG-G1-ORIGINAL' },
    ];

    const reversalEntries = [
      { account: '5200', direction: 'CREDIT', amountCents: 30000 },
      { account: '4310', direction: 'DEBIT',  amountCents: 26400 },
      { account: '4530', direction: 'DEBIT',  amountCents:  3600 },
    ];

    const result = await svc.recordTransaction({
      transactionType: 'reversal_g1',
      engagementId: 'ENG-TEST-REV',
      reconciliationKey: 'reversal:TXG-G1-ORIGINAL',
      decidedBy: 'USR-FOUNDER',
      metadata: {
        reversalOf: 'TXG-G1-ORIGINAL',
        reversalReason: 'Encaissement erroné corrigé par test',
      },
      entries: reversalEntries,
      repositories: repos,
    });

    assert(result.balanced === true, 'Reversal doit être équilibré');
    assert(result.statusHistoryWritten === true, 'statusHistory doit être écrit pour un reversal');
    // 2 lignes originales marquées REVERSED + 3 nouvelles lignes REVERSAL_OF = 5
    assert(result.statusTransitions.length === 5,
      `5 transitions attendues, reçu ${result.statusTransitions.length}`);
  });

  await test('T-20 : DR ≠ CR → BLOQUÉ (LOI LEDGER-02)', async () => {
    const repos = makeMockRepositories();
    await assertThrowsAsync(
      () => svc.recordTransaction({
        transactionType: 'encaissement_depot',
        reconciliationKey: 'journal:TEST-DESEQUILIBRE',
        entries: [
          { account: '5200', direction: 'DEBIT',  amountCents: 30000 },
          { account: '4310', direction: 'CREDIT', amountCents: 25000 }, // 1000 de moins → déséquilibre
        ],
        repositories: repos,
      }),
      'FINANCIAL_LEDGER_IMBALANCE'
    );
  });
}

// ══════════════════════════════════════════════════════════════
// SUITE 6 — Vérifications structurelles
// ══════════════════════════════════════════════════════════════
async function suiteStructural() {
  console.log('\n  — Structurel : VALID_ACCOUNTS + LedgerRepository —');

  await test('T-19 : VALID_ACCOUNTS contient 6690 (D-060-B)', () => {
    assert(svc.VALID_ACCOUNTS.has('6690'), '6690 absent de VALID_ACCOUNTS');
  });

  await test('T-19b : FISCAL_LIABILITY_ACCOUNTS contient 4410 et 4420', () => {
    assert(svc.FISCAL_LIABILITY_ACCOUNTS.has('4410'), '4410 absent de FISCAL_LIABILITY_ACCOUNTS');
    assert(svc.FISCAL_LIABILITY_ACCOUNTS.has('4420'), '4420 absent de FISCAL_LIABILITY_ACCOUNTS');
  });

  await test('T-19c : VALID_6690_INTERVENTION_TYPES contient les 3 valeurs autorisées', () => {
    const expected = [
      'PRINCIPAL_TAX_REGULARIZATION_PILOT',
      'PRINCIPAL_TAX_REGULARIZATION_ERROR',
      'PRINCIPAL_TAX_REGULARIZATION_AUDIT',
    ];
    for (const v of expected) {
      assert(
        svc.VALID_6690_INTERVENTION_TYPES.has(v),
        `${v} absent de VALID_6690_INTERVENTION_TYPES`
      );
    }
  });

  await test('T-21 : LedgerRepository exporte findByTransactionGroupId', () => {
    assert(
      typeof LedgerRepo.findByTransactionGroupId === 'function',
      'findByTransactionGroupId absent de LedgerRepository'
    );
  });

  await test('T-21b : FinancialLedgerService exporte detectReversal et writeStatusHistoryForReversal', () => {
    assert(typeof svc.detectReversal === 'function',               'detectReversal non exporté');
    assert(typeof svc.writeStatusHistoryForReversal === 'function', 'writeStatusHistoryForReversal non exporté');
    assert(typeof svc.resolveReconciliationKey === 'function',      'resolveReconciliationKey non exporté');
    assert(typeof svc.validateAccount6690 === 'function',          'validateAccount6690 non exporté');
  });
}

// ══════════════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════════════
async function main() {
  console.log('LEDGER-V4-01 — Tests post-Pierre de Rosette (D-038-B, D-060-B/C/E)');
  console.log('═══════════════════════════════════════════════════════════════════');

  await suiteReconciliationKey();
  await suiteAccount6690Guard();
  await suiteDetectReversal();
  await suiteWriteStatusHistory();
  await suiteIntegration();
  await suiteStructural();

  console.log('\n' + '─'.repeat(67));
  console.log(`  Résultat : ${passed} passés · ${failed} échoués`);

  if (failed === 0) {
    console.log('  ✓ TOUS LES TESTS PASSENT — LedgerCodeMap V4 validé');
  } else {
    console.log('  ✗ ÉCHECS DÉTECTÉS — corriger avant déploiement');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('\n ❌ ERREUR INATTENDUE :', err.message);
  console.error(err.stack);
  process.exit(1);
});