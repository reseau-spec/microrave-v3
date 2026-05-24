// deploy: v2
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

/**
 * getMissionsForUser
 * Retourne les missions actives + progression de l'utilisateur connecté.
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
    const now = new Date().toISOString();

    // Charger missions actives (non expirées)
    const allMissions = await service.entities.Mission.filter({ active: true });
    const missions = allMissions.filter(m => !m.expiresAt || m.expiresAt > now);

    // Charger la progression de l'utilisateur
    const progressList = await service.entities.MissionProgress.filter({ userId: user.id });
    const progressByMissionId = new Map(progressList.map(p => [p.missionId, p]));

    const result = missions.map(m => {
      const prog = progressByMissionId.get(m.id);
      const progressCounts = prog?.progress || {};
      const objectivesWithProgress = (m.objectives || []).map(obj => ({
        ...obj,
        current: progressCounts[obj.type] || 0,
        done: (progressCounts[obj.type] || 0) >= obj.count,
      }));
 
      const totalObjectives = objectivesWithProgress.length;
      const completionScore = objectivesWithProgress.reduce((sum, obj) => {
        const current = Number(obj.current || 0);
        const target = Number(obj.count || 0);
        if (target <= 0) return sum;
        return sum + Math.min(current / target, 1);
      }, 0);

      const completionPct = totalObjectives > 0
        ? Math.round((completionScore / totalObjectives) * 100)
        : 0;


      return {
        id: m.id,
        missionKey: m.missionKey,
        title: m.title,
        description: m.description,
        zoneName: m.zoneName,
        domainKey: m.domainKey,
        rewardBadge: m.rewardBadge,
        rewardXp: m.rewardXp,
        checkpointSystemIds: m.checkpointSystemIds || [],
        objectives: objectivesWithProgress,
        status: prog?.status || 'not_started',
        completionPct,
        completedAt: prog?.completedAt || null,
        claimedAt: prog?.claimedAt || null,
        progressId: prog?.id || null,
      };
    });

    // Trier : en_cours > not_started > claimed
    result.sort((a, b) => {
      const order = { in_progress: 0, not_started: 1, completed: 2, claimed: 3 };
      return (order[a.status] ?? 1) - (order[b.status] ?? 1) || b.completionPct - a.completionPct;
    });

    return jsonRes({ ok: true, missions: result });
  } catch (error) {
    console.error('[getMissionsForUser] error:', error);
    return jsonRes({ ok: false, error: error.message }, 500);
  }
});