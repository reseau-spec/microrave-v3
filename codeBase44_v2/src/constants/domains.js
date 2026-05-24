/**
 * src/constants/domains.js
 *
 * Source de vérité unique pour les couleurs et labels des domaines culturels
 * Micro Rave. Importer depuis ce fichier dans tous les composants au lieu de
 * redéfinir localement.
 *
 * Utilisé par :
 *   - src/map/checkpointMapUtils.js
 *   - src/components/explore/ExploreMapGL.jsx  (via checkpointMapUtils)
 *   - src/components/explore/CheckpointSidePanel.jsx
 *   - src/components/explore/ForYouRail.jsx
 *   - src/pages/Explore.jsx
 */
/**
 * domains.js
 * -----------------------------------------------------------------------------
 * SOURCE DE VÉRITÉ DES DOMAINES MICRO RAVE
 *
 * CE FICHIER CENTRALISE :
 *   - couleurs de domaine
 *   - labels de domaine
 *   - fallback par défaut
 *
 * RÈGLE D'ARCHITECTURE
 *   Aucune page Explore ne doit redéclarer localement DOMAIN_COLORS
 *   ou DOMAIN_LABELS.
 *
 * OBJECTIF
 *   Garantir une lecture cohérente du domaine dans :
 *   - la carte
 *   - les rails
 *   - les panels
 *   - les futurs composants Explore
 */

export const DOMAIN_COLORS = {
  music:       '#8B5CF6',
  humour:      '#F59E0B',
  photo:       '#3B82F6',
  video:       '#EF4444',
  food:        '#F97316',
  art:         '#EC4899',
  responsable: '#10B981',
  boisson:     '#0EA5E9',  // v2 — Boisson & Service
  default:     '#6366F1',
};

export const DOMAIN_LABELS = {
  music:       '🎵 Musique',
  humour:      '🎭 Humour',
  photo:       '📷 Photo',
  video:       '🎬 Vidéo',
  food:        '🍽️ Bouffe',
  art:         '🎨 Art',
  responsable: '🌿 Responsable',
  boisson:     '🍹 Boisson & Service',  // v2
};