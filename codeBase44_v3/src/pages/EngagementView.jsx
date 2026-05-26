/**
 * MICRO RAVE V3 — pages/EngagementView.jsx
 * ============================================================
 * Surface d'activation #2 : Suivi d'engagement — cycle complet.
 *
 * Transitions déclenchées depuis cette page (organisateur) :
 *   placed/deposit_pending → initiateDepositPayment (Stripe Checkout)
 *   deposit_secured        → transitionEngagement(event_sealed)
 *   payable                → transitionEngagement(settled)  [test pilote]
 *   settled                → recognizeRevenue + transitionEngagement(archived)
 *
 * Source : OS V15 · D-038 · D-097 · D-013 · D-101
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
  Music, Calendar, MapPin, DollarSign, Archive,
  Shield, Link, Copy, Navigation
} from 'lucide-react';

const T = {
  bg:      '#0a0a0f', surface: '#12121a', surface2: '#0f0f18',
  border:  '#1e1e2e', accent:  '#7c3aed', neon:    '#a78bfa',
  text:    '#e2e8f0', muted:   '#64748b', success: '#10b981',
  warning: '#f59e0b', error:   '#ef4444', deposit: '#2563eb',
};

const STATE_CONFIG = {
  placed:              { label: 'Placé',               color: T.muted,   icon: Clock,        step: 0 },
  proposed:            { label: 'Proposé',             color: T.muted,   icon: Clock,        step: 0 },
  accepted:            { label: 'Accepté',             color: T.success, icon: CheckCircle2, step: 1 },
  deposit_pending:     { label: 'Dépôt en attente',    color: T.warning, icon: CreditCard,   step: 2 },
  deposit_secured:     { label: 'Dépôt sécurisé',      color: T.success, icon: Lock,         step: 2 },
  event_sealed:        { label: 'Événement scellé',    color: T.neon,    icon: Lock,         step: 3 },
  performed:           { label: 'Prestation complétée',color: T.success, icon: CheckCircle2, step: 4 },
  event_completed:     { label: 'Événement complété',  color: T.success, icon: CheckCircle2, step: 4 },
  sots_window_closed:  { label: 'SOTS fermée',         color: T.neon,    icon: Clock,        step: 5 },
  contestation_window: { label: 'Contestation',        color: T.warning, icon: AlertCircle,  step: 5 },
  payable:             { label: 'Payable',             color: T.success, icon: DollarSign,   step: 6 },
  settled:             { label: 'Réglé',               color: T.success, icon: CheckCircle2, step: 7 },
  archived:            { label: 'Archivé',             color: T.muted,   icon: Archive,      step: 8 },
  cancelled_J7:        { label: 'Annulé J-7',          color: T.error,   icon: AlertCircle,  step: -1 },
  cancelled_J30:       { label: 'Annulé J-30',         color: T.error,   icon: AlertCircle,  step: -1 },
  no_show:             { label: 'No-show',             color: T.error,   icon: AlertCircle,  step: -1 },
  refunded:            { label: 'Remboursé',           color: T.muted,   icon: CheckCircle2, step: -1 },
};

const STEPS = ['Placé', 'Accepté', 'Dépôt', 'Scellé', 'Prestation', 'SOTS', 'Payable', 'Réglé'];

export default function EngagementView() {
  const { engagementId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();

  const [engagement, setEngagement] = useState(null);
  const [loading, setLoading]       = useState(true);
  const [acting, setActing]         = useState(false);
  const [error, setError]           = useState('');
  const [actionWarning, setActionWarning] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('payment') === 'success') {
      toast({ title: '✓ Paiement reçu', description: 'Le dépôt a été confirmé.' });
      window.history.replaceState({}, '', window.location.pathname);
      setTimeout(() => loadEngagement(), 1500);
    } else if (params.get('payment') === 'cancelled') {
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  useEffect(() => { if (engagementId) loadEngagement(); }, [engagementId]);

  async function loadEngagement() {
    setLoading(true); setError('');
    try {
      const res = await base44.functions.invoke('getEngagement', { engagementId });
      if (!res?.data?.ok) throw new Error(res?.data?.error || 'Engagement introuvable');
      setEngagement(res.data.engagement);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  // Payer le dépôt → Stripe Checkout
  async function handlePayDeposit() {
    if (acting) return; setActing(true);
    try {
      const res = await base44.functions.invoke('initiateDepositPayment', { engagementId });
      if (!res?.data?.ok) throw new Error(res?.data?.error);
      window.location.href = res.data.checkoutUrl;
    } catch (err) {
      setError(err.message);
      toast({ title: 'Erreur', description: err.message, variant: 'destructive' });
    } finally { setActing(false); }
  }

  // Sceller l'événement
  async function handleSeal() {
    if (acting) return; setActing(true); setActionWarning('');
    try {
      const res = await base44.functions.invoke('transitionEngagement', {
        engagementId, targetState: 'event_sealed', context: {},
      });
      if (!res?.data?.success) throw new Error(res?.data?.error);
      if (res.data?.warning) setActionWarning(res.data.warning);
      toast({ title: '✓ Événement scellé', description: 'Transmettez le lien de check-in au talent.' });
      await loadEngagement();
    } catch (err) {
      setError(err.message);
      toast({ title: 'Erreur', description: err.message, variant: 'destructive' });
    } finally { setActing(false); }
  }

  // Déclencher le règlement (payable → settled)
  async function handleSettle() {
    if (acting) return; setActing(true);
    try {
      const res = await base44.functions.invoke('transitionEngagement', {
        engagementId, targetState: 'settled', context: {},
      });
      if (!res?.data?.success) throw new Error(res?.data?.error);
      toast({ title: '✓ Règlement déclenché', description: 'Archivez l\'engagement pour reconnaître le revenu.' });
      await loadEngagement();
    } catch (err) {
      setError(err.message);
      toast({ title: 'Erreur', description: err.message, variant: 'destructive' });
    } finally { setActing(false); }
  }

  // Archiver (settled → archived) — recognizeRevenue d'abord (fail-soft)
  async function handleArchive() {
    if (acting) return; setActing(true);
    try {
      // Tenter d'écrire 4530 DR / 7110 CR (fail-soft si PolicyConfig manquant)
      const rrRes = await base44.functions.invoke('recognizeRevenue', { engagementId }).catch(() => null);
      if (rrRes && !rrRes?.data?.ok) {
        toast({ title: '⚠ Revenue recognition partielle', description: 'Vérifier ledger_account_revenue_courtage dans PolicyConfig.', variant: 'destructive' });
      }
      const res = await base44.functions.invoke('transitionEngagement', {
        engagementId, targetState: 'archived', context: {},
      });
      if (!res?.data?.success) throw new Error(res?.data?.error);
      toast({ title: '✓ Engagement archivé', description: 'Cycle complet — bilan à jour.' });
      await loadEngagement();
    } catch (err) {
      setError(err.message);
      toast({ title: 'Erreur', description: err.message, variant: 'destructive' });
    } finally { setActing(false); }
  }

  function copyCheckinLink() {
    const url = `${window.location.origin}/checkin/${engagementId}`;
    navigator.clipboard.writeText(url).then(() =>
      toast({ title: '✓ Lien copié', description: 'Envoyez ce lien au talent.' })
    );
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', background: T.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Loader2 size={24} color={T.neon} className="animate-spin" />
    </div>
  );

  if (error && !engagement) return (
    <div style={{ minHeight: '100vh', background: T.bg, color: T.error, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'monospace' }}>
      {error}
    </div>
  );

  const stateConf   = STATE_CONFIG[engagement?.status] || { label: engagement?.status, color: T.muted, icon: Clock, step: 0 };
  const Icon        = stateConf.icon;
  const currentStep = stateConf.step;
  const isOrganizer = user?.id === engagement?.organizerUserId;
  const isTalent    = user?.id === engagement?.talentUserId;

  const depositCents = engagement.depositCents      || 0;
  const cachetCents  = engagement.cachetSigneCents  || 0;
  const commCents    = engagement.commissionMrCents || Math.floor(cachetCents * 120000 / 1_000_000);
  const talentCents  = cachetCents - commCents;
  const balanceCents = cachetCents - depositCents;

  const s = {
    page:    { minHeight: '100vh', background: T.bg, color: T.text, fontFamily: "'DM Mono', 'Fira Code', monospace" },
    header:  { borderBottom: `1px solid ${T.border}`, padding: '16px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: T.surface },
    body:    { maxWidth: '800px', margin: '0 auto', padding: '40px 32px' },
    grid:    { display: 'grid', gridTemplateColumns: '1fr 300px', gap: '24px', alignItems: 'start' },
    card:    { background: T.surface, border: `1px solid ${T.border}`, borderRadius: '8px', padding: '24px', marginBottom: '16px' },
    sidebar: { background: T.surface, border: `1px solid ${T.border}`, borderRadius: '8px', padding: '24px', position: 'sticky', top: '24px' },
    cta:     { width: '100%', padding: '12px', borderRadius: '6px', border: 'none', fontSize: '11px', letterSpacing: '0.15em', textTransform: 'uppercase', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontFamily: "'DM Mono', monospace", marginTop: '10px' },
    row:     { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: `1px solid ${T.border}` },
    label:   { fontSize: '10px', letterSpacing: '0.3em', textTransform: 'uppercase', color: T.accent, fontWeight: 600, marginBottom: '16px' },
    stepBar: { display: 'flex', gap: '4px', marginBottom: '24px' },
    step:    (active, done) => ({ flex: 1, height: '3px', borderRadius: '2px', background: done ? T.success : active ? T.neon : T.border }),
  };

  return (
    <div style={s.page}>
      <div style={s.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '11px', letterSpacing: '0.3em', color: T.neon, textTransform: 'uppercase', fontWeight: 600 }}>Micro Rave</span>
          <span style={{ color: T.border }}>/</span>
          <span style={{ fontSize: '11px', color: T.muted, letterSpacing: '0.15em', textTransform: 'uppercase', cursor: 'pointer' }} onClick={() => navigate('/')}>Engagements</span>
          <span style={{ color: T.border }}>/</span>
          <span style={{ fontSize: '11px', color: T.text, letterSpacing: '0.15em', textTransform: 'uppercase' }}>{engagementId?.slice(-8)}</span>
        </div>
        <button style={{ ...s.cta, width: 'auto', padding: '6px 14px', marginTop: 0, background: T.border, color: T.text }} onClick={loadEngagement}>
          <RefreshCw size={12} /> Actualiser
        </button>
      </div>

      <div style={s.body}>
        <div style={s.stepBar}>
          {STEPS.map((_, i) => <div key={i} style={s.step(i === currentStep, i < currentStep)} />)}
        </div>

        <div style={s.grid}>
          {/* ── Colonne principale ─────────────────────── */}
          <div>
            <div style={{ fontSize: '11px', color: T.muted, letterSpacing: '0.1em', marginBottom: '8px' }}>{engagementId}</div>
            <h1 style={{ fontSize: '24px', fontWeight: 700, fontFamily: "'DM Serif Display', Georgia, serif", color: T.text, marginBottom: '10px' }}>
              {engagement.eventName || 'Engagement'}
            </h1>
            <div style={{ marginBottom: '24px' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 12px', borderRadius: '20px', background: `${stateConf.color}22`, border: `1px solid ${stateConf.color}44`, color: stateConf.color, fontSize: '11px', letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 600 }}>
                <Icon size={10} /> {stateConf.label}
              </span>
            </div>

            <div style={s.card}>
              <div style={s.label}>Détails de l'événement</div>
              {[
                { label: 'Date',         value: engagement.eventDate ? new Date(engagement.eventDate).toLocaleDateString('fr-CA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : '—' },
                { label: 'Lieu',         value: engagement.venueAddress || '—' },
                { label: 'Organisateur', value: engagement.organizerUserId || '—' },
                { label: 'Talent',       value: engagement.talentUserId || '—' },
              ].map(({ label, value }) => (
                <div key={label} style={s.row}>
                  <span style={{ fontSize: '12px', color: T.muted }}>{label}</span>
                  <span style={{ fontSize: '13px', color: T.text, fontWeight: 500 }}>{value}</span>
                </div>
              ))}
            </div>

            <div style={s.card}>
              <div style={s.label}>Waterfall financier</div>
              {[
                { label: 'Cachet signé',    value: `${(cachetCents/100).toFixed(2)} $`,    color: T.text },
                { label: `Commission MR`,   value: `− ${(commCents/100).toFixed(2)} $`,    color: T.accent },
                { label: 'Net talent',      value: `${(talentCents/100).toFixed(2)} $`,    color: T.neon, bold: true },
                { label: 'Dépôt (20%)',     value: `${(depositCents/100).toFixed(2)} $`,   color: '#fbbf24', sep: true },
                { label: 'Balance restante',value: `${(balanceCents/100).toFixed(2)} $`,   color: T.text },
              ].map(({ label, value, color, bold, sep }) => (
                <React.Fragment key={label}>
                  {sep && <div style={{ borderTop: `1px solid ${T.border}`, margin: '8px 0' }} />}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', padding: '5px 0' }}>
                    <span style={{ color: T.muted }}>{label}</span>
                    <span style={{ color, fontWeight: bold ? 700 : 500 }}>{value}</span>
                  </div>
                </React.Fragment>
              ))}
            </div>
          </div>

          {/* ── Sidebar actions ────────────────────────── */}
          <div style={s.sidebar}>
            <div style={s.label}>Actions</div>

            {error && (
              <div style={{ background: '#1a0808', border: `1px solid ${T.error}`, borderRadius: '6px', padding: '10px', fontSize: '12px', color: '#fca5a5', marginBottom: '12px', display: 'flex', gap: '8px' }}>
                <AlertCircle size={12} style={{ flexShrink: 0, marginTop: '1px' }} /> {error}
              </div>
            )}

            {actionWarning && (
              <div style={{ background: `${T.warning}11`, border: `1px solid ${T.warning}44`, borderRadius: '6px', padding: '10px', fontSize: '11px', color: T.warning, marginBottom: '12px' }}>
                ⚠ {actionWarning}
              </div>
            )}

            {/* ── PAYER LE DÉPÔT ── */}
            {isOrganizer && ['placed', 'accepted', 'deposit_pending'].includes(engagement.status) && (
              <button style={{ ...s.cta, background: T.deposit, color: 'white', ...(acting ? { opacity: 0.5, cursor: 'not-allowed' } : {}) }} onClick={handlePayDeposit} disabled={acting}>
                {acting ? <><Loader2 size={14} className="animate-spin" /> Redirection...</> : <><CreditCard size={14} /> {engagement.status === 'deposit_pending' ? 'Relancer le paiement' : 'Payer le dépôt'} {depositCents > 0 ? `(${(depositCents/100).toFixed(0)} $)` : ''}</>}
              </button>
            )}

            {/* ── SCELLER L'ÉVÉNEMENT ── */}
            {isOrganizer && engagement.status === 'deposit_secured' && (
              <>
                <button style={{ ...s.cta, background: T.neon, color: '#000', ...(acting ? { opacity: 0.5, cursor: 'not-allowed' } : {}) }} onClick={handleSeal} disabled={acting}>
                  {acting ? <><Loader2 size={14} className="animate-spin" /> Scellement...</> : <><Lock size={14} /> Sceller l'événement</>}
                </button>
                <div style={{ fontSize: '11px', color: T.muted, marginTop: '8px', padding: '8px', background: `${T.warning}11`, borderRadius: '6px', border: `1px solid ${T.warning}22` }}>
                  ⚠ Mode pilote : le paiement du solde ({(balanceCents/100).toFixed(0)} $) sera confirmé après.
                </div>
              </>
            )}

            {/* ── LIEN CHECK-IN TALENT ── */}
            {engagement.status === 'event_sealed' && (
              <>
                <div style={{ fontSize: '12px', color: T.neon, textAlign: 'center', padding: '12px', background: `${T.neon}11`, borderRadius: '6px', border: `1px solid ${T.neon}33`, marginBottom: '8px' }}>
                  <Lock size={12} style={{ marginBottom: '4px' }} />
                  <br />Événement scellé — en attente du check-in talent
                </div>
                <button style={{ ...s.cta, background: T.accent, color: 'white' }} onClick={copyCheckinLink}>
                  <Copy size={14} /> Copier lien check-in talent
                </button>
                {isTalent && (
                  <button style={{ ...s.cta, background: T.success, color: 'white' }} onClick={() => navigate(`/checkin/${engagementId}`)}>
                    <Navigation size={14} /> Faire mon check-in
                  </button>
                )}
              </>
            )}

            {/* ── ÉTATS INTERMEDIAIRES — navigation vers CompletionFlow ── */}
            {isOrganizer && ['performed', 'event_completed', 'sots_window_closed', 'contestation_window'].includes(engagement.status) && (
              <button style={{ ...s.cta, background: T.accent, color: 'white' }} onClick={() => navigate(`/completion/${engagementId}`)}>
                <ArrowRight size={14} /> Continuer le processus
              </button>
            )}

            {/* ── DÉCLENCHER LE RÈGLEMENT (payable → settled) ── */}
            {isOrganizer && engagement.status === 'payable' && (
              <>
                <div style={{ fontSize: '11px', color: T.success, padding: '10px', background: `${T.success}11`, borderRadius: '6px', border: `1px solid ${T.success}33`, marginBottom: '8px' }}>
                  ✓ Prestation validée — prêt pour le règlement
                </div>
                <button style={{ ...s.cta, background: T.success, color: 'white', ...(acting ? { opacity: 0.5, cursor: 'not-allowed' } : {}) }} onClick={handleSettle} disabled={acting}>
                  {acting ? <><Loader2 size={14} className="animate-spin" /> Règlement...</> : <><DollarSign size={14} /> Déclencher le règlement</>}
                </button>
              </>
            )}

            {/* ── ARCHIVER (settled → archived) ── */}
            {isOrganizer && engagement.status === 'settled' && (
              <>
                <div style={{ fontSize: '11px', color: T.success, padding: '10px', background: `${T.success}11`, borderRadius: '6px', border: `1px solid ${T.success}33`, marginBottom: '8px' }}>
                  ✓ Engagement réglé — archivez pour reconnaître le revenu MR
                </div>
                <button style={{ ...s.cta, background: T.muted, color: 'white', ...(acting ? { opacity: 0.5, cursor: 'not-allowed' } : {}) }} onClick={handleArchive} disabled={acting}>
                  {acting ? <><Loader2 size={14} className="animate-spin" /> Archivage...</> : <><Archive size={14} /> Archiver l'engagement</>}
                </button>
              </>
            )}

            {/* ── ARCHIVÉ — état final ── */}
            {engagement.status === 'archived' && (
              <div style={{ fontSize: '12px', color: T.muted, textAlign: 'center', padding: '12px', background: `${T.muted}11`, borderRadius: '6px', border: `1px solid ${T.muted}33` }}>
                <Archive size={14} style={{ marginBottom: '4px' }} />
                <br />Engagement archivé (WORM)
              </div>
            )}

            {/* ── TIMELINE ── */}
            <div style={{ marginTop: '20px', borderTop: `1px solid ${T.border}`, paddingTop: '16px' }}>
              <div style={{ ...s.label, marginBottom: '12px' }}>Timeline</div>
              {Object.entries(STATE_CONFIG).filter(([_, c]) => c.step >= 0).sort(([,a],[,b]) => a.step - b.step).map(([st, conf]) => {
                const isCurrent = st === engagement.status;
                const isPast    = conf.step < currentStep;
                return (
                  <div key={st} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '3px 0', opacity: isPast || isCurrent ? 1 : 0.3 }}>
                    <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: isCurrent ? T.neon : isPast ? T.success : T.border, flexShrink: 0 }} />
                    <span style={{ fontSize: '11px', color: isCurrent ? T.neon : isPast ? T.success : T.muted, fontWeight: isCurrent ? 600 : 400 }}>
                      {conf.label}
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