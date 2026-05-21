/**
 * MICRO RAVE V3 — SchedulerRepository (interface)
 * ============================================================
 * Interface portable pour SchedulerDueTask et SchedulerRun.
 *
 * Source : D-128 · D-099 · OS V15 BLOC 12
 *
 * Phrases canoniques D-099 :
 *   "Le cron réveille; la tâche dit quoi faire."
 *   "Quand Micro Rave connaît une échéance, elle crée le réveil immédiatement."
 *
 * RÈGLE D-099 — Idempotency :
 *   lockedByRunId garantit qu'une tâche ne peut être exécutée
 *   que par un seul SchedulerRun à la fois.
 *   Transition de status : pending → processing → done | failed
 *   Un SchedulerRun complété est immuable (D-107 ADMIN-ABS-SCHEDULERRUN).
 *
 * Entités couvertes :
 *   SchedulerDueTask — tâche planifiée (SCH-*)
 *   SchedulerRun     — log d'exécution du dispatcher
 * ============================================================
 */

'use strict';

const BASE44_BASE_URL = 'https://futuristic-rave-core-flow.base44.app/api';

function buildHeaders() {
  const apiKey = process.env.BASE44_API_KEY;
  if (!apiKey || apiKey === 'REMPLACER_PAR_API_KEY_BASE44') {
    throw new Error('CONFIG_MISSING: BASE44_API_KEY absent.');
  }
  return { 'Content-Type': 'application/json', 'api_key': apiKey };
}

async function base44Post(path, data) {
  const res = await fetch(`${BASE44_BASE_URL}${path}`, {
    method: 'POST', headers: buildHeaders(), body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`BASE44_HTTP_${res.status}: POST ${path} — ${body}`);
  }
  return res.json();
}

async function base44Put(path, data) {
  const res = await fetch(`${BASE44_BASE_URL}${path}`, {
    method: 'PUT', headers: buildHeaders(), body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`BASE44_HTTP_${res.status}: PUT ${path} — ${body}`);
  }
  return res.json();
}

async function base44Get(path) {
  const res = await fetch(`${BASE44_BASE_URL}${path}`, {
    method: 'GET', headers: buildHeaders(),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`BASE44_HTTP_${res.status}: GET ${path} — ${body}`);
  }
  const json = await res.json();
  return Array.isArray(json) ? json : (json.data || json);
}

// ── SchedulerDueTask ──────────────────────────────────────────

/**
 * Crée une SchedulerDueTask.
 * Appelé immédiatement quand Micro Rave connaît une échéance (D-099).
 *
 * @param {object} task
 * @param {string}  task.systemId         — SCH-* généré par IDFactory
 * @param {string}  task.taskType         — ex: 'BALANCE_DEADLINE_CHECK', 'SOTS_WINDOW_CLOSE'
 * @param {string}  task.engagementId     — ENG-* associé
 * @param {number}  task.dueAt            — timestamp Unix ms
 * @param {string}  task.status           — 'pending' (toujours à la création)
 * @param {string}  [task.policyId]       — config associée
 */
async function createTask(task) {
  if (!task.systemId || !task.systemId.startsWith('SCH-')) {
    throw new Error(
      'SCHEDULER_ERROR: SchedulerDueTask.systemId manquant ou invalide. ' +
      'Générer via IDFactory.generate("SchedulerDueTask") avant create().'
    );
  }
  if (!task.taskType) {
    throw new Error('SCHEDULER_ERROR: taskType obligatoire.');
  }
  if (!Number.isInteger(task.dueAt)) {
    throw new Error('SCHEDULER_ERROR: dueAt doit être un timestamp Unix ms entier.');
  }
  return base44Post('/entities/SchedulerDueTask', {
    ...task,
    status: 'pending',
    attemptCount: 0,
    lockedByRunId: null,
    createdAt: task.createdAt || new Date().toISOString(),
  });
}

/**
 * Retourne les tâches dues et non verrouillées (status='pending', dueAt ≤ now).
 * Source : D-099 — dispatcher lit ces tâches à chaque run.
 */
async function findDueTasks(nowTimestamp) {
  // Base44 ne supporte pas les comparaisons de dates nativement —
  // on filtre par status pending et on laisse le dispatcher filtrer dueAt.
  const q = encodeURIComponent(JSON.stringify({ status: 'pending' }));
  const tasks = await base44Get(`/entities/SchedulerDueTask?q=${q}`);
  return tasks.filter(t => t.dueAt <= nowTimestamp && !t.lockedByRunId);
}

/**
 * Verrouille une tâche pour un SchedulerRun (anti-double exécution D-099).
 */
async function markProcessing(base44Id, runId) {
  return base44Put(`/entities/SchedulerDueTask/${base44Id}`, {
    status: 'processing',
    lockedByRunId: runId,
    lockedAt: new Date().toISOString(),
  });
}

/**
 * Marque une tâche comme terminée avec succès.
 */
async function markDone(base44Id, result = {}) {
  return base44Put(`/entities/SchedulerDueTask/${base44Id}`, {
    status: 'done',
    completedAt: new Date().toISOString(),
    resultSummary: JSON.stringify(result),
  });
}

/**
 * Marque une tâche comme échouée.
 * Crée un AdminIncidentRecord via l'appelant (SchedulerService).
 */
async function markFailed(base44Id, errorMessage) {
  return base44Put(`/entities/SchedulerDueTask/${base44Id}`, {
    status: 'failed',
    failedAt: new Date().toISOString(),
    lastError: errorMessage,
  });
}

/**
 * Annule une tâche (ex: SC-DEPOSIT-FAIL — SchedulerDueTasks CANCELLED).
 */
async function markCancelled(base44Id, reason) {
  return base44Put(`/entities/SchedulerDueTask/${base44Id}`, {
    status: 'cancelled',
    cancelledAt: new Date().toISOString(),
    cancelReason: reason,
  });
}

/**
 * Annule toutes les tâches pendantes d'un Engagement.
 * Utilisé sur SC-DEPOSIT-FAIL (source : OS V14 ligne 260).
 */
async function cancelAllPendingTasksForEngagement(engagementId, reason) {
  const q = encodeURIComponent(JSON.stringify({ engagementId, status: 'pending' }));
  const tasks = await base44Get(`/entities/SchedulerDueTask?q=${q}`);
  const results = await Promise.all(
    tasks.map(t => markCancelled(t.id, reason))
  );
  return { cancelled: results.length, engagementId };
}

// ── SchedulerRun ──────────────────────────────────────────────

/**
 * Crée un SchedulerRun (log d'exécution du dispatcher).
 */
async function createRun(runData) {
  return base44Post('/entities/SchedulerRun', {
    ...runData,
    startedAt: runData.startedAt || new Date().toISOString(),
    status: 'running',
    tasksProcessed: 0,
  });
}

/**
 * Met à jour un SchedulerRun à la complétion.
 * RÈGLE D-107 : un SchedulerRun complété est immuable.
 * Cette méthode ne doit être appelée qu'une seule fois.
 */
async function completeRun(base44Id, summary) {
  return base44Put(`/entities/SchedulerRun/${base44Id}`, {
    status: 'completed',
    completedAt: new Date().toISOString(),
    tasksProcessed: summary.tasksProcessed,
    tasksFailed: summary.tasksFailed,
  });
}

module.exports = {
  // SchedulerDueTask
  createTask,
  findDueTasks,
  markProcessing,
  markDone,
  markFailed,
  markCancelled,
  cancelAllPendingTasksForEngagement,
  // SchedulerRun
  createRun,
  completeRun,
};