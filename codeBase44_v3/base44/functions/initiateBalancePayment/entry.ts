/**
 * initiateBalancePayment — Base44 Function
 * ============================================================
 * Initie le paiement de la balance (solde restant après dépôt)
 * via Stripe Checkout Session.
 *
 * PRÉREQUIS : engagement en état deposit_secured.
 * RÉSULTAT  : engagement passe en balance_pending.
 *             webhook payment_intent.succeeded → balance_secured
 *             → débloque la transition deposit_secured → event_sealed.
 *
 * MONTANT : balanceCents = cachetSigneCents − depositCents
 *           Calculé à la création de l'engagement, gravé dans
 *           l'entité Engagement. Jamais recalculé ici.
 *
 * IDEMPOTENCE : si un EPR balance pending existe déjà,
 *               retourne la Checkout URL existante.
 *
 * GUARD deposit_secured → event_sealed :
 *   La transition event_sealed vérifie dans transitionEngagement
 *   qu'un PayoutExecutionRecord balance existe. Sans ce paiement,
 *   l'organisateur ne peut pas sceller l'événement.
 *
 * Source : D-038 Phase 1, SC-01, OS V15
 * ============================================================
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

function generateId(prefix) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const s1 = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  const s2 = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `${prefix}-${s1}-${s2}`;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const me = await base44.auth.me();
    if (!me?.id) return Response.json({ ok: false, error: 'AUTH_REQUIRED' }, { status: 401 });

    const body = await req.json();
    const { engagementId, successUrl, cancelUrl } = body;

    if (!engagementId) {
      return Response.json({ ok: false, error: 'VALIDATION: engagementId obligatoire.' }, { status: 400 });
    }

    // ── Charger l'engagement ──────────────────────────────────
    const engagements = await base44.entities.Engagement.filter(
      { systemId: engagementId }, '-created_date', 1
    );
    if (!engagements?.length) {
      return Response.json({ ok: false, error: `NOT_FOUND: Engagement "${engagementId}" introuvable.` }, { status: 404 });
    }

    const eng = engagements[0];

    // ── Autorisation — organisateur uniquement ────────────────
    if (me.id !== eng.organizerUserId) {
      return Response.json({ ok: false, error: 'FORBIDDEN: Seul l\'organisateur peut initier le paiement de la balance.' }, { status: 403 });
    }

    // ── Vérifier l'état ───────────────────────────────────────
    if (eng.status !== 'deposit_secured') {
      return Response.json({
        ok: false,
        error: `INVALID_STATE: Paiement de la balance possible uniquement depuis deposit_secured. État actuel : "${eng.status}".`,
      }, { status: 422 });
    }

    const balanceCents = Number(eng.balanceCents) || 0;
    if (balanceCents <= 0) {
      return Response.json({ ok: false, error: 'VALIDATION: balanceCents invalide ou nul.' }, { status: 422 });
    }

    const cachetCents = Number(eng.cachetSigneCents) || 0;

    // ── Idempotence — EPR balance pending existant ? ──────────
    const existingEPRs = await base44.entities.EventPaymentRequest
      .filter({ engagementId: eng.systemId, phase: 'balance', status: 'pending' }, '-created_date', 1)
      .catch(() => []);

    if (existingEPRs?.length && existingEPRs[0].stripeCheckoutUrl) {
      return Response.json({
        ok:          true,
        checkoutUrl: existingEPRs[0].stripeCheckoutUrl,
        amountCents: balanceCents,
        eprId:       existingEPRs[0].systemId,
        idempotent:  true,
      });
    }

    // ── Clé Stripe ────────────────────────────────────────────
    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY') || '';
    if (!stripeSecretKey) {
      return Response.json({ ok: false, error: 'CONFIG: STRIPE_SECRET_KEY absent.' }, { status: 500 });
    }

    const appBaseUrl   = Deno.env.get('APP_BASE_URL') || 'https://futuristic-rave-core-flow.base44.app';
    const finalSuccess = successUrl || `${appBaseUrl}/engagement/${engagementId}?payment=success&phase=balance`;
    const finalCancel  = cancelUrl  || `${appBaseUrl}/engagement/${engagementId}?payment=cancelled&phase=balance`;

    // ── Créer la Stripe Checkout Session ─────────────────────
    const params = new URLSearchParams({
      'payment_method_types[]':                          'card',
      'line_items[0][price_data][currency]':             'cad',
      'line_items[0][price_data][unit_amount]':          String(balanceCents),
      'line_items[0][price_data][product_data][name]':   `Balance — ${engagementId}`,
      'line_items[0][price_data][product_data][description]':
        `Solde restant engagement Micro Rave (80% du cachet de ${(cachetCents/100).toFixed(2)} $)`,
      'line_items[0][quantity]':                         '1',
      'mode':                                            'payment',
      'success_url':                                     finalSuccess,
      'cancel_url':                                      finalCancel,
      'metadata[engagementId]':                          engagementId,
      'metadata[phase]':                                 'balance',
      'metadata[organizerUserId]':                       eng.organizerUserId,
      'metadata[talentUserId]':                          eng.talentUserId || '',
      'metadata[platform]':                              'microrave-v3',
    });

    const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method:  'POST',
      headers: {
        'Authorization':   `Bearer ${stripeSecretKey}`,
        'Content-Type':    'application/x-www-form-urlencoded',
        'Idempotency-Key': `cs-balance-${engagementId}`,
      },
      body: params.toString(),
    });

    if (!stripeRes.ok) {
      const err = await stripeRes.json().catch(() => ({}));
      return Response.json({
        ok:    false,
        error: `STRIPE_ERROR: ${err?.error?.message || 'Checkout Session balance échouée.'}`,
      }, { status: 502 });
    }

    const session = await stripeRes.json();

    // ── Créer EventPaymentRequest (piste d'audit) ─────────────
    const eprId = generateId('EPR');
    const now   = new Date().toISOString();

    await base44.entities.EventPaymentRequest.create({
      systemId:                eprId,
      engagementId:            eng.systemId,
      organizerUserId:         eng.organizerUserId,
      amountCents:             balanceCents,
      currency:                'cad',
      phase:                   'balance',
      status:                  'pending',
      stripePaymentIntentId:   session.payment_intent || '',
      stripeCheckoutSessionId: session.id,
      stripeCheckoutUrl:       session.url,
      createdAt:               now,
    });

    // ── Transition vers balance_pending ──────────────────────
    // Ajouter balance_pending comme état intermédiaire si nécessaire.
    // Pour le MVP on reste en deposit_secured — le statut EPR indique l'attente.
    // La transition vers event_sealed sera bloquée jusqu'à confirmation webhook.

    return Response.json({
      ok:          true,
      checkoutUrl: session.url,
      amountCents: balanceCents,
      eprId,
      sessionId:   session.id,
      message:     `Paiement balance (${(balanceCents/100).toFixed(2)} $) initié. Après confirmation Stripe, la transition vers event_sealed sera débloquée.`,
    });

  } catch (error) {
    console.error('[initiateBalancePayment]', error.message);
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});