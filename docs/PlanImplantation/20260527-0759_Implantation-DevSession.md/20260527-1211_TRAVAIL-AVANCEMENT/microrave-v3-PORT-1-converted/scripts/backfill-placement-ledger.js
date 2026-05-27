/**
 * scripts/backfill-placement-ledger.js
 * ============================================================
 * Crée rétroactivement les LedgerRecords manquants pour les
 * engagements placés sans écriture comptable.
 *
 * PORTÉE : engagements avec cachetSigneCents > 0 et
 *          commissionMrCents présent, sans aucun LedgerRecord
 *          de type placement_engagement.
 *
 * IDEMPOTENT : vérifie l'existence d'un TXG-{engagementId}
 *              avant d'insérer. Peut être relancé sans doublon.
 *
 * OBJECTIF FINAL : ce script ne doit servir qu'une fois.
 *   Après son exécution, createEngagement v4 grave les écritures
 *   dès la création. Ce script ne devrait plus jamais être
 *   nécessaire si le BLOC 1 de createEngagement fonctionne.
 *
 * USAGE :
 *   node scripts/backfill-placement-ledger.js [--dry-run]
 *
 * Source : D-038, LOI LEDGER-01/02, Market Pivot V3
 * ============================================================
 */

'use strict';


import dotenv from 'dotenv';
dotenv.config();
const BASE44_BASE_URL = 'https://futuristic-rave-core-flow.base44.app/api';
const DRY_RUN = process.argv.includes('--dry-run');

function buildHeaders() {
  const apiKey = process.env.BASE44_API_KEY;
  if (!apiKey) throw new Error('BASE44_API_KEY absent du .env');
  return { 'Content-Type': 'application/json', 'api_key': apiKey };
}

async function base44Get(path) {
  const res = await fetch(`${BASE44_BASE_URL}${path}`, { headers: buildHeaders() });
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}`);
  const json = await res.json();
  return Array.isArray(json) ? json : (json.data || json);
}

async function base44Post(path, data) {
  const res = await fetch(`${BASE44_BASE_URL}${path}`, {
    method: 'POST', headers: buildHeaders(), body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`POST ${path} → ${res.status}: ${body}`);
  }
  return res.json();
}

function generateId(prefix) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const s1 = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  const s2 = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `${prefix}-${s1}-${s2}`;
}

function floorPpm(amountCents, ratePpm) {
  return Math.floor(amountCents * ratePpm / 1_000_000);
}

// ── Résoudre les comptes depuis PolicyConfig ─────────────────
async function loadLedgerAccounts() {
  const keys = [
    'ledger_account_clearing',
    'ledger_account_talent_payable',
    'ledger_account_commission_escrow',
  ];
  const accounts = {};
  for (const key of keys) {
    const q = encodeURIComponent(JSON.stringify({ key }));
    const records = await base44Get(`/entities/PolicyConfig?q=${q}`);
    if (!records?.length) throw new Error(`PolicyConfig manquante : ${key}`);
    accounts[key] = records[0].value;
  }
  return {
    clearing:         accounts['ledger_account_clearing'],
    talentPayable:    accounts['ledger_account_talent_payable'],
    commissionEscrow: accounts['ledger_account_commission_escrow'],
  };
}

// ── Construire 3 lignes de placement ─────────────────────────
function buildPlacementEntries({ eng, accounts, backfillNote }) {
  const txgId           = `TXG-${eng.systemId.slice(4)}`;
  const cachetCents     = Number(eng.cachetSigneCents);
  const tauxPpm         = Number(eng.tauxPpm) || 120_000;
  const commCents       = Number(eng.commissionMrCents) || floorPpm(cachetCents, tauxPpm);
  const talentNetCents  = cachetCents - commCents;
  const roleMetier      = (eng.roleMetier || 'BACKFILL').toUpperCase().slice(0, 10);
  const now             = new Date().toISOString();

  // LOI LEDGER-02 — vérification avant création
  const dr = cachetCents;
  const cr = talentNetCents + commCents;
  if (dr !== cr) {
    throw new Error(
      `LOI_LEDGER_02: DR=${dr} CR=${cr} pour ${eng.systemId}. ` +
      `cachet=${cachetCents} comm=${commCents} talent=${talentNetCents}`
    );
  }

  return {
    txgId,
    entries: [
      {
        systemId:           generateId('LDG'),
        transactionGroupId: txgId,
        transactionType:    'backfill_placement',
        economicEvent:      'placement_engagement',
        financialStatement: 'BILAN',
        flowCode:           null,
        lineIndex:          0,
        engagementId:       eng.systemId,
        eventId:            eng.eventId || '',
        skuCode:            'SKU-COURTAGE',
        subSkuCode:         `SUB-COURT-${roleMetier}`,
        account:            accounts.clearing,
        direction:          'DEBIT',
        amountCents:        cachetCents,
        currency:           'cad',
        reconciliationKey:  `journal:backfill-placement-${eng.systemId}`,
        note:               `[BACKFILL] Clearing waterfall ${(cachetCents/100).toFixed(2)}$ — ${backfillNote}`,
        metadata:           JSON.stringify({
          transactionGroupId: txgId,
          lineCount:          3,
          backfill:           true,
          backfillDate:       now,
          waterfall:          { cachetCents, commCents, talentNetCents, tauxPpm },
        }),
        createdAt: now,
      },
      {
        systemId:           generateId('LDG'),
        transactionGroupId: txgId,
        transactionType:    'backfill_placement',
        economicEvent:      'placement_engagement',
        financialStatement: 'BILAN',
        flowCode:           null,
        lineIndex:          1,
        engagementId:       eng.systemId,
        eventId:            eng.eventId || '',
        skuCode:            'SKU-COURTAGE',
        subSkuCode:         `SUB-COURT-${roleMetier}`,
        account:            accounts.talentPayable,
        direction:          'CREDIT',
        amountCents:        talentNetCents,
        currency:           'cad',
        reconciliationKey:  `journal:backfill-placement-${eng.systemId}`,
        note:               `[BACKFILL] Cachet net talent ${(talentNetCents/100).toFixed(2)}$`,
        metadata:           JSON.stringify({ transactionGroupId: txgId, lineCount: 3, backfill: true }),
        createdAt: now,
      },
      {
        systemId:           generateId('LDG'),
        transactionGroupId: txgId,
        transactionType:    'backfill_placement',
        economicEvent:      'placement_engagement',
        financialStatement: 'BILAN',
        flowCode:           null,
        lineIndex:          2,
        engagementId:       eng.systemId,
        eventId:            eng.eventId || '',
        skuCode:            'SKU-COURTAGE',
        subSkuCode:         `SUB-COURT-${roleMetier}`,
        account:            accounts.commissionEscrow,
        direction:          'CREDIT',
        amountCents:        commCents,
        currency:           'cad',
        reconciliationKey:  `journal:backfill-placement-${eng.systemId}`,
        note:               `[BACKFILL] Commission MR différée ${(tauxPpm/10000).toFixed(1)}%`,
        metadata:           JSON.stringify({ transactionGroupId: txgId, lineCount: 3, backfill: true }),
        createdAt: now,
      },
    ],
  };
}

// ── Main ─────────────────────────────────────────────────────
async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║  Backfill LedgerRecords — placement_engagement          ║');
  console.log(`║  Mode : ${DRY_RUN ? 'DRY-RUN — aucune écriture              ' : 'LIVE — écriture en base                '}  ║`);
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log();

  // 1. Charger les comptes depuis PolicyConfig
  console.log('Résolution des comptes depuis PolicyConfig...');
  const accounts = await loadLedgerAccounts();
  console.log(`  clearing         → ${accounts.clearing}`);
  console.log(`  talentPayable    → ${accounts.talentPayable}`);
  console.log(`  commissionEscrow → ${accounts.commissionEscrow}`);
  console.log();

  // 2. Charger tous les engagements avec cachetSigneCents
  console.log('Chargement des engagements...');
  const engagements = await base44Get('/entities/Engagement?sort=-created_date&limit=100');
  console.log(`  ${engagements.length} engagements trouvés`);

  // Exclure Pierre de Rosette (déjà traité manuellement)
  const candidates = engagements.filter(e =>
    e.cachetSigneCents > 0 &&
    e.systemId !== 'ENG-MPIG0BUZ-N084HN' &&
    e.systemId // must have systemId
  );
  console.log(`  ${candidates.length} candidats au backfill`);
  console.log();

  // 3. Pour chaque candidat, vérifier si un LedgerRecord existe déjà
  const existingLedger = await base44Get('/entities/LedgerRecord?sort=-created_date&limit=200');
  const existingTxgs = new Set(existingLedger.map(r => r.transactionGroupId).filter(Boolean));

  let inserted = 0;
  let skipped  = 0;
  let errors   = 0;

  for (const eng of candidates) {
    const expectedTxg = `TXG-${eng.systemId.slice(4)}`;

    if (existingTxgs.has(expectedTxg)) {
      console.log(`  SKIP ${eng.systemId} — TXG déjà présent (${expectedTxg})`);
      skipped++;
      continue;
    }

    if (!eng.cachetSigneCents || !eng.systemId) {
      console.log(`  SKIP ${eng.systemId} — données insuffisantes`);
      skipped++;
      continue;
    }

    // Construire les entrées
    let result;
    try {
      result = buildPlacementEntries({
        eng,
        accounts,
        backfillNote: `Backfill ${new Date().toISOString().slice(0,10)} — engagement créé avant correction schéma LedgerRecord`,
      });
    } catch (err) {
      console.error(`  ✗ ${eng.systemId} — BUILD ERROR: ${err.message}`);
      errors++;
      continue;
    }

    if (DRY_RUN) {
      console.log(`  [DRY] ${eng.systemId} → ${result.txgId} — 3 lignes DR=${eng.cachetSigneCents/100}$ CR=${eng.cachetSigneCents/100}$`);
      inserted++;
      continue;
    }

    // Persister les 3 lignes
    try {
      for (const entry of result.entries) {
        await base44Post('/entities/LedgerRecord', entry);
      }
      console.log(`  ✓ ${eng.systemId} → ${result.txgId} (3 lignes persistées)`);
      inserted++;
    } catch (err) {
      console.error(`  ✗ ${eng.systemId} → ${err.message}`);
      errors++;
    }
  }

  console.log();
  console.log('─'.repeat(58));
  console.log(`  Backfillés : ${inserted} | Skippés : ${skipped} | Erreurs : ${errors}`);
  console.log();

  if (errors > 0) {
    console.log('✗ Erreurs détectées — relancer après correction');
    process.exit(1);
  } else {
    console.log('✓ Backfill terminé');
    console.log();
    console.log('PROCHAIN MOUVEMENT D\'ARGENT :');
    console.log('  createEngagement v4 grave les 3 lignes dès la création.');
    console.log('  Ce script ne devrait plus jamais être nécessaire.');
  }
}

main().catch(err => {
  console.error('\n❌ ERREUR FATALE:', err.message);
  process.exit(1);
});