/**
 * submitSOTSRating — Base44 Function
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

function generateId(prefix) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const s1 = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  const s2 = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `${prefix}-${s1}-${s2}`;
}

const VALID_STATES_FOR_SOTS = ['event_completed', 'sots_window_closed', 'contestation_window'];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const me = await base44.auth.me();
    if (!me?.id) return Response.json({ ok: false, error: 'AUTH_REQUIRED' }, { status: 401 });

    const body = await req.json();
    const { engagementId, ratingScore, note } = body;

    if (!engagementId) return Response.json({ ok: false, error: 'VALIDATION: engagementId obligatoire.' }, { status: 400 });
    if (!ratingScore || ratingScore < 1 || ratingScore > 5) {
      return Response.json({ ok: false, error: 'VALIDATION: ratingScore doit être entre 1 et 5.' }, { status: 400 });
    }

    const engagements = await base44.entities.Engagement.filter(
      { systemId: engagementId }, '-created_date', 1
    );
    if (!engagements?.length) {
      return Response.json({ ok: false, error: `NOT_FOUND: Engagement "${engagementId}" introuvable.` }, { status: 404 });
    }

    const eng = engagements[0];

    // D-094 PATTERN 6 — Auto-note absolument bloquée
    if (me.id === eng.talentUserId) {
      return Response.json({
        ok: false,
        error: 'SOTS_SELF_BENEFICIAL: Auto-note bloquée. D-094 pattern 6.',
      }, { status: 422 });
    }

    const isOrganizer = me.id === eng.organizerUserId;
    if (!isOrganizer) {
      return Response.json({
        ok: false,
        error: "FORBIDDEN: Seul l'organisateur peut soumettre une note SOTS dans le MVP.",
      }, { status: 403 });
    }

    if (!VALID_STATES_FOR_SOTS.includes(eng.status)) {
      return Response.json({
        ok: false,
        error: `INVALID_STATE: SOTS impossible en état "${eng.status}". États valides : ${VALID_STATES_FOR_SOTS.join(', ')}.`,
      }, { status: 422 });
    }

    const existing = await base44.entities.SOTSSubmission.filter({
      engagementId: eng.systemId,
      submittedBy: me.id,
    }, '-created_date', 1).catch(() => []);

    if (existing?.length) {
      return Response.json({
        ok: true, idempotent: true,
        sotsId: existing[0].systemId,
        message: 'SOTSSubmission déjà enregistrée par cet évaluateur pour cet engagement.',
      });
    }

    const scoreCategories = {
      global: ratingScore,
      ponctualite: ratingScore,
      qualite: ratingScore,
      communication: ratingScore,
      respect: ratingScore,
    };

    const systemId = generateId('SOT');
    const now = new Date().toISOString();

    await base44.entities.SOTSSubmission.create({
      systemId,
      engagementId: eng.systemId,
      submittedBy: me.id,
      talentUserId: eng.talentUserId,
      role: 'organisateur',
      scores: JSON.stringify(scoreCategories),
      note: note || '',
      consolidated: false,
      createdAt: now,
    });

    return Response.json({
      ok: true,
      sotsId: systemId,
      engagementId: eng.systemId,
      talentUserId: eng.talentUserId,
      submittedBy: me.id,
      ratingScore, scoreCategories,
      createdAt: now,
      message: 'Note SOTS enregistrée.',
    });

  } catch (error) {
    console.error('[submitSOTSRating]', error.message);
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});