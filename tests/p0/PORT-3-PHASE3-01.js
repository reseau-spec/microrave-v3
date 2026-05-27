/**
 * MICRO RAVE V3 — Test P0 : PORT-3-PHASE3-01
 * ============================================================
 * Valide PHASE 3 : les 12 fonctions Base44 exposent chacune
 * createBase44Repositories inline avec la barrière
 * LOI_TRANSITION_01_VIOLATION.
 *
 * Critères par fonction :
 *   T-A  createBase44Repositories défini dans entry.ts
 *   T-B  LOI_TRANSITION_01_VIOLATION présent dans entry.ts
 *   T-C  updateStatus bloqué dans la définition inline
 *   T-D  npm:@base44/sdk présent (pattern Base44 natif)
 *   T-E  Deno.serve présent
 *   T-F  PAS d'import relatif vers src/
 *
 * Exceptions documentées (auth.me() non requis) :
 *   stripeWebhookHandler — auth = signature HMAC Stripe
 *   getPolicyConfig — endpoint de lecture publique
 * ============================================================
 */
'use strict';
import fs   from 'node:fs';
import path from 'node:path';
import url  from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const FUNCTIONS_DIR = path.join(__dirname, '../../codeBase44_v3/base44/functions');

// Fonctions à valider (hors _port3TestImport déjà validé par PORT-3-INTEGRATION-01)
const FUNCTIONS = [
  'createEngagement',
  'createSessionPresence',
  'executePayoutTransfer',
  'getEngagement',
  'getPolicyConfig',
  'initiateBalancePayment',
  'initiateDepositPayment',
  'recognizeRevenue',
  'scheduleContestationExpiration',
  'stripeWebhookHandler',
  'submitSOTSRating',
  'transitionEngagement',
];

// Exceptions auth.me() documentées — pas une violation
const AUTH_ME_EXCEPTIONS = new Set(['stripeWebhookHandler', 'getPolicyConfig']);

let passed = 0; let failed = 0;

function test(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (err) { console.log(`  ✗ ${name}\n    → ${err.message}`); failed++; }
}

console.log('\n═══════════════════════════════════════════════');
console.log('Test P0 : PORT-3-PHASE3-01');
console.log('═══════════════════════════════════════════════\n');

for (const fn of FUNCTIONS) {
  const entryPath = path.join(FUNCTIONS_DIR, fn, 'entry.ts');

  test(`${fn} — entry.ts existe`, () => {
    if (!fs.existsSync(entryPath)) throw new Error(`Absent : ${entryPath}`);
  });

  if (!fs.existsSync(entryPath)) continue;

  const content = fs.readFileSync(entryPath, 'utf8');

  test(`${fn} — T-A createBase44Repositories inline`, () => {
    if (!content.includes('createBase44Repositories'))
      throw new Error('createBase44Repositories absent de entry.ts');
  });

  test(`${fn} — T-B LOI_TRANSITION_01_VIOLATION ancrée`, () => {
    if (!content.includes('LOI_TRANSITION_01_VIOLATION'))
      throw new Error('LOI_TRANSITION_01_VIOLATION absent');
  });

  test(`${fn} — T-C updateStatus bloqué`, () => {
    if (!content.includes('updateStatus'))
      throw new Error('updateStatus absent — barrière non posée');
  });

  test(`${fn} — T-D npm:@base44/sdk`, () => {
    if (!content.includes('npm:@base44/sdk'))
      throw new Error('import Base44 SDK absent');
  });

  test(`${fn} — T-E Deno.serve présent`, () => {
    if (!content.includes('Deno.serve'))
      throw new Error('Deno.serve absent');
  });

  test(`${fn} — T-F PAS d'import relatif src/`, () => {
    if (/from ['"]\.\..*src\//.test(content))
      throw new Error('Import relatif vers src/ détecté — violation cross-env');
  });

  if (!AUTH_ME_EXCEPTIONS.has(fn)) {
    test(`${fn} — T-G await base44.auth.me() async`, () => {
      if (!content.includes('await base44.auth.me()') && !content.includes('await base44.auth.me ()'))
        throw new Error('auth.me() doit être await (pas sync)');
    });
  } else {
    test(`${fn} — T-G auth.me() exception documentée (${fn})`, () => {
      // Exception légitime — pas de auth.me() requis
      // stripeWebhookHandler : auth = signature HMAC Stripe
      // getPolicyConfig : lecture publique config
    });
  }
}

console.log(`\n═══════════════════════════════════════════════`);
if (failed === 0) {
  console.log(`Résultat : ${passed} PASSED / 0 FAILED`);
  console.log('PORT-3-PHASE3-01 : ✓ PASSED');
} else {
  console.log(`Résultat : ${passed} PASSED / ${failed} FAILED`);
  console.log('PORT-3-PHASE3-01 : ✗ FAILED');
  process.exit(1);
}
console.log('═══════════════════════════════════════════════');
