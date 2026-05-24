/**
 * useDomains.js
 * Hook React exposant la liste des domaines actifs depuis le cache taxonomyCache.
 *
 * Usage :
 *   const domains = useDomains();
 *   // domains = [{ key, labelFr, labelEn, icon, color, defaultImageUrl, sortOrder }, ...]
 *
 * Fallback : si l'entité Domain n'est pas encore peuplée en DB, retourne
 * la liste statique de compatibilité FALLBACK_DOMAINS (mêmes 7 domaines qu'avant).
 * Ce fallback garantit zéro régression pendant la migration.
 */
import { useState, useEffect } from 'react';
import { getTaxonomies } from '../components/taxonomyCache.jsx';

// Fallback statique — utilisé si Domain en DB est vide ou non peuplé
// Identique aux anciens arrays hardcodés — zéro régression UX pendant la migration
export const FALLBACK_DOMAINS = [
  { key: 'music',       labelFr: 'Musique',               labelEn: 'Music',       icon: '🎵', color: '#8B5CF6', sortOrder: 1 },
  { key: 'humour',      labelFr: 'Humour',                labelEn: 'Humour',      icon: '🎭', color: '#F59E0B', sortOrder: 2 },
  { key: 'photo',       labelFr: 'Photo',                 labelEn: 'Photo',       icon: '📸', color: '#3B82F6', sortOrder: 3 },
  { key: 'video',       labelFr: 'Vidéo',                 labelEn: 'Video',       icon: '🎥', color: '#EF4444', sortOrder: 4 },
  { key: 'food',        labelFr: 'Food & Boisson',        labelEn: 'Food',        icon: '🍽', color: '#F97316', sortOrder: 5 },
  { key: 'art',         labelFr: 'Art',                   labelEn: 'Art',         icon: '🎨', color: '#EC4899', sortOrder: 6 },
  { key: 'responsable', labelFr: 'Festivité responsable', labelEn: 'Responsible', icon: '❤️‍🩹', color: '#10B981', sortOrder: 7 },
  { key: 'boisson',     labelFr: 'Boisson & Service',     labelEn: 'Beverage',    icon: '🍹', color: '#0EA5E9', sortOrder: 8, active: false }, // désactivé jusqu'à peuplement DB
];

export function useDomains() {
  const [domains, setDomains] = useState([]);

  useEffect(() => {
    let cancelled = false;
    getTaxonomies().then(cache => {
      if (cancelled) return;
      const loaded = cache.domains || [];
      // Si DB vide → utiliser le fallback pour zéro régression
      setDomains(loaded.length > 0 ? loaded : FALLBACK_DOMAINS.filter(d => d.active !== false));
    }).catch(() => {
      if (!cancelled) setDomains(FALLBACK_DOMAINS.filter(d => d.active !== false));
    });
    return () => { cancelled = true; };
  }, []);

  return domains;
}

/**
 * useDomainMap() — accès direct par clé (ex: domainMap['music'].color)
 */
export function useDomainMap() {
  const domains = useDomains();
  return Object.fromEntries(domains.map(d => [d.key, d]));
}