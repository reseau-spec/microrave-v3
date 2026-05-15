/**
 * MICRO RAVE V3 — PolicyConfigAdapter (Base44)
 * ============================================================
 * Couche d'adaptation entre l'interface PolicyConfigRepository
 * et Base44.
 *
 * À REMPLACER si Micro Rave migre vers PostgreSQL.
 * L'interface PolicyConfigRepository ne change pas.
 *
 * ⚠️  Pour connecter à Base44 :
 *     Remplacer les fonctions ci-dessous par les appels
 *     réels à l'API Base44 (fetch, SDK, etc.)
 * ============================================================
 */

/**
 * Simule la structure d'une table Base44 "policy_config".
 *
 * Structure attendue dans Base44 :
 * Table : policy_config
 * Champs :
 *   - key         (text, unique)
 *   - value       (text)
 *   - value_type  (text) : CENTS | PPM | BOOLEAN | STRING | ENUM
 *   - category    (text) : CRITIQUE | ELEVE | STANDARD | OPERATIONNEL
 *   - description (text)
 */

async function findByKey(key) {
  // ── REMPLACER PAR L'APPEL BASE44 RÉEL ────────────────────
  // Exemple avec fetch Base44 :
  //
  // const response = await fetch(`${process.env.DATABASE_URL}/policy_config?key=eq.${key}`);
  // const records = await response.json();
  // return records[0] || null;
  //
  // ─────────────────────────────────────────────────────────

  // Placeholder — retourne null jusqu'à connexion Base44
  console.warn(`[PolicyConfigAdapter] findByKey("${key}") — adapter Base44 non connecté. Retourne null.`);
  return null;
}

async function upsert(data) {
  // ── REMPLACER PAR L'APPEL BASE44 RÉEL ────────────────────
  console.warn(`[PolicyConfigAdapter] upsert() — adapter Base44 non connecté.`);
  return null;
}

async function findByCategory(category) {
  // ── REMPLACER PAR L'APPEL BASE44 RÉEL ────────────────────
  console.warn(`[PolicyConfigAdapter] findByCategory("${category}") — adapter Base44 non connecté.`);
  return [];
}

module.exports = { findByKey, upsert, findByCategory };
