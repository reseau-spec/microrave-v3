/**
 * MICRO RAVE V3 — WithdrawalGuard
 * ============================================================
 * Guard pour le retrait avant accord :
 *   proposed    → withdrawn
 *   negotiating → withdrawn
 *
 * Source : D-074 · OS V15
 *
 * CONDITIONS :
 *   - withdrawalReason obligatoire
 *   - actorRole dans ['talent', 'organisateur']
 *     (seule une des deux parties peut se retirer a ce stade)
 *
 * Semantique : le retrait pre-accord n'implique aucun fonds.
 *   Aucune ecriture ledger. Aucun frais.
 *   L'Engagement passe a withdrawn → archived (ArchiveWORMGuard).
 *
 * CE GUARD NE TOUCHE PAS LA DATABASE.
 * ============================================================
 */

'use strict';

const COVERED_TRANSITIONS = new Set([
  'proposed->withdrawn',
  'negotiating->withdrawn',
]);

const AUTHORIZED_ROLES = new Set(['talent', 'organisateur']);

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
      reason: `GUARD_MISMATCH: WithdrawalGuard ne couvre pas "${transitionKey}". ` +
              `Transitions couvertes : ${[...COVERED_TRANSITIONS].join(', ')}.`,
    };
  }

  const { withdrawalReason, actorRole } = context;

  if (!withdrawalReason) {
    return {
      passed: false,
      reason: `WITHDRAWAL_MISSING_REASON: withdrawalReason obligatoire pour se retirer. ` +
               `Source : D-074.`,
    };
  }

  if (!actorRole || !AUTHORIZED_ROLES.has(actorRole)) {
    return {
      passed: false,
      reason: `WITHDRAWAL_UNAUTHORIZED_ROLE: actorRole "${actorRole}" non autorise. ` +
               `Roles autorises : ${[...AUTHORIZED_ROLES].join(', ')}. ` +
               `Source : D-074 — seule une des deux parties peut se retirer.`,
    };
  }

  return {
    passed: true,
    withdrawalRecord: {
      engagementId,
      sourceState:     currentState,
      actorRole,
      actor,
      withdrawalReason,
      withdrawnAt:     new Date().toISOString(),
      financialImpact: 'NONE',   // aucun fonds engage a ce stade
    },
    audit: { engagementId, sourceState: currentState, actorRole, withdrawalReason },
  };
}

export default {
validate, COVERED_TRANSITIONS, AUTHORIZED_ROLES 
};
export { validate, COVERED_TRANSITIONS, AUTHORIZED_ROLES };