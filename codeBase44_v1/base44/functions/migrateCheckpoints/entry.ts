// deploy: v2
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        // Admin only
        if (!user || user.role !== 'admin') {
            return new Response(JSON.stringify({ 
                ok: false, 
                error: 'Admin access required' 
            }), { 
                status: 403, 
                headers: { 'content-type': 'application/json' } 
            });
        }

        // Récupérer tous les checkpoints
        const checkpoints = await base44.asServiceRole.entities.Checkpoint.filter({});

        let migrated = 0;
        let alreadyOk = 0;

        for (const checkpoint of checkpoints) {
            const needsUpdate = 
                checkpoint.isActive === undefined || 
                checkpoint.isActive === null ||
                checkpoint.difficultyTier === undefined ||
                checkpoint.difficultyTier === null ||
                checkpoint.iconKey === undefined ||
                checkpoint.iconKey === null ||
                checkpoint.vibe === undefined ||
                checkpoint.vibe === null;

            if (needsUpdate) {
                const update = {};
                
                if (checkpoint.isActive === undefined || checkpoint.isActive === null) {
                    update.isActive = true;
                }
                if (checkpoint.difficultyTier === undefined || checkpoint.difficultyTier === null) {
                    update.difficultyTier = 1;
                }
                if (checkpoint.iconKey === undefined || checkpoint.iconKey === null) {
                    update.iconKey = '🗺️';
                }
                if (checkpoint.vibe === undefined || checkpoint.vibe === null) {
                    update.vibe = 'underground';
                }

                await base44.asServiceRole.entities.Checkpoint.update(checkpoint.id, update);
                migrated++;
            } else {
                alreadyOk++;
            }
        }

        return new Response(JSON.stringify({ 
            ok: true,
            total: checkpoints.length,
            migrated,
            alreadyOk
        }), { 
            status: 200, 
            headers: { 'content-type': 'application/json' } 
        });

    } catch (error) {
        console.error('migrateCheckpoints error:', error);
        return new Response(JSON.stringify({ 
            ok: false, 
            error: error.message 
        }), { 
            status: 500, 
            headers: { 'content-type': 'application/json' } 
        });
    }
});