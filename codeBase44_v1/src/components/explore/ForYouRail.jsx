/**
 * ForYouRail.jsx
 * -----------------------------------------------------------------------------
 * RÔLE OFFICIEL : SURFACE DE DÉCOUVERTE RAPIDE
 * -----------------------------------------------------------------------------
 *
 * ForYouRail suggère. ExploreOpportunityPanel décide.
 *
 * Ce composant est un teaser horizontal :
 *   - aperçu rapide des checkpoints les plus pertinents
 *   - sélection courte (max 5 éléments)
 *   - pas de catégorisation ni de logique "quoi faire maintenant"
 *
 * Il N'EST PAS la surface de décision.
 * Il provoque la découverte, pas l'action structurée.
 *
 * MOBILE  → affiché comme rail principal au-dessus de la carte
 * DESKTOP → affiché en header léger dans la colonne OpportunityPanel,
 *           visuellement secondaire par rapport au Panel lui-même
 *
 * SOURCES DE PERTINENCE (score léger, pas de catégories)
 *   - activité live
 *   - momentum
 *   - proximité
 *   - événement proche
 */


import React, { useMemo } from 'react';
import { DOMAIN_COLORS, DOMAIN_LABELS } from '../../constants/domains';
import { MapPin, Zap } from 'lucide-react';

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------



// Score minimum pour qu'un checkpoint apparaisse dans le rail
const MIN_SCORE_THRESHOLD = 20;

// Nombre max de cards affichées
const MAX_CARDS = 5;

// Fenêtre "événement ce soir" : 24h en ms
const EVENT_WINDOW_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Utilitaires (local — sera consolidé en Prompt 6)
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

function formatDistance(m) {
  if (m == null) return null;
  return m < 1000 ? `${Math.round(m)}m` : `${(m / 1000).toFixed(1)}km`;
}

/**
 * Calcule le score de pertinence d'un checkpoint pour le rail "Pour toi".
 * Retourne { score, isLive, isHot, hasEvent, distanceM }.
 *
 * RÈGLE : si un primaryMoment (live/peak/rising) existe, il contribue au score
 * de base du rail, indépendamment des liveStats. Cela évite qu'un lieu vivant
 * disparaisse du rail si le cron liveStats décrémente le momentum en dessous du seuil.
 */
function scoreCheckpoint(cp, liveStats, userGeo, primaryMoment = null) {
  let score = 0;
  const now = Date.now();

  // Signal depuis le Moment Engine (prioritaire si disponible)
  if (primaryMoment) {
    if (primaryMoment.status === 'live')        score += 40;
    else if (primaryMoment.status === 'peak')   score += 30;
    else if (primaryMoment.status === 'rising') score += 15;
  }

  // Signal live liveStats — complément si pas de moment, ou additif léger
  const isLive = Number(liveStats?.recentSessionsOpened ?? 0) > 0;
  if (isLive && !primaryMoment) score += 40; // évite double comptage

  // Momentum élevé (+20) — liveStats uniquement si pas de moment
  const momentum = Number(liveStats?.momentumScore ?? 0);
  const isHot = momentum > 50;
  if (isHot && !primaryMoment) score += 20;

  // Distance (<2km → +15, <500m → +30 total, remplace le +15)
  let distanceM = null;
  if (userGeo && Number.isFinite(Number(cp?.geoLat)) && Number.isFinite(Number(cp?.geoLng))) {
    distanceM = Math.round(haversineM(userGeo.lat, userGeo.lng, Number(cp.geoLat), Number(cp.geoLng)));
    if (distanceM < 500)       score += 30;
    else if (distanceM < 2000) score += 15;
  }

  // Événement dans les 24h (+25)
  let hasEvent = liveStats?.hasEventTonight === true;
  if (!hasEvent && liveStats?.nextEventAt) {
    const eventAt = new Date(liveStats.nextEventAt).getTime();
    hasEvent = Number.isFinite(eventAt) && eventAt > now && (eventAt - now) <= EVENT_WINDOW_MS;
  }
  if (hasEvent) score += 25;

  return { score, isLive, isHot, hasEvent, distanceM };
}

// ---------------------------------------------------------------------------
// Composant card individuelle
// ---------------------------------------------------------------------------

function RailCard({ cp, scoring, domainColor, onClick }) {
  const { isLive, hasEvent, distanceM } = scoring;
  const cpId = cp?.systemId || cp?.id;
  const domainKey = cp?.domainDominantKey || 'default';
  const label = DOMAIN_LABELS[domainKey] || domainKey;

  return (
    <button
      onClick={() => onClick(cpId)}
      className="flex-shrink-0 w-36 text-left rounded-lg border bg-white hover:shadow-md transition-all duration-150 overflow-hidden"
      style={{ borderColor: `${domainColor}30` }}
    >
      {/* Bande colorée de domaine en haut */}
      <div className="h-0.5 w-full" style={{ backgroundColor: domainColor }} />

      <div className="px-2.5 py-1.5 flex items-center gap-2">
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isLive ? 'bg-green-400' : hasEvent ? 'bg-orange-300' : 'bg-gray-200'}`} />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-gray-900 truncate leading-tight">
            {cp?.name || 'Checkpoint'}
          </p>
          <div className="flex items-center gap-1 mt-0.5">
            <span className="text-[10px] font-medium truncate" style={{ color: domainColor }}>{label}</span>
            {distanceM != null && (
              <span className="text-[10px] text-gray-400 flex-shrink-0">· {formatDistance(distanceM)}</span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Composant principal
// ---------------------------------------------------------------------------

/**
 * ForYouRail — barre de découverte personnalisée
 *
 * Affiche un scroll horizontal de 1–5 checkpoints sélectionnés selon un
 * score de pertinence côté client (session live, momentum, distance, événement).
 * Ne se rend pas si aucun checkpoint ne dépasse le seuil MIN_SCORE_THRESHOLD.
 *
 * @param {object[]} checkpoints   - tous les checkpoints actifs (filtrés ou non)
 * @param {Map}      liveStatsMap  - Map<systemId, liveStats>
 * @param {object|null} userGeo   - { lat, lng } ou null
 * @param {function} onSelect     - callback(cpId) quand l'utilisateur clique une card
 */
export default function ForYouRail({ checkpoints = [], liveStatsMap = new Map(), primaryMomentByCheckpointSystemId = new Map(), userGeo = null, onSelect, compact = false }) {
  // ---- Titre selon l'heure ----
  const railTitle = useMemo(() => {
    const hour = new Date().getHours();
    return hour >= 17 ? 'Pour toi ce soir' : 'Actif maintenant';
  }, []);

  // ---- Scoring + tri ----
  const topCheckpoints = useMemo(() => {
    const scored = checkpoints
      .map((cp) => {
        const cpId = cp?.systemId || cp?.id;
        if (!cpId) return null;
        const liveStats = liveStatsMap.get(cpId);
        const primaryMoment = primaryMomentByCheckpointSystemId.get(cpId) ?? null;
        const scoring = scoreCheckpoint(cp, liveStats, userGeo, primaryMoment);
        return { cp, scoring };
      })
      .filter((entry) => entry !== null && entry.scoring.score > MIN_SCORE_THRESHOLD)
      .sort((a, b) => b.scoring.score - a.scoring.score)
      .slice(0, MAX_CARDS);

    return scored;
  }, [checkpoints, liveStatsMap, userGeo]);

  // Ne pas rendre si aucun résultat
  if (topCheckpoints.length === 0) return null;

  return (
    <div className={`flex-shrink-0 bg-white ${compact ? '' : 'border-b border-gray-100'}`}>
      {/* En-tête + scroll sur une seule ligne */}
      <div className={`flex items-center gap-2 px-3 overflow-x-auto no-scrollbar ${compact ? 'py-1.5' : 'py-2'}`}>
        <div className="flex items-center gap-1 flex-shrink-0">
          <Zap className="w-3 h-3 text-indigo-400 flex-shrink-0" />
          <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
            {railTitle}
          </span>
          <span className="text-[10px] text-gray-400 whitespace-nowrap">
            {topCheckpoints.length}
          </span>
        </div>
        <div className="w-px h-4 bg-gray-200 flex-shrink-0" />
        {topCheckpoints.map(({ cp, scoring }) => {
          const domainKey = cp?.domainDominantKey || 'default';
          const domainColor = DOMAIN_COLORS[domainKey] || DOMAIN_COLORS.default;
          const cpId = cp?.systemId || cp?.id;
          return (
            <RailCard
              key={cpId}
              cp={cp}
              scoring={scoring}
              domainColor={domainColor}
              onClick={onSelect}
            />
          );
        })}
      </div>
    </div>
  );
}