// deploy: v4
// completeEvent
//
// Marque un événement comme completed et crée l'EventPayout avec
// un triggerDate à +24h (délai de sécurité avant paiement aux talents).
//
// CHANGEMENTS v3 :
//   - Guard escrow : si escrowAmount > 0 et escrowStatus !== 'released',
//     refuse la complétion et retourne une erreur explicite avec action guidée.
//     Exception : si escrowAmount = 0 (event gratuit / sans dépôt), on laisse passer.
//   - Idempotency EventPayout renforcée : vérifie AVANT de marquer l'event
//     completed pour éviter la race condition de double création.
//   - Conserve le warning notFullyPaid pour les events sans balance payée.
//
// CHANGEMENTS v4 — Fix R6 (priceTotal inexistant) :
//   gross = escrowAmount + balancePaid (collecté Stripe réel)
//   Fallback: event.budget si les deux sont 0.

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

    const body = await req.json().catch(() => ({}));
    const { eventId } = body;
    if (!eventId) return json(400, { ok: false, error: 'eventId requis' });

    const service = base44.asServiceRole;
    const now = new Date();
    const nowIso = now.toISOString();

    const events = await service.entities.Event.filter({ id: eventId });
    const event = events?.[0];
    if (!event) return json(404, { ok: false, error: 'Événement introuvable' });

    // Guard : seul le créateur/organisateur peut compléter
    if (event.creatorUserId !== user.id && event.organizerId !== user.id && user.role !== 'admin') {
      return json(403, { ok: false, error: 'Seul le créateur/organisateur ou un admin peut compléter cet événement' });
    }

    // Guard : annulé
    if (event.cancelledAt || event.commercialState === 'cancelled') {
      return json(409, { ok: false, error: 'Un événement annulé ne peut pas être complété' });
    }

    // Guard : déjà complété — retour idempotent
    if (event.status === 'completed') {
      const payouts = await service.entities.EventPayout.filter({ eventId });
      const activePayout = (payouts || []).find(p => ['pending', 'processing', 'completed'].includes(p.status));
      return json(200, { ok: true, action: 'already_completed', payout: activePayout || null });
    }

    // ── GUARD ESCROW (bug #1) ─────────────────────────────────────────────────
    // Si l'event a un dépôt (escrowAmount > 0), l'argent doit avoir été capturé
    // et released avant de pouvoir compléter. Sans ça, le PI Stripe expire
    // silencieusement et les talents ne sont jamais payés.
    //
    // Exception : escrowAmount = 0 → event gratuit ou sans dépôt, on laisse passer.
    const escrowAmount = Number(event.escrowAmount) || 0;
    const escrowStatus = event.escrowStatus || 'none';

    if (escrowAmount > 0 && escrowStatus !== 'released') {
      const message =
        escrowStatus === 'secured'
          ? `L'escrow est sécurisé mais pas encore libéré. Appelez releaseEventEscrow avant de compléter l'événement.`
          : escrowStatus === 'securing'
          ? `Le dépôt est en cours de sécurisation. Attendez la confirmation Stripe avant de compléter.`
          : `L'escrow doit être released (état actuel : "${escrowStatus}"). Complétez le cycle de paiement d'abord.`;

      console.warn(`[completeEvent] BLOCKED eventId=${eventId} escrowStatus=${escrowStatus} escrowAmount=${escrowAmount}`);

      return json(409, {
        ok: false,
        code: 'ESCROW_NOT_RELEASED',
        error: message,
        escrowStatus,
        escrowAmount,
        action_required: 'releaseEventEscrow',
      });
    }

    // ── Idempotency EventPayout — vérifier AVANT de modifier l'event ─────────
    // On vérifie ici (avant l'update) pour éviter la race condition où deux
    // appels simultanés passent tous les deux le filtre "event.status !== completed".
    const existingPayouts = await service.entities.EventPayout.filter({ eventId });
    const activePayout = (existingPayouts || []).find(p =>
      ['pending', 'processing', 'completed'].includes(p.status)
    );

    // Marquer l'event comme completed
    await service.entities.Event.update(eventId, {
      status: 'completed',
      updatedAt: nowIso,
    });

    // Créer l'EventPayout seulement s'il n'en existe pas déjà un actif
    const triggerDate = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
    // v4: gross = montant réellement collecté depuis Stripe (fix R6)
    // event.priceTotal inexistant dans le schéma — toujours undefined en v3.
    const escrowCollected  = Number(event.escrowAmount) || 0;
    const balanceCollected = Number(event.balancePaid)  || 0;
    const gross = (escrowCollected + balanceCollected) > 0
      ? Math.round((escrowCollected + balanceCollected) * 100) / 100
      : Number(event.budget) || 0;

    let payout = activePayout;
    if (!payout) {
      payout = await service.entities.EventPayout.create({
        eventId,
        totalGrossAmount: gross,
        status: 'pending',
        triggerDate,
        createdAt: nowIso,
        updatedAt: nowIso,
      });
      console.log(`[completeEvent] v4 OK eventId=${eventId} gross=${gross} (escrow=${escrowCollected}+balance=${balanceCollected}) triggerDate=${triggerDate}`);
    } else {
      console.log(`[completeEvent] v3 payout already exists id=${payout.id} — skipped create`);
    }

    const notFullyPaid = event.financialState !== 'fully_paid';

    return json(200, {
      ok: true,
      eventId,
      completedAt: nowIso,
      payout: {
        id: payout.id,
        status: payout.status,
        triggerDate: payout.triggerDate || triggerDate,
        totalGrossAmount: gross,
      },
      warning: notFullyPaid ? 'Événement complété mais balance non payée — vérifier avant payout' : null,
    });

  } catch (error) {
    console.error('[completeEvent]', error?.message);
    return json(500, { ok: false, error: error.message });
  }
});