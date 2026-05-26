/**
 * scripts/write-stripe-fees-ENG-H5V66Q.js
 * ============================================================
 * Régularise les 19,10 $ de frais Stripe non gravés lors du
 * cycle pilote E2E ENG-H5V66Q-WBJ7N2.
 *
 * CONTEXTE :
 *   stripeWebhookHandler v4 enregistre le montant BRUT dans
 *   5200 (500,00 $) mais pas les frais Stripe (19,10 $).
 *   Résultat : 5200 est surévalué de 19,10 $ vs le net réel
 *   disponible dans Stripe (480,90 $).
 *
 *   Stripe balance history (26 mai 2026) :
 *     Dépôt 100$ → fee 4,00$ → net  96,00$
 *     Balance 400$ → fee 15,10$ → net 384,90$
 *     Total : 19,10$ de fees non écrits
 *
 *   Doctrine PolicyConfig : payment_fees_tax_treatment = DEBOURS
 *   → les frais Stripe sont un déboursé, pas de récupération
 *   TPS/TVQ d'intrant.
 *
 * DÉCISION FRÉDÉRIK (26 mai 2026) :
 *   Option 1 — régulariser maintenant en append-only pour
 *   avoir un ledger pilote parfait.
 *
 * ÉCRITURES (D-038, LedgerCodeMap 4190/6110) :
 *
 *   TXG-FEES-CORR-H5V66Q-WBJ7N2 :
 *     4190 DR  19,10 $   BILAN   null     regularisation
 *     5200 CR  19,10 $   FLUX    ENC-CORR regularisation
 *     → corrige la surévaluation de 5200 (brut → net réel)
 *     → crée l'actif différé 4190 pour tracer les frais
 *
 *   TXG-FEES-EXP-H5V66Q-WBJ7N2 :
 *     6110 DR  19,10 $   RESULTAT null    regularisation
 *     4190 CR  19,10 $   BILAN    null    regularisation
 *     → reconnaît les frais Stripe en charge (compte 6110)
 *     → éteint l'actif différé 4190
 *
 * EFFET NET :
 *   5200 : −19,10 $ → 480,90 $ (net Stripe réel)
 *   4190 :   0,00 $ (créé puis immédiatement éteint)
 *   6110 : +19,10 $ (charge Stripe reconnue)
 *
 * INVARIANTS :
 *   LOI LEDGER-02 : DR = CR = 1 910 ¢ par TXG ✓
 *   LOI GREFFIER-01 : append-only ✓
 *   Market Pivot V3 : comptes depuis PolicyConfig ✓
 *
 * USAGE :
 *   node scripts/write-stripe-fees-ENG-H5V66Q.js --dry-run
 *   node scripts/write-stripe-fees-ENG-H5V66Q.js
 *
 * Source : D-038, LedgerCodeMap (4190, 6110), PolicyConfig
 * ============================================================
 */
'use strict';
require('dotenv').config();

const BASE44_BASE_URL = 'https://futuristic-rave-core-flow.base44.app/api';
const DRY_RUN = process.argv.includes('--dry-run');

// ── Cible exacte — frais réels confirmés par Stripe balance CSV ─
const TARGET = {
  engagementId:    'ENG-H5V66Q-WBJ7N2',
  eventId:         'EVT-8SMQ5D-2UMA6W',
  stripeFeeCents:  1910,           // 4,00 + 15,10 = 19,10 $
  skuCode:         'SKU-COURTAGE',
  subSkuCode:      'SUB-COURT-FEE',
  txgCorr:         'TXG-FEES-CORR-H5V66Q-WBJ7N2',
  txgExp:          'TXG-FEES-EXP-H5V66Q-WBJ7N2',
  // Détail frais par transaction Stripe (audit)
  feeDetail: [
    { stripeId: 'txn_3TbIRu2eLVUrCnnJ1Krb5WoA', phase: 'depot',   gross: 10000, fee: 400 },
    { stripeId: 'txn_3TbJ2w2eLVUrCnnJ0E4zvEOC', phase: 'balance', gross: 40000, fee: 1510 },
  ],
};

function headers() {
  const k = process.env.BASE44_API_KEY;
  if (!k) throw new Error('BASE44_API_KEY absent');
  return { 'Content-Type': 'application/json', 'api_key': k };
}
async function get(path) {
  const r = await fetch(`${BASE44_BASE_URL}${path}`, { headers: headers() });
  if (!r.ok) throw new Error(`GET ${path} → ${r.status}`);
  const j = await r.json();
  return Array.isArray(j) ? j : (j.data || j);
}
async function post(path, data) {
  const r = await fetch(`${BASE44_BASE_URL}${path}`, {
    method: 'POST', headers: headers(), body: JSON.stringify(data),
  });
  if (!r.ok) { const b = await r.text(); throw new Error(`POST ${path} → ${r.status}: ${b}`); }
  return r.json();
}
function generateId(prefix) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const s1 = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  const s2 = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `${prefix}-${s1}-${s2}`;
}
async function loadOrSeedPolicyKey(key, defaultValue, description) {
  const q = encodeURIComponent(JSON.stringify({ key }));
  const records = await get(`/entities/PolicyConfig?q=${q}`);
  if (records?.length && records[0].value) {
    return records[0].value;
  }
  console.log(`  ⚠ PolicyConfig manquant : ${key} — ajout = ${defaultValue}`);
  if (!DRY_RUN) {
    await post('/entities/PolicyConfig', { key, value: defaultValue, category: 'OPERATIONNEL', description });
  }
  return defaultValue;
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║  Régularisation frais Stripe ENG-H5V66Q (19,10 $)       ║');
  console.log(`║  Mode : ${DRY_RUN ? 'DRY-RUN                                  ' : 'LIVE — écriture en base                  '}║`);
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log();

  // ── Charger les comptes depuis PolicyConfig ───────────────
  const account4190 = await loadOrSeedPolicyKey(
    'ledger_account_stripe_fees_deferred', '4190',
    'Compte 4190 — Frais Stripe différés (événements non complétés). ACTIF_COURANT. Éteint à archivage via 6110.'
  );
  const account5200 = await loadOrSeedPolicyKey(
    'ledger_account_encaissement', '5200',
    'Compte 5200 — Stripe en attente de règlement.'
  );
  const account6110 = await loadOrSeedPolicyKey(
    'ledger_account_stripe_fees_expense', '6110',
    'Compte 6110 — Frais Stripe courtage (CHARGE_VENTE). Reconnus à archivage depuis 4190.'
  );
  console.log(`✓ 4190 → ${account4190} (frais Stripe différés)`);
  console.log(`✓ 5200 → ${account5200} (Stripe en attente)`);
  console.log(`✓ 6110 → ${account6110} (charge Stripe)`);
  console.log();

  // ── Idempotence ───────────────────────────────────────────
  const allLedger = await get('/entities/LedgerRecord?sort=created_date&limit=500');
  const existingCorr = (allLedger || []).find(r => r.transactionGroupId === TARGET.txgCorr);
  const existingExp  = (allLedger || []).find(r => r.transactionGroupId === TARGET.txgExp);
  if (existingCorr && existingExp) {
    console.log('⊙ TXG-FEES-CORR et TXG-FEES-EXP déjà présents — skip.');
    return;
  }

  // ── Afficher le détail des frais Stripe ──────────────────
  console.log('Détail frais Stripe (source : balance_history_34.csv) :');
  let totalFee = 0;
  for (const t of TARGET.feeDetail) {
    console.log(`  ${t.stripeId}  phase=${t.phase}  gross=${(t.gross/100).toFixed(2)}$  fee=${(t.fee/100).toFixed(2)}$  net=${((t.gross-t.fee)/100).toFixed(2)}$`);
    totalFee += t.fee;
  }
  console.log(`  Total fees : ${(totalFee/100).toFixed(2)}$`);
  if (totalFee !== TARGET.stripeFeeCents) {
    throw new Error(`Incohérence : sum(feeDetail)=${totalFee}¢ ≠ stripeFeeCents=${TARGET.stripeFeeCents}¢`);
  }
  console.log();

  const now = new Date().toISOString();
  const metadata = JSON.stringify({
    piloteEvent:   'Event-0B',
    decision:      'Frédérik Gélin, 26 mai 2026 — Option 1: régularisation append-only',
    stripeDetails: TARGET.feeDetail,
    doctrine:      'payment_fees_tax_treatment=DEBOURS, LedgerCodeMap 4190/6110',
  });

  // ══════════════════════════════════════════════════════════
  // TXG 1 : correction surévaluation 5200 → activation 4190
  // ══════════════════════════════════════════════════════════
  if (!existingCorr) {
    const dr1 = TARGET.stripeFeeCents;
    const cr1 = TARGET.stripeFeeCents;
    if (dr1 !== cr1) throw new Error(`LOI_LEDGER_02 TXG1: DR=${dr1} CR=${cr1}`);

    const entries1 = [
      {
        systemId:           generateId('LDG'),
        transactionGroupId: TARGET.txgCorr,
        transactionType:    'regularisation_stripe_fees',
        economicEvent:      'regularisation',
        financialStatement: 'BILAN',
        flowCode:           null,
        lineIndex:          0,
        engagementId:       TARGET.engagementId,
        eventId:            TARGET.eventId,
        skuCode:            TARGET.skuCode,
        subSkuCode:         TARGET.subSkuCode,
        account:            account4190,
        direction:          'DEBIT',
        amountCents:        TARGET.stripeFeeCents,
        currency:           'cad',
        reconciliationKey:  `stripe-fees:${TARGET.engagementId}`,
        note:               `Frais Stripe différés — 4,00$+15,10$=19,10$ prélevés par Stripe non gravés à l'encaissement. Correction pilote.`,
        metadata,
        createdAt:          now,
      },
      {
        systemId:           generateId('LDG'),
        transactionGroupId: TARGET.txgCorr,
        transactionType:    'regularisation_stripe_fees',
        economicEvent:      'regularisation',
        financialStatement: 'FLUX',
        flowCode:           'ENC-CORR',
        lineIndex:          1,
        engagementId:       TARGET.engagementId,
        eventId:            TARGET.eventId,
        skuCode:            TARGET.skuCode,
        subSkuCode:         TARGET.subSkuCode,
        account:            account5200,
        direction:          'CREDIT',
        amountCents:        TARGET.stripeFeeCents,
        currency:           'cad',
        reconciliationKey:  `stripe-fees:${TARGET.engagementId}`,
        note:               `Correction 5200 surévalué — ramène Stripe en attente de 500,00$ à 480,90$ (net réel).`,
        metadata,
        createdAt:          now,
      },
    ];

    console.log(`TXG 1 : ${TARGET.txgCorr}`);
    console.log(`  Ligne 0 : ${account4190} DEBIT  ${(TARGET.stripeFeeCents/100).toFixed(2)}$ (frais différés)`);
    console.log(`  Ligne 1 : ${account5200} CREDIT ${(TARGET.stripeFeeCents/100).toFixed(2)}$ (correction suréval)`);

    if (!DRY_RUN) {
      for (const e of entries1) {
        await post('/entities/LedgerRecord', e);
        console.log(`  ✓ ${e.systemId} (${e.account} ${e.direction})`);
      }
    }
    console.log();
  } else {
    console.log(`⊙ ${TARGET.txgCorr} déjà présent, skip.`);
  }

  // ══════════════════════════════════════════════════════════
  // TXG 2 : reconnaissance frais en charge (6110) + extinction 4190
  // ══════════════════════════════════════════════════════════
  if (!existingExp) {
    const dr2 = TARGET.stripeFeeCents;
    const cr2 = TARGET.stripeFeeCents;
    if (dr2 !== cr2) throw new Error(`LOI_LEDGER_02 TXG2: DR=${dr2} CR=${cr2}`);

    const entries2 = [
      {
        systemId:           generateId('LDG'),
        transactionGroupId: TARGET.txgExp,
        transactionType:    'regularisation_stripe_fees',
        economicEvent:      'regularisation',
        financialStatement: 'RESULTAT',
        flowCode:           null,
        lineIndex:          0,
        engagementId:       TARGET.engagementId,
        eventId:            TARGET.eventId,
        skuCode:            TARGET.skuCode,
        subSkuCode:         TARGET.subSkuCode,
        account:            account6110,
        direction:          'DEBIT',
        amountCents:        TARGET.stripeFeeCents,
        currency:           'cad',
        reconciliationKey:  `stripe-fees:${TARGET.engagementId}`,
        note:               `Frais Stripe reconnus en charge — 2,9% sur 500$ + 0,30$ × 2 = 19,10$ (doctrine DEBOURS).`,
        metadata,
        createdAt:          now,
      },
      {
        systemId:           generateId('LDG'),
        transactionGroupId: TARGET.txgExp,
        transactionType:    'regularisation_stripe_fees',
        economicEvent:      'regularisation',
        financialStatement: 'BILAN',
        flowCode:           null,
        lineIndex:          1,
        engagementId:       TARGET.engagementId,
        eventId:            TARGET.eventId,
        skuCode:            TARGET.skuCode,
        subSkuCode:         TARGET.subSkuCode,
        account:            account4190,
        direction:          'CREDIT',
        amountCents:        TARGET.stripeFeeCents,
        currency:           'cad',
        reconciliationKey:  `stripe-fees:${TARGET.engagementId}`,
        note:               `Extinction frais Stripe différés 4190 → charge 6110 reconnue.`,
        metadata,
        createdAt:          now,
      },
    ];

    console.log(`TXG 2 : ${TARGET.txgExp}`);
    console.log(`  Ligne 0 : ${account6110} DEBIT  ${(TARGET.stripeFeeCents/100).toFixed(2)}$ (charge Stripe)`);
    console.log(`  Ligne 1 : ${account4190} CREDIT ${(TARGET.stripeFeeCents/100).toFixed(2)}$ (extinction 4190)`);

    if (!DRY_RUN) {
      for (const e of entries2) {
        await post('/entities/LedgerRecord', e);
        console.log(`  ✓ ${e.systemId} (${e.account} ${e.direction})`);
      }
    }
    console.log();
  } else {
    console.log(`⊙ ${TARGET.txgExp} déjà présent, skip.`);
  }

  if (DRY_RUN) {
    console.log('ℹ DRY-RUN. Relancer sans --dry-run pour écrire en base.');
    return;
  }

  console.log('═'.repeat(58));
  console.log('✓ Régularisation frais Stripe terminée.');
  console.log('\nVérification attendue :');
  console.log(`  5200 : 500,00 − 19,10 = 480,90 $ (net Stripe réel)`);
  console.log(`  4190 :   0,00 $ (créé puis éteint dans la même session)`);
  console.log(`  6110 : +19,10 $ (charge Stripe dans le P&L)`);
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });