/**
 * MICRO RAVE V3 — Test P0 : PRESENCEPROOF-01
 * ============================================================
 * Vérifie les 11 conditions de payout (D-075) du PresenceProofGuard.
 * Ce test est autosuffisant — aucune database requise.
 * Toutes les valeurs de seuil sont injectées via un mock PolicyConfigRepository.
 *
 * Couverture :
 *   C-01 : État source éligible + SoloFounderOverride
 *   C-02 : ContractSnapshot phase 2 présent
 *   C-03 : checkedInAt non-null
 *   C-04 : Distance GPS ≤ maxDistancePolicy
 *   C-05 : Durée ≥ max(floor, durée_contrat × ratio)
 *   C-06 : Validation organisateur ou expiration
 *   C-07 : SafetyReport bloquant
 *   C-08 : SOTSSubmission présente
 *   C-09 : Litige actif
 *   C-10 : Montant > 0
 *   C-11 : Idempotency SettlementInstruction
 *   OK   : Chemin nominal complet (contestation_window → payable)
 *   OK   : SoloFounderOverride (performed → payable)
 *   OK   : Durée ratio vs plancher absolu
 *
 * Source : D-075 · OS V14 · Action 1 Audit Nobel-Licorne
 * ============================================================
 */

'use strict';

const { validate } = require('../../src/core/guards/PresenceProofGuard');

let passed  = 0;
let failed  = 0;

// ── Mock PolicyConfigRepository ───────────────────────────────
// Simule la database avec les valeurs souveraines ratifiées (J1)
const mockPolicyConfig = {
  async getConfig(key) {
    const db = {
      maxDistancePolicy:       '500',
      minDurationFloorMinutes: '30',
      minDurationRatioPpm:     '950000',
    };
    if (!(key in db)) throw new Error(`POLICY_CONFIG_MISSING: "${key}" absent de la database mock`);
    return db[key];
  },
};

// ── Context nominal de base ───────────────────────────────────
// Toutes les conditions satisfaites — modifié au cas par cas dans chaque test
function nominalContext(overrides = {}) {
  return {
    transitionReason:        'CONTESTATION_WINDOW_EXPIRED',
    sessionPresence: {
      checkedInAt:       '2026-05-20T21:00:00Z',
      checkoutAt:        '2026-05-21T00:00:00Z',
      gpsDistanceMeters: 150,
      durationMinutes:   180,
    },
    contractSnapshotPhase2: {
      cachetBrutCents:   25_000,
      talentUserId:      'USR-TEST01-TALENT1',
      durationMinutes:   180,
    },
    isSelfOrganized:    false,
    organizerValidated: true,
    sotsSubmission:     { id: 'SOTS-TEST01-001' },
    activeSafetyReport: null,
    activeDispute:      null,
    settlementInstruction: null,
    ...overrides,
  };
}

const repositories = { policyConfig: mockPolicyConfig };

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
console.log('Test P0 : PRESENCEPROOF-01');
console.log('11 conditions D-075 + chemin nominal');
console.log('═══════════════════════════════════════════════\n');

async function run() {

  // ── Préconditions guards ──────────────────────────────────

  await testAsync('PRECOND : repositories.policyConfig manquant → échec explicite', async () => {
    const r = await validate({ engagementId: 'ENG-AAA111-BBB222', currentState: 'contestation_window', targetState: 'payable', actor: 'USR-TEST01-ACTOR1', context: nominalContext(), repositories: {} });
    assert(!r.passed, 'Devrait échouer sans policyConfig');
    assert(r.reason.includes('GUARD_CONFIG_ERROR'), `Mauvaise raison: ${r.reason}`);
  });

  await testAsync('PRECOND : config DB manquante → POLICY_CONFIG_MISSING', async () => {
    const badRepo = { policyConfig: { async getConfig() { throw new Error('POLICY_CONFIG_MISSING: absente'); } } };
    const r = await validate({ engagementId: 'ENG-AAA111-BBB222', currentState: 'contestation_window', targetState: 'payable', actor: 'USR-TEST01-ACTOR1', context: nominalContext(), repositories: badRepo });
    assert(!r.passed, 'Devrait échouer');
    assert(r.reason.includes('POLICY_CONFIG_MISSING'), `Mauvaise raison: ${r.reason}`);
  });

  // ── C-01 : État source ────────────────────────────────────

  await testAsync('C-01 : État source invalide → bloqué', async () => {
    const r = await validate({ engagementId: 'ENG-AAA111-BBB222', currentState: 'event_sealed', targetState: 'payable', actor: 'USR-TEST01-ACTOR1', context: nominalContext(), repositories });
    assert(!r.passed && r.reason.includes('C-01_INVALID_STATE'), `Mauvaise raison: ${r.reason}`);
  });

  await testAsync('C-01 : performed sans SOLO_FOUNDER_OVERRIDE → bloqué', async () => {
    const r = await validate({ engagementId: 'ENG-AAA111-BBB222', currentState: 'performed', targetState: 'payable', actor: 'USR-TEST01-ACTOR1', context: nominalContext({ transitionReason: 'CONTESTATION_WINDOW_EXPIRED' }), repositories });
    assert(!r.passed && r.reason.includes('C-01_OVERRIDE_REQUIRED'), `Mauvaise raison: ${r.reason}`);
  });

  // ── C-02 : ContractSnapshot ───────────────────────────────

  await testAsync('C-02 : contractSnapshotPhase2 absent → bloqué', async () => {
    const r = await validate({ engagementId: 'ENG-AAA111-BBB222', currentState: 'contestation_window', targetState: 'payable', actor: 'USR-TEST01-ACTOR1', context: nominalContext({ contractSnapshotPhase2: null }), repositories });
    assert(!r.passed && r.reason.includes('C-02_MISSING_SNAPSHOT'), `Mauvaise raison: ${r.reason}`);
  });

  await testAsync('C-02 : snapshot sans talentUserId → bloqué', async () => {
    const r = await validate({ engagementId: 'ENG-AAA111-BBB222', currentState: 'contestation_window', targetState: 'payable', actor: 'USR-TEST01-ACTOR1', context: nominalContext({ contractSnapshotPhase2: { cachetBrutCents: 25_000 } }), repositories });
    assert(!r.passed && r.reason.includes('C-02_SNAPSHOT_INCOMPLETE'), `Mauvaise raison: ${r.reason}`);
  });

  // ── C-03 : checkedInAt ────────────────────────────────────

  await testAsync('C-03 : sessionPresence absent → bloqué', async () => {
    const r = await validate({ engagementId: 'ENG-AAA111-BBB222', currentState: 'contestation_window', targetState: 'payable', actor: 'USR-TEST01-ACTOR1', context: nominalContext({ sessionPresence: null }), repositories });
    assert(!r.passed && r.reason.includes('C-03_NO_SESSION_PRESENCE'), `Mauvaise raison: ${r.reason}`);
  });

  await testAsync('C-03 : checkedInAt null → bloqué', async () => {
    const r = await validate({ engagementId: 'ENG-AAA111-BBB222', currentState: 'contestation_window', targetState: 'payable', actor: 'USR-TEST01-ACTOR1', context: nominalContext({ sessionPresence: { checkedInAt: null, gpsDistanceMeters: 100, durationMinutes: 60 } }), repositories });
    assert(!r.passed && r.reason.includes('C-03_NO_CHECKIN'), `Mauvaise raison: ${r.reason}`);
  });

  // ── C-04 : Distance GPS ───────────────────────────────────

  await testAsync('C-04 : GPS absent → bloqué', async () => {
    const ctx = nominalContext();
    ctx.sessionPresence = { checkedInAt: '2026-05-20T21:00:00Z', durationMinutes: 180 };
    const r = await validate({ engagementId: 'ENG-AAA111-BBB222', currentState: 'contestation_window', targetState: 'payable', actor: 'USR-TEST01-ACTOR1', context: ctx, repositories });
    assert(!r.passed && r.reason.includes('C-04_NO_GPS_DATA'), `Mauvaise raison: ${r.reason}`);
  });

  await testAsync('C-04 : GPS = 499m (sous seuil 500m) → passé', async () => {
    const ctx = nominalContext();
    ctx.sessionPresence.gpsDistanceMeters = 499;
    const r = await validate({ engagementId: 'ENG-AAA111-BBB222', currentState: 'contestation_window', targetState: 'payable', actor: 'USR-TEST01-ACTOR1', context: ctx, repositories });
    assert(r.passed, `Devrait passer à 499m: ${r.reason}`);
  });

  await testAsync('C-04 : GPS = 501m (dépasse seuil 500m) → bloqué', async () => {
    const ctx = nominalContext();
    ctx.sessionPresence.gpsDistanceMeters = 501;
    const r = await validate({ engagementId: 'ENG-AAA111-BBB222', currentState: 'contestation_window', targetState: 'payable', actor: 'USR-TEST01-ACTOR1', context: ctx, repositories });
    assert(!r.passed && r.reason.includes('C-04_GPS_TOO_FAR'), `Mauvaise raison: ${r.reason}`);
    assert(r.reason.includes('501'), `Doit mentionner la distance réelle: ${r.reason}`);
  });

  // ── C-05 : Durée de présence ──────────────────────────────

  await testAsync('C-05 : durée contractuelle connue — 95% = 171min, présence 170min → bloqué', async () => {
    // contrat 180min → 95% = 171min requis, présence 170min → bloqué
    const ctx = nominalContext();
    ctx.sessionPresence.durationMinutes = 170;
    ctx.contractSnapshotPhase2.durationMinutes = 180;
    const r = await validate({ engagementId: 'ENG-AAA111-BBB222', currentState: 'contestation_window', targetState: 'payable', actor: 'USR-TEST01-ACTOR1', context: ctx, repositories });
    assert(!r.passed && r.reason.includes('C-05_INSUFFICIENT_DURATION'), `Mauvaise raison: ${r.reason}`);
  });

  await testAsync('C-05 : durée contractuelle connue — 95% = 171min, présence 171min → passé', async () => {
    const ctx = nominalContext();
    ctx.sessionPresence.durationMinutes = 171;
    ctx.contractSnapshotPhase2.durationMinutes = 180;
    const r = await validate({ engagementId: 'ENG-AAA111-BBB222', currentState: 'contestation_window', targetState: 'payable', actor: 'USR-TEST01-ACTOR1', context: ctx, repositories });
    assert(r.passed, `Devrait passer: ${r.reason}`);
  });

  await testAsync('C-05 : durée contractuelle courte — plancher 30min s\'impose sur ratio', async () => {
    // contrat 20min → 95% = 19min, mais plancher = 30min → 30min requis
    const ctx = nominalContext();
    ctx.sessionPresence.durationMinutes = 25;
    ctx.contractSnapshotPhase2.durationMinutes = 20;
    const r = await validate({ engagementId: 'ENG-AAA111-BBB222', currentState: 'contestation_window', targetState: 'payable', actor: 'USR-TEST01-ACTOR1', context: ctx, repositories });
    assert(!r.passed && r.reason.includes('C-05_INSUFFICIENT_DURATION'), `Devrait être bloqué par le plancher: ${r.reason}`);
    assert(r.reason.includes('30'), `Doit mentionner le plancher 30min: ${r.reason}`);
  });

  await testAsync('C-05 : durée contractuelle absente — plancher 30min seul', async () => {
    const ctx = nominalContext();
    ctx.sessionPresence.durationMinutes = 29;
    ctx.contractSnapshotPhase2 = { cachetBrutCents: 25_000, talentUserId: 'USR-TEST01-TALENT1' }; // pas de durationMinutes
    const r = await validate({ engagementId: 'ENG-AAA111-BBB222', currentState: 'contestation_window', targetState: 'payable', actor: 'USR-TEST01-ACTOR1', context: ctx, repositories });
    assert(!r.passed && r.reason.includes('C-05_INSUFFICIENT_DURATION'), `Mauvaise raison: ${r.reason}`);
  });

  // ── C-06 : Validation organisateur ───────────────────────

  await testAsync('C-06 : pas de validation, pas isSelfOrganized, pas de raison valide → bloqué', async () => {
    const r = await validate({ engagementId: 'ENG-AAA111-BBB222', currentState: 'contestation_window', targetState: 'payable', actor: 'USR-TEST01-ACTOR1', context: nominalContext({ organizerValidated: false, isSelfOrganized: false, transitionReason: 'UNKNOWN_REASON' }), repositories });
    assert(!r.passed && r.reason.includes('C-06_NO_ORGANIZER_VALIDATION'), `Mauvaise raison: ${r.reason}`);
  });

  await testAsync('C-06 : isSelfOrganized=true → passé sans validation organisateur', async () => {
    const r = await validate({ engagementId: 'ENG-AAA111-BBB222', currentState: 'contestation_window', targetState: 'payable', actor: 'USR-TEST01-ACTOR1', context: nominalContext({ organizerValidated: false, isSelfOrganized: true, transitionReason: 'CONTESTATION_WINDOW_EXPIRED' }), repositories });
    assert(r.passed, `Devrait passer: ${r.reason}`);
  });

  // ── C-07 : SafetyReport ───────────────────────────────────

  await testAsync('C-07 : SafetyReport bloquant actif → bloqué', async () => {
    const r = await validate({ engagementId: 'ENG-AAA111-BBB222', currentState: 'contestation_window', targetState: 'payable', actor: 'USR-TEST01-ACTOR1', context: nominalContext({ activeSafetyReport: { id: 'SR-001', severity: 'BLOCKING' } }), repositories });
    assert(!r.passed && r.reason.includes('C-07_SAFETY_REPORT_BLOCKING'), `Mauvaise raison: ${r.reason}`);
  });

  // ── C-08 : SOTSSubmission ─────────────────────────────────

  await testAsync('C-08 : SOTSSubmission absente → bloqué', async () => {
    const r = await validate({ engagementId: 'ENG-AAA111-BBB222', currentState: 'contestation_window', targetState: 'payable', actor: 'USR-TEST01-ACTOR1', context: nominalContext({ sotsSubmission: null }), repositories });
    assert(!r.passed && r.reason.includes('C-08_NO_SOTS'), `Mauvaise raison: ${r.reason}`);
  });

  await testAsync('C-08 : SOLO_FOUNDER_OVERRIDE → SOTS non requis', async () => {
    const r = await validate({ engagementId: 'ENG-AAA111-BBB222', currentState: 'performed', targetState: 'payable', actor: 'USR-TEST01-ACTOR1', context: nominalContext({ sotsSubmission: null, transitionReason: 'SOLO_FOUNDER_OVERRIDE', organizerValidated: true }), repositories });
    assert(r.passed, `SOLO_FOUNDER_OVERRIDE doit passer sans SOTS: ${r.reason}`);
  });

  // ── C-09 : Litige actif ───────────────────────────────────

  await testAsync('C-09 : litige actif → bloqué', async () => {
    const r = await validate({ engagementId: 'ENG-AAA111-BBB222', currentState: 'contestation_window', targetState: 'payable', actor: 'USR-TEST01-ACTOR1', context: nominalContext({ activeDispute: { id: 'DISP-001', status: 'open' } }), repositories });
    assert(!r.passed && r.reason.includes('C-09_ACTIVE_DISPUTE'), `Mauvaise raison: ${r.reason}`);
  });

  // ── C-10 : Montant > 0 ───────────────────────────────────

  await testAsync('C-10 : cachetBrutCents = 0 → bloqué', async () => {
    const r = await validate({ engagementId: 'ENG-AAA111-BBB222', currentState: 'contestation_window', targetState: 'payable', actor: 'USR-TEST01-ACTOR1', context: nominalContext({ contractSnapshotPhase2: { cachetBrutCents: 0, talentUserId: 'USR-TEST01-TALENT1', durationMinutes: 180 } }), repositories });
    assert(!r.passed && r.reason.includes('C-10_ZERO_AMOUNT'), `Mauvaise raison: ${r.reason}`);
  });

  // ── C-11 : Idempotency ────────────────────────────────────

  await testAsync('C-11 : SettlementInstruction déjà émis → bloqué', async () => {
    const r = await validate({ engagementId: 'ENG-AAA111-BBB222', currentState: 'contestation_window', targetState: 'payable', actor: 'USR-TEST01-ACTOR1', context: nominalContext({ settlementInstruction: { id: 'SETTL-001' } }), repositories });
    assert(!r.passed && r.reason.includes('C-11_IDEMPOTENCY_VIOLATION'), `Mauvaise raison: ${r.reason}`);
  });

  // ── Chemin nominal complet ────────────────────────────────

  await testAsync('NOMINAL : contestation_window→payable — toutes les 11 conditions satisfaites', async () => {
    const r = await validate({ engagementId: 'ENG-AAA111-BBB222', currentState: 'contestation_window', targetState: 'payable', actor: 'USR-TEST01-ACTOR1', context: nominalContext(), repositories });
    assert(r.passed, `Le chemin nominal doit passer: ${r.reason}`);
    assert(r.audit.conditionsPassed === 11, `audit.conditionsPassed doit être 11: ${r.audit?.conditionsPassed}`);
    assert(r.audit.maxDistanceMeters === 500, 'maxDistanceMeters doit être 500 (lu depuis DB mock)');
    assert(r.audit.minDurationFloorMinutes === 30, 'minDurationFloorMinutes doit être 30');
    assert(r.audit.minDurationRatioPpm === 950_000, 'minDurationRatioPpm doit être 950000');
  });

  await testAsync('NOMINAL : performed→payable SOLO_FOUNDER_OVERRIDE', async () => {
    const r = await validate({ engagementId: 'ENG-AAA111-BBB222', currentState: 'performed', targetState: 'payable', actor: 'USR-TEST01-ACTOR1', context: nominalContext({ transitionReason: 'SOLO_FOUNDER_OVERRIDE', sotsSubmission: null }), repositories });
    assert(r.passed, `SoloFounderOverride doit passer: ${r.reason}`);
    assert(r.audit.transitionReason === 'SOLO_FOUNDER_OVERRIDE', 'transitionReason dans audit');
  });

  // ── Résultat ──────────────────────────────────────────────
  const total = passed + failed;
  console.log(`\n═══════════════════════════════════════════════`);
  console.log(`Résultat : ${passed} PASSED / ${failed} FAILED (${total} tests)`);

  if (failed === 0) {
    console.log('PRESENCEPROOF-01 : ✓ PASSED');
    console.log('\nPROCHAINE ÉTAPE :');
    console.log('  Câbler PresenceProofGuard dans transitionEngagement.js');
    console.log('  → remplacer le placeholder case "PresenceProofGuard"');
  } else {
    console.log('PRESENCEPROOF-01 : ✗ FAILED — corriger avant de continuer');
    process.exit(1);
  }
  console.log('═══════════════════════════════════════════════');
}

run();