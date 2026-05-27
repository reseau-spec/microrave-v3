/**
 * MICRO RAVE V3 — Guards de complétion
 * ============================================================
 * Source : D-038-B · D-060-B · 2026-05-23
 *
 * Deux guards mentionnés dans les décisions ratifiées mais absents
 * du code livré par l'autre Claude :
 *
 *   1. StripeReferenceGuard (D-038-B)
 *      → bloque un groupe Stripe sans stripeTransferId valide
 *      → vérifie le format des préfixes Stripe-standards
 *      → vérifie que transfer_group côté Stripe matche engagementId
 *        (vérification optionnelle, désactivable si Stripe API absent)
 *
 *   2. Account6690DualApprovalGuard (D-060-B)
 *      → bloque toute écriture en 6690 > 10 000 ¢ (100 $) sans
 *        approbation duale (FOUNDER + ADMIN_FINANCE)
 *      → vérifie metadata.dualApproval { founderUserId, adminFinanceUserId,
 *        approvedAt }
 *
 * Ces guards sont à câbler dans recordTransaction() :
 *   - StripeReferenceGuard : avant la résolution reconciliationKey
 *   - Account6690DualApprovalGuard : juste après validateAccount6690()
 * ============================================================
 */

'use strict';

// ============================================================
// GUARD 1 — StripeReferenceGuard (D-038-B)
// ============================================================

const VALID_STRIPE_PREFIXES = [
  'pi_',   // PaymentIntent
  'ch_',   // Charge
  'tr_',   // Transfer
  'po_',   // Payout
  're_',   // Refund
  'dp_',   // Dispute
];

/**
 * Types de transaction qui IMPLIQUENT un mouvement Stripe.
 * Si le transactionType est dans cette liste, stripeTransferId est obligatoire.
 *
 * Note : la liste est volontairement explicite (whitelist) plutôt
 * qu'une heuristique sur les comptes 5100/5200, car certaines
 * écritures internes mouvementent 5100/5200 sans Stripe (transferts
 * comptables, ajustements). C'est le transactionType qui qualifie.
 */
const STRIPE_TRANSACTION_TYPES = new Set([
  'encaissement_depot',
  'encaissement_solde',
  'encaissement_saas',
  'encaissement_billet',
  'encaissement_commandite',
  'payout_executed',
  'refund',
  'chargeback',
  'capture_stripe',
  'transfer_connect',
]);

/**
 * Valide qu'un groupe Stripe porte un stripeTransferId conforme.
 *
 * @param {object} params
 * @param {string} params.transactionType
 * @param {string|null} params.stripeTransferId
 * @param {Array<string>} [params.stripeReferences] — multi-référence (D-038-B)
 * @param {Array<object>} params.entries
 * @throws si écriture Stripe sans référence ou avec format invalide
 */
function validateStripeReference({
  transactionType,
  stripeTransferId,
  stripeReferences = [],
  entries,
}) {
  const requiresStripeRef = STRIPE_TRANSACTION_TYPES.has(transactionType);

  // Cas 1 — transactionType implique Stripe : référence obligatoire
  if (requiresStripeRef) {
    const hasRef = stripeTransferId || (stripeReferences && stripeReferences.length > 0);
    if (!hasRef) {
      throw new Error(
        `STRIPE_REFERENCE_GUARD: transactionType="${transactionType}" implique un mouvement ` +
        `Stripe réel, mais aucun stripeTransferId fourni. ` +
        `Préfixes valides : ${VALID_STRIPE_PREFIXES.join(', ')}. ` +
        `Source : D-038-B.`
      );
    }
  }

  // Cas 2 — Si stripeTransferId fourni, valider son format
  if (stripeTransferId) {
    const isValidFormat = VALID_STRIPE_PREFIXES.some(p => stripeTransferId.startsWith(p));
    if (!isValidFormat) {
      throw new Error(
        `STRIPE_REFERENCE_GUARD: stripeTransferId="${stripeTransferId}" mal formé. ` +
        `Doit commencer par un préfixe Stripe standard : ${VALID_STRIPE_PREFIXES.join(', ')}. ` +
        `Source : D-038-B.`
      );
    }
  }

  // Cas 3 — Si stripeReferences[] fourni, valider chaque élément
  if (Array.isArray(stripeReferences)) {
    for (const ref of stripeReferences) {
      const isValidFormat = VALID_STRIPE_PREFIXES.some(p => ref.startsWith(p));
      if (!isValidFormat) {
        throw new Error(
          `STRIPE_REFERENCE_GUARD: stripeReferences contient "${ref}" mal formé. ` +
          `Tous les éléments doivent commencer par : ${VALID_STRIPE_PREFIXES.join(', ')}. ` +
          `Source : D-038-B.`
        );
      }
    }
  }

  // Cas 4 — Cohérence : si le groupe touche 5100/5200, vérifier qu'il y a une ref
  // (sauf si transactionType explicitement marqué comme interne)
  const touchesStripeAccounts = entries.some(
    e => e.account === '5100' || e.account === '5200'
  );
  const internalTypes = new Set([
    'INT-CAPTURE', 'ajustement_arrondi', 'reclassement_interne',
    'ajustement_clôture', 'reversal_pierre_de_rosette',
  ]);

  if (touchesStripeAccounts && !stripeTransferId && !stripeReferences.length) {
    if (!internalTypes.has(transactionType) && !transactionType.startsWith('reversal_')) {
      console.warn(JSON.stringify({
        level:           'WARN',
        event:           'stripe_account_without_reference',
        transactionType,
        action:          'Vérifier que ce groupe ne devrait pas porter un stripeTransferId.',
        source:          'D-038-B',
      }));
    }
  }
}

/**
 * Validation OPTIONNELLE — appelle Stripe pour vérifier que transfer_group
 * matche engagementId. À activer seulement si STRIPE_API_KEY présent et
 * mode strict activé. Pour MVP, désactivable.
 *
 * @param {object} params
 * @param {string} params.stripeTransferId
 * @param {string} params.engagementId
 * @param {object} [params.stripeClient] — instance Stripe SDK
 * @returns {Promise<{verified: boolean, mismatch?: string}>}
 */
async function verifyStripeTransferGroup({ stripeTransferId, engagementId, stripeClient }) {
  if (!stripeClient || !stripeTransferId || !engagementId) {
    return { verified: false, mismatch: 'check_skipped' };
  }

  try {
    let stripeObject = null;

    // Router selon le préfixe
    if (stripeTransferId.startsWith('tr_')) {
      stripeObject = await stripeClient.transfers.retrieve(stripeTransferId);
    } else if (stripeTransferId.startsWith('ch_')) {
      stripeObject = await stripeClient.charges.retrieve(stripeTransferId);
    } else if (stripeTransferId.startsWith('pi_')) {
      stripeObject = await stripeClient.paymentIntents.retrieve(stripeTransferId);
    } else {
      // Autres types : on ne peut pas vérifier transfer_group de la même façon
      return { verified: false, mismatch: 'unsupported_type_for_verification' };
    }

    const expectedGroup = `event_${engagementId}`;
    if (stripeObject.transfer_group !== expectedGroup) {
      return {
        verified: false,
        mismatch: `transfer_group côté Stripe = "${stripeObject.transfer_group}", ` +
                  `attendu = "${expectedGroup}"`,
      };
    }

    return { verified: true };

  } catch (err) {
    console.warn(JSON.stringify({
      level:    'WARN',
      event:    'stripe_verify_transfer_group_failed',
      stripeTransferId,
      error:    err.message,
      source:   'D-038-B',
    }));
    return { verified: false, mismatch: 'stripe_api_error' };
  }
}

// ============================================================
// GUARD 2 — Account6690DualApprovalGuard (D-060-B)
// ============================================================

/**
 * Seuil au-delà duquel l'approbation duale est obligatoire pour 6690.
 * Source : D-060-B (100 $ = 10 000 centimes).
 */
const ACCOUNT_6690_DUAL_APPROVAL_THRESHOLD_CENTS = 10000;

/**
 * Valide que toute écriture > 100 $ en 6690 porte une approbation duale.
 *
 * Structure attendue dans metadata.dualApproval :
 *   {
 *     founderUserId:       'user_xxx',
 *     adminFinanceUserId:  'user_yyy',
 *     approvedAt:          '2026-05-23T...',
 *     approvalDecisionRecordId: 'DR-...' (optionnel)
 *   }
 *
 * @param {Array<object>} entries
 * @param {object} metadata
 * @throws si seuil dépassé sans approbation duale valide
 */
function validateAccount6690DualApproval(entries, metadata) {
  const lines6690 = entries.filter(e => e.account === '6690');
  if (lines6690.length === 0) return;

  // Calcul du total 6690 dans ce groupe (DEBIT)
  const total6690Debit = lines6690
    .filter(e => e.direction === 'DEBIT')
    .reduce((sum, e) => sum + e.amountCents, 0);

  if (total6690Debit <= ACCOUNT_6690_DUAL_APPROVAL_THRESHOLD_CENTS) {
    // Sous le seuil : pas d'approbation duale requise
    return;
  }

  // Au-dessus du seuil : approbation duale obligatoire
  const approval = metadata?.dualApproval;
  if (!approval) {
    throw new Error(
      `ACCOUNT_6690_DUAL_APPROVAL_GUARD: écriture en 6690 de ${total6690Debit} ¢ ` +
      `(${(total6690Debit / 100).toFixed(2)} $) dépasse le seuil de ` +
      `${(ACCOUNT_6690_DUAL_APPROVAL_THRESHOLD_CENTS / 100).toFixed(2)} $ ` +
      `sans metadata.dualApproval. ` +
      `Fournir : { founderUserId, adminFinanceUserId, approvedAt }. ` +
      `Source : D-060-B.`
    );
  }

  if (!approval.founderUserId || !approval.adminFinanceUserId) {
    throw new Error(
      `ACCOUNT_6690_DUAL_APPROVAL_GUARD: metadata.dualApproval incomplet. ` +
      `Requis : founderUserId ET adminFinanceUserId. ` +
      `Reçu founder="${approval.founderUserId}", adminFinance="${approval.adminFinanceUserId}". ` +
      `Source : D-060-B.`
    );
  }

  if (approval.founderUserId === approval.adminFinanceUserId) {
    throw new Error(
      `ACCOUNT_6690_DUAL_APPROVAL_GUARD: founderUserId et adminFinanceUserId ` +
      `doivent être DISTINCTS (principe de séparation des tâches). ` +
      `Reçu : même utilisateur "${approval.founderUserId}" pour les deux rôles. ` +
      `Source : D-060-B.`
    );
  }

  if (!approval.approvedAt) {
    throw new Error(
      `ACCOUNT_6690_DUAL_APPROVAL_GUARD: metadata.dualApproval.approvedAt obligatoire ` +
      `(horodatage ISO de l'approbation). Source : D-060-B.`
    );
  }

  // Vérifier que l'approbation est récente (< 24h)
  const approvedTime = new Date(approval.approvedAt).getTime();
  const nowTime = Date.now();
  const hoursElapsed = (nowTime - approvedTime) / (1000 * 60 * 60);
  if (hoursElapsed > 24) {
    throw new Error(
      `ACCOUNT_6690_DUAL_APPROVAL_GUARD: approbation duale expirée. ` +
      `Approuvée il y a ${hoursElapsed.toFixed(1)} heures, ` +
      `seuil max 24 heures pour éviter les approbations dormantes. ` +
      `Re-solliciter founder + adminFinance. Source : D-060-B.`
    );
  }
}

// ============================================================
// EXPORTS
// ============================================================

export default {
// StripeReferenceGuard (D-038-B)
  validateStripeReference,
  verifyStripeTransferGroup,
  VALID_STRIPE_PREFIXES,
  STRIPE_TRANSACTION_TYPES,

  // Account6690DualApprovalGuard (D-060-B)
  validateAccount6690DualApproval,
  ACCOUNT_6690_DUAL_APPROVAL_THRESHOLD_CENTS,

};
/*
═══════════════════════════════════════════════════════════════════
INTÉGRATION DANS FinancialLedgerService.js — DIFF À APPLIQUER

1. En tête du fichier, ajouter :

  import { validateStripeReference, validateAccount6690DualApproval } from './guards_completion.js';
2. Dans recordTransaction(), après les validations de lignes individuelles
   et AVANT validateAccount6690(), ajouter :

  // ── Guard StripeReference — D-038-B ──────────────────────────
  validateStripeReference({
    transactionType,
    stripeTransferId,
    stripeReferences: metadata?.stripeReferences || [],
    entries,
  });

3. Après l'appel à validateAccount6690(), ajouter :

  // ── Guard Account6690DualApproval — D-060-B ──────────────────
  validateAccount6690DualApproval(entries, metadata);

4. Optionnel (mode strict avec Stripe API) : avant la persistance, ajouter :

  if (stripeTransferId && process.env.STRIPE_VERIFY_TRANSFER_GROUP === 'true') {
    const verif = await verifyStripeTransferGroup({
      stripeTransferId,
      engagementId,
      stripeClient: repositories.stripeClient,
    });
    if (!verif.verified && verif.mismatch !== 'check_skipped') {
      throw new Error(
        `STRIPE_REFERENCE_GUARD: ${verif.mismatch}. Source : D-038-B.`
      );
    }
  }
═══════════════════════════════════════════════════════════════════
*/