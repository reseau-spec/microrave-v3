/**
 * MICRO RAVE V3 — PresenceWindowGuard
 * ============================================================
 * Guard pour la transition : event_sealed → performed
 *
 * Cette transition ouvre la fenêtre de check-in physique.
 * Elle est le premier acte de vérification post-contrat :
 * le talent se présente, le système commence à surveiller.
 *
 * CONDITIONS OBLIGATOIRES (OS V14 §2.7.1) :
 *   1. Date de l'event passée (ou en cours) — on ne peut pas
 *      passer à `performed` si l'event n'a pas encore commencé.
 *   2. Fenêtre de check-in ouverte — calculée depuis
 *      `eventScheduledStartAt` − `checkInWindowMinutes` (config DB).
 *   3. SessionPresence initiée — le talent a déclenché
 *      le tracking GPS (sessionPresenceId présent dans context).
 *
 * CE QUE CE GUARD NE FAIT PAS :
 *   - Il ne valide pas la PRÉSENCE effective (PresenceProofGuard).
 *     Il valide que la FENÊTRE est ouverte et que la SESSION a démarré.
 *   - Il ne calcule aucun montant. Aucun saut financier ici.
 *
 * CE QUI EST LU EN DATABASE :
 *   - `checkInWindowMinutes` — combien de minutes avant l'event
 *     la fenêtre check-in s'ouvre (ex: 60min avant = présentez-vous 1h avant).
 *
 * Source : OS V14 §2.7.1 · table des guards · PresenceWindowGuard
 * ============================================================
 */

'use strict';

const COVERED_TRANSITIONS = new Set(['event_sealed->performed']);

/**
 * @param {object} params
 * @param {string}  params.engagementId
 * @param {string}  params.currentState           — doit être 'event_sealed'
 * @param {string}  params.targetState            — doit être 'performed'
 * @param {string}  params.actor
 * @param {object}  params.context
 *
 * Champs obligatoires dans context :
 * @param {string}  params.context.eventScheduledStartAt  — ISO timestamp début event
 * @param {string}  params.context.sessionPresenceId      — ID de la SessionPresence ouverte (SPR-*)
 *
 * Optionnel dans context :
 * @param {string}  [params.context.nowOverride]          — pour les tests uniquement
 *
 * @param {object}  params.repositories
 * @param {object}  params.repositories.policyConfig      — { getConfig(key) }
 *
 * @returns {{ passed: boolean, checkInWindowOpenAt?: string, reason?: string }}
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
      reason: `GUARD_MISMATCH: PresenceWindowGuard ne couvre pas "${transitionKey}". ` +
              `Transitions couvertes : ${[...COVERED_TRANSITIONS].join(', ')}.`,
    };
  }

  // ── policyConfig requis ───────────────────────────────────
  if (!repositories.policyConfig?.getConfig) {
    return {
      passed: false,
      reason: 'GUARD_CONFIG_ERROR: repositories.policyConfig.getConfig() absent. ' +
              'PresenceWindowGuard ne peut pas lire checkInWindowMinutes sans PolicyConfigRepository.',
    };
  }

  // ── Lecture config depuis la DB ───────────────────────────
  let checkInWindowMinutes;
  try {
    const raw = await repositories.policyConfig.getConfig('checkInWindowMinutes');
    checkInWindowMinutes = typeof raw === 'number' ? raw : parseInt(raw, 10);
  } catch (err) {
    return {
      passed: false,
      reason: `POLICY_CONFIG_MISSING: Impossible de lire checkInWindowMinutes. ` +
              `Détail: ${err.message}. Exécuter node scripts/seed-policy-config.js.`,
    };
  }

  if (!Number.isInteger(checkInWindowMinutes) || checkInWindowMinutes < 0) {
    return {
      passed: false,
      reason: `CONFIG_INVALID: checkInWindowMinutes=${checkInWindowMinutes} doit être un entier ≥ 0.`,
    };
  }

  const { eventScheduledStartAt, sessionPresenceId } = context;

  // ── Condition 1 : eventScheduledStartAt présent et valide ─
  if (!eventScheduledStartAt) {
    return {
      passed: false,
      reason: 'PRESENCE_WINDOW_MISSING_START: context.eventScheduledStartAt absent. ' +
              'Requis pour calculer si la fenêtre check-in est ouverte. ' +
              'Passer le timestamp ISO de début d\'event. Source : OS V14 §2.7.1.',
    };
  }

  const eventStartMs = Date.parse(eventScheduledStartAt);
  if (isNaN(eventStartMs)) {
    return {
      passed: false,
      reason: `PRESENCE_WINDOW_INVALID_START: eventScheduledStartAt="${eventScheduledStartAt}" ` +
              `n'est pas un timestamp ISO valide.`,
    };
  }

  // ── Condition 2 : fenêtre check-in ouverte ───────────────
  // La fenêtre s'ouvre `checkInWindowMinutes` avant le début de l'event.
  // Ex : event à 21h, checkInWindowMinutes=60 → fenêtre ouvre à 20h.
  const nowMs = context.nowOverride
    ? Date.parse(context.nowOverride)
    : Date.now();

  const checkInWindowOpenAtMs = eventStartMs - checkInWindowMinutes * 60 * 1_000;
  const checkInWindowOpenAt   = new Date(checkInWindowOpenAtMs).toISOString();

  if (nowMs < checkInWindowOpenAtMs) {
    const minutesUntilOpen = Math.ceil((checkInWindowOpenAtMs - nowMs) / 60_000);
    return {
      passed: false,
      reason: `PRESENCE_WINDOW_NOT_YET_OPEN: La fenêtre de check-in n'est pas encore ouverte. ` +
              `Elle ouvrira à ${checkInWindowOpenAt} ` +
              `(dans ${minutesUntilOpen} minutes). ` +
              `checkInWindowMinutes=${checkInWindowMinutes}. ` +
              `Source : OS V14 §2.7.1 — Date event passée · check-in window ouverte.`,
    };
  }

  // ── Condition 3 : sessionPresenceId présent ───────────────
  // La SessionPresence doit avoir été initiée côté talent (tracking GPS démarré).
  // Ce guard vérifie l'existence de l'ID — PresenceProofGuard vérifiera les
  // conditions complètes (11 conditions D-075) plus tard dans le cycle.
  if (!sessionPresenceId) {
    return {
      passed: false,
      reason: 'PRESENCE_WINDOW_NO_SESSION: context.sessionPresenceId absent. ' +
              'La SessionPresence GPS doit avoir été initiée par le talent ' +
              'avant la transition event_sealed → performed. ' +
              'Source : OS V14 §2.7.1 — SessionPresence initiée.',
    };
  }

  if (!sessionPresenceId.startsWith('SPR-')) {
    return {
      passed: false,
      reason: `PRESENCE_WINDOW_INVALID_SESSION: sessionPresenceId="${sessionPresenceId}" ` +
              `doit commencer par "SPR-" (IDFactory.generate('SessionPresence')). ` +
              `Source : D-064 — format IDs souverains.`,
    };
  }

  return {
    passed: true,
    checkInWindowOpenAt,
    sessionPresenceId,
    audit: {
      engagementId,
      transitionKey,
      eventScheduledStartAt,
      checkInWindowOpenAt,
      checkInWindowMinutes,
      sessionPresenceId,
      checkedAt: new Date(nowMs).toISOString(),
    },
  };
}

export default {
validate, COVERED_TRANSITIONS 
};
export { validate, COVERED_TRANSITIONS };