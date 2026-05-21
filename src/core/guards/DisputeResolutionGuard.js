/**
 * MICRO RAVE V3 — DisputeResolutionGuard
 * ============================================================
 * Guard pour la resolution des disputes :
 *   disputed → payable           (TALENT_WINS ou ORGANIZER_WINS — payout normal)
 *   disputed → partially_settled (SPLIT — SC-08-PARTIEL, deliveryRecognizedRatio)
 *   disputed → refunded          (ORGANIZER_WINS complet — remboursement organisateur)
 *
 * Source : D-074 · OS V15
 *
 * CONDITIONS :
 *   - decisionRecord obligatoire avec decision dans ['TALENT_WINS', 'ORGANIZER_WINS', 'SPLIT']
 *   - actorRole dans ['admin', 'FOUNDER'] uniquement
 *     (seul un admin ou fondateur peut resoudre un litige)
 *   - settlementInstructionId obligatoire si decision === 'SPLIT'
 *   - deliveryRecognizedRatio obligatoire si partiellement_settled (entier ppm 0-1_000_000)
 *
 * Mappage decision → targetState :
 *   TALENT_WINS      → payable           (payout normal talent)
 *   ORGANIZER_WINS   → refunded          (remboursement organisateur)
 *   SPLIT            → partially_settled (partage selon deliveryRecognizedRatio)
 *
 * CE GUARD NE TOUCHE PAS LA DATABASE.
 *   Retourne { passed, resolutionRecord } a l'appelant.
 * ============================================================
 */

'use strict';

const IDFactory = require('../IDFactory');

const COVERED_TRANSITIONS = new Set([
  'disputed->payable',
  'disputed->partially_settled',
  'disputed->refunded',
]);

const AUTHORIZED_ROLES       = new Set(['admin', 'FOUNDER']);
const VALID_DECISIONS        = new Set(['TALENT_WINS', 'ORGANIZER_WINS', 'SPLIT']);

// Mappage decision → targetState attendu
const DECISION_TO_STATE = {
  TALENT_WINS:    'payable',
  ORGANIZER_WINS: 'refunded',
  SPLIT:          'partially_settled',
};

async function validate({
  engagementId,
  currentState,
  targetState,
  actor,
  context = {},
  repositories = {},
}) {
  const transitionKey = `${currentState}->${targetState}`;

  if (!COVERED_TRANSITIONS.has(transitionKey)) {
    return {
      passed: false,
      reason: `GUARD_MISMATCH: DisputeResolutionGuard ne couvre pas "${transitionKey}". ` +
              `Transitions couvertes : ${[...COVERED_TRANSITIONS].join(', ')}.`,
    };
  }

  const { decisionRecord, actorRole, settlementInstructionId, deliveryRecognizedRatio } = context;

  // actorRole obligatoire et restreint
  if (!actorRole || !AUTHORIZED_ROLES.has(actorRole)) {
    return {
      passed: false,
      reason: `RESOLUTION_UNAUTHORIZED_ROLE: actorRole "${actorRole}" non autorise. ` +
               `Seuls ${[...AUTHORIZED_ROLES].join(', ')} peuvent resoudre une dispute. ` +
               `Source : D-074.`,
    };
  }

  // decisionRecord obligatoire
  if (!decisionRecord) {
    return {
      passed: false,
      reason: `RESOLUTION_MISSING_DECISION: decisionRecord obligatoire pour resoudre un litige. ` +
               `Source : D-074 · GREFFIER-01.`,
    };
  }

  if (!VALID_DECISIONS.has(decisionRecord.decision)) {
    return {
      passed: false,
      reason: `RESOLUTION_INVALID_DECISION: decision "${decisionRecord.decision}" invalide. ` +
               `Valeurs valides : ${[...VALID_DECISIONS].join(', ')}. Source : D-074.`,
    };
  }

  // Verifier la coherence decision → targetState
  const expectedState = DECISION_TO_STATE[decisionRecord.decision];
  if (expectedState !== targetState) {
    return {
      passed: false,
      reason: `RESOLUTION_STATE_MISMATCH: decision "${decisionRecord.decision}" requiert ` +
               `targetState "${expectedState}" mais recu "${targetState}". ` +
               `Source : D-074 mappage decision→etat.`,
    };
  }

  // SPLIT : settlementInstructionId obligatoire
  if (decisionRecord.decision === 'SPLIT') {
    if (!settlementInstructionId) {
      return {
        passed: false,
        reason: `RESOLUTION_SPLIT_MISSING_INSTRUCTION: settlementInstructionId obligatoire ` +
                 `pour decision SPLIT. Source : D-074 · SC-08-PARTIEL.`,
      };
    }
    // deliveryRecognizedRatio obligatoire pour SPLIT (entier ppm 0-1_000_000)
    if (
      deliveryRecognizedRatio === undefined ||
      !Number.isInteger(deliveryRecognizedRatio) ||
      deliveryRecognizedRatio < 0 ||
      deliveryRecognizedRatio > 1_000_000
    ) {
      return {
        passed: false,
        reason: `RESOLUTION_SPLIT_INVALID_RATIO: deliveryRecognizedRatio doit etre un entier ` +
                 `entre 0 et 1_000_000 ppm. Recu : ${deliveryRecognizedRatio}. ` +
                 `Source : D-064 · SC-08-PARTIEL.`,
      };
    }
  }

  const resolutionRecord = {
    systemId:               IDFactory.generate('AdminAction'),  // AdminAction = acte de resolution D-107
    engagementId,
    decision:               decisionRecord.decision,
    targetState,
    actorRole,
    actor,
    decisionRecordId:       decisionRecord.systemId || decisionRecord.id,
    settlementInstructionId: settlementInstructionId || null,
    deliveryRecognizedRatio: decisionRecord.decision === 'SPLIT' ? deliveryRecognizedRatio : null,
    resolvedAt:              new Date().toISOString(),
  };

  return {
    passed: true,
    resolutionRecord,
    audit: {
      engagementId,
      decision:           decisionRecord.decision,
      targetState,
      actorRole,
      settlementInstructionId: settlementInstructionId || null,
    },
  };
}

module.exports = { validate, COVERED_TRANSITIONS, AUTHORIZED_ROLES, DECISION_TO_STATE };