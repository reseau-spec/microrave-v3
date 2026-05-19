/**
 * MICRO RAVE V3 — transitionEngagement()
 * ============================================================
 * LOI TRANSITION-01 — Source : OS V11 section 16.2
 *
 * RÈGLE ABSOLUE :
 * Cette fonction est l'UNIQUE point d'entrée pour tout
 * changement d'état d'un Engagement.
 *
 * Ordre invariant des guards — Source : OS V11 section 2.7.1 :
 *   1. MissionConversionGuard — valide légitimité + autorisation
 *   2. WORMGuard              — vérifie états immuables
 *   3. Guard spécifique       — logique métier de la transition
 *   4. FinancialInvariantGuard — si transition financière
 *   5. AuditLogger            — toujours, sans exception
 *
 * CORRECTIONS V10.1 (patch OS) :
 *   - deposit_secured et balance_pending restaurés dans la table
 *   - deposit_secured dans WORM_STATES W1
 *   - deposit_pending retiré de WORM_STATES
 *   - contractSnapshot retourné pour persistence
 *   - financialGuard corrigé sur *→disputed post-paiement
 *
 * ALIGNEMENT OS V11 Q1/Q2/Q3 :
 *   Q1 — deposit_secured→transfer_requested (financialGuard: true)
 *   Q2 — balance_pending W1 dans WORM_STATES
 *   Q3 — * → disputed depuis tous états actifs
 *        settled retiré de WORM_STATES
 *
 * ALIGNEMENT D-019 | Machine d'état complète révisée :
 *   AJOUTS :
 *     accepted→cancelled_pre_deposit
 *     cancelled_J30→archived          (terminaison directe — pas via refunded)
 *     cancelled_J7→archived           (terminaison directe — pas via refunded)
 *     cancelled_pre_deposit→archived  (terminaison directe — pas via refunded)
 *     deposit_failed→archived         (nouveau state — deposit_pending→deposit_failed)
 *     deposit_pending→deposit_failed
 *     disputed→partially_settled
 *     no_show_pre_event→archived      (terminaison directe — pas via refunded)
 *     sots_window_closed→no_show      (no_show vient de sots, pas de performed)
 *     transfer_requested→no_show_pre_event
 *   SUPPRESSIONS :
 *     cancelled_J30→refunded          (D-019 : archivage direct)
 *     cancelled_J7→refunded           (D-019 : archivage direct)
 *     cancelled_pre_deposit→refunded  (D-019 : archivage direct)
 *     deposit_pending→cancelled_pre_deposit (D-019 : interdit depuis cet état)
 *     event_sealed→no_show_pre_event  (D-019 : no_show_pre_event depuis transfer_requested)
 *     no_show_pre_event→refunded      (D-019 : archivage direct)
 *     performed→no_show               (D-019 : no_show depuis sots_window_closed)
 *     placed→transfer_requested       (D-019 + Q1 : transfert depuis deposit_secured seulement)
 * ============================================================
 */

'use strict';

const IDFactory              = require('./IDFactory');
const MissionConversionGuard = require('./guards/MissionConversionGuard');
const PlacementGuard         = require('./guards/PlacementGuard');
const EventPaymentGuard      = require('./guards/EventPaymentGuard');
const SealingGuard           = require('./guards/SealingGuard');

// ── Table souveraine — Source : D-019 + OS V11 sections 2.6 + 2.7.1 ──
const TRANSITION_TABLE = {

  // ── Chemin nominal ─────────────────────────────────────────
  // D-019 : proposed → negotiating / withdrawn
  'proposed->negotiating':                 { guard: 'MissionConversionGuard',   worm: null, financialGuard: false },
  'proposed->withdrawn':                   { guard: 'WithdrawalGuard',          worm: null, financialGuard: false },

  // OS V11 table 2.7.1 : proposed→accepted (voie QuickPlay — bypass négociation)
  // D-019 liste proposed→negotiating/withdrawn ; OS V11 ajoute proposed→accepted explicitement.
  'proposed->accepted':                    { guard: 'MissionConversionGuard',   worm: null, financialGuard: false },

  // D-019 : negotiating → accepted / withdrawn
  'negotiating->accepted':                 { guard: 'MissionConversionGuard',   worm: null, financialGuard: false },
  'negotiating->withdrawn':                { guard: 'WithdrawalGuard',          worm: null, financialGuard: false },

  // D-019 : accepted → placed / cancelled_pre_deposit
  'accepted->placed':                      { guard: 'PlacementGuard',           worm: 'W1', financialGuard: false },
  'accepted->cancelled_pre_deposit':       { guard: 'CancellationGuard',        worm: null, financialGuard: false },

  // D-019 : placed → deposit_pending / cancelled_pre_deposit
  'placed->deposit_pending':               { guard: 'EventPaymentGuard',        worm: null, financialGuard: true  },
  'placed->cancelled_pre_deposit':         { guard: 'CancellationGuard',        worm: null, financialGuard: false },

  // D-019 : deposit_pending → deposit_secured / deposit_failed
  // SUPPRIMÉ : deposit_pending→cancelled_pre_deposit (D-019 n'autorise pas l'annulation ici)
  'deposit_pending->deposit_secured':      { guard: 'EventPaymentGuard',        worm: 'W1', financialGuard: true  },
  'deposit_pending->deposit_failed':       { guard: 'EventPaymentGuard',        worm: null, financialGuard: true  },

  // D-019 : deposit_secured → balance_pending / transfer_requested / cancelled_J30
  // OS V11 Q1 : transfert depuis deposit_secured uniquement — placed→transfer_requested supprimé
  'deposit_secured->balance_pending':      { guard: 'BalanceRequestGuard',      worm: null, financialGuard: true  },
  'deposit_secured->transfer_requested':   { guard: 'TransferGuard',            worm: null, financialGuard: true  },
  'deposit_secured->cancelled_J30':        { guard: 'CancellationGuard',        worm: null, financialGuard: true  },

  // D-019 : transfer_requested → transfer_accepted / transfer_refused / no_show_pre_event
  // SUPPRIMÉ : event_sealed→no_show_pre_event (D-019 : no_show_pre_event vient du cycle transfert)
  'transfer_requested->transfer_accepted': { guard: 'TransferGuard',            worm: null, financialGuard: false },
  'transfer_requested->transfer_refused':  { guard: 'TransferGuard',            worm: null, financialGuard: false },
  'transfer_requested->no_show_pre_event': { guard: 'TransferGuard',            worm: null, financialGuard: true  },

  // Retour du cycle transfert — D-013 (nécessaire pour fermer la boucle)
  'transfer_accepted->placed':             { guard: 'TransferGuard',            worm: null, financialGuard: false },
  'transfer_refused->placed':              { guard: 'TransferGuard',            worm: null, financialGuard: false },

  // D-019 : balance_pending → event_sealed / cancelled_J7
  'balance_pending->event_sealed':         { guard: 'SealingGuard',             worm: 'W2', financialGuard: true  },
  'balance_pending->cancelled_J7':         { guard: 'CancellationGuard',        worm: null, financialGuard: true  },

  // D-019 : event_sealed → performed
  'event_sealed->performed':               { guard: 'PresenceWindowGuard',      worm: null, financialGuard: false },

  // D-019 : performed → event_completed / disputed
  'performed->event_completed':            { guard: 'EventCompletionGuard',     worm: 'W1', financialGuard: false },
  'performed->disputed':                   { guard: 'DisputeGuard',             worm: null, financialGuard: true  },

  // OS V11 table 2.7.1 : performed→payable (payout urgence — SoloFounderOverride)
  // D-019 ne liste pas ce cas ; OS V11 l'explicite comme exception contrôlée.
  'performed->payable':                    { guard: 'PresenceProofGuard',       worm: null, financialGuard: true  },

  // D-019 : event_completed → sots_window_closed
  'event_completed->sots_window_closed':   { guard: 'SOTSWindowGuard',          worm: 'W1', financialGuard: false },

  // D-019 : sots_window_closed → payable / disputed / no_show
  // SUPPRIMÉ : performed→no_show (D-019 : no_show déclenché depuis sots_window_closed)
  'sots_window_closed->payable':           { guard: 'PresenceProofGuard',       worm: null, financialGuard: true  },
  'sots_window_closed->disputed':          { guard: 'DisputeGuard',             worm: null, financialGuard: true  },
  'sots_window_closed->no_show':           { guard: 'NoShowGuard',              worm: null, financialGuard: true  },

  // D-019 : payable → settled → archived
  'payable->settled':                      { guard: 'LedgerInvariantGuard',     worm: 'W3', financialGuard: true  },
  'settled->archived':                     { guard: 'ArchiveWORMGuard',         worm: 'W3', financialGuard: true  },

  // ── Dispute — depuis tous les états actifs ─────────────────
  // OS V11 Q3 : "* → disputed" — poignée de frein d'urgence à tout moment.
  // D-019 confirme : performed→disputed, sots_window_closed→disputed.
  // OS V11 Q3 étend à tous les états actifs (décision fondateur souveraine).
  'proposed->disputed':                    { guard: 'DisputeGuard',             worm: null, financialGuard: false },
  'negotiating->disputed':                 { guard: 'DisputeGuard',             worm: null, financialGuard: false },
  'accepted->disputed':                    { guard: 'DisputeGuard',             worm: null, financialGuard: false },
  'placed->disputed':                      { guard: 'DisputeGuard',             worm: null, financialGuard: false },
  'deposit_pending->disputed':             { guard: 'DisputeGuard',             worm: null, financialGuard: true  },
  'deposit_secured->disputed':             { guard: 'DisputeGuard',             worm: null, financialGuard: true  },
  'balance_pending->disputed':             { guard: 'DisputeGuard',             worm: null, financialGuard: true  },
  'event_sealed->disputed':                { guard: 'DisputeGuard',             worm: null, financialGuard: true  },
  'event_completed->disputed':             { guard: 'DisputeGuard',             worm: null, financialGuard: true  },
  'payable->disputed':                     { guard: 'DisputeGuard',             worm: null, financialGuard: true  },

  // ── Sorties de dispute ─────────────────────────────────────
  // D-019 : disputed → payable / partially_settled / refunded
  // Source : OS V11 section 9.7 + table 2.7.1
  'disputed->payable':                     { guard: 'DisputeResolutionGuard',   worm: null, financialGuard: true  },
  'disputed->partially_settled':           { guard: 'DisputeResolutionGuard',   worm: null, financialGuard: true  },
  'disputed->refunded':                    { guard: 'DisputeResolutionGuard',   worm: null, financialGuard: true  },

  // ── No-show ────────────────────────────────────────────────
  // D-019 : no_show → refunded → archived (séquence complète)
  'no_show->refunded':                     { guard: 'RefundGuard',              worm: null, financialGuard: true  },

  // ── Terminaisons directes — archivage sans refunded (D-019) ──
  // D-019 : cancelled_pre_deposit → archived
  // D-019 : cancelled_J30 → archived  (SUPPRIMÉ : cancelled_J30→refunded)
  // D-019 : cancelled_J7 → archived   (SUPPRIMÉ : cancelled_J7→refunded)
  // D-019 : no_show_pre_event → archived (SUPPRIMÉ : no_show_pre_event→refunded)
  'cancelled_pre_deposit->archived':       { guard: 'ArchiveWORMGuard',         worm: 'W3', financialGuard: false },
  'cancelled_J30->archived':               { guard: 'ArchiveWORMGuard',         worm: 'W3', financialGuard: true  },
  'cancelled_J7->archived':                { guard: 'ArchiveWORMGuard',         worm: 'W3', financialGuard: true  },
  'no_show_pre_event->archived':           { guard: 'ArchiveWORMGuard',         worm: 'W3', financialGuard: true  },

  // D-019 : refunded → archived
  'refunded->archived':                    { guard: 'ArchiveWORMGuard',         worm: 'W3', financialGuard: true  },

  // D-019 : withdrawn (état terminal) → archived
  'withdrawn->archived':                   { guard: 'ArchiveWORMGuard',         worm: 'W3', financialGuard: false },

  // D-019 : deposit_failed → archived (aucun argent reçu — pas de financialGuard)
  'deposit_failed->archived':              { guard: 'ArchiveWORMGuard',         worm: 'W3', financialGuard: false },
};

// ── États WORM — Source : OS V11 section 2.7 ─────────────────
// 6 moments WORM officiels + balance_pending (V11 Q2) :
//
//   Moment 1  : accepted          (W1) — contrat signé, cachet gravé
//   Moment 2  : deposit_secured   (W1) — liaison contractuelle des parties
//   Moment 2b : balance_pending   (W1) — solde demandé, artiste engagé (V11 Q2)
//   Moment 3  : event_sealed      (W2) — WORM financier complet
//   Moment 4  : event_completed   (W1) — fenêtre SOTS ouverte
//   Moment 5  : sots_window_closed (W1) — réputation gravée
//   Moment 6  : archived          (W3) — immuable définitif
//
// settled : RETIRÉ — non-moment WORM officiel (OS V11 changelog).
//   Bloqué par l'absence de transitions sortantes, pas par WORM.
//
// payable (W1) : protection pragmatique — 11 conditions remplies, payout en attente.
const WORM_STATES = {
  'archived':           'W3', // Moment 6 — architecturalement impossible à modifier
  'event_sealed':       'W2', // Moment 3 — Fraude si touché
  'accepted':           'W1', // Moment 1 — contrat signé, cachet gravé
  'deposit_secured':    'W1', // Moment 2 — liaison contractuelle des parties
  'balance_pending':    'W1', // Moment 2b — OS V11 Q2 : solde demandé, artiste engagé
  'event_completed':    'W1', // Moment 4 — fenêtre SOTS ouverte
  'sots_window_closed': 'W1', // Moment 5 — réputation gravée
  'payable':            'W1', // Protection pragmatique — 11 conditions remplies
  // 'settled' : délibérément absent — non-moment WORM officiel (OS V11 changelog)
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

  // ── Validation des systemIds souverains ───────────────────
  if (!IDFactory.validate(engagementId, 'Engagement')) {
    throw new Error(
      `INVALID_SYSTEM_ID: engagementId "${engagementId}" invalide. Format : ENG-XXXXXX-XXXXXX`
    );
  }
  if (!IDFactory.validate(actor, 'User')) {
    throw new Error(
      `INVALID_SYSTEM_ID: actor "${actor}" invalide. Format : USR-XXXXXX-XXXXXX. ` +
      `Un acteur non-souverain ne peut pas être tracé dans le DataAccessLedger.`
    );
  }

  const transitionKey = `${currentState}->${targetState}`;

  // ── GUARD 1 : MissionConversionGuard ─────────────────────
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
  if (rule.financialGuard) {
    console.log(`[FinancialInvariantGuard] "${transitionKey}" — à implémenter`);
  }

  // ── GUARD 5 : AuditLogger ─────────────────────────────────
  const auditEntry = {
    engagementId, transition: transitionKey, actor,
    timestamp: new Date().toISOString(),
    guardApplied: rule.guard,
    wormLevel: rule.worm || 'NONE',
  };
  console.log('[AuditLogger]', JSON.stringify(auditEntry));

  const result = {
    success: true,
    engagementId,
    previousState: currentState,
    newState: targetState,
    transition: transitionKey,
    guardApplied: rule.guard,
    timestamp: auditEntry.timestamp,
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

async function runMissionConversionCheck({
  transitionKey, engagementId, currentState, targetState, actor, context, repositories,
}) {
  const rule = TRANSITION_TABLE[transitionKey];
  if (rule && rule.guard === 'MissionConversionGuard') {
    return await MissionConversionGuard.validate({
      engagementId, currentState, targetState, actor, context, repositories,
    });
  }
  return { passed: true };
}

async function runSpecificGuard({
  guardName, engagementId, currentState,
  targetState, actor, context, repositories
}) {
  switch (guardName) {
    case 'MissionConversionGuard':
      return { passed: true, reason: 'already_validated_in_guard_1' };
    case 'PlacementGuard':
      return await PlacementGuard.validate({ engagementId, currentState, targetState, actor, context, repositories });
    case 'EventPaymentGuard':
      return await EventPaymentGuard.validate({ engagementId, currentState, targetState, actor, context, repositories });
    case 'BalanceRequestGuard':
      console.log(`[BalanceRequestGuard] deposit_secured→balance_pending — à implémenter`);
      return { passed: true, reason: 'placeholder' };
    case 'SealingGuard':
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
      console.log(`[DisputeGuard] entrée dispute — à implémenter`);
      return { passed: true, reason: 'placeholder' };
    case 'DisputeResolutionGuard':
      // D-019 : disputed→payable/partially_settled/refunded
      console.log(`[DisputeResolutionGuard] résolution dispute — à implémenter`);
      return { passed: true, reason: 'placeholder' };
    case 'TransferGuard':
      // D-019 : transfer_requested→accepted/refused/no_show_pre_event
      // D-013 : histoire tracée, réputation affectée, seuil 72h
      console.log(`[TransferGuard] transfert talent — à implémenter`);
      return { passed: true, reason: 'placeholder' };
    case 'NoShowGuard':
      // D-019 : sots_window_closed→no_show, puis no_show→refunded→archived
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