/**
 * MICRO RAVE V3 — MoneyMath
 * ============================================================
 * Standard numérique invariant — Source : D-063 · D-064 · OS V13
 *
 * LOI D-063 : Toutes les règles d'arrondi vivent dans RoundingPolicyConfig.
 * Tous les calculs financiers passent par MoneyMath.
 * Aucun Math.round, Math.floor, Math.ceil libre dans le code métier.
 *
 * Unités invariantes (D-064) :
 *   - Le dollar est une unité d'affichage
 *   - Le cent est une unité de vérité
 *   - Le ppm est une unité de taux (1 000 000 ppm = 100%)
 *
 * Tout résidu d'arrondi doit être tracé — compte 6591
 * RoundingReconciliationRecord requis pour chaque écriture vers 6591 (D-070)
 * ============================================================
 */

'use strict';

/**
 * Calcule le montant du dépôt en centimes entiers.
 * Remplace Math.floor(totalCents * depositRatioPpm / 1_000_000).
 *
 * @param {number} totalCents        - Montant total TTC en centimes (entier)
 * @param {number} depositRatioPpm   - Ratio de dépôt en ppm (entier, ex: 200000 = 20%)
 * @returns {number}                 - Montant du dépôt en centimes (entier, floor)
 * @throws {Error}                   - Si les paramètres ne sont pas des entiers positifs
 */
function depositAmount(totalCents, depositRatioPpm) {
  if (!Number.isInteger(totalCents) || totalCents <= 0) {
    throw new Error(
      `MoneyMath.depositAmount: totalCents doit être un entier positif. Reçu: ${totalCents}`
    );
  }
  if (!Number.isInteger(depositRatioPpm) || depositRatioPpm <= 0 || depositRatioPpm > 1_000_000) {
    throw new Error(
      `MoneyMath.depositAmount: depositRatioPpm doit être un entier entre 1 et 1 000 000. Reçu: ${depositRatioPpm}`
    );
  }
  // Arrondi floor — résidu éventuel tracé vers 6591 (D-070)
  return Math.floor(totalCents * depositRatioPpm / 1_000_000);
}

/**
 * Calcule le solde dû après dépôt.
 *
 * @param {number} totalCents    - Montant total TTC en centimes
 * @param {number} depositCents  - Montant du dépôt en centimes
 * @returns {number}             - Solde dû en centimes
 */
function balanceDue(totalCents, depositCents) {
  if (!Number.isInteger(totalCents) || !Number.isInteger(depositCents)) {
    throw new Error(
      `MoneyMath.balanceDue: totalCents et depositCents doivent être des entiers. ` +
      `Reçu: totalCents=${totalCents}, depositCents=${depositCents}`
    );
  }
  return totalCents - depositCents;
}

/**
 * Applique un taux en ppm à un montant en centimes.
 * Utilisé pour calculer commissions, taxes, etc.
 *
 * @param {number} amountCents  - Montant de base en centimes (entier)
 * @param {number} ratePpm      - Taux en ppm (entier)
 * @returns {number}            - Montant résultant en centimes (floor)
 */
function applyRatePpm(amountCents, ratePpm) {
  if (!Number.isInteger(amountCents) || amountCents < 0) {
    throw new Error(
      `MoneyMath.applyRatePpm: amountCents doit être un entier >= 0. Reçu: ${amountCents}`
    );
  }
  if (!Number.isInteger(ratePpm) || ratePpm < 0 || ratePpm > 1_000_000) {
    throw new Error(
      `MoneyMath.applyRatePpm: ratePpm doit être un entier entre 0 et 1 000 000. Reçu: ${ratePpm}`
    );
  }
  return Math.floor(amountCents * ratePpm / 1_000_000);
}

module.exports = { depositAmount, balanceDue, applyRatePpm };