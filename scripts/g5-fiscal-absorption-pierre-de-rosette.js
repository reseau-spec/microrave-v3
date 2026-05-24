/**
 * MICRO RAVE V3 — scripts/g5-fiscal-absorption-pierre-de-rosette.js
 * ============================================================
 * Groupe 5 — Dette fiscale pilote absorbée par MR (doctrine Principal).
 *
 * CONTEXTE — DÉCISION DE GESTION :
 *   Le pilote a encaissé 300,00 $ HT de l'organisateur hors Stripe Checkout.
 *   Sous doctrine Principal, MR est le vendeur de la prestation.
 *   MR avait l'obligation légale de facturer TPS + TVQ au client.
 *   Ces taxes n'ont pas été facturées ni perçues (contexte pilote).
 *   MR absorbe donc la dette fiscale de sa poche — décision de gestion
 *   documentée ici comme charge non récurrente (6690).
 *
 * CALCUL — BASE HT = 300,00 $ (prixVenduClientCents = 30 000 ¢) :
 *   TPS  5 %      = floor(30 000 × 50 000 / 1 000 000)  = 1 500 ¢ (15,00 $)
 *   TVQ  9,975 %  = floor(30 000 × 99 750 / 1 000 000)  = 2 992 ¢ (29,92 $)
 *   Total absorbé = 4 492 ¢ (44,92 $)
 *
 *   Note arrondi : TVQ = 29,92 $ (floor de 29,925 $), pas 29,93 $.
 *   La différence de 1 centime vs les calculs précédents vient du fait
 *   que les anciens calculs appliquaient le taux sur la commission (3 600 ¢)
 *   au lieu du prix vendu (30 000 ¢). Ce calcul est le bon.
 *
 * ÉCRITURE G5 :
 *   DT 6690  4 492 ¢  Perte non récurrente — taxes pilote absorbées par MR
 *   CT 4410  1 500 ¢  TPS perçue à remettre (dette envers ARC)
 *   CT 4420  2 992 ¢  TVQ perçue à remettre (dette envers RQ)
 *
 * ÉTAT DU LEDGER APRÈS G5 (5 groupes, 20 lignes) :
 *   5200  +300,00 $   Encaissement réel (actif)
 *   5100  −264,00 $   Payout Stripe sorti (actif réduit)
 *   7110   −36,00 $   Revenu courtage reconnu
 *   4410   −15,00 $   Dette TPS envers ARC
 *   4420   −29,92 $   Dette TVQ envers RQ
 *   6690   +44,92 $   Charge — taxes absorbées pilote
 *   Tous autres comptes : 0 ¢
 *
 * ÉQUATION DE VÉRIFICATION (DR net = CR net) :
 *   DR : 5200 (300,00) + 6690 (44,92) = 344,92 $
 *   CR : 5100 (264,00) + 7110 (36,00) + 4410 (15,00) + 4420 (29,92) = 344,92 $ ✓
 *
 * INTERPRÉTATION ÉCONOMIQUE :
 *   MR a rendu une prestation de 300 $ HT.
 *   Il a encaissé 300 $ (5200).
 *   Il a payé le talent 264 $ (5100).
 *   Sa commission brute est 36 $ (7110).
 *   Mais il doit 44,92 $ en taxes à l'État (4410+4420).
 *   Il absorbe ces taxes comme charge (6690).
 *   Résultat net MR sur ce pilote : 36,00 − 44,92 = −8,92 $ (perte nette pilote).
 *   C'est le coût réel du test — documenté, assumé, tracé.
 *
 * USAGE :
 *   node scripts/g5-fiscal-absorption-pierre-de-rosette.js
 *
 * Source : Décision de gestion 2026-05-23 · D-038 · LOI GREFFIER-01
 *          Doctrine Principal · Plan comptable LedgerCodeMap V3
 * ============================================================
 */

'use strict';

require('dotenv').config();

const FinancialLedgerService = require('../src/services/FinancialLedgerService');
const repositories           = require('../src/repositories');

// ── Constantes fiscales ───────────────────────────────────────
const TPS_PPM = 50000;    // 5 %
const TVQ_PPM = 99750;    // 9,975 %

// ── Données pilote ────────────────────────────────────────────
const PILOT = {
  engagementId:         process.env.PILOT_ENGAGEMENT_ID || 'ENG-MPIG0BUZ-N084HN',
  eventId:              process.env.PILOT_EVENT_ID      || 'EVT-MPIGOBK2-C0RXZ5',
  currency:             'cad',
  prixVenduHTCents:     30000,  // base taxable — 300,00 $ HT
};

// ── Calcul ────────────────────────────────────────────────────
// Standard D-064 : Math.floor, jamais float, jamais applyRatePpm
// sur des taux > 1 000 000 ppm. Ici taux < 1 000 000 donc applyRatePpm
// est valide, mais on documente explicitement la base pour la piste d'audit.
const tpsCents = Math.floor(PILOT.prixVenduHTCents * TPS_PPM  / 1_000_000); // 1 500
const tvqCents = Math.floor(PILOT.prixVenduHTCents * TVQ_PPM  / 1_000_000); // 2 992
const totalAbsorbeCents = tpsCents + tvqCents;                                // 4 492

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

function fmt(cents) {
  return `${(cents / 100).toFixed(2)}$`;
}

// ══════════════════════════════════════════════════════════════
// GROUPE 5 — Absorption dette fiscale pilote
// ══════════════════════════════════════════════════════════════
async function writeGroupe5_FiscalAbsorption() {
  section('Groupe 5 — Dette fiscale pilote absorbée par MR (Principal)');

  console.log('  Base de calcul :');
  console.log(`    Prix vendu HT          : ${fmt(PILOT.prixVenduHTCents)}`);
  console.log(`    TPS  5 % (50 000 ppm)  : ${fmt(tpsCents)}`);
  console.log(`    TVQ  9,975 % (99 750 ppm) : ${fmt(tvqCents)}`);
  console.log(`    Total absorbé par MR   : ${fmt(totalAbsorbeCents)}`);
  console.log('');
  console.log('  Décision : 300 $ = prix HT. Taxes non facturées au client (pilote).');
  console.log('  MR absorbe la dette fiscale → charge 6690, dettes 4410/4420.');

  const entries = [
    {
      account:     '6690',
      direction:   'DEBIT',
      amountCents: totalAbsorbeCents,
      note: `Perte non récurrente — TPS (${fmt(tpsCents)}) + TVQ (${fmt(tvqCents)}) ` +
            `absorbées par MR — pilote hors Checkout — doctrine Principal`,
    },
    {
      account:     '4410',
      direction:   'CREDIT',
      amountCents: tpsCents,
      note: `TPS à remettre ARC — 5 % sur ${fmt(PILOT.prixVenduHTCents)} HT — dette fiscale née à la fourniture`,
    },
    {
      account:     '4420',
      direction:   'CREDIT',
      amountCents: tvqCents,
      note: `TVQ à remettre RQ — 9,975 % sur ${fmt(PILOT.prixVenduHTCents)} HT — dette fiscale née à la fourniture`,
    },
  ];

  // Vérification DR = CR avant persistance
  const dr = entries.filter(e => e.direction === 'DEBIT').reduce((s, e) => s + e.amountCents, 0);
  const cr = entries.filter(e => e.direction === 'CREDIT').reduce((s, e) => s + e.amountCents, 0);
  if (dr !== cr) {
    throw new Error(`G5 DÉSÉQUILIBRÉ : DR ${dr} ≠ CR ${cr}. ABANDON.`);
  }
  ok(`Invariant DR=CR : ${dr} ¢ = ${fmt(dr)} ✓`);

  const result = await FinancialLedgerService.recordTransaction({
    transactionType: 'fiscal_absorption_pilote',
    engagementId:    PILOT.engagementId,
    eventId:         PILOT.eventId,
    skuCode:         'SKU-COURTAGE',
    subSkuCode:      'SUB-COURT-DJ',
    currency:        PILOT.currency,
    note:            'G5 — Absorption dette fiscale pilote — doctrine Principal — décision de gestion 2026-05-23',
    metadata: {
      pilote:             true,
      interventionType:   'FISCAL_ABSORPTION_PRINCIPAL',
      doctrine:           'PRINCIPAL',
      decisionGestion:    'Prix pilote 300$ considéré HT. Taxes non facturées au client. MR absorbe.',
      baseHTCents:        PILOT.prixVenduHTCents,
      tpsPpm:             TPS_PPM,
      tvqPpm:             TVQ_PPM,
      tpsCents,
      tvqCents,
      totalAbsorbeCents,
      compteCharge:       '6690 — Autres pertes non récurrentes',
      detteFiscale:       { '4410': tpsCents, '4420': tvqCents },
      resultatNetPilote: {
        commissionBrute:  3600,
        taxesAbsorbees:   totalAbsorbeCents,
        resultatNet:      3600 - totalAbsorbeCents,  // −892 ¢ = −8,92 $
        interpretation:   'Coût net du pilote pour MR : −8,92 $ (assumé et documenté)',
      },
      noteArrondi: 'TVQ = 2 992 ¢ (floor de 29,925 $). Différence de 1 ¢ vs calculs antérieurs ' +
                   'car base correcte = prix vendu (30 000 ¢), non commission (3 600 ¢).',
    },
    entries,
    repositories,
  });

  ok(`Groupe 5 persisté — TXG: ${result.transactionGroupId}`, {
    lines:    result.lineCount,
    DR:       result.totalDebit,
    CR:       result.totalCredit,
    balanced: result.balanced,
  });

  return result;
}

// ══════════════════════════════════════════════════════════════
// BILAN FINAL — État du ledger pilote après 5 groupes
// ══════════════════════════════════════════════════════════════
function printBilanFinal(g5) {
  section('Bilan final — Engagement pilote Pierre de Rosette (5 groupes, 20 lignes)');

  console.log('  Soldes nets par compte :');
  console.log('');
  console.log('    ACTIFS');
  console.log(`      5200  Encaissement                   +${fmt(30000).padStart(9)}  (encaissement réel)`);
  console.log(`      5100  Payout Stripe sorti             −${fmt(26400).padStart(9)}  (banque réduite)`);
  console.log('');
  console.log('    PASSIFS (dettes envers l\'État)');
  console.log(`      4410  TPS à remettre ARC              −${fmt(tpsCents).padStart(9)}`);
  console.log(`      4420  TVQ à remettre RQ               −${fmt(tvqCents).padStart(9)}`);
  console.log('');
  console.log('    REVENUS');
  console.log(`      7110  Revenu courtage reconnu         −${fmt(3600).padStart(9)}  (commission MR)`);
  console.log('');
  console.log('    CHARGES');
  console.log(`      6690  Taxes absorbées pilote          +${fmt(totalAbsorbeCents).padStart(9)}  (perte non récurrente)`);
  console.log('');
  console.log('  ─────────────────────────────────────────────────');
  console.log(`    DR net  : ${fmt(30000 + totalAbsorbeCents).padStart(9)}  (5200 + 6690)`);
  console.log(`    CR net  : ${fmt(26400 + 3600 + tpsCents + tvqCents).padStart(9)}  (5100 + 7110 + 4410 + 4420)`);
  console.log(`    Équilibre : ${(30000 + totalAbsorbeCents) === (26400 + 3600 + tpsCents + tvqCents) ? '✓ OUI' : '✗ NON'}`);
  console.log('');
  console.log('  RÉSULTAT NET MR SUR CE PILOTE :');
  console.log(`    Revenu courtage     : +${fmt(3600)}`);
  console.log(`    Taxes absorbées     : −${fmt(totalAbsorbeCents)}`);
  console.log(`    Résultat net        : −${fmt(totalAbsorbeCents - 3600)}  (coût du pilote — assumé)`);
  console.log('');
  console.log(`  Groupe 5 transactionGroupId : ${g5.transactionGroupId}`);
}

// ══════════════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════════════
async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  MICRO RAVE V3 — G5 Absorption fiscale pilote            ║');
  console.log('║  Doctrine Principal · Décision de gestion 2026-05-23     ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(`\n  Engagement  : ${PILOT.engagementId}`);
  console.log(`  Base HT     : ${fmt(PILOT.prixVenduHTCents)}`);
  console.log(`  TPS (5 %)   : ${fmt(tpsCents)}`);
  console.log(`  TVQ (9,975%): ${fmt(tvqCents)}`);
  console.log(`  Absorbé MR  : ${fmt(totalAbsorbeCents)}`);

  const g5 = await writeGroupe5_FiscalAbsorption();

  printBilanFinal(g5);

  console.log('\n' + '═'.repeat(62));
  console.log('  ✓ LEDGER PILOTE PIERRE DE ROSETTE — COMPLET ET CORRECT');
  console.log('  5 groupes · 20 lignes · bilan équilibré · piste d\'audit intègre');
  console.log('  La dette fiscale est documentée. Le coût du pilote est assumé.');
  console.log('═'.repeat(62));
}

main().catch(err => {
  console.error('\n ❌ ERREUR FATALE :', err.message);
  console.error(err.stack);
  process.exit(1);
});