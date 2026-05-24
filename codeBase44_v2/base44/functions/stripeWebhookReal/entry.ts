// deploy: v6
// stripeWebhookReal — Webhook Stripe unifié : paiements + Connect + Subscriptions
//
// CHANGEMENTS v6 — invoice.payment_succeeded (traçabilité financière abonnements SaaS) :
//
//   PROBLÈME v5 :
//   Les renouvellements d'abonnement Stripe (type='payment' dans balance_history)
//   n'avaient aucune metadata. Ils étaient invisibles dans les états financiers
//   et impossibles à distinguer des paiements événementiels dans les exports Stripe.
//   Description='Subscription creation' était le seul signal, fragile et non structuré.
//   Le FinancialLedger ne recevait aucune écriture pour les revenus d'abonnement.
//
//   FIX :
//   Nouveau handler handleInvoicePaymentSucceeded() déclenché sur invoice.payment_succeeded.
//
//   DISTINCTION CRITIQUE avec payment_intent.succeeded (déjà géré en v5) :
//     invoice.payment_succeeded  → invoice Stripe avec invoice.subscription — abonnements uniquement
//     payment_intent.succeeded   → tout PI capturé (events, tickets, abonnements mélangés)
//   Les deux peuvent se produire pour le même paiement. Ils sont indépendants.
//   invoice.payment_succeeded est le seul qui donne accès direct à invoice.subscription.
//
//   ACTIONS du nouveau handler :
//
//   1. Copier les metadata de la Subscription vers le PaymentIntent du renouvellement.
//      Ces metadata apparaîtront dans Stripe RAW (balance_history) pour tous les exports :
//        revenueType  → "subscription_saas"
//        plan         → subscription.metadata.plan ?? "unknown"
//        subscriberId → subscription.metadata.subscriberId ?? ""
//        platform     → "microrave"
//        invoiceId    → invoice.id
//        periodStart  → ISO date début période facturée
//        periodEnd    → ISO date fin période facturée
//      Non-fatal : un échec PI update ne bloque pas le reste du handler.
//
//   2. Écrire une paire FinancialLedger subscription_revenue (double-entry, append-only) :
//        Dr stripe_balance    (actif — argent reçu dans le compte Stripe plateforme)
//        Cr revenue_subscription (revenu SaaS reconnu)
//      Idempotence : guard stripeRef + entryType='subscription_revenue' avant écriture.
//      Non-fatal : un échec ledger ne bloque jamais le webhook.
//
//   GUARD : ne traiter que les invoices avec invoice.subscription non-null.
//   Les invoices one-time (achats ponctuels) sont ignorées par ce handler.
//
// CHANGEMENTS v5 — Handler payment_intent.succeeded :
//   CAS 1 — EPR : actualPayerEmail depuis billing_details si absent.
//   CAS 2 — Ticket : status=paid + soldCount + totalTicketRevenue.
//
// CHANGEMENTS v4.1 — Robustesse webhook abonnements.
// CHANGEMENTS v4 — Fallback subscription.metadata si MembershipPlan absent en DB.
// CHANGEMENTS v3 — Subscription handlers (checkout, created, updated, deleted, payment_failed).
// CHANGEMENTS v2 — account.updated (Connect KYC sync).
// CHANGEMENTS v1 — payment_intent handlers (escrow).

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
import Stripe from 'npm:stripe@14';

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status, headers: { 'content-type': 'application/json' },
  });
}

// ── Handler : checkout.session.completed ─────────────────────────────────────
// Crée le UserMembership en DB après confirmation du paiement Checkout.
async function handleCheckoutCompleted(session, service, stripe) {
  const userId    = session.metadata?.microrave_userId;
  const planSku   = session.metadata?.planSku;
  const cycle     = session.metadata?.billingCycle || 'monthly';
  const subId     = session.subscription;
  const custId    = session.customer;

  if (!userId || !planSku) {
    console.warn('[stripeWebhookReal] checkout.session.completed — metadata manquante', { userId, planSku });
    return;
  }

  // Idempotence : vérifier si UserMembership existe déjà pour cette subscription
  if (subId) {
    const existing = await service.entities.UserMembership
      .filter({ stripeSubscriptionId: subId }).catch(() => []);
    if (existing?.length > 0) {
      console.log(`[CHECKOUT_ALREADY_PROCESSED] subId=${subId} — skip`);
      return;
    }
  }

  // Charger la subscription Stripe AVANT le plan (contient les metadata de fallback)
  let subscription = null;
  if (subId) {
    subscription = await stripe.subscriptions.retrieve(subId).catch(() => null);
  }

  // Charger le plan DB pour le commissionRate
  // FALLBACK v4 : si plan absent en DB, utiliser subscription.metadata
  // (écrit par createMembershipCheckout : tier, commissionRate, planSku)
  const plans = await service.entities.MembershipPlan
    .filter({ sku: planSku }).catch(() => []);
  let plan = plans?.[0] || null;

  // Tier et taux depuis DB ou fallback subscription metadata
  const subMeta    = subscription?.metadata || session.subscription_data?.metadata || {};
  const tierFinal  = plan?.tier            || subMeta.tier        || null;
  const rateFinal  = plan?.commissionRate  || (subMeta.commissionRate ? Number(subMeta.commissionRate) : null);

  if (!tierFinal || rateFinal === null) {
    console.error(
      `[stripeWebhookReal] v4 Plan introuvable ET metadata insuffisantes — ` +
      `planSku=${planSku} subId=${subId} subMeta=${JSON.stringify(subMeta)} — SKIP`
    );
    return;
  }

  if (!plan) {
    console.warn(
      `[stripeWebhookReal] v4 Plan DB absent (${planSku}) — ` +
      `fallback sur subscription.metadata tier=${tierFinal} rate=${rateFinal}`
    );
  }

  const nowIso     = new Date().toISOString();
  const expiresAt  = subscription?.current_period_end
    ? new Date(subscription.current_period_end * 1000).toISOString()
    : null;
  const renewsAt   = expiresAt;

  // Désactiver l'abonnement actif précédent si existant
  const oldMemberships = await service.entities.UserMembership
    .filter({ userId, status: 'active' }).catch(() => []);
  for (const old of (oldMemberships || [])) {
    await service.entities.UserMembership.update(old.id, {
      status:      'cancelled',
      cancelledAt: nowIso,
    }).catch(e => console.warn('[stripeWebhookReal] old membership cancel failed:', e?.message));
    console.log(`[OLD_MEMBERSHIP_CANCELLED] id=${old.id} userId=${userId}`);
  }

  // Créer le nouveau UserMembership
  // Utilise tierFinal/rateFinal (DB ou fallback subscription.metadata)
  const membership = await service.entities.UserMembership.create({
    userId,
    planSku,
    tier:                   tierFinal,
    commissionRateSnapshot: rateFinal, // figé contractuellement à l'achat
    status:                 'active',
    billingCycle:           cycle,
    startedAt:              nowIso,
    expiresAt,
    renewsAt,
    autoRenew:              true,
    stripeSubscriptionId:   subId   || null,
    stripeCustomerId:       custId  || null,
  });

  // Mettre à jour commissionTier sur TalentProfile
  const profiles = await service.entities.TalentProfile
    .filter({ userId }).catch(() => []);
  const profile = profiles?.[0];
  if (profile) {
    await service.entities.TalentProfile.update(profile.id, {
      commissionTier:   tierFinal,
      stripeCustomerId: custId || profile.stripeCustomerId || null,
    }).catch(e => console.warn('[stripeWebhookReal] TalentProfile update failed:', e?.message));
  }

  console.log(
    `[MEMBERSHIP_CREATED] v4 userId=${userId} plan=${planSku} tier=${tierFinal} ` +
    `rate=${rateFinal} fallback=${!plan} cycle=${cycle} membershipId=${membership.id} ` +
    `sub=${subId} expires=${expiresAt}`
  );
}

// ── Handler : customer.subscription.updated ──────────────────────────────────
async function handleSubscriptionUpdated(subscription, service, stripe) {
  const userId = subscription.metadata?.microrave_userId;
  if (!userId) return;

  const memberships = await service.entities.UserMembership
    .filter({ stripeSubscriptionId: subscription.id }).catch(() => []);
  let membership = memberships?.[0];

  // v4 — Filet de sécurité : si subscription devient 'active' mais UserMembership absent
  // (checkout.session.completed a peut-être échoué), le créer maintenant.
  // Guard : attendre 120 secondes depuis la création avant de déclencher le fallback
  // pour éviter la race condition avec checkout.session.completed qui arrive ~2s après.
  const subAgeSeconds = subscription.created
    ? Math.floor((Date.now() / 1000) - subscription.created)
    : 999;
  if (!membership && subscription.status === 'active' && subAgeSeconds > 120) {
    console.warn(
      `[stripeWebhookReal] v4 subscription.updated — UserMembership absent pour subId=${subscription.id} ` +
      `userId=${userId} — tentative de création via fallback`
    );
    try {
      await handleCheckoutCompleted(
        {
          metadata:     subscription.metadata,
          subscription: subscription.id,
          customer:     subscription.customer,
        },
        service, stripe
      );
    } catch (e) {
      console.error(`[stripeWebhookReal] v4 fallback création failed: ${e?.message}`);
    }
    return;
  }

  if (!membership) {
    console.warn(`[stripeWebhookReal] v4 subscription.updated — UserMembership introuvable subId=${subscription.id} status=${subscription.status}`);
    return;
  }

  const expiresAt = subscription.current_period_end
    ? new Date(subscription.current_period_end * 1000).toISOString()
    : null;

  // Statut Stripe → statut Micro Rave
  const stripeStatus = subscription.status;
  let newStatus = membership.status;
  if (stripeStatus === 'active')   newStatus = 'active';
  if (stripeStatus === 'past_due') newStatus = 'active'; // grace period
  if (stripeStatus === 'canceled') newStatus = 'cancelled';
  if (stripeStatus === 'unpaid')   newStatus = 'expired';

  await service.entities.UserMembership.update(membership.id, {
    status:    newStatus,
    expiresAt,
    renewsAt:  expiresAt,
    ...(stripeStatus === 'canceled' ? { cancelledAt: new Date().toISOString() } : {}),
  });

  console.log(`[MEMBERSHIP_UPDATED] id=${membership.id} userId=${userId} stripeStatus=${stripeStatus} → ${newStatus}`);
}

// ── Handler : customer.subscription.deleted ──────────────────────────────────
async function handleSubscriptionDeleted(subscription, service) {
  const userId = subscription.metadata?.microrave_userId;
  const memberships = await service.entities.UserMembership
    .filter({ stripeSubscriptionId: subscription.id }).catch(() => []);
  const membership = memberships?.[0];
  if (!membership) return;

  await service.entities.UserMembership.update(membership.id, {
    status:      'expired',
    cancelledAt: new Date().toISOString(),
    autoRenew:   false,
  });

  // Remettre le profil en Freemium
  if (userId) {
    const profiles = await service.entities.TalentProfile.filter({ userId }).catch(() => []);
    const profile = profiles?.[0];
    if (profile) {
      await service.entities.TalentProfile.update(profile.id, {
        commissionTier: 'A',
      }).catch(() => null);
    }
  }

  console.log(`[MEMBERSHIP_EXPIRED] id=${membership.id} userId=${userId} sub=${subscription.id}`);
}

// ── Handler : invoice.payment_failed ─────────────────────────────────────────
async function handleInvoicePaymentFailed(invoice, service) {
  const subId = invoice.subscription;
  if (!subId) return;
  const memberships = await service.entities.UserMembership
    .filter({ stripeSubscriptionId: subId }).catch(() => []);
  const membership = memberships?.[0];
  if (!membership) return;

  // Marquer payment_failed mais garder active (Stripe retry pendant grace period)
  await service.entities.UserMembership.update(membership.id, {
    // Note interne sur l'échec — pas de changement de statut (Stripe gère les retries)
    promoNote: `[${new Date().toISOString()}] invoice.payment_failed — Stripe retry en cours`,
  });
  console.log(`[INVOICE_PAYMENT_FAILED] membershipId=${membership.id} invoiceId=${invoice.id}`);
}

// ── Handler : payment_intent.succeeded ───────────────────────────────────────
async function handlePaymentIntentSucceeded(pi, service, stripe) {
  const piId = pi?.id;
  if (!piId) return;

  let chargeId   = null;
  let payerEmail = null;
  let payerName  = null;

  try {
    const chargeList = await stripe.charges.list({ payment_intent: piId, limit: 1 });
    const charge     = chargeList?.data?.[0] || null;
    chargeId   = charge?.id   || null;
    payerEmail = charge?.billing_details?.email || pi?.receipt_email || null;
    payerName  = charge?.billing_details?.name  || null;
  } catch (e) {
    console.warn(`[stripeWebhookReal] v5 charge lookup failed pi=${piId}:`, e?.message);
  }

  // CAS 1 — EPR : mettre à jour actualPayerEmail si absent
  try {
    const eprs = await service.entities.EventPaymentRequest
      .filter({ stripePaymentIntentId: piId }).catch(() => []);
    const epr = eprs?.[0];
    if (epr && !epr.actualPayerEmail && payerEmail) {
      await service.entities.EventPaymentRequest.update(epr.id, {
        actualPayerEmail:   payerEmail,
        actualPayerName:    payerName || null,
        stripeReceiptEmail: payerEmail,
      });
      console.log(`[stripeWebhookReal] v5 EPR_PAYER_EMAIL_UPDATED eprId=${epr.id} email=${payerEmail}`);
    }
  } catch (e) {
    console.warn(`[stripeWebhookReal] v5 EPR update failed pi=${piId}:`, e?.message);
  }

  // CAS 2 — Ticket : status=paid + incrémenter config
  try {
    const tickets = await service.entities.Ticket
      .filter({ stripePaymentIntentId: piId }).catch(() => []);
    const ticket = tickets?.[0];
    if (ticket && ticket.status !== 'paid') {
      const nowIso = new Date().toISOString();
      await service.entities.Ticket.update(ticket.id, {
        status:         'paid',
        capturedAt:     nowIso,
        stripeChargeId: chargeId || null,
        buyerEmail:     ticket.buyerEmail || payerEmail || null,
        buyerName:      ticket.buyerName  || payerName  || null,
      });
      console.log(
        `[stripeWebhookReal] v5 TICKET_PAID ticketId=${ticket.id} ` +
        `eventId=${ticket.eventId} chargeId=${chargeId}`
      );

      const configs = await service.entities.EventTicketConfig
        .filter({ eventId: ticket.eventId }).catch(() => []);
      const config = configs?.[0];
      if (config) {
        const newSoldCount    = (Number(config.soldCount)       || 0) + 1;
        const newTotalRevenue = Math.round(
          ((Number(config.totalTicketRevenue) || 0) + (Number(ticket.ticketPrice) || 0)) * 100
        ) / 100;
        await service.entities.EventTicketConfig.update(config.id, {
          soldCount:          newSoldCount,
          totalTicketRevenue: newTotalRevenue,
        });
        console.log(
          `[stripeWebhookReal] v5 TICKET_CONFIG_UPDATED configId=${config.id} ` +
          `soldCount=${newSoldCount} totalRevenue=${newTotalRevenue}`
        );
      }
    }
  } catch (e) {
    console.warn(`[stripeWebhookReal] v5 Ticket update failed pi=${piId}:`, e?.message);
  }
}

// ── Handler : invoice.payment_succeeded (v6 NOUVEAU) ─────────────────────────
// Déclenché sur chaque renouvellement d'abonnement Stripe payé avec succès.
// DISTINCT de payment_intent.succeeded : invoice.subscription est accessible ici.
// Deux actions :
//   1. Copier metadata Subscription → PaymentIntent (traçabilité Stripe RAW)
//   2. Écrire FinancialLedger subscription_revenue (traçabilité P&L)
async function handleInvoicePaymentSucceeded(invoice, service, stripe) {
  // Guard : ne traiter que les invoices liées à un abonnement
  if (!invoice.subscription || !invoice.payment_intent) {
    console.log(`[stripeWebhookReal] v6 invoice.payment_succeeded — pas d'abonnement ou pas de PI, ignoré`);
    return;
  }

  // Charger la Subscription pour lire ses metadata (plan, subscriberId)
  let subscription = null;
  try {
    subscription = await stripe.subscriptions.retrieve(invoice.subscription);
  } catch (e) {
    console.warn(`[stripeWebhookReal] v6 subscription retrieve failed sub=${invoice.subscription}:`, e?.message);
    return; // sans subscription, on ne peut pas enrichir les metadata
  }

  const plan         = subscription.metadata?.plan         ?? 'unknown';
  const subscriberId = subscription.metadata?.subscriberId ?? '';

  // ── ACTION 1 : Copier metadata sur le PaymentIntent ──────────────────────
  // Ces metadata apparaîtront dans le Stripe RAW (balance_history) de l'export.
  // revenueType="subscription_saas" permet de distinguer abonnements vs événements
  // dans tous les états financiers construits depuis Stripe.
  try {
    await stripe.paymentIntents.update(invoice.payment_intent, {
      metadata: {
        revenueType:  'subscription_saas',
        plan,
        subscriberId,
        platform:     'microrave',
        invoiceId:    invoice.id,
        periodStart:  new Date(invoice.period_start * 1000).toISOString(),
        periodEnd:    new Date(invoice.period_end   * 1000).toISOString(),
      },
    });
    console.log(
      `[stripeWebhookReal] v6 PI_METADATA_UPDATED pi=${invoice.payment_intent} ` +
      `plan=${plan} subscriberId=${subscriberId}`
    );
  } catch (e) {
    // Non-fatal : la metadata est utile pour les exports mais pas critique pour le flux
    console.warn(`[stripeWebhookReal] v6 PI metadata update failed pi=${invoice.payment_intent}:`, e?.message);
  }

  // ── ACTION 2 : FinancialLedger subscription_revenue (double-entry) ────────
  // Dr stripe_balance (actif — argent reçu) → Cr revenue_subscription (revenu SaaS)
  // Idempotence : guard stripeRef + entryType avant écriture.
  // Non-fatal : un échec ledger ne bloque jamais le webhook.
  if (invoice.amount_paid > 0) {
    try {
      const existing = await service.entities.FinancialLedger
        .filter({
          stripeRef:   invoice.payment_intent,
          entryType:   'subscription_revenue',
          debitCredit: 'debit',
        })
        .catch(() => []);

      if (existing?.length > 0) {
        console.log(`[FinancialLedger] SKIP idempotent subscription_revenue pi=${invoice.payment_intent}`);
      } else {
        const nowIso = new Date().toISOString();
        const note   = `Abonnement SaaS — plan=${plan} invoiceId=${invoice.id} ${(invoice.amount_paid / 100).toFixed(2)}$ CAD`;

        const debitEntry = await service.entities.FinancialLedger.create({
          entryType:    'subscription_revenue',
          debitCredit:  'debit',
          accountCode:  'stripe_balance',
          amount_cents: invoice.amount_paid,   // natif Stripe — déjà en centimes
          currency:     'CAD',
          stripeRef:    invoice.payment_intent,
          payerUserId:  subscriberId || null,
          note:         `${note} [Dr stripe_balance]`,
          createdAt:    nowIso,
        });

        const creditEntry = await service.entities.FinancialLedger.create({
          entryType:      'subscription_revenue',
          debitCredit:    'credit',
          accountCode:    'revenue_subscription',
          amount_cents:   invoice.amount_paid,
          currency:       'CAD',
          stripeRef:      invoice.payment_intent,
          payerUserId:    subscriberId || null,
          relatedEntryId: debitEntry?.id || null,
          note:           `${note} [Cr revenue_subscription]`,
          createdAt:      nowIso,
        });

        // Lier la contrepartie sur le debit
        if (debitEntry?.id && creditEntry?.id) {
          await service.entities.FinancialLedger.update(debitEntry.id, {
            relatedEntryId: creditEntry.id,
          }).catch(() => null);
        }

        console.log(
          `[FinancialLedger] WRITTEN subscription_revenue ` +
          `amount_cents=${invoice.amount_paid} pi=${invoice.payment_intent} plan=${plan}`
        );
      }
    } catch (e) {
      console.warn(`[stripeWebhookReal] v6 FinancialLedger write failed (non-fatal) pi=${invoice.payment_intent}:`, e?.message);
    }
  }

  console.log(
    `[stripeWebhookReal] v6 INVOICE_PAYMENT_SUCCEEDED invoiceId=${invoice.id} ` +
    `pi=${invoice.payment_intent} plan=${plan} amount=${(invoice.amount_paid / 100).toFixed(2)}$`
  );
}

// ── Serveur principal ─────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'), { apiVersion: '2024-06-20' });

  const body          = await req.text();
  const sig           = req.headers.get('stripe-signature');
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');

  let event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, sig, webhookSecret);
  } catch (err) {
    console.error('[stripeWebhookReal] Signature invalide:', err.message);
    return json(400, { error: `Webhook signature verification failed: ${err.message}` });
  }

  const base44  = createClientFromRequest(req);
  const service = base44.asServiceRole;
  const obj     = event.data?.object;

  try {
    switch (event.type) {

      // ── Escrow / PaymentIntent (v1 inchangé) ──────────────────────────────
      case 'payment_intent.amount_capturable_updated': {
        const piId = obj?.id;
        if (piId) {
          const events = await service.entities.Event.filter({ stripePaymentIntentId: piId });
          const ev = events?.[0];
          if (ev) {
            await base44.functions.invoke('transitionEscrowStatus', {
              eventId: ev.id, fromStatus: ev.escrowStatus || 'securing', toStatus: 'secured',
              reason: 'webhook amount_capturable_updated',
            });
            console.log(`[ESCROW_SECURED] eventId=${ev.id} pi=${piId}`);
          }
        }
        break;
      }

      case 'payment_intent.succeeded': {
        // v5 : PI capturé — maj actualPayerEmail sur EPR + Ticket.status=paid
        await handlePaymentIntentSucceeded(obj, service, stripe);
        break;
      }

      case 'payment_intent.payment_failed': {
        const piId = obj?.id;
        if (piId) {
          const events = await service.entities.Event.filter({ stripePaymentIntentId: piId });
          const ev = events?.[0];
          if (ev) {
            await base44.functions.invoke('transitionEscrowStatus', {
              eventId: ev.id, fromStatus: ev.escrowStatus || 'securing', toStatus: 'none',
              reason: 'webhook payment_failed',
            });
          }
        }
        break;
      }

      // ── Connect KYC (v2 inchangé) ─────────────────────────────────────────
      case 'account.updated': {
        const account     = obj;
        const metaUserId  = account?.metadata?.microrave_userId;
        if (!metaUserId) break;

        const chargesOk      = account.charges_enabled === true;
        const payoutsOk      = account.payouts_enabled === true;
        const disabledReason = account.requirements?.disabled_reason;
        let newStatus = chargesOk && payoutsOk ? 'active' : disabledReason ? 'restricted' : 'pending';

        const profiles = await service.entities.TalentProfile.filter({ userId: metaUserId }).catch(() => []);
        const profile  = profiles?.[0];
        if (profile && profile.stripeConnectOnboardingStatus !== newStatus) {
          await service.entities.TalentProfile.update(profile.id, {
            stripeConnectOnboardingStatus: newStatus,
            ...(profile.stripeConnectAccountId ? {} : { stripeConnectAccountId: account.id }),
          });
          console.log(`[CONNECT_STATUS_SYNCED] userId=${metaUserId} ${profile.stripeConnectOnboardingStatus} → ${newStatus}`);
        }
        break;
      }

      // ── Subscriptions (v3/v4 inchangés) ──────────────────────────────────
      case 'checkout.session.completed':
        if (obj.mode === 'subscription') {
          await handleCheckoutCompleted(obj, service, stripe);
        }
        break;

      case 'customer.subscription.created':
        // v4 FIX : ne pas appeler handleCheckoutCompleted ici.
        // checkout.session.completed est le handler canonique et arrive toujours après.
        // subscription.created arrive quelques ms AVANT checkout.session.completed
        // → race condition → doublons UserMembership malgré le guard d'idempotence.
        // Ce handler est conservé pour le logging uniquement.
        console.log(
          `[SUBSCRIPTION_CREATED] subId=${obj.id} userId=${obj.metadata?.microrave_userId} ` +
          `status=${obj.status} plan=${obj.metadata?.planSku} — traitement délégué à checkout.session.completed`
        );
        break;

      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(obj, service, stripe);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(obj, service);
        break;

      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(obj, service);
        break;

      // ── Abonnements SaaS — traçabilité financière (v6 NOUVEAU) ───────────
      case 'invoice.payment_succeeded':
        await handleInvoicePaymentSucceeded(obj, service, stripe);
        break;

      default:
        console.log(`[stripeWebhookReal] Event ignoré: ${event.type}`);
    }
  } catch (err) {
    console.error(`[stripeWebhookReal] Erreur traitement ${event.type}:`, err.message);
    return json(200, { received: true, warning: err.message });
  }

  return json(200, { received: true });
});