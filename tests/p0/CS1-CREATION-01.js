/**
 * MICRO RAVE V3 — Test P0 : CS1-CREATION-01
 * Valide 1B-2 : ContractSnapshot CS1 (phase 1) créé lors de la
 * transition deposit_pending → deposit_secured.
 */
'use strict';
import { transitionEngagement } from '../../src/core/transitionEngagement.js';

let passed = 0; let failed = 0;
function test(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (err) { console.log(`  ✗ ${name}\n    → ${err.message}`); failed++; }
}
async function testAsync(name, fn) {
  try { await fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (err) { console.log(`  ✗ ${name}\n    → ${err.message}`); failed++; }
}

console.log('\n═══════════════════════════════════════════════');
console.log('Test P0 : CS1-CREATION-01');
console.log('═══════════════════════════════════════════════\n');

// Mock minimal d'un repositories avec contractSnapshots
function makeRepos(onCSCreate) {
  return {
    engagements: {
      findById: async (id) => ({
        systemId: id, status: 'deposit_pending', talentUserId: 'USR-MPONM5HA-TAL001',
        organizerUserId: 'USR-MPONM5HA-ORG001', eventId: 'EVT-MPONM5HA-TST01',
        cachetSigneCents: 20000, tauxPpm: 120000, commissionMrCents: 2400,
        talentNetCents: 17600, depositCents: 8800, balanceCents: 8800,
        prixVenduClientCents: 22600, tpsCents: 1000, tvqCents: 1600, currency: 'cad',
      }),
      updateStatus: async () => ({}),
    },
    contractSnapshots: {
      create: async (data) => { onCSCreate(data); return { id: 'mock', ...data }; },
    },
    policyConfig: { getConfig: async (key) => {
      if (key === 'balanceDeadlineDays') return 30;
      return null;
    }},
    ledgerRecords: { append: async () => ({}), findByEngagementId: async () => [] },
    admin: { appendToDataAccessLedger: async () => ({}), createAdminIncidentRecord: async () => ({}) },
    scheduler: { createTask: async () => ({}) },
    sessionPresence: { create: async () => ({}), findByEngagementId: async () => [] },
  };
}

let capturedCS1 = null;
const repos = makeRepos((data) => { capturedCS1 = data; });

// IDs valides au format IDFactory (Crockford)
const ACTOR    = 'USR-MPONM5HA-SYS001';
const ENG_ID   = 'ENG-MPONM5HA-CS1TST';

await testAsync('T-01 transition deposit_pending→deposit_secured réussit', async () => {
  const result = await transitionEngagement({
    engagementId: ENG_ID,
    currentState: 'deposit_pending',
    targetState:  'deposit_secured',
    actor:        ACTOR,
    context:      { stripePaymentIntentId: 'pi_mock', confirmedAmountCents: 8800, expectedDepositCents: 8800 },
    repositories: repos,
  });
  if (!result.success) throw new Error(`Échec transition: ${JSON.stringify(result)}`);
});

test('T-02 CS1 créé (contractSnapshotPhase1 dans le résultat OU capturedCS1)', () => {
  if (!capturedCS1) throw new Error('repositories.contractSnapshots.create() jamais appelé');
});

test('T-03 CS1.systemId commence par CS1-', () => {
  if (!capturedCS1.systemId?.startsWith('CS1-'))
    throw new Error(`systemId invalide : ${capturedCS1.systemId}`);
});

test('T-04 CS1.phase === 1', () => {
  if (capturedCS1.phase !== 1) throw new Error(`phase = ${capturedCS1.phase}`);
});

test('T-05 CS1.transitionKey correct', () => {
  if (capturedCS1.transitionKey !== 'deposit_pending->deposit_secured')
    throw new Error(`transitionKey = ${capturedCS1.transitionKey}`);
});

test('T-06 CS1.cachetSigneCents est un entier', () => {
  if (!Number.isInteger(capturedCS1.cachetSigneCents))
    throw new Error(`cachetSigneCents non-integer : ${capturedCS1.cachetSigneCents}`);
});

test('T-07 CS1.tauxPpm est un entier', () => {
  if (!Number.isInteger(capturedCS1.tauxPpm))
    throw new Error(`tauxPpm non-integer : ${capturedCS1.tauxPpm}`);
});

test('T-08 CS1.currency = "cad"', () => {
  if (capturedCS1.currency !== 'cad') throw new Error(`currency = ${capturedCS1.currency}`);
});

test('T-09 CS1.immutableAt est renseigné', () => {
  if (!capturedCS1.immutableAt) throw new Error('immutableAt absent');
});

test('T-10 CS1.transitionedAt est renseigné', () => {
  if (!capturedCS1.transitionedAt) throw new Error('transitionedAt absent');
});

console.log(`\n═══════════════════════════════════════════════`);
if (failed === 0) {
  console.log(`Résultat : ${passed} PASSED / 0 FAILED`);
  console.log('CS1-CREATION-01 : ✓ PASSED');
} else {
  console.log(`Résultat : ${passed} PASSED / ${failed} FAILED`);
  console.log('CS1-CREATION-01 : ✗ FAILED');
  process.exit(1);
}
console.log('═══════════════════════════════════════════════');