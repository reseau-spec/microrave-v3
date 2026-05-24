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

        // Charger layout
        const layouts = await base44.asServiceRole.entities.StyleGraphLayout.filter({
            domainKey
        });

        const layoutMap = {};
        layouts.forEach(l => {
            layoutMap[l.styleSystemId] = true;
        });

        // Construire map de styles
        const styleMap = {};
        styles.forEach(s => {
            styleMap[s.systemId] = s;
        });

        // Issues
        const issues = {
            stylesWithoutParent: [],
            stylesWithoutRoot: [],
            stylesWithoutDomain: [],
            stylesWithoutLayout: []
        };

        styles.forEach(style => {
            // Check parent valide
            if (style.level > 1 && style.parentSystemId) {
                if (!styleMap[style.parentSystemId]) {
                    issues.stylesWithoutParent.push({
                        systemId: style.systemId,
                        displayName: style.displayName,
                        level: style.level,
                        parentSystemId: style.parentSystemId
                    });
                }
            }

            // Check racine valide
            if (style.level > 1 && style.racineSystemId) {
                if (!styleMap[style.racineSystemId]) {
                    issues.stylesWithoutRoot.push({
                        systemId: style.systemId,
                        displayName: style.displayName,
                        level: style.level,
                        racineSystemId: style.racineSystemId
                    });
                }
            }

            // Check domainKey
            if (!style.domainKey) {
                issues.stylesWithoutDomain.push({
                    systemId: style.systemId,
                    displayName: style.displayName,
                    level: style.level
                });
            }

            // Check layout
            if (!layoutMap[style.systemId]) {
                issues.stylesWithoutLayout.push({
                    systemId: style.systemId,
                    displayName: style.displayName,
                    level: style.level
                });
            }
        });

        const hasIssues = 
            issues.stylesWithoutParent.length > 0 ||
            issues.stylesWithoutRoot.length > 0 ||
            issues.stylesWithoutDomain.length > 0 ||
            issues.stylesWithoutLayout.length > 0;

        return new Response(JSON.stringify({
            ok: true,
            domainKey,
            status: hasIssues ? 'issues_found' : 'healthy',
            totalStyles: styles.length,
            issues
        }), {
            status: 200,
            headers: { 'content-type': 'application/json' }
        });

    } catch (error) {
        console.error('auditStyleGraph error:', error);
        return new Response(JSON.stringify({
            ok: false,
            error: error.message
        }), {
            status: 500,
            headers: { 'content-type': 'application/json' }
        });
    }
});