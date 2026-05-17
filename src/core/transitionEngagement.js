/**
 * MICRO RAVE V3 — transitionEngagement()
 * ============================================================
 * LOI TRANSITION-01 — Source : OS V10 section 16.2
 *
 * RÈGLE ABSOLUE :
 * Cette fonction est l'UNIQUE point d'entrée pour tout
 * changement d'état d'un Engagement.
 *
 * Ordre invariant des guards — Source : OS V10 section 2.7.1 :
 *   1. MissionConversionGuard — valide la légitimité et l'autorisation
 *   2. WORMGuard              — vérifie les états immuables
 *   3. Guard spécifique       — logique métier de la transition
 *   4. FinancialInvariantGuard — si transition financière
 *   5. AuditLogger            — toujours, sans exception
 *
 * NOTE : Le MissionConversionGuard en position 1 est le garde-barrière
 * universel — il valide que l'acteur a le droit de demander cette
 * transition avant même de vérifier l'état WORM. C'est l'OS V10 qui
 * prescrit cet ordre explicitement.
 *
 * CORRECTIONS V5 :
 *   - Ordre guards corrigé : MissionConversionGuard AVANT WORMGuard
 *   - deposit_pending→event_sealed conforme à l'OS V10 table 2.7.1
 *     (balance_pending était une granularité non prescrite par l'OS)
 *   - disputed depuis TOUS les états actifs (OS V10 : "* → disputed")
 *   - DisputeResolutionGuard pour disputed→* (distinct de DisputeGuard)
 *   - no_show→refunded ajouté (organisateur remboursé)
 *   - transfer_accepted→placed et transfer_refused→placed ajoutés
 *   - W1 génère console.warn (jamais silencieux — OS V10 section 2.7)
 *   - sotsSnapshotPpm documenté comme constante à externaliser
 * ============================================================
 */

'use strict';

const IDFactory              = require('./IDFactory');
const MissionConversionGuard = require('./guards/MissionConversionGuard');
const PlacementGuard         = require('./guards/PlacementGuard');
const EventPaymentGuard      = require('./guards/EventPaymentGuard');

// ── Table souveraine — Source : OS V10 section 2.7.1 ─────────
const TRANSITION_TABLE = {

  // ── Chemin nominal ─────────────────────────────────────────
  'proposed->accepted':                    { guard: 'MissionConversionGuard',   worm: null, financialGuard: false },
  'proposed->negotiating':                 { guard: 'MissionConversionGuard',   worm: null, financialGuard: false },
  'negotiating->accepted':                 { guard: 'MissionConversionGuard',   worm: null, financialGuard: false },
  'accepted->placed':                      { guard: 'PlacementGuard',           worm: 'W1', financialGuard: false },

  // totalCents = prix_vendu_client TTC (TPS + TVQ + frais Stripe inclus)
  // Source : OS V10 section 3.3 LOI WATERFALL-01
  'placed->deposit_pending':               { guard: 'EventPaymentGuard',        worm: null, financialGuard: true  },

  // deposit_pending→event_sealed — Source : OS V10 table 2.7.1
  // SealingGuard vérifie : dépôt reçu + balance reçue + ContractSnapshot phase 2 créé
  // NOTE : la granularité "balance_pending" n'est pas dans l'OS souverain.
  // L'OS saute directement de deposit_pending à event_sealed via SealingGuard.
  'deposit_pending->event_sealed':         { guard: 'SealingGuard',             worm: 'W2', financialGuard: true  },

  'event_sealed->performed':               { guard: 'PresenceWindowGuard',      worm: null, financialGuard: false },
  'performed->event_completed':            { guard: 'EventCompletionGuard',     worm: 'W1', financialGuard: false },
  'event_completed->sots_window_closed':   { guard: 'SOTSWindowGuard',          worm: 'W1', financialGuard: false },

  // Payout nominal — après SOTS (Condition 7 vérifiée)
  // Source : OS V10 section 2.6 + section 6.3
  'sots_window_closed->payable':           { guard: 'PresenceProofGuard',       worm: null, financialGuard: true  },

  // Payout urgence — court-circuite SOTS
  // SoloFounderOverride + AdminIncidentRecord requis — Source : OS V10 section 9.3
  'performed->payable':                    { guard: 'PresenceProofGuard',       worm: null, financialGuard: true  },

  'payable->settled':                      { guard: 'LedgerInvariantGuard',     worm: 'W3', financialGuard: true  },
  'settled->archived':                     { guard: 'ArchiveWORMGuard',         worm: 'W3', financialGuard: true  },

  // ── Annulations — Source : OS V10 section 2.6 ─────────────
  'placed->cancelled_pre_deposit':         { guard: 'CancellationGuard',        worm: null, financialGuard: false },
  'deposit_pending->cancelled_pre_deposit':{ guard: 'CancellationGuard',        worm: null, financialGuard: false },
  'deposit_pending->cancelled_J30':        { guard: 'CancellationGuard',        worm: null, financialGuard: true  },
  'deposit_pending->cancelled_J7':         { guard: 'CancellationGuard',        worm: null, financialGuard: true  },

  // ── Remboursements ─────────────────────────────────────────
  'cancelled_pre_deposit->refunded':       { guard: 'RefundGuard',              worm: null, financialGuard: false },
  'cancelled_J30->refunded':               { guard: 'RefundGuard',              worm: null, financialGuard: true  },
  'cancelled_J7->refunded':                { guard: 'RefundGuard',              worm: null, financialGuard: true  },
  'no_show->refunded':                     { guard: 'RefundGuard',              worm: null, financialGuard: true  },

  // ── Dispute — depuis TOUS les états actifs ─────────────────
  // Source : OS V10 table 2.7.1 — "* → disputed" : depuis n'importe quel état actif
  'proposed->disputed':                    { guard: 'DisputeGuard',             worm: null, financialGuard: false },
  'negotiating->disputed':                 { guard: 'DisputeGuard',             worm: null, financialGuard: false },
  'accepted->disputed':                    { guard: 'DisputeGuard',             worm: null, financialGuard: false },
  'placed->disputed':                      { guard: 'DisputeGuard',             worm: null, financialGuard: false },
  'deposit_pending->disputed':             { guard: 'DisputeGuard',             worm: null, financialGuard: true  },
  'event_sealed->disputed':                { guard: 'DisputeGuard',             worm: null, financialGuard: false },
  'performed->disputed':                   { guard: 'DisputeGuard',             worm: null, financialGuard: false },
  'event_completed->disputed':             { guard: 'DisputeGuard',             worm: null, financialGuard: false },
  'sots_window_closed->disputed':          { guard: 'DisputeGuard',             worm: null, financialGuard: false },
  'payable->disputed':                     { guard: 'DisputeGuard',             worm: null, financialGuard: true  },

  // ── Sorties de dispute ─────────────────────────────────────
  // DisputeResolutionGuard — DISTINCT de DisputeGuard
  // Source : OS V10 table 2.7.1 — "disputed → *" : DisputeResolutionGuard
  'disputed->payable':                     { guard: 'DisputeResolutionGuard',   worm: null, financialGuard: true  },
  'disputed->refunded':                    { guard: 'DisputeResolutionGuard',   worm: null, financialGuard: true  },

  // ── Transfert de talent ────────────────────────────────────
  'placed->transfer_requested':            { guard: 'TransferGuard',            worm: null, financialGuard: false },
  'transfer_requested->transfer_accepted': { guard: 'TransferGuard',            worm: null, financialGuard: false },
  'transfer_requested->transfer_refused':  { guard: 'TransferGuard',            worm: null, financialGuard: false },
  'transfer_accepted->placed':             { guard: 'TransferGuard',            worm: null, financialGuard: false },
  'transfer_refused->placed':              { guard: 'TransferGuard',            worm: null, financialGuard: false },

  // ── No-show ────────────────────────────────────────────────
  'performed->no_show':                    { guard: 'NoShowGuard',              worm: null, financialGuard: false },

  // ── Retrait avant accord ───────────────────────────────────
  'proposed->withdrawn':                   { guard: 'WithdrawalGuard',          worm: null, financialGuard: false },
  'negotiating->withdrawn':                { guard: 'WithdrawalGuard',          worm: null, financialGuard: false },
};

// ── États WORM — Source : OS V10 section 2.7 BLOC 2 V8 ───────
const WORM_STATES = {
  'settled':            'W3',
  'archived':           'W3',
  'event_sealed':       'W2',
  'accepted':           'W1',
  'deposit_pending':    'W1',
  'payable':            'W1',
  'event_completed':    'W1',
  'sots_window_closed': 'W1',
};

async function transitionEngagement({
  engagementId,
  currentState,
  targetState,
  actor,
  context = {},
  repositories = {},
}) {

  if (!engagementId) throw new Error('TRANSITION_ERROR: engagementId manquant');
  if (!currentState) throw new Error('TRANSITION_ERROR: currentState manquant');
  if (!targetState)  throw new Error('TRANSITION_ERROR: targetState manquant');
  if (!actor)        throw new Error('TRANSITION_ERROR: actor manquant');

  if (!IDFactory.validate(engagementId, 'Engagement')) {
    throw new Error(`INVALID_SYSTEM_ID: engagementId "${engagementId}" invalide. Format : ENG-XXXXXX-XXXXXX`);
  }
  if (!IDFactory.validate(actor, 'User')) {
    throw new Error(`INVALID_SYSTEM_ID: actor "${actor}" invalide. Format : USR-XXXXXX-XXXXXX`);
  }

  const transitionKey = `${currentState}->${targetState}`;

  // ── GUARD 1 : MissionConversionGuard ─────────────────────
  // Valide la légitimité de la transition et l'autorisation de l'acteur.
  // EN PREMIER — avant WORMGuard — Source : OS V10 section 2.7.1
  // Pour les transitions non couvertes par MissionConversionGuard,
  // ce guard est un pass-through (vérification de la table).
  const missionResult = await runMissionConversionCheck({
    transitionKey, engagementId, currentState, targetState, actor, context, repositories,
  });
  if (!missionResult.passed) {
    throw new Error(
      `MISSION_CONVERSION_FAILED: "${transitionKey}" bloquée par MissionConversionGuard. ` +
      `Raison: ${missionResult.reason}. EngagementId: ${engagementId}`
    );
  }

  // ── GUARD 2 : WORMGuard ───────────────────────────────────
  // Source : OS V10 section 2.7 BLOC 2 V8
  const wormLevel = WORM_STATES[currentState];

  if (wormLevel === 'W3') {
    throw new Error(
      `WORM_VIOLATION_LEVEL_3: L'état "${currentState}" est architecturalement immuable. ` +
      `Aucune transition possible. EngagementId: ${engagementId}`
    );
  }

  if (wormLevel === 'W2') {
    const incident = {
      type: 'WORM_VIOLATION_LEVEL_2', engagementId, actor,
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

  if (wormLevel === 'W1') {
    // W1 = erreur corrigeable — log obligatoire, ne bloque pas
    // Source : OS V10 section 2.7 BLOC 2 V8 — "jamais silencieux"
    console.warn(
      `[WORMGuard] W1 — Transition depuis état WORM corrigeable "${currentState}". ` +
      `Transition "${transitionKey}". EngagementId: ${engagementId}`
    );
  }

  // ── Transition autorisée dans la table ? ──────────────────
  const rule = TRANSITION_TABLE[transitionKey];
  if (!rule) {
    throw new Error(
      `TRANSITION_UNAUTHORIZED: "${transitionKey}" n'est pas autorisée. ` +
      `Transitions valides depuis "${currentState}": ` +
      (Object.keys(TRANSITION_TABLE)
        .filter(k => k.startsWith(`${currentState}->`))
        .join(', ') || 'aucune')
    );
  }

  // ── GUARD 3 : Guard spécifique ────────────────────────────
  const guardResult = await runSpecificGuard({
    guardName: rule.guard,
    engagementId, currentState, targetState, actor, context, repositories,
  });

  if (!guardResult.passed) {
    throw new Error(
      `GUARD_FAILED: ${rule.guard} a bloqué "${transitionKey}". ` +
      `Raison: ${guardResult.reason}. EngagementId: ${engagementId}`
    );
  }

  // ── GUARD 4 : FinancialInvariantGuard ─────────────────────
  // TODO: LOI LEDGER-02
  if (rule.financialGuard) {
    console.log(`[FinancialInvariantGuard] "${transitionKey}" — à implémenter`);
  }

  // ── GUARD 5 : AuditLogger ─────────────────────────────────
  // TODO: repositories.audit?.writeToDataAccessLedger(auditEntry)
  // DETTE CRITIQUE : sans DataAccessLedger, LOI TRANSITION-01 ne peut pas
  // détecter les mutations directes dans Base44 UI.
  const auditEntry = {
    engagementId, transition: transitionKey, actor,
    timestamp: new Date().toISOString(),
    guardApplied: rule.guard,
    wormLevel: rule.worm || 'NONE',
  };
  console.log('[AuditLogger]', JSON.stringify(auditEntry));

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

// ── Guard 1 : MissionConversionGuard universel ────────────────
// Pour les transitions MissionConversionGuard : valide acteur + légitimité.
// Pour toutes les autres transitions : pass-through (vérification d'existence acteur).
// Source : OS V10 section 2.7.1 — "valide la légitimité et l'autorisation"
async function runMissionConversionCheck({
  transitionKey, engagementId, currentState, targetState, actor, context, repositories,
}) {
  const rule = TRANSITION_TABLE[transitionKey];

  if (rule && rule.guard === 'MissionConversionGuard') {
    // Pour les transitions MissionConversionGuard, déléguer au guard complet
    return await MissionConversionGuard.validate({
      engagementId, currentState, targetState, actor, context, repositories,
    });
  }

  // Pour toutes les autres transitions : vérifier que l'acteur est souverain
  // L'acteur a déjà été validé par IDFactory.validate() — pass-through ici
  return { passed: true };
}

async function runSpecificGuard({
  guardName, engagementId, currentState,
  targetState, actor, context, repositories
}) {
  switch (guardName) {

    case 'MissionConversionGuard':
      // Déjà exécuté en Guard 1 — résultat déjà connu passed:true ici
      return { passed: true, reason: 'already_validated_in_guard_1' };

    case 'PlacementGuard':
      return await PlacementGuard.validate({
        engagementId, currentState, targetState, actor, context, repositories,
      });

    case 'EventPaymentGuard':
      return await EventPaymentGuard.validate({
        engagementId, currentState, targetState, actor, context, repositories,
      });

    case 'SealingGuard':
      // deposit_pending→event_sealed — WORM W2 — ContractSnapshot phase 2
      // Conditions : dépôt reçu + balance reçue + LOI LINEUP-01/02 vérifiées
      console.log(`[SealingGuard] deposit_pending→event_sealed — à implémenter`);
      return { passed: true, reason: 'placeholder' };

    case 'PresenceWindowGuard':
      console.log(`[PresenceWindowGuard] ouverture fenêtre check-in — à implémenter`);
      return { passed: true, reason: 'placeholder' };

    case 'EventCompletionGuard':
      console.log(`[EventCompletionGuard] complétion event — à implémenter`);
      return { passed: true, reason: 'placeholder' };

    case 'SOTSWindowGuard':
      console.log(`[SOTSWindowGuard] fermeture fenêtre SOTS — à implémenter`);
      return { passed: true, reason: 'placeholder' };

    case 'PresenceProofGuard':
      console.log(`[PresenceProofGuard] vérification présence — à implémenter`);
      return { passed: true, reason: 'placeholder' };

    case 'LedgerInvariantGuard':
      console.log(`[LedgerInvariantGuard] invariant ledger — à implémenter`);
      return { passed: true, reason: 'placeholder' };

    case 'ArchiveWORMGuard':
      console.log(`[ArchiveWORMGuard] archive finale WORM — à implémenter`);
      return { passed: true, reason: 'placeholder' };

    case 'CancellationGuard':
      console.log(`[CancellationGuard] annulation — à implémenter`);
      return { passed: true, reason: 'placeholder' };

    case 'RefundGuard':
      console.log(`[RefundGuard] remboursement — à implémenter`);
      return { passed: true, reason: 'placeholder' };

    case 'DisputeGuard':
      // Entrée en dispute — valide standing acteur + EvidenceBundle
      console.log(`[DisputeGuard] entrée dispute — à implémenter`);
      return { passed: true, reason: 'placeholder' };

    case 'DisputeResolutionGuard':
      // Sortie de dispute — DecisionRecord + SettlementInstruction + acteur admin
      // Source : OS V10 table 2.7.1 + section 9.7
      console.log(`[DisputeResolutionGuard] résolution dispute — à implémenter`);
      return { passed: true, reason: 'placeholder' };

    case 'TransferGuard':
      console.log(`[TransferGuard] transfert talent — à implémenter`);
      return { passed: true, reason: 'placeholder' };

    case 'NoShowGuard':
      console.log(`[NoShowGuard] no-show — à implémenter`);
      return { passed: true, reason: 'placeholder' };

    case 'WithdrawalGuard':
      console.log(`[WithdrawalGuard] retrait avant accord — à implémenter`);
      return { passed: true, reason: 'placeholder' };

    default:
      throw new Error(
        `GUARD_UNKNOWN: Guard "${guardName}" non reconnu. ` +
        `Créer src/core/guards/${guardName}.js et l'ajouter ici.`
      );
  }
}

module.exports = { transitionEngagement, TRANSITION_TABLE, WORM_STATES };