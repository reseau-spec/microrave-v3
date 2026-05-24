import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // ADMIN ONLY: Cette fonction ne doit être appelée que par des administrateurs
        if (user.role !== 'admin') {
            return Response.json({ 
                error: 'Forbidden: Admin access required for backfill operation' 
            }, { status: 403 });
        }

        // Récupérer tous les TalentProfiles
        const profiles = await base44.asServiceRole.entities.TalentProfile.filter({});
        
        const results = [];
        let processed = 0;
        let errors = 0;

        for (const profile of profiles) {
            try {
                // Récupérer tous les SOTSLogs pour cet utilisateur
                const sotsLogs = await base44.asServiceRole.entities.SOTSLog.filter({
                    targetType: 'user',
                    targetId: profile.userId
                });

                if (sotsLogs.length === 0) {
                    // Aucune donnée SOTS, mettre à zéro
                    await base44.asServiceRole.entities.TalentProfile.update(profile.id, {
                        sotsGlobalScore: 0,
                        sotsRecent30Score: 0
                    });
                    results.push({
                        userId: profile.userId,
                        sotsGlobalScore: 0,
                        sotsRecent30Score: 0,
                        totalVotes: 0,
                        recentVotes: 0
                    });
                    processed++;
                    continue;
                }

                // Calcul du score global (moyenne pondérée)
                const totalWeightedScore = sotsLogs.reduce((sum, log) => sum + (log.scoreWeighted || 0), 0);
                const totalWeight = sotsLogs.reduce((sum, log) => sum + (log.evaluatorWeightSnapshot || 0), 0);
                const sotsGlobalScore = totalWeight > 0 ? totalWeightedScore / totalWeight : 0;

                // Calcul du score des 30 derniers jours
                const thirtyDaysAgo = new Date();
                thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
                
                const recentLogs = sotsLogs.filter(log => {
                    const logDate = new Date(log.created_date);
                    return logDate >= thirtyDaysAgo;
                });

                const recentWeightedScore = recentLogs.reduce((sum, log) => sum + (log.scoreWeighted || 0), 0);
                const recentWeight = recentLogs.reduce((sum, log) => sum + (log.evaluatorWeightSnapshot || 0), 0);
                const sotsRecent30Score = recentWeight > 0 ? recentWeightedScore / recentWeight : 0;

                // Mise à jour du profil (écriture uniquement des agrégats)
                await base44.asServiceRole.entities.TalentProfile.update(profile.id, {
                    sotsGlobalScore: parseFloat(sotsGlobalScore.toFixed(2)),
                    sotsRecent30Score: parseFloat(sotsRecent30Score.toFixed(2))
                });

                results.push({
                    userId: profile.userId,
                    sotsGlobalScore: parseFloat(sotsGlobalScore.toFixed(2)),
                    sotsRecent30Score: parseFloat(sotsRecent30Score.toFixed(2)),
                    totalVotes: sotsLogs.length,
                    recentVotes: recentLogs.length
                });

                processed++;

            } catch (err) {
                console.error(`Backfill error for userId ${profile.userId}:`, err);
                errors++;
                results.push({
                    userId: profile.userId,
                    error: err.message
                });
            }
        }

        return Response.json({
            success: true,
            message: `Backfill completed: ${processed} profiles processed, ${errors} errors`,
            summary: {
                totalProfiles: profiles.length,
                processed,
                errors
            },
            results: results.slice(0, 50) // Limiter l'output pour ne pas surcharger
        });

    } catch (error) {
        console.error('Backfill aggregates error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});