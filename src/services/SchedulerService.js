/**
 * MICRO RAVE V3 — SchedulerService
 * ============================================================
 * Dispatcher cron externe — Phase 2.2.
 *
 * Source : D-099 · Plan Phase 2.2 · Decision fondateur 2026-05-21 Option B
 *
 * Phrase canonique D-099 :
 *   "Le cron reveille; la tache dit quoi faire."
 *   "Quand Micro Rave connait une echeance, elle cree le reveil immediatement."
 *
 * ARCHITECTURE :
 *   Ce service est un orchestrateur pur — zero logique metier.
 *   transitionEngagement() reste le seul point d'entree pour les mutations d'etat.
 *   Tous les repositories sont injectes — pas de require direct dans ce service.
 *   cron.js est le seul fichier qui instancie les repositories directement.
 *
 * IDEMPOTENCY D-099 :
 *   lockedByRunId sur une tache = elle est deja en cours d'execution.
 *   La sauter silencieusement — jamais de double execution.
 *
 * RESILIENCE :
 *   Un echec sur une tache n'arrete pas les suivantes.
 *   Chaque echec produit un AdminIncidentRecord P1.
 *   Le run se complete meme si toutes les taches echouent.
 *
 * taskType couverts :
 *   BALANCE_DEADLINE_CHECK      → deposit_secured→cancelled_J7 (LOI ANNULATION-02)
 *   SOTS_WINDOW_EXPIRATION      → event_completed→sots_window_closed
 *   CONTESTATION_WINDOW_EXPIRATION → contestation_window→payable
 *
 * Source : TRANSITION_TABLE · D-014-A · D-077 · D-019-B
 * ============================================================
 */

'use strict';

const IDFactory          = require('../core/IDFactory');
const { transitionEngagement } = require('../core/transitionEngagement');

// Acteur systeme pour les transitions declenchees par le scheduler
// Source : D-099 — le cron est l'acteur, pas un humain
const SYSTEM_ACTOR_ID = 'USR-SYSTEM-SCHED01';

/**
 * Point d'entree principal du dispatcher.
 * Appele par le cron externe toutes les 5 minutes.
 *
 * @param {object} params
 * @param {object}  params.repositories
 * @param {object}    params.repositories.scheduler — SchedulerRepository
 * @param {object}    params.repositories.admin     — AdminRepository
 * @param {object}    params.repositories.policyConfig — PolicyConfigRepository
 * @param {number}  [params.nowOverride]  — timestamp ms (pour les tests)
 *
 * @returns {Promise<{ runId, tasksProcessed, tasksFailed, results }>}
 */
async function runDueTasks({ repositories, nowOverride }) {
  const { scheduler, admin } = repositories;

  if (!scheduler || typeof scheduler.createRun !== 'function') {
    throw new Error('SCHEDULER_ERROR: repositories.scheduler obligatoire avec createRun().');
  }
  if (!admin || typeof admin.createAdminIncidentRecord !== 'function') {
    throw new Error('SCHEDULER_ERROR: repositories.admin obligatoire avec createAdminIncidentRecord().');
  }

  const nowMs = nowOverride || Date.now();
  const runId = IDFactory.generate('SchedulerDueTask'); // SCH-* pour le run

  // ── Etape 1 : Creer le SchedulerRun ──────────────────────
  // D-107 : SchedulerRun complete est immuable — cree avant, complete apres.
  const runRecord = await scheduler.createRun({
    systemId: runId,
    startedAt: new Date(nowMs).toISOString(),
    nowMs,
  });
  const runBase44Id = runRecord.id || runBase44Id;

  // ── Etape 2 : Lire les taches dues ───────────────────────
  const dueTasks = await scheduler.findDueTasks(nowMs);

  const results        = [];
  let   tasksProcessed = 0;
  let   tasksFailed    = 0;

  // ── Etape 3 : Executer chaque tache ──────────────────────
  for (const task of dueTasks) {

    // Idempotency D-099 : tache deja verrouillee → sauter silencieusement
    if (task.lockedByRunId) {
      results.push({ taskId: task.systemId || task.id, outcome: 'skipped', reason: 'already_locked' });
      continue;
    }

    // Verrouiller la tache pour ce run
    await scheduler.markProcessing(task.id, runId);

    let outcome;
    try {
      const taskResult = await executeTask(task, repositories);
      await scheduler.markDone(task.id, taskResult);
      tasksProcessed++;
      outcome = { taskId: task.systemId || task.id, outcome: 'done', taskType: task.taskType };
    } catch (taskErr) {
      tasksFailed++;
      await scheduler.markFailed(task.id, taskErr.message);

      // AdminIncidentRecord P1 sur chaque echec — non-bloquant
      try {
        await admin.createAdminIncidentRecord({
          incidentType: 'SCHEDULER_TASK_FAILED',
          severity:     'P1',
          engagementId: task.engagementId || null,
          description:  `Tache ${task.taskType} (${task.systemId || task.id}) echouee : ${taskErr.message}`,
          context:      { taskType: task.taskType, runId, errorMessage: taskErr.message },
        });
      } catch (_) { /* incident non-bloquant */ }

      outcome = { taskId: task.systemId || task.id, outcome: 'failed', error: taskErr.message };
    }

    results.push(outcome);
  }

  // ── Etape 4 : Completer le SchedulerRun ──────────────────
  // D-107 #13 : SchedulerRun complete = immuable apres cet appel.
  const runDbId = runRecord.id;
  if (runDbId) {
    await scheduler.completeRun(runDbId, { tasksProcessed, tasksFailed });
  }

  return { runId, tasksProcessed, tasksFailed, results };
}

/**
 * Execute une tache selon son taskType.
 * Dispatch vers transitionEngagement() — seul point d'entree pour mutations d'etat.
 *
 * @param {object} task        — SchedulerDueTask record
 * @param {object} repositories
 * @returns {Promise<object>}  — resultat de la transition
 */
async function executeTask(task, repositories) {
  const { taskType, engagementId, contextOverrides = {} } = task;

  switch (taskType) {

    case 'BALANCE_DEADLINE_CHECK':
      // LOI ANNULATION-02 : solde impaye a J-6 → annulation automatique.
      // Transition : deposit_secured → cancelled_J7
      // Source : TRANSITION_TABLE ligne 94 · D-014-A
      return transitionEngagement({
        engagementId,
        currentState: 'deposit_secured',
        targetState:  'cancelled_J7',
        actor:        SYSTEM_ACTOR_ID,
        context: {
          cancellationReason: 'BALANCE_DEADLINE_EXCEEDED',
          schedulerTaskId:    task.systemId || task.id,
          ...contextOverrides,
        },
        repositories,
      });

    case 'SOTS_WINDOW_EXPIRATION':
      // Fenetre SOTS expiree → fermer la fenetre.
      // Transition : event_completed → sots_window_closed
      // Source : TRANSITION_TABLE ligne 111 · D-077
      return transitionEngagement({
        engagementId,
        currentState: 'event_completed',
        targetState:  'sots_window_closed',
        actor:        SYSTEM_ACTOR_ID,
        context: {
          schedulerTaskId: task.systemId || task.id,
          ...contextOverrides,
        },
        repositories,
      });

    case 'CONTESTATION_WINDOW_EXPIRATION':
      // Fenetre de contestation expiree sans dispute → payable.
      // Transition : contestation_window → payable
      // Source : TRANSITION_TABLE ligne 120 · D-019-B
      return transitionEngagement({
        engagementId,
        currentState: 'contestation_window',
        targetState:  'payable',
        actor:        SYSTEM_ACTOR_ID,
        context: {
          schedulerTaskId: task.systemId || task.id,
          ...contextOverrides,
        },
        repositories,
      });

    default:
      // taskType inconnu → AdminIncidentRecord P1, ne pas throw pour ne pas bloquer le run.
      // Source : Plan Phase 2.2 — resilience maximale.
      await repositories.admin.createAdminIncidentRecord({
        incidentType: 'UNKNOWN_TASK_TYPE',
        severity:     'P1',
        engagementId: engagementId || null,
        description:  `SchedulerService: taskType "${taskType}" non reconnu. ` +
                      `Tache ${task.systemId || task.id} ignoree.`,
        context:      { taskType, task },
      });
      return { skipped: true, reason: 'UNKNOWN_TASK_TYPE', taskType };
  }
}

module.exports = { runDueTasks, executeTask, SYSTEM_ACTOR_ID };