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
 *   1. WORMGuard           ← en premier — violation la plus grave
 *   2. Vérification table  ← transition autorisée ?
 *   3. Guard spécifique    ← logique métier de la transition
 *   4. FinancialInvariantGuard ← si transition financière
 *   5. AuditLogger         ← toujours, sans exception
 *
 * Guards implémentés :
 *   ✅ MissionConversionGuard — proposed→negotiating (acteurs seulement, pas de snapshot)
 *                               proposed→accepted, negotiating→accepted (snapshot complet)
 *   ✅ PlacementGuard         — accepted→placed (contrat + lineup, sans argent)
 *   ✅ EventPaymentGuard      — placed→deposit_pending (calcul dépôt TTC)
 *                               deposit_pending→deposit_secured (confirmation Stripe exacte)
 *                               deposit_secured→balance_pending (ouverture solde J-7)
 *   🔲 SealingGuard           — balance_pending→event_sealed (WORM W2 + ContractSnapshot phase 2)
 *   🔲 PresenceWindowGuard    — event_sealed→performed
 *   🔲 EventCompletionGuard   — performed→event_completed
 *   🔲 SOTSWindowGuard        — event_completed→sots_window_closed
 *   🔲 PresenceProofGuard     — sots_window_closed→payable (nominal) + performed→payable (urgence)
 *   🔲 LedgerInvariantGuard   — payable→settled
 *   🔲 ArchiveWORMGuard       — settled→archived
 * ============================================================
 */

'use strict';

const MissionConversionGuard = require('./guards/MissionConversionGuard');
const PlacementGuard         = require('./guards/PlacementGuard');
const EventPaymentGuard      = require('./guards/EventPaymentGuard');

// ── Table souveraine des transitions autorisées ──────────────
// Source : OS V10 section 2.7.1
//
// CORRECTIONS V3 :
// - MissionConversionGuard dispatche par targetState :
//     proposed→negotiating = acteurs seulement (pas de cachet, pas de snapshot)
//     proposed→accepted / negotiating→accepted = logique complète + snapshot
// - Ajout de sots_window_closed→payable (chemin nominal après SOTS)
// - performed→payable conservé comme chemin d'urgence (SoloFounderOverride requis)
// - totalCents dans EventPaymentGuard = prix_vendu_client TTC (TPS + TVQ + Stripe inclus)
//   Source : OS V10 section 3.3 LOI WATERFALL-01
//
const TRANSITION_TABLE = {

  // ── Chemin nominal ─────────────────────────────────────────

  // Voie directe sans négociation
  'proposed->accepted':                { guard: 'MissionConversionGuard', worm: null, financialGuard: false },

  // Voie négociation
  // proposed→negotiating : acteurs + roleMetier seulement — le prix n'est pas encore arrêté
  // negotiating→accepted : cachet + taux + tier + ContractSnapshot phase 1
  'proposed->negotiating':             { guard: 'MissionConversionGuard', worm: null, financialGuard: false },
  'negotiating->accepted':             { guard: 'MissionConversionGuard', worm: null, financialGuard: false },

  // Placement — contrat validé, lineup verrouillé, sans argent
  'accepted->placed':                  { guard: 'PlacementGuard',         worm: 'W1', financialGuard: false },

  // Dépôt — premier mouvement d'argent
  // totalCents = prix_vendu_client TTC incluant TPS + TVQ + frais Stripe
  'placed->deposit_pending':           { guard: 'EventPaymentGuard',      worm: null, financialGuard: true  },
  'deposit_pending->deposit_secured':  { guard: 'EventPaymentGuard',      worm: null, financialGuard: true  },

  // Solde J-7
  'deposit_secured->balance_pending':  { guard: 'EventPaymentGuard',      worm: null, financialGuard: true  },

  // Scellement WORM W2 — ContractSnapshot phase 2 créé ici
  'balance_pending->event_sealed':     { guard: 'SealingGuard',           worm: 'W2', financialGuard: true  },

  // Présence
  'event_sealed->performed':           { guard: 'PresenceWindowGuard',    worm: null, financialGuard: false },
  'performed->event_completed':        { guard: 'EventCompletionGuard',   worm: 'W1', financialGuard: false },

  // SOTS
  'event_completed->sots_window_closed': { guard: 'SOTSWindowGuard',      worm: 'W1', financialGuard: false },

  // Payout — chemin NOMINAL : après fermeture SOTS
  // Condition 7 vérifiée ici : SOTSSubmission talent soumise
  // Source : OS V10 section 2.6 + section 6.3 Condition 7
  'sots_window_closed->payable':       { guard: 'PresenceProofGuard',     worm: null, financialGuard: true  },

  // Payout — chemin d'URGENCE : court-circuite SOTS
  // RÉSERVÉ aux cas exceptionnels — requiert SoloFounderOverride + AdminIncidentRecord
  // Source : OS V10 section 9.3
  'performed->payable':                { guard: 'PresenceProofGuard',     worm: null, financialGuard: true  },

  // Règlement
  'payable->settled':                  { guard: 'LedgerInvariantGuard',   worm: 'W3', financialGuard: true  },
  'settled->archived':                 { guard: 'ArchiveWORMGuard',       worm: 'W3', financialGuard: true  },

  // ── Transitions alternatives ───────────────────────────────
  'performed->no_show':                { guard: 'NoShowGuard',            worm: null, financialGuard: false },
  'proposed->withdrawn':               { guard: 'WithdrawalGuard',        worm: null, financialGuard: false },
  'negotiating->withdrawn':            { guard: 'WithdrawalGuard',        worm: null, financialGuard: false },
  'accepted->disputed':                { guard: 'DisputeGuard',           worm: null, financialGuard: false },
  'event_sealed->disputed':            { guard: 'DisputeGuard',           worm: null, financialGuard: false },
};

// ── États WORM et leur niveau de sévérité ────────────────────
// Source : OS V10 section 2.7 BLOC 2 V8
const WORM_STATES = {
  'settled':            'W3',
  'archived':           'W3',
  'event_sealed':       'W2',
  'accepted':           'W1',
  'deposit_secured':    'W1',
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
      engagementId,
      actor,
      attemptedTransition: transitionKey,
      timestamp: new Date().toISOString(),
    };
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
  if (rule.financialGuard) {
    // TODO: LOI LEDGER-02 — vérifier équilibre ledger
    console.log(`[FinancialInvariantGuard] "${transitionKey}" — à implémenter`);
  }

  // ── GUARD 5 : AuditLogger ─────────────────────────────────
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
      console.log(`[PresenceWindowGuard] ouverture fenêtre check-in — à implémenter`);
      return { passed: true, reason: 'placeholder' };

    case 'EventCompletionGuard':
      console.log(`[EventCompletionGuard] complétion event — à implémenter`);
      return { passed: true, reason: 'placeholder' };

    case 'SOTSWindowGuard':
      console.log(`[SOTSWindowGuard] fermeture fenêtre SOTS — à implémenter`);
      return { passed: true, reason: 'placeholder' };

    case 'PresenceProofGuard':
      // Couvre : sots_window_closed→payable (nominal) + performed→payable (urgence)
      console.log(`[PresenceProofGuard] vérification présence — à implémenter`);
      return { passed: true, reason: 'placeholder' };

    case 'LedgerInvariantGuard':
      console.log(`[LedgerInvariantGuard] invariant ledger — à implémenter`);
      return { passed: true, reason: 'placeholder' };

    case 'ArchiveWORMGuard':
      console.log(`[ArchiveWORMGuard] archive finale WORM — à implémenter`);
      return { passed: true, reason: 'placeholder' };

    case 'NoShowGuard':
      console.log(`[NoShowGuard] no-show — à implémenter`);
      return { passed: true, reason: 'placeholder' };

    case 'WithdrawalGuard':
      console.log(`[WithdrawalGuard] retrait avant accord — à implémenter`);
      return { passed: true, reason: 'placeholder' };

    case 'DisputeGuard':
      console.log(`[DisputeGuard] dispute — à implémenter`);
      return { passed: true, reason: 'placeholder' };

    default:
      throw new Error(
        `GUARD_UNKNOWN: Guard "${guardName}" non reconnu. ` +
        `Créer src/core/guards/${guardName}.js et l'ajouter ici.`
      );
  }
}

module.exports = { transitionEngagement, TRANSITION_TABLE, WORM_STATES };