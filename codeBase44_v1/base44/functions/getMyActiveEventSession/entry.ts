/**
 * getMyActiveEventSession
 * Retourne la session event in_progress dont l'utilisateur est participant ou organisateur.
 * Utilisée par Home.jsx pour afficher une bannière "Ta session a démarré".
 */
// deploy: v2
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

function asArray(v) { return Array.isArray(v) ? v : []; }

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ ok: true, session: null });

    const service = base44.asServiceRole;

    // ⚠️ R1 : filter sur status (champ indexé), filtrage JS sur sessionType ensuite
    const inProgressSessions = await service.entities.Session.filter({ status: 'in_progress' });
    const activeSessions = (inProgressSessions || []).filter(s => s.sessionType === 'event');

    if (activeSessions.length === 0) return Response.json({ ok: true, session: null });

    // Trouver celle où l'user est participant confirmé ou organisateur
    for (const s of activeSessions) {
      const isOrganizer = s.hostUserId === user.id;
      const isParticipant = asArray(s.participants).some(
        p => p.userId === user.id && p.status === 'confirmed'
      );
      if (!isOrganizer && !isParticipant) continue;

      // ⚠️ R1 : filter par id (champ indexé) — 1 seul Event ciblé
      if (s.eventId) {
        const events = await service.entities.Event.filter({ id: s.eventId }).catch(() => []);
        const ev = (events || [])[0] || null;
        eventName = ev?.name || ev?.title || null;
      }

      return Response.json({
        ok: true,
        session: {
          id: s.id,
          eventId: s.eventId,
          eventName,
          status: s.status,
          isOrganizer,
        }
      });
    }

    return Response.json({ ok: true, session: null });

  } catch (err) {
    console.error('[getMyActiveEventSession]', err?.message);
    return Response.json({ ok: true, session: null }); // fail silently
  }
});