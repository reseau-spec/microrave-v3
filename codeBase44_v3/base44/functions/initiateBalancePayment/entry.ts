/**
 * initiateBalancePayment — Base44 Function v2
 * ============================================================
 * Initie le paiement de la balance (solde restant après dépôt)
 * via Stripe Checkout Session.
 *
 * ── CHANGEMENTS v1 → v2 (26 mai 2026 — hotfix) ──────────────
 *
 * Ajout d'un GARDE EPR_BALANCE_ALREADY_PAID en tête de fonction.
 *
 * Bug observé sur ENG-H5V66Q-WBJ7N2 :
 *   v1 ne cherchait que les EPR status=pending pour l'idempotence.
 *   Si la balance était déjà payée (EPR succeeded), un re-clic
 *   créait un nouveau EPR pending fantôme qui bloquait ensuite
 *   le BalancePaymentGuard au scellement.
 *
 * v2 vérifie d'abord si un EPR balance succeeded existe DÉJÀ pour
 * cet engagement. Si oui → retourne BALANCE_ALREADY_PAID sans
 * créer de nouveau EPR ni appeler Stripe. Le frontend doit alors
 * cacher le bouton (ActionsSidebar v2 fait ce check côté UI aussi).
 *
 * PRÉREQUIS : engagement en état deposit_secured.
 * RÉSULTAT  : URL Stripe Checkout (succès) ou
 *             { ok: true, alreadyPaid: true } si déjà payé.
 *
 * MONTANT : balanceCents = cachetSigneCents − depositCents
 *           Calculé à la création de l'engagement, gravé dans
 *           l'entité Engagement. Jamais recalculé ici.
 *
 * IDEMPOTENCE multi-niveau :
 *   1. Si EPR balance succeeded existe → BALANCE_ALREADY_PAID
 *   2. Si EPR balance pending avec checkoutUrl → réutiliser
 *   3. Sinon → créer nouveau EPR + Stripe Checkout Session
 *
 * Source : D-038 Phase 1, SC-01, OS V15, hotfix EPR 26-05-2026
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

    // ── HOTFIX v2 — Garde BALANCE_ALREADY_PAID ────────────────
    // Si un EPR balance succeeded (ou completed legacy) existe déjà
    // pour cet engagement, ne PAS créer un nouveau EPR pending.
    // Sinon : pollution avec EPR fantômes qui bloqueront le scellement.
    const succeededEPRs = await base44.entities.EventPaymentRequest
      .filter({ engagementId: eng.systemId, phase: 'balance' }, '-created_date', 20)
      .catch(() => []);

    const paidEpr = (succeededEPRs || []).find(e =>
      e.status === 'succeeded' || e.status === 'completed'
    );

    if (paidEpr) {
      return Response.json({
        ok:          true,
        alreadyPaid: true,
        eprId:       paidEpr.systemId,
        amountCents: Number(paidEpr.amountCents) || balanceCents,
        message:     `Balance déjà encaissée (EPR ${paidEpr.systemId}, status=${paidEpr.status}). Aucun nouveau paiement nécessaire. L'organisateur peut sceller l'événement.`,
      });
    }

    // ── Idempotence v1 — EPR balance pending existant ? ──────
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