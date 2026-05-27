/**
 * MICRO RAVE V3 — Test P0 : DEPOSIT-FAIL-01
 * ============================================================
 * Vérifie ArchiveWORMGuard pour les 9 chemins d'archivage (W3).
 *
 * Couverture :
 *   - Guard mismatch
 *   settled→archived       : GoNoGoDecisionRecord · ledgerBalanced
 *   refunded→archived      : refundExecuted · ledgerBalanced
 *   no_show_pre_event→archived [SC-NO-SHOW-PRE] : DecisionRecord · depositRefundExecuted
 *   deposit_failed→archived [SC-DEPOSIT-FAIL]   : stripeFailureConfirmed · noLedgerEntries
 *   cancelled_pre_deposit→archived : schedulerTasksCancelled
 *   cancelled_J30→archived : refundExecuted · ledgerBalanced
 *   cancelled_J7→archived  : payoutProrataExecuted · ledgerBalanced
 *   withdrawn→archived     : toujours passé (aucun fonds)
 *   partially_settled→archived [SC-08-PARTIEL] : disputeResolutionRecord · ledgerBalanced
 *   Vérification archiveRecord : systemId, wormLevel, archivePath
 *   SC-NO-SHOW-PRE : ledgerEntries présentes, talent=0$, MR=0$
 *
 * Source : OS V14 · SC-NO-SHOW-PRE · SC-DEPOSIT-FAIL · D-014 Moment 6
 * ============================================================
 */

'use strict';

import { validate } from '../../src/core/guards/ArchiveWORMGuard.js';
let passed = 0;
let failed = 0;

const engagementId = 'ENG-AAA111-BBB222';
const actor        = 'USR-TEST01-ACTOR1';
const repositories = {};

const nominalGoNoGo = {
  systemId:    'ADM-TEST01-GONOGO1',
  type:        'GO_NO_GO',
  decision:    'GO',
  engagementId,
};

const nominalDecisionRecord = {
  systemId:    'ADM-TEST01-DEC001',
  type:        'NO_SHOW_CONFIRMED',
  engagementId,
};

const nominalDisputeRecord = {
  systemId:                'ADM-TEST01-DISP01',
  type:                    'DISPUTE_RESOLVED_PARTIAL',
  deliveryRecognizedRatio: 0.5,
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
console.log('Test P0 : DEPOSIT-FAIL-01');
console.log('ArchiveWORMGuard — 9 chemins d\'archivage W3');
console.log('═══════════════════════════════════════════════\n');

async function run() {

  await testAsync('GUARD_MISMATCH : transition non couverte → bloqué', async () => {
    const r = await validate({ engagementId, currentState: 'event_sealed', targetState: 'archived', actor, context: {}, repositories });
    assert(!r.passed && r.reason.includes('GUARD_MISMATCH'), `Mauvaise raison: ${r.reason}`);
  });

  // ── settled → archived ────────────────────────────────────
  console.log('\n─── settled → archived ──────────────────────────');

  await testAsync('GoNoGoDecisionRecord absent → bloqué', async () => {
    const r = await validate({ engagementId, currentState: 'settled', targetState: 'archived', actor, context: { ledgerBalanced: true }, repositories });
    assert(!r.passed && r.reason.includes('ARCHIVE_MISSING_GONOGO'), `Mauvaise raison: ${r.reason}`);
  });

  await testAsync('GoNoGoDecisionRecord.decision = NO_GO → bloqué', async () => {
    const r = await validate({ engagementId, currentState: 'settled', targetState: 'archived', actor, context: { goNoGoDecisionRecord: { ...nominalGoNoGo, decision: 'NO_GO' }, ledgerBalanced: true }, repositories });
    assert(!r.passed && r.reason.includes('ARCHIVE_GONOGO_NOT_GO'), `Mauvaise raison: ${r.reason}`);
  });

  await testAsync('ledgerBalanced false → bloqué', async () => {
    const r = await validate({ engagementId, currentState: 'settled', targetState: 'archived', actor, context: { goNoGoDecisionRecord: nominalGoNoGo, ledgerBalanced: false }, repositories });
    assert(!r.passed && r.reason.includes('ARCHIVE_LEDGER_NOT_BALANCED'), `Mauvaise raison: ${r.reason}`);
  });

  await testAsync('NOMINAL : archiveRecord créé avec W3', async () => {
    const r = await validate({ engagementId, currentState: 'settled', targetState: 'archived', actor, context: { goNoGoDecisionRecord: nominalGoNoGo, ledgerBalanced: true }, repositories });
    assert(r.passed, `Devrait passer: ${r.reason}`);
    assert(r.archiveRecord.wormLevel === 'W3', `wormLevel doit être W3: ${r.archiveRecord.wormLevel}`);
    assert(r.archiveRecord.archivePath === 'settled->archived', `archivePath incorrect: ${r.archiveRecord.archivePath}`);
    assert(r.archiveRecord.systemId.startsWith('ADM-'), `systemId doit commencer par ADM-: ${r.archiveRecord.systemId}`);
    assert(r.archiveRecord.type === 'ARCHIVE_W3', `type incorrect: ${r.archiveRecord.type}`);
  });

  // ── refunded → archived ───────────────────────────────────
  console.log('\n─── refunded → archived ─────────────────────────');

  await testAsync('refundExecuted false → bloqué', async () => {
    const r = await validate({ engagementId, currentState: 'refunded', targetState: 'archived', actor, context: { ledgerBalanced: true }, repositories });
    assert(!r.passed && r.reason.includes('ARCHIVE_REFUND_NOT_EXECUTED'), `Mauvaise raison: ${r.reason}`);
  });

  await testAsync('NOMINAL : passé avec refundExecuted + ledgerBalanced', async () => {
    const r = await validate({ engagementId, currentState: 'refunded', targetState: 'archived', actor, context: { refundExecuted: true, ledgerBalanced: true }, repositories });
    assert(r.passed, `Devrait passer: ${r.reason}`);
    assert(r.archiveRecord.archivePath === 'refunded->archived', 'archivePath incorrect');
  });

  // ── no_show_pre_event → archived [SC-NO-SHOW-PRE] ─────────
  console.log('\n─── no_show_pre_event → archived [SC-NO-SHOW-PRE] ──');

  await testAsync('DecisionRecord absent → bloqué (GREFFIER-01)', async () => {
    const r = await validate({ engagementId, currentState: 'no_show_pre_event', targetState: 'archived', actor, context: { depositRefundExecuted: true, depositRefundAmountCents: 20_000 }, repositories });
    assert(!r.passed && r.reason.includes('ARCHIVE_NO_SHOW_PRE_NO_DECISION'), `Mauvaise raison: ${r.reason}`);
  });

  await testAsync('depositRefundExecuted false → bloqué', async () => {
    const r = await validate({ engagementId, currentState: 'no_show_pre_event', targetState: 'archived', actor, context: { decisionRecord: nominalDecisionRecord, depositRefundExecuted: false, depositRefundAmountCents: 20_000 }, repositories });
    assert(!r.passed && r.reason.includes('ARCHIVE_NO_SHOW_PRE_REFUND_MISSING'), `Mauvaise raison: ${r.reason}`);
  });

  await testAsync('NOMINAL SC-NO-SHOW-PRE : archiveRecord avec ledgerEntries Talent=0$ MR=0$', async () => {
    const r = await validate({ engagementId, currentState: 'no_show_pre_event', targetState: 'archived', actor, context: { decisionRecord: nominalDecisionRecord, depositRefundExecuted: true, depositRefundAmountCents: 20_000 }, repositories });
    assert(r.passed, `Devrait passer: ${r.reason}`);
    assert(r.archiveRecord.archivePath === 'no_show_pre_event->archived', 'archivePath incorrect');
    assert(r.archiveRecord.financialSummary.scenario === 'SC-NO-SHOW-PRE', 'scenario manquant');
    assert(r.archiveRecord.financialSummary.talentPaymentCents === 0, 'talent doit être 0$');
    assert(r.archiveRecord.financialSummary.mrCommissionCents === 0, 'MR doit être 0$ (SC-NO-SHOW-PRE)');
    assert(Array.isArray(r.archiveRecord.ledgerEntries), 'ledgerEntries absent');
    assert(r.archiveRecord.ledgerEntries.length === 3, `3 écritures attendues: ${r.archiveRecord.ledgerEntries.length}`);
    assert(r.audit.scenario === 'SC-NO-SHOW-PRE', 'audit.scenario incorrect');
  });

  // ── deposit_failed → archived [SC-DEPOSIT-FAIL] ───────────
  console.log('\n─── deposit_failed → archived [SC-DEPOSIT-FAIL] ──');

  await testAsync('stripeFailureConfirmed false → bloqué', async () => {
    const r = await validate({ engagementId, currentState: 'deposit_failed', targetState: 'archived', actor, context: { noLedgerEntries: true }, repositories });
    assert(!r.passed && r.reason.includes('ARCHIVE_DEPOSIT_FAIL_UNCONFIRMED'), `Mauvaise raison: ${r.reason}`);
  });

  await testAsync('noLedgerEntries false → bloqué (argent jamais capturé)', async () => {
    const r = await validate({ engagementId, currentState: 'deposit_failed', targetState: 'archived', actor, context: { stripeFailureConfirmed: true, noLedgerEntries: false }, repositories });
    assert(!r.passed && r.reason.includes('ARCHIVE_DEPOSIT_FAIL_LEDGER_EXISTS'), `Mauvaise raison: ${r.reason}`);
  });

  await testAsync('NOMINAL SC-DEPOSIT-FAIL : archiveRecord zéro fonds', async () => {
    const r = await validate({ engagementId, currentState: 'deposit_failed', targetState: 'archived', actor, context: { stripeFailureConfirmed: true, noLedgerEntries: true }, repositories });
    assert(r.passed, `Devrait passer: ${r.reason}`);
    assert(r.archiveRecord.financialSummary.talentPaymentCents === 0, 'talent=0$');
    assert(r.archiveRecord.financialSummary.mrCommissionCents === 0, 'MR=0$');
    assert(r.archiveRecord.financialSummary.scenario === 'SC-DEPOSIT-FAIL', 'scenario incorrect');
  });

  // ── cancelled_pre_deposit → archived ─────────────────────
  console.log('\n─── cancelled_pre_deposit → archived ────────────');

  await testAsync('schedulerTasksCancelled false → bloqué', async () => {
    const r = await validate({ engagementId, currentState: 'cancelled_pre_deposit', targetState: 'archived', actor, context: { schedulerTasksCancelled: false }, repositories });
    assert(!r.passed && r.reason.includes('ARCHIVE_CANCELLED_TASKS_PENDING'), `Mauvaise raison: ${r.reason}`);
  });

  await testAsync('NOMINAL : passé avec schedulerTasksCancelled=true', async () => {
    const r = await validate({ engagementId, currentState: 'cancelled_pre_deposit', targetState: 'archived', actor, context: { schedulerTasksCancelled: true }, repositories });
    assert(r.passed, `Devrait passer: ${r.reason}`);
    assert(r.archiveRecord.archivePath === 'cancelled_pre_deposit->archived', 'archivePath incorrect');
  });

  // ── cancelled_J30 → archived ─────────────────────────────
  console.log('\n─── cancelled_J30/J7 + withdrawn → archived ─────');

  await testAsync('cancelled_J30 : refundExecuted false → bloqué', async () => {
    const r = await validate({ engagementId, currentState: 'cancelled_J30', targetState: 'archived', actor, context: { ledgerBalanced: true }, repositories });
    assert(!r.passed && r.reason.includes('ARCHIVE_J30_REFUND_MISSING'), `Mauvaise raison: ${r.reason}`);
  });

  await testAsync('cancelled_J30 NOMINAL : passé', async () => {
    const r = await validate({ engagementId, currentState: 'cancelled_J30', targetState: 'archived', actor, context: { refundExecuted: true, ledgerBalanced: true }, repositories });
    assert(r.passed, `Devrait passer: ${r.reason}`);
  });

  await testAsync('cancelled_J7 : payoutProrataExecuted false → bloqué', async () => {
    const r = await validate({ engagementId, currentState: 'cancelled_J7', targetState: 'archived', actor, context: { ledgerBalanced: true }, repositories });
    assert(!r.passed && r.reason.includes('ARCHIVE_J7_PAYOUT_MISSING'), `Mauvaise raison: ${r.reason}`);
  });

  await testAsync('cancelled_J7 NOMINAL : passé', async () => {
    const r = await validate({ engagementId, currentState: 'cancelled_J7', targetState: 'archived', actor, context: { payoutProrataExecuted: true, ledgerBalanced: true }, repositories });
    assert(r.passed, `Devrait passer: ${r.reason}`);
  });

  await testAsync('withdrawn → archived : toujours passé (aucun fonds)', async () => {
    const r = await validate({ engagementId, currentState: 'withdrawn', targetState: 'archived', actor, context: {}, repositories });
    assert(r.passed, `withdrawn doit toujours passer: ${r.reason}`);
    assert(r.archiveRecord.archivePath === 'withdrawn->archived', 'archivePath incorrect');
  });

  // ── partially_settled → archived [SC-08-PARTIEL] ──────────
  console.log('\n─── partially_settled → archived [SC-08-PARTIEL] ─');

  await testAsync('disputeResolutionRecord absent → bloqué', async () => {
    const r = await validate({ engagementId, currentState: 'partially_settled', targetState: 'archived', actor, context: { ledgerBalanced: true }, repositories });
    assert(!r.passed && r.reason.includes('ARCHIVE_PARTIAL_NO_RESOLUTION'), `Mauvaise raison: ${r.reason}`);
  });

  await testAsync('ledgerBalanced false → bloqué', async () => {
    const r = await validate({ engagementId, currentState: 'partially_settled', targetState: 'archived', actor, context: { disputeResolutionRecord: nominalDisputeRecord, ledgerBalanced: false }, repositories });
    assert(!r.passed && r.reason.includes('ARCHIVE_PARTIAL_LEDGER_NOT_BALANCED'), `Mauvaise raison: ${r.reason}`);
  });

  await testAsync('NOMINAL SC-08-PARTIEL : archiveRecord avec deliveryRecognizedRatio', async () => {
    const r = await validate({ engagementId, currentState: 'partially_settled', targetState: 'archived', actor, context: { disputeResolutionRecord: nominalDisputeRecord, ledgerBalanced: true }, repositories });
    assert(r.passed, `Devrait passer: ${r.reason}`);
    assert(r.archiveRecord.financialSummary.scenario === 'SC-08-PARTIEL', 'scenario incorrect');
    assert(r.archiveRecord.financialSummary.deliveryRecognizedRatio === 0.5, 'deliveryRecognizedRatio incorrect');
    assert(r.audit.scenario === 'SC-08-PARTIEL', 'audit.scenario incorrect');
  });

  // ── Résultat ──────────────────────────────────────────────
  const total = passed + failed;
  console.log(`\n═══════════════════════════════════════════════`);
  console.log(`Résultat : ${passed} PASSED / ${failed} FAILED (${total} tests)`);

  if (failed === 0) {
    console.log('DEPOSIT-FAIL-01 : ✓ PASSED');
    console.log('\nPROCHAINE ÉTAPE :');
    console.log('  Câbler ArchiveWORMGuard dans transitionEngagement.js');
  } else {
    console.log('DEPOSIT-FAIL-01 : ✗ FAILED — corriger avant de continuer');
    process.exit(1);
  }
  console.log('═══════════════════════════════════════════════');
}

run();