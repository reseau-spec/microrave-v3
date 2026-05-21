/**
 * MICRO RAVE V3 — Test P0 : BALANCE-DEADLINE-01
 * ============================================================
 * Prouve que deposit_pending→deposit_secured via transitionEngagement()
 * retourne une SchedulerDueTask BALANCE_DEADLINE_CHECK conforme à D-014-A.
 *
 * PROBLÈME RÉSOLU (Phase 0.3) :
 *   EventPaymentGuard.validateDepositConfirmation() passait correctement
 *   mais ne créait pas la SchedulerDueTask balance_deadline_check.
 *   Sans cette tâche, LOI ANNULATION-02 (annulation automatique J-6
 *   si solde impayé) ne s'armait jamais.
 *   Source : D-014-A · OS V15 §2.7 · Plan Phase 0.3.
 *
 * CE QUE CE TEST PROUVE :
 *   T-01 : deposit_pending→deposit_secured retourne result.schedulerTask présent
 *   T-02 : schedulerTask.taskType === 'BALANCE_DEADLINE_CHECK'
 *   T-03 : schedulerTask.dueAt est un entier, dans le futur, cohérent avec balanceDeadlineDays
 *   T-04 : schedulerTask.systemId au format SCH-*
 *   T-05 : config balanceDeadlineDays absente → fail-closed (POLICY_CONFIG_MISSING)
 *   T-06 : si repositories.scheduler fourni → createTask() appelé avec la bonne tâche
 *   T-07 : si repositories.scheduler absent → transition réussit quand même (SoloFounderOverride)
 *
 * Scénario : DJ Alex, dépôt 60$ confirmé, balanceDeadlineDays = 6
 *   dueAt attendu ≈ Date.now() + 6 × 86_400_000 (±5 secondes de tolérance test)
 *
 * Source : D-014-A · D-099 · OS V15 §2.7 tableau ligne deposit_pending→deposit_secured
 *          LOI ANNULATION-02 · Plan Phase 0.3 · 2026-05-21
 * ============================================================
 */

'use strict';

// ── Mock Stripe (GUARD 4.5 de transitionEngagement require stripe) ──
process.env.STRIPE_SECRET_KEY     = 'sk_test_MOCK_BALANCE_DEADLINE';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_MOCK_BALANCE_DEADLINE';
require.cache[require.resolve('stripe')] = {
  id: require.resolve('stripe'), filename: require.resolve('stripe'), loaded: true,
  exports: () => ({ transfers: { create: async () => ({ id: 'tr_MOCK_BD' }) } }),
};

const { transitionEngagement } = require('../../src/core/transitionEngagement');

let passed = 0;
let failed = 0;

// ── IDs souverains ────────────────────────────────────────────
const ENG_ID   = 'ENG-BALANCE-TEST01';
const ACTOR_ID = 'USR-BALANCE-ACTOR1';

// ── Contexte nominal deposit_pending → deposit_secured ────────
// DJ Alex, dépôt 60$ (6000 centimes), tolérance Stripe 0
const nominalContext = {
  stripePaymentIntentId: 'pi_BALANCE_TEST_001',
  confirmedAmountCents:  6_000,
  expectedDepositCents:  6_000,
};

// ── Mock PolicyConfig avec balanceDeadlineDays = 6 ───────────
const BALANCE_DEADLINE_DAYS = 6;

function makeMockPolicyConfig(overrides = {}) {
  const db = {
    balanceDeadlineDays: BALANCE_DEADLINE_DAYS,
    deposit_ratio_ppm:   200_000,
    event_payment_cap_cents: 350_000,
    ...overrides,
  };
  return {
    async getConfig(key) {
      if (!(key in db)) {
        throw new Error(`POLICY_CONFIG_MISSING: "${key}" absent du mock`);
      }
      return db[key];
    },
  };
}

// ── Helpers ───────────────────────────────────────────────────
async function testAsync(name, fn) {
  try {
    await fn();
    console.log(`\u2713 ${name}`);
    passed++;
  } catch (err) {
    console.log(`\u2717 ${name}`);
    console.log(`  \u2192 ${err.message}`);
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

// ── Banner ────────────────────────────────────────────────────
console.log('═══════════════════════════════════════════════════════');
console.log('Test P0 : BALANCE-DEADLINE-01');
console.log('deposit_pending→deposit_secured — D-014-A · LOI ANNULATION-02 · Phase 0.3');
console.log('═══════════════════════════════════════════════════════\n');

async function run() {

  // ════════════════════════════════════════════════════════
  // PARTIE 1 — Présence et structure de schedulerTask
  // ════════════════════════════════════════════════════════
  console.log('─── Partie 1 : Présence et structure de schedulerTask ──');

  let nominalResult = null;
  const beforeCall = Date.now();

  await testAsync('T-01 : deposit_pending→deposit_secured retourne result.schedulerTask présent', async () => {
    nominalResult = await transitionEngagement({
      engagementId: ENG_ID,
      currentState:  'deposit_pending',
      targetState:   'deposit_secured',
      actor:         ACTOR_ID,
      context:       nominalContext,
      repositories:  { policyConfig: makeMockPolicyConfig() },
    });
    assert(nominalResult.success === true, `success attendu true. Reçu : ${nominalResult.success}`);
    assert(
      nominalResult.schedulerTask !== undefined && nominalResult.schedulerTask !== null,
      `result.schedulerTask absent. Clés reçues : ${JSON.stringify(Object.keys(nominalResult))}\n` +
      `D-014-A : SchedulerDueTask balance_deadline_check doit être retournée par deposit_pending→deposit_secured.`
    );
  });

  await testAsync("T-02 : schedulerTask.taskType === 'BALANCE_DEADLINE_CHECK'", async () => {
    assert(nominalResult, 'T-01 doit passer avant T-02');
    const task = nominalResult.schedulerTask;
    assert(
      task.taskType === 'BALANCE_DEADLINE_CHECK',
      `taskType attendu 'BALANCE_DEADLINE_CHECK'. Reçu : '${task.taskType}'. ` +
      `Source : D-014-A · OS V15 §2.7.`
    );
  });

  await testAsync('T-03 : schedulerTask.dueAt est un entier, dans le futur, cohérent avec balanceDeadlineDays × 86400000', async () => {
    assert(nominalResult, 'T-01 doit passer avant T-03');
    const task = nominalResult.schedulerTask;
    assert(Number.isInteger(task.dueAt), `dueAt doit être un entier ms. Reçu : ${task.dueAt} (${typeof task.dueAt})`);
    assert(task.dueAt > beforeCall, `dueAt=${task.dueAt} doit être dans le futur (> ${beforeCall})`);

    // Vérifier cohérence avec balanceDeadlineDays
    // Tolérance : ±5 secondes pour l'exécution du test
    const expectedDueAt  = beforeCall + BALANCE_DEADLINE_DAYS * 86_400_000;
    const toleranceMs    = 5_000;
    const diff           = Math.abs(task.dueAt - expectedDueAt);
    assert(
      diff <= toleranceMs,
      `dueAt=${task.dueAt} incohérent. ` +
      `Attendu ≈ now + ${BALANCE_DEADLINE_DAYS} × 86_400_000 = ~${expectedDueAt}. ` +
      `Écart : ${diff}ms (tolérance ${toleranceMs}ms). ` +
      `Source : D-014-A — dueAt = Date.now() + balanceDeadlineDays × 86_400_000.`
    );
  });

  await testAsync("T-04 : schedulerTask.systemId au format SCH-*", async () => {
    assert(nominalResult, 'T-01 doit passer avant T-04');
    const task = nominalResult.schedulerTask;
    assert(
      typeof task.systemId === 'string' && task.systemId.startsWith('SCH-'),
      `systemId attendu format SCH-*. Reçu : '${task.systemId}'. ` +
      `Source : IDFactory.PREFIXES.SchedulerDueTask = 'SCH' · D-127.`
    );
  });

  // ════════════════════════════════════════════════════════
  // PARTIE 2 — Fail-closed sur config absente
  // ════════════════════════════════════════════════════════
  console.log('\n─── Partie 2 : Fail-closed ──────────────────────────────');

  await testAsync("T-05 : config balanceDeadlineDays absente → fail-closed (POLICY_CONFIG_MISSING)", async () => {
    // PolicyConfig sans balanceDeadlineDays → getConfig lève POLICY_CONFIG_MISSING
    const configSansDeadline = makeMockPolicyConfig({ balanceDeadlineDays: undefined });
    // Surcharger getConfig pour simuler la clé vraiment absente
    configSansDeadline.getConfig = async (key) => {
      if (key === 'balanceDeadlineDays') {
        throw new Error(`POLICY_CONFIG_MISSING: "balanceDeadlineDays" — Cette configuration est requise et absente de la database.`);
      }
      const db = { deposit_ratio_ppm: 200_000, event_payment_cap_cents: 350_000 };
      if (!(key in db)) throw new Error(`POLICY_CONFIG_MISSING: "${key}" absent du mock`);
      return db[key];
    };

    let threw = false;
    try {
      await transitionEngagement({
        engagementId: ENG_ID,
        currentState:  'deposit_pending',
        targetState:   'deposit_secured',
        actor:         ACTOR_ID,
        context:       nominalContext,
        repositories:  { policyConfig: configSansDeadline },
      });
    } catch (err) {
      threw = true;
      assert(
        err.message.includes('POLICY_CONFIG_MISSING') ||
        err.message.includes('GUARD_FAILED'),
        `Attendu POLICY_CONFIG_MISSING ou GUARD_FAILED. Reçu : ${err.message}`
      );
    }
    assert(
      threw,
      'balanceDeadlineDays absent devait bloquer (fail-closed). ' +
      'Ne jamais fournir de valeur par défaut silencieuse. Source : OS V14 §9.6.'
    );
  });

  // ════════════════════════════════════════════════════════
  // PARTIE 3 — Persistence scheduler (T-06 et T-07)
  // ════════════════════════════════════════════════════════
  console.log('\n─── Partie 3 : Persistence scheduler ───────────────────');

  await testAsync('T-06 : si repositories.scheduler fourni → createTask() appelé avec la bonne tâche', async () => {
    let capturedTask = null;
    const mockScheduler = {
      createTask: async (task) => {
        capturedTask = task;
        return { id: 'fake-base44-id', ...task };
      },
    };

    const result = await transitionEngagement({
      engagementId: ENG_ID,
      currentState:  'deposit_pending',
      targetState:   'deposit_secured',
      actor:         ACTOR_ID,
      context:       nominalContext,
      repositories:  {
        policyConfig: makeMockPolicyConfig(),
        scheduler:    mockScheduler,
      },
    });

    assert(result.success === true, `success attendu true. Reçu : ${result.success}`);
    assert(
      capturedTask !== null,
      'createTask() aurait dû être appelé avec la SchedulerDueTask. ' +
      'Source : transitionEngagement.js après Guard 5 · D-014-A.'
    );
    assert(
      capturedTask.taskType === 'BALANCE_DEADLINE_CHECK',
      `createTask() appelé avec taskType='${capturedTask.taskType}'. Attendu 'BALANCE_DEADLINE_CHECK'.`
    );
    assert(
      capturedTask.engagementId === ENG_ID,
      `createTask() engagementId='${capturedTask.engagementId}'. Attendu '${ENG_ID}'.`
    );
    assert(
      typeof capturedTask.systemId === 'string' && capturedTask.systemId.startsWith('SCH-'),
      `createTask() systemId='${capturedTask.systemId}'. Attendu format SCH-*.`
    );
  });

  await testAsync('T-07 : si repositories.scheduler absent → transition réussit quand même (SoloFounderOverride)', async () => {
    // repositories sans .scheduler — Event 0 pilote en SoloFounderOverride
    // La transition ne doit PAS échouer. Le fondateur gère les transitions temporelles manuellement.
    // Source : Plan Phase 0.3 · D-106 SoloFounderOverride.
    const result = await transitionEngagement({
      engagementId: ENG_ID,
      currentState:  'deposit_pending',
      targetState:   'deposit_secured',
      actor:         ACTOR_ID,
      context:       nominalContext,
      repositories:  {
        policyConfig: makeMockPolicyConfig(),
        // scheduler absent intentionnellement
      },
    });

    assert(result.success === true, `success attendu true même sans scheduler. Reçu : ${result.success}`);
    assert(result.newState === 'deposit_secured', `newState attendu 'deposit_secured'. Reçu : '${result.newState}'`);
    // La schedulerTask est quand même dans le result — l'appelant peut la persister lui-même
    assert(
      result.schedulerTask !== undefined,
      'result.schedulerTask doit être présent même si la persistence a été skippée (scheduler absent).'
    );
  });

  // ── Rapport ───────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════════');
  console.log(`RÉSULTAT : ${passed} passés · ${failed} échoués sur ${passed + failed} tests`);
  if (failed === 0) {
    console.log('✓ BALANCE-DEADLINE-01 PASSED');
    console.log('  Phase 0.3 validée : deposit_pending→deposit_secured crée SchedulerDueTask.');
    console.log('  D-014-A appliqué. LOI ANNULATION-02 armée. Fail-closed sur config absente.');
  } else {
    console.log('✗ BALANCE-DEADLINE-01 FAILED');
    process.exitCode = 1;
  }
  console.log('═══════════════════════════════════════════════════════');
}

run().catch(err => {
  console.error('ERREUR FATALE :', err.message);
  process.exitCode = 1;
});