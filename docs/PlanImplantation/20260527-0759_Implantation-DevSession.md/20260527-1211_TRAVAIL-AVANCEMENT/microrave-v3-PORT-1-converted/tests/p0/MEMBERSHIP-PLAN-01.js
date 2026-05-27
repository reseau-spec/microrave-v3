/**
 * MICRO RAVE V3 — Test P0 : MEMBERSHIP-PLAN-01
 * ============================================================
 * Valide MembershipPlanService : getTauxPpmForUser(), getActivePlanForUser().
 *
 * Source : D-027 · Fiche J BLOQUANT-J2 · Plan Phase 1.2
 *
 * T-01 : getTauxPpmForUser() retourne 120 000 pour un utilisateur Freemium
 * T-02 : getTauxPpmForUser() sans plan actif → MEMBERSHIP_PLAN_ERROR
 * T-03 : getTauxPpmForUser() avec commissionRatePpm float → MEMBERSHIP_PLAN_ERROR
 * T-04 : getTauxPpmForUser() avec commissionRatePpm > 1 000 000 → MEMBERSHIP_PLAN_ERROR
 * T-05 : getActivePlanForUser() retourne null si aucun plan
 * T-06 : getTauxPpmForUser() sans userId → erreur explicite
 * ============================================================
 */

'use strict';

import { getTauxPpmForUser, getActivePlanForUser } from '../../src/services/MembershipPlanService.js';
let passed = 0;
let failed = 0;

const USER_ID = 'USR-MEMBTEST-001';

// Plans canoniques D-027
const PLANS = {
  freemium:  { planName: 'Freemium',  commissionRatePpm: 120_000 },
  base:      { planName: 'Base',      commissionRatePpm:  90_000 },
  pro:       { planName: 'Pro',       commissionRatePpm:  60_000 },
  studio:    { planName: 'Studio',    commissionRatePpm:  35_000 },
  fondateur: { planName: 'Fondateur', commissionRatePpm:  50_000 },
};

function makeMembership(plan) {
  return { membership: { findActiveByUserId: async () => plan } };
}

async function testAsync(name, fn) {
  try {
    await fn();
    console.log(`\u2713 ${name}`);
    passed++;
  } catch (err) {
    console.log(`\u2717 ${name}`);
    console.log(`  \u2192 ${err.message}`);
    failed++;
  }
}

function assert(cond, msg) { if (!cond) throw new Error(msg); }

console.log('=======================================================');
console.log('Test P0 : MEMBERSHIP-PLAN-01');
console.log('MembershipPlanService -- D-027, Fiche J BLOQUANT-J2, Phase 1.2');
console.log('=======================================================\n');

async function run() {

  await testAsync('T-01 : getTauxPpmForUser() retourne 120 000 pour un utilisateur Freemium', async () => {
    const taux = await getTauxPpmForUser({ userId: USER_ID, repositories: makeMembership(PLANS.freemium) });
    assert(taux === 120_000, `Attendu 120 000 ppm. Recu : ${taux}. Source : D-027 plan Freemium.`);
    assert(Number.isInteger(taux), `tauxPpm doit etre un entier. Recu : ${taux} (${typeof taux}). D-064.`);
  });

  await testAsync('T-02 : getTauxPpmForUser() sans plan actif → MEMBERSHIP_PLAN_ERROR', async () => {
    let threw = false;
    try {
      await getTauxPpmForUser({ userId: USER_ID, repositories: makeMembership(null) });
    } catch (err) {
      threw = true;
      assert(err.message.includes('MEMBERSHIP_PLAN_ERROR'),
        `Message doit contenir MEMBERSHIP_PLAN_ERROR. Recu : "${err.message}"`);
    }
    assert(threw, 'Plan absent devait lancer MEMBERSHIP_PLAN_ERROR. Source : D-027 fail-closed.');
  });

  await testAsync('T-03 : getTauxPpmForUser() avec commissionRatePpm float → MEMBERSHIP_PLAN_ERROR', async () => {
    let threw = false;
    try {
      await getTauxPpmForUser({ userId: USER_ID, repositories: makeMembership({ planName: 'Freemium', commissionRatePpm: 120000.5 }) });
    } catch (err) {
      threw = true;
      assert(err.message.includes('MEMBERSHIP_PLAN_ERROR'),
        `Message doit contenir MEMBERSHIP_PLAN_ERROR. Recu : "${err.message}"`);
    }
    assert(threw, 'commissionRatePpm float devait lancer une erreur. Source : D-064 -- jamais float.');
  });

  await testAsync('T-04 : getTauxPpmForUser() avec commissionRatePpm > 1 000 000 → MEMBERSHIP_PLAN_ERROR', async () => {
    let threw = false;
    try {
      await getTauxPpmForUser({ userId: USER_ID, repositories: makeMembership({ planName: 'Invalid', commissionRatePpm: 1_000_001 }) });
    } catch (err) {
      threw = true;
      assert(err.message.includes('MEMBERSHIP_PLAN_ERROR'),
        `Message doit contenir MEMBERSHIP_PLAN_ERROR. Recu : "${err.message}"`);
    }
    assert(threw, 'commissionRatePpm > 1 000 000 devait lancer une erreur (taux > 100% impossible).');
  });

  await testAsync('T-05 : getActivePlanForUser() retourne null si aucun plan', async () => {
    const result = await getActivePlanForUser({ userId: USER_ID, repositories: makeMembership(null) });
    assert(result === null, `getActivePlanForUser() doit retourner null si aucun plan. Recu : ${JSON.stringify(result)}`);
  });

  await testAsync('T-06 : getTauxPpmForUser() sans userId → erreur explicite', async () => {
    let threw = false;
    try {
      await getTauxPpmForUser({ repositories: makeMembership(PLANS.freemium) });
    } catch (err) {
      threw = true;
      assert(err.message.includes('userId') || err.message.includes('MEMBERSHIP_PLAN_ERROR'),
        `Message doit mentionner "userId". Recu : "${err.message}"`);
    }
    assert(threw, 'userId absent devait lancer une erreur.');
  });

  console.log('\n=======================================================');
  console.log(`RESULTAT : ${passed} passes, ${failed} echoues sur ${passed + failed} tests`);
  if (failed === 0) {
    console.log('\u2713 MEMBERSHIP-PLAN-01 PASSED');
    console.log('  Phase 1.2 validee : MembershipPlanService operationnel.');
    console.log('  D-027 applique. tauxPpm resolu depuis la base, jamais hardcode.');
  } else {
    console.log('\u2717 MEMBERSHIP-PLAN-01 FAILED');
    process.exitCode = 1;
  }
  console.log('=======================================================');
}

run().catch(err => {
  console.error('ERREUR FATALE :', err.message);
  process.exitCode = 1;
});