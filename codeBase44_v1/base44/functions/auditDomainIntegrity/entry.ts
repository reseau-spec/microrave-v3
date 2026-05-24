// deploy: v2
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const VALID_DOMAIN_KEYS = [
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

        // Charger tous les rôles et styles
        const [allRoles, allStyles, allMappings] = await Promise.all([
            base44.asServiceRole.entities.RoleHierarchy.filter({}),
            base44.asServiceRole.entities.StyleHierarchy.filter({}),
            base44.asServiceRole.entities.RoleDomainMap.filter({})
        ]);

        const rootRolesMissingDomainKey = [];
        const stylesMissingDomainKey = [];
        const unmappedRoles = [];
        const invalidDomainKeys = [];

        // 1) Root roles sans domainKey
        const rootRoles = allRoles.filter(r => r.level === 1);
        for (const root of rootRoles) {
            if (!root.domainKey || root.domainKey.trim() === '') {
                rootRolesMissingDomainKey.push({
                    systemId: root.systemId,
                    nameFr: root.nameFr,
                    level: root.level
                });
            }
        }

        // 2) Styles actifs sans domainKey
        const activeStyles = allStyles.filter(s => s.active === true);
        for (const style of activeStyles) {
            if (!style.domainKey || style.domainKey.trim() === '') {
                stylesMissingDomainKey.push({
                    systemId: style.systemId,
                    displayName: style.displayName,
                    level: style.level
                });
            }
        }

        // 3) Rôles sans mapping
        const mappedRoleIds = new Set(allMappings.filter(m => m.isActive === true).map(m => m.roleSystemId));
        for (const role of allRoles) {
            if (!mappedRoleIds.has(role.systemId)) {
                unmappedRoles.push({
                    systemId: role.systemId,
                    nameFr: role.nameFr,
                    level: role.level
                });
            }
        }

        // 4) DomainKeys invalides (hors enum)
        // Vérifier root roles
        for (const root of rootRoles) {
            if (root.domainKey && !VALID_DOMAIN_KEYS.includes(root.domainKey.toLowerCase())) {
                invalidDomainKeys.push({
                    type: 'role',
                    systemId: root.systemId,
                    name: root.nameFr,
                    invalidDomainKey: root.domainKey
                });
            }
        }

        // Vérifier styles
        for (const style of allStyles) {
            if (style.domainKey && !VALID_DOMAIN_KEYS.includes(style.domainKey.toLowerCase())) {
                invalidDomainKeys.push({
                    type: 'style',
                    systemId: style.systemId,
                    name: style.displayName,
                    invalidDomainKey: style.domainKey
                });
            }
        }

        // Vérifier mappings
        for (const mapping of allMappings) {
            if (mapping.domainKey && !VALID_DOMAIN_KEYS.includes(mapping.domainKey.toLowerCase())) {
                invalidDomainKeys.push({
                    type: 'mapping',
                    roleSystemId: mapping.roleSystemId,
                    invalidDomainKey: mapping.domainKey
                });
            }
        }

        const stats = {
            totalRoles: allRoles.length,
            totalRootRoles: rootRoles.length,
            totalStyles: allStyles.length,
            totalActiveStyles: activeStyles.length,
            totalMappings: allMappings.length,
            totalActiveMappings: allMappings.filter(m => m.isActive === true).length,
            issues: {
                rootRolesMissingDomainKey: rootRolesMissingDomainKey.length,
                stylesMissingDomainKey: stylesMissingDomainKey.length,
                unmappedRoles: unmappedRoles.length,
                invalidDomainKeys: invalidDomainKeys.length
            }
        };

        const hasIssues = 
            rootRolesMissingDomainKey.length > 0 ||
            stylesMissingDomainKey.length > 0 ||
            unmappedRoles.length > 0 ||
            invalidDomainKeys.length > 0;

        return new Response(JSON.stringify({ 
            ok: true,
            status: hasIssues ? 'issues_found' : 'healthy',
            rootRolesMissingDomainKey,
            stylesMissingDomainKey,
            unmappedRoles,
            invalidDomainKeys,
            stats,
            validDomainKeys: VALID_DOMAIN_KEYS
        }), { 
            status: 200, 
            headers: { 'content-type': 'application/json' } 
        });

    } catch (error) {
        console.error('auditDomainIntegrity error:', error);
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