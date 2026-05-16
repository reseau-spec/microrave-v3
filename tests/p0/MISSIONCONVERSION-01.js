/**
 * MICRO RAVE V3 — Test P0 : MISSIONCONVERSION-01
 * ============================================================
 * Vérifie que MissionConversionGuard applique correctement
 * les règles de la transition proposed → accepted.
 *
 * Source : OS V10 section 2.7.1 + section 3.2 (standard numérique)
 * + LOI WATERFALL-01 section 3.3 (floor sur commission)
 * ============================================================
 */

'use strict';

const { validate } = require('../../src/core/guards/MissionConversionGuard');

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (err) {
    console.log(`✗ ${name}`);
    console.log(`  → ${err.message}`);
    failed++;
  }
}

// ── Contexte nominal de référence ─────────────────────────────
// Pierre de Rosette : DJ Alex Dubois · 200$ CAD net · Le Trèfle
// Source : OS V10 section 14.9
const CONTEXTE_NOMINAL = {
  talentUserId:    'USR-TEST-ALEX-000001',
  organizerUserId: 'USR-TEST-TREFLE-0001',
  roleMetier:      'DJ',
  cachetBrutCents: 22_222,  // ~222.22$ — net 200$ après 10% arrondi
  tier:            'Freemium',
  tauxPpm:         120_000, // 12% = 120 000 ppm
};

console.log('═══════════════════════════════════════════════');
console.log('Test P0 : MISSIONCONVERSION-01');
console.log('Pierre de Rosette : DJ Alex · Le Trèfle · 200$ CAD net');
console.log('═══════════════════════════════════════════════\n');

async function run() {

  // ── Cas nominal ───────────────────────────────────────────

  await test('Cas nominal : guard passe avec contexte complet', async () => {
    const result = await validate({
      engagementId: 'ENG-TEST-000001',
      actor:        'USR-TEST-TREFLE-0001',
      context:      CONTEXTE_NOMINAL,
    });
    if (!result.passed) throw new Error(`Attendu passed:true — raison: ${result.reason}`);
    if (!result.contractSnapshot) throw new Error('ContractSnapshot manquant dans le résultat');
    if (!result.contractSnapshot.systemId.startsWith('CS1-'))
      throw new Error(`systemId invalide: ${result.contractSnapshot.systemId}`);
    if (result.contractSnapshot.phase !== 1)
      throw new Error(`phase attendue: 1, reçue: ${result.contractSnapshot.phase}`);
    if (result.contractSnapshot.wormLevel !== 'W1')
      throw new Error(`wormLevel attendu: W1, reçu: ${result.contractSnapshot.wormLevel}`);
  });

  // ── Vérification du calcul financier ──────────────────────

  await test('floor() sur commission : MR ne sur-prélève jamais', async () => {
    // 222.22$ × 12% = 26.6664$ → floor = 2666 centimes
    const result = await validate({
      engagementId: 'ENG-TEST-000002',
      actor:        'USR-TEST-000001',
      context: { ...CONTEXTE_NOMINAL, cachetBrutCents: 22_222 },
    });
    if (!result.passed) throw new Error(result.reason);
    const { commissionMrCents, talentNetCents } = result.contractSnapshot;
    const expected = Math.floor(22_222 * 120_000 / 1_000_000); // = 2666
    if (commissionMrCents !== expected)
      throw new Error(`Commission attendue: ${expected}, reçue: ${commissionMrCents}`);
    if (talentNetCents !== 22_222 - expected)
      throw new Error(`Net attendu: ${22_222 - expected}, reçu: ${talentNetCents}`);
  });

  await test('Standard numérique : talentNetCents est un entier', async () => {
    const result = await validate({
      engagementId: 'ENG-TEST-000003',
      actor:        'USR-TEST-000001',
      context:      CONTEXTE_NOMINAL,
    });
    if (!result.passed) throw new Error(result.reason);
    if (!Number.isInteger(result.contractSnapshot.talentNetCents))
      throw new Error('talentNetCents doit être un entier — interdit absolu float');
    if (!Number.isInteger(result.contractSnapshot.commissionMrCents))
      throw new Error('commissionMrCents doit être un entier — interdit absolu float');
  });

  // ── Blocages obligatoires ──────────────────────────────────

  await test('talentUserId manquant → bloqué (MISSING_TALENT)', async () => {
    const result = await validate({
      engagementId: 'ENG-TEST-000004',
      actor:        'USR-TEST-000001',
      context: { ...CONTEXTE_NOMINAL, talentUserId: undefined },
    });
    if (result.passed) throw new Error('Aurait dû être bloqué');
    if (!result.reason.includes('MISSING_TALENT'))
      throw new Error(`Mauvaise raison: ${result.reason}`);
  });

  await test('organizerUserId manquant → bloqué (MISSING_ORGANIZER)', async () => {
    const result = await validate({
      engagementId: 'ENG-TEST-000005',
      actor:        'USR-TEST-000001',
      context: { ...CONTEXTE_NOMINAL, organizerUserId: undefined },
    });
    if (result.passed) throw new Error('Aurait dû être bloqué');
    if (!result.reason.includes('MISSING_ORGANIZER'))
      throw new Error(`Mauvaise raison: ${result.reason}`);
  });

  await test('roleMetier manquant → bloqué (MISSING_ROLE)', async () => {
    const result = await validate({
      engagementId: 'ENG-TEST-000006',
      actor:        'USR-TEST-000001',
      context: { ...CONTEXTE_NOMINAL, roleMetier: undefined },
    });
    if (result.passed) throw new Error('Aurait dû être bloqué');
    if (!result.reason.includes('MISSING_ROLE'))
      throw new Error(`Mauvaise raison: ${result.reason}`);
  });

  await test('cachetBrutCents en float → bloqué (INVALID_CACHET)', async () => {
    // Interdit absolu — section 3.2 : MONEY = integer cents, jamais float
    const result = await validate({
      engagementId: 'ENG-TEST-000007',
      actor:        'USR-TEST-000001',
      context: { ...CONTEXTE_NOMINAL, cachetBrutCents: 222.22 }, // ← float interdit
    });
    if (result.passed) throw new Error('Float accepté — interdit absolu violé');
    if (!result.reason.includes('INVALID_CACHET'))
      throw new Error(`Mauvaise raison: ${result.reason}`);
  });

  await test('tauxPpm en float → bloqué (INVALID_TAUX)', async () => {
    // Interdit absolu — section 3.2 : RATE = integer ppm, jamais float
    const result = await validate({
      engagementId: 'ENG-TEST-000008',
      actor:        'USR-TEST-000001',
      context: { ...CONTEXTE_NOMINAL, tauxPpm: 0.12 }, // ← float interdit, doit être 120 000
    });
    if (result.passed) throw new Error('Float taux accepté — interdit absolu violé');
    if (!result.reason.includes('INVALID_TAUX'))
      throw new Error(`Mauvaise raison: ${result.reason}`);
  });

  await test('ContractSnapshot déjà existant → bloqué (IDEMPOTENCY_VIOLATION)', async () => {
    const result = await validate({
      engagementId: 'ENG-TEST-000009',
      actor:        'USR-TEST-000001',
      context: {
        ...CONTEXTE_NOMINAL,
        existingContractSnapshotId: 'CS1-EXISTANT-AABBCC',
      },
    });
    if (result.passed) throw new Error('Aurait dû être bloqué pour idempotency');
    if (!result.reason.includes('IDEMPOTENCY_VIOLATION'))
      throw new Error(`Mauvaise raison: ${result.reason}`);
  });

  // ── Vérification structurelle du ContractSnapshot ─────────

  await test('ContractSnapshot contient tous les champs obligatoires', async () => {
    const result = await validate({
      engagementId: 'ENG-TEST-000010',
      actor:        'USR-TEST-TREFLE-0001',
      context:      CONTEXTE_NOMINAL,
    });
    if (!result.passed) throw new Error(result.reason);
    const cs = result.contractSnapshot;
    const required = [
      'systemId', 'engagementId', 'phase', 'wormLevel',
      'talentUserId', 'organizerUserId', 'roleMetier',
      'cachetBrutCents', 'tier', 'tauxPpm',
      'commissionMrCents', 'talentNetCents',
      'createdByActor', 'createdAt', 'sotsSnapshotPpm',
    ];
    for (const field of required) {
      if (cs[field] === undefined || cs[field] === null)
        throw new Error(`Champ manquant dans ContractSnapshot : ${field}`);
    }
    // sotsSnapshotPpm doit être 1 000 000 (neutre sous seuil 10)
    // Source : OS V10 section 5.4
    if (cs.sotsSnapshotPpm !== 1_000_000)
      throw new Error(`sotsSnapshotPpm attendu: 1 000 000 (neutre), reçu: ${cs.sotsSnapshotPpm}`);
  });

  // ── Résultat ──────────────────────────────────────────────
  console.log(`\n═══════════════════════════════════════════════`);
  console.log(`Résultat : ${passed} PASSED / ${failed} FAILED`);

  if (failed === 0) {
    console.log('MISSIONCONVERSION-01 : ✓ PASSED');
  } else {
    console.log('MISSIONCONVERSION-01 : ✗ FAILED — corriger avant de continuer');
    process.exit(1);
  }
  console.log('═══════════════════════════════════════════════');
}

run();
