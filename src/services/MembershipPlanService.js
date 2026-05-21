/**
 * MICRO RAVE V3 — MembershipPlanService
 * ============================================================
 * Résolution du tauxPpm depuis le plan d'abonnement actif.
 *
 * Source : D-027 · Fiche J BLOQUANT-J2 · Plan Phase 1.2
 *
 * PROBLÈME RÉSOLU (Phase 1.2) :
 *   MissionConversionGuard reçoit tauxPpm via context (fourni par l'appelant).
 *   Sans ce service, l'appelant devait "savoir" que Freemium = 120 000 ppm —
 *   valeur hardcodée implicite, violation de D-027.
 *   Ce service est la source unique de résolution du taux depuis la base.
 *
 * Plans canoniques D-027 :
 *   Freemium  — 120 000 ppm (12%)
 *   Base      —  90 000 ppm  (9%)
 *   Pro       —  60 000 ppm  (6%)
 *   Studio    —  35 000 ppm  (3.5%)
 *   Fondateur —  50 000 ppm  (5%)
 *
 * RÈGLE FAIL-CLOSED :
 *   Aucun plan actif → MEMBERSHIP_PLAN_ERROR (jamais de taux par défaut silencieux).
 *   commissionRatePpm invalide → MEMBERSHIP_PLAN_ERROR.
 *   Source : OS V14 §9.6 — configs critiques.
 *
 * INTERFACE REPOSITORY ATTENDUE :
 *   repositories.membership.findActiveByUserId(userId)
 *   → retourne { planName, commissionRatePpm, ... } ou null
 * ============================================================
 */

'use strict';

const PPM_MIN = 0;
const PPM_MAX = 1_000_000;

/**
 * Retourne le tauxPpm du plan actif d'un utilisateur.
 * Fail-closed si aucun plan ou taux invalide.
 *
 * @param {object} params
 * @param {string}  params.userId        — USR-* obligatoire
 * @param {object}  params.repositories
 * @param {object}    params.repositories.membership — { findActiveByUserId }
 *
 * @returns {Promise<number>} tauxPpm — entier entre 0 et 1 000 000
 */
async function getTauxPpmForUser({ userId, repositories }) {
  if (!userId) {
    throw new Error(
      'MEMBERSHIP_PLAN_ERROR: userId obligatoire pour getTauxPpmForUser(). ' +
      'Source : D-027 — le taux est résolu par utilisateur, pas globalement.'
    );
  }
  if (!repositories || !repositories.membership) {
    throw new Error(
      'MEMBERSHIP_PLAN_ERROR: repositories.membership obligatoire. ' +
      'Fournir une instance avec findActiveByUserId().'
    );
  }

  const plan = await repositories.membership.findActiveByUserId(userId);

  if (!plan) {
    throw new Error(
      `MEMBERSHIP_PLAN_ERROR: aucun plan actif pour userId "${userId}". ` +
      `Assigner un MembershipPlan avant de calculer une commission. ` +
      `Source : D-027 — fail-closed sur plan absent.`
    );
  }

  const { commissionRatePpm } = plan;

  if (
    commissionRatePpm === undefined ||
    commissionRatePpm === null ||
    !Number.isInteger(commissionRatePpm) ||
    commissionRatePpm < PPM_MIN ||
    commissionRatePpm > PPM_MAX
  ) {
    throw new Error(
      `MEMBERSHIP_PLAN_ERROR: commissionRatePpm invalide pour userId "${userId}". ` +
      `Reçu : ${commissionRatePpm} (${typeof commissionRatePpm}). ` +
      `Doit être un entier entre ${PPM_MIN} et ${PPM_MAX}. ` +
      `Source : D-027 · D-064 — jamais float pour les taux.`
    );
  }

  return commissionRatePpm;
}

/**
 * Retourne l'objet plan complet ou null.
 * Utilisé quand l'appelant a besoin de plus que le taux (ex: nom du plan, tier).
 *
 * @param {object} params
 * @param {string}  params.userId
 * @param {object}  params.repositories
 * @param {object}    params.repositories.membership
 *
 * @returns {Promise<object|null>}
 */
async function getActivePlanForUser({ userId, repositories }) {
  if (!userId) {
    throw new Error('MEMBERSHIP_PLAN_ERROR: userId obligatoire pour getActivePlanForUser().');
  }
  if (!repositories || !repositories.membership) {
    throw new Error('MEMBERSHIP_PLAN_ERROR: repositories.membership obligatoire.');
  }
  return repositories.membership.findActiveByUserId(userId);
}

module.exports = { getTauxPpmForUser, getActivePlanForUser };