/**
 * MICRO RAVE V3 — Script de seed PolicyConfig
 * ============================================================
 * Insère les 12 configurations fondamentales dans Base44 V3.
 *
 * À EXÉCUTER UNE SEULE FOIS.
 * Vérifier que BASE44_API_KEY est dans .env avant de lancer.
 *
 * Usage :
 *   node scripts/seed-policy-config.js
 *
 * Le script est idempotent — il vérifie avant d'insérer.
 * Une clé déjà présente est ignorée (pas de doublon).
 * ============================================================
 */

'use strict';

// Charger .env
require('dotenv').config();

const { findByKey, upsert } = require('../src/adapters/base44/PolicyConfigAdapter');
const { POLICY_CONFIGS_FONDAMENTALES } = require('../config/policy-config-schema');

async function seed() {
  console.log('═══════════════════════════════════════════════');
  console.log('SEED PolicyConfig — Base44 V3');
  console.log(`${POLICY_CONFIGS_FONDAMENTALES.length} configs à vérifier`);
  console.log('═══════════════════════════════════════════════\n');

  if (!process.env.BASE44_API_KEY) {
    console.error('❌ BASE44_API_KEY absent de .env — arrêt.');
    process.exit(1);
  }

  let inserted = 0;
  let skipped  = 0;
  let errors   = 0;

  for (const config of POLICY_CONFIGS_FONDAMENTALES) {
    try {
      // Vérifier si la clé existe déjà
      const existing = await findByKey(config.key);

      if (existing) {
        console.log(`⏭  Ignoré (déjà présent) : ${config.key}`);
        skipped++;
        continue;
      }

      // Insérer
      const result = await upsert({
        key:         config.key,
        value:       config.value,
        value_type:  config.value_type,
        category:    config.category,
        description: config.description,
      });

      if (result) {
        console.log(`✓  Inséré : ${config.key} = ${config.value} [${config.value_type}]`);
        inserted++;
      } else {
        console.error(`✗  Erreur insertion : ${config.key}`);
        errors++;
      }

      // Pause légère pour éviter le rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));

    } catch (err) {
      console.error(`✗  Exception pour ${config.key}:`, err.message);
      errors++;
    }
  }

  console.log('\n═══════════════════════════════════════════════');
  console.log(`Résultat : ${inserted} insérés · ${skipped} ignorés · ${errors} erreurs`);

  if (errors === 0) {
    console.log('SEED PolicyConfig : ✓ COMPLET');
    console.log('\nPROCHAINE ÉTAPE :');
    console.log('  node tests/p0/POLICYCONFIG-FAILCLOSED-01.js');
    console.log('  → Le test validateCriticalConfigs() doit passer 5/5');
  } else {
    console.log('SEED PolicyConfig : ✗ ERREURS — vérifier les logs ci-dessus');
    process.exit(1);
  }
  console.log('═══════════════════════════════════════════════');
}

seed();