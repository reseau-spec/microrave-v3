// debugStripeEnv — Inspecte le compte Stripe plateforme et ses comptes connectés.
// INPUT : {}
// OUTPUT : { platformAccountId, chargesEnabled, payoutsEnabled, connectedCount, connectedIds, secretPrefix }

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
import Stripe from 'npm:stripe@14.21.0';

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

    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'));

    const [account, connected] = await Promise.all([
      stripe.accounts.retrieve(),
      stripe.accounts.list({ limit: 10 }),
    ]);

    const secretKey = Deno.env.get('STRIPE_SECRET_KEY') ?? '';

    return json(200, {
      ok: true,
      platformAccountId: account.id,
      isDetailsSubmitted: account.details_submitted,
      chargesEnabled: account.charges_enabled,
      payoutsEnabled: account.payouts_enabled,
      connectedCount: connected.data.length,
      connectedIds: connected.data.map(a => a.id),
      secretPrefix: secretKey.slice(0, 12) || null,
    });

  } catch (error) {
    console.error('[debugStripeEnv]', error?.message);
    return json(500, { ok: false, error: error.message });
  }
});