/**
 * scripts/backfill-ledger-dimensions.js
 * ============================================================
 * Corrige les LedgerRecords existants écrits avant l'ajout des
 * champs dimensionnels (financialStatement, flowCode,
 * economicEvent, reconciliationKey).
 *
 * PORTÉE : toutes les lignes avec financialStatement vide.
 * Les champs sont dérivés depuis transactionType + account.
 *
 * RÈGLE DE DÉRIVATION :
 *   int_capture          → FLUX / INT-CAPTURE / capture_interne
 *   retroactive_*        → selon account (5xxx=FLUX, 4xxx=BILAN, 7xxx=RESULTAT)
 *   reversal_*           → BILAN / null / regularisation
 *   fiscal_absorption_*  → RESULTAT / null / absorption_fiscale
 *   encaissement_depot   → FLUX / ENC-DEPOT / encaissement_depot
 *   backfill_placement   → BILAN / null / placement_engagement (déjà correct)
 *
 * IDEMPOTENT : ne touche que les lignes où financialStatement est vide.
 *
 * USAGE :
 *   node scripts/backfill-ledger-dimensions.js [--dry-run]
 * ============================================================
 */

'use strict';
require('dotenv').config();

const BASE44_BASE_URL = 'https://futuristic-rave-core-flow.base44.app/api';
const DRY_RUN = process.argv.includes('--dry-run');

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

async function put(path, data) {
  const r = await fetch(`${BASE44_BASE_URL}${path}`, {
    method: 'PUT', headers: headers(), body: JSON.stringify(data),
  });
  if (!r.ok) { const b = await r.text(); throw new Error(`PUT ${path} → ${r.status}: ${b}`); }
  return r.json();
}

// ── Dériver les dimensions depuis le contexte de la ligne ────
function deriveDimensions(row) {
  const tt      = row.transactionType || '';
  const account = row.account || '';
  const note    = row.note || '';
  const stripeRef = row.stripeTransferId
    ? `stripe:${row.stripeTransferId}`
    : row.reconciliationKey || null;

  // INT-CAPTURE : 5200 CR → 5100 DR (transfert interne Stripe)
  if (tt === 'int_capture') {
    return {
      financialStatement: 'FLUX',
      flowCode:           'INT-CAPTURE',
      economicEvent:      'capture_interne',
      reconciliationKey:  stripeRef || `journal:int-capture-${row.transactionGroupId}`,
    };
  }

  // Fiscal absorption : 6690 DR / 4410 CR / 4420 CR
  if (tt === 'fiscal_absorption_pilote') {
    return {
      financialStatement: account.startsWith('6') ? 'RESULTAT' : 'BILAN',
      flowCode:           null,
      economicEvent:      'absorption_fiscale',
      reconciliationKey:  `journal:fiscal-${row.transactionGroupId}-L${row.lineIndex}`,
    };
  }

  // Reversals : toujours BILAN
  if (tt.includes('reversal')) {
    return {
      financialStatement: 'BILAN',
      flowCode:           null,
      economicEvent:      'regularisation',
      reconciliationKey:  `reversal:${row.transactionGroupId}-L${row.lineIndex}`,
    };
  }

  // Retroactive (Pierre de Rosette) : dériver par account
  if (tt.includes('retroactive')) {
    let fs, ec;
    if (account.startsWith('5')) {
      fs = 'FLUX';
      // Distinguish ENC vs DEC by direction
      ec = row.direction === 'DEBIT' ? 'encaissement_depot' : 'payout_talent';
    } else if (account.startsWith('7')) {
      fs = 'RESULTAT';
      ec = 'reconnaissance_revenu';
    } else if (account.startsWith('6')) {
      fs = 'RESULTAT';
      ec = 'absorption_fiscale';
    } else {
      fs = 'BILAN';
      ec = 'placement_engagement';
    }
    const fc = (fs === 'FLUX')
      ? (row.direction === 'DEBIT' ? 'ENC-DEPOT' : 'DEC-PAYOUT')
      : null;
    return {
      financialStatement: fs,
      flowCode:           fc,
      economicEvent:      ec,
      reconciliationKey:  stripeRef || `journal:retro-${row.transactionGroupId}-L${row.lineIndex}`,
    };
  }

  // Backfill placement — already has correct dimensions, should be skipped
  // (filtered out upstream since financialStatement is already set)
  return {
    financialStatement: 'BILAN',
    flowCode:           null,
    economicEvent:      'placement_engagement',
    reconciliationKey:  `journal:legacy-${row.transactionGroupId}-L${row.lineIndex}`,
  };
}

// ── Main ─────────────────────────────────────────────────────
async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║  Backfill LedgerRecord — dimensions financières         ║');
  console.log(`║  Mode : ${DRY_RUN ? 'DRY-RUN                                  ' : 'LIVE — mise à jour en base               '}  ║`);
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log();

  const all = await get('/entities/LedgerRecord?sort=created_date&limit=200');
  console.log(`Total lignes LedgerRecord : ${all.length}`);

  // Seulement les lignes avec financialStatement vide
  const toFix = all.filter(r => !r.financialStatement);
  console.log(`Lignes sans financialStatement : ${toFix.length}`);
  console.log();

  let updated = 0, skipped = 0, errors = 0;

  for (const row of toFix) {
    try {
      const dims = deriveDimensions(row);

      if (DRY_RUN) {
        console.log(`  [DRY] ${row.systemId} (${row.transactionType} / ${row.account} ${row.direction})`);
        console.log(`        → financialStatement=${dims.financialStatement} flowCode=${dims.flowCode} economicEvent=${dims.economicEvent}`);
        updated++;
        continue;
      }

      await put(`/entities/LedgerRecord/${row.id}`, {
        financialStatement: dims.financialStatement,
        flowCode:           dims.flowCode || '',
        economicEvent:      dims.economicEvent,
        reconciliationKey:  dims.reconciliationKey,
      });

      console.log(`  ✓ ${row.systemId} → ${dims.financialStatement} / ${dims.flowCode || 'null'} / ${dims.economicEvent}`);
      updated++;
    } catch (err) {
      console.error(`  ✗ ${row.systemId} → ${err.message}`);
      errors++;
    }
  }

  console.log();
  console.log('─'.repeat(58));
  console.log(`  Mis à jour : ${updated} | Skippés : ${skipped} | Erreurs : ${errors}`);

  if (errors > 0) { console.log('✗ Erreurs — relancer après correction'); process.exit(1); }
  else console.log('✓ Dimensions financières complètes sur toutes les lignes');
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });