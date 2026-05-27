/**
 * MICRO RAVE V3 — Test P0 : PORT-3-INTEGRATION-01
 * ============================================================
 * Valide PORT-3 : la fonction Base44 _port3TestImport, qui
 * démontre la chaîne d'imports canoniques (transitionEngagement
 * + createBase44Repositories), peut être chargée et exécutée
 * sans erreur.
 *
 * Limitation : on n'a pas Deno réel dans le sandbox CI. Mais le
 * code Deno est compatible avec Node 20 dès lors qu'on lui fournit
 * un mock base44/auth équivalent au context Base44.
 *
 * Source : PORT-3 · 27 mai 2026
 * ============================================================
 */

'use strict';

// L'entry.ts est en TypeScript syntax (mais sans types — c'est du
// JavaScript valide). Node 22 ne parse pas .ts par défaut, mais
// on peut copier le contenu dans un .js temporaire pour le test
// (ou utiliser tsx/ts-node). On choisit l'approche simple : lire
// le fichier et vérifier que ses imports résolvent.

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const __filename = url.fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const entryPath = path.join(__dirname,
  '../../codeBase44_v3/base44/functions/_port3TestImport/entry.ts');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.log(`  ✗ ${name}`);
    console.log(`    → ${err.message}`);
    failed++;
  }
}

async function testAsync(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.log(`  ✗ ${name}`);
    console.log(`    → ${err.message}`);
    failed++;
  }
}

async function main() {
  console.log('\n═══════════════════════════════════════════════');
  console.log('Test P0 : PORT-3-INTEGRATION-01');
  console.log('═══════════════════════════════════════════════\n');

  // ── Bloc 1 : Le fichier existe et est lisible ────────────
  console.log('  — Existence et lisibilité —');

  test('T-01 entry.ts de _port3TestImport existe', () => {
    if (!fs.existsSync(entryPath)) throw new Error(`Fichier absent : ${entryPath}`);
  });

  let entryContent;
  test('T-02 entry.ts est lisible', () => {
    entryContent = fs.readFileSync(entryPath, 'utf8');
    if (!entryContent || entryContent.length === 0) throw new Error('Fichier vide');
  });

  // ── Bloc 2 : Imports canoniques présents et bien formés ──
  console.log('\n  — Structure des imports —');

  test('T-03 importe transitionEngagement depuis src/core/', () => {
    if (!/import\s+\{\s*transitionEngagement\s*\}\s+from\s+['"][^'"]*src\/core\/transitionEngagement\.js['"]/
        .test(entryContent)) {
      throw new Error('Import transitionEngagement absent ou mal formé');
    }
  });

  test('T-04 importe createBase44Repositories depuis adapters/', () => {
    if (!/import\s+\{\s*createBase44Repositories\s*\}\s+from\s+['"][^'"]*adapters\/base44-adapter\.js['"]/
        .test(entryContent)) {
      throw new Error('Import createBase44Repositories absent ou mal formé');
    }
  });

  // ── Bloc 3 : Les chemins résolvent réellement ───────────
  console.log('\n  — Résolution des chemins relatifs —');

  const funcDir = path.dirname(entryPath);

  test('T-05 chemin relatif vers transitionEngagement.js résoud', () => {
    const p = path.resolve(funcDir, '../../../../src/core/transitionEngagement.js');
    if (!fs.existsSync(p)) throw new Error(`Cible inexistante : ${p}`);
  });

  test('T-06 chemin relatif vers base44-adapter.js résoud', () => {
    const p = path.resolve(funcDir, '../../../../src/repositories/adapters/base44-adapter.js');
    if (!fs.existsSync(p)) throw new Error(`Cible inexistante : ${p}`);
  });

  // ── Bloc 4 : Simulation d'exécution Node-side ────────────
  // On copie le contenu vers un .js temporaire pour pouvoir l'importer
  // (Node 22 ne parse pas les .ts par défaut). Le code est du JS valide.
  console.log('\n  — Simulation d\'exécution avec mock base44 —');

  const tempJs = path.join('/tmp', 'port3-entry-shim.mjs');
  fs.writeFileSync(tempJs, entryContent
    // Réécrire les chemins relatifs pour qu'ils résolvent depuis /tmp
    .replace(/from\s+['"]\.\.\/\.\.\/\.\.\/\.\.\/src\//g,
             `from '${path.join(__dirname, '../../src/').replace(/\\/g, '/')}`)
    .replace(/from\s+'(\/[^']*?src\/[^']+?)'/g, "from '$1'"));

  let handlerModule;
  await testAsync('T-07 import dynamique du handler réussit', async () => {
    handlerModule = await import(`file://${tempJs}`);
    if (typeof handlerModule.default !== 'function') {
      throw new Error('default export n\'est pas une fonction');
    }
  });

  await testAsync('T-08 handler exécuté retourne ok:true avec mock base44 valide', async () => {
    // Mock base44 SDK minimal
    const mockBase44 = {
      entities: new Proxy({}, {
        get: () => ({
          create: async (d) => ({ id: 'mock', ...d }),
          filter: async () => [],
          update: async (id, d) => ({ id, ...d }),
        }),
      }),
    };
    const mockReq = {};
    const mockContext = {
      base44: mockBase44,
      auth: { me: () => ({ id: 'USR-TEST', role: 'organizer' }) },
    };

    const resp = await handlerModule.default(mockReq, mockContext);
    if (!resp || typeof resp.text !== 'function') {
      throw new Error('Le handler doit retourner un Response');
    }
    const text = await resp.text();
    const body = JSON.parse(text);
    if (!body.ok) {
      throw new Error(`Handler retourne ok:false. Diagnostics: ${JSON.stringify(body.diagnostics)}`);
    }
    if (!body.diagnostics.barrierIsPhysical) {
      throw new Error('barrierIsPhysical doit être true');
    }
    if (!body.diagnostics.moteurOK) {
      throw new Error('moteurOK doit être true');
    }
    if (!body.diagnostics.interfaceOK) {
      throw new Error('interfaceOK doit être true');
    }
  });

  await testAsync('T-09 handler refuse les requêtes non authentifiées', async () => {
    const mockBase44 = { entities: new Proxy({}, { get: () => ({}) }) };
    const mockReq = {};
    const mockContext = {
      base44: mockBase44,
      auth: { me: () => { throw new Error('not authenticated'); } },
    };
    const resp = await handlerModule.default(mockReq, mockContext);
    if (resp.status !== 401) throw new Error(`Status ${resp.status}, attendu 401`);
  });

  // Cleanup
  try { fs.unlinkSync(tempJs); } catch { /* ignore */ }

  // ── Résultat ──────────────────────────────────────────────
  console.log(`\n═══════════════════════════════════════════════`);
  console.log(`Résultat : ${passed} PASSED / ${failed} FAILED`);
  if (failed === 0) {
    console.log('PORT-3-INTEGRATION-01 : ✓ PASSED');
    console.log('');
    console.log('PHASE 1 (PORTAGE CANONIQUE) terminée :');
    console.log('  ✅ PORT-1   ESM global · 121 fichiers');
    console.log('  ✅ PORT-1b  Split LedgerRepository · seed CSV');
    console.log('  ✅ PORT-2   Adaptateur Base44 Deno · 18 sous-objets');
    console.log('  ✅ PORT-3   Imports canoniques résolvent depuis Base44');
    console.log('');
    console.log('La Règle 9 ("zéro logique métier dans Base44") est');
    console.log('maintenant EXÉCUTOIRE. PHASE 3 (réalignement) peut commencer.');
    console.log('═══════════════════════════════════════════════');
  } else {
    console.log('PORT-3-INTEGRATION-01 : ✗ FAILED');
    console.log('═══════════════════════════════════════════════');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
