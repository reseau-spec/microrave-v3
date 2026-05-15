/**
 * MICRO RAVE V3 — PolicyConfigRepository (interface)
 * ============================================================
 * Interface portable pour accéder aux configurations.
 * L'implémentation réelle est dans src/adapters/base44/
 *
 * Si Micro Rave migre vers PostgreSQL, seul l'adapter change.
 * Cette interface reste identique.
 * ============================================================
 */

// En attendant l'implémentation Base44, on importe l'adapter
const adapter = require('../adapters/base44/PolicyConfigAdapter');

const PolicyConfigRepository = {
  /**
   * Trouve une config par sa clé.
   * @param {string} key
   * @returns {Promise<{key, value, value_type, category}|null>}
   */
  findByKey: (key) => adapter.findByKey(key),

  /**
   * Crée ou met à jour une config.
   * Toute modification produit un PolicyConfigChangeRecord.
   * @param {object} data - { key, value, value_type, category, description }
   */
  upsert: (data) => adapter.upsert(data),

  /**
   * Liste toutes les configs par catégorie.
   * @param {string} category - CRITIQUE | ELEVE | STANDARD | OPERATIONNEL
   */
  findByCategory: (category) => adapter.findByCategory(category),
};

module.exports = { PolicyConfigRepository };
