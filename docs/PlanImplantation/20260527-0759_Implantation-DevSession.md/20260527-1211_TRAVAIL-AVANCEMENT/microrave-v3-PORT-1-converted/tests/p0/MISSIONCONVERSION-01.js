/**
 * MICRO RAVE V3 — Test P0 : MISSIONCONVERSION-01
 * ============================================================
 * Vérifie que MissionConversionGuard dispatche correctement
 * selon targetState :
 *   - proposed→negotiating : acteurs + roleMetier seulement
 *     (pas de cachet, pas de snapshot)
 *   - proposed→accepted / negotiating→accepted : logique complète
 *     (cachet, taux, tier, idempotency, snapshot)
 *
 * Source : OS V10 section 2.7.1 + section 3.2 + section 2.6
 * Pierre de Rosette : DJ Alex Dubois · Le Trèfle · 200$ CAD net
 * ============================================================
 */

'use strict';

import { validate } from '../../src/core/guards/MissionConversionGuard.js';
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

// ── Contextes de référence ─────────────────────────────────────
const ACTEURS = {
  talentUserId:    'USR-TEST-ALEX-000001',
  organizerUserId: 'USR-TEST-TREFLE-0001',
  roleMetier:      'DJ',
};

const CONTRAT_COMPLET = {
  ...ACTEURS,
  cachetBrutCents: 22_222,
  tier:            'Freemium',
  tauxPpm:         120_000,
};

console.log('═══════════════════════════════════════════════');
console.log('Test P0 : MISSIONCONVERSION-01');
console.log('Pierre de Rosette : DJ Alex · Le Trèfle · 200$ CAD net');
console.log('═══════════════════════════════════════════════\n');

async function run() {

  // ════════════════════════════════════════════════════════
  // SECTION 1 — proposed → negotiating
  // Logique légère : acteurs seulement, pas de cachet
  // ════════════════════════════════════════════════════════
  console.log('── proposed→negotiating (acteurs seulement) ─\n');

  await test('Ouverture négociation : passe avec acteurs + role seulement', async () => {
    const result = await validate({
      engagementId: 'ENG-TEST-000001',
      currentState: 'proposed',
      targetState:  'negotiating',
      actor:        'USR-TEST-TREFLE-0001',
      context:      ACTEURS, // PAS de cachetBrutCents ni tauxPpm
    });
    if (!result.passed) throw new Error(`Attendu passed:true — raison: ${result.reason}`);
    if (result.contractSnapshot) throw new Error('Aucun ContractSnapshot ne doit être créé à negotiating');
  });

  await test('Ouverture négociation : passe même sans cachetBrutCents', async () => {
    const result = await validate({
      engagementId: 'ENG-TEST-000002',
      currentState: 'proposed',
      targetState:  'negotiating',
      actor:        'USR-TEST-000001',
      context: { talentUserId: 'USR-A', organizerUserId: 'USR-B', roleMetier: 'DJ' },
    });
    if (!result.passed) throw new Error(`Le cachet ne doit pas être requis à negotiating`);
  });

  await test('Ouverture négociation : talentUserId manquant → bloqué', async () => {
    const result = await validate({
      engagementId: 'ENG-TEST-000003',
      currentState: 'proposed',
      targetState:  'negotiating',
      actor:        'USR-TEST-000001',
      context: { organizerUserId: 'USR-B', roleMetier: 'DJ' },
    });
    if (result.passed) throw new Error('Aurait dû être bloqué');
    if (!result.reason.includes('MISSING_TALENT'))
      throw new Error(`Mauvaise raison: ${result.reason}`);
  });

  await test('Ouverture négociation : roleMetier manquant → bloqué', async () => {
    const result = await validate({
      engagementId: 'ENG-TEST-000004',
      currentState: 'proposed',
      targetState:  'negotiating',
      actor:        'USR-TEST-000001',
      context: { talentUserId: 'USR-A', organizerUserId: 'USR-B' },
    });
    if (result.passed) throw new Error('Aurait dû être bloqué');
    if (!result.reason.includes('MISSING_ROLE'))
      throw new Error(`Mauvaise raison: ${result.reason}`);
  });

  // ════════════════════════════════════════════════════════
  // SECTION 2 — proposed → accepted (voie directe)
  // Logique complète : cachet + taux + tier + snapshot
  // ════════════════════════════════════════════════════════
  console.log('\n── proposed→accepted (voie directe) ────────\n');

  await test('Cas nominal : guard passe avec contexte complet', async () => {
    const result = await validate({
      engagementId: 'ENG-TEST-000010',
      currentState: 'proposed',
      targetState:  'accepted',
      actor:        'USR-TEST-TREFLE-0001',
      context:      CONTRAT_COMPLET,
    });
    if (!result.passed) throw new Error(`Attendu passed:true — raison: ${result.reason}`);
    if (!result.contractSnapshot) throw new Error('ContractSnapshot manquant');
    if (!result.contractSnapshot.systemId.startsWith('CS1-'))
      throw new Error(`systemId invalide: ${result.contractSnapshot.systemId}`);
    if (result.contractSnapshot.phase !== 1)
      throw new Error(`phase attendue: 1, reçue: ${result.contractSnapshot.phase}`);
    if (result.contractSnapshot.wormLevel !== 'W1')
      throw new Error(`wormLevel attendu: W1`);
  });

  await test('floor() sur commission : MR ne sur-prélève jamais', async () => {
    const result = await validate({
      engagementId: 'ENG-TEST-000011',
      currentState: 'proposed',
      targetState:  'accepted',
      actor:        'USR-TEST-000001',
      context:      CONTRAT_COMPLET,
    });
    if (!result.passed) throw new Error(result.reason);
    const expected = Math.floor(22_222 * 120_000 / 1_000_000);
    if (result.contractSnapshot.commissionMrCents !== expected)
      throw new Error(`Commission attendue: ${expected}`);
  });

  await test('Standard numérique : talentNetCents est un entier', async () => {
    const result = await validate({
      engagementId: 'ENG-TEST-000012',
      currentState: 'proposed',
      targetState:  'accepted',
      actor:        'USR-TEST-000001',
      context:      CONTRAT_COMPLET,
    });
    if (!result.passed) throw new Error(result.reason);
    if (!Number.isInteger(result.contractSnapshot.talentNetCents))
      throw new Error('talentNetCents doit être un entier');
    if (!Number.isInteger(result.contractSnapshot.commissionMrCents))
      throw new Error('commissionMrCents doit être un entier');
  });

  await test('cachetBrutCents en float → bloqué (INVALID_CACHET)', async () => {
    const result = await validate({
      engagementId: 'ENG-TEST-000013',
      currentState: 'proposed',
      targetState:  'accepted',
      actor:        'USR-TEST-000001',
      context: { ...CONTRAT_COMPLET, cachetBrutCents: 222.22 },
    });
    if (result.passed) throw new Error('Float accepté — interdit absolu');
    if (!result.reason.includes('INVALID_CACHET'))
      throw new Error(`Mauvaise raison: ${result.reason}`);
  });

  await test('tauxPpm en float → bloqué (INVALID_TAUX)', async () => {
    const result = await validate({
      engagementId: 'ENG-TEST-000014',
      currentState: 'proposed',
      targetState:  'accepted',
      actor:        'USR-TEST-000001',
      context: { ...CONTRAT_COMPLET, tauxPpm: 0.12 },
    });
    if (result.passed) throw new Error('Float taux accepté — interdit absolu');
    if (!result.reason.includes('INVALID_TAUX'))
      throw new Error(`Mauvaise raison: ${result.reason}`);
  });

  await test('ContractSnapshot déjà existant → bloqué (IDEMPOTENCY_VIOLATION)', async () => {
    const result = await validate({
      engagementId: 'ENG-TEST-000015',
      currentState: 'proposed',
      targetState:  'accepted',
      actor:        'USR-TEST-000001',
      context: { ...CONTRAT_COMPLET, existingContractSnapshotId: 'CS1-EXISTANT-0001' },
    });
    if (result.passed) throw new Error('Aurait dû être bloqué pour idempotency');
    if (!result.reason.includes('IDEMPOTENCY_VIOLATION'))
      throw new Error(`Mauvaise raison: ${result.reason}`);
  });

  // ════════════════════════════════════════════════════════
  // SECTION 3 — negotiating → accepted (après négociation)
  // Même logique complète que proposed→accepted
  // ════════════════════════════════════════════════════════
  console.log('\n── negotiating→accepted (après négociation) ─\n');

  await test('Accord après négociation : snapshot créé avec le cachet final', async () => {
    const cachetNegocié = 18_000; // cachet arrêté pendant la négociation
    const result = await validate({
      engagementId: 'ENG-TEST-000020',
      currentState: 'negotiating',
      targetState:  'accepted',
      actor:        'USR-TEST-TREFLE-0001',
      context: {
        ...ACTEURS,
        cachetBrutCents: cachetNegocié,
        tier:            'Freemium',
        tauxPpm:         120_000,
        negotiationHistory: [
          { offeredBy: 'talent', cachetBrutCents: 20_000, timestamp: '2026-05-16T10:00:00Z' },
          { offeredBy: 'organizer', cachetBrutCents: 18_000, timestamp: '2026-05-16T10:05:00Z' },
        ],
      },
    });
    if (!result.passed) throw new Error(`Attendu passed:true — raison: ${result.reason}`);
    if (!result.contractSnapshot) throw new Error('ContractSnapshot manquant');
    if (result.contractSnapshot.cachetBrutCents !== cachetNegocié)
      throw new Error(`cachet attendu: ${cachetNegocié}`);
    if (result.contractSnapshot.negotiationHistory.length !== 2)
      throw new Error('negotiationHistory doit être préservée dans le snapshot');
  });

  await test('negotiating→accepted : cachet manquant → bloqué (INVALID_CACHET)', async () => {
    const result = await validate({
      engagementId: 'ENG-TEST-000021',
      currentState: 'negotiating',
      targetState:  'accepted',
      actor:        'USR-TEST-000001',
      context: { ...ACTEURS, tier: 'Freemium', tauxPpm: 120_000 }, // pas de cachet
    });
    if (result.passed) throw new Error('Aurait dû être bloqué — cachet requis à accepted');
    if (!result.reason.includes('INVALID_CACHET'))
      throw new Error(`Mauvaise raison: ${result.reason}`);
  });

  // ════════════════════════════════════════════════════════
  // SECTION 4 — ContractSnapshot complet
  // ════════════════════════════════════════════════════════
  console.log('\n── ContractSnapshot — structure complète ────\n');

  await test('ContractSnapshot contient tous les champs obligatoires', async () => {
    const result = await validate({
      engagementId: 'ENG-TEST-000030',
      currentState: 'proposed',
      targetState:  'accepted',
      actor:        'USR-TEST-TREFLE-0001',
      context:      CONTRAT_COMPLET,
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
    if (cs.sotsSnapshotPpm !== 1_000_000)
      throw new Error(`sotsSnapshotPpm attendu: 1 000 000 (neutre), reçu: ${cs.sotsSnapshotPpm}`);
  });

  await test('targetState inconnu → bloqué (GUARD_MISMATCH)', async () => {
    const result = await validate({
      engagementId: 'ENG-TEST-000031',
      currentState: 'proposed',
      targetState:  'placed', // MissionConversionGuard ne couvre pas ça
      actor:        'USR-TEST-000001',
      context:      CONTRAT_COMPLET,
    });
    if (result.passed) throw new Error('Aurait dû être bloqué');
    if (!result.reason.includes('GUARD_MISMATCH'))
      throw new Error(`Mauvaise raison: ${result.reason}`);
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