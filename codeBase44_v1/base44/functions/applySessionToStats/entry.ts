// deploy: v3
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

/**
 * Apply session data to checkpoint stats (source of truth)
 * Input: { sessionId }
 * Updates: CheckpointDomainStats, CheckpointStyleStats, CheckpointRoleStats, UserCheckpointStats
 */

function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
}

Deno.serve(async (req) => {
    try {
        // PATCH v3: guard user supprimé — appelé en fire-and-forget depuis transitionSession
        // (pas de contexte user disponible). On passe par asServiceRole.
        const base44 = createClientFromRequest(req);
        const service = base44.asServiceRole;

        const body = await req.json().catch(() => ({}));
        const { sessionId } = body;

        if (!sessionId) {
            return new Response(JSON.stringify({
                ok: false,
                error: 'sessionId required'
            }), { status: 400, headers: { 'content-type': 'application/json' } });
        }

        // Load session
        const sessions = await service.entities.Session.filter({ id: sessionId });
        if (!sessions || sessions.length === 0) {
            return new Response(JSON.stringify({
                ok: false,
                error: 'Session not found'
            }), { status: 404, headers: { 'content-type': 'application/json' } });
        }

        const session = sessions[0];

        // Hard gate: checkpointSystemId
        if (!session.checkpointSystemId) {
            return new Response(JSON.stringify({
                ok: true,
                skipped: 'NO_CHECKPOINT'
            }), { status: 200, headers: { 'content-type': 'application/json' } });
        }

        const checkpointSystemId = session.checkpointSystemId;
        const participants = session.participants || [];

        // Derive domainKey from first participant role
        let domainKey = null;
        const firstParticipant = participants[0];

        if (firstParticipant?.roleSystemId) {
            const roles = await service.entities.RoleHierarchy.filter({
                systemId: firstParticipant.roleSystemId
            });

            if (roles && roles.length > 0) {
                domainKey = roles[0].domainKey;

                if (!domainKey && roles[0].racineSystemId) {
                    const rootRoles = await service.entities.RoleHierarchy.filter({
                        systemId: roles[0].racineSystemId
                    });
                    if (rootRoles && rootRoles.length > 0) {
                        domainKey = rootRoles[0].domainKey;
                    }
                }
            }
        }

        // Hard gate: domainKey
        if (!domainKey) {
            return new Response(JSON.stringify({
                ok: true,
                skipped: 'NO_DOMAIN'
            }), { status: 200, headers: { 'content-type': 'application/json' } });
        }

        // Collect styleLeafIds (L3) and roleSystemIds
        const styleLeafIds = new Set();
        const roleSystemIds = new Set();
        const userIds = new Set();

        participants.forEach(p => {
            if (p.userId) userIds.add(p.userId);
            if (p.roleSystemId) roleSystemIds.add(p.roleSystemId);

            if (Array.isArray(p.styleSystemIds)) {
                p.styleSystemIds.forEach(sid => styleLeafIds.add(sid));
            } else if (p.styleSystemId) {
                styleLeafIds.add(p.styleSystemId);
            }
        });

        // Calculate quality from SOTS
        let avgSots = 3.0;
        try {
            const sotsLogs = await service.entities.SOTSLog.filter({ sessionId });
            if (sotsLogs && sotsLogs.length > 0) {
                avgSots = sotsLogs.reduce((sum, log) => sum + (log.scoreRaw || 3), 0) / sotsLogs.length;
            }
        } catch (err) {
            console.warn('Failed to load SOTS:', err);
        }

        const quality01 = clamp(avgSots / 5.0, 0.1, 1.0);

        // Calculate recency
        const completedAt = session.actualEndAt || session.created_date;
        const now = new Date();
        const completedDate = new Date(completedAt);
        const days = (now.getTime() - completedDate.getTime()) / 86400000;
        const recency = 1 / (1 + days / 30);

        // DeltaScore
        const deltaScore = quality01 * recency;

        const nowIso = now.toISOString();
        const updated = { domain: 0, styles: 0, roles: 0, users: 0 };

        // Update CheckpointDomainStats
        const domainStats = await service.entities.CheckpointDomainStats.filter({
            checkpointSystemId,
            domainKey
        });

        if (domainStats && domainStats.length > 0) {
            const stat = domainStats[0];
            const newCount = (stat.sessionsCount || 0) + 1;
            const newScore = (stat.score || 0) + deltaScore;
            const newQuality = ((stat.qualityAvg || 0) * (stat.sessionsCount || 0) + quality01) / newCount;

            await service.entities.CheckpointDomainStats.update(stat.id, {
                sessionsCount: newCount,
                score: newScore,
                qualityAvg: newQuality,
                lastSessionAt: completedAt,
                updatedAt: nowIso
            });
        } else {
            await service.entities.CheckpointDomainStats.create({
                checkpointSystemId,
                domainKey,
                sessionsCount: 1,
                score: deltaScore,
                qualityAvg: quality01,
                lastSessionAt: completedAt,
                updatedAt: nowIso
            });
        }
        updated.domain = 1;

        // Update CheckpointStyleStats
        for (const styleLeafId of styleLeafIds) {
            const styleStats = await service.entities.CheckpointStyleStats.filter({
                checkpointSystemId,
                domainKey,
                styleLeafId
            });

            if (styleStats && styleStats.length > 0) {
                const stat = styleStats[0];
                const newCount = (stat.sessionsCount || 0) + 1;
                const newScore = (stat.score || 0) + deltaScore;
                const newQuality = ((stat.qualityAvg || 0) * (stat.sessionsCount || 0) + quality01) / newCount;

                await service.entities.CheckpointStyleStats.update(stat.id, {
                    sessionsCount: newCount,
                    score: newScore,
                    qualityAvg: newQuality,
                    lastSessionAt: completedAt,
                    updatedAt: nowIso
                });
            } else {
                await service.entities.CheckpointStyleStats.create({
                    checkpointSystemId,
                    domainKey,
                    styleLeafId,
                    sessionsCount: 1,
                    score: deltaScore,
                    qualityAvg: quality01,
                    lastSessionAt: completedAt,
                    updatedAt: nowIso
                });
            }
            updated.styles++;
        }

        // Update CheckpointRoleStats
        for (const roleSystemId of roleSystemIds) {
            const roleStats = await service.entities.CheckpointRoleStats.filter({
                checkpointSystemId,
                domainKey,
                roleSystemId
            });

            if (roleStats && roleStats.length > 0) {
                const stat = roleStats[0];
                const newCount = (stat.sessionsCount || 0) + 1;
                const newScore = (stat.score || 0) + deltaScore;
                const newQuality = ((stat.qualityAvg || 0) * (stat.sessionsCount || 0) + quality01) / newCount;

                await service.entities.CheckpointRoleStats.update(stat.id, {
                    sessionsCount: newCount,
                    score: newScore,
                    qualityAvg: newQuality,
                    lastSessionAt: completedAt,
                    updatedAt: nowIso
                });
            } else {
                await service.entities.CheckpointRoleStats.create({
                    checkpointSystemId,
                    domainKey,
                    roleSystemId,
                    sessionsCount: 1,
                    score: deltaScore,
                    qualityAvg: quality01,
                    lastSessionAt: completedAt,
                    updatedAt: nowIso
                });
            }
            updated.roles++;
        }

        // Update UserCheckpointStats
        for (const userId of userIds) {
            const userStats = await service.entities.UserCheckpointStats.filter({
                userId,
                checkpointSystemId,
                domainKey
            });

            if (userStats && userStats.length > 0) {
                const stat = userStats[0];
                const newCount = (stat.sessionsCount || 0) + 1;
                const newScore = (stat.score || 0) + deltaScore;
                const newQuality = ((stat.qualityAvg || 0) * (stat.sessionsCount || 0) + quality01) / newCount;

                await service.entities.UserCheckpointStats.update(stat.id, {
                    sessionsCount: newCount,
                    score: newScore,
                    qualityAvg: newQuality,
                    lastPlayedAt: completedAt,
                    updatedAt: nowIso
                });
            } else {
                await service.entities.UserCheckpointStats.create({
                    userId,
                    checkpointSystemId,
                    domainKey,
                    sessionsCount: 1,
                    score: deltaScore,
                    qualityAvg: quality01,
                    lastPlayedAt: completedAt,
                    updatedAt: nowIso
                });
            }
            updated.users++;
        }

        return new Response(JSON.stringify({
            ok: true,
            updated
        }), { status: 200, headers: { 'content-type': 'application/json' } });

    } catch (error) {
        console.error('applySessionToStats error:', error);
        return new Response(JSON.stringify({
            ok: false,
            error: error.message
        }), { status: 500, headers: { 'content-type': 'application/json' } });
    }
});