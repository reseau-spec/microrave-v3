/**
 * MICRO RAVE V3 — Test P0 : TRANSITION-01
 * ============================================================
 * Vérifie que transitionEngagement() est la porte unique et que
 * la table est conforme à l'OS V10.1 (sections 2.6 + 2.7 + 2.7.1).
 *
 * CORRECTIONS V10.1 :
 *   - deposit_secured et balance_pending dans la table (OS V10.1 section 2.7.1 patch)
 *   - deposit_secured dans WORM_STATES W1 (Moment WORM 2 — OS V10 section 2.7)
 *   - deposit_pending retiré de WORM_STATES
 *   - Annulations depuis deposit_secured et balance_pending
 *   - contractSnapshot retourné par transitionEngagement()
 *   - financialGuard: true sur *→disputed après paiement
 *   - no_show_pre_event présent
 *   - proposed→negotiating : acteurs + roleMetier seulement
 *   - proposed→accepted / negotiating→accepted : logique complète
 *   - MissionConversionGuard bloque AVANT WORMGuard pour les transitions MCG
 *   - sots_window_closed→payable testé (chemin nominal)
 *   - DisputeResolutionGuard pour sorties de dispute
 * ============================================================
 */

'use strict';

const {
  transitionEngagement,
  TRANSITION_TABLE,
  WORM_STATES,
} = require('../../src/core/transitionEngagement');

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

// ── Contextes de test ──────────────────────────────────────────
const ENG = 'ENG-20260516-ABCDEF';
const USR = 'USR-20260516-ABCDEF';

const CONTRAT_COMPLET = {
  talentUserId:    'USR-20260516-TALENT',
  organizerUserId: 'USR-20260516-TREFLE',
  roleMetier:      'DJ',
  cachetBrutCents: 22_222,
  tier:            'Freemium',
  tauxPpm:         120_000,
};

const ACTEURS = {
  talentUserId:    'USR-20260516-TALENT',
  organizerUserId: 'USR-20260516-TREFLE',
  roleMetier:      'DJ',
};

console.log('═══════════════════════════════════════════════');
console.log('Test P0 : TRANSITION-01 — V10.1');
console.log('Source : OS V10.1 sections 2.6 + 2.7 + 2.7.1');
console.log('═══════════════════════════════════════════════\n');

async function run() {

  // ── Section 1 : proposed→negotiating (acteurs seulement) ──
  console.log('── proposed→negotiating ─────────────────────\n');

  await test('proposed→negotiating passe avec acteurs + roleMetier', async () => {
    const result = await transitionEngagement({
      engagementId: ENG, currentState: 'proposed', targetState: 'negotiating',
      actor: USR, context: ACTEURS,
    });
    if (!result.success) throw new Error('Attendu success:true');
    if (result.newState !== 'negotiating') throw new Error(`newState: ${result.newState}`);
    if (result.contractSnapshot) throw new Error('Aucun ContractSnapshot à negotiating');
  });

  await test('proposed→negotiating : cachet non requis', async () => {
    const result = await transitionEngagement({
      engagementId: ENG, currentState: 'proposed', targetState: 'negotiating',
      actor: USR, context: { ...ACTEURS },
    });
    if (!result.passed && result.reason?.includes('INVALID_CACHET')) throw new Error('Cachet ne doit pas être requis');
    if (!result.success) throw new Error('Doit passer sans cachet');
  });

  await test('proposed→negotiating : talentUserId manquant → bloqué', async () => {
    try {
      await transitionEngagement({
        engagementId: ENG, currentState: 'proposed', targetState: 'negotiating',
        actor: USR, context: { organizerUserId: 'USR-20260516-TREFLE', roleMetier: 'DJ' },
      });
      throw new Error('Aurait dû être bloqué');
    } catch (err) {
      if (!err.message.includes('MISSING_TALENT')) throw new Error(`Mauvaise erreur: ${err.message}`);
    }
  });

  // ── Section 2 : proposed→accepted ──────────────────────────
  console.log('\n── proposed→accepted ────────────────────────\n');

  await test('proposed→accepted retourne success:true + contractSnapshot', async () => {
    const result = await transitionEngagement({
      engagementId: ENG, currentState: 'proposed', targetState: 'accepted',
      actor: USR, context: CONTRAT_COMPLET,
    });
    if (!result.success) throw new Error('Attendu success:true');
    if (result.newState !== 'accepted') throw new Error(`newState: ${result.newState}`);
    if (!result.contractSnapshot) throw new Error('contractSnapshot doit être retourné pour persistence');
    if (!result.contractSnapshot.systemId.startsWith('CS1-'))
      throw new Error(`systemId invalide: ${result.contractSnapshot.systemId}`);
  });

  await test('ContractSnapshot retourné contient talentNetCents entier', async () => {
    const result = await transitionEngagement({
      engagementId: ENG, currentState: 'proposed', targetState: 'accepted',
      actor: USR, context: CONTRAT_COMPLET,
    });
    if (!result.contractSnapshot) throw new Error('contractSnapshot absent');
    const { talentNetCents, commissionMrCents } = result.contractSnapshot;
    if (!Number.isInteger(talentNetCents)) throw new Error('talentNetCents doit être entier');
    if (!Number.isInteger(commissionMrCents)) throw new Error('commissionMrCents doit être entier');
    if (talentNetCents + commissionMrCents !== CONTRAT_COMPLET.cachetBrutCents)
      throw new Error(`net + commission ≠ cachetBrut: ${talentNetCents} + ${commissionMrCents}`);
  });

  // ── Section 3 : negotiating→accepted ───────────────────────
  console.log('\n── negotiating→accepted ─────────────────────\n');

  await test('negotiating→accepted retourne contractSnapshot', async () => {
    const result = await transitionEngagement({
      engagementId: ENG, currentState: 'negotiating', targetState: 'accepted',
      actor: USR, context: {
        ...CONTRAT_COMPLET,
        negotiationHistory: [
          { offeredBy: 'talent', cachetBrutCents: 25_000, timestamp: '2026-05-16T10:00:00Z' },
          { offeredBy: 'organizer', cachetBrutCents: 22_222, timestamp: '2026-05-16T10:05:00Z' },
        ],
      },
    });
    if (!result.success) throw new Error('Attendu success:true');
    if (!result.contractSnapshot) throw new Error('contractSnapshot obligatoire');
  });

  await test('negotiating→accepted : cachet manquant → bloqué', async () => {
    const result = await transitionEngagement({
      engagementId: ENG, currentState: 'negotiating', targetState: 'accepted',
      actor: USR, context: ACTEURS,
    }).catch(err => ({ _error: err.message }));
    if (!result._error || !result._error.includes('INVALID_CACHET'))
      throw new Error('Cachet doit être requis à accepted');
  });

  // ── Section 4 : WORM ───────────────────────────────────────
  console.log('\n── WORMGuard ────────────────────────────────\n');

  await test('settled→proposed bloqué (WORM_VIOLATION_LEVEL_3)', async () => {
    try {
      await transitionEngagement({
        engagementId: ENG, currentState: 'settled', targetState: 'proposed', actor: USR,
      });
      throw new Error('Aurait dû être bloqué');
    } catch (err) {
      if (!err.message.includes('WORM_VIOLATION_LEVEL_3'))
        throw new Error(`Attendu LEVEL_3, reçu: ${err.message}`);
    }
  });

  await test('event_sealed→proposed bloqué (WORM_VIOLATION_LEVEL_2)', async () => {
    try {
      await transitionEngagement({
        engagementId: ENG, currentState: 'event_sealed', targetState: 'proposed', actor: USR,
      });
      throw new Error('Aurait dû être bloqué');
    } catch (err) {
      if (!err.message.includes('WORM_VIOLATION_LEVEL_2'))
        throw new Error(`Attendu LEVEL_2, reçu: ${err.message}`);
    }
  });

  await test('deposit_secured dans WORM_STATES W1 (Moment WORM 2)', async () => {
    if (WORM_STATES['deposit_secured'] !== 'W1')
      throw new Error(`deposit_secured doit être W1 (Moment WORM 2 — OS V10 section 2.7). Actuel: ${WORM_STATES['deposit_secured']}`);
  });

  await test('deposit_pending absent de WORM_STATES (pas un moment WORM)', async () => {
    if (WORM_STATES['deposit_pending'] !== undefined)
      throw new Error(`deposit_pending ne doit pas être dans WORM_STATES — n'est pas un moment WORM dans l'OS V10 section 2.7`);
  });

  await test('balance_pending absent de WORM_STATES (pas un moment WORM)', async () => {
    if (WORM_STATES['balance_pending'] !== undefined)
      throw new Error(`balance_pending ne doit pas être dans WORM_STATES — pas dans les 6 moments WORM de l'OS V10 section 2.7`);
  });

  // ── Section 5 : Table — conformité OS V10.1 ───────────────
  console.log('\n── Table souveraine OS V10.1 ────────────────\n');

  await test('Chemin nominal complet conforme OS V10.1 section 2.6', async () => {
    const chemin = [
      'proposed->accepted',
      'accepted->placed',
      'placed->deposit_pending',
      'deposit_pending->deposit_secured',   // OS V10.1 patch — Moment WORM 2
      'deposit_secured->balance_pending',   // OS V10.1 patch
      'balance_pending->event_sealed',      // OS V10.1 patch — SealingGuard ici seulement
      'event_sealed->performed',
      'performed->event_completed',
      'event_completed->sots_window_closed',
      'sots_window_closed->payable',
      'payable->settled',
      'settled->archived',
    ];
    for (const t of chemin) {
      if (!TRANSITION_TABLE[t])
        throw new Error(`Transition manquante : ${t}`);
    }
  });

  await test('deposit_secured→balance_pending existe (OS V10.1 patch)', async () => {
    if (!TRANSITION_TABLE['deposit_secured->balance_pending'])
      throw new Error('deposit_secured→balance_pending manquante — OS V10.1 section 2.7.1 patch');
  });

  await test('balance_pending→event_sealed existe avec SealingGuard W2 (OS V10.1 patch)', async () => {
    const t = TRANSITION_TABLE['balance_pending->event_sealed'];
    if (!t) throw new Error('balance_pending→event_sealed manquante');
    if (t.guard !== 'SealingGuard') throw new Error(`Guard attendu: SealingGuard, reçu: ${t.guard}`);
    if (t.worm !== 'W2') throw new Error(`WORM attendu: W2 (Moment 3 — Fraude), reçu: ${t.worm}`);
  });

  await test('deposit_pending→event_sealed absente (plus de saut direct)', async () => {
    if (TRANSITION_TABLE['deposit_pending->event_sealed'])
      throw new Error('deposit_pending→event_sealed présente — le saut direct est non conforme à l\'OS V10.1');
  });

  await test('sots_window_closed→payable présente (chemin nominal SOTS)', async () => {
    if (!TRANSITION_TABLE['sots_window_closed->payable'])
      throw new Error('sots_window_closed→payable manquante — argent bloqué après SOTS');
  });

  await test('Annulations correctement ancrées (OS V10.1 patch)', async () => {
    // cancelled_J30 depuis deposit_secured (pas deposit_pending)
    if (!TRANSITION_TABLE['deposit_secured->cancelled_J30'])
      throw new Error('deposit_secured→cancelled_J30 manquante');
    // cancelled_J7 depuis balance_pending (pas deposit_pending)
    if (!TRANSITION_TABLE['balance_pending->cancelled_J7'])
      throw new Error('balance_pending→cancelled_J7 manquante');
    // Vérifier que les anciennes transitions erronées sont absentes
    if (TRANSITION_TABLE['deposit_pending->cancelled_J30'])
      throw new Error('deposit_pending→cancelled_J30 doit être absente — ancré sur deposit_secured');
    if (TRANSITION_TABLE['deposit_pending->cancelled_J7'])
      throw new Error('deposit_pending→cancelled_J7 doit être absente — ancré sur balance_pending');
  });

  await test('DisputeResolutionGuard pour sorties de dispute', async () => {
    if (!TRANSITION_TABLE['disputed->payable'] || TRANSITION_TABLE['disputed->payable'].guard !== 'DisputeResolutionGuard')
      throw new Error('disputed→payable doit utiliser DisputeResolutionGuard');
    if (!TRANSITION_TABLE['disputed->refunded'] || TRANSITION_TABLE['disputed->refunded'].guard !== 'DisputeResolutionGuard')
      throw new Error('disputed→refunded doit utiliser DisputeResolutionGuard');
  });

  await test('financialGuard: true sur *→disputed après paiement', async () => {
    const postPayment = [
      'deposit_secured->disputed',
      'balance_pending->disputed',
      'event_sealed->disputed',
      'performed->disputed',
      'event_completed->disputed',
      'sots_window_closed->disputed',
      'payable->disputed',
    ];
    for (const t of postPayment) {
      if (!TRANSITION_TABLE[t])
        throw new Error(`${t} manquante`);
      if (!TRANSITION_TABLE[t].financialGuard)
        throw new Error(`${t} doit avoir financialGuard: true — argent présent`);
    }
  });

  await test('no_show_pre_event présent (OS V10 section 2.6)', async () => {
    if (!TRANSITION_TABLE['event_sealed->no_show_pre_event'])
      throw new Error('event_sealed→no_show_pre_event manquante — OS V10 section 2.6');
    if (!TRANSITION_TABLE['no_show_pre_event->refunded'])
      throw new Error('no_show_pre_event→refunded manquante');
  });

  await test('La table contient au moins 35 transitions', async () => {
    const count = Object.keys(TRANSITION_TABLE).length;
    if (count < 35) throw new Error(`${count} transitions — attendu ≥35`);
  });

  // ── Section 6 : Validations d'entrée ──────────────────────
  console.log('\n── Validations d\'entrée ─────────────────────\n');

  await test('engagementId manquant → bloqué', async () => {
    try {
      await transitionEngagement({ currentState: 'proposed', targetState: 'accepted', actor: USR });
      throw new Error('Aurait dû être bloqué');
    } catch (err) {
      if (!err.message.includes('TRANSITION_ERROR')) throw new Error(`Attendu TRANSITION_ERROR: ${err.message}`);
    }
  });

  await test('engagementId non-souverain → bloqué (INVALID_SYSTEM_ID)', async () => {
    try {
      await transitionEngagement({
        engagementId: 'hacked', currentState: 'proposed', targetState: 'accepted', actor: USR,
      });
      throw new Error('Aurait dû être bloqué');
    } catch (err) {
      if (!err.message.includes('INVALID_SYSTEM_ID')) throw new Error(`Attendu INVALID_SYSTEM_ID: ${err.message}`);
    }
  });

  await test('actor non-souverain → bloqué (INVALID_SYSTEM_ID)', async () => {
    try {
      await transitionEngagement({
        engagementId: ENG, currentState: 'proposed', targetState: 'accepted', actor: 'admin',
      });
      throw new Error('Aurait dû être bloqué');
    } catch (err) {
      if (!err.message.includes('INVALID_SYSTEM_ID')) throw new Error(`Attendu INVALID_SYSTEM_ID: ${err.message}`);
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