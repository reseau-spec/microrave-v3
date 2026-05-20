/**
 * MICRO RAVE V3 — Test P0 : TRANSITION-01
 * ============================================================
 * Vérifie que transitionEngagement() est l'unique porte
 * et que les violations sont bloquées.
 *
 * [D-019-B] V13 — Séparation Frein d'Urgence / Contestation :
 *   sots_window_closed→payable SUPPRIMÉ
 *   sots_window_closed→disputed SUPPRIMÉ (Régime 2 = contestation_window)
 *   sots_window_closed→contestation_window AJOUTÉ
 *   contestation_window→payable AJOUTÉ (expiration fenêtre)
 *   contestation_window→disputed AJOUTÉ (Régime 2)
 *   Frein d'Urgence = proposed/negotiating/accepted/placed/
 *     deposit_pending/deposit_secured/event_sealed/performed/payable
 *   PAS depuis : event_completed, sots_window_closed, contestation_window
 *
 * [D-019-A] V13 — Machine d'état V4 :
 *   accepted→cancelled_pre_deposit · deposit_pending→deposit_failed
 *   transfer_accepted→placed · transfer_refused→placed
 *   transfer_requested→no_show_pre_event · disputed→partially_settled
 *   performed→payable (SoloFounderOverride) · partially_settled→archived
 *
 * [D-014-A] V12 — balance_pending retiré WORM_STATES et machine d'état
 * [D-014-B] V12 — payable retiré WORM_STATES
 *
 * Source : OS V13 section 16.2 — LOI TRANSITION-01
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
console.log('Test P0 : TRANSITION-01 (V13)');
console.log('D-019-A · D-019-B · D-014-A · D-014-B');
console.log('═══════════════════════════════════════════════\n');

async function run() {

  // ── Section 1 : Transitions nominales ─────────────────────
  console.log('── Transitions nominales ─────────────────────\n');

  await test('proposed→accepted retourne success:true', async () => {
    const r = await transitionEngagement({
      engagementId: ENG_ID, currentState: 'proposed', targetState: 'accepted',
      actor: USR_ID, context: CONTEXTE_NOMINAL,
    });
    if (!r.success) throw new Error('Attendu success:true');
    if (r.newState !== 'accepted') throw new Error(`newState attendu: accepted`);
  });

  await test('[D-019-B] sots_window_closed→contestation_window retourne success:true', async () => {
    const r = await transitionEngagement({
      engagementId: ENG_ID, currentState: 'sots_window_closed', targetState: 'contestation_window',
      actor: USR_ID, context: {},
    });
    if (!r.success) throw new Error('Attendu success:true');
    if (r.newState !== 'contestation_window') throw new Error(`newState attendu: contestation_window`);
  });

  await test('[D-019-B] contestation_window→payable retourne success:true', async () => {
    const r = await transitionEngagement({
      engagementId: ENG_ID, currentState: 'contestation_window', targetState: 'payable',
      actor: USR_ID, context: {},
    });
    if (!r.success) throw new Error('Attendu success:true');
    if (r.newState !== 'payable') throw new Error(`newState attendu: payable`);
  });

  // ── Section 2 : Blocages WORM ─────────────────────────────
  console.log('\n── Blocages WORM ─────────────────────────────\n');

  await test('proposed→archived bloquée (TRANSITION_UNAUTHORIZED)', async () => {
    try {
      await transitionEngagement({ engagementId: ENG_ID, currentState: 'proposed', targetState: 'archived', actor: USR_ID, context: {} });
      throw new Error('Aurait dû être bloquée');
    } catch (err) {
      if (!err.message.includes('TRANSITION_UNAUTHORIZED')) throw new Error(`Mauvaise erreur: ${err.message}`);
    }
  });

  await test('event_sealed→proposed bloquée (WORM_VIOLATION_LEVEL_2)', async () => {
    try {
      await transitionEngagement({ engagementId: ENG_ID, currentState: 'event_sealed', targetState: 'proposed', actor: USR_ID, context: {} });
      throw new Error('Aurait dû être bloquée');
    } catch (err) {
      if (!err.message.includes('WORM_VIOLATION_LEVEL_2')) throw new Error(`Mauvaise erreur: ${err.message}`);
    }
  });

  await test('settled→proposed bloquée (TRANSITION_UNAUTHORIZED)', async () => {
    try {
      await transitionEngagement({ engagementId: ENG_ID, currentState: 'settled', targetState: 'proposed', actor: USR_ID, context: {} });
      throw new Error('Aurait dû être bloquée');
    } catch (err) {
      if (!err.message.includes('TRANSITION_UNAUTHORIZED')) throw new Error(`Attendu TRANSITION_UNAUTHORIZED, reçu: ${err.message}`);
    }
  });

  // ── Section 3 : WORM_STATES = 6 moments officiels ─────────
  console.log('\n── WORM_STATES — 6 moments officiels (D-014) ─\n');

  await test('[D-014-A] balance_pending ABSENT de WORM_STATES', async () => {
    if (WORM_STATES['balance_pending'] !== undefined)
      throw new Error(`balance_pending doit être ABSENT — D-014-A. Actuel: ${WORM_STATES['balance_pending']}`);
  });

  await test('[D-014-B] payable ABSENT de WORM_STATES', async () => {
    if (WORM_STATES['payable'] !== undefined)
      throw new Error(`payable doit être ABSENT — D-014-B. Actuel: ${WORM_STATES['payable']}`);
  });

  await test('contestation_window ABSENT de WORM_STATES (état temporaire non-WORM)', async () => {
    if (WORM_STATES['contestation_window'] !== undefined)
      throw new Error(`contestation_window ne doit pas être WORM. Actuel: ${WORM_STATES['contestation_window']}`);
  });

  await test('settled ABSENT de WORM_STATES (non-moment officiel)', async () => {
    if (WORM_STATES['settled'] !== undefined)
      throw new Error(`settled doit être absent. Actuel: ${WORM_STATES['settled']}`);
  });

  await test('WORM_STATES contient exactement 6 moments officiels D-014', async () => {
    const attendus = ['accepted', 'deposit_secured', 'event_sealed', 'event_completed', 'sots_window_closed', 'archived'];
    const absents  = ['balance_pending', 'payable', 'settled', 'deposit_pending', 'contestation_window'];
    for (const e of attendus) {
      if (WORM_STATES[e] === undefined) throw new Error(`${e} doit être dans WORM_STATES (Moment D-014)`);
    }
    for (const e of absents) {
      if (WORM_STATES[e] !== undefined) throw new Error(`${e} doit être ABSENT de WORM_STATES`);
    }
    const count = Object.keys(WORM_STATES).length;
    if (count !== 6) throw new Error(`WORM_STATES doit avoir 6 entrées. Actuel: ${count}`);
  });

  // ── Section 4 : Validation systemIds ──────────────────────
  console.log('\n── Validation systemIds souverains ───────────\n');

  await test('engagementId manquant bloqué (TRANSITION_ERROR)', async () => {
    try {
      await transitionEngagement({ currentState: 'proposed', targetState: 'accepted', actor: USR_ID });
      throw new Error('Aurait dû être bloquée');
    } catch (err) {
      if (!err.message.includes('TRANSITION_ERROR')) throw new Error(`Mauvaise erreur: ${err.message}`);
    }
  });

  await test('engagementId non-souverain bloqué (INVALID_SYSTEM_ID)', async () => {
    try {
      await transitionEngagement({ engagementId: 'hacked-id', currentState: 'proposed', targetState: 'accepted', actor: USR_ID, context: CONTEXTE_NOMINAL });
      throw new Error('Aurait dû être bloquée');
    } catch (err) {
      if (!err.message.includes('INVALID_SYSTEM_ID')) throw new Error(`Mauvaise erreur: ${err.message}`);
    }
  });

  await test('actor non-souverain bloqué (INVALID_SYSTEM_ID)', async () => {
    try {
      await transitionEngagement({ engagementId: ENG_ID, currentState: 'proposed', targetState: 'accepted', actor: 'admin', context: CONTEXTE_NOMINAL });
      throw new Error('Aurait dû être bloquée');
    } catch (err) {
      if (!err.message.includes('INVALID_SYSTEM_ID')) throw new Error(`Mauvaise erreur: ${err.message}`);
    }
  });

  // ── Section 5 : Table D-019-A — machine d'état V4 ─────────
  console.log('\n── Table D-019-A — machine d\'état V4 ─────────\n');

  await test('[D-019-A] Chemin nominal V4 complet via contestation_window', async () => {
    const chemin = [
      'proposed->negotiating',
      'negotiating->accepted',
      'accepted->placed',
      'placed->deposit_pending',
      'deposit_pending->deposit_secured',
      'deposit_secured->event_sealed',
      'event_sealed->performed',
      'performed->event_completed',
      'event_completed->sots_window_closed',
      'sots_window_closed->contestation_window',  // [D-019-B]
      'contestation_window->payable',             // [D-019-B] expiration
      'payable->settled',
      'settled->archived',
    ];
    for (const t of chemin) {
      if (!TRANSITION_TABLE[t]) throw new Error(`Manquante dans chemin nominal V4 : ${t}`);
    }
  });

  await test('[D-019-B] sots_window_closed→payable SUPPRIMÉE', async () => {
    if (TRANSITION_TABLE['sots_window_closed->payable'])
      throw new Error('sots_window_closed→payable présente — supprimée D-019-B');
  });

  await test('[D-019-B] sots_window_closed→disputed SUPPRIMÉE', async () => {
    if (TRANSITION_TABLE['sots_window_closed->disputed'])
      throw new Error('sots_window_closed→disputed présente — supprimée D-019-B (Régime 2 = contestation_window)');
  });

  await test('[D-019-B] sots_window_closed→contestation_window présente (ContestationWindowGuard)', async () => {
    const t = TRANSITION_TABLE['sots_window_closed->contestation_window'];
    if (!t) throw new Error('sots_window_closed→contestation_window MANQUANTE — D-019-B');
    if (t.guard !== 'ContestationWindowGuard') throw new Error(`doit utiliser ContestationWindowGuard, pas ${t.guard}`);
    if (t.financialGuard) throw new Error('ne doit pas avoir financialGuard (ouverture fenêtre)');
  });

  await test('[D-019-B] contestation_window→payable présente (PresenceProofGuard)', async () => {
    const t = TRANSITION_TABLE['contestation_window->payable'];
    if (!t) throw new Error('contestation_window→payable MANQUANTE — D-019-B');
    if (t.guard !== 'PresenceProofGuard') throw new Error(`doit utiliser PresenceProofGuard, pas ${t.guard}`);
    if (!t.financialGuard) throw new Error('doit avoir financialGuard: true');
  });

  await test('[D-019-B] contestation_window→disputed présente (DisputeGuard — Régime 2)', async () => {
    const t = TRANSITION_TABLE['contestation_window->disputed'];
    if (!t) throw new Error('contestation_window→disputed MANQUANTE — D-019-B Régime 2');
    if (t.guard !== 'DisputeGuard') throw new Error(`doit utiliser DisputeGuard, pas ${t.guard}`);
    if (!t.financialGuard) throw new Error('doit avoir financialGuard: true');
  });

  await test('[D-019-B] sots_window_closed→no_show présente (source officielle)', async () => {
    if (!TRANSITION_TABLE['sots_window_closed->no_show'])
      throw new Error('sots_window_closed→no_show MANQUANTE — D-019-A');
    if (TRANSITION_TABLE['performed->no_show'])
      throw new Error('performed→no_show présente — supprimée D-019-A');
  });

  await test('[D-014-A] deposit_secured→balance_pending ABSENTE', async () => {
    if (TRANSITION_TABLE['deposit_secured->balance_pending'])
      throw new Error('deposit_secured→balance_pending présente — supprimée D-014-A');
  });

  await test('[D-014-A] deposit_secured→event_sealed présente (SealingGuard W2)', async () => {
    const t = TRANSITION_TABLE['deposit_secured->event_sealed'];
    if (!t) throw new Error('deposit_secured→event_sealed MANQUANTE — D-014-A');
    if (t.guard !== 'SealingGuard') throw new Error(`doit utiliser SealingGuard`);
    if (t.worm !== 'W2') throw new Error(`doit être WORM W2. Actuel: ${t.worm}`);
  });

  await test('[D-014-A] deposit_secured→cancelled_J7 présente (LOI ANNULATION-02)', async () => {
    const t = TRANSITION_TABLE['deposit_secured->cancelled_J7'];
    if (!t) throw new Error('deposit_secured→cancelled_J7 MANQUANTE — D-014-A LOI ANNULATION-02');
    if (!t.financialGuard) throw new Error('doit avoir financialGuard: true');
  });

  await test('[D-019-A] accepted→cancelled_pre_deposit présente', async () => {
    if (!TRANSITION_TABLE['accepted->cancelled_pre_deposit'])
      throw new Error('accepted→cancelled_pre_deposit MANQUANTE — D-019-A');
  });

  await test('[D-019-A] deposit_pending→deposit_failed présente (SC-DEPOSIT-FAIL)', async () => {
    const t = TRANSITION_TABLE['deposit_pending->deposit_failed'];
    if (!t) throw new Error('deposit_pending→deposit_failed MANQUANTE — D-019-A SC-DEPOSIT-FAIL');
    if (t.guard !== 'EventPaymentGuard') throw new Error('doit utiliser EventPaymentGuard');
  });

  await test('[D-019-A] deposit_pending→cancelled_pre_deposit ABSENTE', async () => {
    if (TRANSITION_TABLE['deposit_pending->cancelled_pre_deposit'])
      throw new Error('deposit_pending→cancelled_pre_deposit présente — interdit D-019-A');
  });

  await test('[D-019-A] terminaisons directes vers archived (sans refunded)', async () => {
    const requis = [
      'cancelled_J30->archived', 'cancelled_J7->archived', 'cancelled_pre_deposit->archived',
      'no_show_pre_event->archived', 'deposit_failed->archived', 'partially_settled->archived',
    ];
    const interdits = [
      'cancelled_J30->refunded', 'cancelled_J7->refunded',
      'cancelled_pre_deposit->refunded', 'no_show_pre_event->refunded',
    ];
    for (const t of requis) {
      if (!TRANSITION_TABLE[t]) throw new Error(`Terminaison directe manquante : ${t}`);
    }
    for (const t of interdits) {
      if (TRANSITION_TABLE[t]) throw new Error(`Terminaison indirecte interdite présente : ${t}`);
    }
  });

  await test('[D-019-A] cycle transfert complet', async () => {
    const requis = [
      'transfer_requested->transfer_accepted', 'transfer_requested->transfer_refused',
      'transfer_requested->no_show_pre_event', 'transfer_accepted->placed', 'transfer_refused->placed',
    ];
    for (const t of requis) {
      if (!TRANSITION_TABLE[t]) throw new Error(`Cycle transfert incomplet : ${t}`);
    }
    if (TRANSITION_TABLE['placed->transfer_requested'])
      throw new Error('placed→transfer_requested présente — supprimée Q1 (deposit_secured seulement)');
  });

  await test('[D-019-A] disputed→partially_settled présente (SC-08-PARTIEL)', async () => {
    const t = TRANSITION_TABLE['disputed->partially_settled'];
    if (!t) throw new Error('disputed→partially_settled MANQUANTE — D-019-A SC-08-PARTIEL');
    if (t.guard !== 'DisputeResolutionGuard') throw new Error(`doit utiliser DisputeResolutionGuard`);
  });

  // ── Section 6 : Frein d'Urgence D-019-B ───────────────────
  console.log('\n── Frein d\'Urgence D-019-B ────────────────────\n');

  await test('[D-019-B] Frein d\'Urgence depuis les 8 états + payable', async () => {
    const etats = [
      'proposed', 'negotiating', 'accepted', 'placed',
      'deposit_pending', 'deposit_secured', 'event_sealed', 'performed', 'payable',
    ];
    for (const e of etats) {
      const t = `${e}->disputed`;
      if (!TRANSITION_TABLE[t]) throw new Error(`Frein d'Urgence manquant : ${t}`);
      if (TRANSITION_TABLE[t].guard !== 'DisputeGuard') throw new Error(`${t} doit utiliser DisputeGuard`);
    }
  });

  await test('[D-019-B] event_completed→disputed ABSENT du Frein d\'Urgence', async () => {
    if (TRANSITION_TABLE['event_completed->disputed'])
      throw new Error('event_completed→disputed présente — hors Régime 1 (D-019-B)');
  });

  await test('[D-019-B] sots_window_closed→disputed ABSENT du Frein d\'Urgence', async () => {
    if (TRANSITION_TABLE['sots_window_closed->disputed'])
      throw new Error('sots_window_closed→disputed présente — hors Régime 1 (D-019-B)');
  });

  await test('Sorties de dispute couvertes (payable/partially_settled/refunded)', async () => {
    for (const t of ['disputed->payable', 'disputed->partially_settled', 'disputed->refunded']) {
      if (!TRANSITION_TABLE[t]) throw new Error(`${t} manquante`);
      if (TRANSITION_TABLE[t].guard !== 'DisputeResolutionGuard')
        throw new Error(`${t} doit utiliser DisputeResolutionGuard`);
    }
  });

  await test('Q1 V11 — transfert depuis deposit_secured avec financialGuard', async () => {
    const t = TRANSITION_TABLE['deposit_secured->transfer_requested'];
    if (!t) throw new Error('deposit_secured→transfer_requested MANQUANTE');
    if (!t.financialGuard) throw new Error('doit avoir financialGuard: true');
  });

  await test('États terminaux — tous les chemins finissent en archived', async () => {
    const terminaux = [
      'settled->archived', 'refunded->archived', 'withdrawn->archived',
      'cancelled_pre_deposit->archived', 'cancelled_J30->archived', 'cancelled_J7->archived',
      'no_show_pre_event->archived', 'deposit_failed->archived', 'partially_settled->archived',
    ];
    for (const t of terminaux) {
      if (!TRANSITION_TABLE[t]) throw new Error(`Transition terminale manquante : ${t}`);
    }
  });

  // ── Section 7 : Intégration ────────────────────────────────
  console.log('\n── Intégration transitionEngagement() ───────\n');

  await test('proposed→negotiating passe par transitionEngagement()', async () => {
    const r = await transitionEngagement({
      engagementId: 'ENG-INTEG-TEST-0001', currentState: 'proposed', targetState: 'negotiating',
      actor: 'USR-INTEG-TEST-0001',
      context: { talentUserId: 'USR-TEST-ALEX-000001', organizerUserId: 'USR-TEST-TREFLE-0001', roleMetier: 'DJ' },
    });
    if (!r.success) throw new Error('Attendu success:true');
  });

  await test('[D-019-B] sots_window_closed ne peut plus aller directement à payable', async () => {
    try {
      await transitionEngagement({
        engagementId: ENG_ID, currentState: 'sots_window_closed', targetState: 'payable',
        actor: USR_ID, context: {},
      });
      throw new Error('Aurait dû être bloquée — D-019-B supprime sots_window_closed→payable');
    } catch (err) {
      if (!err.message.includes('TRANSITION_UNAUTHORIZED')) throw new Error(`Mauvaise erreur: ${err.message}`);
    }
  });

  await test('[D-019-B] sots_window_closed→contestation_window passe', async () => {
    const r = await transitionEngagement({
      engagementId: ENG_ID, currentState: 'sots_window_closed', targetState: 'contestation_window',
      actor: USR_ID, context: {},
    });
    if (!r.success) throw new Error('Attendu success:true');
    if (r.newState !== 'contestation_window') throw new Error('newState attendu: contestation_window');
  });

  // ── Résultat ──────────────────────────────────────────────
  console.log(`\n═══════════════════════════════════════════════`);
  console.log(`Résultat : ${passed} PASSED / ${failed} FAILED`);
  if (failed === 0) {
    console.log('TRANSITION-01 V13 : ✓ PASSED');
  } else {
    console.log('TRANSITION-01 V13 : ✗ FAILED — corriger avant de continuer');
    process.exit(1);
  }
  console.log('═══════════════════════════════════════════════');
}

run();