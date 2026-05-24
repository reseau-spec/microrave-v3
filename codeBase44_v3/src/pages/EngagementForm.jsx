/**
 * MICRO RAVE V3 — pages/EngagementForm.jsx
 * ============================================================
 * Surface d'activation #1 : Création d'engagement.
 * L'organisateur renseigne l'event, choisit le talent,
 * fixe le cachet. Déclenche placed → transitionEngagement().
 *
 * Flux : placed (via base44.functions.invoke('createEngagement'))
 *
 * Source : OS V15 · D-013 (PlacementGuard) · D-019-A
 * ============================================================
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  MapPin, Calendar, Music, DollarSign,
  ArrowRight, Loader2, CheckCircle2, AlertCircle
} from 'lucide-react';

// ── Tokens visuels Micro Rave V3 ──────────────────────────────
const MR_DARK    = '#0a0a0f';
const MR_SURFACE = '#12121a';
const MR_BORDER  = '#1e1e2e';
const MR_ACCENT  = '#7c3aed';
const MR_NEON    = '#a78bfa';
const MR_TEXT    = '#e2e8f0';
const MR_MUTED   = '#64748b';
const MR_SUCCESS = '#10b981';
const MR_ERROR   = '#ef4444';

const styles = {
  page: {
    minHeight: '100vh',
    background: MR_DARK,
    color: MR_TEXT,
    fontFamily: "'DM Mono', 'Fira Code', monospace",
    padding: '0',
  },
  header: {
    borderBottom: `1px solid ${MR_BORDER}`,
    padding: '20px 32px',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    background: MR_SURFACE,
  },
  logo: {
    fontSize: '11px',
    letterSpacing: '0.3em',
    color: MR_NEON,
    textTransform: 'uppercase',
    fontWeight: 600,
  },
  title: {
    fontSize: '11px',
    letterSpacing: '0.2em',
    color: MR_MUTED,
    textTransform: 'uppercase',
  },
  sep: { color: MR_BORDER, margin: '0 8px' },
  body: {
    maxWidth: '680px',
    margin: '0 auto',
    padding: '48px 32px',
  },
  h1: {
    fontSize: '28px',
    fontWeight: 700,
    fontFamily: "'DM Serif Display', Georgia, serif",
    color: MR_TEXT,
    marginBottom: '8px',
    letterSpacing: '-0.02em',
  },
  subtitle: {
    fontSize: '13px',
    color: MR_MUTED,
    marginBottom: '40px',
    letterSpacing: '0.02em',
  },
  section: {
    background: MR_SURFACE,
    border: `1px solid ${MR_BORDER}`,
    borderRadius: '8px',
    padding: '28px',
    marginBottom: '20px',
  },
  sectionTitle: {
    fontSize: '10px',
    letterSpacing: '0.3em',
    textTransform: 'uppercase',
    color: MR_ACCENT,
    fontWeight: 600,
    marginBottom: '20px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  grid2: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '16px',
  },
  field: { display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '16px' },
  label: {
    fontSize: '11px',
    letterSpacing: '0.15em',
    textTransform: 'uppercase',
    color: MR_MUTED,
    fontWeight: 500,
  },
  input: {
    background: '#0d0d14',
    border: `1px solid ${MR_BORDER}`,
    borderRadius: '6px',
    color: MR_TEXT,
    fontSize: '14px',
    padding: '10px 14px',
    fontFamily: "'DM Mono', monospace",
    outline: 'none',
    transition: 'border-color 0.2s',
    width: '100%',
    boxSizing: 'border-box',
  },
  inputFocus: { borderColor: MR_ACCENT },
  textarea: {
    background: '#0d0d14',
    border: `1px solid ${MR_BORDER}`,
    borderRadius: '6px',
    color: MR_TEXT,
    fontSize: '14px',
    padding: '10px 14px',
    fontFamily: "'DM Mono', monospace",
    outline: 'none',
    resize: 'vertical',
    minHeight: '80px',
    width: '100%',
    boxSizing: 'border-box',
  },
  waterfall: {
    background: '#0d0d14',
    border: `1px solid ${MR_BORDER}`,
    borderRadius: '6px',
    padding: '16px',
    marginTop: '12px',
  },
  waterfallRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '4px 0',
    fontSize: '13px',
  },
  waterfallLabel: { color: MR_MUTED },
  waterfallValue: { color: MR_TEXT, fontWeight: 500 },
  waterfallTotal: { color: MR_NEON, fontWeight: 700, fontSize: '14px' },
  divider: { borderTop: `1px solid ${MR_BORDER}`, margin: '8px 0' },
  cta: {
    width: '100%',
    background: MR_ACCENT,
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    padding: '14px 24px',
    fontSize: '13px',
    letterSpacing: '0.15em',
    textTransform: 'uppercase',
    fontWeight: 600,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
    transition: 'opacity 0.2s',
    fontFamily: "'DM Mono', monospace",
    marginTop: '8px',
  },
  ctaDisabled: { opacity: 0.4, cursor: 'not-allowed' },
  error: {
    background: '#1a0808',
    border: `1px solid ${MR_ERROR}`,
    borderRadius: '6px',
    padding: '12px 16px',
    fontSize: '13px',
    color: '#fca5a5',
    display: 'flex',
    alignItems: 'flex-start',
    gap: '10px',
    marginTop: '16px',
  },
  success: {
    background: '#031a0f',
    border: `1px solid ${MR_SUCCESS}`,
    borderRadius: '6px',
    padding: '20px',
    textAlign: 'center',
    marginTop: '16px',
  },
};

// Calcul waterfall preview
function calcWaterfall(cachetStr, tauxPpm = 120000) {
  const cachet = parseFloat(cachetStr) || 0;
  const cachetCents = Math.round(cachet * 100);
  const commissionCents = Math.floor(cachetCents * tauxPpm / 1_000_000);
  const talentNetCents = cachetCents - commissionCents;
  const depositCents = Math.floor(cachetCents * 200000 / 1_000_000); // 20%
  return { cachetCents, commissionCents, talentNetCents, depositCents };
};

function fmt(cents) {
  return `${(cents / 100).toFixed(2)} $`;
}

export default function EngagementForm() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();

  const [loading, setLoading] = useState(false);
  const [created, setCreated] = useState(null);
  const [error, setError] = useState('');
  const [focusedField, setFocusedField] = useState(null);

  const [form, setForm] = useState({
    talentUserId:   '',
    eventName:      '',
    eventDate:      '',
    venueAddress:   '',
    cachetSigne:    '',
    description:    '',
  });

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const wf = calcWaterfall(form.cachetSigne);
  const isValid = form.talentUserId && form.eventName && form.eventDate &&
                  form.venueAddress && form.roleMetier && parseFloat(form.cachetSigne) > 0;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!isValid || loading) return;
    setLoading(true);
    setError('');

    try {
      const res = await base44.functions.invoke('createEngagement', {
        organizerUserId: user?.id,
        talentUserId:    form.talentUserId,
        eventName:       form.eventName,
        eventDate:       form.eventDate,
        venueAddress:    form.venueAddress,
        cachetSigneCents: wf.cachetCents,
        roleMetier:      form.roleMetier,
        description:     form.description,
      });

      if (!res?.data?.ok) {
        throw new Error(res?.data?.error || res?.data?.code || 'Erreur inconnue');
      }

      setCreated(res.data);
      toast({ title: '✓ Engagement créé', description: `${res.data.engagementId}` });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const inputStyle = (name) => ({
    ...styles.input,
    ...(focusedField === name ? styles.inputFocus : {}),
  });

  if (created) {
    return (
      <div style={styles.page}>
        <div style={styles.header}>
          <span style={styles.logo}>Micro Rave</span>
          <span style={styles.sep}>/</span>
          <span style={styles.title}>Engagement créé</span>
        </div>
        <div style={styles.body}>
          <div style={styles.success}>
            <CheckCircle2 size={32} color={MR_SUCCESS} style={{ margin: '0 auto 12px' }} />
            <div style={{ fontSize: '18px', fontWeight: 700, color: MR_TEXT, marginBottom: '8px' }}>
              Engagement placé
            </div>
            <div style={{ fontSize: '13px', color: MR_MUTED, marginBottom: '16px' }}>
              {created.engagementId} — état : <span style={{ color: MR_NEON }}>placed</span>
            </div>
            <div style={{ fontSize: '12px', color: MR_MUTED, marginBottom: '20px' }}>
              Prochaine étape : le talent doit accepter, puis l'organisateur paie le dépôt de {fmt(wf.depositCents)}.
            </div>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button
                style={{ ...styles.cta, width: 'auto', padding: '10px 20px', background: MR_BORDER }}
                onClick={() => { setCreated(null); setForm({ talentUserId:'',eventName:'',eventDate:'',venueAddress:'',cachetSigne:'',description:'' }); }}
              >
                Créer un autre
              </button>
              <button
                style={{ ...styles.cta, width: 'auto', padding: '10px 20px' }}
                onClick={() => navigate(`/engagement/${created.engagementId}`)}
              >
                Voir l'engagement <ArrowRight size={14} />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <span style={styles.logo}>Micro Rave</span>
        <span style={styles.sep}>/</span>
        <span style={styles.title}>Nouvel engagement</span>
      </div>

      <div style={styles.body}>
        <h1 style={styles.h1}>Créer un engagement</h1>
        <p style={styles.subtitle}>
          Institution de règlement — chaque engagement est un contrat souverain.
        </p>

        <form onSubmit={handleSubmit}>

          {/* Section événement */}
          <div style={styles.section}>
            <div style={styles.sectionTitle}>
              <Calendar size={12} />
              Événement
            </div>

            <div style={styles.field}>
              <label style={styles.label}>Nom de l'événement</label>
              <input
                style={inputStyle('eventName')}
                placeholder="ex: ALL NIGHT LONG — Avril 2026"
                value={form.eventName}
                onChange={set('eventName')}
                onFocus={() => setFocusedField('eventName')}
                onBlur={() => setFocusedField(null)}
              />
            </div>

            <div style={styles.grid2}>
              <div style={styles.field}>
                <label style={styles.label}>Date</label>
                <input
                  type="datetime-local"
                  style={inputStyle('eventDate')}
                  value={form.eventDate}
                  onChange={set('eventDate')}
                  onFocus={() => setFocusedField('eventDate')}
                  onBlur={() => setFocusedField(null)}
                />
              </div>
              <div style={styles.field}>
                <label style={styles.label}>Adresse du lieu</label>
                <input
                  style={inputStyle('venueAddress')}
                  placeholder="ex: 123 rue Saint-Denis, Mtl"
                  value={form.venueAddress}
                  onChange={set('venueAddress')}
                  onFocus={() => setFocusedField('venueAddress')}
                  onBlur={() => setFocusedField(null)}
                />
              </div>
            </div>

            <div style={styles.field}>
              <label style={styles.label}>Description (optionnel)</label>
              <textarea
                style={styles.textarea}
                placeholder="Contexte, attentes, notes pour le talent..."
                value={form.description}
                onChange={set('description')}
              />
            </div>
          </div>

          {/* Section talent */}
          <div style={styles.section}>
            <div style={styles.sectionTitle}>
              <Music size={12} />
              Talent
            </div>

            <div style={styles.grid2}>
              <div style={styles.field}>
                <label style={styles.label}>ID Talent (USR-*)</label>
                <input
                  style={inputStyle('talentUserId')}
                  placeholder="ex: USR-MPIG0A0O-9CZ5JA"
                  value={form.talentUserId}
                  onChange={set('talentUserId')}
                  onFocus={() => setFocusedField('talentUserId')}
                  onBlur={() => setFocusedField(null)}
                />
                <span style={{ fontSize: '11px', color: MR_MUTED, marginTop: '4px' }}>
                  L'ID système du talent.
                </span>
              </div>
              <div style={styles.field}>
                <label style={styles.label}>Rôle métier</label>
                <input
                  style={inputStyle('roleMetier')}
                  placeholder="DJ, MC, photographe, technicien..."
                  value={form.roleMetier}
                  onChange={set('roleMetier')}
                  onFocus={() => setFocusedField('roleMetier')}
                  onBlur={() => setFocusedField(null)}
                />
              </div>
            </div>
          </div>

          {/* Section financière */}
          <div style={styles.section}>
            <div style={styles.sectionTitle}>
              <DollarSign size={12} />
              Waterfall financier
            </div>

            <div style={styles.field}>
              <label style={styles.label}>Cachet signé (CAD)</label>
              <input
                style={inputStyle('cachetSigne')}
                type="number"
                min="0"
                step="0.01"
                placeholder="ex: 300.00"
                value={form.cachetSigne}
                onChange={set('cachetSigne')}
                onFocus={() => setFocusedField('cachetSigne')}
                onBlur={() => setFocusedField(null)}
              />
            </div>

            {wf.cachetCents > 0 && (
              <div style={styles.waterfall}>
                <div style={{ fontSize: '10px', letterSpacing: '0.2em', textTransform: 'uppercase', color: MR_MUTED, marginBottom: '10px' }}>
                  Aperçu waterfall (taux Freemium 12%)
                </div>
                <div style={styles.waterfallRow}>
                  <span style={styles.waterfallLabel}>Cachet signé</span>
                  <span style={styles.waterfallValue}>{fmt(wf.cachetCents)}</span>
                </div>
                <div style={styles.waterfallRow}>
                  <span style={styles.waterfallLabel}>Commission MR (12%)</span>
                  <span style={{ ...styles.waterfallValue, color: MR_ACCENT }}>− {fmt(wf.commissionCents)}</span>
                </div>
                <div style={styles.divider} />
                <div style={styles.waterfallRow}>
                  <span style={styles.waterfallLabel}>Net talent</span>
                  <span style={styles.waterfallTotal}>{fmt(wf.talentNetCents)}</span>
                </div>
                <div style={{ ...styles.divider, marginTop: '12px' }} />
                <div style={styles.waterfallRow}>
                  <span style={styles.waterfallLabel}>Dépôt requis (20%)</span>
                  <span style={{ ...styles.waterfallValue, color: '#fbbf24' }}>{fmt(wf.depositCents)}</span>
                </div>
              </div>
            )}
          </div>

          {error && (
            <div style={styles.error}>
              <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '1px' }} />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            style={{ ...styles.cta, ...((!isValid || loading) ? styles.ctaDisabled : {}) }}
            disabled={!isValid || loading}
          >
            {loading ? (
              <><Loader2 size={16} className="animate-spin" /> Création en cours...</>
            ) : (
              <>Placer l'engagement <ArrowRight size={16} /></>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}