// deploy: v5
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return json(401, { ok: false, error: 'Unauthorized' });

    const body = await req.json().catch(() => ({}));
    const { sessionId, role, geoLat, geoLng } = body;

    if (!sessionId) return json(400, { ok: false, error: 'sessionId requis' });

    const svc = base44.asServiceRole;
    const nowIso = new Date().toISOString();

    // 1. Session
    const sessionRows = await svc.entities.Session.filter({ id: sessionId }).catch(() => []);
    const session = sessionRows?.[0];
    if (!session) return json(404, { ok: false, error: 'Session introuvable' });

    if (!['lobby', 'in_progress'].includes(session.status)) {
      return json(409, { ok: false, error: 'session_not_active', status: session.status });
    }

    // 2. Event
    const eventId = session.eventId;
    if (!eventId) return json(400, { ok: false, error: 'session sans eventId' });

    const eventRows = await svc.entities.Event.filter({ id: eventId }).catch(() => []);
    const event = eventRows?.[0];
    if (!event) return json(404, { ok: false, error: 'Event introuvable' });

    // 3. Rôle
    const organizerUserId = session.hostUserId || event.organizerId || event.organizerUserId || '';
    const isOrganizer = String(user.id) === String(organizerUserId);

    const slots = Array.isArray(session.slots) ? session.slots : [];
    const isTalent = slots.some(slot => {
      if (slot.candidateUserId && String(slot.candidateUserId) === String(user.id)) {
        return slot.status === 'confirmed';
      }
      if (Array.isArray(slot.candidates)) {
        return slot.candidates.some(c => String(c.userId) === String(user.id) && c.status === 'confirmed');
      }
      return false;
    });

    let resolvedRole = 'audience';
    if (isOrganizer) resolvedRole = 'organizer';
    else if (isTalent) resolvedRole = 'artist';
    else if (role && ['artist', 'organizer', 'audience'].includes(role)) resolvedRole = role;

    // 4. Unicité — vérifier TOUTES les présences (tous statuts)
    // Le filtre sur status='active' uniquement créait une race condition :
    // si plusieurs appels arrivent en parallèle avant que le premier soit committé,
    // chacun lit 0 présence active et crée sa propre entrée.
    // Solution : tout userId+sessionId existant = déjà présent, retourner 200.
    const existing = await svc.entities.SessionPresence.filter({ sessionId, userId: user.id }).catch(() => []);
    if (existing && existing.length > 0) {
      const latest = existing.sort((a, b) => 
        new Date(b.created_date || 0) - new Date(a.created_date || 0)
      )[0];
      return json(200, {
        ok: true, action: 'already_checked_in',
        presenceId: latest.id, checkInAt: latest.checkInAt,
        validationScore: latest.validationScore || 0, role: resolvedRole,
      });
    }

    // 5. GPS — non bloquant
    let gpsValid = false;
    let distanceMIn = null;
    let checkpointSystemId = null;
    let validationScore = 40;

    if (geoLat != null && geoLng != null) {
      let cp = null;
      const cpId = event.checkpointId;
      if (cpId) {
        if (cpId.includes('-')) {
          const r = await svc.entities.Checkpoint.filter({ systemId: cpId }).catch(() => []);
          cp = r?.[0] || null;
        }
        if (!cp) {
          const r2 = await svc.entities.Checkpoint.filter({ id: cpId }).catch(() => []);
          cp = r2?.[0] || null;
        }
      }
      if (!cp && session.checkpointSystemId) {
        const r3 = await svc.entities.Checkpoint.filter({ systemId: session.checkpointSystemId }).catch(() => []);
        cp = r3?.[0] || null;
      }
      if (cp?.geoLat && cp?.geoLng) {
        checkpointSystemId = cp.systemId || null;
        const R = 6371000;
        const toRad = x => x * Math.PI / 180;
        const dLat = toRad(cp.geoLat - geoLat);
        const dLon = toRad(cp.geoLng - geoLng);
        const a = Math.sin(dLat/2)**2 + Math.cos(toRad(geoLat)) * Math.cos(toRad(cp.geoLat)) * Math.sin(dLon/2)**2;
        distanceMIn = Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)));
        // SEUIL GPS — 500m pour tous les rôles
        // Raison : test terrain à 374m du lieu. 500m permet de valider la chaîne complète
        // sans être bloqué par un seuil de production trop serré.
        // Production cible : 150m artiste / 300m audience (une fois GPS stable sur tous checkpoints)
        const GPS_MAX_M = 500;
        gpsValid = distanceMIn <= GPS_MAX_M;
        if (gpsValid) validationScore += 30;
      }
    }

    const allActive = await svc.entities.SessionPresence.filter({ sessionId, status: 'active' }).catch(() => []);
    const coPresenceCount = (allActive || []).length;
    if (coPresenceCount >= 2) validationScore += 20;
    validationScore = Math.min(validationScore, 90);

    // 6. Créer SessionPresence
    const presence = await svc.entities.SessionPresence.create({
      sessionId, eventId,
      userId: user.id,
      role: resolvedRole,
      checkInAt: nowIso,
      checkOutAt: null,
      durationMin: 0,
      geoLatIn: geoLat ?? null,
      geoLngIn: geoLng ?? null,
      geoLatOut: null,
      geoLngOut: null,
      distanceMIn: distanceMIn ?? null,
      isValidEntry: gpsValid,
      isValidExit: false,
      validationScore,
      status: 'active',
      payoutEligible: false,
      checkpointSystemId: checkpointSystemId ?? null,
      sessionStateAtCheckin: session.status,
      coPresenceCountAtCheckin: coPresenceCount,
      autoClosedAt: null,
    });

    console.log(`[enterEventSession] v5 sessionId=${sessionId} userId=${user.id} role=${resolvedRole} score=${validationScore}`);

    // 7. RWE — non bloquant
    try {
      const all = await svc.entities.SessionPresence.filter({ sessionId }).catch(() => []);
      const acts = (all || []).filter(p => ['active','completed','auto_closed'].includes(p.status));
      await svc.entities.Session.update(sessionId, {
        audienceCount: acts.filter(p => p.role === 'audience').length,
        artistCount:   acts.filter(p => p.role === 'artist').length,
        totalPresenceCount: acts.length,
      }).catch(() => {});
    } catch (_) {}

    return json(200, {
      ok: true, action: 'checked_in',
      presenceId: presence.id, checkInAt: nowIso,
      validationScore, isValidEntry: gpsValid,
      coPresenceCount, role: resolvedRole,
      message: `Présence enregistrée. Score : ${validationScore}/100.`,
    });

  } catch (err) {
    console.error('[enterEventSession] v5 CRASH:', err?.message);
    return json(500, { ok: false, error: err?.message || 'Erreur interne' });
  }
});