/**
 * getEngagement — Base44 Function
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const me = await base44.auth.me();
    if (!me?.id) {
      return Response.json({ ok: false, error: 'AUTH_REQUIRED' }, { status: 401 });
    }

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

    const isOrganizer = me.id === eng.organizerUserId;
    const isTalent = me.id === eng.talentUserId;

    if (!isOrganizer && !isTalent) {
      return Response.json({
        ok: false,
        error: "FORBIDDEN: Accès refusé — vous n'êtes ni l'organisateur ni le talent de cet engagement.",
      }, { status: 403 });
    }

    let eventName = '';
    let venueAddress = '';
    let scheduledStartAt = '';

    if (eng.eventId) {
      try {
        const events = await base44.entities.Event.filter(
          { systemId: eng.eventId }, '-created_date', 1
        );
        if (events?.length) {
          eventName = events[0].name || '';
          venueAddress = events[0].venue || '';
          scheduledStartAt = events[0].scheduledStartAt || '';
        }
      } catch (_) {}
    }

    const engagement = {
      systemId:             eng.systemId,
      eventId:              eng.eventId,
      talentUserId:         eng.talentUserId,
      organizerUserId:      eng.organizerUserId,
      status:               eng.status,
      cachetSigneCents:     eng.cachetSigneCents ?? 0,
      tauxPpm:              eng.tauxPpm ?? 120000,
      commissionMrCents:    eng.commissionMrCents ?? 0,
      talentNetCents:       eng.talentNetCents ?? 0,
      depositCents:         eng.depositCents ?? 0,
      balanceCents:         eng.balanceCents ?? 0,
      prixVenduClientCents: eng.prixVenduClientCents ?? 0,
      tpsCents:             eng.tpsCents ?? 0,
      tvqCents:             eng.tvqCents ?? 0,
      currency:             eng.currency || 'cad',
      roleMetier:           eng.roleMetier || '',
      description:          eng.description || '',
      confirmedAt:          eng.confirmedAt || null,
      completedAt:          eng.completedAt || null,
      cancelledAt:          eng.cancelledAt || null,
      createdAt:            eng.createdAt,
      eventName,
      venueAddress,
      eventDate:            scheduledStartAt,
      _base44Id:            eng.id,
    };

    return Response.json({ ok: true, engagement });

  } catch (error) {
    console.error('[getEngagement]', error.message);
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});