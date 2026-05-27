/**
 * MICRO RAVE V3 — MoneyMath
 * ============================================================
 * Standard numérique invariant — Source : D-063 · D-064 · OS V14
 *
 * LOI D-063 : Toutes les règles d'arrondi vivent dans RoundingPolicyConfig.
 * Tous les calculs financiers passent par MoneyMath.
 * Aucun Math.round, Math.floor, Math.ceil libre dans le code métier.
 * EXCEPTION UNIQUE : MoneyMath.js lui-même (ce fichier) est le seul
 * endroit autorisé à appeler Math.floor directement.
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

/**
 * Calcule le prorata d'un montant selon un poids dans un total.
 * Remplace Math.floor(amount * weight / total) dans les calculs de répartition lineup.
 *
 * Utilisé pour : distribution du surplusPool entre talents (LOI LINEUP-02).
 * Arrondi floor — le résidu agrégé est tracé via roundingCents → compte 6591.
 *
 * @param {number} amountCents  - Montant à distribuer (entier >= 0)
 * @param {number} weight       - Poids de la part (entier > 0)
 * @param {number} total        - Total des poids (entier > 0)
 * @returns {number}            - Part en centimes (floor)
 * @throws {Error}              - Si les paramètres sont invalides
 */
function prorataCents(amountCents, weight, total) {
  if (!Number.isInteger(amountCents) || amountCents < 0) {
    throw new Error(
      `MoneyMath.prorataCents: amountCents doit être un entier >= 0. Reçu: ${amountCents}`
    );
  }
  if (!Number.isInteger(weight) || weight <= 0) {
    throw new Error(
      `MoneyMath.prorataCents: weight doit être un entier > 0. Reçu: ${weight}`
    );
  }
  if (!Number.isInteger(total) || total <= 0) {
    throw new Error(
      `MoneyMath.prorataCents: total doit être un entier > 0. Reçu: ${total}`
    );
  }
  // Arrondi floor — résidu agrégé tracé vers 6591 via roundingCents (D-070)
  return Math.floor(amountCents * weight / total);
}

/**
 * Calcule le coefficient de répartition en ppm (LOI LINEUP-01).
 * Remplace Math.floor(prixVenduClientCents * 1_000_000 / totalLineupEffectifCents).
 *
 * coefficient = max(1_000_000, prix_vendu_client × 1_000_000 / total_lineup_effectif)
 * Le plancher 1_000_000 (= 100%) garantit qu'aucun talent ne reçoit moins que son cachet signé.
 *
 * @param {number} prixVenduClientCents       - Prix total vendu au client (entier > 0)
 * @param {number} totalLineupEffectifCents   - Somme des poids effectifs du lineup (entier > 0)
 * @returns {number}                          - Coefficient en ppm (floor, min 1_000_000)
 * @throws {Error}                            - Si les paramètres sont invalides
 */
function lineupCoefficientPpm(prixVenduClientCents, totalLineupEffectifCents) {
  if (!Number.isInteger(prixVenduClientCents) || prixVenduClientCents <= 0) {
    throw new Error(
      `MoneyMath.lineupCoefficientPpm: prixVenduClientCents doit être un entier > 0. Reçu: ${prixVenduClientCents}`
    );
  }
  if (!Number.isInteger(totalLineupEffectifCents) || totalLineupEffectifCents <= 0) {
    throw new Error(
      `MoneyMath.lineupCoefficientPpm: totalLineupEffectifCents doit être un entier > 0. Reçu: ${totalLineupEffectifCents}`
    );
  }
  // LOI LINEUP-01 : plancher 1_000_000 ppm (= 1.0) — Source : OS V14 section 3.3
  return Math.max(1_000_000, Math.floor(prixVenduClientCents * 1_000_000 / totalLineupEffectifCents));
}

export default {
depositAmount, balanceDue, applyRatePpm, prorataCents, lineupCoefficientPpm 
};
export { depositAmount, balanceDue, applyRatePpm, prorataCents, lineupCoefficientPpm };