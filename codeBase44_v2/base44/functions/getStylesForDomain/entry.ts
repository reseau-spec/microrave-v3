import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        const service = base44.asServiceRole;

        if (!user) {
            return new Response(JSON.stringify({ 
                ok: false, 
                error: 'Unauthenticated' 
            }), { 
                status: 401, 
                headers: { 'content-type': 'application/json' } 
            });
        }

        const body = await req.json().catch(() => ({}));
        const { domainKey } = body;

        if (!domainKey) {
            return new Response(JSON.stringify({ 
                ok: false, 
                error: 'domainKey required' 
            }), { 
                status: 400, 
                headers: { 'content-type': 'application/json' } 
            });
        }

        // Charger tous les styles actifs de ce domaine
        const styles = await service.entities.StyleHierarchy.filter({
            domainKey,
            active: true
        });

        // Trier alphabétiquement*
        styles.sort((a, b) => (a.displayName || '').localeCompare(b.displayName || ''));

        return new Response(JSON.stringify({ 
            ok: true,
            domainKey,
            styles
        }), { 
            status: 200, 
            headers: { 'content-type': 'application/json' } 
        });

    } catch (error) {
        console.error('getStylesForDomain error:', error);
        return new Response(JSON.stringify({ 
            ok: false, 
            error: error.message 
        }), { 
            status: 500, 
            headers: { 'content-type': 'application/json' } 
        });
    }
});