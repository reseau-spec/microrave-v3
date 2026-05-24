/**
 * getTalentPricing.ts — lecture des tarifs d'un talent
 * Retourne tous les documents TalentPricing pour un userId donné
 */
// deploy: v2
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const targetUserId = body.userId || user.id;

    const service = base44.asServiceRole;
    const docs = await service.entities.TalentPricing.filter({ userId: targetUserId });

    const pricingByRole = {};
    for (const doc of (docs || [])) {
      pricingByRole[doc.roleSystemId] = {
        id:         doc.id,
        hourlyRate: doc.hourlyRate ?? null,
        fixedRate:  doc.fixedRate  ?? null,
        currency:   doc.currency   || 'CAD',
        notes:      doc.notes      || null,
      };
    }

    return Response.json({ ok: true, pricingByRole });
  } catch (error) {
    console.error('getTalentPricing error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});