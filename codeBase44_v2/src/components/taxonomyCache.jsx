/**
 * taxonomyCache.js
 * Cache singleton pour RoleHierarchy, StyleHierarchy, Checkpoint et Domain.
 * Chargé une seule fois au premier appel — réutilisé sur toutes les pages.
 *
 * v2 — Ajout de Domain : source de vérité unique des domaines.
 *   Ajouter/retirer un domaine = modifier Domain en DB, aucun code à changer.
 *   useDomains() expose la liste triée (sortOrder asc, active=true uniquement).
 */
import { base44 } from '@/api/base44Client';

const cache = {
  roles:         null,
  styles:        null,
  checkpoints:   null,
  domains:       null,   // v2 — Domain[]
  roleMap:       null,
  styleMap:      null,
  checkpointMap: null,
  domainMap:     null,   // v2 — { [key]: Domain }
  _promise:      null,
};

export async function getTaxonomies() {
  if (cache.roles) return cache;
  if (cache._promise) return cache._promise;

  cache._promise = Promise.all([
    base44.entities.RoleHierarchy.filter({}),
    base44.entities.StyleHierarchy.filter({}),
    base44.entities.Checkpoint.filter({}),
    base44.entities.Domain.filter({ active: true }).catch(() => []),  // v2 — graceful si entité absente
  ]).then(([roles, styles, checkpoints, domains]) => {
    cache.roles       = roles       || [];
    cache.styles      = styles      || [];
    cache.checkpoints = (checkpoints || []).filter(c => c.active !== false);
    // Trier par sortOrder asc (domaines principaux en premier)
    cache.domains     = (domains    || []).sort((a, b) => (a.sortOrder ?? 99) - (b.sortOrder ?? 99));

    cache.roleMap       = Object.fromEntries(cache.roles.map(r => [r.systemId || r.id, r]));
    cache.styleMap      = Object.fromEntries(cache.styles.map(s => [s.systemId || s.id, s]));
    cache.checkpointMap = Object.fromEntries(cache.checkpoints.map(c => [c.systemId || c.id, c]));
    cache.domainMap     = Object.fromEntries(cache.domains.map(d => [d.key, d]));  // v2

    cache._promise = null;
    return cache;
  });

  return cache._promise;
}

/**
 * invalidateDomains() — forcer un rechargement des domaines (après ajout en DB par admin)
 * Utilisé par les pages d'administration uniquement.
 */
export function invalidateDomains() {
  cache.domains  = null;
  cache.domainMap = null;
  cache.roles    = null; // force un rechargement complet
}