/**
 * MICRO RAVE V3 — LedgerRecordStatusHistoryRepository
 * ============================================================
 * Source : D-060-E · LedgerCodeMap V4 · 2026-05-23
 *
 * Table parallèle append-only qui matérialise le statut effectif
 * de chaque LedgerRecord (POSTED | REVERSED | REVERSAL_OF) SANS
 * violer LOI GREFFIER-01 (le LedgerRecord original reste immuable).
 *
 * INVARIANTS :
 *   - Append-only : aucun UPDATE, aucun DELETE
 *   - Le statut courant d'un LedgerRecord = dernière entrée par
 *     createdAt pour ce ledgerRecordId
 *   - Si aucune entrée → statut par défaut POSTED
 *   - Idempotent : insérer deux fois le même status est un no-op
 *
 * USAGE TYPE :
 *   const history = makeLedgerRecordStatusHistoryRepository(db);
 *
 *   // Au reversal, alimenter les deux côtés en mode synchrone :
 *   await history.append({
 *     ledgerRecordId:    'LDG-MPIUM30X-FJC9U4',
 *     status:            'REVERSED',
 *     reason:            'Encaissement fantôme corrigé par G3',
 *     reversedByGroupId: 'TXG-MPIX15GR-BL0PDA',
 *     decidedBy:         userId,
 *     decisionRecordId:  'DR-MPIxxxx-yyyy',
 *   });
 *
 *   await history.append({
 *     ledgerRecordId:    'LDG-MPIX15GS-C8UWJT', // la ligne du reversal lui-même
 *     status:            'REVERSAL_OF',
 *     reason:            'Reversal de LDG-MPIUM30X-FJC9U4',
 *     reversedByGroupId: 'TXG-MPIX15GR-BL0PDA',
 *     decidedBy:         userId,
 *   });
 *
 *   // Lecture du statut courant :
 *   const status = await history.getCurrent('LDG-MPIUM30X-FJC9U4');
 *   // → { status: 'REVERSED', reversedByGroupId: 'TXG-MPIX15GR-BL0PDA', ... }
 *
 *   // Historique complet (audit) :
 *   const history = await history.getHistory('LDG-MPIUM30X-FJC9U4');
 *   // → [{ status: 'POSTED', createdAt: T0 }, { status: 'REVERSED', createdAt: T1 }]
 * ============================================================
 */

'use strict';

const IDFactory = require('../core/IDFactory');

const VALID_STATUSES = new Set(['POSTED', 'REVERSED', 'REVERSAL_OF']);

/**
 * Valide une entrée d'historique avant persistance.
 * @throws si invalide
 */
function validateHistoryEntry(entry) {
  if (!entry.ledgerRecordId || typeof entry.ledgerRecordId !== 'string') {
    throw new Error(
      'LEDGER_STATUS_HISTORY_VALIDATION: ledgerRecordId obligatoire (string).'
    );
  }

  if (!VALID_STATUSES.has(entry.status)) {
    throw new Error(
      `LEDGER_STATUS_HISTORY_VALIDATION: status "${entry.status}" invalide. ` +
      `Valeurs autorisées : ${[...VALID_STATUSES].join(', ')}. Source : D-060-E.`
    );
  }

  if (!entry.reason || entry.reason.length < 5) {
    throw new Error(
      'LEDGER_STATUS_HISTORY_VALIDATION: reason obligatoire (min. 5 caractères). ' +
      'Chaque changement de statut doit être justifié pour l\'audit.'
    );
  }

  if (!entry.decidedBy) {
    throw new Error(
      'LEDGER_STATUS_HISTORY_VALIDATION: decidedBy (userId) obligatoire. ' +
      'Traçabilité des décisions de changement de statut.'
    );
  }

  // Pour REVERSED et REVERSAL_OF, le reversedByGroupId est obligatoire
  if (entry.status !== 'POSTED' && !entry.reversedByGroupId) {
    throw new Error(
      `LEDGER_STATUS_HISTORY_VALIDATION: reversedByGroupId obligatoire pour status="${entry.status}". ` +
      'Doit pointer vers le transactionGroupId qui a déclenché le changement.'
    );
  }
}

/**
 * Factory du repository.
 * @param {object} db — couche d'accès données (à adapter selon Base44/PostgreSQL/etc.)
 * @returns {object} repository avec append/getCurrent/getHistory
 */
function makeLedgerRecordStatusHistoryRepository(db) {
  if (!db) {
    throw new Error('LedgerRecordStatusHistoryRepository: db absent.');
  }

  return {
    /**
     * Append une nouvelle entrée d'historique.
     * Idempotent : si la dernière entrée pour ce ledgerRecordId a déjà
     * le même status, ne fait rien et retourne l'entrée existante.
     *
     * @param {object} entry
     * @returns {object} entrée persistée (ou existante si idempotent)
     */
    async append(entry) {
      validateHistoryEntry(entry);

      // Vérification d'idempotence
      const current = await this.getCurrent(entry.ledgerRecordId);
      if (current && current.status === entry.status) {
        // No-op idempotent — pas d'erreur, pas de nouvelle ligne
        return current;
      }

      const id = IDFactory.generate('LedgerRecordStatusHistory');
      const now = new Date().toISOString();

      const record = {
        id,
        ledgerRecordId:     entry.ledgerRecordId,
        status:             entry.status,
        reason:             entry.reason,
        reversedByGroupId:  entry.reversedByGroupId || null,
        decidedBy:          entry.decidedBy,
        decisionRecordId:   entry.decisionRecordId || null,
        createdAt:          now,
      };

      await db.insert('LedgerRecordStatusHistory', record);
      return record;
    },

    /**
     * Retourne le statut courant d'un LedgerRecord.
     * Si aucune entrée → statut par défaut POSTED (implicite).
     *
     * @param {string} ledgerRecordId
     * @returns {object|null} dernière entrée OU statut par défaut OU null si record inconnu
     */
    async getCurrent(ledgerRecordId) {
      const rows = await db.query(
        'LedgerRecordStatusHistory',
        { ledgerRecordId },
        { orderBy: 'createdAt DESC', limit: 1 }
      );

      if (rows && rows.length > 0) {
        return rows[0];
      }

      // Aucune entrée → POSTED par défaut (sémantique D-060-E)
      // On retourne null pour signaler "pas d'entrée explicite, statut par défaut"
      // Le caller peut traiter null comme POSTED implicite.
      return null;
    },

    /**
     * Retourne l'historique complet d'un LedgerRecord, ordonné chronologiquement.
     *
     * @param {string} ledgerRecordId
     * @returns {Array<object>} historique chronologique
     */
    async getHistory(ledgerRecordId) {
      return await db.query(
        'LedgerRecordStatusHistory',
        { ledgerRecordId },
        { orderBy: 'createdAt ASC' }
      );
    },

    /**
     * Helper : retourne le statut effectif (sémantique) d'un LedgerRecord.
     * Convertit null → 'POSTED' selon la règle par défaut.
     *
     * @param {string} ledgerRecordId
     * @returns {'POSTED' | 'REVERSED' | 'REVERSAL_OF'}
     */
    async getEffectiveStatus(ledgerRecordId) {
      const current = await this.getCurrent(ledgerRecordId);
      return current ? current.status : 'POSTED';
    },

    /**
     * Helper : retourne true si le LedgerRecord est ACTIF
     * (à inclure dans les calculs de bilan).
     * Actif = POSTED ou REVERSAL_OF. Inactif = REVERSED.
     *
     * @param {string} ledgerRecordId
     * @returns {boolean}
     */
    async isActive(ledgerRecordId) {
      const status = await this.getEffectiveStatus(ledgerRecordId);
      return status === 'POSTED' || status === 'REVERSAL_OF';
    },

    /**
     * Filtre une liste de LedgerRecords pour ne retourner que les actifs.
     * À utiliser avant les calculs de bilan.
     *
     * @param {Array<object>} records — LedgerRecords bruts
     * @returns {Array<object>} records actifs (POSTED ou REVERSAL_OF)
     */
    async filterActive(records) {
      // Optimisation : un seul query batch au lieu de N queries
      const ids = records.map(r => r.systemId || r.id);
      const statuses = await db.query(
        'LedgerRecordStatusHistory',
        { ledgerRecordId: { in: ids } },
        { orderBy: 'createdAt DESC' }
      );

      // Construire la map ledgerRecordId → dernier status
      const statusMap = new Map();
      for (const s of statuses) {
        if (!statusMap.has(s.ledgerRecordId)) {
          statusMap.set(s.ledgerRecordId, s.status);
        }
      }

      // Filtrer : actif = POSTED (défaut implicite) ou REVERSAL_OF
      return records.filter(r => {
        const id = r.systemId || r.id;
        const status = statusMap.get(id) || 'POSTED';
        return status === 'POSTED' || status === 'REVERSAL_OF';
      });
    },
  };
}

module.exports = {
  makeLedgerRecordStatusHistoryRepository,
  VALID_STATUSES,
  validateHistoryEntry,
};