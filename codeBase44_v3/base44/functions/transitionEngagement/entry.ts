/**
 * transitionEngagement — Base44 Function
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const ALLOWED_TRANSITIONS = {
  'placed->deposit_pending':                    { allowedActors: ['organizer'], financialGuard: false },
  'deposit_pending->deposit_secured':           { allowedActors: ['system'], financialGuard: true },
  'deposit_secured->event_sealed':              { allowedActors: ['organizer'], financialGuard: false },
  'event_sealed->performed':                    { allowedActors: ['talent'], financialGuard: false },
  'performed->event_completed':                 { allowedActors: ['organizer'], financialGuard: false },
  'event_completed->sots_window_closed':        { allowedActors: ['organizer', 'system'], financialGuard: false },
  'sots_window_closed->contestation_window':    { allowedActors: ['organizer', 'system'], financialGuard: false },
  'contestation_window->payable':               { allowedActors: ['organizer', 'system'], financialGuard: true },
  'payable->settled':                           { allowedActors: ['system'], financialGuard: true },
  'settled->archived':                          { allowedActors: ['system', 'organizer'], financialGuard: true },
  'sots_window_closed->no_show':                { allowedActors: ['organizer', 'system'], financialGuard: true },
  'no_show->refunded':                          { allowedActors: ['system'], financialGuard: true },
  'placed->cancelled_J30':                      { allowedActors: ['organizer', 'talent'], financialGuard: false },
  'deposit_pending->cancelled_J30':             { allowedActors: ['organizer'], financialGuard: false },
  'deposit_secured->cancelled_J7':              { allowedActors: ['organizer'], financialGuard: true },
};

const WORM_STATES = new Set([
  'event_sealed', 'archived', 'settled', 'no_show_pre_event', 'deposit_failed',
]);

async function guardPresenceWindow(eng, base44) {
  try {
    const presences = await base44.entities.SessionPresence.filter({
      engagementId: eng.systemId,
      talentUserId: eng.talentUserId,
    }, '-created_date', 1);
    if (!presences?.length) {
      return { passed: false, reason: 'PRESENCE_WINDOW_GUARD: Aucun SessionPresence trouvé. Le talent doit effectuer son check-in GPS avant de passer en performed.' };
    }
  } catch (_) {
    // Accepter en mode pilote si table vide
  }
  return { passed: true };
}

async function guardEventCompletion(context) {
  if (!context?.confirmedByOrganizer) {
    return { passed: false, reason: 'EVENT_COMPLETION_GUARD: confirmedByOrganizer requis dans context.' };
  }
  return { passed: true };
}

async function guardPresenceProof(eng, base44) {
  try {
    const sots = await base44.entities.SOTSSubmission.filter({
      engagementId: eng.systemId,
    }, '-created_date', 1);
    if (!sots?.length) {
      return { passed: false, reason: "PRESENCE_PROOF_GUARD: Aucun SOTSSubmission trouvé. L'organisateur doit soumettre une évaluation SOTS." };
    }
  } catch (_) {
    // Accepter en mode pilote
  }
  return { passed: true };
}

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
    if (!targetState) return Response.json({ ok: false, error: 'VALIDATION: targetState obligatoire.' }, { status: 400 });

    const engagements = await base44.entities.Engagement.filter(
      { systemId: engagementId }, '-created_date', 1
    );
    if (!engagements?.length) {
      return Response.json({ ok: false, error: `NOT_FOUND: Engagement "${engagementId}" introuvable.` }, { status: 404 });
    }

    const eng = engagements[0];
    const currentState = eng.status;
    const transitionKey = `${currentState}->${targetState}`;

    const rule = ALLOWED_TRANSITIONS[transitionKey];
    if (!rule) {
      return Response.json({
        ok: false, success: false,
        error: `TRANSITION_NOT_ALLOWED: "${transitionKey}" n'est pas une transition valide depuis l'état actuel.`,
        currentState, targetState,
      }, { status: 422 });
    }

    if (WORM_STATES.has(currentState)) {
      return Response.json({
        ok: false, success: false,
        error: `WORM_GUARD: L'état "${currentState}" est immuable (WORM). Aucune transition possible.`,
      }, { status: 422 });
    }

    const isOrganizer = me.id === eng.organizerUserId;
    const isTalent = me.id === eng.talentUserId;
    const isSystem = me.id?.startsWith('USR-SYSTEM') || me.email?.includes('@system.');
    const actorRole = isOrganizer ? 'organizer' : isTalent ? 'talent' : isSystem ? 'system' : null;

    if (!actorRole || !rule.allowedActors.includes(actorRole)) {
      return Response.json({
        ok: false, success: false,
        error: `ACTOR_NOT_AUTHORIZED: Votre rôle "${actorRole || 'inconnu'}" ne peut pas déclencher "${transitionKey}". Rôles autorisés : ${rule.allowedActors.join(', ')}.`,
      }, { status: 403 });
    }

    let guardResult = { passed: true };

    if (transitionKey === 'event_sealed->performed') {
      guardResult = await guardPresenceWindow(eng, base44);
    } else if (transitionKey === 'performed->event_completed') {
      guardResult = await guardEventCompletion(context);
    } else if (transitionKey === 'contestation_window->payable') {
      guardResult = await guardPresenceProof(eng, base44);
    }

    if (!guardResult.passed) {
      return Response.json({ ok: false, success: false, error: guardResult.reason, guardResult }, { status: 422 });
    }

    const now = new Date().toISOString();
    const updateFields = { status: targetState, updatedAt: now };

    if (targetState === 'event_completed') updateFields.completedAt = now;
    if (targetState === 'archived') updateFields.archivedAt = now;
    if (targetState.startsWith('cancel')) updateFields.cancelledAt = now;
    if (targetState === 'refunded') updateFields.refundedAt = now;
    if (targetState === 'deposit_secured') updateFields.depositSecuredAt = now;

    await base44.entities.Engagement.update(eng.id, updateFields);

    return Response.json({
      ok: true, success: true,
      engagementId, previousState: currentState, newState: targetState,
      transitionKey, actorId: me.id, transitionedAt: now,
    });

  } catch (error) {
    console.error('[transitionEngagement]', error.message);
    return Response.json({ ok: false, success: false, error: error.message }, { status: 500 });
  }
});