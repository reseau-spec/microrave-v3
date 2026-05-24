/**
 * ExploreMapGL.jsx
 * -----------------------------------------------------------------------------
 * RESPONSABILITÉ
 *   Rendu cartographique temps réel de l'état Explore.
 *
 * CONTRAT PRODUIT
 *   La carte ne doit jamais être neutre.
 *   Elle doit refléter le contexte actif défini par Explore.jsx :
 *   - ce qui est pertinent
 *   - ce qui est vivant
 *   - ce qui est proche
 *   - ce qui mérite l'attention maintenant
 *
 * LA CARTE EST LA COUCHE "RÉALITÉ"
 *   TOP    = intention
 *   LEFT   = opportunités
 *   MAP    = réalité
 *   RIGHT  = décision
 *
 * RÈGLES DE CONCEPTION
 *   1. Quand les tokens changent, la carte change immédiatement.
 *   2. La carte doit savoir :
 *      - filtrer
 *      - zoomer
 *      - mettre en évidence
 *      - atténuer le hors-contexte
 *   3. Les signaux de vie priment sur les points statiques :
 *      live > hot > actif normal > inactif
 *   4. Le type et son icône doivent améliorer la lisibilité instantanée.
 *   5. Ne jamais remettre une logique qui drop silencieusement les données avant load.
 *
 * GARDE-FOU TECHNIQUE
 *   Le fix de race condition load vs setData est structurel.
 *   Toute refonte MapLibre doit préserver :
 *   - styleLoadedRef
 *   - pendingGeojsonRef
 *   - le flush des données au bon moment
 */


import React, { useEffect, useMemo, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  buildGeoJSON,
  getBoundsCoords,
  DEFAULT_CENTER,
  DEFAULT_ZOOM,
} from '../../map/checkpointMapUtils';

// ---------------------------------------------------------------------------
// Constantes de rendu
// ---------------------------------------------------------------------------

// Fréquence de l'animation du ring "live" (ms entre chaque frame)
const LIVE_PULSE_INTERVAL_MS = 50;

// Bornes d'opacité pour le pulse du ring live
const LIVE_PULSE_MIN = 0.08;
const LIVE_PULSE_MAX = 0.55;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Ajoute tous les layers de rendu checkpoint à la carte.
 * Appelé une seule fois dans map.on('load').
 */
function addCheckpointLayers(map, compact) {
  // -- 1. Halo de base (tous les checkpoints) --------------------------------
  map.addLayer({
    id: 'checkpoint-halo',
    type: 'circle',
    source: 'checkpoints',
    paint: {
      'circle-radius': compact
        ? ['case', ['==', ['get', 'selected'], 1], 14, 10]
        : ['+', ['get', 'radius'], 6],
      'circle-color': compact
        ? ['case', ['==', ['get', 'selected'], 1], '#7C3AED', ['get', 'color']]
        : ['get', 'color'],
      // Les inactifs ont leur halo très réduit
      'circle-opacity': [
        'case',
        ['==', ['get', 'isInactive'], 1], 0.06,
        compact ? 0.12 : 0.16,
      ],
      'circle-blur': 0.8,
    },
  });

  // -- 2. Ring ambre pour les checkpoints "hot" (momentum >= 50) -------------
  // Cercle légèrement plus grand que le dot, opacité fixe, couleur ambre
  map.addLayer({
    id: 'checkpoint-hot-ring',
    type: 'circle',
    source: 'checkpoints',
    filter: ['==', ['get', 'isHot'], 1],
    paint: {
      'circle-radius': ['+', ['get', 'radius'], 8],
      'circle-color': '#F59E0B',
      'circle-opacity': 0.22,
      'circle-blur': 0.6,
    },
  });

  // -- 3. Ring vert pour les checkpoints "live" (session ouverte) ------------
  // Opacité initiale à 0 — animée en JS via setPaintProperty
  map.addLayer({
    id: 'checkpoint-live-ring',
    type: 'circle',
    source: 'checkpoints',
    filter: ['==', ['get', 'isLive'], 1],
    paint: {
      'circle-radius': ['+', ['get', 'radius'], 10],
      'circle-color': '#10B981',
      'circle-opacity': LIVE_PULSE_MIN,
      'circle-blur': 0.7,
    },
  });

  // -- 4. Dot principal (tous les checkpoints) --------------------------------
  map.addLayer({
    id: 'checkpoint-dot',
    type: 'circle',
    source: 'checkpoints',
    paint: {
      'circle-radius': compact
        ? ['case', ['==', ['get', 'selected'], 1], 9, 6]
        : ['get', 'radius'],
      'circle-color': compact
        ? ['case', ['==', ['get', 'selected'], 1], '#7C3AED', ['get', 'color']]
        : ['get', 'color'],
      'circle-stroke-color': [
        'case',
        ['==', ['get', 'selected'], 1], '#FFFFFF',
        'rgba(255,255,255,0.9)',
      ],
      'circle-stroke-width': [
        'case',
        ['==', ['get', 'selected'], 1], 3,
        2,
      ],
      // Inactifs à opacity réduite ; le reste plein
      'circle-opacity': [
        'case',
        ['==', ['get', 'isInactive'], 1], 0.45,
        1,
      ],
    },
  });

  // -- 5. Ring de sélection (checkpoint cliqué) --------------------------------
  map.addLayer({
    id: 'checkpoint-selected-ring',
    type: 'circle',
    source: 'checkpoints',
    filter: ['==', ['get', 'selected'], 1],
    paint: {
      'circle-radius': compact ? 14 : ['+', ['get', 'radius'], 5],
      'circle-color': 'rgba(0,0,0,0)',
      'circle-stroke-color': '#7C3AED',
      'circle-stroke-width': 3,
      'circle-opacity': 1,
    },
  });

  // -- 6. Indicateur d'événement ce soir -------------------------------------
  // Petit cercle blanc centré sur le dot — marque un événement dans les 24h.
  // On superpose un cercle opaque blanc (rayon fixe 3px) puis un cercle
  // coloré légèrement plus grand pour former un "badge" lisible.
  // Note : circle-translate n'accepte que des valeurs statiques [x, y] en pixels.
  // Les expressions data-driven ne sont pas supportées sur cette propriété.
  // Décalage fixe vers le coin supérieur-droit — fonctionne bien pour radius 8–16px.
  map.addLayer({
    id: 'checkpoint-event-badge',
    type: 'circle',
    source: 'checkpoints',
    filter: ['==', ['get', 'hasEvent'], 1],
    paint: {
      'circle-radius': 5,
      'circle-color': '#FFFFFF',
      'circle-opacity': 1,
      'circle-stroke-color': '#EF4444',
      'circle-stroke-width': 2,
      'circle-translate': [8, -8],
    },
  });
}

// ---------------------------------------------------------------------------
// Composant principal
// ---------------------------------------------------------------------------

export default function ExploreMapGL({
  checkpoints = [],
  liveStatsIndex = new Map(),
  selectedId = null,
  onCheckpointClick,
  center = DEFAULT_CENTER,
  zoom = DEFAULT_ZOOM,
  compact = false,
  userGeo = null,
}) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const popupRef = useRef(null);
  const resizeObserverRef = useRef(null);
  const resizeRafRef = useRef(null);

  const didInitialFitRef = useRef(false);
  const lastDataSignatureRef = useRef('');
  const compactInitDoneRef = useRef(false);
  const styleLoadedRef = useRef(false);
  const pendingGeojsonRef = useRef(null);

  // Animation pulse "live"
  const livePulseRafRef = useRef(null);
  const livePulsePhaseRef = useRef(0); // 0..2π

  const lastFocusedSelectedIdRef = useRef(null);
  const lastFocusedCoordsRef = useRef('');

  const onClickRef = useRef(onCheckpointClick);
  useEffect(() => {
    onClickRef.current = onCheckpointClick;
  }, [onCheckpointClick]);

  const stableCenter = useMemo(() => userGeo?.lat && userGeo?.lng ? [userGeo.lng, userGeo.lat] : center, []);
  const stableZoom = useMemo(() => userGeo?.lat ? 16 : zoom, []);

  const geojson = useMemo(
    () => buildGeoJSON(checkpoints, liveStatsIndex, selectedId, !compact),
    [checkpoints, liveStatsIndex, selectedId, compact]
  );

  const dataSignature = useMemo(
    () =>
      JSON.stringify(
        geojson.features.map((f) => [
          f.properties?.cpId,
          f.geometry?.coordinates?.[0],
          f.geometry?.coordinates?.[1],
          f.properties?.selected,
        ])
      ),
    [geojson]
  );

  // -------------------------------------------------------------------------
  // Animation du ring "live" via setPaintProperty
  // -------------------------------------------------------------------------
  // MapLibre ne supporte pas les animations CSS sur le canvas WebGL.
  // On simule un pulse en mettant à jour circle-opacity à interval régulier.
  // On utilise setInterval plutôt que rAF pour limiter la charge CPU.
  // -------------------------------------------------------------------------
  const startLivePulse = (map) => {
    stopLivePulse();

    livePulseRafRef.current = setInterval(() => {
      if (!mapRef.current || !styleLoadedRef.current) return;

      livePulsePhaseRef.current = (livePulsePhaseRef.current + 0.08) % (2 * Math.PI);
      const t = (Math.sin(livePulsePhaseRef.current) + 1) / 2; // 0..1
      const opacity = LIVE_PULSE_MIN + t * (LIVE_PULSE_MAX - LIVE_PULSE_MIN);

      try {
        map.setPaintProperty('checkpoint-live-ring', 'circle-opacity', opacity);
      } catch {
        // Layer pas encore disponible ou carte détruite — on arrête
        stopLivePulse();
      }
    }, LIVE_PULSE_INTERVAL_MS);
  };

  const stopLivePulse = () => {
    if (livePulseRafRef.current) {
      clearInterval(livePulseRafRef.current);
      livePulseRafRef.current = null;
    }
  };

  // -------------------------------------------------------------------------
  // Démarrer / arrêter le pulse selon s'il y a des checkpoints live
  // -------------------------------------------------------------------------
  const hasLiveCheckpoints = useMemo(
    () => geojson.features.some((f) => f.properties?.isLive === 1),
    [geojson]
  );

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleLoadedRef.current) return;

    if (hasLiveCheckpoints && !compact) {
      startLivePulse(map);
    } else {
      stopLivePulse();
      // Remettre l'opacité au minimum quand plus aucun live
      try {
        map.setPaintProperty('checkpoint-live-ring', 'circle-opacity', LIVE_PULSE_MIN);
      } catch { /* layer non dispo */ }
    }

    return stopLivePulse;
  }, [hasLiveCheckpoints, compact]);

  // -------------------------------------------------------------------------
  // Initialisation de la carte (une seule fois)
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: {
        version: 8,
        glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
        sources: {
          osm: {
            type: 'raster',
            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
            attribution: '© OpenStreetMap contributors',
          },
        },
        layers: [
          {
            id: 'osm',
            type: 'raster',
            source: 'osm',
            minzoom: 0,
            maxzoom: 19,
          },
        ],
      },
      center: stableCenter,
      zoom: stableZoom,
      dragRotate: false,
      pitchWithRotate: false,
      attributionControl: !compact,
    });

    mapRef.current = map;

    if (!compact) {
      map.addControl(new maplibregl.NavigationControl(), 'top-right');
    }

    map.doubleClickZoom.disable();

    map.on('load', () => {
      if (!mapRef.current) return;

      styleLoadedRef.current = true;

      // Flush les données arrivées avant que le style soit prêt
      const initialData = pendingGeojsonRef.current ?? geojson;
      pendingGeojsonRef.current = null;

      map.addSource('checkpoints', {
        type: 'geojson',
        data: initialData,
      });

      addCheckpointLayers(map, compact);

      // Démarrer le pulse si des checkpoints live sont déjà présents
      const hasLive = initialData.features?.some((f) => f.properties?.isLive === 1);
      if (hasLive && !compact) {
        startLivePulse(map);
      }

      // ── Layers interactifs — tous les layers visuels d'un checkpoint ────────
      // Un checkpoint est rendu via plusieurs layers superposés (halo, rings, dot, badge).
      // Tous doivent réagir au clic/survol pour éviter les zones mortes.
      const INTERACTIVE_CHECKPOINT_LAYERS = [
        'checkpoint-halo',
        'checkpoint-hot-ring',
        'checkpoint-live-ring',
        'checkpoint-dot',
        'checkpoint-selected-ring',
        'checkpoint-event-badge',
      ];

      // La map doit émettre `systemId` comme identifiant canonique.
      // Les autres clés ne sont tolérées qu'en compatibilité transitoire.
      // Ordre de priorité : systemId > cpId > id > checkpointSystemId
      const resolveFeatureCheckpointId = (feature) =>
        feature?.properties?.systemId ||       // clé canonique — toujours préférée
        feature?.properties?.cpId ||           // compat transitoire (alias de systemId)
        feature?.properties?.id ||             // compat historique
        feature?.properties?.checkpointSystemId || // compat externe
        null;

      // Handler de clic partagé pour tous les layers
      const handleLayerClick = (e) => {
        if (!e.features?.length) return;
        const feature = e.features[0];
        const cpId = resolveFeatureCheckpointId(feature);
        const name = feature?.properties?.name || 'Checkpoint';
        const coordinates = feature?.geometry?.coordinates;

        if (!compact && Array.isArray(coordinates) && coordinates.length === 2) {
          if (popupRef.current) {
            popupRef.current.remove();
            popupRef.current = null;
          }

          const isLive = feature?.properties?.isLive === 1;
          const hasEvent = feature?.properties?.hasEvent === 1;
          const badges = [
            isLive ? '<span style="color:#10B981;font-size:10px">● LIVE</span>' : '',
            hasEvent ? '<span style="color:#EF4444;font-size:10px">★ CE SOIR</span>' : '',
          ].filter(Boolean).join(' · ');

          popupRef.current = new maplibregl.Popup({
            closeButton: false,
            closeOnClick: true,
            offset: 18,
          })
            .setLngLat(coordinates)
            .setHTML(
              `<div style="padding:4px 6px;font-weight:600;font-size:12px;max-width:200px">
                ${name}
                ${badges ? `<div style="margin-top:2px;font-weight:400">${badges}</div>` : ''}
              </div>`
            )
            .addTo(map);
        }

        if (cpId && onClickRef.current) {
          onClickRef.current(cpId);
        }
      };

      // Brancher click + curseur sur tous les layers interactifs
      for (const layerId of INTERACTIVE_CHECKPOINT_LAYERS) {
        map.on('click', layerId, handleLayerClick);
        map.on('mouseenter', layerId, () => {
          map.getCanvas().style.cursor = 'pointer';
        });
        map.on('mouseleave', layerId, () => {
          map.getCanvas().style.cursor = '';
        });
      }

      // ResizeObserver
      if ('ResizeObserver' in window && mapContainerRef.current) {
        resizeObserverRef.current = new ResizeObserver(() => {
          if (resizeRafRef.current) cancelAnimationFrame(resizeRafRef.current);
          resizeRafRef.current = requestAnimationFrame(() => {
            mapRef.current?.resize();
          });
        });
        resizeObserverRef.current.observe(mapContainerRef.current);
      }

      requestAnimationFrame(() => {
        mapRef.current?.resize();
      });
    });

    return () => {
      stopLivePulse();
      if (resizeRafRef.current) cancelAnimationFrame(resizeRafRef.current);
      if (resizeObserverRef.current) resizeObserverRef.current.disconnect();
      if (popupRef.current) popupRef.current.remove();
      if (mapRef.current) mapRef.current.remove();

      resizeRafRef.current = null;
      resizeObserverRef.current = null;
      popupRef.current = null;
      mapRef.current = null;
      styleLoadedRef.current = false;
      pendingGeojsonRef.current = null;
    };
  }, [compact, stableCenter, stableZoom]);

  // -------------------------------------------------------------------------
  // Mise à jour des données (race condition corrigée — Prompt 0)
  // -------------------------------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!styleLoadedRef.current) {
      pendingGeojsonRef.current = geojson;
      return;
    }

    const source = map.getSource('checkpoints');
    if (source) {
      source.setData(geojson);
    }
  }, [geojson]);

  // -------------------------------------------------------------------------
  // Centrage initial sur l'utilisateur (mode plein écran uniquement)
  // Zoom 16 ≈ rayon de ~100m autour de l'utilisateur.
  // Si userGeo non disponible → center/zoom par défaut déjà définis à l'init.
  // -------------------------------------------------------------------------
  const userGeoRef = useRef(userGeo);
  useEffect(() => {
    userGeoRef.current = userGeo;
  }, [userGeo]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleLoadedRef.current) return;
    if (compact) return;
    if (didInitialFitRef.current) return; // une seule fois

    const geo = userGeoRef.current;
    if (!geo?.lat || !geo?.lng) return;

    map.jumpTo({
      center: [geo.lng, geo.lat],
      zoom: 16,
    });

    didInitialFitRef.current = true;
  }, [geojson, compact]); // se déclenche dès que les données arrivent, mais exécute 1 fois

  // -------------------------------------------------------------------------
  // Jump initial en mode compact
  // -------------------------------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    if (!compact) return;
    if (compactInitDoneRef.current) return;

    map.jumpTo({
      center: stableCenter,
      zoom: stableZoom,
    });

    compactInitDoneRef.current = true;
  }, [compact, stableCenter, stableZoom]);

  // -------------------------------------------------------------------------
  // Centrage sur le checkpoint sélectionné
  // -------------------------------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedId) return;

    /**
     * ALIGNEMENT CANONIQUE
     * selectedId est un systemId.
     * Toute résolution de feature doit être faite via properties.systemId.
     * Ne jamais utiliser cpId ici (alias transitoire uniquement).
     */
    const feature = geojson.features.find((f) => f?.properties?.systemId === selectedId);
    if (!feature) return;

    const coords = feature?.geometry?.coordinates;
    if (!Array.isArray(coords) || coords.length !== 2) return;

    const coordsKey = coords.join(',');

    if (
      compact &&
      lastFocusedSelectedIdRef.current === selectedId &&
      lastFocusedCoordsRef.current === coordsKey
    ) {
      return;
    }

    map.easeTo({
      center: coords,
      zoom: Math.max(map.getZoom(), 13),
      duration: 250,
      essential: true,
    });

    lastFocusedSelectedIdRef.current = selectedId;
    lastFocusedCoordsRef.current = coordsKey;
  }, [selectedId, geojson, compact]);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  const handleRecenter = () => {
    const map = mapRef.current;
    const geo = userGeoRef.current;
    if (!map || !geo?.lat || !geo?.lng) return;
    map.easeTo({ center: [geo.lng, geo.lat], zoom: 16, duration: 500 });
  };

  return (
    <div className="absolute inset-0" style={{ width: '100%', height: '100%' }}>
      <div ref={mapContainerRef} className="absolute inset-0" />
      {!compact && (
        <button
          onClick={handleRecenter}
          title="Me recentrer"
          className="absolute bottom-16 right-3 z-10 w-11 h-11 rounded-full bg-white shadow-lg border border-gray-200 flex items-center justify-center hover:bg-gray-50 active:scale-95 transition-all"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#4F46E5" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3"/>
            <path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>
            <circle cx="12" cy="12" r="9" strokeOpacity="0.25"/>
          </svg>
        </button>
      )}
    </div>
  );
}