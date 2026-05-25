/**
 * scripts/seed-policy-encaissement.js
 * ============================================================
 * Ajoute la clé PolicyConfig manquante pour le compte
 * d'encaissement Stripe (5200).
 *
 * USAGE : node scripts/seed-policy-encaissement.js
 * ============================================================
 */
'use strict';
require('dotenv').config();

const BASE44_BASE_URL = 'https://futuristic-rave-core-flow.base44.app/api';

async function main() {
  const apiKey = process.env.BASE44_API_KEY;
  if (!apiKey) throw new Error('BASE44_API_KEY absent');
  const headers = { 'Content-Type': 'application/json', 'api_key': apiKey };

  // Check if already exists
  const check = await fetch(
    `${BASE44_BASE_URL}/entities/PolicyConfig?q=${encodeURIComponent(JSON.stringify({ key: 'ledger_account_encaissement' }))}`,
    { headers }
  ).then(r => r.json());

  if (Array.isArray(check) && check.length > 0) {
    console.log(`✓ Déjà présent : ledger_account_encaissement = ${check[0].value}`);
    return;
  }

  const res = await fetch(`${BASE44_BASE_URL}/entities/PolicyConfig`, {
    method: 'POST', headers,
    body: JSON.stringify({
      key:         'ledger_account_encaissement',
      value:       '5200',
      category:    'OPERATIONNEL',
      description: 'Compte Stripe en attente de règlement — encaissement dépôts et balances. Source : D-060.',
    }),
  });

  if (!res.ok) throw new Error(`POST PolicyConfig → ${res.status}: ${await res.text()}`);
  console.log('✓ ledger_account_encaissement = 5200 ajouté dans PolicyConfig');
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });