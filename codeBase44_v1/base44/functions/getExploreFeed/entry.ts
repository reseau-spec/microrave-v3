// deploy: v2
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

/**
 * getExploreFeed — Projection UI publique
 *
 * Retourne les moments culturels publiés dans Explore.
 * Aucune logique RSI interne n'est exposée.
 * Le score brut est normalisé en priorité (1-5).
 *
 * Input (optionnel) : { domainKey, limit }
 *
 * CHANGEMENT : Scene.filter({ isActive: true }) → Scene.filter({ active: true })
 */

function jsonRes(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

/** Normalise un score brut en priorité UI (1-5) */
function normalizePriority(score) {
  if (score >= 80) return 5;
  if (score >= 55) return 4;
  if (score >= 35) return 3;
  if (score >= 20) return 2;
  return 1;
}

/** Label domaine lisible */
function domainLabel(domainKey) {
  const labels = {
    music: 'Musique', humour: 'Humour', photo: 'Photo',
    video: 'Vidéo', food: 'Bouffe', art: 'Art', responsable: 'Culture responsable'
  };
  return labels[domainKey] || domainKey;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return jsonRes({ error: 'Authentication required' }, 401);

    const service = base44.asServiceRole;
    const body = await req.json().catch(() => ({}));
    const { domainKey = null, limit = 20 } = body;

    // Filtre de base : moments publiés dans Explore avec statuts actifs
    const query = { isPublishedInExplore: true };

    // Pré-fetch x10 : le filtre post-query (statut + expiration + domaine) peut écarter
    // une part significative des enregistrements. x3 était insuffisant à l'échelle.
    // TODO : remplacer par une vraie pagination server-side quand le SDK le supportera.
    const allMoments = await service.entities.CulturalMoment.filter(query, '-momentScore', limit * 10);

    // Filtrer statuts actifs + domaine optionnel
    const activeMoments = allMoments.filter(m => {
      const statusOk = ['rising', 'live', 'peak'].includes(m.status);
      const domainOk = !domainKey || m.domainKey === domainKey;
      const notExpired = !m.expiresAt || new Date(m.expiresAt) > new Date();
      return statusOk && domainOk && notExpired;
    }).slice(0, limit);

    // Charger les checkpoints pour les noms — filtrés par systemId uniquement
    // (évite de charger toute la collection à chaque appel)
    const cpIds = [...new Set(activeMoments.map(m => m.checkpointSystemId).filter(Boolean))];
    const checkpoints = cpIds.length > 0
      ? await Promise.all(cpIds.map(id => service.entities.Checkpoint.filter({ systemId: id }).then(r => r[0] ?? null)))
      : [];
    const cpIndex = new Map(checkpoints.filter(Boolean).map(cp => [cp.systemId, cp]));

    // Charger les scènes actives pour enrichissement
    const sceneIds = [...new Set(activeMoments.map(m => m.sceneId).filter(Boolean))];
    let sceneIndex = new Map();
    if (sceneIds.length > 0) {
      const scenes = await service.entities.Scene.filter({ active: true }); // ← CORRIGÉ : était isActive
      sceneIndex = new Map(scenes.map(s => [s.id, s]));
    }

    // Projection stricte (RSI caché) — enrichie V2 pour Explore frontend
    const feed = activeMoments.map(moment => {
      const cp = cpIndex.get(moment.checkpointSystemId);
      const scene = moment.sceneId ? sceneIndex.get(moment.sceneId) : null;

      // hasEventTonight : true si expiresAt est dans les 24h et le statut est actif
      const now = Date.now();
      const EVENT_WINDOW_MS = 24 * 60 * 60 * 1000;
      const hasEventTonight =
        moment.ctaType === 'join_session' ||
        (moment.expiresAt && (new Date(moment.expiresAt).getTime() - now) < EVENT_WINDOW_MS && new Date(moment.expiresAt).getTime() > now);

      return {
        // ── Identité canonique ──────────────────────────────────────────────
        id: moment.id,
        checkpointSystemId: moment.checkpointSystemId, // clé canonique vers Checkpoint.systemId
        checkpointName: cp?.name || moment.checkpointSystemId,
        checkpointGeoLat: cp?.geoLat || null,
        checkpointGeoLng: cp?.geoLng || null,

        // ── Domaine & type ──────────────────────────────────────────────────
        domainKey: moment.domainKey,
        domainLabel: domainLabel(moment.domainKey),
        momentType: moment.momentType,

        // ── Statut machine d'état ───────────────────────────────────────────
        // live > peak > rising > recent (seeded/fading non publiés)
        status: moment.status,

        // ── Narration ──────────────────────────────────────────────────────
        headline: moment.headline,
        subheadline: moment.subheadline,
        ctaType: moment.ctaType,

        // ── Scores & signaux ───────────────────────────────────────────────
        priority: normalizePriority(moment.momentScore),
        momentumScore: moment.momentumScore || 0,
        momentumDelta: moment.momentumDelta || 0,

        // ── Participants (approximatifs V1 — source: attendanceSignal si disponible) ──
        participantsCount: moment.attendanceSignal || 0,
        activeSessionCount: moment.recentSessionsOpened || 0,
        recentSessionCount: moment.recentSessionsConfirmed || 0,

        // ── Signaux temporels ──────────────────────────────────────────────
        hasEventTonight: Boolean(hasEventTonight),
        expiresAt: moment.expiresAt,
        startedAt: moment.startedAt,

        // ── Scène ──────────────────────────────────────────────────────────
        sceneId: moment.sceneId || null,
        sceneName: scene?.sceneName || null,
      };
    });

    return jsonRes({ ok: true, count: feed.length, moments: feed });

  } catch (error) {
    console.error('[getExploreFeed] error:', error);
    return jsonRes({ ok: false, error: error.message }, 500);
  }
});