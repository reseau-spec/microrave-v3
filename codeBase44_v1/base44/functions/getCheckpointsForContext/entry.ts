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
        const { domainKey, selectedStyleIds = [], limit = 50 } = body;

        if (!domainKey) {
            return new Response(JSON.stringify({
                ok: false,
                error: 'domainKey is required'
            }), {
                status: 400,
                headers: { 'content-type': 'application/json' }
            });
        }

        // Charger checkpoints actifs du domaine
        const checkpoints = await base44.entities.Checkpoint.filter({
            domainKey,
            active: true
        });

        const recommended = [];
        const others = [];

        checkpoints.forEach(checkpoint => {
            const styleTags = checkpoint.styleTags || [];
            
            // Check intersection avec selectedStyleIds
            const hasMatch = selectedStyleIds.length > 0 && 
                             selectedStyleIds.some(sid => styleTags.includes(sid));

            if (hasMatch) {
                recommended.push(checkpoint);
            } else {
                others.push(checkpoint);
            }
        });

        // Trier par nom
        recommended.sort((a, b) => a.name.localeCompare(b.name));
        others.sort((a, b) => a.name.localeCompare(b.name));

        // Limiter
        const limitedRecommended = recommended.slice(0, limit);
        const remainingSlots = limit - limitedRecommended.length;
        const limitedOthers = others.slice(0, remainingSlots);

        return new Response(JSON.stringify({
            ok: true,
            domainKey,
            recommended: limitedRecommended,
            others: limitedOthers,
            meta: {
                total: checkpoints.length,
                recommendedCount: recommended.length,
                othersCount: others.length
            }
        }), {
            status: 200,
            headers: { 'content-type': 'application/json' }
        });

    } catch (error) {
        console.error('getCheckpointsForContext error:', error);
        return new Response(JSON.stringify({
            ok: false,
            error: error.message
        }), {
            status: 500,
            headers: { 'content-type': 'application/json' }
        });
    }
});