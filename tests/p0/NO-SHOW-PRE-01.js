/**
 * MICRO RAVE V3 — Test P0 : NO-SHOW-PRE-01
 * ============================================================
 * Vérifie NoShowGuard pour les deux transitions :
 *   sots_window_closed → no_show    (confirmation absence)
 *   no_show → refunded              (déclenchement remboursement)
 *
 * Couverture sots_window_closed → no_show :
 *   - triggerSource invalide → bloqué (GREFFIER-01)
 *   - triggerSource ADMIN sans adminActionRecordId → bloqué
 *   - SOTSSubmission présente → bloqué (pas un no-show)
 *   - contractSnapshotPhase2 absent → bloqué
 *   - cachetBrutFinalCents invalide → bloqué
 *   - Chemin nominal SCHEDULER → DecisionRecord créé
 *   - Chemin nominal ADMIN → DecisionRecord créé
 *   - DecisionRecord contient impact financier LOI NO-SHOW-01
 *   - cachet_net_final = brut − commission (CT-014)
 *
 * Couverture no_show → refunded :
 *   - Guard mismatch → bloqué
 *   - DecisionRecord absent → bloqué
 *   - DecisionRecord mauvais type → bloqué
 *   - DecisionRecord engagementId mismatch → bloqué
 *   - payerUserId absent → bloqué
 *   - Montant incohérent → bloqué
 *   - Chemin nominal → refundInstruction créée
 *   - refundInstruction contient ledgerEntries
 *
 * Source : LOI NO-SHOW-01 · D-041 · D-044 · D-147 · CT-014 · GREFFIER-01
 * ============================================================
 */

'use strict';

const { validate } = require('../../src/core/guards/NoShowGuard');

let passed = 0;
let failed = 0;

const engagementId = 'ENG-AAA111-BBB222';
const actor        = 'USR-TEST01-ACTOR1';
const repositories = {};

// ContractSnapshot phase 2 nominal
// cachetBrutFinal=30_000, commission=2_700(9%), net=27_300
const nominalSnapshot = {
  cachetBrutFinalCents: 30_000,
  commissionMrCents:    2_700,
  talentUserId:         'USR-T01-TALENT01',
  tauxPpm:              90_000,
};

async function testAsync(name, fn) {
  try {
    await fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (err) {
    console.log(`✗ ${name}`);
    console.log(`  → ${err.message}`);
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

console.log('═══════════════════════════════════════════════');
console.log('Test P0 : NO-SHOW-PRE-01');
console.log('NoShowGuard — LOI NO-SHOW-01 · D-147 · CT-014');
console.log('═══════════════════════════════════════════════\n');

async function run() {

  // ════════════════════════════════════════════════
  // PARTIE 1 — sots_window_closed → no_show
  // ════════════════════════════════════════════════
  console.log('─── sots_window_closed → no_show ────────────────');

  await testAsync('GUARD_MISMATCH : transition non couverte → bloqué', async () => {
    const r = await validate({ engagementId, currentState: 'event_completed', targetState: 'no_show', actor, context: {}, repositories });
    assert(!r.passed && r.reason.includes('GUARD_MISMATCH'), `Mauvaise raison: ${r.reason}`);
  });

  await testAsync('GREFFIER-01 : triggerSource absent → bloqué', async () => {
    const r = await validate({ engagementId, currentState: 'sots_window_closed', targetState: 'no_show', actor, context: { contractSnapshotPhase2: nominalSnapshot }, repositories });
    assert(!r.passed && r.reason.includes('NO_SHOW_TRIGGER_INVALID'), `Mauvaise raison: ${r.reason}`);
  });

  await testAsync('GREFFIER-01 : triggerSource invalide → bloqué', async () => {
    const r = await validate({ engagementId, currentState: 'sots_window_closed', targetState: 'no_show', actor, context: { triggerSource: 'MANUAL', contractSnapshotPhase2: nominalSnapshot }, repositories });
    assert(!r.passed && r.reason.includes('NO_SHOW_TRIGGER_INVALID'), `Mauvaise raison: ${r.reason}`);
  });

  await testAsync('GREFFIER-01 : triggerSource ADMIN sans adminActionRecordId → bloqué', async () => {
    const r = await validate({ engagementId, currentState: 'sots_window_closed', targetState: 'no_show', actor, context: { triggerSource: 'ADMIN', contractSnapshotPhase2: nominalSnapshot }, repositories });
    assert(!r.passed && r.reason.includes('NO_SHOW_ADMIN_RECORD_MISSING'), `Mauvaise raison: ${r.reason}`);
  });

  await testAsync('SOTSSubmission présente → bloqué (talent présent, pas no-show)', async () => {
    const r = await validate({ engagementId, currentState: 'sots_window_closed', targetState: 'no_show', actor, context: { triggerSource: 'SCHEDULER', sotsSubmission: { id: 'SOTS-001' }, contractSnapshotPhase2: nominalSnapshot }, repositories });
    assert(!r.passed && r.reason.includes('NO_SHOW_SOTS_PRESENT'), `Mauvaise raison: ${r.reason}`);
  });

  await testAsync('contractSnapshotPhase2 absent → bloqué', async () => {
    const r = await validate({ engagementId, currentState: 'sots_window_closed', targetState: 'no_show', actor, context: { triggerSource: 'SCHEDULER' }, repositories });
    assert(!r.passed && r.reason.includes('NO_SHOW_MISSING_SNAPSHOT'), `Mauvaise raison: ${r.reason}`);
  });

  await testAsync('cachetBrutFinalCents invalide (0) → bloqué', async () => {
    const r = await validate({ engagementId, currentState: 'sots_window_closed', targetState: 'no_show', actor, context: { triggerSource: 'SCHEDULER', contractSnapshotPhase2: { ...nominalSnapshot, cachetBrutFinalCents: 0 } }, repositories });
    assert(!r.passed && r.reason.includes('NO_SHOW_INVALID_AMOUNT'), `Mauvaise raison: ${r.reason}`);
  });

  await testAsync('NOMINAL SCHEDULER : DecisionRecord NO_SHOW_CONFIRMED créé', async () => {
    const r = await validate({ engagementId, currentState: 'sots_window_closed', targetState: 'no_show', actor, context: { triggerSource: 'SCHEDULER', contractSnapshotPhase2: nominalSnapshot }, repositories });
    assert(r.passed, `Devrait passer: ${r.reason}`);
    assert(r.decisionRecord, 'decisionRecord absent du résultat');
    assert(r.decisionRecord.type === 'NO_SHOW_CONFIRMED', `type incorrect: ${r.decisionRecord.type}`);
    assert(r.decisionRecord.engagementId === engagementId, 'engagementId incorrect dans decisionRecord');
    assert(r.decisionRecord.triggerSource === 'SCHEDULER', 'triggerSource incorrect');
    assert(r.decisionRecord.systemId.startsWith('ADM-'), `systemId doit commencer par ADM-: ${r.decisionRecord.systemId}`);
  });

  await testAsync('NOMINAL SCHEDULER : LOI NO-SHOW-01 — talent=0$, MR conserve commission', async () => {
    const r = await validate({ engagementId, currentState: 'sots_window_closed', targetState: 'no_show', actor, context: { triggerSource: 'SCHEDULER', contractSnapshotPhase2: nominalSnapshot }, repositories });
    assert(r.passed, `Devrait passer: ${r.reason}`);
    assert(r.decisionRecord.financialImpact.talentPaymentCents === 0, 'talent doit recevoir 0$');
    assert(r.decisionRecord.financialImpact.mrCommissionRetainedCents === 2_700, `commission conservée: ${r.decisionRecord.financialImpact.mrCommissionRetainedCents}`);
    assert(r.decisionRecord.financialImpact.organizerRefundCents === 27_300, `remboursement organisateur: ${r.decisionRecord.financialImpact.organizerRefundCents}`);
  });

  await testAsync('CT-014 : cachet_net_final = brut − commission (base ContractSnapshot phase 2)', async () => {
    const r = await validate({ engagementId, currentState: 'sots_window_closed', targetState: 'no_show', actor, context: { triggerSource: 'SCHEDULER', contractSnapshotPhase2: nominalSnapshot }, repositories });
    assert(r.passed, `Devrait passer: ${r.reason}`);
    const net = r.decisionRecord.financialImpact.cachetNetFinalCents;
    assert(net === 30_000 - 2_700, `cachet_net_final=${net}, attendu 27_300`);
    assert(r.decisionRecord.financialImpact.basis === 'CONTRACT_SNAPSHOT_PHASE_2_WORM_W2', 'basis doit référencer phase 2');
  });

  await testAsync('NOMINAL ADMIN : adminActionRecordId présent → passé', async () => {
    const r = await validate({ engagementId, currentState: 'sots_window_closed', targetState: 'no_show', actor, context: { triggerSource: 'ADMIN', adminActionRecordId: 'ADM-001-ADMIN001', contractSnapshotPhase2: nominalSnapshot }, repositories });
    assert(r.passed, `ADMIN devrait passer: ${r.reason}`);
    assert(r.decisionRecord.triggerSource === 'ADMIN', 'triggerSource doit être ADMIN');
    assert(r.decisionRecord.adminActionRecordId === 'ADM-001-ADMIN001', 'adminActionRecordId incorrect');
  });

  await testAsync('ReputationRecord : impact réputationnel présent dans DecisionRecord', async () => {
    const r = await validate({ engagementId, currentState: 'sots_window_closed', targetState: 'no_show', actor, context: { triggerSource: 'SCHEDULER', contractSnapshotPhase2: nominalSnapshot }, repositories });
    assert(r.passed, `Devrait passer: ${r.reason}`);
    assert(r.decisionRecord.reputationalImpact, 'reputationalImpact absent');
    assert(r.decisionRecord.reputationalImpact.entry === 'NO_SHOW_CONFIRMED', 'reputationalImpact.entry incorrect');
    assert(r.decisionRecord.reputationalImpact.wormLevel === 'W1', 'wormLevel doit être W1');
  });

  // ════════════════════════════════════════════════
  // PARTIE 2 — no_show → refunded
  // ════════════════════════════════════════════════
  console.log('\n─── no_show → refunded ──────────────────────────');

  // Construire un DecisionRecord nominal pour les tests
  const nominalDecisionRecord = {
    systemId:    'ADM-TEST01-DEC001',
    type:        'NO_SHOW_CONFIRMED',
    engagementId,
    financialImpact: {
      organizerRefundCents: 27_300,
      mrCommissionRetainedCents: 2_700,
    },
  };

  await testAsync('DecisionRecord absent → bloqué (GREFFIER-01)', async () => {
    const r = await validate({ engagementId, currentState: 'no_show', targetState: 'refunded', actor, context: { contractSnapshotPhase2: nominalSnapshot, payerUserId: 'USR-ORG01-TEST01' }, repositories });
    assert(!r.passed && r.reason.includes('NO_SHOW_REFUND_NO_DECISION'), `Mauvaise raison: ${r.reason}`);
  });

  await testAsync('DecisionRecord mauvais type → bloqué', async () => {
    const wrongRecord = { ...nominalDecisionRecord, type: 'DISPUTE_RESOLVED' };
    const r = await validate({ engagementId, currentState: 'no_show', targetState: 'refunded', actor, context: { decisionRecord: wrongRecord, contractSnapshotPhase2: nominalSnapshot, payerUserId: 'USR-ORG01-TEST01' }, repositories });
    assert(!r.passed && r.reason.includes('NO_SHOW_WRONG_DECISION_TYPE'), `Mauvaise raison: ${r.reason}`);
  });

  await testAsync('DecisionRecord engagementId mismatch → bloqué', async () => {
    const mismatchRecord = { ...nominalDecisionRecord, engagementId: 'ENG-WRONG1-WRONG2' };
    const r = await validate({ engagementId, currentState: 'no_show', targetState: 'refunded', actor, context: { decisionRecord: mismatchRecord, contractSnapshotPhase2: nominalSnapshot, payerUserId: 'USR-ORG01-TEST01' }, repositories });
    assert(!r.passed && r.reason.includes('NO_SHOW_DECISION_MISMATCH'), `Mauvaise raison: ${r.reason}`);
  });

  await testAsync('payerUserId absent → bloqué', async () => {
    const r = await validate({ engagementId, currentState: 'no_show', targetState: 'refunded', actor, context: { decisionRecord: nominalDecisionRecord, contractSnapshotPhase2: nominalSnapshot }, repositories });
    assert(!r.passed && r.reason.includes('NO_SHOW_REFUND_MISSING_PAYER'), `Mauvaise raison: ${r.reason}`);
  });

  await testAsync('Montant DecisionRecord incohérent avec snapshot → bloqué', async () => {
    const wrongAmountRecord = { ...nominalDecisionRecord, financialImpact: { ...nominalDecisionRecord.financialImpact, organizerRefundCents: 99_999 } };
    const r = await validate({ engagementId, currentState: 'no_show', targetState: 'refunded', actor, context: { decisionRecord: wrongAmountRecord, contractSnapshotPhase2: nominalSnapshot, payerUserId: 'USR-ORG01-TEST01' }, repositories });
    assert(!r.passed && r.reason.includes('NO_SHOW_REFUND_AMOUNT_MISMATCH'), `Mauvaise raison: ${r.reason}`);
  });

  await testAsync('NOMINAL : refundInstruction créée avec les bons montants', async () => {
    const r = await validate({ engagementId, currentState: 'no_show', targetState: 'refunded', actor, context: { decisionRecord: nominalDecisionRecord, contractSnapshotPhase2: nominalSnapshot, payerUserId: 'USR-ORG01-TEST01' }, repositories });
    assert(r.passed, `Devrait passer: ${r.reason}`);
    assert(r.refundInstruction, 'refundInstruction absent');
    assert(r.refundInstruction.type === 'NO_SHOW_REFUND', `type incorrect: ${r.refundInstruction.type}`);
    assert(r.refundInstruction.refundAmountCents === 27_300, `refundAmountCents: ${r.refundInstruction.refundAmountCents}`);
    assert(r.refundInstruction.mrCommissionCents === 2_700, `mrCommissionCents: ${r.refundInstruction.mrCommissionCents}`);
    assert(r.refundInstruction.talentPaymentCents === 0, 'talent doit recevoir 0$');
    assert(r.refundInstruction.payerUserId === 'USR-ORG01-TEST01', 'payerUserId incorrect');
    assert(r.refundInstruction.decisionRecordId === 'ADM-TEST01-DEC001', 'decisionRecordId incorrect');
    assert(r.refundInstruction.systemId.startsWith('PAY-'), `systemId doit commencer par PAY-: ${r.refundInstruction.systemId}`);
  });

  await testAsync('NOMINAL : ledgerEntries contient les 3 écritures comptables', async () => {
    const r = await validate({ engagementId, currentState: 'no_show', targetState: 'refunded', actor, context: { decisionRecord: nominalDecisionRecord, contractSnapshotPhase2: nominalSnapshot, payerUserId: 'USR-ORG01-TEST01' }, repositories });
    assert(r.passed, `Devrait passer: ${r.reason}`);
    assert(Array.isArray(r.refundInstruction.ledgerEntries), 'ledgerEntries doit être un tableau');
    assert(r.refundInstruction.ledgerEntries.length === 3, `3 écritures attendues, ${r.refundInstruction.ledgerEntries.length} présentes`);
    const accounts = r.refundInstruction.ledgerEntries.map(e => e.account);
    assert(accounts.includes('4310'), 'Compte 4310 absent (dette talent)');
    assert(accounts.includes('4530'), 'Compte 4530 absent (commission MR)');
    assert(accounts.includes('4320'), 'Compte 4320 absent (remboursement organisateur)');
  });

  // ── Résultat ──────────────────────────────────────────────
  const total = passed + failed;
  console.log(`\n═══════════════════════════════════════════════`);
  console.log(`Résultat : ${passed} PASSED / ${failed} FAILED (${total} tests)`);

  if (failed === 0) {
    console.log('NO-SHOW-PRE-01 : ✓ PASSED');
    console.log('\nPROCHAINE ÉTAPE :');
    console.log('  Câbler NoShowGuard dans transitionEngagement.js');
    console.log('  → remplacer le placeholder case "NoShowGuard"');
  } else {
    console.log('NO-SHOW-PRE-01 : ✗ FAILED — corriger avant de continuer');
    process.exit(1);
  }
  console.log('═══════════════════════════════════════════════');
}

run();