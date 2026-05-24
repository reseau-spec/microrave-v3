/**
 * scheduleContestationExpiration — Base44 Function
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

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