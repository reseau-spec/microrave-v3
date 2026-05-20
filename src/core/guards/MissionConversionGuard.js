/**
 * MICRO RAVE V3 — MissionConversionGuard
 * ============================================================
 * Guard spécifique aux transitions de conversion de mission :
 *   - proposed → accepted    (voie directe — ContractSnapshot créé)
 *   - proposed → negotiating (ouverture négociation — PAS de snapshot)
 *   - negotiating → accepted (accord après négociation — ContractSnapshot créé)
 *
 * Source : OS V10 section 2.7.1
 *
 * DISPATCH PAR targetState — logique différente selon la transition :
 *
 *   proposed → negotiating :
 *     Valider uniquement les acteurs et le rôle.
 *     Le cachet N'EST PAS encore arrêté — c'est l'objet de la négociation.
 *     Aucun ContractSnapshot n'est créé ici.
 *
 *   proposed → accepted
 *   negotiating → accepted :
 *     Valider acteurs, cachet, taux, tier, idempotency.
 *     Construire le ContractSnapshot phase 1 (WORM Niveau 1).
 *
 * Ce guard NE touche PAS Base44 directement.
 * Il reçoit les données via `context` et retourne un résultat.
 * La persistence appartient à l'appelant via le repository.
 * ============================================================
 */

'use strict';

const IDFactory = require('../IDFactory');

/**
 * Point d'entrée unique — dispatche selon targetState.
 */
async function validate({
  engagementId,
  currentState,
  targetState,
  actor,
  context = {},
  repositories = {},
}) {

  switch (targetState) {

    case 'negotiating':
      return validateNegotiationOpening({ engagementId, actor, context });

    case 'accepted':
      return validateAcceptance({ engagementId, actor, context });

    default:
      return {
        passed: false,
        reason: `GUARD_MISMATCH: MissionConversionGuard ne couvre pas la transition ` +
                `vers "${targetState}". Transitions couvertes : negotiating, accepted.`,
      };
  }
}

// ── proposed → negotiating ────────────────────────────────────
// Ouverture de la négociation.
// Le prix n'est PAS encore arrêté — c'est l'objet de la négociation.
// Valide uniquement les acteurs et le roleMetier.
// Aucun ContractSnapshot créé.
// Source : OS V10 section 2.6
function validateNegotiationOpening({ engagementId, actor, context }) {
  const { talentUserId, organizerUserId, roleMetier } = context;

  if (!talentUserId) {
    return {
      passed: false,
      reason: 'MISSING_TALENT: talentUserId est obligatoire pour proposed→negotiating',
    };
  }

  if (!organizerUserId) {
    return {
      passed: false,
      reason: 'MISSING_ORGANIZER: organizerUserId est obligatoire pour proposed→negotiating',
    };
  }

  if (!roleMetier) {
    return {
      passed: false,
      reason: 'MISSING_ROLE: roleMetier est obligatoire pour proposed→negotiating',
    };
  }

  // Le cachet et le taux ne sont PAS requis ici —
  // ils seront arrêtés pendant la négociation et validés à negotiating→accepted.
  return {
    passed: true,
    audit: { talentUserId, organizerUserId, roleMetier, note: 'negotiation_opened' },
  };
}

// ── proposed → accepted  /  negotiating → accepted ───────────
// Accord final — le prix est arrêté, le ContractSnapshot est créé.
// Logique complète : acteurs, cachet, taux, tier, idempotency, snapshot.
// Source : OS V10 section 2.7 moment 1 — WORM Niveau 1
function validateAcceptance({ engagementId, actor, context }) {
  const {
    talentUserId,
    organizerUserId,
    roleMetier,
    cachetBrutCents,
    tier,
    tauxPpm,
    existingContractSnapshotId,
  } = context;

  // ── Vérification 1 : talentUserId obligatoire ────────────
  if (!talentUserId) {
    return {
      passed: false,
      reason: 'MISSING_TALENT: talentUserId est obligatoire pour →accepted',
    };
  }

  // ── Vérification 2 : organizerUserId obligatoire ─────────
  if (!organizerUserId) {
    return {
      passed: false,
      reason: 'MISSING_ORGANIZER: organizerUserId est obligatoire pour →accepted',
    };
  }

  // ── Vérification 3 : roleMetier obligatoire ──────────────
  if (!roleMetier) {
    return {
      passed: false,
      reason: 'MISSING_ROLE: roleMetier est obligatoire pour →accepted',
    };
  }

  // ── Vérification 4 : cachetBrutCents — entier positif ────
  // Standard numérique invariant : MONEY = integer cents, jamais float
  // Source : OS V10 section 3.2
  if (
    cachetBrutCents === undefined ||
    cachetBrutCents === null ||
    !Number.isInteger(cachetBrutCents) ||
    cachetBrutCents < 0
  ) {
    return {
      passed: false,
      reason: `INVALID_CACHET: cachetBrutCents doit être un entier positif en centimes. ` +
              `Reçu : ${cachetBrutCents}. Les virgules flottantes sont interdites.`,
    };
  }

  // ── Vérification 5 : tauxPpm — entier ppm ────────────────
  // Standard numérique invariant : RATE = integer ppm, jamais float
  // Source : OS V10 section 3.2
  if (
    tauxPpm === undefined ||
    tauxPpm === null ||
    !Number.isInteger(tauxPpm) ||
    tauxPpm < 0 ||
    tauxPpm > 1_000_000
  ) {
    return {
      passed: false,
      reason: `INVALID_TAUX: tauxPpm doit être un entier entre 0 et 1 000 000. ` +
              `Reçu : ${tauxPpm}. (100% = 1 000 000 ppm)`,
    };
  }

  // ── Vérification 6 : tier obligatoire ────────────────────
  if (!tier) {
    return {
      passed: false,
      reason: 'MISSING_TIER: tier abonnement est obligatoire pour calculer le taux effectif',
    };
  }

  // ── Vérification 7 : idempotency ─────────────────────────
  // Un ContractSnapshot phase 1 ne se crée qu'une seule fois par Engagement.
  // Source : OS V10 section 2.7 moment 1
  if (existingContractSnapshotId) {
    return {
      passed: false,
      reason: `IDEMPOTENCY_VIOLATION: Un ContractSnapshot phase 1 existe déjà ` +
              `pour cet Engagement (${existingContractSnapshotId}). ` +
              `La transition →accepted ne peut pas être rejouée.`,
    };
  }

  // ── Calcul de la commission MR ────────────────────────────
  // floor() sur la commission — MR ne sur-prélève jamais
  // Source : OS V10 section 3.3 LOI WATERFALL-01
  const MoneyMath.applyRatePpm(cachetBrutCents, tauxPpm);
  const talentNetCents    = cachetBrutCents - commissionMrCents;

  // ── Construction du ContractSnapshot phase 1 ─────────────
  // WORM Niveau 1 — retourné, pas persisté ici.
  // Source : OS V10 section 2.7 moment 1
  const contractSnapshot = {
    systemId:           IDFactory.generate('ContractSnapshotV1'),
    engagementId,
    phase:              1,
    wormLevel:          'W1',
    talentUserId,
    organizerUserId,
    roleMetier,
    cachetBrutCents,
    tier,
    tauxPpm,
    commissionMrCents,
    talentNetCents,
    createdByActor:     actor,
    createdAt:          new Date().toISOString(),
    sotsSnapshotPpm:    1_000_000,   // Neutre sous seuil 10 — Source : OS V10 section 5.4
    negotiationHistory: context.negotiationHistory || [],
  };

  return {
    passed: true,
    contractSnapshot,
    audit: { commissionMrCents, talentNetCents, tier, tauxPpm },
  };
}

module.exports = { validate };