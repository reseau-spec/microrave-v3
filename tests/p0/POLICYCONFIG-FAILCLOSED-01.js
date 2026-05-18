/**
 * MICRO RAVE V3 — Test P0 : POLICYCONFIG-FAILCLOSED-01
 * ============================================================
 * Vérifie que le système bloque si une config est absente.
 * Le fail-closed est une précondition à tout le reste.
 *
 * VARIABLE .ENV pour test 5 complet :
 *   BASE44_API_KEY=<clé API Base44 — Settings → API → api_key>
 *
 * Source : OS V10 section 16.2 — LOI TRANSITION-01
 * ============================================================
 */

require('dotenv').config();
const { getConfig, validateCriticalConfigs } = require('../../src/core/policy-config-resolver');
const { POLICY_CONFIGS_FONDAMENTALES }       = require('../../config/policy-config-schema');
const { isConnected, getMissingConfig }      = require('../../src/adapters/base44/PolicyConfigAdapter');

let passed  = 0;
let failed  = 0;
let skipped = 0;

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

function skip(name, reason) {
  console.log(`⚠️  SKIP ${name}`);
  console.log(`   → ${reason}`);
  skipped++;
}

console.log('═══════════════════════════════════════════════');
console.log('Test P0 : POLICYCONFIG-FAILCLOSED-01');
console.log('═══════════════════════════════════════════════\n');

async function run() {

  // ── Tests 1-4 : logique pure, sans database ────────────────

  await testAsync('getConfig() lance POLICY_CONFIG_MISSING si clé absente', async () => {
    try {
      await getConfig('cle_qui_nexiste_pas_12345');
      throw new Error('Aurait dû lancer POLICY_CONFIG_MISSING');
    } catch (err) {
      if (!err.message.includes('POLICY_CONFIG_MISSING'))
        throw new Error(`Mauvaise erreur: ${err.message}`);
    }
  });

  await testAsync('Le message d\'erreur identifie la clé manquante', async () => {
    try {
      await getConfig('ma_cle_manquante');
    } catch (err) {
      if (!err.message.includes('ma_cle_manquante'))
        throw new Error(`Le message doit mentionner la clé: ${err.message}`);
    }
  });

  test('Les 12 configs fondamentales sont toutes définies dans le schéma', () => {
    const keys = POLICY_CONFIGS_FONDAMENTALES.map(c => c.key);
    const required = [
      'stripe_ppm', 'stripe_fixe_cents', 'payment_fees_tax_treatment',
      'free_weight_cents', 'event_payment_cap_cents', 'deposit_ratio_ppm',
      'tps_ppm', 'tvq_ppm',
      'ledger_4310', 'ledger_4325', 'ledger_4326', 'ledger_4530',
    ];
    for (const r of required) {
      if (!keys.includes(r))
        throw new Error(`Config manquante dans le schéma : ${r}`);
    }
  });

  test('payment_fees_tax_treatment est CRITIQUE et vaut DEBOURS (Doctrine A Québec)', () => {
    const config = POLICY_CONFIGS_FONDAMENTALES.find(c => c.key === 'payment_fees_tax_treatment');
    if (!config) throw new Error('Config introuvable dans le schéma');
    if (config.category !== 'CRITIQUE')
      throw new Error(`Devrait être CRITIQUE, est: ${config.category}`);
    if (config.value !== 'DEBOURS')
      throw new Error(`Valeur doit être DEBOURS (Doctrine A), est: ${config.value}`);
  });

  // ── Test 5 : connexion database réelle ────────────────────
  console.log('\n─── Test connexion database ─────────────────────');

  if (!isConnected()) {
    const manquant = getMissingConfig();
    skip(
      'validateCriticalConfigs() — connexion database',
      `Manquant dans .env : ${manquant.join(', ')}.\n` +
      `   Ajouter BASE44_API_KEY (Base44 → Settings → API → api_key).\n` +
      `   Les 12 configs sont confirmées en base (export CSV du 17 mai 2026).`
    );
  } else {
    await testAsync(
      'validateCriticalConfigs() — toutes les configs critiques présentes en base',
      async () => { await validateCriticalConfigs(); }
    );
  }

  // ── Résultat ──────────────────────────────────────────────
  console.log(`\n═══════════════════════════════════════════════`);
  console.log(`Résultat : ${passed} PASSED / ${failed} FAILED / ${skipped} SKIPPED`);

  if (failed === 0) {
    const suffix = skipped > 0
      ? ' (skip database — ajouter BASE44_API_KEY dans .env)'
      : '';
    console.log(`POLICYCONFIG-FAILCLOSED-01 : ✓ PASSED${suffix}`);
  } else {
    console.log('POLICYCONFIG-FAILCLOSED-01 : ✗ FAILED — corriger avant de continuer');
    process.exit(1);
  }
  console.log('═══════════════════════════════════════════════');
}

run();