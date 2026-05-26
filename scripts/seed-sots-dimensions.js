/**
 * scripts/seed-sots-dimensions.js
 * ============================================================
 * Seed des 7 dimensions canoniques SOTS dans SOTSDimensionConfig.
 *
 * SOURCE DOCTRINALE : D-079 (registre souverain)
 *   "Dimensions initiales (modifiables) :
 *    performance_artistique, fiabilite_operationnelle,
 *    professionnalisme_relationnel, experience_generee,
 *    adequation_mandat, non_toxicite, reference"
 *
 * POIDS : 7 dimensions à poids égaux (1 000 000 / 7 = 142 857 PPM).
 *   Arrondi : 6 dimensions à 142 857 PPM + 1 à 142 858 PPM = 1 000 000.
 *   Toutes affectent la commission (D-080) en mode pilote.
 *
 * IDEMPOTENT : skip si une dimension avec le même dimensionKey existe déjà.
 *
 * USAGE :
 *   1. Importer entity_SOTSDimensionConfig.jsonc dans Base44 (admin → entities)
 *   2. node scripts/seed-sots-dimensions.js --dry-run
 *   3. node scripts/seed-sots-dimensions.js
 *
 * Source : D-079, D-080, OS V15
 * ============================================================
 */
'use strict';
require('dotenv').config();

const BASE44_BASE_URL = 'https://futuristic-rave-core-flow.base44.app/api';
const DRY_RUN = process.argv.includes('--dry-run');

// 7 dimensions canoniques D-079.
// Poids : 6 × 142 857 + 1 × 142 858 = 1 000 000 PPM.
const DIMENSIONS = [
  {
    dimensionKey:     'performance_artistique',
    label:            'Performance artistique',
    weight_ppm:       142857,
    isActive:         true,
    visibleToUser:    true,
    affectsCommission: true,
  },
  {
    dimensionKey:     'fiabilite_operationnelle',
    label:            'Fiabilité opérationnelle',
    weight_ppm:       142857,
    isActive:         true,
    visibleToUser:    true,
    affectsCommission: true,
  },
  {
    dimensionKey:     'professionnalisme_relationnel',
    label:            'Professionnalisme relationnel',
    weight_ppm:       142857,
    isActive:         true,
    visibleToUser:    true,
    affectsCommission: true,
  },
  {
    dimensionKey:     'experience_generee',
    label:            'Expérience générée',
    weight_ppm:       142857,
    isActive:         true,
    visibleToUser:    true,
    affectsCommission: true,
  },
  {
    dimensionKey:     'adequation_mandat',
    label:            'Adéquation au mandat',
    weight_ppm:       142857,
    isActive:         true,
    visibleToUser:    true,
    affectsCommission: true,
  },
  {
    dimensionKey:     'non_toxicite',
    label:            'Non-toxicité',
    weight_ppm:       142857,
    isActive:         true,
    visibleToUser:    true,
    affectsCommission: true,
  },
  {
    dimensionKey:     'reference',
    label:            'L\'auriez-vous référencé ?',
    weight_ppm:       142858,  // +1 pour atteindre exactement 1 000 000 PPM
    isActive:         true,
    visibleToUser:    true,
    affectsCommission: true,
  },
];

function headers() {
  const k = process.env.BASE44_API_KEY;
  if (!k) throw new Error('BASE44_API_KEY absent');
  return { 'Content-Type': 'application/json', 'api_key': k };
}

async function get(path) {
  const r = await fetch(`${BASE44_BASE_URL}${path}`, { headers: headers() });
  if (!r.ok) throw new Error(`GET ${path} → ${r.status}`);
  return r.json().then(j => Array.isArray(j) ? j : (j.data || j));
}

async function post(data) {
  const r = await fetch(`${BASE44_BASE_URL}/entities/SOTSDimensionConfig`, {
    method: 'POST', headers: headers(), body: JSON.stringify(data),
  });
  if (!r.ok) { const b = await r.text(); throw new Error(`POST SOTSDimensionConfig → ${r.status}: ${b}`); }
  return r.json();
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║  Seed SOTSDimensionConfig — 7 dimensions D-079           ║');
  console.log(`║  Mode : ${DRY_RUN ? 'DRY-RUN                                  ' : 'LIVE — écriture en base                  '}║`);
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log();

  // Vérifier la somme des poids
  const totalPpm = DIMENSIONS.reduce((s, d) => s + d.weight_ppm, 0);
  if (totalPpm !== 1_000_000) {
    throw new Error(`Somme des weight_ppm = ${totalPpm}, attendu 1 000 000. Corriger avant de seeder.`);
  }
  console.log(`✓ Somme weight_ppm = ${totalPpm} PPM (= 1 000 000 = 100%)`);
  console.log();

  // Charger les dimensions existantes
  const existing = await get('/entities/SOTSDimensionConfig?limit=50');
  const existingKeys = new Set((existing || []).map(d => d.dimensionKey).filter(Boolean));
  console.log(`Dimensions existantes en base : ${existingKeys.size}`);
  if (existingKeys.size > 0) console.log('  Clés :', [...existingKeys].join(', '));
  console.log();

  let created = 0, skipped = 0;
  const now = new Date().toISOString();

  for (const dim of DIMENSIONS) {
    if (existingKeys.has(dim.dimensionKey)) {
      console.log(`  ⊙ ${dim.dimensionKey} — déjà présente, skip`);
      skipped++;
      continue;
    }

    if (DRY_RUN) {
      console.log(`  [DRY] ${dim.dimensionKey} — weight=${dim.weight_ppm} PPM`);
      created++;
      continue;
    }

    await post({ ...dim, effectiveFrom: now, createdAt: now });
    console.log(`  ✓ ${dim.dimensionKey} — weight=${dim.weight_ppm} PPM`);
    created++;
  }

  console.log();
  console.log('─'.repeat(58));
  console.log(`  Créées : ${created} | Déjà présentes : ${skipped}`);
  console.log();

  if (!DRY_RUN && created > 0) {
    console.log('✓ Dimensions seedées. submitSOTSRating v4 peut maintenant');
    console.log('  charger les dimensions actives depuis SOTSDimensionConfig.');
  }
  if (DRY_RUN) {
    console.log('ℹ Mode DRY-RUN. Relancer sans --dry-run pour écrire en base.');
  }
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });