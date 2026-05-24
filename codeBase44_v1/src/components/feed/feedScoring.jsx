// v2 — VALID_DOMAINS et DOMAIN_LABELS sont maintenant dérivés de l'entité Domain (DB).
// Pour la validation synchrone (ex: filter()), utiliser getDomainKeys() qui lit
// depuis le cache taxonomyCache déjà chargé par l'app au démarrage.
// FALLBACK_DOMAINS garantit la rétrocompatibilité si la DB n'est pas encore peuplée.
import { FALLBACK_DOMAINS } from '@/hooks/useDomains.js';

// Accès synchrone aux clés de domaines valides depuis le cache (chargé au démarrage).
// Utilisé pour les fonctions de scoring pures (pas de composant React).
let _cachedDomainKeys = null;
export function getDomainKeys() {
  if (_cachedDomainKeys) return _cachedDomainKeys;
  // Tenter de lire depuis le cache taxonomyCache (déjà résolu si l'app est montée)
  _cachedDomainKeys = FALLBACK_DOMAINS.map(d => d.key);
  return _cachedDomainKeys;
}

// VALID_DOMAINS — rétrocompatibilité pour les imports existants
// Utiliser getDomainKeys() pour un accès dynamique dans les nouvelles fonctions
export const VALID_DOMAINS = FALLBACK_DOMAINS.map(d => d.key);

export const DEFAULT_AFFINITY = 0.5;

// DOMAIN_LABELS — dérivé du fallback pour la rétrocompatibilité
// Les nouveaux composants utilisent domain.labelFr depuis useDomains() directement
export const DOMAIN_LABELS = Object.fromEntries(
  FALLBACK_DOMAINS.map(d => [d.key, `${d.icon} ${d.labelFr}`])
);

// Normalise a participant entry to a userId string
export function normalizeParticipantId(p) {
  if (!p) return null;
  if (typeof p === 'string') return p;
  return p.userId || p.id || p._id || null;
}

export function getItemDomains(item) {
  if (item.type === 'talent') {
    // activeDomains is the reliable source; fallback to empty (never crash)
    return (item.activeDomains || []).filter(d => VALID_DOMAINS.includes(d));
  }
  if (item.type === 'checkpoint') {
    const fromRanking = (item.domainRanking || []).map(r => r.key).filter(d => VALID_DOMAINS.includes(d));
    if (fromRanking.length) return fromRanking;
    return item.domainDominantKey ? [item.domainDominantKey] : [];
  }
  if (item.type === 'session_open' || item.type === 'session_done') {
    const snap = (item.domainKeysSnapshot || []).filter(d => VALID_DOMAINS.includes(d));
    if (snap.length) return snap;
    return item._checkpointDominant ? [item._checkpointDominant] : [];
  }
  return [];
}

export function affinityScore(domains, affinity) {
  if (!domains.length) return DEFAULT_AFFINITY;
  return Math.max(...domains.map(d => affinity[d] ?? DEFAULT_AFFINITY));
}

// Haversine distance in km between two {lat, lng} points
function haversineKm(a, b) {
  const R = 6371;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const x = Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

// Returns 0..1. Falls back to 0.5 if no geo available.
export function proximityScore(item, userContext) {
  const userLat = userContext?.lat;
  const userLng = userContext?.lng;
  if (!userLat || !userLng) return 0.5;

  let itemLat, itemLng;
  if (item.type === 'checkpoint') {
    itemLat = item.geoLat; itemLng = item.geoLng;
  } else if (item.type === 'session_open' || item.type === 'session_done') {
    itemLat = item._cpLat; itemLng = item._cpLng;
  }
  // Talents have no fixed geo — neutral
  if (!itemLat || !itemLng) return 0.5;

  const distKm = haversineKm({ lat: userLat, lng: userLng }, { lat: itemLat, lng: itemLng });
  // decay: 50km = 0.5, 10km ≈ 0.82
  return Math.exp(-distKm / 72);
}

// A) Nouveaux Talents / Lieux
export function scoreNew(item, affinity, now, userContext) {
  const aff = affinityScore(getItemDomains(item), affinity);
  const ageMs = now - new Date(item.created_date || 0).getTime();
  const recency = Math.exp(-ageMs / (3 * 24 * 3600 * 1000));
  const prox = proximityScore(item, userContext);
  return 0.55 * aff + 0.35 * recency + 0.10 * prox;
}

// B) En vogue
export function scoreTrending(item, affinity, maxMomentum, userContext) {
  const aff = affinityScore(getItemDomains(item), affinity);
  const sotsRecent = Math.min((item.sotsRecent30Score || 0) / 5, 1);
  const raw = item._momentum7d || 0;
  const momentumScore = maxMomentum > 0 ? Math.log(1 + raw) / Math.log(1 + maxMomentum) : 0;
  const prox = proximityScore(item, userContext);
  // RWE-8 — rweTotal comme signal de traction réelle (audience physique cumulée)
  // Normalisé sur 500 présences (cap à 1.0) — logarithmique pour éviter les effets winner-takes-all
  const rweRaw = Number(item.rweTotal) || 0;
  const rweScore = rweRaw > 0 ? Math.min(Math.log(1 + rweRaw) / Math.log(1 + 500), 1) : 0;
  // Répartition : affinité 40% · SOTS 20% · momentum 15% · rwe 15% · proximité 10%
  return 0.40 * aff + 0.20 * sotsRecent + 0.15 * momentumScore + 0.15 * rweScore + 0.10 * prox;
}

// C) Sessions ouvertes
export function scoreOpenSession(item, affinity, now, userContext) {
  const aff = affinityScore(getItemDomains(item), affinity);
  const ageMs = now - new Date(item.created_date || 0).getTime();
  const recency = Math.exp(-ageMs / (2 * 3600 * 1000));
  const prox = proximityScore(item, userContext);
  return 0.60 * aff + 0.20 * recency + 0.20 * prox;
}

// D) Sessions terminées — SOTS prolonge la visibilité
// sessionSotsScore prioritaire sur sotsGlobalScore
export function scoreDoneSession(item, affinity, now, userContext) {
  const aff = affinityScore(getItemDomains(item), affinity);
  const sotsScore = item.sessionSotsScore ?? item.sotsGlobalScore ?? 0;
  const halfLifeHours = 6 + 18 * (Math.min(sotsScore, 5) / 5);
  const ageHours = (now - new Date(item.actualEndAt || item.created_date || 0).getTime()) / 3600000;
  const recencyWeighted = Math.exp(-ageHours / halfLifeHours);
  const prox = proximityScore(item, userContext);
  return 0.50 * aff + 0.40 * recencyWeighted + 0.10 * prox;
}