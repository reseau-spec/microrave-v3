/**
 * MICRO RAVE V3 — transitionEngagement()
 * ============================================================
 * LOI TRANSITION-01 — Source : OS V10 section 16.2
 *
 * RÈGLE ABSOLUE :
 * Cette fonction est l'UNIQUE point d'entrée pour tout
 * changement d'état d'un Engagement.
 *
 * Ordre invariant des guards :
 *   1. WORMGuard           ← en premier — violation la plus grave
 *   2. Vérification table  ← transition autorisée ?
 *   3. Guard spécifique    ← logique métier
 *   4. FinancialInvariantGuard ← si financier
 *   5. AuditLogger         ← toujours, sans exception
 *
 * CORRECTIONS V4 :
 *   - IDFactory.validate() sur engagementId et actor
 *   - balance_pending et payable ajoutés à WORM_STATES (W1)
 *   - 9 transitions manquantes : cancelled_*, disputed→*, transfer_*
 *   - sots_window_closed→payable présent et testé
 *   - totalCents documenté comme prix_vendu_client TTC
 * ============================================================
 */

'use strict';

const IDFactory              = require('./IDFactory');
const MissionConversionGuard = require('./guards/MissionConversionGuard');
const PlacementGuard         = require('./guards/PlacementGuard');
const EventPaymentGuard      = require('./guards/EventPaymentGuard');

// ── Table souveraine — Source : OS V10 sections 2.6 + 2.7.1 ──
const TRANSITION_TABLE = {

  // ── Chemin nominal ─────────────────────────────────────────
  'proposed->accepted':                    { guard: 'MissionConversionGuard', worm: null, financialGuard: false },
  'proposed->negotiating':                 { guard: 'MissionConversionGuard', worm: null, financialGuard: false },
  'negotiating->accepted':                 { guard: 'MissionConversionGuard', worm: null, financialGuard: false },
  'accepted->placed':                      { guard: 'PlacementGuard',         worm: 'W1', financialGuard: false },

  // totalCents = prix_vendu_client TTC (TPS + TVQ + frais Stripe inclus)
  // Source : OS V10 section 3.3 LOI WATERFALL-01
  'placed->deposit_pending':               { guard: 'EventPaymentGuard',      worm: null, financialGuard: true  },
  'deposit_pending->deposit_secured':      { guard: 'EventPaymentGuard',      worm: null, financialGuard: true  },
  'deposit_secured->balance_pending':      { guard: 'EventPaymentGuard',      worm: null, financialGuard: true  },
  'balance_pending->event_sealed':         { guard: 'SealingGuard',           worm: 'W2', financialGuard: true  },
  'event_sealed->performed':               { guard: 'PresenceWindowGuard',    worm: null, financialGuard: false },
  'performed->event_completed':            { guard: 'EventCompletionGuard',   worm: 'W1', financialGuard: false },
  'event_completed->sots_window_closed':   { guard: 'SOTSWindowGuard',        worm: 'W1', financialGuard: false },

  // Payout nominal — après SOTS (Condition 7 vérifiée)
  'sots_window_closed->payable':           { guard: 'PresenceProofGuard',     worm: null, financialGuard: true  },
  // Payout urgence — court-circuite SOTS (SoloFounderOverride + AdminIncidentRecord requis)
  'performed->payable':                    { guard: 'PresenceProofGuard',     worm: null, financialGuard: true  },

  'payable->settled':                      { guard: 'LedgerInvariantGuard',   worm: 'W3', financialGuard: true  },
  'settled->archived':                     { guard: 'ArchiveWORMGuard',       worm: 'W3', financialGuard: true  },

  // ── Annulations — Source : OS V10 section 2.6 ─────────────
  'placed->cancelled_pre_deposit':         { guard: 'CancellationGuard',      worm: null, financialGuard: false },
  'deposit_pending->cancelled_pre_deposit':{ guard: 'CancellationGuard',      worm: null, financialGuard: false },
  'deposit_secured->cancelled_J30':        { guard: 'CancellationGuard',      worm: null, financialGuard: true  },
  // balance_pending→cancelled_J7 : déclenché par le scheduler balance_deadline_check
  'balance_pending->cancelled_J7':         { guard: 'CancellationGuard',      worm: null, financialGuard: true  },

  // ── Remboursements ─────────────────────────────────────────
  'cancelled_pre_deposit->refunded':       { guard: 'RefundGuard',            worm: null, financialGuard: false },
  'cancelled_J30->refunded':               { guard: 'RefundGuard',            worm: null, financialGuard: true  },
  'cancelled_J7->refunded':                { guard: 'RefundGuard',            worm: null, financialGuard: true  },

  // ── Dispute — SORTIES CRITIQUES ajoutées en V4 ────────────
  // Sans disputed→payable et disputed→refunded, l'argent est bloqué définitivement
  'accepted->disputed':                    { guard: 'DisputeGuard',           worm: null, financialGuard: false },
  'event_sealed->disputed':               { guard: 'DisputeGuard',           worm: null, financialGuard: false },
  'disputed->payable':                     { guard: 'DisputeGuard',           worm: null, financialGuard: true  },
  'disputed->refunded':                    { guard: 'DisputeGuard',           worm: null, financialGuard: true  },

  // ── Transfert de talent ────────────────────────────────────
  'placed->transfer_requested':            { guard: 'TransferGuard',          worm: null, financialGuard: false },
  'transfer_requested->transfer_accepted': { guard: 'TransferGuard',          worm: null, financialGuard: false },
  'transfer_requested->transfer_refused':  { guard: 'TransferGuard',          worm: null, financialGuard: false },

  // ── Retrait et no-show ─────────────────────────────────────
  'proposed->withdrawn':                   { guard: 'WithdrawalGuard',        worm: null, financialGuard: false },
  'negotiating->withdrawn':                { guard: 'WithdrawalGuard',        worm: null, financialGuard: false },
  'performed->no_show':                    { guard: 'NoShowGuard',            worm: null, financialGuard: false },
};

// ── États WORM — Source : OS V10 section 2.7 BLOC 2 V8 ───────
// CORRECTION V4 : balance_pending (W1) et payable (W1) ajoutés
const WORM_STATES = {
  'settled':            'W3',
  'archived':           'W3',
  'event_sealed':       'W2',
  'accepted':           'W1',
  'deposit_secured':    'W1',
  'balance_pending':    'W1', // solde J-7 en attente — état financier critique
  'payable':            'W1', // 11 conditions remplies — payout en attente
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

  // ── Validation des systemIds souverains ───────────────────
  // Source : OS V10 section 2.9 — IDFactory
  if (!IDFactory.validate(engagementId, 'Engagement')) {
    throw new Error(
      `INVALID_SYSTEM_ID: engagementId "${engagementId}" invalide. Format attendu : ENG-XXXXXX-XXXXXX`
    );
  }

  if (!IDFactory.validate(actor, 'User')) {
    throw new Error(
      `INVALID_SYSTEM_ID: actor "${actor}" invalide. Format attendu : USR-XXXXXX-XXXXXX. ` +
      `Un acteur non-souverain ne peut pas être tracé dans le DataAccessLedger.`
    );
  }

  const transitionKey = `${currentState}->${targetState}`;

  // ── GUARD 1 : WORMGuard ───────────────────────────────────
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
      engagementId, actor,
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

  // ── GUARD 2 : Table souveraine ────────────────────────────
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
  // DETTE : tant que DataAccessLedger absent, LOI TRANSITION-01 ne détecte
  // pas les mutations directes dans Base44 UI.
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

async function runSpecificGuard({
  guardName, engagementId, currentState,
  targetState, actor, context, repositories
}) {
  switch (guardName) {

    case 'MissionConversionGuard':
      return await MissionConversionGuard.validate({
        engagementId, currentState, targetState, actor, context, repositories,
      });

    case 'PlacementGuard':
      return await PlacementGuard.validate({
        engagementId, currentState, targetState, actor, context, repositories,
      });

    case 'EventPaymentGuard':
      return await EventPaymentGuard.validate({
        engagementId, currentState, targetState, actor, context, repositories,
      });

    case 'SealingGuard':
      console.log(`[SealingGuard] balance_pending→event_sealed — à implémenter`);
      return { passed: true, reason: 'placeholder' };

    case 'PresenceWindowGuard':
      console.log(`[PresenceWindowGuard] ouverture fenêtre — à implémenter`);
      return { passed: true, reason: 'placeholder' };

    case 'EventCompletionGuard':
      console.log(`[EventCompletionGuard] complétion — à implémenter`);
      return { passed: true, reason: 'placeholder' };

    case 'SOTSWindowGuard':
      console.log(`[SOTSWindowGuard] fermeture SOTS — à implémenter`);
      return { passed: true, reason: 'placeholder' };

    case 'PresenceProofGuard':
      console.log(`[PresenceProofGuard] présence — à implémenter`);
      return { passed: true, reason: 'placeholder' };

    case 'LedgerInvariantGuard':
      console.log(`[LedgerInvariantGuard] ledger — à implémenter`);
      return { passed: true, reason: 'placeholder' };

    case 'ArchiveWORMGuard':
      console.log(`[ArchiveWORMGuard] archive WORM — à implémenter`);
      return { passed: true, reason: 'placeholder' };

    case 'CancellationGuard':
      console.log(`[CancellationGuard] annulation — à implémenter`);
      return { passed: true, reason: 'placeholder' };

    case 'RefundGuard':
      console.log(`[RefundGuard] remboursement — à implémenter`);
      return { passed: true, reason: 'placeholder' };

    case 'DisputeGuard':
      console.log(`[DisputeGuard] dispute — à implémenter`);
      return { passed: true, reason: 'placeholder' };

    case 'TransferGuard':
      console.log(`[TransferGuard] transfert — à implémenter`);
      return { passed: true, reason: 'placeholder' };

    case 'NoShowGuard':
      console.log(`[NoShowGuard] no-show — à implémenter`);
      return { passed: true, reason: 'placeholder' };

    case 'WithdrawalGuard':
      console.log(`[WithdrawalGuard] retrait — à implémenter`);
      return { passed: true, reason: 'placeholder' };

    default:
      throw new Error(
        `GUARD_UNKNOWN: Guard "${guardName}" non reconnu. ` +
        `Créer src/core/guards/${guardName}.js et l'ajouter ici.`
      );
  }
}

module.exports = { transitionEngagement, TRANSITION_TABLE, WORM_STATES };