/**
 * MICRO RAVE V3 — Test P0 : PLACEMENT-01
 * ============================================================
 * Vérifie :
 *   1. PlacementGuard — accepted→placed (isSelfOrganized calculé)
 *   2. EventPaymentGuard — placed→deposit_pending (totalCents TTC)
 *   3. EventPaymentGuard — deposit_pending→deposit_secured (tolérance Stripe ±2 centimes)
 *   4. EventPaymentGuard — deposit_secured→balance_pending
 *   5. Table souveraine V4 — transitions complètes
 *
 * Source : OS V10 section 2.7.1 + 3.2 + 3.3
 * Pierre de Rosette : DJ Alex · Le Trèfle · 250$ TTC total · 50$ dépôt
 * ============================================================
 */

'use strict';

const { validate: validatePlacement }     = require('../../src/core/guards/PlacementGuard');
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

// totalCents = prix_vendu_client TTC (TPS + TVQ + frais Stripe inclus)
// Source : OS V10 section 3.3
const PAIEMENT_NOMINAL = {
  eventId:                'EVT-TEST-TREFLE-0001',
  contractSnapshotId:     'CS1-TEST-ALEX-000001',
  totalCents:             25000,    // 250$ CAD TTC
  depositRatioPpm:        200000,   // 20%
  eventPaymentCapCents:   350000,   // plafond MVP 3500$
};

console.log('═══════════════════════════════════════════════');
console.log('Test P0 : PLACEMENT-01');
console.log('Pierre de Rosette : DJ Alex · Le Trèfle · 250$ TTC · 50$ dépôt');
console.log('═══════════════════════════════════════════════\n');

async function run() {

  // ════════════════════════════════════════════════════════
  // SECTION 1 — PlacementGuard
  // ════════════════════════════════════════════════════════
  console.log('── PlacementGuard (accepted→placed) ─────────\n');

  await test('Cas nominal : placement autorisé', async () => {
    const result = await validatePlacement({
      engagementId: 'ENG-TEST-000001',
      currentState: 'accepted', targetState: 'placed',
      actor: 'USR-TEST-TREFLE-0001',
      context: CONTRAT_NOMINAL,
    });
    if (!result.passed) throw new Error(`Attendu passed:true — ${result.reason}`);
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

  await test('isSelfOrganized=true quand talent = organisateur', async () => {
    const result = await validatePlacement({
      engagementId: 'ENG-TEST-000003',
      currentState: 'accepted', targetState: 'placed',
      actor: 'USR-TEST-TREFLE-0001',
      context: {
        ...CONTRAT_NOMINAL,
        talentUserId:    'USR-TEST-SELF-0001',
        organizerUserId: 'USR-TEST-SELF-0001', // même personne
      },
    });
    if (!result.passed) throw new Error(result.reason);
    if (result.isSelfOrganized !== true)
      throw new Error(`isSelfOrganized attendu: true — BLOC 1 V8 doit être calculé ici`);
  });

  await test('ContractSnapshot CS2- → bloqué (INVALID_CONTRACT_SNAPSHOT)', async () => {
    const result = await validatePlacement({
      engagementId: 'ENG-TEST-000004',
      currentState: 'accepted', targetState: 'placed',
      actor: 'USR-TEST-000001',
      context: { ...CONTRAT_NOMINAL, contractSnapshotId: 'CS2-WRONG-0001' },
    });
    if (result.passed) throw new Error('CS2 ne doit pas être accepté ici');
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
  // SECTION 2 — EventPaymentGuard : placed→deposit_pending
  // ════════════════════════════════════════════════════════
  console.log('\n── EventPaymentGuard (placed→deposit_pending) ─\n');

  await test('Dépôt calculé — floor() sur 20% de 250$ TTC', async () => {
    const result = await validateEventPayment({
      engagementId: 'ENG-TEST-000010',
      currentState: 'placed', targetState: 'deposit_pending',
      actor: 'USR-TEST-000001',
      context: PAIEMENT_NOMINAL,
    });
    if (!result.passed) throw new Error(`${result.reason}`);
    const expected = Math.floor(25000 * 200000 / 1_000_000); // 5000
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
    if (!result.reason.includes('TTC'))
      throw new Error('Le message doit mentionner TTC pour clarifier le contrat d\'interface');
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
  // SECTION 3 — EventPaymentGuard : deposit_pending→deposit_secured
  // Tolérance Stripe ±2 centimes
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
    if (!result.passed) throw new Error(`Attendu passed:true — ${result.reason}`);
  });

  await test(`Écart ≤ ${STRIPE_TOLERANCE_CENTS} centimes (arrondi Stripe) → autorisé avec avertissement`, async () => {
    const result = await validateEventPayment({
      engagementId: 'ENG-TEST-000021',
      currentState: 'deposit_pending', targetState: 'deposit_secured',
      actor: 'USR-TEST-000001',
      context: {
        stripePaymentIntentId: 'pi_TEST_ARRONDI_000002',
        confirmedAmountCents:  4999, // 1 centime d'écart Stripe
        expectedDepositCents:  5000,
      },
    });
    if (!result.passed)
      throw new Error(`Arrondi Stripe de 1 centime doit être toléré — ${result.reason}`);
  });

  await test('Écart > 2 centimes → bloqué (DEPOSIT_AMOUNT_MISMATCH)', async () => {
    const result = await validateEventPayment({
      engagementId: 'ENG-TEST-000022',
      currentState: 'deposit_pending', targetState: 'deposit_secured',
      actor: 'USR-TEST-000001',
      context: {
        stripePaymentIntentId: 'pi_TEST_MISMATCH_000003',
        confirmedAmountCents:  4990, // 10 centimes d'écart — anormal
        expectedDepositCents:  5000,
      },
    });
    if (result.passed) throw new Error('Écart de 10 centimes doit être bloqué');
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
  // SECTION 4 — DÉCISION FONDATEUR Q2 : chemin deux étapes maintenu
  // deposit_pending → deposit_secured → balance_pending → event_sealed
  // Doctrine industrie événementielle : acompte sécurise l'artiste, solde scelle l'événement.
  // ════════════════════════════════════════════════════════
  console.log('\n── Table souveraine (décisions fondateur) ─────\n');

  await test('proposed→negotiating dans la table', async () => {
    if (!TRANSITION_TABLE['proposed->negotiating'])
      throw new Error('proposed→negotiating manquante');
  });

  await test('negotiating→accepted dans la table', async () => {
    if (!TRANSITION_TABLE['negotiating->accepted'])
      throw new Error('negotiating→accepted manquante');
  });

  await test('Q2 fondateur — deposit_pending→deposit_secured dans la table (acompte reçu)', async () => {
    // Décision fondateur : l'acompte doit être techniquement et juridiquement verrouillé
    // avant que l'artiste bloque sa date. deposit_secured = WORM moment 2.
    if (!TRANSITION_TABLE['deposit_pending->deposit_secured'])
      throw new Error('deposit_pending→deposit_secured manquante — acompte non verrouillable');
  });

  await test('Q2 fondateur — deposit_secured→balance_pending dans la table (solde demandé)', async () => {
    // Décision fondateur : après acompte, la demande de solde est une étape distincte.
    if (!TRANSITION_TABLE['deposit_secured->balance_pending'])
      throw new Error('deposit_secured→balance_pending manquante — chemin deux étapes rompu');
  });

  await test('Q2 fondateur — balance_pending→event_sealed dans la table (scellement après solde)', async () => {
    // Décision fondateur : le scellement se fait après réception du solde, pas avant.
    if (!TRANSITION_TABLE['balance_pending->event_sealed'])
      throw new Error('balance_pending→event_sealed manquante — scellement impossible');
    if (TRANSITION_TABLE['balance_pending->event_sealed'].guard !== 'SealingGuard')
      throw new Error('balance_pending→event_sealed doit utiliser SealingGuard');
  });

  await test('Q2 fondateur — balance_pending→cancelled_J7 dans la table (annulation auto solde impayé)', async () => {
    // Décision fondateur : si le solde n'arrive pas à J-6, annulation automatique.
    // Source OS V10 section 16.1 LOI ANNULATION-02.
    if (!TRANSITION_TABLE['balance_pending->cancelled_J7'])
      throw new Error('balance_pending→cancelled_J7 manquante — annulation auto impossible si solde impayé');
  });

  await test('disputed→payable dans la table (sortie dispute)', async () => {
    if (!TRANSITION_TABLE['disputed->payable'])
      throw new Error('disputed→payable manquante — argent bloqué sur litige');
  });

  await test('disputed→refunded dans la table (sortie dispute)', async () => {
    if (!TRANSITION_TABLE['disputed->refunded'])
      throw new Error('disputed→refunded manquante');
  });

  await test('deposit_secured→event_sealed absent (saut direct interdit)', async () => {
    if (TRANSITION_TABLE['deposit_secured->event_sealed'])
      throw new Error('Saut direct deposit_secured→event_sealed présent — interdit');
  });

  await test('negotiating→withdrawn dans la table', async () => {
    if (!TRANSITION_TABLE['negotiating->withdrawn'])
      throw new Error('negotiating→withdrawn manquante');
  });

  // ════════════════════════════════════════════════════════
  // SECTION 6 — Intégration transitionEngagement()
  // ════════════════════════════════════════════════════════
  console.log('\n── Intégration transitionEngagement() ───────\n');

  await test('proposed→negotiating passe par transitionEngagement()', async () => {
    const result = await transitionEngagement({
      engagementId: 'ENG-INTEG-TEST-0001',
      currentState: 'proposed', targetState: 'negotiating',
      actor:        'USR-INTEG-TEST-0001',
      context: {
        talentUserId: 'USR-TEST-ALEX-000001',
        organizerUserId: 'USR-TEST-TREFLE-0001',
        roleMetier: 'DJ',
      },
    });
    if (!result.success) throw new Error('Attendu success:true');
    if (result.newState !== 'negotiating') throw new Error(`newState attendu: negotiating`);
  });

  await test('accepted→placed passe par transitionEngagement()', async () => {
    const result = await transitionEngagement({
      engagementId: 'ENG-INTEG-TEST-0001',
      currentState: 'accepted', targetState: 'placed',
      actor:        'USR-INTEG-TEST-0001',
      context:      CONTRAT_NOMINAL,
    });
    if (!result.success) throw new Error('Attendu success:true');
    if (result.newState !== 'placed') throw new Error(`newState attendu: placed`);
  });

  await test('placed→deposit_pending passe par transitionEngagement()', async () => {
    const result = await transitionEngagement({
      engagementId: 'ENG-INTEG-TEST-0001',
      currentState: 'placed', targetState: 'deposit_pending',
      actor:        'USR-INTEG-TEST-0001',
      context:      PAIEMENT_NOMINAL,
    });
    if (!result.success) throw new Error('Attendu success:true');
    if (result.newState !== 'deposit_pending') throw new Error(`newState attendu: deposit_pending`);
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