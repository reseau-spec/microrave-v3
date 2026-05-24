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

        // Grouper par domainKey
        const byDomain = {};
        for (const style of allActiveStyles) {
            const dk = style.domainKey || 'unknown';
            if (!byDomain[dk]) byDomain[dk] = [];
            byDomain[dk].push(style);
        }

        let totalUpdated = 0;
        const stats = {};
        const samples = {};

        for (const [domainKey, styles] of Object.entries(byDomain)) {
            if (domainKey === 'unknown') continue;

            // Tri stable: level ASC (999 si absent), displayName ASC, systemId ASC
            styles.sort((a, b) => {
                const levelA = a.level || 999;
                const levelB = b.level || 999;
                if (levelA !== levelB) return levelA - levelB;
                
                const nameA = a.displayName || '';
                const nameB = b.displayName || '';
                const nameCmp = nameA.localeCompare(nameB);
                if (nameCmp !== 0) return nameCmp;
                
                return (a.systemId || '').localeCompare(b.systemId || '');
            });

            const N = styles.length;
            
            // Distribution rareté
            const commonCount = Math.floor(N * 0.60);
            const rareCount = Math.floor(N * 0.25);
            const epicCount = Math.floor(N * 0.12);
            const legendaryCount = N >= 34 ? Math.max(1, N - commonCount - rareCount - epicCount) : 0;

            let idx = 0;
            const assignments = [];

            // Assigner rareté + unlockLevel
            const assignRarity = (rarity, count, minLevel, maxLevel) => {
                for (let i = 0; i < count; i++) {
                    if (idx >= N) break;
                    const rank = i;
                    const unlock = count > 1 
                        ? minLevel + Math.floor(rank * (maxLevel - minLevel) / (count - 1))
                        : minLevel;
                    assignments.push({
                        style: styles[idx],
                        rarityTier: rarity,
                        unlockLevel: unlock
                    });
                    idx++;
                }
            };

            assignRarity('common', commonCount, 1, 3);
            assignRarity('rare', rareCount, 4, 8);
            assignRarity('epic', epicCount, 9, 15);
            assignRarity('legendary', legendaryCount, 16, 25);

            // Mettre à jour
            let domainUpdated = 0;
            let minUnlock = 999;
            let maxUnlock = 0;

            for (const assignment of assignments) {
                const { style, rarityTier, unlockLevel } = assignment;
                
                const needsUpdate = 
                    style.rarityTier !== rarityTier || 
                    style.unlockLevel !== unlockLevel;

                if (needsUpdate) {
                    await base44.asServiceRole.entities.StyleHierarchy.update(style.id, {
                        rarityTier,
                        unlockLevel
                    });
                    domainUpdated++;
                }

                minUnlock = Math.min(minUnlock, unlockLevel);
                maxUnlock = Math.max(maxUnlock, unlockLevel);
            }

            totalUpdated += domainUpdated;
            
            stats[domainKey] = {
                total: N,
                updated: domainUpdated,
                distribution: {
                    common: commonCount,
                    rare: rareCount,
                    epic: epicCount,
                    legendary: legendaryCount
                },
                unlockRange: { min: minUnlock, max: maxUnlock }
            };

            // Échantillon
            samples[domainKey] = assignments.slice(0, 3).map(a => ({
                systemId: a.style.systemId,
                displayName: a.style.displayName,
                rarityTier: a.rarityTier,
                unlockLevel: a.unlockLevel
            }));
        }

        return new Response(JSON.stringify({ 
            ok: true,
            totalStyles: allActiveStyles.length,
            totalUpdated,
            byDomain: stats,
            samples,
            message: `✅ Migration terminée: ${totalUpdated} styles mis à jour.`
        }), { 
            status: 200, 
            headers: { 'content-type': 'application/json' } 
        });

    } catch (error) {
        console.error('migrateStyleUnlocks error:', error);
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