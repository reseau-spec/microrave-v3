/**
 * MICRO RAVE V3 — EngagementAmendmentService
 * ============================================================
 * Orchestrateur du sous-processus D-147.
 *
 * Responsabilités :
 *   1. Appeler EngagementAmendmentGuard.validate()
 *   2. Persister l'objet EngagementAmendment en database (append-only)
 *   3. Persister les écritures ledger delta (append-only)
 *   4. Retourner l'amendment créé à l'appelant
 *
 * Ce service NE modifie PAS l'état de l'Engagement.
 * Il NE touche PAS au ContractSnapshot phase 2 (WORM W2).
 * Tout est append-only — WORM-APPEND-01.
 *
 * Interface repositories requise :
 *   repositories.policyConfig          — { getConfig(key) }
 *   repositories.engagementAmendments  — { create(amendment) }
 *   repositories.ledgerRecords         — { append(entry) }
 *
 * Source : D-147 · OS V14 section 2.7.2
 * ============================================================
 */

'use strict';

import EngagementAmendmentGuard from '../core/guards/EngagementAmendmentGuard.js';
/**
 * Crée un EngagementAmendment après validation complète.
 *
 * @param {object} params — identiques à EngagementAmendmentGuard.validate()
 * @returns {{ created: boolean, amendment?, ledgerDelta?, reason? }}
 */
async function createAmendment({
  engagementId,
  currentEngagementState,
  actor,
  context,
  repositories,
}) {
  // ── Validation complète via le guard ─────────────────────
  const result = await EngagementAmendmentGuard.validate({
    engagementId,
    currentEngagementState,
    actor,
    context,
    repositories,
  });

  if (!result.passed) {
    return {
      created: false,
      reason:  result.reason,
    };
  }

  const { amendment, ledgerDelta } = result;

  // ── Persistance de l'amendment (append-only) ─────────────
  if (!repositories.engagementAmendments?.create) {
    throw new Error(
      `AMENDMENT_SERVICE_ERROR: repositories.engagementAmendments.create() absent. ` +
      `Fournir le repository d'amendments avant d'appeler createAmendment(). ` +
      `Source : D-147 — L'amendment est append-only en database.`
    );
  }

  const persisted = await repositories.engagementAmendments.create(amendment);

  // ── Persistance des écritures ledger delta ────────────────
  if (!repositories.ledgerRecords?.append) {
    throw new Error(
      `AMENDMENT_SERVICE_ERROR: repositories.ledgerRecords.append() absent. ` +
      `Fournir le ledger repository. Source : D-070 · WORM-APPEND-01.`
    );
  }

  const persistedEntries = [];
  for (const entry of ledgerDelta.entries) {
    const ledgerEntry = await repositories.ledgerRecords.append({
      ...entry,
      engagementId,
      amendmentSystemId: amendment.systemId,
      createdAt:         amendment.createdAt,
    });
    persistedEntries.push(ledgerEntry);
  }

  return {
    created:         true,
    amendment:       persisted,
    ledgerDelta: {
      ...ledgerDelta,
      persistedEntries,
    },
    audit: result.audit,
  };
}

export default {
createAmendment 
};
export { createAmendment };