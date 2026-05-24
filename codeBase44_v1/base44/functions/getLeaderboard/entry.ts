import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        const service = base44.asServiceRole;

        if (!user) {
            return new Response(JSON.stringify({
                ok: false,
                error: 'Authentication required'
            }), {
                status: 401,
                headers: { 'content-type': 'application/json' }
            });
        }

        const body = await req.json().catch(() => ({}));
        const { domainKey, limit = 50 } = body;

        if (!domainKey) {
            return new Response(JSON.stringify({
                ok: false,
                error: 'domainKey is required'
            }), {
                status: 400,
                headers: { 'content-type': 'application/json' }
            });
        }

        // Charger stats pour ce domaine
        const stats = await service.entities.UserDomainStats.filter({
            domainKey
        });

        // Trier par points desc*
        stats.sort((a, b) => b.points - a.points);

        // Limiter
        const topStats = stats.slice(0, limit);

        // Charger profiles pour displayName
        const userIds = topStats.map(s => s.userId);
        const profiles = await service.entities.TalentProfile.filter({
            userId: { $in: userIds }
        });

        const profileMap = {};
        profiles.forEach(p => {
            profileMap[p.userId] = p;
        });

        // Construire résultat
        const items = topStats.map((stat, idx) => {
            const profile = profileMap[stat.userId];
            
            return {
                rank: idx + 1,
                userId: stat.userId,
                displayName: profile?.displayName || `Joueur ${stat.userId.slice(-4)}`,
                points: stat.points,
                sessionsCount: stat.sessionsCount,
                sotsSubmittedCount: stat.sotsSubmittedCount,
                avgSotsScore: stat.avgSotsScore
            };
        });

        return new Response(JSON.stringify({
            ok: true,
            domainKey,
            items,
            total: stats.length
        }), {
            status: 200,
            headers: { 'content-type': 'application/json' }
        });

    } catch (error) {
        console.error('getLeaderboard error:', error);
        return new Response(JSON.stringify({
            ok: false,
            error: error.message
        }), {
            status: 500,
            headers: { 'content-type': 'application/json' }
        });
    }
});