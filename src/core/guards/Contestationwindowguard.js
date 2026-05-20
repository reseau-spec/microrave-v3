/**
 * MICRO RAVE V3 — ContestationWindowGuard
 * ============================================================
 * Guard pour la transition : sots_window_closed → contestation_window
 *
 * Responsabilités :
 *   1. Valider que le SOTSRecord est bien fermé (état source cohérent)
 *   2. Lire contestationWindowDurationHours depuis la database (jamais hardcodé)
 *   3. Calculer dueAt = maintenant + contestationWindowDurationHours
 *   4. Retourner un schedulerTask à créer par l'appelant
 *      (tâche : déclencher contestation_window → payable à expiration)
 *
 * [D-019-B] Régime 2 — Contestation de Prestation :
 *   Cette fenêtre est la SEULE porte d'entrée vers le Régime 2.
 *   - À l'expiration sans litige → ContestationWindowGuard déclenche → payable
 *   - Avant expiration avec litige → DisputeGuard → disputed
 *
 * Ce guard NE touche PAS la database directement.
 * Il retourne { passed, schedulerTask } — la persistence appartient à l'appelant.
 *
 * Source : D-019-B · OS V14 · Action 10 Audit Nobel-Licorne
 * ============================================================
 */

'use strict';

const IDFactory = require('../IDFactory');

async function validate({
  engagementId,
  currentState,
  targetState,
  actor,
  context = {},
  repositories = {},
}) {
  // ── Précondition : repositories.policyConfig ──────────────
  if (!repositories.policyConfig || typeof repositories.policyConfig.getConfig !== 'function') {
    return {
      passed: false,
      reason: 'GUARD_CONFIG_ERROR: repositories.policyConfig.getConfig() absent. ' +
              'ContestationWindowGuard ne peut pas lire la durée de la fenêtre sans PolicyConfigRepository.',
    };
  }

  // ── Lecture durée fenêtre depuis la database ──────────────
  // Valeur souveraine ratifiée : 24h — mais lue en DB, jamais hardcodée ici
  let contestationWindowDurationHours;
  try {
    const raw = await repositories.policyConfig.getConfig('contestationWindowDurationHours');
    contestationWindowDurationHours = typeof raw === 'number' ? raw : parseInt(raw, 10);
  } catch (err) {
    return {
      passed: false,
      reason: `POLICY_CONFIG_MISSING: Impossible de lire contestationWindowDurationHours depuis la database. ` +
              `Détail: ${err.message}. Exécuter node scripts/seed-policy-config.js.`,
    };
  }

  if (!Number.isInteger(contestationWindowDurationHours) || contestationWindowDurationHours <= 0) {
    return {
      passed: false,
      reason: `CONFIG_INVALID: contestationWindowDurationHours=${contestationWindowDurationHours} ` +
              `doit être un entier > 0.`,
    };
  }

  // ── Validation état source ────────────────────────────────
  if (currentState !== 'sots_window_closed') {
    return {
      passed: false,
      reason: `STATE_MISMATCH: ContestationWindowGuard attend currentState="sots_window_closed". ` +
              `Reçu: "${currentState}".`,
    };
  }

  // ── Calcul de l'expiration ────────────────────────────────
  const openedAt  = new Date().toISOString();
  const dueAtMs   = Date.now() + contestationWindowDurationHours * 60 * 60 * 1_000;
  const dueAt     = new Date(dueAtMs).toISOString();

  // ── Construction de la SchedulerDueTask ──────────────────
  // L'appelant (transitionEngagement ou le layer Base44) crée cette tâche en database.
  // À l'expiration, le scheduler déclenche contestation_window → payable via PresenceProofGuard
  // avec transitionReason='CONTESTATION_WINDOW_EXPIRED'.
  const schedulerTask = {
    systemId:          IDFactory.generate('SchedulerDueTask'),
    engagementId,
    taskType:          'CONTESTATION_WINDOW_EXPIRATION',
    targetTransition:  'contestation_window->payable',
    transitionReason:  'CONTESTATION_WINDOW_EXPIRED',
    dueAt,
    openedAt,
    durationHours:     contestationWindowDurationHours,
    createdByActor:    actor,
    status:            'pending',
    // Paramètres passés à transitionEngagement lors du déclenchement
    contextOverrides: {
      transitionReason: 'CONTESTATION_WINDOW_EXPIRED',
    },
  };

  return {
    passed: true,
    schedulerTask,
    audit: {
      engagementId,
      openedAt,
      dueAt,
      contestationWindowDurationHours,
      taskSystemId: schedulerTask.systemId,
    },
  };
}

module.exports = { validate };