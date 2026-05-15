/**
 * MICRO RAVE V3 — PolicyConfigResolver
 * ============================================================
 * Seule façon d'accéder à une valeur de configuration dans le système.
 *
 * RÈGLE ABSOLUE — FAIL-CLOSED :
 * Si une clé est absente ou null → exception immédiate.
 * JAMAIS de valeur par défaut silencieuse.
 * JAMAIS de fallback implicite.
 *
 * Toutes les constantes financières vivent en database.
 * Aucune constante financière dans le code.
 * ============================================================
 */

const { PolicyConfigRepository } = require('../repositories/PolicyConfigRepository');

// ── Types de valeurs supportés ───────────────────────────────
const VALUE_TYPES = {
  CENTS:   (v) => parseInt(v, 10),      // montant en cents entiers
  PPM:     (v) => parseInt(v, 10),      // parts par million (ex: 50000 = 5%)
  BOOLEAN: (v) => v === 'true',
  STRING:  (v) => String(v),
  ENUM:    (v) => String(v),            // valeur d'une liste définie
};

// ── Cache en mémoire (évite les requêtes répétées) ───────────
const cache = new Map();
const CACHE_TTL_MS = 60 * 1000; // 1 minute

/**
 * Récupère une valeur de configuration.
 * Lance une exception si la clé est absente — FAIL-CLOSED.
 *
 * @param {string} key - clé de configuration
 * @returns {Promise<any>} valeur parsée selon son type
 */
async function getConfig(key) {
  // Vérifier le cache d'abord
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.value;
  }

  // Lire depuis la database
  const record = await PolicyConfigRepository.findByKey(key);

  // FAIL-CLOSED — jamais de valeur par défaut silencieuse
  if (!record || record.value === null || record.value === undefined) {
    throw new Error(
      `POLICY_CONFIG_MISSING: "${key}" — ` +
      `Cette configuration est requise et absente de la database. ` +
      `EPR bloquée. Ajouter la valeur dans policy_config avant de continuer.`
    );
  }

  // Parser selon le type
  const parser = VALUE_TYPES[record.value_type];
  if (!parser) {
    throw new Error(
      `POLICY_CONFIG_INVALID_TYPE: "${key}" a un type inconnu "${record.value_type}". ` +
      `Types valides : ${Object.keys(VALUE_TYPES).join(', ')}`
    );
  }

  const parsed = parser(record.value);

  // Mettre en cache
  cache.set(key, { value: parsed, timestamp: Date.now() });

  return parsed;
}

/**
 * Récupère plusieurs configs d'un coup.
 * Lance une exception si l'une d'elles est absente.
 *
 * @param {string[]} keys
 * @returns {Promise<Object>} { key: valeur, ... }
 */
async function getConfigs(keys) {
  const results = {};
  for (const key of keys) {
    results[key] = await getConfig(key);
  }
  return results;
}

/**
 * Vide le cache (utile après une mise à jour de config).
 */
function clearCache() {
  cache.clear();
}

/**
 * Vérifie que toutes les configs critiques sont présentes.
 * À appeler au démarrage du système.
 * Si l'une est absente → le système ne démarre pas.
 */
async function validateCriticalConfigs() {
  const REQUIRED = [
    'stripe_ppm',
    'stripe_fixe_cents',
    'payment_fees_tax_treatment',
    'free_weight_cents',
    'event_payment_cap_cents',
    'deposit_ratio_ppm',
    'tps_ppm',
    'tvq_ppm',
    'ledger_4310',
    'ledger_4325',
    'ledger_4326',
    'ledger_4530',
  ];

  const missing = [];
  for (const key of REQUIRED) {
    try {
      await getConfig(key);
    } catch {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `CRITICAL_CONFIG_MISSING: Les configurations suivantes sont absentes de la database :\n` +
      missing.map(k => `  - ${k}`).join('\n') + '\n' +
      `Le système ne peut pas démarrer sans ces valeurs.`
    );
  }

  return true;
}

module.exports = { getConfig, getConfigs, clearCache, validateCriticalConfigs };
