/**
 * MICRO RAVE V3 — LedgerCodeMapRepository
 * ============================================================
 * Implémentation Market Pivot de la validation des comptes
 * et SKU codes du LedgerCodeMap V4.
 *
 * PRINCIPE MARKET PIVOT (doctrine constitutionnelle V3) :
 *   « Tous les domaines configuration vivent en lignes de base
 *   de données — jamais en code. »
 *
 * Ce repository remplace les Set JavaScript codés en dur dans
 * FinancialLedgerService.js (VALID_ACCOUNTS, VALID_SKU_CODES,
 * FISCAL_LIABILITY_ACCOUNTS, VALID_6690_INTERVENTION_TYPES).
 *
 * ENTITÉ BASE44 : LedgerCodeMap
 * ─────────────────────────────
 * Champs attendus :
 *   code           string  — ex: '4310', 'SKU-COURTAGE'
 *   type           string  — 'ACCOUNT' | 'SKU' | 'FISCAL_LIABILITY' | 'INTERVENTION_TYPE'
 *   description    string  — libellé humain
 *   active         boolean — soft-delete, jamais supprimé (LOI GREFFIER-01)
 *   jurisdiction   string  — 'QC-CA' | 'ON-CA' | '*' (toutes juridictions)
 *   category       string  — ex: 'ACTIF_COURANT', 'PASSIF_COURANT', 'REVENU', 'CHARGE'
 *   presentationOrder number — ordre dans le plan comptable
 *   source         string  — référence décision, ex: 'D-060-B'
 *   createdAt      string  — ISO timestamp
 *   updatedAt      string  — ISO timestamp
 *
 * CACHE :
 *   Les appels API Base44 sont mis en cache (TTL configurable,
 *   défaut 5 minutes) pour éviter une requête DB à chaque
 *   écriture ledger. Le cache est invalidé explicitement via
 *   invalidateCache() après toute modification du plan comptable.
 *
 * SOURCE :
 *   Correction de la violation Market Pivot documentée dans
 *   l'audit 20260524-0950_VIOLATION MARKET PIVOT.
 *   Décision : D-060 (plan comptable) + doctrine Market Pivot V3.
 * ============================================================
 */

'use strict';

const BASE44_BASE_URL = 'https://futuristic-rave-core-flow.base44.app/api';
const CACHE_TTL_MS    = 5 * 60 * 1000; // 5 minutes

function buildHeaders() {
  const apiKey = process.env.BASE44_API_KEY;
  if (!apiKey || apiKey === 'REMPLACER_PAR_API_KEY_BASE44') {
    throw new Error('CONFIG_MISSING: BASE44_API_KEY absent. Source : LedgerCodeMapRepository.');
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

// ── Cache en mémoire ─────────────────────────────────────────
let _cache = null;
let _cacheTimestamp = 0;

/**
 * Charge tous les codes LedgerCodeMap actifs depuis Base44.
 * Retourne un objet indexé par type pour des lookups O(1).
 */
async function loadCache() {
  const now = Date.now();
  if (_cache && (now - _cacheTimestamp) < CACHE_TTL_MS) {
    return _cache;
  }

  const q = encodeURIComponent(JSON.stringify({ active: true }));
  const rows = await base44Get(`/entities/LedgerCodeMap?q=${q}`);

  const accounts          = new Set();
  const skuCodes          = new Set();
  const fiscalLiabilities = new Set();
  const interventionTypes = new Set();
  const allRows           = [];

  for (const row of rows) {
    if (!row.active) continue;
    allRows.push(row);
    switch (row.type) {
      case 'ACCOUNT':           accounts.add(row.code);          break;
      case 'SKU':               skuCodes.add(row.code);          break;
      case 'FISCAL_LIABILITY':  fiscalLiabilities.add(row.code); break;
      case 'INTERVENTION_TYPE': interventionTypes.add(row.code); break;
    }
  }

  _cache = { accounts, skuCodes, fiscalLiabilities, interventionTypes, allRows };
  _cacheTimestamp = now;
  return _cache;
}

/**
 * Invalide le cache. Appeler après toute modification du plan comptable.
 * Utilisé par les scripts d'administration et les tests.
 */
function invalidateCache() {
  _cache = null;
  _cacheTimestamp = 0;
}

/**
 * Retourne le Set de comptes valides (actifs, toutes juridictions).
 * Drop-in replacement pour VALID_ACCOUNTS de FinancialLedgerService.
 * @returns {Set<string>}
 */
async function getValidAccounts() {
  const cache = await loadCache();
  return cache.accounts;
}

/**
 * Retourne le Set de SKU codes valides.
 * Drop-in replacement pour VALID_SKU_CODES.
 * @returns {Set<string>}
 */
async function getValidSkuCodes() {
  const cache = await loadCache();
  return cache.skuCodes;
}

/**
 * Retourne le Set de comptes passifs fiscaux autorisés
 * comme contrepartie de 6690.
 * Drop-in replacement pour FISCAL_LIABILITY_ACCOUNTS.
 * @returns {Set<string>}
 */
async function getFiscalLiabilityAccounts() {
  const cache = await loadCache();
  return cache.fiscalLiabilities;
}

/**
 * Retourne le Set d'interventionType autorisés pour 6690.
 * Drop-in replacement pour VALID_6690_INTERVENTION_TYPES.
 * @returns {Set<string>}
 */
async function getValid6690InterventionTypes() {
  const cache = await loadCache();
  return cache.interventionTypes;
}

/**
 * Vérifie qu'un code est valide pour un type donné.
 * @param {string} code
 * @param {string} type — 'ACCOUNT' | 'SKU' | 'FISCAL_LIABILITY' | 'INTERVENTION_TYPE'
 * @returns {boolean}
 */
async function isValid(code, type) {
  const cache = await loadCache();
  switch (type) {
    case 'ACCOUNT':           return cache.accounts.has(code);
    case 'SKU':               return cache.skuCodes.has(code);
    case 'FISCAL_LIABILITY':  return cache.fiscalLiabilities.has(code);
    case 'INTERVENTION_TYPE': return cache.interventionTypes.has(code);
    default: return false;
  }
}

/**
 * Retourne la définition complète d'un code.
 * @param {string} code
 * @returns {object|null}
 */
async function findByCode(code) {
  const cache = await loadCache();
  return cache.allRows.find(r => r.code === code) || null;
}

/**
 * Retourne tous les comptes d'une catégorie donnée.
 * Utilisé pour générer des états financiers par section.
 * @param {string} category — 'ACTIF_COURANT' | 'PASSIF_COURANT' | 'REVENU' | 'CHARGE' | etc.
 * @returns {Array}
 */
async function findByCategory(category) {
  const cache = await loadCache();
  return cache.allRows
    .filter(r => r.type === 'ACCOUNT' && r.category === category)
    .sort((a, b) => (a.presentationOrder || 0) - (b.presentationOrder || 0));
}

/**
 * Retourne tous les comptes actifs pour une juridiction.
 * @param {string} jurisdiction — 'QC-CA' | 'ON-CA' | '*'
 * @returns {Array}
 */
async function findByJurisdiction(jurisdiction) {
  const cache = await loadCache();
  return cache.allRows.filter(r =>
    r.type === 'ACCOUNT' && (r.jurisdiction === jurisdiction || r.jurisdiction === '*')
  );
}

/**
 * Ajoute un nouveau code au plan comptable (append-only conforme
 * à la philosophie Market Pivot — pas de DELETE, soft-disable via active=false).
 * @param {object} entry
 * @returns {object} — enregistrement créé
 */
async function addCode(entry) {
  if (!entry.code)        throw new Error('LEDGER_CODE_MAP: code obligatoire.');
  if (!entry.type)        throw new Error('LEDGER_CODE_MAP: type obligatoire.');
  if (!entry.description) throw new Error('LEDGER_CODE_MAP: description obligatoire.');

  const validTypes = ['ACCOUNT', 'SKU', 'FISCAL_LIABILITY', 'INTERVENTION_TYPE'];
  if (!validTypes.includes(entry.type)) {
    throw new Error(`LEDGER_CODE_MAP: type invalide "${entry.type}". Valeurs: ${validTypes.join(', ')}.`);
  }

  const result = await base44Post('/entities/LedgerCodeMap', {
    ...entry,
    active:    entry.active !== false, // défaut true
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  invalidateCache(); // forcer rechargement
  return result;
}

/**
 * Désactive un code (soft-delete — LOI GREFFIER-01, jamais de DELETE réel).
 * @param {string} code
 * @param {string} reason — obligatoire pour la piste d'audit
 */
async function deactivateCode(code, reason) {
  if (!reason) throw new Error('LEDGER_CODE_MAP: reason obligatoire pour désactivation.');

  const cache = await loadCache();
  const row = cache.allRows.find(r => r.code === code);
  if (!row) throw new Error(`LEDGER_CODE_MAP: code "${code}" introuvable.`);
  if (!row.id) throw new Error(`LEDGER_CODE_MAP: code "${code}" sans id Base44 — impossible de désactiver.`);

  const BASE44_BASE_URL_LOCAL = 'https://futuristic-rave-core-flow.base44.app/api';
  const res = await fetch(`${BASE44_BASE_URL_LOCAL}/entities/LedgerCodeMap/${row.id}`, {
    method: 'PUT',
    headers: buildHeaders(),
    body: JSON.stringify({
      active:       false,
      deactivatedAt: new Date().toISOString(),
      deactivationReason: reason,
      updatedAt:    new Date().toISOString(),
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`BASE44_HTTP_${res.status}: désactivation "${code}" — ${body}`);
  }

  invalidateCache();
  return res.json();
}

/**
 * Retourne les statistiques du plan comptable courant.
 * Utile pour le dashboard admin.
 */
async function getStats() {
  const cache = await loadCache();
  return {
    totalActive:    cache.allRows.length,
    accounts:       cache.accounts.size,
    skuCodes:       cache.skuCodes.size,
    fiscalLiabilities: cache.fiscalLiabilities.size,
    interventionTypes: cache.interventionTypes.size,
    cacheAge:       Math.round((Date.now() - _cacheTimestamp) / 1000) + 's',
  };
}

module.exports = {
  // Lecture (cache)
  getValidAccounts,
  getValidSkuCodes,
  getFiscalLiabilityAccounts,
  getValid6690InterventionTypes,
  isValid,
  findByCode,
  findByCategory,
  findByJurisdiction,
  getStats,
  // Administration
  addCode,
  deactivateCode,
  invalidateCache,
  // Accès direct au cache pour les tests
  loadCache,
};