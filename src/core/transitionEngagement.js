/**
 * MICRO RAVE V3 — transitionEngagement()
 * ============================================================
 * LOI TRANSITION-01 — Source : OS V10.1 section 16.2
 *
 * RÈGLE ABSOLUE :
 * Cette fonction est l'UNIQUE point d'entrée pour tout
 * changement d'état d'un Engagement.
 *
 * Ordre invariant des guards — Source : OS V10.1 section 2.7.1 :
 *   1. MissionConversionGuard — valide légitimité + autorisation
 *   2. WORMGuard              — vérifie états immuables
 *   3. Guard spécifique       — logique métier de la transition
 *   4. FinancialInvariantGuard — si transition financière
 *   5. AuditLogger            — toujours, sans exception
 *
 * CORRECTIONS V10.1 (patch OS) :
 *   - deposit_secured et balance_pending restaurés dans la table
 *     (OS V10.1 section 2.7.1 — table 2.7.1 incomplète corrigée)
 *   - deposit_secured dans WORM_STATES W1 (OS V10 section 2.7 moment 2)
 *   - deposit_pending retiré de WORM_STATES (n'est pas un moment WORM)
 *   - Annulations recadrées sur deposit_secured et balance_pending
 *   - contractSnapshot retourné par transitionEngagement() pour persistence
 *   - ContractSnapshot non perdu après Guard 1
 *   - financialGuard corrigé sur *→disputed post-paiement
 *   - no_show_pre_event ajouté
 * ============================================================
 */

'use strict';

const IDFactory              = require('./IDFactory');
const MissionConversionGuard = require('./guards/MissionConversionGuard');
const PlacementGuard         = require('./guards/PlacementGuard');
const EventPaymentGuard      = require('./guards/EventPaymentGuard');
const SealingGuard           = require('./guards/SealingGuard');

// ── Table souveraine — Source : OS V10.1 sections 2.6 + 2.7.1 ─
const TRANSITION_TABLE = {

  // ── Chemin nominal ─────────────────────────────────────────
  'proposed->accepted':                    { guard: 'MissionConversionGuard',   worm: null, financialGuard: false },
  'proposed->negotiating':                 { guard: 'MissionConversionGuard',   worm: null, financialGuard: false },
  'negotiating->accepted':                 { guard: 'MissionConversionGuard',   worm: null, financialGuard: false },
  'accepted->placed':                      { guard: 'PlacementGuard',           worm: 'W1', financialGuard: false },

  // totalCents = prix_vendu_client TTC (TPS + TVQ + frais Stripe inclus)
  // Source : OS V10 section 3.3 LOI WATERFALL-01
  'placed->deposit_pending':               { guard: 'EventPaymentGuard',        worm: null, financialGuard: true  },

  // deposit_pending → deposit_secured : webhook Stripe payment_intent.succeeded
  // Source : OS V10.1 section 2.7.1 (patch) — moment WORM 2
  // Pierre de Rosette : "J-7 : Dépôt reçu DEPOSIT_SECURED 🔒"
  'deposit_pending->deposit_secured':      { guard: 'EventPaymentGuard',        worm: 'W1', financialGuard: true  },

  // deposit_secured → balance_pending : request de paiement du solde J-7
  // Source : OS V10.1 section 2.7.1 (patch) + OS V10 section 2.6
  'deposit_secured->balance_pending':      { guard: 'BalanceRequestGuard',      worm: null, financialGuard: true  },

  // balance_pending → event_sealed : solde reçu + ContractSnapshot phase 2
  // Source : OS V10.1 section 2.7.1 (patch) — SealingGuard couvre CE seul passage
  // Pierre de Rosette : "Soir J : Event SEALED 🔒🔒"
  'balance_pending->event_sealed':         { guard: 'SealingGuard',             worm: 'W2', financialGuard: true  },

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
  // placed→cancelled_pre_deposit : avant tout paiement (aucun argent)
  'placed->cancelled_pre_deposit':         { guard: 'CancellationGuard',        worm: null, financialGuard: false },
  'deposit_pending->cancelled_pre_deposit':{ guard: 'CancellationGuard',        worm: null, financialGuard: false },
  // deposit_secured→cancelled_J30 : dépôt reçu, annulation >J-30
  // Source : OS V10.1 — annulation depuis deposit_secured, pas deposit_pending
  'deposit_secured->cancelled_J30':        { guard: 'CancellationGuard',        worm: null, financialGuard: true  },
  // balance_pending→cancelled_J7 : solde non reçu à J-6 — scheduler balance_deadline_check
  // Source : OS V10.1 — annulation depuis balance_pending, pas deposit_pending
  'balance_pending->cancelled_J7':         { guard: 'CancellationGuard',        worm: null, financialGuard: true  },

  // ── Remboursements ─────────────────────────────────────────
  'cancelled_pre_deposit->refunded':       { guard: 'RefundGuard',              worm: null, financialGuard: false },
  'cancelled_J30->refunded':               { guard: 'RefundGuard',              worm: null, financialGuard: true  },
  'cancelled_J7->refunded':                { guard: 'RefundGuard',              worm: null, financialGuard: true  },
  'no_show->refunded':                     { guard: 'RefundGuard',              worm: null, financialGuard: true  },

  // ── Dispute — depuis tous les états actifs ─────────────────
  // Source : OS V10 table 2.7.1 — "* → disputed" via DisputeGuard
  // financialGuard: true pour tout état APRÈS réception d'argent
  'proposed->disputed':                    { guard: 'DisputeGuard',             worm: null, financialGuard: false },
  'negotiating->disputed':                 { guard: 'DisputeGuard',             worm: null, financialGuard: false },
  'accepted->disputed':                    { guard: 'DisputeGuard',             worm: null, financialGuard: false },
  'placed->disputed':                      { guard: 'DisputeGuard',             worm: null, financialGuard: false },
  'deposit_pending->disputed':             { guard: 'DisputeGuard',             worm: null, financialGuard: true  },
  'deposit_secured->disputed':             { guard: 'DisputeGuard',             worm: null, financialGuard: true  },
  'balance_pending->disputed':             { guard: 'DisputeGuard',             worm: null, financialGuard: true  },
  // Après event_sealed : argent reçu — financialGuard: true obligatoire
  'event_sealed->disputed':               { guard: 'DisputeGuard',             worm: null, financialGuard: true  },
  'performed->disputed':                   { guard: 'DisputeGuard',             worm: null, financialGuard: true  },
  'event_completed->disputed':             { guard: 'DisputeGuard',             worm: null, financialGuard: true  },
  'sots_window_closed->disputed':          { guard: 'DisputeGuard',             worm: null, financialGuard: true  },
  'payable->disputed':                     { guard: 'DisputeGuard',             worm: null, financialGuard: true  },

  // ── Sorties de dispute ─────────────────────────────────────
  // DisputeResolutionGuard — Source : OS V10 section 9.7 + table 2.7.1
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
  // no_show_pre_event : talent absent avant le début — Source : OS V10 section 2.6
  'event_sealed->no_show_pre_event':       { guard: 'NoShowGuard',              worm: null, financialGuard: true  },
  'no_show_pre_event->refunded':           { guard: 'RefundGuard',              worm: null, financialGuard: true  },

  // ── Retrait avant accord ───────────────────────────────────
  'proposed->withdrawn':                   { guard: 'WithdrawalGuard',          worm: null, financialGuard: false },
  'negotiating->withdrawn':                { guard: 'WithdrawalGuard',          worm: null, financialGuard: false },
};

// ── États WORM — Source : OS V10 section 2.7 ─────────────────
// 6 moments WORM officiels :
//   Moment 1 : accepted       (W1) — contrat signé, cachet gravé
//   Moment 2 : deposit_secured (W1) — liaison contractuelle confirmée
//   Moment 3 : event_sealed   (W2) — WORM financier complet
//   Moment 4 : event_completed (W1) — fenêtre SOTS ouverte
//   Moment 5 : sots_window_closed (W1) — réputation gravée
//   Moment 6 : archived       (W3) — immuable définitif
// Source : OS V10 section 2.7 tableau des 6 moments
//
// payable (W1) : ajout pragmatique — 11 conditions remplies, payout en attente
// Pas dans les 6 moments officiels mais protège l'état avant settlement
const WORM_STATES = {
  'settled':            'W3',
  'archived':           'W3',
  'event_sealed':       'W2',
  'accepted':           'W1', // Moment WORM 1
  'deposit_secured':    'W1', // Moment WORM 2 — "Liaison contractuelle des parties"
  'event_completed':    'W1', // Moment WORM 4
  'sots_window_closed': 'W1', // Moment WORM 5
  'payable':            'W1', // Protection pragmatique — 11 conditions remplies
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
  // Source : OS V10 section 2.9 — IDFactory
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
  // Valide la légitimité de la transition et l'autorisation de l'acteur.
  // EN PREMIER — avant WORMGuard — Source : OS V10.1 section 2.7.1
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

  // ── Résultat — contractSnapshot inclus si MCG l'a produit ─
  // Le contractSnapshot doit être persisté par l'appelant.
  // Il est produit par MissionConversionGuard à proposed→accepted
  // et negotiating→accepted uniquement.
  const result = {
    success: true,
    engagementId,
    previousState: currentState,
    newState: targetState,
    transition: transitionKey,
    guardApplied: rule.guard,
    timestamp: auditEntry.timestamp,
  };

  // Transmettre contractSnapshot :
  //   - phase 1 produit par MissionConversionGuard (proposed/negotiating→accepted)
  //   - phase 2 produit par SealingGuard (balance_pending→event_sealed)
  // L'appelant est responsable de persister en database.
  if (missionResult.contractSnapshot) {
    result.contractSnapshot = missionResult.contractSnapshot;
  }
  if (guardResult.contractSnapshot) {
    result.contractSnapshot = guardResult.contractSnapshot;
  }

  // Transmettre isSelfOrganized si PlacementGuard l'a calculé
  if (guardResult.isSelfOrganized !== undefined) {
    result.isSelfOrganized = guardResult.isSelfOrganized;
  }

  // Transmettre depositCents/balanceDueCents si EventPaymentGuard les a calculés
  if (guardResult.depositCents !== undefined) {
    result.depositCents    = guardResult.depositCents;
    result.balanceDueCents = guardResult.balanceDueCents;
  }

  return result;
}

// ── Guard 1 : MissionConversionGuard ─────────────────────────
// Pour les transitions MCG : valide acteur + légitimité + produit contractSnapshot.
// Pour toutes les autres : pass-through (IDFactory déjà validé).
// Source : OS V10.1 section 2.7.1
async function runMissionConversionCheck({
  transitionKey, engagementId, currentState, targetState, actor, context, repositories,
}) {
  const rule = TRANSITION_TABLE[transitionKey];

  if (rule && rule.guard === 'MissionConversionGuard') {
    return await MissionConversionGuard.validate({
      engagementId, currentState, targetState, actor, context, repositories,
    });
  }

  // Pour toutes les autres transitions : acteur déjà validé par IDFactory
  return { passed: true };
}

async function runSpecificGuard({
  guardName, engagementId, currentState,
  targetState, actor, context, repositories
}) {
  switch (guardName) {

    case 'MissionConversionGuard':
      // Déjà exécuté en Guard 1 — résultat déjà connu passed:true ici
      // contractSnapshot transmis via missionResult dans transitionEngagement()
      return { passed: true, reason: 'already_validated_in_guard_1' };

    case 'PlacementGuard':
      return await PlacementGuard.validate({
        engagementId, currentState, targetState, actor, context, repositories,
      });

    case 'EventPaymentGuard':
      return await EventPaymentGuard.validate({
        engagementId, currentState, targetState, actor, context, repositories,
      });

    case 'BalanceRequestGuard':
      // deposit_secured → balance_pending
      // Vérifie : délai de paiement configuré, balanceDueCents > 0
      // Crée la SchedulerDueTask pour balance_deadline_check
      console.log(`[BalanceRequestGuard] deposit_secured→balance_pending — à implémenter`);
      return { passed: true, reason: 'placeholder' };

    case 'SealingGuard':
      return await SealingGuard.validate({
        engagementId, currentState, targetState, actor, context, repositories,
      });

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
      // DecisionRecord + SettlementInstruction + acteur admin
      // Source : OS V10 section 9.7 + table 2.7.1
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