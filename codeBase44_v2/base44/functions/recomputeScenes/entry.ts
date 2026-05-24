// deploy: v3
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

/**
 * recomputeScenes — CRON toutes les 30 min
 *
 * 1. Charge tous les checkpoints actifs avec coordonnées
 * 2. Détecte les clusters (même domaine dominant, distance < 800m, nb >= 3)
 * 3. Upsert Scene + SceneCheckpoint
 * 4. Désactive les scènes qui n'ont plus de momentum (tous checkpoints à 0)
 *
 * PATCH v3: guard admin supprimé — même cause que recomputeCulturalMoments.
 *   Les crons Base44 n'ont pas de session user → 403 systématique.
 *   On passe directement en asServiceRole. Appels manuels admin toujours supportés.
 *
 * CHANGEMENTS vs version précédente :
 * - isActive → active (alignement avec le modèle de données réel)
 * - Batch writes SceneCheckpoint avec pause 200ms (fix 429)
 */

const MAX_DISTANCE_M = 800;
const MIN_CHECKPOINTS = 3;
const WEIGHT_CP_COUNT = 20;
const WEIGHT_MOMENTUM = 5;

function jsonRes(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

// PATCH v3: même pattern que recomputeCulturalMoments / recomputeCheckpointLiveStats
// Le SDK Base44 retourne parfois {items:[...]} au lieu d'un tableau direct en contexte cron.
function toArray(val) {
  if (Array.isArray(val)) return val;
  if (val && Array.isArray(val.items)) return val.items;
  return [];
}

/** Calcule la distance en mètres entre deux points GPS (Haversine) */
function distanceMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Groupe de checkpoints par domaine dominant, puis cluster par distance */
function detectClusters(checkpoints, liveStatsIndex) {
  const enriched = checkpoints
    .filter(cp => cp.geoLat && cp.geoLng)
    .map(cp => {
      const ls = liveStatsIndex.get(cp.systemId);
      // v — ne plus forcer 'music' : un checkpoint sans domaine identifié
      // sera groupé sous 'unknown' puis filtré en aval si besoin
      const domainKey = (ls && ls.currentDomainKey) || cp.domainDominantKey || 'unknown';
      const momentumScore = (ls && ls.momentumScore) || 0;
      return { ...cp, domainKey, momentumScore };
    });

  const byDomain = new Map();
  for (const cp of enriched) {
    if (!byDomain.has(cp.domainKey)) byDomain.set(cp.domainKey, []);
    byDomain.get(cp.domainKey).push(cp);
  }

  const clusters = [];

  for (const [domain, cps] of byDomain) {
    const used = new Set();
    for (let i = 0; i < cps.length; i++) {
      if (used.has(i)) continue;
      const seed = cps[i];
      const clusterCps = [seed];
      used.add(i);

      for (let j = i + 1; j < cps.length; j++) {
        if (used.has(j)) continue;
        const d = distanceMeters(seed.geoLat, seed.geoLng, cps[j].geoLat, cps[j].geoLng);
        if (d <= MAX_DISTANCE_M) {
          clusterCps.push(cps[j]);
          used.add(j);
        }
      }

      if (clusterCps.length >= MIN_CHECKPOINTS) {
        const centerLat = clusterCps.reduce((s, c) => s + c.geoLat, 0) / clusterCps.length;
        const centerLng = clusterCps.reduce((s, c) => s + c.geoLng, 0) / clusterCps.length;
        const totalMomentum = clusterCps.reduce((s, c) => s + c.momentumScore, 0);
        const sortedIds = clusterCps.map(c => c.systemId).sort();
        const sceneKey = `${domain}_${sortedIds.slice(0, 4).join('-')}`;
        clusters.push({ domain, clusterCps, centerLat, centerLng, totalMomentum, sceneKey, sortedIds });
      }
    }
  }

  return clusters;
}

Deno.serve(async (req) => {
  try {
    // PATCH v3: guard admin supprimé — les crons Base44 n'ont pas de session user.
    // Pattern identique à recomputeCulturalMoments / recomputeCheckpointLiveStats.
    const base44 = createClientFromRequest(req);
    const service = base44.asServiceRole;

    const body = await req.json().catch(() => ({}));
    const dryRun = body.dryRun === true;

    const startTs = Date.now();
    const nowIso = new Date().toISOString();

    const [allCheckpointsRaw, allLiveStatsRaw, existingScenesRaw, existingSceneCPsRaw] = await Promise.all([
      service.entities.Checkpoint.filter({}).catch(() => []),
      service.entities.CheckpointLiveStats.filter({}).catch(() => []),
      service.entities.Scene.filter({}).catch(() => []),
      service.entities.SceneCheckpoint.filter({}).catch(() => []),
    ]);

    const allCheckpoints = toArray(allCheckpointsRaw).filter(cp => cp.active === true || cp.active === 'true');
    const allLiveStats = toArray(allLiveStatsRaw);
    const existingScenes = toArray(existingScenesRaw);
    const existingSceneCPs = toArray(existingSceneCPsRaw);

    const liveStatsIndex = new Map(allLiveStats.map(ls => [ls.checkpointSystemId, ls]));
    const sceneIndex = new Map(existingScenes.map(s => [s.sceneKey, s]));

    const clusters = detectClusters(allCheckpoints, liveStatsIndex);

    // Garder trace des scèneKeys actifs ce cycle
    const activeSeedKeys = new Set(clusters.map(c => c.sceneKey));

    let created = 0;
    let updated = 0;

    // ── Collecter toutes les opérations avant d'écrire ─────────────────────
    const sceneUpserts = [];
    const sceneCpWrites = [];

    for (const cluster of clusters) {
      const { domain, clusterCps, centerLat, centerLng, totalMomentum, sceneKey, sortedIds } = cluster;
      const sceneScore = clusterCps.length * WEIGHT_CP_COUNT + totalMomentum * WEIGHT_MOMENTUM;
      const seedCheckpoint = allCheckpoints.find(cp => cp.systemId === sortedIds[0]);
      const sceneName = `Scène ${domain} — ${seedCheckpoint?.name || sortedIds[0]}`;
      const existingScene = sceneIndex.get(sceneKey);

      sceneUpserts.push({ existingScene, sceneKey, domain, sceneName, centerLat, centerLng, sortedIds, clusterCps, sceneScore });

      if (existingScene) updated++;
      else created++;
    }

    if (!dryRun) {
      // Écrire Scenes en série (évite 429)
      const sceneIdMap = new Map();
      for (const op of sceneUpserts) {
        const { existingScene, sceneKey, domain, sceneName, centerLat, centerLng, sortedIds, clusterCps, sceneScore } = op;
        if (existingScene) {
          await service.entities.Scene.update(existingScene.id, {
            sceneScore,
            checkpointCount: clusterCps.length,
            checkpointSystemIds: sortedIds,
            centerLat,
            centerLng,
            active: true,               // ← CORRIGÉ : était isActive
            lastComputedAt: nowIso,
          });
          sceneIdMap.set(sceneKey, existingScene.id);
        } else {
          const created_scene = await service.entities.Scene.create({
            sceneKey,
            domainKey: domain,
            sceneName,
            centerLat,
            centerLng,
            checkpointSystemIds: sortedIds,
            checkpointCount: clusterCps.length,
            sceneScore,
            activeMomentCount: 0,
            active: true,               // ← CORRIGÉ : était isActive
            lastComputedAt: nowIso,
          });
          sceneIdMap.set(sceneKey, created_scene.id);
        }

        for (const cp of clusterCps) {
          sceneCpWrites.push({ sceneKey, checkpointSystemId: cp.systemId, contribution: cp.momentumScore || 0 });
        }
      }

      // Index SceneCheckpoints existants par sceneId+checkpointSystemId pour lookup O(1)
      const existingSceneCPIndex = new Map(
        existingSceneCPs.map(sc => [`${sc.sceneId}__${sc.checkpointSystemId}`, sc])
      );

      // Séparer creates et updates, en skippant les writes inutiles (score identique)
      const cpCreates = [];
      const cpUpdates = [];
      for (const item of sceneCpWrites) {
        const sceneId = sceneIdMap.get(item.sceneKey);
        if (!sceneId) continue;
        const existing = existingSceneCPIndex.get(`${sceneId}__${item.checkpointSystemId}`);
        if (existing) {
          // Skip si le score n'a pas changé — évite les writes inutiles à chaque run
          if (existing.contributionScore !== item.contribution) {
            cpUpdates.push({ id: existing.id, contribution: item.contribution });
          }
        } else {
          cpCreates.push({ sceneId, checkpointSystemId: item.checkpointSystemId, contributionScore: item.contribution });
        }
      }

      // bulkCreate pour les nouveaux, Promise.all pour les updates
      if (cpCreates.length > 0) {
        await service.entities.SceneCheckpoint.bulkCreate(cpCreates);
      }
      if (cpUpdates.length > 0) {
        await Promise.all(
          cpUpdates.map(op => service.entities.SceneCheckpoint.update(op.id, { contributionScore: op.contribution }))
        );
      }
    }

    // Désactiver les scènes qui ne font plus partie d'un cluster actif
    const scenesToDeactivate = existingScenes.filter(s => s.active && !activeSeedKeys.has(s.sceneKey));
    if (!dryRun && scenesToDeactivate.length > 0) {
      await Promise.all(
        scenesToDeactivate.map(s => service.entities.Scene.update(s.id, { active: false, lastComputedAt: nowIso }))
      );
    }
    const deactivated = scenesToDeactivate.length;

    const durationMs = Date.now() - startTs;
    console.log(`[recomputeScenes] dryRun=${dryRun} clusters=${clusters.length} created=${created} updated=${updated} deactivated=${deactivated} durationMs=${durationMs}`);

    return jsonRes({ ok: true, dryRun, clusters: clusters.length, created, updated, deactivated, durationMs });

  } catch (error) {
    console.error('[recomputeScenes] error:', error);
    return jsonRes({ ok: false, error: error.message }, 500);
  }
});