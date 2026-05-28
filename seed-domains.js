/**
 * seed-domains.js
 * ============================================================
 * Importe les 8 domaines culturels depuis le CSV V2 vers Base44 V3.
 *
 * Doctrine V3 :
 *   - systemId = DMN-* généré par IDFactory (identifiant souverain)
 *   - slug     = ex 'music', 'humour' (lisible, immuable, PAS clé de jointure)
 *
 * Produit domain-seed-map.json : { slug → DMN-* } pour migrer
 * les tables dépendantes (CheckpointDomainStats, RoleDomainMap, etc.)
 *
 * Usage :
 *   BASE44_API_KEY=<clé> node seed-domains.js --dry-run
 *   BASE44_API_KEY=<clé> node seed-domains.js
 * ============================================================
 */
'use strict';

import fs   from 'node:fs';
import path from 'node:path';
import url  from 'node:url';
import IDFactory from './src/core/IDFactory.js';

const __dirname  = path.dirname(url.fileURLToPath(import.meta.url));
const CSV_PATH   = path.join(__dirname, 'codeBase44_v3/dataBase/Domain_export.csv');
const MAP_FILE   = path.join(__dirname, 'domain-seed-map.json');
const BASE44_URL = 'https://futuristic-rave-core-flow.base44.app/api';

const BASE44_API_KEY = process.env.BASE44_API_KEY;
const DRY_RUN        = process.argv.includes('--dry-run');

if (!BASE44_API_KEY || BASE44_API_KEY === 'dummy') {
  console.error('ERREUR: BASE44_API_KEY manquante.');
  process.exit(1);
}

if (!fs.existsSync(CSV_PATH)) {
  console.error(`ERREUR: CSV introuvable : ${CSV_PATH}`);
  console.error('Placer Domain_export.csv dans codeBase44_v3/dataBase/');
  process.exit(1);
}

function headers() {
  return { 'Content-Type': 'application/json', 'api_key': BASE44_API_KEY };
}

async function apiGet(entityPath) {
  const res = await fetch(`${BASE44_URL}${entityPath}`, { headers: headers() });
  if (!res.ok) throw new Error(`HTTP ${res.status} GET ${entityPath}`);
  const json = await res.json();
  return Array.isArray(json) ? json : (json.data || []);
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
  const hdrs  = parseCSVLine(lines[0]);
  return lines.slice(1).map(line => {
    const values = parseCSVLine(line);
    const row = {};
    hdrs.forEach((h, i) => { row[h] = values[i] ?? ''; });
    return row;
  });
}

function parseCSVLine(line) {
  const result = []; let current = ''; let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i+1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (c === ',' && !inQuotes) {
      result.push(current); current = '';
    } else { current += c; }
  }
  result.push(current);
  return result;
}

async function run() {
  console.log('═══════════════════════════════════════════════');
  console.log('Seed Domain → Base44 V3 (DMN-*)');
  console.log(DRY_RUN ? 'MODE : DRY RUN' : 'MODE : ÉCRITURE RÉELLE');
  console.log('═══════════════════════════════════════════════\n');

  const rows = parseCSV(fs.readFileSync(CSV_PATH, 'utf8'))
    .filter(r => r.key?.trim());

  console.log(`→ ${rows.length} domaines dans le CSV\n`);

  // Générer les systemId DMN-* pour chaque domaine
  const seedMap = {};
  for (const row of rows) {
    const slug = row.key.trim();
    seedMap[slug] = {
      slug,
      systemId: IDFactory.generate('Domain'),
      labelFr:  row.labelFr?.trim() || slug,
    };
  }

  if (DRY_RUN) {
    console.log('Mapping slug → DMN-* prévu :');
    Object.values(seedMap).forEach(m => {
      console.log(`  ${m.slug.padEnd(15)} → ${m.systemId}  "${m.labelFr}"`);
    });
    console.log('\n✓ DRY RUN terminé — aucune écriture.');
    return;
  }

  // Vérifier les domaines déjà en base (idempotent par slug)
  const existing = await apiGet('/entities/Domain');
  const existingSlugs = new Set(existing.map(d => d.slug).filter(Boolean));
  console.log(`→ ${existingSlugs.size} domaine(s) déjà en base\n`);

  let created = 0; let skipped = 0; const errors = [];

  for (const row of rows) {
    const slug    = row.key.trim();
    const mapping = seedMap[slug];

    if (existingSlugs.has(slug)) {
      console.log(`  ↷ Skip "${slug}" — déjà présent`);
      skipped++;
      // Récupérer le systemId existant pour le mapping
      const existingDomain = existing.find(d => d.slug === slug);
      if (existingDomain?.systemId) mapping.systemId = existingDomain.systemId;
      continue;
    }

    const payload = {
      systemId:                      mapping.systemId,
      slug,
      labelFr:                       row.labelFr?.trim()  || slug,
      labelEn:                       row.labelEn?.trim()  || null,
      icon:                          row.icon?.trim()     || null,
      color:                         row.color?.trim()    || null,
      sortOrder:                     parseInt(row.sortOrder) || 0,
      active:                        row.active?.trim().toLowerCase() === 'true',
      contributesToCheckpointDomains: row.contributesToCheckpointDomains?.trim().toLowerCase() === 'true',
    };

    // Nettoyer les nulls
    Object.keys(payload).forEach(k => { if (payload[k] === null) delete payload[k]; });

    try {
      const result = await apiPost('/entities/Domain', payload);
      mapping.newId = result.id;
      console.log(`  ✓ ${mapping.systemId}  slug="${slug}"  "${payload.labelFr}" ${payload.icon || ''}`);
      created++;
      await sleep(150);
    } catch (err) {
      console.error(`  ✗ Erreur "${slug}": ${err.message}`);
      errors.push({ slug, error: err.message });
    }
  }

  // Sauvegarder le mapping slug → DMN-* pour migration des tables dépendantes
  fs.writeFileSync(MAP_FILE, JSON.stringify(seedMap, null, 2));

  console.log('\n═══════════════════════════════════════════════');
  console.log(`✓ ${created} domaines créés, ${skipped} déjà présents`);
  if (errors.length) console.log(`⚠ ${errors.length} erreurs`);
  console.log(`Mapping slug → DMN-* : ${MAP_FILE}`);
  console.log('');
  console.log('Prochaine étape : migrer les tables dépendantes');
  console.log('  domainKey → domainSystemId en utilisant domain-seed-map.json');
  console.log('  Tables concernées : CheckpointDomainStats, RoleDomainMap,');
  console.log('  UserDomainStats, StyleHierarchy, RoleHierarchy, CheckpointDomainLedger');
  console.log('═══════════════════════════════════════════════');
}

run().catch(err => {
  console.error('ERREUR FATALE:', err.message);
  process.exit(1);
});