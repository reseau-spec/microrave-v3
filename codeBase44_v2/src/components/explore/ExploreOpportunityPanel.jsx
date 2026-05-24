/**
 * ExploreOpportunityPanel.jsx
 * -----------------------------------------------------------------------------
 * RÔLE OFFICIEL : SURFACE DE DÉCISION ET D'ACTION
 * -----------------------------------------------------------------------------
 *
 * ForYouRail suggère. ExploreOpportunityPanel décide.
 *
 * Ce composant structure l'action en 3 sections :
 *   1. En ce moment  → checkpoints live, hot, avec événement ce soir
 *   2. Autour de toi → checkpoints pertinents par proximité + contexte
 *   3. Créer demain  → checkpoints stables pour planifier
 *
 * C'est la colonne principale de décision sur desktop.
 * Il N'EST PAS un teaser — c'est une surface structurée d'opportunités.
 *
 * MOBILE  → non affiché (ForYouRail prend le relais)
 * DESKTOP → colonne gauche principale, au-dessus de la carte
 *
 * RÈGLE UX
 *   Si le panneau n'aide pas à choisir une prochaine action,
 *   alors il a dérivé de son but.
 */

/**
 * -----------------------------------------------------------------------------
 * CLARIFICATION ARCHITECTURALE — OPPORTUNITÉS ET DOMAINE
 * -----------------------------------------------------------------------------
 *
 * Le panneau d'opportunités aide à choisir une prochaine action.
 * Il travaille donc beaucoup avec le contexte :
 *   - maintenant
 *   - proximité
 *   - vibe
 *   - type
 *   - momentum
 *
 * MAIS
 *   il ne doit pas devenir aveugle à la structure du réseau.
 *
 * RÈGLE
 *   Le domaine reste une dimension majeure de lecture et de cohérence.
 *   Les opportunités doivent être contextuelles SANS devenir hors-sol métier.
 *
 * FORMULE DE RÉFÉRENCE
 *   Le domaine structure. Le contexte déclenche.
 * -----------------------------------------------------------------------------
 */

import React, { useMemo } from 'react';
import { Radio, Zap, MapPin, Star, Plus, X, Calendar } from 'lucide-react';
import { DOMAIN_COLORS } from '../../constants/domains';
import { resolveCheckpointType } from '../../constants/checkpointTypes';
import { VIBE_OPTIONS } from '../../hooks/useExploreContext';
import { formatEventDateShort, DEFAULT_TIMEZONE } from '../../utils/dateUtils';

// ---------------------------------------------------------------------------
// Helpers de scoring — SINGLE SOURCE OF TRUTH: primaryMomentByCheckpointSystemId
// Le Panel ne recompute jamais les moments. Il consomme uniquement.
// ---------------------------------------------------------------------------

const EVENT_WINDOW_MS = 24 * 60 * 60 * 1000;

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

/**
 * scoreOpportunity — scoring V3 canonique.
 *
 * RÈGLE FONDAMENTALE :
 *   SI primaryMoment existe → score moment uniquement (pas de liveStats dans le score)
 *   SI pas de moment        → fallback liveStats
 *
 * Cela évite tout double comptage et rend le scoring explicable en 1 lecture.
 *
 * @param {object} cp
 * @param {object|null} liveStats
 * @param {{ userGeo, arrondissement, types, selectedVibe }} context
 * @param {object|null} primaryMoment — SINGLE SOURCE OF TRUTH depuis primaryMomentByCheckpointSystemId
 * @returns {{ score, isLive, hasEventTonight, momentum, distanceM, primaryMoment }}
 */
function scoreOpportunity(cp, liveStats, { userGeo, arrondissement, types, selectedVibe }, primaryMoment = null, cpEvents = []) {
  let score = 0;
  const now = Date.now();

  // ── 1. Activité temps réel — moment OU liveStats (mutuellement exclusifs) ──
  let isLive = false;
  let hasEventTonight = false;
  let momentum = 0;

  if (primaryMoment) {
    // Moment réel disponible → il gouverne seul, liveStats ignoré.
    // Seuls les statuts publiés dans Explore sont acceptés ici :
    // live > peak > rising — 'recent', 'seeded', 'fading', 'closed' ne passent
    // jamais via getExploreFeed et ne doivent donc jamais scorer dans ce branch.
    if (primaryMoment.status === 'live')        { score += 50; isLive = true; }
    else if (primaryMoment.status === 'peak')   score += 30;
    else if (primaryMoment.status === 'rising') score += 18;
    // Tout autre statut (recent, seeded, fading, closed) → score 0 dans ce branch.

    // Bonus momentScore borné à +10
    if (primaryMoment.momentScore > 0) {
      score += Math.min(10, Math.round(primaryMoment.momentScore / 10));
    }

    momentum = Number(primaryMoment.momentumScore ?? 0);
  } else {
    // Pas de moment → fallback liveStats
    isLive = Number(liveStats?.recentSessionsOpened ?? 0) > 0;
    if (isLive) score += 40;

    if (liveStats?.hasEventTonight === true) {
      hasEventTonight = true;
    } else if (liveStats?.nextEventAt) {
      const eventAt = new Date(liveStats.nextEventAt).getTime();
      hasEventTonight = Number.isFinite(eventAt) && eventAt > now && (eventAt - now) <= EVENT_WINDOW_MS;
    }
    // Enrichissement par les events réels — prioritaire sur liveStats
    if (!hasEventTonight && cpEvents.length > 0) {
      const soon = cpEvents.find((ev) => {
        try {
          const t = new Date(ev.dateStart).getTime();
          return t > now && (t - now) <= EVENT_WINDOW_MS * 7; // 7 jours
        } catch { return false; }
      });
      if (soon) hasEventTonight = true;
    }
    if (hasEventTonight) score += 25;

    momentum = Number(liveStats?.momentumScore ?? 0);
    if (momentum > 50) score += 20;
  }

  // ── 2. Contexte spatial (toujours appliqué) ──────────────────────────────
  let distanceM = null;
  if (userGeo && Number.isFinite(Number(cp?.geoLat)) && Number.isFinite(Number(cp?.geoLng))) {
    distanceM = Math.round(haversineM(userGeo.lat, userGeo.lng, Number(cp.geoLat), Number(cp.geoLng)));
    if (distanceM < 500)       score += 25;
    else if (distanceM < 2000) score += 15;
  }

  if (arrondissement && cp?.arrondissement?.includes(arrondissement)) score += 10;
  if (types?.length > 0 && types.includes(cp?.type)) score += 10;

  if (selectedVibe) {
    const vibeOpt = VIBE_OPTIONS.find((v) => v.key === selectedVibe);
    if (vibeOpt) {
      const domainMatch = vibeOpt.domainHints?.includes(cp?.domainDominantKey);
      const typeMatch = vibeOpt.typeHints?.includes(cp?.type);
      if (domainMatch || typeMatch) score += 10;
    }
  }

  // Prochain event réel pour ce checkpoint (le plus proche dans le temps)
  const nextEvent = cpEvents.length > 0
    ? cpEvents.sort((a, b) => new Date(a.dateStart) - new Date(b.dateStart))[0]
    : null;

  return { score, isLive, hasEventTonight, momentum, distanceM, primaryMoment, nextEvent };
}

function formatDistanceShort(m) {
  if (m == null) return null;
  return m < 1000 ? `${Math.round(m)}m` : `${(m / 1000).toFixed(1)}km`;
}

/** Label lisible pour le statut d'un moment culturel */
function momentStatusLabel(status) {
  const labels = {
    live:    'Session en cours',
    peak:    'Lieu en forte activité',
    rising:  'Activité en hausse',
    recent:  'Activité récente',
    fading:  'Activité récente',
  };
  return labels[status] || 'Actif';
}

// ---------------------------------------------------------------------------
// Sous-composant : ligne d'opportunité
// ---------------------------------------------------------------------------

function OpportunityRow({ cp, scoring, onSelect, onAction, cta = 'Voir' }) {
  const cpId = cp?.systemId;
  const domainKey = cp?.domainDominantKey || 'default';
  const domainColor = DOMAIN_COLORS[domainKey] || DOMAIN_COLORS.default;
  const typeResolved = resolveCheckpointType(cp?.type);

  return (
    <button
      type="button"
      onClick={() => {
        const momentCtaType = scoring.primaryMoment?.ctaType;
        if (momentCtaType === 'join_session' && onAction) {
          onAction(cpId, 'join_session');
        } else {
          onSelect?.(cpId);
        }
      }}
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50 transition-colors text-left group"
    >
      {/* Type icon */}
      <span
        className="w-8 h-8 flex-shrink-0 rounded-lg flex items-center justify-center text-base"
        style={{ backgroundColor: `${domainColor}18` }}
        aria-hidden="true"
      >
        {typeResolved.icon}
      </span>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-sm font-semibold text-gray-900 truncate leading-tight">
            {cp?.name || 'Checkpoint'}
          </span>
          {scoring.isLive && (
            <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-green-700 bg-green-100 px-1.5 py-0.5 rounded-full flex-shrink-0">
              <Radio className="w-2.5 h-2.5" /> Live
            </span>
          )}
          {scoring.hasEventTonight && (
            <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-red-700 bg-red-100 px-1.5 py-0.5 rounded-full flex-shrink-0">
              <Star className="w-2.5 h-2.5" /> Ce soir
            </span>
          )}
          {scoring.momentum > 50 && !scoring.isLive && (
            <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded-full flex-shrink-0">
              <Zap className="w-2.5 h-2.5" /> Hot
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
          {/* Micro aperçu du moment réel — prioritaire sur le type label */}
          {scoring.primaryMoment ? (
            <span className="text-xs text-gray-500 italic truncate">
              {scoring.primaryMoment.headline || momentStatusLabel(scoring.primaryMoment.status)}
            </span>
          ) : (
            <span className="text-xs text-gray-400">{typeResolved.shortLabel || typeResolved.label}</span>
          )}
          {cp?.arrondissement && (
            <>
              <span className="text-gray-200" aria-hidden="true">·</span>
              <span className="text-xs text-gray-400 truncate">{cp.arrondissement}</span>
            </>
          )}
          {scoring.distanceM != null && (
            <>
              <span className="text-gray-200" aria-hidden="true">·</span>
              <span className="text-xs text-gray-400 flex items-center gap-0.5">
                <MapPin className="w-2.5 h-2.5" />
                {formatDistanceShort(scoring.distanceM)}
              </span>
            </>
          )}
          {scoring.nextEvent && (
            <>
              <span className="text-gray-200" aria-hidden="true">·</span>
              <span className="text-xs text-indigo-500 flex items-center gap-0.5 font-medium">
                <Calendar className="w-2.5 h-2.5" />
                {formatEventDateShort(scoring.nextEvent.dateStart, scoring.nextEvent.checkpointTimezone || DEFAULT_TIMEZONE)}
              </span>
            </>
          )}
        </div>
      </div>

      {/* CTA */}
      <span className="text-xs text-indigo-600 font-semibold flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        {cta} →
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Sous-composant : bloc focus (checkpoint sélectionné)
// ---------------------------------------------------------------------------

function FocusBlock({ cp, scoring, onSelect, onClose, onAction }) {
  const cpId = cp?.systemId;
  const domainKey = cp?.domainDominantKey || 'default';
  const domainColor = DOMAIN_COLORS[domainKey] || '#6366F1';
  const typeResolved = resolveCheckpointType(cp?.type);
  const moment = scoring.primaryMoment;

  const cta = scoring.isLive ? 'Rejoindre' : scoring.hasEventTonight ? 'Voir ce soir' : 'Explorer';

  return (
    <div
      className="mx-3 mt-3 mb-1 rounded-2xl border overflow-hidden"
      style={{ borderColor: `${domainColor}40`, backgroundColor: `${domainColor}08` }}
    >
      {/* Barre colorée de domaine */}
      <div className="h-1 w-full" style={{ backgroundColor: domainColor }} />

      <div className="px-3.5 py-3">
        {/* Nom + fermer */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className="w-8 h-8 flex-shrink-0 rounded-lg flex items-center justify-center text-base"
              style={{ backgroundColor: `${domainColor}20` }}
            >
              {typeResolved.icon}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-bold text-gray-900 leading-tight truncate">{cp?.name}</p>
              <p className="text-[11px] text-gray-400 truncate">
                {/* Moment réel prioritaire sur le type label */}
                {moment ? momentStatusLabel(moment.status) : (typeResolved.shortLabel || typeResolved.label)}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-600 hover:bg-white/60 transition-colors mt-0.5"
            aria-label="Désélectionner"
          >
            <X className="w-3 h-3" />
          </button>
        </div>

        {/* Texte narratif du moment si disponible */}
        {moment?.subheadline && (
          <p className="text-[11px] text-gray-500 mb-2 leading-tight">{moment.subheadline}</p>
        )}

        {/* Badges statut */}
        <div className="flex flex-wrap gap-1.5 mb-3">
          {scoring.isLive && (
            <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">
              <Radio className="w-2.5 h-2.5" /> Live
            </span>
          )}
          {scoring.hasEventTonight && (
            <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700">
              <Star className="w-2.5 h-2.5" /> Ce soir
            </span>
          )}
          {scoring.momentum > 50 && !scoring.isLive && (
            <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
              <Zap className="w-2.5 h-2.5" /> Hot
            </span>
          )}
          {moment?.participantsCount > 0 && (
            <span className="inline-flex items-center gap-1 text-xs text-gray-500 px-2 py-0.5 rounded-full bg-gray-100">
              {moment.participantsCount} participant{moment.participantsCount > 1 ? 's' : ''}
            </span>
          )}
          {scoring.distanceM != null && (
            <span className="inline-flex items-center gap-1 text-xs text-gray-500 px-2 py-0.5 rounded-full bg-gray-100">
              <MapPin className="w-2.5 h-2.5" />
              {scoring.distanceM < 1000
                ? `${Math.round(scoring.distanceM)}m`
                : `${(scoring.distanceM / 1000).toFixed(1)}km`}
            </span>
          )}
        </div>

        {/* Prochain événement réel si disponible */}
        {scoring.nextEvent && (
          <div className="flex items-center gap-1.5 mb-2 px-0.5">
            <Calendar className="w-3 h-3 text-indigo-400 flex-shrink-0" />
            <span className="text-[11px] text-indigo-600 font-medium truncate">
              {scoring.nextEvent.title || 'Événement prévu'} —{' '}
              {formatEventDateShort(scoring.nextEvent.dateStart, scoring.nextEvent.checkpointTimezone || DEFAULT_TIMEZONE)}
            </span>
          </div>
        )}

        {/* CTA — Action Engine
             join_session  → action directe (navigate vers Play)
             create_event  → action directe (navigate vers Events)
             autres        → sélectionner le checkpoint (ouvrir panel détail) */}
        <button
          type="button"
          onClick={() => {
            const momentCtaType = moment?.ctaType;
            if (momentCtaType === 'join_session' || momentCtaType === 'create_event') {
              onAction?.(cpId, momentCtaType);
            } else {
              onSelect?.(cpId);
            }
          }}
          className="w-full py-1.5 rounded-xl text-xs font-bold text-white transition-opacity hover:opacity-90"
          style={{ backgroundColor: domainColor }}
        >
          {cta} →
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sous-composant : section
// ---------------------------------------------------------------------------

function Section({ title, icon, children, emptyLabel }) {
  const hasContent = React.Children.count(children) > 0;
  return (
    <div>
      <div className="flex items-center gap-1.5 px-4 mb-2">
        <span aria-hidden="true" className="text-sm">{icon}</span>
        <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider">{title}</h3>
      </div>
      {hasContent ? (
        <div>{children}</div>
      ) : (
        <p className="text-xs text-gray-400 px-4 py-1.5 italic">{emptyLabel}</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Composant principal
// ---------------------------------------------------------------------------

const MAX_PER_SECTION = 4;

export default function ExploreOpportunityPanel({
  checkpoints = [],
  liveStatsMap = new Map(),
  // SINGLE SOURCE OF TRUTH — le Panel consomme uniquement cet index pré-calculé par Explore.jsx
  primaryMomentByCheckpointSystemId = new Map(),
  // Index des événements futurs par checkpointId — source de vérité pour l'enrichissement
  eventsByCheckpointId = new Map(),
  userGeo = null,
  arrondissement = null,
  types = [],
  time = 'now',
  selectedVibe = null,
  selectedCheckpointId = null,
  onSelectCheckpoint,
  onAction,       // Action Engine : callback(cpId, ctaType) orchestré par Explore.jsx
  onCreateEvent,
  onLaunchSession,
  compact = false,
}) {
  const context = { userGeo, arrondissement, types, selectedVibe };

  // SINGLE SOURCE OF TRUTH : primaryMomentByCheckpointSystemId — jamais de recompute ici
  const getPrimary = (cpId) => primaryMomentByCheckpointSystemId.get(cpId) ?? null;

  // Checkpoint sélectionné par l'utilisateur (clic carte ou rail)
  const focusedCheckpoint = useMemo(() => {
    if (!selectedCheckpointId) return null;
    return checkpoints.find((cp) => cp?.systemId === selectedCheckpointId) || null;
  }, [selectedCheckpointId, checkpoints]);

  const focusedScoring = useMemo(() => {
    if (!focusedCheckpoint) return null;
    const liveStats = liveStatsMap.get(focusedCheckpoint.systemId);
    const primaryMoment = getPrimary(focusedCheckpoint.systemId);
    const cpEvents = eventsByCheckpointId.get(focusedCheckpoint.systemId) || [];
    return scoreOpportunity(focusedCheckpoint, liveStats, context, primaryMoment, cpEvents);
  }, [focusedCheckpoint, liveStatsMap, primaryMomentByCheckpointSystemId, arrondissement, types, selectedVibe, userGeo]);

  // Score tous les checkpoints — SINGLE SOURCE OF TRUTH pour le tri et les sections
  const scoredAll = useMemo(() => {
    return checkpoints
      .map((cp) => {
        const cpId = cp?.systemId;
        if (!cpId) return null;
        const liveStats = liveStatsMap.get(cpId);
        const primaryMoment = getPrimary(cpId);
        const cpEvents = eventsByCheckpointId.get(cpId) || [];
        const scoring = scoreOpportunity(cp, liveStats, context, primaryMoment, cpEvents);
        return { cp, scoring };
      })
      .filter(Boolean);
  }, [checkpoints, liveStatsMap, primaryMomentByCheckpointSystemId, arrondissement, types, selectedVibe, userGeo]);

  // BLOC 1 — "En ce moment" — 2 niveaux stricts, jamais mélangés
  // NIVEAU 1 : moment réel confirmé (live / peak / rising)
  // NIVEAU 2 : fallback liveStats uniquement si NIVEAU 1 < MAX_PER_SECTION
  const nowItems = useMemo(() => {
    const sorted = [...scoredAll].sort((a, b) => b.scoring.score - a.scoring.score);

    // Niveau 1 — moments réels uniquement
    const withMoment = sorted.filter(({ scoring }) =>
      scoring.primaryMoment &&
      scoring.primaryMoment.momentScore > 20 &&
      ['live','peak','rising'].includes(scoring.primaryMoment.status)
    );

    if (withMoment.length >= MAX_PER_SECTION) {
      return withMoment.slice(0, MAX_PER_SECTION);
    }

    // Niveau 2 — compléter avec liveStats si manque de moments réels
    const momentIds = new Set(withMoment.map(({ cp }) => cp?.systemId));
    const fallback = sorted.filter(({ cp, scoring }) => {
      const cpId = cp?.systemId;
      return !momentIds.has(cpId) && (scoring.isLive || scoring.hasEventTonight || scoring.momentum > 50);
    });

    return [...withMoment, ...fallback].slice(0, MAX_PER_SECTION);
  }, [scoredAll]);

  // BLOC 2 — Autour de toi : pertinents par proximité + contexte
  const nearbyItems = useMemo(() => {
    const nowIds = new Set(nowItems.map(({ cp }) => cp?.systemId));
    return scoredAll
      .filter(({ cp, scoring }) => {
        const cpId = cp?.systemId;
        if (nowIds.has(cpId)) return false; // déjà dans bloc 1
        return scoring.score > 10 && (scoring.distanceM == null || scoring.distanceM < 5000);
      })
      .sort((a, b) => b.scoring.score - a.scoring.score)
      .slice(0, MAX_PER_SECTION);
  }, [scoredAll, nowItems]);

  // BLOC 3 — À créer demain : checkpoints stables, actifs, sans nécessairement être live
  const createItems = useMemo(() => {
    const usedIds = new Set([
      ...nowItems.map(({ cp }) => cp?.systemId),
      ...nearbyItems.map(({ cp }) => cp?.systemId),
    ]);
    return scoredAll
      .filter(({ cp, scoring }) => {
        const cpId = cp?.systemId;
        if (usedIds.has(cpId)) return false;
        // Checkpoint fiable = momentum > 0 ou récemment actif
        return scoring.momentum > 0 || scoring.score > 5;
      })
      .sort((a, b) => b.scoring.score - a.scoring.score)
      .slice(0, MAX_PER_SECTION);
  }, [scoredAll, nowItems, nearbyItems]);

  return (
    <div className="flex flex-col bg-white h-full overflow-y-auto">

      {/* ── HEADER DÉCISIONNEL ── */}
      <div className="px-4 pt-5 pb-4 border-b border-gray-100">
        <p className="text-base font-bold text-gray-900 leading-tight">Que faire maintenant ?</p>
        <p className="text-xs text-gray-400 mt-0.5">Les meilleurs lieux selon ton contexte</p>
      </div>

      {/* ── BLOC FOCUS — checkpoint sélectionné ── */}
      {focusedCheckpoint && focusedScoring && (
        <FocusBlock
          cp={focusedCheckpoint}
          scoring={focusedScoring}
          onSelect={onSelectCheckpoint}
          onClose={() => onSelectCheckpoint?.(focusedCheckpoint.systemId)}
          onAction={onAction}
        />
      )}

      {/* Sections */}
      <div className="flex flex-col space-y-5 py-4">

      {/* BLOC 1 — En ce moment */}
      <Section title="En ce moment" icon="⚡" emptyLabel="Aucune activité détectée pour l'instant.">
        {nowItems.map(({ cp, scoring }) => (
          <OpportunityRow
            key={cp?.systemId}
            cp={cp}
            scoring={scoring}
            onSelect={onSelectCheckpoint}
            onAction={onAction}
            cta={scoring.isLive ? 'Rejoindre' : 'Voir'}
          />
        ))}
      </Section>

      {/* Séparateur */}
      <div className="mx-3 border-t border-gray-100" aria-hidden="true" />

      {/* BLOC 2 — Autour de toi */}
      <Section title="Autour de toi" icon="📍" emptyLabel="Active ta position pour voir les lieux proches.">
        {nearbyItems.map(({ cp, scoring }) => (
          <OpportunityRow
            key={cp?.systemId}
            cp={cp}
            scoring={scoring}
            onSelect={onSelectCheckpoint}
            onAction={onAction}
            cta="Ouvrir"
          />
        ))}
      </Section>

      {/* Séparateur */}
      <div className="mx-3 border-t border-gray-100" aria-hidden="true" />

      {/* BLOC 3 — À créer demain */}
      <Section title="Créer demain" icon="✨" emptyLabel="Aucun lieu disponible pour créer un événement.">
        {createItems.map(({ cp, scoring }) => {
          const cpId = cp?.systemId;
          return (
            <div key={cpId} className="flex items-center group">
              <div className="flex-1 min-w-0">
                <OpportunityRow
                  cp={cp}
                  scoring={scoring}
                  onSelect={onSelectCheckpoint}
                  cta="Voir"
                />
              </div>
              {onCreateEvent && (
                <button
                  type="button"
                  onClick={() => onCreateEvent?.(cpId)}
                  className="flex-shrink-0 mr-3 w-7 h-7 rounded-lg flex items-center justify-center bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors opacity-0 group-hover:opacity-100"
                  aria-label={`Créer un événement à ${cp?.name}`}
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          );
        })}
      </Section>

      </div>{/* end sections */}
    </div>
  );
}