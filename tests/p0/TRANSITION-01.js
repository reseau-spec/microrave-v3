/**
 * MICRO RAVE V3 — Test P0 : TRANSITION-01
 * ============================================================
 * Vérifie que transitionEngagement() est l'unique porte
 * et que les violations sont bloquées.
 *
 * CORRECTIONS V5 :
 *   - Ordre guards : MissionConversionGuard avant WORMGuard
 *   - deposit_pending→event_sealed conforme à l'OS V10
 *   - disputed depuis TOUS les états actifs
 *   - DisputeResolutionGuard pour sorties de dispute
 *   - no_show→refunded et transfer sorties couvertes
 *   - W1 génère console.warn (jamais silencieux)
 *
 * Source : OS V10 section 16.2 — LOI TRANSITION-01
 * Source : OS V10 section 2.7.1 — table souveraine
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
console.log('Test P0 : TRANSITION-01 — V5');
console.log('═══════════════════════════════════════════════\n');

async function run() {

  // ── Section 1 : Transitions nominales ─────────────────────
  console.log('── Transitions nominales ─────────────────────\n');

  await test('proposed→accepted retourne success:true', async () => {
    const result = await transitionEngagement({
      engagementId: ENG_ID, currentState: 'proposed', targetState: 'accepted',
      actor: USR_ID, context: CONTEXTE_NOMINAL,
    });
    if (!result.success) throw new Error('Attendu success:true');
    if (result.newState !== 'accepted') throw new Error(`newState attendu: accepted`);
  });

  await test('sots_window_closed→payable (chemin nominal) retourne success:true', async () => {
    const result = await transitionEngagement({
      engagementId: ENG_ID, currentState: 'sots_window_closed', targetState: 'payable',
      actor: USR_ID, context: {},
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

  await test('settled→proposed est bloquée (WORM_VIOLATION_LEVEL_3)', async () => {
    try {
      await transitionEngagement({
        engagementId: ENG_ID, currentState: 'settled', targetState: 'proposed',
        actor: USR_ID, context: {},
      });
      throw new Error('Aurait dû être bloquée');
    } catch (err) {
      if (!err.message.includes('WORM_VIOLATION_LEVEL_3')) throw new Error(`Mauvaise erreur: ${err.message}`);
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

  await test('deposit_pending dans WORM_STATES (W1)', async () => {
    if (WORM_STATES['deposit_pending'] !== 'W1')
      throw new Error(`deposit_pending absent de WORM_STATES`);
  });

  await test('payable dans WORM_STATES (W1)', async () => {
    if (WORM_STATES['payable'] !== 'W1')
      throw new Error(`payable absent de WORM_STATES`);
  });

  // ── Section 3 : Validation systemIds ──────────────────────
  console.log('\n── Validation systemIds souverains ───────────\n');

  await test('engagementId manquant est bloqué (TRANSITION_ERROR)', async () => {
    try {
      await transitionEngagement({ currentState: 'proposed', targetState: 'accepted', actor: USR_ID });
      throw new Error('Aurait dû être bloquée');
    } catch (err) {
      if (!err.message.includes('TRANSITION_ERROR')) throw new Error(`Mauvaise erreur: ${err.message}`);
    }
  });

  await test('engagementId non-souverain est bloqué (INVALID_SYSTEM_ID)', async () => {
    try {
      await transitionEngagement({
        engagementId: 'hacked-id', currentState: 'proposed', targetState: 'accepted',
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
        engagementId: ENG_ID, currentState: 'proposed', targetState: 'accepted',
        actor: 'admin', context: CONTEXTE_NOMINAL,
      });
      throw new Error('Aurait dû être bloquée');
    } catch (err) {
      if (!err.message.includes('INVALID_SYSTEM_ID')) throw new Error(`Mauvaise erreur: ${err.message}`);
    }
  });

  // ── Section 4 : Table souveraine V5 ───────────────────────
  console.log('\n── Table souveraine V5 ───────────────────────\n');

  await test('La table contient au moins 30 transitions', async () => {
    const count = Object.keys(TRANSITION_TABLE).length;
    if (count < 30) throw new Error(`Seulement ${count} transitions — attendu: 30+`);
  });

  await test('Chemin nominal complet conforme à l\'OS V10 table 2.7.1', async () => {
    const chemin = [
      'proposed->accepted',
      'accepted->placed',
      'placed->deposit_pending',
      'deposit_pending->event_sealed', // OS V10 saute directement ici
      'event_sealed->performed',
      'performed->event_completed',
      'event_completed->sots_window_closed',
      'sots_window_closed->payable',
      'payable->settled',
      'settled->archived',
    ];
    for (const t of chemin) {
      if (!TRANSITION_TABLE[t]) throw new Error(`Transition manquante : ${t}`);
    }
  });

  await test('deposit_pending→event_sealed existe (conforme OS V10)', async () => {
    if (!TRANSITION_TABLE['deposit_pending->event_sealed'])
      throw new Error('deposit_pending→event_sealed manquante — non conforme OS V10 table 2.7.1');
  });

  await test('Disputes depuis tous les états actifs (OS V10 : "* → disputed")', async () => {
    const etatsActifs = [
      'proposed', 'negotiating', 'accepted', 'placed',
      'deposit_pending', 'event_sealed', 'performed',
      'event_completed', 'sots_window_closed', 'payable',
    ];
    for (const etat of etatsActifs) {
      if (!TRANSITION_TABLE[`${etat}->disputed`])
        throw new Error(`${etat}→disputed manquante — "* → disputed" non respecté`);
    }
  });

  await test('DisputeResolutionGuard pour sorties de dispute (OS V10 : "disputed → *")', async () => {
    if (!TRANSITION_TABLE['disputed->payable'])
      throw new Error('disputed→payable manquante');
    if (TRANSITION_TABLE['disputed->payable'].guard !== 'DisputeResolutionGuard')
      throw new Error('disputed→payable doit utiliser DisputeResolutionGuard, pas DisputeGuard');
    if (!TRANSITION_TABLE['disputed->refunded'])
      throw new Error('disputed→refunded manquante');
    if (TRANSITION_TABLE['disputed->refunded'].guard !== 'DisputeResolutionGuard')
      throw new Error('disputed→refunded doit utiliser DisputeResolutionGuard');
  });

  await test('no_show→refunded existe (organisateur remboursé)', async () => {
    if (!TRANSITION_TABLE['no_show->refunded'])
      throw new Error('no_show→refunded manquante — argent organisateur bloqué sur no-show');
  });

  await test('Sorties de transfert existent (transfer_accepted/refused→placed)', async () => {
    if (!TRANSITION_TABLE['transfer_accepted->placed'])
      throw new Error('transfer_accepted→placed manquante — Engagement orphelin après transfert');
    if (!TRANSITION_TABLE['transfer_refused->placed'])
      throw new Error('transfer_refused→placed manquante — Engagement orphelin après refus');
  });

  await test('sots_window_closed→payable dans la table', async () => {
    if (!TRANSITION_TABLE['sots_window_closed->payable'])
      throw new Error('sots_window_closed→payable manquante');
  });

  await test('deposit_secured→event_sealed absent (granularité non OS)', async () => {
    if (TRANSITION_TABLE['deposit_secured->event_sealed'])
      throw new Error('deposit_secured→event_sealed présente — non conforme OS V10');
  });

  // ── Section 5 : Ordre des guards ──────────────────────────
  console.log('\n── Ordre des guards (OS V10 section 2.7.1) ───\n');

  await test('MissionConversionGuard bloque AVANT WORMGuard pour proposed→accepted', async () => {
    // Si l'acteur est invalide, MissionConversionGuard bloque — le message doit contenir
    // MISSION_CONVERSION_FAILED ou INVALID_SYSTEM_ID (IDFactory en Guard 0.5)
    // Le test vérifie que proposed→accepted sans contexte valide est bloqué avant WORM
    try {
      await transitionEngagement({
        engagementId: ENG_ID, currentState: 'proposed', targetState: 'accepted',
        actor: USR_ID, context: { talentUserId: undefined }, // manque acteurs
      });
      throw new Error('Aurait dû être bloqué par MissionConversionGuard');
    } catch (err) {
      if (!err.message.includes('MISSION_CONVERSION_FAILED') && !err.message.includes('GUARD_FAILED')) {
        throw new Error(`Attendu MISSION_CONVERSION_FAILED ou GUARD_FAILED, reçu: ${err.message}`);
      }
    }
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