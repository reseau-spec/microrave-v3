/**
 * MICRO RAVE V3 — SessionPresenceRepository (interface)
 * ============================================================
 * Interface portable pour SessionPresence.
 *
 * Source : D-128 · D-093 · D-093-A · OS V15 BLOC 9
 *
 * Rôle : persiste la preuve de présence physique du talent.
 *   PresenceWindowGuard vérifie l'existence d'un sessionPresenceId.
 *   PresenceProofGuard vérifie GPS + durée depuis le record.
 *
 * Préfixe IDFactory : SPR-*
 * Source : IDFactory.PREFIXES.SessionPresence = 'SPR'
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

async function base44Put(path, data) {
  const res = await fetch(`${BASE44_BASE_URL}${path}`, {
    method: 'PUT', headers: buildHeaders(), body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`BASE44_HTTP_${res.status}: PUT ${path} — ${body}`);
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
 * Crée une SessionPresence (check-in talent).
 * Appelé par SessionPresenceService.create() (Phase 1.1).
 *
 * @param {object} data
 * @param {string}  data.systemId        — SPR-* généré par IDFactory
 * @param {string}  data.engagementId    — ENG-*
 * @param {string}  data.talentUserId    — USR-*
 * @param {number}  data.checkInAt       — timestamp Unix ms
 * @param {object}  data.gpsCoordinates  — { lat, lng, accuracyMeters }
 * @param {string[]} data.signalTypes    — ['GPS', 'WIFI', 'MANUAL']
 */
async function create(data) {
  if (!data.systemId || !data.systemId.startsWith('SPR-')) {
    throw new Error(
      'PRESENCE_ERROR: SessionPresence.systemId manquant ou invalide. ' +
      'Générer via IDFactory.generate("SessionPresence").'
    );
  }
  return base44Post('/entities/SessionPresence', {
    ...data,
    checkOutAt: null,
    finalDurationMinutes: null,
    createdAt: data.createdAt || new Date().toISOString(),
  });
}

/**
 * Trouve la SessionPresence d'un Engagement.
 * Utilisé par PresenceWindowGuard et PresenceProofGuard.
 */
async function findByEngagementId(engagementId) {
  const q = encodeURIComponent(JSON.stringify({ engagementId }));
  const records = await base44Get(`/entities/SessionPresence?q=${q}`);
  return Array.isArray(records) ? records[0] || null : null;
}

/**
 * Met à jour le check-out.
 * Appelé par SessionPresenceService.recordCheckout().
 */
async function updateCheckout(base44Id, { checkOutAt, finalDurationMinutes }) {
  if (!Number.isInteger(finalDurationMinutes) || finalDurationMinutes < 0) {
    throw new Error(
      `PRESENCE_ERROR: finalDurationMinutes doit être un entier non-négatif. ` +
      `Reçu : ${finalDurationMinutes}.`
    );
  }
  return base44Put(`/entities/SessionPresence/${base44Id}`, {
    checkOutAt: checkOutAt || new Date().toISOString(),
    finalDurationMinutes,
    updatedAt: new Date().toISOString(),
  });
}

module.exports = {
  create,
  findByEngagementId,
  updateCheckout,
};