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
  // ── Mode seed CSV (PORT-1b, DETTE-PORT-007) ──────────────────
  // Si un store local a été chargé via loadFromCSV(), on court-circuite
  // le HTTP — utilisé exclusivement par les tests pour éviter la
  // dépendance à l'API Base44 réelle. La logique métier (findByKey
  // retourne le record ou null) est strictement préservée.
  if (_localStore !== null) {
    const row = _localStore.get(key);
    return row || null;
  }

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

// ── Mode seed CSV (PORT-1b, DETTE-PORT-007) ──────────────────────
// Permet aux tests de fournir des données depuis le CSV pristine
// codeBase44_v3/dataBase/PolicyConfig_export.csv sans toucher au
// réseau. Pattern : test charge le CSV, appelle loadFromCSV(text),
// puis tout findByKey() lit dans le store local au lieu de fetch().
// Important : ce mode N'AFFECTE PAS la logique métier — il remplace
// uniquement la source de données (DB → mémoire).

let _localStore = null;  // null = mode HTTP, Map = mode seed

/**
 * Parse minimaliste de CSV avec quoting double-quotes. Suffisant pour
 * le format export Base44 (pas de cas pathologiques de quote-in-quote).
 */
function _parseCSV(csvText) {
  const lines = csvText.replace(/\r\n/g, '\n').split('\n').filter((l) => l.length > 0);
  if (lines.length === 0) return [];
  const headers = _parseCSVRow(lines[0]);
  return lines.slice(1).map((line) => {
    const cells = _parseCSVRow(line);
    const row = {};
    headers.forEach((h, i) => { row[h] = cells[i]; });
    return row;
  });
}

function _parseCSVRow(line) {
  const out = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuote) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') { inQuote = false; }
      else { cur += c; }
    } else {
      if (c === '"') { inQuote = true; }
      else if (c === ',') { out.push(cur); cur = ''; }
      else { cur += c; }
    }
  }
  out.push(cur);
  return out;
}

/**
 * Charge un CSV PolicyConfig dans le store local. Active le mode seed.
 * Format attendu : colonnes 'key' et 'value' au minimum.
 * Usage : tests P0 qui ne peuvent pas appeler l'API Base44 réelle.
 */
function loadFromCSV(csvText) {
  const rows = _parseCSV(csvText);
  _localStore = new Map();
  for (const row of rows) {
    if (!row.key) continue;
    _localStore.set(row.key, {
      id:          row.id,
      key:         row.key,
      value:       row.value,
      value_type:  row.value_type,
      category:    row.category,
      description: row.description,
    });
  }
  return _localStore.size;
}

/**
 * Désactive le mode seed et restaure le comportement HTTP normal.
 * À appeler en teardown des tests.
 */
function resetLocalStore() {
  _localStore = null;
}

export default {
  findByKey, upsert, findByCategory, isConnected, getMissingConfig,
  loadFromCSV, resetLocalStore,
};
export {
  findByKey, upsert, findByCategory, isConnected, getMissingConfig,
  loadFromCSV, resetLocalStore,
};