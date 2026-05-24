// deploy: v4
// cancelEvent — Annulation volontaire par l'organisateur.
//
// CHANGEMENTS v3 vs v2 :
//   - Ajout cancellationReason: 'cancelled_by_organizer'
//   - Ajout cancelledBySystem: false
//   - Ajout cancellationNote (optionnel, input du user)
//   - Logique de remboursement conditionnel selon J-7 :
//       >= J-7 (plus de 7 jours avant l'event) → balance remboursée si payée, dépôt gardé
//       < J-7 (moins de 7 jours) → aucun remboursement, dépôt distribué aux talents
//   - Appel generatePayoutSplits pour distribuer le dépôt aux talents dans tous les cas
//
// RÈGLES DE REMBOURSEMENT :
//   Le dépôt (20%) n'est JAMAIS remboursé — il est distribué aux talents.
//   La balance (80%) est remboursée uniquement si annulation >= J-7.
//
// CHANGEMENTS v4 — Fix R4 (escrowStatus désynchronisé après annulation) :
//   cancelEvent ne touchait pas escrowStatus → event cancelled pouvait
//   avoir escrowStatus='secured' indéfiniment.
//   FIX : si escrowStatus='secured' ou 'securing' au moment de l'annulation,
//   transition vers 'released' via transitionEscrowStatus (non-fatal).
//   La transition est 'released' car l'argent a été ou sera restitué/distribué.
//
// INPUT : { eventId, cancellationNote? }

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import Stripe from 'npm:stripe@14.21.0';

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status, headers: { 'content-type': 'application/json' },
  });
}

function normalizeId(v) {
  if (!v) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'object') return String(v.id || v._id || v.value || '');
  return String(v);
}

function round2(n) { return Math.round(n * 100) / 100; }

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return json(401, { ok: false, error: 'Non authentifié' });

    const body = await req.json().catch(() => ({}));
    const { eventId, cancellationNote } = body;
    if (!eventId) return json(400, { ok: false, error: 'eventId requis' });

    const service = base44.asServiceRole;
    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'), { apiVersion: '2024-06-20' });
    const nowIso = new Date().toISOString();
    const now = new Date();

    const events = await service.entities.Event.filter({ id: eventId });
    const event = events?.[0];
    if (!event) return json(404, { ok: false, error: 'Événement introuvable' });

    // Guard : seul l'organisateur
    if (normalizeId(event.organizerId) !== normalizeId(user.id)) {
      return json(403, { ok: false, error: 'Seul l\'organisateur peut annuler cet événement' });
    }

    if (['completed', 'archived', 'cancelled'].includes(event.status)) {
      return json(409, { ok: false, error: `État terminal : ${event.status}` });
    }

    // Vérifier si session live
    const inProgressSessions = await service.entities.Session.filter({ status: 'in_progress' });
    const liveSession = (inProgressSessions || []).find(
      s => s.sessionType === 'event' && normalizeId(s.eventId) === normalizeId(eventId)
    );
    if (liveSession) {
      return json(409, { ok: false, error: 'Session en cours — utiliser Play > Abandonner' });
    }

    // Suppression physique si draft
    if (event.status === 'draft') {
      await service.entities.Event.delete(event.id);
      return json(200, { ok: true, action: 'deleted', eventId });
    }

    // ── Calcul J-7 pour la politique de remboursement ─────────────────────────
    const dateStr = event.dateStart || event.startAt;
    let daysUntilEvent = null;
    let balanceRefundEligible = false;

    if (dateStr) {
      const dateStart = new Date(dateStr);
      daysUntilEvent = Math.floor((dateStart.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      // >= J-7 = plus de 7 jours avant l'event → balance remboursable
      balanceRefundEligible = daysUntilEvent >= 7;
    }

    // ── Aborter les sessions en attente ───────────────────────────────────────
    const lobbySessions = await service.entities.Session.filter({ status: 'lobby' });
    const pendingSessions = (lobbySessions || []).filter(
      s => s.sessionType === 'event' && normalizeId(s.eventId) === normalizeId(eventId)
    );
    for (const s of pendingSessions) {
      await service.entities.Session.update(s.id, { status: 'aborted', abortedAt: nowIso }).catch(() => {});
    }

    // ── Remboursement balance si éligible ─────────────────────────────────────
    let balanceRefunded = false;
    let balanceRefundAmount = 0;

    if (balanceRefundEligible && event.stripeBalancePaymentIntentId) {
      try {
        const balancePI = await stripe.paymentIntents.retrieve(event.stripeBalancePaymentIntentId);
        if (balancePI.status === 'succeeded' || balancePI.status === 'requires_capture') {
          if (balancePI.status === 'requires_capture') {
            // Annuler l'autorisation — pas encore capturée
            await stripe.paymentIntents.cancel(event.stripeBalancePaymentIntentId);
          } else {
            // Déjà capturée → remboursement
            await stripe.refunds.create({
              payment_intent: event.stripeBalancePaymentIntentId,
              reason: 'requested_by_customer',
            });
          }
          balanceRefunded = true;
          balanceRefundAmount = round2(balancePI.amount / 100);
          console.log(`[cancelEvent] balance remboursée: ${event.stripeBalancePaymentIntentId} = ${balanceRefundAmount}$`);
        }
      } catch (refundErr) {
        console.warn(`[cancelEvent] balance refund error (non-fatal): ${refundErr?.message}`);
      }
    }

    // ── Annuler l'Event ───────────────────────────────────────────────────────
    await service.entities.Event.update(event.id, {
      status:               'cancelled',
      cancelledAt:          nowIso,
      cancelledBy:          user.id,
      cancelledBySystem:    false,
      cancellationReason:   'cancelled_by_organizer',
      cancellationNote:     cancellationNote || null,
      completedAt:          nowIso, // requis par generatePayoutSplits
    });

    // ── v4 Fix R4 : synchroniser escrowStatus avec l'annulation ─────────────────
    // cancelEvent n'appelait pas transitionEscrowStatus — escrowStatus pouvait
    // rester 'secured' indéfiniment après annulation.
    // On transition vers 'released' pour signifier que les fonds sont distribués/restitués.
    // Non-fatal : si la transition échoue (état inattendu), on continue.
    const currentEscrowStatus = event.escrowStatus || 'none';
    if (currentEscrowStatus === 'secured' || currentEscrowStatus === 'securing') {
      try {
        await base44.functions.invoke('transitionEscrowStatus', {
          eventId,
          fromStatus: currentEscrowStatus,
          toStatus:   'released',
          reason:     `cancelEvent v4 — annulation organisateur (${cancellationNote || 'sans note'})`,
        });
        console.log(`[cancelEvent] v4 escrow transition ${currentEscrowStatus}→released eventId=${eventId}`);
      } catch (escrowErr) {
        console.warn(`[cancelEvent] v4 escrow transition failed (non-fatal): ${escrowErr?.message}`);
      }
    }

    // ── Créer EventPayout si absent (pour distribution du dépôt aux talents) ──
    const existingPayouts = await service.entities.EventPayout.filter({ eventId }).catch(() => []);
    if (!existingPayouts?.length) {
      await service.entities.EventPayout.create({
        eventId,
        status:           'pending',
        totalGrossAmount: Number(event.budget) || 0,
        triggerDate:      nowIso,
        createdAt:        nowIso,
        updatedAt:        nowIso,
      });
    }

    // ── Distribuer le dépôt aux talents (commission + SOTS selon leur forfait) ─
    // generatePayoutSplits détecte cancellationReason='balance_unpaid' ou
    // 'cancelled_by_organizer' et calcule sur escrowAmount (dépôt disponible).
    // Les taux de commission sont lus depuis MembershipPlan × SOTS — jamais hardcodés.
    try {
      await base44.functions.invoke('generatePayoutSplits', { eventId });
      console.log(`[cancelEvent] splits dépôt générés pour eventId=${eventId}`);
    } catch (splitErr) {
      console.warn(`[cancelEvent] generatePayoutSplits error (non-fatal): ${splitErr?.message}`);
    }

    console.log(JSON.stringify({
      action: 'cancelEvent',
      eventId,
      organizerId: user.id,
      cancellationReason: 'cancelled_by_organizer',
      daysUntilEvent,
      balanceRefundEligible,
      balanceRefunded,
      balanceRefundAmount,
      at: nowIso,
    }));

    return json(200, {
      ok:                   true,
      action:               'cancelled',
      eventId,
      cancellationReason:   'cancelled_by_organizer',
      daysUntilEvent,
      balanceRefundEligible,
      balanceRefunded,
      balanceRefundAmount,
      depositKept:          true,
      note:                 balanceRefundEligible
        ? 'Balance remboursée. Dépôt distribué aux talents selon leur commission et SOTS.'
        : 'Aucun remboursement (< J-7). Dépôt distribué aux talents selon leur commission et SOTS.',
    });

  } catch (err) {
    console.error('[cancelEvent]', err?.message);
    return json(500, { ok: false, error: err?.message });
  }
});