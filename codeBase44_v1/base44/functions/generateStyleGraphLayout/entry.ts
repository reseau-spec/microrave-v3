// deploy: v2
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const COL_SPACING = 340;
const ROW_SPACING = 90;

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

        const body = await req.json().catch(() => ({}));
        const { domainKey } = body;

        if (!domainKey) {
            return new Response(JSON.stringify({
                ok: false,
                error: 'domainKey is required'
            }), {
                status: 400,
                headers: { 'content-type': 'application/json' }
            });
        }

        // Charger tous les styles actifs du domaine
        const styles = await base44.asServiceRole.entities.StyleHierarchy.filter({
            domainKey,
            active: true
        });

        if (styles.length === 0) {
            return new Response(JSON.stringify({
                ok: true,
                domainKey,
                created: 0,
                updated: 0,
                message: 'No active styles in this domain'
            }), {
                status: 200,
                headers: { 'content-type': 'application/json' }
            });
        }

        // Charger layout existant pour détecter les locked
        const existingLayouts = await base44.asServiceRole.entities.StyleGraphLayout.filter({
            domainKey
        });

        const lockedPositions = {};
        existingLayouts.forEach(l => {
            if (l.locked) {
                lockedPositions[l.styleSystemId] = { x: l.x, y: l.y };
            }
        });

        // Organiser par level
        const stylesByLevel = { 1: [], 2: [], 3: [] };
        styles.forEach(style => {
            if (style.level >= 1 && style.level <= 3) {
                stylesByLevel[style.level].push(style);
            }
        });

        // Trier level 1 par nom
        stylesByLevel[1].sort((a, b) => a.displayName.localeCompare(b.displayName));

        const positions = {};
        let level1YOffset = 0;

        // Layout level 1
        stylesByLevel[1].forEach((l1Style, idx) => {
            const x = 0;
            const y = level1YOffset;

            if (lockedPositions[l1Style.systemId]) {
                positions[l1Style.systemId] = lockedPositions[l1Style.systemId];
            } else {
                positions[l1Style.systemId] = { x, y };
            }

            // Trouver enfants level 2
            const children2 = stylesByLevel[2].filter(s => s.parentSystemId === l1Style.systemId);
            children2.sort((a, b) => a.displayName.localeCompare(b.displayName));

            let childYOffset = y;

            children2.forEach((l2Style) => {
                const x2 = COL_SPACING;
                const y2 = childYOffset;

                if (lockedPositions[l2Style.systemId]) {
                    positions[l2Style.systemId] = lockedPositions[l2Style.systemId];
                } else {
                    positions[l2Style.systemId] = { x: x2, y: y2 };
                }

                // Trouver enfants level 3
                const children3 = stylesByLevel[3].filter(s => s.parentSystemId === l2Style.systemId);
                children3.sort((a, b) => a.displayName.localeCompare(b.displayName));

                children3.forEach((l3Style, idx3) => {
                    const x3 = COL_SPACING * 2;
                    const y3 = childYOffset + (idx3 * ROW_SPACING);

                    if (lockedPositions[l3Style.systemId]) {
                        positions[l3Style.systemId] = lockedPositions[l3Style.systemId];
                    } else {
                        positions[l3Style.systemId] = { x: x3, y: y3 };
                    }
                });

                const childHeight = Math.max(ROW_SPACING, children3.length * ROW_SPACING);
                childYOffset += childHeight;
            });

            const blockHeight = Math.max(ROW_SPACING, childYOffset - y + ROW_SPACING);
            level1YOffset += blockHeight;
        });

        // Upsert positions dans DB
        const now = new Date().toISOString();
        let created = 0;
        let updated = 0;

        for (const [styleSystemId, pos] of Object.entries(positions)) {
            const existing = existingLayouts.find(l => l.styleSystemId === styleSystemId);

            if (existing) {
                if (!existing.locked) {
                    await base44.asServiceRole.entities.StyleGraphLayout.update(existing.id, {
                        x: pos.x,
                        y: pos.y,
                        updatedAt: now
                    });
                    updated++;
                }
            } else {
                await base44.asServiceRole.entities.StyleGraphLayout.create({
                    domainKey,
                    styleSystemId,
                    x: pos.x,
                    y: pos.y,
                    locked: false,
                    updatedAt: now
                });
                created++;
            }
        }

        return new Response(JSON.stringify({
            ok: true,
            domainKey,
            created,
            updated,
            skipped: Object.keys(lockedPositions).length,
            totalStyles: styles.length
        }), {
            status: 200,
            headers: { 'content-type': 'application/json' }
        });

    } catch (error) {
        console.error('generateStyleGraphLayout error:', error);
        return new Response(JSON.stringify({
            ok: false,
            error: error.message
        }), {
            status: 500,
            headers: { 'content-type': 'application/json' }
        });
    }
});