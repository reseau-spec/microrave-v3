/**
 * createSessionPresence — Base44 Function v2
 * ============================================================
 * Check-in GPS talent. Enregistre la présence et calcule
 * la distance haversine entre le GPS du talent et le Checkpoint
 * de l'Event.
 *
 * CHANGEMENTS v1 → v2 (27 mai 2026 — B-D-01) :
 *   Calcul haversine ajouté. Le rayon acceptable est lu depuis
 *   Checkpoint.radiusKm — data-driven, pas hardcodé.
 *   Si radiusKm change en base, le comportement s'adapte
 *   sans toucher au code.
 *
 *   Champs ajoutés à SessionPresence :
 *     gpsDistanceMeters  — distance calculée (haversine)
 *     withinRadius       — gpsDistanceMeters ≤ radiusKm × 1000
 *     checkpointId       — CKP-* utilisé pour le calcul
 *     radiusMetersUsed   — rayon au moment du check-in (audit WORM)
 *
 *   Comportement si Checkpoint absent / sans coordonnées :
 *     → check-in autorisé, distanceMeters = null, withinRadius = null
 *     → warning loggué, pas de blocage (PresenceProofGuard tranche)
 *
 *   Source : D-075, D-093, B-D-01, OS V15
 * ============================================================
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// ── Haversine ────────────────────────────────────────────────────────
// Retourne la distance en mètres entre deux coordonnées GPS.
// Aucune dépendance externe — calcul inline, toujours disponible.
function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000; // rayon terrestre en mètres
  const toRad = (deg: number) => deg * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
// ── Fin Haversine ────────────────────────────────────────────────────


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
      list: (f) => E.Event.filter(f || {}),
    },
    checkpoints: {
      list: (f) => E.Checkpoint.filter(f || {}),
    },
    sessionPresence: {
      create: (payload) => E.SessionPresence.create(payload),
      list:   (f)       => E.SessionPresence.filter(f || {}),
    },
  };
}
// ── Fin createBase44Repositories ────────────────────────────────────

function generateId(prefix: string): string {
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

    // Résolution identité souveraine : me.id (Base44 interne) → me.systemId (USR-*)
    // L'OS tranche : USR-* est l'identifiant souverain, me.id est l'id plateforme.
    // Si systemId absent → le compte User n'a pas encore de USR-* : bloquer proprement.
    // Source : IDFactory — "le Base44 id n'est JAMAIS un identifiant métier souverain."
    const callerSystemId = me.systemId || null;
    if (!callerSystemId) {
      return Response.json({
        ok: false,
        error: 'IDENTITY_NOT_SOVEREIGN: Votre compte n\'a pas de systemId USR-*. ' +
               'Contacter l\'administrateur pour renseigner le champ systemId sur votre profil User.',
      }, { status: 403 });
    }

    const body = await req.json();
    const { engagementId, gpsLatitude, gpsLongitude, gpsAccuracyMeters, checkedInAt } = body;

    if (!engagementId) return Response.json({ ok: false, error: 'VALIDATION: engagementId obligatoire.' }, { status: 400 });
    if (gpsLatitude == null) return Response.json({ ok: false, error: 'VALIDATION: gpsLatitude obligatoire.' }, { status: 400 });
    if (gpsLongitude == null) return Response.json({ ok: false, error: 'VALIDATION: gpsLongitude obligatoire.' }, { status: 400 });

    // ── Charger l'engagement ──────────────────────────────────
    const repos = createBase44Repositories(base44);
    const engagements = await repos.engagements.list({ systemId: engagementId });
    if (!engagements?.length) {
      return Response.json({ ok: false, error: `NOT_FOUND: Engagement "${engagementId}" introuvable.` }, { status: 404 });
    }

    const eng = engagements[0];

    if (callerSystemId !== eng.talentUserId) {
      return Response.json({
        ok: false,
        error: `FORBIDDEN: Seul le talent de cet engagement peut effectuer le check-in. ` +
               `caller=${callerSystemId} · expected=${eng.talentUserId}`,
      }, { status: 403 });
    }

    const validStates = ['event_sealed', 'deposit_secured'];
    if (!validStates.includes(eng.status)) {
      return Response.json({
        ok: false,
        error: `INVALID_STATE: Check-in impossible en état "${eng.status}". États valides : ${validStates.join(', ')}.`,
      }, { status: 422 });
    }

    // ── Idempotence ───────────────────────────────────────────
    const existing = await repos.sessionPresence.list({
      engagementId: eng.systemId,
      talentUserId: eng.talentUserId,  // USR-* souverain
    }).catch(() => []);

    if (existing?.length) {
      return Response.json({
        ok: true, idempotent: true,
        sessionPresenceId: existing[0].systemId,
        gpsDistanceMeters: existing[0].gpsDistanceMeters ?? null,
        withinRadius:      existing[0].withinRadius      ?? null,
        message: 'SessionPresence déjà enregistrée pour cet engagement.',
      });
    }

    // ── Charger le Checkpoint via Event.checkpointId ──────────
    // Source de vérité : Checkpoint.geoLat / geoLng / radiusKm
    // Aucune valeur hardcodée — tout vient de la donnée.
    let gpsDistanceMeters: number | null = null;
    let withinRadius: boolean | null = null;
    let checkpointId: string | null = null;
    let radiusMetersUsed: number | null = null;

    try {
      // 1. Charger l'Event lié à l'engagement
      const events = eng.eventId
        ? await repos.events.list({ systemId: eng.eventId }).catch(() => [])
        : [];

      const event = events?.[0] || null;
      const ckpId = event?.checkpointId || null;

      if (ckpId) {
        // 2. Charger le Checkpoint
        const checkpoints = await repos.checkpoints.list({ systemId: ckpId }).catch(() => []);

        const ckp = checkpoints?.[0] || null;

        if (ckp && ckp.geoLat != null && ckp.geoLng != null) {
          const ckpLat    = Number(ckp.geoLat);
          const ckpLng    = Number(ckp.geoLng);
          const radiusKm  = Number(ckp.radiusKm) || 0.1; // fallback 100m si absent
          const radiusM   = radiusKm * 1000;

          // 3. Haversine — data-driven, pas hardcodé
          const distM = haversineMeters(
            Number(gpsLatitude),  Number(gpsLongitude),
            ckpLat,               ckpLng
          );

          gpsDistanceMeters = Math.round(distM);
          withinRadius      = distM <= radiusM;
          checkpointId      = ckpId;
          radiusMetersUsed  = radiusM;

          if (!withinRadius) {
            console.warn(
              `[createSessionPresence] OUTSIDE_RADIUS: ` +
              `talent=${gpsLatitude},${gpsLongitude} ` +
              `checkpoint=${ckpLat},${ckpLng} ` +
              `distance=${gpsDistanceMeters}m radius=${radiusM}m ` +
              `engagement=${engagementId} checkpoint=${ckpId}`
            );
          }
        } else {
          console.warn(`[createSessionPresence] CHECKPOINT_NO_COORDS: ckpId=${ckpId} — calcul distance ignoré.`);
        }
      } else {
        console.warn(`[createSessionPresence] NO_CHECKPOINT: Event sans checkpointId pour engagement=${engagementId} — calcul distance ignoré.`);
      }
    } catch (gpsErr) {
      // Fail-soft sur le calcul GPS — ne bloque pas le check-in
      console.warn(`[createSessionPresence] GPS_CALC_ERROR: ${gpsErr.message} — distanceMeters=null`);
    }

    // ── Persister SessionPresence ─────────────────────────────
    const systemId = generateId('SPR');
    const now      = new Date().toISOString();

    const record: Record<string, unknown> = {
      systemId,
      engagementId:     eng.systemId,
      talentUserId:     eng.talentUserId,
      checkInAt:        Date.now(),
      gpsCoordinates:   { lat: gpsLatitude, lng: gpsLongitude, accuracyMeters: gpsAccuracyMeters || null },
      signalTypes:      ['GPS'],
      createdAt:        now,
    };

    // Champs GPS enrichis (null si calcul impossible)
    if (gpsDistanceMeters !== null) record.gpsDistanceMeters = gpsDistanceMeters;
    if (withinRadius      !== null) record.withinRadius      = withinRadius;
    if (checkpointId      !== null) record.checkpointId      = checkpointId;
    if (radiusMetersUsed  !== null) record.radiusMetersUsed  = radiusMetersUsed;

    await repos.sessionPresence.create(record);

    return Response.json({
      ok:                true,
      sessionPresenceId: systemId,
      engagementId:      eng.systemId,
      talentUserId:      eng.talentUserId,
      gpsLatitude,
      gpsLongitude,
      gpsAccuracyMeters: gpsAccuracyMeters || null,
      gpsDistanceMeters,
      withinRadius,
      checkpointId,
      radiusMetersUsed,
      checkedInAt:       checkedInAt || now,
      message: withinRadius === true
        ? `Présence confirmée — ${gpsDistanceMeters}m du checkpoint (rayon ${radiusMetersUsed}m).`
        : withinRadius === false
          ? `Présence enregistrée — hors rayon (${gpsDistanceMeters}m > ${radiusMetersUsed}m). PresenceProofGuard tranchera.`
          : 'Présence enregistrée — distance non calculée (pas de checkpoint associé).',
    });

  } catch (error) {
    console.error('[createSessionPresence]', error.message);
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});