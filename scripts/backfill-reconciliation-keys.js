/**
 * MICRO RAVE V3 — scripts/backfill-reconciliation-keys.js
 * ============================================================
 * Migration D-060-C — ajout de reconciliationKey sur les 22
 * LedgerRecords antérieurs à D-060-C (groupes G1 à G6).
 *
 * STRATÉGIE : forward-strict, backward-lenient migration pattern.
 *   Les nouveaux scripts (post-D-060-C) fournissent reconciliationKey
 *   en paramètre natif. Ce script backfille les 22 lignes existantes
 *   en appliquant une clé spécifique par transactionGroupId —
 *   pas une clé unique pour tout le pilote.
 *
 * GRANULARITÉ PAR GROUPE (auditabilité) :
 *   G1 TXG-MPIUM30W  → journal:LEGACY-G1-MPIUM30W-original-waterfall
 *   G2 TXG-MPIUM3Y0  → stripe:tr_1TaHDt2eLVUrCnnJyDflLNEa  (Stripe réel)
 *   G3 TXG-MPIX15GR  → reversal:TXG-MPIUM30W-0ZN0UV
 *   G4 TXG-MPIX16EG  → journal:LEGACY-G4-MPIX16EG-reimputation-post-reversal
 *   G5 TXG-MPIXR0Q8  → journal:LEGACY-G5-MPIXR0Q8-fiscal-absorption-principal
 *   G6 TXG-MPIZUI9Z  → stripe:tr_1TaHDt2eLVUrCnnJyDflLNEa  (même transfer)
 *
 * APPROCHE BASE44 :
 *   Base44 n'a pas de UPDATE natif conforme WORM. On ne peut pas
 *   modifier les LedgerRecords existants (LOI GREFFIER-01).
 *   Ce script génère un rapport de mapping qui sert de référence pour
 *   la couche applicative (le repository peut injenter la clé à la
 *   lecture si elle est absente en base, via ce mapping).
 *
 *   Si Base44 expose un endpoint de migration admin (à vérifier),
 *   le script peut patcher directement via l'API — mais seulement
 *   pour les champs non financiers (reconciliationKey n'est pas
 *   un montant, c'est une métadonnée de réconciliation).
 *
 * USAGE :
 *   node scripts/backfill-reconciliation-keys.js [--dry-run]
 *   --dry-run : affiche le mapping sans écrire en base
 *
 * Source : D-060-C · LedgerCodeMap V4 · 2026-05-23
 * ============================================================
 */

'use strict';

require('dotenv').config();

const repositories = require('../src/repositories');

// ── Mapping transactionGroupId → reconciliationKey ────────────
// Source : audit LedgerRecord_export.csv + LedgerRecord_export__2_.csv
// Granularité : une clé par groupe, pas une clé par pilote entier.
const GROUP_RECONCILIATION_KEYS = {
  // G1 — waterfall original erroné (reversé par G3)
  'TXG-MPIUM30W-0ZN0UV': 'journal:LEGACY-G1-MPIUM30W-original-waterfall-errone',

  // G2 — payout + reconnaissance revenu (Transfer Stripe réel)
  'TXG-MPIUM3Y0-93XBJN': 'stripe:tr_1TaHDt2eLVUrCnnJyDflLNEa',

  // G3 — reversal de G1 (référence vers le groupe annulé)
  'TXG-MPIX15GR-BL0PDA': 'reversal:TXG-MPIUM30W-0ZN0UV',

  // G4 — réimputation correcte post-reversal
  'TXG-MPIX16EG-4R4SQ4': 'journal:LEGACY-G4-MPIX16EG-reimputation-post-reversal',

  // G5 — absorption fiscale Principal (TPS/TVQ non perçues pilote)
  'TXG-MPIXR0Q8-C0WVDF': 'journal:LEGACY-G5-MPIXR0Q8-fiscal-absorption-principal',

  // G6 — INT-CAPTURE 5200→5100 (même Transfer Stripe que G2)
  'TXG-MPIZUI9Z-37HRLO': 'stripe:tr_1TaHDt2eLVUrCnnJyDflLNEa',
};

const DRY_RUN = process.argv.includes('--dry-run');
const ENGAGEMENT_ID = process.env.PILOT_ENGAGEMENT_ID || 'ENG-MPIG0BUZ-N084HN';

function section(title) {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`  ${title}`);
  console.log(`${'─'.repeat(60)}`);
}

function fmt(record) {
  return `${record.systemId}  ${record.account}  ${record.direction}  ${record.transactionGroupId}`;
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  MICRO RAVE V3 — Backfill reconciliationKey (D-060-C)    ║');
  console.log(`║  Mode : ${DRY_RUN ? 'DRY-RUN (aucune écriture)         ' : 'LIVE (écriture si endpoint disponible)'}      ║`);
  console.log('╚══════════════════════════════════════════════════════════════╝');

  section('Lecture des LedgerRecords existants');

  const records = await repositories.ledgerRecords.findByEngagementId(ENGAGEMENT_ID);
  console.log(`  ${records.length} LedgerRecords trouvés pour ${ENGAGEMENT_ID}`);

  // Regrouper par transactionGroupId
  const byGroup = {};
  for (const r of records) {
    const g = r.transactionGroupId || 'SANS_GROUPE';
    if (!byGroup[g]) byGroup[g] = [];
    byGroup[g].push(r);
  }

  section('Mapping reconciliationKey par groupe');

  let covered = 0;
  let missing = 0;

  for (const [groupId, lines] of Object.entries(byGroup)) {
    const key = GROUP_RECONCILIATION_KEYS[groupId];
    if (key) {
      console.log(`  ✓ ${groupId}`);
      console.log(`    → ${key}`);
      console.log(`    Lignes : ${lines.length}`);
      covered += lines.length;
    } else {
      console.log(`  ✗ ${groupId} — PAS DE CLÉ MAPPÉE`);
      console.log(`    Lignes : ${lines.length} — investigation manuelle requise`);
      missing += lines.length;
    }
  }

  console.log(`\n  Couverture : ${covered}/${records.length} lignes mappées`);
  if (missing > 0) {
    console.log(`  ⚠ ${missing} lignes sans clé — ajouter dans GROUP_RECONCILIATION_KEYS`);
  }

  section('Rapport de migration (source de vérité pour la couche applicative)');

  // Produire le mapping complet ligne par ligne
  const migrationMap = [];
  for (const r of records) {
    const key = GROUP_RECONCILIATION_KEYS[r.transactionGroupId];
    migrationMap.push({
      systemId:           r.systemId,
      transactionGroupId: r.transactionGroupId,
      account:            r.account,
      reconciliationKey:  key || `journal:LEGACY-UNKNOWN-${r.transactionGroupId}`,
      source:             key ? 'GROUP_RECONCILIATION_KEYS' : 'FALLBACK_GENERATED',
      requiresInvestigation: !key,
    });
  }

  console.log('\n  Migration map (22 lignes) :');
  for (const entry of migrationMap) {
    const flag = entry.requiresInvestigation ? '⚠' : '✓';
    console.log(`  ${flag} ${entry.systemId}  →  ${entry.reconciliationKey}`);
  }

  if (DRY_RUN) {
    section('DRY-RUN — aucune écriture effectuée');
    console.log('  Le mapping ci-dessus est la source de vérité.');
    console.log('  Pour appliquer : relancer sans --dry-run.');
    console.log('  Note : Base44 ne permet pas UPDATE sur LedgerRecord (LOI GREFFIER-01).');
    console.log('  Ce mapping est injecté par le repository à la lecture si reconciliationKey absente.');
  } else {
    section('Application — patch via API Base44');
    console.log('  Note architecture : LOI GREFFIER-01 interdit UPDATE sur LedgerRecord.');
    console.log('  reconciliationKey étant une métadonnée de réconciliation (non financière),');
    console.log('  vérifier si Base44 expose un endpoint de patch admin pour champs non-financiers.');
    console.log('  Si non disponible, le mapping est utilisé comme lookup table en mémoire');
    console.log('  dans LedgerRepository.findByEngagementId() (enrichissement à la lecture).');
    console.log('');
    console.log('  Action requise : soumettre le mapping ci-dessus à Base44 pour patch admin,');
    console.log('  ou implémenter l\'enrichissement à la lecture dans LedgerRepository.');
  }

  section('Résumé');
  console.log(`  LedgerRecords traités : ${records.length}`);
  console.log(`  Groupes mappés        : ${Object.keys(byGroup).filter(g => GROUP_RECONCILIATION_KEYS[g]).length}/${Object.keys(byGroup).length}`);
  console.log(`  Lignes couvertes      : ${covered}/${records.length}`);
  console.log(`  Action suivante       : implémenter enrichissement à la lecture dans LedgerRepository`);
  console.log(`  Décision source       : D-060-C · LedgerCodeMap V4`);
}

main().catch(err => {
  console.error('\n ❌ ERREUR FATALE :', err.message);
  console.error(err.stack);
  process.exit(1);
});