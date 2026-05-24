import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useGlobalActions } from '@/contexts/GlobalActionContext';
import { createPageUrl } from '@/utils';
import {
  AlertTriangle, Clock, Lock, CreditCard, ChevronRight, X, Bell
} from 'lucide-react';

// ─── Config des niveaux de priorité ──────────────────────────────────────────
// P1 — Expiration imminente  → rouge      → action immédiate
// P2 — Paiement en attente   → orange     → action requise
// P3 — Escrow en attente     → jaune      → informatif + action
// P4 — Escrow sécurisé       → vert/gris  → confirmatif

function hoursUntil(dateStr) {
  if (!dateStr) return Infinity;
  return (new Date(dateStr) - Date.now()) / (1000 * 60 * 60);
}

function getExpiresIn(event) {
  // Le PI Stripe expire 7 jours après sa création
  const createdAt = event.stripePaymentIntentCreatedAt || event.updated_date;
  if (!createdAt) return null;
  const expiresAt = new Date(new Date(createdAt).getTime() + 7 * 24 * 60 * 60 * 1000);
  const h = hoursUntil(expiresAt.toISOString());
  if (h <= 0) return 'expiré';
  if (h < 1) return `${Math.round(h * 60)} min`;
  if (h < 24) return `${Math.round(h)}h`;
  return `${Math.round(h / 24)}j`;
}

// ─── Composant bannière unique ─────────────────────────────────────────────

function ActionBanner({ level, icon: Icon, color, message, cta, ctaHref, onDismiss, id }) {
  const colors = {
    red:    'bg-red-600 text-white border-red-700',
    orange: 'bg-orange-500 text-white border-orange-600',
    yellow: 'bg-amber-400 text-amber-900 border-amber-500',
    green:  'bg-emerald-500 text-white border-emerald-600',
    blue:   'bg-indigo-600 text-white border-indigo-700',
  };
  const hoverColors = {
    red:    'hover:bg-red-700',
    orange: 'hover:bg-orange-600',
    yellow: 'hover:bg-amber-500',
    green:  'hover:bg-emerald-600',
    blue:   'hover:bg-indigo-700',
  };

  return (
    <div className={`w-full border-b ${colors[color]} px-4 py-2.5`}>
      <div className="container mx-auto flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          <Icon className="w-4 h-4 flex-shrink-0" />
          <span className="text-sm font-medium truncate">{message}</span>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {cta && ctaHref && (
            <Link
              to={ctaHref}
              className={`
                flex items-center gap-1 text-xs font-semibold px-3 py-1 rounded-full
                bg-white/20 hover:bg-white/30 transition-colors whitespace-nowrap
              `}
            >
              {cta}
              <ChevronRight className="w-3 h-3" />
            </Link>
          )}
          {onDismiss && (
            <button
              onClick={() => onDismiss(id)}
              className="p-1 rounded-full hover:bg-white/20 transition-colors"
              aria-label="Fermer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── GlobalActionBar — logique de sélection de bannière ───────────────────

export default function GlobalActionBar() {
  const {
    pendingPayments,
    activeEscrows,
    expiringEscrows,
    balanceDueEvents,
    dismissedIds,
    dismiss,
  } = useGlobalActions();

  // Filtrer les bannières déjà fermées
  const visibleExpiring    = expiringEscrows.filter(e => !dismissedIds.has(`exp_${e.id}`));
  const visiblePayments    = pendingPayments.filter(p => !dismissedIds.has(`pay_${p.id}`));
  const visibleBalanceDue  = (balanceDueEvents || []).filter(e => !dismissedIds.has(`balance_${e.id}`));

  // ── P1 — Escrow en expiration imminente ─────────────────────────────
  if (visibleExpiring.length > 0) {
    const ev = visibleExpiring[0];
    const timeLeft = getExpiresIn(ev);
    return (
      <ActionBanner
        level="P1"
        icon={AlertTriangle}
        color="red"
        message={`⚠️ Dépôt expire dans ${timeLeft} — "${ev.title || 'Événement'}" — le fonds sera perdu si non libéré`}
        cta="Libérer maintenant"
        ctaHref={createPageUrl('Events')}
        onDismiss={dismiss}
        id={`exp_${ev.id}`}
      />
    );
  }

  // ── P1b — Balance due bientôt (organisateur doit payer la balance) ──
  if (visibleBalanceDue.length > 0) {
    const ev = visibleBalanceDue[0];
    const daysLeft = Math.floor((new Date(ev.balanceDueDate) - Date.now()) / (1000 * 60 * 60 * 24));
    const isUrgent = daysLeft <= 3;
    return (
      <ActionBanner
        level="P1b"
        icon={isUrgent ? AlertTriangle : CreditCard}
        color={isUrgent ? 'orange' : 'yellow'}
        message={
          isUrgent
            ? `⚠️ Balance à régler dans ${daysLeft} jour${daysLeft !== 1 ? 's' : ''} — "${ev.title || 'Événement'}"`
            : `Balance à régler avant J-7 — "${ev.title || 'Événement'}" — ${daysLeft} jours restants`
        }
        cta="Régler maintenant"
        ctaHref={createPageUrl('Events')}
        onDismiss={dismiss}
        id={`balance_${ev.id}`}
      />
    );
  }

  // ── P2 — Paiement en attente (je dois payer) ─────────────────────────
  if (visiblePayments.length > 0) {
    const req = visiblePayments[0];
    const expiresH = hoursUntil(req.expiresAt);
    const isUrgent = expiresH < 24;

    if (visiblePayments.length === 1) {
      return (
        <ActionBanner
          level="P2"
          icon={isUrgent ? AlertTriangle : CreditCard}
          color={isUrgent ? 'orange' : 'blue'}
          message={
            isUrgent
              ? `Dépôt requis pour "${req.eventTitle || 'Événement'}" — expire dans ${Math.round(expiresH)}h`
              : `Dépôt en attente pour "${req.eventTitle || 'Événement'}" — ${req.requestedAmount ? `${req.requestedAmount} $ CAD` : ''}`
          }
          cta="Payer maintenant"
          ctaHref={createPageUrl('Profile')}
          onDismiss={dismiss}
          id={`pay_${req.id}`}
        />
      );
    }

    return (
      <ActionBanner
        level="P2"
        icon={Bell}
        color="blue"
        message={`${visiblePayments.length} dépôts en attente de ton paiement`}
        cta="Voir dans Profil → Actions"
        ctaHref={createPageUrl('Profile')}
        onDismiss={dismiss}
        id={`pay_multi`}
      />
    );
  }

  // ── P3 — Escrow en cours de sécurisation (organisateur attend confirmation) ─
  const securing = activeEscrows.filter(
    e => e.escrowStatus === 'securing' && !dismissedIds.has(`sec_${e.id}`)
  );
  if (securing.length > 0) {
    const ev = securing[0];
    const hoursSince = (Date.now() - new Date(ev.updated_date)) / (1000 * 60 * 60);
    if (hoursSince > 1) { // Alerte seulement si ça dure depuis > 1h
      return (
        <ActionBanner
          level="P3"
          icon={Clock}
          color="yellow"
          message={`Dépôt en attente de confirmation pour "${ev.title || 'Événement'}" (depuis ${Math.round(hoursSince)}h)`}
          cta="Vérifier le statut"
          ctaHref={createPageUrl('Events')}
          onDismiss={dismiss}
          id={`sec_${ev.id}`}
        />
      );
    }
  }

  // ── P4 — Escrow sécurisé et event dans les 48h ───────────────────────
  const secured = activeEscrows.filter(e => {
    if (e.escrowStatus !== 'secured') return false;
    if (dismissedIds.has(`rdy_${e.id}`)) return false;
    const h = hoursUntil(e.dateStart);
    return h > 0 && h <= 48;
  });
  if (secured.length > 0) {
    const ev = secured[0];
    const h = Math.round(hoursUntil(ev.dateStart));
    return (
      <ActionBanner
        level="P4"
        icon={Lock}
        color="green"
        message={`Budget sécurisé pour "${ev.title || 'Événement'}" — dans ${h}h, tout est prêt`}
        cta="Aller au lobby"
        ctaHref={createPageUrl('Events')}
        onDismiss={dismiss}
        id={`rdy_${ev.id}`}
      />
    );
  }

  // Rien à afficher
  return null;
}