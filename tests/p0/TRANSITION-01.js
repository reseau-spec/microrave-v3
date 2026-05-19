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
 *   Q2 — CHEMIN NOMINAL COMPLET : deposit_pending → deposit_secured → balance_pending → event_sealed
 *        (deux étapes de paiement maintenues — doctrine industrie événementielle)
 *   Q3 — LITIGE OUVERT À TOUT MOMENT : * → disputed
 *        (poignée de frein d'urgence — crises avant le jour J couvertes)
 *
 * Source : OS V11 section 16.2 — LOI TRANSITION-01
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

  // MODIFICATION 1 — Ligne 102 : settled→proposed
  // Commentaire mis à jour : settled est NON-WORM selon OS V11 changelog.
  // Le test lui-même est correct (TRANSITION_UNAUTHORIZED depuis la table) — seul le commentaire change.
  await test('settled→proposed est bloquée (TRANSITION_UNAUTHORIZED)', async () => {
    // OS V11 : settled est un état NON-WORM (non-moment officiel).
    // Il est bloqué par la table (aucune transition sortante), pas par le WORMGuard.
    // "settled retiré de WORM (non-moment WORM officiel)" — OS V11 section changelog.
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

  // MODIFICATION 2 — Ligne 128 : balance_pending dans WORM_STATES W1
  // Ancienne assertion : vérifiait que balance_pending était ABSENT de WORM_STATES.
  // Nouvelle assertion : vérifie que balance_pending est W1 (OS V11 Q2 — état protégé).
  await test('balance_pending dans WORM_STATES W1 (OS V11 Q2 — état protégé)', async () => {
    // OS V11 Q2 : balance_pending est un état actif et protégé W1.
    // "Solde demandé · acompte reçu · artiste engagé" — toucher cet état = erreur corrigeable.
    // "balance_pending ajouté dans WORM_STATES W1" — OS V11 section changelog.
    if (WORM_STATES['balance_pending'] !== 'W1')
      throw new Error(
        `balance_pending doit être W1 dans WORM_STATES — OS V11 section 2.7. ` +
        `Actuel: ${WORM_STATES['balance_pending'] ?? 'ABSENT'}`
      );
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

  // MODIFICATION 3 — Ligne 187 : Chemin nominal complet proposed→archived
  // Ancienne assertion : chemin avec saut direct deposit_pending→event_sealed (interdit par OS V11 Q2).
  // Nouvelle assertion : chemin deux étapes irréductible conforme OS V11 Q2.
  await test('Chemin nominal complet proposed→archived en deux étapes (OS V11 Q2)', async () => {
    // OS V11 Q2 : chemin deux étapes irréductible.
    // "Supprimer deposit_secured détruirait la garantie industrielle." — OS V11 section 2.7.1
    // Pierre de Rosette V11 C02 : accepted → deposit_secured → balance_pending → event_sealed
    const chemin = [
      'proposed->accepted',
      'accepted->placed',
      'placed->deposit_pending',
      'deposit_pending->deposit_secured',   // Moment WORM 2 — acompte confirmé
      'deposit_secured->balance_pending',   // BalanceRequestGuard — solde demandé
      'balance_pending->event_sealed',      // SealingGuard W2 — WORM financier complet
      'event_sealed->performed',
      'performed->event_completed',
      'event_completed->sots_window_closed',
      'sots_window_closed->payable',
      'payable->settled',
      'settled->archived',
    ];
    for (const t of chemin) {
      if (!TRANSITION_TABLE[t])
        throw new Error(`Transition manquante dans le chemin nominal deux étapes : ${t}`);
    }
  });

  // MODIFICATION 4 — Ligne 200 : balance_pending→event_sealed présente (était : absente)
  // Ancienne assertion : vérifiait que balance_pending→event_sealed était ABSENTE (invalide la règle OS V11).
  // Nouvelle assertion : vérifie que balance_pending→event_sealed est PRÉSENTE avec SealingGuard W2.
  await test('balance_pending→event_sealed présente avec SealingGuard W2 (OS V11 Q2)', async () => {
    // OS V11 : c'est ici que l'argent est scellé. SealingGuard + WORM W2.
    // "balance_pending→event_sealed : solde reçu + ContractSnapshot phase 2" — OS V11 section 2.7.1
    const t = TRANSITION_TABLE['balance_pending->event_sealed'];
    if (!t)
      throw new Error('balance_pending→event_sealed MANQUANTE — le scellement est impossible (OS V11 Q2)');
    if (t.guard !== 'SealingGuard')
      throw new Error(`balance_pending→event_sealed doit utiliser SealingGuard, pas ${t.guard}`);
    if (t.worm !== 'W2')
      throw new Error(`balance_pending→event_sealed doit être WORM W2 (Moment 3 — Fraude). Actuel: ${t.worm}`);
    if (!t.financialGuard)
      throw new Error('balance_pending→event_sealed doit avoir financialGuard: true — argent présent');
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

  // MODIFICATION 5 — Ligne 223 : Q3 — litige depuis TOUS les états actifs (était : uniquement event_completed)
  // Ancienne assertion : vérifiait que accepted→disputed et event_sealed→disputed étaient ABSENTES.
  // Nouvelle assertion : vérifie que * → disputed est présente depuis tous les états actifs.
  await test('Q3 V11 — litige (* → disputed) depuis tous les états actifs', async () => {
    // OS V11 Q3 : "la poignée de frein d'urgence doit fonctionner à tout moment."
    // Cas réels : lieu dangereux J-3, rupture contrat avant show, non-paiement en préparation.
    // "La restriction au seul event_completed aurait laissé des fonds en otage sans recours légal."
    // Source : OS V11 section 2.7.1.
    const etatsActifs = [
      'proposed', 'negotiating', 'accepted', 'placed',
      'deposit_pending', 'deposit_secured', 'balance_pending',
      'event_sealed', 'performed', 'event_completed',
      'sots_window_closed', 'payable',
    ];
    for (const etat of etatsActifs) {
      const transition = `${etat}->disputed`;
      if (!TRANSITION_TABLE[transition])
        throw new Error(
          `${transition} MANQUANTE — poignée de frein d'urgence inaccessible depuis ${etat}. ` +
          `OS V11 Q3 : * → disputed depuis tous les états actifs.`
        );
      if (TRANSITION_TABLE[transition].guard !== 'DisputeGuard')
        throw new Error(`${transition} doit utiliser DisputeGuard`);
    }
  });

  await test('Q3 fondateur — sorties de dispute avec DisputeResolutionGuard', async () => {
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