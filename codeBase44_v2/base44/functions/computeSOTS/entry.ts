// deploy: v2
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

// Helpers pour normaliser JSON
function asArray(value, fallback = []) {
    if (Array.isArray(value)) return value;
    if (typeof value === 'string') {
        try { return JSON.parse(value); } catch { return fallback; }
    }
    return fallback;
}

function asObject(value, fallback = {}) {
    if (value && typeof value === 'object' && !Array.isArray(value)) return value;
    if (typeof value === 'string') {
        try { return JSON.parse(value); } catch { return fallback; }
    }
    return fallback;
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json().catch(() => ({}));
        const { userId, targetType, targetId } = body;

        // Compatibilité: userId => { targetType: 'user', targetId: userId }
        const resolvedTargetType = targetType || (userId ? 'user' : null);
        const resolvedTargetId = targetId || userId;

        if (!resolvedTargetType || !resolvedTargetId) {
            return Response.json({ ok: false, error: 'Missing targetType/targetId or userId' }, { status: 400 });
        }

        // Validation targetType
        const validTypes = ['user', 'style', 'role', 'checkpoint', 'event'];
        if (!validTypes.includes(resolvedTargetType)) {
            return Response.json({ ok: false, error: `Invalid targetType: ${resolvedTargetType}` }, { status: 400 });
        }

        // Récupérer tous les SOTS pour cette cible
        const sotsLogs = await base44.asServiceRole.entities.SOTSLog.filter({
            targetType: resolvedTargetType,
            targetId: resolvedTargetId
        });

        if (sotsLogs.length === 0) {
            return Response.json({
                ok: true,
                sotsGlobalScore: 0,
                sotsRecent30Score: 0,
                totalVotes: 0
            });
        }

        // Calcul du score global (moyenne pondérée) avec fallbacks
        const totalWeightedScore = sotsLogs.reduce((sum, log) => {
            const weighted = log.scoreWeighted || (log.scoreRaw * log.evaluatorWeightSnapshot) || 0;
            return sum + weighted;
        }, 0);
        const totalWeight = sotsLogs.reduce((sum, log) => sum + (log.evaluatorWeightSnapshot || 0), 0);
        const sotsGlobalScore = totalWeight > 0 ? totalWeightedScore / totalWeight : 0;

        // Calcul du score des 30 derniers jours
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        const recentLogs = sotsLogs.filter(log => {
            // Fallback sur plusieurs noms de champs
            const dateField = log.created_date || log.createdAt || log.created_at;
            if (!dateField) return false;
            const logDate = new Date(dateField);
            return logDate >= thirtyDaysAgo;
        });

        const recentWeightedScore = recentLogs.reduce((sum, log) => {
            const weighted = log.scoreWeighted || (log.scoreRaw * log.evaluatorWeightSnapshot) || 0;
            return sum + weighted;
        }, 0);
        const recentWeight = recentLogs.reduce((sum, log) => sum + (log.evaluatorWeightSnapshot || 0), 0);
        const sotsRecent30Score = recentWeight > 0 ? recentWeightedScore / recentWeight : 0;

        const aggregates = {
            sotsGlobalScore: parseFloat(sotsGlobalScore.toFixed(2)),
            sotsRecent30Score: parseFloat(sotsRecent30Score.toFixed(2)),
            totalVotes: sotsLogs.length
        };

        // Calculate per-dimension averages for sotsAverages
        const dimensions = ['funWork', 'toxicityAvoidance', 'fairnessResourcefulness', 'attitudePositivity', 'communication'];
        const sotsAverages = {};
        for (const dim of dimensions) {
            const logsWithDim = sotsLogs.filter(log => log[dim] != null);
            if (logsWithDim.length > 0) {
                const avg = logsWithDim.reduce((sum, log) => sum + (log[dim] || 0), 0) / logsWithDim.length;
                sotsAverages[dim] = parseFloat(avg.toFixed(2));
            }
        }

        // talentStatus classification: candidat / exploratoire / actif / vitrine
        function computeTalentStatus(globalScore, totalVotes) {
            if (totalVotes < 3) return 'candidat';
            if (globalScore < 2.5) return 'exploratoire';
            if (globalScore < 3.5) return 'actif';
            return 'vitrine';
        }

        // Routing: mise à jour de l'entité cible
        let updated = false;
        
        try {
            if (resolvedTargetType === 'user') {
                const profiles = await base44.asServiceRole.entities.TalentProfile.filter({ userId: resolvedTargetId });
                if (profiles.length > 0) {
                    const profile = profiles[0];
                    let xpGlobal = profile.xpGlobal || 0;
                    try {
                        const allProgress = await base44.asServiceRole.entities.DomainProgress.filter({ userId: resolvedTargetId });
                        if (allProgress && allProgress.length > 0) {
                            xpGlobal = allProgress.reduce((sum, dp) => sum + (dp.xp || 0), 0);
                        }
                    } catch (xpErr) {
                        console.warn('computeSOTS: xpGlobal sync failed (non-fatal):', xpErr);
                    }
                    const newStatus = computeTalentStatus(aggregates.sotsGlobalScore, aggregates.totalVotes);
                    await base44.asServiceRole.entities.TalentProfile.update(profile.id, {
                        ...aggregates,
                        sotsAverages,
                        xpGlobal,
                        talentStatus: newStatus,
                    });
                    updated = true;
                }
            } else if (resolvedTargetType === 'style') {
                const styles = await base44.asServiceRole.entities.StyleHierarchy.filter({ systemId: resolvedTargetId });
                if (styles.length > 0) {
                    await base44.asServiceRole.entities.StyleHierarchy.update(styles[0].id, aggregates);
                    updated = true;
                }
            } else if (resolvedTargetType === 'role') {
                const roles = await base44.asServiceRole.entities.RoleHierarchy.filter({ systemId: resolvedTargetId });
                if (roles.length > 0) {
                    await base44.asServiceRole.entities.RoleHierarchy.update(roles[0].id, aggregates);
                    updated = true;
                }
            } else if (resolvedTargetType === 'checkpoint') {
                const checkpoints = await base44.asServiceRole.entities.Checkpoint.filter({ systemId: resolvedTargetId });
                if (checkpoints.length > 0) {
                    await base44.asServiceRole.entities.Checkpoint.update(checkpoints[0].id, aggregates);
                    updated = true;
                }
            } else if (resolvedTargetType === 'event') {
                const events = await base44.asServiceRole.entities.Event.filter({ id: resolvedTargetId });
                if (events.length > 0) {
                    await base44.asServiceRole.entities.Event.update(events[0].id, aggregates);
                    updated = true;
                }
            }
        } catch (updateError) {
            console.error(`computeSOTS: failed to update ${resolvedTargetType}/${resolvedTargetId}:`, updateError);
        }

        if (!updated) {
            console.warn(`computeSOTS: target not found: ${resolvedTargetType}/${resolvedTargetId}`);
        }

        // Build optimistic return values for 'user' target
        let talentStatus = null;
        let xpGlobal = null;
        if (resolvedTargetType === 'user') {
            try {
                const profiles = await base44.asServiceRole.entities.TalentProfile.filter({ userId: resolvedTargetId });
                if (profiles.length > 0) {
                    talentStatus = profiles[0].talentStatus || null;
                    xpGlobal = profiles[0].xpGlobal || 0;
                }
            } catch { /* non-fatal */ }
        }

        return Response.json({
            ok: true,
            success: true,
            targetType: resolvedTargetType,
            targetId: resolvedTargetId,
            updated,
            ...aggregates,
            recentVotes: recentLogs.length,
            talentStatus,
            xpGlobal,
        });

    } catch (error) {
        console.error('computeSOTS:', error?.message || error);
        return Response.json({ ok: false, error: error.message }, { status: 500 });
    }
});