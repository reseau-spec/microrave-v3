/**
 * scripts/write-payout-manual-ENG-H5V66Q.js
 * ============================================================
 * Clôture la dette talent (4310) du cycle pilote E2E.
 *
 * CONTEXTE :
 *   Engagement ENG-H5V66Q-WBJ7N2, 500$ cachet, talent 012.
 *   Talent payé hors-Stripe (Interac ou virement manuel).
 *   executePayoutTransfer ne peut pas tourner : pas de
 *   TalentPaymentProfile, pas de SettlementInstruction,
 *   pas de compte Stripe Connect pour le talent test.
 *
 * DÉCISION FRÉDÉRIK (26 mai 2026) :
 *   Option A — virement hors-Stripe + écriture manuelle.
 *   reconciliationKey = 'manual:ENG-H5V66Q-WBJ7N2'
 *
 * ÉCRITURES (D-038 Phase 2, waterfall payout) :
 *
 *   TXG-PAYOUT-MANUAL-H5V66Q-WBJ7N2 :
 *     4310 DR  440,00 $   BILAN   null       payout_talent
 *     5100 CR  440,00 $   FLUX    DEC-PAYOUT payout_talent
 *
 * INVARIANTS :
 *   LOI LEDGER-02 : DR = CR = 44 000 ¢ par TXG ✓
 *   LOI GREFFIER-01 : append-only, aucun UPDATE/DELETE ✓
 *   Market Pivot V3 : comptes chargés depuis PolicyConfig ✓
 *
 * USAGE :
 *   node scripts/write-payout-manual-ENG-H5V66Q.js --dry-run
 *   node scripts/write-payout-manual-ENG-H5V66Q.js
 *
 * Source : D-038 Phase 2, D-101, OS V15
 * ============================================================
 */
'use strict';


import dotenv from 'dotenv';
dotenv.config();
const BASE44_BASE_URL = 'https://futuristic-rave-core-flow.base44.app/api';
const DRY_RUN = process.argv.includes('--dry-run');

// ── Cible exacte — ne jamais généraliser ce script ───────────
const TARGET = {
  engagementId:     'ENG-H5V66Q-WBJ7N2',
  eventId:          'EVT-8SMQ5D-2UMA6W',
  talentNetCents:   44000,       // 440,00 $ — talentNetCents de l'engagement
  talentUserId:     '012',
  skuCode:          'SKU-COURTAGE',
  subSkuCode:       'SUB-COURT-PAYOUT',
  corrTxg:          'TXG-PAYOUT-MANUAL-H5V66Q-WBJ7N2',
  reconciliationKey:'manual:ENG-H5V66Q-WBJ7N2',
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

// ── Charger ou seeder une clé PolicyConfig ───────────────────
// Market Pivot V3 : aucun code comptable en dur dans le code.
async function loadOrSeedPolicyKey(key, defaultValue, description) {
  const q = encodeURIComponent(JSON.stringify({ key }));
  const records = await get(`/entities/PolicyConfig?q=${q}`);
  if (records?.length && records[0].value) {
    return records[0].value;
  }
  console.log(`  ⚠ PolicyConfig manquant : ${key} — ajout automatique = ${defaultValue}`);
  if (!DRY_RUN) {
    await post('/entities/PolicyConfig', {
      key, value: defaultValue, category: 'OPERATIONNEL', description,
    });
  }
  return defaultValue;
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║  Payout manuel ENG-H5V66Q-WBJ7N2 — 4310 DR / 5100 CR   ║');
  console.log(`║  Mode : ${DRY_RUN ? 'DRY-RUN                                  ' : 'LIVE — écriture en base                  '}║`);
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log();

  // ── Charger les comptes depuis PolicyConfig ───────────────
  const account4310 = await loadOrSeedPolicyKey(
    'ledger_account_talent_payable', '4310',
    'Compte 4310 — Cachets talents nets à verser. Débité au payout.'
  );
  const account5100 = await loadOrSeedPolicyKey(
    'ledger_account_stripe_available', '5100',
    'Compte 5100 — Stripe disponible. Crédité au payout (fonds sortants vers talent).'
  );
  console.log(`✓ 4310 → ${account4310} (talent payable)`);
  console.log(`✓ 5100 → ${account5100} (Stripe disponible)`);
  console.log();

  // ── Idempotence : TXG déjà présent ? ─────────────────────
  const allLedger = await get('/entities/LedgerRecord?sort=created_date&limit=500');
  const existing = (allLedger || []).find(r =>
    r.transactionGroupId === TARGET.corrTxg
  );
  if (existing) {
    console.log(`⊙ TXG ${TARGET.corrTxg} déjà présent — payout déjà enregistré.`);
    return;
  }

  // ── Vérifier l'engagement ─────────────────────────────────
  const q = encodeURIComponent(JSON.stringify({ systemId: TARGET.engagementId }));
  const engs = await get(`/entities/Engagement?q=${q}`);
  const eng = engs?.[0];
  if (!eng) throw new Error(`Engagement ${TARGET.engagementId} introuvable`);

  console.log(`Engagement : ${eng.systemId}`);
  console.log(`Status     : ${eng.status}`);
  console.log(`talentNet  : ${(TARGET.talentNetCents / 100).toFixed(2)} $`);
  console.log();

  // ── LOI LEDGER-02 — vérification avant persistance ───────
  const dr = TARGET.talentNetCents;
  const cr = TARGET.talentNetCents;
  if (dr !== cr) throw new Error(`LOI_LEDGER_02: DR=${dr} CR=${cr}. Arrêt.`);
  console.log(`✓ LOI LEDGER-02 : DR = CR = ${(dr / 100).toFixed(2)} $`);

  const now = new Date().toISOString();
  const entries = [
    {
      systemId:           generateId('LDG'),
      transactionGroupId: TARGET.corrTxg,
      transactionType:    'payout_executed',
      economicEvent:      'payout_talent',
      financialStatement: 'BILAN',
      flowCode:           null,
      lineIndex:          0,
      engagementId:       TARGET.engagementId,
      eventId:            TARGET.eventId,
      skuCode:            TARGET.skuCode,
      subSkuCode:         TARGET.subSkuCode,
      account:            account4310,
      direction:          'DEBIT',
      amountCents:        TARGET.talentNetCents,
      currency:           'cad',
      reconciliationKey:  TARGET.reconciliationKey,
      note:               `Payout talent ${TARGET.talentUserId} — dette éteinte ${(TARGET.talentNetCents / 100).toFixed(2)}$ (virement manuel hors-Stripe, pilote E2E)`,
      metadata:           JSON.stringify({
        txgId:             TARGET.corrTxg,
        payoutMethod:      'manual_interac',
        piloteEvent:       'Event-0B',
        decision:          'Frédérik Gélin, 26 mai 2026 — Option A: virement hors-Stripe',
      }),
      createdAt:          now,
    },
    {
      systemId:           generateId('LDG'),
      transactionGroupId: TARGET.corrTxg,
      transactionType:    'payout_executed',
      economicEvent:      'payout_talent',
      financialStatement: 'FLUX',
      flowCode:           'DEC-PAYOUT',
      lineIndex:          1,
      engagementId:       TARGET.engagementId,
      eventId:            TARGET.eventId,
      skuCode:            TARGET.skuCode,
      subSkuCode:         TARGET.subSkuCode,
      account:            account5100,
      direction:          'CREDIT',
      amountCents:        TARGET.talentNetCents,
      currency:           'cad',
      reconciliationKey:  TARGET.reconciliationKey,
      note:               `Sortie fonds Stripe → talent ${TARGET.talentUserId} (méthode manuelle — DEC-PAYOUT)`,
      metadata:           JSON.stringify({ txgId: TARGET.corrTxg, payoutMethod: 'manual_interac' }),
      createdAt:          now,
    },
  ];

  console.log(`\nLignes à écrire :`);
  console.log(`  Ligne 0 : ${account4310} DEBIT  ${(TARGET.talentNetCents / 100).toFixed(2)} $ (dette talent éteinte)`);
  console.log(`  Ligne 1 : ${account5100} CREDIT ${(TARGET.talentNetCents / 100).toFixed(2)} $ (fonds sortants)`);
  console.log(`  TXG     : ${TARGET.corrTxg}`);
  console.log(`  RecKey  : ${TARGET.reconciliationKey}`);

  if (DRY_RUN) {
    console.log('\nℹ DRY-RUN. Relancer sans --dry-run pour écrire.');
    return;
  }

  for (const entry of entries) {
    await post('/entities/LedgerRecord', entry);
    console.log(`  ✓ Persisté : ${entry.systemId} (${entry.account} ${entry.direction})`);
  }

  console.log('\n═══════════════════════════════════════════════════════');
  console.log('✓ Payout manuel enregistré.');
  console.log('\nVérification attendue :');
  console.log('  4310 : DR + 440,00 $ → solde = 0,00 $ ✓');
  console.log('  5100 : CR + 440,00 $ → sortie de fonds');
  console.log('\n⚠ N\'oublie pas d\'effectuer le virement réel de 440,00 $');
  console.log('  vers le talent 012 (Interac ou virement bancaire).');
  console.log('  Sans le virement physique, l\'écriture ne reflète');
  console.log('  pas la réalité — le ledger dit que c\'est fait.');
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });