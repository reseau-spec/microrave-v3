/**
 * MICRO RAVE V3 — components/engagement/ActionsSidebar.jsx v2
 * ============================================================
 * Sidebar d'actions contextuelles par état d'engagement.
 *
 * ── CHANGEMENTS v1 → v2 (26 mai 2026 — hotfix) ──────────────
 *
 * Le bouton "Payer la balance" est désormais conditionnel à
 * l'absence d'un EPR balance succeeded. Si la balance est déjà
 * encaissée, on affiche un badge "Balance encaissée" + le bouton
 * "Sceller l'événement" en mode mis en valeur.
 *
 * Évite le scénario du 26 mai : re-clic sur "Payer balance" après
 * paiement réussi crée un EPR pending fantôme qui bloque ensuite
 * le BalancePaymentGuard au scellement.
 *
 * Le composant interroge directement base44.entities.EventPaymentRequest
 * (utilisé déjà côté PolicyDashboard, pattern validé).
 *
 * ── MAPPING ÉTAT → ACTION (inchangé) ────────────────────────
 *
 *   placed / accepted / deposit_pending
 *     → "Payer le dépôt"           → initiateDepositPayment
 *
 *   deposit_secured
 *     → "Payer la balance"         → initiateBalancePayment
 *     → "Sceller l'événement"      → transitionEngagement(event_sealed)
 *       (en mode pilote : SoloFounderOverride autorise sans balance)
 *
 *   event_sealed
 *     → "Copier le lien check-in"  → clipboard (envoyer au talent)
 *
 *   performed / event_completed
 *     → "Aller à la complétion"    → navigate /completion/:id
 *
 *   payable
 *     → "Déclencher le règlement"  → executePayoutTransfer
 *
 *   settled
 *     → "Archiver l'engagement"    → recognizeRevenue
 *
 *   archived / cancelled_* / refunded / no_show
 *     → état terminal — aucun bouton
 *
 * Source : D-038, D-101, OS V15, cycle UX complet 26-05-2026
 * ============================================================
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useToast } from '@/components/ui/use-toast';
import {
  CreditCard, Lock, Link2, ArrowRight, DollarSign,
  Archive, Loader2, CheckCircle2, AlertCircle, Copy,
} from 'lucide-react';

// ── Tokens visuels (alignés avec EngagementView) ─────────────
const T = {
  bg:       '#0a0a0f',
  surface:  '#12121a',
  surface2: '#0f0f18',
  border:   '#1e1e2e',
  accent:   '#7c3aed',
  neon:     '#a78bfa',
  text:     '#e2e8f0',
  muted:    '#64748b',
  success:  '#10b981',
  warning:  '#f59e0b',
  error:    '#ef4444',
  deposit:  '#2563eb',
  payout:   '#059669',
  archive:  '#6b7280',
};

const s = {
  sectionLabel: {
    fontSize: '10px', letterSpacing: '0.3em', textTransform: 'uppercase',
    color: T.accent, fontWeight: 600, marginBottom: '16px',
  },
  cta: {
    width: '100%', padding: '13px', borderRadius: '6px', border: 'none',
    fontSize: '12px', letterSpacing: '0.15em', textTransform: 'uppercase',
    fontWeight: 600, cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    gap: '8px', fontFamily: "'DM Mono', monospace",
    marginTop: '12px', transition: 'opacity 0.2s',
  },
  ctaDisabled: { opacity: 0.5, cursor: 'not-allowed' },
  ctaPay:      { background: T.deposit, color: 'white' },
  ctaBalance:  { background: T.warning, color: '#1a0f00' },
  ctaSeal:     { background: T.accent, color: 'white' },
  ctaLink:     { background: T.border, color: T.text, border: `1px solid ${T.neon}33` },
  ctaPerform:  { background: T.success, color: 'white' },
  ctaPayout:   { background: T.payout, color: 'white' },
  ctaArchive:  { background: T.archive, color: 'white' },
  ctaSecondary:{ background: T.border, color: T.text },
  notice: (color) => ({
    fontSize: '12px', color, textAlign: 'center',
    marginTop: '12px', padding: '10px',
    background: `${color}11`, borderRadius: '6px',
    border: `1px solid ${color}33`,
    lineHeight: 1.5,
  }),
  warningLine: {
    fontSize: '11px', color: T.warning, marginTop: '8px',
    padding: '8px 10px', background: `${T.warning}11`,
    border: `1px solid ${T.warning}33`, borderRadius: '4px',
    lineHeight: 1.4,
  },
};

export default function ActionsSidebar({ engagement, isOrganizer, isTalent, onActionDone }) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [busy, setBusy] = useState(null); // identifiant de l'action en cours

  const engagementId = engagement?.systemId;
  const status       = engagement?.status;
  const depositCents = engagement?.depositCents || 0;
  const balanceCents = engagement?.balanceCents || 0;

  // ── HOTFIX v2 : détecter si la balance est déjà encaissée ──
  // On lit directement EventPaymentRequest pour ne pas dépendre
  // d'une éventuelle non-mise-à-jour d'engagement.status après
  // webhook (l'engagement reste en deposit_secured même après
  // balance encaissée, jusqu'au scellement manuel).
  const [balancePaidEpr, setBalancePaidEpr] = useState(null);
  const [balanceCheckLoading, setBalanceCheckLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function checkBalanceStatus() {
      // Pas besoin de check pour les états où la balance n'est pas pertinente
      if (!engagementId) return;
      if (!['deposit_secured', 'event_sealed', 'performed', 'event_completed',
            'sots_window_closed', 'contestation_window', 'payable', 'settled', 'archived']
          .includes(status)) return;

      setBalanceCheckLoading(true);
      try {
        const eprs = await base44.entities.EventPaymentRequest.filter({
          engagementId,
          phase: 'balance',
        }, '-created_date', 20);

        if (cancelled) return;

        const paid = (eprs || []).find(e =>
          e.status === 'succeeded' || e.status === 'completed'
        );
        setBalancePaidEpr(paid || null);
      } catch (_) {
        // Silencieux : si erreur, on garde l'état précédent (mieux
        // que de masquer le bouton à tort).
      } finally {
        if (!cancelled) setBalanceCheckLoading(false);
      }
    }
    checkBalanceStatus();
    return () => { cancelled = true; };
  }, [engagementId, status]);

  // ── Helper d'invocation avec gestion d'erreur uniforme ───
  async function invokeWithUI(actionKey, fn, successMsg) {
    if (busy) return;
    setBusy(actionKey);
    try {
      const result = await fn();
      if (successMsg) toast({ title: '✓ ' + successMsg });
      if (onActionDone) await onActionDone(result);
      return result;
    } catch (err) {
      toast({
        title:       'Action échouée',
        description: err.message || String(err),
        variant:     'destructive',
      });
      throw err;
    } finally {
      setBusy(null);
    }
  }

  // ── Action : payer le dépôt ───────────────────────────────
  async function handlePayDeposit() {
    await invokeWithUI('pay-deposit', async () => {
      const res = await base44.functions.invoke('initiateDepositPayment', {
        engagementId,
        successUrl: `${window.location.origin}/engagement/${engagementId}?payment=success`,
        cancelUrl:  `${window.location.origin}/engagement/${engagementId}?payment=cancelled`,
      });
      if (!res?.data?.checkoutUrl) {
        throw new Error(res?.data?.error || 'Checkout URL manquante — vérifier STRIPE_SECRET_KEY dans Base44');
      }
      window.location.href = res.data.checkoutUrl;
    });
  }

  // ── Action : payer la balance ─────────────────────────────
  async function handlePayBalance() {
    await invokeWithUI('pay-balance', async () => {
      const res = await base44.functions.invoke('initiateBalancePayment', {
        engagementId,
        successUrl: `${window.location.origin}/engagement/${engagementId}?payment=success&phase=balance`,
        cancelUrl:  `${window.location.origin}/engagement/${engagementId}?payment=cancelled&phase=balance`,
      });

      // HOTFIX v2 : initiateBalancePayment v2 retourne alreadyPaid si
      // la balance est déjà encaissée. On rafraîchit l'état sans redirection.
      if (res?.data?.alreadyPaid) {
        toast({
          title:       '✓ Balance déjà encaissée',
          description: res.data.message || 'Vous pouvez sceller l\'événement.',
        });
        // Marquer localement comme payée pour rafraîchir l'UI immédiatement
        setBalancePaidEpr({ systemId: res.data.eprId, status: 'succeeded' });
        return;
      }

      if (!res?.data?.checkoutUrl) {
        throw new Error(res?.data?.error || 'Checkout URL balance manquante');
      }
      window.location.href = res.data.checkoutUrl;
    });
  }

  // ── Action : sceller l'événement ──────────────────────────
  async function handleSeal() {
    if (!confirm("Sceller l'événement ? Les conditions deviendront immuables. Cette action est définitive.")) return;
    await invokeWithUI('seal', async () => {
      const res = await base44.functions.invoke('transitionEngagement', {
        engagementId,
        targetState: 'event_sealed',
        context: { sealedByOrganizer: true },
      });
      if (!res?.data?.success) {
        throw new Error(res?.data?.error || 'Scellement refusé');
      }
      return res.data;
    }, 'Événement scellé');
  }

  // ── Action : copier le lien check-in talent ───────────────
  async function handleCopyCheckinLink() {
    const url = `${window.location.origin}/checkin/${engagementId}`;
    try {
      await navigator.clipboard.writeText(url);
      toast({
        title:       '✓ Lien copié',
        description: 'Envoyez ce lien au talent par message ou email.',
      });
    } catch (_) {
      // Fallback si clipboard refusé
      prompt('Copiez ce lien pour le talent :', url);
    }
  }

  // ── Action : déclencher le payout ─────────────────────────
  async function handleTriggerPayout() {
    if (!confirm(`Déclencher le règlement du talent ? ${balanceCents > 0 ? '' : ''}Cette action transfère les fonds via Stripe et est irréversible.`)) return;
    await invokeWithUI('payout', async () => {
      const res = await base44.functions.invoke('executePayoutTransfer', {
        engagementId,
      });
      if (!res?.data?.ok) {
        const reason = res?.data?.blockReason
          ? `${res.data.blockReason}: ${res.data.error}`
          : (res?.data?.error || 'Payout refusé');
        throw new Error(reason);
      }
      return res.data;
    }, 'Règlement exécuté');
  }

  // ── Action : archiver + reconnaître revenu ────────────────
  async function handleArchive() {
    if (!confirm("Archiver l'engagement et reconnaître le revenu Micro Rave ? Action définitive.")) return;
    await invokeWithUI('archive', async () => {
      const res = await base44.functions.invoke('recognizeRevenue', {
        engagementId,
      });
      if (!res?.data?.ok) {
        throw new Error(res?.data?.error || 'Archivage refusé');
      }
      return res.data;
    }, 'Engagement archivé — revenu reconnu');
  }

  // ── Action talent : marquer la prestation effectuée ──────
  async function handleMarkPerformed() {
    if (!confirm("Confirmer que la prestation a été effectuée ? Le contrat passera en état 'performed' et l'organisateur pourra valider la complétion.")) return;
    await invokeWithUI('mark-performed', async () => {
      const res = await base44.functions.invoke('transitionEngagement', {
        engagementId,
        targetState: 'performed',
        context: { confirmedByTalent: true },
      });
      if (!res?.data?.success) {
        throw new Error(res?.data?.error || 'Transition refusée');
      }
      return res.data;
    }, 'Prestation confirmée');
  }

  // ── Rendu : aucune action si pas d'engagement ─────────────
  if (!engagement) return null;

  // ── Rendu par état ────────────────────────────────────────

  const canPayDeposit = ['placed', 'accepted', 'deposit_pending'].includes(status) && isOrganizer;
  // D-145 Option A (27 mai 2026) : guard bloquant strict.
  // canPayBalance : bouton visible si balance non encore encaissée.
  // canSeal : conditionné à la balance encaissée (D-145).
  //   Si balanceCents === 0 (dépôt couvre 100%), scellement sans EPR balance autorisé.
  //   Si balanceCheckLoading : canSeal = false pour éviter scellement pendant vérification.
  const canPayBalance = status === 'deposit_secured' && isOrganizer && balanceCents > 0 && !balancePaidEpr && !balanceCheckLoading;
  const balanceRequiredAndPaid = balanceCents <= 0 || !!balancePaidEpr;
  const canSeal       = status === 'deposit_secured' && isOrganizer && balanceRequiredAndPaid && !balanceCheckLoading;
  const canCopyLink   = status === 'event_sealed' && isOrganizer;
  const canMarkPerformed = status === 'event_sealed' && (isTalent || isOrganizer);
  const canGotoCompletion= ['performed', 'event_completed'].includes(status) && isOrganizer;
  const canTriggerPayout = status === 'payable' && isOrganizer;
  const canArchive    = status === 'settled' && isOrganizer;

  const isTerminal = ['archived', 'refunded', 'no_show', 'cancelled_J7', 'cancelled_J30', 'deposit_failed'].includes(status);

  return (
    <>
      <div style={s.sectionLabel}>Actions</div>

      {/* ── placed / accepted / deposit_pending : payer dépôt */}
      {canPayDeposit && (
        <button
          style={{ ...s.cta, ...s.ctaPay, ...(busy === 'pay-deposit' ? s.ctaDisabled : {}) }}
          onClick={handlePayDeposit}
          disabled={busy === 'pay-deposit'}
        >
          {busy === 'pay-deposit'
            ? <><Loader2 size={14} className="animate-spin" /> Redirection…</>
            : <><CreditCard size={14} /> {status === 'deposit_pending' ? 'Relancer le paiement' : 'Payer le dépôt'} {depositCents > 0 ? `(${(depositCents/100).toFixed(0)} $)` : ''}</>
          }
        </button>
      )}

      {/* ── deposit_secured : payer balance puis sceller */}
      {canPayBalance && (
        <button
          style={{ ...s.cta, ...s.ctaBalance, ...(busy === 'pay-balance' ? s.ctaDisabled : {}) }}
          onClick={handlePayBalance}
          disabled={busy === 'pay-balance'}
        >
          {busy === 'pay-balance'
            ? <><Loader2 size={14} className="animate-spin" /> Redirection…</>
            : <><DollarSign size={14} /> Payer la balance ({(balanceCents/100).toFixed(0)} $)</>
          }
        </button>
      )}

      {canSeal && (
        <>
          {/* HOTFIX v2 : badge si balance déjà encaissée */}
          {balancePaidEpr && (
            <div style={{
              fontSize: '11px', color: T.success,
              padding: '8px 10px', marginBottom: '8px',
              background: `${T.success}11`,
              border: `1px solid ${T.success}33`,
              borderRadius: '4px',
              display: 'flex', alignItems: 'center', gap: '6px',
            }}>
              <CheckCircle2 size={12} />
              <span>Balance encaissée — prêt à sceller</span>
            </div>
          )}
          {balanceCheckLoading && !balancePaidEpr && (
            <div style={{
              fontSize: '11px', color: T.muted,
              padding: '6px 0', marginBottom: '4px',
              display: 'flex', alignItems: 'center', gap: '6px',
            }}>
              <Loader2 size={11} className="animate-spin" />
              <span>Vérification de la balance…</span>
            </div>
          )}

          <button
            style={{ ...s.cta, ...s.ctaSeal, ...(busy === 'seal' ? s.ctaDisabled : {}) }}
            onClick={handleSeal}
            disabled={busy === 'seal'}
          >
            {busy === 'seal'
              ? <><Loader2 size={14} className="animate-spin" /> Scellement…</>
              : <><Lock size={14} /> Sceller l'événement</>
            }
          </button>
          {/* D-145 : message retiré — canSeal conditionne déjà le bouton */}
        </>
      )}

      {/* ── event_sealed : copier lien check-in + transition performed */}
      {canCopyLink && (
        <button
          style={{ ...s.cta, ...s.ctaLink }}
          onClick={handleCopyCheckinLink}
        >
          <Copy size={14} /> Copier le lien check-in talent
        </button>
      )}

      {canMarkPerformed && (
        <button
          style={{ ...s.cta, ...s.ctaPerform, ...(busy === 'mark-performed' ? s.ctaDisabled : {}) }}
          onClick={handleMarkPerformed}
          disabled={busy === 'mark-performed'}
        >
          {busy === 'mark-performed'
            ? <><Loader2 size={14} className="animate-spin" /> Validation…</>
            : <><CheckCircle2 size={14} /> Confirmer prestation effectuée</>
          }
        </button>
      )}

      {/* ── performed / event_completed : aller à la complétion */}
      {canGotoCompletion && (
        <button
          style={{ ...s.cta, ...s.ctaSecondary }}
          onClick={() => navigate(`/completion/${engagementId}`)}
        >
          <ArrowRight size={14} /> Aller à la complétion / SOTS
        </button>
      )}

      {/* ── payable : déclencher payout */}
      {canTriggerPayout && (
        <button
          style={{ ...s.cta, ...s.ctaPayout, ...(busy === 'payout' ? s.ctaDisabled : {}) }}
          onClick={handleTriggerPayout}
          disabled={busy === 'payout'}
        >
          {busy === 'payout'
            ? <><Loader2 size={14} className="animate-spin" /> Transfert Stripe…</>
            : <><DollarSign size={14} /> Déclencher le règlement talent</>
          }
        </button>
      )}

      {/* ── settled : archiver + reconnaître revenu */}
      {canArchive && (
        <button
          style={{ ...s.cta, ...s.ctaArchive, ...(busy === 'archive' ? s.ctaDisabled : {}) }}
          onClick={handleArchive}
          disabled={busy === 'archive'}
        >
          {busy === 'archive'
            ? <><Loader2 size={14} className="animate-spin" /> Archivage…</>
            : <><Archive size={14} /> Archiver l'engagement</>
          }
        </button>
      )}

      {/* ── États transitoires : notices */}
      {status === 'deposit_pending' && (
        <div style={s.notice(T.warning)}>
          <AlertCircle size={12} />{' '}
          Paiement en attente de confirmation Stripe
        </div>
      )}

      {status === 'deposit_secured' && balanceCheckLoading && (
        <div style={s.notice(T.muted)}>
          <Lock size={12} />{' '}
          Vérification du paiement de la balance…
        </div>
      )}

      {status === 'deposit_secured' && !balanceCheckLoading && !canPayBalance && !canSeal && balanceCents > 0 && !balancePaidEpr && (
        <div style={s.notice(T.warning)}>
          <AlertCircle size={12} />{' '}
          Balance non encaissée — paiement requis avant scellement (D-145)
        </div>
      )}

      {status === 'deposit_secured' && !canPayBalance && !canSeal && (balanceCents <= 0 || !!balancePaidEpr) && (
        <div style={s.notice(T.success)}>
          <Lock size={12} />{' '}
          Dépôt sécurisé — balance encaissée
        </div>
      )}

      {status === 'event_sealed' && !isOrganizer && !isTalent && (
        <div style={s.notice(T.neon)}>
          <Lock size={12} />{' '}
          Événement scellé — en attente de la prestation
        </div>
      )}

      {isTerminal && (
        <div style={s.notice(T.muted)}>
          <CheckCircle2 size={12} />{' '}
          État terminal — aucune action disponible
        </div>
      )}
    </>
  );
}