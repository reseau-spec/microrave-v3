/**
 * MICRO RAVE V3 — Test P0 : AMENDMENT-01
 * ============================================================
 * Prouve que D-147 (EngagementAmendmentGuard) respecte toutes
 * ses conditions invariantes.
 *
 * Scénario de référence : SC-07-AMENDMENT (OS V14)
 *   DJ warmup — signé 20 000¢ (200$) pour 60 min
 *   coefficient à event_sealed : 1.5
 *   cachetBrutFinal = 30 000¢ (300$)
 *   taux MR : 12% (120 000 ppm)
 *   Extension : 60 min → 180 min (+120 min)
 *
 * Calculs attendus :
 *   taux_horaire_implicite = floor(30000 × 60 / 60) = 30 000¢/h
 *   nouveau_cachet_brut_final = floor(30000 × 180 / 60) = 90 000¢
 *   delta_cachet = 90 000 − 30 000 = 60 000¢
 *   delta_commission_mr = floor(60000 × 120000 / 1_000_000) = 7 200¢
 *   delta_talent_net = 60 000 − 7 200 = 52 800¢
 *   rounding_delta = 0
 *
 * Tests :
 *   T-01 : chemin nominal — amendment créé avec calculs corrects
 *   T-02 : état non-performed → AMENDMENT_WRONG_STATE
 *   T-03 : newDuration ≤ originalDuration → AMENDMENT_NOT_AN_EXTENSION
 *   T-04 : dépassement maxExtensionMinutes → AMENDMENT_EXCEEDS_MAX_EXTENSION
 *   T-05 : talent consent absent → AMENDMENT_MISSING_TALENT_CONSENT
 *   T-06 : organizer consent absent → AMENDMENT_MISSING_ORGANIZER_CONSENT
 *   T-07 : reasonCode absent → AMENDMENT_MISSING_REASON_CODE
 *   T-08 : ContractSnapshot absent → AMENDMENT_MISSING_SNAPSHOT
 *   T-09 : amendmentType invalide → AMENDMENT_TYPE_INVALID
 *   T-10 : taux WORM W2 immuable — extension × 2 donne le même taux horaire
 *   T-11 : LOI LEDGER-02 delta — delta_cachet = net + commission + rounding
 *   T-12 : systemId au format AMD-* (IDFactory)
 *   T-13 : configs absentes → fail-closed (AMENDMENT_POLICY_CONFIG_MISSING)
 *   T-14 : EngagementAmendmentService.createAmendment — orchestration complète
 *
 * Source : D-147 · OS V14 section 2.7.2 · SC-07-AMENDMENT
 * ============================================================
 */

'use strict';

const EngagementAmendmentGuard   = require('../../src/core/guards/EngagementAmendmentGuard');
const EngagementAmendmentService = require('../../src/services/EngagementAmendmentService');

// ── Fixtures ──────────────────────────────────────────────────
const ENG_ID    = 'ENG-AMENDMENT-T001';
const ACTOR_ID  = 'USR-AMENDMENT-ACT1';
const TALENT_ID = 'USR-AMENDMENT-TAL1';

// ContractSnapshot phase 2 (WORM W2) — DJ warmup après coefficient 1.5
const SNAPSHOT_W2 = {
  systemId:                  'CS2-AMENDMENT-001',
  engagementId:              ENG_ID,
  phase:                     2,
  talentUserId:              TALENT_ID,
  cachetBrutFinalCents:      30_000,   // 200$ × 1.5 = 300$
  durationMinutes:           60,       // contrat signé pour 60 min
  tauxEffectifSnapshotPpm:   120_000,  // 12%
  prixVenduClientCents:      45_000,   // prix vendu total (event multi-talent)
};

// ── Mock repositories ─────────────────────────────────────────
function makeRepos({ missingAmendmentConfig = false } = {}) {
  return {
    policyConfig: {
      async getConfig(key) {
        if (missingAmendmentConfig &&
            (key === 'amendment_max_extension_minutes' || key === 'amendment_require_double_consent')) {
          throw new Error(`POLICY_CONFIG_MISSING: "${key}" absent`);
        }
        const db = {
          amendment_max_extension_minutes:  180,
          amendment_require_double_consent: 'true',
        };
        if (!(key in db)) throw new Error(`POLICY_CONFIG_MISSING: "${key}" absent du mock`);
        return db[key];
      },
    },
    engagementAmendments: {
      async create(amendment) { return { id: `DB-${amendment.systemId}`, ...amendment }; },
    },
    ledgerRecords: {
      async append(entry) { return { id: `LDG-${Date.now()}-${Math.random()}`, ...entry }; },
    },
  };
}

// Context nominal complet
function makeContext(overrides = {}) {
  return {
    amendmentType:          'PLAGE_EXTENSION',
    newDurationMinutes:     180,             // 60 → 180 min (+120 min)
    talentConsentAt:        '2026-05-20T23:00:00.000Z',
    organizerConsentAt:     '2026-05-20T23:01:00.000Z',
    reasonCode:             'HEADLINER_NO_SHOW',
    adminActionId:          null,
    contractSnapshotPhase2: SNAPSHOT_W2,
    ...overrides,
  };
}

// ── Helpers ───────────────────────────────────────────────────
let passed = 0;
let failed = 0;

async function test(name, fn) {
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

function assert(cond, msg) { if (!cond) throw new Error(msg); }

async function expectBlocked(fn, expectedReason) {
  const result = await fn();
  assert(result.passed === false, `Guard aurait dû bloquer — attendu: ${expectedReason}`);
  assert(
    result.reason.includes(expectedReason),
    `Attendu "${expectedReason}" dans: ${result.reason}`
  );
}

// ─────────────────────────────────────────────────────────────
async function run() {
  console.log('AMENDMENT-01 — D-147 EngagementAmendmentGuard');
  console.log('═══════════════════════════════════════════════');

  // T-01 ─────────────────────────────────────────────────────
  await test('T-01 chemin nominal — amendment créé, calculs D-147 corrects', async () => {
    const result = await EngagementAmendmentGuard.validate({
      engagementId:           ENG_ID,
      currentEngagementState: 'performed',
      actor:                  ACTOR_ID,
      context:                makeContext(),
      repositories:           makeRepos(),
    });

    assert(result.passed === true,   `Guard doit passer — raison: ${result.reason}`);
    assert(result.amendment,         'amendment doit être présent');

    const a = result.amendment;

    // Format systemId
    assert(a.systemId.startsWith('AMD-'),              `systemId doit commencer par AMD-, reçu: ${a.systemId}`);

    // Durées
    assert(a.originalDurationMinutes === 60,            `originalDuration doit être 60, reçu: ${a.originalDurationMinutes}`);
    assert(a.newDurationMinutes === 180,                `newDuration doit être 180, reçu: ${a.newDurationMinutes}`);
    assert(a.extensionMinutes === 120,                  `extension doit être 120, reçu: ${a.extensionMinutes}`);

    // Taux horaire implicite — floor(30000 × 60 / 60) = 30000¢/h
    assert(a.tauxHoraireImpliciteCents === 30_000,      `taux horaire doit être 30000, reçu: ${a.tauxHoraireImpliciteCents}`);

    // Nouveau cachet — floor(30000 × 180 / 60) = 90000¢
    assert(a.newCachetBrutFinalCents === 90_000,        `newCachet doit être 90000, reçu: ${a.newCachetBrutFinalCents}`);

    // Delta cachet = 90000 − 30000 = 60000¢
    assert(a.deltaCachetCents === 60_000,               `delta cachet doit être 60000, reçu: ${a.deltaCachetCents}`);

    // Delta commission = floor(60000 × 120000 / 1_000_000) = 7200¢
    assert(a.deltaCommissionMrCents === 7_200,          `delta commission doit être 7200, reçu: ${a.deltaCommissionMrCents}`);

    // Delta talent net = 60000 − 7200 = 52800¢
    assert(a.deltaTalentNetCents === 52_800,            `delta talent net doit être 52800, reçu: ${a.deltaTalentNetCents}`);

    // Rounding delta = 0
    assert(a.roundingDeltaCents === 0,                  `rounding delta doit être 0, reçu: ${a.roundingDeltaCents}`);

    // Métadonnées
    assert(a.amendmentType === 'PLAGE_EXTENSION',       'amendmentType doit être PLAGE_EXTENSION');
    assert(a.reasonCode === 'HEADLINER_NO_SHOW',        'reasonCode doit être transmis');
    assert(a.wormAppendOnly === true,                   'wormAppendOnly doit être true');
    assert(a.doesNotViolateEventSealed === true,        'doesNotViolateEventSealed doit être true');
  });

  // T-02 ─────────────────────────────────────────────────────
  await test('T-02 état non-performed → AMENDMENT_WRONG_STATE', async () => {
    for (const badState of ['accepted', 'event_sealed', 'event_completed', 'payable', 'settled']) {
      await expectBlocked(
        () => EngagementAmendmentGuard.validate({
          engagementId: ENG_ID, currentEngagementState: badState, actor: ACTOR_ID,
          context: makeContext(), repositories: makeRepos(),
        }),
        'AMENDMENT_WRONG_STATE'
      );
    }
  });

  // T-03 ─────────────────────────────────────────────────────
  await test('T-03 newDuration ≤ originalDuration → AMENDMENT_NOT_AN_EXTENSION', async () => {
    for (const badDuration of [60, 59, 1]) {
      await expectBlocked(
        () => EngagementAmendmentGuard.validate({
          engagementId: ENG_ID, currentEngagementState: 'performed', actor: ACTOR_ID,
          context: makeContext({ newDurationMinutes: badDuration }), repositories: makeRepos(),
        }),
        'AMENDMENT_NOT_AN_EXTENSION'
      );
    }
  });

  // T-04 ─────────────────────────────────────────────────────
  await test('T-04 dépassement maxExtensionMinutes → AMENDMENT_EXCEEDS_MAX_EXTENSION', async () => {
    // maxExtensionMinutes = 180. originalDuration = 60. max allowed = 60+180 = 240min.
    await expectBlocked(
      () => EngagementAmendmentGuard.validate({
        engagementId: ENG_ID, currentEngagementState: 'performed', actor: ACTOR_ID,
        context: makeContext({ newDurationMinutes: 241 }), // 241-60=181 > 180
        repositories: makeRepos(),
      }),
      'AMENDMENT_EXCEEDS_MAX_EXTENSION'
    );
  });

  // T-05 ─────────────────────────────────────────────────────
  await test('T-05 talentConsentAt absent → AMENDMENT_MISSING_TALENT_CONSENT', async () => {
    await expectBlocked(
      () => EngagementAmendmentGuard.validate({
        engagementId: ENG_ID, currentEngagementState: 'performed', actor: ACTOR_ID,
        context: makeContext({ talentConsentAt: null }), repositories: makeRepos(),
      }),
      'AMENDMENT_MISSING_TALENT_CONSENT'
    );
  });

  // T-06 ─────────────────────────────────────────────────────
  await test('T-06 organizerConsentAt absent → AMENDMENT_MISSING_ORGANIZER_CONSENT', async () => {
    await expectBlocked(
      () => EngagementAmendmentGuard.validate({
        engagementId: ENG_ID, currentEngagementState: 'performed', actor: ACTOR_ID,
        context: makeContext({ organizerConsentAt: null }), repositories: makeRepos(),
      }),
      'AMENDMENT_MISSING_ORGANIZER_CONSENT'
    );
  });

  // T-07 ─────────────────────────────────────────────────────
  await test('T-07 reasonCode absent → AMENDMENT_MISSING_REASON_CODE', async () => {
    for (const bad of [null, '', '   ']) {
      await expectBlocked(
        () => EngagementAmendmentGuard.validate({
          engagementId: ENG_ID, currentEngagementState: 'performed', actor: ACTOR_ID,
          context: makeContext({ reasonCode: bad }), repositories: makeRepos(),
        }),
        'AMENDMENT_MISSING_REASON_CODE'
      );
    }
  });

  // T-08 ─────────────────────────────────────────────────────
  await test('T-08 contractSnapshotPhase2 absent → AMENDMENT_MISSING_SNAPSHOT', async () => {
    await expectBlocked(
      () => EngagementAmendmentGuard.validate({
        engagementId: ENG_ID, currentEngagementState: 'performed', actor: ACTOR_ID,
        context: makeContext({ contractSnapshotPhase2: null }), repositories: makeRepos(),
      }),
      'AMENDMENT_MISSING_SNAPSHOT'
    );
  });

  // T-09 ─────────────────────────────────────────────────────
  await test('T-09 amendmentType invalide → AMENDMENT_TYPE_INVALID', async () => {
    for (const bad of ['REDUCTION', 'UNKNOWN', null, '']) {
      await expectBlocked(
        () => EngagementAmendmentGuard.validate({
          engagementId: ENG_ID, currentEngagementState: 'performed', actor: ACTOR_ID,
          context: makeContext({ amendmentType: bad }), repositories: makeRepos(),
        }),
        'AMENDMENT_TYPE_INVALID'
      );
    }
  });

  // T-10 ─────────────────────────────────────────────────────
  await test('T-10 taux WORM W2 immuable — même taux horaire quelle que soit l\'extension', async () => {
    // Extension de 60 min à 120 min
    const r1 = await EngagementAmendmentGuard.validate({
      engagementId: ENG_ID, currentEngagementState: 'performed', actor: ACTOR_ID,
      context: makeContext({ newDurationMinutes: 120 }), repositories: makeRepos(),
    });
    // Extension de 60 min à 180 min
    const r2 = await EngagementAmendmentGuard.validate({
      engagementId: ENG_ID, currentEngagementState: 'performed', actor: ACTOR_ID,
      context: makeContext({ newDurationMinutes: 180 }), repositories: makeRepos(),
    });

    assert(r1.passed && r2.passed, 'Les deux extensions doivent passer');
    assert(
      r1.amendment.tauxHoraireImpliciteCents === r2.amendment.tauxHoraireImpliciteCents,
      `Taux horaire doit être identique: ${r1.amendment.tauxHoraireImpliciteCents} vs ${r2.amendment.tauxHoraireImpliciteCents}`
    );
    // Taux = 30000¢/h dans les deux cas
    assert(r1.amendment.tauxHoraireImpliciteCents === 30_000, 'Taux horaire = 30000¢/h');
    // Mais les deltas diffèrent
    assert(r1.amendment.deltaCachetCents !== r2.amendment.deltaCachetCents, 'Deltas doivent différer');
    assert(r1.amendment.deltaCachetCents === 30_000, `120min: delta=30000, reçu: ${r1.amendment.deltaCachetCents}`);
    assert(r2.amendment.deltaCachetCents === 60_000, `180min: delta=60000, reçu: ${r2.amendment.deltaCachetCents}`);
  });

  // T-11 ─────────────────────────────────────────────────────
  await test('T-11 LOI LEDGER-02 delta — delta_cachet = net + commission + rounding', async () => {
    const result = await EngagementAmendmentGuard.validate({
      engagementId: ENG_ID, currentEngagementState: 'performed', actor: ACTOR_ID,
      context: makeContext(), repositories: makeRepos(),
    });
    assert(result.passed, 'Guard doit passer');
    const a = result.amendment;
    const recomposed = a.deltaTalentNetCents + a.deltaCommissionMrCents + a.roundingDeltaCents;
    assert(
      recomposed === a.deltaCachetCents,
      `LOI LEDGER-02 delta : net(${a.deltaTalentNetCents}) + commission(${a.deltaCommissionMrCents}) + rounding(${a.roundingDeltaCents}) = ${recomposed} ≠ deltaCachet(${a.deltaCachetCents})`
    );

    // Vérification des entrées ledger
    const { ledgerDelta } = result;
    assert(Array.isArray(ledgerDelta.entries) && ledgerDelta.entries.length >= 2, 'Entrées ledger delta présentes');
    const net4310  = ledgerDelta.entries.find(e => e.account === '4310');
    const comm4530 = ledgerDelta.entries.find(e => e.account === '4530');
    assert(net4310,                               'Entrée compte 4310 requise');
    assert(comm4530,                              'Entrée compte 4530 requise');
    assert(net4310.amountCents === a.deltaTalentNetCents,     '4310 = delta net talent');
    assert(comm4530.amountCents === a.deltaCommissionMrCents, '4530 = delta commission MR');
  });

  // T-12 ─────────────────────────────────────────────────────
  await test('T-12 systemId au format AMD-* (IDFactory D-147)', async () => {
    const r1 = await EngagementAmendmentGuard.validate({
      engagementId: ENG_ID, currentEngagementState: 'performed', actor: ACTOR_ID,
      context: makeContext(), repositories: makeRepos(),
    });
    const r2 = await EngagementAmendmentGuard.validate({
      engagementId: ENG_ID, currentEngagementState: 'performed', actor: ACTOR_ID,
      context: makeContext(), repositories: makeRepos(),
    });
    assert(r1.amendment.systemId.startsWith('AMD-'), `systemId 1 doit être AMD-*, reçu: ${r1.amendment.systemId}`);
    assert(r2.amendment.systemId.startsWith('AMD-'), `systemId 2 doit être AMD-*, reçu: ${r2.amendment.systemId}`);
    assert(r1.amendment.systemId !== r2.amendment.systemId, 'Deux invocations donnent des systemId distincts');
  });

  // T-13 ─────────────────────────────────────────────────────
  await test('T-13 configs DB absentes → fail-closed (AMENDMENT_POLICY_CONFIG_MISSING)', async () => {
    const result = await EngagementAmendmentGuard.validate({
      engagementId: ENG_ID, currentEngagementState: 'performed', actor: ACTOR_ID,
      context: makeContext(), repositories: makeRepos({ missingAmendmentConfig: true }),
    });
    assert(result.passed === false, 'Guard doit bloquer si configs absentes');
    assert(result.reason.includes('AMENDMENT_POLICY_CONFIG_MISSING'), `Attendu AMENDMENT_POLICY_CONFIG_MISSING, reçu: ${result.reason}`);
  });

  // T-14 ─────────────────────────────────────────────────────
  await test('T-14 EngagementAmendmentService.createAmendment — orchestration complète', async () => {
    const serviceResult = await EngagementAmendmentService.createAmendment({
      engagementId:           ENG_ID,
      currentEngagementState: 'performed',
      actor:                  ACTOR_ID,
      context:                makeContext(),
      repositories:           makeRepos(),
    });

    assert(serviceResult.created === true,              'created doit être true');
    assert(serviceResult.amendment,                     'amendment doit être présent');
    assert(serviceResult.amendment.systemId.startsWith('AMD-'), 'systemId au format AMD-*');
    assert(serviceResult.ledgerDelta,                   'ledgerDelta doit être présent');
    assert(Array.isArray(serviceResult.ledgerDelta.persistedEntries),
                                                        'persistedEntries doit être un tableau');
    assert(serviceResult.ledgerDelta.persistedEntries.length >= 2,
                                                        'Au moins 2 entrées ledger (4310 + 4530)');
    assert(serviceResult.audit,                         'audit doit être présent');
    assert(serviceResult.audit.deltaCachetCents === 60_000,
      `audit.deltaCachetCents doit être 60000, reçu: ${serviceResult.audit.deltaCachetCents}`);
  });

  // ── Résumé ───────────────────────────────────────────────────
  console.log('═══════════════════════════════════════════════');
  if (failed === 0) {
    console.log(`AMENDMENT-01 : ✓ PASSED (${passed}/${passed + failed})`);
    console.log('');
    console.log('D-147 a maintenant un corps.');
    console.log('Le contrat ne change pas — il s\'étend.');
    console.log('Le taux est le même. La durée est différente. L\'absent reste absent.');
  } else {
    console.log(`AMENDMENT-01 : ✗ FAILED (${passed} ✓ / ${failed} ✗)`);
    process.exit(1);
  }
  console.log('═══════════════════════════════════════════════');
}

run();