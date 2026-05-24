// deploy: v2
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const VALID_DOMAIN_KEYS = [
    'music', 'humour', 'photo', 'video', 'food', 
    'art', 'responsable', 
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

        // Charger tous les checkpoints
        const allCheckpoints = await base44.asServiceRole.entities.Checkpoint.filter({});

        const activeCheckpointsMissingDomain = [];
        const invalidDomainKeys = [];
        const statsByDomain = {};

        // Initialiser stats
        VALID_DOMAIN_KEYS.forEach(key => {
            statsByDomain[key] = { total: 0, active: 0 };
        });
        statsByDomain['null'] = { total: 0, active: 0 };

        // Analyser chaque checkpoint
        for (const checkpoint of allCheckpoints) {
            const isActive = checkpoint.isActive !== false;
            
            // 1) Checkpoints actifs sans domainKey
            if (isActive && (!checkpoint.domainKey || checkpoint.domainKey.trim() === '')) {
                activeCheckpointsMissingDomain.push({
                    systemId: checkpoint.systemId,
                    name: checkpoint.name,
                    type: checkpoint.type
                });
            }

            // 2) DomainKeys invalides (hors enum)
            if (checkpoint.domainKey) {
                if (!VALID_DOMAIN_KEYS.includes(checkpoint.domainKey.toLowerCase())) {
                    invalidDomainKeys.push({
                        systemId: checkpoint.systemId,
                        name: checkpoint.name,
                        invalidDomainKey: checkpoint.domainKey
                    });
                }
            }

            // 3) Stats par domaine
            const domainKey = checkpoint.domainKey || 'null';
            if (!statsByDomain[domainKey]) {
                statsByDomain[domainKey] = { total: 0, active: 0 };
            }
            statsByDomain[domainKey].total++;
            if (isActive) {
                statsByDomain[domainKey].active++;
            }
        }

        const hasIssues = 
            activeCheckpointsMissingDomain.length > 0 ||
            invalidDomainKeys.length > 0;

        return new Response(JSON.stringify({ 
            ok: true,
            status: hasIssues ? 'issues_found' : 'healthy',
            activeCheckpointsMissingDomain,
            invalidDomainKeys,
            statsByDomain,
            stats: {
                totalCheckpoints: allCheckpoints.length,
                activeCheckpoints: allCheckpoints.filter(c => c.isActive !== false).length,
                issues: {
                    activeCheckpointsMissingDomain: activeCheckpointsMissingDomain.length,
                    invalidDomainKeys: invalidDomainKeys.length
                }
            },
            validDomainKeys: VALID_DOMAIN_KEYS
        }), { 
            status: 200, 
            headers: { 'content-type': 'application/json' } 
        });

    } catch (error) {
        console.error('auditCheckpointDomainIntegrity error:', error);
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