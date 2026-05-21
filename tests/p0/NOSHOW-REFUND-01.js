/**
 * MICRO RAVE V3 — Test P0 : NOSHOW-REFUND-01
 * ============================================================
 * Prouve que la transition no_show→refunded via transitionEngagement()
 * exécute NoShowGuard.validateRefundTrigger() et non le placeholder.
 *
 * PROBLÈME RÉSOLU (Phase 0.2) :
 *   Avant correction, TRANSITION_TABLE routait no_show→refunded vers
 *   RefundGuard (case 'RefundGuard') qui retournait { passed: true, reason: 'placeholder' }.
 *   La logique LOI NO-SHOW-01 + CT-014 existait dans NoShowGuard mais
 *   n'était jamais appelée pour cette transition.
 *   Source : NoShowGuard.js L.41 · transitionEngagement.js L.432 ancienne version.
 *
 * CE QUE CE TEST PROUVE :
 *   T-01 : no_show→refunded sans DecisionRecord → GUARD_FAILED (plus un pass-through)
 *   T-02 : no_show→refunded sans contractSnapshotPhase2 → GUARD_FAILED
 *   T-03 : no_show→refunded sans payerUserId → GUARD_FAILED
 *   T-04 : no_show→refunded — DecisionRecord mauvais type → GUARD_FAILED
 *   T-05 : no_show→refunded — DecisionRecord engagementId mismatch → GUARD_FAILED
 *   T-06 : no_show→refunded — montant incohérent DecisionRecord vs Snapshot → GUARD_FAILED
 *   T-07 : no_show→refunded — chemin nominal → success:true + refundInstruction
 *   T-08 : refundInstruction.refundAmountCents = cachetNetFinalCents (LOI NO-SHOW-01)
 *   T-09 : refundInstruction.talentPaymentCents = 0 (talent = 0$)
 *   T-10 : refundInstruction.mrCommissionCents = commissionMrCents (MR conserve)
 *   T-11 : refundInstruction.ledgerEntries non vide (écritures comptables)
 *   T-12 : refundInstruction.type = 'NO_SHOW_REFUND'
 *   T-13 : cachet_net_final = brut − commission (CT-014 arithmétique)
 *   T-14 : cachet_net_final = 0 si talent gratuit → edge case
 *   T-15 : RefundGuard fail-closed pour transition non couverte
 *   T-16 : sots_window_closed→no_show non affecté (contrôle de régression)
 *
 * SCÉNARIO DJ Alex (chiffres SC-01 / chemin nominal) :
 *   cachetBrutFinalCents = 30_000 (300$ CAD)
 *   commissionMrCents    = 2_700  (9% = Freemium)
 *   cachetNetFinalCents  = 27_300 (273$)
 *   organizerRefundCents = 27_300 (organisateur récupère le net talent)
 *   mrRetains            = 2_700  (MR conserve sa commission)
 *   talentPayment        = 0      (talent = 0$)
 *
 * Source : LOI NO-SHOW-01 · CT-014 · D-041 · D-044 · GREFFIER-01
 *          Plan d'implantation Phase 0.2 · 2026-05-21
 * ============================================================
 */

'use strict';

// ── Mock Stripe (GUARD 4.5 de transitionEngagement require stripe) ──
process.env.STRIPE_SECRET_KEY     = 'sk_test_MOCK_NOSHOW_REFUND';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_MOCK_NOSHOW_REFUND';
require.cache[require.resolve('stripe')] = {
  id: require.resolve('stripe'), filename: require.resolve('stripe'), loaded: true,
  exports: () => ({ transfers: { create: async () => ({ id: 'tr_MOCK_NOSHOW' }) } }),
};

const { transitionEngagement } = require('../../src/core/transitionEngagement');

let passed = 0;
let failed = 0;

// ── IDs souverains ────────────────────────────────────────────
const ENG_ID    = 'ENG-NOSHOW-TEST01';
const ACTOR_ID  = 'USR-NOSHOW-ACTOR1';
const TALENT_ID = 'USR-NOSHOW-TALENT1';
const PAYER_ID  = 'USR-NOSHOW-PAYER01';

// ── ContractSnapshot phase 2 — DJ Alex SC-01 ──────────────────
// cachetBrutFinal=300$, taux=9%(90000ppm), commission=27$, net=273$
const nominalSnapshot = {
  cachetBrutFinalCents: 30_000,
  commissionMrCents:    2_700,
  talentUserId:         TALENT_ID,
  tauxPpm:              90_000,
};

// ── DecisionRecord NO_SHOW_CONFIRMED nominal ──────────────────
// Produit par sots_window_closed→no_show (déjà testé dans NO-SHOW-PRE-01)
const nominalDecisionRecord = {
  systemId:    'ADM-DECISION-NS001',
  type:        'NO_SHOW_CONFIRMED',
  engagementId: ENG_ID,
  talentUserId: TALENT_ID,
  financialImpact: {
    talentPaymentCents:        0,
    organizerRefundCents:      27_300,   // cachetNetFinalCents
    mrCommissionRetainedCents: 2_700,
    cachetBrutFinalCents:      30_000,
    cachetNetFinalCents:       27_300,
    basis: 'CONTRACT_SNAPSHOT_PHASE_2_WORM_W2',
  },
};

// ── Mock PolicyConfig (non utilisé par NoShowGuard mais requis par transitionEngagement) ──
const mockPolicyConfig = {
  async getConfig(key) {
    const db = {
      deposit_ratio_ppm:              '200000',
      event_payment_cap_cents:        '350000',
    };
    if (!(key in db)) throw new Error(`POLICY_CONFIG_MISSING: "${key}" absent du mock`);
    return parseInt(db[key], 10);
  },
};

const repositories = { policyConfig: mockPolicyConfig };

// ── Helpers ───────────────────────────────────────────────────
async function testAsync(name, fn) {
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

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

// ── Banner ────────────────────────────────────────────────────
console.log('═══════════════════════════════════════════════════');
console.log('Test P0 : NOSHOW-REFUND-01');
console.log('no_show→refunded — LOI NO-SHOW-01 · CT-014 · Phase 0.2');
console.log('═══════════════════════════════════════════════════\n');

async function run() {

  // ════════════════════════════════════════════════════════
  // PARTIE 1 — Preuves que le placeholder est éliminé
  // Ces tests échouaient AVANT Phase 0.2 (passed:true silencieux).
  // ════════════════════════════════════════════════════════
  console.log('─── Partie 1 : Ancien placeholder éliminé ──────────');

  await testAsync('T-01 : no_show→refunded sans DecisionRecord → GUARD_FAILED (plus placeholder)', async () => {
    let threw = false;
    try {
      await transitionEngagement({
        engagementId: ENG_ID,
        currentState:  'no_show',
        targetState:   'refunded',
        actor:         ACTOR_ID,
        context: {
          // decisionRecord absent — doit bloquer
          contractSnapshotPhase2: nominalSnapshot,
          payerUserId:            PAYER_ID,
        },
        repositories,
      });
    } catch (err) {
      threw = true;
      // Avant Phase 0.2, cette transition passait silencieusement.
      // Après Phase 0.2, elle doit lever GUARD_FAILED avec NO_SHOW_REFUND_NO_DECISION.
      assert(
        err.message.includes('GUARD_FAILED') || err.message.includes('NO_SHOW_REFUND_NO_DECISION'),
        `Attendu GUARD_FAILED ou NO_SHOW_REFUND_NO_DECISION. Reçu : ${err.message}`
      );
    }
    assert(threw, 'no_show→refunded sans DecisionRecord devait lever une erreur (ex-placeholder retournait { passed:true })');
  });

  await testAsync('T-02 : no_show→refunded sans contractSnapshotPhase2 → GUARD_FAILED', async () => {
    let threw = false;
    try {
      await transitionEngagement({
        engagementId: ENG_ID,
        currentState:  'no_show',
        targetState:   'refunded',
        actor:         ACTOR_ID,
        context: {
          decisionRecord:         nominalDecisionRecord,
          // contractSnapshotPhase2 absent
          payerUserId:            PAYER_ID,
        },
        repositories,
      });
    } catch (err) {
      threw = true;
      assert(
        err.message.includes('GUARD_FAILED') || err.message.includes('NO_SHOW_REFUND_MISSING_SNAPSHOT'),
        `Attendu GUARD_FAILED/NO_SHOW_REFUND_MISSING_SNAPSHOT. Reçu : ${err.message}`
      );
    }
    assert(threw, 'contractSnapshotPhase2 absent devait bloquer');
  });

  await testAsync('T-03 : no_show→refunded sans payerUserId → GUARD_FAILED', async () => {
    let threw = false;
    try {
      await transitionEngagement({
        engagementId: ENG_ID,
        currentState:  'no_show',
        targetState:   'refunded',
        actor:         ACTOR_ID,
        context: {
          decisionRecord:         nominalDecisionRecord,
          contractSnapshotPhase2: nominalSnapshot,
          // payerUserId absent
        },
        repositories,
      });
    } catch (err) {
      threw = true;
      assert(
        err.message.includes('GUARD_FAILED') || err.message.includes('NO_SHOW_REFUND_MISSING_PAYER'),
        `Attendu GUARD_FAILED/NO_SHOW_REFUND_MISSING_PAYER. Reçu : ${err.message}`
      );
    }
    assert(threw, 'payerUserId absent devait bloquer');
  });

  await testAsync('T-04 : no_show→refunded — DecisionRecord mauvais type → GUARD_FAILED', async () => {
    let threw = false;
    try {
      await transitionEngagement({
        engagementId: ENG_ID,
        currentState:  'no_show',
        targetState:   'refunded',
        actor:         ACTOR_ID,
        context: {
          decisionRecord: {
            ...nominalDecisionRecord,
            type: 'DISPUTE_RESOLVED',  // mauvais type
          },
          contractSnapshotPhase2: nominalSnapshot,
          payerUserId:            PAYER_ID,
        },
        repositories,
      });
    } catch (err) {
      threw = true;
      assert(
        err.message.includes('GUARD_FAILED') || err.message.includes('NO_SHOW_WRONG_DECISION_TYPE'),
        `Attendu GUARD_FAILED/NO_SHOW_WRONG_DECISION_TYPE. Reçu : ${err.message}`
      );
    }
    assert(threw, 'DecisionRecord mauvais type devait bloquer');
  });

  await testAsync('T-05 : no_show→refunded — DecisionRecord engagementId mismatch → GUARD_FAILED', async () => {
    let threw = false;
    try {
      await transitionEngagement({
        engagementId: ENG_ID,
        currentState:  'no_show',
        targetState:   'refunded',
        actor:         ACTOR_ID,
        context: {
          decisionRecord: {
            ...nominalDecisionRecord,
            engagementId: 'ENG-WRONG-001001',  // mismatch
          },
          contractSnapshotPhase2: nominalSnapshot,
          payerUserId:            PAYER_ID,
        },
        repositories,
      });
    } catch (err) {
      threw = true;
      assert(
        err.message.includes('GUARD_FAILED') || err.message.includes('NO_SHOW_DECISION_MISMATCH'),
        `Attendu GUARD_FAILED/NO_SHOW_DECISION_MISMATCH. Reçu : ${err.message}`
      );
    }
    assert(threw, 'engagementId mismatch devait bloquer');
  });

  await testAsync('T-06 : no_show→refunded — montant incohérent DecisionRecord vs Snapshot → GUARD_FAILED', async () => {
    // DecisionRecord dit organizerRefundCents=27_300
    // Snapshot donne cachetNetFinal=27_300 − 1 = 27_299 (valeur différente)
    // NoShowGuard vérifie la cohérence des deux
    let threw = false;
    try {
      await transitionEngagement({
        engagementId: ENG_ID,
        currentState:  'no_show',
        targetState:   'refunded',
        actor:         ACTOR_ID,
        context: {
          decisionRecord: nominalDecisionRecord,  // organizerRefundCents = 27_300
          contractSnapshotPhase2: {
            ...nominalSnapshot,
            commissionMrCents: 2_701,  // net = 30_000 − 2_701 = 27_299 ≠ 27_300
          },
          payerUserId: PAYER_ID,
        },
        repositories,
      });
    } catch (err) {
      threw = true;
      assert(
        err.message.includes('GUARD_FAILED') || err.message.includes('NO_SHOW_REFUND_AMOUNT_MISMATCH'),
        `Attendu GUARD_FAILED/NO_SHOW_REFUND_AMOUNT_MISMATCH. Reçu : ${err.message}`
      );
    }
    assert(threw, 'Incohérence montants DecisionRecord/Snapshot devait bloquer');
  });

  // ════════════════════════════════════════════════════════
  // PARTIE 2 — Chemin nominal : refundInstruction complète
  // ════════════════════════════════════════════════════════
  console.log('\n─── Partie 2 : Chemin nominal DJ Alex (300$ CAD) ───');

  let nominalResult = null;

  await testAsync('T-07 : no_show→refunded chemin nominal → success:true + refundInstruction', async () => {
    nominalResult = await transitionEngagement({
      engagementId: ENG_ID,
      currentState:  'no_show',
      targetState:   'refunded',
      actor:         ACTOR_ID,
      context: {
        decisionRecord:         nominalDecisionRecord,
        contractSnapshotPhase2: nominalSnapshot,
        payerUserId:            PAYER_ID,
      },
      repositories,
    });
    assert(nominalResult.success === true, `success attendu true. Reçu : ${nominalResult.success}`);
    assert(nominalResult.newState === 'refunded', `newState attendu 'refunded'. Reçu : ${nominalResult.newState}`);
  });

  await testAsync('T-08 : refundInstruction.refundAmountCents = cachetNetFinalCents = 27_300 (LOI NO-SHOW-01)', async () => {
    assert(nominalResult, 'T-07 doit passer avant T-08');
    const ri = nominalResult.refundInstruction;
    assert(ri, `refundInstruction absente du résultat. Reçu : ${JSON.stringify(Object.keys(nominalResult))}`);
    assert(
      ri.refundAmountCents === 27_300,
      `refundAmountCents attendu 27_300. Reçu : ${ri.refundAmountCents}. ` +
      `LOI NO-SHOW-01 : organisateur remboursé du cachet_net_final.`
    );
  });

  await testAsync('T-09 : refundInstruction.talentPaymentCents = 0 (talent = 0$, LOI NO-SHOW-01)', async () => {
    assert(nominalResult, 'T-07 doit passer avant T-09');
    const ri = nominalResult.refundInstruction;
    assert(ri, 'refundInstruction absente');
    assert(
      ri.talentPaymentCents === 0,
      `talentPaymentCents attendu 0. Reçu : ${ri.talentPaymentCents}. ` +
      `LOI NO-SHOW-01 : talent = 0$.`
    );
  });

  await testAsync('T-10 : refundInstruction.mrCommissionCents = 2_700 (MR conserve sa commission, LOI NO-SHOW-01)', async () => {
    assert(nominalResult, 'T-07 doit passer avant T-10');
    const ri = nominalResult.refundInstruction;
    assert(ri, 'refundInstruction absente');
    assert(
      ri.mrCommissionCents === 2_700,
      `mrCommissionCents attendu 2_700. Reçu : ${ri.mrCommissionCents}. ` +
      `LOI NO-SHOW-01 : Micro Rave conserve sa commission.`
    );
  });

  await testAsync('T-11 : refundInstruction.ledgerEntries non vide (écritures comptables présentes)', async () => {
    assert(nominalResult, 'T-07 doit passer avant T-11');
    const ri = nominalResult.refundInstruction;
    assert(ri, 'refundInstruction absente');
    assert(
      Array.isArray(ri.ledgerEntries) && ri.ledgerEntries.length > 0,
      `ledgerEntries attendu tableau non vide. Reçu : ${JSON.stringify(ri.ledgerEntries)}`
    );
  });

  await testAsync('T-12 : refundInstruction.type = \'NO_SHOW_REFUND\'', async () => {
    assert(nominalResult, 'T-07 doit passer avant T-12');
    const ri = nominalResult.refundInstruction;
    assert(ri, 'refundInstruction absente');
    assert(
      ri.type === 'NO_SHOW_REFUND',
      `type attendu 'NO_SHOW_REFUND'. Reçu : '${ri.type}'`
    );
  });

  // ════════════════════════════════════════════════════════
  // PARTIE 3 — Arithmétique CT-014
  // ════════════════════════════════════════════════════════
  console.log('\n─── Partie 3 : Arithmétique CT-014 ─────────────────');

  await testAsync('T-13 : cachet_net_final = brut − commission (CT-014 arithmétique)', async () => {
    // Tester avec des montants différents — 500$ CAD, taux 12% (Freemium)
    const snapshot500 = {
      cachetBrutFinalCents: 50_000,   // 500$
      commissionMrCents:    6_000,    // 12% = 6000 centimes
      talentUserId:         TALENT_ID,
      tauxPpm:              120_000,
    };
    const decisionRecord500 = {
      systemId:    'ADM-DECISION-500',
      type:        'NO_SHOW_CONFIRMED',
      engagementId: ENG_ID,
      talentUserId: TALENT_ID,
      financialImpact: {
        organizerRefundCents:  44_000,  // 50_000 − 6_000
        cachetNetFinalCents:   44_000,
        cachetBrutFinalCents:  50_000,
        mrCommissionRetainedCents: 6_000,
      },
    };
    const result500 = await transitionEngagement({
      engagementId: ENG_ID,
      currentState:  'no_show',
      targetState:   'refunded',
      actor:         ACTOR_ID,
      context: {
        decisionRecord:         decisionRecord500,
        contractSnapshotPhase2: snapshot500,
        payerUserId:            PAYER_ID,
      },
      repositories,
    });
    const ri = result500.refundInstruction;
    assert(ri, 'refundInstruction absente pour 500$');
    const expectedNet = 50_000 - 6_000;  // 44_000
    assert(
      ri.refundAmountCents === expectedNet,
      `refundAmountCents attendu ${expectedNet}. Reçu : ${ri.refundAmountCents}. ` +
      `CT-014 : cachet_net_final = 50_000 − 6_000 = 44_000 centimes.`
    );
    assert(
      ri.talentPaymentCents === 0,
      `talentPaymentCents attendu 0. Reçu : ${ri.talentPaymentCents}`
    );
  });

  await testAsync('T-14 : cachet_net_final = 0 si cachetBrutFinal = commission (talent gratuit edge case)', async () => {
    // Edge case : cachet 0$ net (tous les fonds = commission MR)
    // Ex: cachetBrut=100, commission=100 → net=0
    const snapshotZero = {
      cachetBrutFinalCents: 100,
      commissionMrCents:    100,
      talentUserId:         TALENT_ID,
      tauxPpm:              1_000_000,  // 100%
    };
    const decisionRecordZero = {
      systemId:    'ADM-DECISION-Z00',
      type:        'NO_SHOW_CONFIRMED',
      engagementId: ENG_ID,
      talentUserId: TALENT_ID,
      financialImpact: {
        organizerRefundCents:  0,    // 100 − 100 = 0
        cachetNetFinalCents:   0,
        cachetBrutFinalCents:  100,
        mrCommissionRetainedCents: 100,
      },
    };
    const resultZero = await transitionEngagement({
      engagementId: ENG_ID,
      currentState:  'no_show',
      targetState:   'refunded',
      actor:         ACTOR_ID,
      context: {
        decisionRecord:         decisionRecordZero,
        contractSnapshotPhase2: snapshotZero,
        payerUserId:            PAYER_ID,
      },
      repositories,
    });
    const ri = resultZero.refundInstruction;
    assert(ri, 'refundInstruction absente pour edge case zéro');
    assert(
      ri.refundAmountCents === 0,
      `refundAmountCents attendu 0 (edge case). Reçu : ${ri.refundAmountCents}`
    );
    assert(ri.talentPaymentCents === 0, 'talentPaymentCents doit être 0');
  });

  // ════════════════════════════════════════════════════════
  // PARTIE 4 — Vérifications architecturales
  // ════════════════════════════════════════════════════════
  console.log('\n─── Partie 4 : Vérifications architecturales ────────');

  await testAsync('T-15 : RefundGuard fail-closed pour transition non couverte (ex: disputed→refunded)', async () => {
    // Phase 2.3 couvrira disputed→refunded via DisputeResolutionGuard.
    // En attendant, tenter d'appeler RefundGuard depuis disputed→refunded
    // doit échouer avec GUARD_NOT_IMPLEMENTED, pas passer silencieusement.
    // Note : disputed→refunded est routé vers DisputeResolutionGuard dans TRANSITION_TABLE,
    // donc ce cas est déjà intercepté avant RefundGuard.
    // On teste via no_show_pre_event→archived (ArchiveWORMGuard) qu'une transition
    // non listée reste fail-closed.
    let threw = false;
    try {
      await transitionEngagement({
        engagementId: ENG_ID,
        currentState:  'settled',  // état non WORM
        targetState:   'refunded', // transition inexistante dans TRANSITION_TABLE
        actor:         ACTOR_ID,
        context:       {},
        repositories,
      });
    } catch (err) {
      threw = true;
      assert(
        err.message.includes('TRANSITION_UNAUTHORIZED') || err.message.includes('WORM'),
        `Attendu TRANSITION_UNAUTHORIZED ou WORM. Reçu : ${err.message}`
      );
    }
    assert(threw, 'Transition non listée devait être fail-closed');
  });

  await testAsync('T-16 : sots_window_closed→no_show non affecté par Phase 0.2 (contrôle régression)', async () => {
    // Vérifier que la correction RefundGuard n'a pas cassé NoShowGuard pour sots_window_closed→no_show
    let threw = false;
    try {
      await transitionEngagement({
        engagementId: ENG_ID,
        currentState:  'sots_window_closed',
        targetState:   'no_show',
        actor:         ACTOR_ID,
        context: {
          // triggerSource absent → doit bloquer NO_SHOW_TRIGGER_INVALID
          contractSnapshotPhase2: nominalSnapshot,
        },
        repositories,
      });
    } catch (err) {
      threw = true;
      assert(
        err.message.includes('GUARD_FAILED') || err.message.includes('NO_SHOW_TRIGGER_INVALID'),
        `Attendu GUARD_FAILED/NO_SHOW_TRIGGER_INVALID. Reçu : ${err.message}. ` +
        `Régression : sots_window_closed→no_show devait rester fonctionnel.`
      );
    }
    assert(threw, 'sots_window_closed→no_show sans triggerSource devait bloquer (régression)');
  });

  // ── Rapport ───────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════');
  console.log(`RÉSULTAT : ${passed} passés · ${failed} échoués sur ${passed + failed} tests`);
  if (failed === 0) {
    console.log('✓ NOSHOW-REFUND-01 PASSED');
    console.log('  Phase 0.2 validée : no_show→refunded exécute NoShowGuard réel.');
    console.log('  LOI NO-SHOW-01 / CT-014 appliquées. Placeholder éliminé.');
  } else {
    console.log('✗ NOSHOW-REFUND-01 FAILED');
    process.exitCode = 1;
  }
  console.log('═══════════════════════════════════════════════════');
}

run().catch(err => {
  console.error('ERREUR FATALE :', err.message);
  process.exitCode = 1;
});