/**
 * MICRO RAVE V3 — EventPaymentGuard
 * ============================================================
 * Guard spécifique aux transitions financières de paiement :
 *   - placed → deposit_pending       (calcul dépôt 20%)
 *   - deposit_pending → deposit_secured (confirmation Stripe)
 *   - deposit_secured → balance_pending (ouverture solde J-7)
 *
 * Source : OS V10 section 2.7.1
 *
 * CONTRAT D'INTERFACE — totalCents :
 *   totalCents = prix_vendu_client TTC
 *   = prix_vendu_HT + TPS + TVQ + frais_Stripe
 *   C'est le montant réel encaissé sur la carte du client.
 *   Source : OS V10 section 3.3 LOI WATERFALL-01
 *   NE PAS confondre avec cachetBrutCents (montant HT du talent).
 *
 * Standard numérique invariant :
 *   - Tous les montants en centimes entiers (jamais float)
 *   - Taux en ppm (jamais float)
 *   - deposit = floor(totalCents * depositRatioPpm / 1_000_000)
 *   Source : OS V10 section 3.2
 *
 * TOLÉRANCE STRIPE (deposit_pending→deposit_secured) :
 *   Stripe peut arrondir de ±2 centimes selon la devise et le réseau.
 *   La comparaison tolère un écart ≤ 2 centimes avec log d'avertissement.
 *   Un écart > 2 centimes déclenche DEPOSIT_AMOUNT_MISMATCH bloquant.
 *   Source : comportement documenté de l'API Stripe Connect CAD.
 * ============================================================
 */

'use strict';

const STRIPE_TOLERANCE_CENTS = 2;

const COVERED_TRANSITIONS = new Set([
  'placed->deposit_pending',
  'deposit_pending->deposit_secured',
  'deposit_secured->balance_pending',
]);

async function validate({
  engagementId,
  currentState,
  targetState,
  actor,
  context = {},
  repositories = {},
}) {

  const transitionKey = `${currentState}->${targetState}`;

  if (!COVERED_TRANSITIONS.has(transitionKey)) {
    return {
      passed: false,
      reason: `GUARD_MISMATCH: EventPaymentGuard ne couvre pas "${transitionKey}". ` +
              `Transitions couvertes : ${[...COVERED_TRANSITIONS].join(', ')}`,
    };
  }

  switch (transitionKey) {
    case 'placed->deposit_pending':
      return validateDepositCreation({ engagementId, actor, context });
    case 'deposit_pending->deposit_secured':
      return validateDepositConfirmation({ engagementId, actor, context });
    case 'deposit_secured->balance_pending':
      return validateBalanceOpening({ engagementId, actor, context });
    default:
      return { passed: false, reason: `GUARD_UNKNOWN_TRANSITION: "${transitionKey}"` };
  }
}

// ── placed → deposit_pending ──────────────────────────────────
// totalCents = prix_vendu_client TTC (TPS + TVQ + frais Stripe inclus)
function validateDepositCreation({ engagementId, actor, context }) {
  const {
    eventId,
    contractSnapshotId,
    totalCents,       // ATTENTION : TTC incluant TPS + TVQ + frais Stripe
    depositRatioPpm,
    eventPaymentCapCents,
  } = context;

  if (!contractSnapshotId || !contractSnapshotId.startsWith('CS1-')) {
    return {
      passed: false,
      reason: 'MISSING_CONTRACT_SNAPSHOT: ContractSnapshot phase 1 (CS1-*) obligatoire.',
    };
  }

  if (!eventId || !eventId.startsWith('EVT-')) {
    return {
      passed: false,
      reason: `MISSING_EVENT: eventId valide (EVT-*) obligatoire. Reçu : "${eventId}"`,
    };
  }

  // totalCents doit être le montant TTC complet
  if (!Number.isInteger(totalCents) || totalCents <= 0) {
    return {
      passed: false,
      reason: `INVALID_TOTAL: totalCents doit être un entier positif en centimes TTC. ` +
              `Reçu : ${totalCents}. ` +
              `Rappel : totalCents = prix_vendu_HT + TPS + TVQ + frais_Stripe (OS V10 section 3.3).`,
    };
  }

  if (!Number.isInteger(eventPaymentCapCents) || eventPaymentCapCents <= 0) {
    return {
      passed: false,
      reason: 'MISSING_CAP: eventPaymentCapCents obligatoire. Provient de getConfig("event_payment_cap_cents").',
    };
  }

  if (totalCents > eventPaymentCapCents) {
    return {
      passed: false,
      reason: `PAYMENT_CAP_EXCEEDED: Total ${totalCents} centimes dépasse le plafond MVP ` +
              `de ${eventPaymentCapCents} centimes. SoloFounderOverride requis. ` +
              `Source : OS V10 section 9.6.`,
    };
  }

  if (!Number.isInteger(depositRatioPpm) || depositRatioPpm <= 0 || depositRatioPpm > 1_000_000) {
    return {
      passed: false,
      reason: `INVALID_DEPOSIT_RATIO: depositRatioPpm doit être un entier entre 1 et 1 000 000. ` +
              `Reçu : ${depositRatioPpm}. Provient de getConfig("deposit_ratio_ppm").`,
    };
  }

  const depositCents     = Math.floor(totalCents * depositRatioPpm / 1_000_000);
  const balanceDueCents  = totalCents - depositCents;

  if (depositCents <= 0) {
    return {
      passed: false,
      reason: `DEPOSIT_ZERO: Dépôt calculé = 0. total=${totalCents}, ratio=${depositRatioPpm}ppm.`,
    };
  }

  return {
    passed: true,
    depositCents,
    balanceDueCents,
    audit: { totalCents, depositRatioPpm, depositCents, balanceDueCents, eventPaymentCapCents },
  };
}

// ── deposit_pending → deposit_secured ────────────────────────
// Tolérance Stripe : ±2 centimes acceptés avec avertissement
function validateDepositConfirmation({ engagementId, actor, context }) {
  const {
    stripePaymentIntentId,
    confirmedAmountCents,
    expectedDepositCents,
  } = context;

  if (!stripePaymentIntentId) {
    return {
      passed: false,
      reason: 'MISSING_STRIPE_INTENT: stripePaymentIntentId obligatoire (provient du webhook Stripe validé).',
    };
  }

  if (!Number.isInteger(confirmedAmountCents) || confirmedAmountCents <= 0) {
    return {
      passed: false,
      reason: `INVALID_CONFIRMED_AMOUNT: confirmedAmountCents doit être un entier positif. Reçu : ${confirmedAmountCents}.`,
    };
  }

  if (!Number.isInteger(expectedDepositCents) || expectedDepositCents <= 0) {
    return {
      passed: false,
      reason: `INVALID_EXPECTED_DEPOSIT: expectedDepositCents doit être un entier positif. Reçu : ${expectedDepositCents}.`,
    };
  }

  const ecart = Math.abs(confirmedAmountCents - expectedDepositCents);

  if (ecart > STRIPE_TOLERANCE_CENTS) {
    return {
      passed: false,
      reason: `DEPOSIT_AMOUNT_MISMATCH: Montant confirmé (${confirmedAmountCents}) ` +
              `vs attendu (${expectedDepositCents}) — écart ${ecart} centimes ` +
              `dépasse la tolérance Stripe de ${STRIPE_TOLERANCE_CENTS} centimes. ` +
              `Vérifier manuellement et déclencher AdminIncidentRecord.`,
    };
  }

  if (ecart > 0) {
    // Tolérance acceptée — log d'avertissement
    console.warn(
      `[EventPaymentGuard] Arrondi Stripe accepté : confirmé=${confirmedAmountCents}, ` +
      `attendu=${expectedDepositCents}, écart=${ecart} centime(s). ` +
      `EngagementId: ${engagementId}`
    );
  }

  return {
    passed: true,
    audit: { stripePaymentIntentId, confirmedAmountCents, expectedDepositCents, ecart },
  };
}

// ── deposit_secured → balance_pending ────────────────────────
function validateBalanceOpening({ engagementId, actor, context }) {
  const { contractSnapshotId, balanceDueCents } = context;

  if (!contractSnapshotId || !contractSnapshotId.startsWith('CS1-')) {
    return {
      passed: false,
      reason: 'MISSING_CONTRACT_SNAPSHOT: ContractSnapshot phase 1 (CS1-*) obligatoire pour balance_pending.',
    };
  }

  if (!Number.isInteger(balanceDueCents) || balanceDueCents < 0) {
    return {
      passed: false,
      reason: `INVALID_BALANCE: balanceDueCents doit être un entier positif ou nul. Reçu : ${balanceDueCents}.`,
    };
  }

  if (balanceDueCents === 0) {
    // Le dépôt couvrait 100% — cas rare mais valide
    // SealingGuard devra gérer le scellement sans solde supplémentaire
    console.warn(
      `[EventPaymentGuard] balance_pending avec solde 0 — ` +
      `le dépôt couvrait 100% du total. EngagementId: ${engagementId}`
    );
  }

  return {
    passed: true,
    audit: { contractSnapshotId, balanceDueCents },
  };
}

module.exports = { validate, COVERED_TRANSITIONS, STRIPE_TOLERANCE_CENTS };