// deploy: v1
// getMembershipForUser — Lit le forfait actif d'un utilisateur.
//
// Utilisé par : generatePayoutSplits, assignLineupSlot, ProfilePage
//
// LOGIQUE :
//   1. Chercher UserMembership { userId, status: 'active' }
//   2. Si trouvé → retourner commissionRateSnapshot (taux figé à l'achat)
//   3. Si pas d'abonnement actif → retourner le plan Freemium (tier A, 12%)
//
// RETOURNE :
//   {
//     userId,
//     tier,            // 'A' | 'B' | 'C' | 'D'
//     planSku,
//     planNameFr,
//     commissionRate,  // taux effectif (commissionRateSnapshot ou plan Freemium)
//     priceMonthly,
//     priceYearly,
//     status,          // 'active' | 'none' (freemium par défaut)
//     expiresAt,
//     renewsAt,
//   }

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status, headers: { 'content-type': 'application/json' },
  });
}

// Plan Freemium par défaut si aucun abonnement actif
const FREEMIUM_DEFAULT = {
  tier: 'A',
  planSku: 'MR-PLAN-A-2024-01',
  planNameFr: 'Freemium',
  commissionRate: 0.12,
  priceMonthly: 0,
  priceYearly: 0,
  status: 'none',
  expiresAt: null,
  renewsAt: null,
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return json(401, { ok: false, error: 'Unauthorized' });

    const body = await req.json().catch(() => ({}));
    const targetUserId = body.userId || user.id;

    const service = base44.asServiceRole;
    if (!service) return json(503, { ok: false, error: 'Service role unavailable' });

    // 1. Chercher l'abonnement actif
    const memberships = await service.entities.UserMembership.filter({
      userId: targetUserId,
      status: 'active',
    }, '-startedAt', 1).catch(() => []);

    const membership = memberships?.[0] || null;

    if (!membership) {
      // Aucun abonnement actif → Freemium par défaut
      // Tenter de lire le plan Freemium depuis la DB pour avoir les infos à jour
      const freemiumPlans = await service.entities.MembershipPlan.filter({ tier: 'A' }, '-sortOrder', 1).catch(() => []);
      const freemiumPlan = freemiumPlans?.[0] || null;

      return json(200, {
        ok: true,
        userId: targetUserId,
        ...FREEMIUM_DEFAULT,
        commissionRate: freemiumPlan?.commissionRate ?? FREEMIUM_DEFAULT.commissionRate,
        planNameFr: freemiumPlan?.nameFr ?? FREEMIUM_DEFAULT.planNameFr,
        planSku: freemiumPlan?.sku ?? FREEMIUM_DEFAULT.planSku,
      });
    }

    // 2. Abonnement trouvé — le taux est figé dans commissionRateSnapshot
    // Lire le plan pour les métadonnées d'affichage (nom, prix) uniquement
    const plans = await service.entities.MembershipPlan.filter({ sku: membership.planSku }, null, 1).catch(() => []);
    const plan = plans?.[0] || null;

    return json(200, {
      ok: true,
      userId: targetUserId,
      tier: membership.tier,
      planSku: membership.planSku,
      planNameFr: plan?.nameFr || membership.tier,
      commissionRate: membership.commissionRateSnapshot, // SOURCE DE VÉRITÉ — figé à l'achat
      priceMonthly: plan?.priceMonthly ?? 0,
      priceYearly: plan?.priceYearly ?? 0,
      status: membership.status,
      billingCycle: membership.billingCycle,
      expiresAt: membership.expiresAt || null,
      renewsAt: membership.renewsAt || null,
      promoNote: membership.promoNote || null,
    });

  } catch (error) {
    console.error('[getMembershipForUser]', error?.message);
    return json(500, { ok: false, error: error?.message });
  }
});