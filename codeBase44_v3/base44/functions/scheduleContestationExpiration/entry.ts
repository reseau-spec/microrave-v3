/**
 * scheduleContestationExpiration — Base44 Function
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



function generateId(prefix) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const s1 = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  const s2 = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `${prefix}-${s1}-${s2}`;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const me = await base44.auth.me();
    if (!me?.id) return Response.json({ ok: false, error: 'AUTH_REQUIRED' }, { status: 401 });

    const body = await req.json();
    const { engagementId } = body;

    if (!engagementId) {
      return Response.json({ ok: false, error: 'VALIDATION: engagementId obligatoire.' }, { status: 400 });
    }

    const engagements = await base44.entities.Engagement.filter(
      { systemId: engagementId }, '-created_date', 1
    );
    if (!engagements?.length) {
      return Response.json({ ok: false, error: `NOT_FOUND: Engagement "${engagementId}" introuvable.` }, { status: 404 });
    }

    const eng = engagements[0];

    if (eng.status !== 'contestation_window') {
      return Response.json({
        ok: false,
        error: `INVALID_STATE: L'engagement doit être en "contestation_window". État actuel : "${eng.status}".`,
      }, { status: 422 });
    }

    const isOrganizer = me.id === eng.organizerUserId;
    const isSystem = me.id?.startsWith('USR-SYSTEM') || me.email?.includes('@system.');
    if (!isOrganizer && !isSystem) {
      return Response.json({ ok: false, error: "FORBIDDEN: Seul l'organisateur peut planifier l'expiration." }, { status: 403 });
    }

    // Idempotence
    const existing = await base44.entities.SchedulerDueTask.filter({
      engagementId: eng.systemId,
      taskType: 'CONTESTATION_WINDOW_EXPIRATION',
      status: 'pending',
    }, '-created_date', 1).catch(() => []);

    if (existing?.length) {
      return Response.json({
        ok: true, idempotent: true,
        taskId: existing[0].systemId,
        dueAt: existing[0].dueAt,
        durationHours: Math.round((existing[0].dueAt - Date.now()) / 3_600_000),
        message: 'SchedulerDueTask existante retournée.',
      });
    }

    let durationHours = 24;
    try {
      const configs = await base44.entities.PolicyConfig.filter(
        { key: 'contestationWindowDurationHours' }, '-created_date', 1
      );
      if (configs?.length) durationHours = Number(configs[0].value);
    } catch (_) {}

    const dueAt = Date.now() + durationHours * 3_600_000;
    const systemId = generateId('SCH');
    const now = new Date().toISOString();

    await base44.entities.SchedulerDueTask.create({
      systemId,
      engagementId: eng.systemId,
      taskType: 'CONTESTATION_WINDOW_EXPIRATION',
      dueAt,
      status: 'pending',
      attemptCount: 0,
      contextOverrides: JSON.stringify({
        targetState: 'payable',
        actorId: 'SYSTEM',
        reason: `Expiration fenêtre de contestation — ${durationHours}h sans litige.`,
        scheduledBy: me.id,
        scheduledAt: now,
      }),
      createdAt: now,
    });

    return Response.json({
      ok: true,
      taskId: systemId,
      engagementId: eng.systemId,
      taskType: 'CONTESTATION_WINDOW_EXPIRATION',
      dueAt,
      dueAtISO: new Date(dueAt).toISOString(),
      durationHours,
      message: `Fenêtre de contestation planifiée — expiration dans ${durationHours}h.`,
    });

  } catch (error) {
    console.error('[scheduleContestationExpiration]', error.message);
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});