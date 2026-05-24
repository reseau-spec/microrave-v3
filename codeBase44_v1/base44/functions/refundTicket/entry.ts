// deploy: v1
// refundTicket — Remboursement d'un ou plusieurs billets.
//
// CAS D'USAGE :
//   A. Annulation totale event → rembourser TOUS les billets paid
//   B. No-show partiel → rembourser noShowFraction × grossAmount sur CHAQUE billet
//   C. Remboursement individuel à la demande
//
// RÈGLE FIFO INVERSÉ (LIFO) : si remboursement partiel par lot,
//   commencer par le sequenceNumber le plus élevé (dernier acheteur).
//
// STRIPE : stripe.refunds.create({ charge: chargeId, amount: cents })
//   → Stripe rembourse la partie variable (2.9%) mais garde le fixe (0.30$)
//   → MR absorbe la perte fixe Stripe (coût réel du service rendu puis annulé)

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import Stripe from 'npm:stripe@14.21.0';

function json(s, b) { return new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json' }}); }
function round2(x) { return Math.round(x * 100) / 100; }

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user   = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return json(403, { ok: false, error: 'Admin only' });
    }

    const body = await req.json().catch(() => ({}));
    const { eventId, mode, noShowFraction, ticketIds, dryRun } = body;
    // mode: 'full_cancel' | 'noshow_partial' | 'individual'
    // noShowFraction: 0.0-1.0 (pour mode=noshow_partial)
    // ticketIds: [string] (pour mode=individual)

    if (!eventId) return json(400, { ok: false, error: 'eventId requis' });
    if (!['full_cancel', 'noshow_partial', 'individual'].includes(mode)) {
      return json(400, { ok: false, error: 'mode invalide' });
    }
    if (mode === 'noshow_partial' && (noShowFraction == null || noShowFraction <= 0 || noShowFraction > 1)) {
      return json(400, { ok: false, error: 'noShowFraction requis entre 0 et 1 pour mode noshow_partial' });
    }

    const svc = base44.asServiceRole;
    const nowIso = new Date().toISOString();
    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeKey) return json(500, { ok: false, error: 'Stripe non configuré' });
    const stripe = new Stripe(stripeKey, { apiVersion: '2024-06-20' });

    // Charger les billets concernés
    let tickets = await svc.entities.Ticket.filter({ eventId }).catch(() => []);
    tickets = (tickets || []).filter(t => t.status === 'paid' && t.refundStatus !== 'completed');

    if (mode === 'individual' && ticketIds?.length) {
      tickets = tickets.filter(t => (ticketIds || []).includes(t.id));
    }

    // Trier LIFO (sequenceNumber DESC)
    tickets.sort((a, b) => (Number(b.sequenceNumber) || 0) - (Number(a.sequenceNumber) || 0));

    const results = { processed: 0, skipped: 0, totalRefunded: 0, errors: [] };

    for (const ticket of tickets) {
      try {
        const refundableAmount = Number(ticket.refundableAmount) || 0;
        if (refundableAmount <= 0) { results.skipped++; continue; }

        // Calculer le montant à rembourser
        let refundAmount;
        if (mode === 'full_cancel') {
          refundAmount = refundableAmount;
        } else if (mode === 'noshow_partial') {
          refundAmount = round2(Number(ticket.grossAmount) * noShowFraction);
          refundAmount = Math.min(refundAmount, refundableAmount);
        } else {
          refundAmount = refundableAmount;
        }

        if (refundAmount <= 0) { results.skipped++; continue; }

        const refundAmountCents = Math.round(refundAmount * 100);

        if (!dryRun) {
          // Obtenir le chargeId depuis le PI si absent
          let chargeId = ticket.stripeChargeId;
          if (!chargeId && ticket.stripePaymentIntentId) {
            const pi = await stripe.paymentIntents.retrieve(ticket.stripePaymentIntentId);
            chargeId = typeof pi.latest_charge === 'string' ? pi.latest_charge : pi.latest_charge?.id;
          }
          if (!chargeId) { results.errors.push({ ticketId: ticket.id, error: 'chargeId introuvable' }); continue; }

          // Créer le remboursement Stripe
          const refund = await stripe.refunds.create({
            charge: chargeId,
            amount: refundAmountCents,
            reason: 'requested_by_customer',
            metadata: {
              refundReason:      mode === 'full_cancel' ? 'cancelled_event' : 'noshow',
              originalEventId:   eventId,
              originalRequestId: ticket.id,   // ID du ticket comme référence
              initiatedBy:       'admin',
              platform:          'microrave',
            },
          });

          const newRefunded   = round2((Number(ticket.refundedAmount) || 0) + refundAmount);
          const newRefundable = round2((Number(ticket.grossAmount) || 0) - newRefunded);
          const isFullRefund  = newRefundable <= 0.01;

          await svc.entities.Ticket.update(ticket.id, {
            refundStatus:     isFullRefund ? 'completed' : 'processing',
            refundedAmount:   newRefunded,
            refundableAmount: Math.max(0, newRefundable),
            noShowFraction:   mode === 'noshow_partial' ? noShowFraction : 1.0,
            refundReason:     mode === 'full_cancel' ? 'event_cancelled' : 'talent_noshow',
            status:           isFullRefund ? 'refunded' : 'partially_refunded',
          });

          console.log(`[refundTicket] ticketId=${ticket.id} refund=${refundAmount}$ stripeRefund=${refund.id}`);
        }

        results.processed++;
        results.totalRefunded = round2(results.totalRefunded + refundAmount);

      } catch (e) {
        results.errors.push({ ticketId: ticket.id, error: e?.message });
      }
    }

    return json(200, {
      ok: true, dryRun: !!dryRun, mode, eventId,
      ...results,
      message: dryRun
        ? `DRY RUN — ${results.processed} billets, ${results.totalRefunded}$ seraient remboursés`
        : `${results.processed} billets remboursés — total ${results.totalRefunded}$`,
    });

  } catch (err) {
    console.error('[refundTicket]', err?.message);
    return json(500, { ok: false, error: err?.message });
  }
});