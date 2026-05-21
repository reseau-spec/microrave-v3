/**
 * MICRO RAVE V3 — AdminRepository (interface)
 * ============================================================
 * Interface portable pour les entités d'administration et d'audit.
 *
 * Source : D-128 · D-095 · D-107 · D-108 · OS V15 BLOC 13
 *
 * Entités couvertes :
 *   DataAccessLedgerEntry   — coffre-fort bancaire (D-018, D-095) APPEND-ONLY
 *   AdminAction             — log d'action admin (D-107) APPEND-ONLY
 *   AdminIncidentRecord     — alerte P0 (D-107) APPEND-ONLY
 *   PolicyConfigChangeRecord — audit config critique (D-108)
 *
 * RÈGLE ABSOLUE D-107 interdit #10 :
 *   DataAccessLedgerEntry est immuable. Aucun DELETE. Aucun UPDATE.
 *   Test P0 : ADMIN-ABS-DAL-01 (requiredBeforeEvent=0A)
 *
 * RÈGLE D-107 interdit #14 :
 *   AdminIncidentRecord immuable après création.
 *   Test P0 : ADMIN-ABS-INCIDENT (requiredBeforeEvent=0A)
 *
 * LOI GREFFIER-01 :
 *   Toute mutation du champ status déclenche une DataAccessLedgerEntry.
 *   Source : transitionEngagement() GUARD 5 (Phase 0.5).
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

// ── DataAccessLedgerEntry ─────────────────────────────────────

/**
 * Ajoute une DataAccessLedgerEntry (APPEND-ONLY — immuable).
 * Appelé par transitionEngagement() GUARD 5 sur toute mutation de status.
 * Source : D-095 · D-018 · LOI GREFFIER-01
 *
 * @param {object} entry
 * @param {string}  entry.actorUserId       — USR-* qui a déclenché l'action
 * @param {string}  entry.actorRole         — rôle (FOUNDER, SUPPORT_ADMIN, etc.)
 * @param {string}  entry.targetObjectType  — 'Engagement', 'LedgerRecord', etc.
 * @param {string}  entry.targetObjectId    — systemId de l'objet accédé
 * @param {string}  entry.accessType        — 'TRANSITION' | 'READ' | 'EXPORT' | 'ADMIN_ACTION'
 * @param {string}  entry.justification     — transition clé ou raison d'accès
 * @param {string}  [entry.transitionKey]   — ex: 'placed->deposit_pending'
 * @param {string}  [entry.guardApplied]    — guard ayant validé l'action
 * @param {string}  [entry.wormLevel]       — WORM level si applicable
 */
async function appendToDataAccessLedger(entry) {
  if (!entry.actorUserId || !entry.targetObjectId) {
    throw new Error(
      'ADMIN_ERROR: DataAccessLedgerEntry requiert actorUserId et targetObjectId. ' +
      'Source : D-095 · LOI GREFFIER-01.'
    );
  }
  return base44Post('/entities/DataAccessLedgerEntry', {
    ...entry,
    createdAt: entry.createdAt || new Date().toISOString(),
    // APPEND-ONLY : aucun updatedAt — immuable à la création
  });
}

/**
 * Retourne les DataAccessLedgerEntries d'un acteur.
 * Utilisé pour les audits D-095.
 */
async function findDataAccessByActorId(actorUserId) {
  const q = encodeURIComponent(JSON.stringify({ actorUserId }));
  return base44Get(`/entities/DataAccessLedgerEntry?q=${q}`);
}

/**
 * Retourne les DataAccessLedgerEntries sur un objet cible.
 */
async function findDataAccessByTargetId(targetObjectId) {
  const q = encodeURIComponent(JSON.stringify({ targetObjectId }));
  return base44Get(`/entities/DataAccessLedgerEntry?q=${q}`);
}

// ── AdminAction ───────────────────────────────────────────────

/**
 * Crée un AdminAction (append-only — traçabilité institutionnelle D-107).
 *
 * @param {object} data
 * @param {string}  data.actorUserId      — USR-* admin
 * @param {string}  data.actionType       — type d'action (ex: 'SOLO_FOUNDER_OVERRIDE')
 * @param {string}  data.targetObjectType — type de l'objet ciblé
 * @param {string}  data.targetObjectId   — systemId ciblé
 * @param {string}  data.reasonCode       — code raison obligatoire
 * @param {string}  [data.policyId]       — config associée
 */
async function createAdminAction(data) {
  if (!data.actorUserId || !data.actionType || !data.reasonCode) {
    throw new Error(
      'ADMIN_ERROR: AdminAction requiert actorUserId, actionType et reasonCode. D-107.'
    );
  }
  return base44Post('/entities/AdminAction', {
    ...data,
    createdAt: data.createdAt || new Date().toISOString(),
  });
}

/**
 * Retourne les AdminActions d'un acteur.
 */
async function findAdminActionsByActorId(actorUserId) {
  const q = encodeURIComponent(JSON.stringify({ actorUserId }));
  return base44Get(`/entities/AdminAction?q=${q}`);
}

// ── AdminIncidentRecord ───────────────────────────────────────

/**
 * Crée un AdminIncidentRecord (APPEND-ONLY — alerte P0).
 * Immuable après création (D-107 interdit #14, test ADMIN-ABS-INCIDENT).
 *
 * @param {object} data
 * @param {string}  data.incidentType   — type d'incident (ex: 'LEDGER_IMBALANCE', 'DOUBLE_PAYOUT_ATTEMPT')
 * @param {string}  data.severity       — 'P0' | 'P1' | 'P2'
 * @param {string}  data.engagementId   — ENG-* associé (optionnel)
 * @param {string}  data.description    — description de l'incident
 * @param {object}  [data.context]      — données contextuelles
 */
async function createAdminIncidentRecord(data) {
  if (!data.incidentType || !data.severity) {
    throw new Error(
      'ADMIN_ERROR: AdminIncidentRecord requiert incidentType et severity.'
    );
  }
  return base44Post('/entities/AdminIncidentRecord', {
    ...data,
    createdAt: data.createdAt || new Date().toISOString(),
    resolvedAt: null,
    // APPEND-ONLY : immuable
  });
}

// ── PolicyConfigChangeRecord ──────────────────────────────────

/**
 * Crée un PolicyConfigChangeRecord (D-108).
 * Toute modification d'une PolicyConfig produit ce record.
 * Source : D-108 · D-131 phrase canonique.
 *
 * @param {object} data
 * @param {string}  data.configKey       — clé modifiée
 * @param {any}     data.previousValue   — valeur avant
 * @param {any}     data.newValue        — valeur après
 * @param {string}  data.changedBy       — USR-* admin
 * @param {string}  data.justification   — raison du changement
 * @param {string}  data.adminActionId   — ADM-* lié (D-108 requiert AdminAction)
 */
async function createPolicyConfigChangeRecord(data) {
  if (!data.configKey || !data.changedBy || !data.adminActionId) {
    throw new Error(
      'ADMIN_ERROR: PolicyConfigChangeRecord requiert configKey, changedBy, adminActionId. D-108.'
    );
  }
  return base44Post('/entities/PolicyConfigChangeRecord', {
    ...data,
    createdAt: data.createdAt || new Date().toISOString(),
  });
}

module.exports = {
  // DataAccessLedgerEntry
  appendToDataAccessLedger,
  findDataAccessByActorId,
  findDataAccessByTargetId,
  // AdminAction
  createAdminAction,
  findAdminActionsByActorId,
  // AdminIncidentRecord
  createAdminIncidentRecord,
  // PolicyConfigChangeRecord
  createPolicyConfigChangeRecord,
};