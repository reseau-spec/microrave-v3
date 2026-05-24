/**
 * checkpointMapUtils.js
 * -----------------------------------------------------------------------------
 * RESPONSABILITÉ
 *   Transformer les checkpoints bruts en signaux cartographiques normalisés.
 *
 * CE FICHIER EST LA COUCHE DE TRADUCTION
 *   Données métier -> propriétés GeoJSON exploitables par la carte
 *
 * IL DOIT CENTRALISER :
 *   - coordonnées normalisées
 *   - radius/opacité
 *   - états visuels (live/hot/inactive/hasEvent)
 *   - domain color
 *   - type label / type icon
 *   - toute propriété nécessaire au rendu immédiat
 *
 * RÈGLE PRODUIT
 *   Un checkpoint ne doit pas être seulement un point géographique.
 *   Il doit devenir un signal :
 *   - de nature (type)
 *   - de territoire (arrondissement)
 *   - de vie (live/hot)
 *   - de pertinence (momentum, proximité, événement)
 *
 * RÈGLE D'ARCHITECTURE
 *   Toute logique de dérivation visuelle commune doit vivre ici,
 *   pas être recopiée dans ExploreMapGL, Explore.jsx ou les panels.
 */

/**
 * -----------------------------------------------------------------------------
 * CLARIFICATION ARCHITECTURALE — CARTE, DOMAINE ET CONTEXTE
 * -----------------------------------------------------------------------------
 *
 * La carte Explore ne doit pas réduire un checkpoint à une coordonnée.
 * Elle doit traduire visuellement plusieurs dimensions à la fois.
 *
 * RÈGLE
 *   Le domaine reste une dimension structurante majeure :
 *   - couleur
 *   - lecture culturelle
 *   - cohérence réseau
 *
 * MAIS
 *   la carte doit aussi refléter le contexte actif :
 *   - type
 *   - temps
 *   - proximité
 *   - état live / hot / inactive
 *   - intention utilisateur
 *
 * FORMULE DE RÉFÉRENCE
 *   Le domaine structure. Le contexte déclenche.
 *
 * CONSÉQUENCE
 *   Toute dérivation GeoJSON doit préserver une place forte au domaine
 *   sans en faire l'unique signal.
 * -----------------------------------------------------------------------------
 */



import { DOMAIN_COLORS } from '../constants/domains.js';

export const DEFAULT_CENTER = [-73.5673, 45.5017]; // Montréal
export const DEFAULT_ZOOM = 11.5;

// Seuil d'inactivité : 30 jours en millisecondes
const INACTIVITY_THRESHOLD_MS = 30 * 24 * 60 * 60 * 1000;

// Seuil de momentum "chaud"
const HOT_MOMENTUM_THRESHOLD = 50;

// Fenêtre "événement ce soir" : 24h en millisecondes
const EVENT_WINDOW_MS = 24 * 60 * 60 * 1000;


export function toNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function isValidLat(lat) {
  return Number.isFinite(lat) && lat >= -90 && lat <= 90;
}

export function isValidLng(lng) {
  return Number.isFinite(lng) && lng >= -180 && lng <= 180;
}

export function normalizeCoords(cp) {
  const rawLat = toNumber(cp?.geoLat);
  const rawLng = toNumber(cp?.geoLng);

  if (rawLat === null || rawLng === null) return null;

  if (isValidLat(rawLat) && isValidLng(rawLng)) {
    return { lat: rawLat, lng: rawLng, wasSwapped: false };
  }

  if (isValidLat(rawLng) && isValidLng(rawLat)) {
    return { lat: rawLng, lng: rawLat, wasSwapped: true };
  }

  return null;
}

/**
 * Détermine les flags d'état d'un checkpoint à partir de ses liveStats.
 *
 * Les états de rayon sont mutuellement exclusifs et hiérarchisés :
 *   live > hot > inactive > normal
 *
 * hasEvent est orthogonal : un checkpoint live peut aussi avoir un événement ce soir.
 *
 * @param {object|undefined} liveStats  - entrée de CheckpointLiveStats pour ce checkpoint
 * @returns {{ isLive, isHot, isInactive, hasEvent, radiusMultiplier, opacity }}
 */
export function resolveCheckpointState(liveStats) {
  const now = Date.now();

  // --- isLive : session ouverte en ce moment ---
  const isLive = Number(liveStats?.recentSessionsOpened ?? 0) > 0;

  // --- isHot : momentum élevé (sans session active, sinon isLive prime) ---
  const momentum = Number(liveStats?.momentumScore ?? 0);
  const isHot = !isLive && momentum >= HOT_MOMENTUM_THRESHOLD;

  // --- isInactive : aucune activité depuis 30 jours ---
  // On se base sur lastActivityAt si disponible, sinon sur recentCheckins + momentum
  let isInactive = false;
  if (liveStats?.lastActivityAt) {
    const lastAt = new Date(liveStats.lastActivityAt).getTime();
    isInactive = Number.isFinite(lastAt) && (now - lastAt) > INACTIVITY_THRESHOLD_MS;
  } else if (!liveStats) {
    // Pas de liveStats du tout → on considère le checkpoint inactif
    isInactive = true;
  } else {
    // liveStats existe mais sans lastActivityAt : on regarde si tout est à zéro
    const hasRecentSignal =
      Number(liveStats.momentumScore ?? 0) > 0 ||
      Number(liveStats.recentCheckins ?? 0) > 0 ||
      Number(liveStats.recentSessionsOpened ?? 0) > 0;
    isInactive = !hasRecentSignal;
  }

  // Un checkpoint live ou hot ne peut pas être inactif
  if (isLive || isHot) isInactive = false;

  // --- hasEvent : événement dans les 24 prochaines heures ---
  // Support de deux formes selon ce que le backend expose :
  //   liveStats.hasEventTonight (boolean explicite)
  //   liveStats.nextEventAt     (timestamp ISO)
  let hasEvent = liveStats?.hasEventTonight === true;
  if (!hasEvent && liveStats?.nextEventAt) {
    const eventAt = new Date(liveStats.nextEventAt).getTime();
    hasEvent = Number.isFinite(eventAt) && eventAt > now && (eventAt - now) <= EVENT_WINDOW_MS;
  }

  // --- Multiplicateur de rayon selon état (priorité : live > hot > inactive > normal) ---
  let radiusMultiplier = 1.0;
  if (isLive)          radiusMultiplier = 1.6;
  else if (isHot)      radiusMultiplier = 1.4;
  else if (isInactive) radiusMultiplier = 0.7;

  // --- Opacity réduite pour les inactifs ---
  const opacity = isInactive ? 0.5 : 1.0;

  return { isLive, isHot, isInactive, hasEvent, radiusMultiplier, opacity };
}

export function buildGeoJSON(
  checkpoints = [],
  liveStatsIndex = new Map(),
  selectedId = null,
  verbose = false
) {
  let invalidCount = 0;
  let swappedCount = 0;
  let liveCount = 0;
  let hotCount = 0;
  let inactiveCount = 0;
  let eventCount = 0;

  const features = checkpoints
    .map((cp, idx) => {
      const cpId = cp?.systemId || cp?.id;
      if (!cpId) return null;

      const coords = normalizeCoords(cp);
      if (!coords) {
        invalidCount += 1;
        if (verbose && idx < 20) {
          console.warn('[checkpointMapUtils] Invalid coords rejected', {
            name: cp?.name,
            systemId: cp?.systemId,
            rawLat: cp?.geoLat,
            rawLng: cp?.geoLng,
          });
        }
        return null;
      }

      if (coords.wasSwapped) swappedCount += 1;

      const liveStats = liveStatsIndex?.get?.(cpId);
      const momentum = Number(liveStats?.momentumScore || 0);

      // Rayon de base : 8px + contribution du momentum (même logique qu'avant)
      const norm = Math.max(0, Math.min(momentum / 80, 1));
      const baseRadius = 8 + norm * 8;

      // États visuels
      const { isLive, isHot, isInactive, hasEvent, radiusMultiplier, opacity } =
        resolveCheckpointState(liveStats);

      // Rayon final arrondi
      const radius = Math.round(baseRadius * radiusMultiplier);

      const domainKey = cp?.domainDominantKey || 'default';
      const color = DOMAIN_COLORS[domainKey] || DOMAIN_COLORS.default;

      // Compteurs pour le log verbose
      if (isLive)     liveCount++;
      if (isHot)      hotCount++;
      if (isInactive) inactiveCount++;
      if (hasEvent)   eventCount++;

      return {
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [coords.lng, coords.lat],
        },
        properties: {
          // ── IDENTITÉ CANONIQUE ──────────────────────────────────────────────
          // systemId est la clé canonique unique d'un checkpoint.
          // cpId est maintenu uniquement comme alias de compatibilité transitoire.
          // Ne pas introduire de nouvelle logique basée sur cpId.
          // ────────────────────────────────────────────────────────────────────
          systemId: cpId,    // clé canonique — toujours un checkpoint.systemId
          cpId,              // alias transitoire — pointe sur systemId, pas une autre vérité
          name: cp?.name || 'Checkpoint',
          color,
          radius,
          selected: cpId === selectedId ? 1 : 0,
          domainKey,
          momentum,
          // — États visuels (0/1 pour compatibilité expressions MapLibre) —
          isLive:     isLive     ? 1 : 0,
          isHot:      isHot      ? 1 : 0,
          isInactive: isInactive ? 1 : 0,
          hasEvent:   hasEvent   ? 1 : 0,
          opacity,
        },
      };
    })
    .filter(Boolean);

  if (verbose) {
    console.log('[checkpointMapUtils] GeoJSON build done', {
      totalCheckpoints: checkpoints?.length || 0,
      renderedFeatures: features.length,
      invalidCount,
      swappedCount,
      liveCount,
      hotCount,
      inactiveCount,
      eventCount,
    });
  }

  return {
    type: 'FeatureCollection',
    features,
  };
}

export function getBoundsCoords(geojson) {
  const features = geojson?.features || [];
  if (!features.length) return null;

  const coords = features
    .map((f) => f?.geometry?.coordinates)
    .filter(
      (c) =>
        Array.isArray(c) &&
        c.length === 2 &&
        isValidLng(c[0]) &&
        isValidLat(c[1])
    );

  if (!coords.length) return null;

  let minLng = coords[0][0];
  let maxLng = coords[0][0];
  let minLat = coords[0][1];
  let maxLat = coords[0][1];

  for (const [lng, lat] of coords) {
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }

  return { minLng, maxLng, minLat, maxLat };
}