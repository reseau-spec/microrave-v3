/**
 * MICRO RAVE V3 — DisputeGuard
 * ============================================================
 * Guard pour les transitions vers disputed.
 *
 * Source : D-019-B · OS V15 §2.7.1 · Plan Phase 2.3
 *
 * Deux regimes distincts :
 *
 * REGIME 1 — Frein d'Urgence (depuis les 9 etats autorises) :
 *   proposed, negotiating, accepted, placed, deposit_pending,
 *   deposit_secured, event_sealed, performed, payable
 *   Conditions : evidenceBundleId + disputeReason + actorRole autorise.
 *   Source : D-019-B TRANSITION_TABLE lignes 137-145.
 *
 * REGIME 2 — Contestation de Prestation (depuis contestation_window) :
 *   contestation_window → disputed
 *   Conditions : evidenceBundleId + disputeReason + contestationWindowOpenedAt.
 *   Source : D-019-B TRANSITION_TABLE ligne 122.
 *
 * CE GUARD NE TOUCHE PAS LA DATABASE.
 *   Il retourne { passed, disputeRecord } a l'appelant.
 *   L'appelant persiste DisputeRecord via repository.
 * ============================================================
 */

'use strict';

import IDFactory from '../IDFactory.js';
// 9 etats autorises pour le Frein d'Urgence (Regime 1)
// Source : D-019-B · transitionEngagement.js header lignes 39-41
const FREIN_URGENCE_STATES = new Set([
  'proposed', 'negotiating', 'accepted', 'placed',
  'deposit_pending', 'deposit_secured', 'event_sealed',
  'performed', 'payable',
]);

// Regime 2 — Contestation de Prestation
const CONTESTATION_SOURCE = 'contestation_window';

// Toutes les transitions couvertes par ce guard
const COVERED_TRANSITIONS = new Set([
  'contestation_window->disputed',
  'proposed->disputed',
  'negotiating->disputed',
  'accepted->disputed',
  'placed->disputed',
  'deposit_pending->disputed',
  'deposit_secured->disputed',
  'event_sealed->disputed',
  'performed->disputed',
  'payable->disputed',
]);

// Roles autorises a ouvrir une dispute
const AUTHORIZED_ROLES = new Set(['talent', 'organisateur', 'admin']);

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
      reason: `GUARD_MISMATCH: DisputeGuard ne couvre pas "${transitionKey}". ` +
              `Transitions couvertes : Frein d'Urgence depuis 9 etats + contestation_window->disputed.`,
    };
  }

  if (currentState === CONTESTATION_SOURCE) {
    return validateContestationPrestation({ engagementId, currentState, actor, context });
  }

  return validateFreinUrgence({ engagementId, currentState, actor, context });
}

// ── Regime 1 — Frein d'Urgence ────────────────────────────────
// Disponible depuis les 9 etats autorises.
// Conditions : evidenceBundleId + disputeReason + actorRole autorise.

function validateFreinUrgence({ engagementId, currentState, actor, context }) {
  // Verifier que l'etat source est dans la liste autorisee (defensive — devrait etre garanti par TRANSITION_TABLE)
  if (!FREIN_URGENCE_STATES.has(currentState)) {
    return {
      passed: false,
      reason: `DISPUTE_STATE_NOT_ELIGIBLE: L'etat "${currentState}" n'est pas eligible ` +
               `au Frein d'Urgence (Regime 1). ` +
               `Etats autorises : ${[...FREIN_URGENCE_STATES].join(', ')}. ` +
               `Source : D-019-B.`,
    };
  }

  const { evidenceBundleId, disputeReason, actorRole } = context;

  if (!evidenceBundleId) {
    return {
      passed: false,
      reason: `DISPUTE_MISSING_EVIDENCE: evidenceBundleId obligatoire pour ouvrir une dispute. ` +
               `Une preuve documentee est requise avant tout gel. ` +
               `Source : D-019-B -- "une preuve doit etre soumise".`,
    };
  }

  if (!disputeReason) {
    return {
      passed: false,
      reason: `DISPUTE_MISSING_REASON: disputeReason obligatoire pour ouvrir une dispute. ` +
               `Source : D-019-B.`,
    };
  }

  if (!actorRole || !AUTHORIZED_ROLES.has(actorRole)) {
    return {
      passed: false,
      reason: `DISPUTE_UNAUTHORIZED_ROLE: actorRole "${actorRole}" non autorise ` +
               `pour ouvrir une dispute. Roles autorises : ${[...AUTHORIZED_ROLES].join(', ')}.`,
    };
  }

  const disputeRecord = {
    systemId:      IDFactory.generate('DisputeRecord'),
    engagementId,
    regime:        'FREIN_URGENCE',
    sourceState:   currentState,
    actorRole,
    actor,
    evidenceBundleId,
    disputeReason,
    openedAt:      new Date().toISOString(),
    status:        'OPEN',
  };

  return {
    passed: true,
    disputeRecord,
    audit: {
      engagementId,
      regime:          'FREIN_URGENCE',
      sourceState:     currentState,
      actorRole,
      evidenceBundleId,
      disputeReason,
    },
  };
}

// ── Regime 2 — Contestation de Prestation ────────────────────
// Depuis contestation_window uniquement.
// Conditions : evidenceBundleId + disputeReason + contestationWindowOpenedAt.

function validateContestationPrestation({ engagementId, currentState, actor, context }) {
  const { evidenceBundleId, disputeReason, actorRole, contestationWindowOpenedAt } = context;

  if (!contestationWindowOpenedAt) {
    return {
      passed: false,
      reason: `DISPUTE_WINDOW_NOT_OPEN: contestationWindowOpenedAt absent. ` +
               `La fenetre de contestation doit etre ouverte pour entrer en Regime 2. ` +
               `Source : D-019-B Regime 2.`,
    };
  }

  if (!evidenceBundleId) {
    return {
      passed: false,
      reason: `DISPUTE_MISSING_EVIDENCE: evidenceBundleId obligatoire pour la Contestation de Prestation. ` +
               `Source : D-019-B Regime 2.`,
    };
  }

  if (!disputeReason) {
    return {
      passed: false,
      reason: `DISPUTE_MISSING_REASON: disputeReason obligatoire. Source : D-019-B Regime 2.`,
    };
  }

  if (!actorRole || !AUTHORIZED_ROLES.has(actorRole)) {
    return {
      passed: false,
      reason: `DISPUTE_UNAUTHORIZED_ROLE: actorRole "${actorRole}" non autorise. ` +
               `Roles autorises : ${[...AUTHORIZED_ROLES].join(', ')}.`,
    };
  }

  const disputeRecord = {
    systemId:                    IDFactory.generate('DisputeRecord'),
    engagementId,
    regime:                      'CONTESTATION_PRESTATION',
    sourceState:                 currentState,
    actorRole,
    actor,
    evidenceBundleId,
    disputeReason,
    contestationWindowOpenedAt,
    openedAt:                    new Date().toISOString(),
    status:                      'OPEN',
  };

  return {
    passed: true,
    disputeRecord,
    audit: {
      engagementId,
      regime:                    'CONTESTATION_PRESTATION',
      sourceState:               currentState,
      actorRole,
      evidenceBundleId,
      disputeReason,
      contestationWindowOpenedAt,
    },
  };
}

export default {
validate, COVERED_TRANSITIONS, FREIN_URGENCE_STATES, AUTHORIZED_ROLES 
};
export { validate, COVERED_TRANSITIONS, FREIN_URGENCE_STATES, AUTHORIZED_ROLES };