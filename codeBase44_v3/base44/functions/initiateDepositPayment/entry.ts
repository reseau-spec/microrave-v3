/**
 * initiateDepositPayment — Base44 Function
 * ============================================================
 * Initie le paiement du dépôt via Stripe Checkout Session.
 *
 * FLUX :
 *   1. Charge l'Engagement et vérifie l'état
 *   2. Crée une Stripe Checkout Session (hosted page)
 *   3. Crée un EventPaymentRequest (piste d'audit)
 *   4. Passe l'engagement en deposit_pending
 *   5. Retourne { checkoutUrl } — le frontend redirige
 *   6. Stripe redirige vers successUrl après paiement
 *   7. Webhook payment_intent.succeeded → deposit_secured
 *
 * IDEMPOTENCE : si un EPR pending existe déjà pour cet
 * engagement, la Checkout Session existante est retournée
 * (Stripe expire les sessions après 24h).
 *
 * Source : D-038, D-097, OS V15
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

    // ── Autorisation ──────────────────────────────────────────
    if (me.id !== eng.organizerUserId) {
      return Response.json({ ok: false, error: 'FORBIDDEN: Seul l\'organisateur peut initier le paiement.' }, { status: 403 });
    }

    // ── Vérifier l'état ───────────────────────────────────────
    if (!['placed', 'accepted'].includes(eng.status)) {
      return Response.json({
        ok: false,
        error: `INVALID_STATE: Paiement impossible en état "${eng.status}". États valides : placed, accepted.`,
      }, { status: 422 });
    }

    const depositCents = Number(eng.depositCents) || 0;
    if (depositCents <= 0) {
      return Response.json({ ok: false, error: 'VALIDATION: depositCents invalide ou manquant.' }, { status: 422 });
    }

    // ── Idempotence — EPR + Checkout Session existants ? ──────
    const existingEPRs = await base44.entities.EventPaymentRequest
      .filter({ engagementId: eng.systemId, phase: 'deposit', status: 'pending' }, '-created_date', 1)
      .catch(() => []);

    if (existingEPRs?.length && existingEPRs[0].stripeCheckoutUrl) {
      return Response.json({
        ok:          true,
        checkoutUrl: existingEPRs[0].stripeCheckoutUrl,
        amountCents: depositCents,
        eprId:       existingEPRs[0].systemId,
        idempotent:  true,
      });
    }

    // ── Clé Stripe depuis env ─────────────────────────────────
    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY') || '';
    if (!stripeSecretKey) {
      return Response.json({ ok: false, error: 'CONFIG: STRIPE_SECRET_KEY absent.' }, { status: 500 });
    }

    // ── URLs de retour ────────────────────────────────────────
    // successUrl : après paiement Stripe redirige ici.
    // On passe engagementId en query param pour que la page sache
    // quel engagement vient d'être payé.
    const appBaseUrl   = Deno.env.get('APP_BASE_URL') || 'https://futuristic-rave-core-flow.base44.app';
    const finalSuccess = successUrl || `${appBaseUrl}/engagement/${engagementId}?payment=success`;
    const finalCancel  = cancelUrl  || `${appBaseUrl}/engagement/${engagementId}?payment=cancelled`;

    // ── Créer la Stripe Checkout Session ─────────────────────
    const idempotencyKey = `cs-deposit-${engagementId}`;
    const params = new URLSearchParams({
      'payment_method_types[]':           'card',
      'line_items[0][price_data][currency]':            'cad',
      'line_items[0][price_data][unit_amount]':         String(depositCents),
      'line_items[0][price_data][product_data][name]':  `Dépôt — ${eng.systemId}`,
      'line_items[0][price_data][product_data][description]': `Acompte engagement Micro Rave (20% du cachet de ${((Number(eng.cachetSigneCents) || 0) / 100).toFixed(2)} $)`,
      'line_items[0][quantity]':          '1',
      'mode':                             'payment',
      'success_url':                      finalSuccess,
      'cancel_url':                       finalCancel,
      'metadata[engagementId]':           engagementId,
      'metadata[phase]':                  'deposit',
      'metadata[organizerUserId]':        eng.organizerUserId,
      'metadata[talentUserId]':           eng.talentUserId || '',
      'metadata[platform]':              'microrave-v3',
    });

    const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization':   `Bearer ${stripeSecretKey}`,
        'Content-Type':    'application/x-www-form-urlencoded',
        'Idempotency-Key': idempotencyKey,
      },
      body: params.toString(),
    });

    if (!stripeRes.ok) {
      const err = await stripeRes.json().catch(() => ({}));
      return Response.json({
        ok:    false,
        error: `STRIPE_ERROR: ${err?.error?.message || 'Création Checkout Session échouée.'}`,
      }, { status: 502 });
    }

    const session = await stripeRes.json();

    // ── Créer l'EventPaymentRequest ───────────────────────────
    const eprId = generateId('EPR');
    const now   = new Date().toISOString();

    await base44.entities.EventPaymentRequest.create({
      systemId:               eprId,
      engagementId:           eng.systemId,
      organizerUserId:        eng.organizerUserId,
      amountCents:            depositCents,
      currency:               'cad',
      phase:                  'deposit',
      status:                 'pending',
      stripePaymentIntentId:  session.payment_intent || '',
      stripeCheckoutSessionId: session.id,
      stripeCheckoutUrl:      session.url,
      createdAt:              now,
    });

    // ── Transition vers deposit_pending ───────────────────────
    await base44.entities.Engagement.update(eng.id, {
      status:    'deposit_pending',
      updatedAt: now,
    });

    return Response.json({
      ok:          true,
      checkoutUrl: session.url,
      amountCents: depositCents,
      eprId,
      sessionId:   session.id,
    });

  } catch (error) {
    console.error('[initiateDepositPayment]', error.message);
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});