/**
 * MICRO RAVE V3 — Test P0 : PLACEMENT-01
 * ============================================================
 * Vérifie :
 *   1. PlacementGuard — accepted→placed (sans argent)
 *   2. EventPaymentGuard — placed→deposit_pending (calcul dépôt)
 *   3. EventPaymentGuard — deposit_pending→deposit_secured (confirmation)
 *   4. EventPaymentGuard — deposit_secured→balance_pending (solde J-7)
 *   5. La table corrigée — negotiating→accepted existe
 *   6. Le saut direct deposit_secured→event_sealed est bloqué
 *
 * Source : OS V10 section 2.7.1 + section 3.2 (standard numérique)
 * Pierre de Rosette : DJ Alex · Le Trèfle · 200$ CAD net
 * ============================================================
 */

'use strict';

const { validate: validatePlacement }     = require('../../src/core/guards/PlacementGuard');
const { validate: validateEventPayment }  = require('../../src/core/guards/EventPaymentGuard');
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

// ── Contextes de référence ─────────────────────────────────────
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
  totalCents:             25000,    // 250$ CAD total payeur
  depositRatioPpm:        200000,   // 20% = 200 000 ppm
  eventPaymentCapCents:   350000,   // plafond MVP 3500$
};

console.log('═══════════════════════════════════════════════');
console.log('Test P0 : PLACEMENT-01');
console.log('Pierre de Rosette : DJ Alex · Le Trèfle · 250$ total · 50$ dépôt');
console.log('═══════════════════════════════════════════════\n');

async function run() {

  // ════════════════════════════════════════════════════════
  // SECTION 1 — PlacementGuard (accepted→placed)
  // ════════════════════════════════════════════════════════
  console.log('── PlacementGuard (accepted→placed) ─────────\n');

  await test('Cas nominal : placement autorisé avec contrat et lineup', async () => {
    const result = await validatePlacement({
      engagementId: 'ENG-TEST-000001',
      currentState: 'accepted',
      targetState:  'placed',
      actor:        'USR-TEST-TREFLE-0001',
      context:      CONTRAT_NOMINAL,
    });
    if (!result.passed) throw new Error(`Attendu passed:true — raison: ${result.reason}`);
  });

  await test('ContractSnapshot manquant → bloqué (MISSING_CONTRACT_SNAPSHOT)', async () => {
    const result = await validatePlacement({
      engagementId: 'ENG-TEST-000002',
      currentState: 'accepted',
      targetState:  'placed',
      actor:        'USR-TEST-000001',
      context: { ...CONTRAT_NOMINAL, contractSnapshotId: undefined },
    });
    if (result.passed) throw new Error('Aurait dû être bloqué');
    if (!result.reason.includes('MISSING_CONTRACT_SNAPSHOT'))
      throw new Error(`Mauvaise raison: ${result.reason}`);
  });

  await test('ContractSnapshot phase 2 (CS2-) → bloqué (INVALID_CONTRACT_SNAPSHOT)', async () => {
    const result = await validatePlacement({
      engagementId: 'ENG-TEST-000003',
      currentState: 'accepted',
      targetState:  'placed',
      actor:        'USR-TEST-000001',
      context: { ...CONTRAT_NOMINAL, contractSnapshotId: 'CS2-WRONG-000001' },
    });
    if (result.passed) throw new Error('Un CS2 ne doit pas être accepté ici');
    if (!result.reason.includes('INVALID_CONTRACT_SNAPSHOT'))
      throw new Error(`Mauvaise raison: ${result.reason}`);
  });

  await test('eventId manquant → bloqué (MISSING_EVENT)', async () => {
    const result = await validatePlacement({
      engagementId: 'ENG-TEST-000004',
      currentState: 'accepted',
      targetState:  'placed',
      actor:        'USR-TEST-000001',
      context: { ...CONTRAT_NOMINAL, eventId: undefined },
    });
    if (result.passed) throw new Error('Aurait dû être bloqué');
    if (!result.reason.includes('MISSING_EVENT'))
      throw new Error(`Mauvaise raison: ${result.reason}`);
  });

  await test('Lineup vide → bloqué (EMPTY_LINEUP)', async () => {
    const result = await validatePlacement({
      engagementId: 'ENG-TEST-000005',
      currentState: 'accepted',
      targetState:  'placed',
      actor:        'USR-TEST-000001',
      context: { ...CONTRAT_NOMINAL, lineupSlots: [] },
    });
    if (result.passed) throw new Error('Aurait dû être bloqué');
    if (!result.reason.includes('EMPTY_LINEUP'))
      throw new Error(`Mauvaise raison: ${result.reason}`);
  });

  await test('Slot sans talentUserId → bloqué (LINEUP_SLOT_INCOMPLETE)', async () => {
    const result = await validatePlacement({
      engagementId: 'ENG-TEST-000006',
      currentState: 'accepted',
      targetState:  'placed',
      actor:        'USR-TEST-000001',
      context: {
        ...CONTRAT_NOMINAL,
        lineupSlots: [{ roleMetier: 'DJ' }], // talentUserId manquant
      },
    });
    if (result.passed) throw new Error('Aurait dû être bloqué');
    if (!result.reason.includes('LINEUP_SLOT_INCOMPLETE'))
      throw new Error(`Mauvaise raison: ${result.reason}`);
  });

  // ════════════════════════════════════════════════════════
  // SECTION 2 — EventPaymentGuard : placed→deposit_pending
  // ════════════════════════════════════════════════════════
  console.log('\n── EventPaymentGuard (placed→deposit_pending) ─\n');

  await test('Dépôt calculé correctement — floor() sur 20%', async () => {
    const result = await validateEventPayment({
      engagementId: 'ENG-TEST-000010',
      currentState: 'placed',
      targetState:  'deposit_pending',
      actor:        'USR-TEST-000001',
      context:      PAIEMENT_NOMINAL,
    });
    if (!result.passed) throw new Error(`Attendu passed:true — raison: ${result.reason}`);
    // 25000 * 200000 / 1_000_000 = 5000 centimes = 50$
    const expected = Math.floor(25000 * 200000 / 1_000_000);
    if (result.depositCents !== expected)
      throw new Error(`Dépôt attendu: ${expected}, reçu: ${result.depositCents}`);
    if (!Number.isInteger(result.depositCents))
      throw new Error('depositCents doit être un entier — standard numérique');
  });

  await test('totalCents en float → bloqué (INVALID_TOTAL)', async () => {
    const result = await validateEventPayment({
      engagementId: 'ENG-TEST-000011',
      currentState: 'placed',
      targetState:  'deposit_pending',
      actor:        'USR-TEST-000001',
      context: { ...PAIEMENT_NOMINAL, totalCents: 250.50 }, // float interdit
    });
    if (result.passed) throw new Error('Float accepté — interdit absolu violé');
    if (!result.reason.includes('INVALID_TOTAL'))
      throw new Error(`Mauvaise raison: ${result.reason}`);
  });

  await test('Plafond MVP dépassé → bloqué (PAYMENT_CAP_EXCEEDED)', async () => {
    const result = await validateEventPayment({
      engagementId: 'ENG-TEST-000012',
      currentState: 'placed',
      targetState:  'deposit_pending',
      actor:        'USR-TEST-000001',
      context: { ...PAIEMENT_NOMINAL, totalCents: 400000 }, // 4000$ > plafond 3500$
    });
    if (result.passed) throw new Error('Aurait dû être bloqué par le plafond MVP');
    if (!result.reason.includes('PAYMENT_CAP_EXCEEDED'))
      throw new Error(`Mauvaise raison: ${result.reason}`);
  });

  await test('depositRatioPpm en float → bloqué (INVALID_DEPOSIT_RATIO)', async () => {
    const result = await validateEventPayment({
      engagementId: 'ENG-TEST-000013',
      currentState: 'placed',
      targetState:  'deposit_pending',
      actor:        'USR-TEST-000001',
      context: { ...PAIEMENT_NOMINAL, depositRatioPpm: 0.20 }, // float interdit
    });
    if (result.passed) throw new Error('Float ratio accepté — interdit absolu violé');
    if (!result.reason.includes('INVALID_DEPOSIT_RATIO'))
      throw new Error(`Mauvaise raison: ${result.reason}`);
  });

  // ════════════════════════════════════════════════════════
  // SECTION 3 — EventPaymentGuard : deposit_pending→deposit_secured
  // ════════════════════════════════════════════════════════
  console.log('\n── EventPaymentGuard (deposit_pending→deposit_secured) ─\n');

  await test('Confirmation dépôt : montant exact → autorisé', async () => {
    const result = await validateEventPayment({
      engagementId: 'ENG-TEST-000020',
      currentState: 'deposit_pending',
      targetState:  'deposit_secured',
      actor:        'USR-TEST-000001',
      context: {
        stripePaymentIntentId: 'pi_TEST_STRIPE_000001',
        confirmedAmountCents:  5000,
        expectedDepositCents:  5000,
      },
    });
    if (!result.passed) throw new Error(`Attendu passed:true — raison: ${result.reason}`);
  });

  await test('Montant confirmé différent du dépôt attendu → bloqué (DEPOSIT_AMOUNT_MISMATCH)', async () => {
    const result = await validateEventPayment({
      engagementId: 'ENG-TEST-000021',
      currentState: 'deposit_pending',
      targetState:  'deposit_secured',
      actor:        'USR-TEST-000001',
      context: {
        stripePaymentIntentId: 'pi_TEST_STRIPE_000002',
        confirmedAmountCents:  4999, // 1 centime de moins
        expectedDepositCents:  5000,
      },
    });
    if (result.passed) throw new Error('Aurait dû être bloqué');
    if (!result.reason.includes('DEPOSIT_AMOUNT_MISMATCH'))
      throw new Error(`Mauvaise raison: ${result.reason}`);
  });

  await test('stripePaymentIntentId manquant → bloqué (MISSING_STRIPE_INTENT)', async () => {
    const result = await validateEventPayment({
      engagementId: 'ENG-TEST-000022',
      currentState: 'deposit_pending',
      targetState:  'deposit_secured',
      actor:        'USR-TEST-000001',
      context: {
        confirmedAmountCents: 5000,
        expectedDepositCents: 5000,
      },
    });
    if (result.passed) throw new Error('Aurait dû être bloqué');
    if (!result.reason.includes('MISSING_STRIPE_INTENT'))
      throw new Error(`Mauvaise raison: ${result.reason}`);
  });

  // ════════════════════════════════════════════════════════
  // SECTION 4 — EventPaymentGuard : deposit_secured→balance_pending
  // ════════════════════════════════════════════════════════
  console.log('\n── EventPaymentGuard (deposit_secured→balance_pending) ─\n');

  await test('Ouverture solde J-7 : balance due correcte → autorisé', async () => {
    const result = await validateEventPayment({
      engagementId: 'ENG-TEST-000030',
      currentState: 'deposit_secured',
      targetState:  'balance_pending',
      actor:        'USR-TEST-000001',
      context: {
        contractSnapshotId: 'CS1-TEST-ALEX-000001',
        balanceDueCents:    20000, // 200$ de solde
      },
    });
    if (!result.passed) throw new Error(`Attendu passed:true — raison: ${result.reason}`);
    if (!Number.isInteger(result.audit.balanceDueCents))
      throw new Error('balanceDueCents doit être un entier');
  });

  // ════════════════════════════════════════════════════════
  // SECTION 5 — Table corrigée
  // ════════════════════════════════════════════════════════
  console.log('\n── Table souveraine — corrections V2 ────────\n');

  await test('proposed→negotiating existe dans la table', async () => {
    if (!TRANSITION_TABLE['proposed->negotiating'])
      throw new Error('proposed→negotiating manquante — bombe silencieuse voie négociation');
  });

  await test('negotiating→accepted existe dans la table', async () => {
    if (!TRANSITION_TABLE['negotiating->accepted'])
      throw new Error('negotiating→accepted manquante — bombe silencieuse voie négociation');
  });

  await test('deposit_secured→balance_pending existe dans la table', async () => {
    if (!TRANSITION_TABLE['deposit_secured->balance_pending'])
      throw new Error('deposit_secured→balance_pending manquante — solde J-7 inaccessible');
  });

  await test('balance_pending→event_sealed existe dans la table', async () => {
    if (!TRANSITION_TABLE['balance_pending->event_sealed'])
      throw new Error('balance_pending→event_sealed manquante — scellement inaccessible');
  });

  await test('deposit_secured→event_sealed N\'existe plus (saut direct interdit)', async () => {
    if (TRANSITION_TABLE['deposit_secured->event_sealed'])
      throw new Error(
        'deposit_secured→event_sealed existe encore — ce saut direct court-circuite balance_pending. ' +
        'Le solde J-7 doit toujours être payé avant le scellement.'
      );
  });

  await test('negotiating→withdrawn existe (retrait pendant négociation)', async () => {
    if (!TRANSITION_TABLE['negotiating->withdrawn'])
      throw new Error('negotiating→withdrawn manquante — retrait pendant négociation impossible');
  });

  // ════════════════════════════════════════════════════════
  // SECTION 6 — Intégration transitionEngagement()
  // ════════════════════════════════════════════════════════
  console.log('\n── Intégration transitionEngagement() ───────\n');

  await test('proposed→negotiating passe par transitionEngagement()', async () => {
    const result = await transitionEngagement({
      engagementId: 'ENG-TEST-000040',
      currentState: 'proposed',
      targetState:  'negotiating',
      actor:        'USR-TEST-000001',
      context: {
        talentUserId:    'USR-TEST-ALEX-000001',
        organizerUserId: 'USR-TEST-TREFLE-0001',
        roleMetier:      'DJ',
        cachetBrutCents: 20000,
        tier:            'Freemium',
        tauxPpm:         120000,
      },
    });
    if (!result.success) throw new Error('Attendu success:true');
    if (result.newState !== 'negotiating')
      throw new Error(`newState attendu: negotiating, reçu: ${result.newState}`);
  });

  await test('accepted→placed passe par transitionEngagement()', async () => {
    const result = await transitionEngagement({
      engagementId: 'ENG-TEST-000041',
      currentState: 'accepted',
      targetState:  'placed',
      actor:        'USR-TEST-TREFLE-0001',
      context:      CONTRAT_NOMINAL,
    });
    if (!result.success) throw new Error('Attendu success:true');
    if (result.newState !== 'placed')
      throw new Error(`newState attendu: placed, reçu: ${result.newState}`);
  });

  await test('placed→deposit_pending passe par transitionEngagement()', async () => {
    const result = await transitionEngagement({
      engagementId: 'ENG-TEST-000042',
      currentState: 'placed',
      targetState:  'deposit_pending',
      actor:        'USR-TEST-TREFLE-0001',
      context:      PAIEMENT_NOMINAL,
    });
    if (!result.success) throw new Error('Attendu success:true');
    if (result.newState !== 'deposit_pending')
      throw new Error(`newState attendu: deposit_pending, reçu: ${result.newState}`);
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