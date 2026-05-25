/**
 * scripts/correction-waterfall-4335-to-4110.js
 * ============================================================
 * Régularise les LedgerRecords placement_engagement qui ont
 * débité 4335 (Fonds Stripe Connect — clearing temporaire) à
 * tort, en transférant la charge vers 4110 (Créances clients
 * nettes) conformément à D-038.
 *
 * STRATÉGIE — append-only (LOI GREFFIER-01) :
 *
 *   Pour chaque TXG contenant une ligne 4335 DR placement,
 *   créer un NOUVEAU TXG-CORR-{engId} avec 2 lignes :
 *
 *     4110 DR cachetSigneCents   (placement corrigé)
 *     4335 CR cachetSigneCents   (annulation 4335 mal débité)
 *
 *   Aucune ligne existante n'est modifiée ni supprimée.
 *
 * EFFET NET sur le bilan :
 *   - 4335 : solde DR mal placé → revient à 0
 *   - 4110 : solde DR = somme des cachets non encaissés
 *   - Autres comptes (4310, 4530) : inchangés
 *
 * INVARIANTS :
 *   - LOI LEDGER-02 : DR = CR = cachetSigneCents par TXG-CORR
 *   - LOI GREFFIER-01 : aucun UPDATE/DELETE sur LedgerRecord
 *   - Idempotent : skip si TXG-CORR-{engId} existe déjà
 *
 * USAGE :
 *   node scripts/correction-waterfall-4335-to-4110.js --dry-run
 *   node scripts/correction-waterfall-4335-to-4110.js
 *
 * Source : D-038, LOI LEDGER-01/02, LOI GREFFIER-01
 * ============================================================
 */

'use strict';
require('dotenv').config();

const BASE44_BASE_URL = 'https://futuristic-rave-core-flow.base44.app/api';
const DRY_RUN = process.argv.includes('--dry-run');

// Compte 4335 hardcodé : c'est SPÉCIFIQUEMENT le compte mal utilisé
// historiquement, fixe par nature du correctif. Pas une variable de
// configuration. La nouvelle clé 4110 est en revanche lue depuis
// PolicyConfig (Market Pivot V3).
const ACCOUNT_4335_CLEARING_TO_NEUTRALIZE = '4335';

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

// ── Charger 4110 depuis PolicyConfig (Market Pivot) ─────────
async function loadOrganizerReceivableAccount() {
  const q = encodeURIComponent(JSON.stringify({ key: 'ledger_account_organizer_receivable' }));
  const records = await get(`/entities/PolicyConfig?q=${q}`);
  if (!records?.length || !records[0].value) {
    throw new Error(
      "PolicyConfig manquant : ledger_account_organizer_receivable. " +
      "Exécuter d'abord : node scripts/seed-policy-organizer-receivable.js"
    );
  }
  return records[0].value;
}

// ── Trouver tous les TXG existants pour idempotence ──────────
async function loadExistingCorrTxgs() {
  // On charge tous les LedgerRecord et on filtre côté client.
  // L'API Base44 ne supporte pas les filtres LIKE/startsWith fiables.
  const all = await get('/entities/LedgerRecord?sort=created_date&limit=500');
  const set = new Set();
  for (const r of all) {
    const txg = r.transactionGroupId || '';
    if (txg.startsWith('TXG-CORR-')) set.add(txg);
  }
  return set;
}

// ── Main ─────────────────────────────────────────────────────
async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║  Correction waterfall 4335 → 4110                       ║');
  console.log(`║  Mode : ${DRY_RUN ? 'DRY-RUN                                  ' : 'LIVE — écriture en base                  '}║`);
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log();

  const account4110 = await loadOrganizerReceivableAccount();
  console.log(`✓ Compte cible chargé depuis PolicyConfig : ${account4110}`);

  const existingCorr = await loadExistingCorrTxgs();
  console.log(`✓ TXG-CORR-* déjà présents : ${existingCorr.size}`);
  console.log();

  // Charger toutes les lignes LedgerRecord
  const all = await get('/entities/LedgerRecord?sort=created_date&limit=500');

  // Cibler les lignes 4335 DR placement_engagement
  const toCorrect = all.filter(r =>
    r.account === ACCOUNT_4335_CLEARING_TO_NEUTRALIZE &&
    r.direction === 'DEBIT' &&
    r.economicEvent === 'placement_engagement'
  );

  console.log(`Lignes 4335 DR placement à corriger : ${toCorrect.length}`);
  console.log();

  let created = 0, skipped = 0, errors = 0;

  for (const row of toCorrect) {
    const engId        = row.engagementId || '';
    const eventId      = row.eventId || '';
    const cachetCents  = Number(row.amountCents) || 0;
    const originalTxg  = row.transactionGroupId || '';
    const corrTxgId    = `TXG-CORR-${engId.replace(/^ENG-/, '')}`;
    const subSku       = row.subSkuCode || 'SUB-COURT-DJ';
    const sku          = row.skuCode || 'SKU-COURTAGE';

    // Validation
    if (!engId || !cachetCents || !originalTxg) {
      console.error(`  ✗ Ligne ${row.systemId} invalide (engId/amount/txg manquant) — skip`);
      errors++;
      continue;
    }

    // Idempotence
    if (existingCorr.has(corrTxgId)) {
      console.log(`  ⊙ ${corrTxgId} — déjà corrigé, skip`);
      skipped++;
      continue;
    }

    const now = new Date().toISOString();

    const entries = [
      {
        systemId:           generateId('LDG'),
        transactionGroupId: corrTxgId,
        transactionType:    'correction_waterfall_4335_to_4110',
        lineIndex:          0,
        engagementId:       engId,
        eventId:            eventId,
        skuCode:            sku,
        subSkuCode:         subSku,
        account:            account4110,
        direction:          'DEBIT',
        amountCents:        cachetCents,
        currency:           'cad',
        financialStatement: 'BILAN',
        flowCode:           '',
        economicEvent:      'regularisation',
        reconciliationKey:  `journal:corr-4335-to-4110-${originalTxg}`,
        note:               `Correction waterfall — reclassement 4335→4110 (créance organisateur). D-038.`,
        metadata:           JSON.stringify({
          correctionOf:    originalTxg,
          originalAccount: ACCOUNT_4335_CLEARING_TO_NEUTRALIZE,
          newAccount:      account4110,
          reason:          '4335 hors-doctrine au placement — remplacé par 4110 selon D-038',
        }),
        createdAt:          now,
      },
      {
        systemId:           generateId('LDG'),
        transactionGroupId: corrTxgId,
        transactionType:    'correction_waterfall_4335_to_4110',
        lineIndex:          1,
        engagementId:       engId,
        eventId:            eventId,
        skuCode:            sku,
        subSkuCode:         subSku,
        account:            ACCOUNT_4335_CLEARING_TO_NEUTRALIZE,
        direction:          'CREDIT',
        amountCents:        cachetCents,
        currency:           'cad',
        financialStatement: 'BILAN',
        flowCode:           '',
        economicEvent:      'regularisation',
        reconciliationKey:  `journal:corr-4335-to-4110-${originalTxg}`,
        note:               `Annulation débit 4335 erroné (passif Stripe Connect, hors-doctrine au placement).`,
        metadata:           JSON.stringify({
          correctionOf:    originalTxg,
          originalAccount: ACCOUNT_4335_CLEARING_TO_NEUTRALIZE,
          newAccount:      account4110,
        }),
        createdAt:          now,
      },
    ];

    // LOI LEDGER-02 — fail-hard
    const dr = entries.filter(e => e.direction === 'DEBIT').reduce((s, e) => s + e.amountCents, 0);
    const cr = entries.filter(e => e.direction === 'CREDIT').reduce((s, e) => s + e.amountCents, 0);
    if (dr !== cr) {
      console.error(`  ✗ ${corrTxgId} LOI_LEDGER_02: DR=${dr} CR=${cr} — skip`);
      errors++;
      continue;
    }

    if (DRY_RUN) {
      console.log(`  [DRY] ${corrTxgId}  eng=${engId}  ${(cachetCents/100).toFixed(2)}$  (4110 DR / 4335 CR)`);
      created++;
      continue;
    }

    try {
      for (const entry of entries) {
        await post('/entities/LedgerRecord', entry);
      }
      console.log(`  ✓ ${corrTxgId}  eng=${engId}  ${(cachetCents/100).toFixed(2)}$  4335→4110`);
      created++;
    } catch (err) {
      console.error(`  ✗ ${corrTxgId} → ${err.message}`);
      errors++;
    }
  }

  console.log();
  console.log('─'.repeat(58));
  console.log(`  TXG créés : ${created} | Déjà corrigés : ${skipped} | Erreurs : ${errors}`);
  console.log();

  if (errors > 0) {
    console.log('✗ Erreurs détectées — relancer après correction.');
    process.exit(1);
  }

  if (DRY_RUN) {
    console.log('ℹ Mode DRY-RUN. Relancer sans --dry-run pour écrire en base.');
  } else {
    console.log('✓ Correction terminée.');
    console.log('  Vérification attendue :');
    console.log('    - Compte 4335 : solde DR doit revenir à 0$');
    console.log(`    - Compte 4110 : solde DR doit afficher la somme des cachets non encaissés`);
  }
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });