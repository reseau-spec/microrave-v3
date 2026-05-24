import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Check, X, Clock, Users, MapPin, Music2, ShieldCheck, AlertTriangle, Navigation, LogOut } from 'lucide-react';
import { base44 } from '@/api/base44Client';

// ── PresenceBanner ─────────────────────────────────────────────────────────────
// Gère le check-in GPS dès que la session passe en in_progress.
// Appelle enterEventSession avec la géolocalisation du navigateur.
// Résultat visible : badge "Présence confirmée" ou "Présence non vérifiée".
function PresenceBanner({ session, userRole, onCheckedIn }) {
  const [status, setStatus] = useState('idle');
  // idle | requesting_geo | checking_in | confirmed | geo_denied | failed

  const [score, setScore] = useState(null);
  const [distanceM, setDistanceM] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');

  // Verrou anti-doublon — empêche les appels parallèles (React double-render, retry auto)
  // La race condition créait 2-3 SessionPresence pour le même user dans la même session.
  const isCheckinInFlight = useRef(false);

  // Déclencher le check-in automatiquement au montage
  useEffect(() => {
    if (session?.id && status === 'idle') {
      doCheckin();
    }
  }, [session?.id]);

  const doCheckin = async () => {
    // Verrou frontend — un seul appel à la fois
    if (isCheckinInFlight.current) return;
    isCheckinInFlight.current = true;

    setStatus('requesting_geo');

    // Demander la géolocalisation au navigateur
    if (!navigator.geolocation) {
      // Navigateur sans GPS — check-in sans coordonnées (soft fail pour audience)
      await callCheckin(null, null);
      isCheckinInFlight.current = false;
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        await callCheckin(pos.coords.latitude, pos.coords.longitude);
        isCheckinInFlight.current = false;
      },
      async (err) => {
        // GPS refusé ou indisponible
        if (userRole === 'artist' || userRole === 'organizer') {
          setStatus('geo_denied');
          setErrorMsg('Géolocalisation refusée. Le check-in artiste requiert le GPS.');
          isCheckinInFlight.current = false;
        } else {
          // Audience : check-in sans GPS (score partiel)
          await callCheckin(null, null);
          isCheckinInFlight.current = false;
        }
      },
      { timeout: 8000, maximumAge: 30000, enableHighAccuracy: true }
    );
  };

  const callCheckin = async (lat, lng) => {
    setStatus('checking_in');
    try {
      const payload = { sessionId: session.id, role: userRole || 'audience' };
      if (lat != null) { payload.geoLat = lat; payload.geoLng = lng; }

      const res = await base44.functions.invoke('enterEventSession', payload);
      const data = res?.data;

      if (data?.ok) {
        if (data.action === 'already_checked_in') {
          // Déjà checké — récupérer le score depuis la présence existante
          setScore(data.validationScore ?? data.existingScore ?? null);
          setDistanceM(data.distanceM ?? null);
          setStatus('confirmed');
        } else {
          setScore(data.validationScore);
          setDistanceM(data.distanceM ?? null);
          setStatus('confirmed');
          if (onCheckedIn) onCheckedIn(data);
        }
      } else {
        setStatus('failed');
        setErrorMsg(data?.message || data?.error || 'Erreur lors du check-in');
      }
    } catch (err) {
      setStatus('failed');
      setErrorMsg(err?.message || 'Erreur réseau');
    }
  };

  // ── Rendu selon le statut ──────────────────────────────────────────────────
  if (status === 'idle' || status === 'requesting_geo') {
    return (
      <Card className="border border-indigo-200 bg-indigo-50">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center gap-3">
            <Navigation className="w-4 h-4 text-indigo-500 animate-pulse shrink-0" />
            <p className="text-sm text-indigo-700">
              Vérification de ta présence sur les lieux…
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (status === 'checking_in') {
    return (
      <Card className="border border-indigo-200 bg-indigo-50">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center gap-3">
            <Loader2 className="w-4 h-4 text-indigo-500 animate-spin shrink-0" />
            <p className="text-sm text-indigo-700">Confirmation de présence en cours…</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (status === 'confirmed') {
    const isStrong = score >= 70;
    return (
      <Card className={`border ${isStrong ? 'border-green-200 bg-green-50' : 'border-yellow-200 bg-yellow-50'}`}>
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <ShieldCheck className={`w-4 h-4 shrink-0 ${isStrong ? 'text-green-600' : 'text-yellow-600'}`} />
              <div>
                <p className={`text-sm font-semibold ${isStrong ? 'text-green-800' : 'text-yellow-800'}`}>
                  {isStrong ? '✓ Présence confirmée' : 'Présence enregistrée (score partiel)'}
                </p>
                {distanceM != null && (
                  <p className="text-xs text-gray-500 mt-0.5">
                    {distanceM}m du lieu · Score {score}/100
                  </p>
                )}
              </div>
            </div>
            <Badge className={`text-xs border-0 ${isStrong ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
              {score}/100
            </Badge>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (status === 'geo_denied') {
    return (
      <Card className="border border-red-200 bg-red-50">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-red-800">GPS requis</p>
              <p className="text-xs text-red-600 mt-0.5">{errorMsg}</p>
            </div>
            <Button size="sm" variant="outline" className="text-xs shrink-0" onClick={doCheckin}>
              Réessayer
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (status === 'failed') {
    return (
      <Card className="border border-orange-200 bg-orange-50">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-4 h-4 text-orange-500 mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="text-sm text-orange-800">{errorMsg}</p>
            </div>
            <Button size="sm" variant="outline" className="text-xs shrink-0" onClick={doCheckin}>
              Réessayer
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return null;
}

// ── InProgressView ─────────────────────────────────────────────────────────────
export default function InProgressView({
  session,
  user,
  sessionTime,
  selectedCheckpoint,
  profilesCache,
  roleLabels,
  styleLabels,
  actionLoading,
  normalizeId,
  asArray,
  onComplete,
  onAbort,
}) {
  const participants = asArray(session?.participants);
  const [presenceData, setPresenceData] = useState(null);
  const [presenceCounts, setPresenceCounts] = useState(null);
  // presenceCounts = { organizer: 0, talent: 0, payer: 0, audience: 0, total: 0 }

  // Charger et classifier les SessionPresence en temps réel
  // Reload toutes les 5s pendant la session pour refléter les arrivées
  useEffect(() => {
    if (session?.sessionType !== 'event' || !session?.id) return;

    const loadPresences = async () => {
      try {
        const presences = await base44.entities.SessionPresence
          .filter({ sessionId: session.id, status: 'active' })
          .catch(() => []);
        if (!presences || presences.length === 0) {
          setPresenceCounts({ organizer: 0, talent: 0, payer: 0, audience: 0, total: 0 });
          return;
        }

        // Résoudre les IDs de référence depuis session + event
        // Organisateur : session.hostUserId
        const organizerUserId = normalizeId(session.hostUserId);

        // Talents confirmés : session.slots avec status='confirmed'
        const talentIds = new Set(
          asArray(session.slots)
            .filter(s => s.status === 'confirmed' && s.candidateUserId)
            .map(s => normalizeId(s.candidateUserId))
        );
        // Aussi dans participants avec roleSystemId non-ORGANIZER
        asArray(session.participants).forEach(p => {
          const rid = normalizeId(p?.roleSystemId);
          if (rid && rid !== 'RL-ORGANIZER' && p?.userId) {
            talentIds.add(normalizeId(p.userId));
          }
        });

        // Payeur : session.payerUserId ou event (chargé si disponible)
        const payerUserId = normalizeId(session.payerUserId);

        // Dédupliquer par userId (ignorer doublons race condition)
        const seen = new Set();
        const counts = { organizer: 0, talent: 0, payer: 0, audience: 0, total: 0 };
        for (const p of presences) {
          const uid = normalizeId(p.userId);
          if (!uid || seen.has(uid)) continue;
          seen.add(uid);
          counts.total++;
          if (uid === organizerUserId)   counts.organizer++;
          else if (talentIds.has(uid))   counts.talent++;
          else if (payerUserId && uid === payerUserId) counts.payer++;
          else                           counts.audience++;
        }
        setPresenceCounts(counts);
      } catch (e) {
        console.warn('[InProgressView] presenceCounts load failed:', e?.message);
      }
    };

    loadPresences();
    const interval = setInterval(loadPresences, 5000);
    return () => clearInterval(interval);
  }, [session?.id, session?.sessionType]);

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Déterminer le rôle de l'utilisateur courant dans la session
  const myParticipant = participants.find(p => normalizeId(p?.userId) === normalizeId(user?.id));
  const myRoleId = normalizeId(myParticipant?.roleSystemId);
  const userRole = myRoleId === 'RL-ORGANIZER'
    ? 'organizer'
    : myRoleId
    ? 'artist'
    : 'audience';

  // Organisateur : ferme la session pour tout le monde
  const handleCompleteWithCheckout = async () => {
    if (session?.sessionType === 'event') {
      try {
        await base44.functions.invoke('exitEventSession', { sessionId: session.id });
      } catch (e) {
        console.warn('[InProgressView] exitEventSession error (non-fatal):', e?.message);
      }
    }
    onComplete();
  };

  // Artiste / audience : départ individuel — la session continue
  const handleLeave = async () => {
    if (session?.sessionType !== 'event') { onComplete(); return; }
    try {
      await base44.functions.invoke('exitEventSession', { sessionId: session.id });
    } catch (e) {
      console.warn('[InProgressView] exitEventSession (leave) error (non-fatal):', e?.message);
    }
    // Retour à l'accueil sans fermer la session
    window.location.href = '/Home';
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl space-y-4">

      {/* Chrono principal */}
      <Card className="border-2 border-green-200 bg-green-50">
        <CardContent className="pt-6 pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse" />
              <span className="text-sm font-semibold text-green-700 uppercase tracking-wide">Session en cours</span>
            </div>
            <div className="flex items-center gap-2 text-2xl font-bold text-green-700">
              <Clock className="w-5 h-5" />
              {formatTime(sessionTime)}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── BANNIÈRE DE PRÉSENCE ── uniquement pour les sessions d'événement ── */}
      {session?.sessionType === 'event' && (
        <PresenceBanner
          session={session}
          userRole={userRole}
          onCheckedIn={(data) => setPresenceData(data)}
        />
      )}

      {/* RWE — Compteur présences par rôle réel */}
      {session?.sessionType === 'event' && presenceCounts && presenceCounts.total > 0 && (
        <div className="rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-lg">🔥</span>
              <p className="font-bold text-orange-700 text-base leading-none">
                {presenceCounts.total} présence{presenceCounts.total !== 1 ? 's' : ''} vérifiée{presenceCounts.total !== 1 ? 's' : ''}
              </p>
            </div>
            <span className="text-xs text-orange-400 uppercase tracking-wide font-semibold">RWE Live</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {presenceCounts.organizer > 0 && (
              <span className="text-xs bg-indigo-100 text-indigo-700 rounded-full px-2.5 py-1 font-medium">
                +{presenceCounts.organizer} organisateur{presenceCounts.organizer > 1 ? 's' : ''}
              </span>
            )}
            {presenceCounts.talent > 0 && (
              <span className="text-xs bg-purple-100 text-purple-700 rounded-full px-2.5 py-1 font-medium">
                +{presenceCounts.talent} talent{presenceCounts.talent > 1 ? 's' : ''}
              </span>
            )}
            {presenceCounts.payer > 0 && (
              <span className="text-xs bg-green-100 text-green-700 rounded-full px-2.5 py-1 font-medium">
                +{presenceCounts.payer} payeur{presenceCounts.payer > 1 ? 's' : ''}
              </span>
            )}
            {presenceCounts.audience > 0 && (
              <span className="text-xs bg-orange-100 text-orange-700 rounded-full px-2.5 py-1 font-medium">
                +{presenceCounts.audience} audience
              </span>
            )}
          </div>
        </div>
      )}

      {/* Checkpoint */}
      {selectedCheckpoint && (
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center text-xl flex-shrink-0">
                {selectedCheckpoint.iconKey || '🗺️'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-gray-900">{selectedCheckpoint.name}</span>
                  {selectedCheckpoint.difficultyTier && (
                    <Badge variant="secondary" className="text-xs">Difficulté {selectedCheckpoint.difficultyTier}/5</Badge>
                  )}
                </div>
                {selectedCheckpoint.vibe && (
                  <p className="text-sm text-indigo-600 mt-0.5 font-medium">{selectedCheckpoint.vibe}</p>
                )}
                {(selectedCheckpoint.addressData?.formatted || selectedCheckpoint.address) && (
                  <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    {selectedCheckpoint.addressData?.formatted || selectedCheckpoint.address}
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Participants */}
      <Card>
        <CardHeader className="pb-3 pt-4">
          <CardTitle className="text-sm font-semibold text-gray-600 uppercase tracking-wide flex items-center gap-2">
            <Users className="w-4 h-4" />
            Participants ({participants.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0 space-y-3">
          {participants.map((p) => {
            const pid = normalizeId(p?.userId);
            const isMe = pid === normalizeId(user?.id);
            const prof = profilesCache[pid];
            const displayName = prof?.displayName || (isMe ? 'Vous' : `Joueur ${pid.slice(-4)}`);
            const avatarUrl = prof?.avatarUrl || null;
            const roleId = normalizeId(p?.roleSystemId);
            const styleIds = asArray(p?.styleSystemIds).map(normalizeId).filter(Boolean);
            const singleStyleId = normalizeId(p?.styleSystemId);
            const finalStyleIds = styleIds.length > 0 ? styleIds : singleStyleId ? [singleStyleId] : [];

            return (
              <div key={pid} className={`flex items-start gap-3 p-3 rounded-lg ${isMe ? 'bg-indigo-50 border border-indigo-200' : 'bg-gray-50'}`}>
                <div className="w-9 h-9 rounded-full flex-shrink-0 overflow-hidden bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center">
                  {avatarUrl
                    ? <img src={avatarUrl} alt={displayName} className="w-full h-full object-cover" />
                    : <span className="text-white text-sm font-bold">{displayName.charAt(0).toUpperCase()}</span>
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-gray-900 text-sm">{isMe ? `${displayName} (Vous)` : displayName}</span>
                    {roleId && (
                      <Badge variant="outline" className="text-xs border-indigo-300 text-indigo-700">
                        <Music2 className="w-3 h-3 mr-1" />
                        {roleId === 'RL-ORGANIZER' ? 'Organisateur' : (roleLabels[roleId] || roleId)}
                      </Badge>
                    )}
                  </div>
                  {finalStyleIds.length > 0 && (
                    <p className="text-xs text-gray-500 mt-1">
                      {finalStyleIds.map((sid) => styleLabels[sid] || sid).join(' · ')}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Actions — selon le rôle ────────────────────────────────────────────
          Organisateur : "Terminer la session" (ferme pour tous) + "Abandonner"
          Artiste      : "Je pars" (checkout individuel, session continue) + "Abandonner"
          Audience     : "Je pars" (checkout individuel, session continue)
      */}
      {userRole === 'organizer' ? (
        <div className="grid grid-cols-2 gap-3">
          <Button onClick={handleCompleteWithCheckout} disabled={actionLoading} className="bg-green-600 hover:bg-green-700">
            {actionLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            <Check className="w-4 h-4 mr-2" />
            Terminer la session
          </Button>
          <Button variant="destructive" onClick={onAbort} disabled={actionLoading}>
            <X className="w-4 h-4 mr-2" />
            Abandonner
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <Button onClick={handleLeave} disabled={actionLoading} className="bg-indigo-600 hover:bg-indigo-700">
            {actionLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            <LogOut className="w-4 h-4 mr-2" />
            Je pars
          </Button>
          {userRole === 'artist' && (
            <Button variant="outline" onClick={onAbort} disabled={actionLoading} className="text-red-600 border-red-200 hover:bg-red-50">
              <X className="w-4 h-4 mr-2" />
              Abandonner
            </Button>
          )}
        </div>
      )}

    </div>
  );
}