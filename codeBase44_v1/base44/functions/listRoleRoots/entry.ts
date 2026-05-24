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

        // Charger tous les rôles de niveau 1 (racines)
        const rootRoles = await base44.asServiceRole.entities.RoleHierarchy.filter({
            level: 1
        });

        // Séparer ceux qui ont/n'ont pas de domainKey
        const missingDomain = rootRoles.filter(role => 
            !role.domainKey || role.domainKey.trim() === ''
        );

        const withDomain = rootRoles.filter(role => 
            role.domainKey && role.domainKey.trim() !== ''
        );

        const roots = rootRoles.map(role => ({
            systemId: role.systemId,
            nameFr: role.nameFr,
            nameEn: role.nameEn,
            domainKey: role.domainKey || null,
            active: role.active,
            hasDomain: !!(role.domainKey && role.domainKey.trim())
        }));

        return new Response(JSON.stringify({ 
            ok: true,
            totalRoots: rootRoles.length,
            withDomainCount: withDomain.length,
            missingDomainCount: missingDomain.length,
            roots: roots.sort((a, b) => a.nameFr.localeCompare(b.nameFr)),
            missingDomain: missingDomain.map(r => ({
                systemId: r.systemId,
                nameFr: r.nameFr,
                active: r.active
            })),
            message: missingDomain.length > 0 
                ? `⚠️ ${missingDomain.length} rôle(s) racine(s) sans domainKey. Remplis-les dans RoleHierarchy.`
                : '✅ Toutes les racines ont un domainKey.'
        }), { 
            status: 200, 
            headers: { 'content-type': 'application/json' } 
        });

    } catch (error) {
        console.error('listRoleRoots error:', error);
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