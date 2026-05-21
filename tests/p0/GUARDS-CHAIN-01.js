/**
 * MICRO RAVE V3 — Test P0 : GUARDS-CHAIN-01
 * ============================================================
 * Prouve que les 3 guards de la chaîne de preuve post-event
 * sont opérationnels et ne peuvent plus être contournés.
 *
 * Couverture :
 *   PresenceWindowGuard  (event_sealed → performed)
 *   EventCompletionGuard (performed → event_completed)
 *   SOTSWindowGuard      (event_completed → sots_window_closed)
 *
 * Tests :
 *   T-01 : PresenceWindowGuard — chemin nominal (fenêtre ouverte + SPR présent)
 *   T-02 : PresenceWindowGuard — fenêtre pas encore ouverte → bloqué
 *   T-03 : PresenceWindowGuard — sessionPresenceId absent → bloqué
 *   T-04 : PresenceWindowGuard — eventScheduledStartAt absent → bloqué
 *   T-05 : PresenceWindowGuard — config manquante → fail-closed
 *
 *   T-06 : EventCompletionGuard — chemin nominal (lineup 2 performed)
 *   T-07 : EventCompletionGuard — lineup avec 1 talent encore event_sealed → bloqué
 *   T-08 : EventCompletionGuard — lineup avec performed + no_show → passe
 *   T-09 : EventCompletionGuard — lineupEngagements absent → bloqué
 *   T-10 : EventCompletionGuard — lineup vide → bloqué
 *
 *   T-11 : SOTSWindowGuard — chemin A (sotsWindowClosedAt fourni, fenêtre close)
 *   T-12 : SOTSWindowGuard — chemin B (sotsWindowOpenedAt, 24h écoulées)
 *   T-13 : SOTSWindowGuard — fenêtre pas encore close → passed:false + schedulerTask
 *   T-14 : SOTSWindowGuard — sotsConsolidated=false → bloqué
 *   T-15 : SOTSWindowGuard — admin override sans adminIncidentRecordId → bloqué
 *   T-16 : SOTSWindowGuard — admin override valide → passe
 *
 *   T-17 : transitionEngagement event_sealed→performed branché (plus placeholder)
 *   T-18 : transitionEngagement performed→event_completed branché
 *   T-19 : transitionEngagement event_completed→sots_window_closed branché
 *
 * Source : OS V14 §2.7.1 · Audit incohérence #3 · 2026-05-21
 * ============================================================
 */

'use strict';

// Stripe mock pour transitionEngagement (GUARD 4.5 require stripe)
process.env.STRIPE_SECRET_KEY     = 'sk_test_MOCK_GUARDS_CHAIN';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_MOCK_GUARDS_CHAIN';
require.cache[require.resolve('stripe')] = {
  id: require.resolve('stripe'), filename: require.resolve('stripe'), loaded: true,
  exports: () => ({ transfers: { create: async () => ({ id: 'tr_MOCK' }) } }),
};

const PresenceWindowGuard  = require('../../src/core/guards/PresenceWindowGuard');
const EventCompletionGuard = require('../../src/core/guards/EventCompletionGuard');
const SOTSWindowGuard      = require('../../src/core/guards/SOTSWindowGuard');
const { transitionEngagement } = require('../../src/core/transitionEngagement');

// ── IDs ───────────────────────────────────────────────────────
const ENG_ID    = 'ENG-GUARDS-TEST001';
const ENG_ID2   = 'ENG-GUARDS-TEST002';
const ACTOR_ID  = 'USR-GUARDS-ACTOR01';
const TALENT_1  = 'USR-GUARDS-TALENT1';
const TALENT_2  = 'USR-GUARDS-TALENT2';

// ── Helpers ───────────────────────────────────────────────────
let passed = 0; let failed = 0;

async function test(name, fn) {
  try { await fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (err) { console.log(`  ✗ ${name}`); console.log(`    → ${err.message}`); failed++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }
async function expectBlocked(fn, substr) {
  const r = await fn();
  assert(r.passed === false, `Aurait dû bloquer — attendu: ${substr}`);
  assert(r.reason.includes(substr), `Attendu "${substr}" dans: ${r.reason}`);
}

// ── Mock repos ────────────────────────────────────────────────
function makeRepos({ missing = false } = {}) {
  return {
    policyConfig: {
      async getConfig(key) {
        if (missing) throw new Error(`POLICY_CONFIG_MISSING: "${key}"`);
        const db = {
          checkInWindowMinutes:     60,
          sots_window_duration_hours: 24,
          contestationWindowDurationHours: 24,
          maxDistancePolicy: 500,
          minDurationFloorMinutes: 30,
          minDurationRatioPpm: 950000,
        };
        if (!(key in db)) throw new Error(`POLICY_CONFIG_MISSING: "${key}"`);
        return db[key];
      },
    },
  };
}

// ── Time helpers ──────────────────────────────────────────────
const now = new Date();
const past1h   = new Date(now - 60 * 60 * 1_000).toISOString();
const past25h  = new Date(now - 25 * 60 * 60 * 1_000).toISOString();
const future1h = new Date(now.getTime() + 60 * 60 * 1_000).toISOString();
const future2h = new Date(now.getTime() + 2 * 60 * 60 * 1_000).toISOString();
const past26h  = new Date(now - 26 * 60 * 60 * 1_000).toISOString();

async function run() {
  console.log('GUARDS-CHAIN-01 — Chaîne de preuve post-event (#3 résolue)');
  console.log('═══════════════════════════════════════════════');

  // ── PRESENCE WINDOW GUARD ─────────────────────────────────
  console.log('\n  — PresenceWindowGuard (event_sealed → performed) —');

  await test('T-01 nominal — fenêtre ouverte + SPR présent', async () => {
    const r = await PresenceWindowGuard.validate({
      engagementId: ENG_ID, currentState: 'event_sealed', targetState: 'performed',
      actor: ACTOR_ID,
      context: { eventScheduledStartAt: past1h, sessionPresenceId: 'SPR-TEST00001' },
      repositories: makeRepos(),
    });
    assert(r.passed, `Guard doit passer — ${r.reason}`);
    assert(r.sessionPresenceId === 'SPR-TEST00001', 'sessionPresenceId transmis');
    assert(r.audit?.engagementId === ENG_ID, 'audit présent');
  });

  await test('T-02 fenêtre pas encore ouverte → PRESENCE_WINDOW_NOT_YET_OPEN', async () => {
    await expectBlocked(
      () => PresenceWindowGuard.validate({
        engagementId: ENG_ID, currentState: 'event_sealed', targetState: 'performed',
        actor: ACTOR_ID,
        // event dans 2h — checkIn ouvre 1h avant → pas encore
        context: { eventScheduledStartAt: future2h, sessionPresenceId: 'SPR-TEST00001' },
        repositories: makeRepos(),
      }),
      'PRESENCE_WINDOW_NOT_YET_OPEN'
    );
  });

  await test('T-03 sessionPresenceId absent → PRESENCE_WINDOW_NO_SESSION', async () => {
    await expectBlocked(
      () => PresenceWindowGuard.validate({
        engagementId: ENG_ID, currentState: 'event_sealed', targetState: 'performed',
        actor: ACTOR_ID,
        context: { eventScheduledStartAt: past1h }, // pas de sessionPresenceId
        repositories: makeRepos(),
      }),
      'PRESENCE_WINDOW_NO_SESSION'
    );
  });

  await test('T-04 eventScheduledStartAt absent → PRESENCE_WINDOW_MISSING_START', async () => {
    await expectBlocked(
      () => PresenceWindowGuard.validate({
        engagementId: ENG_ID, currentState: 'event_sealed', targetState: 'performed',
        actor: ACTOR_ID, context: { sessionPresenceId: 'SPR-TEST00001' },
        repositories: makeRepos(),
      }),
      'PRESENCE_WINDOW_MISSING_START'
    );
  });

  await test('T-05 config manquante → POLICY_CONFIG_MISSING (fail-closed)', async () => {
    await expectBlocked(
      () => PresenceWindowGuard.validate({
        engagementId: ENG_ID, currentState: 'event_sealed', targetState: 'performed',
        actor: ACTOR_ID,
        context: { eventScheduledStartAt: past1h, sessionPresenceId: 'SPR-TEST00001' },
        repositories: makeRepos({ missing: true }),
      }),
      'POLICY_CONFIG_MISSING'
    );
  });

  // ── EVENT COMPLETION GUARD ────────────────────────────────
  console.log('\n  — EventCompletionGuard (performed → event_completed) —');

  await test('T-06 nominal — 2 talents performed', async () => {
    const r = await EventCompletionGuard.validate({
      engagementId: ENG_ID, currentState: 'performed', targetState: 'event_completed',
      actor: ACTOR_ID,
      context: {
        lineupEngagements: [
          { engagementId: ENG_ID,  talentUserId: TALENT_1, status: 'performed' },
          { engagementId: ENG_ID2, talentUserId: TALENT_2, status: 'performed' },
        ],
      },
      repositories: makeRepos(),
    });
    assert(r.passed, `Guard doit passer — ${r.reason}`);
    assert(r.resolvedCount === 2, 'resolvedCount = 2');
    assert(r.performedCount === 2, 'performedCount = 2');
    assert(r.noShowCount === 0, 'noShowCount = 0');
  });

  await test('T-07 talent encore event_sealed → EVENT_COMPLETION_UNRESOLVED_TALENTS', async () => {
    await expectBlocked(
      () => EventCompletionGuard.validate({
        engagementId: ENG_ID, currentState: 'performed', targetState: 'event_completed',
        actor: ACTOR_ID,
        context: {
          lineupEngagements: [
            { engagementId: ENG_ID,  talentUserId: TALENT_1, status: 'performed' },
            { engagementId: ENG_ID2, talentUserId: TALENT_2, status: 'event_sealed' }, // non résolu
          ],
        },
        repositories: makeRepos(),
      }),
      'EVENT_COMPLETION_UNRESOLVED_TALENTS'
    );
  });

  await test('T-08 performed + no_show → passe', async () => {
    const r = await EventCompletionGuard.validate({
      engagementId: ENG_ID, currentState: 'performed', targetState: 'event_completed',
      actor: ACTOR_ID,
      context: {
        lineupEngagements: [
          { engagementId: ENG_ID,  talentUserId: TALENT_1, status: 'performed' },
          { engagementId: ENG_ID2, talentUserId: TALENT_2, status: 'no_show' },
        ],
      },
      repositories: makeRepos(),
    });
    assert(r.passed, `Guard doit passer — ${r.reason}`);
    assert(r.noShowCount === 1, 'noShowCount = 1');
    assert(r.performedCount === 1, 'performedCount = 1');
  });

  await test('T-09 lineupEngagements absent → EVENT_COMPLETION_MISSING_LINEUP', async () => {
    await expectBlocked(
      () => EventCompletionGuard.validate({
        engagementId: ENG_ID, currentState: 'performed', targetState: 'event_completed',
        actor: ACTOR_ID, context: {},
        repositories: makeRepos(),
      }),
      'EVENT_COMPLETION_MISSING_LINEUP'
    );
  });

  await test('T-10 lineup vide → EVENT_COMPLETION_MISSING_LINEUP', async () => {
    await expectBlocked(
      () => EventCompletionGuard.validate({
        engagementId: ENG_ID, currentState: 'performed', targetState: 'event_completed',
        actor: ACTOR_ID, context: { lineupEngagements: [] },
        repositories: makeRepos(),
      }),
      'EVENT_COMPLETION_MISSING_LINEUP'
    );
  });

  // ── SOTS WINDOW GUARD ─────────────────────────────────────
  console.log('\n  — SOTSWindowGuard (event_completed → sots_window_closed) —');

  await test('T-11 chemin A — sotsWindowClosedAt fourni et passé', async () => {
    const r = await SOTSWindowGuard.validate({
      engagementId: ENG_ID, currentState: 'event_completed', targetState: 'sots_window_closed',
      actor: ACTOR_ID,
      context: { sotsWindowClosedAt: past25h, sotsConsolidated: true },
      repositories: makeRepos(),
    });
    assert(r.passed, `Guard doit passer — ${r.reason}`);
    assert(r.sotsWindowClosedAt === past25h, 'sotsWindowClosedAt transmis');
  });

  await test('T-12 chemin B — sotsWindowOpenedAt + 24h écoulées', async () => {
    const r = await SOTSWindowGuard.validate({
      engagementId: ENG_ID, currentState: 'event_completed', targetState: 'sots_window_closed',
      actor: ACTOR_ID,
      context: { sotsWindowOpenedAt: past25h, sotsConsolidated: true },
      repositories: makeRepos(),
    });
    assert(r.passed, `Guard doit passer — ${r.reason}`);
    assert(r.sotsWindowClosedAt, 'sotsWindowClosedAt calculé');
  });

  await test('T-13 fenêtre pas encore close → passed:false + schedulerTask', async () => {
    const r = await SOTSWindowGuard.validate({
      engagementId: ENG_ID, currentState: 'event_completed', targetState: 'sots_window_closed',
      actor: ACTOR_ID,
      context: { sotsWindowOpenedAt: past1h, sotsConsolidated: false }, // 1h écoulé sur 24h
      repositories: makeRepos(),
    });
    assert(r.passed === false, 'Guard doit bloquer (fenêtre ouverte)');
    assert(r.reason.includes('SOTS_WINDOW_STILL_OPEN'), `Attendu SOTS_WINDOW_STILL_OPEN: ${r.reason}`);
    assert(r.schedulerTask, 'schedulerTask doit être présent même en passed:false');
    assert(r.schedulerTask.taskType === 'SOTS_WINDOW_EXPIRATION', 'taskType correct');
    assert(r.schedulerTask.systemId.startsWith('SCH-'), 'schedulerTask ID format correct');
  });

  await test('T-14 sotsConsolidated=false → SOTS_NOT_CONSOLIDATED', async () => {
    await expectBlocked(
      () => SOTSWindowGuard.validate({
        engagementId: ENG_ID, currentState: 'event_completed', targetState: 'sots_window_closed',
        actor: ACTOR_ID,
        context: { sotsWindowClosedAt: past25h, sotsConsolidated: false },
        repositories: makeRepos(),
      }),
      'SOTS_NOT_CONSOLIDATED'
    );
  });

  await test('T-15 admin override sans adminIncidentRecordId → SOTS_OVERRIDE_MISSING_RECORD', async () => {
    await expectBlocked(
      () => SOTSWindowGuard.validate({
        engagementId: ENG_ID, currentState: 'event_completed', targetState: 'sots_window_closed',
        actor: ACTOR_ID,
        context: { sotsAdminOverride: true }, // pas d'adminIncidentRecordId
        repositories: makeRepos(),
      }),
      'SOTS_OVERRIDE_MISSING_RECORD'
    );
  });

  await test('T-16 admin override valide → passe', async () => {
    const r = await SOTSWindowGuard.validate({
      engagementId: ENG_ID, currentState: 'event_completed', targetState: 'sots_window_closed',
      actor: ACTOR_ID,
      context: { sotsAdminOverride: true, adminIncidentRecordId: 'ADM-OVERRIDE-001' },
      repositories: makeRepos(),
    });
    assert(r.passed, `Guard doit passer — ${r.reason}`);
    assert(r.adminOverrideApplied === true, 'adminOverrideApplied = true');
  });

  // ── BRANCHEMENT transitionEngagement ─────────────────────
  console.log('\n  — transitionEngagement branché (plus placeholder) —');

  await test('T-17 event_sealed→performed branché — bloque sans sessionPresenceId', async () => {
    let threw = false;
    try {
      await transitionEngagement({
        engagementId: ENG_ID, currentState: 'event_sealed', targetState: 'performed',
        actor: ACTOR_ID,
        context: { eventScheduledStartAt: past1h }, // pas de SPR
        repositories: makeRepos(),
      });
    } catch (e) {
      threw = true;
      assert(e.message.includes('GUARD_FAILED') || e.message.includes('PRESENCE_WINDOW'),
        `Attendu GUARD_FAILED/PRESENCE_WINDOW, reçu: ${e.message}`);
    }
    assert(threw, 'Doit lever une erreur si guard bloque — plus { passed: true } placeholder');
  });

  await test('T-18 performed→event_completed branché — bloque sans lineupEngagements', async () => {
    let threw = false;
    try {
      await transitionEngagement({
        engagementId: ENG_ID, currentState: 'performed', targetState: 'event_completed',
        actor: ACTOR_ID,
        context: {}, // pas de lineup
        repositories: makeRepos(),
      });
    } catch (e) {
      threw = true;
      assert(e.message.includes('GUARD_FAILED') || e.message.includes('EVENT_COMPLETION'),
        `Attendu GUARD_FAILED/EVENT_COMPLETION, reçu: ${e.message}`);
    }
    assert(threw, 'Doit lever une erreur si guard bloque — plus placeholder');
  });

  await test('T-19 event_completed→sots_window_closed branché — bloque fenêtre ouverte', async () => {
    let threw = false;
    try {
      await transitionEngagement({
        engagementId: ENG_ID, currentState: 'event_completed', targetState: 'sots_window_closed',
        actor: ACTOR_ID,
        context: { sotsWindowOpenedAt: past1h, sotsConsolidated: false },
        repositories: makeRepos(),
      });
    } catch (e) {
      threw = true;
      assert(e.message.includes('GUARD_FAILED') || e.message.includes('SOTS'),
        `Attendu GUARD_FAILED/SOTS, reçu: ${e.message}`);
    }
    assert(threw, 'Doit lever une erreur si guard bloque — plus placeholder');
  });

  // ── Résumé ────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════');
  if (failed === 0) {
    console.log(`GUARDS-CHAIN-01 : ✓ PASSED (${passed}/${passed + failed})`);
    console.log('');
    console.log('Les trois guards fantômes ont un corps.');
    console.log('La chaîne de preuve post-event est opérationnelle.');
    console.log('Aucun talent ne peut passer performed → payable');
    console.log('sans avoir prouvé sa présence, son lineup résolu, et sa fenêtre SOTS close.');
  } else {
    console.log(`GUARDS-CHAIN-01 : ✗ FAILED (${passed} ✓ / ${failed} ✗)`);
    process.exit(1);
  }
  console.log('═══════════════════════════════════════════════');
}

run();