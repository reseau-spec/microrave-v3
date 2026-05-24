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

        const allStyles = await base44.asServiceRole.entities.StyleHierarchy.filter({});

        const styleMap = {};
        allStyles.forEach(s => {
            styleMap[s.systemId] = s;
        });

        let updatedCount = 0;
        let disabledCount = 0;
        const needsReviewList = [];

        for (const style of allStyles) {
            let needsUpdate = false;
            let shouldDisable = false;
            const updates = {};
            let reviewReason = null;

            // Fix 1: Orphans (level > 1 sans parent valide)
            if (style.level > 1 && (!style.parentSystemId || !styleMap[style.parentSystemId])) {
                shouldDisable = true;
                reviewReason = `Level ${style.level} without valid parent`;
            }

            // Fix 2: Missing root
            if (style.level > 1 && !shouldDisable) {
                if (!style.racineSystemId || !styleMap[style.racineSystemId]) {
                    // Tenter de remonter la chaîne
                    let current = style;
                    let foundRoot = null;

                    for (let i = 0; i < 10; i++) {
                        if (!current.parentSystemId) break;
                        const parent = styleMap[current.parentSystemId];
                        if (!parent) break;
                        
                        if (parent.level === 1) {
                            foundRoot = parent;
                            break;
                        }
                        current = parent;
                    }

                    if (foundRoot) {
                        updates.racineSystemId = foundRoot.systemId;
                        needsUpdate = true;
                    } else {
                        shouldDisable = true;
                        reviewReason = reviewReason || `Cannot find root (level 1) ancestor`;
                    }
                }
            }

            // Fix 3: Domain inheritance
            if (style.level > 1 && style.racineSystemId && !shouldDisable) {
                const root = styleMap[style.racineSystemId];
                if (root && root.domainKey && style.domainKey !== root.domainKey) {
                    updates.domainKey = root.domainKey;
                    needsUpdate = true;
                }
            }

            // Apply fixes
            if (shouldDisable) {
                await base44.asServiceRole.entities.StyleHierarchy.update(style.id, {
                    active: false
                });
                disabledCount++;
                needsReviewList.push({
                    systemId: style.systemId,
                    displayName: style.displayName,
                    level: style.level,
                    reason: reviewReason
                });
            } else if (needsUpdate) {
                await base44.asServiceRole.entities.StyleHierarchy.update(style.id, updates);
                updatedCount++;
            }
        }

        return new Response(JSON.stringify({
            ok: true,
            updatedCount,
            disabledCount,
            needsReviewCount: needsReviewList.length,
            needsReviewList
        }), {
            status: 200,
            headers: { 'content-type': 'application/json' }
        });

    } catch (error) {
        console.error('repairStyleHierarchy error:', error);
        return new Response(JSON.stringify({
            ok: false,
            error: error.message
        }), {
            status: 500,
            headers: { 'content-type': 'application/json' }
        });
    }
});