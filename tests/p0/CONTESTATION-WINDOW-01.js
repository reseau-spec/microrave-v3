/**
 * MICRO RAVE V3 — Test P0 : CONTESTATION-WINDOW-01
 * ============================================================
 * Vérifie ContestationWindowGuard et LedgerInvariantGuard.
 * Test autosuffisant — aucune database requise (mock PolicyConfig).
 *
 * Couverture ContestationWindowGuard :
 *   - Précondition repositories
 *   - Config DB manquante → fail-closed
 *   - État source invalide
 *   - Chemin nominal : schedulerTask créé avec dueAt correct
 *   - dueAt = maintenant + contestationWindowDurationHours
 *   - schedulerTask.taskType et targetTransition corrects
 *
 * Couverture LedgerInvariantGuard :
 *   - Guard mismatch (transition non couverte)
 *   - Snapshot absent
 *   - prixVenduClientCents invalide
 *   - Waterfall vide
 *   - Entrée waterfall invalide (talentNetCents négatif)
 *   - LOI LEDGER-02 : résidu > tolérance → bloqué
 *   - LOI LEDGER-02 : résidu = 0 → passé
 *   - LOI LEDGER-02 : résidu = 1 (tolérée) → passé avec roundingNote
 *   - Cohérence interne waterfall (cachetBrutFinalCents)
 *   - Chemin nominal multi-talent
 *
 * Source : D-019-B · LOI LEDGER-02 · OS V14 · Actions 3 + 5 Audit Nobel-Licorne
 * ============================================================
 */

'use strict';

const { validate: validateContestationWindow } = require('../../src/core/guards/ContestationWindowGuard');
const { validate: validateLedger }             = require('../../src/core/guards/LedgerInvariantGuard');

let passed = 0;
let failed = 0;

// ── Mock PolicyConfigRepository ───────────────────────────────
const mockPolicyConfig = {
  async getConfig(key) {
    const db = { contestationWindowDurationHours: '24' };
    if (!(key in db)) throw new Error(`POLICY_CONFIG_MISSING: "${key}" absent`);
    return db[key];
  },
};

const repositories   = { policyConfig: mockPolicyConfig };
const engagementId   = 'ENG-AAA111-BBB222';
const actor          = 'USR-TEST01-ACTOR1';

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

// ── Waterfall nominal (2 talents, somme exacte) ──────────────
// prixVenduClient = 50_000 cents
// Talent A : brut=30_000, commission=2_700(9%), net=27_300
// Talent B : brut=20_000, commission=1_200(6%), net=18_800
// total nets=46_100, total comm=3_900, total=50_000, rounding=0
const nominalWaterfall = [
  { talentUserId: 'USR-T01-TALENT01', cachetBrutFinalCents: 30_000, talentNetCents: 27_300, commissionMrCents: 2_700 },
  { talentUserId: 'USR-T01-TALENT02', cachetBrutFinalCents: 20_000, talentNetCents: 18_800, commissionMrCents: 1_200 },
];
const nominalSnapshot = {
  prixVenduClientCents: 50_000,
  waterfall: nominalWaterfall,
  cachetBrutCents: 50_000,
  talentUserId: 'USR-T01-TALENT01',
};

console.log('═══════════════════════════════════════════════');
console.log('Test P0 : CONTESTATION-WINDOW-01');
console.log('ContestationWindowGuard + LedgerInvariantGuard');
console.log('═══════════════════════════════════════════════\n');

async function run() {

  // ════════════════════════════════════════════════
  // PARTIE 1 — ContestationWindowGuard
  // ════════════════════════════════════════════════
  console.log('─── ContestationWindowGuard ─────────────────────');

  await testAsync('PRECOND : repositories.policyConfig manquant → échec explicite', async () => {
    const r = await validateContestationWindow({ engagementId, currentState: 'sots_window_closed', targetState: 'contestation_window', actor, context: {}, repositories: {} });
    assert(!r.passed && r.reason.includes('GUARD_CONFIG_ERROR'), `Mauvaise raison: ${r.reason}`);
  });

  await testAsync('PRECOND : config DB manquante → POLICY_CONFIG_MISSING', async () => {
    const badRepo = { policyConfig: { async getConfig() { throw new Error('POLICY_CONFIG_MISSING'); } } };
    const r = await validateContestationWindow({ engagementId, currentState: 'sots_window_closed', targetState: 'contestation_window', actor, context: {}, repositories: badRepo });
    assert(!r.passed && r.reason.includes('POLICY_CONFIG_MISSING'), `Mauvaise raison: ${r.reason}`);
  });

  await testAsync('STATE_MISMATCH : état source invalide → bloqué', async () => {
    const r = await validateContestationWindow({ engagementId, currentState: 'event_completed', targetState: 'contestation_window', actor, context: {}, repositories });
    assert(!r.passed && r.reason.includes('STATE_MISMATCH'), `Mauvaise raison: ${r.reason}`);
  });

  await testAsync('NOMINAL : schedulerTask créé avec les bons champs', async () => {
    const before = Date.now();
    const r = await validateContestationWindow({ engagementId, currentState: 'sots_window_closed', targetState: 'contestation_window', actor, context: {}, repositories });
    const after = Date.now();
    assert(r.passed, `Devrait passer: ${r.reason}`);
    assert(r.schedulerTask, 'schedulerTask absent du résultat');
    assert(r.schedulerTask.systemId.startsWith('SCH-'), `systemId doit commencer par SCH-: ${r.schedulerTask.systemId}`);
    assert(r.schedulerTask.engagementId === engagementId, 'engagementId incorrect dans schedulerTask');
    assert(r.schedulerTask.taskType === 'CONTESTATION_WINDOW_EXPIRATION', `taskType incorrect: ${r.schedulerTask.taskType}`);
    assert(r.schedulerTask.targetTransition === 'contestation_window->payable', `targetTransition incorrect: ${r.schedulerTask.targetTransition}`);
    assert(r.schedulerTask.transitionReason === 'CONTESTATION_WINDOW_EXPIRED', `transitionReason incorrect`);
    assert(r.schedulerTask.status === 'pending', `status doit être pending: ${r.schedulerTask.status}`);
    assert(r.schedulerTask.durationHours === 24, `durationHours doit être 24: ${r.schedulerTask.durationHours}`);
    assert(r.schedulerTask.createdByActor === actor, 'createdByActor incorrect');
  });

  await testAsync('NOMINAL : dueAt = openedAt + 24h (±2s tolérance)', async () => {
    const r = await validateContestationWindow({ engagementId, currentState: 'sots_window_closed', targetState: 'contestation_window', actor, context: {}, repositories });
    assert(r.passed, `Devrait passer: ${r.reason}`);
    const openedMs = new Date(r.schedulerTask.openedAt).getTime();
    const dueMs    = new Date(r.schedulerTask.dueAt).getTime();
    const diff     = dueMs - openedMs;
    const expected = 24 * 60 * 60 * 1_000;
    assert(Math.abs(diff - expected) < 2_000, `dueAt incorrect: écart ${diff - expected}ms vs attendu ${expected}ms`);
  });

  await testAsync('NOMINAL : audit contient engagementId et taskSystemId', async () => {
    const r = await validateContestationWindow({ engagementId, currentState: 'sots_window_closed', targetState: 'contestation_window', actor, context: {}, repositories });
    assert(r.audit.engagementId === engagementId, 'audit.engagementId absent');
    assert(r.audit.taskSystemId === r.schedulerTask.systemId, 'audit.taskSystemId ne correspond pas');
    assert(r.audit.contestationWindowDurationHours === 24, 'audit.contestationWindowDurationHours incorrect');
  });

  // ════════════════════════════════════════════════
  // PARTIE 2 — LedgerInvariantGuard
  // ════════════════════════════════════════════════
  console.log('\n─── LedgerInvariantGuard ─────────────────────────');

  await testAsync('GUARD_MISMATCH : transition non couverte → bloqué', async () => {
    const r = await validateLedger({ engagementId, currentState: 'event_sealed', targetState: 'performed', actor, context: { contractSnapshotPhase2: nominalSnapshot }, repositories });
    assert(!r.passed && r.reason.includes('GUARD_MISMATCH'), `Mauvaise raison: ${r.reason}`);
  });

  await testAsync('LEDGER_MISSING_SNAPSHOT : snapshot absent → bloqué', async () => {
    const r = await validateLedger({ engagementId, currentState: 'contestation_window', targetState: 'payable', actor, context: {}, repositories });
    assert(!r.passed && r.reason.includes('LEDGER_MISSING_SNAPSHOT'), `Mauvaise raison: ${r.reason}`);
  });

  await testAsync('LEDGER_INVALID_PRICE : prixVenduClientCents = 0 → bloqué', async () => {
    const r = await validateLedger({ engagementId, currentState: 'payable', targetState: 'settled', actor, context: { contractSnapshotPhase2: { ...nominalSnapshot, prixVenduClientCents: 0 } }, repositories });
    assert(!r.passed && r.reason.includes('LEDGER_INVALID_PRICE'), `Mauvaise raison: ${r.reason}`);
  });

  await testAsync('LEDGER_EMPTY_WATERFALL : waterfall vide → bloqué', async () => {
    const r = await validateLedger({ engagementId, currentState: 'payable', targetState: 'settled', actor, context: { contractSnapshotPhase2: { ...nominalSnapshot, waterfall: [] } }, repositories });
    assert(!r.passed && r.reason.includes('LEDGER_EMPTY_WATERFALL'), `Mauvaise raison: ${r.reason}`);
  });

  await testAsync('LEDGER_ENTRY_INVALID : talentNetCents négatif → bloqué', async () => {
    const badWaterfall = [{ talentUserId: 'USR-T01-TALENT01', talentNetCents: -100, commissionMrCents: 500 }];
    const r = await validateLedger({ engagementId, currentState: 'payable', targetState: 'settled', actor, context: { contractSnapshotPhase2: { prixVenduClientCents: 400, waterfall: badWaterfall } }, repositories });
    assert(!r.passed && r.reason.includes('LEDGER_ENTRY_INVALID'), `Mauvaise raison: ${r.reason}`);
  });

  await testAsync('LEDGER_INVARIANT_VIOLATED : résidu trop grand → bloqué', async () => {
    // 2 talents, résidu de 5 cents → dépasse tolérance de 2
    const badWaterfall = [
      { talentUserId: 'USR-T01-TALENT01', talentNetCents: 27_000, commissionMrCents: 2_700 },
      { talentUserId: 'USR-T01-TALENT02', talentNetCents: 15_295, commissionMrCents: 1_000 },
    ];
    // total = 27_000 + 2_700 + 15_295 + 1_000 = 45_995, prix = 50_000, résidu = 4_005 >> 2
    const r = await validateLedger({ engagementId, currentState: 'payable', targetState: 'settled', actor, context: { contractSnapshotPhase2: { prixVenduClientCents: 50_000, waterfall: badWaterfall } }, repositories });
    assert(!r.passed && r.reason.includes('LEDGER_INVARIANT_VIOLATED'), `Mauvaise raison: ${r.reason}`);
  });

  await testAsync('NOMINAL : rounding = 0, invariant parfait → passé', async () => {
    const r = await validateLedger({ engagementId, currentState: 'contestation_window', targetState: 'payable', actor, context: { contractSnapshotPhase2: nominalSnapshot }, repositories });
    assert(r.passed, `Invariant 0 doit passer: ${r.reason}`);
    assert(r.audit.roundingCents === 0, `roundingCents devrait être 0: ${r.audit.roundingCents}`);
    assert(r.roundingNote === null, 'roundingNote devrait être null si rounding=0');
    assert(r.audit.invariantOk === true, 'audit.invariantOk devrait être true');
  });

  await testAsync('NOMINAL : rounding = 1 centime (toléré) → passé avec roundingNote', async () => {
    // 1 talent, prix=10_000, net=9_099, comm=900, rounding=1
    const waterfall1 = [{ talentUserId: 'USR-T01-TALENT01', talentNetCents: 9_099, commissionMrCents: 900 }];
    const r = await validateLedger({ engagementId, currentState: 'payable', targetState: 'settled', actor, context: { contractSnapshotPhase2: { prixVenduClientCents: 10_000, waterfall: waterfall1 } }, repositories });
    assert(r.passed, `Rounding 1 doit passer: ${r.reason}`);
    assert(r.roundingNote !== null, 'roundingNote devrait être non-null');
    assert(r.roundingNote.roundingCents === 1, `roundingNote.roundingCents devrait être 1: ${r.roundingNote?.roundingCents}`);
    assert(r.roundingNote.ledgerAccount === '6591', 'compte 6591 requis pour traçabilité D-070');
  });

  await testAsync('COHÉRENCE : cachetBrutFinalCents incohérent → bloqué', async () => {
    const badWaterfall = [
      { talentUserId: 'USR-T01-TALENT01', cachetBrutFinalCents: 30_000, talentNetCents: 28_000, commissionMrCents: 2_700 }, // 28_000 + 2_700 = 30_700 ≠ 30_000
    ];
    const r = await validateLedger({ engagementId, currentState: 'payable', targetState: 'settled', actor, context: { contractSnapshotPhase2: { prixVenduClientCents: 30_700, waterfall: badWaterfall } }, repositories });
    assert(!r.passed && r.reason.includes('LEDGER_WATERFALL_INCOHERENT'), `Mauvaise raison: ${r.reason}`);
  });

  await testAsync('NOMINAL payable→settled : invariant complet → passé', async () => {
    const r = await validateLedger({ engagementId, currentState: 'payable', targetState: 'settled', actor, context: { contractSnapshotPhase2: nominalSnapshot }, repositories });
    assert(r.passed, `payable→settled nominal doit passer: ${r.reason}`);
    assert(r.audit.lineupSize === 2, `lineupSize devrait être 2: ${r.audit.lineupSize}`);
    assert(r.audit.totalNets === 46_100, `totalNets: ${r.audit.totalNets}`);
    assert(r.audit.totalCommissions === 3_900, `totalCommissions: ${r.audit.totalCommissions}`);
  });

  // ── Résultat ──────────────────────────────────────────────
  const total = passed + failed;
  console.log(`\n═══════════════════════════════════════════════`);
  console.log(`Résultat : ${passed} PASSED / ${failed} FAILED (${total} tests)`);

  if (failed === 0) {
    console.log('CONTESTATION-WINDOW-01 : ✓ PASSED');
    console.log('\nPROCHAINE ÉTAPE :');
    console.log('  Câbler ContestationWindowGuard + LedgerInvariantGuard dans transitionEngagement.js');
  } else {
    console.log('CONTESTATION-WINDOW-01 : ✗ FAILED — corriger avant de continuer');
    process.exit(1);
  }
  console.log('═══════════════════════════════════════════════');
}

run();