// deploy: v2
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

/**
 * checkMissionProgress
 *
 * Appelé après : checkin, session complétée, vote SOTS
 * Input: { userId, triggerType: "checkin"|"session"|"sots_vote", checkpointSystemId? }
 *
 * - Charge les missions actives dont les checkpoints se recoupent
 * - Met à jour MissionProgress
 * - Attribue XP + badge si mission complétée
 * - Retourne les missions nouvellement complétées
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

    const body = await req.json().catch(() => ({}));
    const { triggerType, checkpointSystemId, missionTemplate } = body;

    if (!triggerType) return jsonRes({ error: 'triggerType requis' }, 400);

    const service = base44.asServiceRole;
    const nowIso = new Date().toISOString();

    // Charger missions actives non expirées
    const allMissions = await service.entities.Mission.filter({ active: true });
    const missions = allMissions.filter(m => !m.expiresAt || m.expiresAt > nowIso);

    // Filtrer les missions pertinentes :
    // - contient un objectif du type triggerType
    // - si checkpointSystemId fourni : le checkpoint est dans la liste OU la liste est vide (= tous)
    // - si triggerType === 'event_created' et missionTemplate fourni :
    //   la mission doit avoir un missionTemplate correspondant OU pas de missionTemplate défini
    const relevantMissions = missions.filter(m => {
      const hasObjective = (m.objectives || []).some(o => o.type === triggerType);
      if (!hasObjective) return false;

      // Filtre checkpoint (checkin / session / sots_vote)
      if (checkpointSystemId) {
        const cpList = m.checkpointSystemIds || [];
        if (cpList.length > 0 && !cpList.includes(checkpointSystemId)) return false;
      }

      // Filtre missionTemplate pour event_created
      // Si la mission a un missionTemplate défini, il doit matcher celui de l'événement créé
      if (triggerType === 'event_created' && m.missionTemplate) {
        if (!missionTemplate || m.missionTemplate !== missionTemplate) return false;
      }

      return true;
    });

    if (relevantMissions.length === 0) {
      return jsonRes({ ok: true, completedMissions: [], updatedMissions: 0 });
    }

    // Charger la progression existante pour cet user
    const progressList = await service.entities.MissionProgress.filter({ userId: user.id });
    const progressByMissionId = new Map(progressList.map(p => [p.missionId, p]));

    const completedMissions = [];

    for (const mission of relevantMissions) {
      const existingProg = progressByMissionId.get(mission.id);

      // Ignorer si déjà claimed
      if (existingProg?.status === 'claimed') continue;
      // Ignorer si déjà completed (pas encore claimed) pour éviter double-award
      if (existingProg?.status === 'completed') continue;

      // Calculer la nouvelle progression
      const currentProgress = existingProg?.progress || {};
      const newProgress = { ...currentProgress };
      newProgress[triggerType] = (newProgress[triggerType] || 0) + 1;

      // Vérifier si tous les objectifs sont remplis
      const allDone = (mission.objectives || []).every(
        obj => (newProgress[obj.type] || 0) >= obj.count
      );

      const updateData = {
        progress: newProgress,
        status: allDone ? 'completed' : 'in_progress',
        ...(allDone && !existingProg?.completedAt ? { completedAt: nowIso } : {}),
      };

      if (existingProg) {
        await service.entities.MissionProgress.update(existingProg.id, updateData);
      } else {
        await service.entities.MissionProgress.create({
          userId: user.id,
          missionId: mission.id,
          missionKey: mission.missionKey,
          ...updateData,
        });
      }

      if (allDone) {
        completedMissions.push({
          missionKey: mission.missionKey,
          title: mission.title,
          rewardBadge: mission.rewardBadge,
          rewardXp: mission.rewardXp,
          zoneName: mission.zoneName,
        });

        // Attribuer XP + badge au TalentProfile
        const profiles = await service.entities.TalentProfile.filter({ userId: user.id });
        const profile = profiles?.[0];
        if (profile && (mission.rewardXp || mission.rewardBadge)) {
          const updates = {};
          if (mission.rewardXp) {
            updates.xpGlobal = (profile.xpGlobal || 0) + (mission.rewardXp || 0);
            updates.cosmeticXp = (profile.cosmeticXp || 0) + (mission.rewardXp || 0);
          }
          if (mission.rewardBadge) {
            const badges = profile.cosmeticBadges || [];
            if (!badges.includes(mission.rewardBadge)) {
              updates.cosmeticBadges = [...badges, mission.rewardBadge];
            }
          }
          if (Object.keys(updates).length > 0) {
            await service.entities.TalentProfile.update(profile.id, updates);
          }
        }

        console.log(`[checkMissionProgress] COMPLETED mission=${mission.missionKey} user=${user.id} xp=+${mission.rewardXp}`);
      }
    }

    return jsonRes({
      ok: true,
      completedMissions,
      updatedMissions: relevantMissions.length,
    });
  } catch (error) {
    console.error('[checkMissionProgress] error:', error);
    return jsonRes({ ok: false, error: error.message }, 500);
  }
});