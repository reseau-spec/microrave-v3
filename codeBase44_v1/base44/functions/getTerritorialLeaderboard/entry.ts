// deploy: v2
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

/**
 * getTerritorialLeaderboard
 *
 * Utilise les Scenes (clusters géo par domaine) comme zones territoriales.
 * Enrichit chaque scene avec :
 * - momentumTotal (somme des momentumScore des checkpoints)
 * - activeMoments (CulturalMoments actifs liés)
 * - totalCheckins (CheckpointCheckins des dernières 24h)
 * - recentSessions (sessions des dernières 24h)
 */

function jsonRes(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return jsonRes({ error: 'Authentication required' }, 401);

    const service = base44.asServiceRole;
    const body = await req.json().catch(() => ({}));
    const { domainKey } = body;

    const since24h = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

    // Charger en parallèle
    const [scenes, allLiveStats, activeMoments, recentCheckins] = await Promise.all([
      service.entities.Scene.filter({ active: true }),
      service.entities.CheckpointLiveStats.filter({}),
      service.entities.CulturalMoment.filter({}),
      service.entities.CheckpointCheckin.filter({}),
    ]);

    const liveStatsIndex = new Map(allLiveStats.map(ls => [ls.checkpointSystemId, ls]));

    // Filtrer par domaine si demandé
    const filteredScenes = domainKey
      ? scenes.filter(s => s.domainKey === domainKey)
      : scenes;

    const activeStatuses = new Set(['rising', 'live', 'peak']);
    const recentCheckinsByCP = new Map();
    for (const ci of recentCheckins) {
      if (ci.checkinAt < since24h) continue;
      const key = ci.checkpointSystemId;
      recentCheckinsByCP.set(key, (recentCheckinsByCP.get(key) || 0) + 1);
    }

    const enriched = filteredScenes.map(scene => {
      const cpIds = scene.checkpointSystemIds || [];

      let momentumTotal = 0;
      let activeMomentCount = 0;
      let totalCheckins24h = 0;
      let totalRecentSessions = 0;

      for (const cpId of cpIds) {
        const ls = liveStatsIndex.get(cpId);
        if (ls) {
          momentumTotal += ls.momentumScore || 0;
          totalRecentSessions += (ls.recentSessionsOpened || 0) + (ls.recentSessionsConfirmed || 0);
        }
        totalCheckins24h += recentCheckinsByCP.get(cpId) || 0;
      }

      activeMomentCount = activeMoments.filter(
        m => cpIds.includes(m.checkpointSystemId) && activeStatuses.has(m.status)
      ).length;

      // Score territorial : sceneScore base + bonus momentum + activité 24h
      const territorialScore = Math.round(
        (scene.sceneScore || 0) +
        momentumTotal * 3 +
        activeMomentCount * 15 +
        totalCheckins24h * 5 +
        totalRecentSessions * 8
      );

      return {
        id: scene.id,
        sceneKey: scene.sceneKey,
        sceneName: scene.sceneName,
        zoneName: scene.sceneName?.replace(/^Scène \w+ — /, '') || scene.sceneKey,
        domainKey: scene.domainKey,
        centerLat: scene.centerLat,
        centerLng: scene.centerLng,
        checkpointCount: scene.checkpointCount || cpIds.length,
        momentumTotal: Math.round(momentumTotal),
        activeMomentCount,
        totalCheckins24h,
        totalRecentSessions,
        territorialScore,
        lastComputedAt: scene.lastComputedAt,
      };
    });

    // Trier par score territorial
    enriched.sort((a, b) => b.territorialScore - a.territorialScore);

    // Ajouter rank
    enriched.forEach((s, i) => { s.rank = i + 1; });

    return jsonRes({ ok: true, scenes: enriched, total: enriched.length });
  } catch (error) {
    console.error('[getTerritorialLeaderboard] error:', error);
    return jsonRes({ ok: false, error: error.message }, 500);
  }
});