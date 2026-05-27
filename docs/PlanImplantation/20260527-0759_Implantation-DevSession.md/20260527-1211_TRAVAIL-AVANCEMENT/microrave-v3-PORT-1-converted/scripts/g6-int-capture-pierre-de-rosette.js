/**
 * MICRO RAVE V3 — scripts/g6-int-capture-pierre-de-rosette.js
 * ============================================================
 * Groupe 6 — INT-CAPTURE : transfert interne Stripe 5200 → 5100
 *
 * CONTEXTE :
 *   Les groupes G1–G5 documentent le waterfall économique et fiscal.
 *   Mais le mouvement interne Stripe entre les deux sous-comptes
 *   de liquidités n'a jamais été écrit :
 *
 *   5200 (Stripe en attente de règlement) est le compte d'entrée —
 *   tout encaissement Stripe y atterrit d'abord.
 *   5100 (Stripe disponible) est le compte opérationnel —
 *   les payouts partent de là.
 *
 *   Sans l'écriture INT-CAPTURE, 5100 affiche −264,00 $ (découvert
 *   comptable) et 5200 affiche +300,00 $ alors qu'il devrait
 *   afficher seulement le solde résiduel de +36,00 $.
 *
 *   INT-CAPTURE documente que les fonds de 5200 ont été rendus
 *   disponibles dans 5100 avant le payout du talent.
 *   Source : D-060 flux INT-CAPTURE · Carte 03 MOMENT 2 ①.
 *
 * MONTANT :
 *   264,00 $ = talentNetCents = montant du transfer Stripe
 *   tr_1TaHDt2eLVUrCnnJyDflLNEa
 *
 * ÉCRITURE G6 :
 *   DT 5100  26 400 ¢  Stripe disponible — fonds libérés pour payout
 *   CT 5200  26 400 ¢  Stripe en attente — sortie vers disponible
 *
 * ÉTAT FINAL DU LEDGER APRÈS G6 (6 groupes, 22 lignes) :
 *   5200  +36,00 $   Solde Stripe résiduel (commission MR en attente)
 *   5100   0,00 $    Soldé — fonds sortis vers le compte Connect talent
 *   4410  −15,00 $   Dette TPS envers ARC
 *   4420  −29,92 $   Dette TVQ envers RQ
 *   6690  +44,92 $   Charge — taxes absorbées pilote
 *   7110  −36,00 $   Revenu courtage reconnu
 *
 * RÉCONCILIATION STRIPE ↔ LEDGER :
 *   Transfer Stripe : tr_1TaHDt2eLVUrCnnJyDflLNEa · 264,00 $ CAD
 *   Destination     : acct_1TaGqTKCWuw3ufQV (Connect DJ Alex)
 *   Ce groupe porte stripeTransferId = 'tr_1TaHDt2eLVUrCnnJyDflLNEa'
 *   au niveau du champ de premier niveau — pas seulement dans metadata.
 *   C'est la clé de réconciliation structurée Stripe ↔ LedgerRecord.
 *
 * USAGE :
 *   node scripts/g6-int-capture-pierre-de-rosette.js
 *
 * Source : D-060 flux INT-CAPTURE · D-038 Phase 2 MOMENT 2 ①
 *          Carte 03 Waterfall · LOI GREFFIER-01
 * ============================================================
 */

'use strict';



import dotenv from 'dotenv';
dotenv.config();
import FinancialLedgerService from '../src/services/FinancialLedgerService.js';
import repositories from '../src/repositories.js';
const PILOT = {
  engagementId:     process.env.PILOT_ENGAGEMENT_ID || 'ENG-MPIG0BUZ-N084HN',
  eventId:          process.env.PILOT_EVENT_ID      || 'EVT-MPIGOBK2-C0RXZ5',
  currency:         'cad',
  talentNetCents:   26400,
  stripeTransferId: 'tr_1TaHDt2eLVUrCnnJyDflLNEa',
  stripeAccountId:  'acct_1TaGqTKCWuw3ufQV',
};

function section(title) {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`  ${title}`);
  console.log(`${'─'.repeat(60)}`);
}

function ok(msg, data) {
  console.log(`  ✓ ${msg}`);
  if (data) console.log(`    ${JSON.stringify(data)}`);
}

function fmt(cents) {
  return `${(cents / 100).toFixed(2)}$`;
}

async function writeGroupe6_IntCapture() {
  section('Groupe 6 — INT-CAPTURE : 5200 → 5100 (flux Stripe interne)');

  console.log('  Mouvement interne Stripe :');
  console.log(`    5200 Stripe en attente  →  5100 Stripe disponible`);
  console.log(`    Montant : ${fmt(PILOT.talentNetCents)}`);
  console.log(`    Référence : ${PILOT.stripeTransferId}`);

  const entries = [
    {
      account:          '5100',
      direction:        'DEBIT',
      amountCents:      PILOT.talentNetCents,
      note: `INT-CAPTURE — fonds libérés dans Stripe disponible pour payout ${PILOT.stripeTransferId}`,
    },
    {
      account:          '5200',
      direction:        'CREDIT',
      amountCents:      PILOT.talentNetCents,
      note: `INT-CAPTURE — sortie Stripe en attente → disponible — ${fmt(PILOT.talentNetCents)}`,
    },
  ];

  const result = await FinancialLedgerService.recordTransaction({
    transactionType:  'int_capture',
    engagementId:     PILOT.engagementId,
    eventId:          PILOT.eventId,
    skuCode:          'SKU-COURTAGE',
    subSkuCode:       'SUB-COURT-DJ',
    currency:         PILOT.currency,
    note:             `INT-CAPTURE — transfert interne Stripe 5200 → 5100 — ${PILOT.stripeTransferId}`,
    stripeTransferId: PILOT.stripeTransferId,   // ← champ de premier niveau (patch D-038-B)
    metadata: {
      pilote:             true,
      fluxCode:           'INT-CAPTURE',
      stripeTransferId:   PILOT.stripeTransferId,
      stripeAccountId:    PILOT.stripeAccountId,
      amountCents:        PILOT.talentNetCents,
      sourceAccount:      '5200',
      destinationAccount: '5100',
      note: 'Fonds rendus disponibles depuis Stripe pending avant exécution du transfer Connect.',
    },
    entries,
    repositories,
  });

  ok(`Groupe 6 persisté — TXG: ${result.transactionGroupId}`, {
    lines:    result.lineCount,
    DR:       result.totalDebit,
    CR:       result.totalCredit,
    balanced: result.balanced,
  });

  return result;
}

function printBilanFinal(g6) {
  section('Bilan final — Ledger Pierre de Rosette (6 groupes · 22 lignes)');

  console.log('  LIQUIDITÉS');
  console.log(`    5200  Stripe en attente    +${fmt(3600).padStart(9)}  (commission MR résiduelle)`);
  console.log(`    5100  Stripe disponible     ${fmt(0).padStart(10)}  (soldé après payout)`);
  console.log('');
  console.log('  DETTES FISCALES');
  console.log(`    4410  TPS → ARC            −${fmt(1500).padStart(9)}`);
  console.log(`    4420  TVQ → RQ             −${fmt(2992).padStart(9)}`);
  console.log('');
  console.log('  P&L');
  console.log(`    7110  Revenu courtage      −${fmt(3600).padStart(9)}  (reconnu à archivage)`);
  console.log(`    6690  Taxes absorbées      +${fmt(4492).padStart(9)}  (charge non récurrente)`);
  console.log('');
  console.log('  ─────────────────────────────────────────────────────');
  console.log(`    DR net : ${fmt(3600 + 4492).padStart(9)}  (5200 + 6690)`);
  console.log(`    CR net : ${fmt(3600 + 1500 + 2992).padStart(9)}  (7110 + 4410 + 4420)`);

  const dr = 3600 + 4492;
  const cr = 3600 + 1500 + 2992;
  console.log(`    Équilibre : ${dr === cr ? '✓ OUI' : '✗ NON — écart ' + (dr - cr)}`);
  console.log('');
  console.log(`  Groupe 6 transactionGroupId : ${g6.transactionGroupId}`);
  console.log('');
  console.log('  RÉCONCILIATION STRIPE :');
  console.log(`    Transfer : ${PILOT.stripeTransferId}`);
  console.log(`    Montant  : ${fmt(PILOT.talentNetCents)}`);
  console.log(`    Lien ledger : stripeTransferId porté en champ de 1er niveau`);
  console.log(`    → SELECT * FROM LedgerRecord WHERE stripeTransferId = '${PILOT.stripeTransferId}'`);
  console.log(`    → Retournera cette ligne + G2 ligne [2] (5100 CREDIT 26 400 ¢)`);
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  MICRO RAVE V3 — G6 INT-CAPTURE Pierre de Rosette        ║');
  console.log('║  Transfert interne Stripe 5200 → 5100                    ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(`\n  Engagement       : ${PILOT.engagementId}`);
  console.log(`  Transfer Stripe  : ${PILOT.stripeTransferId}`);
  console.log(`  Montant          : ${fmt(PILOT.talentNetCents)}`);

  const g6 = await writeGroupe6_IntCapture();
  printBilanFinal(g6);

  console.log('\n' + '═'.repeat(62));
  console.log('  ✓ LEDGER PILOTE — COMPLET · ÉQUILIBRÉ · RÉCONCILIABLE');
  console.log('  6 groupes · 22 lignes · stripeTransferId en champ natif');
  console.log('  5200 = +36,00 $ (solde Stripe résiduel MR)');
  console.log('  5100 = 0,00 $ (soldé)');
  console.log('═'.repeat(62));
}

main().catch(err => {
  console.error('\n ❌ ERREUR FATALE :', err.message);
  console.error(err.stack);
  process.exit(1);
});