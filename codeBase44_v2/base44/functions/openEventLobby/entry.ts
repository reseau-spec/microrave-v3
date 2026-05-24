// deploy: v5
// openEventLobby — Ouvre ou récupère le lobby d'un événement.
//
// GUARD DE RÉALITÉ (v4 — révisé)
//
//   GUARD GÉOGRAPHIQUE — organisateur doit être sur place
//     Appliqué uniquement SI la session démarre (transition lobby → in_progress).
//     L'ouverture du lobby elle-même (configuration, lineup) est libre en temps.
//     Raison : l'organisateur doit pouvoir préparer son lineup AVANT d'être sur place.
//
//   GUARD TEMPOREL — retiré de openEventLobby
//     Déplacé dans enterEventSession (check-in artiste/audience).
//     La présence physique est vérifiée au check-in, pas à l'ouverture du lobby.
//
//   GUARD GÉO sur openEventLobby (optionnel, soft)
//     Si geoLat/geoLng sont fournis ET que la session passe en "ready" (tous slots confirmés),
//     on vérifie que l'organisateur est sur place. Sinon : log seulement.
//
// CHANGEMENTS v5 — Fix LineupBoard "Aucune scène ou plage configurée" :
//
//   PROBLÈME v4 :
//   openEventLobby écrit lineupScenes dans moodFilterSnapshot seulement si
//   bodyScenes est fourni dans le body de l'appel.
//   CreateEvent.jsx envoie les scènes → ✅
//   Events.jsx (handleOpenLobby) n'envoie PAS les scènes → snapData = {} → ❌
//   → getEventLobby retourne scenes=[] → LineupBoard affiche le message d'erreur.
//
//   FIX v5 :
//   Si bodyScenes est vide, fallback sur event.scenes et event.schedule
//   (champs écrits par CreateEvent sur l'entité Event au moment de la sauvegarde).
//   Ordre de priorité : bodyScenes > event.scenes > []
//   Idem pour la session existante : si lineupScenes absent du snapshot,
//   patcher depuis event.scenes même sans bodyScenes.
//
// PHILOSOPHIE
//   openEventLobby = ouverture administrative (peut se faire depuis chez soi)
//   enterEventSession = présence physique réelle (doit se faire sur les lieux)

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

// ── Constantes ────────────────────────────────────────────────────────────────
const GEO_MAX_DISTANCE_M = 200; // 200m pour vérification optionnelle

// ── Helpers ───────────────────────────────────────────────────────────────────
function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function asArray(v) {
  return Array.isArray(v) ? v : [];
}

function buildSlotsFromRolesNeeded(rolesNeeded, sessionId) {
  return rolesNeeded.map((roleSystemId, i) => ({
    slotId: `SL-${sessionId}-${i}`,
    roleSystemId,
    status: 'open',
    candidateUserId: null,
    candidateStyleSystemIds: [],
    confirmedAt: null,
    confirmedBy: null,
  }));
}

function haversineM(lat1, lon1, lat2, lon2) {
  const R = 6_371_000;
  const toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Handler principal ─────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return json(401, { error: 'Unauthorized' });

    const body = await req.json();
    const {
      eventId,
      scenes: bodyScenes,
      schedule: bodySchedule,
      // Coordonnées GPS de l'organisateur (optionnel à cette étape)
      geoLat,
      geoLng,
    } = body;

    if (!eventId) return json(400, { error: 'eventId is required' });

    const service = base44.asServiceRole;

    // ── Charger l'event ───────────────────────────────────────────────────────
    const events = await service.entities.Event.filter({ id: eventId });
    const event = events?.[0];
    if (!event) return json(404, { error: 'Event not found' });

    const organizerId = event.organizerId || event.organizerUserId;
    if (organizerId !== user.id) {
      return json(403, { error: 'Forbidden', code: 'NOT_ORGANIZER' });
    }

    if (event.status === 'completed') {
      return json(400, { error: 'Cet événement est terminé.', code: 'EVENT_COMPLETED' });
    }

    // ── GUARD GÉO (soft) — log seulement, ne bloque pas ─────────────────────
    // Le guard dur est dans enterEventSession (check-in artiste sur place).
    if (geoLat != null && geoLng != null && event.checkpointId) {
      const checkpoints = await service.entities.Checkpoint.filter({ id: event.checkpointId }).catch(() => []);
      const cp = checkpoints?.[0];
      if (cp?.geoLat && cp?.geoLng) {
        const distanceM = Math.round(haversineM(geoLat, geoLng, cp.geoLat, cp.geoLng));
        if (distanceM > GEO_MAX_DISTANCE_M) {
          // Log pour monitoring — ne bloque pas l'ouverture du lobby
          console.warn(`[openEventLobby] GEO_SOFT_FAIL: organizer=${user.id} dist=${distanceM}m checkpoint=${cp.name} (ouverture autorisée quand même)`);
        } else {
          console.log(`[openEventLobby] geo OK: organizer=${user.id} dist=${distanceM}m checkpoint=${cp.name}`);
        }
      }
    }

    // ── Session existante ? ───────────────────────────────────────────────────
    const allExisting = await service.entities.Session.filter({ eventId, sessionType: 'event' });
    const TERMINAL = ['completed', 'archived', 'aborted'];
    const existing = (allExisting || []).filter((s) => !TERMINAL.includes(s.status));

    if (existing?.length > 0) {
      const sess = existing[0];
      const snap = sess.moodFilterSnapshot || {};
      // v5 fix : fallback sur event.scenes si bodyScenes est vide
      const patchScenes   = asArray(bodyScenes).length > 0
        ? asArray(bodyScenes)
        : asArray(event.scenes);
      const patchSchedule = asArray(bodySchedule).length > 0
        ? asArray(bodySchedule)
        : asArray(event.schedule);
      const hasScenes = asArray(snap.lineupScenes).length > 0;

      if (!hasScenes && patchScenes.length > 0) {
        const patched = await service.entities.Session.update(sess.id, {
          moodFilterSnapshot: { ...snap, lineupScenes: patchScenes, lineupSchedule: patchSchedule },
        });
        return json(200, { ok: true, session: patched, created: false, patched: true });
      }

      return json(200, { ok: true, session: sess, created: false });
    }

    // ── Nouvelle session ──────────────────────────────────────────────────────
    // event.checkpointId est le systemId (source de vérité — ex: NC-0000000165)
    // On le stocke directement sur la session pour que enterEventSession puisse
    // résoudre le checkpoint sans ambiguïté.
    const created = await service.entities.Session.create({
      eventId,
      sessionType: 'event',
      status: 'lobby',
      hostUserId: user.id,
      checkpointSystemId: event.checkpointId || null,
      slots: [],
      participants: [],
    });

    const slots = buildSlotsFromRolesNeeded(asArray(event.rolesNeeded), created.id);
    // v5 fix : fallback sur event.scenes/event.schedule si bodyScenes est vide
    // Events.jsx n'envoie pas les scènes → on les lit depuis l'entité Event
    const scenes   = asArray(bodyScenes).length > 0
      ? asArray(bodyScenes)
      : asArray(event.scenes);
    const schedule = asArray(bodySchedule).length > 0
      ? asArray(bodySchedule)
      : asArray(event.schedule);
    const snapData = scenes.length > 0 ? { lineupScenes: scenes, lineupSchedule: schedule } : {};

    const updated = await service.entities.Session.update(created.id, {
      slots,
      moodFilterSnapshot: snapData,
    });

    console.log(`[openEventLobby] CREATED session=${created.id} eventId=${eventId} organizer=${user.id}`);

    return json(200, { ok: true, session: updated, created: true });

  } catch (error) {
    console.error('[openEventLobby]', error?.message);
    return json(500, { error: error.message });
  }
});