/**
 * MICRO RAVE V3 — Test P0 : PLACEMENT-01
 * ============================================================
 * Vérifie :
 *   1. PlacementGuard — accepted→placed (isSelfOrganized calculé)
 *   2. EventPaymentGuard — placed→deposit_pending (totalCents TTC)
 *   3. EventPaymentGuard — deposit_pending→deposit_secured (tolérance Stripe ±2 centimes)
 *   4. OS V12 [D-014-A] — chemin simplifié deposit_secured → event_sealed
 *
 * Source : OS V12 section 2.7.1 + 3.2 + 3.3 · D-019 · D-014-A · D-014-B
 * Pierre de Rosette : DJ Alex · Le Trèfle · 250$ TTC total · 50$ dépôt
 *
 * [D-014-A] :
 *   - deposit_secured→balance_pending SUPPRIMÉ
 *   - balance_pending→event_sealed SUPPRIMÉ
 *   - deposit_secured→event_sealed AJOUTÉ (SealingGuard W2)
 *   - deposit_secured→cancelled_J7 AJOUTÉ (LOI ANNULATION-02)
 *   - SchedulerDueTask balance_deadline_check créée dans EventPaymentGuard
 *
 * [D-014-B] :
 *   - payable : état opérationnel non-WORM, protégé par D-101
 * ============================================================
 */

'use strict';

import { validate as validatePlacement } from '../../src/core/guards/PlacementGuard.js';
import { validate as validateEventPayment, STRIPE_TOLERANCE_CENTS } from '../../src/core/guards/EventPaymentGuard.js';
import { transitionEngagement, TRANSITION_TABLE } from '../../src/core/transitionEngagement.js';
import MoneyMath from '../../src/core/MoneyMath.js';
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
  totalCents:             25000,
  depositRatioPpm:        200000,
  eventPaymentCapCents:   350000,
};

console.log('═══════════════════════════════════════════════');
console.log('Test P0 : PLACEMENT-01 (V12)');
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
      actor: 'USR-TEST-TREFLE-0001', context: CONTRAT_NOMINAL,
    });
    if (!result.passed) throw new Error(`Attendu passed:true — ${result.reason}`);
  });

  await test('isSelfOrganized=false quand talent ≠ organisateur', async () => {
    const result = await validatePlacement({
      engagementId: 'ENG-TEST-000002',
      currentState: 'accepted', targetState: 'placed',
      actor: 'USR-TEST-TREFLE-0001', context: CONTRAT_NOMINAL,
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
      context: { ...CONTRAT_NOMINAL, talentUserId: 'USR-TEST-SELF-0001', organizerUserId: 'USR-TEST-SELF-0001' },
    });
    if (!result.passed) throw new Error(result.reason);
    if (result.isSelfOrganized !== true) throw new Error(`isSelfOrganized attendu: true`);
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

  await test('[D-063] Dépôt calculé via MoneyMath.depositAmount() — 20% de 250$ TTC', async () => {
    const result = await validateEventPayment({
      engagementId: 'ENG-TEST-000010',
      currentState: 'placed', targetState: 'deposit_pending',
      actor: 'USR-TEST-000001', context: PAIEMENT_NOMINAL,
    });
    if (!result.passed) throw new Error(`${result.reason}`);
    const expected = MoneyMath.depositAmount(25000, 200000);
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
  // SECTION 3 — EventPaymentGuard : deposit_pending→deposit_secured
  // ════════════════════════════════════════════════════════
  console.log('\n── EventPaymentGuard (deposit_pending→deposit_secured) ─\n');

  await test('Montant exact → autorisé', async () => {
    const result = await validateEventPayment({
      engagementId: 'ENG-TEST-000020',
      currentState: 'deposit_pending', targetState: 'deposit_secured',
      actor: 'USR-TEST-000001',
      context: { stripePaymentIntentId: 'pi_TEST_EXACT_000001', confirmedAmountCents: 5000, expectedDepositCents: 5000 },
      repositories: { policyConfig: { getConfig: async (k) => k === 'balanceDeadlineDays' ? 6 : (() => { throw new Error('POLICY_CONFIG_MISSING: ' + k); })() } },
    });
    if (!result.passed) throw new Error(`Attendu passed:true — ${result.reason}`);
  });

  await test(`Écart ≤ ${STRIPE_TOLERANCE_CENTS} centimes (arrondi Stripe) → autorisé`, async () => {
    const result = await validateEventPayment({
      engagementId: 'ENG-TEST-000021',
      currentState: 'deposit_pending', targetState: 'deposit_secured',
      actor: 'USR-TEST-000001',
      context: { stripePaymentIntentId: 'pi_TEST_ARRONDI_000002', confirmedAmountCents: 4999, expectedDepositCents: 5000 },
      repositories: { policyConfig: { getConfig: async (k) => k === 'balanceDeadlineDays' ? 6 : (() => { throw new Error('POLICY_CONFIG_MISSING: ' + k); })() } },
    });
    if (!result.passed) throw new Error(`Arrondi Stripe de 1 centime doit être toléré — ${result.reason}`);
  });

  await test('Écart > 2 centimes → bloqué (DEPOSIT_AMOUNT_MISMATCH)', async () => {
    const result = await validateEventPayment({
      engagementId: 'ENG-TEST-000022',
      currentState: 'deposit_pending', targetState: 'deposit_secured',
      actor: 'USR-TEST-000001',
      context: { stripePaymentIntentId: 'pi_TEST_MISMATCH_000003', confirmedAmountCents: 4990, expectedDepositCents: 5000 },
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
  // SECTION 4 — OS V12 [D-014-A] : table souveraine simplifiée
  // deposit_pending → deposit_secured → event_sealed
  // ════════════════════════════════════════════════════════
  console.log('\n── Table souveraine OS V12 [D-014-A] ──────────\n');

  await test('proposed→negotiating dans la table', async () => {
    if (!TRANSITION_TABLE['proposed->negotiating'])
      throw new Error('proposed→negotiating manquante');
  });

  await test('negotiating→accepted dans la table', async () => {
    if (!TRANSITION_TABLE['negotiating->accepted'])
      throw new Error('negotiating→accepted manquante');
  });

  await test('OS V12 — deposit_pending→deposit_secured présente (Moment WORM 2)', async () => {
    const t = TRANSITION_TABLE['deposit_pending->deposit_secured'];
    if (!t) throw new Error('deposit_pending→deposit_secured MANQUANTE');
    if (t.guard !== 'EventPaymentGuard') throw new Error(`doit utiliser EventPaymentGuard, pas ${t.guard}`);
    if (t.worm !== 'W1') throw new Error(`doit être WORM W1. Actuel: ${t.worm}`);
  });

  await test('[D-014-A] deposit_secured→balance_pending ABSENTE (état supprimé)', async () => {
    // D-014-A : balance_pending n'existe plus.
    // La SchedulerDueTask est créée dans EventPaymentGuard à deposit_secured.
    if (TRANSITION_TABLE['deposit_secured->balance_pending'])
      throw new Error('deposit_secured→balance_pending présente — supprimée par D-014-A');
  });

  await test('[D-014-A] balance_pending→event_sealed ABSENTE (remplacée)', async () => {
    if (TRANSITION_TABLE['balance_pending->event_sealed'])
      throw new Error('balance_pending→event_sealed présente — supprimée par D-014-A');
  });

  await test('[D-014-A] deposit_secured→event_sealed présente avec SealingGuard W2', async () => {
    // D-014-A : chemin direct deposit_secured → event_sealed
    const t = TRANSITION_TABLE['deposit_secured->event_sealed'];
    if (!t) throw new Error('deposit_secured→event_sealed MANQUANTE — D-014-A');
    if (t.guard !== 'SealingGuard') throw new Error(`doit utiliser SealingGuard, pas ${t.guard}`);
    if (t.worm !== 'W2') throw new Error(`doit être WORM W2. Actuel: ${t.worm}`);
    if (!t.financialGuard) throw new Error('doit avoir financialGuard: true');
  });

  await test('[D-014-A] deposit_secured→cancelled_J7 présente (LOI ANNULATION-02)', async () => {
    // D-014-A : annulation automatique J-6 depuis deposit_secured
    const t = TRANSITION_TABLE['deposit_secured->cancelled_J7'];
    if (!t) throw new Error('deposit_secured→cancelled_J7 MANQUANTE — D-014-A LOI ANNULATION-02');
    if (t.guard !== 'CancellationGuard') throw new Error(`doit utiliser CancellationGuard, pas ${t.guard}`);
    if (!t.financialGuard) throw new Error('doit avoir financialGuard: true');
  });

  await test('D-019 — deposit_pending→deposit_failed présente', async () => {
    if (!TRANSITION_TABLE['deposit_pending->deposit_failed'])
      throw new Error('deposit_pending→deposit_failed MANQUANTE — D-019');
  });

  await test('D-019 — deposit_pending→cancelled_pre_deposit ABSENTE', async () => {
    if (TRANSITION_TABLE['deposit_pending->cancelled_pre_deposit'])
      throw new Error('deposit_pending→cancelled_pre_deposit présente — interdit par D-019');
  });

  await test('D-019 — accepted→cancelled_pre_deposit présente', async () => {
    if (!TRANSITION_TABLE['accepted->cancelled_pre_deposit'])
      throw new Error('accepted→cancelled_pre_deposit MANQUANTE — D-019');
  });

  await test('D-019 — terminaisons annulations directes (sans refunded)', async () => {
    for (const t of ['cancelled_J30->archived', 'cancelled_J7->archived', 'cancelled_pre_deposit->archived']) {
      if (!TRANSITION_TABLE[t]) throw new Error(`${t} MANQUANTE — D-019`);
    }
    for (const t of ['cancelled_J30->refunded', 'cancelled_J7->refunded', 'cancelled_pre_deposit->refunded']) {
      if (TRANSITION_TABLE[t]) throw new Error(`${t} présente — supprimée par D-019`);
    }
  });

  await test('D-019 — sots_window_closed→no_show présente (source officielle)', async () => {
    if (!TRANSITION_TABLE['sots_window_closed->no_show'])
      throw new Error('sots_window_closed→no_show MANQUANTE — D-019');
    if (TRANSITION_TABLE['performed->no_show'])
      throw new Error('performed→no_show présente — supprimée par D-019');
  });

  await test('D-019 — disputed→payable/partially_settled/refunded présentes', async () => {
    for (const t of ['disputed->payable', 'disputed->refunded', 'disputed->partially_settled']) {
      if (!TRANSITION_TABLE[t]) throw new Error(`${t} manquante — D-019`);
    }
  });

  await test('deposit_secured→event_sealed présente, deposit_secured→event_sealed direct (pas de saut interdit)', async () => {
    // Vérifier qu'il n'y a PAS de saut deposit_secured→event_sealed non validé
    // (cette transition est maintenant validée par D-014-A — elle doit exister)
    const t = TRANSITION_TABLE['deposit_secured->event_sealed'];
    if (!t) throw new Error('deposit_secured→event_sealed MANQUANTE — requise par D-014-A');
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
      actor: 'USR-INTEG-TEST-0001',
      context: { talentUserId: 'USR-TEST-ALEX-000001', organizerUserId: 'USR-TEST-TREFLE-0001', roleMetier: 'DJ' },
    });
    if (!result.success) throw new Error('Attendu success:true');
    if (result.newState !== 'negotiating') throw new Error(`newState attendu: negotiating`);
  });

  await test('accepted→placed passe par transitionEngagement()', async () => {
    const result = await transitionEngagement({
      engagementId: 'ENG-INTEG-TEST-0001',
      currentState: 'accepted', targetState: 'placed',
      actor: 'USR-INTEG-TEST-0001', context: CONTRAT_NOMINAL,
    });
    if (!result.success) throw new Error('Attendu success:true');
    if (result.newState !== 'placed') throw new Error(`newState attendu: placed`);
  });

  await test('placed→deposit_pending passe par transitionEngagement()', async () => {
    const result = await transitionEngagement({
      engagementId: 'ENG-INTEG-TEST-0001',
      currentState: 'placed', targetState: 'deposit_pending',
      actor: 'USR-INTEG-TEST-0001', context: PAIEMENT_NOMINAL,
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