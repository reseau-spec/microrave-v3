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

        // Charger tous les styles actifs
        const allActiveStyles = await base44.asServiceRole.entities.StyleHierarchy.filter({
            active: true
        });

        // Filtrer ceux qui n'ont pas de domainKey
        const invalidStyles = allActiveStyles.filter(style => 
            !style.domainKey || style.domainKey.trim() === ''
        );

        const results = invalidStyles.map(style => ({
            systemId: style.systemId,
            displayName: style.displayName,
            level: style.level,
            domainKey: style.domainKey || null,
            active: style.active
        }));

        return new Response(JSON.stringify({ 
            ok: true,
            totalActive: allActiveStyles.length,
            invalidCount: invalidStyles.length,
            invalidStyles: results,
            message: invalidStyles.length > 0 
                ? `Found ${invalidStyles.length} active style(s) missing domainKey. Please set domainKey on these styles.`
                : 'All active styles have valid domainKey.'
        }), { 
            status: 200, 
            headers: { 'content-type': 'application/json' } 
        });

    } catch (error) {
        console.error('listInvalidActiveStyles error:', error);
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