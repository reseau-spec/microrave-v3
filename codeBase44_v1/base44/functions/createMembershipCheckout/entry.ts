// deploy: v1
// createMembershipCheckout — Crée une Stripe Checkout Session pour un abonnement.
//
// PRÉREQUIS STRIPE DASHBOARD (à faire une seule fois) :
//   Pour chaque plan payant (Fondateur E, Base B, Pro C, Studio D) :
//   1. Stripe Dashboard → Products → Add product
//   2. Créer le produit (ex: "Micro Rave — Fondateur")
//   3. Ajouter 2 prix récurrents : monthly (10$/mois) + yearly (96$/an)
//   4. Copier les price_XXXX IDs dans MembershipPlan.stripePriceIdMonthly / Yearly
//
// FLUX :
//   1. Frontend appelle createMembershipCheckout({ planSku, billingCycle })
//   2. Cette fonction crée un Stripe Customer si absent, puis une Checkout Session
//   3. Retourne { checkoutUrl } → frontend redirige window.location.href
//   4. Stripe redirige vers /Membership?checkout=success&session_id={CHECKOUT_SESSION_ID}
//   5. Le webhook customer.subscription.created crée le UserMembership en DB
//
// IDEMPOTENCE :
//   Si UserMembership active existe déjà pour ce plan → retourne { alreadyActive: true }
//   Stripe Customer réutilisé si stripeCustomerId déjà sur UserMembership ou TalentProfile
//
// PARAMÈTRES :
//   planSku      : string — SKU du MembershipPlan (ex: 'MR-PLAN-E-2024-01')
//   billingCycle : 'monthly' | 'yearly' (défaut: 'monthly')

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
import Stripe from 'npm:stripe@14';

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status, headers: { 'content-type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  try {
    const base44  = createClientFromRequest(req);
    const user    = await base44.auth.me();
    if (!user) return json(401, { ok: false, error: 'Unauthorized' });

    const body    = await req.json().catch(() => ({}));
    const service = base44.asServiceRole;
    const stripe  = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'), { apiVersion: '2024-06-20' });
    const appUrl  = Deno.env.get('VITE_APP_URL') || 'https://microrave.ca';

    const { planSku, billingCycle = 'monthly' } = body;
    if (!planSku) return json(400, { ok: false, error: 'planSku requis' });
    if (!['monthly', 'yearly'].includes(billingCycle)) {
      return json(400, { ok: false, error: 'billingCycle invalide — monthly | yearly' });
    }

    // ── 1. Charger le plan ────────────────────────────────────────────────────
    const plans = await service.entities.MembershipPlan
      .filter({ sku: planSku }).catch(() => []);
    const plan = plans?.[0];
    if (!plan) return json(404, { ok: false, error: `Plan introuvable: ${planSku}` });
    if (plan.priceMonthly === 0) {
      return json(400, { ok: false, error: 'Le plan Freemium ne requiert pas de paiement.' });
    }

    // Sélectionner le price_id selon le cycle
    const priceId = billingCycle === 'yearly'
      ? plan.stripePriceIdYearly
      : plan.stripePriceIdMonthly;

    if (!priceId) {
      return json(400, {
        ok: false,
        error: `Stripe Price ID absent sur le plan ${planSku} pour le cycle ${billingCycle}. ` +
               `Configurer MembershipPlan.stripePriceId${billingCycle === 'yearly' ? 'Yearly' : 'Monthly'} dans Stripe Dashboard.`,
        code: 'MISSING_PRICE_ID',
      });
    }

    // ── 2. Vérifier abonnement existant ──────────────────────────────────────
    const existingMemberships = await service.entities.UserMembership
      .filter({ userId: user.id, status: 'active' }).catch(() => []);
    const existing = existingMemberships?.[0];
    if (existing?.planSku === planSku) {
      return json(200, { ok: true, alreadyActive: true, tier: existing.tier });
    }

    // ── 3. Résoudre ou créer le Stripe Customer ───────────────────────────────
    // Priorité : UserMembership.stripeCustomerId > TalentProfile (champ custom) > créer
    let customerId = existing?.stripeCustomerId || null;

    if (!customerId) {
      const profiles = await service.entities.TalentProfile
        .filter({ userId: user.id }).catch(() => []);
      customerId = profiles?.[0]?.stripeCustomerId || null;
    }

    if (!customerId) {
      const customer = await stripe.customers.create({
        email:    user.email,
        name:     user.full_name || user.email,
        metadata: { microrave_userId: user.id, platform: 'microrave' },
      });
      customerId = customer.id;
      console.log(`[createMembershipCheckout] v1 NEW_CUSTOMER userId=${user.id} customerId=${customerId}`);
    }

    // ── 4. Créer la Stripe Checkout Session ───────────────────────────────────
    const session = await stripe.checkout.sessions.create({
      customer:    customerId,
      mode:        'subscription',
      line_items:  [{ price: priceId, quantity: 1 }],
      success_url: `${appUrl}/Membership?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${appUrl}/Membership?checkout=cancelled`,
      metadata: {
        microrave_userId:   user.id,
        planSku,
        billingCycle,
        platform:           'microrave',
      },
      subscription_data: {
        metadata: {
          microrave_userId: user.id,
          planSku,
          billingCycle,
          commissionRate:   String(plan.commissionRate),
          tier:             plan.tier,
        },
      },
      allow_promotion_codes: true,
      locale: 'fr',
    });

    console.log(`[createMembershipCheckout] v1 SESSION_CREATED userId=${user.id} plan=${planSku} cycle=${billingCycle} session=${session.id}`);

    return json(200, {
      ok:          true,
      checkoutUrl: session.url,
      sessionId:   session.id,
    });

  } catch (error) {
    console.error('[createMembershipCheckout] v1 ERROR:', error?.message);
    return json(500, { ok: false, error: error.message });
  }
});