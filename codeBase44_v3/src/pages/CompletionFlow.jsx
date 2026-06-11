/**
 * MICRO RAVE V3 — pages/CompletionFlow.jsx
 * ============================================================
 * Surface d'activation #4 : Confirmation de completion.
 *
 * ── CHANGEMENTS v3 (26 mai 2026) ────────────────────────────
 *
 * Ajout d'un bouton "Passer à payable maintenant" sur l'écran
 * final. Le cycle complet est désormais navigable sans cron
 * ni scheduler externe : l'organisateur peut forcer la sortie
 * de contestation_window vers payable une fois la fenêtre
 * configurée écoulée (ou immédiatement en mode pilote).
 *
 * Transitions déclenchées :
 *   performed → event_completed         (EventCompletionGuard)
 *   event_completed → sots_window_closed
 *   sots_window_closed → contestation_window
 *   contestation_window → payable       (PresenceProofGuard) ← NOUVEAU bouton
 *   payable → settled → archived        (depuis EngagementView ensuite)
 *
 * Source : OS V15 · D-075 · D-019-B · D-101 · doctrine WORM 26-05
 * ============================================================
 */

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { useToast } from '@/components/ui/use-toast';
import {
  CheckCircle2, AlertCircle, Loader2, Star,
  DollarSign, Clock, ArrowRight, Shield, Zap,
} from 'lucide-react';

const T = {
  bg:      '#07070e',
  surface: '#0f0f1a',
  border:  '#1c1c2e',
  accent:  '#7c3aed',
  gold:    '#f59e0b',
  neon:    '#a78bfa',
  text:    '#ede9fe',
  muted:   '#64748b',
  success: '#10b981',
  warning: '#f59e0b',
  error:   '#ef4444',
};

export default function CompletionFlow() {
  const { engagementId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();

  const [engagement, setEngagement] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const [step, setStep] = useState('confirm'); // confirm | sots | done | payable
  const [sotsRating, setSotsRating] = useState(0);
  const [sotsNote, setSotsNote] = useState('');
  const [completionResult, setCompletionResult] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => { loadEngagement(); /* eslint-disable-next-line */ }, [engagementId]);

  async function loadEngagement() {
    setLoading(true);
    try {
      const res = await base44.functions.invoke('getEngagement', { engagementId });
      if (res?.data?.ok) {
        const eng = res.data.engagement;
        setEngagement(eng);
        if (eng.status === 'performed') setStep('confirm');
        else if (eng.status === 'event_completed') setStep('sots');
        else if (['contestation_window'].includes(eng.status)) setStep('done');
        else if (['payable', 'settled', 'archived'].includes(eng.status)) setStep('payable');
      }
    } catch {} finally {
      setLoading(false);
    }
  }

  async function handleConfirmCompletion() {
    setSubmitting(true);
    setError('');
    try {
      const res = await base44.functions.invoke('transitionEngagement', {
        engagementId,
        targetState: 'event_completed',
        context: { confirmedByOrganizer: true, confirmedAt: new Date().toISOString() },
      });

      if (!res?.data?.success) throw new Error(res?.data?.error || res?.data?.guardResult?.reason || 'Transition refusée');

      setStep('sots');
      toast({ title: '✓ Événement complété', description: 'Soumettez maintenant votre évaluation SOTS.' });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSOTSSubmit() {
    if (sotsRating === 0) return;
    setSubmitting(true);
    setError('');
    try {
      // 1. Soumettre SOTS
      const sotsRes = await base44.functions.invoke('submitSOTSRating', {
        engagementId,
        raterUserId:  user?.id,
        ratingScore:  sotsRating,
        note:         sotsNote,
      });
      if (!sotsRes?.data?.ok) throw new Error(sotsRes?.data?.error || 'Erreur SOTS');

      // 2. Fermer la fenêtre SOTS
      const sotsCloseRes = await base44.functions.invoke('transitionEngagement', {
        engagementId,
        targetState: 'sots_window_closed',
        context: {},
      });
      if (!sotsCloseRes?.data?.success) {
        throw new Error(sotsCloseRes?.data?.error || 'Transition sots_window_closed échouée');
      }

      // 3. Ouvrir la fenêtre de contestation
      const contestRes = await base44.functions.invoke('transitionEngagement', {
        engagementId,
        targetState: 'contestation_window',
        context: {},
      });
      if (!contestRes?.data?.success) {
        throw new Error(contestRes?.data?.error || 'Transition contestation_window échouée');
      }

      // 4. Programmer l'expiration (best-effort)
      const schedRes = await base44.functions.invoke('scheduleContestationExpiration', {
        engagementId,
      }).catch(() => null);

      setCompletionResult({
        sotsRating,
        engagementId,
        contestationWindowDueAt: schedRes?.data?.dueAt || null,
        contestationWindowHours: schedRes?.data?.durationHours || 24,
      });
      setStep('done');
      toast({
        title:       '✓ SOTS soumis — fenêtre de contestation ouverte',
        description: `Vous pourrez forcer le passage à payable manuellement quand la fenêtre sera écoulée.`,
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  // ── NOUVEAU v3 : forcer contestation_window → payable ───────
  async function handleAdvanceToPayable() {
    if (!confirm("Passer l'engagement à 'payable' maintenant ? Cette action met fin à la fenêtre de contestation et permet de déclencher le règlement du talent.")) return;
    setAdvancing(true);
    setError('');
    try {
      const res = await base44.functions.invoke('transitionEngagement', {
        engagementId,
        targetState: 'payable',
        context: { forcedByOrganizer: true },
      });
      if (!res?.data?.success) {
        throw new Error(res?.data?.error || res?.data?.guardResult?.reason || 'Transition payable refusée');
      }
      setStep('payable');
      toast({
        title:       '✓ Engagement payable',
        description: 'Vous pouvez maintenant déclencher le règlement depuis la page Engagement.',
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setAdvancing(false);
    }
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', background: T.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Loader2 size={24} color={T.neon} className="animate-spin" />
    </div>
  );

  const cachetCents = engagement?.cachetSigneCents || 0;
  const commCents   = engagement?.commissionMrCents || Math.floor(cachetCents * 200000 / 1_000_000);
  const talentCents = cachetCents - commCents;

  const base = {
    page:    { minHeight: '100vh', background: T.bg, color: T.text, fontFamily: "'DM Mono', 'Fira Code', monospace" },
    header:  { borderBottom: `1px solid ${T.border}`, padding: '16px 32px', display: 'flex', alignItems: 'center', gap: '8px', background: T.surface },
    logo:    { fontSize: '11px', letterSpacing: '0.3em', color: T.neon, textTransform: 'uppercase', fontWeight: 600 },
    sep:     { color: T.border, margin: '0 6px' },
    nav:     { fontSize: '11px', color: T.muted, letterSpacing: '0.15em', textTransform: 'uppercase', cursor: 'pointer' },
    body:    { maxWidth: '560px', margin: '0 auto', padding: '48px 32px' },
    card:    { background: T.surface, border: `1px solid ${T.border}`, borderRadius: '10px', padding: '28px', marginBottom: '16px' },
    label:   { fontSize: '10px', letterSpacing: '0.3em', textTransform: 'uppercase', color: T.accent, fontWeight: 600, marginBottom: '16px' },
    h2:      { fontSize: '22px', fontWeight: 700, fontFamily: "'DM Serif Display', Georgia, serif", color: T.text, marginBottom: '8px', letterSpacing: '-0.01em' },
    sub:     { fontSize: '13px', color: T.muted, lineHeight: 1.6, marginBottom: '20px' },
    cta:     { width: '100%', padding: '14px', borderRadius: '7px', border: 'none', fontSize: '12px', letterSpacing: '0.15em', textTransform: 'uppercase', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontFamily: "'DM Mono', monospace", marginTop: '8px' },
    errorBox:{ background: '#1a0808', border: `1px solid ${T.error}`, borderRadius: '6px', padding: '10px 14px', fontSize: '12px', color: '#fca5a5', marginBottom: '12px', display: 'flex', gap: '8px', alignItems: 'flex-start' },
  };

  return (
    <div style={base.page}>
      <div style={base.header}>
        <span style={base.logo}>Micro Rave</span>
        <span style={base.sep}>/</span>
        <span style={base.nav} onClick={() => navigate(`/engagement/${engagementId}`)} role="button">Engagement</span>
        <span style={base.sep}>/</span>
        <span style={{ ...base.nav, color: T.text }}>Completion</span>
      </div>

      <div style={base.body}>

        {/* STEP 1 — Confirmation organisateur */}
        {step === 'confirm' && (
          <div style={base.card}>
            <div style={base.label}>Confirmation de prestation</div>
            <h2 style={base.h2}>La prestation a-t-elle eu lieu ?</h2>
            <p style={base.sub}>
              En confirmant, vous activez la fenêtre SOTS et déclenchez le processus de règlement.
              Cette action est irréversible (LOI GREFFIER-01).
            </p>

            <div style={{ background: '#0a0a14', border: `1px solid ${T.border}`, borderRadius: '7px', padding: '14px', marginBottom: '16px' }}>
              <div style={{ fontSize: '10px', letterSpacing: '0.2em', textTransform: 'uppercase', color: T.muted, marginBottom: '10px' }}>
                Règlement à venir
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', padding: '4px 0' }}>
                <span style={{ color: T.muted }}>Talent recevra</span>
                <span style={{ color: T.neon, fontWeight: 700 }}>{(talentCents / 100).toFixed(2)} $</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', padding: '4px 0' }}>
                <span style={{ color: T.muted }}>Commission MR</span>
                <span style={{ color: T.accent }}>{(commCents / 100).toFixed(2)} $</span>
              </div>
            </div>

            {error && (
              <div style={base.errorBox}>
                <AlertCircle size={14} style={{ flexShrink: 0 }} />
                {error}
              </div>
            )}

            <button
              style={{ ...base.cta, background: T.accent, color: 'white', ...(submitting ? { opacity: 0.5, cursor: 'not-allowed' } : {}) }}
              onClick={handleConfirmCompletion}
              disabled={submitting}
            >
              {submitting
                ? <><Loader2 size={14} className="animate-spin" /> Confirmation...</>
                : <><CheckCircle2 size={14} /> Confirmer la prestation</>}
            </button>
            <button
              style={{ ...base.cta, background: 'transparent', border: `1px solid ${T.border}`, color: T.muted, marginTop: '8px' }}
              onClick={() => navigate(`/engagement/${engagementId}`)}
            >
              Annuler
            </button>
          </div>
        )}

        {/* STEP 2 — Notation SOTS */}
        {step === 'sots' && (
          <div style={base.card}>
            <div style={base.label}>
              <Star size={12} style={{ display: 'inline', marginRight: '6px' }} />
              Évaluation SOTS
            </div>
            <h2 style={base.h2}>Évaluez la prestation</h2>
            <p style={base.sub}>
              Le score SOTS (Spirit of the Sound) détermine le coefficient
              de réputation du talent et influence ses futures opportunités.
            </p>

            <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', marginBottom: '24px' }}>
              {[1,2,3,4,5].map(n => (
                <button
                  key={n}
                  onClick={() => setSotsRating(n)}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer', padding: '4px',
                    transition: 'transform 0.1s',
                    transform: sotsRating >= n ? 'scale(1.15)' : 'scale(1)',
                  }}
                >
                  <Star
                    size={36}
                    color={sotsRating >= n ? T.gold : T.border}
                    fill={sotsRating >= n ? T.gold : 'transparent'}
                  />
                </button>
              ))}
            </div>

            {sotsRating > 0 && (
              <div style={{ textAlign: 'center', fontSize: '12px', color: T.muted, marginBottom: '16px' }}>
                {['', 'Insuffisant', 'Passable', 'Bien', 'Très bien', 'Exceptionnel'][sotsRating]}
              </div>
            )}

            <div>
              <div style={{ fontSize: '11px', letterSpacing: '0.15em', textTransform: 'uppercase', color: T.muted, marginBottom: '8px' }}>
                Note optionnelle
              </div>
              <textarea
                value={sotsNote}
                onChange={e => setSotsNote(e.target.value)}
                placeholder="Commentaires sur la prestation, ponctualité, interaction..."
                style={{
                  width: '100%', background: '#0a0a14', border: `1px solid ${T.border}`,
                  borderRadius: '6px', color: T.text, padding: '10px 14px',
                  fontFamily: "'DM Mono', monospace", fontSize: '13px',
                  minHeight: '80px', resize: 'vertical', outline: 'none', boxSizing: 'border-box',
                }}
              />
            </div>

            {error && (
              <div style={{ ...base.errorBox, margin: '12px 0' }}>
                <AlertCircle size={14} /> {error}
              </div>
            )}

            <button
              style={{
                ...base.cta,
                background: sotsRating > 0 ? T.gold : T.border,
                color: sotsRating > 0 ? '#000' : T.muted,
                cursor: sotsRating > 0 ? 'pointer' : 'not-allowed',
                marginTop: '16px',
              }}
              onClick={handleSOTSSubmit}
              disabled={sotsRating === 0 || submitting}
            >
              {submitting
                ? <><Loader2 size={14} className="animate-spin" /> Soumission...</>
                : <><Zap size={14} /> Soumettre l'évaluation</>}
            </button>
          </div>
        )}

        {/* STEP 3 — Fenêtre de contestation ouverte */}
        {step === 'done' && (
          <div style={{ ...base.card, textAlign: 'center' }}>
            <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: `${T.warning}22`, border: `2px solid ${T.warning}`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
              <Shield size={28} color={T.warning} />
            </div>
            <h2 style={base.h2}>Fenêtre de contestation ouverte</h2>
            <p style={{ fontSize: '13px', color: T.muted, lineHeight: 1.6, marginBottom: '24px' }}>
              L'engagement est en <span style={{ color: T.warning }}>contestation_window</span>.
              Pendant cette période, un litige peut être ouvert. Une fois la fenêtre écoulée,
              passez l'engagement à <span style={{ color: T.success }}>payable</span> pour
              déclencher le règlement.
            </p>

            <div style={{ background: '#0a0a14', border: `1px solid ${T.border}`, borderRadius: '7px', padding: '14px', textAlign: 'left', marginBottom: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', padding: '4px 0' }}>
                <span style={{ color: T.muted }}>Talent recevra</span>
                <span style={{ color: T.success, fontWeight: 700 }}>{(talentCents / 100).toFixed(2)} $</span>
              </div>
              {completionResult?.sotsRating && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', padding: '4px 0' }}>
                  <span style={{ color: T.muted }}>Score SOTS</span>
                  <span style={{ color: T.gold }}>{completionResult.sotsRating}/5 ⭐</span>
                </div>
              )}
              {completionResult?.contestationWindowHours && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', padding: '4px 0' }}>
                  <span style={{ color: T.muted }}>Fenêtre prévue</span>
                  <span style={{ color: T.warning }}>{completionResult.contestationWindowHours}h</span>
                </div>
              )}
              {completionResult?.contestationWindowDueAt && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', padding: '4px 0' }}>
                  <span style={{ color: T.muted }}>Expiration prévue</span>
                  <span style={{ color: T.text }}>
                    {new Date(completionResult.contestationWindowDueAt).toLocaleDateString('fr-CA', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              )}
            </div>

            {error && (
              <div style={base.errorBox}>
                <AlertCircle size={14} style={{ flexShrink: 0 }} />
                {error}
              </div>
            )}

            {/* ── NOUVEAU v3 : bouton "Passer à payable maintenant" ── */}
            <button
              style={{
                ...base.cta,
                background: T.success, color: 'white',
                ...(advancing ? { opacity: 0.5, cursor: 'not-allowed' } : {}),
              }}
              onClick={handleAdvanceToPayable}
              disabled={advancing}
            >
              {advancing
                ? <><Loader2 size={14} className="animate-spin" /> Transition…</>
                : <><Zap size={14} /> Passer à payable maintenant</>}
            </button>

            <button
              style={{ ...base.cta, background: T.border, color: T.text, marginTop: '8px' }}
              onClick={() => navigate(`/engagement/${engagementId}`)}
            >
              Voir l'engagement <ArrowRight size={14} />
            </button>
          </div>
        )}

        {/* STEP 4 — Payable atteint */}
        {step === 'payable' && (
          <div style={{ ...base.card, textAlign: 'center' }}>
            <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: `${T.success}22`, border: `2px solid ${T.success}`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
              <DollarSign size={28} color={T.success} />
            </div>
            <h2 style={base.h2}>Engagement payable</h2>
            <p style={{ fontSize: '13px', color: T.muted, lineHeight: 1.6, marginBottom: '24px' }}>
              Le règlement peut être déclenché. Retournez à la page Engagement pour cliquer
              sur « Déclencher le règlement talent ».
            </p>

            <button
              style={{ ...base.cta, background: T.accent, color: 'white' }}
              onClick={() => navigate(`/engagement/${engagementId}`)}
            >
              Aller à l'engagement <ArrowRight size={14} />
            </button>
          </div>
        )}

      </div>
    </div>
  );
}