/**
 * MICRO RAVE V3 — EventCompletionGuard
 * ============================================================
 * Guard pour la transition : performed → event_completed
 *
 * Cette transition ferme la prestation. Elle certifie que le show
 * s'est terminé et que tous les talents du lineup ont été traités —
 * soit en `performed` (présents), soit en `no_show` (absents confirmés).
 * Aucun talent ne peut rester dans un état non résolu.
 *
 * C'est la porte entre la réalité de terrain et la mémoire institutionnelle.
 * Après ce point, la fenêtre SOTS s'ouvre.
 *
 * CONDITIONS OBLIGATOIRES (OS V14 §2.7.1) :
 *   1. Tous les talents du lineup sont en état `performed` ou
 *      `performed_amended` (amendment D-147 actif) ou `no_show`
 *      (absence confirmée avec DecisionRecord NO_SHOW_CONFIRMED).
 *   2. Aucun talent en état ambigu : ni `event_sealed`, ni `deposit_secured`,
 *      ni aucun état antérieur à la prestation — ces états signifient que
 *      le talent n'a pas encore été traité.
 *   3. Le lineup complet doit être fourni en context — ce guard
 *      ne peut pas faire son travail sans voir tous les Engagements.
 *
 * ÉTATS VALIDES POUR CLORE L'EVENT (exhaustif) :
 *   - `performed`         → talent présent, prestation normale
 *   - `performed_amended` → talent présent, prestation étendue (D-147)
 *   - `no_show`           → absent confirmé, DecisionRecord requis
 *
 * TOUT AUTRE ÉTAT BLOQUE LA TRANSITION.
 *
 * Source : OS V14 §2.7.1 · EventCompletionGuard
 * ============================================================
 */

'use strict';

const COVERED_TRANSITIONS = new Set(['performed->event_completed']);

// États qui signifient "talent traité" — event peut être complété
const RESOLVED_STATES = new Set([
  'performed',
  'performed_amended',  // D-147 — amendment actif
  'no_show',            // absent confirmé
]);

// États qui signifient "talent non encore traité" — bloquants
const UNRESOLVED_STATES = new Set([
  'proposed', 'negotiating', 'accepted', 'placed',
  'deposit_pending', 'deposit_secured', 'event_sealed',
]);

/**
 * @param {object} params
 * @param {string}  params.engagementId           — Engagement principal qui demande la complétion
 * @param {string}  params.currentState           — doit être 'performed'
 * @param {string}  params.targetState            — doit être 'event_completed'
 * @param {string}  params.actor
 * @param {object}  params.context
 *
 * Champs obligatoires dans context :
 * @param {Array}   params.context.lineupEngagements  — tous les Engagements du même event
 *   Chaque entrée : { engagementId, talentUserId, status }
 *   Le status est l'état actuel de chaque Engagement du lineup.
 *
 * @param {object}  params.repositories           — non requis pour ce guard (stateless)
 *
 * @returns {{ passed: boolean, resolvedCount?: number, reason?: string }}
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
      reason: `GUARD_MISMATCH: EventCompletionGuard ne couvre pas "${transitionKey}". ` +
              `Transitions couvertes : ${[...COVERED_TRANSITIONS].join(', ')}.`,
    };
  }

  const { lineupEngagements } = context;

  // ── Condition 0 : lineup fourni ───────────────────────────
  if (!lineupEngagements || !Array.isArray(lineupEngagements) || lineupEngagements.length === 0) {
    return {
      passed: false,
      reason: 'EVENT_COMPLETION_MISSING_LINEUP: context.lineupEngagements absent ou vide. ' +
              'EventCompletionGuard requiert la liste complète des Engagements du lineup ' +
              'pour vérifier qu\'aucun talent n\'est en état non résolu. ' +
              'Fournir [{ engagementId, talentUserId, status }] pour tous les talents de l\'event. ' +
              'Source : OS V14 §2.7.1 — Tous les talents en état performed ou no_show.',
    };
  }

  // ── Validation des entrées ────────────────────────────────
  for (const entry of lineupEngagements) {
    if (!entry.engagementId || !entry.status) {
      return {
        passed: false,
        reason: 'EVENT_COMPLETION_LINEUP_MALFORMED: Chaque entrée de lineupEngagements ' +
                'doit avoir { engagementId, status }. ' +
                `Entrée invalide: ${JSON.stringify(entry)}`,
      };
    }
  }

  // ── Condition 1 : tous les talents résolus ────────────────
  const unresolved = lineupEngagements.filter(e => !RESOLVED_STATES.has(e.status));
  const blocked    = lineupEngagements.filter(e => UNRESOLVED_STATES.has(e.status));

  if (unresolved.length > 0) {
    const details = unresolved
      .map(e => `${e.engagementId}(talent=${e.talentUserId || '?'}, status=${e.status})`)
      .join(' | ');

    const hasPreEventBlocked = blocked.length > 0;
    const blockReason = hasPreEventBlocked
      ? 'EVENT_COMPLETION_UNRESOLVED_TALENTS: Des talents sont encore en état pré-prestation. '
      : 'EVENT_COMPLETION_UNKNOWN_STATES: Des talents ont un état non reconnu. ';

    return {
      passed: false,
      reason: blockReason +
              `Tous les talents doivent être en performed, performed_amended ou no_show. ` +
              `Non résolus (${unresolved.length}): ${details}. ` +
              `États valides: ${[...RESOLVED_STATES].join(', ')}. ` +
              `Source : OS V14 §2.7.1 — Tous les talents en état performed · ` +
              `aucun no-show non résolu.`,
    };
  }

  // ── Condition 2 : l'Engagement appelant est bien `performed` ─
  // Redondant avec la TRANSITION_TABLE mais défense en profondeur.
  const callerEngagement = lineupEngagements.find(e => e.engagementId === engagementId);
  if (callerEngagement && callerEngagement.status !== 'performed' && callerEngagement.status !== 'performed_amended') {
    return {
      passed: false,
      reason: `EVENT_COMPLETION_CALLER_NOT_PERFORMED: L'Engagement appelant (${engagementId}) ` +
              `est en état "${callerEngagement.status}" — attendu "performed" ou "performed_amended". ` +
              `Cohérence de la transition requise.`,
    };
  }

  const resolvedCount   = lineupEngagements.length;
  const performedCount  = lineupEngagements.filter(e => e.status === 'performed' || e.status === 'performed_amended').length;
  const noShowCount     = lineupEngagements.filter(e => e.status === 'no_show').length;

  return {
    passed: true,
    resolvedCount,
    performedCount,
    noShowCount,
    audit: {
      engagementId,
      transitionKey,
      lineupSize:     resolvedCount,
      performedCount,
      noShowCount,
      allResolved:    true,
      checkedAt:      new Date().toISOString(),
    },
  };
}

module.exports = { validate, COVERED_TRANSITIONS, RESOLVED_STATES };