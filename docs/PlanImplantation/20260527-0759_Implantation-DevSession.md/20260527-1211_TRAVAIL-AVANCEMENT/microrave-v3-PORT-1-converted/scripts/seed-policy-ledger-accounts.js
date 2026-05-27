/**
 * scripts/seed-policy-ledger-accounts.js
 * ============================================================
 * Seed unique pour TOUTES les clés PolicyConfig de comptes
 * comptables utilisées par les fonctions Base44.
 *
 * CLÉS CRÉÉES :
 *   ledger_account_clearing          = 4335
 *   ledger_account_talent_payable    = 4310
 *   ledger_account_commission_escrow = 4530
 *   ledger_account_encaissement      = 5200
 *   ledger_account_stripe_available  = 5100
 *   ledger_account_revenue_courtage  = 7110
 *
 * IDEMPOTENT : vérifie l'existence avant insertion.
 * USAGE : node scripts/seed-policy-ledger-accounts.js [--dry-run]
 * ============================================================
 */

'use strict';


import dotenv from 'dotenv';
dotenv.config();
const BASE44_BASE_URL = 'https://futuristic-rave-core-flow.base44.app/api';
const DRY_RUN = process.argv.includes('--dry-run');

function buildHeaders() {
  const k = process.env.BASE44_API_KEY;
  if (!k) throw new Error('BASE44_API_KEY absent du .env');
  return { 'Content-Type': 'application/json', 'api_key': k };
}

const LEDGER_ACCOUNT_KEYS = [
  {
    key:         'ledger_account_clearing',
    value:       '4335',
    category:    'OPERATIONNEL',
    description: 'Compte clearing Stripe Connect non ventilé — DR à création engagement, CR à encaissement dépôt. Source : D-060.',
  },
  {
    key:         'ledger_account_talent_payable',
    value:       '4310',
    category:    'OPERATIONNEL',
    description: 'Cachets talents nets à verser — CR à création engagement, DR à payout exécuté. Source : D-060.',
  },
  {
    key:         'ledger_account_commission_escrow',
    value:       '4530',
    category:    'OPERATIONNEL',
    description: 'Commission MR différée en escrow — CR à création engagement, DR à reconnaissance revenu. Source : D-060.',
  },
  {
    key:         'ledger_account_encaissement',
    value:       '5200',
    category:    'OPERATIONNEL',
    description: 'Compte Stripe en attente de règlement — DR à encaissement dépôt/balance (ENC-DEPOT). Source : D-060.',
  },
  {
    key:         'ledger_account_stripe_available',
    value:       '5100',
    category:    'OPERATIONNEL',
    description: 'Compte Stripe disponible — CR à payout talent (DEC-PAYOUT), DR à INT-CAPTURE. Source : D-060.',
  },
  {
    key:         'ledger_account_revenue_courtage',
    value:       '7110',
    category:    'OPERATIONNEL',
    description: 'Revenus courtage reconnus — CR à reconnaissance revenu (archivage engagement). Source : D-038, D-060.',
  },
];

async function main() {
  const headers = buildHeaders();

  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║  Seed PolicyConfig — comptes ledger                 ║');
  console.log(`║  Mode : ${DRY_RUN ? 'DRY-RUN                              ' : 'LIVE — écriture en base              '}  ║`);
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log();

  let inserted = 0, existing = 0, errors = 0;

  for (const entry of LEDGER_ACCOUNT_KEYS) {
    // Vérifier existence
    const q = encodeURIComponent(JSON.stringify({ key: entry.key }));
    const check = await fetch(`${BASE44_BASE_URL}/entities/PolicyConfig?q=${q}`, { headers })
      .then(r => r.json()).catch(() => []);

    if (Array.isArray(check) && check.length > 0) {
      console.log(`  ✓ Existant : ${entry.key} = ${check[0].value}`);
      existing++;
      continue;
    }

    if (DRY_RUN) {
      console.log(`  [DRY] INSÉRER : ${entry.key} = ${entry.value}`);
      inserted++;
      continue;
    }

    try {
      const res = await fetch(`${BASE44_BASE_URL}/entities/PolicyConfig`, {
        method: 'POST', headers, body: JSON.stringify(entry),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
      console.log(`  ✓ Créé : ${entry.key} = ${entry.value}`);
      inserted++;
    } catch (err) {
      console.error(`  ✗ ERREUR ${entry.key} : ${err.message}`);
      errors++;
    }
  }

  console.log();
  console.log('─'.repeat(54));
  console.log(`  Créés : ${inserted} | Existants : ${existing} | Erreurs : ${errors}`);

  if (errors > 0) {
    console.log('✗ Corriger les erreurs avant de déployer les fonctions Base44.');
    process.exit(1);
  } else {
    console.log('✓ Toutes les clés PolicyConfig sont en base.');
    console.log('  Les fonctions Base44 peuvent maintenant résoudre');
    console.log('  les comptes via loadLedgerAccounts() sans fallback.');
  }
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });