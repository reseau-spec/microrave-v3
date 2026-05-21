/**
 * MICRO RAVE V3 — SOTSWindowGuard
 * ============================================================
 * Guard pour la transition : event_completed → sots_window_closed
 *
 * SOTS = Score of the Show. La fenêtre SOTS est la période pendant
 * laquelle organisateurs et talents peuvent soumettre leurs notes
 * de réputation. Elle dure 24h (configurable en DB).
 *
 * Ce guard fait deux choses :
 *   1. Vérifie que la fenêtre SOTS est bien écoulée (ou que les
 *      soumissions sont explicitement consolidées).
 *   2. Retourne une SchedulerDueTask si la fenêtre n'est pas encore
 *      close — pour que le scheduler puisse déclencher la transition
 *      automatiquement à expiration (pattern ContestationWindowGuard).
 *
 * CONDITIONS OBLIGATOIRES (OS V14 §2.7.1) :
 *   1. Fenêtre SOTS écoulée : `sotsWindowClosedAt` présent dans context,
 *      OU `sotsWindowOpenedAt` + `sots_window_duration_hours` (config DB) ≤ now.
 *   2. SOTSSubmissions consolidées : le flag `sotsConsolidated` doit être
 *      true dans context — signifie que les soumissions ont été lues et
 *      agrégées dans les ReputationLedgers.
 *
 * DEUX CHEMINS D'ENTRÉE :
 *   A) Automatique (scheduler) : `sotsWindowClosedAt` présent → fenêtre
 *      déjà close, transition directe.
 *   B) Manuel (admin override) : `sotsAdminOverride` présent + `AdminIncidentRecord`
 *      → fermeture anticipée avec justification.
 *
 * Source : OS V14 §2.7.1 · SOTSWindowGuard · ContestationWindowGuard (pattern)
 * ============================================================
 */

'use strict';

const IDFactory = require('../IDFactory');

const COVERED_TRANSITIONS = new Set(['event_completed->sots_window_closed']);

/**
 * @param {object} params
 * @param {string}  params.engagementId
 * @param {string}  params.currentState         — doit être 'event_completed'
 * @param {string}  params.targetState          — doit être 'sots_window_closed'
 * @param {string}  params.actor
 * @param {object}  params.context
 *
 * Champs dans context (l'un ou l'autre requis) :
 *
 * Chemin A — fenêtre close confirmée :
 * @param {string}  params.context.sotsWindowClosedAt    — timestamp de fermeture (scheduler)
 * @param {boolean} params.context.sotsConsolidated      — soumissions agrégées
 *
 * Chemin B — fenêtre ouverte, calcul depuis ouverture :
 * @param {string}  params.context.sotsWindowOpenedAt    — timestamp d'ouverture (event_completed)
 * (→ le guard calcule si la fenêtre est close via config DB)
 *
 * Admin override :
 * @param {boolean} params.context.sotsAdminOverride     — true = fermeture forcée
 * @param {string}  params.context.adminIncidentRecordId — requis si override
 *
 * Pour les tests :
 * @param {string}  [params.context.nowOverride]
 *
 * @param {object}  params.repositories
 * @param {object}  params.repositories.policyConfig     — { getConfig(key) }
 *
 * @returns {{ passed: boolean, sotsWindowClosedAt?: string, schedulerTask?: object, reason?: string }}
 */
async function validate({
  engagementId,
  currentState,
  targetState,
  actor,
  context = {},
  repositories = {},
}) {
  const transitionKey = `${currentState}->${targetState}`;

  // ── GUARD_MISMATCH ────────────────────────────────────────
  if (!COVERED_TRANSITIONS.has(transitionKey)) {
    return {
      passed: false,
      reason: `GUARD_MISMATCH: SOTSWindowGuard ne couvre pas "${transitionKey}". ` +
              `Transitions couvertes : ${[...COVERED_TRANSITIONS].join(', ')}.`,
    };
  }

  // ── policyConfig requis ───────────────────────────────────
  if (!repositories.policyConfig?.getConfig) {
    return {
      passed: false,
      reason: 'GUARD_CONFIG_ERROR: repositories.policyConfig.getConfig() absent. ' +
              'SOTSWindowGuard ne peut pas lire sots_window_duration_hours sans PolicyConfigRepository.',
    };
  }

  // ── Lecture config depuis la DB ───────────────────────────
  let sotsWindowDurationHours;
  try {
    const raw = await repositories.policyConfig.getConfig('sots_window_duration_hours');
    sotsWindowDurationHours = typeof raw === 'number' ? raw : parseInt(raw, 10);
  } catch (err) {
    return {
      passed: false,
      reason: `POLICY_CONFIG_MISSING: Impossible de lire sots_window_duration_hours. ` +
              `Détail: ${err.message}. Exécuter node scripts/seed-policy-config.js.`,
    };
  }

  if (!Number.isInteger(sotsWindowDurationHours) || sotsWindowDurationHours <= 0) {
    return {
      passed: false,
      reason: `CONFIG_INVALID: sots_window_duration_hours=${sotsWindowDurationHours} doit être un entier > 0.`,
    };
  }

  const nowMs = context.nowOverride ? Date.parse(context.nowOverride) : Date.now();
  const {
    sotsWindowClosedAt,
    sotsWindowOpenedAt,
    sotsConsolidated,
    sotsAdminOverride,
    adminIncidentRecordId,
  } = context;

  // ── Chemin ADMIN OVERRIDE ─────────────────────────────────
  if (sotsAdminOverride === true) {
    if (!adminIncidentRecordId) {
      return {
        passed: false,
        reason: 'SOTS_OVERRIDE_MISSING_RECORD: sotsAdminOverride=true mais adminIncidentRecordId absent. ' +
                'Un AdminIncidentRecord est obligatoire pour justifier la fermeture anticipée de la fenêtre SOTS. ' +
                'Source : OS V14 — override admin toujours documenté.',
      };
    }
    // Override autorisé — on close maintenant
    const closedAt = new Date(nowMs).toISOString();
    return {
      passed: true,
      sotsWindowClosedAt:    closedAt,
      adminOverrideApplied:  true,
      adminIncidentRecordId,
      audit: {
        engagementId,
        transitionKey,
        closedAt,
        adminOverride:        true,
        adminIncidentRecordId,
        sotsWindowDurationHours,
      },
    };
  }

  // ── Chemin A : sotsWindowClosedAt déjà présent (scheduler) ─
  if (sotsWindowClosedAt) {
    const closedAtMs = Date.parse(sotsWindowClosedAt);
    if (isNaN(closedAtMs)) {
      return {
        passed: false,
        reason: `SOTS_WINDOW_INVALID_CLOSED_AT: sotsWindowClosedAt="${sotsWindowClosedAt}" ` +
                `n'est pas un timestamp ISO valide.`,
      };
    }

    if (nowMs < closedAtMs) {
      // La valeur dit que la fenêtre est close dans le futur — incohérence
      return {
        passed: false,
        reason: `SOTS_WINDOW_NOT_YET_CLOSED: sotsWindowClosedAt="${sotsWindowClosedAt}" ` +
                `est dans le futur (maintenant=${new Date(nowMs).toISOString()}). ` +
                `Attendre que la fenêtre soit effectivement écoulée.`,
      };
    }

    // Vérification consolidation
    if (!sotsConsolidated) {
      return {
        passed: false,
        reason: 'SOTS_NOT_CONSOLIDATED: sotsConsolidated=false. ' +
                'Les SOTSSubmissions doivent être agrégées dans les ReputationLedgers ' +
                'avant de fermer la fenêtre. ' +
                'Source : OS V14 §2.7.1 — SOTSSubmissions consolidées.',
      };
    }

    return {
      passed: true,
      sotsWindowClosedAt,
      audit: {
        engagementId,
        transitionKey,
        closedAt:               sotsWindowClosedAt,
        sotsConsolidated:       true,
        sotsWindowDurationHours,
      },
    };
  }

  // ── Chemin B : calcul depuis sotsWindowOpenedAt ───────────
  if (!sotsWindowOpenedAt) {
    return {
      passed: false,
      reason: 'SOTS_WINDOW_MISSING_OPENED_AT: ni sotsWindowClosedAt ni sotsWindowOpenedAt ' +
              'présents dans context. ' +
              'Fournir sotsWindowOpenedAt (timestamp d\'ouverture depuis event_completed) ' +
              'ou sotsWindowClosedAt (timestamp de fermeture depuis le scheduler). ' +
              'Source : OS V14 §2.7.1.',
    };
  }

  const openedAtMs = Date.parse(sotsWindowOpenedAt);
  if (isNaN(openedAtMs)) {
    return {
      passed: false,
      reason: `SOTS_WINDOW_INVALID_OPENED_AT: sotsWindowOpenedAt="${sotsWindowOpenedAt}" ` +
              `n'est pas un timestamp ISO valide.`,
    };
  }

  const windowCloseAtMs = openedAtMs + sotsWindowDurationHours * 60 * 60 * 1_000;
  const windowCloseAt   = new Date(windowCloseAtMs).toISOString();

  if (nowMs < windowCloseAtMs) {
    // Fenêtre pas encore close — retourner une SchedulerDueTask
    // pour que le scheduler la déclenche automatiquement.
    const minutesRemaining = Math.ceil((windowCloseAtMs - nowMs) / 60_000);
    const schedulerTask = {
      systemId:         IDFactory.generate('SchedulerDueTask'),
      engagementId,
      taskType:         'SOTS_WINDOW_EXPIRATION',
      targetTransition: 'event_completed->sots_window_closed',
      transitionReason: 'SOTS_WINDOW_EXPIRED',
      dueAt:            windowCloseAt,
      openedAt:         sotsWindowOpenedAt,
      durationHours:    sotsWindowDurationHours,
      createdByActor:   actor,
      status:           'pending',
      contextOverrides: {
        sotsWindowClosedAt: windowCloseAt,
        sotsConsolidated:   true,  // le scheduler consolidera avant de déclencher
        transitionReason:   'SOTS_WINDOW_EXPIRED',
      },
    };

    return {
      passed: false,
      reason: `SOTS_WINDOW_STILL_OPEN: La fenêtre SOTS n'est pas encore close. ` +
              `Elle fermera à ${windowCloseAt} (dans ${minutesRemaining} minutes). ` +
              `Une SchedulerDueTask a été calculée pour déclencher la transition automatiquement.`,
      schedulerTask,    // L'appelant peut persister cette tâche même en passed:false
      windowCloseAt,
    };
  }

  // Fenêtre close — vérification consolidation
  if (!sotsConsolidated) {
    return {
      passed: false,
      reason: 'SOTS_NOT_CONSOLIDATED: La fenêtre SOTS est close mais sotsConsolidated=false. ' +
              'Les SOTSSubmissions doivent être agrégées dans les ReputationLedgers avant la fermeture. ' +
              'Source : OS V14 §2.7.1 — SOTSSubmissions consolidées.',
    };
  }

  return {
    passed: true,
    sotsWindowClosedAt: windowCloseAt,
    audit: {
      engagementId,
      transitionKey,
      openedAt:               sotsWindowOpenedAt,
      closedAt:               windowCloseAt,
      sotsConsolidated:       true,
      sotsWindowDurationHours,
    },
  };
}

module.exports = { validate, COVERED_TRANSITIONS };