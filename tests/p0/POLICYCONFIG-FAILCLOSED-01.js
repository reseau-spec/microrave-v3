/**
 * MICRO RAVE V3 — Test P0 : POLICYCONFIG-FAILCLOSED-01
 * ============================================================
 * Vérifie que le système bloque si une config est absente.
 * Le fail-closed est une précondition à tout le reste.
 *
 * Comment exécuter (après avoir connecté l'adapter Base44) :
 *   node tests/p0/POLICYCONFIG-FAILCLOSED-01.js
 * ============================================================
 */

require('dotenv').config();
const { getConfig, validateCriticalConfigs } = require('../../src/core/policy-config-resolver');
const { POLICY_CONFIGS_FONDAMENTALES } = require('../../config/policy-config-schema');

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
console.log('Test P0 : POLICYCONFIG-FAILCLOSED-01');
console.log('═══════════════════════════════════════════════\n');

async function run() {

  // Test 1 : getConfig() throw si clé absente
  await testAsync('getConfig() lance une erreur si la clé est absente', async () => {
    try {
      await getConfig('cle_qui_nexiste_pas_12345');
      throw new Error('Aurait dû lancer une erreur POLICY_CONFIG_MISSING');
    } catch (err) {
      if (!err.message.includes('POLICY_CONFIG_MISSING')) {
        throw new Error(`Mauvaise erreur: ${err.message}`);
      }
      // C'est le comportement attendu — le test passe
    }
  });

  // Test 2 : Le message d'erreur mentionne la clé manquante
  await testAsync('Le message d\'erreur identifie la clé manquante', async () => {
    try {
      await getConfig('ma_cle_manquante');
    } catch (err) {
      if (!err.message.includes('ma_cle_manquante')) {
        throw new Error(`Le message doit mentionner la clé: ${err.message}`);
      }
    }
  });

  // Test 3 : Liste des configs fondamentales est complète
  test('Les 12 configs fondamentales sont toutes définies', () => {
    const keys = POLICY_CONFIGS_FONDAMENTALES.map(c => c.key);
    const required = [
      'stripe_ppm', 'stripe_fixe_cents', 'payment_fees_tax_treatment',
      'free_weight_cents', 'event_payment_cap_cents', 'deposit_ratio_ppm',
      'tps_ppm', 'tvq_ppm',
      'ledger_4310', 'ledger_4325', 'ledger_4326', 'ledger_4530'
    ];
    for (const r of required) {
      if (!keys.includes(r)) {
        throw new Error(`Config manquante dans le schéma : ${r}`);
      }
    }
  });

  // Test 4 : payment_fees_tax_treatment est CRITIQUE
  test('payment_fees_tax_treatment est catégorie CRITIQUE', () => {
    const config = POLICY_CONFIGS_FONDAMENTALES.find(c => c.key === 'payment_fees_tax_treatment');
    if (!config) throw new Error('Config introuvable');
    if (config.category !== 'CRITIQUE') {
      throw new Error(`Devrait être CRITIQUE, est: ${config.category}`);
    }
    if (config.value !== 'DEBOURS') {
      throw new Error(`Valeur par défaut devrait être DEBOURS, est: ${config.value}`);
    }
  });

  // Test 5 : validateCriticalConfigs() (si adapter Base44 connecté)
  // Ce test passe seulement si la database est connectée et les configs insérées
  console.log('\n─── Test connexion database ─────────────────────');
  try {
    await validateCriticalConfigs();
    console.log('✓ validateCriticalConfigs() — toutes les configs critiques sont présentes en database');
    passed++;
  } catch (err) {
    if (err.message.includes('adapter Base44 non connecté')) {
      console.log('⚠️  Adapter Base44 non connecté — connecter l\'adapter et réexécuter ce test');
      console.log('   Ce test est bloquant avant Event 0A');
    } else {
      console.log(`✗ validateCriticalConfigs() FAILED : ${err.message}`);
      failed++;
    }
  }

  console.log(`\n═══════════════════════════════════════════════`);
  console.log(`Résultat : ${passed} PASSED / ${failed} FAILED`);
  if (failed === 0) {
    console.log('POLICYCONFIG-FAILCLOSED-01 : ✓ PASSED');
  } else {
    console.log('POLICYCONFIG-FAILCLOSED-01 : ✗ FAILED — corriger avant de continuer');
    process.exit(1);
  }
  console.log('═══════════════════════════════════════════════');
}

run();
