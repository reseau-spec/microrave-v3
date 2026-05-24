/**
 * dateUtils.js
 * ---------------------------------------------------------------------------
 * RÈGLE CANONIQUE — Gestion des dates dans Micro Rave
 *
 * 1. STOCKAGE  : toujours en UTC (ISO 8601 avec Z)
 * 2. AFFICHAGE : toujours dans le fuseau du LIEU (checkpoint.timezone)
 *                jamais dans le fuseau du navigateur de l'utilisateur
 * 3. SAISIE    : le formulaire datetime-local travaille dans le fuseau du lieu
 *
 * Pourquoi le fuseau du lieu et non celui de l'utilisateur ?
 *   Un événement à Vancouver à 21h doit s'afficher 21h pour tout le monde,
 *   qu'on le consulte depuis Montréal, Paris ou Tokyo.
 *   Le fuseau pertinent est celui du checkpoint, pas du visiteur.
 *
 * Fuseau par défaut : 'America/Toronto' (tous les checkpoints actuels sont à Montréal)
 * À terme : chaque Checkpoint aura un champ `timezone` explicite.
 */

export const DEFAULT_TIMEZONE = 'America/Toronto';

/**
 * Retourne le fuseau horaire d'un checkpoint, avec fallback sur le défaut.
 * Accepte directement un objet checkpoint ou une string timezone.
 */
export function getCheckpointTimezone(checkpointOrTz) {
  if (!checkpointOrTz) return DEFAULT_TIMEZONE;
  if (typeof checkpointOrTz === 'string') return checkpointOrTz || DEFAULT_TIMEZONE;
  return checkpointOrTz?.timezone || DEFAULT_TIMEZONE;
}

/**
 * formatEventDate — formate une date ISO UTC dans le fuseau du lieu.
 *
 * @param {string} isoUtc — date ISO UTC depuis la base (ex: "2026-03-27T01:00:00.000Z")
 * @param {string} timezone — fuseau du lieu (ex: "America/Toronto")
 * @param {object} options — options Intl.DateTimeFormat (optionnel)
 * @returns {string} — date formatée en heure locale du lieu
 */
export function formatEventDate(isoUtc, timezone, options = {}) {
  if (!isoUtc) return '—';
  const tz = timezone || DEFAULT_TIMEZONE;
  const defaultOptions = {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: tz,
  };
  try {
    return new Date(isoUtc).toLocaleDateString('fr-CA', { ...defaultOptions, ...options });
  } catch {
    return isoUtc;
  }
}

/**
 * formatEventDateShort — version courte pour les listes et badges.
 * Ex: "sam. 28 mars"
 */
export function formatEventDateShort(isoUtc, timezone) {
  return formatEventDate(isoUtc, timezone, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: undefined,
    minute: undefined,
  });
}

/**
 * toCheckpointDatetimeInput — convertit une date UTC en string locale
 * pour un champ <input type="datetime-local">, dans le fuseau du lieu.
 *
 * Remplace l'ancienne `toLocalDatetimeInput` qui utilisait le fuseau du navigateur.
 *
 * @param {string} isoUtc — date UTC depuis la base
 * @param {string} timezone — fuseau du checkpoint
 * @returns {string} — "YYYY-MM-DDTHH:mm" en heure du lieu
 */
export function toCheckpointDatetimeInput(isoUtc, timezone) {
  if (!isoUtc) return '';
  const tz = timezone || DEFAULT_TIMEZONE;
  try {
    const d = new Date(isoUtc);
    if (isNaN(d.getTime())) return '';

    // Utiliser Intl pour extraire les composantes dans le bon fuseau
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    });
    const parts = Object.fromEntries(fmt.formatToParts(d).map(p => [p.type, p.value]));
    // Gérer le cas "24:00" que certains moteurs retournent pour minuit
    const hour = parts.hour === '24' ? '00' : parts.hour;
    return `${parts.year}-${parts.month}-${parts.day}T${hour}:${parts.minute}`;
  } catch {
    return '';
  }
}

/**
 * checkpointDatetimeToUtc — convertit une saisie datetime-local dans le
 * fuseau du checkpoint en ISO UTC pour la base.
 *
 * @param {string} localDatetime — "YYYY-MM-DDTHH:mm" en heure du lieu
 * @param {string} timezone — fuseau du checkpoint
 * @returns {string} — ISO UTC
 */
export function checkpointDatetimeToUtc(localDatetime, timezone) {
  if (!localDatetime) return null;
  const tz = timezone || DEFAULT_TIMEZONE;
  try {
    // Construire une date dans le fuseau cible via Temporal-polyfill ou Intl trick
    // On utilise l'approche la plus compatible : parser comme UTC et ajuster l'offset
    // en utilisant Intl pour connaître l'offset réel du fuseau à cette date/heure
    const naiveUtc = new Date(localDatetime + ':00.000Z'); // parse comme UTC naïf
    const naiveMs = naiveUtc.getTime();

    // Calculer l'offset réel du fuseau à cette date approximative
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    });
    // Approche itérative : trouver l'UTC qui, converti dans tz, donne localDatetime
    // On estime d'abord l'offset depuis l'heure naïve
    const parts = Object.fromEntries(fmt.formatToParts(naiveUtc).map(p => [p.type, p.value]));
    const inTzStr = `${parts.year}-${parts.month}-${parts.day}T${parts.hour === '24' ? '00' : parts.hour}:${parts.minute}`;
    // Calculer la différence entre ce qu'on voulait et ce qu'on a obtenu
    const diffMs = new Date(localDatetime + ':00.000Z').getTime() - new Date(inTzStr + ':00.000Z').getTime();
    // Appliquer la correction
    return new Date(naiveMs + diffMs).toISOString();
  } catch {
    // Fallback : interpréter comme heure locale du navigateur
    return new Date(localDatetime).toISOString();
  }
}