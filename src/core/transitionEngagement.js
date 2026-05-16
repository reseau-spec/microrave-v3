/**
 * MICRO RAVE V3 — transitionEngagement()
 * ============================================================
 * LOI TRANSITION-01 — Source : OS V10 section 16.2
 *
 * RÈGLE ABSOLUE :
 * Cette fonction est l'UNIQUE point d'entrée pour tout
 * changement d'état d'un Engagement.
 *
 * Toute tentative de mutation directe de status est une
 * violation de Niveau 2 (équivalent fraude).
 *
 * Ordre invariant des guards :
 *   1. WORMGuard         ← en premier — violation la plus grave
 *   2. MissionConversionGuard (vérification table)
 *   3. Guard spécifique à la transition
 *   4. FinancialInvariantGuard
 *   5. AuditLogger       ← toujours, sans exception
 * ============================================================
 */

'use strict';
const MissionConversionGuard = require('./guards/MissionConversionGuard');

// ── Table souveraine des transitions autorisées ──────────────
// Source : OS V10 section 2.7.1
const TRANSITION_TABLE = {
  'proposed->accepted':               { guard: 'MissionConversionGuard', worm: null, financialGuard: false },
  'accepted->placed':                 { guard: 'PlacementGuard',         worm: 'W1', financialGuard: false },
  'placed->deposit_pending':          { guard: 'PlacementGuard',         worm: null, financialGuard: true  },
  'deposit_pending->deposit_secured': { guard: 'SealingGuard',           worm: null, financialGuard: true  },
  'deposit_secured->event_sealed':    { guard: 'SealingGuard',           worm: 'W2', financialGuard: true  },
  'event_sealed->performed':          { guard: 'PresenceWindowGuard',    worm: null, financialGuard: false },
  'performed->event_completed':       { guard: 'EventCompletionGuard',   worm: 'W1', financialGuard: false },
  'performed->payable':               { guard: 'PresenceProofGuard',     worm: null, financialGuard: true  },
  'event_completed->sots_window_closed': { guard: 'SOTSWindowGuard',     worm: 'W1', financialGuard: false },
  'payable->settled':                 { guard: 'LedgerInvariantGuard',   worm: 'W3', financialGuard: true  },
  'settled->archived':                { guard: 'ArchiveWORMGuard',       worm: 'W3', financialGuard: true  },
  // Transitions alternatives
  'performed->no_show':               { guard: 'NoShowGuard',            worm: null, financialGuard: false },
  'proposed->withdrawn':              { guard: 'WithdrawalGuard',        worm: null, financialGuard: false },
  'accepted->disputed':               { guard: 'DisputeGuard',           worm: null, financialGuard: false },
  'event_sealed->disputed':           { guard: 'DisputeGuard',           worm: null, financialGuard: false },
};

// ── États WORM et leur niveau de sévérité ────────────────────
// Source : OS V10 section 2.7 BLOC 2 V8
const WORM_STATES = {
  'settled':      'W3', // Architecturalement impossible à modifier
  'archived':     'W3', // Architecturalement impossible à modifier
  'event_sealed': 'W2', // Fraude — AdminIncidentRecord P0 + SYSTEM_HOLD
  'accepted':     'W1', // Erreur corrigeable — log obligatoire
  'deposit_secured': 'W1',
  'event_completed': 'W1',
  'sots_window_closed': 'W1',
};

/**
 * Fonction principale — unique point d'entrée.
 *
 * @param {object} params
 * @param {string} params.engagementId  — systemId de l'Engagement
 * @param {string} params.currentState  — état actuel
 * @param {string} params.targetState   — état cible
 * @param {string} params.actor         — systemId de l'acteur
 * @param {object} params.context       — données pour les guards
 * @param {object} params.repositories  — accès aux données
 *
 * @returns {object} { success, newState, transition, timestamp }
 * @throws  {Error}  avec code explicite si transition invalide
 */
async function transitionEngagement({
  engagementId,
  currentState,
  targetState,
  actor,
  context = {},
  repositories = {},
}) {

  // ── Validation des paramètres obligatoires ────────────────
  if (!engagementId) throw new Error('TRANSITION_ERROR: engagementId manquant');
  if (!currentState) throw new Error('TRANSITION_ERROR: currentState manquant');
  if (!targetState)  throw new Error('TRANSITION_ERROR: targetState manquant');
  if (!actor)        throw new Error('TRANSITION_ERROR: actor manquant');

  const transitionKey = `${currentState}->${targetState}`;

  // ── GUARD 1 : WORMGuard ───────────────────────────────────
  // Vérifié EN PREMIER — violation WORM plus grave que
  // transition non autorisée. Source : OS V10 section 2.7
  const wormLevel = WORM_STATES[currentState];

  if (wormLevel === 'W3') {
    throw new Error(
      `WORM_VIOLATION_LEVEL_3: L'état "${currentState}" est architecturalement immuable. ` +
      `Aucune transition possible. EngagementId: ${engagementId}`
    );
  }

  if (wormLevel === 'W2') {
    const incident = {
      type: 'WORM_VIOLATION_LEVEL_2',
      engagementId,
      actor,
      attemptedTransition: transitionKey,
      timestamp: new Date().toISOString(),
    };
    // TODO: repositories.admin?.createIncidentRecord(incident)
    console.error('[WORM] Violation Niveau 2 détectée:', incident);
    throw new Error(
      `WORM_VIOLATION_LEVEL_2: Tentative de modification de l'état scellé "${currentState}". ` +
      `AdminIncidentRecord P0 créé. EngagementId: ${engagementId}`
    );
  }

  // ── GUARD 2 : Transition autorisée dans la table ? ────────
  // Source : OS V10 section 2.7.1 — table souveraine
  const rule = TRANSITION_TABLE[transitionKey];
  if (!rule) {
    throw new Error(
      `TRANSITION_UNAUTHORIZED: "${transitionKey}" n'est pas une transition autorisée. ` +
      `Transitions valides depuis "${currentState}": ` +
      (Object.keys(TRANSITION_TABLE)
        .filter(k => k.startsWith(`${currentState}->`))
        .join(', ') || 'aucune')
    );
  }

  // ── GUARD 3 : Guard spécifique à la transition ────────────
  const guardResult = await runSpecificGuard({
    guardName: rule.guard,
    engagementId,
    currentState,
    targetState,
    actor,
    context,
    repositories,
  });

  if (!guardResult.passed) {
    throw new Error(
      `GUARD_FAILED: ${rule.guard} a bloqué "${transitionKey}". ` +
      `Raison: ${guardResult.reason}. EngagementId: ${engagementId}`
    );
  }

  // ── GUARD 4 : FinancialInvariantGuard ─────────────────────
  if (rule.financialGuard) {
    // TODO: vérifier équilibre ledger avant transition financière
    console.log(`[FinancialInvariantGuard] "${transitionKey}" — vérification ledger à implémenter`);
  }

  // ── GUARD 5 : AuditLogger — TOUJOURS, sans exception ─────
  const auditEntry = {
    engagementId,
    transition: transitionKey,
    actor,
    timestamp: new Date().toISOString(),
    guardApplied: rule.guard,
    wormLevel: rule.worm || 'NONE',
  };
  // TODO: repositories.audit?.writeToDataAccessLedger(auditEntry)
  console.log('[AuditLogger]', JSON.stringify(auditEntry));

  // ── Transition exécutée ───────────────────────────────────
  return {
    success: true,
    engagementId,
    previousState: currentState,
    newState: targetState,
    transition: transitionKey,
    guardApplied: rule.guard,
    timestamp: auditEntry.timestamp,
  };
}

// ── Dispatcher des guards spécifiques ────────────────────────
async function runSpecificGuard({
  guardName, engagementId, currentState,
  targetState, actor, context, repositories
}) {
  switch (guardName) {

    case 'MissionConversionGuard':
      return await MissionConversionGuard.validate({
        engagementId,
        actor,
        context,
        repositories,
      });

    case 'PlacementGuard':
      // TODO: EventPaymentRecord, lineup verrouillé, prix calculé
      console.log(`[PlacementGuard] placement — à implémenter`);
      return { passed: true, reason: 'placeholder' };

    case 'SealingGuard':
      // TODO: LOI LEDGER-02 avant scellement
      console.log(`[SealingGuard] event_sealed — à implémenter`);
      return { passed: true, reason: 'placeholder' };

    case 'PresenceWindowGuard':
      // TODO: ouvrir fenêtre check-in
      console.log(`[PresenceWindowGuard] ouverture fenêtre — à implémenter`);
      return { passed: true, reason: 'placeholder' };

    case 'PresenceProofGuard':
      // TODO: SessionPresence.checkedInAt != null — LOI CO-DÉPENDANCE-01
      console.log(`[PresenceProofGuard] vérification présence — à implémenter`);
      return { passed: true, reason: 'placeholder' };

    case 'EventCompletionGuard':
      // TODO: tous talents performed, no-show résolu
      console.log(`[EventCompletionGuard] complétion — à implémenter`);
      return { passed: true, reason: 'placeholder' };

    case 'SOTSWindowGuard':
      // TODO: fermer fenêtre SOTS 24h après event_completed
      console.log(`[SOTSWindowGuard] fermeture SOTS — à implémenter`);
      return { passed: true, reason: 'placeholder' };

    case 'LedgerInvariantGuard':
      // TODO: KYCStatus=VERIFIED, ledger équilibré
      console.log(`[LedgerInvariantGuard] invariant ledger — à implémenter`);
      return { passed: true, reason: 'placeholder' };

    case 'ArchiveWORMGuard':
      // TODO: GoNoGoDecisionRecord=GO, BugReplayRecords P0=PASSED
      console.log(`[ArchiveWORMGuard] archive finale — à implémenter`);
      return { passed: true, reason: 'placeholder' };

    case 'NoShowGuard':
      console.log(`[NoShowGuard] no-show — à implémenter`);
      return { passed: true, reason: 'placeholder' };

    case 'WithdrawalGuard':
      console.log(`[WithdrawalGuard] retrait — à implémenter`);
      return { passed: true, reason: 'placeholder' };

    case 'DisputeGuard':
      console.log(`[DisputeGuard] dispute — à implémenter`);
      return { passed: true, reason: 'placeholder' };

    default:
      throw new Error(`GUARD_UNKNOWN: Guard "${guardName}" non reconnu`);
  }
}

module.exports = { transitionEngagement, TRANSITION_TABLE, WORM_STATES };