/**
 * MICRO RAVE V3 — CommercialOperationGuard
 * ============================================================
 * Source : K-FISCAL-01 · D-060-B · 2026-05-23
 *
 * Guard qui bloque les nouvelles transactions COMMERCIALES si le
 * dernier snapshot K-FISCAL-01 est en niveau ROUGE.
 *
 * Distinction critique entre :
 *   - Transactions COMMERCIALES : encaissements clients, payouts,
 *     reconnaissances revenu (bloqués si ROUGE)
 *   - Transactions DE RÉGULARISATION : reversals, corrections,
 *     ajustements internes, écritures pilotes (autorisés même ROUGE
 *     pour permettre de sortir de la situation)
 *
 * Ce guard est appelé EN AMONT de recordTransaction() par les
 * services métier (EngagementService, PaymentService, etc.) — pas
 * par recordTransaction() lui-même, pour ne pas bloquer la
 * régularisation qui doit pouvoir se faire même en ROUGE.
 *
 * ============================================================
 */

'use strict';

/**
 * Types de transaction COMMERCIALES (bloqués si K-FISCAL-01 ROUGE).
 * Liste explicite (whitelist) plutôt que blacklist pour sécurité.
 */
const COMMERCIAL_TRANSACTION_TYPES = new Set([
  'encaissement_depot',
  'encaissement_solde',
  'encaissement_saas',
  'encaissement_billet',
  'encaissement_commandite',
  'payout_executed',
  'reconnaissance_revenu',
  'amendment_delta',
  // Nouveaux types commerciaux à ajouter ici au fur et à mesure
]);

/**
 * Types de transaction AUTORISÉS même en ROUGE (régularisation,
 * correction, ajustement, écritures internes).
 * Pour traçabilité — ne pas bloquer la sortie de crise.
 */
const ALLOWED_DURING_LOCKDOWN_TYPES = new Set([
  'reversal_pierre_de_rosette',
  'ajustement_arrondi',
  'ajustement_clôture',
  'reclassement_interne',
  'remise_tps',
  'remise_tvq',
  'INT-CAPTURE',
  'audit_correction',
  'retroactive_pierre_de_rosette',
]);

/**
 * Helper : un transactionType est-il un reversal ?
 */
function isReversal(transactionType) {
  return transactionType?.startsWith('reversal_');
}

/**
 * Helper : un transactionType est-il commercial ?
 */
function isCommercial(transactionType) {
  return COMMERCIAL_TRANSACTION_TYPES.has(transactionType);
}

/**
 * Valide qu'une transaction est autorisée selon l'état courant
 * de K-FISCAL-01.
 *
 * @param {object} params
 * @param {string} params.transactionType
 * @param {object} params.repositories — { kpiSnapshots, commercialOperationLock }
 * @throws {Error} si bloquée
 */
async function assertCommercialOperationAllowed({ transactionType, repositories }) {
  // Toujours autoriser les types explicitement listés
  if (ALLOWED_DURING_LOCKDOWN_TYPES.has(transactionType)) return;
  if (isReversal(transactionType)) return;

  // Si pas une transaction commerciale, on laisse passer (sera capturé
  // par d'autres guards spécialisés si besoin)
  if (!isCommercial(transactionType)) {
    console.warn(JSON.stringify({
      level:           'WARN',
      event:           'commercial_operation_guard_unknown_type',
      transactionType,
      action:          'Type non classifié. Ajouter à COMMERCIAL_ ou ALLOWED_DURING_LOCKDOWN_.',
      source:          'K-FISCAL-01',
    }));
    return;
  }

  // Vérifier le verrou de lockdown
  let lockActive = false;
  let lockReason = '';
  if (repositories?.commercialOperationLock?.isActive) {
    const lock = await repositories.commercialOperationLock.isActive();
    if (lock?.active) {
      lockActive = true;
      lockReason = lock.reason || 'raison non spécifiée';
    }
  }

  // Vérifier directement le dernier snapshot (double sécurité)
  let kpiLevel = null;
  if (repositories?.kpiSnapshots?.getLatest) {
    const snapshot = await repositories.kpiSnapshots.getLatest('K-FISCAL-01');
    if (snapshot) {
      kpiLevel = snapshot.level;
    }
  }

  if (lockActive || kpiLevel === 'ROUGE') {
    throw new Error(
      `COMMERCIAL_OPERATION_GUARD: nouvelle transaction commerciale "${transactionType}" ` +
      `BLOQUÉE. K-FISCAL-01 en niveau ROUGE (${lockReason}). ` +
      `Action : audit pipeline fiscal + validation fiscaliste externe avant reprise. ` +
      `Les écritures de régularisation, reversal et ajustement restent autorisées. ` +
      `Source : K-FISCAL-01 · D-060-B.`
    );
  }

  // Niveau ORANGE : avertissement mais on laisse passer
  if (kpiLevel === 'ORANGE') {
    console.warn(JSON.stringify({
      level:           'WARN',
      event:           'commercial_operation_under_orange_alert',
      transactionType,
      kpiLevel,
      action:          'Transaction autorisée mais plan correctif requis sous 30j.',
      source:          'K-FISCAL-01',
    }));
  }
}

/**
 * Factory du repository CommercialOperationLock (à implémenter selon DB).
 *
 * @param {object} db
 * @returns {object} repository
 */
function makeCommercialOperationLockRepository(db) {
  return {
    async activate({ reason, triggeredBy, triggeredAt }) {
      // Append-only : on insère un nouvel enregistrement d'activation.
      // Le verrou est "actif" si la dernière entrée est ACTIVATE.
      await db.insert('CommercialOperationLockHistory', {
        action:      'ACTIVATE',
        reason,
        triggeredBy,
        triggeredAt: triggeredAt || new Date().toISOString(),
      });
    },

    async deactivate({ reason, triggeredBy, decisionRecordId }) {
      await db.insert('CommercialOperationLockHistory', {
        action:           'DEACTIVATE',
        reason,
        triggeredBy,
        decisionRecordId, // Obligatoire : la levée du lock doit être justifiée
        triggeredAt:      new Date().toISOString(),
      });
    },

    async isActive() {
      const last = await db.query(
        'CommercialOperationLockHistory',
        {},
        { orderBy: 'triggeredAt DESC', limit: 1 }
      );
      if (!last || last.length === 0) {
        return { active: false };
      }
      const entry = last[0];
      return {
        active:       entry.action === 'ACTIVATE',
        reason:       entry.reason,
        since:        entry.triggeredAt,
        triggeredBy:  entry.triggeredBy,
      };
    },
  };
}

export default {
assertCommercialOperationAllowed,
  makeCommercialOperationLockRepository,
  COMMERCIAL_TRANSACTION_TYPES,
  ALLOWED_DURING_LOCKDOWN_TYPES,
  isReversal,
  isCommercial,

};
export { assertCommercialOperationAllowed, makeCommercialOperationLockRepository, COMMERCIAL_TRANSACTION_TYPES, ALLOWED_DURING_LOCKDOWN_TYPES, isReversal, isCommercial };