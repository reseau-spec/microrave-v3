// deploy: v3
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

// v3 — VALID_DOMAINS construit dynamiquement depuis StyleHierarchy (chargée ligne ~30)
// La constante est déclarée ici mais peuplée après le chargement des styles dans le handler.

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

        // Charger tous les checkpoints actifs
        const checkpoints = await base44.asServiceRole.entities.Checkpoint.filter({
            active: true
        });

        // Charger tous les styles pour validation styleTags
        const allStyles = await base44.asServiceRole.entities.StyleHierarchy.filter({});
        const validStyleIds = new Set(allStyles.map(s => s.systemId));
        // v3 — VALID_DOMAINS dynamique : tous les domainKey uniques dans StyleHierarchy
        const VALID_DOMAINS = new Set(allStyles.map(s => s.domainKey).filter(Boolean));

        // Issues
        const missingDomain = [];
        const invalidDomain = [];
        const invalidStyleTags = [];
        const statsByDomain = {};

        checkpoints.forEach(checkpoint => {
            // Check domainKey
            if (!checkpoint.domainKey) {
                missingDomain.push({
                    systemId: checkpoint.systemId,
                    name: checkpoint.name,
                    type: checkpoint.type
                });
            } else if (!VALID_DOMAINS.has(checkpoint.domainKey)) {
                invalidDomain.push({
                    systemId: checkpoint.systemId,
                    name: checkpoint.name,
                    domainKey: checkpoint.domainKey
                });
            } else {
                // Count by domain
                statsByDomain[checkpoint.domainKey] = (statsByDomain[checkpoint.domainKey] || 0) + 1;
            }

            // Check styleTags
            if (checkpoint.styleTags && Array.isArray(checkpoint.styleTags)) {
                const invalidTags = checkpoint.styleTags.filter(tag => !validStyleIds.has(tag));
                if (invalidTags.length > 0) {
                    invalidStyleTags.push({
                        systemId: checkpoint.systemId,
                        name: checkpoint.name,
                        invalidTags
                    });
                }
            }
        });

        const hasIssues = 
            missingDomain.length > 0 ||
            invalidDomain.length > 0 ||
            invalidStyleTags.length > 0;

        return new Response(JSON.stringify({
            ok: true,
            status: hasIssues ? 'issues_found' : 'healthy',
            totalCheckpoints: checkpoints.length,
            statsByDomain,
            issues: {
                missingDomain,
                invalidDomain,
                invalidStyleTags
            },
            summary: {
                missingDomainCount: missingDomain.length,
                invalidDomainCount: invalidDomain.length,
                invalidStyleTagsCount: invalidStyleTags.length
            }
        }), {
            status: 200,
            headers: { 'content-type': 'application/json' }
        });

    } catch (error) {
        console.error('auditCheckpointIntegrity error:', error);
        return new Response(JSON.stringify({
            ok: false,
            error: error.message
        }), {
            status: 500,
            headers: { 'content-type': 'application/json' }
        });
    }
});