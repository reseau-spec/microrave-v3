/**
 * MICRO RAVE V3 — PresenceProofGuard
 * ============================================================
 * Guard pour deux transitions :
 *   performed → payable           [D-019-A] SoloFounderOverride uniquement
 *   contestation_window → payable [D-019-B] chemin nominal post-SOTS
 *
 * Vérifie séquentiellement les 11 conditions de payout (D-075).
 * Toutes les valeurs de seuil viennent de la database via PolicyConfigRepository.
 * Aucune constante financière dans ce fichier — jamais.
 *
 * Source : D-075 · OS V14 section 2.7 · LOI CO-DÉPENDANCE-01 (VT-02)
 *
 * Structure des 11 conditions (D-075) :
 *   C-01 : Engagement existe et est dans un état éligible au payout
 *   C-02 : ContractSnapshot phase 2 (W2) présent et valide
 *   C-03 : SessionPresence.checkedInAt non-null (présence initiée)
 *   C-04 : Distance GPS ≤ maxDistancePolicy (lecture DB)
 *   C-05 : Durée de présence ≥ max(minDurationFloorMinutes, durée_contrat × minDurationRatioPpm/1_000_000)
 *   C-06 : Validation organisateur OU expiration contestation_window (isSelfOrganized)
 *   C-07 : Aucun SafetyReport bloquant actif
 *   C-08 : SOTSSubmission présente (ou SoloFounderOverride pour performed→payable)
 *   C-09 : Aucun litige actif sur cet engagement (DisputeRecord absent)
 *   C-10 : ContractSnapshot.cachetBrutCents > 0 (montant à verser)
 *   C-11 : Idempotency — aucun SettlementInstruction déjà émis pour cet engagement
 *
 * Ce guard NE touche PAS la database directement.
 * Il reçoit les données via `context` et `repositories`, retourne un résultat.
 * ============================================================
 */

'use strict';

const MoneyMath = require('../MoneyMath');

/**
 * Point d'entrée unique.
 *
 * Champs obligatoires dans context :
 * @param {string}  context.transitionReason       — 'SOTS_EXPIRATION' | 'SOLO_FOUNDER_OVERRIDE'
 * @param {object}  context.sessionPresence        — { checkedInAt, checkoutAt, gpsDistanceMeters, durationMinutes }
 * @param {object}  context.contractSnapshotPhase2 — { cachetBrutCents, durationMinutes, talentUserId, ... }
 * @param {boolean} context.isSelfOrganized        — true si l'organisateur est le talent lui-même
 * @param {boolean} context.organizerValidated     — true si l'organisateur a validé explicitement
 * @param {object|null} context.sotsSubmission     — SOTSSubmission ou null
 * @param {object|null} context.activeSafetyReport — SafetyReport bloquant ou null
 * @param {object|null} context.activeDispute      — DisputeRecord actif ou null
 * @param {object|null} context.settlementInstruction — SettlementInstruction déjà émis ou null
 *
 * Champs obligatoires dans repositories :
 * @param {object}  repositories.policyConfig      — { getConfig(key) }
 */
async function validate({
  engagementId,
  currentState,
  targetState,
  actor,
  context = {},
  repositories = {},
}) {
  // ── Précondition : interface repositories ────────────────
  if (!repositories.policyConfig || typeof repositories.policyConfig.getConfig !== 'function') {
    return {
      passed: false,
      reason: 'GUARD_CONFIG_ERROR: repositories.policyConfig.getConfig() absent. ' +
              'PresenceProofGuard ne peut pas lire les seuils sans PolicyConfigRepository.',
    };
  }

  const getConfig = repositories.policyConfig.getConfig.bind(repositories.policyConfig);

  // ── Lecture des seuils depuis la database ─────────────────
  // Aucune valeur hardcodée — tout vient de PolicyConfig (D-063, Market Pivot)
  let maxDistanceMeters, minDurationFloorMinutes, minDurationRatioPpm;
  try {
    maxDistanceMeters      = parseInt(await getConfig('maxDistancePolicy'), 10);
    minDurationFloorMinutes = parseInt(await getConfig('minDurationFloorMinutes'), 10);
    minDurationRatioPpm    = parseInt(await getConfig('minDurationRatioPpm'), 10);
  } catch (err) {
    return {
      passed: false,
      reason: `POLICY_CONFIG_MISSING: Impossible de lire les seuils de présence depuis la database. ` +
              `Détail: ${err.message}. ` +
              `Exécuter node scripts/seed-policy-config.js pour initialiser les configs.`,
    };
  }

  if (!Number.isInteger(maxDistanceMeters) || maxDistanceMeters <= 0) {
    return { passed: false, reason: `CONFIG_INVALID: maxDistancePolicy=${maxDistanceMeters} doit être un entier > 0.` };
  }
  if (!Number.isInteger(minDurationFloorMinutes) || minDurationFloorMinutes <= 0) {
    return { passed: false, reason: `CONFIG_INVALID: minDurationFloorMinutes=${minDurationFloorMinutes} doit être un entier > 0.` };
  }
  if (!Number.isInteger(minDurationRatioPpm) || minDurationRatioPpm <= 0 || minDurationRatioPpm > 1_000_000) {
    return { passed: false, reason: `CONFIG_INVALID: minDurationRatioPpm=${minDurationRatioPpm} hors domaine [1, 1_000_000].` };
  }

  const {
    transitionReason,
    sessionPresence,
    contractSnapshotPhase2,
    isSelfOrganized,
    organizerValidated,
    sotsSubmission,
    activeSafetyReport,
    activeDispute,
    settlementInstruction,
  } = context;

  // ──────────────────────────────────────────────────────────
  // C-01 : État source éligible au payout
  // ──────────────────────────────────────────────────────────
  const eligibleStates = ['performed', 'contestation_window'];
  if (!eligibleStates.includes(currentState)) {
    return {
      passed: false,
      reason: `C-01_INVALID_STATE: L'état source "${currentState}" n'est pas éligible au payout. ` +
              `États éligibles : ${eligibleStates.join(', ')}.`,
    };
  }

  // SoloFounderOverride : performed→payable est réservé au fondateur (D-019-A, D-106)
  if (currentState === 'performed') {
    if (transitionReason !== 'SOLO_FOUNDER_OVERRIDE') {
      return {
        passed: false,
        reason: 'C-01_OVERRIDE_REQUIRED: La transition performed→payable exige transitionReason="SOLO_FOUNDER_OVERRIDE". ' +
                'Le chemin nominal passe par contestation_window→payable. Source : D-019-A, D-106.',
      };
    }
  }

  // ──────────────────────────────────────────────────────────
  // C-02 : ContractSnapshot phase 2 présent
  // ──────────────────────────────────────────────────────────
  if (!contractSnapshotPhase2) {
    return {
      passed: false,
      reason: 'C-02_MISSING_SNAPSHOT: contractSnapshotPhase2 absent. ' +
              'Le ContractSnapshot W2 doit être présent avant tout payout. ' +
              'La transition event_sealed (Moment WORM 3) doit avoir eu lieu.',
    };
  }
  if (contractSnapshotPhase2.cachetBrutCents === undefined || contractSnapshotPhase2.cachetBrutCents === null || !contractSnapshotPhase2.talentUserId) {
    return {
      passed: false,
      reason: 'C-02_SNAPSHOT_INCOMPLETE: contractSnapshotPhase2 incomplet — ' +
              'cachetBrutCents et talentUserId sont obligatoires.',
    };
  }

  // ──────────────────────────────────────────────────────────
  // C-03 : SessionPresence.checkedInAt non-null
  // ──────────────────────────────────────────────────────────
  if (!sessionPresence) {
    return {
      passed: false,
      reason: 'C-03_NO_SESSION_PRESENCE: sessionPresence absent. ' +
              'Aucune donnée de présence pour cet engagement. ' +
              'Le talent doit avoir initié un check-in via l\'application.',
    };
  }
  if (!sessionPresence.checkedInAt) {
    return {
      passed: false,
      reason: 'C-03_NO_CHECKIN: sessionPresence.checkedInAt est null. ' +
              'La présence n\'a pas été initiée. Le talent doit effectuer son check-in.',
    };
  }

  // ──────────────────────────────────────────────────────────
  // C-04 : Distance GPS ≤ maxDistancePolicy
  // ──────────────────────────────────────────────────────────
  if (sessionPresence.gpsDistanceMeters === undefined || sessionPresence.gpsDistanceMeters === null) {
    return {
      passed: false,
      reason: 'C-04_NO_GPS_DATA: sessionPresence.gpsDistanceMeters absent. ' +
              'La position GPS n\'a pas été enregistrée lors du check-in.',
    };
  }
  if (!Number.isFinite(sessionPresence.gpsDistanceMeters) || sessionPresence.gpsDistanceMeters < 0) {
    return {
      passed: false,
      reason: `C-04_INVALID_GPS: gpsDistanceMeters=${sessionPresence.gpsDistanceMeters} invalide.`,
    };
  }
  if (sessionPresence.gpsDistanceMeters > maxDistanceMeters) {
    return {
      passed: false,
      reason: `C-04_GPS_TOO_FAR: Distance GPS ${sessionPresence.gpsDistanceMeters}m > ` +
              `maxDistancePolicy ${maxDistanceMeters}m (DB). ` +
              `Le talent était à ${Math.round(sessionPresence.gpsDistanceMeters)}m du lieu, ` +
              `seuil configuré : ${maxDistanceMeters}m.`,
    };
  }

  // ──────────────────────────────────────────────────────────
  // C-05 : Durée de présence ≥ plancher requis
  // Règle à deux couches (D-075, A-057) :
  //   Si durée contractuelle connue : max(floor, durée_contrat × ratio / 1_000_000)
  //   Sinon : plancher absolu seul
  // ──────────────────────────────────────────────────────────
  if (sessionPresence.durationMinutes === undefined || sessionPresence.durationMinutes === null) {
    return {
      passed: false,
      reason: 'C-05_NO_DURATION: sessionPresence.durationMinutes absent. ' +
              'La durée de présence n\'a pas été calculée. checkoutAt requis.',
    };
  }
  if (!Number.isFinite(sessionPresence.durationMinutes) || sessionPresence.durationMinutes < 0) {
    return {
      passed: false,
      reason: `C-05_INVALID_DURATION: durationMinutes=${sessionPresence.durationMinutes} invalide.`,
    };
  }

  const contractDurationMinutes = contractSnapshotPhase2.durationMinutes || null;
  let minRequiredMinutes = minDurationFloorMinutes;

  if (contractDurationMinutes && Number.isInteger(contractDurationMinutes) && contractDurationMinutes > 0) {
    // Durée contractuelle connue — appliquer le ratio via MoneyMath
    // prorataCents réutilisé ici pour la division ppm, même logique que pour les montants
    const ratioDuration = MoneyMath.prorataCents(contractDurationMinutes, minDurationRatioPpm, 1_000_000);
    minRequiredMinutes  = Math.max(minDurationFloorMinutes, ratioDuration);
  }

  if (sessionPresence.durationMinutes < minRequiredMinutes) {
    const ruleDescription = contractDurationMinutes
      ? `max(${minDurationFloorMinutes}min plancher, ${contractDurationMinutes}min × ${minDurationRatioPpm / 10_000}% = ${minRequiredMinutes}min requis)`
      : `plancher absolu ${minDurationFloorMinutes}min (durée contractuelle absente)`;
    return {
      passed: false,
      reason: `C-05_INSUFFICIENT_DURATION: Durée de présence ${sessionPresence.durationMinutes}min < ` +
              `${minRequiredMinutes}min requis. Règle : ${ruleDescription}. ` +
              `Valeurs lues depuis la database (maxDistancePolicy, minDurationFloorMinutes, minDurationRatioPpm).`,
    };
  }

  // ──────────────────────────────────────────────────────────
  // C-06 : Validation organisateur OU expiration contestation_window
  // ──────────────────────────────────────────────────────────
  if (isSelfOrganized !== true && organizerValidated !== true) {
    // L'expiration automatique de la contestation_window est une validation implicite
    // Seul ContestationWindowGuard peut déclencher cette transition via SchedulerDueTask
    if (transitionReason !== 'CONTESTATION_WINDOW_EXPIRED' && transitionReason !== 'SOLO_FOUNDER_OVERRIDE') {
      return {
        passed: false,
        reason: 'C-06_NO_ORGANIZER_VALIDATION: Ni la validation organisateur ni l\'expiration ' +
                'de la fenêtre de contestation ne sont présentes. ' +
                'organizerValidated doit être true, ou isSelfOrganized=true, ' +
                'ou transitionReason="CONTESTATION_WINDOW_EXPIRED". ' +
                'Source : D-075 Condition 6.',
      };
    }
  }

  // ──────────────────────────────────────────────────────────
  // C-07 : Aucun SafetyReport bloquant
  // ──────────────────────────────────────────────────────────
  if (activeSafetyReport) {
    return {
      passed: false,
      reason: `C-07_SAFETY_REPORT_BLOCKING: Un SafetyReport bloquant est actif sur cet engagement. ` +
              `ID: ${activeSafetyReport.id || 'inconnu'}. ` +
              `Le payout est suspendu jusqu\'à résolution administrative. ` +
              `Source : D-075 Condition 7.`,
    };
  }

  // ──────────────────────────────────────────────────────────
  // C-08 : SOTSSubmission présente
  // Exception : SoloFounderOverride (performed→payable) — SOTS pas encore soumis
  // ──────────────────────────────────────────────────────────
  if (!sotsSubmission && transitionReason !== 'SOLO_FOUNDER_OVERRIDE') {
    return {
      passed: false,
      reason: 'C-08_NO_SOTS: SOTSSubmission absente. ' +
              'Le talent doit avoir soumis son SOTS avant que le payout soit autorisé. ' +
              'Source : D-075 Condition 8 · SOTS-TEMOIN-01 (VT-22).',
    };
  }

  // ──────────────────────────────────────────────────────────
  // C-09 : Aucun litige actif
  // ──────────────────────────────────────────────────────────
  if (activeDispute) {
    return {
      passed: false,
      reason: `C-09_ACTIVE_DISPUTE: Un litige actif bloque le payout. ` +
              `DisputeRecord ID: ${activeDispute.id || 'inconnu'}, ` +
              `statut: ${activeDispute.status || 'inconnu'}. ` +
              `Le payout est suspendu jusqu\'à résolution via DisputeResolutionGuard. ` +
              `Source : D-075 Condition 9.`,
    };
  }

  // ──────────────────────────────────────────────────────────
  // C-10 : Montant à verser > 0
  // ──────────────────────────────────────────────────────────
  if (
    !Number.isInteger(contractSnapshotPhase2.cachetBrutCents) ||
    contractSnapshotPhase2.cachetBrutCents <= 0
  ) {
    return {
      passed: false,
      reason: `C-10_ZERO_AMOUNT: contractSnapshotPhase2.cachetBrutCents=${contractSnapshotPhase2.cachetBrutCents}. ` +
              `Un engagement à 0$ ne déclenche pas de payout. ` +
              `Source : D-075 Condition 10.`,
    };
  }

  // ──────────────────────────────────────────────────────────
  // C-11 : Idempotency — aucun SettlementInstruction déjà émis
  // ──────────────────────────────────────────────────────────
  if (settlementInstruction) {
    return {
      passed: false,
      reason: `C-11_IDEMPOTENCY_VIOLATION: Un SettlementInstruction existe déjà pour cet engagement. ` +
              `ID: ${settlementInstruction.id || 'inconnu'}. ` +
              `Le payout ne peut pas être déclenché deux fois. ` +
              `Source : D-075 Condition 11 · D-101 anti-double payout.`,
    };
  }

  // ──────────────────────────────────────────────────────────
  // Toutes les conditions passées — payout autorisé
  // ──────────────────────────────────────────────────────────
  return {
    passed: true,
    audit: {
      conditionsPassed:        11,
      transitionReason,
      currentState,
      gpsDistanceMeters:       sessionPresence.gpsDistanceMeters,
      maxDistanceMeters,
      presenceDurationMinutes: sessionPresence.durationMinutes,
      minRequiredMinutes,
      minDurationFloorMinutes,
      minDurationRatioPpm,
      contractDurationMinutes: contractDurationMinutes || null,
      cachetBrutCents:         contractSnapshotPhase2.cachetBrutCents,
      talentUserId:            contractSnapshotPhase2.talentUserId,
      isSelfOrganized:         isSelfOrganized || false,
      organizerValidated:      organizerValidated || false,
      sotsSubmissionId:        sotsSubmission?.id || null,
    },
  };
}

module.exports = { validate };