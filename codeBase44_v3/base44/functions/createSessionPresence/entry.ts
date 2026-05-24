/**
 * createSessionPresence — Base44 Function
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
    const { engagementId, gpsLatitude, gpsLongitude, gpsAccuracyMeters, checkedInAt } = body;

    if (!engagementId) return Response.json({ ok: false, error: 'VALIDATION: engagementId obligatoire.' }, { status: 400 });
    if (gpsLatitude == null) return Response.json({ ok: false, error: 'VALIDATION: gpsLatitude obligatoire.' }, { status: 400 });
    if (gpsLongitude == null) return Response.json({ ok: false, error: 'VALIDATION: gpsLongitude obligatoire.' }, { status: 400 });

    const engagements = await base44.entities.Engagement.filter(
      { systemId: engagementId }, '-created_date', 1
    );
    if (!engagements?.length) {
      return Response.json({ ok: false, error: `NOT_FOUND: Engagement "${engagementId}" introuvable.` }, { status: 404 });
    }

    const eng = engagements[0];

    if (me.id !== eng.talentUserId) {
      return Response.json({ ok: false, error: 'FORBIDDEN: Seul le talent de cet engagement peut effectuer le check-in.' }, { status: 403 });
    }

    const validStates = ['event_sealed', 'deposit_secured'];
    if (!validStates.includes(eng.status)) {
      return Response.json({
        ok: false,
        error: `INVALID_STATE: Check-in impossible en état "${eng.status}". États valides : ${validStates.join(', ')}.`,
      }, { status: 422 });
    }

    const existing = await base44.entities.SessionPresence.filter({
      engagementId: eng.systemId,
      talentUserId: eng.talentUserId,
    }, '-created_date', 1).catch(() => []);

    if (existing?.length) {
      return Response.json({
        ok: true, idempotent: true,
        sessionPresenceId: existing[0].systemId,
        message: 'SessionPresence déjà enregistrée pour cet engagement.',
      });
    }

    const systemId = generateId('SPR');
    const now = new Date().toISOString();

    await base44.entities.SessionPresence.create({
      systemId,
      engagementId: eng.systemId,
      talentUserId: eng.talentUserId,
      checkInAt: Date.now(),
      gpsCoordinates: JSON.stringify({
        lat: gpsLatitude,
        lng: gpsLongitude,
        accuracyMeters: gpsAccuracyMeters || null,
      }),
      signalTypes: ['GPS'],
      createdAt: now,
    });

    return Response.json({
      ok: true,
      sessionPresenceId: systemId,
      engagementId: eng.systemId,
      talentUserId: eng.talentUserId,
      gpsLatitude, gpsLongitude,
      gpsAccuracyMeters: gpsAccuracyMeters || null,
      distanceMeters: null,
      checkedInAt: checkedInAt || now,
      message: 'Présence enregistrée.',
    });

  } catch (error) {
    console.error('[createSessionPresence]', error.message);
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});