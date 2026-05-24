// repairConnectAccountIds — Fonction admin one-shot
// Corrige les TalentProfile dont le stripeConnectAccountId pointe vers
// un compte Connect doublon/inactif alors qu'un compte actif existe dans Stripe.
//
// INPUT : { dryRun?, overrides }
//   overrides : [{ userId, stripeConnectAccountId, status }]
//   status    : 'active' | 'pending' | 'restricted'
//
// USAGE : passer dryRun=false avec les overrides pour corriger la DB.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return json(401, { ok: false, error: 'Unauthorized' });
    if (user.role !== 'admin') return json(403, { ok: false, error: 'Admin only' });

    const body = await req.json().catch(() => ({}));
    const dryRun = body.dryRun !== false; // défaut true
    const overrides = body.overrides || [];

    const service = base44.asServiceRole;
    const results = [];

    for (const override of overrides) {
      const { userId, stripeConnectAccountId, status = 'active' } = override;
      if (!userId || !stripeConnectAccountId) {
        results.push({ userId, status: 'error', reason: 'missing userId or stripeConnectAccountId' });
        continue;
      }

      const profiles = await service.entities.TalentProfile.filter({ userId }).catch(() => []);
      const profile = profiles?.[0];

      if (!profile) {
        results.push({ userId, status: 'error', reason: 'TalentProfile not found' });
        continue;
      }

      const before = {
        stripeConnectAccountId: profile.stripeConnectAccountId,
        stripeConnectOnboardingStatus: profile.stripeConnectOnboardingStatus,
      };

      if (!dryRun) {
        await service.entities.TalentProfile.update(profile.id, {
          stripeConnectAccountId,
          stripeConnectOnboardingStatus: status,
        });
      }

      results.push({
        userId,
        profileId: profile.id,
        before,
        after: { stripeConnectAccountId, stripeConnectOnboardingStatus: status },
        status: dryRun ? 'would_update' : 'updated',
      });
    }

    return json(200, { ok: true, dryRun, results });
  } catch (error) {
    return json(500, { ok: false, error: error.message });
  }
});