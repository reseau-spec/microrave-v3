// addTestBalance — Crédite le solde test via une charge directe (carte 4000000000000077).
// Seule méthode supportée pour les comptes CA/CAD en mode test.
// INPUT : { amount } en CAD (ex: 500)
// OUTPUT : { ok, chargeId, balanceAvailable }

import Stripe from 'npm:stripe@14.21.0';
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status, headers: { 'content-type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return json(401, { ok: false, error: 'Unauthorized' });
    if (user.role !== 'admin') return json(403, { ok: false, error: 'Admin only' });

    const body = await req.json().catch(() => ({}));
    const amountCAD = body_cents || 500;
    const amountMinor = Math.round(amountCAD * 100);

    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'), {
      apiVersion: '2024-06-20',
    });

    // Étape 1 — Créer un PaymentMethod avec la carte test spéciale
    // 4000000000000077 = crédite immédiatement le solde disponible (bypass settlement delay)
    const pm = await stripe.paymentMethods.create({
      type: 'card',
      card: { token: 'tok_bypassPending' },
    });

    // Étape 2 — Créer une charge directe
    const charge = await stripe.charges.create({
      amount:      amountMinor,
      currency:    'cad',
      source:      'tok_bypassPending',
      description: `Test balance credit ${amountCAD} CAD — Micro Rave`,
    });

    // Étape 3 — Lire le solde disponible résultant
    const balance = await stripe.balance.retrieve();
    const available = balance.available.find(b => b.currency === 'cad');

    return json(200, {
      ok:              true,
      amountCAD,
      chargeId:        charge.id,
      chargeStatus:    charge.status,
      balanceAvailable: available ? available_cents / 100 : null,
      note:            'Solde crédité. Relancer executePayoutTransfer.',
    });

  } catch (error) {
    console.error('[addTestBalance]', error?.message);
    return json(500, { ok: false, error: error.message });
  }
});