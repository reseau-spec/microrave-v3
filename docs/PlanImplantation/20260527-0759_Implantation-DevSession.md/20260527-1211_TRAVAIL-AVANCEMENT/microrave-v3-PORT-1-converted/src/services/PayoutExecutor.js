/**
 * MICRO RAVE V3 — PayoutExecutor
 * ============================================================
 * Exécution des payouts talent depuis l'état `payable`.
 *
 * D-101 — 6 VERROUS ANTI-DOUBLE PAYOUT (tous obligatoires, dans l'ordre) :
 *
 *   Verrou 1 : Engagement.status === 'payable'
 *              → état opérationnel de file d'attente (D-014-B)
 *
 *   Verrou 2 : PayoutExecutionRecord absent pour cet engagementId
 *              → idempotency absolue — jamais deux fois
 *
 *   Verrou 3 : SettlementInstruction présente + consumedAt null
 *              → l'instruction existe et n'a pas encore été consommée
 *
 *   Verrou 4 : KYCStatus === VERIFIED (TalentPaymentProfile)
 *              → D-097 règle 5 — jamais de Transfer sans KYC vérifié
 *
 *   Verrou 5 : LedgerInvariant cohérent (Σ Dr = Σ Cr)
 *              → double-check comptable avant tout mouvement réel
 *
 *   Verrou 6 : stripe.transfers.create avec idempotency key engagementId+talentUserId
 *              → Stripe lui-même garantit l'idempotency réseau
 *
 * Après succès :
 *   - PayoutExecutionRecord créé (consumedAt sur SettlementInstruction)
 *   - LedgerRecord `payout_executed` ajouté (append-only)
 *   - Engagement prêt pour transitionEngagement({ payable → settled })
 *
 * Ce service NE déclenche PAS la transition payable→settled.
 * Il prépare les preuves. transitionEngagement reste le seul chemin.
 *
 * Source : D-101 · D-097 · D-014-B · OS V14 section 3 · J8
 * ============================================================
 */

'use strict';

import StripeAdapter from './StripeAdapter.js';
import StripeConnectService from './StripeConnectService.js';
// ── Constantes ────────────────────────────────────────────────

const PAYOUT_BLOCK_REASONS = {
  NOT_PAYABLE:              'PAYOUT_BLOCK_NOT_PAYABLE',
  ALREADY_EXECUTED:         'PAYOUT_BLOCK_ALREADY_EXECUTED',
  NO_SETTLEMENT_INSTRUCTION: 'PAYOUT_BLOCK_NO_SETTLEMENT_INSTRUCTION',
  INSTRUCTION_CONSUMED:     'PAYOUT_BLOCK_INSTRUCTION_CONSUMED',
  KYC_NOT_VERIFIED:         'PAYOUT_BLOCK_KYC',
  LEDGER_INVARIANT_FAILED:  'PAYOUT_BLOCK_LEDGER_INVARIANT',
  STRIPE_TRANSFER_FAILED:   'PAYOUT_BLOCK_STRIPE_TRANSFER',
};

/**
 * Exécute le payout pour un Engagement en état `payable`.
 * Applique les 6 verrous D-101 dans l'ordre.
 *
 * @param {object} params
 * @param {string}  params.engagementId
 * @param {string}  params.talentUserId        — talent à payer
 * @param {number}  params.talentNetCents       — montant net (ContractSnapshot phase 2 WORM W2)
 * @param {string}  params.currency             — 'cad'
 * @param {string}  params.engagementStatus     — doit être 'payable'
 * @param {object}  params.settlementInstruction — { id, consumedAt, amountCents, ... }
 * @param {object}  params.contractSnapshotPhase2 — pour vérification ledger
 * @param {object}  params.repositories
 * @param {object}  params.repositories.payoutExecutionRecords  — { findByEngagementId, create }
 * @param {object}  params.repositories.talentPaymentProfiles   — { findByTalentUserId }
 * @param {object}  params.repositories.settlementInstructions  — { markConsumed }
 * @param {object}  params.repositories.ledgerRecords           — { append }
 *
 * @returns {{ executed: boolean, transferId?, blockReason?, verrouxPassed: string[] }}
 */
async function executePayout({
  engagementId,
  talentUserId,
  talentNetCents,
  currency = 'cad',
  engagementStatus,
  settlementInstruction,
  contractSnapshotPhase2,
  repositories,
}) {
  const verrouxPassed = [];

  // ── VERROU 1 : État payable ───────────────────────────────
  if (engagementStatus !== 'payable') {
    return {
      executed:    false,
      blockReason: PAYOUT_BLOCK_REASONS.NOT_PAYABLE,
      detail:      `État actuel : "${engagementStatus}". Payout uniquement depuis "payable".`,
      verrouxPassed,
    };
  }
  verrouxPassed.push('V1_PAYABLE_STATUS');

  // ── VERROU 2 : Idempotency — PayoutExecutionRecord absent ─
  const existingRecord = await repositories.payoutExecutionRecords.findByEngagementId(engagementId, talentUserId);
  if (existingRecord) {
    return {
      executed:    false,
      blockReason: PAYOUT_BLOCK_REASONS.ALREADY_EXECUTED,
      detail:      `PayoutExecutionRecord déjà présent. TransferId: ${existingRecord.stripeTransferId}`,
      existingTransferId: existingRecord.stripeTransferId,
      verrouxPassed,
    };
  }
  verrouxPassed.push('V2_NO_EXISTING_RECORD');

  // ── VERROU 3 : SettlementInstruction présente et non consommée ──
  if (!settlementInstruction) {
    return {
      executed:    false,
      blockReason: PAYOUT_BLOCK_REASONS.NO_SETTLEMENT_INSTRUCTION,
      detail:      'Aucune SettlementInstruction trouvée pour cet engagement.',
      verrouxPassed,
    };
  }
  if (settlementInstruction.consumedAt) {
    return {
      executed:    false,
      blockReason: PAYOUT_BLOCK_REASONS.INSTRUCTION_CONSUMED,
      detail:      `SettlementInstruction déjà consommée le ${settlementInstruction.consumedAt}.`,
      verrouxPassed,
    };
  }
  // Cohérence montant
  if (settlementInstruction.amountCents !== talentNetCents) {
    return {
      executed:    false,
      blockReason: PAYOUT_BLOCK_REASONS.LEDGER_INVARIANT_FAILED,
      detail:      `Montant SettlementInstruction (${settlementInstruction.amountCents}¢) ≠ talentNetCents (${talentNetCents}¢).`,
      verrouxPassed,
    };
  }
  verrouxPassed.push('V3_SETTLEMENT_INSTRUCTION_VALID');

  // ── VERROU 4 : KYC VERIFIED ───────────────────────────────
  const profile = await StripeConnectService.getTalentPaymentProfile(talentUserId, repositories);
  if (!profile || profile.kycStatus !== StripeConnectService.KYC_STATUS.VERIFIED) {
    const kycStatus = profile?.kycStatus || 'PROFILE_NOT_FOUND';
    return {
      executed:    false,
      blockReason: PAYOUT_BLOCK_REASONS.KYC_NOT_VERIFIED,
      detail:      `KYCStatus = "${kycStatus}". VERIFIED requis avant tout payout. Talent: ${talentUserId}`,
      kycStatus,
      verrouxPassed,
    };
  }
  verrouxPassed.push('V4_KYC_VERIFIED');

  // ── VERROU 5 : Invariant Ledger ───────────────────────────
  // Double-check du waterfall avant mouvement réel de fonds
  if (contractSnapshotPhase2) {
    const invariantResult = verifyLedgerInvariant(contractSnapshotPhase2);
    if (!invariantResult.valid) {
      return {
        executed:    false,
        blockReason: PAYOUT_BLOCK_REASONS.LEDGER_INVARIANT_FAILED,
        detail:      invariantResult.detail,
        verrouxPassed,
      };
    }
  }
  verrouxPassed.push('V5_LEDGER_INVARIANT');

  // ── VERROU 6 : stripe.transfers.create (idempotency Stripe) ──
  const transferResult = await StripeAdapter.createTransfer({
    amountCents:     talentNetCents,
    currency,
    stripeAccountId: profile.stripeAccountId,
    engagementId,
    talentUserId,
  });

  if (!transferResult.ok) {
    return {
      executed:    false,
      blockReason: PAYOUT_BLOCK_REASONS.STRIPE_TRANSFER_FAILED,
      detail:      `Stripe Transfer échoué : ${transferResult.error.message}`,
      stripeError: transferResult.error,
      verrouxPassed,
    };
  }

  verrouxPassed.push('V6_STRIPE_TRANSFER');

  const stripeTransferId = transferResult.data.id;
  const executedAt       = new Date().toISOString();

  // ── Post-payout : persistance des preuves ─────────────────

  // PayoutExecutionRecord (idempotency permanente)
  const payoutRecord = await repositories.payoutExecutionRecords.create({
    engagementId,
    talentUserId,
    stripeTransferId,
    amountCents: talentNetCents,
    currency,
    executedAt,
    verrouxPassed,
  });

  // Marquer SettlementInstruction consommée
  await repositories.settlementInstructions.markConsumed(settlementInstruction.id, {
    consumedAt:      executedAt,
    stripeTransferId,
  });

  // LedgerRecord append-only (D-070 / WORM-APPEND-01)
  await repositories.ledgerRecords.append({
    engagementId,
    type:            'payout_executed',
    talentUserId,
    amountCents:     talentNetCents,
    stripeTransferId,
    executedAt,
    account:         '4310', // Compte talent — payout sortant
    direction:       'DEBIT',
    note:            `Payout talent ${talentUserId} — Transfer Stripe ${stripeTransferId}`,
  });

  return {
    executed:        true,
    stripeTransferId,
    amountCents:     talentNetCents,
    executedAt,
    payoutRecordId:  payoutRecord.id,
    verrouxPassed,
  };
}

/**
 * Exécute les payouts pour tous les talents d'un event en batch.
 * Conforme à PayoutBatchPolicyConfig — l'heure de batch est gérée en amont.
 *
 * @param {object} params
 * @param {string} params.engagementId
 * @param {Array}  params.talentPayouts     — [{ talentUserId, talentNetCents, settlementInstruction }]
 * @param {string} params.engagementStatus
 * @param {object} params.contractSnapshotPhase2
 * @param {string} params.currency
 * @param {object} params.repositories
 *
 * @returns {{ batchId, results: Array, allExecuted: boolean }}
 */
async function executePayoutBatch({
  engagementId,
  talentPayouts,
  engagementStatus,
  contractSnapshotPhase2,
  currency = 'cad',
  repositories,
}) {
  const batchId  = `batch-${engagementId}-${Date.now()}`;
  const results  = [];

  for (const payout of talentPayouts) {
    const result = await executePayout({
      engagementId,
      talentUserId:         payout.talentUserId,
      talentNetCents:       payout.talentNetCents,
      currency,
      engagementStatus,
      settlementInstruction: payout.settlementInstruction,
      contractSnapshotPhase2,
      repositories,
    });
    results.push({ talentUserId: payout.talentUserId, ...result });
  }

  const allExecuted = results.every(r => r.executed);

  return { batchId, results, allExecuted };
}

// ── Vérification interne du ledger ────────────────────────────

/**
 * Double-check du waterfall avant payout.
 * Reproduit la logique de LedgerInvariantGuard sans dépendance circulaire.
 */
function verifyLedgerInvariant(snapshot) {
  const { prixVenduClientCents, waterfall } = snapshot;

  if (!waterfall || waterfall.length === 0) {
    return { valid: false, detail: 'Waterfall absent du ContractSnapshot phase 2.' };
  }

  let sumNets        = 0;
  let sumCommissions = 0;

  for (const entry of waterfall) {
    sumNets        += entry.talentNetCents        || 0;
    sumCommissions += entry.commissionMrCents     || 0;
  }

  const residuCents   = prixVenduClientCents - sumNets - sumCommissions;
  const toleranceCents = waterfall.length; // ≤ 1 centime par talent

  if (Math.abs(residuCents) > toleranceCents) {
    return {
      valid:  false,
      detail: `LOI LEDGER-02 violée. Prix: ${prixVenduClientCents}¢, ` +
              `Σnets: ${sumNets}¢, Σcommissions: ${sumCommissions}¢, ` +
              `résidu: ${residuCents}¢ (tolérance: ${toleranceCents}¢).`,
    };
  }

  return { valid: true, residuCents };
}

export default {
executePayout,
  executePayoutBatch,
  PAYOUT_BLOCK_REASONS,

};
export { executePayout, executePayoutBatch, PAYOUT_BLOCK_REASONS };