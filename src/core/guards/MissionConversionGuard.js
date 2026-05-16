/**
 * MICRO RAVE V3 — MissionConversionGuard
 * ============================================================
 * Guard spécifique à la transition : proposed → accepted
 * Source : OS V10 section 2.7.1
 *
 * Responsabilités :
 *   1. Vérifier que organizerUserId et talentUserId existent
 *   2. Vérifier qu'aucun ContractSnapshot phase 1 n'existe déjà
 *   3. Construire le ContractSnapshot phase 1 (WORM Niveau 1)
 *      sans l'écrire — la persistence appartient à l'appelant
 *
 * Ce guard NE touche PAS Base44 directement.
 * Il reçoit les données via `context` et retourne un résultat.
 * Le branchement Base44 se fait dans le repository.
 *
 * Ref OS : ContractSnapshot phase 1 = moment WORM 1
 *   "cachet brut, tier, taux, SOTS snapshot, historique complet
 *    de négociation" — OS V10 section 2.7 moment 1
 * ============================================================
 */

'use strict';

const IDFactory = require('../IDFactory');

/**
 * Valide la transition proposed → accepted et construit
 * le ContractSnapshot phase 1 prêt à être persisté.
 *
 * @param {object} params
 * @param {string} params.engagementId      — systemId de l'Engagement
 * @param {string} params.actor             — systemId de l'acteur qui valide
 * @param {object} params.context           — données fournies par l'appelant
 * @param {string} params.context.talentUserId     — obligatoire
 * @param {string} params.context.organizerUserId  — obligatoire
 * @param {string} params.context.roleMetier        — obligatoire
 * @param {number} params.context.cachetBrutCents   — obligatoire, en centimes entiers
 * @param {string} params.context.tier              — obligatoire (ex: 'Freemium', 'Base')
 * @param {number} params.context.tauxPpm           — obligatoire, en ppm entiers
 * @param {string} [params.context.existingContractSnapshotId] — si fourni, bloque (idempotency)
 * @param {object} params.repositories      — accès aux données (injectable, peut être vide en test)
 *
 * @returns {object} { passed: true, contractSnapshot } si validé
 * @returns {object} { passed: false, reason: string } si bloqué
 */
async function validate({
  engagementId,
  actor,
  context = {},
  repositories = {},
}) {

  const {
    talentUserId,
    organizerUserId,
    roleMetier,
    cachetBrutCents,
    tier,
    tauxPpm,
    existingContractSnapshotId,
  } = context;

  // ── Vérification 1 : talentUserId obligatoire ─────────────
  if (!talentUserId) {
    return {
      passed: false,
      reason: 'MISSING_TALENT: talentUserId est obligatoire pour proposed→accepted',
    };
  }

  // ── Vérification 2 : organizerUserId obligatoire ──────────
  if (!organizerUserId) {
    return {
      passed: false,
      reason: 'MISSING_ORGANIZER: organizerUserId est obligatoire pour proposed→accepted',
    };
  }

  // ── Vérification 3 : roleMetier obligatoire ───────────────
  if (!roleMetier) {
    return {
      passed: false,
      reason: 'MISSING_ROLE: roleMetier est obligatoire pour proposed→accepted',
    };
  }

  // ── Vérification 4 : cachetBrutCents — entier positif ─────
  // Standard numérique invariant : MONEY = integer cents
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

  // ── Vérification 5 : taux en ppm — entier ─────────────────
  // Standard numérique invariant : RATE = integer ppm
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

  // ── Vérification 6 : tier obligatoire ─────────────────────
  if (!tier) {
    return {
      passed: false,
      reason: 'MISSING_TIER: tier abonnement est obligatoire pour calculer le taux effectif',
    };
  }

  // ── Vérification 7 : idempotency — ContractSnapshot existe déjà ? ──
  // Source : OS V10 — un ContractSnapshot phase 1 ne se crée
  // qu'une seule fois par Engagement.
  if (existingContractSnapshotId) {
    return {
      passed: false,
      reason: `IDEMPOTENCY_VIOLATION: Un ContractSnapshot phase 1 existe déjà ` +
              `pour cet Engagement (${existingContractSnapshotId}). ` +
              `La transition proposed→accepted ne peut pas être rejouée.`,
    };
  }

  // ── Calcul de la commission MR ────────────────────────────
  // floor() sur la commission — MR ne sur-prélève jamais
  // Source : OS V10 section 3.3 LOI WATERFALL-01
  const commissionMrCents = Math.floor(cachetBrutCents * tauxPpm / 1_000_000);
  const talentNetCents    = cachetBrutCents - commissionMrCents;

  // ── Construction du ContractSnapshot phase 1 ─────────────
  // Source : OS V10 section 2.7 moment 1 — WORM Niveau 1
  // Ce snapshot est retourné, pas persisté ici.
  const contractSnapshot = {
    systemId:          IDFactory.generate('ContractSnapshotV1'),
    engagementId,
    phase:             1,
    wormLevel:         'W1',
    // Parties
    talentUserId,
    organizerUserId,
    // Mandat
    roleMetier,
    // Financier — en centimes entiers (jamais de virgule flottante)
    cachetBrutCents,
    tier,
    tauxPpm,
    commissionMrCents,
    talentNetCents,
    // Métadonnées
    createdByActor:    actor,
    createdAt:         new Date().toISOString(),
    // Champs à compléter à la transition : voie CreateEvent
    // Source : OS V10 section 2.7 moment 1
    // "cachet brut, tier, taux, SOTS snapshot, historique complet de négociation"
    sotsSnapshotPpm:   1_000_000,   // Multiplicateur neutre par défaut (sous seuil 10)
    negotiationHistory: context.negotiationHistory || [],
  };

  return {
    passed: true,
    contractSnapshot,
    // Rapport de débogage pour l'AuditLogger
    audit: {
      commissionMrCents,
      talentNetCents,
      tier,
      tauxPpm,
    },
  };
}

module.exports = { validate };
