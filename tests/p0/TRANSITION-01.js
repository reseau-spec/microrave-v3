/**
 * MICRO RAVE V3 — Test P0 : TRANSITION-01
 * ============================================================
 * Vérifie que transitionEngagement() est l'unique porte
 * et que les violations sont bloquées.
 *
 * CORRECTIONS V4 :
 *   - IDFactory.validate() bloque les actors non-souverains
 *   - balance_pending et payable dans WORM_STATES (W1)
 *   - sots_window_closed→payable testé (chemin nominal)
 *   - Transitions alternatives vérifiées dans la table
 *   - Transitions de sortie de dispute vérifiées
 *
 * DÉCISIONS FONDATEUR V11 (Mai 2026) :
 *   Q1 — TRANSFERT depuis placed ET deposit_secured
 *   Q2 — SCELLEMENT sur deposit_pending (balance_pending supprimé)
 *   Q3 — LITIGE uniquement depuis event_completed (fenêtre SOTS)
 *
 * Source : OS V10 section 16.2 — LOI TRANSITION-01
 * ============================================================
 */

'use strict';

const { transitionEngagement, TRANSITION_TABLE, WORM_STATES } = require('../../src/core/transitionEngagement');

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

const CONTEXTE_NOMINAL = {
  talentUserId:    'USR-TEST-ALEX-000001',
  organizerUserId: 'USR-TEST-TREFLE-0001',
  roleMetier:      'DJ',
  cachetBrutCents: 20000,
  tier:            'Freemium',
  tauxPpm:         120000,
};

const ENG_ID = 'ENG-TEST-TRANS-0001';
const USR_ID = 'USR-TEST-TRANS-0001';

console.log('═══════════════════════════════════════════════');
console.log('Test P0 : TRANSITION-01');
console.log('═══════════════════════════════════════════════\n');

async function run() {

  // ── Section 1 : Transitions nominales ─────────────────────
  console.log('── Transitions nominales ─────────────────────\n');

  await test('proposed→accepted retourne success:true', async () => {
    const result = await transitionEngagement({
      engagementId: ENG_ID,
      currentState: 'proposed',
      targetState:  'accepted',
      actor:        USR_ID,
      context:      CONTEXTE_NOMINAL,
    });
    if (!result.success) throw new Error('Attendu success:true');
    if (result.newState !== 'accepted') throw new Error(`newState attendu: accepted`);
  });

  await test('sots_window_closed→payable (chemin nominal) retourne success:true', async () => {
    const result = await transitionEngagement({
      engagementId: ENG_ID,
      currentState: 'sots_window_closed',
      targetState:  'payable',
      actor:        USR_ID,
      context:      {},
    });
    if (!result.success) throw new Error('Attendu success:true');
    if (result.newState !== 'payable') throw new Error(`newState attendu: payable`);
  });

  // ── Section 2 : Blocages WORM ─────────────────────────────
  console.log('\n── Blocages WORM ─────────────────────────────\n');

  await test('proposed→archived est bloquée (TRANSITION_UNAUTHORIZED)', async () => {
    try {
      await transitionEngagement({
        engagementId: ENG_ID, currentState: 'proposed', targetState: 'archived',
        actor: USR_ID, context: {},
      });
      throw new Error('Aurait dû être bloquée');
    } catch (err) {
      if (!err.message.includes('TRANSITION_UNAUTHORIZED')) throw new Error(`Mauvaise erreur: ${err.message}`);
    }
  });

  await test('settled→proposed est bloquée (TRANSITION_UNAUTHORIZED)', async () => {
    // DÉCISION FONDATEUR V11 : settled retiré de WORM_STATES (non mandaté par l'OS).
    // La transition est bloquée par la table (TRANSITION_UNAUTHORIZED), pas par WORM.
    try {
      await transitionEngagement({
        engagementId: ENG_ID, currentState: 'settled', targetState: 'proposed',
        actor: USR_ID, context: {},
      });
      throw new Error('Aurait dû être bloquée');
    } catch (err) {
      if (!err.message.includes('TRANSITION_UNAUTHORIZED')) throw new Error(`Mauvaise erreur: ${err.message}`);
    }
  });

  await test('event_sealed→proposed est bloquée (WORM_VIOLATION_LEVEL_2)', async () => {
    try {
      await transitionEngagement({
        engagementId: ENG_ID, currentState: 'event_sealed', targetState: 'proposed',
        actor: USR_ID, context: {},
      });
      throw new Error('Aurait dû être bloquée');
    } catch (err) {
      if (!err.message.includes('WORM_VIOLATION_LEVEL_2')) throw new Error(`Mauvaise erreur: ${err.message}`);
    }
  });

  await test('balance_pending absent de WORM_STATES (état retiré décision fondateur V11)', async () => {
    // Q2 — balance_pending supprimé du chemin nominal. Ne doit PAS être dans WORM_STATES.
    if (WORM_STATES['balance_pending'] !== undefined)
      throw new Error(`balance_pending présent dans WORM_STATES — état supprimé par décision fondateur V11`);
  });

  await test('payable dans WORM_STATES (W1)', async () => {
    if (WORM_STATES['payable'] !== 'W1')
      throw new Error(`payable absent de WORM_STATES — payout non protégé`);
  });

  // ── Section 3 : Validation systemIds ──────────────────────
  console.log('\n── Validation systemIds souverains ───────────\n');

  await test('engagementId manquant est bloqué (TRANSITION_ERROR)', async () => {
    try {
      await transitionEngagement({
        currentState: 'proposed', targetState: 'accepted', actor: USR_ID,
      });
      throw new Error('Aurait dû être bloquée');
    } catch (err) {
      if (!err.message.includes('TRANSITION_ERROR')) throw new Error(`Mauvaise erreur: ${err.message}`);
    }
  });

  await test('engagementId non-souverain est bloqué (INVALID_SYSTEM_ID)', async () => {
    try {
      await transitionEngagement({
        engagementId: 'hacked-id',
        currentState: 'proposed', targetState: 'accepted',
        actor: USR_ID, context: CONTEXTE_NOMINAL,
      });
      throw new Error('Aurait dû être bloquée');
    } catch (err) {
      if (!err.message.includes('INVALID_SYSTEM_ID')) throw new Error(`Mauvaise erreur: ${err.message}`);
    }
  });

  await test('actor non-souverain est bloqué (INVALID_SYSTEM_ID)', async () => {
    try {
      await transitionEngagement({
        engagementId: ENG_ID,
        currentState: 'proposed', targetState: 'accepted',
        actor: 'admin', context: CONTEXTE_NOMINAL,
      });
      throw new Error('Aurait dû être bloquée');
    } catch (err) {
      if (!err.message.includes('INVALID_SYSTEM_ID')) throw new Error(`Mauvaise erreur: ${err.message}`);
    }
  });

  // ── Section 4 : Table souveraine complète ─────────────────
  console.log('\n── Table souveraine ──────────────────────────\n');

  await test('La table contient au moins 20 transitions', async () => {
    const count = Object.keys(TRANSITION_TABLE).length;
    if (count < 20) throw new Error(`Seulement ${count} transitions — attendu: 20+`);
  });

  await test('Chemin nominal complet proposed→archived couvert (Q2 V11)', async () => {
    // DÉCISION FONDATEUR V11 Q2 : deposit_pending→event_sealed (balance_pending supprimé)
    const chemin = [
      'proposed->accepted', 'accepted->placed', 'placed->deposit_pending',
      'deposit_pending->event_sealed', 'event_sealed->performed',
      'performed->event_completed', 'event_completed->sots_window_closed',
      'sots_window_closed->payable', 'payable->settled', 'settled->archived',
    ];
    for (const t of chemin) {
      if (!TRANSITION_TABLE[t]) throw new Error(`Transition manquante : ${t}`);
    }
  });

  await test('balance_pending→event_sealed absent du chemin nominal (décision Q2 V11)', async () => {
    if (TRANSITION_TABLE['balance_pending->event_sealed'])
      throw new Error('balance_pending→event_sealed présente — doit être supprimée (décision fondateur V11 Q2)');
  });

  await test('Transitions annulation couvertes (cancelled_*)', async () => {
    const annulations = [
      'placed->cancelled_pre_deposit',
      'deposit_pending->cancelled_pre_deposit',
      'deposit_secured->cancelled_J30',
    ];
    for (const t of annulations) {
      if (!TRANSITION_TABLE[t]) throw new Error(`Annulation manquante : ${t}`);
    }
  });

  await test('États morts couverts : refunded→archived, withdrawn→archived, no_show→refunded', async () => {
    const fins = ['refunded->archived', 'withdrawn->archived', 'no_show->refunded'];
    for (const t of fins) {
      if (!TRANSITION_TABLE[t]) throw new Error(`Transition finale manquante : ${t} — état cul-de-sac`);
    }
  });

  await test('Q3 V11 — litige uniquement depuis event_completed (fenêtre SOTS)', async () => {
    // "Tu ne peux contester que ce que tu as vécu."
    if (!TRANSITION_TABLE['event_completed->disputed'])
      throw new Error('event_completed→disputed manquante — litige SOTS impossible');
    if (TRANSITION_TABLE['accepted->disputed'])
      throw new Error('accepted→disputed présente — interdit par décision fondateur V11 Q3');
    if (TRANSITION_TABLE['event_sealed->disputed'])
      throw new Error('event_sealed→disputed présente — interdit par décision fondateur V11 Q3');
  });

  await test('Q3 V11 — sorties de dispute avec DisputeResolutionGuard', async () => {
    const sortiesDispute = ['disputed->payable', 'disputed->refunded'];
    for (const t of sortiesDispute) {
      if (!TRANSITION_TABLE[t]) throw new Error(`Sortie de dispute manquante : ${t}`);
      if (TRANSITION_TABLE[t].guard !== 'DisputeResolutionGuard')
        throw new Error(`${t} doit utiliser DisputeResolutionGuard, pas ${TRANSITION_TABLE[t].guard}`);
    }
  });

  await test('Q1 V11 — transfert depuis placed ET deposit_secured', async () => {
    if (!TRANSITION_TABLE['placed->transfer_requested'])
      throw new Error('placed→transfer_requested manquante');
    if (!TRANSITION_TABLE['deposit_secured->transfer_requested'])
      throw new Error('deposit_secured→transfer_requested manquante — transfert après acompte impossible');
    // Après acompte : financialGuard obligatoire
    if (!TRANSITION_TABLE['deposit_secured->transfer_requested'].financialGuard)
      throw new Error('deposit_secured→transfer_requested doit avoir financialGuard=true');
    if (!TRANSITION_TABLE['transfer_requested->transfer_accepted'])
      throw new Error('transfer_accepted manquante');
    if (!TRANSITION_TABLE['transfer_requested->transfer_refused'])
      throw new Error('transfer_refused manquante');
  });

  await test('Sorties de dispute couvertes (disputed→payable/refunded)', async () => {
    if (!TRANSITION_TABLE['disputed->payable'])
      throw new Error('disputed→payable manquante — argent bloqué définitivement sur litige');
    if (!TRANSITION_TABLE['disputed->refunded'])
      throw new Error('disputed→refunded manquante — remboursement impossible après litige');
  });

  // ── Résultat ──────────────────────────────────────────────
  console.log(`\n═══════════════════════════════════════════════`);
  console.log(`Résultat : ${passed} PASSED / ${failed} FAILED`);

  if (failed === 0) {
    console.log('TRANSITION-01 : ✓ PASSED');
  } else {
    console.log('TRANSITION-01 : ✗ FAILED — corriger avant de continuer');
    process.exit(1);
  }
  console.log('═══════════════════════════════════════════════');
}

run();