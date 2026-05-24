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

        // Charger tous les styles actifs du domaine
        let styles = await base44.entities.StyleHierarchy.filter({
            domainKey,
            active: true
        });

        // Si roleSystemId fourni, filtrer par compatibilité
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

        // Charger layout positions
        const layoutRecords = await base44.entities.StyleGraphLayout.filter({
            domainKey
        });

        const layoutMap = {};
        layoutRecords.forEach(l => {
            layoutMap[l.styleSystemId] = { x: l.x, y: l.y };
        });

        // Construire nodes
        const nodes = styles.map(style => {
            const pos = layoutMap[style.systemId] || { x: 0, y: 0 };
            
            return {
                id: style.systemId,
                label: style.displayName,
                level: style.level,
                x: pos.x,
                y: pos.y,
                parent: style.parentSystemId || null,
                rarityTier: style.rarityTier || 'common',
                unlockLevel: style.unlockLevel || 1
            };
        });

        // Construire edges (parent → enfant)
        const edges = [];
        styles.forEach(style => {
            if (style.parentSystemId) {
                edges.push({
                    id: `e-${style.parentSystemId}-${style.systemId}`,
                    source: style.parentSystemId,
                    target: style.systemId,
                    type: 'parent'
                });
            }
        });

        return new Response(JSON.stringify({
            ok: true,
            domainKey,
            nodes,
            edges
        }), {
            status: 200,
            headers: { 'content-type': 'application/json' }
        });

    } catch (error) {
        console.error('getStyleGraph error:', error);
        return new Response(JSON.stringify({
            ok: false,
            error: error.message
        }), {
            status: 500,
            headers: { 'content-type': 'application/json' }
        });
    }
});