/**
 * MICRO RAVE V3 — EventPaymentGuard
 * ============================================================
 * Guard spécifique aux transitions financières de paiement :
 *   - placed → deposit_pending       (création EPR, calcul dépôt)
 *   - deposit_pending → deposit_secured (confirmation dépôt Stripe)
 *   - deposit_secured → balance_pending (ouverture fenêtre solde J-7)
 *
 * Source : OS V10 section 2.7.1
 *
 * SÉPARATION CRITIQUE :
 * Ce guard est distinct de PlacementGuard (accepted→placed).
 * PlacementGuard = contrat + lineup, sans argent.
 * EventPaymentGuard = argent — chaque centime est vérifié.
 *
 * Standard numérique invariant :
 * - Tous les montants en centimes entiers (jamais float)
 * - Taux en ppm (jamais float)
 * - deposit = floor(total * deposit_ratio_ppm / 1_000_000)
 * Source : OS V10 section 3.2
 *
 * Ce guard NE touche PAS Base44 directement.
 * Il reçoit les données via `context` et retourne un résultat.
 * ============================================================
 */

'use strict';

// ── Transitions couvertes par ce guard ───────────────────────
const COVERED_TRANSITIONS = new Set([
  'placed->deposit_pending',
  'deposit_pending->deposit_secured',
  'deposit_secured->balance_pending',
]);

/**
 * Valide les transitions financières de paiement.
 *
 * @param {object} params
 * @param {string} params.engagementId    — systemId de l'Engagement
 * @param {string} params.currentState    — état actuel
 * @param {string} params.targetState     — état cible
 * @param {string} params.actor           — systemId de l'acteur
 * @param {object} params.context         — données fournies par l'appelant
 *
 * Pour placed→deposit_pending :
 * @param {string} params.context.eventId              — obligatoire
 * @param {string} params.context.contractSnapshotId   — obligatoire (CS1-*)
 * @param {number} params.context.totalCents           — obligatoire, entier
 * @param {number} params.context.depositRatioPpm      — obligatoire, entier ppm
 * @param {number} params.context.eventPaymentCapCents — obligatoire (plafond MVP)
 *
 * Pour deposit_pending→deposit_secured :
 * @param {string} params.context.stripePaymentIntentId — obligatoire
 * @param {number} params.context.confirmedAmountCents  — obligatoire, entier
 * @param {number} params.context.expectedDepositCents  — obligatoire, entier
 *
 * Pour deposit_secured→balance_pending :
 * @param {string} params.context.contractSnapshotId   — obligatoire (CS1-*)
 * @param {number} params.context.balanceDueCents      — obligatoire, entier
 *
 * @returns {object} { passed: true, ... } si validé
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

  const transitionKey = `${currentState}->${targetState}`;

  // ── Vérification : transition connue de ce guard ──────────
  if (!COVERED_TRANSITIONS.has(transitionKey)) {
    return {
      passed: false,
      reason: `GUARD_MISMATCH: EventPaymentGuard ne couvre pas "${transitionKey}". ` +
              `Transitions couvertes : ${[...COVERED_TRANSITIONS].join(', ')}`,
    };
  }

  // ── Dispatch par transition ───────────────────────────────
  switch (transitionKey) {

    case 'placed->deposit_pending':
      return validateDepositCreation({ engagementId, actor, context });

    case 'deposit_pending->deposit_secured':
      return validateDepositConfirmation({ engagementId, actor, context });

    case 'deposit_secured->balance_pending':
      return validateBalanceOpening({ engagementId, actor, context });

    default:
      return {
        passed: false,
        reason: `GUARD_UNKNOWN_TRANSITION: "${transitionKey}" non géré dans EventPaymentGuard`,
      };
  }
}

// ── placed → deposit_pending ──────────────────────────────────
// Vérifie que l'EventPaymentRecord peut être créé.
// Calcule le montant du dépôt en entiers (floor).
// Source : OS V10 section 2.6 + section 3.3 LOI WATERFALL-01
function validateDepositCreation({ engagementId, actor, context }) {
  const {
    eventId,
    contractSnapshotId,
    totalCents,
    depositRatioPpm,
    eventPaymentCapCents,
  } = context;

  // ContractSnapshot phase 1 obligatoire
  if (!contractSnapshotId || !contractSnapshotId.startsWith('CS1-')) {
    return {
      passed: false,
      reason: 'MISSING_CONTRACT_SNAPSHOT: Le ContractSnapshot phase 1 (CS1-*) est obligatoire ' +
              'pour créer deposit_pending.',
    };
  }

  // eventId obligatoire
  if (!eventId || !eventId.startsWith('EVT-')) {
    return {
      passed: false,
      reason: `MISSING_EVENT: eventId valide (EVT-*) obligatoire. Reçu : "${eventId}"`,
    };
  }

  // totalCents — entier positif
  if (!Number.isInteger(totalCents) || totalCents <= 0) {
    return {
      passed: false,
      reason: `INVALID_TOTAL: totalCents doit être un entier positif. ` +
              `Reçu : ${totalCents}. Les virgules flottantes sont interdites.`,
    };
  }

  // Plafond MVP — Source : OS V10 section 9.6 event_payment_cap_cents
  if (!Number.isInteger(eventPaymentCapCents) || eventPaymentCapCents <= 0) {
    return {
      passed: false,
      reason: 'MISSING_CAP: eventPaymentCapCents est obligatoire (config critique). ' +
              'Provient de getConfig("event_payment_cap_cents").',
    };
  }

  if (totalCents > eventPaymentCapCents) {
    return {
      passed: false,
      reason: `PAYMENT_CAP_EXCEEDED: Le total de ${totalCents} centimes dépasse le plafond MVP ` +
              `de ${eventPaymentCapCents} centimes (${eventPaymentCapCents / 100}$). ` +
              `Exception possible avec SoloFounderOverride. Source : OS V10 section 9.6.`,
    };
  }

  // depositRatioPpm — entier ppm
  if (!Number.isInteger(depositRatioPpm) || depositRatioPpm <= 0 || depositRatioPpm > 1_000_000) {
    return {
      passed: false,
      reason: `INVALID_DEPOSIT_RATIO: depositRatioPpm doit être un entier entre 1 et 1 000 000. ` +
              `Reçu : ${depositRatioPpm}. Provient de getConfig("deposit_ratio_ppm").`,
    };
  }

  // Calcul du dépôt — floor() — MR ne sur-prélève jamais
  const depositCents = Math.floor(totalCents * depositRatioPpm / 1_000_000);

  if (depositCents <= 0) {
    return {
      passed: false,
      reason: `DEPOSIT_ZERO: Le dépôt calculé est 0 centimes. ` +
              `total=${totalCents}, ratio=${depositRatioPpm}ppm. ` +
              `Un dépôt nul ne peut pas sécuriser le Lineup.`,
    };
  }

  return {
    passed: true,
    depositCents,
    balanceDueCents: totalCents - depositCents,
    audit: {
      totalCents,
      depositRatioPpm,
      depositCents,
      balanceDueCents: totalCents - depositCents,
      eventPaymentCapCents,
    },
  };
}

// ── deposit_pending → deposit_secured ────────────────────────
// Vérifie que le paiement Stripe correspond au dépôt attendu.
// Source : OS V10 section 2.6 + section 7.7
function validateDepositConfirmation({ engagementId, actor, context }) {
  const {
    stripePaymentIntentId,
    confirmedAmountCents,
    expectedDepositCents,
  } = context;

  // stripePaymentIntentId obligatoire
  if (!stripePaymentIntentId) {
    return {
      passed: false,
      reason: 'MISSING_STRIPE_INTENT: stripePaymentIntentId est obligatoire ' +
              'pour confirmer deposit_secured. Il provient du webhook Stripe validé.',
    };
  }

  // Montants en entiers
  if (!Number.isInteger(confirmedAmountCents) || confirmedAmountCents <= 0) {
    return {
      passed: false,
      reason: `INVALID_CONFIRMED_AMOUNT: confirmedAmountCents doit être un entier positif. ` +
              `Reçu : ${confirmedAmountCents}.`,
    };
  }

  if (!Number.isInteger(expectedDepositCents) || expectedDepositCents <= 0) {
    return {
      passed: false,
      reason: `INVALID_EXPECTED_DEPOSIT: expectedDepositCents doit être un entier positif. ` +
              `Reçu : ${expectedDepositCents}.`,
    };
  }

  // Le montant confirmé doit correspondre exactement au dépôt attendu
  if (confirmedAmountCents !== expectedDepositCents) {
    return {
      passed: false,
      reason: `DEPOSIT_AMOUNT_MISMATCH: Le montant confirmé (${confirmedAmountCents} centimes) ` +
              `ne correspond pas au dépôt attendu (${expectedDepositCents} centimes). ` +
              `Écart : ${confirmedAmountCents - expectedDepositCents} centimes. ` +
              `Déclencher AdminIncidentRecord et vérifier manuellement.`,
    };
  }

  return {
    passed: true,
    audit: {
      stripePaymentIntentId,
      confirmedAmountCents,
      expectedDepositCents,
    },
  };
}

// ── deposit_secured → balance_pending ────────────────────────
// Vérifie que le solde restant est calculé et non nul.
// Ouvre la fenêtre de paiement du solde J-7.
// Source : OS V10 section 2.6
function validateBalanceOpening({ engagementId, actor, context }) {
  const {
    contractSnapshotId,
    balanceDueCents,
  } = context;

  // ContractSnapshot phase 1 obligatoire
  if (!contractSnapshotId || !contractSnapshotId.startsWith('CS1-')) {
    return {
      passed: false,
      reason: 'MISSING_CONTRACT_SNAPSHOT: Le ContractSnapshot phase 1 (CS1-*) est obligatoire ' +
              'pour ouvrir balance_pending.',
    };
  }

  // balanceDueCents — entier positif
  if (!Number.isInteger(balanceDueCents) || balanceDueCents < 0) {
    return {
      passed: false,
      reason: `INVALID_BALANCE: balanceDueCents doit être un entier positif ou nul. ` +
              `Reçu : ${balanceDueCents}.`,
    };
  }

  // Un solde de 0 est théoriquement possible (dépôt = 100%)
  // mais mérite un avertissement explicite
  if (balanceDueCents === 0) {
    console.warn(
      `[EventPaymentGuard] balance_pending avec solde 0 — ` +
      `le dépôt couvrait 100% du total. EngagementId: ${engagementId}`
    );
  }

  return {
    passed: true,
    audit: {
      contractSnapshotId,
      balanceDueCents,
    },
  };
}

module.exports = { validate, COVERED_TRANSITIONS };