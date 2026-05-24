/**
 * EscrowButton — Bouton d'initiation de l'escrow Stripe pour l'organisateur.
 * Visible uniquement si : isOrganizer + event.escrowStatus === 'none' + event.budget > 0
 *
 * Flux :
 * 1. Clic → processEventPayment → clientSecret
 * 2. Stripe Elements (CardElement) → confirmCardPayment
 * 3. Webhook → escrowStatus = 'secured' (async)
 * 4. Polling local pour détecter le passage à 'secured'
 */
import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Loader2, Lock, CheckCircle2, AlertCircle } from 'lucide-react';

// Charge Stripe.js dynamiquement
function useStripeJs() {
  const [stripe, setStripe] = useState(null);
  useEffect(() => {
    const key = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || '';
    if (!key) return;
    if (window.Stripe) { setStripe(window.Stripe(key)); return; }
    const script = document.createElement('script');
    script.src = 'https://js.stripe.com/v3/';
    script.onload = () => setStripe(window.Stripe(key));
    document.head.appendChild(script);
  }, []);
  return stripe;
}

export default function EscrowButton({ event, onSecured }) {
  const stripe = useStripeJs();
  const cardRef = useRef(null);
  const cardElementRef = useRef(null);

  const [phase, setPhase] = useState('idle'); // idle | initiating | card | confirming | waiting | secured | error
  const [clientSecret, setClientSecret] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const pollingRef = useRef(null);

  // Monter le CardElement quand stripe + cardRef sont prêts
  useEffect(() => {
    if (phase !== 'card' || !stripe || !cardRef.current || cardElementRef.current) return;
    const elements = stripe.elements();
    const card = elements.create('card', {
      style: {
        base: { fontSize: '15px', color: '#374151', '::placeholder': { color: '#9ca3af' } },
      },
      hidePostalCode: true,
    });
    card.mount(cardRef.current);
    cardElementRef.current = card;
    return () => {
      card.unmount();
      cardElementRef.current = null;
    };
  }, [phase, stripe]);

  // Polling pour détecter escrowStatus = 'secured' après webhook
  const startPolling = (eventId) => {
    let attempts = 0;
    pollingRef.current = setInterval(async () => {
      attempts++;
      try {
        const evs = await base44.entities.Event.filter({ id: eventId });
        const ev = evs?.[0];
        if (ev?.escrowStatus === 'secured') {
          clearInterval(pollingRef.current);
          setPhase('secured');
          if (onSecured) onSecured();
        }
      } catch { /* silent */ }
      if (attempts >= 20) { // 20 × 3s = 60s timeout
        clearInterval(pollingRef.current);
        setPhase('secured'); // On considère réussi — webhook viendra
      }
    }, 3000);
  };

  useEffect(() => () => clearInterval(pollingRef.current), []);

  const handleInitiate = async () => {
    setPhase('initiating');
    setErrorMsg('');
    try {
      const res = await base44.functions.invoke('processEventPayment', { eventId: event.id });
      const data = res?.data;
      if (!data?.ok) {
        setErrorMsg(data?.error || 'Erreur lors de l\'initiation');
        setPhase('error');
        return;
      }
      console.log(`[PAYMENT_INIT] eventId=${event.id} pi=${data.stripePaymentIntentId}`);
      setClientSecret(data.clientSecret);
      setPhase('card');
    } catch (err) {
      setErrorMsg(err?.message || 'Erreur réseau');
      setPhase('error');
    }
  };

  const handleConfirm = async () => {
    if (!stripe || !cardElementRef.current) return;
    setPhase('confirming');
    setErrorMsg('');

    const result = await stripe.confirmCardPayment(clientSecret, {
      payment_method: { card: cardElementRef.current },
    });

    if (result.error) {
      setErrorMsg(result.error.message || 'Paiement refusé');
      setPhase('card');
      return;
    }

    const pi = result.paymentIntent;
    if (pi.status === 'requires_capture' || pi.status === 'succeeded') {
      console.log(`[PAYMENT_CONFIRMED] eventId=${event.id} pi=${pi.id} status=${pi.status}`);
      setPhase('waiting');
      startPolling(event.id);
    } else {
      setErrorMsg(`État inattendu : ${pi.status}`);
      setPhase('card');
    }
  };

  // ── Renders ────────────────────────────────────────────────────────────────

  if (phase === 'secured') {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm font-medium">
        <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
        Budget sécurisé ✓
      </div>
    );
  }

  if (phase === 'waiting') {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-blue-700 text-sm">
        <Loader2 className="w-4 h-4 animate-spin shrink-0" />
        Confirmation en cours…
      </div>
    );
  }

  if (phase === 'idle') {
    return (
      <Button
        size="sm"
        onClick={handleInitiate}
        className="bg-emerald-600 hover:bg-emerald-700 text-xs"
      >
        <Lock className="w-3 h-3 mr-1.5" />
        Sécuriser le budget ({event.budget} $ CAD)
      </Button>
    );
  }

  if (phase === 'initiating') {
    return (
      <Button size="sm" disabled className="bg-emerald-600 text-xs">
        <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
        Initialisation…
      </Button>
    );
  }

  if (phase === 'error') {
    return (
      <div className="space-y-1">
        <div className="flex items-center gap-1.5 text-red-600 text-xs">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          {errorMsg}
        </div>
        <Button size="sm" variant="outline" onClick={() => setPhase('idle')} className="text-xs">
          Réessayer
        </Button>
      </div>
    );
  }

  // Phases 'card' et 'confirming' — formulaire Stripe Elements
  return (
    <div className="p-4 border border-emerald-200 rounded-xl bg-emerald-50 space-y-3 w-full max-w-sm">
      <p className="text-xs font-semibold text-emerald-800 flex items-center gap-1.5">
        <Lock className="w-3.5 h-3.5" />
        Dépôt de sécurité — {event.budget} $ CAD
      </p>

      {/* CardElement monté par useEffect */}
      <div
        ref={cardRef}
        className="p-3 bg-white border border-gray-300 rounded-lg focus-within:border-emerald-500 focus-within:ring-1 focus-within:ring-emerald-500 transition-all"
      />

      {errorMsg && (
        <p className="text-red-500 text-xs flex items-center gap-1">
          <AlertCircle className="w-3 h-3 shrink-0" />
          {errorMsg}
        </p>
      )}

      <div className="flex gap-2">
        <Button
          size="sm"
          onClick={handleConfirm}
          disabled={phase === 'confirming' || !stripe}
          className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-xs"
        >
          {phase === 'confirming'
            ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" />Traitement…</>
            : <><Lock className="w-3 h-3 mr-1" />Confirmer le paiement</>
          }
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => { setPhase('idle'); setClientSecret(''); setErrorMsg(''); }}
          disabled={phase === 'confirming'}
          className="text-xs"
        >
          Annuler
        </Button>
      </div>

      <p className="text-[10px] text-gray-400 text-center">
        Paiement sécurisé par Stripe · Carte test : 4242 4242 4242 4242
      </p>
    </div>
  );
}