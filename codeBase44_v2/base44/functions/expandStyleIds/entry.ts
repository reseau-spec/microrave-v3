// deploy: v2
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

/**
 * Expand style IDs to include parents (L2) and roots (L1)
 * Input: { styleIds: string[] }
 * Output: { leafIds, parentIds, rootIds, allIds }
 */
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
        const { styleIds = [] } = body;

        if (!Array.isArray(styleIds) || styleIds.length === 0) {
            return new Response(JSON.stringify({
                ok: true,
                leafIds: [],
                parentIds: [],
                rootIds: [],
                allIds: []
            }), {
                status: 200,
                headers: { 'content-type': 'application/json' }
            });
        }

        // Charger tous les styles (ne pas filtrer par active pour permettre expansion complète)
        const allStyles = await base44.entities.StyleHierarchy.filter({});

        const styleMap = {};
        allStyles.forEach(s => {
            styleMap[s.systemId] = s;
        });

        const leafIds = new Set(styleIds);
        const parentIds = new Set();
        const rootIds = new Set();

        styleIds.forEach(styleId => {
            const style = styleMap[styleId];
            if (!style) return;

            // Add parent (L2)
            if (style.parentSystemId) {
                parentIds.add(style.parentSystemId);
            }

            // Add root (L1)
            if (style.racineSystemId) {
                rootIds.add(style.racineSystemId);
            } else if (style.level === 1) {
                // Le style est déjà une racine
                rootIds.add(styleId);
            }
        });

        const allIds = new Set([...leafIds, ...parentIds, ...rootIds]);

        return new Response(JSON.stringify({
            ok: true,
            leafIds: Array.from(leafIds),
            parentIds: Array.from(parentIds),
            rootIds: Array.from(rootIds),
            allIds: Array.from(allIds)
        }), {
            status: 200,
            headers: { 'content-type': 'application/json' }
        });

    } catch (error) {
        console.error('expandStyleIds error:', error);
        return new Response(JSON.stringify({
            ok: false,
            error: error.message
        }), {
            status: 500,
            headers: { 'content-type': 'application/json' }
        });
    }
});