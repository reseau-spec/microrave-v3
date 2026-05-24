/**
 * MICRO RAVE V3 — pages/TalentPresence.jsx
 * ============================================================
 * Surface d'activation #3 : Check-in talent (GPS + timestamp).
 * Crée le SessionPresence qui débloque PresenceWindowGuard.
 *
 * Transitions impliquées :
 *   → createSessionPresence (Base44 function)
 *   → event_sealed → performed (via PresenceWindowGuard)
 *
 * Source : OS V15 · D-093 (SessionPresence) · PresenceWindowGuard
 * ============================================================
 */

import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { useToast } from '@/components/ui/use-toast';
import { MapPin, Loader2, CheckCircle2, AlertCircle, Navigation, Clock } from 'lucide-react';

const T = {
  bg:      '#06060d',
  surface: '#0e0e18',
  border:  '#1a1a2e',
  accent:  '#059669',
  neon:    '#34d399',
  text:    '#f0fdf4',
  muted:   '#64748b',
  warning: '#f59e0b',
  error:   '#ef4444',
  pulse:   '#10b981',
};

export default function TalentPresence() {
  const { engagementId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();

  const [step, setStep] = useState('idle'); // idle | locating | confirming | submitting | done | error
  const [coords, setCoords] = useState(null);
  const [accuracy, setAccuracy] = useState(null);
  const [engagement, setEngagement] = useState(null);
  const [error, setError] = useState('');
  const [checkinResult, setCheckinResult] = useState(null);
  const watchRef = useRef(null);

  useEffect(() => {
    loadEngagement();
    return () => {
      if (watchRef.current) navigator.geolocation.clearWatch(watchRef.current);
    };
  }, [engagementId]);

  async function loadEngagement() {
    try {
      const res = await base44.functions.invoke('getEngagement', { engagementId });
      if (res?.data?.ok) setEngagement(res.data.engagement);
    } catch {}
  }

  function startLocating() {
    setStep('locating');
    setError('');

    if (!navigator.geolocation) {
      setError('Géolocalisation non disponible sur cet appareil.');
      setStep('error');
      return;
    }

    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setAccuracy(Math.round(pos.coords.accuracy));
        if (pos.coords.accuracy <= 50) {
          setStep('confirming');
          navigator.geolocation.clearWatch(watchRef.current);
        }
      },
      (err) => {
        setError('Accès à la localisation refusé. Vérifiez les permissions de votre appareil.');
        setStep('error');
      },
      { enableHighAccuracy: true, timeout: 30000, maximumAge: 0 }
    );
  }

  async function handleCheckIn() {
    if (step !== 'confirming' || !coords) return;
    setStep('submitting');

    try {
      const res = await base44.functions.invoke('createSessionPresence', {
        engagementId,
        talentUserId:       user?.id,
        gpsLatitude:        coords.lat,
        gpsLongitude:       coords.lng,
        gpsAccuracyMeters:  accuracy,
        checkedInAt:        new Date().toISOString(),
      });

      if (!res?.data?.ok) throw new Error(res?.data?.error || 'Échec du check-in');

      setCheckinResult(res.data);
      setStep('done');
      toast({ title: '✓ Check-in enregistré' });
    } catch (err) {
      setError(err.message);
      setStep('error');
    }
  }

  const containerStyle = {
    minHeight: '100vh',
    background: T.bg,
    color: T.text,
    fontFamily: "'DM Mono', 'Fira Code', monospace",
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
  };

  const cardStyle = {
    background: T.surface,
    border: `1px solid ${T.border}`,
    borderRadius: '12px',
    padding: '36px',
    width: '100%',
    maxWidth: '420px',
    textAlign: 'center',
  };

  const pulseStyle = {
    width: '80px', height: '80px', borderRadius: '50%',
    background: step === 'done' ? `${T.accent}22` : (step === 'error' ? '#ef444422' : `${T.pulse}22`),
    border: `2px solid ${step === 'done' ? T.neon : (step === 'error' ? T.error : T.pulse)}`,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    margin: '0 auto 24px',
    animation: step === 'locating' ? 'pulse 1.5s ease-in-out infinite' : 'none',
  };

  return (
    <div style={containerStyle}>
      <style>{`
        @keyframes pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.08); opacity: 0.7; }
        }
      `}</style>

      <div style={{ fontSize: '10px', letterSpacing: '0.3em', color: T.neon, textTransform: 'uppercase', marginBottom: '24px' }}>
        Micro Rave / Check-in talent
      </div>

      <div style={cardStyle}>
        {/* Icône animée */}
        <div style={pulseStyle}>
          {step === 'done'      && <CheckCircle2 size={32} color={T.neon} />}
          {step === 'error'     && <AlertCircle  size={32} color={T.error} />}
          {step === 'locating'  && <Navigation   size={32} color={T.pulse} />}
          {step === 'submitting'&& <Loader2       size={32} color={T.pulse} className="animate-spin" />}
          {(step === 'idle' || step === 'confirming') && <MapPin size={32} color={step === 'confirming' ? T.neon : T.muted} />}
        </div>

        {/* Titre état */}
        <h2 style={{ fontSize: '20px', fontWeight: 700, fontFamily: "'DM Serif Display', Georgia, serif", color: T.text, marginBottom: '8px', letterSpacing: '-0.01em' }}>
          {step === 'idle'       && 'Check-in sur place'}
          {step === 'locating'   && 'Localisation...'}
          {step === 'confirming' && 'Position confirmée'}
          {step === 'submitting' && 'Enregistrement...'}
          {step === 'done'       && 'Check-in enregistré !'}
          {step === 'error'      && 'Erreur'}
        </h2>

        {/* Description */}
        <p style={{ fontSize: '13px', color: T.muted, marginBottom: '24px', lineHeight: 1.6 }}>
          {step === 'idle'       && 'Appuyez pour confirmer votre présence au lieu de l\'événement.'}
          {step === 'locating'   && `Acquisition du signal GPS... ${accuracy ? `Précision : ${accuracy}m` : ''}`}
          {step === 'confirming' && `Position acquise — précision ${accuracy}m. Prêt à enregistrer.`}
          {step === 'submitting' && 'Enregistrement de votre présence...'}
          {step === 'done'       && checkinResult?.distanceMeters != null && `Distance au lieu : ${Math.round(checkinResult.distanceMeters)}m.`}
          {step === 'error'      && error}
        </p>

        {/* Infos engagement */}
        {engagement && (
          <div style={{ background: '#0a0a14', border: `1px solid ${T.border}`, borderRadius: '8px', padding: '14px', marginBottom: '20px', textAlign: 'left' }}>
            <div style={{ fontSize: '11px', color: T.muted, marginBottom: '8px', letterSpacing: '0.15em', textTransform: 'uppercase' }}>
              Engagement
            </div>
            <div style={{ fontSize: '14px', color: T.text, fontWeight: 600, marginBottom: '4px' }}>
              {engagement.eventName || engagementId}
            </div>
            {engagement.eventDate && (
              <div style={{ fontSize: '12px', color: T.muted, display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Clock size={11} />
                {new Date(engagement.eventDate).toLocaleDateString('fr-CA', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </div>
            )}
            {engagement.venueAddress && (
              <div style={{ fontSize: '12px', color: T.muted, display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                <MapPin size={11} />
                {engagement.venueAddress}
              </div>
            )}
          </div>
        )}

        {/* Coordonnées GPS */}
        {coords && (step === 'confirming' || step === 'done') && (
          <div style={{ fontSize: '11px', color: T.muted, marginBottom: '16px', fontFamily: 'monospace' }}>
            {coords.lat.toFixed(6)}, {coords.lng.toFixed(6)} · ±{accuracy}m
          </div>
        )}

        {/* Bouton principal */}
        {step === 'idle' && (
          <button onClick={startLocating} style={{
            width: '100%', padding: '14px', borderRadius: '8px', border: 'none',
            background: T.accent, color: 'white',
            fontSize: '12px', letterSpacing: '0.2em', textTransform: 'uppercase',
            fontWeight: 600, cursor: 'pointer', display: 'flex',
            alignItems: 'center', justifyContent: 'center', gap: '8px',
            fontFamily: "'DM Mono', monospace",
          }}>
            <Navigation size={14} /> Activer la localisation
          </button>
        )}

        {step === 'locating' && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: '13px', color: T.muted }}>
            <Loader2 size={16} className="animate-spin" />
            Attente signal GPS...
          </div>
        )}

        {step === 'confirming' && (
          <button onClick={handleCheckIn} style={{
            width: '100%', padding: '14px', borderRadius: '8px', border: 'none',
            background: T.neon, color: '#000',
            fontSize: '12px', letterSpacing: '0.2em', textTransform: 'uppercase',
            fontWeight: 700, cursor: 'pointer', display: 'flex',
            alignItems: 'center', justifyContent: 'center', gap: '8px',
            fontFamily: "'DM Mono', monospace",
          }}>
            <CheckCircle2 size={14} /> Confirmer le check-in
          </button>
        )}

        {step === 'done' && (
          <div>
            <div style={{ fontSize: '12px', color: T.neon, marginBottom: '16px' }}>
              Votre présence est enregistrée dans le registre institutionnel Micro Rave.
            </div>
            <button onClick={() => navigate(`/engagement/${engagementId}`)} style={{
              width: '100%', padding: '12px', borderRadius: '6px', border: `1px solid ${T.border}`,
              background: 'transparent', color: T.text, fontSize: '12px',
              cursor: 'pointer', fontFamily: "'DM Mono', monospace", letterSpacing: '0.1em',
            }}>
              Voir l'engagement
            </button>
          </div>
        )}

        {step === 'error' && (
          <button onClick={() => setStep('idle')} style={{
            width: '100%', padding: '12px', borderRadius: '6px', border: `1px solid ${T.border}`,
            background: 'transparent', color: T.muted, fontSize: '12px',
            cursor: 'pointer', fontFamily: "'DM Mono', monospace", letterSpacing: '0.1em',
          }}>
            Réessayer
          </button>
        )}
      </div>
    </div>
  );
}