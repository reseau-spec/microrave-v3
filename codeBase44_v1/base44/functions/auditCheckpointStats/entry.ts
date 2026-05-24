import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

/**
 * Audit checkpoint stats (admin only)
 * Returns diagnostics about data quality
 */

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user || user.role !== 'admin') {
            return new Response(JSON.stringify({
                ok: false,
                error: 'Admin access required'
            }), { status: 403, headers: { 'content-type': 'application/json' } });
        }

        const issues = {
            checkpointsWithoutStats: [],
            sessionsWithoutCheckpoint: [],
            sessionsWithoutDomain: [],
            unknownStyleLeafIds: []
        };

        // 1. Checkpoints with 0 stats
        const allCheckpointsRaw = await base44.asServiceRole.entities.Checkpoint.filter({});
        const allCheckpoints = allCheckpointsRaw.filter(cp => cp.active === true || cp.active === 'true');
        const domainStats = await base44.asServiceRole.entities.CheckpointDomainStats.filter({});
        
        const checkpointsWithStats = new Set(domainStats.map(s => s.checkpointSystemId));
        
        for (const cp of allCheckpoints) {
            if (!checkpointsWithStats.has(cp.systemId)) {
                issues.checkpointsWithoutStats.push({
                    systemId: cp.systemId,
                    name: cp.name
                });
            }
        }

        // 2. Validated sessions without checkpoint
        const validatedSessions = await base44.asServiceRole.entities.Session.filter({
            validatedBySystem: true,
            status: 'completed'
        });

        for (const session of validatedSessions) {
            if (!session.checkpointSystemId) {
                issues.sessionsWithoutCheckpoint.push({
                    id: session.id,
                    createdDate: session.created_date
                });
            } else {
                // Check if we can derive domainKey
                const participants = session.participants || [];
                if (participants.length > 0 && participants[0].roleSystemId) {
                    const roles = await base44.asServiceRole.entities.RoleHierarchy.filter({
                        systemId: participants[0].roleSystemId
                    });
                    
                    if (!roles || roles.length === 0 || !roles[0].domainKey) {
                        issues.sessionsWithoutDomain.push({
                            id: session.id,
                            roleSystemId: participants[0].roleSystemId
                        });
                    }
                }
            }
        }

        // 3. Unknown styleLeafIds
        const styleStats = await base44.asServiceRole.entities.CheckpointStyleStats.filter({});
        const uniqueStyleIds = new Set(styleStats.map(s => s.styleLeafId));
        
        const allStyles = await base44.asServiceRole.entities.StyleHierarchy.filter({});
        const validStyleIds = new Set(allStyles.map(s => s.systemId));

        for (const styleId of uniqueStyleIds) {
            if (!validStyleIds.has(styleId)) {
                issues.unknownStyleLeafIds.push(styleId);
            }
        }

        return new Response(JSON.stringify({
            ok: true,
            issues,
            summary: {
                checkpointsWithoutStats: issues.checkpointsWithoutStats.length,
                sessionsWithoutCheckpoint: issues.sessionsWithoutCheckpoint.length,
                sessionsWithoutDomain: issues.sessionsWithoutDomain.length,
                unknownStyleLeafIds: issues.unknownStyleLeafIds.length
            }
        }), { status: 200, headers: { 'content-type': 'application/json' } });

    } catch (error) {
        console.error('auditCheckpointStats error:', error);
        return new Response(JSON.stringify({
            ok: false,
            error: error.message
        }), { status: 500, headers: { 'content-type': 'application/json' } });
    }
});