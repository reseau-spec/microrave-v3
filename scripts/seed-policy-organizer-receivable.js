/**
 * scripts/seed-policy-organizer-receivable.js
 * ============================================================
 * Ajoute la clé PolicyConfig manquante pour le compte de
 * créance organisateur (4110 — Créances clients nettes).
 *
 * Ce compte est débité au placement de l'engagement
 * (représente la créance envers l'organisateur) et crédité
 * à l'encaissement Stripe (extinction de la créance).
 *
 * Remplace l'usage incorrect de ledger_account_clearing (4335)
 * dans la waterfall placement/encaissement (cf. D-038).
 * 4335 reste défini dans LedgerCodeMap pour usage Stripe Connect
 * futur, mais n'est plus chargé par le code applicatif.
 *
 * IDEMPOTENT : skip si la clé existe déjà.
 *
 * USAGE : node scripts/seed-policy-organizer-receivable.js
 *
 * Source : D-038 (waterfall canonique), LedgerCodeMap (4110)
 * ============================================================
 */
'use strict';
require('dotenv').config();

const BASE44_BASE_URL = 'https://futuristic-rave-core-flow.base44.app/api';

async function main() {
  const apiKey = process.env.BASE44_API_KEY;
  if (!apiKey) throw new Error('BASE44_API_KEY absent');
  const headers = { 'Content-Type': 'application/json', 'api_key': apiKey };

  // Check existence
  const q = encodeURIComponent(JSON.stringify({ key: 'ledger_account_organizer_receivable' }));
  const check = await fetch(`${BASE44_BASE_URL}/entities/PolicyConfig?q=${q}`, { headers })
    .then(r => r.json());

  if (Array.isArray(check) && check.length > 0) {
    console.log(`✓ Déjà présent : ledger_account_organizer_receivable = ${check[0].value}`);
    return;
  }

  const res = await fetch(`${BASE44_BASE_URL}/entities/PolicyConfig`, {
    method: 'POST', headers,
    body: JSON.stringify({
      key:         'ledger_account_organizer_receivable',
      value:       '4110',
      category:    'OPERATIONNEL',
      description: "Compte 4110 — Créances clients nettes. Débité au placement (créance envers organisateur), crédité à l'encaissement Stripe (extinction). Remplace l'usage erroné de 4335 dans le waterfall. Source : D-038.",
    }),
  });

  if (!res.ok) throw new Error(`POST PolicyConfig → ${res.status}: ${await res.text()}`);
  console.log('✓ ledger_account_organizer_receivable = 4110 ajouté dans PolicyConfig');
  console.log('  Note : ledger_account_clearing (4335) reste en base pour audit historique,');
  console.log('         mais n\'est plus chargée par createEngagement v6 ni stripeWebhookHandler v4.');
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });