/**
 * MICRO RAVE V3 — EngagementRepository (interface)
 * ============================================================
 * Interface portable pour accéder aux Engagements, Events,
 * Lineups et MissionSlots.
 *
 * Source : D-128 · OS V15 BLOC 16
 *
 * RÈGLE D-128 :
 *   Si Micro Rave migre hors Base44, seul l'adapter change.
 *   Cette interface reste identique.
 *
 * Entités couvertes :
 *   Engagement, Event, Lineup, MissionSlot,
 *   MissionApplication, MissionProposal, LineupPlacement
 *
 * Pattern append-only : updateStatus() ne supprime jamais.
 *   Tout changement d'état passe par transitionEngagement().
 *   Ce repository persiste le résultat — jamais la logique.
 * ============================================================
 */

'use strict';

const BASE44_BASE_URL = 'https://futuristic-rave-core-flow.base44.app/api';

function buildHeaders() {
  const apiKey = process.env.BASE44_API_KEY;
  if (!apiKey || apiKey === 'REMPLACER_PAR_API_KEY_BASE44') {
    throw new Error(
      'CONFIG_MISSING: BASE44_API_KEY absent. ' +
      'Base44 → Settings → API → api_key.'
    );
  }
  return { 'Content-Type': 'application/json', 'api_key': apiKey };
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

// ── Engagement ────────────────────────────────────────────────

/**
 * Trouve un Engagement par son systemId (ENG-*).
 * @param {string} engagementId — systemId souverain
 */
async function findEngagementById(engagementId) {
  const q = encodeURIComponent(JSON.stringify({ systemId: engagementId }));
  const records = await base44Get(`/entities/Engagement?q=${q}`);
  return Array.isArray(records) ? records[0] || null : null;
}

/**
 * Trouve tous les Engagements d'un Event.
 * @param {string} eventId — systemId EVT-*
 */
async function findEngagementsByEventId(eventId) {
  const q = encodeURIComponent(JSON.stringify({ eventId }));
  return base44Get(`/entities/Engagement?q=${q}`);
}

/**
 * Trouve un Engagement par stripePaymentIntentId.
 * Utilisé par WebhookProcessor pour retrouver l'engagement depuis un webhook Stripe.
 * Source : WebhookProcessor.handlePaymentIntentSucceeded()
 */
async function findEngagementByPaymentIntentId(stripePaymentIntentId) {
  const q = encodeURIComponent(JSON.stringify({ stripePaymentIntentId }));
  const records = await base44Get(`/entities/Engagement?q=${q}`);
  return Array.isArray(records) ? records[0] || null : null;
}

/**
 * Met à jour le status d'un Engagement.
 * RÈGLE : appelé UNIQUEMENT après transitionEngagement() réussi.
 * Ne contient aucune logique métier — persistence uniquement.
 *
 * @param {string} base44Id — id Base44 interne (pour le PUT)
 * @param {string} newStatus — état cible validé
 * @param {object} additionalFields — champs à mettre à jour (optionnel)
 */
async function updateEngagementStatus(base44Id, newStatus, additionalFields = {}) {
  return base44Put(`/entities/Engagement/${base44Id}`, {
    status: newStatus,
    ...additionalFields,
    updatedAt: new Date().toISOString(),
  });
}

/**
 * Crée un nouvel Engagement.
 * Le systemId doit être généré par IDFactory avant cet appel.
 */
async function createEngagement(data) {
  if (!data.systemId || !data.systemId.startsWith('ENG-')) {
    throw new Error(
      'REPOSITORY_ERROR: Engagement.systemId manquant ou invalide. ' +
      'Générer via IDFactory.generate("Engagement") avant create().'
    );
  }
  return base44Post('/entities/Engagement', {
    ...data,
    createdAt: data.createdAt || new Date().toISOString(),
  });
}

// ── Event ─────────────────────────────────────────────────────

async function findEventById(eventId) {
  const q = encodeURIComponent(JSON.stringify({ systemId: eventId }));
  const records = await base44Get(`/entities/Event?q=${q}`);
  return Array.isArray(records) ? records[0] || null : null;
}

async function createEvent(data) {
  if (!data.systemId || !data.systemId.startsWith('EVT-')) {
    throw new Error(
      'REPOSITORY_ERROR: Event.systemId manquant ou invalide. ' +
      'Générer via IDFactory.generate("Event") avant create().'
    );
  }
  return base44Post('/entities/Event', {
    ...data,
    createdAt: data.createdAt || new Date().toISOString(),
  });
}

// ── Lineup ────────────────────────────────────────────────────

async function findLineupByEventId(eventId) {
  const q = encodeURIComponent(JSON.stringify({ eventId }));
  const records = await base44Get(`/entities/Lineup?q=${q}`);
  return Array.isArray(records) ? records[0] || null : null;
}

// ── MissionSlot ───────────────────────────────────────────────

async function findMissionSlotsByEventId(eventId) {
  const q = encodeURIComponent(JSON.stringify({ eventId }));
  return base44Get(`/entities/MissionSlot?q=${q}`);
}

module.exports = {
  // Engagement
  findEngagementById,
  findEngagementsByEventId,
  findEngagementByPaymentIntentId,
  updateEngagementStatus,
  createEngagement,
  // Event
  findEventById,
  createEvent,
  // Lineup
  findLineupByEventId,
  // MissionSlot
  findMissionSlotsByEventId,
};