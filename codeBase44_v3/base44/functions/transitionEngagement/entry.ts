/**
 * transitionEngagement — Base44 Function v3.2
 * ============================================================
 * Machine d'état Engagement avec guards financiers.
 *
 * CHANGEMENTS v3 → v3.2 (27 mai 2026 — D-145 Option A) :
 *   guardBalancePayment : SoloFounderOverride supprimé.
 *   Guard bloquant strict aligné sur SealingGuard canonique.
 *   Catch basculé fail-closed (POLICYCONFIG-FAILCLOSED-01).
 *   La balance DOIT être encaissée (EPR succeeded) avant scellement.
 *   Aucune exception sans AdminIncidentRecord P0.
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

// ── createBase44Repositories — inline PHASE 3 ───────────────────────
// Reproduit src/repositories/adapters/base44-adapter.js dans le
// runtime Deno cloud Base44. Univers séparés — aucun import cross-env.
// Barrière LOI_TRANSITION_01_VIOLATION ancrée physiquement ici.
// Source : PORT-3 · PHASE 3 · 27 mai 2026
function createBase44Repositories(base44) {
  if (!base44 || !base44.entities) {
    throw new Error('ADAPTER_ERROR: base44.entities absent — SDK Base44 requis.');
  }
  const E = base44.entities;
  const nowIso = () => new Date().toISOString();

  return {
    engagements: {
      get:    (id)      => E.Engagement.get(id),
      list:   (f)       => E.Engagement.filter(f || {}),
      create: (payload) => E.Engagement.create(payload),
      update: async (id, payload) => {
        if (payload && Object.prototype.hasOwnProperty.call(payload, 'status')) {
          throw new Error(
            'LOI_TRANSITION_01_VIOLATION: update() ne peut pas modifier status. ' +
            'Utiliser transitionEngagement() exclusivement.'
          );
        }
        return E.Engagement.update(id, payload);
      },
      updateStatus: () => {
        throw new Error(
          'LOI_TRANSITION_01_VIOLATION: updateStatus() interdit. ' +
          'Utiliser transitionEngagement() exclusivement.'
        );
      },
    },
    events: {
      get:    (id)      => E.Event.get(id),
      list:   (f)       => E.Event.filter(f || {}),
      create: (payload) => E.Event.create(payload),
      update: (id, p)   => E.Event.update(id, p),
    },
    contractSnapshots: {
      create: (payload) => E.ContractSnapshot.create({ createdAt: nowIso(), ...payload }),
      get:    (id)      => E.ContractSnapshot.get(id),
      list:   (f)       => E.ContractSnapshot.filter(f || {}),
    },
    ledgerRecords: {
      append: (payload) => E.LedgerRecord.create(payload),
      list:   (f)       => E.LedgerRecord.filter(f || {}),
    },
    eventPaymentRequests: {
      get:    (id)      => E.EventPaymentRequest.get(id),
      list:   (f)       => E.EventPaymentRequest.filter(f || {}),
      create: (payload) => E.EventPaymentRequest.create(payload),
      update: (id, p)   => E.EventPaymentRequest.update(id, p),
    },
    policyConfig: {
      get:    (f)       => E.PolicyConfig.filter(f || {}),
      getOne: async (key) => {
        const rows = await E.PolicyConfig.filter({ key });
        return rows?.[0] ?? null;
      },
    },
    sessionPresence: {
      create: (payload) => E.SessionPresence.create(payload),
      list:   (f)       => E.SessionPresence.filter(f || {}),
      update: (id, p)   => E.SessionPresence.update(id, p),
    },
    payoutExecutionRecords: {
      create: (payload) => E.PayoutExecutionRecord.create(payload),
      list:   (f)       => E.PayoutExecutionRecord.filter(f || {}),
    },
    settlementInstructions: {
      get:    (id)      => E.SettlementInstruction.get(id),
      list:   (f)       => E.SettlementInstruction.filter(f || {}),
    },
    talentPaymentProfiles: {
      list:   (f)       => E.TalentPaymentProfile.filter(f || {}),
    },
    schedulerTasks: {
      create: (payload) => E.SchedulerDueTask.create({ ...payload, createdAt: nowIso() }),
      list:   (f)       => E.SchedulerDueTask.filter(f || {}),
      update: (id, p)   => E.SchedulerDueTask.update(id, p),
    },
    sotsSubmissions: {
      create: (payload) => E.SOTSSubmission.create(payload),
      list:   (f)       => E.SOTSSubmission.filter(f || {}),
    },
    sotsDimensionConfigs: {
      list:   (f)       => E.SOTSDimensionConfig.filter(f || {}),
    },
    reputationLedger: {
      create: (payload) => E.ReputationLedger.create(payload),
    },
    membershipPlans: {
      list:   (f)       => E.MembershipPlan.filter(f || {}),
    },
    userMemberships: {
      list:   (f)       => E.UserMembership.filter(f || {}),
      create: (payload) => E.UserMembership.create(payload),
      update: (id, p)   => E.UserMembership.update(id, p),
    },
    webhookProcessedLogs: {
      create: (payload) => E.WebhookProcessedLog.create(payload),
      list:   (f)       => E.WebhookProcessedLog.filter(f || {}),
    },
    stripePaymentSignals: {
      create: (payload) => E.StripePaymentSignal.create(payload),
      list:   (f)       => E.StripePaymentSignal.filter(f || {}),
    },
  };
}
// ── Fin createBase44Repositories ────────────────────────────────────



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

// ── Guard : BalancePaymentGuard v3.2 (deposit_secured → event_sealed) ─
// D-145 (27 mai 2026) — Option A : guard bloquant strict.
// SoloFounderOverride supprimé. Aligné sur SealingGuard canonique
// (src/core/guards/SealingGuard.js §Vérification 4).
// La balance DOIT être encaissée (EPR succeeded) avant tout scellement.
// Aucune exception sans AdminIncidentRecord P0.
async function guardBalancePayment(eng, base44) {
  try {
    const allBalanceEprs = await base44.entities.EventPaymentRequest.filter({
      engagementId: eng.systemId,
      phase:        'balance',
    }, '-created_date', 20);

    const paidEpr = (allBalanceEprs || []).find(e =>
      e.status === 'succeeded' || e.status === 'completed'
    );

    if (paidEpr) {
      const pendingCount = (allBalanceEprs || []).filter(e => e.status === 'pending').length;
      return {
        passed: true,
        ...(pendingCount > 0 ? {
          warning: `BALANCE_PAYMENT_GUARD: ${pendingCount} EPR balance pending ignoré(s) — artefact(s) UX. EPR payé : ${paidEpr.systemId}.`,
        } : {}),
      };
    }

    // Aucun EPR balance succeeded — bloquant strict (D-145 Option A).
    const detail = allBalanceEprs?.length
      ? `EPR le plus récent : ${allBalanceEprs[0].systemId} status="${allBalanceEprs[0].status}". Attendre la confirmation Stripe.`
      : `Aucun EPR balance trouvé pour ${eng.systemId}. Initier le paiement de la balance avant de sceller.`;

    return {
      passed: false,
      reason: `BALANCE_NOT_PAID: ${detail}`,
    };

  } catch (err) {
    // Fail-closed : une erreur de vérification bloque le scellement.
    // Source : POLICYCONFIG-FAILCLOSED-01, D-145 Option A.
    return {
      passed: false,
      reason: `BALANCE_PAYMENT_GUARD: Vérification échouée (${err.message}). Scellement bloqué par sécurité (fail-closed).`,
    };
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