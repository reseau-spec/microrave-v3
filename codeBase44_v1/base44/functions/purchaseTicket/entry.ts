// deploy: v2
// purchaseTicket — Achat d'un billet par un membre de l'audience.
//
// CHANGEMENTS v2 — Rôle contextuel + traçabilité financière :
//
//   PROBLÈME v1 :
//   Les metadata du PI ne portaient ni revenueType ni buyerRole.
//   Impossible de distinguer les ventes de billets des autres charges
//   dans les exports Stripe RAW. Le rôle de l'acheteur dans CETTE
//   transaction était absent.
//
//   FIX :
//   revenueType → "ticket_sale"   classification revenus dans exports
//   buyerRole   → "audience"      rôle contextuel (transactionnel, pas identitaire)
//   eventName   → event?.title    lisibilité export (event déjà chargé)
//   platform    → "microrave"     filtre multi-compte Stripe
//
//   RÈGLE : le rôle appartient à la transaction, pas à l'utilisateur.
//   Le même userId peut être organizer sur un dépôt et audience sur un billet.
//
//   1. Vérifier EventTicketConfig (billetterie active, capacité disponible)
//   2. Calculer grossAmount = (ticketPrice + 0.30) / (1 - 0.029)
//   3. Créer Stripe PaymentIntent (amount = grossAmount)
//   4. Créer Ticket (status=pending)
//   5. Retourner client_secret pour Stripe Elements côté frontend
//
// LE WEBHOOK payment_intent.succeeded (stripeWebhookReal) :
//   → met à jour Ticket.status=paid, Ticket.paidAt, Ticket.stripeChargeId
//   → incrémente EventTicketConfig.soldCount et totalTicketRevenue
//
// SÉPARATION ABSOLUE : ce PI n'a aucun lien avec EventPaymentRequest.
// Pool C est calculé dans generatePayoutSplits depuis EventTicketConfig.totalTicketRevenue.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import Stripe from 'npm:stripe@14.21.0';

function json(s, b) { return new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json' }}); }
function round2(x) { return Math.round(x * 100) / 100; }

const STRIPE_RATE  = 0.029;
const STRIPE_FIXED = 0.30;

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user   = await base44.auth.me();
    if (!user) return json(401, { ok: false, error: 'Unauthorized' });

    const body    = await req.json().catch(() => ({}));
    const { eventId } = body;
    if (!eventId) return json(400, { ok: false, error: 'eventId requis' });

    const svc = base44.asServiceRole;
    const nowIso = new Date().toISOString();

    // ── 1. Charger EventTicketConfig ──────────────────────────────────────────
    const configs = await svc.entities.EventTicketConfig
      .filter({ eventId, isActive: true }).catch(() => []);
    const config = configs?.[0];
    if (!config) return json(404, { ok: false, error: 'Billetterie non disponible pour cet événement' });

    // Vérifier les dates de vente
    if (config.salesOpenAt && new Date() < new Date(config.salesOpenAt)) {
      return json(409, { ok: false, error: 'Les ventes ne sont pas encore ouvertes' });
    }
    if (config.salesCloseAt && new Date() > new Date(config.salesCloseAt)) {
      return json(409, { ok: false, error: 'Les ventes sont fermées' });
    }

    // Vérifier la capacité
    if (config.capacity != null && (config.soldCount || 0) >= config.capacity) {
      return json(409, { ok: false, error: 'Événement complet — plus de billets disponibles' });
    }

    // ── 2. Calculer les montants ──────────────────────────────────────────────
    const ticketPrice     = Number(config.ticketPrice);
    const grossAmount     = round2((ticketPrice + STRIPE_FIXED) / (1 - STRIPE_RATE));
    const stripeFeeAmount = round2(grossAmount - ticketPrice);
    const amountCents     = Math.round(grossAmount * 100);

    // ── 3. Charger l'event pour metadata Stripe ───────────────────────────────
    const eventRows = await svc.entities.Event.filter({ id: eventId }).catch(() => []);
    const event = eventRows?.[0];

    // ── 4. Créer le PaymentIntent Stripe ─────────────────────────────────────
    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeKey) return json(500, { ok: false, error: 'Stripe non configuré' });
    const stripe = new Stripe(stripeKey, { apiVersion: '2024-06-20' });

    const sequenceNumber = (config.soldCount || 0) + 1;

    const pi = await stripe.paymentIntents.create({
      amount:   amountCents,
      currency: 'cad',
      metadata: {
        // --- Classification financière (v2) ---
        revenueType:     'ticket_sale',
        // --- Rôle contextuel (v2) ---
        // Rôle joué dans CETTE transaction — pas identitaire.
        // Le même userId peut être organizer ailleurs et audience ici.
        buyerRole:       'audience',
        // --- Événement (v2) ---
        eventId,
        eventName:       event?.title ?? '',
        // --- Acheteur ---
        buyerUserId:     user.id,
        // --- Montants ---
        ticketPrice:     String(ticketPrice),
        stripeFeeAmount: String(stripeFeeAmount),
        sequenceNumber:  String(sequenceNumber),
        // --- Plateforme ---
        platform:        'microrave',
      },
      description: `Billet — ${event?.title || eventId} — ${ticketPrice}$ + ${stripeFeeAmount}$ frais`,
    });

    // ── 5. Créer le Ticket (pending) ──────────────────────────────────────────
    const qrCode = crypto.randomUUID();
    const ticket = await svc.entities.Ticket.create({
      eventId,
      buyerUserId:           user.id,
      ticketPrice,
      grossAmount,
      stripeFeeAmount,
      stripePaymentIntentId: pi.id,
      sequenceNumber,
      status:                'pending',
      refundStatus:          'none',
      refundedAmount:        0,
      refundableAmount:      grossAmount,
      qrCode,
      isTransferable:        config.isTransferable || false,
      createdAt:             nowIso,
    });

    // Verrouiller les paramètres financiers au premier billet
    if (!config.ticketFinancialsLockedAt) {
      await svc.entities.EventTicketConfig.update(config.id, {
        ticketFinancialsLockedAt: nowIso,
      }).catch(() => {});
    }

    console.log(`[purchaseTicket] v2 eventId=${eventId} userId=${user.id} ticketId=${ticket.id} price=${ticketPrice}$ gross=${grossAmount}$ PI=${pi.id}`);

    return json(200, {
      ok: true,
      ticketId:      ticket.id,
      clientSecret:  pi.client_secret,
      ticketPrice,
      grossAmount,
      stripeFeeAmount,
      qrCode,
      message:       `Billet réservé — ${grossAmount}$ (inclut ${stripeFeeAmount}$ frais de traitement)`,
    });

  } catch (err) {
    console.error('[purchaseTicket]', err?.message);
    return json(500, { ok: false, error: err?.message });
  }
});