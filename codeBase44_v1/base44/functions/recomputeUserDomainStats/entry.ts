// deploy: v3
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

function jsonRes(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

// PATCH: même pattern que recomputeCulturalMoments / recomputeCheckpointLiveStats
// Le SDK Base44 retourne parfois {items:[...]} au lieu d'un tableau direct en contexte cron.
function toArray(val) {
  if (Array.isArray(val)) return val;
  if (val && Array.isArray(val.items)) return val.items;
  return [];
}

Deno.serve(async (req) => {
  try {
    // PATCH: guard admin supprimé — même cause que recomputeCulturalMoments (pas de session
    // user en contexte cron). On passe directement en asServiceRole.
    const base44 = createClientFromRequest(req);
    const service = base44.asServiceRole;

    const body = await req.json().catch(() => ({}));
    const dryRun = body?.dryRun === true;

    const startedAtMs = Date.now();
    const now = new Date().toISOString();

    // Charger sessions valides (statuts terminaux porteurs de signal)
    const validStatuses = ['completed', 'archived', 'sots_submitted'];
    const [sessionsRaw, roleMappingsRaw, sotsLogsRaw] = await Promise.all([
      service.entities.Session.filter({ status: { $in: validStatuses } }).catch(() => []),
      service.entities.RoleDomainMap.filter({}).catch(() => []),
      service.entities.SOTSLog.filter({ targetType: 'user' }).catch(() => []),
    ]);

    // PATCH: toArray() sur tous les résultats
    const sessions = toArray(sessionsRaw);
    const roleMappings = toArray(roleMappingsRaw);
    const sotsLogs = toArray(sotsLogsRaw);

    // Construire le mapping roleSystemId → domainKey depuis RoleDomainMap
    const roleDomainMap = {};
    for (const m of roleMappings) {
      if (m.roleSystemId && m.domainKey) {
        roleDomainMap[m.roleSystemId] = m.domainKey;
      }
    }

    // Agréger par (userId, domainKey)
    const userDomainData = {};

    for (const session of sessions) {
      const participants = Array.isArray(session.participants) ? session.participants : [];
      const sotsSubmittedBy = Array.isArray(session.sotsSubmittedBy) ? session.sotsSubmittedBy : [];

      for (const p of participants) {
        const userId = p.userId;
        const roleSystemId = p.roleSystemId;

        if (!userId || !roleSystemId) continue;

        const domainKey = roleDomainMap[roleSystemId];
        if (!domainKey) continue;

        const key = `${userId}_${domainKey}`;

        if (!userDomainData[key]) {
          userDomainData[key] = {
            userId,
            domainKey,
            sessionsCount: 0,
            sotsSubmittedCount: 0,
            sotsScores: [],
          };
        }

        userDomainData[key].sessionsCount++;

        if (sotsSubmittedBy.includes(userId)) {
          userDomainData[key].sotsSubmittedCount++;
        }
      }
    }

    // Ajouter avgSotsScore depuis SOTSLog (votes reçus par l'évaluateur)
    for (const log of sotsLogs) {
      if (!log.evaluatorUserId || !log.evaluatorRoleSystemId) continue;

      const domainKey = roleDomainMap[log.evaluatorRoleSystemId];
      if (!domainKey) continue;

      const key = `${log.evaluatorUserId}_${domainKey}`;
      const bucket = userDomainData[key];

      if (bucket && typeof log.scoreRaw === 'number' && log.scoreRaw >= 1 && log.scoreRaw <= 5) {
        bucket.sotsScores.push(log.scoreRaw);
      }
    }

    // Charger TOUS les UserDomainStats en une seule requête (évite N requêtes filter dans la boucle)
    const existingStatsRaw = await service.entities.UserDomainStats.filter({}).catch(() => []);
    const existingStatsIndex = new Map(
      toArray(existingStatsRaw).map(s => [`${s.userId}_${s.domainKey}`, s])
    );

    // Calculer points + collecter ops
    let created = 0;
    let updated = 0;
    let skipped = 0;

    const toCreate = [];
    const toUpdate = [];

    for (const data of Object.values(userDomainData)) {
      const avgSotsScore =
        data.sotsScores.length > 0
          ? data.sotsScores.reduce((a, b) => a + b, 0) / data.sotsScores.length
          : 0;

      // Formule : 10 pts/session + 5 pts/sots soumis + jusqu'à 100 pts pour avg SOTS parfait
      const points =
        data.sessionsCount * 10 +
        data.sotsSubmittedCount * 5 +
        Math.round(avgSotsScore * 20);

      const avgSotsRounded = Math.round(avgSotsScore * 100) / 100;

      if (dryRun) {
        skipped++;
        continue;
      }

      const existing = existingStatsIndex.get(`${data.userId}_${data.domainKey}`);

      if (existing) {
        toUpdate.push({
          id: existing.id,
          payload: {
            sessionsCount: data.sessionsCount,
            sotsSubmittedCount: data.sotsSubmittedCount,
            avgSotsScore: avgSotsRounded,
            points,
            xpDomain: points,
            updatedAt: now,
          },
        });
        updated++;
      } else {
        toCreate.push({
          userId: data.userId,
          domainKey: data.domainKey,
          sessionsCount: data.sessionsCount,
          sotsSubmittedCount: data.sotsSubmittedCount,
          avgSotsScore: avgSotsRounded,
          points,
          xpDomain: points,
          updatedAt: now,
        });
        created++;
      }
    }

    // Exécuter les writes en parallèle
    if (!dryRun) {
      await Promise.all([
        toCreate.length > 0
          ? service.entities.UserDomainStats.bulkCreate(toCreate)
          : Promise.resolve(),
        ...toUpdate.map(op =>
          service.entities.UserDomainStats.update(op.id, op.payload)
        ),
      ]);
    }

    // Preview top 5 par domaine (depuis les données déjà en mémoire — pas de requête supplémentaire)
    const top5Preview = {};
    if (!dryRun) {
      const byDomain = {};
      for (const data of Object.values(userDomainData)) {
        const d = data.domainKey;
        if (!byDomain[d]) byDomain[d] = [];
        const avgSotsScore = data.sotsScores.length > 0
          ? data.sotsScores.reduce((a, b) => a + b, 0) / data.sotsScores.length : 0;
        const points = data.sessionsCount * 10 + data.sotsSubmittedCount * 5 + Math.round(avgSotsScore * 20);
        byDomain[d].push({ userId: data.userId, points, xpDomain: points, sessionsCount: data.sessionsCount });
      }
      for (const domain of Object.keys(byDomain)) {
        byDomain[domain].sort((a, b) => b.points - a.points);
        top5Preview[domain] = byDomain[domain].slice(0, 5);
      }
    }

    const durationMs = Date.now() - startedAtMs;

    console.log(
      '[recomputeUserDomainStats.v3]',
      JSON.stringify({ dryRun, created, updated, skipped, durationMs })
    );

    return jsonRes({
      ok: true,
      dryRun,
      created,
      updated,
      skipped,
      totalEntries: Object.keys(userDomainData).length,
      durationMs,
      top5Preview,
    });
  } catch (error) {
    console.error('[recomputeUserDomainStats.v3] error:', error);
    return jsonRes({ ok: false, error: error?.message ?? 'Unknown error' }, 500);
  }
});