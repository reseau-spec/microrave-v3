/**
 * MICRO RAVE V3 — LedgerRepository (interface)
 * ============================================================
 * Interface portable pour LedgerRecord et
 * RoundingReconciliationRecord.
 *
 * Source : D-128 · D-060-A · OS V15 BLOC 5
 *
 * RÈGLE ABSOLUE — APPEND-ONLY :
 *   Aucun DELETE. Aucun UPDATE sur un record existant.
 *   Le ledger est la vérité financière immuable.
 *   Toute correction passe par une écriture compensatoire,
 *   jamais par modification.
 *   Source : LOI GREFFIER-01 · OS V15 section 3
 *
 * Standard numérique invariant :
 *   - Montants : entiers en centimes. Jamais float. (D-064)
 *   - Comptes : LedgerCodeMap V3 — ajout D-060-A (compte 6119)
 * ============================================================
 */

'use strict';

const IDFactory     = require('../core/IDFactory');
const BASE44_BASE_URL = 'https://futuristic-rave-core-flow.base44.app/api';

function buildHeaders() {
  const apiKey = process.env.BASE44_API_KEY;
  if (!apiKey || apiKey === 'REMPLACER_PAR_API_KEY_BASE44') {
    throw new Error('CONFIG_MISSING: BASE44_API_KEY absent.');
  }
  return { 'Content-Type': 'application/json', 'api_key': apiKey };
}

async function base44Post(path, data) {
  const res = await fetch(`${BASE44_BASE_URL}${path}`, {
    method: 'POST', headers: buildHeaders(), body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`BASE44_HTTP_${res.status}: POST ${path} — ${body}`);
  }
  return res.json();
}

async function base44Get(path) {
  const res = await fetch(`${BASE44_BASE_URL}${path}`, {
    method: 'GET', headers: buildHeaders(),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`BASE44_HTTP_${res.status}: GET ${path} — ${body}`);
  }
  const json = await res.json();
  return Array.isArray(json) ? json : (json.data || json);
}

/**
 * Ajoute une entrée au ledger (append-only).
 * RÈGLE : jamais d'UPDATE sur un record existant.
 *
 * @param {object} entry
 * @param {string}  entry.systemId        — LDG-* généré par IDFactory
 * @param {string}  entry.engagementId    — ENG-* associé
 * @param {string}  entry.eventId         — EVT-* associé
 * @param {string}  entry.entryType       — type d'écriture (deposit_received, payout_executed, etc.)
 * @param {number}  entry.amountCents     — entier en centimes (D-064)
 * @param {string}  entry.currency        — 'cad'
 * @param {string}  entry.debitAccount    — compte débit LedgerCodeMap V3
 * @param {string}  entry.creditAccount   — compte crédit LedgerCodeMap V3
 * @param {string}  entry.createdAt       — ISO timestamp
 * @param {object}  [entry.metadata]      — données contextuelles optionnelles
 */
async function append(entry) {
  // Auto-génération du systemId si absent.
  // PayoutExecutor appelle append() sans systemId — on le génère ici
  // pour éviter que l'appelant doive connaître IDFactory.
  // Source : PayoutExecutor.js L.212 · D-064 · audit fil directeur 2026-05-21.
  const systemId = entry.systemId || IDFactory.generate('LedgerEntry');
  if (!systemId.startsWith('LDG-')) {
    throw new Error(
      `LEDGER_ERROR: LedgerRecord.systemId invalide : "${systemId}". ` +
      'Doit commencer par LDG-. Source : D-064.'
    );
  }
  if (!Number.isInteger(entry.amountCents) || entry.amountCents < 0) {
    throw new Error(
      `LEDGER_ERROR: amountCents doit être un entier non-négatif en centimes. ` +
      `Reçu : ${entry.amountCents}. Source : D-064.`
    );
  }

  // Sérialisation de metadata — Base44 attend une string, pas un objet.
  // Sans cette conversion, Base44 retourne ValidationError 422.
  // Appliqué ici (couche transport) plutôt que dans FinancialLedgerService
  // (couche métier) pour respecter la séparation des responsabilités.
  const serializedMetadata = entry.metadata != null
    ? (typeof entry.metadata === 'string' ? entry.metadata : JSON.stringify(entry.metadata))
    : undefined;

  return base44Post('/entities/LedgerRecord', {
    ...entry,
    systemId,
    metadata:  serializedMetadata,
    createdAt: entry.createdAt || new Date().toISOString(),
    // APPEND-ONLY : pas de champ updatedAt — immuable dès création
  });
}

/**
 * Retourne tous les LedgerRecord d'un Engagement, triés par createdAt ASC.
 * @param {string} engagementId — ENG-*
 */
async function findByEngagementId(engagementId) {
  const q = encodeURIComponent(JSON.stringify({ engagementId }));
  const records = await base44Get(`/entities/LedgerRecord?q=${q}`);
  // Tri garantit l'ordre chronologique pour LedgerInvariantGuard
  return records.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
}

/**
 * Retourne tous les LedgerRecord d'un Event (tous Engagements confondus).
 * @param {string} eventId — EVT-*
 */
async function findByEventId(eventId) {
  const q = encodeURIComponent(JSON.stringify({ eventId }));
  const records = await base44Get(`/entities/LedgerRecord?q=${q}`);
  return records.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
}

/**
 * Retourne tous les LedgerRecord d'un transactionGroupId.
 * Requis par D-060-E (detectReversal cas 2) pour identifier les lignes
 * d'un groupe à marquer REVERSED dans LedgerRecordStatusHistory.
 * @param {string} transactionGroupId — TXG-*
 */
async function findByTransactionGroupId(transactionGroupId) {
  const q = encodeURIComponent(JSON.stringify({ transactionGroupId }));
  const records = await base44Get(`/entities/LedgerRecord?q=${q}`);
  return records.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
}

/**
 * Ajoute un RoundingReconciliationRecord (append-only).
 * Utilisé par D-068 (méthode des plus grands restes, lineup multi-talent).
 * Non-bloquant pour SC-01 mono-talent.
 */
async function appendRoundingRecord(entry) {
  if (!entry.systemId) {
    throw new Error('LEDGER_ERROR: RoundingReconciliationRecord.systemId manquant.');
  }
  return base44Post('/entities/RoundingReconciliationRecord', {
    ...entry,
    createdAt: entry.createdAt || new Date().toISOString(),
  });
}

module.exports = {
  append,
  findByEngagementId,
  findByEventId,
  findByTransactionGroupId,
  appendRoundingRecord,
};