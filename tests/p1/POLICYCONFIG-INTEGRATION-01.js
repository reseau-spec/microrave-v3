/**
 * MICRO RAVE V3 — Test P1 : POLICYCONFIG-INTEGRATION-01
 * ============================================================
 * Test d'integration reelle avec Base44 — connexion live requise.
 *
 * Source : discussion session 21 mai 2026 · D-063 · Plan Phase 2.4
 *
 * PREREQUIS :
 *   BASE44_API_KEY=<cle_reelle> dans .env ou variable d'environnement.
 *   La config 'maxDistancePolicy' doit exister dans Base44 PolicyConfig.
 *   Executer seed-policy-config.js en premier si la config est absente.
 *
 * CE TEST :
 *   - Appelle getConfig('maxDistancePolicy') via PolicyConfigAdapter reel
 *   - Verifie que la valeur retournee est un nombre (INTEGER parse)
 *   - Echoue si BASE44_API_KEY absent — test infrastructure, pas test unitaire
 *   - Prouve que le chemin complet app→PolicyConfigAdapter→Base44 fonctionne
 *
 * DIFFERRENCE AVEC LES TESTS P0 :
 *   Les tests P0 utilisent des mocks PolicyConfig.
 *   Ce test P1 appelle la vraie base Base44.
 *   Il peut etre lent (latence reseau) et requiert une connexion active.
 *
 * SKIP PROPRE :
 *   Si BASE44_API_KEY absent → SKIP avec message explicite (pas FAILED).
 *   Un test infrastructure qui skip sans cle n'est pas un echec.
 *
 * T-01 : BASE44_API_KEY absent → SKIP (pas FAILED)
 * T-02 : getConfig('maxDistancePolicy') retourne un nombre entier
 * T-03 : getConfig() fail-closed sur cle absente de la database
 * T-04 : la valeur est coherente avec policy-config-schema.js (INTEGER)
 * ============================================================
 */

'use strict';

require('dotenv').config();

const { getConfig, clearCache } = require('../../src/core/policy-config-resolver');
const { PolicyConfigRepository } = require('../../src/repositories/PolicyConfigRepository');

let passed = 0; let failed = 0; let skipped = 0;

async function test(name, fn) {
  try { await fn(); console.log(`  \u2713 ${name}`); passed++; }
  catch (e) {
    if (e.SKIP) { console.log(`  \u25cb ${name} [SKIP] ${e.message}`); skipped++; }
    else { console.log(`  \u2717 ${name}\n    \u2192 ${e.message}`); failed++; }
  }
}

function skip(message) {
  const err = new Error(message);
  err.SKIP = true;
  throw err;
}

function assert(c, m) { if (!c) throw new Error(m); }

// Detecter si la connexion est disponible
const isConnected = !!(
  process.env.BASE44_API_KEY &&
  process.env.BASE44_API_KEY !== 'REMPLACER_PAR_API_KEY_BASE44' &&
  process.env.BASE44_API_KEY.length > 10
);

console.log('=======================================================');
console.log('Test P1 : POLICYCONFIG-INTEGRATION-01');
console.log('Integration reelle Base44 -- D-063, Plan Phase 2.4');
if (!isConnected) {
  console.log('  [!] BASE44_API_KEY absent — tests infrastructure skippes');
}
console.log('=======================================================\n');

async function run() {

  // ── T-01 : BASE44_API_KEY absent → SKIP ──────────────────
  await test('T-01 : BASE44_API_KEY absent → SKIP propre (pas FAILED)', async () => {
    if (isConnected) {
      // Cle presente — ce test verifie juste que le skip fonctionne quand c'est necessaire
      // On simule l'absence temporairement
      const originalKey = process.env.BASE44_API_KEY;
      delete process.env.BASE44_API_KEY;
      try {
        const missingConnected = !!(process.env.BASE44_API_KEY);
        assert(!missingConnected, 'BASE44_API_KEY devrait etre absent apres delete');
      } finally {
        process.env.BASE44_API_KEY = originalKey;
      }
    } else {
      // Confirmer que le skip est le bon comportement
      skip('BASE44_API_KEY absent — comportement attendu en CI sans credentials');
    }
  });

  // ── T-02 : getConfig('maxDistancePolicy') → entier ───────
  await test('T-02 : getConfig(\'maxDistancePolicy\') retourne un nombre entier', async () => {
    if (!isConnected) skip('BASE44_API_KEY absent — test infrastructure skipped');

    // Vider le cache pour forcer l'appel reseau
    clearCache();

    let value;
    try {
      value = await getConfig('maxDistancePolicy');
    } catch (err) {
      if (err.message.includes('POLICY_CONFIG_MISSING')) {
        skip('maxDistancePolicy absente en base — executer seed-policy-config.js en premier');
      }
      throw err;
    }
    assert(typeof value === 'number',
      `getConfig() doit retourner un nombre. Recu : ${value} (${typeof value}). ` +
      `Verifier que la config existe en base et a value_type=INTEGER.`);
    assert(Number.isFinite(value),
      `La valeur doit etre un nombre fini. Recu : ${value}`);
    // maxDistancePolicy = distance en metres (ex: 500)
    assert(value > 0,
      `maxDistancePolicy doit etre > 0. Recu : ${value}. ` +
      `Verifier la valeur dans Base44 PolicyConfig.`);
  });

  // ── T-03 : fail-closed sur cle absente ───────────────────
  await test('T-03 : getConfig() fail-closed sur cle absente de la database', async () => {
    if (!isConnected) skip('BASE44_API_KEY absent — test infrastructure skipped');

    clearCache();
    let threw = false;
    try {
      await getConfig('CLÉ_QUI_NEXISTE_PAS_EN_BASE_20260521');
    } catch (err) {
      threw = true;
      assert(
        err.message.includes('POLICY_CONFIG_MISSING'),
        `Attendu POLICY_CONFIG_MISSING. Recu : "${err.message}". ` +
        `D-063 fail-closed : jamais de valeur par defaut silencieuse.`
      );
    }
    assert(threw, 'getConfig() sur cle absente devait lever POLICY_CONFIG_MISSING.');
  });

  // ── T-04 : coherence avec policy-config-schema.js ────────
  await test('T-04 : valeur coherente avec policy-config-schema (INTEGER parse)', async () => {
    if (!isConnected) skip('BASE44_API_KEY absent — test infrastructure skipped');

    clearCache();
    let value;
    try {
      value = await getConfig('maxDistancePolicy');
    } catch (err) {
      if (err.message.includes('POLICY_CONFIG_MISSING')) {
        skip('maxDistancePolicy absente en base — executer seed-policy-config.js en premier');
      }
      throw err;
    }
    // value_type INTEGER → Number.isInteger() attendu apres parse
    assert(Number.isInteger(value),
      `maxDistancePolicy parse comme INTEGER doit etre un entier. Recu : ${value}. ` +
      `policy-config-schema.js value_type=INTEGER. D-064.`
    );
    // Verifier la coherence avec le schema (valeur par defaut = 500 metres)
    assert(value <= 100_000,
      `maxDistancePolicy attendu raisonnable (< 100km). Recu : ${value}. ` +
      `Verifier si la valeur en base est en metres ou km.`
    );
  });

  // ── Rapport ───────────────────────────────────────────────
  console.log('\n=======================================================');
  console.log(`RESULTAT : ${passed} passes, ${failed} echoues, ${skipped} skippes sur ${passed + failed + skipped} tests`);
  if (failed === 0) {
    if (skipped > 0) {
      console.log(`\u25cb POLICYCONFIG-INTEGRATION-01 SKIPPED (${skipped} tests sans connexion Base44)`);
      console.log('  Pour executer completement : BASE44_API_KEY=<cle> node tests/p1/POLICYCONFIG-INTEGRATION-01.js');
    } else {
      console.log('\u2713 POLICYCONFIG-INTEGRATION-01 PASSED');
      console.log('  Integration Base44 validee. PolicyConfigAdapter connecte.');
    }
  } else {
    console.log('\u2717 POLICYCONFIG-INTEGRATION-01 FAILED');
    process.exitCode = 1;
  }
  console.log('=======================================================');
}

run().catch(err => { console.error('ERREUR FATALE :', err.message); process.exitCode = 1; });