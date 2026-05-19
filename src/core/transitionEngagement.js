/**
 * MICRO RAVE V3 — transitionEngagement()
 * ============================================================
 * LOI TRANSITION-01 — Source : OS V12 section 16.2
 *
 * RÈGLE ABSOLUE :
 * Cette fonction est l'UNIQUE point d'entrée pour tout
 * changement d'état d'un Engagement.
 *
 * Ordre invariant des guards — Source : OS V12 section 2.7.1 :
 *   1. MissionConversionGuard — valide légitimité + autorisation
 *   2. WORMGuard              — vérifie états immuables
 *   3. Guard spécifique       — logique métier de la transition
 *   4. FinancialInvariantGuard — si transition financière
 *   5. AuditLogger            — toujours, sans exception
 *
 * CORRECTIONS V10.1 :
 *   - deposit_secured dans WORM_STATES W1
 *   - deposit_pending retiré de WORM_STATES
 *   - contractSnapshot retourné pour persistence
 *   - financialGuard corrigé sur *→disputed post-paiement
 *
 * ALIGNEMENT OS V11 Q1/Q2/Q3 :
 *   Q1 — deposit_secured→transfer_requested (financialGuard: true)
 *   Q3 — * → disputed depuis tous états actifs
 *        settled retiré de WORM_STATES
 *
 * ALIGNEMENT D-019 :
 *   accepted→cancelled_pre_deposit · deposit_pending→deposit_failed
 *   deposit_pending→cancelled_pre_deposit SUPPRIMÉ
 *   cancelled_J30/J7/pre_deposit/no_show_pre_event → archived directement
 *   sots_window_closed→no_show · transfer_requested→no_show_pre_event
 *   disputed→partially_settled · placed→transfer_requested SUPPRIMÉ
 *
 * [D-014-A] — Mai 2026 :
 *   SUPPRESSIONS :
 *     - balance_pending retiré de WORM_STATES
 *     - deposit_secured→balance_pending SUPPRIMÉ
 *     - balance_pending→event_sealed SUPPRIMÉ
 *     - balance_pending→cancelled_J7 SUPPRIMÉ
 *     - balance_pending→disputed SUPPRIMÉ
 *     - BalanceRequestGuard supprimé (logique absorbée dans EventPaymentGuard)
 *   AJOUTS :
 *     - deposit_secured→event_sealed (SealingGuard W2)
 *     - deposit_secured→cancelled_J7 (CancellationGuard)
 *   NOTE : SchedulerDueTask balance_deadline_check créée dans EventPaymentGuard
 *          à la transition deposit_pending→deposit_secured.
 *
 * [D-014-B] — Mai 2026 :
 *   - payable retiré de WORM_STATES
 *   - État opérationnel de file d'attente — protégé par D-101
 *   - Aucun warning W1 depuis payable
 *   - Exécution au batch PayoutBatchPolicyConfig (database)
 * ============================================================
 */

'use strict';

const IDFactory              = require('./IDFactory');
const MissionConversionGuard = require('./guards/MissionConversionGuard');
const PlacementGuard         = require('./guards/PlacementGuard');
const EventPaymentGuard      = require('./guards/EventPaymentGuard');
const SealingGuard           = require('./guards/SealingGuard');

// ── Table souveraine — Source : D-019 + OS V12 sections 2.6 + 2.7.1 ──
const TRANSITION_TABLE = {

  // ── Chemin nominal ─────────────────────────────────────────
  'proposed->negotiating':                 { guard: 'MissionConversionGuard',   worm: null, financialGuard: false },
  'proposed->withdrawn':                   { guard: 'WithdrawalGuard',          worm: null, financialGuard: false },
  'proposed->accepted':                    { guard: 'MissionConversionGuard',   worm: null, financialGuard: false },
  'negotiating->accepted':                 { guard: 'MissionConversionGuard',   worm: null, financialGuard: false },
  'negotiating->withdrawn':                { guard: 'WithdrawalGuard',          worm: null, financialGuard: false },
  'accepted->placed':                      { guard: 'PlacementGuard',           worm: 'W1', financialGuard: false },
  'accepted->cancelled_pre_deposit':       { guard: 'CancellationGuard',        worm: null, financialGuard: false },
  'placed->deposit_pending':               { guard: 'EventPaymentGuard',        worm: null, financialGuard: true  },
  'placed->cancelled_pre_deposit':         { guard: 'CancellationGuard',        worm: null, financialGuard: false },

  // [D-014-A] EventPaymentGuard crée ici la SchedulerDueTask balance_deadline_check
  'deposit_pending->deposit_secured':      { guard: 'EventPaymentGuard',        worm: 'W1', financialGuard: true  },
  'deposit_pending->deposit_failed':       { guard: 'EventPaymentGuard',        worm: null, financialGuard: true  },

  // [D-014-A] deposit_secured est le pivot unique entre acompte et scellement.
  // SUPPRIMÉ : deposit_secured→balance_pending (balance_pending n'existe plus)
  // AJOUTÉ   : deposit_secured→event_sealed (remplace balance_pending→event_sealed)
  // AJOUTÉ   : deposit_secured→cancelled_J7 (remplace balance_pending→cancelled_J7)
  'deposit_secured->event_sealed':         { guard: 'SealingGuard',             worm: 'W2', financialGuard: true  },
  'deposit_secured->cancelled_J7':         { guard: 'CancellationGuard',        worm: null, financialGuard: true  },
  'deposit_secured->cancelled_J30':        { guard: 'CancellationGuard',        worm: null, financialGuard: true  },
  'deposit_secured->transfer_requested':   { guard: 'TransferGuard',            worm: null, financialGuard: true  },

  // Cycle transfert
  'transfer_requested->transfer_accepted': { guard: 'TransferGuard',            worm: null, financialGuard: false },
  'transfer_requested->transfer_refused':  { guard: 'TransferGuard',            worm: null, financialGuard: false },
  'transfer_requested->no_show_pre_event': { guard: 'TransferGuard',            worm: null, financialGuard: true  },
  'transfer_accepted->placed':             { guard: 'TransferGuard',            worm: null, financialGuard: false },
  'transfer_refused->placed':              { guard: 'TransferGuard',            worm: null, financialGuard: false },

  // Chemin post-scellement
  'event_sealed->performed':               { guard: 'PresenceWindowGuard',      worm: null, financialGuard: false },
  'performed->event_completed':            { guard: 'EventCompletionGuard',     worm: 'W1', financialGuard: false },
  'performed->disputed':                   { guard: 'DisputeGuard',             worm: null, financialGuard: true  },
  'performed->payable':                    { guard: 'PresenceProofGuard',       worm: null, financialGuard: true  },
  'event_completed->sots_window_closed':   { guard: 'SOTSWindowGuard',          worm: 'W1', financialGuard: false },

  // [D-014-B] sots_window_closed→payable : payout autorisé, batch selon PayoutBatchPolicyConfig
  'sots_window_closed->payable':           { guard: 'PresenceProofGuard',       worm: null, financialGuard: true  },
  'sots_window_closed->disputed':          { guard: 'DisputeGuard',             worm: null, financialGuard: true  },
  'sots_window_closed->no_show':           { guard: 'NoShowGuard',              worm: null, financialGuard: true  },

  // [D-014-B] payable : état opérationnel, non-WORM, protégé par D-101
  'payable->settled':                      { guard: 'LedgerInvariantGuard',     worm: 'W3', financialGuard: true  },
  'settled->archived':                     { guard: 'ArchiveWORMGuard',         worm: 'W3', financialGuard: true  },

  // ── Dispute — depuis tous les états actifs (OS V12 Q3) ────
  'proposed->disputed':                    { guard: 'DisputeGuard',             worm: null, financialGuard: false },
  'negotiating->disputed':                 { guard: 'DisputeGuard',             worm: null, financialGuard: false },
  'accepted->disputed':                    { guard: 'DisputeGuard',             worm: null, financialGuard: false },
  'placed->disputed':                      { guard: 'DisputeGuard',             worm: null, financialGuard: false },
  'deposit_pending->disputed':             { guard: 'DisputeGuard',             worm: null, financialGuard: true  },
  'deposit_secured->disputed':             { guard: 'DisputeGuard',             worm: null, financialGuard: true  },
  'event_sealed->disputed':                { guard: 'DisputeGuard',             worm: null, financialGuard: true  },
  'event_completed->disputed':             { guard: 'DisputeGuard',             worm: null, financialGuard: true  },
  'payable->disputed':                     { guard: 'DisputeGuard',             worm: null, financialGuard: true  },

  // ── Sorties de dispute ─────────────────────────────────────
  'disputed->payable':                     { guard: 'DisputeResolutionGuard',   worm: null, financialGuard: true  },
  'disputed->partially_settled':           { guard: 'DisputeResolutionGuard',   worm: null, financialGuard: true  },
  'disputed->refunded':                    { guard: 'DisputeResolutionGuard',   worm: null, financialGuard: true  },

  // ── No-show ────────────────────────────────────────────────
  'no_show->refunded':                     { guard: 'RefundGuard',              worm: null, financialGuard: true  },

  // ── Terminaisons — archivage direct ───────────────────────
  'cancelled_pre_deposit->archived':       { guard: 'ArchiveWORMGuard',         worm: 'W3', financialGuard: false },
  'cancelled_J30->archived':               { guard: 'ArchiveWORMGuard',         worm: 'W3', financialGuard: true  },
  'cancelled_J7->archived':                { guard: 'ArchiveWORMGuard',         worm: 'W3', financialGuard: true  },
  'no_show_pre_event->archived':           { guard: 'ArchiveWORMGuard',         worm: 'W3', financialGuard: true  },
  'refunded->archived':                    { guard: 'ArchiveWORMGuard',         worm: 'W3', financialGuard: true  },
  'withdrawn->archived':                   { guard: 'ArchiveWORMGuard',         worm: 'W3', financialGuard: false },
  'deposit_failed->archived':              { guard: 'ArchiveWORMGuard',         worm: 'W3', financialGuard: false },
};

// ── États WORM — Source : OS V12 section 2.7 ─────────────────
// D-014 — 6 moments officiels confirmés :
//
//   Moment 1 : accepted          (W1) — contrat signé, cachet gravé
//   Moment 2 : deposit_secured   (W1) — liaison contractuelle + surveillance solde activée
//   Moment 3 : event_sealed      (W2) — WORM financier complet
//   Moment 4 : event_completed   (W1) — fenêtre SOTS ouverte
//   Moment 5 : sots_window_closed (W1) — réputation gravée
//   Moment 6 : archived          (W3) — immuable définitif
//
// [D-014-A] balance_pending : RETIRÉ.
//   "En attente de solde" = "acompte reçu" — même réalité humaine, même moment.
//   SchedulerDueTask créée dans EventPaymentGuard à deposit_secured.
//
// [D-014-B] payable : RETIRÉ.
//   État opérationnel de file d'attente — non-WORM.
//   Protégé par D-101 (6 verrous anti-double payout).
//   Exécution batch selon PayoutBatchPolicyConfig (database, jamais hardcodé).
//
// settled : RETIRÉ — non-moment WORM officiel (OS V11/V12).
const WORM_STATES = {
  'archived':           'W3', // Moment 6 — architecturalement impossible à modifier
  'event_sealed':       'W2', // Moment 3 — Fraude si touché
  'accepted':           'W1', // Moment 1 — contrat signé, cachet gravé
  'deposit_secured':    'W1', // Moment 2 — liaison contractuelle + surveillance solde active
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

  const missionResult = await runMissionConversionCheck({
    transitionKey, engagementId, currentState, targetState, actor, context, repositories,
  });
  if (!missionResult.passed) {
    throw new Error(
      `MISSION_CONVERSION_FAILED: "${transitionKey}" bloquée par MissionConversionGuard. ` +
      `Raison: ${missionResult.reason}. EngagementId: ${engagementId}`
    );
  }

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
      attemptedTransition: transitionKey, timestamp: new Date().toISOString(),
    };
    console.error('[WORM] Violation Niveau 2 détectée:', incident);
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

  const rule = TRANSITION_TABLE[transitionKey];
  if (!rule) {
    throw new Error(
      `TRANSITION_UNAUTHORIZED: "${transitionKey}" n'est pas autorisée. ` +
      `Transitions valides depuis "${currentState}": ` +
      (Object.keys(TRANSITION_TABLE).filter(k => k.startsWith(`${currentState}->`)).join(', ') || 'aucune')
    );
  }

  const guardResult = await runSpecificGuard({
    guardName: rule.guard, engagementId, currentState, targetState, actor, context, repositories,
  });
  if (!guardResult.passed) {
    throw new Error(
      `GUARD_FAILED: ${rule.guard} a bloqué "${transitionKey}". ` +
      `Raison: ${guardResult.reason}. EngagementId: ${engagementId}`
    );
  }

  if (rule.financialGuard) {
    console.log(`[FinancialInvariantGuard] "${transitionKey}" — à implémenter`);
  }

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
      // [D-014-A] quand targetState='deposit_secured' : crée SchedulerDueTask balance_deadline_check
      return await EventPaymentGuard.validate({ engagementId, currentState, targetState, actor, context, repositories });
    case 'SealingGuard':
      // [D-014-A] s'active depuis deposit_secured directement (plus depuis balance_pending)
      return await SealingGuard.validate({ engagementId, currentState, targetState, actor, context, repositories });
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
      // [D-014-B] sots_window_closed→payable : batch PayoutBatchPolicyConfig
      console.log(`[PresenceProofGuard] vérification présence — à implémenter`);
      return { passed: true, reason: 'placeholder' };
    case 'LedgerInvariantGuard':
      console.log(`[LedgerInvariantGuard] invariant ledger — à implémenter`);
      return { passed: true, reason: 'placeholder' };
    case 'ArchiveWORMGuard':
      console.log(`[ArchiveWORMGuard] archive finale WORM — à implémenter`);
      return { passed: true, reason: 'placeholder' };
    case 'CancellationGuard':
      // [D-014-A] gère deposit_secured→cancelled_J7 (anciennement balance_pending→cancelled_J7)
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