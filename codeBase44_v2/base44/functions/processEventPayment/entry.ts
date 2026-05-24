// deploy: v2
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import Stripe from 'npm:stripe@14';

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status, headers: { 'content-type': 'application/json' }
  });
}

function normalizeId(v) {
  if (!v) return null;
  if (typeof v === 'string') return v;
  if (typeof v === 'object') return String(v.id || v._id || v.value || '');
  return String(v);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return json(401, { ok: false, error: 'Unauthorized' });

    const body = await req.json().catch(() => ({}));
    const { eventId } = body;
    if (!eventId) return json(400, { ok: false, error: 'eventId required' });

    const service = base44.asServiceRole;
    if (!service) return json(503, { ok: false, error: 'Service role unavailable' });

    // Load event
    const events = await service.entities.Event.filter({ id: eventId });
    const event = events?.[0];
    if (!event) return json(404, { ok: false, error: 'Event not found' });

    // Only organizer
    if (normalizeId(event.organizerId) !== normalizeId(user.id)) {
      return json(403, { ok: false, error: 'Only the organizer can initiate escrow' });
    }

    // Idempotency — already securing or secured
    if (['securing', 'secured'].includes(event.escrowStatus)) {
      return json(200, {
        ok: true,
        action: 'already_initiated',
        escrowStatus: event.escrowStatus,
        stripePaymentIntentId: event.stripePaymentIntentId,
      });
    }

    if (!event.budget || event.budget <= 0) {
      return json(400, { ok: false, error: 'Event budget must be greater than 0 to initiate escrow' });
    }

    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'), {
      apiVersion: '2024-06-20',
    });

    // Create PaymentIntent with manual capture (= escrow)
    const amountCents = Math.round(event.budget * 100);
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: 'cad',
      capture_method: 'manual',
      metadata: {
        eventId,
        organizerId: normalizeId(event.organizerId),
        platform: 'microrave',
      },
      description: `Séquestre événement: ${event.title}`,
    });

    // Enregistrer le PI et le montant avant la transition d'état
    await service.entities.Event.update(event.id, {
      stripePaymentIntentId: paymentIntent.id,
      escrowAmount: amountCents,
    });

    // Transition d'état via machine d'état canonique
    const transition = await base44.functions.invoke('transitionEscrowStatus', {
      eventId,
      fromStatus: event.escrowStatus || 'none',
      toStatus: 'securing',
      reason: 'PaymentIntent créé',
    });
    if (!transition?.data?.ok) {
      console.warn(`[processEventPayment] transition escrow failed: ${JSON.stringify(transition?.data)}`);
    }

    console.log(`[processEventPayment] eventId=${eventId} pi=${paymentIntent.id} amount=${amountCents}`);

    return json(200, {
      ok: true,
      action: 'initiated',
      clientSecret: paymentIntent.client_secret,
      stripePaymentIntentId: paymentIntent.id,
      amountCents,
    });

  } catch (error) {
    console.error('[processEventPayment]', error?.message || error);
    return json(500, { ok: false, error: error.message });
  }
});