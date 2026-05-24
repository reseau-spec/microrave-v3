// deploy: v2
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

function json(data, status = 200) {
  return Response.json(data, { status });
}

function jsonError(message, status = 400) {
  return Response.json({ error: message }, { status });
}

/**
 * getCheckpointInsights: retourne les insights d'un checkpoint
 * 
 * Utilise les nouvelles entités CheckpointStyleStats, CheckpointRoleStats, CheckpointUserStats
 * Score = playsCount + (sotsAvg/100)
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    const body = await req.json().catch(() => ({}));
    const { checkpointSystemId, domainKey } = body;

    if (!checkpointSystemId || !domainKey) {
      return jsonError('checkpointSystemId and domainKey required', 400);
    }

    console.log('[getCheckpointInsights] Fetching insights for:', { checkpointSystemId, domainKey });

    // Charger les stats pour ce checkpoint + domain
    const styleStats = await base44.entities.CheckpointStyleStats.filter({
      checkpointSystemId,
      domainKey
    });

    const roleStats = await base44.entities.CheckpointRoleStats.filter({
      checkpointSystemId,
      domainKey
    });

    const userStats = await base44.entities.CheckpointUserStats.filter({
      checkpointSystemId,
      domainKey
    });

    console.log('[getCheckpointInsights] Stats found:', {
      styles: styleStats.length,
      roles: roleStats.length,
      users: userStats.length
    });

    // Top styles (score = playsCount + sotsAvg/100)
    const topStyles = styleStats
      .map(s => ({
        ...s,
        score: (s.playsCount || 0) + ((s.sotsAvg || 0) / 100)
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    // Top roles
    const topRoles = roleStats
      .map(r => ({
        ...r,
        score: (r.playsCount || 0) + ((r.sotsAvg || 0) / 100)
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    // Top talents
    const topTalents = userStats
      .sort((a, b) => (b.playsCount || 0) - (a.playsCount || 0))
      .slice(0, 5)
      .map(stat => ({
        userId: stat.userId,
        playsCount: stat.playsCount,
        sotsAvgReceived: stat.sotsAvgReceived,
        lastPlayedAt: stat.lastPlayedAt
      }));

    // Récupérer les métadonnées du checkpoint
    const checkpoints = await base44.entities.Checkpoint.filter({ 
      systemId: checkpointSystemId 
    });
    const checkpoint = checkpoints[0] || null;

    // Récupérer les métadonnées des styles et rôles dominants
    const topStyleMeta = topStyles.length > 0 
      ? (await base44.entities.StyleHierarchy.filter({ systemId: topStyles[0].styleLeafId }))[0] || null
      : null;

    const topRoleMeta = topRoles.length > 0
      ? (await base44.entities.RoleHierarchy.filter({ systemId: topRoles[0].roleSystemId }))[0] || null
      : null;

    // Stats globales
    const totalSessions = styleStats.reduce((sum, s) => sum + (s.playsCount || 0), 0);
    const totalSots = styleStats.reduce((sum, s) => sum + (s.sotsCount || 0), 0);
    const avgSots = totalSots > 0 
      ? styleStats.reduce((sum, s) => sum + (s.sotsSum || 0), 0) / totalSots
      : 0;

    return json({
      ok: true,
      checkpoint,
      topStyle: topStyles.length > 0 ? {
        styleLeafId: topStyles[0].styleLeafId,
        score: topStyles[0].score,
        playsCount: topStyles[0].playsCount,
        sotsAvg: topStyles[0].sotsAvg,
        metadata: topStyleMeta
      } : null,
      topRole: topRoles.length > 0 ? {
        roleSystemId: topRoles[0].roleSystemId,
        score: topRoles[0].score,
        playsCount: topRoles[0].playsCount,
        sotsAvg: topRoles[0].sotsAvg,
        metadata: topRoleMeta
      } : null,
      topTalents,
      topStyles: topStyles.map(s => ({
        styleLeafId: s.styleLeafId,
        score: s.score,
        playsCount: s.playsCount,
        sotsAvg: s.sotsAvg
      })),
      topRoles: topRoles.map(r => ({
        roleSystemId: r.roleSystemId,
        score: r.score,
        playsCount: r.playsCount,
        sotsAvg: r.sotsAvg
      })),
      stats: {
        totalStyles: styleStats.length,
        totalRoles: roleStats.length,
        totalTalents: userStats.length,
        totalSessions,
        avgSots
      }
    });

  } catch (error) {
    console.error('getCheckpointInsights error:', error);
    return jsonError(error.message, 500);
  }
});