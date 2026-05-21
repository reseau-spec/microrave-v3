/**
 * MICRO RAVE V3 — MembershipRepository (interface)
 * ============================================================
 * Interface portable pour UserMembership et MembershipPlan.
 *
 * Source : D-128 · D-027 · Plan Phase 1.2 complément
 *
 * Rôle : résolution du plan d'abonnement actif d'un utilisateur.
 *   MembershipPlanService.getTauxPpmForUser() appelle
 *   findActiveByUserId() pour obtenir commissionRatePpm.
 *
 * Plans canoniques D-027 :
 *   Freemium  — 120 000 ppm (12%)
 *   Base      —  90 000 ppm  (9%)
 *   Pro       —  60 000 ppm  (6%)
 *   Studio    —  35 000 ppm  (3.5%)
 *   Fondateur —  50 000 ppm  (5%)
 *
 * RÈGLE D-128 : interface portable.
 *   Si Micro Rave migre hors Base44, seul cet adapter change.
 *   MembershipPlanService ne sait pas ce qui persiste.
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

/**
 * Retourne le plan d'abonnement actif d'un utilisateur.
 * Requête sur UserMembership (jointure MembershipPlan).
 *
 * @param {string} userId — USR-* obligatoire
 * @returns {Promise<{ planName, commissionRatePpm, tier, ... }|null>}
 */
async function findActiveByUserId(userId) {
  if (!userId) {
    throw new Error(
      'MEMBERSHIP_REPOSITORY_ERROR: userId obligatoire pour findActiveByUserId(). ' +
      'Source : D-027 — le plan est résolu par utilisateur.'
    );
  }

  // Requête UserMembership où userId = userId ET status = 'active'
  const q = encodeURIComponent(JSON.stringify({ userId, status: 'active' }));
  const memberships = await base44Get(`/entities/UserMembership?q=${q}`);

  if (!Array.isArray(memberships) || memberships.length === 0) {
    return null;
  }

  const membership = memberships[0];

  // Si l'objet UserMembership contient déjà commissionRatePpm (dénormalisé) — retourner directement
  if (Number.isInteger(membership.commissionRatePpm)) {
    return membership;
  }

  // Sinon résoudre depuis MembershipPlan via planId
  if (membership.planId) {
    const plan = await findPlanById(membership.planId);
    if (plan) {
      return { ...membership, ...plan };
    }
  }

  return membership;
}

/**
 * Retourne un MembershipPlan par son id Base44.
 *
 * @param {string} planId — id Base44 du MembershipPlan
 * @returns {Promise<{ planName, commissionRatePpm, tier, ... }|null>}
 */
async function findPlanById(planId) {
  if (!planId) {
    throw new Error(
      'MEMBERSHIP_REPOSITORY_ERROR: planId obligatoire pour findPlanById(). ' +
      'Source : D-027.'
    );
  }

  const plans = await base44Get(`/entities/MembershipPlan/${planId}`);

  // Base44 retourne soit un objet direct soit un tableau
  if (Array.isArray(plans)) {
    return plans[0] || null;
  }
  return plans || null;
}

module.exports = {
  findActiveByUserId,
  findPlanById,
};