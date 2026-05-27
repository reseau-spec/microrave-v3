/**
 * MICRO RAVE V3 — LedgerRecordRepository
 * ============================================================
 * Repository portable pour l'entité LedgerRecord (écritures
 * comptables append-only en double-entrée).
 *
 * Source : D-038 · D-060 · LOI LEDGER-01/02 · OS V15 BLOC 4
 * Créé en PORT-1b : 27 mai 2026
 *
 * RÉSOLUTION DETTE-PORT-006 :
 *   Avant PORT-1b, src/repositories/LedgerRepository.js contenait
 *   en réalité LedgerCodeMapRepository. Le doublon a été supprimé,
 *   le fichier renommé en LedgerCodeMapRepository.js, et ce nouveau
 *   LedgerRecordRepository.js comble le vide. L'index expose
 *   maintenant deux repositories distincts pour deux entités
 *   distinctes :
 *     - LedgerRecord (écritures LDG-*)
 *     - LedgerCodeMap (plan comptable, validation des codes)
 *
 * INTERFACE ATTENDUE PAR LE CODE CANONIQUE :
 *   repositories.ledgerRecords.append(data)                  — créer LDG-*
 *   repositories.ledgerRecords.findByEngagementId(id)        — pour audits
 *   repositories.ledgerRecords.findByTransactionGroupId(id)  — pour reversals
 *   repositories.ledgerRecords.findByEventId(id)             — pour event reports
 *
 * Sites d'usage (vérifiés en PORT-1b) :
 *   FinancialLedgerService.recordTransaction       → append
 *   FinancialLedgerService.detectReversal          → findByTransactionGroupId
 *   FinancialLedgerService.verifyBalance           → findByEngagementId
 *   FinancialLedgerService.generateBalanceSnapshot → findByEngagementId/findByEventId
 *   PayoutExecutor.executePayout                   → append
 *   EngagementAmendmentService.recordAmendment     → append
 *
 * INVARIANTS APPLIQUÉS (D-064, D-060) :
 *   - amountCents est ENTIER (>= 0). Float → LEDGER_ERROR.
 *   - systemId DOIT commencer par LDG-* (auto-généré si absent).
 *   - currency est requis ('cad', 'usd', etc.).
 *   - direction ∈ {'DEBIT', 'CREDIT'}.
 *   - L'invariant DR=CR par TXG est appliqué par FinancialLedgerService,
 *     pas ici (ce repository persiste UNE ligne à la fois).
 *
 * ATTENTION : ce repository est l'adaptateur Node HTTP vers Base44.
 * La version Deno (base44.entities.LedgerRecord.create directe) sera
 * créée en PORT-2 via createBase44Repositories().
 * ============================================================
 */

'use strict';

import IDFactory from './../core/IDFactory.js';

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

// ── Validations D-064 ─────────────────────────────────────────

function validateAppendInput(data) {
  if (!data || typeof data !== 'object') {
    throw new Error('LEDGER_ERROR: data requis (objet).');
  }
  if (data.amountCents === undefined || data.amountCents === null) {
    throw new Error('LEDGER_ERROR: amountCents requis.');
  }
  if (!Number.isInteger(data.amountCents)) {
    throw new Error(
      `LEDGER_ERROR: amountCents DOIT être un entier (D-064). Reçu : ${data.amountCents}`
    );
  }
  if (data.amountCents < 0) {
    throw new Error(
      `LEDGER_ERROR: amountCents DOIT être >= 0. Reçu : ${data.amountCents}. ` +
      `Pour inverser une écriture, utiliser direction opposée (DEBIT/CREDIT).`
    );
  }
  if (!data.currency) {
    throw new Error('LEDGER_ERROR: currency requis.');
  }
  if (data.systemId && !data.systemId.startsWith('LDG-')) {
    throw new Error(
      `LEDGER_ERROR: systemId DOIT commencer par LDG-* (D-127). Reçu : ${data.systemId}`
    );
  }
  if (data.direction && !['DEBIT', 'CREDIT'].includes(data.direction)) {
    throw new Error(
      `LEDGER_ERROR: direction DOIT être DEBIT ou CREDIT. Reçu : ${data.direction}`
    );
  }
}

// ── Méthodes du repository ───────────────────────────────────

/**
 * Ajoute une écriture LedgerRecord. Génère systemId LDG-* si absent.
 * Append-only : ne modifie jamais un enregistrement existant.
 */
async function append(data) {
  validateAppendInput(data);
  const payload = {
    ...data,
    systemId: data.systemId || IDFactory.generate('LedgerEntry'),
    createdAt: data.createdAt || new Date().toISOString(),
  };
  return base44Post('/entities/LedgerRecord', payload);
}

/**
 * Récupère toutes les lignes liées à un engagement donné.
 * Usage : audits, verifyBalance, generateBalanceSnapshot.
 */
async function findByEngagementId(engagementId) {
  if (!engagementId) {
    throw new Error('LEDGER_ERROR: engagementId requis.');
  }
  const q = encodeURIComponent(JSON.stringify({ engagementId }));
  return base44Get(`/entities/LedgerRecord?q=${q}`);
}

/**
 * Récupère toutes les lignes d'un groupe de transaction (TXG-*).
 * Usage : detectReversal, vérifier DR=CR sur un TXG.
 */
async function findByTransactionGroupId(transactionGroupId) {
  if (!transactionGroupId) {
    throw new Error('LEDGER_ERROR: transactionGroupId requis.');
  }
  const q = encodeURIComponent(JSON.stringify({ transactionGroupId }));
  return base44Get(`/entities/LedgerRecord?q=${q}`);
}

/**
 * Récupère toutes les lignes liées à un événement (EVT-*).
 * Usage : generateBalanceSnapshot par event.
 */
async function findByEventId(eventId) {
  if (!eventId) {
    throw new Error('LEDGER_ERROR: eventId requis.');
  }
  const q = encodeURIComponent(JSON.stringify({ eventId }));
  return base44Get(`/entities/LedgerRecord?q=${q}`);
}

// ── Exports (default + named pour compat double-pattern PORT-1) ──

export default {
  append,
  findByEngagementId,
  findByTransactionGroupId,
  findByEventId,
};

export { append, findByEngagementId, findByTransactionGroupId, findByEventId };
