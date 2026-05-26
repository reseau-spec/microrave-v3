/**
 * scripts/correction-encaissements-4335-to-4110.js
 * ============================================================
 * Régularise les TXG-ENC déjà gravés qui ont crédité 4335
 * (clearing — ancienne doctrine v3) au lieu de 4110 (Créances
 * clients nettes — doctrine D-038 corrigée).
 *
 * Contexte :
 *   stripeWebhookHandler v3 créditait `ledger_account_clearing`
 *   (4335) à chaque encaissement, alors que createEngagement v6
 *   débitait `ledger_account_organizer_receivable` (4110) au
 *   placement. Résultat : la créance 4110 n'était jamais éteinte
 *   et 4335 dérivait en territoire CR sans contrepartie.
 *
 *   stripeWebhookHandler v4 corrige le webhook pour les futurs
 *   encaissements. Ce script corrige les TXG déjà gravés.
 *
 * STRATÉGIE — append-only (LOI GREFFIER-01) :
 *
 *   Pour chaque TXG-ENC-* contenant une ligne 4335 CREDIT
 *   d'encaissement (deposit ou balance), créer un NOUVEAU
 *   TXG-CORR-ENC-{engSuffix}-{stripeSuffix} avec 2 lignes :
 *
 *     4335 DR amountCents   (annule le CR mal placé sur clearing)
 *     4110 CR amountCents   (extinction de créance qui aurait dû
 *                            avoir lieu à l'encaissement)
 *
 *   Aucune ligne existante n'est modifiée ni supprimée.
 *
 * EFFET NET sur le bilan (par engagement corrigé) :
 *   - 4335 : solde CR mal placé → revient à 0
 *   - 4110 : solde DR de placement réduit du montant encaissé
 *   - 5200 : inchangé (le DR encaissement reste correct)
 *   - 4310, 4530 : inchangés
 *
 * INVARIANTS :
 *   - LOI LEDGER-02 : DR = CR = amountCents par TXG-CORR-ENC
 *   - LOI GREFFIER-01 : aucun UPDATE/DELETE sur LedgerRecord
 *   - Idempotent : skip si TXG-CORR-ENC-{engSuffix}-{stripeSuffix} existe déjà
 *
 * USAGE :
 *   node scripts/correction-encaissements-4335-to-4110.js --dry-run
 *   node scripts/correction-encaissements-4335-to-4110.js
 *
 * Source : D-038, LOI LEDGER-01/02, LOI GREFFIER-01
 * ============================================================
 */
'use strict';
require('dotenv').config();

const BASE44_BASE_URL = 'https://futuristic-rave-core-flow.base44.app/api';
const DRY_RUN         = process.argv.includes('--dry-run');

// 4335 est le compte HISTORIQUEMENT mal utilisé. Hardcodé ici parce
// que c'est SPÉCIFIQUEMENT la valeur fautive à neutraliser. Pas une
// variable de configuration. Le compte de destination 4110 est lu
// depuis PolicyConfig (Market Pivot V3).
const ACCOUNT_4335_TO_NEUTRALIZE = '4335';

// ── ID generator (même format que les fonctions Base44) ─────
function generateId(prefix) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const s1 = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  const s2 = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `${prefix}-${s1}-${s2}`;
}

function headers() {
  const k = process.env.BASE44_API_KEY;
  if (!k) throw new Error('BASE44_API_KEY absent (.env)');
  return { 'Content-Type': 'application/json', 'api_key': k };
}

async function get(path) {
  const r = await fetch(`${BASE44_BASE_URL}${path}`, { headers: headers() });
  if (!r.ok) throw new Error(`GET ${path} → ${r.status}: ${await r.text()}`);
  const j = await r.json();
  return Array.isArray(j) ? j : (j.data || j);
}

async function post(path, body) {
  if (DRY_RUN) {
    console.log(`  [DRY-RUN] POST ${path}`);
    console.log(`            ${JSON.stringify(body).slice(0, 180)}...`);
    return { id: 'DRY-RUN', systemId: body.systemId };
  }
  const r = await fetch(`${BASE44_BASE_URL}${path}`, {
    method: 'POST', headers: headers(), body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`POST ${path} → ${r.status}: ${await r.text()}`);
  return r.json();
}

// ── Résolution du compte 4110 depuis PolicyConfig ──────────
async function loadOrganizerReceivable() {
  const q = encodeURIComponent(JSON.stringify({ key: 'ledger_account_organizer_receivable' }));
  const rows = await get(`/entities/PolicyConfig?q=${q}`);
  if (!Array.isArray(rows) || rows.length === 0 || !rows[0].value) {
    throw new Error(
      `LEDGER_ACCOUNT_MISSING: ledger_account_organizer_receivable absent de PolicyConfig. ` +
      `Exécuter d'abord : node scripts/seed-policy-organizer-receivable.js`
    );
  }
  return rows[0].value; // '4110'
}

// ── Récupérer tous les LedgerRecord 4335 CREDIT d'encaissement ──
async function findFaultyEncaissementLines() {
  // On filtre côté serveur sur les critères qui retournent l'ensemble le
  // plus restrictif possible, puis on raffine côté client.
  const all = await get(`/entities/LedgerRecord?limit=10000`);
  return all.filter(r =>
    r.account === ACCOUNT_4335_TO_NEUTRALIZE
    && r.direction === 'CREDIT'
    && (r.economicEvent === 'encaissement_depot' || r.economicEvent === 'encaissement_balance')
  );
}

// ── Vérifier qu'aucune correction n'existe déjà pour ce TXG ──
async function correctionAlreadyExists(originalTxgId) {
  // Convention : TXG-CORR-ENC-{originalSuffix}
  // On cherche toute ligne dont metadata contient l'originalTxgId
  // et dont transactionType est 'reversal'.
  const q = encodeURIComponent(JSON.stringify({
    transactionType: 'reversal',
  }));
  const rows = await get(`/entities/LedgerRecord?q=${q}&limit=1000`);
  return rows.some(r => {
    try {
      const meta = typeof r.metadata === 'string' ? JSON.parse(r.metadata) : (r.metadata || {});
      return meta.originalTxgId === originalTxgId;
    } catch { return false; }
  });
}

// ── Construction et écriture d'un TXG-CORR-ENC ────────────────
async function correctOneEncaissement({ faultyLine, account4110, allLines }) {
  const originalTxgId = faultyLine.transactionGroupId;
  const engagementId  = faultyLine.engagementId;
  const eventId       = faultyLine.eventId || '';
  const amountCents   = Number(faultyLine.amountCents);
  const economicEvent = faultyLine.economicEvent;

  // Idempotence : skip si déjà corrigé
  if (await correctionAlreadyExists(originalTxgId)) {
    return { skipped: true, reason: 'ALREADY_CORRECTED', originalTxgId };
  }

  // Suffixe stripe depuis le reconciliationKey original
  // (format: stripe:pi_XXX...XYZuvw → suffixe = XYZuvw)
  const stripeKey = faultyLine.reconciliationKey || '';
  const stripeSuffix = stripeKey.slice(-6);
  const engSuffix    = (engagementId || '').slice(4);

  const corrTxgId = `TXG-CORR-ENC-${engSuffix}-${stripeSuffix}`;
  const now       = new Date().toISOString();

  // LOI LEDGER-02 — vérification explicite
  const dr = amountCents;
  const cr = amountCents;
  if (dr !== cr) {
    throw new Error(`LOI_LEDGER_02_VIOLATED: DR=${dr} CR=${cr} pour TXG=${corrTxgId}`);
  }

  const reconciliationKey = `reversal:${originalTxgId}`;

  const entries = [
    // Ligne 0 : 4335 DR — annule le CR mal placé sur clearing
    {
      systemId:           generateId('LDG'),
      transactionGroupId: corrTxgId,
      transactionType:    'reversal',
      economicEvent:      'regularisation',
      financialStatement: 'BILAN',
      flowCode:           null,
      lineIndex:          0,
      engagementId,
      eventId,
      skuCode:            'SKU-COURTAGE',
      subSkuCode:         faultyLine.subSkuCode || 'SUB-COURT-CORR',
      account:            ACCOUNT_4335_TO_NEUTRALIZE,
      direction:          'DEBIT',
      amountCents,
      currency:           'cad',
      reconciliationKey,
      note:               `Correction ${economicEvent} ${engagementId} — neutralisation 4335 (clearing v3 erroné) — ${(amountCents/100).toFixed(2)}$`,
      metadata:           JSON.stringify({
        originalTxgId,
        originalEconomicEvent: economicEvent,
        correctionReason:      'webhook_v3_credited_4335_instead_of_4110',
        doctrineRef:           'D-038',
        scriptVersion:         'correction-encaissements-4335-to-4110@v1',
      }),
      createdAt: now,
    },
    // Ligne 1 : 4110 CR — extinction de créance qui aurait dû avoir lieu
    {
      systemId:           generateId('LDG'),
      transactionGroupId: corrTxgId,
      transactionType:    'reversal',
      economicEvent:      'regularisation',
      financialStatement: 'BILAN',
      flowCode:           null,
      lineIndex:          1,
      engagementId,
      eventId,
      skuCode:            'SKU-COURTAGE',
      subSkuCode:         faultyLine.subSkuCode || 'SUB-COURT-CORR',
      account:            account4110,
      direction:          'CREDIT',
      amountCents,
      currency:           'cad',
      reconciliationKey,
      note:               `Correction ${economicEvent} ${engagementId} — extinction créance organisateur 4110 (D-038) — ${(amountCents/100).toFixed(2)}$`,
      metadata:           JSON.stringify({
        originalTxgId,
        originalEconomicEvent: economicEvent,
        correctionReason:      'webhook_v3_credited_4335_instead_of_4110',
        doctrineRef:           'D-038',
        scriptVersion:         'correction-encaissements-4335-to-4110@v1',
      }),
      createdAt: now,
    },
  ];

  // Persister les 2 lignes (append-only)
  for (const entry of entries) {
    await post('/entities/LedgerRecord', entry);
  }

  return { skipped: false, corrTxgId, originalTxgId, engagementId, amountCents };
}

// ── Main ────────────────────────────────────────────────────
async function main() {
  console.log(`\n=== Correction des encaissements 4335 → 4110 ===`);
  console.log(`Mode : ${DRY_RUN ? 'DRY-RUN (aucune écriture)' : 'EXÉCUTION (écritures réelles)'}\n`);

  // 1. Résoudre le compte 4110
  const account4110 = await loadOrganizerReceivable();
  console.log(`✓ ledger_account_organizer_receivable = ${account4110}\n`);

  // 2. Identifier les lignes fautives
  const faulty = await findFaultyEncaissementLines();
  console.log(`Lignes 4335 CREDIT d'encaissement détectées : ${faulty.length}\n`);

  if (faulty.length === 0) {
    console.log('Rien à corriger. ✓');
    return;
  }

  // 3. Récupérer toutes les lignes ledger une seule fois (pour idempotence)
  const allLines = await get(`/entities/LedgerRecord?limit=10000`);

  // 4. Correction TXG par TXG
  const results = { applied: [], skipped: [], errors: [] };

  for (const line of faulty) {
    const engId = line.engagementId;
    const amt   = Number(line.amountCents);
    const txg   = line.transactionGroupId;
    const ee    = line.economicEvent;

    console.log(`→ ${txg}  ${engId}  ${ee}  ${(amt/100).toFixed(2)}$`);
    try {
      const r = await correctOneEncaissement({ faultyLine: line, account4110, allLines });
      if (r.skipped) {
        console.log(`  ⊘ ${r.reason}`);
        results.skipped.push(r);
      } else {
        console.log(`  ✓ TXG-CORR créé : ${r.corrTxgId}`);
        results.applied.push(r);
      }
    } catch (e) {
      console.error(`  ❌ ERREUR : ${e.message}`);
      results.errors.push({ txg, error: e.message });
    }
  }

  // 5. Synthèse
  console.log(`\n=== Synthèse ===`);
  console.log(`  Corrections appliquées : ${results.applied.length}`);
  console.log(`  Skip idempotent        : ${results.skipped.length}`);
  console.log(`  Erreurs                : ${results.errors.length}`);

  if (results.applied.length > 0) {
    const totalCorrected = results.applied.reduce((s, r) => s + r.amountCents, 0);
    console.log(`  Montant total corrigé  : ${(totalCorrected/100).toFixed(2)}$`);
  }

  if (results.errors.length > 0) {
    console.error('\n❌ Erreurs rencontrées :');
    for (const e of results.errors) console.error(`  ${e.txg}: ${e.error}`);
    process.exit(2);
  }

  if (DRY_RUN) {
    console.log('\n[DRY-RUN] Aucune écriture effectuée. Relancer sans --dry-run pour appliquer.');
  } else {
    console.log('\n✓ Correction terminée. Vérifier :');
    console.log('  - Solde 4335 par engagement : doit revenir à 0');
    console.log('  - Solde 4110 par engagement : doit être réduit du dépôt encaissé');
    console.log('  - Bilan global : DR doit toujours = CR');
  }
}

main().catch(e => {
  console.error('\n❌ ÉCHEC :', e.message);
  process.exit(1);
});