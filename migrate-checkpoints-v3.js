/**
 * migrate-checkpoints-v3.js
 * ============================================================
 * Migration des 139 Checkpoints NC-XXXXXXXXX → CKP-* (V3)
 *
 * Ce que le script fait :
 *   1. Lit tous les Checkpoints existants depuis Base44
 *   2. Pour chaque NC-*, génère un nouveau systemId CKP-* via IDFactory
 *   3. Crée le nouvel enregistrement avec CKP-*
 *   4. Note la correspondance NC- → CKP- dans un fichier de mapping
 *   5. Supprime l'ancien enregistrement NC-*
 *
 * Ce que le script NE fait PAS (volontaire — périmètre limité) :
 *   - Ne touche pas CheckpointCheckin, CheckpointLiveStats,
 *     CulturalMoment, Scene, SceneCheckpoint, ni les fonctions Deno.
 *   - Ces tables seront migrées dans une session dédiée après
 *     validation de cette migration.
 *
 * Sécurité :
 *   - --dry-run : liste les opérations sans rien écrire ni supprimer
 *   - --create-only : crée les CKP- sans supprimer les NC- (valider d'abord)
 *   - Sans flag : migration complète (créer + supprimer)
 *   - Le mapping NC- → CKP- est sauvegardé dans checkpoint-migration-map.json
 *     AVANT toute suppression
 *
 * Usage :
 *   BASE44_API_KEY=<clé> node migrate-checkpoints-v3.js --dry-run
 *   BASE44_API_KEY=<clé> node migrate-checkpoints-v3.js --create-only
 *   BASE44_API_KEY=<clé> node migrate-checkpoints-v3.js
 * ============================================================
 */
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import IDFactory from './src/core/IDFactory.js';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

const BASE44_API_KEY = process.env.BASE44_API_KEY;
const BASE44_URL     = 'https://futuristic-rave-core-flow.base44.app/api';
const MAP_FILE       = path.join(__dirname, 'checkpoint-migration-map.json');

const DRY_RUN     = process.argv.includes('--dry-run');
const CREATE_ONLY = process.argv.includes('--create-only');

if (!BASE44_API_KEY || BASE44_API_KEY === 'dummy') {
  console.error('ERREUR: BASE44_API_KEY manquante. Fournir la vraie clé.');
  process.exit(1);
}

function headers() {
  return { 'Content-Type': 'application/json', 'api_key': BASE44_API_KEY };
}

async function apiGet(path) {
  const res = await fetch(`${BASE44_URL}${path}`, { headers: headers() });
  if (!res.ok) throw new Error(`HTTP ${res.status} GET ${path}`);
  const json = await res.json();
  return Array.isArray(json) ? json : (json.data || json);
}

async function apiPost(path, data) {
  const res = await fetch(`${BASE44_URL}${path}`, {
    method: 'POST', headers: headers(), body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} POST ${path} — ${body}`);
  }
  return res.json();
}

async function apiDelete(path) {
  const res = await fetch(`${BASE44_URL}${path}`, {
    method: 'DELETE', headers: headers(),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} DELETE ${path} — ${body}`);
  }
  return true;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Champs à conserver lors de la migration
// (on exclut id, created_date, updated_date, created_by_id, created_by, is_sample
//  qui sont gérés par Base44)
function buildPayload(cp, newSystemId) {
  const payload = { systemId: newSystemId };

  const FIELDS = [
    'name', 'type', 'arrondissement', 'adresse', 'codePostal',
    'province', 'pays', 'geoLat', 'geoLng', 'timezone',
    'active', 'coverImageUrl', 'iconKey', 'vibe', 'difficultyTier',
    'domainKey', 'domainDominantKey', 'domainRanking', 'styleTags',
    'radiusKm', 'sotsGlobalScore', 'sotsRecent30Score', 'totalVotes',
  ];

  for (const field of FIELDS) {
    if (cp[field] !== undefined && cp[field] !== null && cp[field] !== '') {
      // Convertir les types numériques
      if (['geoLat', 'geoLng', 'radiusKm', 'sotsGlobalScore',
           'sotsRecent30Score', 'totalVotes', 'difficultyTier'].includes(field)) {
        const n = Number(cp[field]);
        if (!isNaN(n)) payload[field] = n;
      } else if (field === 'active') {
        payload[field] = cp[field] === true || cp[field] === 'true';
      } else if (['domainRanking', 'styleTags'].includes(field)) {
        try {
          payload[field] = typeof cp[field] === 'string'
            ? JSON.parse(cp[field]) : cp[field];
        } catch { payload[field] = []; }
      } else {
        payload[field] = cp[field];
      }
    }
  }

  // parentCheckpointId : sera mis à jour après migration si nécessaire
  // (cas unique : Kampus Coworking qui se référence lui-même)
  // On ne le copie pas pour éviter une référence vers un NC- inexistant.

  return payload;
}

async function run() {
  console.log('═══════════════════════════════════════════════');
  console.log('Migration Checkpoint NC-* → CKP-* (V3)');
  if (DRY_RUN)     console.log('MODE : DRY RUN (aucune écriture)');
  if (CREATE_ONLY) console.log('MODE : CREATE ONLY (pas de suppression)');
  if (!DRY_RUN && !CREATE_ONLY) console.log('MODE : MIGRATION COMPLÈTE');
  console.log('═══════════════════════════════════════════════\n');

  // 1. Charger tous les checkpoints NC-*
  console.log('→ Chargement des checkpoints depuis Base44...');
  const all = await apiGet('/entities/Checkpoint');
  const ncCheckpoints = all.filter(cp => cp.systemId?.startsWith('NC-'));
  const ckpCheckpoints = all.filter(cp => cp.systemId?.startsWith('CKP-'));

  console.log(`  Total en base : ${all.length}`);
  console.log(`  Format NC-    : ${ncCheckpoints.length}`);
  console.log(`  Format CKP-   : ${ckpCheckpoints.length}\n`);

  if (ncCheckpoints.length === 0) {
    console.log('✓ Aucun checkpoint NC- à migrer.');
    return;
  }

  // 2. Générer le mapping NC- → CKP-
  const migrationMap = {};
  for (const cp of ncCheckpoints) {
    migrationMap[cp.systemId] = {
      oldSystemId:  cp.systemId,
      oldId:        cp.id,
      newSystemId:  IDFactory.generate('Checkpoint'),
      name:         cp.name,
    };
  }

  console.log(`→ ${ncCheckpoints.length} checkpoints à migrer\n`);

  if (DRY_RUN) {
    console.log('Échantillon du mapping (5 premiers) :');
    Object.values(migrationMap).slice(0, 5).forEach(m => {
      console.log(`  ${m.oldSystemId} → ${m.newSystemId}  "${m.name}"`);
    });
    console.log('\n✓ DRY RUN terminé — aucune écriture effectuée.');
    return;
  }

  // 3. Sauvegarder le mapping AVANT toute opération destructive
  fs.writeFileSync(MAP_FILE, JSON.stringify(migrationMap, null, 2));
  console.log(`→ Mapping sauvegardé : ${MAP_FILE}\n`);

  // 4. Créer les nouveaux enregistrements CKP-*
  console.log('→ Création des enregistrements CKP-*...');
  let created = 0; let errors = [];

  for (const cp of ncCheckpoints) {
    const mapping = migrationMap[cp.systemId];
    const payload = buildPayload(cp, mapping.newSystemId);
    try {
      const result = await apiPost('/entities/Checkpoint', payload);
      mapping.newId = result.id;
      created++;
      if (created % 10 === 0) {
        console.log(`  ${created}/${ncCheckpoints.length} créés...`);
      }
      await sleep(150); // anti rate-limit
    } catch (err) {
      errors.push({ systemId: cp.systemId, name: cp.name, error: err.message });
      console.error(`  ✗ Échec création ${cp.systemId} "${cp.name}": ${err.message}`);
    }
  }

  // Sauvegarder le mapping mis à jour avec les nouveaux IDs Base44
  fs.writeFileSync(MAP_FILE, JSON.stringify(migrationMap, null, 2));
  console.log(`\n  ✓ ${created} créés, ${errors.length} erreurs`);

  if (errors.length > 0) {
    console.error('\n  Erreurs de création :');
    errors.forEach(e => console.error(`    ${e.systemId} "${e.name}": ${e.error}`));
    console.error('\n  ARRÊT : corriger les erreurs avant de continuer.');
    process.exit(1);
  }

  if (CREATE_ONLY) {
    console.log('\n✓ CREATE ONLY terminé — les NC- sont conservés.');
    console.log(`  Mapping disponible : ${MAP_FILE}`);
    console.log('  Valider les nouveaux CKP- dans Base44, puis relancer sans --create-only.');
    return;
  }

  // 5. Supprimer les anciens enregistrements NC-*
  console.log('\n→ Suppression des enregistrements NC-*...');
  let deleted = 0; let deleteErrors = [];

  for (const cp of ncCheckpoints) {
    const mapping = migrationMap[cp.systemId];
    if (!mapping.newId) {
      console.error(`  ✗ Skip suppression ${cp.systemId} — newId manquant`);
      continue;
    }
    try {
      await apiDelete(`/entities/Checkpoint/${cp.id}`);
      deleted++;
      if (deleted % 10 === 0) {
        console.log(`  ${deleted}/${ncCheckpoints.length} supprimés...`);
      }
      await sleep(150);
    } catch (err) {
      deleteErrors.push({ systemId: cp.systemId, error: err.message });
      console.error(`  ✗ Échec suppression ${cp.systemId}: ${err.message}`);
    }
  }

  console.log(`\n  ✓ ${deleted} supprimés, ${deleteErrors.length} erreurs`);

  // 6. Résumé final
  console.log('\n═══════════════════════════════════════════════');
  console.log('MIGRATION TERMINÉE');
  console.log(`  Créés  : ${created}`);
  console.log(`  Supprimés : ${deleted}`);
  console.log(`  Mapping  : ${MAP_FILE}`);
  if (deleteErrors.length > 0) {
    console.log(`  ⚠ ${deleteErrors.length} suppressions échouées — vérifier manuellement`);
  }
  console.log('═══════════════════════════════════════════════');
  console.log('\nProchaine étape : valider les CKP- dans Base44,');
  console.log('puis migrer les tables dépendantes avec le mapping.');
}

run().catch(err => {
  console.error('ERREUR FATALE:', err.message);
  process.exit(1);
});
