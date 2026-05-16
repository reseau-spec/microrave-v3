/**
 * MICRO RAVE V3 — Test P0 : TRANSITION-01
 * ============================================================
 * Vérifie que transitionEngagement() est l'unique porte
 * et que les violations sont bloquées.
 * Source : OS V10 section 16.2 — LOI TRANSITION-01
 * ============================================================
 */

const { transitionEngagement, TRANSITION_TABLE } = require('../../src/core/transitionEngagement');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (err) {
    console.log(`✗ ${name}`);
    console.log(`  → ${err.message}`);
    failed++;
  }
}

async function testAsync(name, fn) {
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

console.log('═══════════════════════════════════════════════');
console.log('Test P0 : TRANSITION-01');
console.log('═══════════════════════════════════════════════\n');

async function run() {

  // Test 1 : transition nominale proposed → accepted
  await testAsync('proposed→accepted retourne success:true', async () => {
    const result = await transitionEngagement({
      engagementId: 'ENG-TEST-000001',
      currentState: 'proposed',
      targetState:  'accepted',
      actor:        'USR-TEST-000001',
      context:      {},
    });
    if (!result.success) throw new Error('Résultat attendu: success:true');
    if (result.newState !== 'accepted') throw new Error(`newState attendu: accepted, reçu: ${result.newState}`);
  });

  // Test 2 : transition non autorisée est bloquée
  await testAsync('proposed→archived est bloquée (TRANSITION_UNAUTHORIZED)', async () => {
    try {
      await transitionEngagement({
        engagementId: 'ENG-TEST-000002',
        currentState: 'proposed',
        targetState:  'archived',
        actor:        'USR-TEST-000001',
        context:      {},
      });
      throw new Error('Aurait dû être bloquée');
    } catch (err) {
      if (!err.message.includes('TRANSITION_UNAUTHORIZED')) {
        throw new Error(`Mauvaise erreur: ${err.message}`);
      }
    }
  });

  // Test 3 : violation WORM Niveau 3 est bloquée
  await testAsync('settled→proposed est bloquée (WORM_VIOLATION_LEVEL_3)', async () => {
    try {
      await transitionEngagement({
        engagementId: 'ENG-TEST-000003',
        currentState: 'settled',
        targetState:  'proposed',
        actor:        'USR-TEST-000001',
        context:      {},
      });
      throw new Error('Aurait dû être bloquée');
    } catch (err) {
      if (!err.message.includes('WORM_VIOLATION_LEVEL_3')) {
        throw new Error(`Mauvaise erreur: ${err.message}`);
      }
    }
  });

  // Test 4 : violation WORM Niveau 2 est bloquée
  await testAsync('event_sealed→proposed est bloquée (WORM_VIOLATION_LEVEL_2)', async () => {
    try {
      await transitionEngagement({
        engagementId: 'ENG-TEST-000004',
        currentState: 'event_sealed',
        targetState:  'proposed',
        actor:        'USR-TEST-000001',
        context:      {},
      });
      throw new Error('Aurait dû être bloquée');
    } catch (err) {
      if (!err.message.includes('WORM_VIOLATION_LEVEL_2')) {
        throw new Error(`Mauvaise erreur: ${err.message}`);
      }
    }
  });

  // Test 5 : paramètres manquants bloquent immédiatement
  await testAsync('engagementId manquant est bloqué', async () => {
    try {
      await transitionEngagement({
        currentState: 'proposed',
        targetState:  'accepted',
        actor:        'USR-TEST-000001',
      });
      throw new Error('Aurait dû être bloquée');
    } catch (err) {
      if (!err.message.includes('TRANSITION_ERROR')) {
        throw new Error(`Mauvaise erreur: ${err.message}`);
      }
    }
  });

  // Test 6 : la table de transitions est complète
  test('La table contient au moins 11 transitions nominales', () => {
    const count = Object.keys(TRANSITION_TABLE).length;
    if (count < 11) throw new Error(`Seulement ${count} transitions — attendu: 11+`);
  });

  // Test 7 : le chemin nominal complet est couvert
  test('Le chemin proposed→archived est entièrement couvert', () => {
    const chemin = [
      'proposed->accepted',
      'accepted->placed',
      'placed->deposit_pending',
      'deposit_pending->deposit_secured',
      'deposit_secured->event_sealed',
      'event_sealed->performed',
      'performed->payable',
      'payable->settled',
      'settled->archived',
    ];
    for (const transition of chemin) {
      if (!TRANSITION_TABLE[transition]) {
        throw new Error(`Transition manquante dans la table: ${transition}`);
      }
    }
  });

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