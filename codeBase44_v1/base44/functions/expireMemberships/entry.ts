// deploy: v1
// expireMemberships — Cron quotidien.
//
// Passe en status='expired' tous les UserMembership dont :
//   - status = 'active'
//   - expiresAt < maintenant
//   - autoRenew = false OU pas de stripeSubscriptionId
//
// INPUT (optionnel) : { dryRun: true }
// OUTPUT : { expired: N, errors: N, details: [...] }

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

    if (user.role !== 'admin') {
      return json(403, { ok: false, error: 'Admin only' });
    }

    const body = await req.json().catch(() => ({}));
    const dryRun = body.dryRun === true;

    const service = base44.asServiceRole;
    const nowIso = new Date().toISOString();

    // ── Chercher tous les abonnements actifs expirés ───────────────────────────
    const activeMemberships = await service.entities.UserMembership.filter({ status: 'active' }).catch(() => []);

    const toExpire = (activeMemberships || []).filter(m => {
      if (!m.expiresAt) return false;           // lifetime — ne pas expirer
      if (m.expiresAt >= nowIso) return false;  // pas encore expiré
      if (m.stripeSubscriptionId && m.autoRenew !== false) return false; // géré par Stripe Billing
      return true;
    });

    if (dryRun) {
      return json(200, {
        ok: true,
        dryRun: true,
        wouldExpire: toExpire.length,
        details: toExpire.map(m => ({
          membershipId: m.id,
          userId: m.userId,
          tier: m.tier,
          planSku: m.planSku,
          expiresAt: m.expiresAt,
          commissionRateSnapshot: m.commissionRateSnapshot,
        })),
      });
    }

    // ── Passer en expired ─────────────────────────────────────────────────────
    const results = [];
    for (const m of toExpire) {
      try {
        await service.entities.UserMembership.update(m.id, { status: 'expired' });
        results.push({ membershipId: m.id, userId: m.userId, tier: m.tier, status: 'EXPIRED' });
        console.log(`[expireMemberships] userId=${m.userId} tier=${m.tier} sku=${m.planSku} expiresAt=${m.expiresAt} → expired`);
      } catch (err) {
        results.push({ membershipId: m.id, userId: m.userId, tier: m.tier, status: 'ERROR', error: err.message });
        console.error(`[expireMemberships] ERREUR userId=${m.userId}:`, err.message);
      }
    }

    const expired = results.filter(r => r.status === 'EXPIRED').length;
    const errors  = results.filter(r => r.status === 'ERROR').length;

    console.log(`[expireMemberships] Terminé — expired=${expired} errors=${errors} total_checked=${activeMemberships.length}`);

    return json(200, {
      ok: true,
      dryRun: false,
      totalChecked: activeMemberships.length,
      expired,
      errors,
      details: results,
    });

  } catch (error) {
    console.error('[expireMemberships]', error?.message);
    return json(500, { ok: false, error: error.message });
  }
});