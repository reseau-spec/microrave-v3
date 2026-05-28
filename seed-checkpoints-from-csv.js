/**
 * seed-checkpoints-from-csv.js
 * ============================================================
 * Importe les 139 checkpoints depuis le CSV V1/V2 vers Base44 V3
 * avec des systemId canoniques CKP-* (IDFactory Crockford).
 *
 * Usage :
 *   BASE44_API_KEY=<clé> node seed-checkpoints-from-csv.js --dry-run
 *   BASE44_API_KEY=<clé> node seed-checkpoints-from-csv.js
 *
 * Le fichier checkpoint-migration-map.json est produit à la racine
 * avec la correspondance NC-* → CKP-* pour migrer les tables
 * dépendantes (CheckpointCheckin, etc.) dans une session ultérieure.
 * ============================================================
 */
'use strict';

import fs   from 'node:fs';
import path from 'node:path';
import url  from 'node:url';
import IDFactory from './src/core/IDFactory.js';

const __dirname  = path.dirname(url.fileURLToPath(import.meta.url));
const CSV_PATH   = path.join(__dirname, 'codeBase44_v3/dataBase/Checkpoint_export.csv');
const MAP_FILE   = path.join(__dirname, 'checkpoint-migration-map.json');
const BASE44_URL = 'https://futuristic-rave-core-flow.base44.app/api';

const BASE44_API_KEY = process.env.BASE44_API_KEY;
const DRY_RUN        = process.argv.includes('--dry-run');

if (!BASE44_API_KEY || BASE44_API_KEY === 'dummy') {
  console.error('ERREUR: BASE44_API_KEY manquante.');
  process.exit(1);
}

if (!fs.existsSync(CSV_PATH)) {
  console.error(`ERREUR: CSV introuvable : ${CSV_PATH}`);
  console.error('Placer Checkpoint_export.csv dans codeBase44_v3/dataBase/');
  process.exit(1);
}

function headers() {
  return { 'Content-Type': 'application/json', 'api_key': BASE44_API_KEY };
}

async function apiPost(entityPath, data) {
  const res = await fetch(`${BASE44_URL}${entityPath}`, {
    method: 'POST', headers: headers(), body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} — ${body}`);
  }
  return res.json();
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function parseCSV(content) {
  const lines = content.split('\n').filter(l => l.trim());
  const headers = parseCSVLine(lines[0]);
  return lines.slice(1).map(line => {
    const values = parseCSVLine(line);
    const row = {};
    headers.forEach((h, i) => { row[h] = values[i] ?? ''; });
    return row;
  });
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i+1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current); current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

function buildPayload(row, newSystemId) {
  const p = { systemId: newSystemId };

  const str = (f) => row[f]?.trim() || null;
  const num = (f) => { const n = parseFloat(row[f]); return isNaN(n) ? null : n; };
  const bool = (f) => row[f]?.trim().toLowerCase() === 'true';
  const arr = (f) => {
    try { const v = JSON.parse(row[f]); return Array.isArray(v) && v.length ? v : null; }
    catch { return null; }
  };

  const fields = {
    name:               str('name'),
    type:               str('type'),
    arrondissement:     str('arrondissement'),
    adresse:            str('adresse'),
    codePostal:         str('codePostal'),
    province:           str('province'),
    pays:               str('pays'),
    timezone:           str('timezone'),
    coverImageUrl:      str('coverImageUrl'),
    iconKey:            str('iconKey'),
    vibe:               str('vibe'),
    domainKey:          str('domainKey'),
    domainDominantKey:  str('domainDominantKey'),
    active:             bool('active'),
    geoLat:             num('geoLat'),
    geoLng:             num('geoLng'),
    radiusKm:           num('radiusKm'),
    difficultyTier:     num('difficultyTier'),
    sotsGlobalScore:    num('sotsGlobalScore'),
    sotsRecent30Score:  num('sotsRecent30Score'),
    totalVotes:         num('totalVotes'),
    domainRanking:      arr('domainRanking'),
    styleTags:          arr('styleTags'),
  };

  // N'inclure que les valeurs non-null
  for (const [k, v] of Object.entries(fields)) {
    if (v !== null && v !== undefined) p[k] = v;
  }

  // totalEngagements à 0 par défaut (champ V3 nouveau)
  p.totalEngagements = 0;

  // parentCheckpointId : ignoré (auto-référence NC- invalide en V3)
  // Sera recalculé manuellement si nécessaire.

  return p;
}

async function run() {
  console.log('═══════════════════════════════════════════════');
  console.log('Seed Checkpoints CSV → Base44 V3 (CKP-*)');
  console.log(DRY_RUN ? 'MODE : DRY RUN' : 'MODE : ÉCRITURE RÉELLE');
  console.log('═══════════════════════════════════════════════\n');

  const content = fs.readFileSync(CSV_PATH, 'utf8');
  const rows    = parseCSV(content).filter(r => r.name?.trim());

  console.log(`→ ${rows.length} checkpoints dans le CSV\n`);

  // Générer le mapping NC- → CKP- pour chaque ligne
  const migrationMap = {};
  for (const row of rows) {
    const oldId = row.systemId?.trim();
    if (!oldId) continue;
    migrationMap[oldId] = {
      oldSystemId: oldId,
      newSystemId: IDFactory.generate('Checkpoint'),
      name:        row.name?.trim(),
    };
  }

  if (DRY_RUN) {
    console.log('Échantillon du mapping (5 premiers) :');
    Object.values(migrationMap).slice(0, 5).forEach(m => {
      console.log(`  ${m.oldSystemId} → ${m.newSystemId}  "${m.name}"`);
    });
    console.log(`\n  ... et ${rows.length - 5} autres`);
    console.log('\n✓ DRY RUN terminé — aucune écriture.');
    return;
  }

  // Sauvegarder le mapping avant d'écrire
  fs.writeFileSync(MAP_FILE, JSON.stringify(migrationMap, null, 2));
  console.log(`→ Mapping sauvegardé : ${MAP_FILE}\n`);

  let created = 0;
  const errors = [];

  for (const row of rows) {
    const oldId  = row.systemId?.trim();
    const mapping = migrationMap[oldId];
    if (!mapping) continue;

    const payload = buildPayload(row, mapping.newSystemId);

    try {
      const result = await apiPost('/entities/Checkpoint', payload);
      mapping.newId = result.id;
      created++;
      if (created % 20 === 0 || created === rows.length) {
        console.log(`  ${created}/${rows.length} créés...`);
      }
      await sleep(150);
    } catch (err) {
      errors.push({ old: oldId, name: row.name, error: err.message });
      console.error(`  ✗ ${oldId} "${row.name}": ${err.message}`);
    }
  }

  // Sauvegarder le mapping final avec les IDs Base44
  fs.writeFileSync(MAP_FILE, JSON.stringify(migrationMap, null, 2));

  console.log('\n═══════════════════════════════════════════════');
  console.log(`✓ ${created} checkpoints créés avec systemId CKP-*`);
  if (errors.length) {
    console.log(`⚠ ${errors.length} erreurs — voir détails ci-dessus`);
  }
  console.log(`Mapping NC-* → CKP-* : ${MAP_FILE}`);
  console.log('═══════════════════════════════════════════════');
}

run().catch(err => {
  console.error('ERREUR FATALE:', err.message);
  process.exit(1);
});