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

// ── createBase44Repositories — inline PHASE 3 ───────────────────────
// Reproduit src/repositories/adapters/base44-adapter.js dans le
// runtime Deno cloud Base44. Univers séparés — aucun import cross-env.
// Barrière LOI_TRANSITION_01_VIOLATION ancrée physiquement ici.
// Source : PORT-3 · PHASE 3 · 27 mai 2026
function createBase44Repositories(base44) {
  if (!base44 || !base44.entities) {
    throw new Error('ADAPTER_ERROR: base44.entities absent — SDK Base44 requis.');
  }
  const E = base44.entities;
  const nowIso = () => new Date().toISOString();

  return {
    engagements: {
      get:    (id)      => E.Engagement.get(id),
      list:   (f)       => E.Engagement.filter(f || {}),
      create: (payload) => E.Engagement.create(payload),
      update: async (id, payload) => {
        if (payload && Object.prototype.hasOwnProperty.call(payload, 'status')) {
          throw new Error(
            'LOI_TRANSITION_01_VIOLATION: update() ne peut pas modifier status. ' +
            'Utiliser transitionEngagement() exclusivement.'
          );
        }
        return E.Engagement.update(id, payload);
      },
      updateStatus: () => {
        throw new Error(
          'LOI_TRANSITION_01_VIOLATION: updateStatus() interdit. ' +
          'Utiliser transitionEngagement() exclusivement.'
        );
      },
    },
    events: {
      get:    (id)      => E.Event.get(id),
      list:   (f)       => E.Event.filter(f || {}),
      create: (payload) => E.Event.create(payload),
      update: (id, p)   => E.Event.update(id, p),
    },
    contractSnapshots: {
      create: (payload) => E.ContractSnapshot.create({ createdAt: nowIso(), ...payload }),
      get:    (id)      => E.ContractSnapshot.get(id),
      list:   (f)       => E.ContractSnapshot.filter(f || {}),
    },
    ledgerRecords: {
      append: (payload) => E.LedgerRecord.create(payload),
      list:   (f)       => E.LedgerRecord.filter(f || {}),
    },
    eventPaymentRequests: {
      get:    (id)      => E.EventPaymentRequest.get(id),
      list:   (f)       => E.EventPaymentRequest.filter(f || {}),
      create: (payload) => E.EventPaymentRequest.create(payload),
      update: (id, p)   => E.EventPaymentRequest.update(id, p),
    },
    policyConfig: {
      get:    (f)       => E.PolicyConfig.filter(f || {}),
      getOne: async (key) => {
        const rows = await E.PolicyConfig.filter({ key });
        return rows?.[0] ?? null;
      },
    },
    sessionPresence: {
      create: (payload) => E.SessionPresence.create(payload),
      list:   (f)       => E.SessionPresence.filter(f || {}),
      update: (id, p)   => E.SessionPresence.update(id, p),
    },
    payoutExecutionRecords: {
      create: (payload) => E.PayoutExecutionRecord.create(payload),
      list:   (f)       => E.PayoutExecutionRecord.filter(f || {}),
    },
    settlementInstructions: {
      get:    (id)      => E.SettlementInstruction.get(id),
      list:   (f)       => E.SettlementInstruction.filter(f || {}),
    },
    talentPaymentProfiles: {
      list:   (f)       => E.TalentPaymentProfile.filter(f || {}),
    },
    schedulerTasks: {
      create: (payload) => E.SchedulerDueTask.create({ ...payload, createdAt: nowIso() }),
      list:   (f)       => E.SchedulerDueTask.filter(f || {}),
      update: (id, p)   => E.SchedulerDueTask.update(id, p),
    },
    sotsSubmissions: {
      create: (payload) => E.SOTSSubmission.create(payload),
      list:   (f)       => E.SOTSSubmission.filter(f || {}),
    },
    sotsDimensionConfigs: {
      list:   (f)       => E.SOTSDimensionConfig.filter(f || {}),
    },
    reputationLedger: {
      create: (payload) => E.ReputationLedger.create(payload),
    },
    membershipPlans: {
      list:   (f)       => E.MembershipPlan.filter(f || {}),
    },
    userMemberships: {
      list:   (f)       => E.UserMembership.filter(f || {}),
      create: (payload) => E.UserMembership.create(payload),
      update: (id, p)   => E.UserMembership.update(id, p),
    },
    webhookProcessedLogs: {
      create: (payload) => E.WebhookProcessedLog.create(payload),
      list:   (f)       => E.WebhookProcessedLog.filter(f || {}),
    },
    stripePaymentSignals: {
      create: (payload) => E.StripePaymentSignal.create(payload),
      list:   (f)       => E.StripePaymentSignal.filter(f || {}),
    },
  };
}
// ── Fin createBase44Repositories ────────────────────────────────────



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
    // deposit_pending = autoriser le relancement si session Checkout expirée
    if (!['placed', 'accepted', 'deposit_pending'].includes(eng.status)) {
      return Response.json({
        ok: false,
        error: `INVALID_STATE: Paiement impossible en état "${eng.status}". États valides : placed, accepted, deposit_pending.`,
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

    // Idempotence : retourner la session existante sauf si elle a plus de 23h
    // (Stripe expire les sessions après 24h)
    if (existingEPRs?.length && existingEPRs[0].stripeCheckoutUrl) {
      const eprAge = Date.now() - new Date(existingEPRs[0].createdAt || 0).getTime();
      const sessionExpired = eprAge > 23 * 3600 * 1000; // 23h
      if (!sessionExpired) {
        return Response.json({
          ok:          true,
          checkoutUrl: existingEPRs[0].stripeCheckoutUrl,
          amountCents: depositCents,
          eprId:       existingEPRs[0].systemId,
          idempotent:  true,
        });
      }
      // Session expirée — laisser créer une nouvelle session ci-dessous
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