/**
 * MICRO RAVE V3 — PlacementGuard
 * ============================================================
 * Guard spécifique à la transition : accepted → placed
 * Source : OS V10 section 2.7.1
 *
 * Responsabilités :
 *   1. Vérifier que le ContractSnapshot phase 1 existe
 *      (créé par MissionConversionGuard à proposed→accepted)
 *   2. Vérifier que l'Event existe et est dans un état valide
 *   3. Vérifier que le Lineup est cohérent (au moins un MissionSlot)
 *   4. Vérifier que le talentUserId correspond au ContractSnapshot
 *
 * CE GUARD NE TOUCHE PAS À L'ARGENT.
 * financialGuard: false sur accepted→placed.
 * L'argent commence à placed→deposit_pending (EventPaymentGuard).
 *
 * Ce guard NE touche PAS Base44 directement.
 * Il reçoit les données via `context` et retourne un résultat.
 * ============================================================
 */

'use strict';

/**
 * Valide la transition accepted → placed.
 *
 * @param {object} params
 * @param {string} params.engagementId       — systemId de l'Engagement
 * @param {string} params.currentState       — doit être 'accepted'
 * @param {string} params.targetState        — doit être 'placed'
 * @param {string} params.actor              — systemId de l'acteur
 * @param {object} params.context            — données fournies par l'appelant
 * @param {string} params.context.contractSnapshotId   — obligatoire (CS1-*)
 * @param {string} params.context.talentUserId         — obligatoire
 * @param {string} params.context.organizerUserId      — obligatoire
 * @param {string} params.context.eventId              — obligatoire (EVT-*)
 * @param {Array}  params.context.lineupSlots          — obligatoire, min 1 élément
 * @param {object} params.repositories       — accès aux données
 *
 * @returns {object} { passed: true } si validé
 * @returns {object} { passed: false, reason: string } si bloqué
 */
async function validate({
  engagementId,
  currentState,
  targetState,
  actor,
  context = {},
  repositories = {},
}) {

  const {
    contractSnapshotId,
    talentUserId,
    organizerUserId,
    eventId,
    lineupSlots,
  } = context;

  // ── Vérification 1 : ContractSnapshot phase 1 obligatoire ─
  // MissionConversionGuard l'a créé à proposed→accepted.
  // Sans lui, on ne peut pas placer — il n'y a pas de contrat.
  // Source : OS V10 section 2.7 moment 1
  if (!contractSnapshotId) {
    return {
      passed: false,
      reason: 'MISSING_CONTRACT_SNAPSHOT: Le ContractSnapshot phase 1 (CS1-*) est obligatoire ' +
              'pour placed. Il doit avoir été créé à proposed→accepted par MissionConversionGuard.',
    };
  }

  if (!contractSnapshotId.startsWith('CS1-')) {
    return {
      passed: false,
      reason: `INVALID_CONTRACT_SNAPSHOT: Le contractSnapshotId doit commencer par "CS1-". ` +
              `Reçu : "${contractSnapshotId}". ` +
              `Un ContractSnapshot phase 2 (CS2-) ne peut pas servir ici.`,
    };
  }

  // ── Vérification 2 : talentUserId obligatoire ─────────────
  if (!talentUserId) {
    return {
      passed: false,
      reason: 'MISSING_TALENT: talentUserId est obligatoire pour accepted→placed',
    };
  }

  // ── Vérification 3 : organizerUserId obligatoire ──────────
  if (!organizerUserId) {
    return {
      passed: false,
      reason: 'MISSING_ORGANIZER: organizerUserId est obligatoire pour accepted→placed',
    };
  }

  // ── Vérification 4 : eventId obligatoire ──────────────────
  // L'Event doit exister pour qu'un Engagement puisse être placé.
  if (!eventId) {
    return {
      passed: false,
      reason: 'MISSING_EVENT: eventId est obligatoire pour accepted→placed. ' +
              'Un Engagement ne peut pas être placé sans Event associé.',
    };
  }

  if (!eventId.startsWith('EVT-')) {
    return {
      passed: false,
      reason: `INVALID_EVENT_ID: L'eventId doit commencer par "EVT-". ` +
              `Reçu : "${eventId}".`,
    };
  }

  // ── Vérification 5 : Lineup cohérent ──────────────────────
  // Au moins un MissionSlot dans le Lineup.
  // Source : OS V10 section 2.6 — deposit_pending réserve le Lineup complet
  if (!lineupSlots || !Array.isArray(lineupSlots) || lineupSlots.length === 0) {
    return {
      passed: false,
      reason: 'EMPTY_LINEUP: Le Lineup doit contenir au moins un MissionSlot ' +
              'pour que le placement soit possible. ' +
              'Source : OS V10 section 2.6 — deposit_pending réserve le Lineup complet.',
    };
  }

  // ── Vérification 6 : Chaque slot du Lineup a un talentUserId ──
  for (let i = 0; i < lineupSlots.length; i++) {
    const slot = lineupSlots[i];
    if (!slot.talentUserId) {
      return {
        passed: false,
        reason: `LINEUP_SLOT_INCOMPLETE: Le MissionSlot à l'index ${i} n'a pas de talentUserId. ` +
                `Tous les slots doivent avoir un talent assigné avant le placement.`,
      };
    }
    if (!slot.roleMetier) {
      return {
        passed: false,
        reason: `LINEUP_SLOT_INCOMPLETE: Le MissionSlot à l'index ${i} n'a pas de roleMetier. ` +
                `Tous les slots doivent avoir un rôle défini avant le placement.`,
      };
    }
  }

  // ── Placement autorisé ────────────────────────────────────
  return {
    passed: true,
    // Données transmises pour l'AuditLogger
    audit: {
      contractSnapshotId,
      eventId,
      lineupSlotsCount: lineupSlots.length,
      talentUserId,
      organizerUserId,
    },
  };
}

module.exports = { validate };