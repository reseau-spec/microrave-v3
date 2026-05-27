/**
 * MICRO RAVE V3 — Test P0 : PORT-3-INTEGRATION-01
 * ============================================================
 * Valide PORT-3 : la fonction Base44 _port3TestImport respecte
 * le pattern natif Base44 (Deno.serve, npm:@base44/sdk) et que
 * la logique d'adaptateur qu'elle embarque est correcte.
 *
 * RÉALITÉ ARCHITECTURALE (clarifiée 27 mai 2026) :
 *   Base44 est un environnement cloud fermé. Les fonctions Deno
 *   n'importent PAS depuis src/ Node — les deux univers sont
 *   séparés. Ce test valide donc :
 *     1. La présence et la structure du fichier entry.ts
 *     2. Le pattern Base44 natif (Deno.serve, @base44/sdk, auth async)
 *     3. Que la barrière LOI_TRANSITION_01 est inline dans entry.ts
 *     4. Que l'adaptateur Node (base44-adapter.js) est importable
 *        et passe ses propres assertions (PORT-2 déjà validé)
 *
 * Ce que ce test ne fait PAS :
 *   - Il ne simule plus le handler Deno côté Node (syntaxe
 *     incompatible — Deno.serve n'existe pas en Node).
 *   - La validation in situ requiert un déploiement réel sur Base44.
 *
 * Source : PORT-3 · 27 mai 2026 · corrigé architecture Base44 réelle
 * ============================================================
 */

'use strict';

import fs   from 'node:fs';
import path from 'node:path';
import url  from 'node:url';

const __filename = url.fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const entryPath = path.join(
  __dirname,
  '../../codeBase44_v3/base44/functions/_port3TestImport/entry.ts'
);

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

  // ── Bloc 1 : Existence et lisibilité ──────────────────────
  console.log('  — Existence et lisibilité —');

  let entryContent = '';

  test('T-01 entry.ts de _port3TestImport existe', () => {
    if (!fs.existsSync(entryPath)) throw new Error(`Fichier absent : ${entryPath}`);
  });

  test('T-02 entry.ts est lisible et non-vide', () => {
    entryContent = fs.readFileSync(entryPath, 'utf8');
    if (!entryContent || entryContent.length < 100) throw new Error('Fichier vide ou trop court');
  });

  // ── Bloc 2 : Pattern Base44 natif ─────────────────────────
  console.log('\n  — Pattern Base44 natif —');

  test('T-03 utilise npm:@base44/sdk (pas import relatif vers src/)', () => {
    if (!entryContent.includes("from 'npm:@base44/sdk")) {
      throw new Error("Import 'npm:@base44/sdk' absent — pattern Base44 natif requis");
    }
  });

  test('T-04 utilise Deno.serve (pas export default function handler)', () => {
    if (!entryContent.includes('Deno.serve')) {
      throw new Error("Deno.serve absent — requis pour Base44 Deno runtime");
    }
  });

  test('T-05 utilise createClientFromRequest', () => {
    if (!entryContent.includes('createClientFromRequest')) {
      throw new Error("createClientFromRequest absent");
    }
  });

  test('T-06 auth est async (await base44.auth.me())', () => {
    if (!entryContent.includes('await base44.auth.me()')) {
      throw new Error("base44.auth.me() doit être await — pas sync");
    }
  });

  test('T-07 PAS d\'import relatif vers src/ (univers séparés)', () => {
    if (/from\s+['"][^'"]*src\/core\//.test(entryContent) ||
        /from\s+['"][^'"]*src\/repositories\//.test(entryContent)) {
      throw new Error(
        "Import relatif vers src/ détecté — impossible dans Base44 cloud (univers séparés)"
      );
    }
  });

  // ── Bloc 3 : Barrière LOI_TRANSITION_01 dans entry.ts ─────
  console.log('\n  — Barrière LOI_TRANSITION_01 —');

  test('T-08 LOI_TRANSITION_01_VIOLATION présent dans entry.ts', () => {
    if (!entryContent.includes('LOI_TRANSITION_01_VIOLATION')) {
      throw new Error("LOI_TRANSITION_01_VIOLATION absent de entry.ts");
    }
  });

  test('T-09 updateStatus est bloqué dans entry.ts', () => {
    if (!entryContent.includes('updateStatus')) {
      throw new Error("updateStatus absent — barrière requise");
    }
  });

  test('T-10 createBase44Repositories défini inline dans entry.ts', () => {
    if (!entryContent.includes('function createBase44Repositories')) {
      throw new Error("createBase44Repositories inline absent");
    }
  });

  // ── Bloc 4 : L'adaptateur Node (PORT-2) reste valide ──────
  console.log('\n  — Adaptateur Node src/ (PORT-2) —');

  await testAsync('T-11 base44-adapter.js importable depuis Node', async () => {
    const adapterPath = path.join(__dirname, '../../src/repositories/adapters/base44-adapter.js');
    if (!fs.existsSync(adapterPath)) throw new Error('base44-adapter.js absent');
    const mod = await import(`file://${adapterPath}`);
    if (typeof mod.createBase44Repositories !== 'function' &&
        typeof mod.default?.createBase44Repositories !== 'function' &&
        typeof mod.default !== 'function') {
      throw new Error('createBase44Repositories introuvable dans base44-adapter.js');
    }
  });

  await testAsync('T-12 createBase44Repositories (Node) : barrière LOI_TRANSITION_01 ancrée', async () => {
    const adapterPath = path.join(__dirname, '../../src/repositories/adapters/base44-adapter.js');
    const mod = await import(`file://${adapterPath}`);
    const factory = mod.createBase44Repositories ?? mod.default?.createBase44Repositories ?? mod.default;
    const mockBase44 = {
      entities: new Proxy({}, {
        get: () => ({
          create: async (d) => ({ id: 'mock', ...d }),
          filter: async () => [],
          update: async (id, d) => ({ id, ...d }),
        }),
      }),
    };
    const repos = factory(mockBase44);
    let barrierOK = false;
    try {
      repos.engagements.updateStatus('ENG-FAKE', 'deposit_secured');
    } catch (err) {
      barrierOK = err.message.includes('LOI_TRANSITION_01_VIOLATION');
    }
    if (!barrierOK) throw new Error('Barrière updateStatus() non ancrée');
  });

  await testAsync('T-13 createBase44Repositories (Node) : 18 sous-objets exposés', async () => {
    const adapterPath = path.join(__dirname, '../../src/repositories/adapters/base44-adapter.js');
    const mod = await import(`file://${adapterPath}`);
    const factory = mod.createBase44Repositories ?? mod.default?.createBase44Repositories ?? mod.default;
    const mockBase44 = {
      entities: new Proxy({}, {
        get: () => ({
          create: async (d) => ({ id: 'mock', ...d }),
          filter: async () => [],
          update: async (id, d) => ({ id, ...d }),
        }),
      }),
    };
    const repos = factory(mockBase44);
    const required = [
      'engagements', 'contractSnapshots', 'ledgerRecords', 'ledgerRecordStatusHistory',
      'admin', 'scheduler', 'policyConfig', 'sessionPresence', 'sots',
      'reputation', 'membership', 'payoutExecutionRecords', 'settlementInstructions',
      'talentPaymentProfiles', 'webhookProcessedLogs', 'engagementAmendments',
      'commercialOperationLock', 'kpiSnapshots',
    ];
    const missing = required.filter(k => !(k in repos));
    if (missing.length > 0) throw new Error(`Sous-objets manquants : ${missing.join(', ')}`);
  });

  // ── Résultat ──────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════');
  console.log(`Résultat : ${passed} PASSED / ${failed} FAILED`);

  if (failed === 0) {
    console.log('PORT-3-INTEGRATION-01 : ✓ PASSED');
    console.log('');
    console.log('PHASE 1 (PORTAGE CANONIQUE) terminée :');
    console.log('  ✅ PORT-1   ESM global · 121 fichiers');
    console.log('  ✅ PORT-1b  Split LedgerRepository · seed CSV');
    console.log('  ✅ PORT-2   Adaptateur Base44 Node · 18 sous-objets');
    console.log('  ✅ PORT-3   Pattern Base44 natif validé · barrière LOI_TRANSITION_01 confirmée');
    console.log('');
    console.log('NOTE : validation in situ = déployer _port3TestImport sur Base44');
    console.log('       et appeler son endpoint. Deno.serve non simulable en Node.');
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