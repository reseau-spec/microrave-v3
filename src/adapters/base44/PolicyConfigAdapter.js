/**
 * MICRO RAVE V3 — PolicyConfigAdapter (Base44)
 * ============================================================
 * Couche d'adaptation entre PolicyConfigRepository et Base44.
 *
 * API Base44 REST — endpoints directs :
 *   GET    /api/entities/PolicyConfig?q={"key":"..."}  → findByKey
 *   POST   /api/entities/PolicyConfig                  → create
 *   PUT    /api/entities/PolicyConfig/{id}             → update
 *   GET    /api/entities/PolicyConfig?category=...     → findByCategory
 *
 * VARIABLE .ENV REQUISE :
 *   BASE44_API_KEY=9f20b7603f3b4e578a84db22c3de2be4
 *   (Base44 → ton app → Settings → API → api_key)
 *
 * À REMPLACER si Micro Rave migre vers PostgreSQL.
 * L'interface PolicyConfigRepository ne change pas.
 * ============================================================
 */

'use strict';

const BASE44_BASE_URL = 'https://futuristic-rave-core-flow.base44.app/api';

/**
 * Construit les headers d'authentification Base44.
 * Source : API doc Base44 — headers: { "api_key": "..." }
 */
function buildHeaders() {
  const apiKey = process.env.BASE44_API_KEY;
  if (!apiKey || apiKey === 'REMPLACER_PAR_API_KEY_BASE44') {
    throw new Error(
      'CONFIG_MISSING: BASE44_API_KEY absent ou non configuré dans .env. ' +
      'Obtenir depuis : Base44 → ton app → Settings → API → api_key.'
    );
  }
  return {
    'Content-Type': 'application/json',
    'api_key': apiKey,
  };
}

/**
 * Vérifie si l'adapter est configuré pour appeler Base44.
 */
function isConnected() {
  const key = process.env.BASE44_API_KEY;
  return !!(key && key !== 'REMPLACER_PAR_API_KEY_BASE44');
}

/**
 * Retourne ce qui manque dans .env.
 */
function getMissingConfig() {
  const missing = [];
  const key = process.env.BASE44_API_KEY;
  if (!key || key === 'REMPLACER_PAR_API_KEY_BASE44') missing.push('BASE44_API_KEY');
  return missing;
}

/**
 * Trouve une config PolicyConfig par sa clé.
 * GET /api/entities/PolicyConfig?q={"key":"..."}
 *
 * @param {string} key
 * @returns {Promise<{id, key, value, value_type, category, description}|null>}
 */
async function findByKey(key) {
  if (!isConnected()) {
    console.warn(
      `[PolicyConfigAdapter] Mode dégradé pour "${key}". ` +
      `Manquant dans .env : ${getMissingConfig().join(', ')}`
    );
    return null;
  }

  const url = `${BASE44_BASE_URL}/entities/PolicyConfig?q=${encodeURIComponent(JSON.stringify({ key }))}`;

  let response;
  try {
    response = await fetch(url, {
      method:  'GET',
      headers: buildHeaders(),
    });
  } catch (err) {
    console.error(`[PolicyConfigAdapter] Erreur réseau findByKey "${key}": ${err.message}`);
    return null;
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    console.error(`[PolicyConfigAdapter] Erreur HTTP ${response.status} findByKey "${key}": ${body}`);
    return null;
  }

  const json = await response.json();
  // Base44 retourne un tableau pour les list endpoints
  const records = Array.isArray(json) ? json : (json.data || []);
  return records.length > 0 ? records[0] : null;
}

/**
 * Crée ou met à jour une config PolicyConfig.
 * - Si la clé existe déjà → PUT /api/entities/PolicyConfig/{id}
 * - Sinon               → POST /api/entities/PolicyConfig
 *
 * @param {object} data - { key, value, value_type, category, description }
 * @returns {Promise<object|null>}
 */
async function upsert(data) {
  if (!isConnected()) {
    console.warn(`[PolicyConfigAdapter] upsert() — ${getMissingConfig().join(', ')} manquant.`);
    return null;
  }

  // Vérifier si la clé existe déjà
  const existing = await findByKey(data.key);

  let url, method;
  if (existing && existing.id) {
    url    = `${BASE44_BASE_URL}/entities/PolicyConfig/${existing.id}`;
    method = 'PUT';
  } else {
    url    = `${BASE44_BASE_URL}/entities/PolicyConfig`;
    method = 'POST';
  }

  let response;
  try {
    response = await fetch(url, {
      method,
      headers: buildHeaders(),
      body:    JSON.stringify(data),
    });
  } catch (err) {
    console.error(`[PolicyConfigAdapter] Erreur réseau upsert "${data.key}": ${err.message}`);
    return null;
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    console.error(`[PolicyConfigAdapter] Erreur HTTP ${response.status} upsert "${data.key}": ${body}`);
    return null;
  }

  return response.json();
}

/**
 * Liste toutes les configs d'une catégorie.
 * GET /api/entities/PolicyConfig?q={"category":"..."}
 *
 * @param {string} category - CRITIQUE | ELEVE | STANDARD | OPERATIONNEL
 * @returns {Promise<Array>}
 */
async function findByCategory(category) {
  if (!isConnected()) {
    console.warn(`[PolicyConfigAdapter] findByCategory — ${getMissingConfig().join(', ')} manquant.`);
    return [];
  }

  const url = `${BASE44_BASE_URL}/entities/PolicyConfig?q=${encodeURIComponent(JSON.stringify({ category }))}`;

  let response;
  try {
    response = await fetch(url, {
      method:  'GET',
      headers: buildHeaders(),
    });
  } catch (err) {
    console.error(`[PolicyConfigAdapter] Erreur réseau findByCategory: ${err.message}`);
    return [];
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    console.error(`[PolicyConfigAdapter] Erreur HTTP ${response.status} findByCategory: ${body}`);
    return [];
  }

  const json = await response.json();
  return Array.isArray(json) ? json : (json.data || []);
}

module.exports = { findByKey, upsert, findByCategory, isConnected, getMissingConfig };