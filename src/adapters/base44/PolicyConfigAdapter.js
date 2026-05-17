/**
 * MICRO RAVE V3 — PolicyConfigAdapter (Base44 V3)
 * ============================================================
 * Couche d'adaptation entre PolicyConfigRepository et Base44 V3.
 *
 * RÈGLE ABSOLUE :
 * Ce fichier est le SEUL endroit où Base44 est mentionné
 * pour la config. La logique métier ne connaît pas Base44.
 *
 * PORTABILITÉ :
 * Si Micro Rave migre vers PostgreSQL, remplacer ce fichier.
 * PolicyConfigRepository.js ne change pas.
 * policy-config-resolver.js ne change pas.
 *
 * AUTH :
 * api_key depuis process.env.BASE44_V3_API_KEY — jamais hardcodée.
 * Source : .env (non versionné dans GitHub)
 *
 * Source : OS V10 section 11.1 — couche portable
 * ============================================================
 */

'use strict';

const BASE44_V3_APP_ID  = '6a09b5c6ace6051fecd365ae';
const BASE44_V3_BASE_URL = 'https://app.base44.com/api';

/**
 * Cherche une config par clé dans Base44 V3.
 * Retourne l'objet record ou null si absent.
 *
 * @param {string} key
 * @returns {Promise<{key, value, value_type, category, description} | null>}
 */
async function findByKey(key) {
  const apiKey = process.env.BASE44_V3_API_KEY;

  if (!apiKey) {
    console.error(
      '[PolicyConfigAdapter] BASE44_V3_API_KEY absent de process.env. ' +
      'Vérifier le fichier .env à la racine du projet.'
    );
    return null;
  }

  try {
    const url = `${BASE44_V3_BASE_URL}/apps/${BASE44_V3_APP_ID}/entities/PolicyConfig` +
                `?q=${encodeURIComponent(JSON.stringify({ key }))}` +
                `&limit=1`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'api_key':      apiKey,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const body = await response.text();
      console.error(
        `[PolicyConfigAdapter] Erreur HTTP ${response.status} pour clé "${key}": ${body}`
      );
      return null;
    }

    const records = await response.json();

    // Base44 retourne un tableau
    if (!Array.isArray(records) || records.length === 0) {
      return null;
    }

    const record = records[0];

    // Normaliser value_type vers les types attendus par PolicyConfigResolver
    // Base44 V3 a ses propres enums — on mappe vers les nôtres
    return {
      key:        record.key,
      value:      record.value,
      value_type: normalizeValueType(record.value_type),
      category:   record.category,
      description: record.description,
    };

  } catch (err) {
    console.error(`[PolicyConfigAdapter] Erreur réseau pour clé "${key}":`, err.message);
    return null;
  }
}

/**
 * Crée une config dans Base44 V3.
 * Utilisé par le script de seed.
 *
 * @param {{key, value, value_type, category, description}} config
 * @returns {Promise<object | null>}
 */
async function create(config) {
  const apiKey = process.env.BASE44_V3_API_KEY;

  if (!apiKey) {
    console.error('[PolicyConfigAdapter] BASE44_V3_API_KEY absent.');
    return null;
  }

  try {
    const url = `${BASE44_V3_BASE_URL}/apps/${BASE44_V3_APP_ID}/entities/PolicyConfig`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'api_key':      apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(config),
    });

    if (!response.ok) {
      const body = await response.text();
      console.error(`[PolicyConfigAdapter] Erreur création "${config.key}": ${body}`);
      return null;
    }

    return await response.json();

  } catch (err) {
    console.error(`[PolicyConfigAdapter] Erreur réseau création "${config.key}":`, err.message);
    return null;
  }
}

/**
 * Liste toutes les configs (pour validateCriticalConfigs).
 *
 * @returns {Promise<Array>}
 */
async function listAll() {
  const apiKey = process.env.BASE44_V3_API_KEY;

  if (!apiKey) return [];

  try {
    const url = `${BASE44_V3_BASE_URL}/apps/${BASE44_V3_APP_ID}/entities/PolicyConfig?limit=100`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'api_key':      apiKey,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) return [];

    const records = await response.json();
    return Array.isArray(records) ? records : [];

  } catch (err) {
    console.error('[PolicyConfigAdapter] Erreur listAll:', err.message);
    return [];
  }
}

/**
 * Mappe les value_type Base44 vers ceux attendus par PolicyConfigResolver.
 * Base44 génère ses propres enums — on normalise ici.
 *
 * PolicyConfigResolver attend : CENTS, PPM, BOOLEAN, STRING, ENUM
 * Base44 V3 stocke : la valeur telle qu'on l'insère dans le seed
 */
function normalizeValueType(rawType) {
  if (!rawType) return 'STRING';
  const upper = rawType.toUpperCase();
  const map = {
    'CENTS':   'CENTS',
    'PPM':     'PPM',
    'BOOLEAN': 'BOOLEAN',
    'STRING':  'STRING',
    'ENUM':    'ENUM',
    // Fallbacks si Base44 transforme
    'NUMBER':  'CENTS',
    'JSON':    'STRING',
    'URL':     'STRING',
  };
  return map[upper] || 'STRING';
}

module.exports = { findByKey, create, listAll };