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


import dotenv from 'dotenv';
dotenv.config();
import { getConfig, validateCriticalConfigs } from '../../src/core/policy-config-resolver.js';
import { POLICY_CONFIGS_FONDAMENTALES } from '../../config/policy-config-schema.js';
import { isConnected, getMissingConfig } from '../../src/adapters/base44/PolicyConfigAdapter.js';
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

  test(`Les ${POLICY_CONFIGS_FONDAMENTALES.length} configs fondamentales sont complètes et cohérentes dans le schéma`, () => {
    for (const config of POLICY_CONFIGS_FONDAMENTALES) {
      if (!config.key)
        throw new Error(`Config sans clé : ${JSON.stringify(config)}`);
      if (!config.value && config.value !== '0')
        throw new Error(`Config "${config.key}" sans valeur`);
      if (!["INTEGER","PPM","CENTS","STRING","ENUM","BOOLEAN"].includes(config.value_type))
        throw new Error(`Config "${config.key}" : value_type invalide "${config.value_type}"`);
      if (!["CRITIQUE","ELEVE","STANDARD","OPERATIONNEL"].includes(config.category))
        throw new Error(`Config "${config.key}" : category invalide "${config.category}"`);
      if (!config.description || config.description.length < 10)
        throw new Error(`Config "${config.key}" : description absente ou trop courte`);
    }
  });

  test("Configs de présence (A-056, A-057) : structure et types ratifiés", () => {
    const gps = POLICY_CONFIGS_FONDAMENTALES.find(c => c.key === 'maxDistancePolicy');
    if (!gps) throw new Error('maxDistancePolicy absent du schéma');
    if (gps.value_type !== 'INTEGER') throw new Error('maxDistancePolicy doit être INTEGER');
    if (gps.category !== 'CRITIQUE') throw new Error('maxDistancePolicy doit être CRITIQUE');
    if (parseInt(gps.value, 10) <= 0) throw new Error('maxDistancePolicy doit être > 0');

    const floor = POLICY_CONFIGS_FONDAMENTALES.find(c => c.key === 'minDurationFloorMinutes');
    if (!floor) throw new Error('minDurationFloorMinutes absent du schéma');
    if (floor.value_type !== 'INTEGER') throw new Error('minDurationFloorMinutes doit être INTEGER');
    if (floor.category !== 'CRITIQUE') throw new Error('minDurationFloorMinutes doit être CRITIQUE');
    if (parseInt(floor.value, 10) <= 0) throw new Error('minDurationFloorMinutes doit être > 0');

    const ratio = POLICY_CONFIGS_FONDAMENTALES.find(c => c.key === 'minDurationRatioPpm');
    if (!ratio) throw new Error('minDurationRatioPpm absent du schéma');
    if (ratio.value_type !== 'PPM') throw new Error('minDurationRatioPpm doit être PPM');
    if (ratio.category !== 'CRITIQUE') throw new Error('minDurationRatioPpm doit être CRITIQUE');
    const ppm = parseInt(ratio.value, 10);
    if (ppm <= 0 || ppm > 1_000_000) throw new Error(`minDurationRatioPpm hors domaine [1, 1_000_000] : ${ppm}`);

    const window = POLICY_CONFIGS_FONDAMENTALES.find(c => c.key === 'contestationWindowDurationHours');
    if (!window) throw new Error('contestationWindowDurationHours absent du schéma');
    if (window.value_type !== 'INTEGER') throw new Error('contestationWindowDurationHours doit être INTEGER');
    if (window.category !== 'CRITIQUE') throw new Error('contestationWindowDurationHours doit être CRITIQUE');
    if (parseInt(window.value, 10) <= 0) throw new Error('contestationWindowDurationHours doit être > 0');

    const old = POLICY_CONFIGS_FONDAMENTALES.find(c => c.key === 'minDurationPolicy');
    if (old) throw new Error(
      'minDurationPolicy (ancienne clé monolithique) est encore présente. ' +
      'Elle doit être remplacée par minDurationFloorMinutes + minDurationRatioPpm.'
    );
  });

  test('payment_fees_tax_treatment est CRITIQUE et vaut DEBOURS (Doctrine A Québec)', () => {
    const config = POLICY_CONFIGS_FONDAMENTALES.find(c => c.key === 'payment_fees_tax_treatment');
    if (!config) throw new Error('Config introuvable dans le schéma');
    if (config.category !== 'CRITIQUE')
      throw new Error(`Devrait être CRITIQUE, est: ${config.category}`);
    if (config.value !== 'DEBOURS')
      throw new Error(`Valeur doit être DEBOURS (Doctrine A), est: ${config.value}`);
  });

  // ── Test 5 : validateCriticalConfigs avec données pristine ──
  // PORT-1b (DETTE-PORT-007 résolue) : au lieu d'appeler l'API
  // Base44 réelle (HTTP 403 dans le sandbox), on charge le CSV
  // pristine codeBase44_v3/dataBase/PolicyConfig_export.csv via
  // le mode seed de PolicyConfigAdapter. Les 36 configs réelles
  // de production sont utilisées — c'est plus fort qu'un mock.
  console.log('\n─── Test validateCriticalConfigs (mode seed CSV) ─');

  const fs   = await import('node:fs');
  const path = await import('node:path');
  const url  = await import('node:url');
  const adapter = await import('../../src/adapters/base44/PolicyConfigAdapter.js');
  const resolver = await import('../../src/core/policy-config-resolver.js');

  const __filename = url.fileURLToPath(import.meta.url);
  const __dirname  = path.dirname(__filename);
  const csvPath = path.join(__dirname, '../../codeBase44_v3/dataBase/PolicyConfig_export.csv');

  if (!fs.existsSync(csvPath)) {
    skip(
      'validateCriticalConfigs() — CSV pristine introuvable',
      `Fichier attendu : ${csvPath}`
    );
  } else {
    const csvText = fs.readFileSync(csvPath, 'utf8');
    const count = adapter.loadFromCSV(csvText);
    console.log(`  → ${count} configs chargées depuis le CSV pristine`);
    resolver.clearCache();  // forcer une re-lecture via le mode seed

    await testAsync(
      'validateCriticalConfigs() — toutes les configs critiques présentes (CSV pristine)',
      async () => { await validateCriticalConfigs(); }
    );

    adapter.resetLocalStore();  // teardown : restaurer le comportement HTTP normal
    resolver.clearCache();
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