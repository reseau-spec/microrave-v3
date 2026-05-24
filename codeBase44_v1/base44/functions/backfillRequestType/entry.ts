// deploy: v1
// backfillRequestType — One-shot admin function
// Corrige les 36 EPR sans requestType créées avant sendPaymentRequest v2.
//
// LOGIQUE D'INFÉRENCE (par ordre de priorité) :
//   1. messageToPayer contient '80%' ou 'solde' ou 'balance' → 'balance'
//   2. requestedAmount ≈ event.budget × 0.80 (±1$) → 'balance'
//   3. requestedAmount ≈ event.budget × 0.20 (±1$) → 'deposit'
//   4. Sinon → 'deposit' (dépôt par défaut, plus courant)
//
// SAFE : ne modifie que les EPR où requestType est vide ou null.
// IDEMPOTENT : peut être appelé plusieurs fois sans effet.
// Admin only.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status, headers: { 'content-type': 'application/json' }
  });
}

Deno.serve(async (req) => {
  try {
    const base44  = createClientFromRequest(req);
    const service = base44.asServiceRole;
    const user    = await base44.auth.me().catch(() => null);
    if (!user || user.role !== 'admin') return json(403, { ok: false, error: 'Admin only' });

    const body   = await req.json().catch(() => ({}));
    const dryRun = body.dryRun === true;

    // Charger toutes les EPR sans requestType
    const allEprs = await service.entities.EventPaymentRequest.list().catch(() => []);
    const missing = (allEprs || []).filter(e => !e.requestType);

    if (missing.length === 0) {
      return json(200, { ok: true, processed: 0, message: 'Toutes les EPR ont déjà un requestType.' });
    }

    // Charger les events pour le cross-check montant
    const eventIds = [...new Set(missing.map(e => e.eventId).filter(Boolean))];
    const eventMap = {};
    for (const eid of eventIds) {
      const evs = await service.entities.Event.filter({ id: eid }).catch(() => []);
      if (evs?.[0]) eventMap[eid] = evs[0];
    }

    const results = [];

    for (const epr of missing) {
      const amount  = Number(epr.requestedAmount) || 0;
      const msg     = (epr.messageToPayer || '').toLowerCase();
      const ev      = eventMap[epr.eventId];
      const budget  = Number(ev?.budget) || 0;

      let inferred = 'deposit'; // défaut

      // Règle 1 — message
      if (msg.includes('80%') || msg.includes('solde') || msg.includes('balance')) {
        inferred = 'balance';
      }
      // Règle 2 — montant ≈ 80% du budget
      else if (budget > 0 && Math.abs(amount - budget * 0.80) < 1.0) {
        inferred = 'balance';
      }
      // Règle 3 — montant ≈ 20% du budget
      else if (budget > 0 && Math.abs(amount - budget * 0.20) < 1.0) {
        inferred = 'deposit';
      }

      results.push({
        eprId:    epr.id,
        eventId:  epr.eventId,
        amount,
        budget,
        inferred,
        rule:     msg.includes('80%') ? 'message_80pct'
                : msg.includes('solde') || msg.includes('balance') ? 'message_keyword'
                : budget > 0 && Math.abs(amount - budget * 0.80) < 1.0 ? 'amount_80pct'
                : budget > 0 && Math.abs(amount - budget * 0.20) < 1.0 ? 'amount_20pct'
                : 'default_deposit',
      });

      if (!dryRun) {
        await service.entities.EventPaymentRequest.update(epr.id, {
          requestType: inferred,
        }).catch(e => console.warn(`backfill failed epr=${epr.id}: ${e?.message}`));
      }
    }

    const balanceCount = results.filter(r => r.inferred === 'balance').length;
    const depositCount = results.filter(r => r.inferred === 'deposit').length;

    return json(200, {
      ok:     true,
      dryRun,
      total:  results.length,
      balance: balanceCount,
      deposit: depositCount,
      results,
    });

  } catch (error) {
    console.error('[backfillRequestType]', error?.message);
    return json(500, { ok: false, error: error?.message });
  }
});