/**
 * MICRO RAVE V3 — Test P0 : IDFACTORY-01
 * ============================================================
 * Vérifie que IDFactory génère des systemId valides.
 */

import { generate, validate, getType, PREFIXES } from '../../src/core/IDFactory.js';
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

console.log('═══════════════════════════════════════════════');
console.log('Test P0 : IDFACTORY-01');
console.log('═══════════════════════════════════════════════\n');

test('generate("Event") retourne un EVT-*', () => {
  const id = generate('Event');
  if (!id.startsWith('EVT-')) throw new Error(`ID invalide : ${id}`);
});

test('generate("Engagement") retourne un ENG-*', () => {
  const id = generate('Engagement');
  if (!id.startsWith('ENG-')) throw new Error(`ID invalide : ${id}`);
});

test('validate() confirme un systemId valide', () => {
  const id = generate('Event');
  if (!validate(id, 'Event')) throw new Error(`validate() aurait dû accepter : ${id}`);
});

test('validate() rejette un mauvais type', () => {
  const id = generate('Event');
  if (validate(id, 'Engagement')) {
    throw new Error(`validate() aurait dû rejeter Event comme Engagement : ${id}`);
  }
});

test('getType() retrouve le type depuis le préfixe', () => {
  const id = generate('MissionSlot');
  const type = getType(id);
  if (type !== 'MissionSlot') {
    throw new Error(`Type attendu MissionSlot, reçu : ${type}`);
  }
});

test('generate() rejette un type inconnu', () => {
  try {
    generate('TypeQuiNExistePas');
    throw new Error('generate() aurait dû lancer une erreur');
  } catch (err) {
    if (!err.message.includes('type inconnu')) {
      throw new Error(`Mauvaise erreur : ${err.message}`);
    }
  }
});

test('Tous les préfixes sont uniques', () => {
  const values = Object.values(PREFIXES);
  const unique = new Set(values);
  if (values.length !== unique.size) throw new Error('Certains préfixes sont dupliqués');
});

console.log(`\n═══════════════════════════════════════════════`);
console.log(`Résultat : ${passed} PASSED / ${failed} FAILED`);

if (failed === 0) {
  console.log('IDFACTORY-01 : ✓ PASSED');
} else {
  console.log('IDFACTORY-01 : ✗ FAILED — corriger avant de continuer');
  process.exit(1);
}

console.log('═══════════════════════════════════════════════');
