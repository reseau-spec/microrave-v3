/**
 * MICRO RAVE V3 — Test P0 : CS2-CREATION-01
 * ============================================================
 * Valide 1B-3 : ContractSnapshot CS2 (phase 2) créé lors de la
 * transition deposit_secured → event_sealed.
 * Source : D-014 · 1B-3 PHASE 2
 * ============================================================
 */
'use strict';
import { transitionEngagement } from '../../src/core/transitionEngagement.js';
import IDFactory from '../../src/core/IDFactory.js';

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
console.log('Test P0 : CS2-CREATION-01');
console.log('═══════════════════════════════════════════════\n');

const ACTOR      = 'USR-MPONM5HA-SYS001';
const ENG_ID     = 'ENG-MPONM5HA-CS2TST';
const EVENT_ID   = 'EVT-MPONM5HA-TST02';
const CS1_ID     = 'CS1-MPONM5HA-FAKE01'; // CS1 préexistant requis par SealingGuard

let capturedCS2 = null;

function makeRepos(onCSCreate) {
  return {
    engagements: {
      findById: async (id) => ({
        systemId: id, status: 'deposit_secured',
        talentUserId:    'USR-MPONM5HA-TAL001',
        organizerUserId: 'USR-MPONM5HA-ORG001',
        eventId:         EVENT_ID,
        cachetSigneCents: 20000, tauxPpm: 120000, commissionMrCents: 2400,
        talentNetCents: 17600, depositCents: 8800, balanceCents: 8800,
        prixVenduClientCents: 22600, tpsCents: 1000, tvqCents: 1600, currency: 'cad',
      }),
      updateStatus: async () => ({}),
    },
    contractSnapshots: {
      create: async (data) => {
        onCSCreate(data);
        return { id: 'mock-cs2', ...data };
      },
    },
    policyConfig: {
      getConfig: async (key) => {
        if (key === 'balanceDeadlineDays') return 30;
        return null;
      },
    },
    ledgerRecords: {
      append: async () => ({}),
      findByEngagementId: async () => [],
    },
    admin: {
      appendToDataAccessLedger: async () => ({}),
      createAdminIncidentRecord: async () => ({}),
    },
    scheduler: { createTask: async () => ({}) },
    sessionPresence: {
      create: async () => ({}),
      findByEngagementId: async () => [],
    },
  };
}

const repos = makeRepos((data) => {
  // SealingGuard peut aussi appeler create() pour contractSnapshot interne —
  // on capture le premier appel avec phase 2
  if (data.phase === 2) capturedCS2 = data;
});

await testAsync('T-01 transition deposit_secured→event_sealed réussit', async () => {
  const result = await transitionEngagement({
    engagementId: ENG_ID,
    currentState: 'deposit_secured',
    targetState:  'event_sealed',
    actor:        ACTOR,
    context: {
      // SealingGuard requirements
      contractSnapshotPhase1Id: CS1_ID,
      eventId:                  EVENT_ID,
      depositReceivedCents:     8800,
      balanceReceivedCents:     13800,  // 8800 + 13800 = 22600 = prixVenduClientCents
      prixVenduClientCents:     22600,  // doit = deposit + balance (tolérance 2 cts)
      lineupEntries: [{
        talentUserId:    'USR-MPONM5HA-TAL001',
        cachetSigneCents: 20000,
        tauxPpm:          120000,
        tier:             'Base',
      }],
      // Données financières pour le snapshot CS2
      cachetSigneCents:     20000,
      tauxPpm:              120000,
      commissionMrCents:    2400,
      talentNetCents:       17600,
      depositCents:         8800,
      balanceCents:         8800,
      tpsCents:             1000,
      tvqCents:             1600,
      currency:             'cad',
    },
    repositories: repos,
  });
  if (!result.success) throw new Error(`Échec transition: ${JSON.stringify(result)}`);
});

test('T-02 CS2 créé — repositories.contractSnapshots.create() appelé avec phase 2', () => {
  if (!capturedCS2) throw new Error('create() avec phase 2 jamais appelé');
});

test('T-03 CS2.systemId commence par CS2-', () => {
  if (!capturedCS2.systemId?.startsWith('CS2-'))
    throw new Error(`systemId invalide : ${capturedCS2.systemId}`);
});

test('T-04 CS2.phase === 2', () => {
  if (capturedCS2.phase !== 2) throw new Error(`phase = ${capturedCS2.phase}`);
});

test('T-05 CS2.transitionKey = deposit_secured->event_sealed', () => {
  if (capturedCS2.transitionKey !== 'deposit_secured->event_sealed')
    throw new Error(`transitionKey = ${capturedCS2.transitionKey}`);
});

test('T-06 CS2.cachetSigneCents est un entier', () => {
  if (!Number.isInteger(capturedCS2.cachetSigneCents))
    throw new Error(`cachetSigneCents non-integer : ${capturedCS2.cachetSigneCents}`);
});

test('T-07 CS2.tauxPpm est un entier', () => {
  if (!Number.isInteger(capturedCS2.tauxPpm))
    throw new Error(`tauxPpm non-integer : ${capturedCS2.tauxPpm}`);
});

test('T-08 CS2.currency = "cad"', () => {
  if (capturedCS2.currency !== 'cad') throw new Error(`currency = ${capturedCS2.currency}`);
});

test('T-09 CS2.immutableAt renseigné', () => {
  if (!capturedCS2.immutableAt) throw new Error('immutableAt absent');
});

test('T-10 CS2.transitionedAt renseigné', () => {
  if (!capturedCS2.transitionedAt) throw new Error('transitionedAt absent');
});

console.log(`\n═══════════════════════════════════════════════`);
if (failed === 0) {
  console.log(`Résultat : ${passed} PASSED / 0 FAILED`);
  console.log('CS2-CREATION-01 : ✓ PASSED');
} else {
  console.log(`Résultat : ${passed} PASSED / ${failed} FAILED`);
  console.log('CS2-CREATION-01 : ✗ FAILED');
  process.exit(1);
}
console.log('═══════════════════════════════════════════════');
