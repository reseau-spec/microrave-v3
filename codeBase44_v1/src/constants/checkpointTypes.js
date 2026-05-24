/**
 * checkpointTypes.js
 * -----------------------------------------------------------------------------
 * SOURCE DE VÉRITÉ DES TYPES DE CHECKPOINT
 *
 * CE FICHIER CENTRALISE :
 *   - le type métier
 *   - son label affiché
 *   - son emoji / iconKey
 *
 * PRINCIPE UX
 *   type et iconKey sont une seule et même notion de lecture rapide.
 *   L'emoji n'est pas décoratif :
 *   il réduit le temps de compréhension du checkpoint.
 *
 * RÈGLE
 *   Toute résolution type -> label/icon doit passer par ce fichier.
 */

export const CHECKPOINT_TYPES = [
  { key: 'Bar',                        label: 'Bar',              shortLabel: 'Bar',      icon: '🍺', order: 1 },
  { key: 'Pub',                        label: 'Pub',              shortLabel: 'Pub',      icon: '🍻', order: 2 },
  { key: 'Club',                       label: 'Club',             shortLabel: 'Club',     icon: '🎉', order: 3 },
  { key: 'Microbrasserie',             label: 'Microbrasserie',   shortLabel: 'Brasserie',icon: '🍻', order: 4 },
  { key: 'Bistro',                     label: 'Bistro',           shortLabel: 'Bistro',   icon: '☕', order: 5 },
  { key: 'Karaokè',                    label: 'Karaoké',          shortLabel: 'Karaoké',  icon: '🎤', order: 6 },
  { key: 'Salle de spectacle',         label: 'Salle de spectacle', shortLabel: 'Salle',  icon: '🎭', order: 7 },
  { key: 'Salle de réception',         label: 'Salle de réception', shortLabel: 'Réception', icon: '🏛️', order: 8 },
  { key: 'Installation sportive',      label: 'Installation sportive', shortLabel: 'Sport', icon: '⚽', order: 9 },
  { key: 'Studio',                     label: 'Studio',           shortLabel: 'Studio',   icon: '🎙️', order: 10 },
  { key: 'Coworking',                  label: 'Coworking',        shortLabel: 'Cowork',   icon: '💻', order: 11 },
  { key: 'Production d\'arts et de spectacles', label: 'Production artistique', shortLabel: 'Production', icon: '🎬', order: 12 },
  { key: 'Radio et télévision',        label: 'Radio / TV',       shortLabel: 'Radio',    icon: '📻', order: 13 },
  { key: 'Cabaret',                    label: 'Cabaret',          shortLabel: 'Cabaret',  icon: '🎩', order: 14 },
  { key: 'Gérance d\'artistes',        label: 'Gérance d\'artistes', shortLabel: 'Gérance', icon: '🎼', order: 15 },
  // Types étendus (pas encore en DB mais prévus)
  { key: 'parc',                       label: 'Parc',             shortLabel: 'Parc',     icon: '🌳', order: 20 },
  { key: 'terrasse',                   label: 'Terrasse',         shortLabel: 'Terrasse', icon: '🌅', order: 21 },
  { key: 'cafe',                       label: 'Café',             shortLabel: 'Café',     icon: '☕', order: 22 },
  { key: 'restaurant',                 label: 'Restaurant',       shortLabel: 'Resto',    icon: '🍽️', order: 23 },
  { key: 'galerie',                    label: 'Galerie',          shortLabel: 'Galerie',  icon: '🖼️', order: 24 },
  { key: 'loft',                       label: 'Loft',             shortLabel: 'Loft',     icon: '🏠', order: 25 },
];

// Fallback pour type inconnu
const DEFAULT_TYPE = { key: 'default', label: 'Lieu', shortLabel: 'Lieu', icon: '📍', order: 99 };

/**
 * Résout un type string vers son entrée catalogue.
 * Retourne le fallback si le type n'est pas reconnu.
 *
 * @param {string} type
 * @returns {{ key, label, shortLabel, icon, order }}
 */
export function resolveCheckpointType(type) {
  if (!type) return DEFAULT_TYPE;
  const normalized = type.trim().toLowerCase();
  const found = CHECKPOINT_TYPES.find(
    (t) => t.key.toLowerCase() === normalized || t.label.toLowerCase() === normalized
  );
  return found || DEFAULT_TYPE;
}

/**
 * Retourne la liste des types triés par order, sans le fallback.
 * Utile pour construire des pickers / filtres.
 *
 * @returns {object[]}
 */
export function getCheckpointTypesList() {
  return [...CHECKPOINT_TYPES].sort((a, b) => a.order - b.order);
}