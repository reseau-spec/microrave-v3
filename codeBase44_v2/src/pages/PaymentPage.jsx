/**
 * PaymentPage — Page publique de paiement du dépôt par payeur externe.
 * Accessible sans connexion via /PaymentPage?token=XXX
 * Flux : getPaymentRequest → initiatePaymentForRequest → Stripe.js → confirmStripePayment
 *
 * FIX: Stripe.js est chargé dès le montage (pas au clic).
 *      Le bouton "Procéder" est désactivé tant que stripe n'est pas prêt.
 */
import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { Loader2, CheckCircle2, AlertCircle, Lock, Calendar, MapPin, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';

// ── Stripe.js loader ────────────────────────────────────────────────────────
// Récupère la clé publique depuis le backend, puis charge Stripe.js.
function useStripeJs() {
  const [stripe, setStripe] = useState(null);

  useEffect(() => {
    let cancelled = false;

    const init = async (key) => {
      if (!key) return;
      const loadStripe = (k) => {
        if (window.Stripe) { if (!cancelled) setStripe(window.Stripe(k)); return; }
        const existing = document.querySelector('script[src="https://js.stripe.com/v3/"]');
        if (existing) {
          existing.addEventListener('load', () => { if (!cancelled && window.Stripe) setStripe(window.Stripe(k)); });
          return;
        }
        const script = document.createElement('script');
        script.src = 'https://js.stripe.com/v3/';
        script.async = true;
        script.onload = () => { if (!cancelled && window.Stripe) setStripe(window.Stripe(k)); };
        document.head.appendChild(script);
      };
      loadStripe(key);
    };

    base44.functions.invoke('getStripePublishableKey', {})
      .then(res => { if (!cancelled) init(res?.data?.publishableKey || ''); })
      .catch(() => {});

    return () => { cancelled = true; };
  }, []);

  return stripe;
}

// ── CardElement Stripe ──────────────────────────────────────────────────────
function CardForm({ stripe, clientSecret, amount, cardholderName, onSuccess, onError }) {
  const amountDisplay = amount > 0 ? Number(amount).toFixed(2) : '—';
  const cardRef = useRef(null);
  const cardElementRef = useRef(null);
  const [processing, setProcessing] = useState(false);
  const [cardError, setCardError] = useState('');

  useEffect(() => {
    if (!stripe || !cardRef.current || cardElementRef.current) return;
    // locale fr-CA : Stripe adapte le format postal au Canada (H2H 2H2)
    const elements = stripe.elements({ locale: 'fr-CA' });
    const card = elements.create('card', {
      style: {
        base: { fontSize: '16px', color: '#1f2937', '::placeholder': { color: '#9ca3af' } },
      },
      // hidePostalCode: false laisse Stripe afficher son propre champ postal.
      // Avec locale fr-CA, ce champ accepte le format canadien alphanumérique.
      hidePostalCode: false,
    });
    card.mount(cardRef.current);
    card.on('change', e => setCardError(e.error?.message || ''));
    cardElementRef.current = card;
    return () => { card.unmount(); cardElementRef.current = null; };
  }, [stripe]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!stripe || !cardElementRef.current) return;
    setProcessing(true);
    setCardError('');

    const result = await stripe.confirmCardPayment(clientSecret, {
      payment_method: {
        card: cardElementRef.current,
        billing_details: {
          // Priorité 1 — nom saisi par le payeur (identité légale vérifiable)
          ...(cardholderName ? { name: cardholderName } : {}),
          address: {
            country: 'CA',  // Force Stripe à traiter les codes postaux comme canadiens (H2H 2H2)
          },
        },
      },
    });

    if (result.error) {
      setCardError(result.error.message || 'Paiement refusé');
      setProcessing(false);
      return;
    }

    const pi = result.paymentIntent;
    if (pi.status === 'requires_capture' || pi.status === 'succeeded') {
      onSuccess(pi.id);
    } else {
      onError(`État inattendu : ${pi.status}`);
      setProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="text-sm font-medium text-gray-700 block mb-2">Informations de carte</label>
        <div
          ref={cardRef}
          className="p-3.5 border border-gray-300 rounded-xl bg-white focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-100 transition-all min-h-[46px]"
        />
        {cardError && (
          <p className="text-red-500 text-xs mt-1.5 flex items-center gap-1">
            <AlertCircle className="w-3 h-3 shrink-0" />
            {cardError}
          </p>
        )}
      </div>

      <Button
        type="submit"
        disabled={processing || !stripe}
        className="w-full bg-indigo-600 hover:bg-indigo-700 h-12 text-base font-semibold"
      >
        {processing
          ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Traitement…</>
          : <><Lock className="w-4 h-4 mr-2" />Payer le dépôt — {amountDisplay} $ CAD</>
        }
      </Button>

      <p className="text-center text-xs text-gray-400 flex items-center justify-center gap-1">
        <Lock className="w-3 h-3" />
        Paiement sécurisé par Stripe · Carte test : 4242 4242 4242 4242
      </p>
    </form>
  );
}

// ── Page principale ─────────────────────────────────────────────────────────
export default function PaymentPage() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token') || '';

  // Stripe chargé dès le montage — ne pas attendre le clic
  const stripe = useStripeJs();

  // phases : loading | invalid | ready | initiating | paying | success | error
  const [phase, setPhase] = useState('loading');
  const [requestData, setRequestData] = useState(null);
  const [eventData, setEventData] = useState(null);
  const [clientSecret, setClientSecret] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Identité du payeur — saisis avant d'ouvrir le formulaire Stripe
  // Priorité 1 — LÉGAL : le nom sur la carte sera le vrai payeur pour tout litige.
  const [cardholderName,  setCardholderName]  = useState('');
  const [cardholderEmail, setCardholderEmail] = useState('');
  const [nameError, setNameError] = useState('');

  useEffect(() => {
    if (!token) { setPhase('invalid'); setErrorMsg('Lien invalide — token manquant'); return; }
    loadRequest();
  }, [token]);

  const loadRequest = async () => {
    try {
      const res = await base44.functions.invoke('getPaymentRequest', { token });
      const data = res?.data;
      if (!data?.ok) {
        setPhase('invalid');
        setErrorMsg(data?.error || 'Lien invalide ou introuvable');
        return;
      }
      if (data.alreadyPaid) {
        setRequestData(data.request);
        setEventData(data.event);
        setPhase('success');
        return;
      }
      setRequestData(data.request);
      setEventData(data.event);
      setPhase('ready');
    } catch (err) {
      setPhase('invalid');
      setErrorMsg(err?.message || 'Erreur de chargement');
    }
  };

  const handleInitiatePayment = async () => {
    // Valider le nom — requis pour l'identité légale du payeur
    if (!cardholderName.trim()) {
      setNameError('Le nom sur la carte est requis.');
      return;
    }
    setNameError('');
    setPhase('initiating');
    try {
      const res = await base44.functions.invoke('initiatePaymentForRequest', {
        token,
        payerName:  cardholderName.trim(),
        payerEmail: cardholderEmail.trim() || undefined,
      });
      const data = res?.data;
      if (!data?.ok) {
        setPhase('error');
        setErrorMsg(data?.error || 'Impossible d\'initier le paiement');
        return;
      }
      setClientSecret(data.clientSecret);
      setPhase('paying');
    } catch (err) {
      setPhase('error');
      setErrorMsg(err?.message || 'Erreur réseau');
    }
  };

  const handlePaymentSuccess = async (paymentIntentId) => {
    try {
      const res = await base44.functions.invoke('confirmStripePayment', { token, paymentIntentId });
      if (res?.data?.ok) {
        setPhase('success');
      } else {
        setPhase('error');
        setErrorMsg(res?.data?.error || 'Erreur de confirmation');
      }
    } catch (err) {
      setPhase('error');
      setErrorMsg(err?.message || 'Erreur lors de la confirmation');
    }
  };

  // ── Phases ────────────────────────────────────────────────────────────────

  if (phase === 'loading') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  if (phase === 'invalid') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-sm w-full bg-white rounded-2xl shadow-md p-8 text-center">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-gray-900 mb-2">Lien invalide</h1>
          <p className="text-gray-500 text-sm">{errorMsg}</p>
        </div>
      </div>
    );
  }

  if (phase === 'success') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-sm w-full bg-white rounded-2xl shadow-md p-8 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-9 h-9 text-green-500" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Paiement reçu ✓</h1>
          <p className="text-gray-500 text-sm mb-4">L'organisateur a été notifié.</p>
          {requestData?.requestedAmount && (
            <div className="py-3 px-4 bg-indigo-50 rounded-xl inline-block">
              <span className="text-2xl font-bold text-indigo-700">{requestData.requestedAmount} $ CAD</span>
            </div>
          )}
          {eventData?.title && (
            <p className="text-gray-600 text-sm mt-4 font-medium">{eventData.title}</p>
          )}
          <p className="text-xs text-gray-400 mt-4 leading-relaxed">
            Votre dépôt est sécurisé par Micro Rave.<br />
            Il sera libéré à la confirmation de l'événement.
          </p>
        </div>
      </div>
    );
  }

  if (phase === 'error') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-sm w-full bg-white rounded-2xl shadow-md p-8 text-center">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-gray-900 mb-2">Une erreur est survenue</h1>
          <p className="text-gray-500 text-sm mb-4">{errorMsg}</p>
          <Button variant="outline" onClick={() => { setPhase('ready'); setErrorMsg(''); setClientSecret(''); }}>
            Réessayer
          </Button>
        </div>
      </div>
    );
  }

  // ── Phase ready / initiating / paying ─────────────────────────────────────
  // v2 — amount est affiché directement dans JSX. Si amount=0 ou undefined,
  // JavaScript JSX affiche "" (chaîne vide) car 0 est falsy → "$ CAD" sans chiffre.
  // On utilise Number() pour s'assurer d'avoir un nombre, et toFixed(2) pour l'affichage.
  const amount = Number(requestData?.requestedAmount) || 0;
  const amountDisplay = amount > 0 ? amount.toFixed(2) : '—';
  const stripeReady = !!stripe;

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white flex items-center justify-center p-4">
      <div className="max-w-md w-full space-y-4">

        {/* Logo / brand */}
        <div className="text-center mb-2">
          <div className="w-10 h-10 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-xl mx-auto mb-2 flex items-center justify-center">
            <Lock className="w-5 h-5 text-white" />
          </div>
          <p className="text-sm font-semibold text-gray-600">Micro Rave · Paiement sécurisé</p>
        </div>

        {/* Carte événement */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="bg-gradient-to-r from-indigo-600 to-purple-600 p-5 text-white">
            <h1 className="text-xl font-bold leading-tight">{eventData?.title || 'Événement'}</h1>
            <div className="flex flex-wrap gap-3 mt-3 text-sm text-indigo-200">
              {eventData?.dateStart && (
                <span className="flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" />
                  {new Date(eventData.dateStart).toLocaleDateString('fr-CA', {
                    weekday: 'long', day: 'numeric', month: 'long',
                  })}
                </span>
              )}
              {eventData?.checkpointName && (
                <span className="flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5" />
                  {eventData.checkpointName}
                </span>
              )}
            </div>
            {eventData?.organizerFirstName && (
              <p className="text-indigo-200 text-sm mt-2">
                Organisé par <strong className="text-white">{eventData.organizerFirstName}</strong>
              </p>
            )}
          </div>

          <div className="p-5 space-y-4">
            {/* Montant */}
            <div className="py-3 px-4 bg-indigo-50 rounded-xl">
              <p className="text-xs text-indigo-400 uppercase tracking-wide mb-1 text-center">
                {requestData?.requestType === 'balance' ? 'Solde à régler (80%)' :
                 requestData?.requestType === 'adjustment' ? 'Ajustement de programme' :
                 'Dépôt de sécurité (20%)'}
              </p>
              <p className="text-3xl font-extrabold text-indigo-700 text-center">{amountDisplay} $ CAD</p>
              {/* Détail frais Stripe — transparence envers le payeur */}
              {requestData?.stripeFeeAmount > 0 && (
                <div className="mt-2 pt-2 border-t border-indigo-100 space-y-0.5">
                  <div className="flex justify-between text-xs text-indigo-400">
                    <span>Montant contractuel</span>
                    <span>{(Number(requestData.netAmount) || (amount - requestData.stripeFeeAmount)).toFixed(2)} $ CAD</span>
                  </div>
                  <div className="flex justify-between text-xs text-indigo-400">
                    <span>Frais de traitement</span>
                    <span>{Number(requestData.stripeFeeAmount).toFixed(2)} $ CAD</span>
                  </div>
                  <div className="flex justify-between text-xs font-semibold text-indigo-600 pt-0.5">
                    <span>Total facturé</span>
                    <span>{amountDisplay} $ CAD</span>
                  </div>
                </div>
              )}
            </div>

            {/* Message organisateur */}
            {requestData?.messageToPayer && (
              <div className="p-3 bg-amber-50 border-l-4 border-amber-300 rounded-r-xl">
                <p className="text-xs text-amber-600 mb-1 font-medium">Message de l'organisateur</p>
                <p className="text-sm text-amber-900 italic">"{requestData.messageToPayer}"</p>
              </div>
            )}

            {/* Note protection */}
            <div className="flex items-start gap-2 p-3 bg-green-50 rounded-xl border border-green-100">
              <Shield className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
              <p className="text-xs text-green-700 leading-relaxed">
                Ce paiement est sécurisé par Micro Rave. Votre argent est protégé jusqu'à la confirmation de l'événement.
              </p>
            </div>

            {/* Expiration */}
            {requestData?.expiresAt && (
              <p className="text-xs text-gray-400 text-center">
                Lien valide jusqu'au{' '}
                {new Date(requestData.expiresAt).toLocaleDateString('fr-CA', {
                  day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
                })}
              </p>
            )}
          </div>
        </div>

        {/* Zone paiement */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          {phase === 'ready' && (
            <div className="space-y-4">
              {/* Identité du payeur — requis pour traçabilité légale */}
              <div className="space-y-3">
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1.5">
                    Nom sur la carte <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Ex : Jacqueline Turde"
                    value={cardholderName}
                    onChange={e => { setCardholderName(e.target.value); setNameError(''); }}
                    className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                    autoComplete="cc-name"
                  />
                  {nameError && (
                    <p className="text-red-500 text-xs mt-1 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3 shrink-0" />
                      {nameError}
                    </p>
                  )}
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1.5">
                    Email pour le reçu <span className="text-gray-400 font-normal">(optionnel)</span>
                  </label>
                  <input
                    type="email"
                    placeholder="votre@email.com"
                    value={cardholderEmail}
                    onChange={e => setCardholderEmail(e.target.value)}
                    className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                    autoComplete="email"
                  />
                </div>
              </div>

              <Button
                onClick={handleInitiatePayment}
                disabled={!stripeReady}
                className="w-full bg-indigo-600 hover:bg-indigo-700 h-12 text-base font-semibold disabled:opacity-60"
              >
                {stripeReady
                  ? <><Lock className="w-4 h-4 mr-2" />Procéder au paiement — {amountDisplay} $ CAD</>
                  : <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Chargement de Stripe…</>
                }
              </Button>
            </div>
          )}

          {phase === 'initiating' && (
            <div className="flex items-center justify-center gap-2 py-4 text-gray-500">
              <Loader2 className="w-5 h-5 animate-spin text-indigo-500" />
              <span className="text-sm">Initialisation du paiement…</span>
            </div>
          )}

          {phase === 'paying' && clientSecret && stripe && (
            <CardForm
              stripe={stripe}
              clientSecret={clientSecret}
              amount={amount}
              cardholderName={cardholderName}
              onSuccess={handlePaymentSuccess}
              onError={(msg) => { setPhase('error'); setErrorMsg(msg); }}
            />
          )}

          {/* Stripe pas encore prêt pendant paying — ne devrait plus arriver */}
          {phase === 'paying' && clientSecret && !stripe && (
            <div className="flex items-center justify-center gap-2 py-4 text-gray-500">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm">Chargement de Stripe…</span>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}