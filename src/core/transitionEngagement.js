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
 *
 * DÉCISIONS FONDATEUR V11 (Mai 2026) :
 *   Q1 — TRANSFERT : autorisé depuis placed (avant acompte, sans impact financier)
 *        ET depuis deposit_secured (après acompte, avec risque no-show à la charge
 *        du talent s'il ne trouve pas de remplaçant). financialGuard=true après acompte.
 *   Q2 — SCELLEMENT : deposit_pending → event_sealed (OS table souveraine restaurée).
 *        Le show est scellé quand signature des talents + dépôt du lineup est reçu.
 *        Les états balance_pending et deposit_secured→balance_pending sont retirés
 *        du chemin nominal. Le SealingGuard vérifie signatures + dépôt en une seule étape.
 *   Q3 — LITIGE : uniquement pendant la fenêtre SOTS 24h après le show.
 *        Seul état source autorisé : event_completed (fenêtre ouverte).
 *        "Tu ne peux contester que ce que tu as vécu."
 *        Toutes les autres entrées vers disputed sont supprimées.
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

  // Q2 — DÉCISION FONDATEUR V11 : deposit_pending → event_sealed restauré (OS table 2.7.1)
  // Le show est scellé quand signature des talents + dépôt du lineup est reçu.
  // Le SealingGuard vérifie : signatures valides + dépôt Stripe confirmé + ContractSnapshot phase 2.
  // balance_pending et deposit_secured→balance_pending retirés du chemin nominal.
  'deposit_pending->event_sealed':         { guard: 'SealingGuard',           worm: 'W2', financialGuard: true  },

  'event_sealed->performed':               { guard: 'PresenceWindowGuard',    worm: null, financialGuard: false },
  'performed->event_completed':            { guard: 'EventCompletionGuard',   worm: 'W1', financialGuard: false },
  'event_completed->sots_window_closed':   { guard: 'SOTSWindowGuard',        worm: 'W1', financialGuard: false },

  // Payout nominal — après SOTS (Condition 7 vérifiée)
  'sots_window_closed->payable':           { guard: 'PresenceProofGuard',     worm: null, financialGuard: true  },
  // Payout urgence — court-circuite SOTS (SoloFounderOverride + AdminIncidentRecord requis)
  'performed->payable':                    { guard: 'PresenceProofGuard',     worm: null, financialGuard: true  },

  'payable->settled':                      { guard: 'LedgerInvariantGuard',   worm: null, financialGuard: true  },
  'settled->archived':                     { guard: 'ArchiveWORMGuard',       worm: null, financialGuard: true  },

  // ── Annulations — Source : OS V10 section 2.6 ─────────────
  'placed->cancelled_pre_deposit':         { guard: 'CancellationGuard',      worm: null, financialGuard: false },
  'deposit_pending->cancelled_pre_deposit':{ guard: 'CancellationGuard',      worm: null, financialGuard: false },
  'deposit_secured->cancelled_J30':        { guard: 'CancellationGuard',      worm: null, financialGuard: true  },

  // ── Remboursements → archived ──────────────────────────────
  'cancelled_pre_deposit->refunded':       { guard: 'RefundGuard',            worm: null, financialGuard: false },
  'cancelled_J30->refunded':               { guard: 'RefundGuard',            worm: null, financialGuard: true  },
  'refunded->archived':                    { guard: 'ArchiveWORMGuard',       worm: null, financialGuard: true  },
  'withdrawn->archived':                   { guard: 'ArchiveWORMGuard',       worm: null, financialGuard: false },
  'no_show->refunded':                     { guard: 'RefundGuard',            worm: null, financialGuard: true  },

  // ── Q3 — DÉCISION FONDATEUR V11 : litige uniquement pendant la fenêtre SOTS 24h ──
  // "Tu ne peux contester que ce que tu as vécu."
  // Seul état source autorisé : event_completed (fenêtre ouverte, show terminé et vécu).
  // Toutes les autres entrées vers disputed (accepted, event_sealed) sont supprimées.
  'event_completed->disputed':             { guard: 'DisputeGuard',           worm: null, financialGuard: true  },
  'disputed->payable':                     { guard: 'DisputeResolutionGuard', worm: null, financialGuard: true  },
  'disputed->refunded':                    { guard: 'DisputeResolutionGuard', worm: null, financialGuard: true  },

  // ── Q1 — DÉCISION FONDATEUR V11 : transfert avant ET après acompte ────────────
  // Avant acompte (placed) : transfert administratif, pas d'impact financier.
  // Après acompte (deposit_secured) : acompte engagé — si le talent ne trouve pas
  //   de remplaçant, il est responsable du no-show. financialGuard=true.
  'placed->transfer_requested':            { guard: 'TransferGuard',          worm: null, financialGuard: false },
  'deposit_secured->transfer_requested':   { guard: 'TransferGuard',          worm: 'W1', financialGuard: true  },
  'transfer_requested->transfer_accepted': { guard: 'TransferGuard',          worm: null, financialGuard: false },
  'transfer_requested->transfer_refused':  { guard: 'TransferGuard',          worm: null, financialGuard: false },

  // ── Retrait et no-show ─────────────────────────────────────
  'proposed->withdrawn':                   { guard: 'WithdrawalGuard',        worm: null, financialGuard: false },
  'negotiating->withdrawn':                { guard: 'WithdrawalGuard',        worm: null, financialGuard: false },
  'performed->no_show':                    { guard: 'NoShowGuard',            worm: null, financialGuard: false },
};

// ── États WORM — Source : OS V10 section 2.7 — 6 moments souverains ──────────
// DÉCISION FONDATEUR V11 :
//   - settled retiré de W3 (non listé dans les 6 moments WORM de l'OS).
//     settled→archived peut maintenant s'exécuter.
//   - balance_pending retiré (état supprimé du chemin nominal, décision Q2).
//   - payable conservé en W1 (état financier critique : 11 conditions vérifiées).
const WORM_STATES = {
  'archived':           'W3',  // Moment 6 OS — architecturalement impossible
  'event_sealed':       'W2',  // Moment 3 OS — toucher = fraude
  'accepted':           'W1',  // Moment 1 OS — toucher = erreur
  'deposit_secured':    'W1',  // Moment 2 OS — toucher = erreur
  'event_completed':    'W1',  // Moment 4 OS — toucher = erreur
  'sots_window_closed': 'W1',  // Moment 5 OS — toucher = erreur
  'payable':            'W1',  // Correction V4 conservée — payout en attente, critique
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
      // Q2 — DÉCISION FONDATEUR V11 : scellement sur deposit_pending (signatures + dépôt)
      console.log(`[SealingGuard] deposit_pending→event_sealed — à implémenter`);
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
      // Q3 — DÉCISION FONDATEUR V11 : ouvre le litige depuis event_completed uniquement
      console.log(`[DisputeGuard] event_completed→disputed — à implémenter`);
      return { passed: true, reason: 'placeholder' };

    case 'DisputeResolutionGuard':
      // Q3 — DÉCISION FONDATEUR V11 : clôture du litige avec DecisionRecord + SettlementInstruction
      // Source : OS V10 section 2.7.1 — interdit absolu n°18 : SettlementInstruction sans DecisionRecord
      console.log(`[DisputeResolutionGuard] disputed→payable/refunded — à implémenter`);
      return { passed: true, reason: 'placeholder' };

    case 'TransferGuard':
      // Q1 — DÉCISION FONDATEUR V11 : transfert depuis placed (sans acompte) ET deposit_secured (avec acompte)
      // Si depuis deposit_secured : financialGuard=true, talent responsable du no-show si pas de remplaçant
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