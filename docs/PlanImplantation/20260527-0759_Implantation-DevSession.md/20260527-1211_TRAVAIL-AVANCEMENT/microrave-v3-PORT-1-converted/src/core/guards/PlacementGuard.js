/**
 * MICRO RAVE V3 — PlacementGuard
 * ============================================================
 * Guard spécifique à la transition : accepted → placed
 * Source : OS V10 section 2.7.1
 *
 * Responsabilités :
 *   1. Vérifier que le ContractSnapshot phase 1 (CS1-*) existe
 *   2. Vérifier que l'Event existe (EVT-*)
 *   3. Vérifier que le Lineup est cohérent (≥1 slot avec talent + rôle)
 *   4. Calculer isSelfOrganized (talentUserId === organizerUserId)
 *      et le retourner pour que l'appelant l'attache à l'Engagement
 *
 * isSelfOrganized — Source : OS V10 section 2.2 BLOC 1 V8 :
 *   Si talentUserId === organizerUserId :
 *   - Auto-notation bloquée (domaine SOTS)
 *   - Condition 6 auto-satisfaite par délai (domaine présence)
 *   - Flag CONFLICT_OF_INTEREST_SELF si dispute (domaine admin)
 *   Ce champ doit être calculé ici et persisté sur l'Engagement
 *   avant que les guards en aval en aient besoin.
 *
 * CE GUARD NE TOUCHE PAS À L'ARGENT.
 * L'argent commence à placed→deposit_pending (EventPaymentGuard).
 * ============================================================
 */

'use strict';

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

  // ── Vérification 1 : ContractSnapshot phase 1 ────────────
  if (!contractSnapshotId) {
    return {
      passed: false,
      reason: 'MISSING_CONTRACT_SNAPSHOT: Le ContractSnapshot phase 1 (CS1-*) est obligatoire. ' +
              'Il doit avoir été créé à proposed→accepted par MissionConversionGuard.',
    };
  }

  if (!contractSnapshotId.startsWith('CS1-')) {
    return {
      passed: false,
      reason: `INVALID_CONTRACT_SNAPSHOT: contractSnapshotId doit commencer par "CS1-". ` +
              `Reçu : "${contractSnapshotId}".`,
    };
  }

  // ── Vérification 2 : acteurs ──────────────────────────────
  if (!talentUserId) {
    return {
      passed: false,
      reason: 'MISSING_TALENT: talentUserId est obligatoire pour accepted→placed',
    };
  }

  if (!organizerUserId) {
    return {
      passed: false,
      reason: 'MISSING_ORGANIZER: organizerUserId est obligatoire pour accepted→placed',
    };
  }

  // ── Vérification 3 : eventId ──────────────────────────────
  if (!eventId) {
    return {
      passed: false,
      reason: 'MISSING_EVENT: eventId est obligatoire pour accepted→placed.',
    };
  }

  if (!eventId.startsWith('EVT-')) {
    return {
      passed: false,
      reason: `INVALID_EVENT_ID: eventId doit commencer par "EVT-". Reçu : "${eventId}".`,
    };
  }

  // ── Vérification 4 : Lineup cohérent ─────────────────────
  if (!lineupSlots || !Array.isArray(lineupSlots) || lineupSlots.length === 0) {
    return {
      passed: false,
      reason: 'EMPTY_LINEUP: Le Lineup doit contenir au moins un MissionSlot. ' +
              'Source : OS V10 section 2.6 — deposit_pending réserve le Lineup complet.',
    };
  }

  for (let i = 0; i < lineupSlots.length; i++) {
    const slot = lineupSlots[i];
    if (!slot.talentUserId) {
      return {
        passed: false,
        reason: `LINEUP_SLOT_INCOMPLETE: Slot index ${i} sans talentUserId.`,
      };
    }
    if (!slot.roleMetier) {
      return {
        passed: false,
        reason: `LINEUP_SLOT_INCOMPLETE: Slot index ${i} sans roleMetier.`,
      };
    }
  }

  // ── Calcul isSelfOrganized ────────────────────────────────
  // Source : OS V10 section 2.2 BLOC 1 V8
  // Ce champ doit être persisté sur l'Engagement par l'appelant.
  // Il est utilisé par :
  //   - PresenceProofGuard (Condition 6 auto-satisfaite par délai)
  //   - SOTSWindowGuard (auto-notation bloquée)
  //   - DisputeGuard (CONFLICT_OF_INTEREST_SELF)
  const isSelfOrganized = talentUserId === organizerUserId;

  if (isSelfOrganized) {
    console.log(
      `[PlacementGuard] isSelfOrganized=true détecté. EngagementId: ${engagementId}. ` +
      `Conséquences : auto-notation bloquée, Condition 6 auto-satisfaite par délai, ` +
      `CONFLICT_OF_INTEREST_SELF si dispute.`
    );
  }

  return {
    passed: true,
    isSelfOrganized,  // ← l'appelant doit persister ce champ sur l'Engagement
    audit: {
      contractSnapshotId,
      eventId,
      lineupSlotsCount: lineupSlots.length,
      talentUserId,
      organizerUserId,
      isSelfOrganized,
    },
  };
}

export default {
validate 
};
export { validate };