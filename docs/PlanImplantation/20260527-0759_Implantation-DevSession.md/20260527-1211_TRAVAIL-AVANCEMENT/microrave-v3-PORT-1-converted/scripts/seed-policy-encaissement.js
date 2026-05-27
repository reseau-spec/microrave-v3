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


import dotenv from 'dotenv';
dotenv.config();
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

// ── Ajouter les clés additionnelles pour payout et revenue ───
async function seedAdditional(headers) {
  const additional = [
    {
      key:         'ledger_account_stripe_available',
      value:       '5100',
      category:    'OPERATIONNEL',
      description: 'Compte Stripe disponible — utilisé lors des payouts talent (DEC-PAYOUT). Source : D-060.',
    },
    {
      key:         'ledger_account_revenue_courtage',
      value:       '7110',
      category:    'OPERATIONNEL',
      description: 'Compte revenu de courtage reconnu — reconnu à l\'archivage de l\'engagement (4530→7110). Source : D-038, D-060.',
    },
  ];

  for (const entry of additional) {
    const check = await fetch(
      `${BASE44_BASE_URL}/entities/PolicyConfig?q=${encodeURIComponent(JSON.stringify({ key: entry.key }))}`,
      { headers }
    ).then(r => r.json());

    if (Array.isArray(check) && check.length > 0) {
      console.log(`✓ Déjà présent : ${entry.key} = ${check[0].value}`);
      continue;
    }

    const res = await fetch(`${BASE44_BASE_URL}/entities/PolicyConfig`, {
      method: 'POST', headers, body: JSON.stringify(entry),
    });
    if (!res.ok) throw new Error(`POST PolicyConfig ${entry.key} → ${res.status}`);
    console.log(`✓ ${entry.key} = ${entry.value} ajouté`);
  }
}