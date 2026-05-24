// deploy: v2
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        // Vérifier que l'utilisateur est admin
        if (!user || !user.role || user.role !== 'admin') {
            return Response.json({ error: 'Unauthorized: Admin access required' }, { status: 403 });
        }

        const { csvData, entityType } = await req.json();

        if (!csvData || !entityType) {
            return Response.json({ error: 'Missing csvData or entityType' }, { status: 400 });
        }

        // Parser CSV data
        const lines = csvData.trim().split('\n');
        const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim());
        
        const records = [];
        for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(',').map(v => v.replace(/^"|"$/g, '').trim());
            const record = {};
            headers.forEach((header, index) => {
                record[header] = values[index];
            });
            records.push(record);
        }

        // Import selon le type d'entité
        if (entityType === 'StyleHierarchy') {
            const imported = [];
            for (const record of records) {
                const style = {
                    systemId: record.systemId,
                    displayName: record.displayName,
                    bioFr: record.bioFr || '',
                    level: parseInt(record.level) || 1,
                    racineSystemId: record.racineSystemId || '',
                    color: record.color || '',
                    active: record.active === 'true'
                };
                
                const created = await base44.asServiceRole.entities.StyleHierarchy.create(style);
                imported.push(created);
            }
            
            return Response.json({ 
                success: true, 
                message: `Imported ${imported.length} StyleHierarchy records`,
                count: imported.length
            });
        }

        if (entityType === 'RoleHierarchy') {
            const imported = [];
            for (const record of records) {
                const role = {
                    systemId: record.systemId,
                    nameFr: record.nameFr,
                    nameEn: record.nameEn || '',
                    bioFr: record.bioFr || '',
                    level: parseInt(record.level) || 1,
                    racineSystemId: record.racineSystemId || '',
                    color: record.color || '',
                    slug: record.slug || '',
                    active: record.active === 'true',
                    isBase: record.isBase === 'true',
                    medianRate: record.medianRate ? parseFloat(record.medianRate) : 0,
                    maxRate: record.maxRate ? parseFloat(record.maxRate) : 0,
                    xpRequired: record.xpRequired ? parseInt(record.xpRequired) : 0
                };
                
                const created = await base44.asServiceRole.entities.RoleHierarchy.create(role);
                imported.push(created);
            }
            
            return Response.json({ 
                success: true, 
                message: `Imported ${imported.length} RoleHierarchy records`,
                count: imported.length
            });
        }

        return Response.json({ error: 'Unknown entityType' }, { status: 400 });

    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});