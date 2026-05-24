import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

/***
 * Get ALL active checkpoints with usage-based scoring
 * Returns ALL checkpoints (no hard filtering by style/role)
 * Scoring boosts compatible styles/roles if stats available
 * Input: { domainKey, styleSystemIds, roleSystemId, center, radiusKm, limit }
 */

function json(status, body) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' }
    });
}

function jsonError(status, code, message, extra = {}) {
    return json(status, { ok: false, code, error: message, ...extra });
}

function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        const service = base44.asServiceRole;

        if (!user) {
            return jsonError(401, 'UNAUTHENTICATED', 'User not authenticated');
        }

        const body = await req.json().catch(() => ({}));
        const { 
            domainKey = null,
            styleSystemIds = [], 
            roleSystemId = null,
            center = null,
            radiusKm = null,
            limit = 50
        } = body;

        // Expand styles pour scoring
        let expandedStyles = { 
            leafIds: styleSystemIds, 
            parentIds: [], 
            rootIds: [], 
            allIds: styleSystemIds 
        };
        
        if (styleSystemIds.length > 0) {
            expandedStyles = {
                leafIds: styleSystemIds,
                parentIds: [],
                rootIds: [],
                allIds: styleSystemIds
            };
        }

        // Fetch ALL active checkpoints — aucun filtre par domainKey.
        // Le domainDominantKey est une propriété calculée a posteriori depuis
        // les sessions réelles (un bar peut avoir de l'humour le mercredi et
        // être un dancefloor le samedi). La sélection d'un checkpoint ne doit
        // jamais être restreinte par son domaine configuré statiquement.
        // Fetch ALL checkpoints sans filtre booléen (Base44 stocke active comme string 'true'/'false'/'')
        // On filtre ensuite en JS pour éviter le mismatch boolean vs string
        const allCheckpointsRaw = await service.entities.Checkpoint.filter({});
        const allCheckpoints = (allCheckpointsRaw || []).filter(cp => cp.active === true || cp.active === 'true');

        if (!allCheckpoints || allCheckpoints.length === 0) {
            return json(200, {
                ok: true,
                checkpoints: [],
                count: 0,
                message: 'Aucun checkpoint actif'
            });
        }

        // Shortcut: if no domainKey, skip all stats and return checkpoints by name
        if (!domainKey) {
            const simple = allCheckpoints
                .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
                .slice(0, limit);
            return json(200, {
                ok: true,
                checkpoints: simple,
                count: simple.length,
                hasStats: false,
                domainKey: null
            });
        }

        // Fetch usage stats (pour scoring)
        const checkpointIds = allCheckpoints.map(cp => cp.systemId);
        
        let domainStats = [];
        let styleStats = [];
        let roleStats = [];

        // Charger toutes les stats sans filtre DB (évite 502 sur champs non indexés)
        // puis filtrer en mémoire par domainKey + checkpointIds
        const cpIdSet = new Set(checkpointIds);
        [domainStats, styleStats, roleStats] = await Promise.all([
            domainKey
                ? service.entities.CheckpointDomainStats.filter({}).catch(() => [])
                    .then(all => all.filter(r => r.domainKey === domainKey && cpIdSet.has(r.checkpointSystemId)))
                : Promise.resolve([]),
            (expandedStyles.allIds.length > 0 && domainKey)
                ? service.entities.CheckpointStyleStats.filter({}).catch(() => [])
                    .then(all => all.filter(r => r.domainKey === domainKey && expandedStyles.allIds.includes(r.styleLeafId) && cpIdSet.has(r.checkpointSystemId)))
                : Promise.resolve([]),
            (roleSystemId && domainKey)
                ? service.entities.CheckpointRoleStats.filter({}).catch(() => [])
                    .then(all => all.filter(r => r.domainKey === domainKey && r.roleSystemId === roleSystemId && cpIdSet.has(r.checkpointSystemId)))
                : Promise.resolve([]),
        ]);

        // Build score map
        const checkpointScores = {};
        
        domainStats.forEach(stat => {
            const cpId = stat.checkpointSystemId;
            if (!checkpointScores[cpId]) {
                checkpointScores[cpId] = { domain: 0, style: 0, role: 0, lastSessionAt: null };
            }
            checkpointScores[cpId].domain = stat.score || 0;
            checkpointScores[cpId].lastSessionAt = stat.lastSessionAt;
        });

        styleStats.forEach(stat => {
            const cpId = stat.checkpointSystemId;
            if (!checkpointScores[cpId]) {
                checkpointScores[cpId] = { domain: 0, style: 0, role: 0, lastSessionAt: null };
            }
            
            let matchScore = 0.5; // base score
            if (expandedStyles.leafIds.includes(stat.styleLeafId)) {
                matchScore = 1.0;
            } else if (expandedStyles.parentIds.includes(stat.styleLeafId)) {
                matchScore = 0.7;
            } else if (expandedStyles.rootIds.includes(stat.styleLeafId)) {
                matchScore = 0.4;
            }
            
            checkpointScores[cpId].style += (stat.score || 0) * matchScore;
        });

        roleStats.forEach(stat => {
            const cpId = stat.checkpointSystemId;
            if (!checkpointScores[cpId]) {
                checkpointScores[cpId] = { domain: 0, style: 0, role: 0, lastSessionAt: null };
            }
            checkpointScores[cpId].role = stat.score || 0;
        });

        // Calculate final scores
        const hasRole = roleSystemId !== null;
        const domainWeight = 0.4;
        const styleWeight = hasRole ? 0.5 : 0.6;
        const roleWeight = hasRole ? 0.1 : 0.0;

        let checkpoints = allCheckpoints.map(cp => {
            const scores = checkpointScores[cp.systemId] || { domain: 0, style: 0, role: 0, lastSessionAt: null };
            const finalScore = 
                scores.domain * domainWeight +
                scores.style * styleWeight +
                scores.role * roleWeight;

            return {
                ...cp,
                _matchScore: finalScore,
                _matchBreakdown: {
                    domain: scores.domain,
                    style: scores.style,
                    role: scores.role
                },
                _lastSessionAt: scores.lastSessionAt,
                _hasStats: finalScore > 0
            };
        });

        // Sort: score desc, then lastSessionAt desc, then distance, then name
        checkpoints.sort((a, b) => {
            if (b._matchScore !== a._matchScore) {
                return b._matchScore - a._matchScore;
            }
            
            if (a._lastSessionAt && b._lastSessionAt) {
                return new Date(b._lastSessionAt).getTime() - new Date(a._lastSessionAt).getTime();
            }
            
            if (center && a.geoLat && a.geoLng && b.geoLat && b.geoLng) {
                const distA = calculateDistance(center[1], center[0], a.geoLat, a.geoLng);
                const distB = calculateDistance(center[1], center[0], b.geoLat, b.geoLng);
                return distA - distB;
            }
            
            return (a.name || '').localeCompare(b.name || '');
        });

        // Filter by radius if provided
        if (center && radiusKm) {
            checkpoints = checkpoints.filter(cp => {
                if (!cp.geoLat || !cp.geoLng) return true; // include if no coords
                const dist = calculateDistance(center[1], center[0], cp.geoLat, cp.geoLng);
                return dist <= radiusKm;
            });
        }

        // Limit
        checkpoints = checkpoints.slice(0, limit);

        return json(200, {
            ok: true,
            checkpoints,
            count: checkpoints.length,
            hasStats: checkpoints.some(cp => cp._hasStats),
            domainKey
        });

    } catch (error) {
        console.error('getCheckpointsForSelection error:', error);
        return jsonError(500, 'INTERNAL', error.message);
    }
});