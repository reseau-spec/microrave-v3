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

        // Chercher progress existant * 
        const existing = await service.entities.DomainProgress.filter({
            userId: user.id,
            domainKey
        });

        let progress;
        
        if (existing.length > 0) {
            progress = existing[0];
        } else {
            // Créer automatiquement
            progress = await service.entities.DomainProgress.create({
                userId: user.id,
                domainKey,
                xp: 0,
                level: 1,
                updatedAt: new Date().toISOString()
            });
        }

        return new Response(JSON.stringify({ 
            ok: true,
            progress
        }), { 
            status: 200, 
            headers: { 'content-type': 'application/json' } 
        });

    } catch (error) {
        console.error('getDomainProgress error:', error);
        return new Response(JSON.stringify({ 
            ok: false, 
            error: error.message 
        }), { 
            status: 500, 
            headers: { 'content-type': 'application/json' } 
        });
    }
});