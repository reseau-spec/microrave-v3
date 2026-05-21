/**
 * MICRO RAVE V3 — SOTSSubmissionService
 * ============================================================
 * Service de soumission et consolidation des scores SOTS.
 *
 * Source : D-077 · D-082 · D-094 pattern 6 · Plan Phase 2.1
 *
 * SOTS = Score Objectif de la Transaction et du Service
 *   Fenetre : 24h apres event_completed
 *   Consolidation : agregation → SOTSScoreSnapshot → ReputationLedger
 *
 * RESPONSABILITES :
 *   submit()        → soumet une note, valide D-094 pattern 6
 *   consolidate()   → ferme la fenetre, cree le snapshot, grave la reputation
 *   isConsolidated() → verifie si la fenetre est deja fermee
 *
 * REGLE D-094 PATTERN 6 — SOTS_SELF_BENEFICIAL :
 *   Auto-note directe ou indirecte → blocage absolu.
 *   Si submittedBy === talentUserId : SOTS_SELF_BENEFICIAL leve avant toute persistence.
 *   "Blocage absolu" = jamais de contournement, jamais de SoloFounderOverride.
 *
 * CALCUL DU SCORE MOYEN :
 *   scoreCategories contient N categories notees de 1 a 5.
 *   Moyenne arithmetique simple — EMA calcule par ReputationLedger sur le long terme.
 *   Source : D-082 — "EMA scores snapshotés a WORM Moment 5."
 *
 * INTERFACE REPOSITORIES :
 *   repositories.sots        — SOTSRepository
 *   repositories.reputation  — ReputationRepository
 * ============================================================
 */

'use strict';

const IDFactory = require('../core/IDFactory');

/**
 * Soumet une note SOTS.
 * Fail-closed sur D-094 pattern 6 avant toute persistence.
 *
 * @param {object} params
 * @param {string}   params.engagementId    — ENG-* obligatoire
 * @param {string}   params.talentUserId    — USR-* du talent note (pour valider D-094 p6)
 * @param {string}   params.submittedBy     — USR-* qui soumet
 * @param {string}   params.role            — 'talent' | 'organisateur' | 'vendeur'
 * @param {object}   params.scoreCategories — { qualite, ponctualite, communication, ... }
 * @param {string[]} [params.reasonCodes]   — codes raisons optionnels
 * @param {object}   params.repositories
 * @param {object}     params.repositories.sots       — SOTSRepository
 * @param {object}     params.repositories.reputation — ReputationRepository
 *
 * @returns {Promise<{ systemId: string, createdAt: string }>}
 */
async function submit({
  engagementId,
  talentUserId,
  submittedBy,
  role,
  scoreCategories,
  reasonCodes,
  repositories,
}) {

  // ── Validations fail-closed ──────────────────────────────
  if (!engagementId) {
    throw new Error(
      'SOTS_ERROR: engagementId obligatoire pour submit(). ' +
      'Source : D-077 — la soumission est liee a un Engagement precis.'
    );
  }
  if (!submittedBy) {
    throw new Error('SOTS_ERROR: submittedBy obligatoire pour submit().');
  }
  if (!repositories || !repositories.sots) {
    throw new Error('SOTS_ERROR: repositories.sots obligatoire.');
  }
  if (!repositories.reputation) {
    throw new Error('SOTS_ERROR: repositories.reputation obligatoire.');
  }

  // ── D-094 PATTERN 6 — SOTS_SELF_BENEFICIAL : blocage absolu ─
  // Auto-note directe : submittedBy === talentUserId de l'engagement.
  // Jamais de contournement. Jamais de SoloFounderOverride pour cette regle.
  // Source : D-094 pattern 6 · TEST_REGISTRY SOTS-SELF-01 requiredBeforeEvent=1.
  if (talentUserId && submittedBy === talentUserId) {
    throw new Error(
      `SOTS_SELF_BENEFICIAL: Auto-note bloquee. submittedBy="${submittedBy}" est le talent ` +
      `note dans l'engagement "${engagementId}". ` +
      `D-094 pattern 6 : blocage absolu de l'auto-note directe ou indirecte. ` +
      `Jamais de contournement possible.`
    );
  }

  // ── Verifier que la fenetre n'est pas fermee (post-consolidation) ─
  const existingSnapshot = await repositories.sots.findSnapshotByEngagementId(engagementId);
  if (existingSnapshot) {
    throw new Error(
      `SOTS_WINDOW_CLOSED: La fenetre SOTS pour l'engagement "${engagementId}" ` +
      `est deja consolidee (snapshot ${existingSnapshot.systemId || existingSnapshot.id}). ` +
      `Soumission apres consolidation impossible. Source : D-077.`
    );
  }

  // ── Generation du systemId souverain ─────────────────────
  const systemId  = IDFactory.generate('SOTSRecord');
  const createdAt = new Date().toISOString();

  // ── Persistence SOTSSubmission ───────────────────────────
  await repositories.sots.create({
    systemId,
    engagementId,
    submittedBy,
    talentUserId,
    role:            role || 'organisateur',
    scoreCategories: scoreCategories || {},
    reasonCodes:     reasonCodes     || [],
    createdAt,
  });

  // ── Reputation ledger — entree SOTS_SCORE pour le talent ─
  // Calcul du score moyen depuis les categories
  const scoreValue = computeAverageScore(scoreCategories);
  if (scoreValue !== null && talentUserId) {
    await repositories.reputation.append({
      systemId:     IDFactory.generate('ReputationEntry'),
      userId:       talentUserId,
      engagementId,
      entryType:    'SOTS_SCORE',
      scoreValue,
      submittedBy,
      reasonCodes:  reasonCodes || [],
      createdAt,
    });
  }

  return { systemId, createdAt };
}

/**
 * Consolide toutes les soumissions SOTS d'un Engagement.
 * Cree un SOTSScoreSnapshot immuable (WORM Moment 5).
 * Marque les soumissions comme consolidees.
 *
 * @param {object} params
 * @param {string}  params.engagementId
 * @param {string}  [params.talentUserId]  — USR-* pour le snapshot
 * @param {object}  params.repositories
 *
 * @returns {Promise<{ sotsConsolidated: true, snapshot: object }>}
 */
async function consolidate({ engagementId, talentUserId, repositories }) {
  if (!engagementId) {
    throw new Error('SOTS_ERROR: engagementId obligatoire pour consolidate().');
  }
  if (!repositories || !repositories.sots) {
    throw new Error('SOTS_ERROR: repositories.sots obligatoire pour consolidate().');
  }

  // ── Lire toutes les soumissions ──────────────────────────
  const submissions = await repositories.sots.findByEngagementId(engagementId);
  const nonConsolidated = submissions.filter(s => !s.consolidated);

  // ── Calcul du score moyen agrege ─────────────────────────
  const aggregatedScore = computeAggregatedScore(nonConsolidated);

  // ── Creer le SOTSScoreSnapshot (immuable apres creation) ─
  // Source : D-082 — WORM Moment 5 : scores graves definitivement.
  const snapshotSystemId = IDFactory.generate('SOTSRecord');
  const consolidatedAt   = new Date().toISOString();

  const snapshot = await repositories.sots.createSnapshot({
    systemId:          snapshotSystemId,
    engagementId,
    talentUserId:      talentUserId || null,
    submissionCount:   nonConsolidated.length,
    aggregatedScore,
    consolidatedAt,
    createdAt:         consolidatedAt,
  });

  // ── Marquer les soumissions consolidees ──────────────────
  await repositories.sots.markConsolidated(engagementId, consolidatedAt);

  return { sotsConsolidated: true, snapshot };
}

/**
 * Verifie si la fenetre SOTS d'un Engagement est deja consolidee.
 *
 * @param {object} params
 * @param {string}  params.engagementId
 * @param {object}  params.repositories
 *
 * @returns {Promise<boolean>}
 */
async function isConsolidated({ engagementId, repositories }) {
  if (!engagementId) {
    throw new Error('SOTS_ERROR: engagementId obligatoire pour isConsolidated().');
  }
  if (!repositories || !repositories.sots) {
    throw new Error('SOTS_ERROR: repositories.sots obligatoire pour isConsolidated().');
  }
  const snapshot = await repositories.sots.findSnapshotByEngagementId(engagementId);
  return snapshot !== null;
}

// ── Helpers de calcul ─────────────────────────────────────────

/**
 * Calcule la moyenne arithmetique des categories d'une soumission.
 * Retourne null si pas de categories ou categories vides.
 * Source : D-082 — score simple, EMA calcule sur le long terme.
 */
function computeAverageScore(scoreCategories) {
  if (!scoreCategories || typeof scoreCategories !== 'object') return null;
  const values = Object.values(scoreCategories).filter(
    v => typeof v === 'number' && v >= 1 && v <= 5
  );
  if (values.length === 0) return null;
  // Somme entiere, division entiere arrondie au plus proche
  // D-064 ne s'applique pas aux scores (1-5), pas aux montants —
  // mais on evite les floats : on retourne 1 decimale max.
  const sum = values.reduce((a, b) => a + b, 0);
  return Math.round((sum / values.length) * 10) / 10;
}

/**
 * Calcule le score agrege de toutes les soumissions.
 * Moyenne simple entre soumissions.
 */
function computeAggregatedScore(submissions) {
  if (!submissions || submissions.length === 0) return null;
  const scores = submissions
    .map(s => computeAverageScore(s.scoreCategories))
    .filter(s => s !== null);
  if (scores.length === 0) return null;
  const sum = scores.reduce((a, b) => a + b, 0);
  return Math.round((sum / scores.length) * 10) / 10;
}

module.exports = { submit, consolidate, isConsolidated };