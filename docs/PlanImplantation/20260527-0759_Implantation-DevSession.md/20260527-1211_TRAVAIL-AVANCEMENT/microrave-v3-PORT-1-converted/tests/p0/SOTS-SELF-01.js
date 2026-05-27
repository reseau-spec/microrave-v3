/**
 * MICRO RAVE V3 — Test P0 : SOTS-SELF-01
 * ============================================================
 * Valide SOTSSubmissionService : submit(), consolidate(), isConsolidated().
 *
 * Source : D-077 · D-082 · D-094 pattern 6 · Plan Phase 2.1
 *          TEST_REGISTRY SOTS-SELF-01 requiredBeforeEvent=1
 *
 * T-01 : submit() retourne un systemId au format SOT-*
 * T-02 : submit() sans engagementId → erreur explicite
 * T-03 : submit() ou submittedBy === talentUserId → SOTS_SELF_BENEFICIAL (D-094 p6)
 * T-04 : consolidate() retourne { sotsConsolidated: true } avec snapshot
 * T-05 : isConsolidated() retourne false si pas de snapshot
 * T-06 : submit() apres consolidation → SOTS_WINDOW_CLOSED
 * ============================================================
 */

'use strict';

import { submit, consolidate, isConsolidated } from '../../src/services/SOTSSubmissionService.js';
let passed = 0; let failed = 0;

const ENG_ID      = 'ENG-SOTS-TEST001';
const TALENT_ID   = 'USR-SOTS-TALENT1';
const ORGANIZER_ID = 'USR-SOTS-ORG001';

// Scores nominaux
const NOMINAL_SCORES = { qualite: 4, ponctualite: 5, communication: 4 };

// ── Builders de mocks ─────────────────────────────────────────

function makeRepos({ snapshotExists = false, captureCreate = null, captureSnapshot = null, captureReputation = null } = {}) {
  return {
    sots: {
      create: async (data) => {
        if (captureCreate) captureCreate(data);
        return { id: 'fake-sots-001', ...data };
      },
      findByEngagementId: async () => snapshotExists
        ? [{ id: 'sub-001', engagementId: ENG_ID, consolidated: false, scoreCategories: NOMINAL_SCORES }]
        : [],
      findSnapshotByEngagementId: async () => snapshotExists
        ? { id: 'snap-001', systemId: 'SOT-SNAP-001', engagementId: ENG_ID, aggregatedScore: 4.3 }
        : null,
      createSnapshot: async (data) => {
        if (captureSnapshot) captureSnapshot(data);
        return { id: 'snap-new-001', ...data };
      },
      markConsolidated: async () => ({ consolidated: 1, engagementId: ENG_ID }),
    },
    reputation: {
      append: async (data) => {
        if (captureReputation) captureReputation(data);
        return { id: 'rep-001', ...data };
      },
    },
  };
}

async function testAsync(name, fn) {
  try { await fn(); console.log(`  \u2713 ${name}`); passed++; }
  catch (e) { console.log(`  \u2717 ${name}\n    \u2192 ${e.message}`); failed++; }
}
function assert(c, m) { if (!c) throw new Error(m); }

console.log('=======================================================');
console.log('Test P0 : SOTS-SELF-01');
console.log('SOTSSubmissionService -- D-077, D-082, D-094 pattern 6');
console.log('=======================================================\n');

async function run() {

  // ── T-01 : systemId format SOT-* ─────────────────────────
  await testAsync('T-01 : submit() retourne un systemId au format SOT-*', async () => {
    const result = await submit({
      engagementId: ENG_ID,
      talentUserId: TALENT_ID,
      submittedBy:  ORGANIZER_ID,
      scoreCategories: NOMINAL_SCORES,
      repositories: makeRepos(),
    });
    assert(typeof result.systemId === 'string' && result.systemId.startsWith('SOT-'),
      `systemId attendu format SOT-*. Recu : "${result.systemId}". ` +
      `Source : IDFactory.PREFIXES.SOTSRecord = 'SOT' · D-127.`);
    assert(typeof result.createdAt === 'string', `createdAt doit etre present.`);
  });

  // ── T-02 : engagementId absent → erreur ──────────────────
  await testAsync('T-02 : submit() sans engagementId → erreur explicite', async () => {
    let threw = false;
    try {
      await submit({
        talentUserId: TALENT_ID,
        submittedBy:  ORGANIZER_ID,
        scoreCategories: NOMINAL_SCORES,
        repositories: makeRepos(),
      });
    } catch (err) {
      threw = true;
      assert(err.message.includes('engagementId'),
        `Message doit mentionner "engagementId". Recu : "${err.message}"`);
    }
    assert(threw, 'submit() sans engagementId devait lancer une erreur.');
  });

  // ── T-03 : SOTS_SELF_BENEFICIAL — blocage absolu ─────────
  await testAsync('T-03 : submit() ou submittedBy === talentUserId → SOTS_SELF_BENEFICIAL (D-094 pattern 6)', async () => {
    let threw = false;
    try {
      await submit({
        engagementId: ENG_ID,
        talentUserId: TALENT_ID,
        submittedBy:  TALENT_ID, // meme utilisateur = auto-note
        scoreCategories: NOMINAL_SCORES,
        repositories: makeRepos(),
      });
    } catch (err) {
      threw = true;
      assert(err.message.includes('SOTS_SELF_BENEFICIAL'),
        `Message doit contenir SOTS_SELF_BENEFICIAL. Recu : "${err.message}". ` +
        `D-094 pattern 6 : blocage absolu de l'auto-note directe ou indirecte.`);
    }
    assert(threw,
      'submit() avec submittedBy === talentUserId devait etre bloque. ' +
      'D-094 pattern 6 : blocage absolu.');
  });

  // ── T-04 : consolidate() retourne sotsConsolidated + snapshot ─
  await testAsync('T-04 : consolidate() retourne { sotsConsolidated: true } avec snapshot', async () => {
    let capturedSnapshot = null;
    const result = await consolidate({
      engagementId: ENG_ID,
      talentUserId: TALENT_ID,
      repositories: makeRepos({ captureSnapshot: (d) => { capturedSnapshot = d; } }),
    });
    assert(result.sotsConsolidated === true,
      `sotsConsolidated attendu true. Recu : ${result.sotsConsolidated}.`);
    assert(result.snapshot !== undefined && result.snapshot !== null,
      `snapshot doit etre present dans le resultat. Recu : ${JSON.stringify(result.snapshot)}.`);
    assert(capturedSnapshot !== null, 'createSnapshot() du repository aurait du etre appele.');
    assert(capturedSnapshot.engagementId === ENG_ID,
      `snapshot.engagementId attendu "${ENG_ID}". Recu : "${capturedSnapshot.engagementId}".`);
    assert(typeof capturedSnapshot.systemId === 'string' && capturedSnapshot.systemId.startsWith('SOT-'),
      `snapshot.systemId attendu format SOT-*. Recu : "${capturedSnapshot.systemId}".`);
  });

  // ── T-05 : isConsolidated() = false si pas de snapshot ───
  await testAsync('T-05 : isConsolidated() retourne false si pas de snapshot', async () => {
    const result = await isConsolidated({
      engagementId: ENG_ID,
      repositories: makeRepos({ snapshotExists: false }),
    });
    assert(result === false,
      `isConsolidated() doit retourner false si aucun snapshot. Recu : ${result}.`);
  });

  // ── T-06 : submit() apres consolidation → SOTS_WINDOW_CLOSED
  await testAsync('T-06 : submit() apres consolidation → SOTS_WINDOW_CLOSED', async () => {
    let threw = false;
    try {
      await submit({
        engagementId: ENG_ID,
        talentUserId: TALENT_ID,
        submittedBy:  ORGANIZER_ID,
        scoreCategories: NOMINAL_SCORES,
        repositories: makeRepos({ snapshotExists: true }),  // fenetre fermee
      });
    } catch (err) {
      threw = true;
      assert(err.message.includes('SOTS_WINDOW_CLOSED'),
        `Message doit contenir SOTS_WINDOW_CLOSED. Recu : "${err.message}". ` +
        `D-077 : soumission apres consolidation impossible.`);
    }
    assert(threw, 'submit() apres consolidation devait lancer SOTS_WINDOW_CLOSED.');
  });

  console.log('\n=======================================================');
  console.log(`RESULTAT : ${passed} passes, ${failed} echoues sur ${passed + failed} tests`);
  if (failed === 0) {
    console.log('\u2713 SOTS-SELF-01 PASSED');
    console.log('  Phase 2.1 validee : SOTSSubmissionService operationnel.');
    console.log('  D-094 pattern 6 applique. SOTS_SELF_BENEFICIAL bloque.');
  } else {
    console.log('\u2717 SOTS-SELF-01 FAILED');
    process.exitCode = 1;
  }
  console.log('=======================================================');
}

run().catch(err => { console.error('ERREUR FATALE :', err.message); process.exitCode = 1; });