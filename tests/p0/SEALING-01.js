/**
 * MICRO RAVE V3 — Test P0 : SEALING-01
 * ============================================================
 * Vérifie SealingGuard — deposit_secured → event_sealed [D-014-A]
 *
 * Sections :
 *   1. Cas nominal — Pierre de Rosette (DJ Alex · Le Trèfle)
 *   2. ContractSnapshot phase 2 construit et retourné
 *   3. LOI LINEUP-01 — coefficient de répartition
 *   4. LOI LINEUP-02 — talents gratuits avec freeWeightCents
 *   5. LOI LEDGER-02 — invariant zéro cent
 *   6. Blocages obligatoires
 *   7. Intégration transitionEngagement()
 *
 * Source : OS V10 sections 2.7, 2.7.1, 3.3, 4.2, section 16
 * Pierre de Rosette : DJ Alex · Le Trèfle · 250$ total
 * ============================================================
 */

'use strict';

const { validate }            = require('../../src/core/guards/SealingGuard');
const { transitionEngagement } = require('../../src/core/transitionEngagement');

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

// ── Pierre de Rosette ─────────────────────────────────────────
// DJ Alex · Le Trèfle · 250$ CAD total payeur
// Dépôt 20% = 50$ · Balance = 200$
// Cachet signé Alex : 200$ · Taux MR : 12%
const CONTEXTE_NOMINAL = {
  contractSnapshotPhase1Id: 'CS1-TEST-ALEX-000001',
  eventId:                  'EVT-TEST-TREFLE-0001',
  depositReceivedCents:     5000,   // 50$ dépôt reçu
  balanceReceivedCents:     20000,  // 200$ balance reçue
  prixVenduClientCents:     25000,  // 250$ total TTC
  freeWeightCents:          100,
  lineupEntries: [
    {
      talentUserId:      'USR-TEST-ALEX-000001',
      cachetSigneCents:  20000,  // 200$ signé
      tauxPpm:           120000, // 12%
      tier:              'Freemium',
    },
  ],
};

console.log('═══════════════════════════════════════════════');
console.log('Test P0 : SEALING-01');
console.log('Pierre de Rosette : DJ Alex · Le Trèfle · 250$ TTC');
console.log('═══════════════════════════════════════════════\n');

async function run() {

  // ════════════════════════════════════════════════════════
  // SECTION 1 — Cas nominal
  // ════════════════════════════════════════════════════════
  console.log('── Cas nominal ───────────────────────────────\n');

  await test('Cas nominal : scellement autorisé avec contexte complet', async () => {
    const result = await validate({
      engagementId: 'ENG-TEST-000001',
      currentState: 'deposit_secured', targetState: 'event_sealed',
      actor: 'USR-TEST-TREFLE-0001',
      context: CONTEXTE_NOMINAL,
    });
    if (!result.passed) throw new Error(`Attendu passed:true — ${result.reason}`);
  });

  // ════════════════════════════════════════════════════════
  // SECTION 2 — ContractSnapshot phase 2
  // ════════════════════════════════════════════════════════
  console.log('\n── ContractSnapshot phase 2 (WORM W2) ───────\n');

  await test('ContractSnapshot phase 2 construit avec systemId CS2-*', async () => {
    const result = await validate({
      engagementId: 'ENG-TEST-000002',
      currentState: 'deposit_secured', targetState: 'event_sealed',
      actor: 'USR-TEST-TREFLE-0001',
      context: CONTEXTE_NOMINAL,
    });
    if (!result.passed) throw new Error(result.reason);
    if (!result.contractSnapshot) throw new Error('contractSnapshot absent');
    if (!result.contractSnapshot.systemId.startsWith('CS2-'))
      throw new Error(`systemId invalide: ${result.contractSnapshot.systemId}`);
    if (result.contractSnapshot.phase !== 2)
      throw new Error('phase attendue: 2');
    if (result.contractSnapshot.wormLevel !== 'W2')
      throw new Error('wormLevel attendu: W2');
  });

  await test('ContractSnapshot phase 2 contient tous les champs obligatoires', async () => {
    const result = await validate({
      engagementId: 'ENG-TEST-000003',
      currentState: 'deposit_secured', targetState: 'event_sealed',
      actor: 'USR-TEST-TREFLE-0001',
      context: CONTEXTE_NOMINAL,
    });
    if (!result.passed) throw new Error(result.reason);
    const cs = result.contractSnapshot;
    const required = [
      'systemId', 'engagementId', 'phase', 'wormLevel',
      'contractSnapshotPhase1Id', 'eventId',
      'depositReceivedCents', 'balanceReceivedCents',
      'totalReceivedCents', 'prixVenduClientCents',
      'waterfall', 'totalNets', 'totalCommissions',
      'roundingCents', 'sealedByActor', 'sealedAt',
    ];
    for (const field of required) {
      if (cs[field] === undefined || cs[field] === null)
        throw new Error(`Champ manquant : ${field}`);
    }
  });

  await test('contractSnapshotPhase1Id référencé dans le phase 2', async () => {
    const result = await validate({
      engagementId: 'ENG-TEST-000004',
      currentState: 'deposit_secured', targetState: 'event_sealed',
      actor: 'USR-TEST-TREFLE-0001',
      context: CONTEXTE_NOMINAL,
    });
    if (!result.passed) throw new Error(result.reason);
    if (result.contractSnapshot.contractSnapshotPhase1Id !== CONTEXTE_NOMINAL.contractSnapshotPhase1Id)
      throw new Error('contractSnapshotPhase1Id non transmis au phase 2');
  });

  // ════════════════════════════════════════════════════════
  // SECTION 3 — LOI LINEUP-01 : coefficient
  // ════════════════════════════════════════════════════════
  console.log('\n── LOI LINEUP-01 — coefficient répartition ──\n');

  await test('Coefficient = max(1, prix_vendu / total_lineup_effectif)', async () => {
    const result = await validate({
      engagementId: 'ENG-TEST-000010',
      currentState: 'deposit_secured', targetState: 'event_sealed',
      actor: 'USR-TEST-TREFLE-0001',
      context: CONTEXTE_NOMINAL,
    });
    if (!result.passed) throw new Error(result.reason);
    // 250$ vendu / 200$ lineup → coefficient = 1.25 = 1_250_000 ppm
    const expectedCoeff = Math.max(1_000_000, Math.floor(25000 * 1_000_000 / 20000));
    if (result.contractSnapshot.coefficientPpm !== expectedCoeff)
      throw new Error(`Coefficient attendu: ${expectedCoeff}, reçu: ${result.contractSnapshot.coefficientPpm}`);
  });

  // ════════════════════════════════════════════════════════
  // SECTION 4 — LOI LINEUP-02 : talents gratuits
  // ════════════════════════════════════════════════════════
  console.log('\n── LOI LINEUP-02 — talents gratuits ─────────\n');

  await test('Talent gratuit reçoit freeWeightCents comme poids (100 cents)', async () => {
    const result = await validate({
      engagementId: 'ENG-TEST-000020',
      currentState: 'deposit_secured', targetState: 'event_sealed',
      actor: 'USR-TEST-TREFLE-0001',
      context: {
        ...CONTEXTE_NOMINAL,
        lineupEntries: [
          { talentUserId: 'USR-A', cachetSigneCents: 0, tauxPpm: 120000, tier: 'Freemium' },
          { talentUserId: 'USR-B', cachetSigneCents: 0, tauxPpm: 120000, tier: 'Freemium' },
        ],
      },
    });
    if (!result.passed) throw new Error(result.reason);
    // Deux talents gratuits → surplus = 25000$, poids égaux → 50/50
    const talentA = result.contractSnapshot.waterfall.find(w => w.talentUserId === 'USR-A');
    const talentB = result.contractSnapshot.waterfall.find(w => w.talentUserId === 'USR-B');
    if (!talentA || !talentB) throw new Error('Waterfall incomplet');
    // Chaque talent doit recevoir ~12500 cents (50%)
    if (Math.abs(talentA.cachetBrutFinalCents - 12500) > 1)
      throw new Error(`Talent A brut attendu ~12500, reçu: ${talentA.cachetBrutFinalCents}`);
  });

  await test('Plancher contractuel : talent ne peut pas recevoir moins que son cachet signé', async () => {
    // Ce test vérifie la règle — en pratique le calcul ne devrait jamais violer le plancher
    // car le surplus est positif si prix_vendu >= total_lineup_signé
    const result = await validate({
      engagementId: 'ENG-TEST-000021',
      currentState: 'deposit_secured', targetState: 'event_sealed',
      actor: 'USR-TEST-TREFLE-0001',
      context: {
        ...CONTEXTE_NOMINAL,
        lineupEntries: [
          { talentUserId: 'USR-TEST-ALEX-000001', cachetSigneCents: 20000, tauxPpm: 120000, tier: 'Freemium' },
        ],
      },
    });
    if (!result.passed) throw new Error(result.reason);
    const talent = result.contractSnapshot.waterfall[0];
    if (talent.cachetBrutFinalCents < talent.cachetSigneCents)
      throw new Error(`Plancher violé: brut(${talent.cachetBrutFinalCents}) < signé(${talent.cachetSigneCents})`);
  });

  await test('Standard numérique : tous les montants waterfall sont des entiers', async () => {
    const result = await validate({
      engagementId: 'ENG-TEST-000022',
      currentState: 'deposit_secured', targetState: 'event_sealed',
      actor: 'USR-TEST-TREFLE-0001',
      context: CONTEXTE_NOMINAL,
    });
    if (!result.passed) throw new Error(result.reason);
    for (const entry of result.contractSnapshot.waterfall) {
      if (!Number.isInteger(entry.cachetBrutFinalCents))
        throw new Error(`cachetBrutFinalCents non entier pour ${entry.talentUserId}`);
      if (!Number.isInteger(entry.commissionMrCents))
        throw new Error(`commissionMrCents non entier pour ${entry.talentUserId}`);
      if (!Number.isInteger(entry.talentNetCents))
        throw new Error(`talentNetCents non entier pour ${entry.talentUserId}`);
    }
  });

  // ════════════════════════════════════════════════════════
  // SECTION 5 — LOI LEDGER-02 : invariant zéro cent
  // ════════════════════════════════════════════════════════
  console.log('\n── LOI LEDGER-02 — invariant zéro cent ──────\n');

  await test('sum(nets) + sum(commissions) + rounding = prix_vendu_client', async () => {
    const result = await validate({
      engagementId: 'ENG-TEST-000030',
      currentState: 'deposit_secured', targetState: 'event_sealed',
      actor: 'USR-TEST-TREFLE-0001',
      context: CONTEXTE_NOMINAL,
    });
    if (!result.passed) throw new Error(result.reason);
    const cs = result.contractSnapshot;
    const checksum = cs.totalNets + cs.totalCommissions + cs.roundingCents;
    if (checksum !== cs.prixVenduClientCents)
      throw new Error(
        `LOI LEDGER-02 violée : nets(${cs.totalNets}) + ` +
        `commissions(${cs.totalCommissions}) + rounding(${cs.roundingCents}) = ` +
        `${checksum} ≠ prix_vendu(${cs.prixVenduClientCents})`
      );
  });

  await test('floor() sur commission : MR ne sur-prélève jamais', async () => {
    const result = await validate({
      engagementId: 'ENG-TEST-000031',
      currentState: 'deposit_secured', targetState: 'event_sealed',
      actor: 'USR-TEST-TREFLE-0001',
      context: CONTEXTE_NOMINAL,
    });
    if (!result.passed) throw new Error(result.reason);
    for (const entry of result.contractSnapshot.waterfall) {
      const expectedCommission = Math.floor(entry.cachetBrutFinalCents * entry.tauxPpm / 1_000_000);
      if (entry.commissionMrCents !== expectedCommission)
        throw new Error(
          `Commission non-floor pour ${entry.talentUserId}: ` +
          `attendu ${expectedCommission}, reçu ${entry.commissionMrCents}`
        );
    }
  });

  await test('LOI LEDGER-02 vérifiée sur lineup à deux talents', async () => {
    const result = await validate({
      engagementId: 'ENG-TEST-000032',
      currentState: 'deposit_secured', targetState: 'event_sealed',
      actor: 'USR-TEST-TREFLE-0001',
      context: {
        ...CONTEXTE_NOMINAL,
        prixVenduClientCents: 50000,  // 500$
        depositReceivedCents: 10000,  // 100$ dépôt
        balanceReceivedCents: 40000,  // 400$ balance
        lineupEntries: [
          { talentUserId: 'USR-A', cachetSigneCents: 20000, tauxPpm: 120000, tier: 'Freemium' },
          { talentUserId: 'USR-B', cachetSigneCents: 15000, tauxPpm:  80000, tier: 'Freemium' },
        ],
      },
    });
    if (!result.passed) throw new Error(result.reason);
    const cs = result.contractSnapshot;
    const checksum = cs.totalNets + cs.totalCommissions + cs.roundingCents;
    if (checksum !== cs.prixVenduClientCents)
      throw new Error(`LOI LEDGER-02 violée sur lineup 2 talents : ${checksum} ≠ ${cs.prixVenduClientCents}`);
  });

  // ════════════════════════════════════════════════════════
  // SECTION 6 — Blocages obligatoires
  // ════════════════════════════════════════════════════════
  console.log('\n── Blocages obligatoires ─────────────────────\n');

  await test('CS1 manquant → bloqué (MISSING_CONTRACT_SNAPSHOT_PHASE1)', async () => {
    const result = await validate({
      engagementId: 'ENG-TEST-000040',
      currentState: 'deposit_secured', targetState: 'event_sealed',
      actor: 'USR-TEST-TREFLE-0001',
      context: { ...CONTEXTE_NOMINAL, contractSnapshotPhase1Id: undefined },
    });
    if (result.passed) throw new Error('Aurait dû être bloqué');
    if (!result.reason.includes('MISSING_CONTRACT_SNAPSHOT_PHASE1'))
      throw new Error(`Mauvaise raison: ${result.reason}`);
  });

  await test('dépôt non reçu → bloqué (DEPOSIT_NOT_RECEIVED)', async () => {
    const result = await validate({
      engagementId: 'ENG-TEST-000041',
      currentState: 'deposit_secured', targetState: 'event_sealed',
      actor: 'USR-TEST-TREFLE-0001',
      context: { ...CONTEXTE_NOMINAL, depositReceivedCents: 0 },
    });
    if (result.passed) throw new Error('Aurait dû être bloqué');
    if (!result.reason.includes('DEPOSIT_NOT_RECEIVED'))
      throw new Error(`Mauvaise raison: ${result.reason}`);
  });

  await test('total reçu ≠ prix vendu (+10 centimes) → bloqué (PAYMENT_TOTAL_MISMATCH)', async () => {
    const result = await validate({
      engagementId: 'ENG-TEST-000042',
      currentState: 'deposit_secured', targetState: 'event_sealed',
      actor: 'USR-TEST-TREFLE-0001',
      context: {
        ...CONTEXTE_NOMINAL,
        depositReceivedCents: 5000,
        balanceReceivedCents: 20010,  // 10 centimes de trop
      },
    });
    if (result.passed) throw new Error('Aurait dû être bloqué');
    if (!result.reason.includes('PAYMENT_TOTAL_MISMATCH'))
      throw new Error(`Mauvaise raison: ${result.reason}`);
  });

  await test('lineup vide → bloqué (EMPTY_LINEUP)', async () => {
    const result = await validate({
      engagementId: 'ENG-TEST-000043',
      currentState: 'deposit_secured', targetState: 'event_sealed',
      actor: 'USR-TEST-TREFLE-0001',
      context: { ...CONTEXTE_NOMINAL, lineupEntries: [] },
    });
    if (result.passed) throw new Error('Aurait dû être bloqué');
    if (!result.reason.includes('EMPTY_LINEUP'))
      throw new Error(`Mauvaise raison: ${result.reason}`);
  });

  await test('cachetSigneCents en float → bloqué (LINEUP_ENTRY_INVALID)', async () => {
    const result = await validate({
      engagementId: 'ENG-TEST-000044',
      currentState: 'deposit_secured', targetState: 'event_sealed',
      actor: 'USR-TEST-TREFLE-0001',
      context: {
        ...CONTEXTE_NOMINAL,
        lineupEntries: [
          { talentUserId: 'USR-TEST-ALEX-000001', cachetSigneCents: 200.50, tauxPpm: 120000 },
        ],
      },
    });
    if (result.passed) throw new Error('Float accepté — interdit absolu');
    if (!result.reason.includes('LINEUP_ENTRY_INVALID'))
      throw new Error(`Mauvaise raison: ${result.reason}`);
  });

  await test('Tolérance ±2 centimes sur total reçu (arrondi Stripe)', async () => {
    const result = await validate({
      engagementId: 'ENG-TEST-000045',
      currentState: 'deposit_secured', targetState: 'event_sealed',
      actor: 'USR-TEST-TREFLE-0001',
      context: {
        ...CONTEXTE_NOMINAL,
        depositReceivedCents: 5000,
        balanceReceivedCents: 20001,  // 1 centime d'écart — toléré
      },
    });
    if (!result.passed)
      throw new Error(`1 centime d'écart doit être toléré — ${result.reason}`);
  });

  // ════════════════════════════════════════════════════════
  // SECTION 7 — Intégration transitionEngagement()
  // ════════════════════════════════════════════════════════
  console.log('\n── Intégration transitionEngagement() ───────\n');

  await test('[D-014-A] deposit_secured→event_sealed passe par transitionEngagement()', async () => {
    const result = await transitionEngagement({
      engagementId: 'ENG-SEAL-TEST-0001',
      currentState: 'deposit_secured',
      targetState:  'event_sealed',
      actor:        'USR-SEAL-TEST-0001',
      context:      CONTEXTE_NOMINAL,
    });
    if (!result.success) throw new Error('Attendu success:true');
    if (result.newState !== 'event_sealed') throw new Error('newState attendu: event_sealed');
  });

  await test('[D-014-A] ContractSnapshot phase 2 retourné via deposit_secured→event_sealed', async () => {
    const result = await transitionEngagement({
      engagementId: 'ENG-SEAL-TEST-0001',
      currentState: 'deposit_secured',
      targetState:  'event_sealed',
      actor:        'USR-SEAL-TEST-0001',
      context:      CONTEXTE_NOMINAL,
    });
    if (!result.contractSnapshot)
      throw new Error('contractSnapshot absent du résultat — Moment WORM 3 perdu');
    if (!result.contractSnapshot.systemId.startsWith('CS2-'))
      throw new Error('ContractSnapshot phase 2 doit avoir un systemId CS2-*');
    if (result.contractSnapshot.wormLevel !== 'W2')
      throw new Error('wormLevel attendu: W2');
  });

  // ── Résultat ──────────────────────────────────────────────
  console.log(`\n═══════════════════════════════════════════════`);
  console.log(`Résultat : ${passed} PASSED / ${failed} FAILED`);

  if (failed === 0) {
    console.log('SEALING-01 : ✓ PASSED');
  } else {
    console.log('SEALING-01 : ✗ FAILED — corriger avant de continuer');
    process.exit(1);
  }
  console.log('═══════════════════════════════════════════════');
}

run();