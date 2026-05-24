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

        // Charger tous les profils
        const allProfiles = await base44.asServiceRole.entities.TalentProfile.filter({});
        
        // Charger RoleDomainMap pour mapping rapide
        const allDomainMaps = await base44.asServiceRole.entities.RoleDomainMap.filter({});
        const roleToDomain = allDomainMaps.reduce((acc, dm) => {
            acc[dm.roleSystemId] = dm.domainKey;
            return acc;
        }, {});

        let updated = 0;
        let skipped = 0;
        let errors = 0;

        for (const profile of allProfiles) {
            try {
                const activeRoles = profile.activeRoles || [];
                
                if (activeRoles.length === 0) {
                    skipped++;
                    continue;
                }

                // Collecter domaines uniques
                const domains = new Set();
                for (const roleId of activeRoles) {
                    const domain = roleToDomain[roleId];
                    if (domain) {
                        domains.add(domain);
                    }
                }

                const activeDomains = Array.from(domains);

                if (activeDomains.length > 0) {
                    await base44.asServiceRole.entities.TalentProfile.update(profile.id, {
                        activeDomains
                    });
                    updated++;
                } else {
                    skipped++;
                }
            } catch (error) {
                console.error(`Error updating profile ${profile.id}:`, error);
                errors++;
            }
        }

        return new Response(JSON.stringify({ 
            ok: true,
            totalProfiles: allProfiles.length,
            updated,
            skipped,
            errors,
            message: `✅ Migration terminée: ${updated} profils mis à jour avec activeDomains.`
        }), { 
            status: 200, 
            headers: { 'content-type': 'application/json' } 
        });

    } catch (error) {
        console.error('migrateActiveDomainsFromRoles error:', error);
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