/**
 * MICRO RAVE V3 — StripeConnectService
 * ============================================================
 * Orchestration de l'onboarding talent via Stripe Connect Express.
 *
 * Flux complet :
 *   1. initiateTalentOnboarding()  → crée account Express → persiste stripeAccountId
 *   2. createOnboardingLink()      → retourne l'URL de redirection frontend
 *   3. refreshOnboardingLink()     → si le lien expire
 *   4. verifyKYCStatus()           → vérifie details_submitted + charges_enabled
 *   5. getTalentPaymentProfile()   → état complet du profil de paiement
 *
 * Persistance : TalentPaymentProfile (Base44 entity)
 *   { talentUserId, stripeAccountId, kycStatus, onboardingCompletedAt, ... }
 *
 * KYCStatus (D-097 règle 5) :
 *   PENDING     — account créé, onboarding non complété
 *   IN_REVIEW   — onboarding complété, Stripe review en cours
 *   VERIFIED    — details_submitted=true + charges_enabled=true
 *   RESTRICTED  — restriction Stripe active (blocage payout)
 *
 * Source : D-097 · OS V14 section 7 (sécurité) · J8
 * ============================================================
 */

'use strict';

import StripeAdapter from './StripeAdapter.js';
// Valeurs KYC — exhaustives, pas de string libre
const KYC_STATUS = {
  PENDING:    'PENDING',
  IN_REVIEW:  'IN_REVIEW',
  VERIFIED:   'VERIFIED',
  RESTRICTED: 'RESTRICTED',
};

/**
 * Étape 1 — Démarre l'onboarding d'un talent.
 * Crée le compte Stripe Express et persiste le profil.
 *
 * @param {object} params
 * @param {string} params.talentUserId
 * @param {string} [params.email]
 * @param {string} [params.country]
 * @param {object} params.repositories
 * @param {object} params.repositories.talentPaymentProfiles  — { findByTalentUserId, upsert }
 *
 * @returns {{ stripeAccountId, kycStatus: 'PENDING', profileId }}
 */
async function initiateTalentOnboarding({ talentUserId, email, country = 'CA', repositories }) {
  if (!talentUserId) throw new Error('ONBOARDING_ERROR: talentUserId requis');
  if (!repositories?.talentPaymentProfiles) throw new Error('ONBOARDING_ERROR: repositories.talentPaymentProfiles requis');

  // Idempotency — si le profil existe déjà, on ne recrée pas l'account
  const existing = await repositories.talentPaymentProfiles.findByTalentUserId(talentUserId);
  if (existing?.stripeAccountId) {
    return {
      stripeAccountId:   existing.stripeAccountId,
      kycStatus:         existing.kycStatus || KYC_STATUS.PENDING,
      profileId:         existing.id,
      alreadyOnboarded:  true,
    };
  }

  // Création du compte Stripe Express
  const result = await StripeAdapter.createConnectAccount({ talentUserId, email, country });
  if (!result.ok) {
    throw new Error(
      `STRIPE_ACCOUNT_CREATION_FAILED: ${result.error.message}. ` +
      `TalentUserId: ${talentUserId}`
    );
  }

  const stripeAccountId = result.data.id;

  // Persistance du profil
  const profile = await repositories.talentPaymentProfiles.upsert({
    talentUserId,
    stripeAccountId,
    kycStatus:   KYC_STATUS.PENDING,
    country:     country,
    createdAt:   new Date().toISOString(),
    updatedAt:   new Date().toISOString(),
  });

  return {
    stripeAccountId,
    kycStatus: KYC_STATUS.PENDING,
    profileId: profile.id,
    alreadyOnboarded: false,
  };
}

/**
 * Étape 2 — Génère le lien d'onboarding Stripe (account_onboarding).
 * L'URL expire après ~10 min. Ne jamais persister l'URL.
 *
 * @param {object} params
 * @param {string} params.stripeAccountId
 * @param {string} params.refreshUrl   - ex: 'https://app.microrave.ca/talent/onboarding/refresh'
 * @param {string} params.returnUrl    - ex: 'https://app.microrave.ca/talent/onboarding/complete'
 *
 * @returns {{ url: string, expiresAt: string }}
 */
async function createOnboardingLink({ stripeAccountId, refreshUrl, returnUrl }) {
  if (!stripeAccountId) throw new Error('ONBOARDING_ERROR: stripeAccountId requis');
  if (!refreshUrl)      throw new Error('ONBOARDING_ERROR: refreshUrl requis');
  if (!returnUrl)       throw new Error('ONBOARDING_ERROR: returnUrl requis');

  const result = await StripeAdapter.createAccountLink({
    stripeAccountId,
    refreshUrl,
    returnUrl,
    type: 'account_onboarding',
  });

  if (!result.ok) {
    throw new Error(
      `STRIPE_ACCOUNT_LINK_FAILED: ${result.error.message}. ` +
      `AccountId: ${stripeAccountId}`
    );
  }

  return {
    url:       result.data.url,
    expiresAt: new Date(result.data.expires_at * 1000).toISOString(),
  };
}

/**
 * Étape 3 — Rafraîchit le lien si la session a expiré.
 * Même signature que createOnboardingLink — même logique, type account_update.
 */
async function refreshOnboardingLink({ stripeAccountId, refreshUrl, returnUrl }) {
  if (!stripeAccountId) throw new Error('ONBOARDING_ERROR: stripeAccountId requis');

  const result = await StripeAdapter.createAccountLink({
    stripeAccountId,
    refreshUrl,
    returnUrl,
    type: 'account_update',
  });

  if (!result.ok) {
    throw new Error(
      `STRIPE_ACCOUNT_LINK_REFRESH_FAILED: ${result.error.message}. ` +
      `AccountId: ${stripeAccountId}`
    );
  }

  return {
    url:       result.data.url,
    expiresAt: new Date(result.data.expires_at * 1000).toISOString(),
  };
}

/**
 * Étape 4 — Vérifie et met à jour le statut KYC depuis Stripe.
 * Appelé après le return_url (talent revient dans l'app après onboarding).
 * Également appelé par le webhook `account.updated`.
 *
 * Logique KYC :
 *   details_submitted=true  + charges_enabled=true  → VERIFIED
 *   details_submitted=true  + charges_enabled=false → IN_REVIEW (Stripe review)
 *   details_submitted=false                          → PENDING
 *   payouts_enabled=false   (avec restriction)       → RESTRICTED
 *
 * @param {object} params
 * @param {string} params.stripeAccountId
 * @param {string} params.talentUserId
 * @param {object} params.repositories
 * @param {object} params.repositories.talentPaymentProfiles
 *
 * @returns {{ kycStatus, detailsSubmitted, chargesEnabled, payoutsEnabled }}
 */
async function verifyKYCStatus({ stripeAccountId, talentUserId, repositories }) {
  if (!stripeAccountId) throw new Error('KYC_ERROR: stripeAccountId requis');
  if (!repositories?.talentPaymentProfiles) throw new Error('KYC_ERROR: repositories.talentPaymentProfiles requis');

  const result = await StripeAdapter.retrieveConnectAccount(stripeAccountId);
  if (!result.ok) {
    throw new Error(
      `STRIPE_ACCOUNT_RETRIEVE_FAILED: ${result.error.message}. ` +
      `AccountId: ${stripeAccountId}`
    );
  }

  const account = result.data;
  const { details_submitted, charges_enabled, payouts_enabled } = account;

  // Dériver le kycStatus
  let kycStatus;
  if (!details_submitted) {
    kycStatus = KYC_STATUS.PENDING;
  } else if (details_submitted && !charges_enabled) {
    kycStatus = KYC_STATUS.IN_REVIEW;
  } else if (details_submitted && charges_enabled && !payouts_enabled) {
    kycStatus = KYC_STATUS.RESTRICTED;
  } else {
    kycStatus = KYC_STATUS.VERIFIED;
  }

  // Mise à jour du profil
  await repositories.talentPaymentProfiles.upsert({
    talentUserId,
    stripeAccountId,
    kycStatus,
    detailsSubmitted:      details_submitted,
    chargesEnabled:        charges_enabled,
    payoutsEnabled:        payouts_enabled,
    kycVerifiedAt:         kycStatus === KYC_STATUS.VERIFIED ? new Date().toISOString() : null,
    updatedAt:             new Date().toISOString(),
  });

  return {
    kycStatus,
    detailsSubmitted:  details_submitted,
    chargesEnabled:    charges_enabled,
    payoutsEnabled:    payouts_enabled,
  };
}

/**
 * Retourne le profil de paiement complet d'un talent.
 * Utilisé par PayoutExecutor avant tout Transfer.
 *
 * @param {string} talentUserId
 * @param {object} repositories
 *
 * @returns {{ stripeAccountId, kycStatus, payoutsEnabled } | null}
 */
async function getTalentPaymentProfile(talentUserId, repositories) {
  if (!repositories?.talentPaymentProfiles) {
    throw new Error('PROFILE_ERROR: repositories.talentPaymentProfiles requis');
  }

  const profile = await repositories.talentPaymentProfiles.findByTalentUserId(talentUserId);
  if (!profile) return null;

  return {
    profileId:       profile.id,
    stripeAccountId: profile.stripeAccountId,
    kycStatus:       profile.kycStatus || KYC_STATUS.PENDING,
    detailsSubmitted: profile.detailsSubmitted || false,
    chargesEnabled:  profile.chargesEnabled || false,
    payoutsEnabled:  profile.payoutsEnabled || false,
  };
}

export default {
KYC_STATUS,
  initiateTalentOnboarding,
  createOnboardingLink,
  refreshOnboardingLink,
  verifyKYCStatus,
  getTalentPaymentProfile,

};
export { KYC_STATUS, initiateTalentOnboarding, createOnboardingLink, refreshOnboardingLink, verifyKYCStatus, getTalentPaymentProfile };