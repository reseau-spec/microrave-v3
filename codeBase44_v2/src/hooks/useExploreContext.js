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
 *//**
 * useExploreContext.js
 * -----------------------------------------------------------------------------
 * RESPONSABILITÉ
 *   Source de vérité du Context Engine Explore.
 *
 * CE HOOK CENTRALISE :
 *   - l'état des tokens
 *   - les valeurs implicites au chargement
 *   - les setters
 *   - les dérivations communes
 *
 * ÉTAT OFFICIEL
 *   {
 *     arrondissement,
 *     types,
 *     time,
 *     distance,
 *     searchText,
 *     selectedCheckpointId   // toujours un checkpoint.systemId — clé canonique unique
 *   }
 *
 * RÈGLE D'ARCHITECTURE
 *   Toute couche Explore doit lire un contexte partagé,
 *   et non réinventer sa propre logique locale.
 *
 * OBJECTIF
 *   Garantir le comportement instantané :
 *   token change -> map / rail / opportunités / panel changent ensemble
 */

import { useState, useCallback, useMemo } from 'react';
import { resolveCheckpointType } from '../constants/checkpointTypes';

// ---------------------------------------------------------------------------
// Constantes des tokens officiels
// ---------------------------------------------------------------------------

export const TIME_OPTIONS = [
  { key: 'now',     label: 'Maintenant', icon: '⚡' },
  { key: 'tonight', label: 'Ce soir',    icon: '🌙' },
  { key: 'tomorrow',label: 'Demain',     icon: '☀️' },
  { key: 'weekend', label: 'Week-end',   icon: '🎉' },
];

export const VIBE_OPTIONS = [
  { key: 'musical',      label: 'Vibe musicale',  icon: '🎧', domainHints: ['music'] },
  { key: 'humoristique', label: 'Humoristique',   icon: '😂', domainHints: ['humour'] },
  { key: 'participatif', label: 'Participatif',   icon: '🎤', typeHints: ['Karaokè'] },
  { key: 'chill',        label: 'Chill',          icon: '🍸', typeHints: ['Bar', 'Bistro', 'terrasse'] },
  { key: 'competitif',   label: 'Compétitif',     icon: '🔥', typeHints: ['Club', 'Installation sportive'] },
];

// ---------------------------------------------------------------------------
// État initial
// ---------------------------------------------------------------------------

const INITIAL_STATE = {
  arrondissement: null,
  types: [],
  time: 'now',
  distance: null,
  searchText: '',
  selectedVibe: null,
  selectedCheckpointId: null,
  userGeo: null,
  contextMode: 'auto',
  autoContextReady: false,
};

// ---------------------------------------------------------------------------
// Hook principal
// ---------------------------------------------------------------------------

export function useExploreContext() {
  const [state, setState] = useState(INITIAL_STATE);

  // Setters atomiques
  const setArrondissement = useCallback((val) => setState((s) => ({ ...s, arrondissement: val })), []);
  const setTypes = useCallback((val) => setState((s) => ({ ...s, types: Array.isArray(val) ? val : [] })), []);
  const setTime = useCallback((val) => setState((s) => ({ ...s, time: val })), []);
  const setDistance = useCallback((val) => setState((s) => ({ ...s, distance: val })), []);
  const setSearchText = useCallback((val) => setState((s) => ({ ...s, searchText: val })), []);
  const setSelectedVibe = useCallback((val) => setState((s) => ({ ...s, selectedVibe: s.selectedVibe === val ? null : val })), []);
  // selectedCheckpointId contient toujours un checkpoint.systemId — jamais un id, cpId ou autre clé.
  const setSelectedCheckpointId = useCallback((val) => setState((s) => ({ ...s, selectedCheckpointId: val })), []);
  const setUserGeo = useCallback((val) => setState((s) => ({ ...s, userGeo: val })), []);

  // Toggle un type dans le tableau
  const toggleType = useCallback((typeKey) => {
    setState((s) => ({
      ...s,
      types: s.types.includes(typeKey)
        ? s.types.filter((t) => t !== typeKey)
        : [...s.types, typeKey],
    }));
  }, []);

  // Applique un preset de vibe (met aussi à jour selectedVibe)
  const applyVibePreset = useCallback((vibeKey) => {
    setState((s) => ({
      ...s,
      selectedVibe: s.selectedVibe === vibeKey ? null : vibeKey,
      contextMode: 'manual',
    }));
  }, []);

  // Retire un token par kind+key
  const removeToken = useCallback((token) => {
    setState((s) => {
      switch (token.kind) {
        case 'arrondissement': return { ...s, arrondissement: null };
        case 'type':           return { ...s, types: s.types.filter((t) => t !== token.value) };
        case 'time':           return { ...s, time: 'now' };
        case 'distance':       return { ...s, distance: null };
        case 'searchText':     return { ...s, searchText: '' };
        case 'vibe':           return { ...s, selectedVibe: null };
        default:               return s;
      }
    });
  }, []);

  // Initialisation auto du contexte (appelée depuis Explore après chargement userGeo/prefs)
  const initializeAutoContext = useCallback(({ userGeo, preferredTypes } = {}) => {
    setState((s) => ({
      ...s,
      userGeo: userGeo ?? s.userGeo,
      types: preferredTypes?.length ? preferredTypes : s.types,
      time: 'now',
      contextMode: 'auto',
      autoContextReady: true,
    }));
  }, []);

  // Reset complet
  const resetContext = useCallback(() => {
    setState((s) => ({
      ...INITIAL_STATE,
      userGeo: s.userGeo, // on garde la géo
      autoContextReady: s.autoContextReady,
    }));
  }, []);

  // ---------------------------------------------------------------------------
  // Dérivations
  // ---------------------------------------------------------------------------

  const activeTokens = useMemo(() => {
    const tokens = [];
    const { arrondissement, types, time, distance, searchText, selectedVibe } = state;

    if (arrondissement) {
      tokens.push({ kind: 'arrondissement', key: arrondissement, label: arrondissement, icon: '📍', value: arrondissement, removable: true });
    }

    types.forEach((t) => {
      const resolved = resolveCheckpointType(t);
      tokens.push({ kind: 'type', key: t, label: resolved.shortLabel || resolved.label, icon: resolved.icon, value: t, removable: true });
    });

    if (time && time !== 'now') {
      const opt = TIME_OPTIONS.find((o) => o.key === time);
      if (opt) tokens.push({ kind: 'time', key: time, label: opt.label, icon: opt.icon, value: time, removable: true });
    }

    if (distance) {
      tokens.push({ kind: 'distance', key: 'distance', label: `${distance}km`, icon: '📏', value: distance, removable: true });
    }

    if (searchText.trim()) {
      tokens.push({ kind: 'searchText', key: 'search', label: searchText.trim(), icon: '🔍', value: searchText.trim(), removable: true });
    }

    if (selectedVibe) {
      const vibe = VIBE_OPTIONS.find((v) => v.key === selectedVibe);
      if (vibe) tokens.push({ kind: 'vibe', key: selectedVibe, label: vibe.label, icon: vibe.icon, value: selectedVibe, removable: true });
    }

    return tokens;
  }, [state]);

  const hasActiveFilters = useMemo(() => activeTokens.length > 0, [activeTokens]);

  const isAutoContext = state.contextMode === 'auto';

  const normalizedSearch = useMemo(() => state.searchText.trim().toLowerCase(), [state.searchText]);

  return {
    // État
    ...state,

    // Setters
    setArrondissement,
    setTypes,
    toggleType,
    setTime,
    setDistance,
    setSearchText,
    setSelectedVibe,
    setSelectedCheckpointId,
    setUserGeo,
    applyVibePreset,
    removeToken,
    initializeAutoContext,
    resetContext,

    // Dérivations
    activeTokens,
    hasActiveFilters,
    isAutoContext,
    normalizedSearch,
  };
}