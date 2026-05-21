/**
 * MICRO RAVE V3 — ReputationRepository (interface)
 * ============================================================
 * Interface portable pour ReputationLedger (append-only).
 *
 * Source : D-128 · D-082 · OS V15 BLOC 9 — WORM Moment 5
 *
 * RÈGLE ABSOLUE — APPEND-ONLY :
 *   ReputationLedger est immuable après création.
 *   Aucun DELETE. Aucun UPDATE.
 *   Les scores EMA sont recalculés à partir des entrées immuables.
 *   Source : LOI GREFFIER-01 · D-107 interdit #11
 *
 * Préfixe IDFactory : REP-*
 * Source : IDFactory.PREFIXES.ReputationEntry = 'REP'
 *
 * WORM Moment 5 : sots_window_closed → scores gravés définitivement.
 * ============================================================
 */

'use strict';

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
 * Ajoute une entrée au ReputationLedger (append-only).
 * RÈGLE : jamais de modification après création.
 *
 * @param {object} entry
 * @param {string}  entry.systemId      — REP-* généré par IDFactory
 * @param {string}  entry.userId        — USR-* dont la réputation est affectée
 * @param {string}  entry.engagementId  — ENG-* source
 * @param {string}  entry.entryType     — 'SOTS_SCORE' | 'NO_SHOW' | 'CANCELLATION_LATE' | etc.
 * @param {number}  [entry.scoreValue]  — valeur du score (1-5)
 * @param {string[]} [entry.reasonCodes] — codes raisons
 * @param {string}  entry.createdAt     — ISO timestamp (gravé définitivement)
 */
async function append(entry) {
  if (!entry.systemId || !entry.systemId.startsWith('REP-')) {
    throw new Error(
      'REPUTATION_ERROR: ReputationLedger.systemId manquant ou invalide. ' +
      'Générer via IDFactory.generate("ReputationEntry").'
    );
  }
  if (!entry.userId || !entry.engagementId) {
    throw new Error('REPUTATION_ERROR: userId et engagementId obligatoires.');
  }
  return base44Post('/entities/ReputationLedger', {
    ...entry,
    createdAt: entry.createdAt || new Date().toISOString(),
    // APPEND-ONLY : pas d'updatedAt — immuable
  });
}

/**
 * Retourne toutes les entrées de réputation d'un utilisateur.
 * Triées par createdAt ASC pour calcul EMA chronologique.
 */
async function findByUserId(userId) {
  const q = encodeURIComponent(JSON.stringify({ userId }));
  const records = await base44Get(`/entities/ReputationLedger?q=${q}`);
  return records.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
}

/**
 * Retourne les entrées de réputation liées à un Engagement spécifique.
 */
async function findByEngagementId(engagementId) {
  const q = encodeURIComponent(JSON.stringify({ engagementId }));
  return base44Get(`/entities/ReputationLedger?q=${q}`);
}

module.exports = {
  append,
  findByUserId,
  findByEngagementId,
};