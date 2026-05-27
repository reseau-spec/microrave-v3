/**
 * MICRO RAVE V3 — StripeAdapter
 * ============================================================
 * Client Stripe centralisé. Point d'accès unique à l'API Stripe.
 *
 * RÈGLES ABSOLUES (D-097) :
 *   1. Jamais de clé Stripe dans le code — uniquement process.env.STRIPE_SECRET_KEY
 *   2. Ce module est le SEUL endroit où `require('stripe')` est appelé
 *   3. Instanciation lazy — pas d'erreur au require si la clé est absente
 *      (les tests unitaires mockent Stripe sans clé réelle)
 *   4. Chaque appel Stripe retourne un résultat normalisé { ok, data, error }
 *      pour forcer la gestion d'erreur à chaque call-site
 *
 * Opérations couvertes pour le MVP J9 :
 *   - PaymentIntents (dépôt, solde)
 *   - Webhooks (signature)
 *   - Accounts Connect Express (onboarding talent)
 *   - AccountLinks (lien onboarding)
 *   - Transfers (payout talent)
 *   - Charges (remboursement)
 *
 * Source : D-097 · D-101 · OS V14 section 11
 * ============================================================
 */

'use strict';

import { createRequire as __createRequire } from 'node:module';
const require = __createRequire(import.meta.url);
let _stripe = null;

/**
 * Retourne l'instance Stripe (lazy singleton).
 * Lève une erreur explicite si la clé est absente — jamais silencieux.
 */
function getStripe() {
  if (_stripe) return _stripe;

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || key === 'REMPLACER') {
    throw new Error(
      'STRIPE_CONFIG_MISSING: STRIPE_SECRET_KEY absent ou non configuré dans .env. ' +
      'Obtenir depuis : Stripe Dashboard → Developers → API keys.'
    );
  }

  _stripe = require('stripe')(key);
  return _stripe;
}

/**
 * Réinitialise le singleton — pour les tests uniquement.
 */
function _resetForTesting() {
  _stripe = null;
}

// ── Normalisation des résultats ───────────────────────────────

function ok(data) {
  return { ok: true, data, error: null };
}

function fail(error) {
  return {
    ok: false,
    data: null,
    error: {
      type:    error.type    || 'StripeError',
      code:    error.code    || 'unknown',
      message: error.message || 'Erreur Stripe inconnue',
      raw:     error,
    },
  };
}

// ── PaymentIntents ────────────────────────────────────────────

/**
 * Crée un PaymentIntent pour le dépôt ou le solde.
 * L'idempotency key est dérivée de l'engagementId + phase pour garantir D-101.
 *
 * @param {object} params
 * @param {number} params.amountCents         - montant en centimes
 * @param {string} params.currency            - 'cad'
 * @param {string} params.engagementId        - pour idempotency key
 * @param {'deposit'|'balance'} params.phase  - phase de paiement
 * @param {string} [params.customerId]        - Stripe Customer ID (optionnel)
 * @param {object} [params.metadata]          - métadonnées Stripe
 */
async function createPaymentIntent({ amountCents, currency, engagementId, phase, customerId, metadata = {} }) {
  try {
    const stripe = getStripe();
    const idempotencyKey = `pi-${engagementId}-${phase}`;

    const params = {
      amount:   amountCents,
      currency: currency || 'cad',
      metadata: {
        engagementId,
        phase,
        platform: 'microrave-v3',
        ...metadata,
      },
      automatic_payment_methods: { enabled: true },
    };

    if (customerId) params.customer = customerId;

    const intent = await stripe.paymentIntents.create(params, {
      idempotencyKey,
    });

    return ok(intent);
  } catch (e) {
    return fail(e);
  }
}

/**
 * Récupère un PaymentIntent par son ID.
 */
async function retrievePaymentIntent(paymentIntentId) {
  try {
    const stripe = getStripe();
    const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
    return ok(intent);
  } catch (e) {
    return fail(e);
  }
}

// ── Webhooks ──────────────────────────────────────────────────

/**
 * Valide la signature d'un webhook Stripe.
 * Retourne l'objet event Stripe si valide.
 * CRITIQUE : rawBody doit être le Buffer brut (non parsé) — D-097.
 *
 * @param {Buffer|string} rawBody
 * @param {string} signature   - header 'stripe-signature'
 */
function constructWebhookEvent(rawBody, signature) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret || webhookSecret === 'REMPLACER') {
    return fail(new Error('STRIPE_CONFIG_MISSING: STRIPE_WEBHOOK_SECRET absent dans .env'));
  }

  try {
    const stripe = getStripe();
    const event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    return ok(event);
  } catch (e) {
    return fail(e);
  }
}

// ── Stripe Connect — Accounts (onboarding talent) ─────────────

/**
 * Crée un compte Stripe Express pour un talent.
 * Retourne l'account ID à persister dans TalentPaymentProfile.
 *
 * @param {object} params
 * @param {string} params.talentUserId  - pour metadata + idempotency
 * @param {string} [params.email]       - email pré-rempli (UX)
 * @param {string} [params.country]     - 'CA' par défaut
 */
async function createConnectAccount({ talentUserId, email, country = 'CA' }) {
  try {
    const stripe = getStripe();
    const idempotencyKey = `acct-create-${talentUserId}`;

    const params = {
      type:    'express',
      country,
      capabilities: {
        transfers: { requested: true },
      },
      metadata: {
        talentUserId,
        platform: 'microrave-v3',
      },
    };

    if (email) params.email = email;

    const account = await stripe.accounts.create(params, { idempotencyKey });
    return ok(account);
  } catch (e) {
    return fail(e);
  }
}

/**
 * Crée un AccountLink pour l'onboarding (ou le refresh).
 * L'URL retournée est à durée limitée (~10 min) — ne pas persister.
 *
 * @param {object} params
 * @param {string} params.stripeAccountId
 * @param {string} params.refreshUrl  - URL si le lien expire
 * @param {string} params.returnUrl   - URL après onboarding complet
 * @param {'account_onboarding'|'account_update'} [params.type]
 */
async function createAccountLink({ stripeAccountId, refreshUrl, returnUrl, type = 'account_onboarding' }) {
  try {
    const stripe = getStripe();
    const link = await stripe.accountLinks.create({
      account:    stripeAccountId,
      refresh_url: refreshUrl,
      return_url:  returnUrl,
      type,
    });
    return ok(link);
  } catch (e) {
    return fail(e);
  }
}

/**
 * Récupère les informations d'un compte Connect.
 * Utilisé pour vérifier le statut KYC (details_submitted + charges_enabled).
 *
 * @param {string} stripeAccountId
 */
async function retrieveConnectAccount(stripeAccountId) {
  try {
    const stripe = getStripe();
    const account = await stripe.accounts.retrieve(stripeAccountId);
    return ok(account);
  } catch (e) {
    return fail(e);
  }
}

// ── Transfers (payout talent) ─────────────────────────────────

/**
 * Exécute un Transfer vers le compte Connect d'un talent.
 * Idempotency key dérivée de engagementId + talentUserId — D-101 verrou 6.
 *
 * @param {object} params
 * @param {number} params.amountCents       - montant net talent en centimes
 * @param {string} params.currency          - 'cad'
 * @param {string} params.stripeAccountId   - compte Connect destination
 * @param {string} params.engagementId      - pour idempotency + metadata
 * @param {string} params.talentUserId      - pour idempotency + metadata
 */
async function createTransfer({ amountCents, currency, stripeAccountId, engagementId, talentUserId }) {
  try {
    const stripe = getStripe();
    const idempotencyKey = `tr-${engagementId}-${talentUserId}`;

    const transfer = await stripe.transfers.create(
      {
        amount:      amountCents,
        currency:    currency || 'cad',
        destination: stripeAccountId,
        metadata: {
          engagementId,
          talentUserId,
          platform: 'microrave-v3',
        },
      },
      { idempotencyKey }
    );

    return ok(transfer);
  } catch (e) {
    return fail(e);
  }
}

// ── Refunds (remboursement organisateur) ─────────────────────

/**
 * Crée un remboursement sur un PaymentIntent.
 * Idempotency key dérivée de engagementId + reason.
 *
 * @param {object} params
 * @param {string} params.paymentIntentId
 * @param {number} params.amountCents       - montant à rembourser (partiel ok)
 * @param {string} params.engagementId      - pour idempotency
 * @param {string} params.reason            - 'no_show' | 'cancellation' | 'dispute_resolved'
 */
async function createRefund({ paymentIntentId, amountCents, engagementId, reason }) {
  try {
    const stripe = getStripe();
    const idempotencyKey = `re-${engagementId}-${reason}`;

    const refund = await stripe.refunds.create(
      {
        payment_intent: paymentIntentId,
        amount:         amountCents,
        reason:         'requested_by_customer',
        metadata: {
          engagementId,
          microRaveReason: reason,
          platform: 'microrave-v3',
        },
      },
      { idempotencyKey }
    );

    return ok(refund);
  } catch (e) {
    return fail(e);
  }
}

// ── Utilitaires ───────────────────────────────────────────────

/**
 * Vérifie que les variables d'environnement Stripe sont présentes.
 * Utilisé au démarrage pour fail-fast.
 *
 * @returns {{ configured: boolean, missing: string[] }}
 */
function checkConfig() {
  const required = ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'];
  const missing = required.filter(k => {
    const v = process.env[k];
    return !v || v === 'REMPLACER';
  });
  return { configured: missing.length === 0, missing };
}

export default {
// PaymentIntents
  createPaymentIntent,
  retrievePaymentIntent,
  // Webhooks
  constructWebhookEvent,
  // Connect
  createConnectAccount,
  createAccountLink,
  retrieveConnectAccount,
  // Transfers + Refunds
  createTransfer,
  createRefund,
  // Utils
  checkConfig,
  // Test helpers
  _resetForTesting,

};