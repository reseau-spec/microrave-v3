/**
 * MICRO RAVE V3 — Test P0 : PLACEMENT-01 — V5
 * ============================================================
 * Vérifie :
 *   1. PlacementGuard — accepted→placed (isSelfOrganized calculé)
 *   2. EventPaymentGuard — placed→deposit_pending (totalCents TTC)
 *   3. EventPaymentGuard — deposit_pending→deposit_secured (tolérance ±2 centimes)
 *   4. Table souveraine V5 — conforme OS V10 section 2.7.1
 *
 * NOTE : deposit_secured→balance_pending retiré — non conforme OS V10.
 *        L'OS saute de deposit_pending directement à event_sealed via SealingGuard.
 *
 * Source : OS V10 section 2.7.1 + 3.2 + 3.3
 * Pierre de Rosette : DJ Alex · Le Trèfle · 250$ TTC · 50$ dépôt
 * ============================================================
 */

'use strict';

const { validate: validatePlacement }    = require('../../src/core/guards/PlacementGuard');
const { validate: validateEventPayment, STRIPE_TOLERANCE_CENTS } = require('../../src/core/guards/EventPaymentGuard');
const { transitionEngagement, TRANSITION_TABLE } = require('../../src/core/transitionEngagement');

let passed = 0;
let failed = 0;

async function test(name, fn) {
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

const CONTRAT_NOMINAL = {
  contractSnapshotId: 'CS1-TEST-ALEX-000001',
  talentUserId:       'USR-TEST-ALEX-000001',
  organizerUserId:    'USR-TEST-TREFLE-0001',
  eventId:            'EVT-TEST-TREFLE-0001',
  lineupSlots: [
    { talentUserId: 'USR-TEST-ALEX-000001', roleMetier: 'DJ' },
  ],
};

const PAIEMENT_NOMINAL = {
  eventId:                'EVT-TEST-TREFLE-0001',
  contractSnapshotId:     'CS1-TEST-ALEX-000001',
  totalCents:             25000,    // 250$ TTC
  depositRatioPpm:        200000,   // 20%
  eventPaymentCapCents:   350000,   // plafond MVP 3500$
};

console.log('═══════════════════════════════════════════════');
console.log('Test P0 : PLACEMENT-01 — V5');
console.log('Pierre de Rosette : DJ Alex · Le Trèfle · 250$ TTC · 50$ dépôt');
console.log('═══════════════════════════════════════════════\n');

async function run() {

  // ════════════════════════════════════════════════════════
  // SECTION 1 — PlacementGuard (accepted→placed)
  // ════════════════════════════════════════════════════════
  console.log('── PlacementGuard (accepted→placed) ─────────\n');

  await test('Cas nominal : placement autorisé', async () => {
    const result = await validatePlacement({
      engagementId: 'ENG-TEST-000001',
      currentState: 'accepted', targetState: 'placed',
      actor: 'USR-TEST-TREFLE-0001',
      context: CONTRAT_NOMINAL,
    });
    if (!result.passed) throw new Error(`${result.reason}`);
  });

  await test('isSelfOrganized=false quand talent ≠ organisateur', async () => {
    const result = await validatePlacement({
      engagementId: 'ENG-TEST-000002',
      currentState: 'accepted', targetState: 'placed',
      actor: 'USR-TEST-TREFLE-0001',
      context: CONTRAT_NOMINAL,
    });
    if (!result.passed) throw new Error(result.reason);
    if (result.isSelfOrganized !== false)
      throw new Error(`isSelfOrganized attendu: false, reçu: ${result.isSelfOrganized}`);
  });

  await test('isSelfOrganized=true quand talent = organisateur (BLOC 1 V8)', async () => {
    const result = await validatePlacement({
      engagementId: 'ENG-TEST-000003',
      currentState: 'accepted', targetState: 'placed',
      actor: 'USR-TEST-TREFLE-0001',
      context: {
        ...CONTRAT_NOMINAL,
        talentUserId:    'USR-TEST-SELF-0001',
        organizerUserId: 'USR-TEST-SELF-0001',
      },
    });
    if (!result.passed) throw new Error(result.reason);
    if (result.isSelfOrganized !== true)
      throw new Error('isSelfOrganized=true attendu pour même personne');
  });

  await test('CS2- → bloqué (INVALID_CONTRACT_SNAPSHOT)', async () => {
    const result = await validatePlacement({
      engagementId: 'ENG-TEST-000004',
      currentState: 'accepted', targetState: 'placed',
      actor: 'USR-TEST-000001',
      context: { ...CONTRAT_NOMINAL, contractSnapshotId: 'CS2-WRONG-0001' },
    });
    if (result.passed) throw new Error('CS2 ne doit pas être accepté');
    if (!result.reason.includes('INVALID_CONTRACT_SNAPSHOT')) throw new Error(`Mauvaise raison: ${result.reason}`);
  });

  await test('eventId manquant → bloqué (MISSING_EVENT)', async () => {
    const result = await validatePlacement({
      engagementId: 'ENG-TEST-000005',
      currentState: 'accepted', targetState: 'placed',
      actor: 'USR-TEST-000001',
      context: { ...CONTRAT_NOMINAL, eventId: undefined },
    });
    if (result.passed) throw new Error('Aurait dû être bloqué');
    if (!result.reason.includes('MISSING_EVENT')) throw new Error(`Mauvaise raison: ${result.reason}`);
  });

  await test('Lineup vide → bloqué (EMPTY_LINEUP)', async () => {
    const result = await validatePlacement({
      engagementId: 'ENG-TEST-000006',
      currentState: 'accepted', targetState: 'placed',
      actor: 'USR-TEST-000001',
      context: { ...CONTRAT_NOMINAL, lineupSlots: [] },
    });
    if (result.passed) throw new Error('Aurait dû être bloqué');
    if (!result.reason.includes('EMPTY_LINEUP')) throw new Error(`Mauvaise raison: ${result.reason}`);
  });

  await test('Slot sans talentUserId → bloqué (LINEUP_SLOT_INCOMPLETE)', async () => {
    const result = await validatePlacement({
      engagementId: 'ENG-TEST-000007',
      currentState: 'accepted', targetState: 'placed',
      actor: 'USR-TEST-000001',
      context: { ...CONTRAT_NOMINAL, lineupSlots: [{ roleMetier: 'DJ' }] },
    });
    if (result.passed) throw new Error('Aurait dû être bloqué');
    if (!result.reason.includes('LINEUP_SLOT_INCOMPLETE')) throw new Error(`Mauvaise raison: ${result.reason}`);
  });

  // ════════════════════════════════════════════════════════
  // SECTION 2 — EventPaymentGuard (placed→deposit_pending)
  // ════════════════════════════════════════════════════════
  console.log('\n── EventPaymentGuard (placed→deposit_pending) ─\n');

  await test('Dépôt calculé — floor() sur 20% de 250$ TTC', async () => {
    const result = await validateEventPayment({
      engagementId: 'ENG-TEST-000010',
      currentState: 'placed', targetState: 'deposit_pending',
      actor: 'USR-TEST-000001',
      context: PAIEMENT_NOMINAL,
    });
    if (!result.passed) throw new Error(result.reason);
    const expected = Math.floor(25000 * 200000 / 1_000_000);
    if (result.depositCents !== expected)
      throw new Error(`Dépôt attendu: ${expected}, reçu: ${result.depositCents}`);
    if (!Number.isInteger(result.depositCents))
      throw new Error('depositCents doit être un entier');
  });

  await test('totalCents en float → bloqué — message mentionne TTC', async () => {
    const result = await validateEventPayment({
      engagementId: 'ENG-TEST-000011',
      currentState: 'placed', targetState: 'deposit_pending',
      actor: 'USR-TEST-000001',
      context: { ...PAIEMENT_NOMINAL, totalCents: 250.50 },
    });
    if (result.passed) throw new Error('Float accepté — interdit absolu');
    if (!result.reason.includes('INVALID_TOTAL')) throw new Error(`Mauvaise raison: ${result.reason}`);
    if (!result.reason.includes('TTC')) throw new Error('Le message doit mentionner TTC');
  });

  await test('Plafond MVP dépassé → bloqué (PAYMENT_CAP_EXCEEDED)', async () => {
    const result = await validateEventPayment({
      engagementId: 'ENG-TEST-000012',
      currentState: 'placed', targetState: 'deposit_pending',
      actor: 'USR-TEST-000001',
      context: { ...PAIEMENT_NOMINAL, totalCents: 400000 },
    });
    if (result.passed) throw new Error('Aurait dû être bloqué');
    if (!result.reason.includes('PAYMENT_CAP_EXCEEDED')) throw new Error(`Mauvaise raison: ${result.reason}`);
  });

  await test('depositRatioPpm en float → bloqué (INVALID_DEPOSIT_RATIO)', async () => {
    const result = await validateEventPayment({
      engagementId: 'ENG-TEST-000013',
      currentState: 'placed', targetState: 'deposit_pending',
      actor: 'USR-TEST-000001',
      context: { ...PAIEMENT_NOMINAL, depositRatioPpm: 0.20 },
    });
    if (result.passed) throw new Error('Float ratio accepté — interdit absolu');
    if (!result.reason.includes('INVALID_DEPOSIT_RATIO')) throw new Error(`Mauvaise raison: ${result.reason}`);
  });

  // ════════════════════════════════════════════════════════
  // SECTION 3 — EventPaymentGuard (deposit_pending→deposit_secured)
  // ════════════════════════════════════════════════════════
  console.log('\n── EventPaymentGuard (deposit_pending→deposit_secured) ─\n');

  await test('Montant exact → autorisé', async () => {
    const result = await validateEventPayment({
      engagementId: 'ENG-TEST-000020',
      currentState: 'deposit_pending', targetState: 'deposit_secured',
      actor: 'USR-TEST-000001',
      context: {
        stripePaymentIntentId: 'pi_TEST_EXACT_000001',
        confirmedAmountCents:  5000,
        expectedDepositCents:  5000,
      },
    });
    if (!result.passed) throw new Error(result.reason);
  });

  await test(`Écart ≤ ${STRIPE_TOLERANCE_CENTS} centimes → autorisé avec avertissement`, async () => {
    const result = await validateEventPayment({
      engagementId: 'ENG-TEST-000021',
      currentState: 'deposit_pending', targetState: 'deposit_secured',
      actor: 'USR-TEST-000001',
      context: {
        stripePaymentIntentId: 'pi_TEST_ARRONDI_000002',
        confirmedAmountCents:  4999,
        expectedDepositCents:  5000,
      },
    });
    if (!result.passed) throw new Error(`Arrondi 1 centime doit être toléré — ${result.reason}`);
  });

  await test('Écart > 2 centimes → bloqué (DEPOSIT_AMOUNT_MISMATCH)', async () => {
    const result = await validateEventPayment({
      engagementId: 'ENG-TEST-000022',
      currentState: 'deposit_pending', targetState: 'deposit_secured',
      actor: 'USR-TEST-000001',
      context: {
        stripePaymentIntentId: 'pi_TEST_MISMATCH_000003',
        confirmedAmountCents:  4990,
        expectedDepositCents:  5000,
      },
    });
    if (result.passed) throw new Error('Écart 10 centimes doit être bloqué');
    if (!result.reason.includes('DEPOSIT_AMOUNT_MISMATCH')) throw new Error(`Mauvaise raison: ${result.reason}`);
  });

  await test('stripePaymentIntentId manquant → bloqué (MISSING_STRIPE_INTENT)', async () => {
    const result = await validateEventPayment({
      engagementId: 'ENG-TEST-000023',
      currentState: 'deposit_pending', targetState: 'deposit_secured',
      actor: 'USR-TEST-000001',
      context: { confirmedAmountCents: 5000, expectedDepositCents: 5000 },
    });
    if (result.passed) throw new Error('Aurait dû être bloqué');
    if (!result.reason.includes('MISSING_STRIPE_INTENT')) throw new Error(`Mauvaise raison: ${result.reason}`);
  });

  // ════════════════════════════════════════════════════════
  // SECTION 4 — Table souveraine V5
  // ════════════════════════════════════════════════════════
  console.log('\n── Table souveraine V5 (conforme OS V10) ────\n');

  await test('deposit_pending→event_sealed dans la table (OS V10 direct)', async () => {
    if (!TRANSITION_TABLE['deposit_pending->event_sealed'])
      throw new Error('deposit_pending→event_sealed manquante — non conforme OS V10 table 2.7.1');
  });

  await test('proposed→negotiating dans la table', async () => {
    if (!TRANSITION_TABLE['proposed->negotiating']) throw new Error('manquante');
  });

  await test('negotiating→accepted dans la table', async () => {
    if (!TRANSITION_TABLE['negotiating->accepted']) throw new Error('manquante');
  });

  await test('balance_pending→event_sealed absent (non prescrit par OS V10)', async () => {
    if (TRANSITION_TABLE['balance_pending->event_sealed'])
      throw new Error('balance_pending→event_sealed présente — non conforme OS V10');
  });

  await test('disputed→payable utilise DisputeResolutionGuard', async () => {
    if (!TRANSITION_TABLE['disputed->payable'])
      throw new Error('disputed→payable manquante');
    if (TRANSITION_TABLE['disputed->payable'].guard !== 'DisputeResolutionGuard')
      throw new Error('Doit utiliser DisputeResolutionGuard, pas DisputeGuard');
  });

  await test('placed→disputed dans la table (tous états actifs)', async () => {
    if (!TRANSITION_TABLE['placed->disputed'])
      throw new Error('placed→disputed manquante');
  });

  await test('no_show→refunded dans la table', async () => {
    if (!TRANSITION_TABLE['no_show->refunded'])
      throw new Error('no_show→refunded manquante');
  });

  await test('transfer_accepted→placed dans la table', async () => {
    if (!TRANSITION_TABLE['transfer_accepted->placed'])
      throw new Error('transfer_accepted→placed manquante — Engagement orphelin');
  });

  await test('transfer_refused→placed dans la table', async () => {
    if (!TRANSITION_TABLE['transfer_refused->placed'])
      throw new Error('transfer_refused→placed manquante — Engagement orphelin');
  });

  // ════════════════════════════════════════════════════════
  // SECTION 5 — Intégration transitionEngagement()
  // ════════════════════════════════════════════════════════
  console.log('\n── Intégration transitionEngagement() ───────\n');

  await test('proposed→negotiating passe par transitionEngagement()', async () => {
    const result = await transitionEngagement({
      engagementId: 'ENG-INTEG-TEST-0001',
      currentState: 'proposed', targetState: 'negotiating',
      actor: 'USR-INTEG-TEST-0001',
      context: {
        talentUserId: 'USR-TEST-ALEX-000001',
        organizerUserId: 'USR-TEST-TREFLE-0001',
        roleMetier: 'DJ',
      },
    });
    if (!result.success || result.newState !== 'negotiating') throw new Error('Attendu success:true, negotiating');
  });

  await test('accepted→placed passe par transitionEngagement()', async () => {
    const result = await transitionEngagement({
      engagementId: 'ENG-INTEG-TEST-0001',
      currentState: 'accepted', targetState: 'placed',
      actor: 'USR-INTEG-TEST-0001',
      context: CONTRAT_NOMINAL,
    });
    if (!result.success || result.newState !== 'placed') throw new Error('Attendu success:true, placed');
  });

  await test('placed→deposit_pending passe par transitionEngagement()', async () => {
    const result = await transitionEngagement({
      engagementId: 'ENG-INTEG-TEST-0001',
      currentState: 'placed', targetState: 'deposit_pending',
      actor: 'USR-INTEG-TEST-0001',
      context: PAIEMENT_NOMINAL,
    });
    if (!result.success || result.newState !== 'deposit_pending') throw new Error('Attendu success:true, deposit_pending');
  });

  // ── Résultat ──────────────────────────────────────────────
  console.log(`\n═══════════════════════════════════════════════`);
  console.log(`Résultat : ${passed} PASSED / ${failed} FAILED`);

  if (failed === 0) {
    console.log('PLACEMENT-01 : ✓ PASSED');
  } else {
    console.log('PLACEMENT-01 : ✗ FAILED — corriger avant de continuer');
    process.exit(1);
  }
  console.log('═══════════════════════════════════════════════');
}

run();