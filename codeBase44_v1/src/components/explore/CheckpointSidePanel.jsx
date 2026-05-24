/**
 * CheckpointSidePanel.jsx
 * -----------------------------------------------------------------------------
 * RESPONSABILITÉ
 *   Couche de décision contextuelle pour un checkpoint sélectionné.
 *
 * QUESTION À LAQUELLE CE PANEL DOIT RÉPONDRE
 *   "Qu'est-ce que je fais maintenant ?"
 *   puis éventuellement :
 *   "Est-ce un bon lieu pour créer quelque chose demain ?"
 *
 * CE PANEL NE DOIT PAS ÊTRE UN SIMPLE DOSSIER D'INFORMATION.
 *   Il doit transformer un lieu en décision.
 *
 * PRIORITÉS UX
 *   1. Montrer ce qui se passe maintenant.
 *   2. Montrer le lien personnel avec ce lieu.
 *   3. Montrer la qualité / énergie / culture du lieu.
 *   4. Donner un CTA clair :
 *      - rejoindre
 *      - check-in
 *      - explorer
 *      - créer plus tard
 *
 * GARDE-FOU
 *   Ne pas retomber dans un panneau descriptif passif.
 *   Si une information n'aide pas la décision, elle vient après le CTA.
 */


import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import {
  X,
  Users,
  Play,
  Calendar,
  Zap,
  MapPin,
  CheckCircle2,
  Loader2,
  Clock,
  Radio,
  Star,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createPageUrl } from '../../utils';
import { formatEventDate, getCheckpointTimezone } from '../../utils/dateUtils';
import { DOMAIN_COLORS, DOMAIN_LABELS } from '../../constants/domains';
import { useNavigate } from 'react-router-dom';

// ---------------------------------------------------------------------------
// Constantes importées depuis src/constants/domains.js
// ---------------------------------------------------------------------------


// Statuts qui indiquent une session ouverte et rejoignable
const LIVE_STATUSES = ['lobby', 'in_progress', 'queueing'];

// ---------------------------------------------------------------------------
// Utilitaires
// ---------------------------------------------------------------------------

function haversineM(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatCountdown(nextAt) {
  const diff = new Date(nextAt) - Date.now();
  if (diff <= 0) return null;
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// ---------------------------------------------------------------------------
// Utilitaires streak et temps relatif
// ---------------------------------------------------------------------------

/**
 * Calcule le streak de semaines consécutives avec au moins 1 check-in.
 * Une "semaine" commence le lundi à 00:00. On remonte depuis la semaine
 * courante jusqu'à trouver la première semaine sans check-in.
 *
 * @param {object[]} checkins  - tableau trié du plus récent au plus ancien
 * @returns {number}           - nombre de semaines consécutives (0 si aucune)
 */
function computeStreak(checkins) {
  if (!checkins || checkins.length === 0) return 0;

  const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;
  const now = new Date();

  // Trouver le lundi de la semaine courante (lundi = jour 1 en ISO)
  const dayOfWeek = (now.getDay() + 6) % 7; // 0=lun, 6=dim
  const startOfCurrentWeek = new Date(
    now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek
  );
  startOfCurrentWeek.setHours(0, 0, 0, 0);

  // Construire un Set des numéros de semaines (offset depuis epoch)
  const weeksWithActivity = new Set(
    checkins.map((c) => {
      const ts = new Date(c.checkinAt).getTime();
      if (!Number.isFinite(ts)) return null;
      return Math.floor(ts / MS_PER_WEEK);
    }).filter((w) => w !== null)
  );

  // Remonter semaine par semaine depuis la semaine courante
  let streak = 0;
  let weekStart = startOfCurrentWeek.getTime();

  while (true) {
    const weekNum = Math.floor(weekStart / MS_PER_WEEK);
    if (!weeksWithActivity.has(weekNum)) break;
    streak++;
    weekStart -= MS_PER_WEEK;
  }

  return streak;
}

/**
 * Formate une date en texte relatif concis.
 * Exemples : "aujourd'hui", "hier", "il y a 3j", "il y a 2 sem.", "il y a 1 mois"
 *
 * @param {string} dateStr - ISO string
 * @returns {string|null}
 */
function formatRelativeTime(dateStr) {
  if (!dateStr) return null;
  const ts = new Date(dateStr).getTime();
  if (!Number.isFinite(ts)) return null;

  const diffMs = Date.now() - ts;
  if (diffMs < 0) return null;

  const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));

  if (diffDays === 0) return "aujourd'hui";
  if (diffDays === 1) return 'hier';
  if (diffDays < 7)   return `il y a ${diffDays}j`;

  const diffWeeks = Math.floor(diffDays / 7);
  if (diffWeeks < 5)  return `il y a ${diffWeeks} sem.`;

  const diffMonths = Math.floor(diffDays / 30);
  return `il y a ${diffMonths} mois`;
}

// ---------------------------------------------------------------------------
// Sous-composants
// ---------------------------------------------------------------------------

function DomainBar({ domainKey, weight, maxWeight }) {
  const pct = maxWeight > 0 ? Math.round((weight / maxWeight) * 100) : 0;
  const color = DOMAIN_COLORS[domainKey] || DOMAIN_COLORS.default;

  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-20 text-gray-500 truncate">
        {DOMAIN_LABELS[domainKey] || domainKey}
      </span>
      <div className="flex-1 bg-gray-100 rounded-full h-1.5">
        <div
          style={{ width: `${pct}%`, backgroundColor: color }}
          className="h-1.5 rounded-full transition-all duration-500"
        />
      </div>
      <span className="w-7 text-right text-gray-400 tabular-nums">
        {Math.round(weight * 100)}%
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Composant principal
// ---------------------------------------------------------------------------

export default function CheckpointSidePanel({
  checkpoint,
  liveStats,
  userGeo,
  onClose,
  onCheckinSuccess,
}) {
  const navigate = useNavigate();

  // State existant
  const [recentSessions, setRecentSessions] = useState([]);
  const [topParticipants, setTopParticipants] = useState([]);
  const [loading, setLoading] = useState(true);

  // Nouvel état : utilisateur courant (pour calculer "ton lien")
  const [currentUserId, setCurrentUserId] = useState(null);

  // Historique personnel de check-ins sur ce checkpoint (pour streak + dernier passage)
  const [personalCheckins, setPersonalCheckins] = useState([]);

  // Events ouverts sur ce checkpoint (published + lobby)
  const [checkpointEvents, setCheckpointEvents] = useState([]);

  // State check-in (inchangé)
  const [checkinState, setCheckinState] = useState(null); // null | loading | success | cooldown | error
  const [checkinMsg, setCheckinMsg] = useState('');
  const [nextCheckinAt, setNextCheckinAt] = useState(null);
  const [countdown, setCountdown] = useState(null);

  // -------------------------------------------------------------------------
  // Chargement des données (logique originale + stockage currentUserId)
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!checkpoint?.systemId) return;

    let cancelled = false;

    setLoading(true);
    setRecentSessions([]);
    setTopParticipants([]);
    setCheckinState(null);
    setCheckinMsg('');
    setNextCheckinAt(null);
    setCurrentUserId(null);
    setPersonalCheckins([]);

    Promise.all([
      base44.entities.Session.filter(
        { checkpointSystemId: checkpoint.systemId },
        '-created_date',
        8
      ).catch(() => []),
      // Events ouverts sur ce checkpoint — systemId est la clé canonique
      base44.entities.Event.filter(
        { checkpointId: checkpoint.systemId }
      ).catch(() => []),
      base44.auth
        .me()
        .then((user) => {
          // Stocker l'ID utilisateur pour "ton lien avec ce lieu"
          if (user?.id && !cancelled) setCurrentUserId(user.id);

          // Lancer le fetch de l'historique personnel en parallèle (non-bloquant)
          if (user?.id) {
            base44.entities.CheckpointCheckin.filter(
              { checkpointSystemId: checkpoint.systemId, userId: user.id },
              '-checkinAt',
              20
            )
              .then((history) => {
                if (!cancelled) {
                  setPersonalCheckins(Array.isArray(history) ? history : []);
                }
              })
              .catch(() => {
                if (!cancelled) setPersonalCheckins([]);
              });
          }

          return user
            ? base44.entities.CheckpointCheckin.filter(
                { userId: user.id, checkpointSystemId: checkpoint.systemId },
                '-checkinAt',
                1
              ).catch(() => [])
            : [];
        })
        .catch(() => []),
    ])
      .then(async ([sessions, eventsRaw, checkins]) => {
        // Events ouverts et futurs pour ce checkpoint
        const nowMs = Date.now();
        const OPEN_STATUSES = new Set(['published', 'lobby', 'open']);
        const openEvents = (Array.isArray(eventsRaw) ? eventsRaw : [])
          .filter((ev) => {
            if (!OPEN_STATUSES.has(ev?.status)) return false;
            try { return new Date(ev.dateStart).getTime() > nowMs - 3600000; } // -1h tolérance
            catch { return false; }
          })
          .sort((a, b) => new Date(a.dateStart) - new Date(b.dateStart));
        if (!cancelled) setCheckpointEvents(openEvents);
        if (cancelled) return;

        const safeSessions = Array.isArray(sessions) ? sessions : [];
        setRecentSessions(safeSessions.slice(0, 4));

        // Calcul des joueurs fréquents (logique originale inchangée)
        const tally = {};
        for (const s of safeSessions) {
          for (const p of s.participants || []) {
            const uid = typeof p === 'string' ? p : p?.userId || '';
            if (uid) tally[uid] = (tally[uid] || 0) + 1;
          }
        }

        const sorted = Object.entries(tally)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([userId, count]) => ({ userId, count }));

        const enrichedPlayers = await Promise.all(
          sorted.map(async (row) => {
            try {
              const profiles = await base44.entities.TalentProfile.filter({
                userId: row.userId,
              }).catch(() => []);

              const profile = Array.isArray(profiles) ? profiles[0] : null;

              return {
                ...row,
                displayName:
                  profile?.displayName ||
                  profile?.artistName ||
                  profile?.name ||
                  `Talent …${String(row.userId || '').slice(-4)}`,
                avatarUrl: profile?.photoUrl || profile?.avatarUrl || null,
              };
            } catch {
              return {
                ...row,
                displayName: `Talent …${String(row.userId || '').slice(-4)}`,
                avatarUrl: null,
              };
            }
          })
        );

        if (!cancelled) {
          setTopParticipants(enrichedPlayers);
        }

        // Cooldown check-in (logique originale inchangée)
        const last = Array.isArray(checkins) ? checkins[0] : null;
        if (last) {
          const nextAt = new Date(
            new Date(last.checkinAt).getTime() + 4 * 3600 * 1000
          );
          if (nextAt > new Date() && !cancelled) {
            setCheckinState('cooldown');
            setNextCheckinAt(nextAt.toISOString());
          }
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [checkpoint?.systemId]);

  // Countdown check-in (inchangé)
  useEffect(() => {
    if (!nextCheckinAt) {
      setCountdown(null);
      return;
    }

    const update = () => setCountdown(formatCountdown(nextCheckinAt));
    update();

    const t = setInterval(update, 30000);
    return () => clearInterval(t);
  }, [nextCheckinAt]);

  // handleCheckin (inchangé)
  const handleCheckin = useCallback(async () => {
    if (!userGeo || checkinState === 'loading' || checkinState === 'cooldown') return;

    setCheckinState('loading');

    try {
      const res = await base44.functions.invoke('checkinCheckpoint', {
        checkpointSystemId: checkpoint.systemId,
        geoLat: userGeo.lat,
        geoLng: userGeo.lng,
      });

      const data = res?.data || res || {};

      if (data.ok) {
        setCheckinState('success');
        setCheckinMsg(`+${data.xpAwarded} XP · à ${data.distanceM}m`);
        setNextCheckinAt(data.nextCheckinAt);
        onCheckinSuccess?.(checkpoint.systemId);
      } else if (data.error === 'too_far') {
        setCheckinState('error');
        setCheckinMsg(data.message || 'Trop loin du checkpoint.');
      } else if (data.error === 'cooldown') {
        setCheckinState('cooldown');
        setNextCheckinAt(data.nextCheckinAt);
      } else {
        setCheckinState('error');
        setCheckinMsg(data.message || 'Erreur inconnue');
      }
    } catch {
      setCheckinState('error');
      setCheckinMsg('Impossible de valider le check-in.');
    }
  }, [userGeo, checkpoint?.systemId, checkinState, onCheckinSuccess]);

  // -------------------------------------------------------------------------
  // Garde
  // -------------------------------------------------------------------------
  if (!checkpoint) return null;

  // -------------------------------------------------------------------------
  // Dérivations (ordre inchangé pour les variables existantes)
  // -------------------------------------------------------------------------
  const domainRanking = checkpoint.domainRanking || [];
  const maxWeight =
    domainRanking.length > 0
      ? Math.max(...domainRanking.map((d) => d.weight || 0))
      : 1;

  const dominantKey = checkpoint.domainDominantKey;
  const domainColor = DOMAIN_COLORS[dominantKey] || DOMAIN_COLORS.default;
  const momentum = liveStats?.momentumScore || 0;
  const momentumDelta = liveStats?.momentumDelta || 0;

  const lat = Number.parseFloat(checkpoint.geoLat);
  const lng = Number.parseFloat(checkpoint.geoLng);

  const distanceM =
    userGeo && Number.isFinite(lat) && Number.isFinite(lng)
      ? Math.round(haversineM(userGeo.lat, userGeo.lng, lat, lng))
      : null;

  const isNear = distanceM !== null && distanceM <= 500;
  const hasGeo = userGeo !== null;

  // Nouvelles dérivations
  // Session live en cours (priorité : in_progress > lobby > queueing)
  const liveSession = recentSessions.find((s) => LIVE_STATUSES.includes(s.status)) ?? null;

  // "Ton lien" : sessions où l'utilisateur courant apparaît dans participants
  const mySessionCount = currentUserId
    ? recentSessions.filter((s) =>
        (s.participants || []).some((p) =>
          (typeof p === 'string' ? p : p?.userId) === currentUserId
        )
      ).length
    : 0;

  // Rang personnel parmi les joueurs fréquents (1-based, null si absent)
  const myRankIndex = currentUserId
    ? topParticipants.findIndex((p) => p.userId === currentUserId)
    : -1;
  const myRank = myRankIndex >= 0 ? myRankIndex + 1 : null;

  // Dérivations streak (basées sur personalCheckins)
  const streak = computeStreak(personalCheckins);
  const totalCheckins = personalCheckins.length;
  const lastCheckinAt = personalCheckins[0]?.checkinAt ?? null; // trié -checkinAt
  const lastPassage = formatRelativeTime(lastCheckinAt);

  // -------------------------------------------------------------------------
  // Bouton check-in (logique originale, une seule modification : label !isNear)
  // -------------------------------------------------------------------------
  function renderCheckinButton() {
    if (checkinState === 'success') {
      return (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-green-50 border border-green-200 text-green-700 text-sm font-semibold w-full">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          Check-in validé! {checkinMsg}
        </div>
      );
    }

    if (checkinState === 'cooldown') {
      return (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-gray-500 text-sm w-full">
          <Clock className="w-4 h-4 flex-shrink-0" />
          <span>Prochain check-in {countdown ? `dans ${countdown}` : 'bientôt'}</span>
        </div>
      );
    }

    if (checkinState === 'error') {
      return (
        <div className="flex flex-col gap-1 w-full">
          <Button
            variant="outline"
            className="w-full gap-2 text-sm border-red-200 text-red-600"
            onClick={handleCheckin}
          >
            <MapPin className="w-4 h-4" /> Réessayer
          </Button>
          <p className="text-xs text-red-500 text-center">{checkinMsg}</p>
        </div>
      );
    }

    // ← Modification : label éducatif quand !isNear
    const label = !hasGeo
      ? 'Check-in (GPS requis)'
      : !isNear
        ? `À ${distanceM}m · Check-in sur place (+25 XP)`
        : 'Check-in ici (+25 XP)';

    return (
      <Button
        className="w-full gap-2 text-sm"
        style={isNear ? { backgroundColor: domainColor } : {}}
        disabled={!isNear || checkinState === 'loading'}
        onClick={handleCheckin}
        title={
          !isNear && distanceM
            ? `Approchez-vous à moins de 500m (actuellement ${distanceM}m)`
            : ''
        }
      >
        {checkinState === 'loading' ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <MapPin className="w-4 h-4" />
        )}
        {checkinState === 'loading' ? 'Validation…' : label}
      </Button>
    );
  }

  // -------------------------------------------------------------------------
  // Rendu
  // -------------------------------------------------------------------------
  return (
    <div className="bg-white flex flex-col h-full">
      {/* Pas de drag handle ici — géré par le sheet parent sur mobile */}

      {/* ── NOUVEAU HEADER BANNIÈRE ── */}
      <div
        className="relative px-5 pt-4 pb-4 flex-shrink-0"
        style={{ backgroundColor: `${domainColor}12` }}
      >
        {/* Bouton fermer */}
        <button
          onClick={onClose}
          className="absolute top-3 right-4 p-1.5 rounded-full hover:bg-black/10 text-gray-400 transition-colors"
          aria-label="Fermer"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Badges en haut */}
        <div className="flex items-center gap-2 mb-2 flex-wrap pr-8">
          {dominantKey && (
            <span
              className="text-xs font-semibold px-2.5 py-1 rounded-full border"
              style={{
                backgroundColor: `${domainColor}20`,
                color: domainColor,
                borderColor: `${domainColor}40`,
              }}
            >
              {DOMAIN_LABELS[dominantKey] || dominantKey}
            </span>
          )}
          {checkpoint.vibe && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 border border-gray-200">
              {checkpoint.vibe}
            </span>
          )}
          {checkpoint.difficultyTier && (
            <span className="text-xs text-gray-400">
              {'★'.repeat(checkpoint.difficultyTier)}
            </span>
          )}
        </div>

        {/* Nom + type */}
        {/* Titre — défilement horizontal si trop long (overflow-x-auto no-scrollbar) */}
        <div className="overflow-x-auto no-scrollbar pr-8">
          <h2 className="text-lg font-bold text-gray-900 leading-tight whitespace-nowrap">
            {checkpoint.name}
          </h2>
        </div>
        <p className="text-xs text-gray-500 mt-0.5">{checkpoint.type || 'Lieu'}</p>

        {/* Momentum — affiché uniquement si liveStats disponibles */}
        {liveStats && (
          <div className="flex items-center gap-3 mt-3">
            <div className="flex items-center gap-1.5">
              <Zap className="w-4 h-4" style={{ color: domainColor }} />
              <span
                className="text-2xl font-bold tabular-nums leading-none"
                style={{ color: domainColor }}
              >
                {Math.round(momentum)}
              </span>
              <span className="text-xs text-gray-400 self-end mb-0.5">momentum</span>
            </div>

            {momentumDelta !== 0 && (
              <span
                className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                  momentumDelta > 0
                    ? 'bg-green-100 text-green-700'
                    : 'bg-red-100 text-red-600'
                }`}
              >
                {momentumDelta > 0 ? '+' : ''}
                {Math.round(momentumDelta)}
              </span>
            )}

            {/* Barre de momentum compacte */}
            <div className="flex-1 bg-gray-100 rounded-full h-1.5 min-w-0">
              <div
                style={{
                  width: `${Math.min(momentum, 100)}%`,
                  backgroundColor: domainColor,
                }}
                className="h-1.5 rounded-full transition-all duration-700"
              />
            </div>
          </div>
        )}
      </div>

      {/* ── CORPS SCROLLABLE ── */}
      {/* min-h-0 est obligatoire : sans lui, flex-1 dans un flex-col ne limite pas */}
      {/* la hauteur et le scroll ne fonctionne pas — le contenu déborde le footer */}
      <div className="overflow-y-auto flex-1 min-h-0 px-5 py-4 space-y-5">

        {/* ── SECTION 1 : EN CE MOMENT ── */}
        {!loading && (
          <div>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
              En ce moment
            </h3>

            {/* Events ouverts sur ce checkpoint — affichés en premier si présents */}
            {checkpointEvents.length > 0 && checkpointEvents.map((ev) => (
              <div key={ev.id} className="flex items-center justify-between px-4 py-3 rounded-xl bg-indigo-50 border border-indigo-200 mb-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-indigo-900 leading-tight truncate">{ev.title}</p>
                  <p className="text-xs text-indigo-600 mt-0.5">
                    {formatEventDate(ev.dateStart, getCheckpointTimezone(checkpoint))}
                    {ev.status === 'lobby' && <span className="ml-2 font-semibold">· Lobby ouvert</span>}
                  </p>
                </div>
                <button
                  onClick={() => navigate(createPageUrl('EventLobby') + `?eventId=${ev.id}`)}
                  className="flex-shrink-0 ml-3 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 transition-colors whitespace-nowrap"
                >
                  Rejoindre →
                </button>
              </div>
            ))}

            {liveSession ? (
              /* Session ouverte → card verte avec CTA "Rejoindre" */
              <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-green-50 border border-green-200">
                <div className="flex items-center gap-2.5 min-w-0">
                  <Radio className="w-4 h-4 text-green-600 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-green-800 leading-tight">
                      Session ouverte
                    </p>
                    <p className="text-xs text-green-600 mt-0.5">
                      {liveSession.participants?.length || 0} joueur
                      {(liveSession.participants?.length || 0) !== 1 ? 's' : ''} · {liveSession.sessionType || 'Quickplay'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() =>
                    navigate(
                      createPageUrl('Play') +
                        `?checkpointId=${checkpoint.systemId}&sessionId=${liveSession.id}`
                    )
                  }
                  className="text-sm font-semibold text-green-700 hover:text-green-900 flex-shrink-0 ml-3 whitespace-nowrap"
                >
                  Rejoindre →
                </button>
              </div>
            ) : (
              /* Pas de session live → CTA secondaire "Lancer" */
              <button
                onClick={() =>
                  navigate(
                    createPageUrl('Play') + `?checkpointId=${checkpoint.systemId}`
                  )
                }
                className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-gray-50 border border-dashed border-gray-200 hover:border-gray-300 hover:bg-gray-100 transition-colors group"
              >
                <div className="flex items-center gap-2.5">
                  <Play className="w-4 h-4 text-gray-400 group-hover:text-gray-600" />
                  <span className="text-sm text-gray-500 group-hover:text-gray-700">
                    Lancer une session
                  </span>
                </div>
                <span className="text-xs text-gray-400">→</span>
              </button>
            )}
          </div>
        )}

        {/* ── SECTION 2 : TON LIEN AVEC CE LIEU ── */}
        {!loading && (
          <div>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
              Ton lien avec ce lieu
            </h3>

            <div
              className="px-4 py-3 rounded-xl border"
              style={{
                backgroundColor: `${domainColor}08`,
                borderColor: `${domainColor}25`,
              }}
            >
              {totalCheckins > 0 ? (
                <div className="flex items-start gap-3">
                  <span className="text-base flex-shrink-0" aria-hidden="true">🔥</span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-800 leading-snug">
                      {[
                        streak > 0
                          ? `Streak ${streak} semaine${streak > 1 ? 's' : ''}`
                          : null,
                        totalCheckins > 0
                          ? `${totalCheckins} visite${totalCheckins > 1 ? 's' : ''}`
                          : null,
                        myRank ? `Rang #${myRank} ici` : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                    {lastPassage && (
                      <p className="text-xs text-gray-400 mt-0.5">
                        Dernier passage {lastPassage}
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <MapPin className="w-4 h-4 text-gray-300 flex-shrink-0" />
                  <p className="text-sm text-gray-500">
                    Première fois ici — check-in pour démarrer ton streak
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── SECTION 3 : PROFIL CULTUREL (max 3 domaines) ── */}
        {domainRanking.length >= 1 && (
          <div>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
              Profil culturel
            </h3>
            <div className="space-y-2">
              {domainRanking.slice(0, 3).map((d) => (
                <DomainBar
                  key={d.key}
                  domainKey={d.key}
                  weight={d.weight}
                  maxWeight={maxWeight}
                />
              ))}
            </div>
          </div>
        )}

        {/* ── SECTION 4 : JOUEURS FRÉQUENTS (inchangé) ── */}
        {!loading && topParticipants.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
              Joueurs fréquents
            </h3>
            <div className="flex flex-wrap gap-2">
              {topParticipants.map((p) => (
                <div
                  key={p.userId}
                  className="flex items-center gap-1.5 bg-gray-50 rounded-full px-3 py-1.5"
                >
                  <Users className="w-3 h-3 text-gray-400" />
                  <span className="text-xs text-gray-700">{p.displayName}</span>
                  <span className="text-xs text-gray-400 font-medium">{p.count}×</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── FOOTER : CHECK-IN + NAVIGATION (logique inchangée) ── */}
      <div className="px-5 py-4 border-t border-gray-100 flex flex-col gap-2 flex-shrink-0">
        <div className="flex">
          {renderCheckinButton()}
        </div>

        <div className="flex gap-3">
          <Button
            variant="outline"
            className="flex-1 gap-2 text-sm"
            onClick={() =>
              navigate(createPageUrl('Play') + `?checkpointId=${checkpoint.systemId}`)
            }
          >
            <Play className="w-4 h-4" /> Session
          </Button>

          <Button
            variant="outline"
            className="flex-1 gap-2 text-sm"
            onClick={() =>
              navigate(createPageUrl('Events') + `?checkpointId=${checkpoint.systemId}`)
            }
          >
            <Calendar className="w-4 h-4" /> Événements
          </Button>
        </div>
      </div>
    </div>
  );
}