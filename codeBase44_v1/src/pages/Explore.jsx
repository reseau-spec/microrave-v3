/**
 * -----------------------------------------------------------------------------
 * CLARIFICATION ARCHITECTURALE — PLACE DU DOMAINE DANS EXPLORE
 * -----------------------------------------------------------------------------
 *
 * Le domaine n'est ni un détail, ni l'unique pilote.
 * Le domaine est une DIMENSION STRUCTURANTE MAJEURE du Context Engine Explore.
 *
 * PRINCIPE FONDAMENTAL
 *   Le domaine structure.
 *   Le contexte déclenche.
 *
 * AUTREMENT DIT
 *   - Le domaine aide à comprendre la nature culturelle / métier du réseau
 *   - Le contexte aide à décider quoi faire maintenant, où aller, et quoi créer
 *
 * POURQUOI LE DOMAINE RESTE CENTRAL
 *   1. Il structure l'offre et la lecture du marché
 *   2. Il soutient la couleur, la lisibilité et la cohérence du réseau
 *   3. Il aide à segmenter les scènes, les circuits et les opportunités
 *   4. Il reste utile à l'analytics, à la recommandation et à la monétisation
 *
 * POURQUOI LE DOMAINE NE DOIT PAS RÉGNER SEUL
 *   1. Deux checkpoints d'un même domaine peuvent proposer des usages très différents
 *   2. Le domaine ne suffit pas à répondre à :
 *      - quoi faire maintenant
 *      - est-ce proche
 *      - est-ce vivant
 *      - est-ce participatif
 *      - est-ce pertinent pour demain
 *   3. L'utilisateur explore avec une intention située dans le temps, l'espace et l'humeur
 *
 * HIÉRARCHIE OFFICIELLE DES DIMENSIONS EXPLORE
 *   1. Domaine      = structure de l'offre et lecture culturelle du réseau
 *   2. Type         = usage concret du checkpoint (bar, club, karaoké, parc, studio...)
 *   3. Temps        = urgence / horizon d'action (maintenant, ce soir, demain, week-end)
 *   4. Territoire   = faisabilité (arrondissement, proximité, distance)
 *   5. Vibe/Search  = intention exprimée par l'utilisateur
 *
 * CONSÉQUENCE PRODUIT
 *   Explore ne doit pas être piloté uniquement par domainFilter.
 *   Mais Explore ne doit pas non plus effacer le domaine.
 *
 * RÈGLE D'IMPLÉMENTATION
 *   - Le domaine doit rester visible, lisible et exploitable
 *   - Le domaine doit coexister avec type, temps, territoire, vibe et search
 *   - Toute nouvelle logique Explore doit respecter cet équilibre
 *
 * FORMULE DE RÉFÉRENCE
 *   Le domaine structure. Le contexte déclenche.
 *
 * GARDE-FOU
 *   Si un développement rend le domaine marginal, l'architecture dérive.
 *   Si un développement rend le domaine souverain à lui seul, l'expérience dérive.
 *   La bonne cible est une orchestration cohérente des dimensions.
 * -----------------------------------------------------------------------------
 */

/**
 * Explore.jsx
 * -----------------------------------------------------------------------------
 * RESPONSABILITÉ
 *   Orchestrateur principal de la page Explore.
 *
 * PHILOSOPHIE PRODUIT — NE PAS DÉGRADER
 *   Explore n'est PAS une page de recherche classique.
 *   Explore est un CONTEXT ENGINE :
 *   - il anticipe
 *   - il guide
 *   - il déclenche l'action
 *
 * PARADIGME OFFICIEL
 *   Ancien web :
 *     search bar -> résultats
 *   Micro Rave :
 *     contexte -> intention -> opportunités -> action
 *
 * FLOW UX DE RÉFÉRENCE
 *   je regarde -> je découvre -> je veux -> j'agis
 *
 * CE FICHIER DOIT RESTER LA SOURCE D'ORCHESTRATION DU CONTEXTE :
 *   - arrondissement
 *   - type(s)
 *   - temps
 *   - distance
 *   - searchText
 *   - checkpoint sélectionné
 *
 * RÈGLES STRUCTURELLES
 *   1. Ne pas recréer 3 filtres séparés sans state unifié.
 *   2. Tout changement de contexte doit reconfigurer immédiatement :
 *      - la carte
 *      - les opportunités
 *      - le scoring
 *      - le panel de décision
 *   3. Le texte libre est secondaire : il affine, il n'est pas l'entrée principale.
 *   4. L'ouverture de la page doit pouvoir auto-configurer le contexte :
 *      arrondissement = userGeo
 *      type = préférences
 *      temps = maintenant
 *
 * OBJECTIF
 *   Faire d'Explore un moteur de vie locale, pas un catalogue passif.
 */


import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Compass, Flame, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createPageUrl } from '../utils';
import ExploreMapGL from '../components/explore/ExploreMapGL';
import ErrorBoundary from '../components/ErrorBoundary';
import CheckpointSidePanel from '../components/explore/CheckpointSidePanel';
import ForYouRail from '../components/explore/ForYouRail';
import ExploreCommandBar from '../components/explore/ExploreCommandBar';
import ExploreOpportunityPanel from '../components/explore/ExploreOpportunityPanel';
import { DOMAIN_COLORS, DOMAIN_LABELS } from '../constants/domains';
import { useExploreContext, VIBE_OPTIONS } from '../hooks/useExploreContext';



const STATUS_STYLES = {
  rising: {
    label: '↑ En hausse',
    badgeCls: 'bg-amber-100 text-amber-800',
    cardCls: 'border-amber-100',
  },
  live: {
    label: '● Live',
    badgeCls: 'bg-green-100 text-green-800',
    cardCls: 'border-green-100',
  },
  peak: {
    label: '🔥 Peak',
    badgeCls: 'bg-red-100 text-red-800',
    cardCls: 'border-red-100',
  },
};

export default function Explore() {
  const [checkpoints, setCheckpoints] = useState([]);
  const [liveStatsMap, setLiveStatsMap] = useState(new Map());
  const [moments, setMoments] = useState([]);
  // Events futurs — source de vérité pour hasEventTonight/Tomorrow/Weekend
  const [upcomingEvents, setUpcomingEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  // Mobile bottom sheet : 'peek' (20%) | 'expanded' (80%) | 'hidden'
  const [sheetState, setSheetState] = useState('hidden');

  // Context Engine — source de vérité unique du contexte Explore
  const ctx = useExploreContext();
  const {
    selectedCheckpointId,
    setSelectedCheckpointId,
    userGeo,
    setUserGeo,
    arrondissement,
    setArrondissement,
    types,
    setTypes,
    time,
    setTime,
    searchText,
    setSearchText,
    selectedVibe,
    setSelectedVibe,
    normalizedSearch,
    activeTokens,
    removeToken,
    resetContext,
    initializeAutoContext,
  } = ctx;

  // Alias de compatibilité (anciens usages de selectedCpId dans ce fichier)
  const selectedCpId = selectedCheckpointId;
  const setSelectedCpId = setSelectedCheckpointId;

  const isMountedRef = useRef(true);
  const isRefreshingRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!navigator.geolocation) return;

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (!isMountedRef.current) return;
        const geo = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUserGeo(geo);
        // Initialise le contexte auto dès que la géo est disponible
        initializeAutoContext({ userGeo: geo });
      },
      (err) => {
        console.warn('[Explore] Geolocation unavailable:', err);
        // Initialise quand même le contexte sans géo
        initializeAutoContext({});
      },
      {
        enableHighAccuracy: false,
        maximumAge: 60000,
        timeout: 10000,
      }
    );
  }, []);

  const loadData = useCallback(async () => {
    if (isRefreshingRef.current) return;
    isRefreshingRef.current = true;

    if (isMountedRef.current) {
      setLoading(true);
    }

    try {
      const [allCps, liveStats, feedRes, eventsRes] = await Promise.allSettled([
        base44.entities.Checkpoint.filter({}),
        base44.entities.CheckpointLiveStats.list('-momentumScore', 100),
        base44.functions.invoke('getExploreFeed', { limit: 30 }),
        // Events futurs — statuts published ET lobby (lobby = event dont l'inscription est ouverte)
        base44.entities.Event.filter({}),  // on filtre côté client pour garder published+lobby
      ]);

      // 1) Checkpoints
      if (allCps.status === 'fulfilled') {
        const cps = Array.isArray(allCps.value) ? allCps.value : [];
        const activeCps = cps.filter(
          (cp) => cp?.active === true || cp?.active === 'true'
        );


        if (isMountedRef.current) {
          setCheckpoints(activeCps);
        }
      } else {
        console.error('[Explore] Checkpoint load FAILED:', allCps.reason);
        if (isMountedRef.current) {
          setCheckpoints([]);
        }
      }

      // 2) Live stats
      if (liveStats.status === 'fulfilled') {
        const stats = Array.isArray(liveStats.value) ? liveStats.value : [];
        const map = new Map(
          stats
            .filter((s) => s?.checkpointSystemId)
            .map((s) => [s.checkpointSystemId, s])
        );


        if (isMountedRef.current) {
          setLiveStatsMap(map);
        }
      } else {
        console.warn('[Explore] LiveStats load failed (non-fatal):', liveStats.reason);
        if (isMountedRef.current) {
          setLiveStatsMap(new Map());
        }
      }

      // 3) Moments
      if (feedRes.status === 'fulfilled') {
        const momentsData =
          feedRes.value?.data?.moments ||
          feedRes.value?.moments ||
          [];


        if (isMountedRef.current) {
          setMoments(Array.isArray(momentsData) ? momentsData : []);
        }
      } else {
        console.warn('[Explore] Moments load failed (non-fatal):', feedRes.reason);
        if (isMountedRef.current) {
          setMoments([]);
        }
      }
      // 4) Events futurs
      if (eventsRes.status === 'fulfilled') {
        const evs = Array.isArray(eventsRes.value) ? eventsRes.value : [];
        const now = new Date();
        // Garder les événements futurs avec un checkpoint OU une adresse libre
        // Statuts affichables dans Explore : published (inscriptions ouvertes) + lobby (actif)
        // On exclut draft (non publié), completed, archived, cancelled
        const VISIBLE_STATUSES = new Set(['published', 'lobby', 'open']);
        const future = evs.filter((ev) => {
          // 6-H — accepter les events avec adresse libre (sans checkpoint)
          const hasLocation = !!ev?.checkpointId || !!ev?.addressData?.address;
          if (!hasLocation) return false;
          if (!ev?.dateStart) return false;
          // Accepter les events sans statut explicite (compatibilité legacy)
          if (ev?.status && !VISIBLE_STATUSES.has(ev.status)) return false;
          try {
            // Garder les events qui commencent dans les 14 prochains jours
            const t = new Date(ev.dateStart).getTime();
            return t > now.getTime() && (t - now.getTime()) < 14 * 24 * 3600 * 1000;
          } catch {
            return false;
          }
        });
        if (isMountedRef.current) {
          setUpcomingEvents(future);
        }
      } else {
        console.warn('[Explore] Events load failed (non-fatal):', eventsRes.reason);
        if (isMountedRef.current) {
          setUpcomingEvents([]);
        }
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
      isRefreshingRef.current = false;
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  /**
   * RÈGLE D'IDENTITÉ CANONIQUE — CHECKPOINTS
   * ---------------------------------------------------------------------------
   * La seule clé canonique d'un checkpoint est `systemId`.
   *
   * CONSÉQUENCES
   * - Toute sélection Explore doit être stockée en systemId
   * - Toute résolution checkpoint -> objet doit être faite via systemId
   * - Les clés `id`, `cpId`, `checkpointSystemId` ne sont que des clés
   *   de compatibilité transitoire, jamais la source de vérité
   */
  const checkpointIndex = useMemo(() => {
    const map = new Map();
    for (const cp of checkpoints) {
      // Index uniquement sur systemId — clé canonique
      if (cp?.systemId) map.set(cp.systemId, cp);
    }
    return map;
  }, [checkpoints]);

  /**
   * Index de résolution id MongoDB → systemId
   * Nécessaire pour joindre Event.checkpointId (id MongoDB) avec cp.systemId
   */
  /**
   * Index des événements futurs par checkpointId.
   * Permet un lookup O(1) : checkpointId → Event[]
   *
   * Fenêtres temporelles utilisées par le filtre `time` :
   *   now      → ignore les events (activité live uniquement)
   *   tonight  → events dont dateStart est aujourd'hui après 17h
   *   tomorrow → events dont dateStart est demain
   *   weekend  → events dont dateStart est samedi ou dimanche prochain
   */
  /**
   * Index des events par systemId canonique du checkpoint.
   * Event.checkpointId contient directement le systemId (NC-xxxxxxxxx) — pas un id MongoDB.
   * Règle canonique : toujours indexer et joindre par systemId.
   */
  const eventsByCheckpointId = useMemo(() => {
    const map = new Map();
    for (const ev of upcomingEvents) {
      const cpSystemId = ev?.checkpointId; // déjà un systemId
      if (!cpSystemId) continue;
      if (!map.has(cpSystemId)) map.set(cpSystemId, []);
      map.get(cpSystemId).push(ev);
    }
    return map;
  }, [upcomingEvents]);

  /**
   * checkpointsWithEventInWindow — Set<checkpointId>
   * Checkpoints ayant au moins un événement dans la fenêtre temporelle active.
   * Utilisé à la fois pour le filtrage (time !== 'now') et pour enrichir le scoring.
   */
  /**
   * Fenêtres temporelles pour le filtre "time" — recalibrées.
   *
   * RÈGLE CANONIQUE : Event.checkpointId est un systemId — jointure directe.
   *
   * Fenêtres :
   *   tonight  → events dans les prochaines 18h (couvre ce soir + cette nuit)
   *   tomorrow → events entre 18h et 66h (couvre demain + après-demain matin)
   *   weekend  → events dont le jour calendaire est sam ou dim prochains
   *              + vendredi soir si on est en semaine (car "week-end" commence vendredi soir)
   */
  const checkpointsWithEventInWindow = useMemo(() => {
    const set = new Set();
    if (time === 'now') return set;

    const now = new Date();
    const nowMs = now.getTime();

    // tonight : dans les 18 prochaines heures
    const tonightEnd = nowMs + 18 * 3600 * 1000;

    // tomorrow : entre 18h et 66h (lendemain + après-demain matin)
    const tomorrowStart = nowMs + 18 * 3600 * 1000;
    const tomorrowEnd   = nowMs + 66 * 3600 * 1000;

    // weekend : prochain vendredi soir, samedi et dimanche
    const dayOfWeek = now.getDay(); // 0=dim, 6=sam
    const daysToFri = (5 - dayOfWeek + 7) % 7 || 7;
    const daysToSat = (6 - dayOfWeek + 7) % 7 || 7;
    const daysToSun = (0 - dayOfWeek + 7) % 7 || 7;
    const friStr = new Date(nowMs + daysToFri * 86400000).toISOString().slice(0, 10);
    const satStr = new Date(nowMs + daysToSat * 86400000).toISOString().slice(0, 10);
    const sunStr = new Date(nowMs + daysToSun * 86400000).toISOString().slice(0, 10);

    for (const ev of upcomingEvents) {
      const cpSystemId = ev?.checkpointId; // systemId direct
      if (!cpSystemId || !ev?.dateStart) continue;

      let evMs;
      try {
        evMs = new Date(ev.dateStart).getTime();
        if (!Number.isFinite(evMs)) continue;
      } catch { continue; }

      const evDateStr = new Date(evMs).toISOString().slice(0, 10);

      if (time === 'tonight') {
        if (evMs > nowMs && evMs <= tonightEnd) set.add(cpSystemId);
      } else if (time === 'tomorrow') {
        if (evMs > tomorrowStart && evMs <= tomorrowEnd) set.add(cpSystemId);
      } else if (time === 'weekend') {
        // Vendredi après 17h + samedi + dimanche
        const isFriEve = evDateStr === friStr && new Date(evMs).getHours() >= 17;
        const isSat = evDateStr === satStr;
        const isSun = evDateStr === sunStr;
        if (isFriEve || isSat || isSun) set.add(cpSystemId);
      }
    }
    return set;
  }, [upcomingEvents, time]);

  const selectedCheckpoint = useMemo(() => {
    if (!selectedCpId) return null;
    // Lookup canonique par systemId
    return checkpointIndex.get(selectedCpId) || null;
  }, [selectedCpId, checkpointIndex]);

  /**
   * Index A — momentsByCheckpointSystemId
   * Map<checkpointSystemId, CulturalMoment[]>
   * Groupe tous les moments par checkpoint pour jointure O(1).
   */
  const momentsByCheckpointSystemId = useMemo(() => {
    const map = new Map();
    for (const m of moments) {
      const cpId = m?.checkpointSystemId;
      if (!cpId) continue;
      if (!map.has(cpId)) map.set(cpId, []);
      map.get(cpId).push(m);
    }
    return map;
  }, [moments]);

  /**
   * Index B — primaryMomentByCheckpointSystemId
   * Map<checkpointSystemId, CulturalMoment>
   * Retient le moment le plus prioritaire par checkpoint.
   * Priorité : live > peak > rising > recent > fallback par momentScore
   */
  const primaryMomentByCheckpointSystemId = useMemo(() => {
    const STATUS_PRIORITY = { live: 0, peak: 1, rising: 2, recent: 3 };
    const map = new Map();
    for (const [cpId, cpMoments] of momentsByCheckpointSystemId) {
      const primary = cpMoments.reduce((best, m) => {
        const bP = STATUS_PRIORITY[best?.status] ?? 99;
        const mP = STATUS_PRIORITY[m?.status] ?? 99;
        if (mP !== bP) return mP < bP ? m : best;
        // même priorité de statut → tiebreak par momentScore
        return (m?.momentScore ?? 0) > (best?.momentScore ?? 0) ? m : best;
      }, cpMoments[0]);
      map.set(cpId, primary);
    }
    return map;
  }, [momentsByCheckpointSystemId]);

  // ─── PIPELINE DE FILTRAGE ──────────────────────────────────────────────────
  //
  // Context Engine : types, searchText, arrondissement, selectedVibe, time
  //   Ces filtres reflètent l'INTENTION de l'utilisateur.
  //
  // RÈGLE : contextFilteredCheckpoints est la source unique pour tous les enfants.
  // ────────────────────────────────────────────────────────────────────────────

  // Étape 1 — filtrage contextuel (types, search, arrondissement, time)
  const contextCheckpoints = useMemo(() => {
    let result = checkpoints;

    if (types?.length > 0) {
      result = result.filter((cp) => types.includes(cp?.type));
    }

    if (normalizedSearch) {
      result = result.filter((cp) =>
        (cp?.name || '').toLowerCase().includes(normalizedSearch) ||
        (cp?.arrondissement || '').toLowerCase().includes(normalizedSearch) ||
        (cp?.type || '').toLowerCase().includes(normalizedSearch)
      );
    }

    if (arrondissement) {
      result = result.filter((cp) =>
        (cp?.arrondissement || '').toLowerCase().includes(arrondissement.toLowerCase())
      );
    }

    // Filtre vibe — filtre réel sur domaine et type du checkpoint
    if (selectedVibe) {
      const vibeOpt = VIBE_OPTIONS.find((v) => v.key === selectedVibe);
      if (vibeOpt) {
        result = result.filter((cp) => {
          const domainMatch = vibeOpt.domainHints?.includes(cp?.domainDominantKey);
          const typeMatch = vibeOpt.typeHints?.some((t) =>
            (cp?.type || '').toLowerCase().includes(t.toLowerCase())
          );
          return domainMatch || typeMatch;
        });
      }
    }

    // Filtre temporel — actif dès que time !== 'now', même si le set est vide.
    // Si size === 0 : résultat = [] → l'UI affiche "Aucun événement programmé"
    // Ne jamais afficher tous les lieux quand l'user filtre sur une fenêtre temporelle.
    if (time !== 'now') {
      result = result.filter((cp) => checkpointsWithEventInWindow.has(cp?.systemId));
    }

    return result;
  }, [checkpoints, types, normalizedSearch, arrondissement, selectedVibe, time, checkpointsWithEventInWindow]);

  // contextFilteredCheckpoints = sortie directe du Context Engine (alias)
  const contextFilteredCheckpoints = contextCheckpoints;

  // Étape 1 — moments : filtrage contextuel (search)
  // Lit headline en priorité (shape CulturalMoment), puis title/name en fallback
  const contextMoments = useMemo(() => {
    if (!normalizedSearch) return moments;
    return moments.filter((m) =>
      (m?.headline || m?.title || m?.name || '').toLowerCase().includes(normalizedSearch) ||
      (m?.domainKey || '').toLowerCase().includes(normalizedSearch)
    );
  }, [moments, normalizedSearch]);

  // contextFilteredMoments = sortie directe du Context Engine (alias)
  const contextFilteredMoments = contextMoments;

  // ── Context hint dynamique — après les useMemo de filtrage ────────────────
  const contextHint = useMemo(() => {
    const count = contextFilteredCheckpoints.length;
    if (count === 0 && time !== 'now') {
      const labels = { tonight: 'ce soir', tomorrow: 'demain', weekend: 'ce week-end' };
      return `📅 Aucun événement programmé ${labels[time] || ''}`;
    }
    if (count === 0) return '🔍 Aucun lieu correspondant';

    if (selectedVibe) {
      const vibeOption = VIBE_OPTIONS.find((v) => v.key === selectedVibe);
      const icon = vibeOption?.icon ?? '✨';
      const label = vibeOption?.label ?? selectedVibe;
      return `${icon} ${count} lieu${count > 1 ? 'x' : ''} ${label.toLowerCase()}`;
    }

    if (arrondissement) {
      return `📍 ${count} lieu${count > 1 ? 'x' : ''} dans ${arrondissement}`;
    }

    if (userGeo) {
      return `🔥 ${count} lieu${count > 1 ? 'x' : ''} actif${count > 1 ? 's' : ''} près de toi`;
    }

    return `🗺️ ${count} lieu${count > 1 ? 'x' : ''} disponible${count > 1 ? 's' : ''}`;
  }, [contextFilteredCheckpoints.length, selectedVibe, arrondissement, userGeo]);

  // Clear la sélection uniquement si le checkpoint n'existe plus du tout
  // dans le dataset source global — pas dans le sous-ensemble contextuel.
  // Evite d'annuler un clic légitime quand le filtre contextuel change.
  // Lookup par systemId canonique uniquement.
  useEffect(() => {
    if (!selectedCpId) return;
    if (!checkpoints.length) return;

    const stillExists = checkpoints.some(
      (cp) => cp?.systemId === selectedCpId
    );

    if (!stillExists) {
      setSelectedCpId(null);
    }
  }, [checkpoints, selectedCpId]);

  const navigate = useNavigate();

  const handleCheckpointClick = useCallback((cpId) => {
    // CORRECTIF : setSelectedCheckpointId (via useExploreContext) ne supporte pas
    // les updater functions — il faut passer une valeur finale directement.
    const nextId = selectedCpId === cpId ? null : cpId;
    setSelectedCpId(nextId);
    // Mobile : ouvrir le sheet en aperçu si on sélectionne, fermer si on déselectionne
    setSheetState(nextId ? 'peek' : 'hidden');
  }, [selectedCpId, setSelectedCpId]);

  /**
   * handleAction — Action Engine
   * ---------------------------------------------------------------------------
   * Orchestre les CTA réels selon ctaType du moment culturel.
   *
   * ctaType: 'join_session'         → Play avec sessionId si disponible
   * ctaType: 'explore_checkpoint'   → ouvre le CheckpointSidePanel (sélection)
   * ctaType: 'create_event'         → Events (page création)
   * fallback                        → ouvre le CheckpointSidePanel
   *
   * Explore.jsx est le seul orchestrateur de navigation — les composants
   * enfants ne naviguent pas directement.
   */
  const handleAction = useCallback((cpId, ctaType) => {
    if (!cpId) return;

    if (ctaType === 'join_session') {
      // Naviguer directement vers Play — le matchmaking trouvera la session ouverte
      navigate(createPageUrl('Play') + `?checkpointId=${cpId}`);
      return;
    }

    if (ctaType === 'create_event') {
      navigate(createPageUrl('Events') + `?checkpointId=${cpId}`);
      return;
    }

    // explore_checkpoint ou fallback → ouvrir le panel de détail
    const nextId = selectedCpId === cpId ? null : cpId;
    setSelectedCpId(nextId);
  }, [selectedCpId, setSelectedCpId, navigate]);

  const handleMomentClick = useCallback((moment) => {
    const cpId = moment?.checkpointSystemId;
    if (!cpId) return;
    setSelectedCpId(cpId);
  }, []);

  const closePanel = useCallback(() => {
    setSelectedCpId(null);
    setSheetState('hidden');
  }, []);

  return (
    <div
      className="flex flex-col overflow-hidden bg-gray-50"
      style={{ height: 'calc(100dvh - 64px)' }}
    >
      {/* Header */}
      <div className="px-4 py-3 bg-white border-b border-gray-100 flex items-center justify-between flex-shrink-0 z-10">
        <div className="flex items-center gap-2 min-w-0">
          <Compass className="w-5 h-5 text-indigo-600 flex-shrink-0" />
          <h1 className="text-lg font-bold text-gray-900 truncate">Explore</h1>
          {!loading && (
            <span className="text-xs text-gray-400 whitespace-nowrap">
              {contextFilteredCheckpoints.length} lieux
            </span>
          )}
        </div>

        <div className="flex items-center gap-3 flex-shrink-0">
          {contextFilteredMoments.length > 0 && (
            <span className="flex items-center gap-1 text-xs text-orange-600 font-semibold whitespace-nowrap">
              <Flame className="w-3.5 h-3.5" />
              {contextFilteredMoments.length} moments
            </span>
          )}

          <Button
            variant="ghost"
            size="icon"
            onClick={loadData}
            className="h-8 w-8"
            disabled={loading}
          >
            <RefreshCw
              className={`w-4 h-4 ${
                loading ? 'animate-spin text-indigo-500' : 'text-gray-400'
              }`}
            />
          </Button>
        </div>
      </div>

      {/* ── Command Bar — intention principale ── */}
      <ExploreCommandBar
        arrondissement={arrondissement}
        types={types}
        time={time}
        searchText={searchText}
        selectedVibe={selectedVibe}
        activeTokens={activeTokens}
        contextHint={contextHint}
        onSelectVibe={setSelectedVibe}
        onToggleType={(t) => setTypes(types.includes(t) ? types.filter((x) => x !== t) : [...types, t])}
        onSetTime={setTime}
        onSetSearchText={setSearchText}
        onRemoveToken={removeToken}
        onClearAll={resetContext}
      />



      {/* ForYouRail — découverte personnalisée (mobile uniquement) */}
      <div className="lg:hidden">
        {!loading && (
          <ForYouRail
            checkpoints={contextFilteredCheckpoints}
            liveStatsMap={liveStatsMap}
            primaryMomentByCheckpointSystemId={primaryMomentByCheckpointSystemId}
            userGeo={userGeo}
            onSelect={handleCheckpointClick}
          />
        )}
      </div>

      {/* Main area — colonne gauche (opportunités) + centre (map + panel) */}
      <div className="flex-1 min-h-0 flex flex-row overflow-hidden">

        {/* ── COLONNE GAUCHE — opportunités (desktop/tablette uniquement) ── */}
        <div className="hidden lg:flex lg:flex-col lg:w-72 xl:w-80 flex-shrink-0 border-r border-gray-100 bg-white overflow-hidden">
          {/* ForYouRail — teaser secondaire (fond légèrement différencié) */}
          {!loading && (
            <div className="flex-shrink-0 bg-gray-50 border-b-2 border-gray-100">
              <ForYouRail
                checkpoints={contextFilteredCheckpoints}
                liveStatsMap={liveStatsMap}
                primaryMomentByCheckpointSystemId={primaryMomentByCheckpointSystemId}
                userGeo={userGeo}
                onSelect={handleCheckpointClick}
                compact
              />
            </div>
          )}
          {/* OpportunityPanel — surface principale de décision */}
          <div className="flex-1 min-h-0 overflow-y-auto">
            <ExploreOpportunityPanel
              checkpoints={contextFilteredCheckpoints}
              liveStatsMap={liveStatsMap}
              primaryMomentByCheckpointSystemId={primaryMomentByCheckpointSystemId}
              userGeo={userGeo}
              arrondissement={arrondissement}
              types={types}
              time={time}
              selectedVibe={selectedVibe}
              selectedCheckpointId={selectedCpId}
              onSelectCheckpoint={handleCheckpointClick}
              onAction={handleAction}
              eventsByCheckpointId={eventsByCheckpointId}
            />
          </div>
        </div>

        {/* ── CENTRE — carte + panel ── */}
        {/* Desktop : carte + panel côte à côte (flex-row)  */}
        {/* Mobile  : carte + panel empilés (flex-col)      */}
        <div className="flex-1 min-w-0 flex flex-col lg:flex-row overflow-hidden">

          {/* Carte — plein écran sur mobile, flex-1 sur desktop */}
          <div
            className={`
              relative bg-gray-100 flex-shrink-0
              ${selectedCheckpoint
                ? 'h-[42vh] min-h-[220px] lg:h-auto lg:flex-1'
                : 'h-[52vh] min-h-[280px] lg:h-auto lg:flex-1'}
            `}
          >
            {loading && (
              <div className="absolute inset-0 bg-gray-100/80 flex flex-col items-center justify-center z-20">
                <RefreshCw className="w-6 h-6 animate-spin text-indigo-600 mb-2" />
                <span className="text-sm text-gray-600 font-medium">
                  Chargement de la carte…
                </span>
              </div>
            )}
            <div className="absolute inset-0">
              {/* ErrorBoundary isolé — crash MapLibre ne détruit plus toute la page Explore */}
              <ErrorBoundary
                fallback={
                  <div className="w-full h-full flex flex-col items-center justify-center bg-gray-100 text-gray-500 gap-2">
                    <span className="text-2xl">🗺️</span>
                    <span className="text-sm font-medium">La carte n'a pas pu charger</span>
                    <button
                      className="text-xs underline hover:text-gray-800"
                      onClick={() => window.location.reload()}
                    >
                      Recharger
                    </button>
                  </div>
                }
              >
                <ExploreMapGL
                  checkpoints={contextFilteredCheckpoints}
                  liveStatsIndex={liveStatsMap}
                  moments={contextFilteredMoments}
                  selectedId={selectedCpId}
                  onCheckpointClick={handleCheckpointClick}
                  userGeo={userGeo}
                />
              </ErrorBoundary>
            </div>
          </div>

          {/* ── DESKTOP : panel à droite de la carte ── */}
          {selectedCheckpoint && (
            <div className="hidden lg:flex lg:flex-col lg:w-96 lg:flex-shrink-0 lg:border-l lg:border-gray-100 bg-white overflow-y-auto">
              <CheckpointSidePanel
                checkpoint={selectedCheckpoint}
                liveStats={liveStatsMap.get(selectedCheckpoint.systemId)}
                userGeo={userGeo}
                onClose={closePanel}
                onCheckinSuccess={() => {}}
              />
            </div>
          )}

          {/* Desktop sans sélection : MomentsList à droite */}
          {!selectedCheckpoint && (
            <div className="hidden lg:flex lg:flex-col lg:w-80 lg:flex-shrink-0 lg:border-l lg:border-gray-100 bg-white overflow-y-auto">
              <MomentsList
                moments={contextFilteredMoments}
                onMomentClick={handleMomentClick}
                loading={loading}
              />
            </div>
          )}

          {/* ── MOBILE : bottom sheet style Communauto ── */}
          {/*
            Trois états :
              hidden   → h-0, invisible
              peek     → 30vh — aperçu compact, carte visible derrière
              expanded → calc(100dvh - 64px) — plein écran sous la nav, touche le bas
            Le sheet est flex-col : handle + contenu scrollable + footer fixe
          */}
          <div
            className={`
              lg:hidden fixed bottom-0 left-0 right-0 bg-white rounded-t-2xl shadow-2xl
              flex flex-col
              transition-[height] duration-300 ease-in-out z-30
              ${sheetState === 'hidden'   ? 'h-0 overflow-hidden pointer-events-none' : ''}
              ${sheetState === 'peek'     ? 'h-[148px]' : ''}
              ${sheetState === 'expanded' ? 'h-[calc(100dvh-64px)]' : ''}
            `}
          >
            {/* Drag handle — cliquable pour toggle peek ↔ expanded */}
            <div
              className="flex justify-center pt-2.5 pb-1 flex-shrink-0 cursor-pointer"
              onClick={() => setSheetState(s => s === 'peek' ? 'expanded' : 'peek')}
            >
              <div className="w-10 h-1 rounded-full bg-gray-300" />
            </div>

            {/* ── PEEK — aperçu compact ── */}
            {sheetState === 'peek' && selectedCheckpoint && (
              <div className="px-4 pb-3 flex-1 flex flex-col justify-between min-h-0">
                <div className="flex items-center justify-between gap-3">
                  {/* Nom en défilement horizontal si trop long */}
                  <div className="min-w-0 overflow-hidden">
                    <div className="overflow-x-auto no-scrollbar">
                      <p className="font-bold text-gray-900 text-base leading-tight whitespace-nowrap pr-2">
                        {selectedCheckpoint.name}
                      </p>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">{selectedCheckpoint.type}</p>
                  </div>
                  <button
                    onClick={closePanel}
                    className="flex-shrink-0 w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-gray-400"
                  >
                    ✕
                  </button>
                </div>
                <button
                  onClick={() => setSheetState('expanded')}
                  className="mt-3 w-full py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold"
                >
                  Voir le détail →
                </button>
              </div>
            )}

            {/* ── EXPANDED — détail complet, flex-col pour que le footer colle en bas ── */}
            {sheetState === 'expanded' && selectedCheckpoint && (
              <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                <CheckpointSidePanel
                  checkpoint={selectedCheckpoint}
                  liveStats={liveStatsMap.get(selectedCheckpoint.systemId)}
                  userGeo={userGeo}
                  onClose={() => setSheetState('peek')}
                  onCheckinSuccess={() => {}}
                />
              </div>
            )}
          </div>

          {/* Mobile sans sélection : MomentsList sous la carte */}
          <div className="lg:hidden flex-1 min-h-0 overflow-y-auto bg-white">
            <MomentsList
              moments={contextFilteredMoments}
              onMomentClick={handleMomentClick}
              loading={loading}
            />
          </div>
        </div>

      </div>
    </div>
  );
}

function MomentsList({ moments, onMomentClick, loading }) {
  if (loading) return null;

  if (!moments.length) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-gray-400 gap-3">
        <Compass className="w-10 h-10 text-gray-200" />
        <p className="text-sm font-medium">Aucun moment culturel actif</p>
        <p className="text-xs text-gray-400">
          Les checkpoints actifs sont visibles sur la carte
        </p>
      </div>
    );
  }

  return (
    <div className="px-4 py-4">
      <div className="flex items-center gap-2 mb-3">
        <Flame className="w-4 h-4 text-orange-500" />
        <span className="text-sm font-semibold text-gray-700">
          Moments culturels actifs
        </span>
        <span className="text-xs text-gray-400">({moments.length})</span>
      </div>

      <div className="space-y-2 pb-4">
        {moments.map((m) => (
          <MomentCard key={m.id} moment={m} onClick={() => onMomentClick(m)} />
        ))}
      </div>
    </div>
  );
}

function MomentCard({ moment, onClick }) {
  const s = STATUS_STYLES[moment.status] || STATUS_STYLES.rising;
  const color = DOMAIN_COLORS[moment.domainKey];

  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-3.5 rounded-xl border bg-white hover:shadow-md hover:-translate-y-0.5 transition-all duration-150 ${s.cardCls}`}
    >
      <div className="flex items-start gap-3">
        <div
          className="w-3 h-3 rounded-full flex-shrink-0 mt-1"
          style={{ backgroundColor: color || '#6366F1' }}
        />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${s.badgeCls}`}>
              {s.label}
            </span>

            <span
              className="text-xs font-medium px-2 py-0.5 rounded-full"
              style={{
                backgroundColor: `${color || '#6366F1'}20`,
                color: color || '#6366F1',
              }}
            >
              {DOMAIN_LABELS[moment.domainKey] || moment.domainKey}
            </span>
          </div>

          <p className="text-sm font-semibold text-gray-900 leading-snug line-clamp-1">
            {moment.headline || moment.title || moment.name || 'Moment culturel'}
          </p>

          {(moment.subheadline || moment.subtitle) && (
            <p className="text-xs text-gray-500 mt-1 line-clamp-2">
              {moment.subheadline || moment.subtitle}
            </p>
          )}
        </div>
      </div>
    </button>
  );
}