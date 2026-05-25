/**
 * MICRO RAVE V3 — pages/EngagementView.jsx
 * ============================================================
 * Surface d'activation #2 : Suivi d'engagement.
 * Affiche le statut de la machine d'état, les infos du contrat,
 * et le bouton de paiement dépôt (Stripe Checkout).
 *
 * Transitions déclenchées depuis cette page :
 *   placed → deposit_pending (bouton "Payer le dépôt")
 *   → redirige vers Stripe Checkout
 *   → webhook deposit confirmed → deposit_secured (auto)
 *
 * Source : OS V15 · D-038 (waterfall) · D-097 (webhook) · D-013
 * ============================================================
 */

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { useToast } from '@/components/ui/use-toast';
import {
  Clock, CheckCircle2, AlertCircle, CreditCard,
  ArrowRight, Loader2, RefreshCw, Lock, Unlock,
  Music, Calendar, MapPin, DollarSign
} from 'lucide-react';

// ── Tokens visuels ────────────────────────────────────────────
const T = {
  bg:      '#0a0a0f',
  surface: '#12121a',
  surface2:'#0f0f18',
  border:  '#1e1e2e',
  accent:  '#7c3aed',
  neon:    '#a78bfa',
  text:    '#e2e8f0',
  muted:   '#64748b',
  success: '#10b981',
  warning: '#f59e0b',
  error:   '#ef4444',
  deposit: '#2563eb',
};

// ── Machine d'état : config visuelle ─────────────────────────
const STATE_CONFIG = {
  placed:               { label: 'Placé',              color: T.muted,   icon: Clock,        step: 0 },
  proposed:             { label: 'Proposé',            color: T.muted,   icon: Clock,        step: 0 },
  negotiating:          { label: 'Négociation',        color: T.warning, icon: Clock,        step: 1 },
  accepted:             { label: 'Accepté',            color: T.success, icon: CheckCircle2, step: 1 },
  deposit_pending:      { label: 'Dépôt en attente',   color: T.warning, icon: CreditCard,   step: 2 },
  deposit_secured:      { label: 'Dépôt sécurisé',     color: T.success, icon: Lock,         step: 2 },
  event_sealed:         { label: 'Événement scellé',   color: T.neon,    icon: Lock,         step: 3 },
  performed:            { label: 'Prestationcomplétée', color: T.success, icon: CheckCircle2, step: 4 },
  event_completed:      { label: 'Événement complété', color: T.success, icon: CheckCircle2, step: 4 },
  sots_window_closed:   { label: 'Fenêtre SOTS fermée',color: T.neon,    icon: Clock,        step: 5 },
  contestation_window:  { label: 'Contestation',       color: T.warning, icon: AlertCircle,  step: 5 },
  payable:              { label: 'Payable',             color: T.success, icon: DollarSign,   step: 6 },
  settled:              { label: 'Réglé',               color: T.success, icon: CheckCircle2, step: 7 },
  archived:             { label: 'Archivé',             color: T.muted,   icon: CheckCircle2, step: 8 },
  disputed:             { label: 'Dispute',             color: T.error,   icon: AlertCircle,  step: -1 },
  cancelled_J7:         { label: 'Annulé J-7',         color: T.error,   icon: AlertCircle,  step: -1 },
  cancelled_J30:        { label: 'Annulé J-30',        color: T.error,   icon: AlertCircle,  step: -1 },
  no_show:              { label: 'No-show',             color: T.error,   icon: AlertCircle,  step: -1 },
  refunded:             { label: 'Remboursé',           color: T.muted,   icon: CheckCircle2, step: -1 },
};

const STEPS = ['Placé', 'Accepté', 'Dépôt', 'Scellé', 'Prestation', 'SOTS', 'Payable', 'Réglé'];

const s = {
  page:    { minHeight: '100vh', background: T.bg, color: T.text, fontFamily: "'DM Mono', 'Fira Code', monospace" },
  header:  { borderBottom: `1px solid ${T.border}`, padding: '16px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: T.surface },
  nav:     { display: 'flex', alignItems: 'center', gap: '8px' },
  logo:    { fontSize: '11px', letterSpacing: '0.3em', color: T.neon, textTransform: 'uppercase', fontWeight: 600 },
  navItem: { fontSize: '11px', color: T.muted, letterSpacing: '0.15em', textTransform: 'uppercase' },
  sep:     { color: T.border, margin: '0 6px' },
  body:    { maxWidth: '760px', margin: '0 auto', padding: '40px 32px' },
  grid:    { display: 'grid', gridTemplateColumns: '1fr 300px', gap: '24px', alignItems: 'start' },
  card:    { background: T.surface, border: `1px solid ${T.border}`, borderRadius: '8px', padding: '24px', marginBottom: '16px' },
  sidebar: { background: T.surface, border: `1px solid ${T.border}`, borderRadius: '8px', padding: '24px', position: 'sticky', top: '24px' },
  stateTag: (state) => ({
    display: 'inline-flex', alignItems: 'center', gap: '6px',
    padding: '4px 12px', borderRadius: '20px',
    background: `${(STATE_CONFIG[state]?.color || T.muted)}22`,
    border: `1px solid ${(STATE_CONFIG[state]?.color || T.muted)}44`,
    color: STATE_CONFIG[state]?.color || T.muted,
    fontSize: '11px', letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 600,
  }),
  sectionLabel: { fontSize: '10px', letterSpacing: '0.3em', textTransform: 'uppercase', color: T.accent, fontWeight: 600, marginBottom: '16px' },
  row:    { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: `1px solid ${T.border}` },
  rowLabel: { fontSize: '12px', color: T.muted },
  rowValue: { fontSize: '13px', color: T.text, fontWeight: 500, textAlign: 'right' },
  wfRow:  { display: 'flex', justifyContent: 'space-between', fontSize: '13px', padding: '5px 0' },
  cta:    { width: '100%', padding: '13px', borderRadius: '6px', border: 'none', fontSize: '12px', letterSpacing: '0.15em', textTransform: 'uppercase', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontFamily: "'DM Mono', monospace", marginTop: '12px' },
  ctaPay: { background: T.deposit, color: 'white' },
  ctaRefresh: { background: T.border, color: T.text },
  stepBar: { display: 'flex', gap: '4px', marginBottom: '24px' },
  step: (active, done) => ({
    flex: 1, height: '3px', borderRadius: '2px',
    background: done ? T.success : (active ? T.neon : T.border),
    transition: 'background 0.3s',
  }),
  engId: { fontSize: '11px', color: T.muted, letterSpacing: '0.1em', marginBottom: '16px', fontFamily: "'DM Mono', monospace" },
  h1: { fontSize: '24px', fontWeight: 700, fontFamily: "'DM Serif Display', Georgia, serif", color: T.text, marginBottom: '6px', letterSpacing: '-0.01em' },
};

export default function EngagementView() {
  const { engagementId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();

  const [engagement, setEngagement] = useState(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState('');
  const [paymentStatus, setPaymentStatus] = useState(null); // 'success' | 'cancelled' | null

  // Détecter le retour depuis Stripe Checkout
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get('payment');
    if (status === 'success') {
      setPaymentStatus('success');
      toast({ title: '✓ Paiement reçu', description: 'Le dépôt a été confirmé par Stripe.' });
      // Nettoyer l'URL sans recharger la page
      window.history.replaceState({}, '', window.location.pathname);
      // Recharger l'engagement pour refléter le nouvel état
      setTimeout(() => loadEngagement(), 1500);
    } else if (status === 'cancelled') {
      setPaymentStatus('cancelled');
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  async function loadEngagement() {
    setLoading(true);
    setError('');
    try {
      const res = await base44.functions.invoke('getEngagement', { engagementId });
      if (!res?.data?.ok) throw new Error(res?.data?.error || 'Engagement introuvable');
      setEngagement(res.data.engagement);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { if (engagementId) loadEngagement(); }, [engagementId]);

  async function handlePayDeposit() {
    if (paying) return;
    setPaying(true);
    try {
      const res = await base44.functions.invoke('initiateDepositPayment', {
        engagementId,
        // successUrl et cancelUrl optionnels — la fonction utilise des valeurs par défaut
        // basées sur APP_BASE_URL si non fournis
        successUrl: `${window.location.origin}/engagement/${engagementId}?payment=success`,
        cancelUrl:  `${window.location.origin}/engagement/${engagementId}?payment=cancelled`,
      });
      if (!res?.data?.checkoutUrl) {
        throw new Error(res?.data?.error || 'Checkout URL manquante — vérifier STRIPE_SECRET_KEY dans Base44');
      }
      // Redirection vers la page Stripe Checkout hébergée
      window.location.href = res.data.checkoutUrl;
    } catch (err) {
      toast({ title: 'Erreur paiement', description: err.message, variant: 'destructive' });
      setPaying(false);
    }
  }

  if (loading) return (
    <div style={{ ...s.page, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Loader2 size={24} color={T.neon} className="animate-spin" />
    </div>
  );

  if (error) return (
    <div style={{ ...s.page, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <AlertCircle size={32} color={T.error} style={{ margin: '0 auto 12px' }} />
        <div style={{ color: T.error, marginBottom: '16px' }}>{error}</div>
        <button style={{ ...s.cta, ...s.ctaRefresh, width: 'auto', padding: '8px 16px' }} onClick={loadEngagement}>
          Réessayer
        </button>
      </div>
    </div>
  );

  if (!engagement) return null;

  const stateConf = STATE_CONFIG[engagement.status] || { label: engagement.status, color: T.muted, icon: Clock, step: 0 };
  const Icon = stateConf.icon;
  const currentStep = stateConf.step;

  // canPay : placed, accepted = première fois
  // deposit_pending = permettre de relancer si session Checkout expirée ou échouée
  const canPay = ['placed', 'accepted', 'deposit_pending'].includes(engagement.status);
  const isOrganizer = user?.id === engagement.organizerUserId;

  const depositCents = engagement.depositCents || 0;
  const cachetCents  = engagement.cachetSigneCents   || 0;
  const commCents    = engagement.commissionMrCents  || Math.floor(cachetCents * 120000 / 1_000_000);
  const talentCents  = cachetCents - commCents;

  return (
    <div style={s.page}>
      <div style={s.header}>
        <div style={s.nav}>
          <span style={s.logo}>Micro Rave</span>
          <span style={s.sep}>/</span>
          <span style={s.navItem} onClick={() => navigate('/')} role="button">Engagements</span>
          <span style={s.sep}>/</span>
          <span style={{ ...s.navItem, color: T.text }}>{engagementId?.slice(-8)}</span>
        </div>
        <button style={{ ...s.cta, ...s.ctaRefresh, width: 'auto', padding: '6px 14px', marginTop: 0 }} onClick={loadEngagement}>
          <RefreshCw size={12} /> Actualiser
        </button>
      </div>

      <div style={s.body}>
        {/* Barre de progression */}
        <div style={s.stepBar}>
          {STEPS.map((_, i) => (
            <div key={i} style={s.step(i === currentStep, i < currentStep)} />
          ))}
        </div>

        <div style={s.grid}>
          {/* Colonne principale */}
          <div>
            <div style={s.engId}>{engagementId}</div>
            <h1 style={s.h1}>{engagement.eventName || 'Engagement'}</h1>
            <div style={{ marginBottom: '24px' }}>
              <span style={s.stateTag(engagement.status)}>
                <Icon size={10} /> {stateConf.label}
              </span>
            </div>

            {/* Détails event */}
            <div style={s.card}>
              <div style={s.sectionLabel}>Détails de l'événement</div>
              {[
                { label: 'Date', value: engagement.eventDate ? new Date(engagement.eventDate).toLocaleDateString('fr-CA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : '—' },
                { label: 'Lieu', value: engagement.venueAddress || '—' },
                { label: 'Organisateur', value: engagement.organizerUserId || '—' },
                { label: 'Talent', value: engagement.talentUserId || '—' },
              ].map(({ label, value }) => (
                <div key={label} style={s.row}>
                  <span style={s.rowLabel}>{label}</span>
                  <span style={s.rowValue}>{value}</span>
                </div>
              ))}
              {engagement.description && (
                <div style={{ marginTop: '12px', fontSize: '13px', color: T.muted, lineHeight: 1.6 }}>
                  {engagement.description}
                </div>
              )}
            </div>

            {/* Waterfall */}
            <div style={s.card}>
              <div style={s.sectionLabel}>Waterfall financier</div>
              <div style={s.wfRow}>
                <span style={{ color: T.muted }}>Cachet signé</span>
                <span style={{ color: T.text, fontWeight: 500 }}>{(cachetCents / 100).toFixed(2)} $</span>
              </div>
              <div style={s.wfRow}>
                <span style={{ color: T.muted }}>Commission MR (12%)</span>
                <span style={{ color: T.accent }}>− {(commCents / 100).toFixed(2)} $</span>
              </div>
              <div style={{ borderTop: `1px solid ${T.border}`, margin: '8px 0' }} />
              <div style={s.wfRow}>
                <span style={{ color: T.muted }}>Net talent</span>
                <span style={{ color: T.neon, fontWeight: 700 }}>{(talentCents / 100).toFixed(2)} $</span>
              </div>
              {depositCents > 0 && (
                <>
                  <div style={{ borderTop: `1px solid ${T.border}`, margin: '8px 0' }} />
                  <div style={s.wfRow}>
                    <span style={{ color: T.muted }}>Dépôt (20%)</span>
                    <span style={{ color: '#fbbf24' }}>{(depositCents / 100).toFixed(2)} $</span>
                  </div>
                  <div style={s.wfRow}>
                    <span style={{ color: T.muted }}>Balance restante</span>
                    <span style={{ color: T.text }}>{((cachetCents - depositCents) / 100).toFixed(2)} $</span>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Sidebar actions */}
          <div style={s.sidebar}>
            <div style={s.sectionLabel}>Actions</div>

            {canPay && isOrganizer && (
              <button
                style={{ ...s.cta, ...s.ctaPay, ...(paying ? { opacity: 0.5, cursor: 'not-allowed' } : {}) }}
                onClick={handlePayDeposit}
                disabled={paying}
              >
                {paying ? (
                  <><Loader2 size={14} className="animate-spin" /> Redirection...</>
                ) : (
                  <><CreditCard size={14} /> {engagement.status === 'deposit_pending' ? 'Relancer le paiement' : 'Payer le dépôt'} {depositCents > 0 ? `(${(depositCents/100).toFixed(0)} $)` : ''}</>
                )}
              </button>
            )}

            {engagement.status === 'deposit_pending' && (
              <div style={{ fontSize: '12px', color: T.warning, textAlign: 'center', marginTop: '12px', padding: '10px', background: `${T.warning}11`, borderRadius: '6px', border: `1px solid ${T.warning}33` }}>
                <Clock size={12} style={{ marginBottom: '4px' }} />
                <br />
                Paiement en attente de confirmation Stripe
              </div>
            )}

            {engagement.status === 'deposit_secured' && (
              <div style={{ fontSize: '12px', color: T.success, textAlign: 'center', marginTop: '12px', padding: '10px', background: `${T.success}11`, borderRadius: '6px', border: `1px solid ${T.success}33` }}>
                <Lock size={12} style={{ marginBottom: '4px' }} />
                <br />
                Dépôt sécurisé — en attente du scellement
              </div>
            )}

            {/* Timeline des états */}
            <div style={{ marginTop: '20px' }}>
              <div style={{ ...s.sectionLabel, marginBottom: '12px' }}>Timeline</div>
              {[
                'placed', 'accepted', 'deposit_pending', 'deposit_secured',
                'event_sealed', 'performed', 'event_completed',
                'sots_window_closed', 'payable', 'settled', 'archived'
              ].map(st => {
                const conf = STATE_CONFIG[st];
                const isCurrent = st === engagement.status;
                const isPast = (conf?.step || 0) < currentStep;
                return (
                  <div key={st} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0', opacity: isPast || isCurrent ? 1 : 0.35 }}>
                    <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: isCurrent ? T.neon : (isPast ? T.success : T.border), flexShrink: 0 }} />
                    <span style={{ fontSize: '11px', color: isCurrent ? T.neon : (isPast ? T.success : T.muted), fontWeight: isCurrent ? 600 : 400 }}>
                      {conf?.label || st}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}