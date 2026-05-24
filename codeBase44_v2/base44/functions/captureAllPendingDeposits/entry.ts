import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
import Stripe from 'npm:stripe@14.21.0';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'));

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  const user = await base44.auth.me();
  if (user?.role !== 'admin') {
    return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
  }

  // B18 fix: traiter deux catégories d'events
  // 1. escrowStatus='securing' — dépôt initié, PI pas encore capturé (comportement original)
  // 2. escrowStatus='secured' + event.status IN (completed, cancelled) — escrows orphelins
  //    (event terminé mais escrow jamais releasé → PI risque d'expirer)
  const [securingEvents, securedEvents] = await Promise.all([
    base44.asServiceRole.entities.Event.filter({ escrowStatus: 'securing' }),
    base44.asServiceRole.entities.Event.filter({ escrowStatus: 'secured' }),
  ]);

  const TERMINAL_STATUSES = ['completed', 'cancelled', 'aborted'];
  const orphanEvents = (securedEvents || []).filter(ev =>
    TERMINAL_STATUSES.includes(ev.status)
  );

  // Pour les orphelins, on appelle releaseOrphanedEscrow qui gère la logique complète
  // (capture + transition + EventPayout). On les inclut dans le rapport.
  const orphanResults = [];
  for (const ev of orphanEvents) {
    try {
      const res = await base44.functions.invoke('releaseOrphanedEscrow', { eventId: ev.id });
      const r = res?.data?.results?.[0];
      orphanResults.push({
        eventId:  ev.id,
        title:    ev.title,
        piId:     ev.stripePaymentIntentId,
        status:   r?.action || 'UNKNOWN',
        amountCAD: r?.amount || 0,
        source:   'orphan',
      });
    } catch (err) {
      orphanResults.push({ eventId: ev.id, status: 'ERROR', error: err.message, source: 'orphan' });
    }
  }

  const events = securingEvents;
  if ((!events || events.length === 0) && orphanEvents.length === 0) {
    return Response.json({ message: 'Aucun event en status securing ou orphelin trouvé.', results: [] });
  }

  const results = [];

  for (const event of (events || [])) {
    const piId = event.stripePaymentIntentId;

    if (!piId) {
      results.push({ eventId: event.id, status: 'SKIPPED_NO_PI' });
      continue;
    }

    try {
      const pi = await stripe.paymentIntents.retrieve(piId);

      if (pi.status === 'requires_capture') {
        const captured = await stripe.paymentIntents.capture(piId);
        const amountCAD = captured.amount_received / 100;

        await base44.asServiceRole.entities.Event.update(event.id, {
          escrowStatus: 'secured',
          escrowAmount: amountCAD
        });

        await base44.asServiceRole.entities.PaymentLedger.create({
          eventId: event.id,
          payerUserId: event.payerUserId || event.organizerId,
          payeeUserId: event.organizerId,
          amountTotal: amountCAD,
          amountEscrow: amountCAD,
          amountReleased: 0,
          stripeRef: piId,
          status: 'secured'
        });

        results.push({ eventId: event.id, piId, status: 'CAPTURED', amountCAD });

      } else if (pi.status === 'canceled') {
        await base44.asServiceRole.entities.Event.update(event.id, {
          escrowStatus: 'none',
          escrowAmount: 0
        });

        results.push({ eventId: event.id, piId, status: 'EXPIRED_LOST', amountCAD: 0 });

      } else {
        results.push({ eventId: event.id, piId, status: `SKIPPED_${pi.status.toUpperCase()}`, amountCAD: 0 });
      }

    } catch (err) {
      results.push({ eventId: event.id, piId, status: 'ERROR', error: err.message });
    }
  }

  const allResults = [...results, ...orphanResults];
  const capturedAll = allResults.filter(r => r.status === 'CAPTURED' || r.status === 'CAPTURED_AND_RELEASED');
  const expiredAll  = allResults.filter(r => r.status === 'EXPIRED_LOST' || r.status === 'EXPIRED_FUNDS_LOST');
  const errorsAll   = allResults.filter(r => r.status === 'ERROR');

  return Response.json({
    totalProcessed:    allResults.length,
    securingProcessed: results.length,
    orphansProcessed:  orphanResults.length,
    totalCaptured:     capturedAll.length,
    totalExpired:      expiredAll.length,
    totalErrors:       errorsAll.length,
    totalCapturedCAD:  capturedAll.reduce((s, r) => s + (r.amountCAD || r.amount || 0), 0),
    details:           allResults,
  });
});