/**
 * MICRO RAVE V3 — scripts/reversal-pierre-de-rosette-ledger.js
 * ============================================================
 * Correction comptable du Groupe 1 (TXG-MPIUM30W-0ZN0UV).
 *
 * CONTEXTE :
 *   Le script write-pierre-de-rosette-ledger.js a persisté 9 lignes
 *   dans deux groupes équilibrés. Le Groupe 1 contient deux erreurs :
 *
 *   ERREUR 1 — Compte 5200 écrit à 30 539 ¢ (305,39 $)
 *     → L'encaissement réel est 30 000 ¢ (300,00 $).
 *     → totalEncaisse = prixVenduClient + tps + tvq était faux.
 *     → Le client a payé 300 $ hors système. Aucune taxe n'a été perçue.
 *
 *   ERREUR 2 — Lignes 4410 (180 ¢) et 4420 (359 ¢) inexactes
 *     → Ces taxes n'ont jamais été perçues (transaction pilote hors Checkout).
 *     → Comptabiliser une dette fiscale sur des taxes non perçues est faux.
 *
 * RÈGLE ARCHITECTURALE — LOI GREFFIER-01 :
 *   Aucun DELETE. Aucun UPDATE.
 *   Toute correction passe par une écriture compensatoire (reversal)
 *   suivie d'une réimputation correcte.
 *   Les 9 lignes originales restent immuables dans le ledger.
 *
 * CE QUE CE SCRIPT FAIT :
 *   Groupe 3 — Reversal exact de TXG-MPIUM30W-0ZN0UV (contre-passe les 5 lignes)
 *   Groupe 4 — Réimputation correcte (3 lignes, sans taxes non perçues)
 *
 * LIGNES ORIGINALES À REVERSER (Groupe 1 — TXG-MPIUM30W-0ZN0UV) :
 *   LDG-MPIUM30X  5200  DEBIT   30 539 ¢  Encaissement 305,39$
 *   LDG-MPIUM3F2  4310  CREDIT  26 400 ¢  Talent payable
 *   LDG-MPIUM3JC  4530  CREDIT   3 600 ¢  Commission MR différée
 *   LDG-MPIUM3P5  4410  CREDIT     180 ¢  TPS (non perçue)
 *   LDG-MPIUM3TO  4420  CREDIT     359 ¢  TVQ (non perçue)
 *
 * RÉSULTAT NET APRÈS LES 4 GROUPES :
 *   5200  DR net :  30 000 ¢  (encaissement réel)
 *   4310  CR net :  26 400 ¢  (talent payable, vidé en groupe 2)
 *   4530  CR net :   3 600 ¢  (commission différée, vidée en groupe 2)
 *   4410  net :          0 ¢  (reversal annule l'écriture erronée)
 *   4420  net :          0 ¢  (reversal annule l'écriture erronée)
 *   5100  CR net :  26 400 ¢  (payout Stripe — groupe 2)
 *   7110  CR net :   3 600 ¢  (revenu courtage reconnu — groupe 2)
 *
 * USAGE :
 *   node scripts/reversal-pierre-de-rosette-ledger.js
 *
 * Source : LOI GREFFIER-01 · D-038 · D-064 · audit LedgerRecord_export.csv 2026-05-23
 * ============================================================
 */

'use strict';

require('dotenv').config();

const FinancialLedgerService  = require('../src/services/FinancialLedgerService');
const repositories            = require('../src/repositories');

// ── Références immuables du Groupe 1 erroné ───────────────────
// Ces valeurs sont extraites du LedgerRecord_export.csv.
// Elles ne changent jamais — LOI GREFFIER-01.
const GROUPE_1_ORIGINAL = {
  transactionGroupId: 'TXG-MPIUM30W-0ZN0UV',
  lines: [
    { systemId: 'LDG-MPIUM30X-FJC9U4', account: '5200', direction: 'DEBIT',  amountCents: 30539 },
    { systemId: 'LDG-MPIUM3F2-XJJM7I', account: '4310', direction: 'CREDIT', amountCents: 26400 },
    { systemId: 'LDG-MPIUM3JC-89V0XS', account: '4530', direction: 'CREDIT', amountCents: 3600  },
    { systemId: 'LDG-MPIUM3P5-QXQNDP', account: '4410', direction: 'CREDIT', amountCents: 180   },
    { systemId: 'LDG-MPIUM3TO-YOWNGB', account: '4420', direction: 'CREDIT', amountCents: 359   },
  ],
};

// ── Données de la transaction pilote ──────────────────────────
const PILOT = {
  engagementId:         process.env.PILOT_ENGAGEMENT_ID  || 'ENG-MPIG0BUZ-N084HN',
  eventId:              process.env.PILOT_EVENT_ID       || 'EVT-MPIGOBK2-C0RXZ5',
  currency:             'cad',
  // Valeurs correctes (inchangées — seule l'utilisation de tps/tvq était erronée)
  prixVenduClientCents: 30000,
  commissionMrCents:    3600,
  talentNetCents:       26400,
};

// ── Helpers ───────────────────────────────────────────────────
function section(title) {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`  ${title}`);
  console.log(`${'─'.repeat(60)}`);
}

function ok(msg, data) {
  console.log(`  ✓ ${msg}`);
  if (data) console.log(`    ${JSON.stringify(data)}`);
}

function formatCents(cents) {
  return `${(cents / 100).toFixed(2)}$`;
}

// ══════════════════════════════════════════════════════════════
// GROUPE 3 — Reversal exact de TXG-MPIUM30W-0ZN0UV
// Chaque ligne est l'image miroir de l'originale.
// DEBIT devient CREDIT, CREDIT devient DEBIT. Montants identiques.
// ══════════════════════════════════════════════════════════════
async function writeGroupe3_Reversal() {
  section('Groupe 3 — Reversal de TXG-MPIUM30W-0ZN0UV (LOI GREFFIER-01)');

  console.log('  Contre-passe exacte des 5 lignes originales :');
  for (const line of GROUPE_1_ORIGINAL.lines) {
    const sens = line.direction === 'DEBIT' ? '→ CREDIT' : '→ DEBIT ';
    console.log(`    ${line.systemId}  ${line.account}  ${line.direction} ${sens}  ${formatCents(line.amountCents)}`);
  }

  // Construction des entrées miroir
  const entries = GROUPE_1_ORIGINAL.lines.map((line, i) => ({
    account:     line.account,
    direction:   line.direction === 'DEBIT' ? 'CREDIT' : 'DEBIT',
    amountCents: line.amountCents,
    note:        `Reversal ligne ${i} — original ${line.systemId} (${line.direction} ${formatCents(line.amountCents)})`,
  }));

  const result = await FinancialLedgerService.recordTransaction({
    transactionType: 'reversal_pierre_de_rosette',
    engagementId:    PILOT.engagementId,
    eventId:         PILOT.eventId,
    skuCode:         'SKU-COURTAGE',
    subSkuCode:      'SUB-COURT-DJ',
    currency:        PILOT.currency,
    note:            'Reversal Groupe 1 — correction erreur encaissement + taxes non perçues',
    metadata: {
      pilote:                true,
      reversalOf:            GROUPE_1_ORIGINAL.transactionGroupId,
      reversalReason:        'ENCAISSEMENT_FANTOME_ET_TAXES_NON_PERCUES',
      erreur1:               `5200 écrit à ${GROUPE_1_ORIGINAL.lines[0].amountCents} ¢ au lieu de ${PILOT.prixVenduClientCents} ¢`,
      erreur2:               '4410 (180 ¢) et 4420 (359 ¢) — taxes non perçues (pilote hors Checkout)',
      loi:                   'LOI GREFFIER-01 — append-only, correction par reversal',
      sourceAudit:           'LedgerRecord_export.csv — 2026-05-23',
      originalLines:         GROUPE_1_ORIGINAL.lines.map(l => l.systemId),
    },
    entries,
    repositories,
  });

  ok(`Groupe 3 persisté — TXG: ${result.transactionGroupId}`, {
    lines:    result.lineCount,
    DR:       result.totalDebit,
    CR:       result.totalCredit,
    balanced: result.balanced,
  });

  return result;
}

// ══════════════════════════════════════════════════════════════
// GROUPE 4 — Réimputation correcte
// 3 lignes uniquement : encaissement réel + passifs exacts.
// Pas de 4410/4420 — aucune taxe n'a été perçue sur cette transaction.
// ══════════════════════════════════════════════════════════════
async function writeGroupe4_Reimputation() {
  section('Groupe 4 — Réimputation correcte (encaissement réel 300,00$)');

  console.log('  Waterfall correct :');
  console.log(`    Encaissement réel  : ${formatCents(PILOT.prixVenduClientCents)}  (300,00$ payés par l'organisateur)`);
  console.log(`    Talent payable     : ${formatCents(PILOT.talentNetCents)}`);
  console.log(`    Commission MR      : ${formatCents(PILOT.commissionMrCents)}`);
  console.log(`    TPS/TVQ            : 0,00$ (non perçues — pilote hors Checkout)`);

  // Vérification LOI LEDGER-02 avant persistance
  const checkLedger02 = PILOT.talentNetCents + PILOT.commissionMrCents;
  if (checkLedger02 !== PILOT.prixVenduClientCents) {
    throw new Error(
      `LOI LEDGER-02 VIOLÉE en Groupe 4 : ` +
      `talentNet(${PILOT.talentNetCents}) + commissionMr(${PILOT.commissionMrCents}) ` +
      `= ${checkLedger02} ≠ prixVenduClient(${PILOT.prixVenduClientCents}). ABANDON.`
    );
  }
  ok(`LOI LEDGER-02 : ${PILOT.talentNetCents} + ${PILOT.commissionMrCents} = ${PILOT.prixVenduClientCents} ✓`);

  const entries = [
    {
      account:     '5200',
      direction:   'DEBIT',
      amountCents: PILOT.prixVenduClientCents,
      note:        `Encaissement réel — ${formatCents(PILOT.prixVenduClientCents)} (pilote hors Checkout, sans taxes)`,
    },
    {
      account:     '4310',
      direction:   'CREDIT',
      amountCents: PILOT.talentNetCents,
      note:        `Talent payable DJ Alex — ${formatCents(PILOT.talentNetCents)}`,
    },
    {
      account:     '4530',
      direction:   'CREDIT',
      amountCents: PILOT.commissionMrCents,
      note:        `Commission MR différée (12%) — ${formatCents(PILOT.commissionMrCents)} — LOI LEDGER-01`,
    },
  ];

  const result = await FinancialLedgerService.recordTransaction({
    transactionType: 'retroactive_pierre_de_rosette',
    engagementId:    PILOT.engagementId,
    eventId:         PILOT.eventId,
    skuCode:         'SKU-COURTAGE',
    subSkuCode:      'SUB-COURT-DJ',
    currency:        PILOT.currency,
    note:            'Groupe 4 — Réimputation correcte post-reversal Groupe 3',
    metadata: {
      pilote:             true,
      interventionType:   'CORRECTION_POST_REVERSAL',
      corrigeGroupe:      GROUPE_1_ORIGINAL.transactionGroupId,
      reversalGroupe:     'voir Groupe 3 — transactionGroupId dans le ledger',
      stripeCheckout:     false,
      organizerPayment:   'hors_systeme_pilote',
      taxesPercues:       false,
      raisonSansTaxes:    'Transaction pilote hors Stripe Checkout — aucune taxe facturée au client',
      waterfall: {
        prixVenduClientCents: PILOT.prixVenduClientCents,
        commissionMrCents:    PILOT.commissionMrCents,
        talentNetCents:       PILOT.talentNetCents,
        tpsCents:             0,
        tvqCents:             0,
        stripeFeeCents:       0,
      },
    },
    entries,
    repositories,
  });

  ok(`Groupe 4 persisté — TXG: ${result.transactionGroupId}`, {
    lines:    result.lineCount,
    DR:       result.totalDebit,
    CR:       result.totalCredit,
    balanced: result.balanced,
  });

  return result;
}

// ══════════════════════════════════════════════════════════════
// VÉRIFICATION FINALE — Soldes nets attendus
// ══════════════════════════════════════════════════════════════
function printBilanAttendu(groupe3, groupe4) {
  section('Bilan attendu — Soldes nets sur l\'engagement (4 groupes cumulés)');

  console.log('  Après les 4 groupes, les soldes nets par compte sont :');
  console.log('');
  console.log('    5200  DR net :  30 000 ¢  ← encaissement réel');
  console.log('    4310  net    :       0 ¢  ← créé G1/G4, vidé G2, reversal G3 annule G1');
  console.log('    4530  net    :       0 ¢  ← créé G1/G4, vidé G2, reversal G3 annule G1');
  console.log('    4410  net    :       0 ¢  ← G1 créé 180 ¢, G3 annule 180 ¢');
  console.log('    4420  net    :       0 ¢  ← G1 créé 359 ¢, G3 annule 359 ¢');
  console.log('    5100  CR net :  26 400 ¢  ← payout Stripe G2');
  console.log('    7110  CR net :   3 600 ¢  ← revenu courtage reconnu G2');
  console.log('');
  console.log('  Équation de vérification :');
  console.log('    Actifs (5200 net) = 30 000 ¢');
  console.log('    Passifs + Revenus = 5100 (26 400) + 7110 (3 600) = 30 000 ¢ ✓');
  console.log('');
  console.log(`  Groupe 3 transactionGroupId : ${groupe3.transactionGroupId}`);
  console.log(`  Groupe 4 transactionGroupId : ${groupe4.transactionGroupId}`);
}

// ══════════════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════════════
async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  MICRO RAVE V3 — Reversal Pierre de Rosette              ║');
  console.log('║  LOI GREFFIER-01 — Correction par contre-passation       ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(`\n  Engagement  : ${PILOT.engagementId}`);
  console.log(`  Event       : ${PILOT.eventId}`);
  console.log(`  Reversal de : ${GROUPE_1_ORIGINAL.transactionGroupId}`);
  console.log(`\n  Erreurs corrigées :`);
  console.log(`    1. 5200 était à 30 539 ¢ → correction à 30 000 ¢ (−539 ¢)`);
  console.log(`    2. 4410 (180 ¢) et 4420 (359 ¢) annulées — taxes non perçues`);

  const groupe3 = await writeGroupe3_Reversal();
  const groupe4 = await writeGroupe4_Reimputation();

  printBilanAttendu(groupe3, groupe4);

  console.log('\n' + '═'.repeat(62));
  console.log('  ✓ REVERSAL COMPLÉTÉ — Ledger corrigé selon LOI GREFFIER-01');
  console.log('  Le Groupe 1 original reste immuable dans le ledger (WORM).');
  console.log('  Les Groupes 3 et 4 constituent la piste d\'audit complète.');
  console.log('═'.repeat(62));
  console.log(`\n  LedgerRecords créés : ${groupe3.lineCount + groupe4.lineCount} (5 reversal + 3 réimputation)`);
  console.log(`  Total ledger engagement : 9 originaux + 8 correction = 17 lignes`);
}

main().catch(err => {
  console.error('\n ❌ ERREUR FATALE :', err.message);
  console.error(err.stack);
  process.exit(1);
});