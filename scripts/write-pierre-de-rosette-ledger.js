/**
 * MICRO RAVE V3 — scripts/write-pierre-de-rosette-ledger.js
 * ============================================================
 * Écritures rétroactives D-038 pour la transaction pilote.
 *
 * CONTEXTE :
 *   Phase 1 CONTROLLED SUCCESS — DJ Alex payé 264.00$ CAD le 23 mai 2026.
 *   Le Transfer Stripe tr_1TaHDt2eLVUrCnnJyDflLNEa a eu lieu.
 *   MAIS : aucun LedgerRecord n'a été écrit. Le grand livre est vide.
 *   Ce script corrige cette lacune rétroactivement.
 *
 * WATERFALL PIERRE DE ROSETTE :
 *   cachetSignéCents       = 20 000  (200.00$)
 *   prixVenduClientCents   = 30 000  (300.00$)
 *   coefficient            = 1.5     (30000 / 20000)
 *   cachetBrutFinalCents   = 30 000  (200$ × 1.5)
 *   tauxPpm                = 120 000 (12%)
 *   commissionMrCents      =  3 600  (36.00$)
 *   talentNetCents          = 26 400  (264.00$)
 *   TPS 5% sur commission  =    180  (1.80$)
 *   TVQ 9.975% sur comm    =    359  (3.59$)
 *   Frais Stripe estimés   =    0    (paiement hors Stripe Checkout pour le pilote)
 *
 * IMPORTANT — INTERVENTION PILOTE :
 *   Le paiement organisateur → MR n'a PAS transité par Stripe Checkout
 *   dans le pilote. Le Transfer a été exécuté depuis le solde MR existant.
 *   Les écritures Phase 1 (encaissement) sont des écritures de RÉGULARISATION
 *   documentant la transaction telle qu'elle AURAIT dû être comptabilisée
 *   dans un flux nominal. Chaque écriture rétroactive est marquée
 *   transactionType: 'retroactive_pierre_de_rosette'.
 *
 * USAGE :
 *   node scripts/write-pierre-de-rosette-ledger.js
 *
 * Source : D-038 · D-060 · LOI LEDGER-01 · LOI LEDGER-02 · Brief Technique SKU
 * ============================================================
 */

'use strict';

require('dotenv').config();

const IDFactory               = require('../src/core/IDFactory');
const MoneyMath               = require('../src/core/MoneyMath');
const FinancialLedgerService  = require('../src/services/FinancialLedgerService');
const repositories            = require('../src/repositories');

// ── Données de la transaction pilote ──────────────────────────
const PILOT = {
  engagementId:       process.env.PILOT_ENGAGEMENT_ID   || 'ENG-MPIG0BUZ-N084HN',
  eventId:            process.env.PILOT_EVENT_ID        || 'EVT-MPIGOBK2-C0RXZ5',
  talentUserId:       process.env.PILOT_TALENT_USER_ID  || 'USR-MPIG0A0O-9CZ5JA',
  organizerUserId:    'USR-MPIGOAKA-S5NIIG',
  stripeTransferId:   'tr_1TaHDt2eLVUrCnnJyDflLNEa',
  stripeAccountId:    'acct_1TaGqTKCWuw3ufQV',
  founderUserId:      'USR-FOUNDER-PILOT',
  currency:           'cad',

  // Waterfall — valeurs calculées, pas hardcodées
  cachetSigneCents:       20000,
  prixVenduClientCents:   30000,
  tauxPpm:                120000,
};

// ── Calcul du waterfall ───────────────────────────────────────
// Le coefficient est un MULTIPLICATEUR (peut dépasser 1 000 000 ppm = 100%).
// On NE PEUT PAS utiliser applyRatePpm() pour l'appliquer — applyRatePpm
// refuse les taux > 1 000 000 ppm. On utilise Math.floor direct, autorisé
// car c'est une redistribution lineup (LOI LINEUP-01), pas un calcul de taux.
// Source : MoneyMath.lineupCoefficientPpm() retourne max(1_000_000, ...).
const coefficient     = MoneyMath.lineupCoefficientPpm(PILOT.prixVenduClientCents, PILOT.cachetSigneCents);
const cachetBrutFinal = Math.floor(PILOT.cachetSigneCents * coefficient / 1_000_000);
const commissionMr    = MoneyMath.applyRatePpm(cachetBrutFinal, PILOT.tauxPpm);
const talentNet       = cachetBrutFinal - commissionMr;
const tpsCents        = MoneyMath.applyRatePpm(commissionMr, 50000);    // 5%
const tvqCents        = MoneyMath.applyRatePpm(commissionMr, 99750);    // 9.975%

// Frais Stripe : 0 pour le pilote (pas de Stripe Checkout organisateur)
const stripeFeeCents  = 0;

// Total que l'organisateur aurait payé dans un flux nominal
const totalEncaisse   = PILOT.prixVenduClientCents + tpsCents + tvqCents;

// ── Helpers ───────────────────────────────────────────────────

function section(title) {
  console.log(`\n${'─'.repeat(58)}`);
  console.log(`  ${title}`);
  console.log(`${'─'.repeat(58)}`);
}

function ok(msg, data) {
  console.log(`  ✓ ${msg}`);
  if (data) console.log(`    ${JSON.stringify(data)}`);
}

function formatCents(cents) {
  return `${(cents / 100).toFixed(2)}$`;
}

// ══════════════════════════════════════════════════════════════
// TRANSACTION 1 — Encaissement (Phase 1 D-038 rétroactive)
// ══════════════════════════════════════════════════════════════
async function writePhase1_Encaissement() {
  section('Transaction 1 — Encaissement Phase 1 (D-038 rétroactive)');

  console.log('  Waterfall calculé :');
  console.log(`    cachetSigné        : ${formatCents(PILOT.cachetSigneCents)}`);
  console.log(`    prixVenduClient    : ${formatCents(PILOT.prixVenduClientCents)}`);
  console.log(`    coefficient        : ${(coefficient / 1_000_000).toFixed(4)}`);
  console.log(`    cachetBrutFinal    : ${formatCents(cachetBrutFinal)}`);
  console.log(`    commissionMR (12%) : ${formatCents(commissionMr)}`);
  console.log(`    talentNet          : ${formatCents(talentNet)}`);
  console.log(`    TPS (5%)           : ${formatCents(tpsCents)}`);
  console.log(`    TVQ (9.975%)       : ${formatCents(tvqCents)}`);
  console.log(`    Frais Stripe       : ${formatCents(stripeFeeCents)} (pilote hors Checkout)`);
  console.log(`    Total encaissable  : ${formatCents(totalEncaisse)}`);

  // Vérification LOI LEDGER-02 : talentNet + commissionMr = prixVenduClient
  const ledger02 = talentNet + commissionMr;
  if (ledger02 !== PILOT.prixVenduClientCents) {
    throw new Error(
      `LOI LEDGER-02 VIOLÉE : talentNet(${talentNet}) + commissionMr(${commissionMr}) ` +
      `= ${ledger02} ≠ prixVenduClient(${PILOT.prixVenduClientCents}). ABANDON.`
    );
  }
  ok(`LOI LEDGER-02 : ${talentNet} + ${commissionMr} = ${PILOT.prixVenduClientCents} ✓`);

  const entries = [
    {
      account:     '5200',
      direction:   'DEBIT',
      amountCents: totalEncaisse,
      note:        `Encaissement régularisé — ${formatCents(totalEncaisse)} (pilote hors Checkout)`,
    },
  ];

  if (stripeFeeCents > 0) {
    entries.push({
      account:     '4190',
      direction:   'DEBIT',
      amountCents: stripeFeeCents,
      note:        `Frais Stripe différés — ${formatCents(stripeFeeCents)}`,
    });
  }

  entries.push({
    account:     '4310',
    direction:   'CREDIT',
    amountCents: talentNet,
    note:        `Talent payable DJ Alex — ${formatCents(talentNet)}`,
  });

  entries.push({
    account:     '4530',
    direction:   'CREDIT',
    amountCents: commissionMr,
    note:        `Commission MR différée (12%) — ${formatCents(commissionMr)} — LOI LEDGER-01`,
  });

  if (tpsCents > 0) {
    entries.push({
      account:     '4410',
      direction:   'CREDIT',
      amountCents: tpsCents,
      note:        `TPS à remettre (5% sur commission) — ${formatCents(tpsCents)}`,
    });
  }

  if (tvqCents > 0) {
    entries.push({
      account:     '4420',
      direction:   'CREDIT',
      amountCents: tvqCents,
      note:        `TVQ à remettre (9.975% sur commission) — ${formatCents(tvqCents)}`,
    });
  }

  const result = await FinancialLedgerService.recordTransaction({
    transactionType:   'retroactive_pierre_de_rosette',
    engagementId:      PILOT.engagementId,
    eventId:           PILOT.eventId,
    skuCode:           'SKU-COURTAGE',
    subSkuCode:        'SUB-COURT-DJ',
    currency:          PILOT.currency,
    note:              'Phase 1 D-038 rétroactive — encaissement pilote Pierre de Rosette',
    reconciliationKey: 'journal:PIERRE-DE-ROSETTE-PHASE1-ENCAISSEMENT',  // D-060-C
    metadata: {
      pilote:             true,
      interventionType:   'RETROACTIVE_REGULARIZATION',
      stripeCheckout:     false,
      organizerPayment:   'hors_systeme_pilote',
      waterfall: {
        cachetSigneCents:     PILOT.cachetSigneCents,
        prixVenduClientCents: PILOT.prixVenduClientCents,
        coefficientPpm:       coefficient,
        cachetBrutFinalCents: cachetBrutFinal,
        commissionMrCents:    commissionMr,
        talentNetCents:       talentNet,
        tpsCents,
        tvqCents,
        stripeFeeCents,
      },
    },
    entries,
    repositories,
  });

  ok(`Phase 1 persistée — TXG: ${result.transactionGroupId}`, {
    lines:  result.lineCount,
    DR:     result.totalDebit,
    CR:     result.totalCredit,
    balanced: result.balanced,
  });

  return result;
}

// ══════════════════════════════════════════════════════════════
// TRANSACTION 2 — Payout + Reconnaissance revenu (Phase 2 D-038)
// ══════════════════════════════════════════════════════════════
async function writePhase2_PayoutEtReconnaissance() {
  section('Transaction 2 — Payout + Reconnaissance revenu (Phase 2 D-038)');

  const entries = [
    {
      account:     '4310',
      direction:   'DEBIT',
      amountCents: talentNet,
      note:        `Payout DJ Alex — ${formatCents(talentNet)} → Stripe Connect`,
    },
    {
      account:     '4530',
      direction:   'DEBIT',
      amountCents: commissionMr,
      note:        `Reconnaissance revenu courtage — ${formatCents(commissionMr)} → 7110`,
    },
    {
      account:     '5100',
      direction:   'CREDIT',
      amountCents: talentNet,
      note:        `Transfer Stripe ${PILOT.stripeTransferId} — ${formatCents(talentNet)}`,
    },
    {
      account:     '7110',
      direction:   'CREDIT',
      amountCents: commissionMr,
      note:        `Revenu courtage complété — ${formatCents(commissionMr)} — LOI LEDGER-01 archivage`,
    },
  ];

  if (stripeFeeCents > 0) {
    entries.push(
      {
        account:     '6110',
        direction:   'DEBIT',
        amountCents: stripeFeeCents,
        note:        `Frais Stripe courtage — ${formatCents(stripeFeeCents)}`,
      },
      {
        account:     '4190',
        direction:   'CREDIT',
        amountCents: stripeFeeCents,
        note:        `Frais Stripe différés absorbés — ${formatCents(stripeFeeCents)}`,
      },
    );
  }

  const result = await FinancialLedgerService.recordTransaction({
    transactionType:   'retroactive_pierre_de_rosette',
    engagementId:      PILOT.engagementId,
    eventId:           PILOT.eventId,
    skuCode:           'SKU-COURTAGE',
    subSkuCode:        'SUB-COURT-DJ',
    currency:          PILOT.currency,
    note:              'Phase 2 D-038 rétroactive — payout + reconnaissance revenu Pierre de Rosette',
    reconciliationKey: `stripe:${PILOT.stripeTransferId}`,               // D-060-C
    stripeTransferId:  PILOT.stripeTransferId,                            // D-038-B
    metadata: {
      pilote:           true,
      stripeTransferId: PILOT.stripeTransferId,
      payoutExecutionRecordId: 'PAY-MPIHYIID-0VYYNQ',
    },
    entries,
    repositories,
  });

  ok(`Phase 2 persistée — TXG: ${result.transactionGroupId}`, {
    lines:    result.lineCount,
    DR:       result.totalDebit,
    CR:       result.totalCredit,
    balanced: result.balanced,
  });

  return result;
}

// ══════════════════════════════════════════════════════════════
// VÉRIFICATION — Bilan de la transaction pilote
// ══════════════════════════════════════════════════════════════
async function verifyAndPrintBilan() {
  section('Vérification — Bilan Pierre de Rosette');

  const verification = await FinancialLedgerService.verifyBalance({
    engagementId: PILOT.engagementId,
    repositories,
  });

  console.log(`  Records total     : ${verification.totalRecords}`);
  console.log(`  Groupes           : ${verification.groupCount}`);
  console.log(`  Total DR          : ${formatCents(verification.totalDebit)}`);
  console.log(`  Total CR          : ${formatCents(verification.totalCredit)}`);
  console.log(`  Écart             : ${verification.ecart} centimes`);
  console.log(`  Équilibré         : ${verification.balanced ? '✓ OUI' : '✗ NON'}`);

  if (verification.imbalancedGroups.length > 0) {
    console.log('  ⚠ GROUPES DÉSÉQUILIBRÉS :');
    for (const g of verification.imbalancedGroups) {
      console.log(`    ${g.groupId} : DR ${g.debit} ≠ CR ${g.credit} (écart ${g.ecart})`);
    }
  }

  const bilan = await FinancialLedgerService.generateBalanceSnapshot({
    engagementId: PILOT.engagementId,
    repositories,
  });

  section('BILAN — Engagement Pierre de Rosette — post-archivage');

  console.log('  ACTIFS');
  for (const [acct, solde] of Object.entries(bilan.actifs)) {
    if (solde !== 0) console.log(`    ${acct}  ${formatCents(solde).padStart(12)}`);
  }
  console.log(`    ${'─'.repeat(30)}`);
  console.log(`    Total actifs  ${formatCents(bilan.totalActifs).padStart(12)}`);

  console.log('');
  console.log('  PASSIFS');
  for (const [acct, solde] of Object.entries(bilan.passifs)) {
    if (solde !== 0) console.log(`    ${acct}  ${formatCents(solde).padStart(12)}`);
  }
  console.log(`    ${'─'.repeat(30)}`);
  console.log(`    Total passifs ${formatCents(bilan.totalPassifs).padStart(12)}`);

  console.log('');
  console.log('  REVENUS');
  for (const [acct, solde] of Object.entries(bilan.revenus)) {
    if (solde !== 0) console.log(`    ${acct}  ${formatCents(solde).padStart(12)}`);
  }
  console.log(`    ${'─'.repeat(30)}`);
  console.log(`    Total revenus ${formatCents(bilan.totalRevenus).padStart(12)}`);

  console.log('');
  console.log('  CHARGES');
  for (const [acct, solde] of Object.entries(bilan.charges)) {
    if (solde !== 0) console.log(`    ${acct}  ${formatCents(solde).padStart(12)}`);
  }
  console.log(`    ${'─'.repeat(30)}`);
  console.log(`    Total charges ${formatCents(bilan.totalCharges).padStart(12)}`);

  console.log('');
  console.log(`  RÉSULTAT NET    ${formatCents(bilan.resultatNet).padStart(12)}`);
  console.log(`  BILAN ÉQUILIBRÉ : ${bilan.bilanEquilibre ? '✓ OUI' : '✗ NON'}`);

  console.log('');
  console.log('  VÉRIFICATION ATTENDUE :');
  console.log(`    Actifs attendus      : ${formatCents(totalEncaisse - talentNet)}`);
  console.log(`    Passifs attendus     : ${formatCents(tpsCents + tvqCents)}`);
  console.log(`    Résultat net attendu : ${formatCents(commissionMr - stripeFeeCents)}`);

  const attenduActifs = totalEncaisse - talentNet;
  const attenduPR     = tpsCents + tvqCents + commissionMr - stripeFeeCents;
  console.log(`    Actifs = P + R ?     : ${attenduActifs} = ${tpsCents + tvqCents} + ${commissionMr - stripeFeeCents} = ${attenduPR}`);

  if (attenduActifs === attenduPR) {
    console.log('    ✓ BILAN ARITHMÉTIQUEMENT CORRECT');
  } else {
    console.log(`    ✗ ÉCART : ${attenduActifs} ≠ ${attenduPR} — investigation requise`);
  }

  return { verification, bilan };
}

// ══════════════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════════════
async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║  MICRO RAVE V3 — Écritures D-038 rétroactives          ║');
  console.log('║  Pierre de Rosette — Transaction pilote                ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log(`  Engagement    : ${PILOT.engagementId}`);
  console.log(`  Event         : ${PILOT.eventId}`);
  console.log(`  Talent        : ${PILOT.talentUserId}`);
  console.log(`  Organisateur  : ${PILOT.organizerUserId}`);
  console.log(`  Transfer      : ${PILOT.stripeTransferId}`);

  const phase1 = await writePhase1_Encaissement();
  const phase2 = await writePhase2_PayoutEtReconnaissance();
  const { verification, bilan } = await verifyAndPrintBilan();

  console.log('\n' + '═'.repeat(58));
  if (verification.balanced && bilan.bilanEquilibre) {
    console.log('  ✓ GRAND LIVRE PILOTE — ÉQUILIBRÉ ET VÉRIFIÉ');
    console.log('  Le système sait écrire un bilan équilibré avec une transaction.');
    console.log('  La rigueur comptable est prouvée dès la transaction #1.');
  } else {
    console.log('  ✗ GRAND LIVRE PILOTE — DÉSÉQUILIBRÉ');
    console.log('  Investigation requise avant de poursuivre.');
  }
  console.log('═'.repeat(58));
  console.log(`\n  Total LedgerRecords créés : ${phase1.lineCount + phase2.lineCount}`);
  console.log(`  Transaction groups        : 2 (Phase 1 + Phase 2)`);
  console.log(`  Résultat net MR           : ${formatCents(commissionMr - stripeFeeCents)}`);
}

main().catch(err => {
  console.error('\n ❌ ERREUR FATALE :', err.message);
  console.error(err.stack);
  process.exit(1);
});