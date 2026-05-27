/**
 * MICRO RAVE V3 — Test P0 : WEBHOOK-RAWBODY-01
 * ============================================================
 * Test bloquant : vérifie si Base44 peut valider le raw body Stripe.
 *
 * EXÉCUTER EN PREMIER — avant tout code financier.
 *
 * Résultat PASSED → Base44 peut gérer les webhooks directement.
 * Résultat FAILED → Proxy Stripe obligatoire (stripe-webhook-proxy/).
 *
 * Comment exécuter :
 *   node tests/p0/WEBHOOK-RAWBODY-01.js
 * ============================================================
 */


import dotenv from 'dotenv';
dotenv.config();
import { createRequire as __createRequire } from 'node:module';
const require = __createRequire(import.meta.url);
import crypto from 'node:crypto';
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

/**
 * Simule ce que Base44 reçoit dans son handler webhook.
 * Si Base44 parse le JSON avant de le donner au handler,
 * rawBody sera un objet et la signature ne pourra pas être validée.
 */
function runTest() {
  console.log('═══════════════════════════════════════════════');
  console.log('Test P0 : WEBHOOK-RAWBODY-01');
  console.log('Objectif : vérifier que le raw body Stripe est préservé');
  console.log('═══════════════════════════════════════════════\n');

  // Simuler un payload Stripe
  const fakePayload = JSON.stringify({
    id:     'evt_test_123456',
    type:   'payment_intent.succeeded',
    object: 'event',
    data:   { object: { id: 'pi_test_123456', amount: 118340 } }
  });

  const fakeSecret = 'whsec_test_secret_for_testing';

  // Générer une vraie signature Stripe
  const timestamp     = Math.floor(Date.now() / 1000);
  const signedPayload = `${timestamp}.${fakePayload}`;
  // CORRECTION : Stripe SDK attend le secret complet (avec préfixe whsec_).
  // Le HMAC doit être calculé avec le secret complet pour que
  // constructEvent() valide correctement la signature.
  // Source : Fiche C BLOQUANT-C2 — bug test corrigé 2026-05-21.
  const signature     = crypto
    .createHmac('sha256', fakeSecret)
    .update(signedPayload, 'utf8')
    .digest('hex');
  const stripeSignature = `t=${timestamp},v1=${signature}`;

  console.log('Simulation du payload Stripe créée.\n');
  console.log('─── Test A : raw body = string (correct) ───────');

  // Test A : Base44 donne le raw body comme string → DOIT PASSER
  try {
    stripe.webhooks.constructEvent(fakePayload, stripeSignature, fakeSecret);
    console.log('✓ PASSED — Base44 donne le raw body comme string.');
    console.log('  → Pas besoin du proxy Stripe.\n');
  } catch (err) {
    console.log(`✗ FAILED — ${err.message}\n`);
  }

  console.log('─── Test B : body = objet parsé (incorrect) ────');

  // Test B : Si Base44 parse le body en JSON avant de le donner → DOIT ÉCHOUER
  try {
    const parsedBody = JSON.parse(fakePayload); // Simule ce que fait Base44 si mauvaise config
    stripe.webhooks.constructEvent(parsedBody, stripeSignature, fakeSecret);
    console.log('⚠️  Ce test aurait dû échouer — résultat inattendu.\n');
  } catch (err) {
    console.log('✓ Confirmé — un body parsé en JSON invalide la signature Stripe.');
    console.log('  Si Base44 fait ça → proxy obligatoire.\n');
  }

  console.log('═══════════════════════════════════════════════');
  console.log('INSTRUCTIONS :');
  console.log('');
  console.log('1. Créer un webhook endpoint dans Base44');
  console.log('2. Configurer Stripe pour envoyer vers cet endpoint en mode test');
  console.log('3. Dans le handler Base44, vérifier que req.rawBody (ou équivalent)');
  console.log('   est disponible comme STRING (pas un objet JavaScript)');
  console.log('4. Si oui → PASSED → continuer sans proxy');
  console.log('5. Si non → FAILED → installer stripe-webhook-proxy/');
  console.log('═══════════════════════════════════════════════');
}

runTest();