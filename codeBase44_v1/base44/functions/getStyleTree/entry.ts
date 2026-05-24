import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

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

function sortByLabel(a, b) {
  const aLabel = a.displayName || a.label || a.nameFr || a.name || a.systemId || '';
  const bLabel = b.displayName || b.label || b.nameFr || b.name || b.systemId || '';
  return String(aLabel).localeCompare(String(bLabel), 'fr');
}

async function getRequestInput(req) {
  const url = new URL(req.url);
  const body = req.method !== 'GET' ? await req.json().catch(() => ({})) : {};
  return {
    domainKey: normalizeString(body?.domainKey ?? url.searchParams.get('domainKey')),
    roleSystemId: normalizeString(body?.roleSystemId ?? url.searchParams.get('roleSystemId')),
    includeInactive: normalizeBool(body?.includeInactive ?? url.searchParams.get('includeInactive')),
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return json({ ok: false, error: 'Authentication required' }, 401);

    const service = base44.asServiceRole;
    const { domainKey, roleSystemId, includeInactive } = await getRequestInput(req);

    const allStylesRaw = await service.entities.StyleHierarchy.filter({});

    let allStyles = (allStylesRaw || []).filter((style) => {
      if (includeInactive) return true;
      return normalizeBool(style.active);
    });

    if (domainKey) {
      const domainKeyLower = lc(domainKey);
      allStyles = allStyles.filter((style) => lc(style.domainKey) === domainKeyLower);
    }

    if (roleSystemId) {
      const allRoleStyleMaps = await service.entities.RoleStyleMap.filter({});
      const activeMaps = (allRoleStyleMaps || []).filter((m) => {
        return lc(m.roleSystemId) === lc(roleSystemId) && normalizeBool(m.isActive ?? true);
      });

      if (activeMaps.length > 0) {
        const allowedStyleIds = new Set(
          activeMaps.map((m) => normalizeString(m.styleSystemId)).filter(Boolean)
        );

        const styleById = new Map();
        for (const style of allStyles) {
          const id = normalizeString(style.systemId || style.id);
          if (id) styleById.set(id, style);
        }

        const expandedIds = new Set([...allowedStyleIds]);

        for (const styleId of allowedStyleIds) {
          let current = styleById.get(styleId);
          let guard = 0;
          while (current && guard < 10) {
            const parentId = normalizeString(current.parentSystemId || current.parentStyleId || current.parentId);
            if (!parentId) break;
            expandedIds.add(parentId);
            current = styleById.get(parentId);
            guard += 1;
          }
        }

        allStyles = allStyles.filter((style) => {
          const id = normalizeString(style.systemId || style.id);
          return !!id && expandedIds.has(id);
        });
      }
    }

    const normalizedStyles = allStyles.map((style) => {
      const id = normalizeString(style.systemId || style.id);
      const parentId = normalizeString(style.parentSystemId || style.parentStyleId || style.parentId);
      const label = style.displayName || style.label || style.nameFr || style.name || style.styleKey || style.key || id;

      return {
        ...style,
        id,
        systemId: id,
        key: normalizeString(style.key || style.styleKey || id),
        label,
        displayName: label,
        domainKey: normalizeString(style.domainKey),
        parentStyleId: parentId,
        parentSystemId: parentId,
        level: Number(style.level || 1),
        rarityTier: style.rarityTier || 'common',
        unlockLevel: Number(style.unlockLevel || 1),
      };
    }).filter((style) => !!style.id);

    const byParent = new Map();
    for (const style of normalizedStyles) {
      const parentId = style.parentStyleId || '__root__';
      if (!byParent.has(parentId)) byParent.set(parentId, []);
      byParent.get(parentId).push(style);
    }

    const styleIndex = new Map();
    for (const style of normalizedStyles) {
      styleIndex.set(style.id, style);
    }

    const issues = [];
    for (const style of normalizedStyles) {
      const level = Number(style.level || 1);
      const parentId = style.parentStyleId;
      if (level === 1 && parentId) {
        issues.push({ systemId: style.id, issue: 'level1_with_parent' });
      }
      if (level > 1 && parentId) {
        const parent = styleIndex.get(parentId);
        if (!parent) {
          issues.push({ systemId: style.id, issue: 'missing_parent' });
        } else if (Number(parent.level || 1) !== level - 1) {
          issues.push({ systemId: style.id, issue: 'bad_parent_level' });
        }
      }
    }

    function buildTree(parentId) {
      const children = byParent.get(parentId) || [];
      return children.sort(sortByLabel).map((node) => ({
        id: node.id,
        systemId: node.id,
        key: node.key,
        label: node.label,
        displayName: node.label,
        domainKey: node.domainKey,
        level: node.level,
        rarityTier: node.rarityTier,
        unlockLevel: node.unlockLevel,
        parentStyleId: node.parentStyleId || null,
        parentSystemId: node.parentStyleId || null,
        active: true,
        children: buildTree(node.id),
      }));
    }

    const tree = buildTree('__root__');

    const flatIndex = {};
    for (const style of normalizedStyles) {
      flatIndex[style.id] = {
        id: style.id,
        systemId: style.id,
        key: style.key,
        label: style.label,
        displayName: style.label,
        level: style.level,
        parentId: style.parentStyleId || null,
        parentStyleId: style.parentStyleId || null,
        rarityTier: style.rarityTier,
        unlockLevel: style.unlockLevel,
        domainKey: style.domainKey,
      };
    }

    return json({
      ok: true,
      domainKey: domainKey || null,
      roleSystemId: roleSystemId || null,
      count: normalizedStyles.length,
      styles: tree,
      tree,
      flatIndex,
      issues: issues.length ? issues : undefined,
    });
  } catch (error) {
    console.error('[getStyleTree] failed', error);
    return json({ ok: false, error: error?.message || 'Unknown error' }, 500);
  }
});