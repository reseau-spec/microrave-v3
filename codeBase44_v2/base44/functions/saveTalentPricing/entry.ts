/**
 * saveTalentPricing.ts — upsert d'un tarif pour un rôle spécifique
 * Crée ou met à jour 1 document TalentPricing par userId × roleSystemId
 */
// deploy: v2
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { roleSystemId, hourlyRate, fixedRate, currency = 'CAD', notes } = await req.json();
    if (!roleSystemId) return Response.json({ error: 'roleSystemId is required' }, { status: 400 });

    const service = base44.asServiceRole;

    const existing = await service.entities.TalentPricing.filter({
      userId: user.id,
      roleSystemId,
    });

    const data = {
      userId:     user.id,
      roleSystemId,
      hourlyRate: hourlyRate != null ? Number(hourlyRate) : null,
      fixedRate:  fixedRate  != null ? Number(fixedRate)  : null,
      currency:   currency || 'CAD',
      notes:      notes || null,
    };

    const result = existing?.length > 0
      ? await service.entities.TalentPricing.update(existing[0].id, data)
      : await service.entities.TalentPricing.create(data);

    return Response.json({ ok: true, pricing: result });
  } catch (error) {
    console.error('saveTalentPricing error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});