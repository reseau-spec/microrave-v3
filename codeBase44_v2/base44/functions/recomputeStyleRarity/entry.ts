// deploy: v2
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const VALID_DOMAINS = [
    'music', 'humour', 'photo', 'video', 'food',
    'art', 'responsable'
];

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user || user.role !== 'admin') {
            return new Response(JSON.stringify({
                ok: false,
                error: 'Admin access required'
            }), {
                status: 403,
                headers: { 'content-type': 'application/json' }
            });
        }

        // Charger toutes les sessions valides (completed, archived, sots_submitted)
        const validStatuses = ['completed', 'archived', 'sots_submitted'];
        const sessions = await base44.asServiceRole.entities.Session.filter({
            status: { $in: validStatuses }
        });

        // Charger tous les styles
        const allStyles = await base44.asServiceRole.entities.StyleHierarchy.filter({});
        
        // Map styleSystemId -> domainKey
        const styleDomainMap = {};
        allStyles.forEach(s => {
            if (s.systemId && s.domainKey) {
                styleDomainMap[s.systemId] = s.domainKey;
            }
        });

        // Compter l'usage par style
        const usageMap = {}; // styleSystemId -> { domainKey, sessionsCount, lastSeenAt }

        sessions.forEach(session => {
            const participants = session.participants || [];
            const sessionDate = session.actualEndAt || session.updated_date || session.created_date;

            participants.forEach(p => {
                let styleIds = [];
                
                if (p.styleSystemIds && Array.isArray(p.styleSystemIds)) {
                    styleIds = p.styleSystemIds;
                } else if (p.styleSystemId) {
                    styleIds = [p.styleSystemId];
                }

                styleIds.forEach(styleId => {
                    if (!styleId) return;
                    
                    const domainKey = styleDomainMap[styleId];
                    if (!domainKey) return;

                    if (!usageMap[styleId]) {
                        usageMap[styleId] = {
                            domainKey,
                            sessionsCount: 0,
                            lastSeenAt: sessionDate
                        };
                    }

                    usageMap[styleId].sessionsCount++;
                    
                    if (sessionDate && (!usageMap[styleId].lastSeenAt || new Date(sessionDate) > new Date(usageMap[styleId].lastSeenAt))) {
                        usageMap[styleId].lastSeenAt = sessionDate;
                    }
                });
            });
        });

        // Calculer max sessions par domaine
        const maxByDomain = {};
        Object.values(usageMap).forEach(data => {
            const domain = data.domainKey;
            if (!maxByDomain[domain] || data.sessionsCount > maxByDomain[domain]) {
                maxByDomain[domain] = data.sessionsCount;
            }
        });

        // Calculer rarityIndex et upsert StyleUsageStats
        const now = new Date().toISOString();
        let created = 0;
        let updated = 0;

        for (const [styleSystemId, data] of Object.entries(usageMap)) {
            const maxSessions = maxByDomain[data.domainKey] || 1;
            const rarityIndex = Math.round(100 * (1 - data.sessionsCount / maxSessions));

            // Vérifier si existe déjà
            const existing = await base44.asServiceRole.entities.StyleUsageStats.filter({
                styleSystemId
            });

            if (existing.length > 0) {
                await base44.asServiceRole.entities.StyleUsageStats.update(existing[0].id, {
                    sessionsCount: data.sessionsCount,
                    lastSeenAt: data.lastSeenAt,
                    rarityIndex,
                    updatedAt: now
                });
                updated++;
            } else {
                await base44.asServiceRole.entities.StyleUsageStats.create({
                    styleSystemId,
                    domainKey: data.domainKey,
                    sessionsCount: data.sessionsCount,
                    votesCount: 0,
                    lastSeenAt: data.lastSeenAt,
                    rarityIndex,
                    updatedAt: now
                });
                created++;
            }
        }

        // Stats par domaine
        const statsByDomain = {};
        VALID_DOMAINS.forEach(d => {
            statsByDomain[d] = {
                totalStyles: 0,
                avgRarity: 0,
                maxSessions: maxByDomain[d] || 0
            };
        });

        Object.values(usageMap).forEach(data => {
            const domain = data.domainKey;
            statsByDomain[domain].totalStyles++;
        });

        // Top 10 rares/communs
        const allUsage = Object.entries(usageMap).map(([styleId, data]) => ({
            styleSystemId: styleId,
            domainKey: data.domainKey,
            sessionsCount: data.sessionsCount,
            rarityIndex: Math.round(100 * (1 - data.sessionsCount / (maxByDomain[data.domainKey] || 1)))
        }));

        allUsage.sort((a, b) => b.rarityIndex - a.rarityIndex);
        const top10Rare = allUsage.slice(0, 10);
        const top10Common = allUsage.slice(-10).reverse();

        return new Response(JSON.stringify({
            ok: true,
            created,
            updated,
            totalStyles: Object.keys(usageMap).length,
            statsByDomain,
            top10Rare,
            top10Common
        }), {
            status: 200,
            headers: { 'content-type': 'application/json' }
        });

    } catch (error) {
        console.error('recomputeStyleRarity error:', error);
        return new Response(JSON.stringify({
            ok: false,
            error: error.message,
            stack: error.stack
        }), {
            status: 500,
            headers: { 'content-type': 'application/json' }
        });
    }
});