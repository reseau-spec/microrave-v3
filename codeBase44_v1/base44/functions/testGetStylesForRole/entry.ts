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
        
        const rolesOk = [];
        const rolesFailed = [];

        // Tester chaque rôle
        for (const role of allRoles) {
            try {
                // Simuler la logique de getStylesForRole
                
                // 1) Chercher overrides
                const overrides = await base44.asServiceRole.entities.RoleStyleMap.filter({
                    roleSystemId: role.systemId,
                    isActive: true
                });

                let domainKey = null;

                if (overrides.length > 0) {
                    // Via RoleDomainMap
                    const domainMaps = await base44.asServiceRole.entities.RoleDomainMap.filter({
                        roleSystemId: role.systemId,
                        isActive: true
                    });
                    
                    if (domainMaps.length > 0) {
                        domainKey = domainMaps[0].domainKey;
                    }

                    if (!domainKey) {
                        rolesFailed.push({
                            roleSystemId: role.systemId,
                            roleName: role.nameFr,
                            errorCode: 'OVERRIDE_NO_DOMAIN',
                            errorMessage: 'Has overrides but no domain mapping'
                        });
                        continue;
                    }

                    // Récupérer les styles
                    const styleSystemIds = overrides.map(o => o.styleSystemId);
                    const styles = await base44.asServiceRole.entities.StyleHierarchy.filter({
                        systemId: { $in: styleSystemIds },
                        active: true
                    });

                    rolesOk.push({
                        roleSystemId: role.systemId,
                        roleName: role.nameFr,
                        domainKey,
                        source: 'override',
                        stylesCount: styles.length
                    });
                    continue;
                }

                // 2) Via RoleDomainMap
                const domainMaps = await base44.asServiceRole.entities.RoleDomainMap.filter({
                    roleSystemId: role.systemId,
                    isActive: true
                });

                if (domainMaps.length === 0) {
                    rolesFailed.push({
                        roleSystemId: role.systemId,
                        roleName: role.nameFr,
                        errorCode: 'NO_DOMAIN_MAPPING',
                        errorMessage: 'No domain mapping found'
                    });
                    continue;
                }

                domainKey = domainMaps[0].domainKey;

                if (!domainKey) {
                    rolesFailed.push({
                        roleSystemId: role.systemId,
                        roleName: role.nameFr,
                        errorCode: 'ROLE_DOMAIN_MISSING',
                        errorMessage: 'Domain key is null'
                    });
                    continue;
                }

                // Vérifier styles actifs pour ce domaine
                const styles = await base44.asServiceRole.entities.StyleHierarchy.filter({
                    domainKey,
                    active: true
                });

                // Vérifier si domainKey est valide
                const validDomainKeys = ['music', 'humour', 'photo', 'video', 'food', 'art', 'responsable'];
                if (!validDomainKeys.includes(domainKey)) {
                    rolesFailed.push({
                        roleSystemId: role.systemId,
                        roleName: role.nameFr,
                        domainKey,
                        errorCode: 'INVALID_DOMAIN_KEY',
                        errorMessage: `Invalid domainKey: ${domainKey}`
                    });
                    continue;
                }

                rolesOk.push({
                    roleSystemId: role.systemId,
                    roleName: role.nameFr,
                    domainKey,
                    source: 'domain',
                    stylesCount: styles.length
                });

            } catch (error) {
                rolesFailed.push({
                    roleSystemId: role.systemId,
                    roleName: role.nameFr,
                    errorCode: 'EXCEPTION',
                    errorMessage: error.message
                });
            }
        }

        const summary = {
            total: allRoles.length,
            ok: rolesOk.length,
            failed: rolesFailed.length,
            successRate: ((rolesOk.length / allRoles.length) * 100).toFixed(2) + '%'
        };

        return new Response(JSON.stringify({ 
            ok: true,
            rolesOk,
            rolesFailed,
            summary
        }), { 
            status: 200, 
            headers: { 'content-type': 'application/json' } 
        });

    } catch (error) {
        console.error('testGetStylesForRole error:', error);
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