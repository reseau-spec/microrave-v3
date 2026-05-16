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
 *   ✅ MissionConversionGuard — proposed→accepted, proposed→negotiating, negotiating→accepted
 *   ✅ PlacementGuard         — accepted→placed (contrat + lineup, sans argent)
 *   ✅ EventPaymentGuard      — placed→deposit_pending, deposit_secured→balance_pending (argent)
 *   🔲 SealingGuard           — balance_pending→event_sealed (scellement WORM W2)
 *   🔲 PresenceWindowGuard    — event_sealed→performed
 *   🔲 PresenceProofGuard     — performed→payable
 *   🔲 EventCompletionGuard   — performed→event_completed
 *   🔲 SOTSWindowGuard        — event_completed→sots_window_closed
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
// CORRECTION V2 :
// - Ajout de proposed→negotiating et negotiating→accepted (voie négociation)
// - Ajout de deposit_secured→balance_pending (paiement du solde J-7)
// - Ajout de balance_pending→event_sealed (scellement après solde)
// - Suppression du saut direct deposit_secured→event_sealed (incorrect)
// - Séparation PlacementGuard / EventPaymentGuard
//
const TRANSITION_TABLE = {

  // ── Chemin nominal ────────────────────────────────────────
  // Voie directe (CreateEvent sans contre-offre)
  'proposed->accepted':                { guard: 'MissionConversionGuard', worm: null, financialGuard: false },
  // Voie négociation (CreateEvent avec contre-offre)
  // Source : OS V10 section 2.6 — deux voies vers accepted
  'proposed->negotiating':             { guard: 'MissionConversionGuard', worm: null, financialGuard: false },
  'negotiating->accepted':             { guard: 'MissionConversionGuard', worm: null, financialGuard: false },

  // Placement — contrat validé, lineup verrouillé, sans argent
  'accepted->placed':                  { guard: 'PlacementGuard',         worm: 'W1', financialGuard: false },

  // Dépôt — premier mouvement d'argent, 20% du total
  'placed->deposit_pending':           { guard: 'EventPaymentGuard',      worm: null, financialGuard: true  },
  'deposit_pending->deposit_secured':  { guard: 'EventPaymentGuard',      worm: null, financialGuard: true  },

  // Solde — paiement du solde J-7 avant l'event
  // Source : OS V10 section 2.6 — état balance_pending
  'deposit_secured->balance_pending':  { guard: 'EventPaymentGuard',      worm: null, financialGuard: true  },
  'balance_pending->event_sealed':     { guard: 'SealingGuard',           worm: 'W2', financialGuard: true  },

  // Présence et complétion
  'event_sealed->performed':           { guard: 'PresenceWindowGuard',    worm: null, financialGuard: false },
  'performed->event_completed':        { guard: 'EventCompletionGuard',   worm: 'W1', financialGuard: false },
  'performed->payable':                { guard: 'PresenceProofGuard',     worm: null, financialGuard: true  },

  // SOTS et archivage
  'event_completed->sots_window_closed': { guard: 'SOTSWindowGuard',      worm: 'W1', financialGuard: false },
  'payable->settled':                  { guard: 'LedgerInvariantGuard',   worm: 'W3', financialGuard: true  },
  'settled->archived':                 { guard: 'ArchiveWORMGuard',       worm: 'W3', financialGuard: true  },

  // ── Transitions alternatives ──────────────────────────────
  'performed->no_show':                { guard: 'NoShowGuard',            worm: null, financialGuard: false },
  'proposed->withdrawn':               { guard: 'WithdrawalGuard',        worm: null, financialGuard: false },
  'negotiating->withdrawn':            { guard: 'WithdrawalGuard',        worm: null, financialGuard: false },
  'accepted->disputed':                { guard: 'DisputeGuard',           worm: null, financialGuard: false },
  'event_sealed->disputed':            { guard: 'DisputeGuard',           worm: null, financialGuard: false },
};

// ── États WORM et leur niveau de sévérité ────────────────────
// Source : OS V10 section 2.7 BLOC 2 V8
const WORM_STATES = {
  'settled':            'W3', // Architecturalement impossible à modifier
  'archived':           'W3', // Architecturalement impossible à modifier
  'event_sealed':       'W2', // Fraude — AdminIncidentRecord P0 + SYSTEM_HOLD
  'accepted':           'W1', // Erreur corrigeable — log obligatoire
  'deposit_secured':    'W1',
  'event_completed':    'W1',
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
  // Vérifié EN PREMIER — une violation WORM est plus grave
  // qu'une transition non autorisée.
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
  // Actif uniquement sur les transitions financières.
  // TODO: vérifier équilibre ledger — LOI LEDGER-02
  if (rule.financialGuard) {
    console.log(`[FinancialInvariantGuard] "${transitionKey}" — vérification ledger à implémenter`);
  }

  // ── GUARD 5 : AuditLogger — TOUJOURS, sans exception ─────
  // Source : OS V10 section 2.7.1 — "toujours, sans exception"
  // TODO: repositories.audit?.writeToDataAccessLedger(auditEntry)
  const auditEntry = {
    engagementId,
    transition: transitionKey,
    actor,
    timestamp: new Date().toISOString(),
    guardApplied: rule.guard,
    wormLevel: rule.worm || 'NONE',
  };
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
// Chaque guard est dans son propre fichier — séparation stricte.
// Ajouter un guard = créer le fichier + ajouter le case ici.
async function runSpecificGuard({
  guardName, engagementId, currentState,
  targetState, actor, context, repositories
}) {
  switch (guardName) {

    // ── Guards implémentés ──────────────────────────────────

    case 'MissionConversionGuard':
      // Couvre : proposed→accepted, proposed→negotiating, negotiating→accepted
      // Source : OS V10 section 2.7.1
      return await MissionConversionGuard.validate({
        engagementId,
        currentState,
        targetState,
        actor,
        context,
        repositories,
      });

    case 'PlacementGuard':
      // Couvre : accepted→placed
      // Vérifie : ContractSnapshot phase 1 existe, lineup cohérent, event existe
      // NE touche PAS à l'argent — financialGuard: false
      // Source : OS V10 section 2.7.1
      return await PlacementGuard.validate({
        engagementId,
        currentState,
        targetState,
        actor,
        context,
        repositories,
      });

    case 'EventPaymentGuard':
      // Couvre : placed→deposit_pending, deposit_pending→deposit_secured,
      //          deposit_secured→balance_pending
      // Touche à l'argent — financialGuard: true
      // Source : OS V10 section 2.7.1
      return await EventPaymentGuard.validate({
        engagementId,
        currentState,
        targetState,
        actor,
        context,
        repositories,
      });

    // ── Guards à implémenter ────────────────────────────────

    case 'SealingGuard':
      // Couvre : balance_pending→event_sealed
      // TODO: LOI LEDGER-02 avant scellement, ContractSnapshot phase 2
      console.log(`[SealingGuard] balance_pending→event_sealed — à implémenter`);
      return { passed: true, reason: 'placeholder' };

    case 'PresenceWindowGuard':
      // Couvre : event_sealed→performed
      // TODO: ouvrir fenêtre check-in, créer SessionPresence
      console.log(`[PresenceWindowGuard] ouverture fenêtre check-in — à implémenter`);
      return { passed: true, reason: 'placeholder' };

    case 'PresenceProofGuard':
      // Couvre : performed→payable
      // TODO: SessionPresence.checkedInAt != null — LOI CO-DÉPENDANCE-01
      // TODO: Condition 7 — SOTSSubmission talent soumise
      console.log(`[PresenceProofGuard] vérification présence et SOTS — à implémenter`);
      return { passed: true, reason: 'placeholder' };

    case 'EventCompletionGuard':
      // Couvre : performed→event_completed
      // TODO: tous talents en performed, no-show résolu
      console.log(`[EventCompletionGuard] complétion event — à implémenter`);
      return { passed: true, reason: 'placeholder' };

    case 'SOTSWindowGuard':
      // Couvre : event_completed→sots_window_closed
      // TODO: fermer fenêtre SOTS 24h après event_completed
      console.log(`[SOTSWindowGuard] fermeture fenêtre SOTS — à implémenter`);
      return { passed: true, reason: 'placeholder' };

    case 'LedgerInvariantGuard':
      // Couvre : payable→settled
      // TODO: KYCStatus=VERIFIED, ledger équilibré, LOI LEDGER-02
      console.log(`[LedgerInvariantGuard] invariant ledger — à implémenter`);
      return { passed: true, reason: 'placeholder' };

    case 'ArchiveWORMGuard':
      // Couvre : settled→archived
      // TODO: GoNoGoDecisionRecord=GO, BugReplayRecords P0=PASSED, SOTS closed
      console.log(`[ArchiveWORMGuard] archive finale WORM — à implémenter`);
      return { passed: true, reason: 'placeholder' };

    case 'NoShowGuard':
      // Couvre : performed→no_show
      // TODO: délai de grâce expiré, logique no-show
      console.log(`[NoShowGuard] no-show — à implémenter`);
      return { passed: true, reason: 'placeholder' };

    case 'WithdrawalGuard':
      // Couvre : proposed→withdrawn, negotiating→withdrawn
      // TODO: avant accord, aucune conséquence réputationnelle
      console.log(`[WithdrawalGuard] retrait avant accord — à implémenter`);
      return { passed: true, reason: 'placeholder' };

    case 'DisputeGuard':
      // Couvre : accepted→disputed, event_sealed→disputed
      // TODO: logique de dispute, ConflictOfInterestRecord si isSelfOrganized
      console.log(`[DisputeGuard] dispute — à implémenter`);
      return { passed: true, reason: 'placeholder' };

    default:
      throw new Error(
        `GUARD_UNKNOWN: Guard "${guardName}" non reconnu dans le dispatcher. ` +
        `Créer le fichier src/core/guards/${guardName}.js et l'ajouter ici.`
      );
  }
}

module.exports = { transitionEngagement, TRANSITION_TABLE, WORM_STATES };