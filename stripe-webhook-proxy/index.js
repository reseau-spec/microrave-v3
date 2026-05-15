/**
 * MICRO RAVE V3 — Stripe Webhook Proxy
 * ============================================================
 * Ce proxy n'est nécessaire QUE si Base44 ne peut pas valider
 * le raw body Stripe (test WEBHOOK-RAWBODY-01 FAILED).
 *
 * Rôle unique :
 * 1. Recevoir le webhook Stripe avec le raw body intact
 * 2. Valider la signature Stripe
 * 3. Vérifier l'idempotency (éviter le double-traitement)
 * 4. Transmettre SEULEMENT les events validés à Base44
 *
 * Déploiement : Railway / Render / Fly.io (~5$/mois)
 *
 * AVANT D'UTILISER CE FICHIER :
 * Exécuter le test WEBHOOK-RAWBODY-01 dans tests/p0/
 * Si PASSED → ce fichier n'est pas nécessaire.
 * ============================================================
 */

require('dotenv').config();
const express = require('express');
const stripe  = require('stripe')(process.env.STRIPE_SECRET_KEY);

const app  = express();
const PORT = process.env.PROXY_PORT || 3000;

// ── Stockage idempotency (remplacer par database en production) ──
const processedEvents = new Set();

// ── CRITIQUE : express.raw() préserve le body brut ──────────────
// Sans ça, Stripe ne peut pas valider la signature.
app.post('/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const signature = req.headers['stripe-signature'];

  // 1. Valider la signature avec le raw body
  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body,                               // raw body préservé
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error(`[Proxy] Signature invalide : ${err.message}`);
    return res.status(400).json({ error: `Signature invalide : ${err.message}` });
  }

  // 2. Vérifier l'idempotency
  if (processedEvents.has(event.id)) {
    console.log(`[Proxy] Event déjà traité : ${event.id}`);
    return res.status(200).json({ status: 'already_processed', event_id: event.id });
  }

  // 3. Enregistrer AVANT de transmettre (évite double-traitement si crash)
  processedEvents.add(event.id);

  // 4. Transmettre à Base44 seulement les events validés
  try {
    await forwardToBase44(event);
    console.log(`[Proxy] Event transmis : ${event.type} / ${event.id}`);
  } catch (err) {
    console.error(`[Proxy] Erreur transmission Base44 : ${err.message}`);
    // Ne pas retourner d'erreur à Stripe (l'event est bien reçu)
    // Loguer pour retry manuel
  }

  res.status(200).json({ received: true, event_id: event.id, type: event.type });
});

/**
 * Transmet l'event validé à Base44.
 * ── REMPLACER PAR L'ENDPOINT BASE44 RÉEL ────────────────────
 */
async function forwardToBase44(event) {
  const endpoint = process.env.PROXY_BASE44_ENDPOINT;

  if (!endpoint) {
    throw new Error('PROXY_BASE44_ENDPOINT non configuré dans .env');
  }

  const response = await fetch(endpoint, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(event),
  });

  if (!response.ok) {
    throw new Error(`Base44 a retourné ${response.status}`);
  }

  return response.json();
}

// ── Health check ─────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`[Proxy Stripe] En écoute sur le port ${PORT}`);
  console.log(`[Proxy Stripe] Endpoint Base44 : ${process.env.PROXY_BASE44_ENDPOINT || 'NON CONFIGURÉ'}`);
});

module.exports = app;
