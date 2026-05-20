/**
 * MICRO RAVE V3 — transitionEngagement()
 * ============================================================
 * LOI TRANSITION-01 — Source : OS V13 section 16.2
 *
 * RÈGLE ABSOLUE :
 * Cette fonction est l'UNIQUE point d'entrée pour tout
 * changement d'état d'un Engagement.
 *
 * Ordre invariant des guards — Source : OS V13 section 2.7.1 :
 *   1. MissionConversionGuard — valide légitimité + autorisation
 *   2. WORMGuard              — vérifie états immuables
 *   3. Guard spécifique       — logique métier de la transition
 *   4. FinancialInvariantGuard — si transition financière
 *   5. AuditLogger            — toujours, sans exception
 *
 * [D-014-A] V12 — balance_pending retiré de WORM_STATES et machine d'état
 *   deposit_secured→event_sealed · deposit_secured→cancelled_J7
 *   SchedulerDueTask balance_deadline_check dans EventPaymentGuard
 *
 * [D-014-B] V12 — payable retiré de WORM_STATES
 *   État opérationnel de file d'attente · protégé par D-101
 *
 * [D-019-A] V13 — Machine d'état V4 complète :
 *   accepted→cancelled_pre_deposit · deposit_pending→deposit_failed
 *   transfer_accepted→placed · transfer_refused→placed
 *   transfer_requested→no_show_pre_event · disputed→partially_settled
 *   performed→payable (SoloFounderOverride uniquement)
 *   cancelled_J30/J7/pre_deposit/no_show_pre_event/partially_settled → archived
 *
 * [D-019-B] V13 — Séparation Frein d'Urgence / Contestation de Prestation :
 *   AJOUT    : sots_window_closed→contestation_window (ContestationWindowGuard)
 *   AJOUT    : contestation_window→payable (PresenceProofGuard — expiration)
 *   AJOUT    : contestation_window→disputed (DisputeGuard — Régime 2)
 *   SUPPRIMÉ : sots_window_closed→payable (chemin via contestation_window)
 *   SUPPRIMÉ : sots_window_closed→disputed (Régime 2 = contestation_window)
 *
 * [D-019-B] Frein d'Urgence (Régime 1) — UNIQUEMENT depuis :
 *   proposed, negotiating, accepted, placed, deposit_pending,
 *   deposit_secured, event_sealed, performed
 *   + payable (Frein d'Urgence post-contestation)
 *   NE SONT PAS dans le Frein d'Urgence :
 *   event_completed, sots_window_closed, contestation_window
 *
 * [D-019-B] D-045 §fenêtre abrogé. Fenêtre contestation : 24h après
 *   sots_window_closed (DisputeAccessPolicyConfig.contestationWindowDurationHours)
 *
 * [SC-NO-SHOW-PRE] no_show_pre_event→archived : reversal complet, MR=0$
 * [SC-DEPOSIT-FAIL] deposit_failed→archived : zéro écriture ledger
 * [SC-08-PARTIEL] disputed→partially_settled : deliveryRecognizedRatio
 * ============================================================
 */

'use strict';

const IDFactory              = require('./IDFactory');
const MissionConversionGuard = require('./guards/MissionConversionGuard');
const PlacementGuard         = require('./guards/PlacementGuard');
const EventPaymentGuard      = require('./guards/EventPaymentGuard');
const SealingGuard           = require('./guards/SealingGuard');

// ── Table souveraine — Source : D-019-A + OS V13 section 2.7.1 ──
const TRANSITION_TABLE = {

  // ── Chemin nominal ──────────────────────────────────────────
  'proposed->negotiating':                   { guard: 'MissionConversionGuard',   worm: null, financialGuard: false },
  'proposed->withdrawn':                     { guard: 'WithdrawalGuard',          worm: null, financialGuard: false },
  // QuickPlay — bypass négociation (OS V13 section 2.7.1)
  'proposed->accepted':                      { guard: 'MissionConversionGuard',   worm: null, financialGuard: false },
  'negotiating->accepted':                   { guard: 'MissionConversionGuard',   worm: null, financialGuard: false },
  'negotiating->withdrawn':                  { guard: 'WithdrawalGuard',          worm: null, financialGuard: false },
  'accepted->placed':                        { guard: 'PlacementGuard',           worm: 'W1', financialGuard: false },
  // [D-019-A] accepted→cancelled_pre_deposit
  'accepted->cancelled_pre_deposit':         { guard: 'CancellationGuard',        worm: null, financialGuard: false },
  'placed->deposit_pending':                 { guard: 'EventPaymentGuard',        worm: null, financialGuard: true  },
  'placed->cancelled_pre_deposit':           { guard: 'CancellationGuard',        worm: null, financialGuard: false },

  // [D-014-A] EventPaymentGuard crée la SchedulerDueTask balance_deadline_check
  // [SC-DEPOSIT-FAIL] deposit_failed → zéro écriture ledger
  'deposit_pending->deposit_secured':        { guard: 'EventPaymentGuard',        worm: 'W1', financialGuard: true  },
  'deposit_pending->deposit_failed':         { guard: 'EventPaymentGuard',        worm: null, financialGuard: true  },

  // [D-014-A] deposit_secured = pivot unique acompte→scellement
  'deposit_secured->event_sealed':           { guard: 'SealingGuard',             worm: 'W2', financialGuard: true  },
  'deposit_secured->cancelled_J7':           { guard: 'CancellationGuard',        worm: null, financialGuard: true  },
  'deposit_secured->cancelled_J30':          { guard: 'CancellationGuard',        worm: null, financialGuard: true  },
  // Q1 V11 : transfert depuis deposit_secured uniquement
  'deposit_secured->transfer_requested':     { guard: 'TransferGuard',            worm: null, financialGuard: true  },

  // [D-019-A] Cycle transfert complet — D-013
  'transfer_requested->transfer_accepted':   { guard: 'TransferGuard',            worm: null, financialGuard: false },
  'transfer_requested->transfer_refused':    { guard: 'TransferGuard',            worm: null, financialGuard: false },
  'transfer_requested->no_show_pre_event':   { guard: 'TransferGuard',            worm: null, financialGuard: true  },
  'transfer_accepted->placed':               { guard: 'TransferGuard',            worm: null, financialGuard: false },
  'transfer_refused->placed':                { guard: 'TransferGuard',            worm: null, financialGuard: false },

  // Chemin post-scellement
  'event_sealed->performed':                 { guard: 'PresenceWindowGuard',      worm: null, financialGuard: false },
  'performed->event_completed':              { guard: 'EventCompletionGuard',     worm: 'W1', financialGuard: false },
  // [D-019-A] SoloFounderOverride uniquement — D-106
  'performed->payable':                      { guard: 'PresenceProofGuard',       worm: null, financialGuard: true  },
  'event_completed->sots_window_closed':     { guard: 'SOTSWindowGuard',          worm: 'W1', financialGuard: false },

  // [D-019-B] Chemin post-SOTS via contestation_window
  // SUPPRIMÉ : sots_window_closed→payable (remplacé par contestation_window)
  // SUPPRIMÉ : sots_window_closed→disputed (Régime 2 = depuis contestation_window)
  'sots_window_closed->contestation_window': { guard: 'ContestationWindowGuard',  worm: null, financialGuard: false },
  'sots_window_closed->no_show':             { guard: 'NoShowGuard',              worm: null, financialGuard: true  },

  // [D-019-B] Régime 2 — Contestation de Prestation (depuis contestation_window SEULEMENT)
  'contestation_window->payable':            { guard: 'PresenceProofGuard',       worm: null, financialGuard: true  },
  'contestation_window->disputed':           { guard: 'DisputeGuard',             worm: null, financialGuard: true  },

  // [D-014-B] payable : état opérationnel, non-WORM, protégé par D-101
  'payable->settled':                        { guard: 'LedgerInvariantGuard',     worm: 'W3', financialGuard: true  },
  'settled->archived':                       { guard: 'ArchiveWORMGuard',         worm: 'W3', financialGuard: true  },

  // ── Frein d'Urgence — Régime 1 (D-019-B) ───────────────────
  // Depuis : proposed, negotiating, accepted, placed, deposit_pending,
  //          deposit_secured, event_sealed, performed
  // + payable (Frein d'Urgence post-contestation)
  // PAS depuis : event_completed, sots_window_closed, contestation_window
  'proposed->disputed':                      { guard: 'DisputeGuard',             worm: null, financialGuard: false },
  'negotiating->disputed':                   { guard: 'DisputeGuard',             worm: null, financialGuard: false },
  'accepted->disputed':                      { guard: 'DisputeGuard',             worm: null, financialGuard: false },
  'placed->disputed':                        { guard: 'DisputeGuard',             worm: null, financialGuard: false },
  'deposit_pending->disputed':               { guard: 'DisputeGuard',             worm: null, financialGuard: true  },
  'deposit_secured->disputed':               { guard: 'DisputeGuard',             worm: null, financialGuard: true  },
  'event_sealed->disputed':                  { guard: 'DisputeGuard',             worm: null, financialGuard: true  },
  'performed->disputed':                     { guard: 'DisputeGuard',             worm: null, financialGuard: true  },
  'payable->disputed':                       { guard: 'DisputeGuard',             worm: null, financialGuard: true  },

  // ── Sorties de dispute ──────────────────────────────────────
  // [SC-08-PARTIEL] partially_settled avec deliveryRecognizedRatio
  'disputed->payable':                       { guard: 'DisputeResolutionGuard',   worm: null, financialGuard: true  },
  'disputed->partially_settled':             { guard: 'DisputeResolutionGuard',   worm: null, financialGuard: true  },
  'disputed->refunded':                      { guard: 'DisputeResolutionGuard',   worm: null, financialGuard: true  },

  // ── No-show ─────────────────────────────────────────────────
  'no_show->refunded':                       { guard: 'RefundGuard',              worm: null, financialGuard: true  },

  // ── Terminaisons — archivage direct (D-019-A) ───────────────
  // [SC-NO-SHOW-PRE] reversal complet depuis deposit_secured
  'no_show_pre_event->archived':             { guard: 'ArchiveWORMGuard',         worm: 'W3', financialGuard: true  },
  // [SC-DEPOSIT-FAIL] zéro écriture ledger — aucun fonds capturé
  'deposit_failed->archived':                { guard: 'ArchiveWORMGuard',         worm: 'W3', financialGuard: false },
  'cancelled_pre_deposit->archived':         { guard: 'ArchiveWORMGuard',         worm: 'W3', financialGuard: false },
  'cancelled_J30->archived':                 { guard: 'ArchiveWORMGuard',         worm: 'W3', financialGuard: true  },
  'cancelled_J7->archived':                  { guard: 'ArchiveWORMGuard',         worm: 'W3', financialGuard: true  },
  'refunded->archived':                      { guard: 'ArchiveWORMGuard',         worm: 'W3', financialGuard: true  },
  'withdrawn->archived':                     { guard: 'ArchiveWORMGuard',         worm: 'W3', financialGuard: false },
  // [SC-08-PARTIEL]
  'partially_settled->archived':             { guard: 'ArchiveWORMGuard',         worm: 'W3', financialGuard: true  },
};

// ── États WORM — Source : OS V13 section 2.7 ─────────────────
// D-014 — 6 moments officiels :
//
//   Moment 1 : accepted           (W1) — contrat signé, cachet gravé
//   Moment 2 : deposit_secured    (W1) — liaison contractuelle + surveillance solde
//   Moment 3 : event_sealed       (W2) — WORM financier complet
//   Moment 4 : event_completed    (W1) — fenêtre SOTS ouverte
//   Moment 5 : sots_window_closed (W1) — réputation gravée
//   Moment 6 : archived           (W3) — immuable définitif
//
// [D-014-A] balance_pending : RETIRÉ — fusionné dans deposit_secured.
// [D-014-B] payable : RETIRÉ — état opérationnel, protégé par D-101.
// contestation_window : non-WORM — état temporaire configurable.
// settled : RETIRÉ — non-moment WORM officiel.
const WORM_STATES = {
  'archived':           'W3', // Moment 6 — architecturalement impossible
  'event_sealed':       'W2', // Moment 3 — Fraude si touché
  'accepted':           'W1', // Moment 1 — contrat signé, cachet gravé
  'deposit_secured':    'W1', // Moment 2 — liaison contractuelle + surveillance solde
  'event_completed':    'W1', // Moment 4 — fenêtre SOTS ouverte
  'sots_window_closed': 'W1', // Moment 5 — réputation gravée
};

async function transitionEngagement({
  engagementId, currentState, targetState, actor, context = {}, repositories = {},
}) {
  if (!engagementId) throw new Error('TRANSITION_ERROR: engagementId manquant');
  if (!currentState) throw new Error('TRANSITION_ERROR: currentState manquant');
  if (!targetState)  throw new Error('TRANSITION_ERROR: targetState manquant');
  if (!actor)        throw new Error('TRANSITION_ERROR: actor manquant');

  if (!IDFactory.validate(engagementId, 'Engagement')) {
    throw new Error(`INVALID_SYSTEM_ID: engagementId "${engagementId}" invalide. Format : ENG-XXXXXX-XXXXXX`);
  }
  if (!IDFactory.validate(actor, 'User')) {
    throw new Error(`INVALID_SYSTEM_ID: actor "${actor}" invalide. Format : USR-XXXXXX-XXXXXX.`);
  }

  const transitionKey = `${currentState}->${targetState}`;

  // ── GUARD 1 : MissionConversionGuard ─────────────────────
  const missionResult = await runMissionConversionCheck({
    transitionKey, engagementId, currentState, targetState, actor, context, repositories,
  });
  if (!missionResult.passed) {
    throw new Error(
      `MISSION_CONVERSION_FAILED: "${transitionKey}" bloquée. ` +
      `Raison: ${missionResult.reason}. EngagementId: ${engagementId}`
    );
  }

  // ── GUARD 2 : WORMGuard ───────────────────────────────────
  const wormLevel = WORM_STATES[currentState];

  if (wormLevel === 'W3') {
    throw new Error(
      `WORM_VIOLATION_LEVEL_3: L'état "${currentState}" est architecturalement immuable. ` +
      `Aucune transition possible. EngagementId: ${engagementId}`
    );
  }
  if (wormLevel === 'W2') {
    console.error('[WORM] Violation Niveau 2:', {
      type: 'WORM_VIOLATION_LEVEL_2', engagementId, actor,
      attemptedTransition: transitionKey, timestamp: new Date().toISOString(),
    });
    throw new Error(
      `WORM_VIOLATION_LEVEL_2: Tentative de modification de l'état scellé "${currentState}". ` +
      `AdminIncidentRecord P0 créé. EngagementId: ${engagementId}`
    );
  }
  if (wormLevel === 'W1') {
    console.warn(
      `[WORMGuard] W1 — Transition depuis état WORM corrigeable "${currentState}". ` +
      `Transition "${transitionKey}". EngagementId: ${engagementId}`
    );
  }

  // ── Transition autorisée ? ────────────────────────────────
  const rule = TRANSITION_TABLE[transitionKey];
  if (!rule) {
    throw new Error(
      `TRANSITION_UNAUTHORIZED: "${transitionKey}" n'est pas autorisée. ` +
      `Transitions valides depuis "${currentState}": ` +
      (Object.keys(TRANSITION_TABLE).filter(k => k.startsWith(`${currentState}->`)).join(', ') || 'aucune')
    );
  }

  // ── GUARD 3 : Guard spécifique ────────────────────────────
  const guardResult = await runSpecificGuard({
    guardName: rule.guard, engagementId, currentState, targetState, actor, context, repositories,
  });
  if (!guardResult.passed) {
    throw new Error(
      `GUARD_FAILED: ${rule.guard} a bloqué "${transitionKey}". ` +
      `Raison: ${guardResult.reason}. EngagementId: ${engagementId}`
    );
  }

  // ── GUARD 4 : FinancialInvariantGuard ─────────────────────
  if (rule.financialGuard) {
    console.log(`[FinancialInvariantGuard] "${transitionKey}" — à implémenter`);
  }

  // ── GUARD 5 : AuditLogger ─────────────────────────────────
  const auditEntry = {
    engagementId, transition: transitionKey, actor,
    timestamp: new Date().toISOString(), guardApplied: rule.guard, wormLevel: rule.worm || 'NONE',
  };
  console.log('[AuditLogger]', JSON.stringify(auditEntry));

  const result = {
    success: true, engagementId, previousState: currentState, newState: targetState,
    transition: transitionKey, guardApplied: rule.guard, timestamp: auditEntry.timestamp,
  };

  if (missionResult.contractSnapshot) result.contractSnapshot = missionResult.contractSnapshot;
  if (guardResult.contractSnapshot)   result.contractSnapshot = guardResult.contractSnapshot;
  if (guardResult.isSelfOrganized !== undefined) result.isSelfOrganized = guardResult.isSelfOrganized;
  if (guardResult.depositCents !== undefined) {
    result.depositCents    = guardResult.depositCents;
    result.balanceDueCents = guardResult.balanceDueCents;
  }

  return result;
}

async function runMissionConversionCheck({ transitionKey, engagementId, currentState, targetState, actor, context, repositories }) {
  const rule = TRANSITION_TABLE[transitionKey];
  if (rule && rule.guard === 'MissionConversionGuard') {
    return await MissionConversionGuard.validate({ engagementId, currentState, targetState, actor, context, repositories });
  }
  return { passed: true };
}

async function runSpecificGuard({ guardName, engagementId, currentState, targetState, actor, context, repositories }) {
  switch (guardName) {
    case 'MissionConversionGuard':
      return { passed: true, reason: 'already_validated_in_guard_1' };

    case 'PlacementGuard':
      return await PlacementGuard.validate({ engagementId, currentState, targetState, actor, context, repositories });

    case 'EventPaymentGuard':
      return await EventPaymentGuard.validate({ engagementId, currentState, targetState, actor, context, repositories });

    case 'SealingGuard':
      return await SealingGuard.validate({ engagementId, currentState, targetState, actor, context, repositories });

    case 'ContestationWindowGuard':
      // [D-019-B] Ouvre la fenêtre de Contestation de Prestation (Régime 2)
      // Durée : DisputeAccessPolicyConfig.contestationWindowDurationHours (recommandé : 24h)
      console.log(`[ContestationWindowGuard] ouverture fenêtre contestation — à implémenter`);
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
      console.log(`[PresenceProofGuard] vérification présence / expiration contestation — à implémenter`);
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
      console.log(`[DisputeGuard] entrée dispute — à implémenter`);
      return { passed: true, reason: 'placeholder' };

    case 'DisputeResolutionGuard':
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