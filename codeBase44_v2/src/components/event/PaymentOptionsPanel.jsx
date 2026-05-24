/**
 * PaymentOptionsPanel — Panneau de paiement affiché dans CreateEvent
 * après création si event.budget > 0 et escrowStatus = 'none'.
 *
 * Option A : Je paie moi-même (EscrowButton)
 * Option B : Envoyer demande au payeur externe (sendPaymentRequest)
 */
import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import EscrowButton from './EscrowButton';
import { Send, CheckCircle2, AlertCircle, Loader2, Lock, Users } from 'lucide-react';

export default function PaymentOptionsPanel({ event, onEscrowSecured }) {
  const [mode, setMode] = useState(null); // null | 'self' | 'external'
  const [payerEmail, setPayerEmail] = useState('');
  const [messageToPayer, setMessageToPayer] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  if (!event || !event.budget || event.budget <= 0) return null;
  if (event.escrowStatus && event.escrowStatus !== 'none') return null;

  const depositAmount = Math.round(event.budget * 0.20 * 100) / 100;

  const handleSendRequest = async (e) => {
    e.preventDefault();
    if (!payerEmail.trim() || !payerEmail.includes('@')) {
      setError('Email invalide');
      return;
    }
    setSending(true);
    setError('');
    try {
      const res = await base44.functions.invoke('sendPaymentRequest', {
        eventId: event.id,
        payerEmail: payerEmail.trim(),
        messageToPayer: messageToPayer.trim() || '',
      });
      const data = res?.data;
      if (!data?.ok) {
        setError(data?.error || 'Erreur lors de l\'envoi');
        return;
      }
      setSent(true);
    } catch (err) {
      setError(err?.message || 'Erreur réseau');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="rounded-2xl border-2 border-indigo-100 bg-indigo-50/40 p-5 space-y-4">
      <div>
        <p className="text-sm font-semibold text-indigo-900 mb-0.5">
          💰 Sécuriser le budget de l'événement
        </p>
        <p className="text-xs text-indigo-600">
          Dépôt requis : <strong>{depositAmount} $ CAD</strong> (20% de {event.budget} $)
        </p>
      </div>

      {/* Choix du mode */}
      {!mode && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setMode('self')}
            className="p-4 rounded-xl border-2 border-indigo-200 bg-white hover:border-indigo-400 hover:bg-indigo-50 transition-all text-left group"
          >
            <Lock className="w-5 h-5 text-indigo-500 mb-2" />
            <p className="text-sm font-semibold text-gray-800">Je paie moi-même</p>
            <p className="text-xs text-gray-500 mt-0.5">Carte bancaire via Stripe</p>
          </button>

          <button
            type="button"
            onClick={() => setMode('external')}
            className="p-4 rounded-xl border-2 border-purple-200 bg-white hover:border-purple-400 hover:bg-purple-50 transition-all text-left group"
          >
            <Users className="w-5 h-5 text-purple-500 mb-2" />
            <p className="text-sm font-semibold text-gray-800">Envoyer à un payeur</p>
            <p className="text-xs text-gray-500 mt-0.5">Lien sécurisé par email</p>
          </button>
        </div>
      )}

      {/* Option A — paiement direct */}
      {mode === 'self' && (
        <div className="space-y-3">
          <EscrowButton
            event={event}
            onSecured={() => { if (onEscrowSecured) onEscrowSecured(); }}
          />
          <button
            type="button"
            onClick={() => setMode(null)}
            className="text-xs text-gray-400 hover:text-gray-600 underline"
          >
            ← Autre option
          </button>
        </div>
      )}

      {/* Option B — payeur externe */}
      {mode === 'external' && (
        <div className="space-y-3">
          {sent ? (
            <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-xl text-green-700 text-sm">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>Demande envoyée à <strong>{payerEmail}</strong> — lien valide 72h.</span>
            </div>
          ) : (
            <form onSubmit={handleSendRequest} className="space-y-3">
              <div>
                <Label className="text-xs text-gray-600 mb-1 block">Email du payeur *</Label>
                <Input
                  type="email"
                  placeholder="client@example.com"
                  value={payerEmail}
                  onChange={e => setPayerEmail(e.target.value)}
                  className="text-sm"
                  required
                />
              </div>
              <div>
                <Label className="text-xs text-gray-600 mb-1 block">Message (optionnel)</Label>
                <Input
                  placeholder={`Voici le lien de paiement pour notre événement${event.dateStart ? ' du ' + new Date(event.dateStart).toLocaleDateString('fr-CA', { day: 'numeric', month: 'long' }) : ''}`}
                  value={messageToPayer}
                  onChange={e => setMessageToPayer(e.target.value)}
                  className="text-sm"
                />
              </div>

              <div className="flex items-center gap-2 py-2 px-3 bg-purple-50 rounded-lg">
                <span className="text-xs text-purple-600">
                  Montant calculé automatiquement : <strong>{depositAmount} $ CAD</strong>
                </span>
              </div>

              {error && (
                <div className="flex items-center gap-1.5 text-red-600 text-xs">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  {error}
                </div>
              )}

              <Button
                type="submit"
                disabled={sending}
                className="w-full bg-purple-600 hover:bg-purple-700 text-sm"
              >
                {sending
                  ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Envoi…</>
                  : <><Send className="w-3.5 h-3.5 mr-1.5" />Envoyer la demande</>
                }
              </Button>
            </form>
          )}

          <button
            type="button"
            onClick={() => { setMode(null); setSent(false); setError(''); }}
            className="text-xs text-gray-400 hover:text-gray-600 underline"
          >
            ← Autre option
          </button>
        </div>
      )}
    </div>
  );
}