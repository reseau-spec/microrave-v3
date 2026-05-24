// deploy: v7
// initiatePaymentForRequest — Crée un Stripe PaymentIntent (capture manuelle) pour la demande externe.
// Input : { token, payerName?, payerEmail? }
//
// CHANGEMENTS v6 — Robustesse + guard amountCents=0 :
//
//   CONFIRMATION : requestedAmount (camelCase) est le bon champ.
//   sendPaymentRequest l'écrit, les 168 paiements réussis l'utilisaient.
//   requested_amount_cents est un champ différent, jamais peuplé.
//
//   FIX :
//   1. try/catch sur le filter() initial → 503 lisible si Base44 rate-limit (429)
//   2. Guard explicite si amountCents=0 → message clair au lieu de crash Stripe 500
//   3. Log v6 pour traçabilité
//
//   PROBLÈME v4 :
//   getPaymentRequest v3 recalcule requestedAmount depuis PriceProposal.rounds
//   et met à jour l'EPR en DB (ex: 0$ → 43.56$).
//   Mais si un PI Stripe existait déjà avec amount=0 (créé avant le recalcul),
//   le chemin idempotence le retournait tel quel → clientSecret pour PI à 0 centimes
//   → Stripe rejette le confirm → 500 "Internal Server Error".
//
//   FIX :
//   Dans le chemin idempotence, comparer existing.amount avec amountCents calculé.
//   Si différent ET le PI est encore annulable (requires_payment_method) :
//     → canceler le vieux PI (non-fatal si échoue)
//     → créer un nouveau PI avec le bon montant
//   Si le PI a déjà été confirmé/capturé (requires_capture, succeeded) :
//     → le retourner tel quel (comportement v4 — ne jamais annuler un PI en cours)
//
// CHANGEMENTS v4 — Rôle contextuel du payeur (modèle prosommateur) :
//
//   PROBLÈME v3 :
//   Le Customer Stripe porte l'identité persistante (userId, platform).
//   Mais le rôle de l'utilisateur dans CETTE transaction était absent.
//   Un même userId peut être organizer sur un dépôt et talent sur un transfer.
//   Sans payerRole, impossible de distinguer les rôles dans les exports Stripe.
//
//   FIX :
//   Ajouter payerRole: "organizer" dans les metadata du PI.
//   Ce champ est contextuel (transactionnel) — pas identitaire.
//   Il documente le rôle joué dans CE paiement spécifique.
//   Le Customer Stripe ne doit PAS porter userType pour cette raison.
//
// CHANGEMENTS v3 — Enrichissement metadata Stripe (traçabilité financière) :
//
// PROBLÈME v2 :
//   Les metadata du PI manquaient de champs critiques pour la production automatique
//   des états financiers (P&L, bilan, cash flow) depuis Stripe sans dépendance au
//   FinancialLedger Base44.
//   - revenueType  absent → impossible de distinguer dépôt / balance / abonnement
//   - eventName    absent → les exports Stripe sont illisibles sans lookup externe
//   - organizerId  absent (0% de remplissage sur toutes les transactions historiques)
//   - depositPct   absent → la règle métier 20/80 n'était pas documentée côté Stripe
//
// FIX v3 :
//   1. Charger l'Event après l'EPR pour accéder à event.title et event.organizerId.
//   2. Ajouter revenueType: "event_deposit" — catégorie de revenu primaire.
//   3. Ajouter eventName depuis event.title — lisibilité des exports.
//   4. Ajouter organizerId depuis event.organizerId — attribution par organisateur.
//   5. Ajouter depositPct: "0.20" — documente la règle métier 20/80 dans Stripe.
//
// HÉRITAGE v2 (conservé intégralement) :
//   - Idempotence sur stripePaymentIntentId existant
//   - receipt_email pour reçu Stripe au vrai payeur
//   - Écriture de actualPayerName + actualPayerEmail sur l'EPR dès la création du PI
//   - Distinction payerEmail (destinataire du lien) vs actualPayerEmail (qui a payé)
//
// METADATA COMPLÈTES v3 :
//   revenueType    → "event_deposit"          (classification revenu — NOUVEAU)
//   depositPct     → "0.20"                   (règle métier documentée — NOUVEAU)
//   eventId        → request.eventId          (déjà présent v2)
//   eventName      → event.title              (lisibilité export — NOUVEAU)
//   organizerId    → event.organizerId        (attribution organisateur — NOUVEAU)
//   requestId      → request.id               (déjà présent v2)
//   platform       → "microrave"              (déjà présent v2)
//   flow           → "external_payer"         (déjà présent v2)
//   payerName      → nom saisi au checkout    (déjà présent v2)
//   payerEmail     → email saisi au checkout  (déjà présent v2)
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
import Stripe from 'npm:stripe@14';

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  // v7 — Try/catch global sur tout le handler.
  try {

  const body = await req.json();
  const { token, payerName, payerEmail: bodyPayerEmail } = body;
  if (!token) return json(400, { error: 'token requis' });

  const rows = await base44.asServiceRole.entities.EventPaymentRequest.filter({ secureToken: token });
  const request = rows?.[0];

  if (!request) return json(200, { ok: false, error: 'Demande introuvable', code: 'NOT_FOUND' });
  if (request.requestStatus === 'approved') return json(200, { ok: false, error: 'Déjà payée', code: 'ALREADY_PAID' });
  if (request.requestStatus === 'rejected' || request.requestStatus === 'expired') {
    return json(200, { ok: false, error: 'Demande non valide', code: request.requestStatus.toUpperCase() });
  }
  if (request.expiresAt && new Date(request.expiresAt) < new Date()) {
    return json(200, { ok: false, error: 'Lien expiré', code: 'EXPIRED' });
  }

  // v3 — Charger l'Event pour accéder à title et organizerId.
  // Non bloquant : si le lookup échoue, les champs tombent en chaîne vide
  // plutôt que de faire échouer le paiement.
  let eventName   = '';
  let organizerId = '';
  if (request.eventId) {
    try {
      const eventRows = await base44.asServiceRole.entities.Event.filter({ id: request.eventId });
      const event = eventRows?.[0];
      if (event) {
        eventName   = event.title ?? event.name ?? '';
        organizerId = event.organizerId ?? '';
      }
    } catch (err) {
      // Dégradation gracieuse — le paiement continue sans ces champs
      console.warn(`[initiatePaymentForRequest] v3 lookup Event ${request.eventId} échoué: ${err?.message}`);
    }
  }

  const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'), { apiVersion: '2024-06-20' });
  const amountCents = Math.round(Number(request.requestedAmount) * 100);

  // Guard: refuser de créer un PI à 0 centime — Stripe le refuserait avec 500.
  // Si 0 ici, getPaymentRequest v4 n'a pas encore recalculé (ex: lien ouvert avant getPaymentRequest).
  if (amountCents === 0) {
    console.warn(`[initiatePaymentForRequest] v6 AMOUNT_ZERO requestId=${request.id}`);
    return json(200, { ok: false, code: 'AMOUNT_ZERO', error: 'Montant non défini. Rechargez la page pour recalculer.' });
  }

  // Idempotence — si un PI valide existe déjà, le retourner
  // v5 : vérifier que le montant correspond. Si le PI existant a un montant
  // différent (ex: 0 centimes créé avant recalcul getPaymentRequest v3),
  // l'annuler et créer un nouveau PI avec le bon montant.
  if (request.stripePaymentIntentId) {
    const existing = await stripe.paymentIntents.retrieve(request.stripePaymentIntentId).catch(() => null);
    if (existing && existing.status !== 'canceled') {
      const piAmountOk = existing.amount === amountCents;
      const piAlreadyActive = ['requires_capture', 'succeeded', 'processing'].includes(existing.status);

      if (piAmountOk || piAlreadyActive) {
        // PI valide avec bon montant, ou déjà en cours de traitement → retourner tel quel
        return json(200, {
          ok: true,
          clientSecret: existing.client_secret,
          amount: request.requestedAmount,
        });
      }

      // PI avec mauvais montant et encore annulable → annuler et recréer
      console.log(`[initiatePaymentForRequest] v5 PI_AMOUNT_MISMATCH existing=${existing.id} existing.amount=${existing.amount} expected=${amountCents} status=${existing.status} — cancel and recreate`);
      await stripe.paymentIntents.cancel(existing.id).catch(e =>
        console.warn(`[initiatePaymentForRequest] v5 cancel old PI failed (non-fatal): ${e?.message}`)
      );
    }
  }

  // Identité du payeur — priorité : données saisies sur la page > payerEmail du lien
  // Ces données vont dans receipt_email et billing_details du PI.
  // Stripe les retourne dans billing_details lors du retrieve() dans confirmStripePayment.
  const resolvedPayerEmail = bodyPayerEmail || request.payerEmail || null;
  const resolvedPayerName  = payerName || null;

  const piParams = {
    amount: amountCents,
    currency: 'cad',
    capture_method: 'manual',
    description: `Dépôt événement Micro Rave — demande #${request.id}`,
    metadata: {
      // --- Classification financière (v3) ---
      revenueType:  'event_deposit',
      depositPct:   '0.20',
      // --- Événement (v3) ---
      eventId:      request.eventId || '',
      eventName:    eventName,
      organizerId:  organizerId,
      // --- Demande de paiement ---
      requestId:    request.id,
      // --- Identité payeur (v2) ---
      payerName:    resolvedPayerName  || '',
      payerEmail:   resolvedPayerEmail || '',
      // --- Rôle contextuel (v4) ---
      // Rôle joué dans CETTE transaction — pas identitaire.
      // Le Customer Stripe (userId) peut être organizer ici et talent ailleurs.
      payerRole:    'organizer',
      // --- Plateforme ---
      platform:     'microrave',
      flow:         'external_payer',
    },
  };
  // Note : payment_method_data.billing_details n'est pas compatible avec capture_method:'manual'
  // sur Stripe. Le nom du payeur est transmis via billing_details dans confirmCardPayment
  // (PaymentPage.jsx CardForm) et lu par confirmStripePayment via payment_method.billing_details.

  // receipt_email déclenche l'envoi du reçu Stripe au vrai payeur
  // et remonte l'email dans billing_details pour confirmStripePayment v8
  if (resolvedPayerEmail) {
    piParams.receipt_email = resolvedPayerEmail;
  }

  const pi = await stripe.paymentIntents.create(piParams);

  // Persister le PI sur la demande
  // v2 : écrire aussi actualPayerName + actualPayerEmail si fournis dès maintenant.
  // confirmStripePayment v8 les enrichira avec les billing_details Stripe vérifiés.
  const eprUpdate = {
    stripePaymentIntentId: pi.id,
    ...(resolvedPayerName  ? { actualPayerName:  resolvedPayerName  } : {}),
    ...(resolvedPayerEmail ? { actualPayerEmail: resolvedPayerEmail, stripeReceiptEmail: resolvedPayerEmail } : {}),
  };
  await base44.asServiceRole.entities.EventPaymentRequest.update(request.id, eprUpdate);

  console.log(`[initiatePaymentForRequest] v7 PI=${pi.id} eventId=${request.eventId || 'none'} amount=${amountCents}`);

  return json(200, {
    ok: true,
    clientSecret: pi.client_secret,
    amount: request.requestedAmount,
  });

  } catch (e) {
    console.error('[initiatePaymentForRequest] v7 FATAL:', e?.message);
    return json(503, { ok: false, error: 'Service temporairement indisponible. Réessayez dans quelques instants.' });
  }
});