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
 * ============================================================
 */

import IDFactory from '../core/IDFactory.js';

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

export async function append(entry) {
  const systemId = entry.systemId || IDFactory.generate('LedgerRecord');
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
  return base44Post('/entities/LedgerRecord', {
    ...entry,
    systemId,
    createdAt: entry.createdAt || new Date().toISOString(),
  });
}

export async function findByEngagementId(engagementId) {
  const q = encodeURIComponent(JSON.stringify({ engagementId }));
  const records = await base44Get(`/entities/LedgerRecord?q=${q}`);
  return records.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
}

export async function findByEventId(eventId) {
  const q = encodeURIComponent(JSON.stringify({ eventId }));
  const records = await base44Get(`/entities/LedgerRecord?q=${q}`);
  return records.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
}

export async function findByTransactionGroupId(transactionGroupId) {
  const q = encodeURIComponent(JSON.stringify({ transactionGroupId }));
  const records = await base44Get(`/entities/LedgerRecord?q=${q}`);
  return records.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
}

export async function appendRoundingRecord(entry) {
  if (!entry.systemId) {
    throw new Error('LEDGER_ERROR: RoundingReconciliationRecord.systemId manquant.');
  }
  return base44Post('/entities/RoundingReconciliationRecord', {
    ...entry,
    createdAt: entry.createdAt || new Date().toISOString(),
  });
}

export default {
  append,
  findByEngagementId,
  findByEventId,
  findByTransactionGroupId,
  appendRoundingRecord,
};