/**
 * MICRO RAVE V3 — TransferGuard
 * ============================================================
 * Guard pour le transfert de talent entre Engagements.
 *
 * Source : D-074 · OS V15
 *
 * Transitions couvertes (TRANSITION_TABLE) :
 *   deposit_secured     → transfer_requested    (demande de transfert par organisateur)
 *   transfer_requested  → transfer_accepted     (talent de remplacement accepte)
 *   transfer_requested  → transfer_refused      (talent de remplacement refuse)
 *   transfer_requested  → no_show_pre_event     (delai depasse sans reponse)
 *   transfer_accepted   → placed                (retour au pipeline normal)
 *   transfer_refused    → placed                (retour au pipeline, talent original conserve)
 *
 * CE GUARD NE TOUCHE PAS LA DATABASE.
 *   Retourne { passed, transferRecord } a l'appelant.
 * ============================================================
 */

'use strict';

import IDFactory from '../IDFactory.js';
const COVERED_TRANSITIONS = new Set([
  'deposit_secured->transfer_requested',
  'transfer_requested->transfer_accepted',
  'transfer_requested->transfer_refused',
  'transfer_requested->no_show_pre_event',
  'transfer_accepted->placed',
  'transfer_refused->placed',
]);

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
      reason: `GUARD_MISMATCH: TransferGuard ne couvre pas "${transitionKey}". ` +
              `Transitions couvertes : ${[...COVERED_TRANSITIONS].join(', ')}.`,
    };
  }

  switch (transitionKey) {
    case 'deposit_secured->transfer_requested':
      return validateTransferRequest({ engagementId, actor, context });

    case 'transfer_requested->transfer_accepted':
      return validateTransferAccepted({ engagementId, actor, context });

    case 'transfer_requested->transfer_refused':
      return validateTransferRefused({ engagementId, actor, context });

    case 'transfer_requested->no_show_pre_event':
      // Expiration delai sans reponse — systeme ou admin
      return validateTransferNoShow({ engagementId, actor, context });

    case 'transfer_accepted->placed':
    case 'transfer_refused->placed':
      // Retour pipeline normal — validation minimale
      return validateRetourPipeline({ engagementId, currentState, actor, context });

    default:
      return { passed: false, reason: `GUARD_UNKNOWN_TRANSITION: "${transitionKey}"` };
  }
}

// ── deposit_secured → transfer_requested ─────────────────────
// Demande initiale de transfert par l'organisateur.
// newTalentUserId obligatoire, != originalTalentUserId, consentement organisateur.

function validateTransferRequest({ engagementId, actor, context }) {
  const { newTalentUserId, originalTalentUserId, transferApprovedByOrganizer, actorRole } = context;

  if (!newTalentUserId) {
    return {
      passed: false,
      reason: `TRANSFER_MISSING_NEW_TALENT: newTalentUserId obligatoire pour une demande de transfert.`,
    };
  }

  if (originalTalentUserId && newTalentUserId === originalTalentUserId) {
    return {
      passed: false,
      reason: `TRANSFER_SAME_TALENT: newTalentUserId "${newTalentUserId}" identique a ` +
               `originalTalentUserId. Un transfert vers soi-meme est impossible.`,
    };
  }

  if (!transferApprovedByOrganizer) {
    return {
      passed: false,
      reason: `TRANSFER_MISSING_ORGANIZER_APPROVAL: transferApprovedByOrganizer doit etre true. ` +
               `Consentement de l'organisateur obligatoire pour initier un transfert. Source : D-074.`,
    };
  }

  return {
    passed: true,
    transferRecord: {
      systemId:                 IDFactory.generate('Engagement'),  // prefixe transitoire — IDFactory a ENG-*
      engagementId,
      transferType:             'TRANSFER_REQUESTED',
      newTalentUserId,
      originalTalentUserId:     originalTalentUserId || null,
      transferApprovedByOrganizer,
      requestedAt:              new Date().toISOString(),
    },
    audit: { engagementId, newTalentUserId, originalTalentUserId, transferApprovedByOrganizer },
  };
}

// ── transfer_requested → transfer_accepted ───────────────────

function validateTransferAccepted({ engagementId, actor, context }) {
  const { newTalentUserId, acceptedByNewTalent } = context;

  if (!newTalentUserId) {
    return {
      passed: false,
      reason: `TRANSFER_MISSING_NEW_TALENT: newTalentUserId obligatoire pour transfer_accepted.`,
    };
  }

  if (!acceptedByNewTalent) {
    return {
      passed: false,
      reason: `TRANSFER_ACCEPTANCE_REQUIRED: acceptedByNewTalent doit etre true. ` +
               `Le talent de remplacement doit accepter explicitement.`,
    };
  }

  return {
    passed: true,
    transferRecord: {
      systemId:    IDFactory.generate('Engagement'),
      engagementId,
      transferType: 'TRANSFER_ACCEPTED',
      newTalentUserId,
      acceptedAt:   new Date().toISOString(),
    },
    audit: { engagementId, newTalentUserId, outcome: 'ACCEPTED' },
  };
}

// ── transfer_requested → transfer_refused ────────────────────

function validateTransferRefused({ engagementId, actor, context }) {
  const { refusalReason } = context;

  return {
    passed: true,
    transferRecord: {
      systemId:    IDFactory.generate('Engagement'),
      engagementId,
      transferType: 'TRANSFER_REFUSED',
      refusalReason: refusalReason || null,
      refusedAt:    new Date().toISOString(),
    },
    audit: { engagementId, outcome: 'REFUSED' },
  };
}

// ── transfer_requested → no_show_pre_event ───────────────────
// Delai depasse sans reponse du talent de remplacement.

function validateTransferNoShow({ engagementId, actor, context }) {
  return {
    passed: true,
    transferRecord: {
      systemId:    IDFactory.generate('Engagement'),
      engagementId,
      transferType: 'TRANSFER_NO_SHOW',
      expiredAt:    new Date().toISOString(),
    },
    audit: { engagementId, outcome: 'NO_SHOW_PRE_EVENT' },
  };
}

// ── transfer_accepted/refused → placed ───────────────────────
// Retour au pipeline normal apres resolution du transfert.

function validateRetourPipeline({ engagementId, currentState, actor, context }) {
  return {
    passed: true,
    transferRecord: {
      systemId:    IDFactory.generate('Engagement'),
      engagementId,
      transferType: 'TRANSFER_PIPELINE_RESTORED',
      fromState:    currentState,
      restoredAt:   new Date().toISOString(),
    },
    audit: { engagementId, fromState: currentState, outcome: 'PLACED' },
  };
}

export default {
validate, COVERED_TRANSITIONS 
};
export { validate, COVERED_TRANSITIONS };