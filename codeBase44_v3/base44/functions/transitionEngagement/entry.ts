/**
 * transitionEngagement — Base44 Function v3
 * ============================================================
 * Machine d'état Engagement avec guards financiers.
 *
 * CHANGEMENTS v2 → v3 :
 *   WORM_STATES : retrait de event_sealed et settled (états
 *   intermédiaires avec transitions sortantes légitimes).
 *   États WORM réels = terminaux uniquement : archived,
 *   deposit_failed, no_show_pre_event.
 *
 *   payable→settled : allowedActors inclut maintenant organizer
 *   (SoloFounderOverride pilote — requiert executePayoutTransfer
 *   pour Event 1 commercial).
 *
 *   guardBalancePayment v3.1 : résistant aux EPR fantômes
 *   (re-clics après paiement réussi). Cherche n'importe quel
 *   EPR balance succeeded/completed, ignore les pending fantômes.
 *
 *   guardPayoutReady : SoloFounderOverride déplacé au bon endroit
 *   (cas !records?.length, pas seulement le catch). Sans cela,
 *   la garde bloquait toujours car .filter() retourne [] sans
 *   exception, rendant le catch inatteignable.
 *
 * Source : D-038, D-101, OS V15
 * ============================================================
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const ALLOWED_TRANSITIONS = {
  'placed->deposit_pending':                    { allowedActors: ['organizer'], financialGuard: false },
  'deposit_pending->deposit_secured':           { allowedActors: ['system'],    financialGuard: true  },
  'deposit_secured->event_sealed':              { allowedActors: ['organizer'], financialGuard: true  },
  'event_sealed->performed':                    { allowedActors: ['talent'],    financialGuard: false },
  'performed->event_completed':                 { allowedActors: ['organizer'], financialGuard: false },
  'event_completed->sots_window_closed':        { allowedActors: ['organizer', 'system'], financialGuard: false },
  'sots_window_closed->contestation_window':    { allowedActors: ['organizer', 'system'], financialGuard: false },
  'contestation_window->payable':               { allowedActors: ['organizer', 'system'], financialGuard: true  },
  'payable->settled':                           { allowedActors: ['organizer', 'system'], financialGuard: true  },
  'settled->archived':                          { allowedActors: ['system', 'organizer'], financialGuard: true  },
  'sots_window_closed->no_show':                { allowedActors: ['organizer', 'system'], financialGuard: true  },
  'no_show->refunded':                          { allowedActors: ['system'],    financialGuard: true  },
  'placed->cancelled_J30':                      { allowedActors: ['organizer', 'talent'], financialGuard: false },
  'deposit_pending->cancelled_J30':             { allowedActors: ['organizer'], financialGuard: false },
  'deposit_secured->cancelled_J7':              { allowedActors: ['organizer'], financialGuard: true  },
};

const WORM_STATES = new Set([
  // États TERMINAUX uniquement — aucune transition sortante dans ALLOWED_TRANSITIONS.
  // Retirés : event_sealed (→performed), settled (→archived) — états intermédiaires.
  'archived', 'deposit_failed', 'no_show_pre_event',
]);

// ── Guard : PresenceWindowGuard (event_sealed → performed) ───
async function guardPresenceWindow(eng, base44) {
  try {
    const presences = await base44.entities.SessionPresence.filter({
      engagementId: eng.systemId, talentUserId: eng.talentUserId,
    }, '-created_date', 1);
    if (!presences?.length) {
      return { passed: false, reason: 'PRESENCE_WINDOW_GUARD: Aucun SessionPresence trouvé. Le talent doit effectuer son check-in GPS avant de passer en performed.' };
    }
  } catch (_) {}
  return { passed: true };
}

// ── Guard : EventCompletionGuard (performed → event_completed) ─
async function guardEventCompletion(context) {
  if (!context?.confirmedByOrganizer) {
    return { passed: false, reason: 'EVENT_COMPLETION_GUARD: confirmedByOrganizer requis dans context.' };
  }
  return { passed: true };
}

// ── Guard : PresenceProofGuard (contestation_window → payable) ─
async function guardPresenceProof(eng, base44) {
  try {
    const sots = await base44.entities.SOTSSubmission.filter(
      { engagementId: eng.systemId }, '-created_date', 1
    );
    if (!sots?.length) {
      return { passed: false, reason: "PRESENCE_PROOF_GUARD: Aucun SOTSSubmission trouvé. L'organisateur doit soumettre une évaluation SOTS." };
    }
  } catch (_) {}
  return { passed: true };
}

// ── Guard : BalancePaymentGuard v3.1 (deposit_secured → event_sealed) ─
// Résistant aux EPR fantômes (re-clics après paiement réussi).
// Cherche N'IMPORTE QUEL EPR balance succeeded/completed pour l'engagement.
// Les EPR pending fantômes créés par des clics multiples sont ignorés.
async function guardBalancePayment(eng, base44) {
  try {
    const allBalanceEprs = await base44.entities.EventPaymentRequest.filter({
      engagementId: eng.systemId,
      phase:        'balance',
    }, '-created_date', 20);

    if (!allBalanceEprs?.length) {
      // SoloFounderOverride : non bloquant pour le pilote.
      console.warn(`[BALANCE_PAYMENT_GUARD] Aucun EPR balance pour ${eng.systemId}. SoloFounderOverride actif.`);
      return {
        passed:  true,
        warning: 'BALANCE_NOT_PAID: SoloFounderOverride — scellement autorisé pilote. À désactiver Event 1.',
      };
    }

    const paidEpr = allBalanceEprs.find(e =>
      e.status === 'succeeded' || e.status === 'completed'
    );

    if (paidEpr) {
      const pendingCount = allBalanceEprs.filter(e => e.status === 'pending').length;
      return {
        passed: true,
        ...(pendingCount > 0 ? {
          warning: `BALANCE_PAYMENT_GUARD: ${pendingCount} EPR balance pending ignoré(s) — artefact(s) UX. EPR payé : ${paidEpr.systemId}.`,
        } : {}),
      };
    }

    const mostRecent = allBalanceEprs[0];
    return {
      passed: false,
      reason: `BALANCE_PAYMENT_GUARD: Aucun EPR balance encaissé pour ${eng.systemId}. EPR le plus récent : ${mostRecent.systemId} status="${mostRecent.status}". Attendre la confirmation Stripe.`,
    };

  } catch (err) {
    return { passed: true, warning: `BALANCE_PAYMENT_GUARD: Vérification échouée (${err.message}), accepté par défaut.` };
  }
}

// ── Guard : PayoutReadyGuard (payable → settled) ──────────────
// Mode pilote : SoloFounderOverride quand aucun PayoutExecutionRecord.
// IMPORTANT : le SoloFounderOverride est dans le bloc !records?.length,
// PAS seulement dans le catch. Sans cela, .filter() retourne [] sans
// exception → le catch est inatteignable → la garde bloquait toujours.
// À durcir pour Event 1 : remplacer passed:true par passed:false ici.
async function guardPayoutReady(eng, base44) {
  try {
    const records = await base44.entities.PayoutExecutionRecord.filter({
      engagementId: eng.systemId,
      talentUserId: eng.talentUserId,
    }, '-created_date', 1);

    if (!records?.length) {
      // SoloFounderOverride — mode pilote uniquement.
      // Le payout réel (Stripe Transfer + ledger 4310 DR / 5100 CR)
      // sera exécuté via executePayoutTransfer pour Event 1 commercial.
      console.warn(`[PAYOUT_READY_GUARD] Aucun PayoutExecutionRecord pour ${eng.systemId}. SoloFounderOverride actif.`);
      return { passed: true, warning: 'PAYOUT_READY_GUARD_OVERRIDE: SoloFounderOverride mode pilote.' };
    }

    return { passed: true };
  } catch (_) {
    return { passed: true, warning: 'PAYOUT_READY_GUARD_OVERRIDE: Vérification échouée, accepté en mode pilote.' };
  }
}

// ── Main ─────────────────────────────────────────────────────
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const me = await base44.auth.me();
    if (!me?.id) {
      return Response.json({ ok: false, error: 'AUTH_REQUIRED' }, { status: 401 });
    }

    const body = await req.json();
    const { engagementId, targetState, context = {} } = body;

    if (!engagementId) return Response.json({ ok: false, error: 'VALIDATION: engagementId obligatoire.' }, { status: 400 });
    if (!targetState)  return Response.json({ ok: false, error: 'VALIDATION: targetState obligatoire.' }, { status: 400 });

    const engagements = await base44.entities.Engagement.filter(
      { systemId: engagementId }, '-created_date', 1
    );
    if (!engagements?.length) {
      return Response.json({ ok: false, error: `NOT_FOUND: Engagement "${engagementId}" introuvable.` }, { status: 404 });
    }

    const eng = engagements[0];
    const currentState  = eng.status;
    const transitionKey = `${currentState}->${targetState}`;

    const rule = ALLOWED_TRANSITIONS[transitionKey];
    if (!rule) {
      return Response.json({
        ok: false, success: false,
        error: `TRANSITION_NOT_ALLOWED: "${transitionKey}" n'est pas une transition valide.`,
        currentState, targetState,
      }, { status: 422 });
    }

    if (WORM_STATES.has(currentState)) {
      return Response.json({
        ok: false, success: false,
        error: `WORM_GUARD: L'état "${currentState}" est immuable. Aucune transition possible.`,
      }, { status: 422 });
    }

    const isOrganizer = me.id === eng.organizerUserId;
    const isTalent    = me.id === eng.talentUserId;
    const isSystem    = me.id?.startsWith('USR-SYSTEM') || me.email?.includes('@system.');
    const actorRole   = isOrganizer ? 'organizer' : isTalent ? 'talent' : isSystem ? 'system' : null;

    if (!actorRole || !rule.allowedActors.includes(actorRole)) {
      return Response.json({
        ok: false, success: false,
        error: `ACTOR_NOT_AUTHORIZED: Rôle "${actorRole || 'inconnu'}" ne peut pas déclencher "${transitionKey}". Autorisés : ${rule.allowedActors.join(', ')}.`,
      }, { status: 403 });
    }

    // ── Guards spécifiques ────────────────────────────────────
    let guardResult = { passed: true };

    if      (transitionKey === 'event_sealed->performed')       guardResult = await guardPresenceWindow(eng, base44);
    else if (transitionKey === 'performed->event_completed')    guardResult = await guardEventCompletion(context);
    else if (transitionKey === 'contestation_window->payable')  guardResult = await guardPresenceProof(eng, base44);
    else if (transitionKey === 'deposit_secured->event_sealed') guardResult = await guardBalancePayment(eng, base44);
    else if (transitionKey === 'payable->settled')              guardResult = await guardPayoutReady(eng, base44);

    if (!guardResult.passed) {
      return Response.json({
        ok: false, success: false,
        error: guardResult.reason, guardResult,
      }, { status: 422 });
    }

    // ── Effectuer la transition ───────────────────────────────
    const now = new Date().toISOString();
    const updateFields = { status: targetState, updatedAt: now };

    if (targetState === 'event_completed')   updateFields.completedAt        = now;
    if (targetState === 'archived')          updateFields.archivedAt         = now;
    if (targetState.startsWith('cancel'))    updateFields.cancelledAt        = now;
    if (targetState === 'refunded')          updateFields.refundedAt         = now;
    if (targetState === 'deposit_secured')   updateFields.depositSecuredAt   = now;
    if (targetState === 'event_sealed')      updateFields.sealedAt           = now;

    await base44.entities.Engagement.update(eng.id, updateFields);

    return Response.json({
      ok: true, success: true,
      engagementId, previousState: currentState, newState: targetState,
      transitionKey, actorId: me.id, transitionedAt: now,
      ...(guardResult.warning ? { warning: guardResult.warning } : {}),
    });

  } catch (error) {
    console.error('[transitionEngagement]', error.message);
    return Response.json({ ok: false, success: false, error: error.message }, { status: 500 });
  }
});