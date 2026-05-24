import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { ensureTalentProfile, buildProfileSyncPayload } from '@/components/onboardingState';
// onboardingState canonical path: @/components/onboardingState
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Loader2,
  Save,
  RefreshCw,
  DollarSign,
  Music,
  ChevronDown,
  ChevronRight,
  Plus,
  User,
} from 'lucide-react';

// ── Helpers ──────────────────────────────────────────────────────────────────
function normalizeBool(v) {
  return v === true || v === 'true' || v === 1 || v === '1';
}

function uniq(arr) {
  return [...new Set((arr || []).filter(Boolean))];
}

function normalizeArray(v) {
  if (Array.isArray(v)) return uniq(v);
  if (!v) return [];
  return uniq([v]);
}

function getId(row) {
  return row?.systemId || row?.id || null;
}

function getRoleLabel(row) {
  return (
    row?.displayName ||
    row?.nameFr ||
    row?.label ||
    row?.name ||
    row?.roleKey ||
    row?.key ||
    getId(row) ||
    'Rôle'
  );
}

function getStyleLabel(row) {
  return (
    row?.displayName ||
    row?.nameFr ||
    row?.label ||
    row?.name ||
    row?.styleKey ||
    row?.key ||
    getId(row) ||
    'Style'
  );
}

// ── Dynamic domain list (v2) — lit depuis l'entité Domain en DB via taxonomyCache ──
// Plus besoin de modifier ce fichier pour ajouter/retirer un domaine.
import { useDomains } from '@/hooks/useDomains';

// ── StyleTreePicker ───────────────────────────────────────────────────────────
function StyleTreePicker({ tree = [], selectedStyles, onToggleStyle }) {
  const [focusedL1, setFocusedL1] = useState(null);
  const [focusedL2, setFocusedL2] = useState(null);

  useEffect(() => {
    if (!tree.length) {
      setFocusedL1(null);
      setFocusedL2(null);
      return;
    }

    if (!focusedL1 || !tree.find((n) => n.id === focusedL1)) {
      setFocusedL1(tree[0].id);
      setFocusedL2(null);
    }
  }, [tree, focusedL1]);

  if (!tree.length) {
    return <p className="text-xs text-gray-400 italic py-2">Aucun style pour ce rôle</p>;
  }

  const l1Node = tree.find((n) => n.id === focusedL1);
  const l2Children = l1Node?.children || [];
  const l2Node = l2Children.find((n) => n.id === focusedL2);
  const l3Children = l2Node?.children || [];

  const countSelected = (node) => {
    if (!node.children?.length) return selectedStyles.has(node.id) ? 1 : 0;
    return node.children.reduce((a, c) => a + countSelected(c), 0);
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {tree.map((l1) => {
          const n = countSelected(l1);

          return (
            <button
              key={l1.id}
              type="button"
              onClick={() => {
                setFocusedL1(l1.id);
                setFocusedL2(null);
              }}
              className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${
                focusedL1 === l1.id
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'border-gray-300 text-gray-700 hover:border-indigo-400'
              }`}
            >
              {l1.label}
              {n > 0 && (
                <span className="ml-1 bg-white/30 text-white text-[10px] rounded-full px-1">
                  {n}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {l1Node && l2Children.length > 0 && (
        <div className="pl-3 border-l-2 border-indigo-100 flex flex-wrap gap-1.5">
          {l2Children.map((l2) => {
            const isLeaf = !l2.children?.length;
            const isSelected = isLeaf && selectedStyles.has(l2.id);
            const n = countSelected(l2);

            return (
              <button
                key={l2.id}
                type="button"
                onClick={() => {
                  if (isLeaf) onToggleStyle(l2.id);
                  else setFocusedL2(focusedL2 === l2.id ? null : l2.id);
                }}
                className={`px-2 py-1 rounded text-xs border transition-all ${
                  isSelected
                    ? 'bg-purple-600 text-white border-purple-600'
                    : focusedL2 === l2.id
                      ? 'bg-indigo-50 border-indigo-400 text-indigo-700'
                      : 'border-gray-200 text-gray-600 hover:border-indigo-300'
                }`}
              >
                {l2.label}
                {!isLeaf && n > 0 && (
                  <span className="ml-1 text-[10px] text-indigo-500">({n})</span>
                )}
                {!isLeaf && <ChevronRight className="inline w-3 h-3 ml-0.5 opacity-50" />}
              </button>
            );
          })}
        </div>
      )}

      {l2Node && l3Children.length > 0 && (
        <div className="pl-6 border-l-2 border-purple-100 flex flex-wrap gap-1">
          {l3Children.map((l3) => (
            <button
              key={l3.id}
              type="button"
              onClick={() => onToggleStyle(l3.id)}
              className={`px-2 py-0.5 rounded text-[11px] border transition-all ${
                selectedStyles.has(l3.id)
                  ? 'bg-purple-600 text-white border-purple-600'
                  : 'border-gray-200 text-gray-500 hover:border-purple-300'
              }`}
            >
              {l3.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── RoleAccordion ─────────────────────────────────────────────────────────────
function RoleAccordion({
  domainKey,
  roles,
  selectedRoles,
  onToggleRole,
  selectedStylesByRole,
  onToggleStyle,
  getStyleTreeForRole,
}) {
  const [expandedRole, setExpandedRole] = useState(null);

  if (!roles.length) {
    return <p className="text-xs text-gray-400 italic">Aucun rôle disponible pour ce domaine</p>;
  }

  return (
    <div className="space-y-2">
      {roles.map((role) => {
        const isSelected = selectedRoles.includes(role.id);
        const isExpanded = expandedRole === role.id;
        const styleSet = selectedStylesByRole[role.id] || new Set();
        const styleCount = styleSet.size;

        return (
          <div
            key={role.id}
            className={`rounded-lg border transition-all ${
              isSelected ? 'border-indigo-300 bg-indigo-50/50' : 'border-gray-200'
            }`}
          >
            <div className="flex items-center gap-2 p-3">
              <button
                type="button"
                onClick={() => onToggleRole(domainKey, role.id)}
                className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                  isSelected
                    ? 'bg-indigo-600 border-indigo-600'
                    : 'border-gray-300 hover:border-indigo-400'
                }`}
              >
                {isSelected && (
                  <svg viewBox="0 0 10 8" className="w-3 h-3">
                    <path
                      d="M1 4l3 3 5-6"
                      stroke="white"
                      strokeWidth="1.5"
                      fill="none"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </button>

              <span
                className={`text-sm font-medium flex-1 ${
                  isSelected ? 'text-indigo-900' : 'text-gray-700'
                }`}
              >
                {role.label}
              </span>

              {isSelected && styleCount > 0 && (
                <span className="text-xs bg-purple-100 text-purple-700 rounded-full px-2 py-0.5">
                  {styleCount} style{styleCount > 1 ? 's' : ''}
                </span>
              )}

              {isSelected && (
                <button
                  type="button"
                  onClick={() => setExpandedRole(isExpanded ? null : role.id)}
                  className="text-gray-400 hover:text-indigo-600 ml-1"
                >
                  <ChevronDown
                    className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                  />
                </button>
              )}
            </div>

            {isSelected && isExpanded && (
              <div className="px-4 pb-3 pt-1 border-t border-indigo-100">
                <p className="text-xs text-indigo-500 mb-2 font-medium">Styles pour ce rôle :</p>
                <StyleTreePicker
                  tree={getStyleTreeForRole(role.id)}
                  selectedStyles={styleSet}
                  onToggleStyle={(sid) => onToggleStyle(role.id, sid)}
                />
              </div>
            )}

            {isSelected && !isExpanded && (
              <div className="px-4 pb-2">
                <button
                  type="button"
                  onClick={() => setExpandedRole(role.id)}
                  className="text-xs text-indigo-500 hover:text-indigo-700 flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" />
                  {styleCount === 0
                    ? 'Préciser les styles (optionnel)'
                    : `${styleCount} style${styleCount > 1 ? 's' : ''} · modifier`}
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── PricingCard ───────────────────────────────────────────────────────────────
function PricingCard({ role, value, onChange }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">{role.label}</h3>
          <p className="text-xs text-gray-400 mt-0.5">Tarification publique associée à ce rôle</p>
        </div>
        {role.domainKey && (
          <Badge variant="outline" className="text-xs">
            {role.domainKey}
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <Label className="text-xs text-gray-600 mb-1 block">Taux horaire ($ CAD)</Label>
          <Input
            type="number"
            min="0"
            step="1"
            value={value.hourlyRate}
            onChange={(e) => onChange(role.id, 'hourlyRate', e.target.value)}
            placeholder="ex: 125"
            className="rounded-xl"
          />
        </div>

        <div>
          <Label className="text-xs text-gray-600 mb-1 block">Cachet événement ($ CAD)</Label>
          <Input
            type="number"
            min="0"
            step="1"
            value={value.fixedRate}
            onChange={(e) => onChange(role.id, 'fixedRate', e.target.value)}
            placeholder="ex: 550"
            className="rounded-xl"
          />
        </div>
      </div>

      {/* 6-I — Forfait nommé */}
      <div className="pt-2 border-t border-dashed border-gray-100">
        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Forfait nommé <span className="font-normal normal-case">(optionnel)</span></p>
        <div className="space-y-2">
          <Input
            type="text"
            value={value.packageName || ''}
            onChange={(e) => onChange(role.id, 'packageName', e.target.value)}
            placeholder="Nom du forfait — ex: Forfait Bar 2h, Pack Wedding DJ"
            className="rounded-xl text-sm"
          />
          <textarea
            value={value.packageDescription || ''}
            onChange={(e) => onChange(role.id, 'packageDescription', e.target.value)}
            className="w-full min-h-[60px] rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
            placeholder="Ce qui est inclus — ex: DJ set 2h + équipement + déplacement ≤ 30 km"
          />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">Par personne ($ CAD)</Label>
              <Input
                type="number"
                min="0"
                step="0.5"
                value={value.perPersonRate || ''}
                onChange={(e) => onChange(role.id, 'perPersonRate', e.target.value)}
                placeholder="ex: 5.00"
                className="rounded-xl text-sm"
              />
            </div>
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">Par item ($ CAD)</Label>
              <Input
                type="number"
                min="0"
                step="0.5"
                value={value.perItemRate || ''}
                onChange={(e) => onChange(role.id, 'perItemRate', e.target.value)}
                placeholder="ex: 2.50"
                className="rounded-xl text-sm"
              />
            </div>
          </div>
        </div>
      </div>

      <div>
        <Label className="text-xs text-gray-600 mb-1 block">Conditions et notes</Label>
        <textarea
          value={value.notes}
          onChange={(e) => onChange(role.id, 'notes', e.target.value)}
          className="w-full min-h-[90px] rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
          placeholder="ex: Déplacement inclus dans un rayon de 30 km. Cachet négociable selon contexte."
        />
      </div>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────
export default function Preferences() {
  const DOMAINS = useDomains(); // v2 — chargé depuis DB via taxonomyCache
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pricingSaving, setPricingSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [user, setUser] = useState(null);
  const [userPreferences, setUserPreferences] = useState(null);

  const [allRoles, setAllRoles] = useState([]);
  const [allStyles, setAllStyles] = useState([]);

  const [selectedDomains, setSelectedDomains] = useState([]);
  const [activeDomainTab, setActiveDomainTab] = useState(null);
  const [rolesByDomain, setRolesByDomain] = useState({});
  const [stylesByRole, setStylesByRole] = useState({});
  const [pricingByRole, setPricingByRole] = useState({});

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [pricingSuccess, setPricingSuccess] = useState('');

  // ── Load ──────────────────────────────────────────────────────────────────
  const loadData = useCallback(async ({ silent = false } = {}) => {
    if (silent) setRefreshing(true);
    else setLoading(true);

    setError('');
    setSuccess('');
    setPricingSuccess('');

    try {
      const me = await base44.auth.me();
      setUser(me);
      const myId = me.id || me.userId || me.email;

      const [prefsRows, roles, styles, pricing] = await Promise.all([
        base44.entities.UserPreferences.filter({}),
        base44.entities.RoleHierarchy.filter({}),
        base44.entities.StyleHierarchy.filter({}),
        base44.entities.TalentPricing.filter({}),
      ]);

      // UserPreferences = source canonique
      const myPrefsRows = (prefsRows || []).filter(
        (p) => p.userId === myId || p.createdBy === me.email || p.email === me.email
      );

      let prefs = myPrefsRows[0] || null;

      if (!prefs) {
        prefs = await base44.entities.UserPreferences.create({
          userId: myId,
          rolePrefs:  {},
          stylePrefs: {},
        });
      }

      setUserPreferences(prefs);

      // Roles catalog
      const normalizedRoles = (roles || [])
        .filter((r) => normalizeBool(r.active))
        .map((r) => ({
          id: getId(r),
          label: getRoleLabel(r),
          domainKey: r.domainKey || '',
          level: Number(r.level || 1),
          raw: r,
        }))
        .filter((r) => r.id);

      setAllRoles(normalizedRoles);

      // Styles catalog
      const normalizedStyles = (styles || [])
        .filter((s) => normalizeBool(s.active))
        .map((s) => ({
          id: getId(s),
          label: getStyleLabel(s),
          domainKey: s.domainKey || '',
          roleSystemId: s.roleSystemId || null,
          parentStyleId: s.parentStyleId || s.parentSystemId || null,
          raw: s,
        }))
        .filter((s) => s.id);

      setAllStyles(normalizedStyles);

      // ── Restore selections from UserPreferences (real schema) ──────────────
      // rolePrefs = { "RL-000008": { active: true }, ... }
      // stylePrefs = { "ST-000072": { active: true }, ... }
      const rolePrefObj  = prefs.rolePrefs  || {};
      const stylePrefObj = prefs.stylePrefs || {};

      // Parse if stored as string
      const parsePrefObj = (v) => {
        if (!v) return {};
        if (typeof v === 'string') { try { return JSON.parse(v); } catch { return {}; } }
        return v;
      };

      const rolePref  = parsePrefObj(rolePrefObj);
      const stylePref = parsePrefObj(stylePrefObj);

      // Active role IDs
      const savedRoles = Object.entries(rolePref)
        .filter(([, v]) => v?.active !== false)
        .map(([k]) => k);

      // Active style IDs
      const savedStyles = Object.entries(stylePref)
        .filter(([, v]) => v?.active !== false)
        .map(([k]) => k);

      // Derive domains from saved roles via catalog
      const roleDomainMap = new Map(normalizedRoles.map((r) => [r.id, r.domainKey || '_other']));
      const rebuiltByDomain = {};

      for (const rid of savedRoles) {
        const dk = roleDomainMap.get(rid) || '_other';
        if (!rebuiltByDomain[dk]) rebuiltByDomain[dk] = [];
        rebuiltByDomain[dk].push(rid);
      }

      // Domains = unique domain keys from active roles (preserve DOMAINS order)
      const savedDomains = DOMAINS
        .map((d) => d.key)
        .filter((k) => rebuiltByDomain[k]?.length > 0);

      setSelectedDomains(savedDomains);
      setActiveDomainTab(savedDomains[0] || null);
      setRolesByDomain(rebuiltByDomain);

      // Rebuild stylesByRole
      const styleById = new Map(normalizedStyles.map((s) => [s.id, s]));
      const domainToSavedRoles = {};
      for (const rid of savedRoles) {
        const dk = roleDomainMap.get(rid) || '_other';
        if (!domainToSavedRoles[dk]) domainToSavedRoles[dk] = [];
        domainToSavedRoles[dk].push(rid);
      }

      const rebuiltStylesByRole = {};
      for (const sid of savedStyles) {
        const styleRow = styleById.get(sid);
        if (!styleRow) continue;

        let targetRoleId = styleRow.roleSystemId || null;
        if (!targetRoleId) {
          const dk = styleRow.domainKey || '_other';
          const candidates = domainToSavedRoles[dk] || Object.values(domainToSavedRoles).flat();
          targetRoleId = candidates[0] || '_all';
        }

        if (!rebuiltStylesByRole[targetRoleId]) rebuiltStylesByRole[targetRoleId] = new Set();
        rebuiltStylesByRole[targetRoleId].add(sid);
      }

      setStylesByRole(rebuiltStylesByRole);

      // Pricing
      const myPricing = (pricing || []).filter(
        (p) => p.userId === myId || p.createdBy === me.email
      );

      const pricingMap = {};
      for (const row of myPricing) {
        const rid = row.roleSystemId || row.roleId;
        if (!rid) continue;

        pricingMap[rid] = {
          hourlyRate: row.hourlyRate ?? '',
          fixedRate: row.fixedRate ?? '',
          notes: row.notes ?? '',
          currency: row.currency || 'CAD',
          // 6-I — forfait nommé
          packageName:        row.packageName        ?? '',
          packageDescription: row.packageDescription ?? '',
          perPersonRate:      row.perPersonRate       ?? '',
          perItemRate:        row.perItemRate         ?? '',
          _entityId: row.id,
        };
      }

      setPricingByRole(pricingMap);
    } catch (err) {
      console.error('[Preferences] loadData failed', err);
      setError('Impossible de charger les préférences.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ── Catalog lookups ────────────────────────────────────────────────────────
  const roleCatalog = useMemo(() => {
    const map = new Map();
    for (const role of allRoles) map.set(role.id, role);
    return map;
  }, [allRoles]);

  const roleDomainMap = useMemo(() => {
    const out = {};
    for (const role of allRoles) {
      if (role?.id) out[role.id] = role.domainKey || '';
    }
    return out;
  }, [allRoles]);

  const stylesByDomainAndRole = useMemo(() => {
    const grouped = {};

    for (const style of allStyles) {
      const domainKey = style.domainKey || '_all';
      const roleKey = style.roleSystemId || '_all';

      if (!grouped[domainKey]) grouped[domainKey] = {};
      if (!grouped[domainKey][roleKey]) grouped[domainKey][roleKey] = [];

      grouped[domainKey][roleKey].push(style);
    }

    return grouped;
  }, [allStyles]);

  const getStyleTreeForRole = useCallback(
    (domainKey, roleId) => {
      // Merge role-specific styles + domain-wide styles (roleSystemId=null → '_all')
      const roleSpecific = stylesByDomainAndRole?.[domainKey]?.[roleId] || [];
      const domainWide   = stylesByDomainAndRole?.[domainKey]?.['_all']  || [];

      const seen = new Set();
      const scoped = [];
      for (const s of [...roleSpecific, ...domainWide]) {
        if (!seen.has(s.id)) { seen.add(s.id); scoped.push(s); }
      }

      const byId  = new Map();
      const roots = [];

      for (const row of scoped) {
        byId.set(row.id, { id: row.id, label: row.label, domainKey: row.domainKey, children: [] });
      }

      for (const row of scoped) {
        const node = byId.get(row.id);
        const pid  = row.parentStyleId;
        if (pid && byId.has(pid)) byId.get(pid).children.push(node);
        else roots.push(node);
      }

      return roots;
    },
    [stylesByDomainAndRole]
  );

  const domainRolesMap = useMemo(() => {
    const result = {};
    for (const d of DOMAINS) {
      // No level filter — saved roles at level 2+ must still appear checked.
      result[d.key] = allRoles.filter(
        (r) => !r.domainKey || r.domainKey === d.key
      );
    }
    return result;
  }, [allRoles]);

  // ── Derived ────────────────────────────────────────────────────────────────
  const allRoleIds = useMemo(() => uniq(Object.values(rolesByDomain).flat()), [rolesByDomain]);

  const allStyleIds = useMemo(
    () => uniq(Object.values(stylesByRole).flatMap((s) => [...s])),
    [stylesByRole]
  );

  const selectedRoleObjects = useMemo(() => {
    return allRoleIds
      .map((rid) => {
        const role = roleCatalog.get(rid);
        const domainOfRole =
          role?.domainKey ||
          Object.entries(rolesByDomain).find(([, ids]) => ids.includes(rid))?.[0] ||
          '';

        return {
          id: rid,
          label: role?.label || rid,
          domainKey: domainOfRole,
        };
      })
      .filter(Boolean);
  }, [allRoleIds, roleCatalog, rolesByDomain]);

  // ── Toggles ────────────────────────────────────────────────────────────────
  const toggleDomain = (key) => {
    setSuccess('');

    setSelectedDomains((prev) => {
      const already = prev.includes(key);
      const next = already ? prev.filter((k) => k !== key) : [...prev, key];

      if (already) {
        setRolesByDomain((r) => {
          const copy = { ...r };
          delete copy[key];
          return copy;
        });
      }

      if (!next.length) setActiveDomainTab(null);
      else if (!next.includes(activeDomainTab)) setActiveDomainTab(next[0]);

      return next;
    });

    if (!selectedDomains.includes(key)) {
      setActiveDomainTab(key);
    }
  };

  const toggleRole = (domainKey, roleId) => {
    setSuccess('');
    setPricingSuccess('');

    setRolesByDomain((prev) => {
      const current = prev[domainKey] || [];
      const isIn = current.includes(roleId);
      const next = isIn ? current.filter((r) => r !== roleId) : [...current, roleId];

      if (isIn) {
        setStylesByRole((s) => {
          const copy = { ...s };
          delete copy[roleId];
          return copy;
        });
      }

      return { ...prev, [domainKey]: next };
    });
  };

  const toggleStyle = (roleId, styleId) => {
    setSuccess('');

    setStylesByRole((prev) => {
      const current = new Set(prev[roleId] || []);
      if (current.has(styleId)) current.delete(styleId);
      else current.add(styleId);
      return { ...prev, [roleId]: new Set(current) };
    });
  };

  const handlePricingChange = (roleId, field, value) => {
    setPricingSuccess('');

    setPricingByRole((prev) => ({
      ...prev,
      [roleId]: {
        hourlyRate: prev[roleId]?.hourlyRate ?? '',
        fixedRate: prev[roleId]?.fixedRate ?? '',
        notes: prev[roleId]?.notes ?? '',
        currency: prev[roleId]?.currency ?? 'CAD',
        _entityId: prev[roleId]?._entityId ?? null,
        [field]: value,
      },
    }));
  };

  // ── Save preferences ───────────────────────────────────────────────────────
  const savePreferences = async () => {
    if (!user) return;

    setSaving(true);
    setError('');
    setSuccess('');
    setPricingSuccess('');

    try {
      if (allRoleIds.length === 0) {
        setError('Choisis au moins 1 rôle avant de sauvegarder.');
        return;
      }

      if (allStyleIds.length === 0) {
        setError('Choisis au moins 1 style avant de sauvegarder.');
        return;
      }

      // Build rolePrefs: { "RL-000008": { active: true }, ... }
      const rolePrefs = {};
      for (const rid of allRoleIds) rolePrefs[rid] = { active: true };

      // Build stylePrefs: { "ST-000072": { active: true, weight: 50 }, ... }
      const stylePrefs = {};
      for (const sid of allStyleIds) stylePrefs[sid] = { active: true, weight: 50 };

      const payload = {
        rolePrefs,
        stylePrefs,
        updatedAt: new Date().toISOString(),
      };

      const myId = user.id || user.userId || user.email;
      let savedPrefs = null;

      if (userPreferences?.id) {
        savedPrefs = await base44.entities.UserPreferences.update(userPreferences.id, payload);
      } else {
        savedPrefs = await base44.entities.UserPreferences.create({
          userId: myId,
          ...payload,
        });
      }

      setUserPreferences(savedPrefs);

      // Répare / crée TalentProfile puis synchronise les champs critiques pour QuickPlay
      const profile = await ensureTalentProfile(base44, user);
      const profilePayload = buildProfileSyncPayload({
        rolePrefs,
        stylePrefs,
        roleDomainMap,
      });
      await base44.entities.TalentProfile.update(profile.id, profilePayload);

      setSuccess('Préférences enregistrées et profil QuickPlay synchronisé.');
    } catch (err) {
      console.error('[Preferences] save failed', err);
      setError("Impossible d'enregistrer les préférences.");
    } finally {
      setSaving(false);
    }
  };

  // ── Save pricing ───────────────────────────────────────────────────────────
  const savePricing = async () => {
    if (!user) return;

    setPricingSaving(true);
    setError('');
    setPricingSuccess('');

    const myId = user.id || user.userId || user.email;

    try {
      if (selectedRoleObjects.length === 0) {
        setError('Ajoute au moins 1 rôle avant de sauvegarder les tarifs.');
        return;
      }

      await ensureTalentProfile(base44, user);

      for (const role of selectedRoleObjects) {
        const val = pricingByRole[role.id] || {
          hourlyRate: '',
          fixedRate: '',
          notes: '',
          currency: 'CAD',
        };

        const payload = {
          userId: myId,
          createdBy: user.email,
          roleSystemId: role.id,
          hourlyRate:
            val.hourlyRate === '' || val.hourlyRate == null ? null : Number(val.hourlyRate),
          fixedRate:
            val.fixedRate === '' || val.fixedRate == null ? null : Number(val.fixedRate),
          currency: val.currency || 'CAD',
          notes: val.notes || '',
          // 6-I — forfait nommé
          packageName:        val.packageName        || null,
          packageDescription: val.packageDescription || null,
          perPersonRate:      val.perPersonRate === '' || val.perPersonRate == null ? null : Number(val.perPersonRate),
          perItemRate:        val.perItemRate   === '' || val.perItemRate   == null ? null : Number(val.perItemRate),
        };

        if (val._entityId) {
          await base44.entities.TalentPricing.update(val._entityId, payload);
        } else {
          const created = await base44.entities.TalentPricing.create(payload);
          setPricingByRole((prev) => ({
            ...prev,
            [role.id]: { ...prev[role.id], _entityId: created.id },
          }));
        }
      }

      setPricingSuccess('Tarifs enregistrés avec succès.');
    } catch (err) {
      console.error('[Preferences] savePricing failed', err);
      setError("Impossible d'enregistrer les tarifs.");
    } finally {
      setPricingSaving(false);
    }
  };

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <div className="flex items-start justify-between gap-4 flex-wrap mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Préférences</h1>
          <p className="text-gray-500 mt-1">
            Configure ton profil talent : domaine → rôle → styles + tarifs
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            onClick={() => loadData({ silent: true })}
            disabled={refreshing}
          >
            {refreshing ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <RefreshCw className="w-4 h-4 mr-2" />
            )}
            Actualiser
          </Button>

          <Button
            onClick={savePreferences}
            disabled={saving}
            className="bg-indigo-600 hover:bg-indigo-700"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            Sauvegarder
          </Button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-xl bg-red-500 text-white px-5 py-3 text-sm font-medium shadow-sm">
          {error}
        </div>
      )}

      {success && (
        <div className="mb-4 rounded-xl bg-emerald-500 text-white px-5 py-3 text-sm font-medium shadow-sm">
          {success}
        </div>
      )}

      {pricingSuccess && (
        <div className="mb-4 rounded-xl bg-emerald-500 text-white px-5 py-3 text-sm font-medium shadow-sm">
          {pricingSuccess}
        </div>
      )}

      <div className="space-y-6">
        {/* Domaines */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <User className="w-5 h-5 text-indigo-500" />
              Domaines
            </CardTitle>
            <CardDescription>
              Choisis tes domaines — ce sont tes "factions" (multi-sélection)
            </CardDescription>
          </CardHeader>

          <CardContent>
            <div className="flex flex-wrap gap-2">
              {DOMAINS.map((d) => {
                const isSel = selectedDomains.includes(d.key);
                const roleCount = (rolesByDomain[d.key] || []).length;

                return (
                  <button
                    key={d.key}
                    type="button"
                    onClick={() => toggleDomain(d.key)}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border-2 text-sm font-medium transition-all ${
                      isSel
                        ? 'border-indigo-500 bg-indigo-50 text-indigo-800'
                        : 'border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    <span>{d.icon}</span>
                    <span>{d.label}</span>
                    {isSel && roleCount > 0 && (
                      <span className="ml-0.5 text-xs text-indigo-500">({roleCount})</span>
                    )}
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Rôles & Styles */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Music className="w-5 h-5 text-indigo-500" />
              Rôles &amp; Styles
            </CardTitle>
            <CardDescription>
              Sélectionne tes rôles puis précise tes styles par rôle
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-5">
            {!selectedDomains.length ? (
              <p className="text-sm text-gray-400 italic">
                Sélectionne d'abord au moins 1 domaine
              </p>
            ) : (
              <>
                {selectedDomains.length > 1 && (
                  <div className="flex gap-1 border-b border-gray-200">
                    {selectedDomains.map((key) => {
                      const d = DOMAINS.find((x) => x.key === key);
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setActiveDomainTab(key)}
                          className={`px-3 py-1.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
                            activeDomainTab === key
                              ? 'border-indigo-500 text-indigo-700'
                              : 'border-transparent text-gray-500 hover:text-gray-700'
                          }`}
                        >
                          {d?.icon} {d?.label}
                        </button>
                      );
                    })}
                  </div>
                )}

                {selectedDomains.map((key) => {
                  const isVisible = selectedDomains.length === 1 || activeDomainTab === key;
                  if (!isVisible) return null;

                  return (
                    <RoleAccordion
                      key={key}
                      domainKey={key}
                      roles={domainRolesMap[key] || []}
                      selectedRoles={rolesByDomain[key] || []}
                      onToggleRole={toggleRole}
                      selectedStylesByRole={stylesByRole}
                      onToggleStyle={toggleStyle}
                      getStyleTreeForRole={(roleId) => getStyleTreeForRole(key, roleId)}
                    />
                  );
                })}

                {selectedRoleObjects.length > 0 && (
                  <div className="pt-2 border-t border-gray-100">
                    <p className="text-xs text-gray-400 mb-1.5">Récapitulatif</p>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedRoleObjects.map((role) => (
                        <Badge key={role.id} variant="secondary" className="text-xs">
                          {role.label}
                        </Badge>
                      ))}
                      {allStyleIds.length > 0 && (
                        <span className="text-xs text-gray-400 self-center">
                          + {allStyleIds.length} style{allStyleIds.length > 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Tarification */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <DollarSign className="w-5 h-5 text-indigo-500" />
              Tarification
            </CardTitle>
            <CardDescription>Déclare tes tarifs par rôle sélectionné</CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            {!selectedRoleObjects.length ? (
              <p className="text-sm text-gray-400 italic">
                Sélectionne au moins un rôle pour configurer la tarification.
              </p>
            ) : (
              <>
                {selectedRoleObjects.map((role) => (
                  <PricingCard
                    key={role.id}
                    role={role}
                    value={
                      pricingByRole[role.id] || {
                        hourlyRate: '',
                        fixedRate: '',
                        notes: '',
                        currency: 'CAD',
                      }
                    }
                    onChange={handlePricingChange}
                  />
                ))}

                <Button
                  onClick={savePricing}
                  disabled={pricingSaving}
                  className="bg-emerald-600 hover:bg-emerald-700"
                >
                  {pricingSaving ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <Save className="w-4 h-4 mr-2" />
                  )}
                  Sauvegarder les tarifs
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        {/* Footer badges */}
        <div className="flex flex-wrap gap-2 pt-2">
          <Badge variant="outline">Domaines : {selectedDomains.length}</Badge>
          <Badge variant="outline">Rôles : {allRoleIds.length}</Badge>
          <Badge variant="outline">Styles : {allStyleIds.length}</Badge>
          {user?.email && <Badge variant="outline">{user.email}</Badge>}
        </div>
      </div>
    </div>
  );
}