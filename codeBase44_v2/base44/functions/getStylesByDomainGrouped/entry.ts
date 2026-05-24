// deploy: v2
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

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
        const { domainKey, roleSystemId } = body;

        if (!domainKey) {
            return new Response(JSON.stringify({
                ok: false,
                error: 'domainKey is required'
            }), {
                status: 400,
                headers: { 'content-type': 'application/json' }
            });
        }

        // Charger styles actifs du domaine
        let styles = await base44.entities.StyleHierarchy.filter({
            domainKey,
            active: true
        });

        // Filtrer par role si fourni
        if (roleSystemId) {
            const roleMaps = await base44.entities.RoleStyleMap.filter({
                roleSystemId,
                isActive: true
            });

            if (roleMaps.length > 0) {
                const compatibleStyleIds = roleMaps.map(m => m.styleSystemId);
                styles = styles.filter(s => compatibleStyleIds.includes(s.systemId));
            }
        }

        // Grouper par level
        const level1 = styles.filter(s => s.level === 1);
        const level2 = styles.filter(s => s.level === 2);
        const level3 = styles.filter(s => s.level === 3);

        // Trier alpha
        level1.sort((a, b) => a.displayName.localeCompare(b.displayName));
        level2.sort((a, b) => a.displayName.localeCompare(b.displayName));
        level3.sort((a, b) => a.displayName.localeCompare(b.displayName));

        // Grouper level2 par parent
        const level2ByParent = {};
        level2.forEach(style => {
            const parent = style.parentSystemId || 'orphan';
            if (!level2ByParent[parent]) {
                level2ByParent[parent] = [];
            }
            level2ByParent[parent].push(style);
        });

        // Grouper level3 par parent
        const level3ByParent = {};
        level3.forEach(style => {
            const parent = style.parentSystemId || 'orphan';
            if (!level3ByParent[parent]) {
                level3ByParent[parent] = [];
            }
            level3ByParent[parent].push(style);
        });

        return new Response(JSON.stringify({
            ok: true,
            domainKey,
            level1,
            level2ByParent,
            level3ByParent,
            meta: {
                level1Count: level1.length,
                level2Count: level2.length,
                level3Count: level3.length
            }
        }), {
            status: 200,
            headers: { 'content-type': 'application/json' }
        });

    } catch (error) {
        console.error('getStylesByDomainGrouped error:', error);
        return new Response(JSON.stringify({
            ok: false,
            error: error.message
        }), {
            status: 500,
            headers: { 'content-type': 'application/json' }
        });
    }
});