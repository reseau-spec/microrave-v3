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

        // Charger tous les rôles
        const allRoles = await base44.asServiceRole.entities.RoleHierarchy.filter({});
        
        // Créer un map des rôles par systemId pour accès rapide
        const roleMap = allRoles.reduce((acc, role) => {
            acc[role.systemId] = role;
            return acc;
        }, {});

        let created = 0;
        let updated = 0;
        let unchanged = 0;
        const rootsMissingDomain = [];

        // Pour chaque rôle, déterminer le domainKey
        for (const role of allRoles) {
            // Trouver le rôle racine
            let rootId = role.systemId;
            if (role.level !== 1) {
                rootId = role.racineSystemId || role.systemId;
            }

            const rootRole = roleMap[rootId];
            if (!rootRole) {
                console.warn(`Root role not found for ${role.systemId}: ${rootId}`);
                continue;
            }

            // Vérifier si la racine a un domainKey
            if (!rootRole.domainKey) {
                if (!rootsMissingDomain.includes(rootId)) {
                    rootsMissingDomain.push(rootId);
                }
                continue;
            }

            const domainKey = rootRole.domainKey;

            // Vérifier si un mapping existe déjà
            const existing = await base44.asServiceRole.entities.RoleDomainMap.filter({
                roleSystemId: role.systemId
            });

            if (existing.length === 0) {
                // Créer nouveau mapping
                await base44.asServiceRole.entities.RoleDomainMap.create({
                    roleSystemId: role.systemId,
                    domainKey: domainKey,
                    isActive: true
                });
                created++;
            } else {
                // Vérifier si mise à jour nécessaire
                const current = existing[0];
                if (current.domainKey === domainKey && current.isActive === true) {
                    unchanged++;
                    continue;
                }
                
                await base44.asServiceRole.entities.RoleDomainMap.update(current.id, {
                    domainKey: domainKey,
                    isActive: true
                });
                updated++;
            }
        }

        // Informations sur les racines manquantes
        const rootsInfo = rootsMissingDomain.map(rootId => {
            const root = roleMap[rootId];
            return {
                systemId: rootId,
                nameFr: root?.nameFr || 'Unknown',
                level: root?.level
            };
        });

        return new Response(JSON.stringify({ 
            ok: true,
            totalRoles: allRoles.length,
            created,
            updated,
            unchanged,
            rootsMissingDomain: rootsInfo,
            message: rootsInfo.length > 0 
                ? `Migration complete. ${rootsInfo.length} root role(s) missing domainKey - please set domainKey on these roots first.`
                : 'Migration complete. All roles mapped successfully.'
        }), { 
            status: 200, 
            headers: { 'content-type': 'application/json' } 
        });

    } catch (error) {
        console.error('migrateRoleDomains error:', error);
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