/**
 * MICRO RAVE V3 — pages/EventCompletion.jsx
 * ============================================================
 * Surface d'activation #4 : Confirmation de completion.
 * L'organisateur confirme que la prestation a eu lieu.
 * Déclenche performed → event_completed → SOTS → payable → payout.
 *
 * Transitions déclenchées depuis cette page :
 *   performed → event_completed (EventCompletionGuard)
 *   → sots_window_closed (SOTSWindowGuard, auto après fenêtre)
 *   → contestation_window → payable (PresenceProofGuard)
 *   → settled → archived (LedgerInvariantGuard + ArchiveWORMGuard)
 *
 * Source : OS V15 · D-075 (conditions PresenceProofGuard)
 *          D-019-B (contestation_window) · D-101 (PayoutExecutor)
 * ============================================================
 */

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { useToast } from '@/components/ui/use-toast';
import {
  CheckCircle2, AlertCircle, Loader2, Star,
  DollarSign, Clock, ArrowRight, Shield, Zap
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
  error:   '#ef4444',
};

export default function EventCompletion() {
  const { engagementId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();

  const [engagement, setEngagement] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [step, setStep] = useState('confirm'); // confirm | sots | done | error
  const [sotsRating, setSotsRating] = useState(0);
  const [sotsNote, setSotsNote] = useState('');
  const [completionResult, setCompletionResult] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => { loadEngagement(); }, [engagementId]);

  async function loadEngagement() {
    try {
      const res = await base44.functions.invoke('getEngagement', { engagementId });
      if (res?.data?.ok) {
        setEngagement(res.data.engagement);
        if (res.data.engagement.status === 'performed') setStep('confirm');
        else if (res.data.engagement.status === 'event_completed') setStep('sots');
        else if (['payable','settled','archived'].includes(res.data.engagement.status)) setStep('done');
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
        actorUserId: user?.id,
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

      // 2. Fermer fenêtre SOTS
      // La durée de la fenêtre SOTS (sots_window_duration_hours) est gérée par
      // SchedulerDueTask en Phase 2. Pour le pilote MVP, on ferme manuellement
      // après soumission de la note — comportement identique mais sans délai.
      const sotsCloseRes = await base44.functions.invoke('transitionEngagement', {
        engagementId,
        targetState: 'sots_window_closed',
        actorUserId: user?.id,
        context: {},
      });
      if (!sotsCloseRes?.data?.success) {
        throw new Error(sotsCloseRes?.data?.error || 'Transition sots_window_closed échouée');
      }

      // 3. Ouvrir la fenêtre de contestation
      // IMPORTANT : contrairement à l'appel précédent, on n'avance PAS immédiatement
      // vers payable ici. La fenêtre de contestation a une durée réelle configurée
      // dans PolicyConfig (contestationWindowDurationHours, défaut 24h).
      //
      // Mécanisme MVP :
      //   a) On crée un SchedulerDueTask CONTESTATION_WINDOW_EXPIRATION avec
      //      dueAt = maintenant + contestationWindowDurationHours.
      //   b) Le cron (cron.js) vérifie les tâches dues et déclenche payable.
      //   c) Pendant la fenêtre, un acteur peut ouvrir un litige (disputed).
      //
      // Ce comportement est conforme à D-019-B et protège le talent.
      const contestRes = await base44.functions.invoke('transitionEngagement', {
        engagementId,
        targetState: 'contestation_window',
        actorUserId: user?.id,
        context: {},
      });
      if (!contestRes?.data?.success) {
        throw new Error(contestRes?.data?.error || 'Transition contestation_window échouée');
      }

      // 4. Créer la SchedulerDueTask pour l'expiration de la fenêtre de contestation.
      //    Le cron lira cette tâche et déclenchera contestation_window → payable
      //    après contestationWindowDurationHours (PolicyConfig).
      const schedRes = await base44.functions.invoke('scheduleContestationExpiration', {
        engagementId,
      }).catch(() => null); // Non-bloquant — si absent, le fondateur déclenche manuellement

      setCompletionResult({
        sotsRating,
        engagementId,
        contestationWindowDueAt: schedRes?.data?.dueAt || null,
        contestationWindowHours: schedRes?.data?.durationHours || 24,
      });
      setStep('done');
      toast({
        title:       '✓ SOTS soumis — fenêtre de contestation ouverte',
        description: `Durée : ${schedRes?.data?.durationHours || 24}h. Le payout sera déclenché automatiquement à l'expiration.`,
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', background: T.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Loader2 size={24} color={T.neon} className="animate-spin" />
    </div>
  );

  const cachetCents = engagement?.cachetSigneCents || 0;
  const commCents   = engagement?.commissionMrCents || Math.floor(cachetCents * 120000 / 1_000_000);
  const talentCents = cachetCents - commCents;

  const base = {
    page:    { minHeight: '100vh', background: T.bg, color: T.text, fontFamily: "'DM Mono', 'Fira Code', monospace" },
    header:  { borderBottom: `1px solid ${T.border}`, padding: '16px 32px', display: 'flex', alignItems: 'center', gap: '8px', background: T.surface },
    logo:    { fontSize: '11px', letterSpacing: '0.3em', color: T.neon, textTransform: 'uppercase', fontWeight: 600 },
    sep:     { color: T.border, margin: '0 6px' },
    nav:     { fontSize: '11px', color: T.muted, letterSpacing: '0.15em', textTransform: 'uppercase' },
    body:    { maxWidth: '560px', margin: '0 auto', padding: '48px 32px' },
    card:    { background: T.surface, border: `1px solid ${T.border}`, borderRadius: '10px', padding: '28px', marginBottom: '16px' },
    label:   { fontSize: '10px', letterSpacing: '0.3em', textTransform: 'uppercase', color: T.accent, fontWeight: 600, marginBottom: '16px' },
    h2:      { fontSize: '22px', fontWeight: 700, fontFamily: "'DM Serif Display', Georgia, serif", color: T.text, marginBottom: '8px', letterSpacing: '-0.01em' },
    sub:     { fontSize: '13px', color: T.muted, lineHeight: 1.6, marginBottom: '20px' },
    cta:     { width: '100%', padding: '14px', borderRadius: '7px', border: 'none', fontSize: '12px', letterSpacing: '0.15em', textTransform: 'uppercase', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontFamily: "'DM Mono', monospace", marginTop: '8px' },
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
          <>
            <div style={base.card}>
              <div style={base.label}>Confirmation de prestation</div>
              <h2 style={base.h2}>La prestation a-t-elle eu lieu ?</h2>
              <p style={base.sub}>
                En confirmant, vous activez la fenêtre SOTS et déclenchez le processus de règlement.
                Cette action est irréversible (LOI GREFFIER-01).
              </p>

              {/* Résumé financier */}
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
                <div style={{ background: '#1a0808', border: `1px solid ${T.error}`, borderRadius: '6px', padding: '10px 14px', fontSize: '12px', color: '#fca5a5', marginBottom: '12px', display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                  <AlertCircle size={14} style={{ flexShrink: 0 }} />
                  {error}
                </div>
              )}

              <button
                style={{ ...base.cta, background: T.accent, color: 'white', ...(submitting ? { opacity: 0.5, cursor: 'not-allowed' } : {}) }}
                onClick={handleConfirmCompletion}
                disabled={submitting}
              >
                {submitting ? <><Loader2 size={14} className="animate-spin" /> Confirmation...</> : <><CheckCircle2 size={14} /> Confirmer la prestation</>}
              </button>
              <button
                style={{ ...base.cta, background: 'transparent', border: `1px solid ${T.border}`, color: T.muted, marginTop: '8px' }}
                onClick={() => navigate(`/engagement/${engagementId}`)}
              >
                Annuler
              </button>
            </div>
          </>
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
              Le score SOTS (Score Objectif de Territoire et de Service) détermine le coefficient
              de réputation du talent et influence ses futures opportunités.
            </p>

            {/* Stars */}
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
              <div style={{ background: '#1a0808', border: `1px solid ${T.error}`, borderRadius: '6px', padding: '10px 14px', fontSize: '12px', color: '#fca5a5', margin: '12px 0', display: 'flex', gap: '8px' }}>
                <AlertCircle size={14} /> {error}
              </div>
            )}

            <button
              style={{ ...base.cta, background: sotsRating > 0 ? T.gold : T.border, color: sotsRating > 0 ? '#000' : T.muted, cursor: sotsRating > 0 ? 'pointer' : 'not-allowed', marginTop: '16px' }}
              onClick={handleSOTSSubmit}
              disabled={sotsRating === 0 || submitting}
            >
              {submitting ? <><Loader2 size={14} className="animate-spin" /> Soumission...</> : <><Zap size={14} /> Soumettre et déclencher le règlement</>}
            </button>
          </div>
        )}

        {/* STEP 3 — Done */}
        {step === 'done' && (
          <div style={{ ...base.card, textAlign: 'center' }}>
            <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: `${T.success}22`, border: `2px solid ${T.success}`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
              <CheckCircle2 size={28} color={T.success} />
            </div>
            <h2 style={base.h2}>Règlement déclenché</h2>
            <p style={{ fontSize: '13px', color: T.muted, lineHeight: 1.6, marginBottom: '24px' }}>
              L'engagement entre en contestation_window. Si aucun litige n'est ouvert,
              le payout sera exécuté automatiquement.
            </p>

            <div style={{ background: '#0a0a14', border: `1px solid ${T.border}`, borderRadius: '7px', padding: '14px', textAlign: 'left', marginBottom: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', padding: '4px 0' }}>
                <span style={{ color: T.muted }}>Talent payé</span>
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
                  <span style={{ color: T.muted }}>Fenêtre de contestation</span>
                  <span style={{ color: T.warning }}>{completionResult.contestationWindowHours}h</span>
                </div>
              )}
              {completionResult?.contestationWindowDueAt && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', padding: '4px 0' }}>
                  <span style={{ color: T.muted }}>Payout prévu le</span>
                  <span style={{ color: T.text }}>
                    {new Date(completionResult.contestationWindowDueAt).toLocaleDateString('fr-CA', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              )}
            </div>

            <button
              style={{ ...base.cta, background: T.border, color: T.text }}
              onClick={() => navigate(`/engagement/${engagementId}`)}
            >
              Voir l'engagement <ArrowRight size={14} />
            </button>
          </div>
        )}

      </div>
    </div>
  );
}