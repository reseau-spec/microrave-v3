/**
 * MICRO RAVE V3 — Test P0 : SESSION-PRESENCE-01
 * ============================================================
 * Valide SessionPresenceService : create(), recordCheckout(), getByEngagementId().
 *
 * Source : D-093 · Fiche D BLOQUANT-D2 · Plan Phase 1.1
 *
 * T-01 : create() retourne un systemId au format SPR-*
 * T-02 : create() sans engagementId → erreur explicite
 * T-03 : create() sans talentUserId → erreur explicite
 * T-04 : create() appelle repositories.sessionPresence.create() avec les bons champs
 * T-05 : recordCheckout() avec finalDurationMinutes négatif → erreur explicite
 * T-06 : recordCheckout() avec finalDurationMinutes float → erreur explicite
 * T-07 : getByEngagementId() retourne null si aucun record
 * ============================================================
 */

'use strict';

import { create, recordCheckout, getByEngagementId } from '../../src/services/SessionPresenceService.js';
let passed = 0;
let failed = 0;

const ENG_ID    = 'ENG-SPRTEST-001001';
const TALENT_ID = 'USR-SPRTEST-TAL001';

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

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

console.log('=======================================================');
console.log('Test P0 : SESSION-PRESENCE-01');
console.log('SessionPresenceService -- D-093, Fiche D BLOQUANT-D2, Phase 1.1');
console.log('=======================================================\n');

async function run() {

  await testAsync('T-01 : create() retourne un systemId au format SPR-*', async () => {
    let captured = null;
    const mockRepo = { create: async (data) => { captured = data; return { id: 'fake-b44' }; } };
    const result = await create({
      engagementId: ENG_ID, talentUserId: TALENT_ID,
      repositories: { sessionPresence: mockRepo },
    });
    assert(typeof result.systemId === 'string' && result.systemId.startsWith('SPR-'),
      `systemId attendu format SPR-*. Recu : "${result.systemId}". Source : IDFactory.PREFIXES.SessionPresence = 'SPR'.`);
    assert(typeof result.createdAt === 'string', `createdAt doit etre un string ISO. Recu : ${result.createdAt}`);
  });

  await testAsync('T-02 : create() sans engagementId → erreur explicite', async () => {
    let threw = false;
    try {
      await create({ talentUserId: TALENT_ID, repositories: { sessionPresence: { create: async () => {} } } });
    } catch (err) {
      threw = true;
      assert(err.message.includes('engagementId'),
        `Message d'erreur doit mentionner "engagementId". Recu : "${err.message}"`);
    }
    assert(threw, 'create() sans engagementId devait lancer une erreur');
  });

  await testAsync('T-03 : create() sans talentUserId → erreur explicite', async () => {
    let threw = false;
    try {
      await create({ engagementId: ENG_ID, repositories: { sessionPresence: { create: async () => {} } } });
    } catch (err) {
      threw = true;
      assert(err.message.includes('talentUserId'),
        `Message d'erreur doit mentionner "talentUserId". Recu : "${err.message}"`);
    }
    assert(threw, 'create() sans talentUserId devait lancer une erreur');
  });

  await testAsync('T-04 : create() appelle repositories.sessionPresence.create() avec les bons champs', async () => {
    let captured = null;
    const mockRepo = { create: async (data) => { captured = data; return { id: 'fake-b44' }; } };
    await create({
      engagementId: ENG_ID,
      talentUserId: TALENT_ID,
      gpsCoordinates: { lat: 45.5017, lng: -73.5673, accuracyMeters: 10 },
      signalTypes: ['GPS'],
      repositories: { sessionPresence: mockRepo },
    });
    assert(captured !== null, 'create() du repository aurait du etre appele');
    assert(captured.systemId && captured.systemId.startsWith('SPR-'),
      `captured.systemId format SPR-* attendu. Recu : "${captured.systemId}"`);
    assert(captured.engagementId === ENG_ID,
      `captured.engagementId attendu "${ENG_ID}". Recu : "${captured.engagementId}"`);
    assert(captured.talentUserId === TALENT_ID,
      `captured.talentUserId attendu "${TALENT_ID}". Recu : "${captured.talentUserId}"`);
    assert(Number.isInteger(captured.checkInAt) && captured.checkInAt > 0,
      `captured.checkInAt doit etre un timestamp ms entier. Recu : ${captured.checkInAt}`);
    assert(Array.isArray(captured.signalTypes) && captured.signalTypes.includes('GPS'),
      `captured.signalTypes doit inclure 'GPS'. Recu : ${JSON.stringify(captured.signalTypes)}`);
  });

  await testAsync('T-05 : recordCheckout() avec finalDurationMinutes negatif → erreur explicite', async () => {
    let threw = false;
    try {
      await recordCheckout({
        sessionPresenceId: 'fake-b44-id', engagementId: ENG_ID,
        finalDurationMinutes: -1,
        repositories: { sessionPresence: { updateCheckout: async () => {} } },
      });
    } catch (err) {
      threw = true;
      assert(err.message.includes('finalDurationMinutes') || err.message.includes('0'),
        `Message d'erreur doit mentionner finalDurationMinutes ou la contrainte >= 0. Recu : "${err.message}"`);
    }
    assert(threw, 'finalDurationMinutes negatif devait lancer une erreur');
  });

  await testAsync('T-06 : recordCheckout() avec finalDurationMinutes float → erreur explicite', async () => {
    let threw = false;
    try {
      await recordCheckout({
        sessionPresenceId: 'fake-b44-id', engagementId: ENG_ID,
        finalDurationMinutes: 90.5,
        repositories: { sessionPresence: { updateCheckout: async () => {} } },
      });
    } catch (err) {
      threw = true;
      assert(err.message.includes('finalDurationMinutes') || err.message.includes('entier') || err.message.includes('integer'),
        `Message d'erreur doit mentionner finalDurationMinutes ou "entier". Recu : "${err.message}"`);
    }
    assert(threw, 'finalDurationMinutes float devait lancer une erreur. Source : D-064 -- jamais float.');
  });

  await testAsync('T-07 : getByEngagementId() retourne null si aucun record', async () => {
    const mockRepo = { findByEngagementId: async () => null };
    const result = await getByEngagementId({ engagementId: ENG_ID, repositories: { sessionPresence: mockRepo } });
    assert(result === null, `getByEngagementId() doit retourner null si aucun record. Recu : ${JSON.stringify(result)}`);
  });

  console.log('\n=======================================================');
  console.log(`RESULTAT : ${passed} passes, ${failed} echoues sur ${passed + failed} tests`);
  if (failed === 0) {
    console.log('\u2713 SESSION-PRESENCE-01 PASSED');
    console.log('  Phase 1.1 validee : SessionPresenceService operationnel.');
    console.log('  D-093 applique. Check-in talent possible.');
  } else {
    console.log('\u2717 SESSION-PRESENCE-01 FAILED');
    process.exitCode = 1;
  }
  console.log('=======================================================');
}

run().catch(err => {
  console.error('ERREUR FATALE :', err.message);
  process.exitCode = 1;
});