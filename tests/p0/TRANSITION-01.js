/**
 * MICRO RAVE V3 — Test P0 : TRANSITION-01
 * ============================================================
 * Vérifie que transitionEngagement() est l'unique porte
 * et que les violations sont bloquées.
 *
 * DÉCISIONS FONDATEUR V12 :
 *   [D-014-A] balance_pending retiré de WORM_STATES et de la machine d'état
 *             SchedulerDueTask créée dans EventPaymentGuard à deposit_secured
 *             Chemin nominal : deposit_secured → event_sealed (direct)
 *   [D-014-B] payable retiré de WORM_STATES — état opérationnel non-WORM
 *
 * DÉCISIONS FONDATEUR V11 :
 *   Q1 — TRANSFERT depuis deposit_secured uniquement
 *   Q3 — LITIGE depuis tous les états actifs (* → disputed)
 *
 * ALIGNEMENT D-019 :
 *   - accepted→cancelled_pre_deposit ajouté
 *   - deposit_pending→deposit_failed ajouté
 *   - deposit_pending→cancelled_pre_deposit SUPPRIMÉ
 *   - cancelled_J30/J7/pre_deposit/no_show_pre_event → archived directement
 *   - sots_window_closed→no_show (source officielle du no_show)
 *   - transfer_requested→no_show_pre_event ajouté
 *   - disputed→partially_settled ajouté
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
console.log('Test P0 : TRANSITION-01 (V12)');
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

  await test('[D-019-B] sots_window_closed→contestation_window retourne success:true', async () => {
    const result = await transitionEngagement({
      engagementId: ENG_ID, currentState: 'sots_window_closed', targetState: 'contestation_window',
      actor: USR_ID, context: {},
    });
    if (!result.success) throw new Error('Attendu success:true');
    if (result.newState !== 'contestation_window') throw new Error(`newState attendu: contestation_window`);
  });

  await test('[D-019-B] sots_window_closed→payable BLOQUÉE (D-045 abrogé)', async () => {
    try {
      await transitionEngagement({
        engagementId: ENG_ID, currentState: 'sots_window_closed', targetState: 'payable',
        actor: USR_ID, context: {},
      });
      throw new Error('sots_window_closed→payable doit être bloquée — D-019-B');
    } catch (err) {
      if (!err.message.includes('TRANSITION_UNAUTHORIZED'))
        throw new Error(`Mauvaise erreur: ${err.message}`);
    }
  });

  await test('[D-019-B] contestation_window→payable présente (expiration fenêtre)', async () => {
    if (!TRANSITION_TABLE['contestation_window->payable'])
      throw new Error('contestation_window→payable MANQUANTE — D-019-B');
  });

  await test('[D-019-B] contestation_window→disputed présente (Contestation de Prestation)', async () => {
    if (!TRANSITION_TABLE['contestation_window->disputed'])
      throw new Error('contestation_window→disputed MANQUANTE — D-019-B');
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
    // settled : non-WORM, bloqué par la table
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

  // ── [D-014-A] balance_pending RETIRÉ de WORM_STATES ───────
  await test('[D-014-A] balance_pending ABSENT de WORM_STATES', async () => {
    // D-014-A : balance_pending fusionné dans deposit_secured.
    // "En attente de solde" = "acompte reçu" — même réalité humaine, même moment.
    if (WORM_STATES['balance_pending'] !== undefined)
      throw new Error(
        `balance_pending doit être ABSENT de WORM_STATES — D-014-A. ` +
        `Actuel: ${WORM_STATES['balance_pending']}`
      );
  });

  // ── [D-014-B] payable RETIRÉ de WORM_STATES ───────────────
  await test('[D-014-B] payable ABSENT de WORM_STATES', async () => {
    // D-014-B : payable est un état opérationnel de file d'attente.
    // Protégé par D-101 (6 verrous anti-double payout), pas par WORM.
    if (WORM_STATES['payable'] !== undefined)
      throw new Error(
        `payable doit être ABSENT de WORM_STATES — D-014-B. ` +
        `Actuel: ${WORM_STATES['payable']}`
      );
  });

  await test('settled absent de WORM_STATES (non-moment officiel)', async () => {
    if (WORM_STATES['settled'] !== undefined)
      throw new Error(`settled doit être absent de WORM_STATES. Actuel: ${WORM_STATES['settled']}`);
  });

  await test('WORM_STATES contient exactement les 6 moments officiels', async () => {
    // D-014 : 6 moments — accepted, deposit_secured, event_sealed,
    // event_completed, sots_window_closed, archived
    const attendus = ['accepted', 'deposit_secured', 'event_sealed', 'event_completed', 'sots_window_closed', 'archived'];
    const absents  = ['balance_pending', 'payable', 'settled', 'deposit_pending'];

    for (const etat of attendus) {
      if (WORM_STATES[etat] === undefined)
        throw new Error(`${etat} doit être dans WORM_STATES (Moment officiel D-014)`);
    }
    for (const etat of absents) {
      if (WORM_STATES[etat] !== undefined)
        throw new Error(`${etat} doit être ABSENT de WORM_STATES`);
    }

    const count = Object.keys(WORM_STATES).length;
    if (count !== 6)
      throw new Error(`WORM_STATES doit contenir exactement 6 entrées. Actuel: ${count}`);
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

  // ── Section 4 : Table souveraine D-019 + V12 ──────────────
  console.log('\n── Table souveraine D-019 + V12 ──────────────\n');

  await test('La table contient au moins 20 transitions', async () => {
    const count = Object.keys(TRANSITION_TABLE).length;
    if (count < 20) throw new Error(`Seulement ${count} transitions — attendu: 20+`);
  });

  await test('[D-014-A] Chemin nominal simplifié deposit_secured → event_sealed', async () => {
    // D-014-A : balance_pending supprimé. Chemin direct.
    const chemin = [
      'proposed->negotiating',
      'negotiating->accepted',
      'accepted->placed',
      'placed->deposit_pending',
      'deposit_pending->deposit_secured',
      'deposit_secured->event_sealed',   // [D-014-A] direct — sans balance_pending
      'event_sealed->performed',
      'performed->event_completed',
      'event_completed->sots_window_closed',
      'sots_window_closed->contestation_window',  // [D-019-B] via contestation_window
      'contestation_window->payable',
      'payable->settled',
      'settled->archived',
    ];
    for (const t of chemin) {
      if (!TRANSITION_TABLE[t]) throw new Error(`Transition manquante dans le chemin nominal : ${t}`);
    }
  });

  await test('[D-014-A] deposit_secured→balance_pending ABSENTE (état supprimé)', async () => {
    // D-014-A : balance_pending n'existe plus dans la machine d'état
    if (TRANSITION_TABLE['deposit_secured->balance_pending'])
      throw new Error('deposit_secured→balance_pending présente — supprimée par D-014-A');
  });

  await test('[D-014-A] balance_pending→event_sealed ABSENTE (remplacée)', async () => {
    if (TRANSITION_TABLE['balance_pending->event_sealed'])
      throw new Error('balance_pending→event_sealed présente — supprimée par D-014-A');
  });

  await test('[D-014-A] balance_pending→cancelled_J7 ABSENTE (remplacée)', async () => {
    if (TRANSITION_TABLE['balance_pending->cancelled_J7'])
      throw new Error('balance_pending→cancelled_J7 présente — supprimée par D-014-A');
  });

  await test('[D-014-A] deposit_secured→cancelled_J7 présente (LOI ANNULATION-02)', async () => {
    // D-014-A : annulation automatique J-6 depuis deposit_secured directement
    const t = TRANSITION_TABLE['deposit_secured->cancelled_J7'];
    if (!t) throw new Error('deposit_secured→cancelled_J7 MANQUANTE — D-014-A LOI ANNULATION-02');
    if (t.guard !== 'CancellationGuard') throw new Error(`doit utiliser CancellationGuard, pas ${t.guard}`);
    if (!t.financialGuard) throw new Error('doit avoir financialGuard: true — acompte reçu');
  });

  await test('[D-014-A] deposit_secured→event_sealed présente avec SealingGuard W2', async () => {
    // D-014-A : SealingGuard s'active depuis deposit_secured directement
    const t = TRANSITION_TABLE['deposit_secured->event_sealed'];
    if (!t) throw new Error('deposit_secured→event_sealed MANQUANTE — D-014-A');
    if (t.guard !== 'SealingGuard') throw new Error(`doit utiliser SealingGuard, pas ${t.guard}`);
    if (t.worm !== 'W2') throw new Error(`doit être WORM W2. Actuel: ${t.worm}`);
    if (!t.financialGuard) throw new Error('doit avoir financialGuard: true');
  });

  await test('D-019 — accepted→cancelled_pre_deposit présente', async () => {
    if (!TRANSITION_TABLE['accepted->cancelled_pre_deposit'])
      throw new Error('accepted→cancelled_pre_deposit MANQUANTE — D-019');
  });

  await test('D-019 — deposit_pending→deposit_failed présente', async () => {
    if (!TRANSITION_TABLE['deposit_pending->deposit_failed'])
      throw new Error('deposit_pending→deposit_failed MANQUANTE — D-019');
  });

  await test('D-019 — deposit_pending→cancelled_pre_deposit ABSENTE', async () => {
    if (TRANSITION_TABLE['deposit_pending->cancelled_pre_deposit'])
      throw new Error('deposit_pending→cancelled_pre_deposit présente — interdit par D-019');
  });

  await test('D-019 — terminaisons annulations directes vers archived', async () => {
    for (const t of ['cancelled_J30->archived', 'cancelled_J7->archived', 'cancelled_pre_deposit->archived']) {
      if (!TRANSITION_TABLE[t]) throw new Error(`${t} MANQUANTE — D-019`);
    }
    for (const t of ['cancelled_J30->refunded', 'cancelled_J7->refunded', 'cancelled_pre_deposit->refunded']) {
      if (TRANSITION_TABLE[t]) throw new Error(`${t} présente — supprimée par D-019`);
    }
  });

  await test('D-019 — transfer_requested→no_show_pre_event présente', async () => {
    if (!TRANSITION_TABLE['transfer_requested->no_show_pre_event'])
      throw new Error('transfer_requested→no_show_pre_event MANQUANTE — D-019');
  });

  await test('D-019 — no_show_pre_event→archived présente (pas via refunded)', async () => {
    if (!TRANSITION_TABLE['no_show_pre_event->archived'])
      throw new Error('no_show_pre_event→archived MANQUANTE — D-019');
    if (TRANSITION_TABLE['no_show_pre_event->refunded'])
      throw new Error('no_show_pre_event→refunded présente — supprimée par D-019');
  });

  await test('D-019 — sots_window_closed→no_show présente (source officielle)', async () => {
    if (!TRANSITION_TABLE['sots_window_closed->no_show'])
      throw new Error('sots_window_closed→no_show MANQUANTE — D-019');
    if (TRANSITION_TABLE['performed->no_show'])
      throw new Error('performed→no_show présente — supprimée par D-019');
  });

  await test('D-019 — disputed→partially_settled présente', async () => {
    if (!TRANSITION_TABLE['disputed->partially_settled'])
      throw new Error('disputed→partially_settled MANQUANTE — D-019');
  });

  await test('[D-019-B] Frein d\'Urgence — Régime 1 (* → disputed, 8+1 états)', async () => {
    // D-019-B : Frein d'Urgence applicable depuis 8 états pré-event + payable
    // PAS depuis : event_completed, sots_window_closed, contestation_window
    const etatsActifs = [
      'proposed', 'negotiating', 'accepted', 'placed',
      'deposit_pending', 'deposit_secured',
      'event_sealed', 'performed', 'payable',
    ];
    for (const etat of etatsActifs) {
      const t = `${etat}->disputed`;
      if (!TRANSITION_TABLE[t])
        throw new Error(`${t} MANQUANTE — D-019-B Frein d'Urgence`);
      if (TRANSITION_TABLE[t].guard !== 'DisputeGuard')
        throw new Error(`${t} doit utiliser DisputeGuard`);
    }
    // D-019-B : event_completed et sots_window_closed NE SONT PAS dans le Frein d'Urgence
    // contestation_window->disputed EST présente (Régime 2 — Contestation de Prestation)
    for (const etat of ['event_completed', 'sots_window_closed']) {
      const t = `${etat}->disputed`;
      if (TRANSITION_TABLE[t])
        throw new Error(`${t} PRÉSENTE — interdit par D-019-B (hors Frein d'Urgence Régime 1)`);
    }
    // contestation_window→disputed = Régime 2 (Contestation de Prestation) — DOIT exister
    if (!TRANSITION_TABLE['contestation_window->disputed'])
      throw new Error('contestation_window->disputed MANQUANTE — D-019-B Régime 2');
  });

  await test('Sorties de dispute couvertes (payable/partially_settled/refunded)', async () => {
    for (const t of ['disputed->payable', 'disputed->partially_settled', 'disputed->refunded']) {
      if (!TRANSITION_TABLE[t]) throw new Error(`${t} manquante — D-019`);
      if (TRANSITION_TABLE[t].guard !== 'DisputeResolutionGuard')
        throw new Error(`${t} doit utiliser DisputeResolutionGuard`);
    }
  });

  await test('Q1 V12 — transfert depuis deposit_secured avec financialGuard', async () => {
    const t = TRANSITION_TABLE['deposit_secured->transfer_requested'];
    if (!t) throw new Error('deposit_secured→transfer_requested MANQUANTE');
    if (!t.financialGuard) throw new Error('doit avoir financialGuard: true');
    if (!TRANSITION_TABLE['transfer_requested->transfer_accepted']) throw new Error('transfer_accepted manquante');
    if (!TRANSITION_TABLE['transfer_requested->transfer_refused'])  throw new Error('transfer_refused manquante');
    if (TRANSITION_TABLE['placed->transfer_requested'])
      throw new Error('placed→transfer_requested présente — supprimée Q1');
  });

  await test('États terminaux : tous les chemins finissent en archived', async () => {
    const terminaux = [
      'settled->archived', 'refunded->archived', 'withdrawn->archived',
      'cancelled_pre_deposit->archived', 'cancelled_J30->archived',
      'cancelled_J7->archived', 'no_show_pre_event->archived', 'deposit_failed->archived',
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