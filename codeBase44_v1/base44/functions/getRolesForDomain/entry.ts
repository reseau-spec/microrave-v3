// deploy: v2
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

/**
 * getRolesForDomain
 *
 * Retourne les rôles actifs pour un domaine donné.
 * Utilise filter({}) + filtrage en mémoire (évite les filtres DB sur champs non indexés).
 *
 * Input (POST body ou GET query params):
 *   - domainKey: string (requis)
 *   - includeInactive: boolean (optionnel, défaut false)
 *   - includeAll: boolean (optionnel — si true, ignore domainKey et retourne tous les rôles)
 */

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function normalizeBool(value) {
  return value === true || value === 'true' || value === 1 || value === '1';
}

function normalizeString(value) {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s ? s : null;
}

function lc(value) {
  return String(value || '').trim().toLowerCase();
}

async function getRequestInput(req) {
  const url = new URL(req.url);
  const body = req.method !== 'GET' ? await req.json().catch(() => ({})) : {};
  return {
    domainKey: normalizeString(body?.domainKey ?? url.searchParams.get('domainKey')),
    includeInactive: normalizeBool(body?.includeInactive ?? url.searchParams.get('includeInactive')),
    includeAll: normalizeBool(body?.includeAll ?? url.searchParams.get('includeAll')),
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return json({ ok: false, error: 'Authentication required' }, 401);

    const service = base44.asServiceRole;
    const { domainKey, includeInactive, includeAll } = await getRequestInput(req);

    if (!domainKey && !includeAll) {
      return json({ ok: false, error: 'domainKey requis (ou includeAll=true)' }, 400);
    }

    // Charger tous les rôles sans filtre DB
    const [allRolesRaw, allRoleDomainMapsRaw] = await Promise.all([
      service.entities.RoleHierarchy.filter({}),
      service.entities.RoleDomainMap.filter({}),
    ]);

    // Construire index domainKey par roleSystemId via RoleDomainMap
    const domainByRole = new Map();
    for (const map of (allRoleDomainMapsRaw || [])) {
      if (!normalizeBool(map.isActive ?? true)) continue;
      const roleId = normalizeString(map.roleSystemId);
      const dk = normalizeString(map.domainKey);
      if (roleId && dk) {
        if (!domainByRole.has(roleId)) domainByRole.set(roleId, new Set());
        domainByRole.get(roleId).add(lc(dk));
      }
    }

    const domainKeyLower = domainKey ? lc(domainKey) : null;

    // Filtrer rôles
    let roles = (allRolesRaw || []).filter((role) => {
      // Filtre actif
      if (!includeInactive && !normalizeBool(role.active)) return false;

      // Filtre domaine
      if (includeAll) return true;

      // Vérifier via domainKey du rôle lui-même (racineSystemId / level 1)
      if (normalizeString(role.domainKey) && lc(role.domainKey) === domainKeyLower) return true;

      // Vérifier via RoleDomainMap
      const roleId = normalizeString(role.systemId);
      if (roleId && domainByRole.has(roleId) && domainByRole.get(roleId).has(domainKeyLower)) return true;

      return false;
    });

    // Normaliser la sortie
    const normalizedRoles = roles.map((role) => ({
      systemId: normalizeString(role.systemId),
      id: normalizeString(role.systemId),
      nameFr: role.nameFr || role.nameEn || role.displayName || role.name || role.systemId,
      nameEn: role.nameEn || role.nameFr || role.displayName,
      displayName: role.nameFr || role.nameEn || role.displayName || role.name,
      bioFr: role.bioFr || null,
      domainKey: normalizeString(role.domainKey),
      level: Number(role.level || 1),
      parentSystemId: normalizeString(role.parentSystemId),
      racineSystemId: normalizeString(role.racineSystemId),
      roleType: role.roleType || 'talent',
      slug: role.slug || null,
      color: role.color || null,
      isBase: normalizeBool(role.isBase),
      contributesToCheckpointDomains: normalizeBool(role.contributesToCheckpointDomains),
      xpRequired: Number(role.xpRequired || 0),
      medianRate: role.medianRate || null,
      active: true,
    })).filter((r) => !!r.systemId);

    // Trier : level ASC, puis alphabétique
    normalizedRoles.sort((a, b) => {
      if (a.level !== b.level) return a.level - b.level;
      return String(a.nameFr).localeCompare(String(b.nameFr), 'fr');
    });

    return json({
      ok: true,
      domainKey: domainKey || null,
      count: normalizedRoles.length,
      roles: normalizedRoles,
    });
  } catch (error) {
    console.error('[getRolesForDomain] failed', error);
    return json({ ok: false, error: error?.message || 'Unknown error' }, 500);
  }
});