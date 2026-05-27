/**
 * MICRO RAVE V3 — Test P0 : CHEMIN-NOMINAL-01
 * ============================================================
 * Test bout-en-bout du chemin nominal complet (J7).
 * Prouve que la machine d'état fonctionne de bout en bout,
 * de placed jusqu'à archived, sans aucune database réelle.
 *
 * Scénario : DJ Alex au Bar Le Trèfle
 *   - Event : 300$ total TTC
 *   - Talent : DJ Alex, cachet signé 200$, taux MR 12%
 *   - Dépôt 20% = 60$, balance = 240$
 *   - Coefficient à event_sealed : 300/200 = 1.5
 *   - cachetBrutFinal = 300$, commission = 36$, net = 264$
 *   - Durée set : 120 min, présence : 115 min (≥ 95% = 114 min ✓)
 *   - GPS : 150m (≤ 500m ✓)
 *   - Chemin : placed → deposit_pending → deposit_secured
 *              → event_sealed → performed → event_completed
 *              → sots_window_closed → contestation_window
 *              → payable → settled → archived
 *
 * Chaque étape vérifie :
 *   - transitionEngagement() retourne success:true
 *   - newState correspond à l'état cible
 *   - Les objets métier clés sont retournés (contractSnapshot, etc.)
 *
 * Source : OS V14 chemin nominal · J7 Plan jalons
 * ============================================================
 */

'use strict';

// ── Mock Stripe pour GUARD 4.5 (PayoutExecutor) ───────────────
import { createRequire as __createRequire } from 'node:module';
const require = __createRequire(import.meta.url);
process.env.STRIPE_SECRET_KEY     = 'sk_test_MOCK_NOMINAL';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_MOCK_NOMINAL';
require.cache[require.resolve('stripe')] = {
  id: require.resolve('stripe'), filename: require.resolve('stripe'), loaded: true,
  exports: () => ({
    transfers: {
      create: async (params) => ({ id: `tr_NOMINAL_${params.metadata.talentUserId}`, ...params }),
    },
  }),
};

import { transitionEngagement } from '../../src/core/transitionEngagement.js';
let passed = 0;
let failed = 0;

// ── IDs souverains ────────────────────────────────────────────
const ENG_ID   = 'ENG-NOMINAL-TEST01';
const ACTOR_ID = 'USR-NOMINAL-ACTOR1';
const TALENT_ID = 'USR-NOMINAL-TALENT1';
const ORG_ID   = 'USR-NOMINAL-ORGAN01';
const EVT_ID   = 'EVT-NOMINAL-TEST001';

// ── Mock PolicyConfigRepository ───────────────────────────────
const mockPolicyConfig = {
  async getConfig(key) {
    const db = {
      deposit_ratio_ppm:              '200000',   // 20%
      event_payment_cap_cents:        '350000',   // 3500$
      maxDistancePolicy:              '500',
      minDurationFloorMinutes:        '30',
      minDurationRatioPpm:            '950000',   // 95%
      contestationWindowDurationHours: '24',
          checkInWindowMinutes:             '60',
          sots_window_duration_hours:       '24',
          balanceDeadlineDays:              6,    // [D-014-A] Phase 0.3 - SchedulerDueTask balance_deadline_check
    };
    if (!(key in db)) throw new Error(`POLICY_CONFIG_MISSING: "${key}" absent du mock`);
    return db[key];
  },
};

const repositories = { policyConfig: mockPolicyConfig };

// ── État partagé entre les étapes ─────────────────────────────
// Simule ce que la database retournerait à chaque étape
let contractSnapshotPhase1 = null;
let contractSnapshotPhase2 = null;
let schedulerTaskContestationWindow = null;

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
console.log('Test P0 : CHEMIN-NOMINAL-01');
console.log('DJ Alex · Bar Le Trèfle · 300$ CAD');
console.log('placed → archived — chemin nominal complet');
console.log('═══════════════════════════════════════════════\n');

async function run() {

  // ════════════════════════════════════════════════
  // ÉTAPE 1 : proposed → accepted
  // MissionConversionGuard — ContractSnapshot phase 1 créé
  // ════════════════════════════════════════════════
  await testAsync('ÉTAPE 1 : proposed → accepted (ContractSnapshot phase 1 créé)', async () => {
    const result = await transitionEngagement({
      engagementId: ENG_ID,
      currentState: 'proposed',
      targetState:  'accepted',
      actor:        ACTOR_ID,
      context: {
        talentUserId:     TALENT_ID,
        organizerUserId:  ORG_ID,
        roleMetier:       'DJ',
        cachetBrutCents:  20_000,   // 200$
        tauxPpm:          120_000,  // 12%
        tier:             'Freemium',
      },
      repositories,
    });
    assert(result.success, `Attendu success:true — ${JSON.stringify(result)}`);
    assert(result.newState === 'accepted', `newState=${result.newState}`);
    assert(result.contractSnapshot, 'contractSnapshot absent du résultat');
    assert(result.contractSnapshot.phase === 1, `phase doit être 1: ${result.contractSnapshot.phase}`);
    assert(result.contractSnapshot.cachetBrutCents === 20_000, 'cachetBrutCents incorrect');
    contractSnapshotPhase1 = result.contractSnapshot;
  });

  // ════════════════════════════════════════════════
  // ÉTAPE 2 : accepted → placed
  // PlacementGuard — liaison événement/slot
  // ════════════════════════════════════════════════
  await testAsync('ÉTAPE 2 : accepted → placed (PlacementGuard)', async () => {
    assert(contractSnapshotPhase1, 'contractSnapshotPhase1 absent — ÉTAPE 1 a échoué');
    const result = await transitionEngagement({
      engagementId: ENG_ID,
      currentState: 'accepted',
      targetState:  'placed',
      actor:        ACTOR_ID,
      context: {
        contractSnapshotId: contractSnapshotPhase1.systemId,
        eventId:            EVT_ID,
        talentUserId:       TALENT_ID,
        organizerUserId:    ORG_ID,
        lineupSlots: [{ talentUserId: TALENT_ID, roleMetier: 'DJ', cachetSigneCents: 20_000 }],
      },
      repositories,
    });
    assert(result.success, `Attendu success:true — ${JSON.stringify(result)}`);
    assert(result.newState === 'placed', `newState=${result.newState}`);
  });

  // ════════════════════════════════════════════════
  // ÉTAPE 3 : placed → deposit_pending
  // EventPaymentGuard — calcul dépôt 20%
  // ════════════════════════════════════════════════
  await testAsync('ÉTAPE 3 : placed → deposit_pending (dépôt 20% calculé)', async () => {
    const result = await transitionEngagement({
      engagementId: ENG_ID,
      currentState: 'placed',
      targetState:  'deposit_pending',
      actor:        ACTOR_ID,
      context: {
        totalCents:           30_000,  // 300$ TTC
        contractSnapshotId:   contractSnapshotPhase1.systemId,
        eventId:              EVT_ID,
        eventPaymentCapCents: 350_000, // lu depuis DB mock (event_payment_cap_cents)
        depositRatioPpm:      200_000, // lu depuis DB mock (deposit_ratio_ppm)
      },
      repositories,
    });
    assert(result.success, `Attendu success:true — ${JSON.stringify(result)}`);
    assert(result.newState === 'deposit_pending', `newState=${result.newState}`);
    assert(result.depositCents === 6_000, `depositCents=${result.depositCents} (attendu 6000 = 20% de 30000)`);
    assert(result.balanceDueCents === 24_000, `balanceDueCents=${result.balanceDueCents} (attendu 24000)`);
  });

  // ════════════════════════════════════════════════
  // ÉTAPE 4 : deposit_pending → deposit_secured
  // EventPaymentGuard — confirmation Stripe dépôt
  // ════════════════════════════════════════════════
  await testAsync('ÉTAPE 4 : deposit_pending → deposit_secured (webhook Stripe dépôt)', async () => {
    const result = await transitionEngagement({
      engagementId: ENG_ID,
      currentState: 'deposit_pending',
      targetState:  'deposit_secured',
      actor:        ACTOR_ID,
      context: {
        stripePaymentIntentId: 'pi_test_deposit_001',
        confirmedAmountCents:  6_000,   // 60$ reçu = dépôt exact
        expectedDepositCents:  6_000,   // attendu = 20% de 30000
      },
      repositories,
    });
    assert(result.success, `Attendu success:true — ${JSON.stringify(result)}`);
    assert(result.newState === 'deposit_secured', `newState=${result.newState}`);
  });

  // ════════════════════════════════════════════════
  // ÉTAPE 5 : deposit_secured → event_sealed
  // SealingGuard — ContractSnapshot phase 2 (WORM W2)
  // coefficient = 300/200 = 1.5 → cachetBrutFinal = 300$
  // ════════════════════════════════════════════════
  await testAsync('ÉTAPE 5 : deposit_secured → event_sealed (WORM W2, coefficient 1.5)', async () => {
    assert(contractSnapshotPhase1, 'contractSnapshotPhase1 absent');
    const result = await transitionEngagement({
      engagementId: ENG_ID,
      currentState: 'deposit_secured',
      targetState:  'event_sealed',
      actor:        ACTOR_ID,
      context: {
        contractSnapshotPhase1Id: contractSnapshotPhase1.systemId,
        eventId:                  EVT_ID,
        depositReceivedCents:     6_000,
        balanceReceivedCents:     24_000,
        prixVenduClientCents:     30_000,
        freeWeightCents:          100,
        lineupEntries: [{
          talentUserId:     TALENT_ID,
          cachetSigneCents: 20_000,  // 200$ signé
          tauxPpm:          120_000, // 12%
        }],
      },
      repositories,
    });
    assert(result.success, `Attendu success:true — ${JSON.stringify(result)}`);
    assert(result.newState === 'event_sealed', `newState=${result.newState}`);
    assert(result.contractSnapshot, 'contractSnapshot phase 2 absent');
    assert(result.contractSnapshot.phase === 2, `phase doit être 2: ${result.contractSnapshot.phase}`);
    assert(result.contractSnapshot.wormLevel === 'W2', `wormLevel=${result.contractSnapshot.wormLevel}`);
    // Vérifier le waterfall
    const entry = result.contractSnapshot.waterfall?.[0];
    assert(entry, 'waterfall[0] absent');
    assert(entry.cachetBrutFinalCents === 30_000, `cachetBrutFinal=${entry.cachetBrutFinalCents} (attendu 30000 = 200$×1.5)`);
    // commission = floor(30000 × 120000 / 1_000_000) = floor(3600) = 3600
    assert(entry.commissionMrCents === 3_600, `commission=${entry.commissionMrCents} (attendu 3600 = 12%)`);
    assert(entry.talentNetCents === 26_400, `talentNet=${entry.talentNetCents} (attendu 26400 = 300$-36$)`);
    contractSnapshotPhase2 = result.contractSnapshot;
  });

  // ════════════════════════════════════════════════
  // ÉTAPE 6 : event_sealed → performed
  // PresenceWindowGuard — fenêtre check-in ouverte + SessionPresence initiée
  // ════════════════════════════════════════════════
  await testAsync('ÉTAPE 6 : event_sealed → performed (PresenceWindowGuard — fenêtre ouverte + SPR)', async () => {
    const result = await transitionEngagement({
      engagementId: ENG_ID,
      currentState: 'event_sealed',
      targetState:  'performed',
      actor:        ACTOR_ID,
      context: {
        // PresenceWindowGuard — fenêtre ouverte (event il y a 1h, checkIn 60min avant)
        eventScheduledStartAt: new Date(Date.now() - 60 * 60 * 1_000).toISOString(),
        sessionPresenceId:     'SPR-NOMINAL-TEST001',
      },
      repositories,
    });
    assert(result.success, `Attendu success:true — ${JSON.stringify(result)}`);
    assert(result.newState === 'performed', `newState=${result.newState}`);
  });

  // ════════════════════════════════════════════════
  // ÉTAPE 7 : performed → event_completed
  // EventCompletionGuard — tous talents performed · lineup complet
  // ════════════════════════════════════════════════
  await testAsync('ÉTAPE 7 : performed → event_completed (EventCompletionGuard — lineup résolu)', async () => {
    const result = await transitionEngagement({
      engagementId: ENG_ID,
      currentState: 'performed',
      targetState:  'event_completed',
      actor:        ACTOR_ID,
      context: {
        // EventCompletionGuard — lineup complet, talent unique DJ Alex en performed
        lineupEngagements: [
          { engagementId: ENG_ID, talentUserId: TALENT_ID, status: 'performed' },
        ],
      },
      repositories,
    });
    assert(result.success, `Attendu success:true — ${JSON.stringify(result)}`);
    assert(result.newState === 'event_completed', `newState=${result.newState}`);
  });

  // ════════════════════════════════════════════════
  // ÉTAPE 8 : event_completed → sots_window_closed
  // SOTSWindowGuard — fenêtre 24h écoulée · sotsConsolidated=true
  // ════════════════════════════════════════════════
  await testAsync('ÉTAPE 8 : event_completed → sots_window_closed (SOTSWindowGuard — 24h écoulées)', async () => {
    const result = await transitionEngagement({
      engagementId: ENG_ID,
      currentState: 'event_completed',
      targetState:  'sots_window_closed',
      actor:        ACTOR_ID,
      context: {
        // SOTSWindowGuard — fenêtre de 24h écoulée (event il y a 26h)
        sotsWindowOpenedAt: new Date(Date.now() - 26 * 60 * 60 * 1_000).toISOString(),
        sotsConsolidated:   true,
      },
      repositories,
    });
    assert(result.success, `Attendu success:true — ${JSON.stringify(result)}`);
    assert(result.newState === 'sots_window_closed', `newState=${result.newState}`);
  });

  // ════════════════════════════════════════════════
  // ÉTAPE 9 : sots_window_closed → contestation_window
  // ContestationWindowGuard — fenêtre 24h ouverte + SchedulerTask
  // ════════════════════════════════════════════════
  await testAsync('ÉTAPE 9 : sots_window_closed → contestation_window (fenêtre 24h + SchedulerTask)', async () => {
    const result = await transitionEngagement({
      engagementId: ENG_ID,
      currentState: 'sots_window_closed',
      targetState:  'contestation_window',
      actor:        ACTOR_ID,
      context: {},
      repositories,
    });
    assert(result.success, `Attendu success:true — ${JSON.stringify(result)}`);
    assert(result.newState === 'contestation_window', `newState=${result.newState}`);
    // Le schedulerTask devrait être dans le résultat si transitionEngagement le propage
    // Pour l'instant on vérifie juste la transition — le câblage du schedulerTask
    // vers la database appartient au layer Base44, pas au test P0
  });

  // ════════════════════════════════════════════════
  // ÉTAPE 10 : contestation_window → payable
  // PresenceProofGuard — 11 conditions D-075
  // GPS 150m ≤ 500m ✓ · durée 115min ≥ 95% de 120min = 114min ✓
  // ════════════════════════════════════════════════
  await testAsync('ÉTAPE 10 : contestation_window → payable (11 conditions D-075 validées)', async () => {
    assert(contractSnapshotPhase2, 'contractSnapshotPhase2 absent — ÉTAPE 5 a échoué');
    const result = await transitionEngagement({
      engagementId: ENG_ID,
      currentState: 'contestation_window',
      targetState:  'payable',
      actor:        ACTOR_ID,
      context: {
        transitionReason:    'CONTESTATION_WINDOW_EXPIRED',
        sessionPresence: {
          checkedInAt:       '2026-05-20T21:00:00Z',
          checkoutAt:        '2026-05-20T22:55:00Z',
          gpsDistanceMeters: 150,      // 150m ≤ 500m ✓
          durationMinutes:   115,      // 115 ≥ 95% de 120 = 114 ✓
        },
        contractSnapshotPhase2: {
          ...contractSnapshotPhase2,
          cachetBrutCents: contractSnapshotPhase2?.waterfall?.[0]?.cachetBrutFinalCents || 30_000,
          talentUserId:    TALENT_ID,
          durationMinutes: 120,        // durée contractuelle 2h
        },
        isSelfOrganized:    false,
        organizerValidated: false,     // expiration automatique
        sotsSubmission:     { id: 'SOT-NOMINAL-TEST001' },
        activeSafetyReport: null,
        activeDispute:      null,
        settlementInstruction: null,
      },
      repositories,
    });
    assert(result.success, `Attendu success:true — ${JSON.stringify(result)}`);
    assert(result.newState === 'payable', `newState=${result.newState}`);
  });

  // ════════════════════════════════════════════════
  // ÉTAPE 11 : payable → settled
  // LedgerInvariantGuard — Σ nets + Σ commissions = prix_vendu
  // 26400 + 3600 = 30000 ✓
  // PayoutExecutor (GUARD 4.5) — Transfer Stripe mocké
  // ════════════════════════════════════════════════
  await testAsync('ÉTAPE 11 : payable → settled (LedgerInvariantGuard — invariant zéro cent)', async () => {
    assert(contractSnapshotPhase2, 'contractSnapshotPhase2 absent');

    // Mock PayoutExecutor repos requis par GUARD 4.5
    const reposWithPayout = {
      ...repositories,
      payoutExecutionRecords: {
        async findByEngagementId() { return null; },
        async create(data) { return { id: 'PER-NOMINAL-001', ...data }; },
      },
      talentPaymentProfiles: {
        async findByTalentUserId(id) {
          return { kycStatus: 'VERIFIED', stripeAccountId: 'acct_NOMINAL_ALEX', talentUserId: id };
        },
      },
      settlementInstructions: {
        async markConsumed(id, data) { return { id, ...data }; },
      },
      ledgerRecords: {
        async append(entry) { return { id: `LDG-${Date.now()}`, ...entry }; },
      },
    };

    const snapshotForSettled = { ...contractSnapshotPhase2, prixVenduClientCents: 30_000 };

    const result = await transitionEngagement({
      engagementId: ENG_ID,
      currentState: 'payable',
      targetState:  'settled',
      actor:        ACTOR_ID,
      context: {
        contractSnapshotPhase2: snapshotForSettled,
        talentPayouts: [{
          talentUserId:  TALENT_ID,
          talentNetCents: 26_400,
          settlementInstruction: {
            id: 'SI-NOMINAL-001', engagementId: ENG_ID,
            talentUserId: TALENT_ID, amountCents: 26_400, consumedAt: null,
          },
        }],
        currency: 'cad',
        goNoGoDecisionRecord:  { decision: 'GO', engagementId: ENG_ID, systemId: 'ADM-NOMINAL-GONOGO0' },
        ledgerBalanced: true,
      },
      repositories: reposWithPayout,
    });
    assert(result.success, `Attendu success:true — ${JSON.stringify(result)}`);
    assert(result.newState === 'settled', `newState=${result.newState}`);
    assert(result.payoutBatch?.allExecuted, 'payoutBatch.allExecuted doit être true');
  });

  // ════════════════════════════════════════════════
  // ÉTAPE 12 : settled → archived
  // ArchiveWORMGuard — WORM W3, fin du cycle
  // ════════════════════════════════════════════════
  await testAsync('ÉTAPE 12 : settled → archived (WORM W3 — fin de cycle)', async () => {
    const result = await transitionEngagement({
      engagementId: ENG_ID,
      currentState: 'settled',
      targetState:  'archived',
      actor:        ACTOR_ID,
      context: {
        goNoGoDecisionRecord: {
          systemId:    'ADM-NOMINAL-GONOGO1',
          type:        'GO_NO_GO',
          decision:    'GO',
          engagementId: ENG_ID,
        },
        ledgerBalanced: true,
        contractSnapshotPhase2,
      },
      repositories,
    });
    assert(result.success, `Attendu success:true — ${JSON.stringify(result)}`);
    assert(result.newState === 'archived', `newState=${result.newState}`);
  });

  // ════════════════════════════════════════════════
  // ÉTAPE 13 : archived → [anything] BLOQUÉ (W3)
  // Vérification que l'état terminal est irréversible
  // ════════════════════════════════════════════════
  await testAsync('ÉTAPE 13 : archived → [any] est BLOQUÉ (WORM W3 irréversible)', async () => {
    try {
      await transitionEngagement({
        engagementId: ENG_ID,
        currentState: 'archived',
        targetState:  'settled',
        actor:        ACTOR_ID,
        context:      {},
        repositories,
      });
      throw new Error('archived→settled devrait être bloqué par WORM W3');
    } catch (err) {
      assert(
        err.message.includes('WORM_VIOLATION_LEVEL_3') || err.message.includes('TRANSITION_UNAUTHORIZED'),
        `Mauvaise erreur: ${err.message}`
      );
    }
  });

  // ════════════════════════════════════════════════
  // VÉRIFICATION FINALE : waterfall DJ Alex
  // Chiffres clés du scénario Pierre de Rosette V2
  // ════════════════════════════════════════════════
  await testAsync('VÉRIFICATION FINALE : waterfall DJ Alex — chiffres souverains', async () => {
    assert(contractSnapshotPhase2, 'contractSnapshotPhase2 absent');
    const entry = contractSnapshotPhase2.waterfall?.[0];
    assert(entry, 'waterfall[0] absent');

    // Prix vendu 300$ = 30_000 cents
    // Cachet signé 200$ = 20_000 cents
    // Coefficient = 30_000 / 20_000 = 1.5 → cachetBrutFinal = 30_000 cents
    // Commission 12% = floor(30_000 × 120_000 / 1_000_000) = 3_600 cents = 36$
    // Talent net = 30_000 - 3_600 = 26_400 cents = 264$
    // Rounding = 30_000 - 26_400 - 3_600 = 0 ✓ (invariant parfait)

    assert(entry.cachetBrutFinalCents === 30_000, `cachetBrutFinal: ${entry.cachetBrutFinalCents} ≠ 30000`);
    assert(entry.commissionMrCents === 3_600,     `commission: ${entry.commissionMrCents} ≠ 3600`);
    assert(entry.talentNetCents === 26_400,        `talentNet: ${entry.talentNetCents} ≠ 26400`);

    const rounding = 30_000 - entry.talentNetCents - entry.commissionMrCents;
    assert(rounding === 0, `rounding=${rounding} (LOI LEDGER-02 : doit être 0)`);

    console.log('');
    console.log('  ┌─────────────────────────────────────────┐');
    console.log('  │  DJ Alex · Bar Le Trèfle · 300$ CAD     │');
    console.log(`  │  Prix vendu client : ${(30_000/100).toFixed(2)}$              │`);
    console.log(`  │  Commission MR     : ${(3_600/100).toFixed(2)}$              │`);
    console.log(`  │  Talent net (DJ Alex) : ${(26_400/100).toFixed(2)}$           │`);
    console.log(`  │  Résidu arrondi    : ${rounding} cent             │`);
    console.log('  │  LOI LEDGER-02 : ✓ invariant parfait     │');
    console.log('  └─────────────────────────────────────────┘');
  });

  // ── Résultat ──────────────────────────────────────────────
  const total = passed + failed;
  console.log(`\n═══════════════════════════════════════════════`);
  console.log(`Résultat : ${passed} PASSED / ${failed} FAILED (${total} tests)`);

  if (failed === 0) {
    console.log('CHEMIN-NOMINAL-01 : ✓ PASSED');
    console.log('');
    console.log('La machine d\'état Micro Rave V3 fonctionne');
    console.log('de bout en bout sur le chemin nominal.');
    console.log('');
    console.log('PROCHAINE ÉTAPE : J8 — Stripe Connect + webhooks pilote');
  } else {
    console.log('CHEMIN-NOMINAL-01 : ✗ FAILED — corriger avant de continuer');
    process.exit(1);
  }
  console.log('═══════════════════════════════════════════════');
}

run();