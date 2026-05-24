/**
 * inviteTalentToSlot — 6-E : Invitation directe d'un talent sur un slot.
 *
 * FLOW :
 *   1. Organisateur recherche un talent par nom
 *   2. Frontend appelle inviteTalentToSlot { sessionId, slotId, talentUserId }
 *   3. Le talent est ajouté dans slot.candidates[] avec status='invited'
 *   4. L'organisateur peut ensuite appeler proposePriceToTalent normalement
 *   5. Le talent reçoit une notification email
 */

// deploy: v1
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function normalizeId(v) {
  if (!v) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'object') return String(v.systemId || v.id || v._id || v.value || '');
  return String(v);
}

function asArray(v) { return Array.isArray(v) ? v : []; }

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return json(401, { ok: false, error: 'Unauthorized' });

    const body = await req.json().catch(() => ({}));
    const { sessionId, slotId, talentUserId, styleSystemIds, sendNotification } = body;

    if (!sessionId || !slotId || !talentUserId) {
      return json(400, { ok: false, error: 'sessionId, slotId et talentUserId requis' });
    }

    const svc = base44.asServiceRole;
    const sessions = await svc.entities.Session.filter({ id: sessionId });
    const session = sessions?.[0];
    if (!session) return json(404, { ok: false, error: 'Session introuvable' });

    if (session.sessionType !== 'event') {
      return json(400, { ok: false, error: 'inviteTalentToSlot uniquement pour les sessions event', code: 'NOT_EVENT_SESSION' });
    }

    // Vérifier que l'appelant est l'organisateur
    const evList = await svc.entities.Event.filter({ id: session.eventId }).catch(() => []);
    const ev = evList?.[0];
    const isOrganizer = (ev && (normalizeId(ev.organizerId) === normalizeId(user.id) || normalizeId(ev.organizerUserId) === normalizeId(user.id)))
      || normalizeId(session.hostUserId) === normalizeId(user.id);
    if (!isOrganizer) {
      return json(403, { ok: false, error: "Seul l'organisateur peut inviter directement", code: 'NOT_ORGANIZER' });
    }

    // Vérifier que le talent existe
    const talentUsers = await svc.entities.User.filter({ id: talentUserId }).catch(() => []);
    if (!talentUsers?.[0]) {
      return json(404, { ok: false, error: 'Talent introuvable', code: 'TALENT_NOT_FOUND' });
    }

    // Charger les slots
    const slots = asArray(session.slots);
    const slot = slots.find(s => normalizeId(s.slotId) === normalizeId(slotId));
    if (!slot) return json(404, { ok: false, error: 'Slot introuvable', code: 'SLOT_NOT_FOUND' });

    // Vérifier que le talent n'est pas déjà dans candidates[]
    const existingCand = asArray(slot.candidates).find(c => normalizeId(c.userId) === normalizeId(talentUserId));
    if (existingCand) {
      return json(200, {
        ok: true,
        action: 'already_candidate',
        status: existingCand.status,
        message: `Talent déjà dans les candidatures (status: ${existingCand.status})`,
      });
    }

    // Ajouter le talent avec status='invited'
    const nowIso = new Date().toISOString();
    const newCand = {
      userId: normalizeId(talentUserId),
      styleSystemIds: asArray(styleSystemIds).filter(Boolean),
      status: 'invited',
      appliedAt: null,
      invitedAt: nowIso,
      confirmedAt: null,
    };

    slot.candidates = [...asArray(slot.candidates), newCand];

    // Mettre à jour la session
    await svc.entities.Session.update(sessionId, { slots });

    console.log(`[inviteTalentToSlot] v1 sessionId=${sessionId} slotId=${slotId} talentUserId=${talentUserId} by organizer=${user.id}`);

    // Notification optionnelle au talent
    if (sendNotification !== false) {
      try {
        const talentProfiles = await svc.entities.TalentProfile.filter({ userId: talentUserId }).catch(() => []);
        const talentProfile = talentProfiles?.[0];
        const talentUser = talentUsers[0];
        const eventTitle = ev?.title || 'un événement';

        if (talentUser?.email) {
          const origin = req.headers.get('origin') || 'https://app.microrave.ca';
          const lobbyUrl = `${origin}/EventLobby?eventId=${session.eventId}`;

          await svc.integrations.Core.SendEmail({
            to: talentUser.email,
            subject: `Invitation directe — ${eventTitle}`,
            body: `Bonjour ${talentProfile?.displayName || talentUser.full_name || 'Talent'},

Vous avez reçu une invitation directe de l'organisateur pour participer à :

🎉 ${eventTitle}

L'organisateur souhaite discuter des conditions de votre participation.

👉 Voir l'invitation :
${lobbyUrl}

—
Micro Rave · Plateforme d'orchestration événementielle`.trim(),
            from_name: 'Micro Rave',
          }).catch(e => console.warn('[inviteTalentToSlot] email failed:', e?.message));
        }
      } catch (notifErr) {
        console.warn('[inviteTalentToSlot] notification failed (non-fatal):', notifErr?.message);
      }
    }

    return json(200, {
      ok: true,
      action: 'invited',
      talentUserId: normalizeId(talentUserId),
      slotId: normalizeId(slotId),
      message: 'Talent invité avec succès — vous pouvez maintenant proposer un prix.',
    });

  } catch (err) {
    console.error('[inviteTalentToSlot]', err?.message);
    return json(500, { ok: false, error: err?.message || 'Erreur interne' });
  }
});