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

        const styles = await base44.asServiceRole.entities.StyleHierarchy.filter({});
        
        let migrated = 0;
        let alreadyOk = 0;

        for (const style of styles) {
            if (!style.domainKey) {
                await base44.asServiceRole.entities.StyleHierarchy.update(style.id, {
                    domainKey: 'music'
                });
                migrated++;
            } else {
                alreadyOk++;
            }
        }

        return new Response(JSON.stringify({ 
            ok: true,
            total: styles.length,
            migrated,
            alreadyOk,
            message: 'All existing styles set to domainKey=music'
        }), { 
            status: 200, 
            headers: { 'content-type': 'application/json' } 
        });

    } catch (error) {
        console.error('migrateStyleDomains error:', error);
        return new Response(JSON.stringify({ 
            ok: false, 
            error: error.message 
        }), { 
            status: 500, 
            headers: { 'content-type': 'application/json' } 
        });
    }
});