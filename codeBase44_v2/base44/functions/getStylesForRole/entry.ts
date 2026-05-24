// deploy: v2
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

function jsonError(status, code, message, extra = {}) {
  return json(status, { ok: false, code, error: message, ...extra });
}

function safeTrim(v) {
  return (typeof v === 'string' ? v : '').trim();
}

function asString(v) {
  if (!v) return null;
  if (typeof v === 'string') return v;
  if (typeof v === 'object') return v.systemId || v.id || v._id || v.value || null;
  return null;
}

function getUnlockLevel(style) {
  // unlockLevel absent/null/NaN => 1
  const n = Number(style && style.unlockLevel);
  if (!Number.isFinite(n)) return 1;
  return Math.trunc(n);
}

function getRarityRank(tier) {
  const t = safeTrim(tier).toLowerCase();
  if (t === 'legendary') return 4;
  if (t === 'epic') return 3;
  if (t === 'rare') return 2;
  return 1; // common/unknown
}

async function loadOrCreateDomainProgress(base44, userId, domainKey) {
  const allProgress = await base44.entities.DomainProgress.filter({});
  const progressData = (allProgress || []).filter(p => p.userId === userId && p.domainKey === domainKey);
  if (progressData.length > 0) return progressData[0];

  return await base44.entities.DomainProgress.create({
    userId,
    domainKey,
    xp: 0,
    level: 1,
    updatedAt: new Date().toISOString()
  });
}

async function resolveDomainKeyFromRoleDomainMap(base44, roleSystemId) {
  const allDomainMaps = await base44.entities.RoleDomainMap.filter({});
  const domainMaps = (allDomainMaps || []).filter(m => m.roleSystemId === roleSystemId && m.isActive !== false);
  if (!Array.isArray(domainMaps) || domainMaps.length === 0) return null;
  return safeTrim(domainMaps[0] && domainMaps[0].domainKey) || null;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return jsonError(401, 'UNAUTHENTICATED', 'User not authenticated');
    }

    const body = await req.json().catch(() => ({}));
    const roleSystemId = asString(body && body.roleSystemId);

    if (!roleSystemId) {
      return jsonError(400, 'MISSING_ROLE', 'roleSystemId is required');
    }

    // 1) OVERRIDES (RoleStyleMap)
    const allStyleMaps = await base44.entities.RoleStyleMap.filter({});
    const overrides = (allStyleMaps || []).filter(m => m.roleSystemId === roleSystemId && m.isActive !== false);

    let domainKey = null;
    let userProgress = null;

    if (Array.isArray(overrides) && overrides.length > 0) {
      domainKey = await resolveDomainKeyFromRoleDomainMap(base44, roleSystemId);

      // DomainProgress optionnel : si pas de domainKey -> level=1
      if (domainKey) {
        userProgress = await loadOrCreateDomainProgress(base44, user.id, domainKey);
      } else {
        userProgress = { level: 1, xp: 0 };
      }

      const level = Number(userProgress && userProgress.level) || 1;

      const styleSystemIds = overrides
        .map(o => asString(o && o.styleSystemId))
        .filter(Boolean);

      if (styleSystemIds.length === 0) {
        return json(200, {
          ok: true,
          styles: [],
          source: 'override',
          domainKey,
          level,
          xp: Number(userProgress && userProgress.xp) || 0,
          warning: 'OVERRIDE_EMPTY_STYLE_IDS'
        });
      }

      // Charge tout, filtre ensuite (robuste)
      const allStylesByIds = await base44.entities.StyleHierarchy.filter({});
      const stylesRaw = (allStylesByIds || []).filter(s => s.active !== false && styleSystemIds.includes(s.systemId));

      const styles = (Array.isArray(stylesRaw) ? stylesRaw : [])
        // si style actif sans domainKey -> on skip, on ne bloque pas
        .filter(s => safeTrim(s && s.domainKey).length > 0 || !domainKey)
        // hard gate unlockLevel, mais unlockLevel absent => 1
        .filter(s => getUnlockLevel(s) <= level);

      // warn invalids (sans casser)
      const invalid = (Array.isArray(stylesRaw) ? stylesRaw : []).filter(
        s => s && s.active && safeTrim(s.domainKey).length === 0
      );
      if (invalid.length > 0) {
        const examples = invalid.slice(0, 3).map(s => `${s.systemId} (${s.displayName})`).join(', ');
        console.warn(`⚠️ [getStylesForRole] override: ${invalid.length} style(s) actif(s) sans domainKey. Ex: ${examples}`);
      }

      // weight map
      const weightMap = {};
      for (const o of overrides) {
        const sid = asString(o && o.styleSystemId);
        if (!sid) continue;
        const w = Number(o && o.weight);
        weightMap[sid] = Number.isFinite(w) ? w : 1;
      }

      // sort by weight desc then displayName
      styles.sort((a, b) => {
        const wa = weightMap[asString(a && a.systemId) || ''] || 1;
        const wb = weightMap[asString(b && b.systemId) || ''] || 1;
        if (wa !== wb) return wb - wa;
        return safeTrim(a && a.displayName).localeCompare(safeTrim(b && b.displayName));
      });

      return json(200, {
        ok: true,
        styles,
        source: 'override',
        domainKey,
        level,
        xp: Number(userProgress && userProgress.xp) || 0
      });
    }

    // 2) DOMAIN (RoleDomainMap)
    domainKey = await resolveDomainKeyFromRoleDomainMap(base44, roleSystemId);

    if (!domainKey) {
      const allRoles = await base44.entities.RoleHierarchy.filter({});
      const roles = (allRoles || []).filter(r => r.systemId === roleSystemId);
      if (!Array.isArray(roles) || roles.length === 0) {
        return jsonError(404, 'ROLE_NOT_FOUND', 'Role not found', { roleSystemId });
      }

      return jsonError(
        404,
        'NO_DOMAIN_MAPPING',
        'No domain mapping found for this role. Run migrateRoleDomains and ensure root role has domainKey.',
        { roleSystemId, roleName: roles[0].nameFr || roleSystemId }
      );
    }

    userProgress = await loadOrCreateDomainProgress(base44, user.id, domainKey);
    const level = Number(userProgress && userProgress.level) || 1;

    // Charge TOUS les styles actifs puis filtre domainKey en mémoire
    // (évite timeout sur filtre domainKey non indexé → 502)
    const allStylesRaw = await base44.entities.StyleHierarchy.filter({});
    const stylesRaw = allStylesRaw.filter(s => s.active !== false && s.domainKey === domainKey);

    const invalidStyles = (Array.isArray(stylesRaw) ? stylesRaw : []).filter(
      s => s && s.active && safeTrim(s.domainKey).length === 0
    );
    if (invalidStyles.length > 0) {
      const examples = invalidStyles.slice(0, 3).map(s => `${s.systemId} (${s.displayName})`).join(', ');
      console.warn(`⚠️ [getStylesForRole] domain: ${invalidStyles.length} style(s) actif(s) sans domainKey. Ex: ${examples}`);
      // IMPORTANT: on ne return pas 400. On skip.
    }

    const styles = (Array.isArray(stylesRaw) ? stylesRaw : [])
      .filter(s => safeTrim(s && s.domainKey).length > 0) // skip invalid
      .filter(s => getUnlockLevel(s) <= level);

    // sort by rarity desc then displayName
    styles.sort((a, b) => {
      const ra = getRarityRank(a && a.rarityTier);
      const rb = getRarityRank(b && b.rarityTier);
      if (ra !== rb) return rb - ra;
      return safeTrim(a && a.displayName).localeCompare(safeTrim(b && b.displayName));
    });

    return json(200, {
      ok: true,
      styles,
      source: 'domain',
      domainKey,
      level,
      xp: Number(userProgress && userProgress.xp) || 0
    });
  } catch (error) {
    console.error('getStylesForRole error:', error);
    return json(500, { ok: false, code: 'SERVER_ERROR', error: String(error && error.message ? error.message : error) });
  }
});