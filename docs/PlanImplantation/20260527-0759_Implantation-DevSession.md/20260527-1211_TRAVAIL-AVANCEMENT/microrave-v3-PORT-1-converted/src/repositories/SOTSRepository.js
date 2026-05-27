/**
 * MICRO RAVE V3 — SOTSRepository (interface)
 * ============================================================
 * Interface portable pour SOTSSubmission et SOTSScoreSnapshot.
 *
 * Source : D-128 · D-077 · D-082 · OS V15 BLOC 9
 *
 * SOTS = Score Objectif de la Transaction et du Service
 *   Fenêtre : 24h après event_completed (contestationWindowDurationHours)
 *   Consolidation : agrège toutes les soumissions → SOTSScoreSnapshot
 *
 * RÈGLE D-094 pattern 6 — SOTS_SELF_BENEFICIAL :
 *   Blocage absolu de l'auto-note directe ou indirecte.
 *   Ce repository ne valide pas ce pattern — c'est SOTSSubmissionService.
 *
 * Préfixe IDFactory : SOT-*
 * Source : IDFactory.PREFIXES.SOTSRecord = 'SOT'
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

// ── SOTSSubmission ────────────────────────────────────────────

/**
 * Crée une SOTSSubmission.
 * @param {object} data
 * @param {string}  data.systemId       — SOT-* généré par IDFactory
 * @param {string}  data.engagementId   — ENG-*
 * @param {string}  data.submittedBy    — USR-* qui soumet
 * @param {string}  data.role           — 'talent' | 'organisateur' | 'vendeur'
 * @param {object}  data.scoreCategories — { qualite, ponctualite, communication, ... }
 * @param {string[]} data.reasonCodes   — codes raisons optionnels
 */
async function create(data) {
  if (!data.systemId || !data.systemId.startsWith('SOT-')) {
    throw new Error(
      'SOTS_ERROR: SOTSSubmission.systemId manquant ou invalide. ' +
      'Générer via IDFactory.generate("SOTSRecord").'
    );
  }
  return base44Post('/entities/SOTSSubmission', {
    ...data,
    consolidated: false,
    createdAt: data.createdAt || new Date().toISOString(),
  });
}

/**
 * Retourne toutes les SOTSSubmission d'un Engagement.
 */
async function findByEngagementId(engagementId) {
  const q = encodeURIComponent(JSON.stringify({ engagementId }));
  return base44Get(`/entities/SOTSSubmission?q=${q}`);
}

/**
 * Marque les soumissions comme consolidées.
 * Appelé par SOTSSubmissionService.consolidate() après création du snapshot.
 */
async function markConsolidated(engagementId, consolidatedAt) {
  // Récupère toutes les soumissions puis les marque — Base44 ne supporte pas bulk update
  const q = encodeURIComponent(JSON.stringify({ engagementId, consolidated: false }));
  const submissions = await base44Get(`/entities/SOTSSubmission?q=${q}`);
  const ts = consolidatedAt || new Date().toISOString();
  await Promise.all(
    submissions.map(s =>
      base44Put(`/entities/SOTSSubmission/${s.id}`, { consolidated: true, consolidatedAt: ts })
    )
  );
  return { consolidated: submissions.length, engagementId };
}

// ── SOTSScoreSnapshot ─────────────────────────────────────────

/**
 * Crée un SOTSScoreSnapshot (snapshot consolidé immuable après création).
 * Source : D-082 — EMA scores snapshotés à WORM Moment 5 (sots_window_closed).
 */
async function createSnapshot(data) {
  return base44Post('/entities/SOTSScoreSnapshot', {
    ...data,
    createdAt: data.createdAt || new Date().toISOString(),
  });
}

/**
 * Retourne le SOTSScoreSnapshot d'un Engagement (un seul par engagement).
 */
async function findSnapshotByEngagementId(engagementId) {
  const q = encodeURIComponent(JSON.stringify({ engagementId }));
  const records = await base44Get(`/entities/SOTSScoreSnapshot?q=${q}`);
  return Array.isArray(records) ? records[0] || null : null;
}

export default {
// SOTSSubmission
  create,
  findByEngagementId,
  markConsolidated,
  // SOTSScoreSnapshot
  createSnapshot,
  findSnapshotByEngagementId,

};