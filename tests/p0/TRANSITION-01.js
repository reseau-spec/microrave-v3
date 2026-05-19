/**
 * MICRO RAVE V3 — Test P0 : TRANSITION-01
 * ============================================================
 * Vérifie que transitionEngagement() est l'unique porte
 * et que les violations sont bloquées.
 *
 * DÉCISIONS FONDATEUR V11 (Mai 2026) :
 *   Q1 — TRANSFERT depuis deposit_secured uniquement (placed→transfer supprimé)
 *   Q2 — CHEMIN DEUX ÉTAPES : deposit_pending → deposit_secured → balance_pending → event_sealed
 *   Q3 — LITIGE depuis tous les états actifs (* → disputed)
 *
 * ALIGNEMENT D-019 | Machine d'état complète révisée :
 *   - accepted→cancelled_pre_deposit ajouté
 *   - deposit_pending→deposit_failed ajouté
 *   - deposit_pending→cancelled_pre_deposit SUPPRIMÉ
 *   - cancelled_J30/J7/pre_deposit/no_show_pre_event → archived directement
 *   - sots_window_closed→no_show (source officielle du no_show)
 *   - performed→no_show SUPPRIMÉ
 *   - transfer_requested→no_show_pre_event ajouté
 *   - no_show_pre_event→archived (pas via refunded)
 *   - disputed→partially_settled ajouté
 *   - placed→transfer_requested SUPPRIMÉ
 *
 * Source : OS V11 section 16.2 — LOI TRANSITION-01 · D-019
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
      engagementId: ENG_ID, currentState: 'proposed', targetState: 'accepted',
      actor: USR_ID, context: CONTEXTE_NOMINAL,
    });
    if (!result.success) throw new Error('Attendu success:true');
    if (result.newState !== 'accepted') throw new Error(`newState attendu: accepted`);
  });

  await test('sots_window_closed→payable retourne success:true', async () => {
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

  await test('settled→proposed est bloquée (TRANSITION_UNAUTHORIZED)', async () => {
    // OS V11 : settled est NON-WORM — bloqué par la table, pas par WORMGuard.
    try {
      await transitionEngagement({
        engagementId: ENG_ID, currentState: 'settled', targetState: 'proposed',
        actor: USR_ID, context: {},
      });
      throw new Error('Aurait dû être bloquée');
    } catch (err) {
      if (!err.message.includes('TRANSITION_UNAUTHORIZED'))
        throw new Error(`Attendu TRANSITION_UNAUTHORIZED, reçu: ${err.message}`);
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

  await test('balance_pending dans WORM_STATES W1 (OS V11 Q2)', async () => {
    if (WORM_STATES['balance_pending'] !== 'W1')
      throw new Error(`balance_pending doit être W1. Actuel: ${WORM_STATES['balance_pending'] ?? 'ABSENT'}`);
  });

  await test('payable dans WORM_STATES W1', async () => {
    if (WORM_STATES['payable'] !== 'W1')
      throw new Error(`payable absent de WORM_STATES`);
  });

  await test('settled absent de WORM_STATES (non-moment officiel)', async () => {
    // OS V11 changelog : "settled retiré de WORM (non-moment WORM officiel)"
    if (WORM_STATES['settled'] !== undefined)
      throw new Error(`settled doit être absent de WORM_STATES. Actuel: ${WORM_STATES['settled']}`);
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

  // ── Section 4 : Table souveraine D-019 ────────────────────
  console.log('\n── Table souveraine D-019 ────────────────────\n');

  await test('La table contient au moins 20 transitions', async () => {
    const count = Object.keys(TRANSITION_TABLE).length;
    if (count < 20) throw new Error(`Seulement ${count} transitions — attendu: 20+`);
  });

  await test('Chemin nominal complet proposed→archived (D-019 + OS V11 Q2)', async () => {
    // D-019 chemin nominal + OS V11 Q2 (deux étapes paiement)
    const chemin = [
      'proposed->negotiating',
      'negotiating->accepted',
      'accepted->placed',
      'placed->deposit_pending',
      'deposit_pending->deposit_secured',
      'deposit_secured->balance_pending',
      'balance_pending->event_sealed',
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

  await test('D-019 — accepted→cancelled_pre_deposit présente', async () => {
    // D-019 : accepted → placed / cancelled_pre_deposit
    if (!TRANSITION_TABLE['accepted->cancelled_pre_deposit'])
      throw new Error('accepted→cancelled_pre_deposit MANQUANTE — D-019');
  });

  await test('D-019 — deposit_pending→deposit_failed présente', async () => {
    // D-019 : deposit_pending → deposit_secured / deposit_failed
    if (!TRANSITION_TABLE['deposit_pending->deposit_failed'])
      throw new Error('deposit_pending→deposit_failed MANQUANTE — D-019');
  });

  await test('D-019 — deposit_pending→cancelled_pre_deposit ABSENTE', async () => {
    // D-019 n'autorise PAS l'annulation depuis deposit_pending (fail-closed)
    if (TRANSITION_TABLE['deposit_pending->cancelled_pre_deposit'])
      throw new Error('deposit_pending→cancelled_pre_deposit présente — interdit par D-019');
  });

  await test('D-019 — terminaisons annulations directes vers archived (sans refunded)', async () => {
    // D-019 : cancelled_J30 → archived / cancelled_J7 → archived / cancelled_pre_deposit → archived
    for (const t of ['cancelled_J30->archived', 'cancelled_J7->archived', 'cancelled_pre_deposit->archived']) {
      if (!TRANSITION_TABLE[t]) throw new Error(`${t} MANQUANTE — D-019 terminaison directe`);
    }
    // Vérifier que les anciens chemins via refunded ont été supprimés
    for (const t of ['cancelled_J30->refunded', 'cancelled_J7->refunded', 'cancelled_pre_deposit->refunded']) {
      if (TRANSITION_TABLE[t]) throw new Error(`${t} présente — supprimée par D-019`);
    }
  });

  await test('D-019 — transfer_requested→no_show_pre_event présente', async () => {
    // D-019 : transfer_requested → transfer_accepted / transfer_refused / no_show_pre_event
    if (!TRANSITION_TABLE['transfer_requested->no_show_pre_event'])
      throw new Error('transfer_requested→no_show_pre_event MANQUANTE — D-019');
  });

  await test('D-019 — event_sealed→no_show_pre_event ABSENTE', async () => {
    // D-019 : no_show_pre_event vient de transfer_requested, pas de event_sealed
    if (TRANSITION_TABLE['event_sealed->no_show_pre_event'])
      throw new Error('event_sealed→no_show_pre_event présente — supprimée par D-019');
  });

  await test('D-019 — no_show_pre_event→archived présente (pas via refunded)', async () => {
    if (!TRANSITION_TABLE['no_show_pre_event->archived'])
      throw new Error('no_show_pre_event→archived MANQUANTE — D-019');
    if (TRANSITION_TABLE['no_show_pre_event->refunded'])
      throw new Error('no_show_pre_event→refunded présente — supprimée par D-019');
  });

  await test('D-019 — sots_window_closed→no_show présente (source officielle du no_show)', async () => {
    // D-019 : sots_window_closed → payable / disputed / no_show
    // Le système statue sur le no_show après la fenêtre SOTS, pas depuis performed
    if (!TRANSITION_TABLE['sots_window_closed->no_show'])
      throw new Error('sots_window_closed→no_show MANQUANTE — D-019');
    if (TRANSITION_TABLE['performed->no_show'])
      throw new Error('performed→no_show présente — supprimée par D-019');
  });

  await test('D-019 — disputed→partially_settled présente', async () => {
    // D-019 : disputed → payable / partially_settled / refunded
    if (!TRANSITION_TABLE['disputed->partially_settled'])
      throw new Error('disputed→partially_settled MANQUANTE — D-019');
  });

  await test('D-019 — placed→transfer_requested ABSENTE (Q1 : deposit_secured seulement)', async () => {
    // D-019 + OS V11 Q1 : transfert uniquement depuis deposit_secured
    if (TRANSITION_TABLE['placed->transfer_requested'])
      throw new Error('placed→transfer_requested présente — supprimée par D-019 + Q1');
    if (!TRANSITION_TABLE['deposit_secured->transfer_requested'])
      throw new Error('deposit_secured→transfer_requested manquante — Q1 V11');
  });

  await test('Q3 V11 — litige (* → disputed) depuis tous les états actifs', async () => {
    // OS V11 Q3 souverain — poignée de frein d'urgence
    const etatsActifs = [
      'proposed', 'negotiating', 'accepted', 'placed',
      'deposit_pending', 'deposit_secured', 'balance_pending',
      'event_sealed', 'performed', 'event_completed',
      'sots_window_closed', 'payable',
    ];
    for (const etat of etatsActifs) {
      const t = `${etat}->disputed`;
      if (!TRANSITION_TABLE[t])
        throw new Error(`${t} MANQUANTE — OS V11 Q3 : poignée de frein d'urgence`);
      if (TRANSITION_TABLE[t].guard !== 'DisputeGuard')
        throw new Error(`${t} doit utiliser DisputeGuard`);
    }
  });

  await test('Sorties de dispute couvertes (payable/partially_settled/refunded)', async () => {
    for (const t of ['disputed->payable', 'disputed->partially_settled', 'disputed->refunded']) {
      if (!TRANSITION_TABLE[t]) throw new Error(`${t} manquante — D-019`);
      if (TRANSITION_TABLE[t].guard !== 'DisputeResolutionGuard')
        throw new Error(`${t} doit utiliser DisputeResolutionGuard`);
    }
  });

  await test('Q1 V11 — transfert depuis deposit_secured avec financialGuard', async () => {
    const t = TRANSITION_TABLE['deposit_secured->transfer_requested'];
    if (!t) throw new Error('deposit_secured→transfer_requested MANQUANTE');
    if (!t.financialGuard) throw new Error('doit avoir financialGuard: true');
    if (!TRANSITION_TABLE['transfer_requested->transfer_accepted']) throw new Error('transfer_accepted manquante');
    if (!TRANSITION_TABLE['transfer_requested->transfer_refused'])  throw new Error('transfer_refused manquante');
  });

  await test('Cycle transfert complet (accepted/refused → placed)', async () => {
    // D-013 : fermeture de la boucle — un transfert réussi ramène à placed
    if (!TRANSITION_TABLE['transfer_accepted->placed']) throw new Error('transfer_accepted→placed manquante');
    if (!TRANSITION_TABLE['transfer_refused->placed'])  throw new Error('transfer_refused→placed manquante');
  });

  await test('États terminaux : tous les chemins finissent en archived', async () => {
    const terminaux = [
      'settled->archived', 'refunded->archived', 'withdrawn->archived',
      'cancelled_pre_deposit->archived', 'cancelled_J30->archived',
      'cancelled_J7->archived', 'no_show_pre_event->archived',
      'deposit_failed->archived',
    ];
    for (const t of terminaux) {
      if (!TRANSITION_TABLE[t]) throw new Error(`Transition terminale manquante : ${t}`);
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