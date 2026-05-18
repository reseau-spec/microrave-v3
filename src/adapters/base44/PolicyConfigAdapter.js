/**
 * MICRO RAVE V3 — PolicyConfigAdapter (Base44)
 * ============================================================
 * Couche d'adaptation entre PolicyConfigRepository et Base44.
 *
 * URL réelle  : https://futuristic-rave-core-flow.base44.app
 * App ID      : 6a09b5c6ace6051fecd365ae
 * Fonction    : /functions/getPolicyConfig
 *
 * HISTORIQUE DES CORRECTIONS :
 *   V11a — URL corrigée : app_id brut → slug futuristic-rave-core-flow
 *           Résultat : 404 "App not found" → 500 "You must be logged in"
 *   V11b — Auth ajoutée : BASE44_ACCESS_TOKEN injecté dans Authorization header
 *           createClientFromRequest() lit ce header pour authentifier la requête.
 *
 * VARIABLES .ENV REQUISES pour le test 5 :
 *   DATABASE_URL=https://futuristic-rave-core-flow.base44.app
 *   BASE44_ACCESS_TOKEN=<token JWT de l'utilisateur Base44>
 *
 * Pour obtenir le token : Base44 → ton app → Settings → API / Access Token
 *
 * À REMPLACER si Micro Rave migre vers PostgreSQL.
 * L'interface PolicyConfigRepository ne change pas.
 * ============================================================
 */

const BASE44_APP_SLUG  = 'futuristic-rave-core-flow';
const BASE44_BASE_URL  = `https://${BASE44_APP_SLUG}.base44.app`;
const FUNCTION_URL     = `${BASE44_BASE_URL}/functions/getPolicyConfig`;

/**
 * Construit les headers d'authentification Base44.
 * createClientFromRequest() lit le header Authorization: Bearer <token>
 */
function buildHeaders() {
  const token = process.env.BASE44_ACCESS_TOKEN;
  const headers = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

/**
 * Vérifie si l'adapter est configuré pour appeler Base44.
 * Requiert DATABASE_URL ET BASE44_ACCESS_TOKEN.
 * Sans l'un ou l'autre → mode dégradé, skip du test 5.
 */
function isConnected() {
  const url   = process.env.DATABASE_URL;
  const token = process.env.BASE44_ACCESS_TOKEN;
  const urlOk   = url   && url   !== 'REMPLACER_PAR_URL_BASE44';
  const tokenOk = token && token !== 'REMPLACER_PAR_TOKEN_BASE44';
  return urlOk && tokenOk;
}

/**
 * Retourne ce qui manque dans .env pour une connexion complète.
 * Utilisé par le test 5 pour afficher un message de skip précis.
 */
function getMissingConfig() {
  const missing = [];
  const url   = process.env.DATABASE_URL;
  const token = process.env.BASE44_ACCESS_TOKEN;
  if (!url   || url   === 'REMPLACER_PAR_URL_BASE44')   missing.push('DATABASE_URL');
  if (!token || token === 'REMPLACER_PAR_TOKEN_BASE44') missing.push('BASE44_ACCESS_TOKEN');
  return missing;
}

/**
 * Trouve une config PolicyConfig par sa clé.
 * Appelle la fonction Base44 getPolicyConfig avec auth.
 *
 * @param {string} key
 * @returns {Promise<{key, value, value_type, category, description}|null>}
 */
async function findByKey(key) {
  if (!isConnected()) {
    console.warn(
      `[PolicyConfigAdapter] Mode dégradé pour "${key}". ` +
      `Manquant dans .env : ${getMissingConfig().join(', ')}`
    );
    return null;
  }

  let response;
  try {
    response = await fetch(FUNCTION_URL, {
      method:  'POST',
      headers: buildHeaders(),
      body:    JSON.stringify({ key }),
    });
  } catch (err) {
    console.error(`[PolicyConfigAdapter] Erreur réseau pour clé "${key}": ${err.message}`);
    return null;
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    console.error(
      `[PolicyConfigAdapter] Erreur HTTP ${response.status} pour clé "${key}": ${body}`
    );
    return null;
  }

  const json = await response.json();
  // La fonction getPolicyConfig retourne { data: record | null }
  return json.data || null;
}

/**
 * Crée ou met à jour une config PolicyConfig.
 * @param {object} data - { key, value, value_type, category, description }
 */
async function upsert(data) {
  if (!isConnected()) {
    console.warn(`[PolicyConfigAdapter] upsert() — ${getMissingConfig().join(', ')} manquant.`);
    return null;
  }

  const existing = await findByKey(data.key);
  const url = existing
    ? `${BASE44_BASE_URL}/api/entities/PolicyConfig/${existing.id}`
    : `${BASE44_BASE_URL}/api/entities/PolicyConfig`;

  let response;
  try {
    response = await fetch(url, {
      method:  existing ? 'PUT' : 'POST',
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
 * @param {string} category
 */
async function findByCategory(category) {
  if (!isConnected()) {
    console.warn(`[PolicyConfigAdapter] findByCategory — ${getMissingConfig().join(', ')} manquant.`);
    return [];
  }

  const url = `${BASE44_BASE_URL}/api/entities/PolicyConfig?category=${encodeURIComponent(category)}`;

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