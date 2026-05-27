/**
 * MICRO RAVE V3 — ContractSnapshotRepository (interface)
 * ============================================================
 * Interface portable pour ContractSnapshot phase 1 et phase 2.
 *
 * Source : D-128 · D-014 · OS V15 BLOC 1
 *
 * WORM Moment 1 (accepted) → ContractSnapshot phase 1 (CS1-*)
 *   Contenu : cachet brut, tier, taux de base, SOTS snapshot,
 *             multiplicateur, taux effectif estimé, commission estimée,
 *             net estimé, historique de négociation.
 *
 * WORM Moment 3 (event_sealed) → ContractSnapshot phase 2 (CS2-*)
 *   Contenu : WORM financier complet — montants, taux, taxes,
 *             frais Stripe snapshotés immuables.
 *             Source de vérité pour PayoutExecutor.
 *
 * RÈGLE ABSOLUE :
 *   Les deux snapshots sont immuables après création.
 *   Toute correction = amendment ou reversal formel (D-147).
 *   Jamais de modification directe.
 *
 * Préfixes IDFactory : CS1-* (phase 1) · CS2-* (phase 2)
 * Source : IDFactory.PREFIXES
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
 * Crée un ContractSnapshot (phase 1 ou phase 2).
 * RÈGLE : immuable après création. Jamais de PUT sur ce record.
 *
 * @param {object} snapshot
 * @param {string}  snapshot.systemId     — CS1-* ou CS2-* généré par IDFactory
 * @param {string}  snapshot.engagementId — ENG-*
 * @param {number}  snapshot.phase        — 1 ou 2
 * @param {object}  snapshot.data         — contenu financier complet (D-014)
 */
async function create(snapshot) {
  const { systemId, phase } = snapshot;
  if (!systemId) {
    throw new Error(
      'CONTRACT_SNAPSHOT_ERROR: systemId manquant. ' +
      'Phase 1 → IDFactory.generate("ContractSnapshotV1"). ' +
      'Phase 2 → IDFactory.generate("ContractSnapshotV2").'
    );
  }
  if (phase === 1 && !systemId.startsWith('CS1-')) {
    throw new Error(`CONTRACT_SNAPSHOT_ERROR: Phase 1 doit utiliser préfixe CS1-. Reçu: ${systemId}`);
  }
  if (phase === 2 && !systemId.startsWith('CS2-')) {
    throw new Error(`CONTRACT_SNAPSHOT_ERROR: Phase 2 doit utiliser préfixe CS2-. Reçu: ${systemId}`);
  }
  return base44Post('/entities/ContractSnapshot', {
    ...snapshot,
    createdAt: snapshot.createdAt || new Date().toISOString(),
    // WORM : pas de updatedAt — immuable
  });
}

/**
 * Retourne le ContractSnapshot d'une phase pour un Engagement.
 * @param {string} engagementId — ENG-*
 * @param {number} phase        — 1 ou 2
 */
async function findByEngagementIdAndPhase(engagementId, phase) {
  const q = encodeURIComponent(JSON.stringify({ engagementId, phase }));
  const records = await base44Get(`/entities/ContractSnapshot?q=${q}`);
  return Array.isArray(records) ? records[0] || null : null;
}

/**
 * Retourne tous les ContractSnapshots d'un Engagement (phase 1 + 2).
 */
async function findByEngagementId(engagementId) {
  const q = encodeURIComponent(JSON.stringify({ engagementId }));
  return base44Get(`/entities/ContractSnapshot?q=${q}`);
}

export default {
create,
  findByEngagementIdAndPhase,
  findByEngagementId,

};
export { create, findByEngagementIdAndPhase, findByEngagementId };