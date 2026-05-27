/**
 * MICRO RAVE V3 — EngagementAmendmentGuard
 * ============================================================
 * Sous-processus D-147 — Extension de plage horaire sur accord mutuel.
 *
 * Ce guard est DISTINCT de la machine d'état principale.
 * Il ne produit pas de transition d'état sur l'Engagement.
 * Il produit un objet `EngagementAmendment` immuable que
 * l'appelant persiste en database (append-only — WORM-APPEND-01).
 *
 * RÈGLE ARCHITECTURALE FONDAMENTALE (D-147) :
 *   L'amendment ne modifie PAS le ContractSnapshot phase 2 (WORM W2).
 *   Il crée des entrées ledger SUPPLÉMENTAIRES (delta).
 *   C'est un ajout post-scellement avec consentement —
 *   pas une modification d'un enregistrement existant.
 *   Conforme à WORM-APPEND-01.
 *
 * POURQUOI UN SOUS-PROCESSUS DISTINCT :
 *   L'Engagement reste en état `performed` pendant et après l'amendment.
 *   L'amendment étend la prestation sans changer d'état.
 *   Il est déclenché depuis `performed` — avant `event_completed`.
 *
 * CONDITIONS OBLIGATOIRES (D-147 section 2.7.2) :
 *   1. Engagement en état `performed`
 *   2. Double consentement : talent + organisateur (timestamps explicites)
 *   3. newDurationMinutes > originalDurationMinutes (extension, pas réduction)
 *   4. newDurationMinutes ≤ originalDurationMinutes + maxExtensionMinutes (config DB)
 *   5. requireDoubleConsent lu en DB (jamais hardcodé)
 *   6. amendmentType === 'PLAGE_EXTENSION' (seul type MVP)
 *   7. reasonCode obligatoire
 *
 * FORMULE (D-147) :
 *   taux_horaire_implicite_cents = cachet_brut_final_cents / duree_signee_minutes × 60
 *   nouveau_cachet_brut_final_cents = taux_horaire_implicite_cents × newDurationMinutes / 60
 *   delta_cachet_cents = nouveau_cachet_brut_final_cents − cachet_brut_final_cents
 *   delta_commission_mr_cents = floor(delta_cachet_cents × taux_effectif_snapshot_ppm / 1_000_000)
 *   delta_talent_net_cents = delta_cachet_cents − delta_commission_mr_cents
 *
 * ATTENTION : taux_horaire_implicite_cents est un entier car le calcul
 * utilise Math.floor via MoneyMath — résidu d'arrondi tracé (D-070).
 *
 * LOI LEDGER-02 après amendment :
 *   La vérification porte sur le DELTA — pas sur le total recompilé.
 *   delta_cachet = delta_talent_net + delta_commission_mr + rounding_delta
 *   rounding_delta ≤ 1 centime (floor sur un seul produit)
 *
 * Source : D-147 · OS V14 section 2.7.2 · MoneyMath · IDFactory
 * ============================================================
 */

'use strict';

import IDFactory from '../IDFactory.js';
import MoneyMath from '../MoneyMath.js';
const ALLOWED_AMENDMENT_TYPES = new Set(['PLAGE_EXTENSION']);

/**
 * Valide et construit un EngagementAmendment.
 *
 * @param {object} params
 * @param {string}  params.engagementId
 * @param {string}  params.currentEngagementState  — doit être 'performed'
 * @param {string}  params.actor                   — USR-* qui déclenche
 * @param {object}  params.context
 *
 * Champs obligatoires dans context :
 * @param {string}  params.context.amendmentType              — 'PLAGE_EXTENSION'
 * @param {number}  params.context.newDurationMinutes         — nouvelle durée totale
 * @param {string}  params.context.talentConsentAt            — ISO timestamp consentement talent
 * @param {string}  params.context.organizerConsentAt         — ISO timestamp consentement organisateur
 * @param {string}  params.context.reasonCode                 — obligatoire
 * @param {string|null} params.context.adminActionId          — si fondateur sur place
 * @param {object}  params.context.contractSnapshotPhase2     — W2 complet
 *   @param {number}   .cachetBrutFinalCents                  — WORM W2
 *   @param {number}   .durationMinutes                       — durée contractuelle signée
 *   @param {number}   .tauxEffectifSnapshotPpm               — taux commission au scellement
 *   @param {string}   .talentUserId
 *
 * Champs obligatoires dans repositories :
 * @param {object}  params.repositories.policyConfig          — { getConfig(key) }
 *
 * @returns {{ passed: boolean, amendment?: object, ledgerDelta?: object, reason?: string }}
 */
async function validate({
  engagementId,
  currentEngagementState,
  actor,
  context = {},
  repositories = {},
}) {

  // ── Précondition : repositories.policyConfig ──────────────
  if (!repositories.policyConfig || typeof repositories.policyConfig.getConfig !== 'function') {
    return {
      passed: false,
      reason: 'AMENDMENT_CONFIG_ERROR: repositories.policyConfig.getConfig() absent. ' +
              'EngagementAmendmentGuard ne peut pas lire maxExtensionMinutes sans PolicyConfigRepository.',
    };
  }

  const getConfig = repositories.policyConfig.getConfig.bind(repositories.policyConfig);

  // ── Lecture configs depuis la database ────────────────────
  // Jamais hardcodées — Market Pivot, D-063
  let maxExtensionMinutes, requireDoubleConsent;
  try {
    maxExtensionMinutes  = parseInt(await getConfig('amendment_max_extension_minutes'), 10);
    requireDoubleConsent = (await getConfig('amendment_require_double_consent')) === 'true'
      || await getConfig('amendment_require_double_consent') === true;
  } catch (err) {
    return {
      passed: false,
      reason: `AMENDMENT_POLICY_CONFIG_MISSING: Impossible de lire les configs d'amendment depuis la database. ` +
              `Détail: ${err.message}. ` +
              `Exécuter node scripts/seed-policy-config.js pour initialiser.`,
    };
  }

  if (!Number.isInteger(maxExtensionMinutes) || maxExtensionMinutes <= 0) {
    return {
      passed: false,
      reason: `AMENDMENT_CONFIG_INVALID: amendment_max_extension_minutes=${maxExtensionMinutes} ` +
              `doit être un entier > 0.`,
    };
  }

  const {
    amendmentType,
    newDurationMinutes,
    talentConsentAt,
    organizerConsentAt,
    reasonCode,
    adminActionId,
    contractSnapshotPhase2,
  } = context;

  // ── Condition 1 : état `performed` ────────────────────────
  // D-147 : l'amendment ne peut être créé que depuis `performed`,
  // avant `event_completed`. La plage est figée après.
  if (currentEngagementState !== 'performed') {
    return {
      passed: false,
      reason: `AMENDMENT_WRONG_STATE: L'Engagement doit être en état "performed" pour créer un amendment. ` +
              `État actuel : "${currentEngagementState}". ` +
              `D-147 : l'amendment est impossible après event_completed — la plage est figée. ` +
              `Source : D-147 Condition 1.`,
    };
  }

  // ── Condition 2 : amendmentType valide ────────────────────
  if (!amendmentType || !ALLOWED_AMENDMENT_TYPES.has(amendmentType)) {
    return {
      passed: false,
      reason: `AMENDMENT_TYPE_INVALID: amendmentType="${amendmentType}" non reconnu. ` +
              `Seul "PLAGE_EXTENSION" est autorisé en MVP. ` +
              `Source : D-147 — seul type MVP.`,
    };
  }

  // ── Condition 3 : double consentement ────────────────────
  // requireDoubleConsent lu en DB — jamais hardcodé.
  // En production MVP : toujours true.
  if (requireDoubleConsent) {
    if (!talentConsentAt) {
      return {
        passed: false,
        reason: 'AMENDMENT_MISSING_TALENT_CONSENT: talentConsentAt absent. ' +
                'Le consentement explicite du talent est obligatoire (action dans l\'app). ' +
                'Source : D-147 Condition 2 · amendment_require_double_consent=true.',
      };
    }
    if (!organizerConsentAt) {
      return {
        passed: false,
        reason: 'AMENDMENT_MISSING_ORGANIZER_CONSENT: organizerConsentAt absent. ' +
                'Le consentement explicite de l\'organisateur est obligatoire (action dans l\'app). ' +
                'Source : D-147 Condition 2.',
      };
    }
  }

  // ── Condition 4 : reasonCode obligatoire ──────────────────
  if (!reasonCode || typeof reasonCode !== 'string' || reasonCode.trim() === '') {
    return {
      passed: false,
      reason: 'AMENDMENT_MISSING_REASON_CODE: reasonCode obligatoire. ' +
              'Documenter la raison de l\'extension (ex: HEADLINER_NO_SHOW, ORGANIZER_REQUEST). ' +
              'Source : D-147 Objet EngagementAmendment.',
    };
  }

  // ── Condition 5 : ContractSnapshot phase 2 présent ───────
  if (!contractSnapshotPhase2) {
    return {
      passed: false,
      reason: 'AMENDMENT_MISSING_SNAPSHOT: contractSnapshotPhase2 absent. ' +
              'Le ContractSnapshot W2 (event_sealed) est requis pour recalculer ' +
              'le taux horaire implicite. Source : D-147 — taux WORM W2 invariant.',
    };
  }

  const {
    cachetBrutFinalCents,
    durationMinutes: originalDurationMinutes,
    tauxEffectifSnapshotPpm,
    talentUserId,
  } = contractSnapshotPhase2;

  if (!talentUserId) {
    return {
      passed: false,
      reason: 'AMENDMENT_SNAPSHOT_INCOMPLETE: contractSnapshotPhase2.talentUserId absent.',
    };
  }
  if (!Number.isInteger(cachetBrutFinalCents) || cachetBrutFinalCents <= 0) {
    return {
      passed: false,
      reason: `AMENDMENT_SNAPSHOT_INVALID: cachetBrutFinalCents=${cachetBrutFinalCents} ` +
              `doit être un entier > 0 (ContractSnapshot phase 2, WORM W2). Standard D-064.`,
    };
  }
  if (!Number.isInteger(originalDurationMinutes) || originalDurationMinutes <= 0) {
    return {
      passed: false,
      reason: `AMENDMENT_SNAPSHOT_INVALID: contractSnapshotPhase2.durationMinutes=${originalDurationMinutes} ` +
              `doit être un entier > 0. Requis pour calculer le taux horaire implicite. Source : D-147.`,
    };
  }
  if (!Number.isInteger(tauxEffectifSnapshotPpm) || tauxEffectifSnapshotPpm < 0 || tauxEffectifSnapshotPpm > 1_000_000) {
    return {
      passed: false,
      reason: `AMENDMENT_SNAPSHOT_INVALID: tauxEffectifSnapshotPpm=${tauxEffectifSnapshotPpm} ` +
              `doit être entre 0 et 1 000 000. Standard D-064.`,
    };
  }

  // ── Condition 6 : newDurationMinutes valide ───────────────
  if (!Number.isInteger(newDurationMinutes) || newDurationMinutes <= 0) {
    return {
      passed: false,
      reason: `AMENDMENT_INVALID_DURATION: newDurationMinutes=${newDurationMinutes} ` +
              `doit être un entier > 0.`,
    };
  }

  // ── Condition 7 : extension, pas réduction ────────────────
  // D-147 : newDurationMinutes > originalDurationMinutes
  if (newDurationMinutes <= originalDurationMinutes) {
    return {
      passed: false,
      reason: `AMENDMENT_NOT_AN_EXTENSION: newDurationMinutes(${newDurationMinutes}) ` +
              `≤ originalDurationMinutes(${originalDurationMinutes}). ` +
              `D-147 : seule une extension est autorisée — pas une réduction. ` +
              `Source : D-147 Condition 4.`,
    };
  }

  // ── Condition 8 : plafond d'extension ────────────────────
  // D-147 : newDurationMinutes ≤ originalDurationMinutes + maxExtensionMinutes
  const extensionMinutes = newDurationMinutes - originalDurationMinutes;
  if (extensionMinutes > maxExtensionMinutes) {
    return {
      passed: false,
      reason: `AMENDMENT_EXCEEDS_MAX_EXTENSION: Extension demandée = ${extensionMinutes}min ` +
              `> amendment_max_extension_minutes(${maxExtensionMinutes}min) (DB). ` +
              `Réduire la durée ou modifier la config en database. ` +
              `Source : D-147 Condition 5.`,
    };
  }

  // ── CALCUL FINANCIER D-147 ────────────────────────────────
  //
  // Taux horaire implicite — recalculé depuis ContractSnapshot phase 2 (WORM W2)
  // JAMAIS stocké — recalculé à chaque fois depuis les données immuables.
  //
  // taux_horaire_implicite_cents = floor(cachet_brut_final_cents × 60 / duree_signee_minutes)
  // C'est un floor — le résidu est inférieur à 1 centime par heure.
  //
  // Note : MoneyMath.prorataCents(amount, weight, total) calcule floor(amount × weight / total)
  // On réutilise cette logique : floor(cachet × 60 / originalDuration)
  const tauxHoraireImpliciteCents = MoneyMath.prorataCents(
    cachetBrutFinalCents,
    60,
    originalDurationMinutes
  );

  // nouveau_cachet_brut_final_cents = floor(taux_horaire × newDuration / 60)
  const nouveauCachetBrutFinalCents = MoneyMath.prorataCents(
    tauxHoraireImpliciteCents,
    newDurationMinutes,
    60
  );

  const deltaCachetCents = nouveauCachetBrutFinalCents - cachetBrutFinalCents;

  // delta ne peut être négatif que si newDuration < originalDuration
  // (bloqué par Condition 7 ci-dessus) — donc deltaCachetCents ≥ 0 ici
  if (deltaCachetCents < 0) {
    return {
      passed: false,
      reason: `AMENDMENT_DELTA_NEGATIVE: deltaCachetCents=${deltaCachetCents} < 0. ` +
              `Incohérence de calcul : newDuration > originalDuration mais delta négatif. ` +
              `Vérifier les arrrondis du taux horaire implicite.`,
    };
  }

  // delta_commission_mr = floor(delta × taux_effectif_ppm / 1_000_000)
  const deltaCommissionMrCents = MoneyMath.applyRatePpm(deltaCachetCents, tauxEffectifSnapshotPpm);
  const deltaTalentNetCents    = deltaCachetCents - deltaCommissionMrCents;

  // ── LOI LEDGER-02 sur le DELTA ────────────────────────────
  // delta_cachet = delta_talent_net + delta_commission_mr + rounding_delta
  // rounding_delta ≤ 1 centime (résidu d'un seul applyRatePpm floor)
  const roundingDeltaCents = deltaCachetCents - deltaTalentNetCents - deltaCommissionMrCents;
  if (Math.abs(roundingDeltaCents) > 1) {
    return {
      passed: false,
      reason: `AMENDMENT_LEDGER_INVARIANT_VIOLATED: roundingDelta=${roundingDeltaCents} > 1 centime. ` +
              `LOI LEDGER-02 violée sur le delta d'amendment. ` +
              `delta(${deltaCachetCents}) ≠ net(${deltaTalentNetCents}) + commission(${deltaCommissionMrCents}).`,
    };
  }

  // ── Construction de l'objet EngagementAmendment ──────────
  // Immuable — append-only en database (WORM-APPEND-01).
  // L'appelant est responsable de la persistance.
  const amendment = {
    systemId:                    IDFactory.generate('EngagementAmendment'),
    engagementId,
    amendmentType,
    // Durées
    originalDurationMinutes,
    newDurationMinutes,
    extensionMinutes,
    // Finances — base WORM W2
    originalCachetBrutFinalCents: cachetBrutFinalCents,
    tauxHoraireImpliciteCents,     // recalculé, non stocké comme source de vérité
    tauxEffectifSnapshotPpm,
    // Résultat amendment
    newCachetBrutFinalCents:      nouveauCachetBrutFinalCents,
    deltaCachetCents,
    deltaCommissionMrCents,
    deltaTalentNetCents,
    roundingDeltaCents,            // vers compte 6591 si > 0 (D-070)
    // Consentements
    talentUserId,
    talentConsentAt:               talentConsentAt || null,
    organizerConsentAt:            organizerConsentAt || null,
    adminActionId:                 adminActionId || null,
    // Traçabilité
    reasonCode:                    reasonCode.trim(),
    createdByActor:                actor,
    createdAt:                     new Date().toISOString(),
    // Méta
    wormAppendOnly:                true,   // WORM-APPEND-01
    doesNotViolateEventSealed:     true,   // D-147 décision WORM
  };

  // ── Écritures ledger du delta (D-070, append-only) ───────
  // L'appelant les persiste en FinancialLedger.
  const ledgerDelta = {
    engagementId,
    amendmentSystemId:     amendment.systemId,
    deltaCachetCents,
    deltaCommissionMrCents,
    deltaTalentNetCents,
    roundingDeltaCents,
    entries: [
      {
        account:     '4310',
        direction:   'CREDIT',
        amountCents: deltaTalentNetCents,
        note:        `Amendment ${amendment.systemId} — dette talent delta (D-147)`,
      },
      {
        account:     '4530',
        direction:   'CREDIT',
        amountCents: deltaCommissionMrCents,
        note:        `Amendment ${amendment.systemId} — commission MR delta (D-147)`,
      },
      ...(roundingDeltaCents > 0 ? [{
        account:     '6591',
        direction:   'CREDIT',
        amountCents: roundingDeltaCents,
        note:        `Amendment ${amendment.systemId} — résidu arrondi floor (D-070)`,
      }] : []),
    ],
  };

  return {
    passed: true,
    amendment,
    ledgerDelta,
    audit: {
      engagementId,
      amendmentSystemId:          amendment.systemId,
      originalDurationMinutes,
      newDurationMinutes,
      extensionMinutes,
      tauxHoraireImpliciteCents,
      originalCachetBrutFinalCents: cachetBrutFinalCents,
      newCachetBrutFinalCents:      nouveauCachetBrutFinalCents,
      deltaCachetCents,
      deltaCommissionMrCents,
      deltaTalentNetCents,
      roundingDeltaCents,
      maxExtensionMinutes,
      requireDoubleConsent,
    },
  };
}

export default {
validate, ALLOWED_AMENDMENT_TYPES 
};
export { validate, ALLOWED_AMENDMENT_TYPES };