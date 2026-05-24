// deploy: v2
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return new Response(JSON.stringify({ 
                ok: false, 
                error: 'Unauthenticated' 
            }), { 
                status: 401, 
                headers: { 'content-type': 'application/json' } 
            });
        }

        // Charger profil
        const profiles = await base44.entities.TalentProfile.filter({ userId: user.id });
        if (profiles.length === 0) {
            return new Response(JSON.stringify({ 
                ok: false, 
                error: 'No profile found' 
            }), { 
                status: 404, 
                headers: { 'content-type': 'application/json' } 
            });
        }

        const profile = profiles[0];
        let activeDomains = profile.activeDomains || [];

        // Fallback: déduire des rôles si activeDomains vide
        if (activeDomains.length === 0 && profile.activeRoles?.length > 0) {
            const domainMaps = await base44.entities.RoleDomainMap.filter({
                roleSystemId: { $in: profile.activeRoles }
            });
            activeDomains = [...new Set(domainMaps.map(dm => dm.domainKey).filter(Boolean))];
        }

        if (activeDomains.length === 0) {
            return new Response(JSON.stringify({ 
                ok: true, 
                updatedDomains: 0,
                message: 'No active domains to seed'
            }), { 
                status: 200, 
                headers: { 'content-type': 'application/json' } 
            });
        }

        const updatedDomains = [];
        const details = {};

        for (const domainKey of activeDomains) {
            // Charger ou créer DomainProgress
            const existing = await base44.entities.DomainProgress.filter({
                userId: user.id,
                domainKey
            });

            let progress;
            if (existing.length > 0) {
                progress = existing[0];
            } else {
                progress = await base44.entities.DomainProgress.create({
                    userId: user.id,
                    domainKey,
                    xp: 0,
                    level: 1,
                    updatedAt: new Date().toISOString()
                });
            }

            // Seed XP uniquement si neuf (xp=0 et level=1)
            if (progress.xp === 0 && progress.level === 1) {
                let seedXP = 1000; // Base

                // Bonus: rôles actifs dans ce domaine
                const rolesInDomain = await base44.entities.RoleDomainMap.filter({
                    domainKey,
                    roleSystemId: { $in: profile.activeRoles || [] }
                });
                if (rolesInDomain.length > 0) {
                    seedXP += 250;
                }

                // Bonus: styles actifs dans ce domaine (>=5)
                const stylesInDomain = await base44.entities.StyleHierarchy.filter({
                    domainKey,
                    systemId: { $in: profile.activeStyles || [] },
                    active: true
                });
                if (stylesInDomain.length >= 5) {
                    seedXP += 250;
                }

                // Calculer level
                const newLevel = Math.min(25, Math.max(1, 1 + Math.floor(seedXP / 500)));

                await base44.entities.DomainProgress.update(progress.id, {
                    xp: seedXP,
                    level: newLevel,
                    updatedAt: new Date().toISOString()
                });

                updatedDomains.push(domainKey);
                details[domainKey] = {
                    xp: seedXP,
                    level: newLevel,
                    bonuses: {
                        roles: rolesInDomain.length > 0,
                        styles: stylesInDomain.length >= 5
                    }
                };
            }
        }

        return new Response(JSON.stringify({ 
            ok: true,
            updatedDomains: updatedDomains.length,
            domains: updatedDomains,
            details,
            message: `✅ Seed XP appliqué à ${updatedDomains.length} domaine(s).`
        }), { 
            status: 200, 
            headers: { 'content-type': 'application/json' } 
        });

    } catch (error) {
        console.error('seedXPFromPreferences error:', error);
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