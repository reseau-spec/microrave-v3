/**
 * MICRO RAVE V3 — src/adapters/base44/field-mapper.js
 * ============================================================
 * Conversion automatique camelCase ↔ snake_case pour les
 * champs d'entités Base44.
 *
 * CONTEXTE :
 *   Base44 crée ses schémas en snake_case (commission_rate_ppm,
 *   engagement_id, talent_user_id, etc.) et valide les champs
 *   required en snake_case. Le code V3 utilise du camelCase
 *   (commissionRatePpm, engagementId, talentUserId) partout.
 *
 *   Ce module résout le décalage en convertissant :
 *   - camelCase → snake_case AVANT chaque POST/PUT vers Base44
 *   - snake_case → camelCase APRÈS chaque GET depuis Base44
 *
 * USAGE :
 *   const { toSnake, toCamel } = require('./field-mapper');
 *
 *   // Avant POST/PUT
 *   const payload = toSnake({ commissionRatePpm: 120000 });
 *   // → { commission_rate_ppm: 120000 }
 *
 *   // Après GET
 *   const record = toCamel({ commission_rate_ppm: 120000 });
 *   // → { commissionRatePpm: 120000 }
 *
 * RÈGLES :
 *   - Conversion récursive sur les objets imbriqués
 *   - Les arrays sont traversés (chaque élément converti)
 *   - Les valeurs primitives (string, number, boolean, null) ne sont pas touchées
 *   - Les champs déjà dans le bon format passent sans problème
 *   - Le champ 'id' (Base44 internal) n'est jamais converti
 *
 * Source : Audit institutionnel Phase 1 · 2026-05-23
 * ============================================================
 */

'use strict';

/**
 * Convertit une chaîne camelCase en snake_case.
 * Ex: commissionRatePpm → commission_rate_ppm
 *     talentUserId     → talent_user_id
 *     systemId         → system_id
 *     kycStatus        → kyc_status
 */
function camelToSnake(str) {
  if (typeof str !== 'string') return str;
  return str
    .replace(/([A-Z])/g, '_$1')
    .toLowerCase()
    .replace(/^_/, '');  // pas de _ initial si la string commençait par majuscule
}

/**
 * Convertit une chaîne snake_case en camelCase.
 * Ex: commission_rate_ppm → commissionRatePpm
 *     talent_user_id     → talentUserId
 *     system_id          → systemId
 *     kyc_status         → kycStatus
 */
function snakeToCamel(str) {
  if (typeof str !== 'string') return str;
  return str.replace(/_([a-z0-9])/g, (_, char) => char.toUpperCase());
}

/**
 * Convertit récursivement les clés d'un objet de camelCase vers snake_case.
 * Utilisé avant POST/PUT vers Base44.
 *
 * @param {*} data — objet, array, ou primitive
 * @returns {*} — même structure avec les clés converties
 */
function toSnake(data) {
  if (data === null || data === undefined) return data;
  if (typeof data !== 'object') return data;

  if (Array.isArray(data)) {
    return data.map(item => toSnake(item));
  }

  const result = {};
  for (const [key, value] of Object.entries(data)) {
    const snakeKey = camelToSnake(key);
    result[snakeKey] = toSnake(value);
  }
  return result;
}

/**
 * Convertit récursivement les clés d'un objet de snake_case vers camelCase.
 * Utilisé après GET depuis Base44.
 *
 * Préserve le champ 'id' tel quel (identifiant interne Base44).
 *
 * @param {*} data — objet, array, ou primitive
 * @returns {*} — même structure avec les clés converties
 */
function toCamel(data) {
  if (data === null || data === undefined) return data;
  if (typeof data !== 'object') return data;

  if (Array.isArray(data)) {
    return data.map(item => toCamel(item));
  }

  const result = {};
  for (const [key, value] of Object.entries(data)) {
    // Préserver 'id' et '__v' et autres champs internes Base44
    const camelKey = key === 'id' || key.startsWith('_') ? key : snakeToCamel(key);
    result[camelKey] = toCamel(value);
  }
  return result;
}

export default {
toSnake, toCamel, camelToSnake, snakeToCamel 
};
export { toSnake, toCamel, camelToSnake, snakeToCamel };