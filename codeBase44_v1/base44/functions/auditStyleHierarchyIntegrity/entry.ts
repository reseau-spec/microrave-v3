// deploy: v2
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

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

        // Charger tous les styles
        const allStyles = await base44.asServiceRole.entities.StyleHierarchy.filter({});

        // Stats de base
        const totalStyles = allStyles.length;
        const byDomainKey = {};
        const byLevel = { 1: 0, 2: 0, 3: 0 };

        // Maps pour validation
        const styleMap = {};
        allStyles.forEach(s => {
            styleMap[s.systemId] = s;
            
            // Count by domain
            if (s.domainKey) {
                byDomainKey[s.domainKey] = (byDomainKey[s.domainKey] || 0) + 1;
            }
            
            // Count by level
            if (s.level >= 1 && s.level <= 3) {
                byLevel[s.level]++;
            }
        });

        // Issues
        const orphans = [];
        const missingRoot = [];
        const levelMismatch = [];
        const domainMismatch = [];

        allStyles.forEach(style => {
            // Orphans: level > 1 sans parent valide
            if (style.level > 1) {
                if (!style.parentSystemId || !styleMap[style.parentSystemId]) {
                    orphans.push({
                        systemId: style.systemId,
                        displayName: style.displayName,
                        level: style.level,
                        parentSystemId: style.parentSystemId || null,
                        active: style.active
                    });
                }
            }

            // Missing root: level > 1 sans racine valide
            if (style.level > 1) {
                if (!style.racineSystemId || !styleMap[style.racineSystemId]) {
                    missingRoot.push({
                        systemId: style.systemId,
                        displayName: style.displayName,
                        level: style.level,
                        racineSystemId: style.racineSystemId || null,
                        active: style.active
                    });
                }
            }

            // Level mismatch
            if (style.level === 1 && style.parentSystemId) {
                levelMismatch.push({
                    systemId: style.systemId,
                    displayName: style.displayName,
                    issue: 'level1_with_parent',
                    level: style.level,
                    parentSystemId: style.parentSystemId
                });
            }

            if (style.level === 2 && style.parentSystemId) {
                const parent = styleMap[style.parentSystemId];
                if (parent && parent.level !== 1) {
                    levelMismatch.push({
                        systemId: style.systemId,
                        displayName: style.displayName,
                        issue: 'level2_parent_not_level1',
                        level: style.level,
                        parentSystemId: style.parentSystemId,
                        parentLevel: parent.level
                    });
                }
            }

            if (style.level === 3 && style.parentSystemId) {
                const parent = styleMap[style.parentSystemId];
                if (parent && parent.level !== 2) {
                    levelMismatch.push({
                        systemId: style.systemId,
                        displayName: style.displayName,
                        issue: 'level3_parent_not_level2',
                        level: style.level,
                        parentSystemId: style.parentSystemId,
                        parentLevel: parent.level
                    });
                }
            }

            // Domain mismatch
            if (style.level > 1 && style.racineSystemId && style.domainKey) {
                const root = styleMap[style.racineSystemId];
                if (root && root.domainKey && root.domainKey !== style.domainKey) {
                    domainMismatch.push({
                        systemId: style.systemId,
                        displayName: style.displayName,
                        level: style.level,
                        domainKey: style.domainKey,
                        rootDomainKey: root.domainKey
                    });
                }
            }
        });

        const hasIssues = 
            orphans.length > 0 ||
            missingRoot.length > 0 ||
            levelMismatch.length > 0 ||
            domainMismatch.length > 0;

        return new Response(JSON.stringify({
            ok: true,
            status: hasIssues ? 'issues_found' : 'healthy',
            totalStyles,
            byDomainKey,
            byLevel,
            issues: {
                orphans,
                missingRoot,
                levelMismatch,
                domainMismatch
            },
            summary: {
                orphansCount: orphans.length,
                missingRootCount: missingRoot.length,
                levelMismatchCount: levelMismatch.length,
                domainMismatchCount: domainMismatch.length
            }
        }), {
            status: 200,
            headers: { 'content-type': 'application/json' }
        });

    } catch (error) {
        console.error('auditStyleHierarchyIntegrity error:', error);
        return new Response(JSON.stringify({
            ok: false,
            error: error.message
        }), {
            status: 500,
            headers: { 'content-type': 'application/json' }
        });
    }
});