import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '../utils';
import { getCheckpointTimezone, toCheckpointDatetimeInput, checkpointDatetimeToUtc, DEFAULT_TIMEZONE } from '../utils/dateUtils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import CheckpointPicker from '../components/play/CheckpointPicker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { getTaxonomies } from '@/components/taxonomyCache.jsx';
import { FALLBACK_DOMAINS } from '@/hooks/useDomains'; // v2 — domaines dynamiques
import {
  Loader2, MapPin, Calendar, Users, Music, DollarSign, CheckCircle,
  ChevronRight, ChevronDown, Plus, X, Layers, Clock, Grip,
  ArrowRight
} from 'lucide-react';
import PaymentOptionsPanel from '@/components/event/PaymentOptionsPanel';

function normalizeId(v) {
  if (!v) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'object') return String(v.systemId || v.id || v._id || v.value || '');
  return String(v);
}

// ── Helpers horaire ────────────────────────────────────────────────────────
const HORAIRE_TEMPLATES = {
  standard: {
    name: '🎛 DJ Set / Rave',
    byCount: {
      1: { labels: ['Peak'],                                    ratios: [1] },
      2: { labels: ['Warmup', 'Peak'],                          ratios: [0.30, 0.70] },
      3: { labels: ['Warmup', 'Peak', 'Closer'],                ratios: [0.30, 0.45, 0.25] },
      4: { labels: ['Arrivée', 'Warmup', 'Peak', 'Closer'],     ratios: [0.15, 0.25, 0.40, 0.20] },
      5: { labels: ['Arrivée', 'Warmup', 'Build', 'Peak', 'Closer'], ratios: [0.10, 0.18, 0.24, 0.30, 0.18] },
      6: { labels: ['Arrivée', 'Warmup', 'Build', 'Peak', 'Closer', 'Rappel'], ratios: [0.08, 0.15, 0.20, 0.28, 0.19, 0.10] },
    },
  },
  mariage: {
    name: '💍 Mariage / Gala',
    byCount: {
      3: { labels: ['Cocktail', 'Souper', 'Party'],              ratios: [0.25, 0.35, 0.40] },
      4: { labels: ['Cérémonie', 'Cocktail', 'Souper', 'Party'], ratios: [0.15, 0.25, 0.30, 0.30] },
      5: { labels: ['Cérémonie', 'Cocktail', 'Souper', 'Danse', 'Party'], ratios: [0.10, 0.20, 0.28, 0.12, 0.30] },
      6: { labels: ['Cérémonie', 'Cocktail', 'Souper', 'Discours', 'Danse', 'Party'], ratios: [0.08, 0.18, 0.24, 0.10, 0.12, 0.28] },
    },
  },
  corporate: {
    name: '🏢 Corporate / Conférence',
    byCount: {
      3: { labels: ['Accueil', 'Conférence', 'Cocktail'],        ratios: [0.20, 0.45, 0.35] },
      4: { labels: ['Accueil', 'Conf 1', 'Conf 2', 'Cocktail'],  ratios: [0.15, 0.30, 0.25, 0.30] },
      5: { labels: ['Accueil', 'Conf 1', 'Pause', 'Conf 2', 'Cocktail'], ratios: [0.12, 0.25, 0.10, 0.25, 0.28] },
    },
  },
};

const SCENE_ICONS = ['🎛', '🎤', '🎸', '🍸', '🌙', '📸', '🎭', '🔒'];
const SCENE_ICON_LABELS = ['DJ Booth', 'Micro', 'Live', 'Bar', 'Terrasse', 'Photo', 'Scène', 'Sécu'];

// ── Templates de mission ───────────────────────────────────────────────────
// Chaque template pré-remplit : titre, description, budget, horaire, domaines/rôles cibles
// Les rôles sont résolus dynamiquement après chargement — on stocke les domaines + labels
export const MISSION_TEMPLATES = {
  corporate_4a7: {
    label: '🏢 4 à 7 Corporatif',
    missionTemplate: 'corporate_4a7',
    title: '4 à 7 Corporatif',
    description: 'Événement clé en main : DJ + Humoriste + Vidéaste. Ambiance networking, DJ set lounge et cocktail.',
    budget: '1000',
    horaireTemplate: 'corporate',
    horaireCount: 3,
    scenes: [
      { sceneId: 'sc-1', label: 'Espace cocktail', icon: '🍸' },
    ],
    // Domaines à activer et rôles-cibles (systemId partiel / label) pour lookup post-chargement
    domainsToActivate: ['music', 'humour', 'video'],
    roleKeywords: {
      music:  ['dj'],
      humour: ['humoriste', 'comedien', 'stand-up', 'humour'],
      video:  ['videaste', 'video', 'captation'],
    },
  },
  all_night_long: {
    label: '🌙 ALL NIGHT LONG',
    missionTemplate: 'all_night_long',
    title: 'ALL NIGHT LONG',
    description: 'Événement phare scène artistique mensuel. DJ + Vidéaste.',
    budget: '0',
    horaireTemplate: 'standard',
    horaireCount: 4,
    scenes: [
      { sceneId: 'sc-1', label: 'Scène principale', icon: '🎛' },
    ],
    domainsToActivate: ['music', 'video'],
    roleKeywords: {
      music: ['dj'],
      video: ['videaste', 'video', 'captation'],
    },
  },
};

function pad2(n) { return String(n).padStart(2, '0'); }
function fmtHHMM(d) {
  if (!d || !(d instanceof Date)) return '--:--';
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

// toLocalDatetimeInput remplacé par toCheckpointDatetimeInput depuis dateUtils.js

function generateSlots(dateStart, dateEnd, templateKey, count) {
  if (!dateStart || !dateEnd) return [];
  const tpl = HORAIRE_TEMPLATES[templateKey] || HORAIRE_TEMPLATES.standard;
  const conf = tpl.byCount[count];
  const labels = conf ? conf.labels : Array.from({ length: count }, (_, i) => `Plage ${i + 1}`);
  const rawRatios = conf ? conf.ratios : Array(count).fill(1 / count);
  const total = rawRatios.reduce((a, b) => a + b, 0) || 1;
  const ratios = rawRatios.map(r => r / total);
  const totalMs = dateEnd - dateStart;
  let acc = 0;
  return ratios.map((r, i) => {
    const start = new Date(dateStart.getTime() + totalMs * acc);
    acc += r;
    const end = i === count - 1 ? new Date(dateEnd) : new Date(dateStart.getTime() + totalMs * acc);
    return { plageId: `p-${i + 1}`, label: labels[i], timeStart: start.toISOString(), timeEnd: end.toISOString() };
  });
}

// ── StyleTreePicker (identique à celui de CreateEvent existant) ────────────
function StyleTreePicker({ domainKey, roleSystemId, selectedStyles, onToggleStyle }) {
  const [tree, setTree] = useState([]);
  const [loading, setLoading] = useState(false);
  const [focusedL1, setFocusedL1] = useState(null);
  const [focusedL2, setFocusedL2] = useState(null);

  useEffect(() => {
    if (!domainKey || !roleSystemId) { setTree([]); return; }
    let cancelled = false;
    setLoading(true);
    base44.functions.invoke('getStyleTree', { domainKey, roleSystemId })
      .then(res => {
        if (cancelled) return;
        const t = res?.data?.tree || [];
        setTree(t);
        if (t.length > 0) setFocusedL1(t[0].id);
        setFocusedL2(null);
      })
      .catch(() => { if (!cancelled) setTree([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [domainKey, roleSystemId]);

  if (!roleSystemId) return <p className="text-xs text-gray-400 italic py-2">Sélectionnez un rôle pour voir ses styles</p>;
  if (loading) return <div className="flex items-center gap-2 py-2 text-gray-400 text-xs"><Loader2 className="w-3 h-3 animate-spin" />Chargement…</div>;
  if (!tree.length) return <p className="text-xs text-gray-400 italic py-2">Aucun style pour ce rôle</p>;

  const l1Node = tree.find(n => n.id === focusedL1);
  const l2Children = l1Node?.children || [];
  const l2Node = l2Children.find(n => n.id === focusedL2);
  const l3Children = l2Node?.children || [];

  const countSelected = node => {
    if (!node.children?.length) return selectedStyles.has(node.id) ? 1 : 0;
    return node.children.reduce((a, c) => a + countSelected(c), 0);
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {tree.map(l1 => {
          const n = countSelected(l1);
          return (
            <button key={l1.id} type="button" onClick={() => { setFocusedL1(l1.id); setFocusedL2(null); }}
              className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${focusedL1 === l1.id ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-300 text-gray-700 hover:border-indigo-400'}`}>
              {l1.label}{n > 0 && <span className="ml-1 bg-white/30 text-white text-[10px] rounded-full px-1">{n}</span>}
            </button>
          );
        })}
      </div>
      {l1Node && l2Children.length > 0 && (
        <div className="pl-3 border-l-2 border-indigo-100 flex flex-wrap gap-1.5">
          {l2Children.map(l2 => {
            const isLeaf = !l2.children?.length;
            const isSelected = isLeaf && selectedStyles.has(l2.id);
            const n = countSelected(l2);
            return (
              <button key={l2.id} type="button"
                onClick={() => { if (isLeaf) onToggleStyle(l2.id); else setFocusedL2(focusedL2 === l2.id ? null : l2.id); }}
                className={`px-2 py-1 rounded text-xs border transition-all ${isSelected ? 'bg-purple-600 text-white border-purple-600' : focusedL2 === l2.id ? 'bg-indigo-50 border-indigo-400 text-indigo-700' : 'border-gray-200 text-gray-600 hover:border-indigo-300'}`}>
                {l2.label}{!isLeaf && n > 0 && <span className="ml-1 text-[10px] text-indigo-500">({n})</span>}
                {!isLeaf && <ChevronRight className="inline w-3 h-3 ml-0.5 opacity-50" />}
              </button>
            );
          })}
        </div>
      )}
      {l2Node && l3Children.length > 0 && (
        <div className="pl-6 border-l-2 border-purple-100 flex flex-wrap gap-1">
          {l3Children.map(l3 => (
            <button key={l3.id} type="button" onClick={() => onToggleStyle(l3.id)}
              className={`px-2 py-0.5 rounded text-[11px] border transition-all ${selectedStyles.has(l3.id) ? 'bg-purple-600 text-white border-purple-600' : 'border-gray-200 text-gray-500 hover:border-purple-300'}`}>
              {l3.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function RolePicker({ domainKey, selectedRoles, onToggleRole, selectedStylesByRole, onToggleStyle }) {
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [expandedRole, setExpandedRole] = useState(null);

  useEffect(() => {
    if (!domainKey) return;
    let cancelled = false;
    setLoading(true);
    base44.functions.invoke('getRolesForDomain', { domainKey })
      .then(res => { if (!cancelled) setRoles(res?.data?.roles || []); })
      .catch(() => { if (!cancelled) setRoles([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [domainKey]);

  if (loading) return <div className="flex items-center gap-2 text-gray-400 text-sm py-2"><Loader2 className="w-4 h-4 animate-spin" />Chargement…</div>;
  if (!roles.length) return <p className="text-xs text-gray-400 italic">Aucun rôle disponible</p>;

  const rootRoles = roles.filter(r => r.level === 1);

  return (
    <div className="space-y-2">
      {rootRoles.map(role => {
        const roleId = normalizeId(role.systemId || role.id);
        const isSelected = selectedRoles.includes(roleId);
        const isExpanded = expandedRole === roleId;
        const roleStyles = selectedStylesByRole[roleId] || new Set();
        const styleCount = roleStyles.size;
        return (
          <div key={roleId} className={`rounded-lg border transition-all ${isSelected ? 'border-indigo-300 bg-indigo-50/50' : 'border-gray-200'}`}>
            <div className="flex items-center gap-2 p-3">
              <button type="button" onClick={() => onToggleRole(roleId)}
                className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${isSelected ? 'bg-indigo-600 border-indigo-600' : 'border-gray-300 hover:border-indigo-400'}`}>
                {isSelected && <svg viewBox="0 0 10 8" className="w-3 h-3"><path d="M1 4l3 3 5-6" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>}
              </button>
              <span className={`text-sm font-medium flex-1 ${isSelected ? 'text-indigo-900' : 'text-gray-700'}`}>{role.nameFr || role.displayName || roleId}</span>
              {isSelected && styleCount > 0 && <span className="text-xs bg-purple-100 text-purple-700 rounded-full px-2 py-0.5">{styleCount} style{styleCount > 1 ? 's' : ''}</span>}
              {isSelected && <button type="button" onClick={() => setExpandedRole(isExpanded ? null : roleId)} className="text-gray-400 hover:text-indigo-600 ml-1"><ChevronDown className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} /></button>}
            </div>
            {isSelected && isExpanded && (
              <div className="px-4 pb-3 pt-1 border-t border-indigo-100">
                <p className="text-xs text-indigo-500 mb-2 font-medium">Styles recherchés pour ce rôle :</p>
                <StyleTreePicker domainKey={domainKey} roleSystemId={roleId} selectedStyles={roleStyles} onToggleStyle={(sid) => onToggleStyle(roleId, sid)} />
              </div>
            )}
            {isSelected && !isExpanded && (
              <div className="px-4 pb-2">
                <button type="button" onClick={() => setExpandedRole(roleId)} className="text-xs text-indigo-500 hover:text-indigo-700 flex items-center gap-1">
                  <Plus className="w-3 h-3" />
                  {styleCount === 0 ? 'Préciser les styles (optionnel)' : `${styleCount} style${styleCount > 1 ? 's' : ''} · modifier`}
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Composant configurateur de scènes ─────────────────────────────────────
function SceneConfigurator({ scenes, onChange }) {
  const addScene = () => {
    if (scenes.length >= 6) return;
    const id = `sc-${Date.now()}`;
    const iconIdx = scenes.length % SCENE_ICONS.length;
    onChange([...scenes, { sceneId: id, label: SCENE_ICON_LABELS[iconIdx], icon: SCENE_ICONS[iconIdx] }]);
  };

  const removeScene = (id) => onChange(scenes.filter(s => s.sceneId !== id));

  const updateScene = (id, field, value) =>
    onChange(scenes.map(s => s.sceneId === id ? { ...s, [field]: value } : s));

  return (
    <div className="space-y-3">
      {scenes.map((scene, idx) => (
        <div key={scene.sceneId} className="flex items-center gap-2">
          <div className="flex items-center gap-1 flex-shrink-0">
            <Grip className="w-4 h-4 text-gray-300" />
            <span className="text-base">{scene.icon}</span>
          </div>
          {/* Icon picker */}
          <div className="relative group">
            <button type="button" className="text-xs border border-gray-200 rounded px-2 py-1 hover:bg-gray-50">
              {scene.icon} <ChevronDown className="inline w-3 h-3" />
            </button>
            <div className="absolute z-10 top-7 left-0 bg-white border border-gray-200 rounded-lg p-2 shadow-lg hidden group-hover:grid grid-cols-4 gap-1 w-36">
              {SCENE_ICONS.map(ic => (
                <button key={ic} type="button" onClick={() => updateScene(scene.sceneId, 'icon', ic)}
                  className={`text-lg p-1 rounded hover:bg-gray-100 ${scene.icon === ic ? 'bg-indigo-100' : ''}`}>{ic}</button>
              ))}
            </div>
          </div>
          <Input value={scene.label} onChange={e => updateScene(scene.sceneId, 'label', e.target.value)}
            placeholder={`Scène ${idx + 1}`} className="flex-1 h-8 text-sm" />
          <button type="button" onClick={() => removeScene(scene.sceneId)}
            className="text-gray-300 hover:text-red-400 transition-colors flex-shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
      {scenes.length < 8 && (
        <button type="button" onClick={addScene}
          className="w-full border-2 border-dashed border-gray-200 rounded-lg py-2 text-sm text-gray-400 hover:border-indigo-300 hover:text-indigo-500 transition-colors flex items-center justify-center gap-2">
          <Plus className="w-4 h-4" /> Ajouter une scène ({scenes.length}/6)
        </button>
      )}
    </div>
  );
}

// ── Composant configurateur d'horaire ─────────────────────────────────────
function ScheduleConfigurator({ dateStart, dateEnd, schedule, onScheduleChange }) {
  const [templateKey, setTemplateKey] = useState('standard');
  const [plageCount, setPlageCount] = useState(5);

  const rebuild = (tKey, count) => {
    if (!dateStart || !dateEnd) return;
    const slots = generateSlots(new Date(dateStart), new Date(dateEnd), tKey, count);
    onScheduleChange(slots);
  };

  // Auto-rebuild quand dates changent
  useEffect(() => {
    if (dateStart && dateEnd && schedule.length === 0) rebuild(templateKey, plageCount);
  }, [dateStart, dateEnd]);

  const handleTemplateChange = (key) => {
    setTemplateKey(key);
    // Ajuster plageCount si non disponible dans ce template
    const tpl = HORAIRE_TEMPLATES[key];
    if (tpl && !tpl.byCount[plageCount]) {
      const available = Object.keys(tpl.byCount).map(Number).sort((a,b) => a-b);
      const newCount = available[Math.floor(available.length / 2)] || 4;
      setPlageCount(newCount);
      rebuild(key, newCount);
    } else {
      rebuild(key, plageCount);
    }
  };

  const handleCountChange = (n) => {
    setPlageCount(n);
    rebuild(templateKey, n);
  };

  const updatePlageLabel = (plageId, label) => {
    onScheduleChange(schedule.map(p => p.plageId === plageId ? { ...p, label } : p));
  };

  const tpl = HORAIRE_TEMPLATES[templateKey];
  const availableCounts = tpl ? Object.keys(tpl.byCount).map(Number).sort((a,b)=>a-b) : [3,4,5,6];

  if (!dateStart || !dateEnd) {
    return <p className="text-xs text-amber-600 italic">⚠️ Renseignez les dates de l'événement d'abord</p>;
  }

  return (
    <div className="space-y-4">
      {/* Template + nombre de plages */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs text-gray-500 mb-1 block">Template</Label>
          <div className="flex flex-col gap-1">
            {Object.entries(HORAIRE_TEMPLATES).map(([key, t]) => (
              <button key={key} type="button" onClick={() => handleTemplateChange(key)}
                className={`text-left px-3 py-1.5 rounded-lg text-xs border transition-all ${templateKey === key ? 'bg-indigo-50 border-indigo-400 text-indigo-700 font-medium' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                {t.name}
              </button>
            ))}
          </div>
        </div>
        <div>
          <Label className="text-xs text-gray-500 mb-1 block">Nombre de plages</Label>
          <div className="flex flex-wrap gap-1">
            {availableCounts.map(n => (
              <button key={n} type="button" onClick={() => handleCountChange(n)}
                className={`w-8 h-8 rounded-lg text-sm font-medium border transition-all ${plageCount === n ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-200 text-gray-600 hover:border-indigo-400'}`}>
                {n}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => rebuild(templateKey, plageCount)}
            className="mt-2 text-xs text-indigo-500 hover:text-indigo-700 flex items-center gap-1">
            ↺ Regénérer depuis les dates
          </button>
        </div>
      </div>

      {/* Timeline générée */}
      {schedule.length > 0 && (
        <div className="space-y-1">
          <Label className="text-xs text-gray-500">Plages générées (noms modifiables)</Label>
          <div className="relative pl-4 border-l-2 border-indigo-200 space-y-2">
            {schedule.map((plage, idx) => {
              const start = new Date(plage.timeStart);
              const end = new Date(plage.timeEnd);
              const durationMin = Math.round((end - start) / 60000);
              const h = Math.floor(durationMin / 60);
              const m = durationMin % 60;
              const durLabel = h > 0 ? `${h}h${m > 0 ? m : ''}` : `${m}min`;
              return (
                <div key={plage.plageId} className="flex items-center gap-2">
                  <div className="absolute -left-1.5 w-3 h-3 rounded-full bg-indigo-400 border-2 border-white" />
                  <div className="text-xs text-gray-400 w-24 flex-shrink-0 font-mono">
                    {fmtHHMM(start)} → {fmtHHMM(end)}
                  </div>
                  <Input value={plage.label} onChange={e => updatePlageLabel(plage.plageId, e.target.value)}
                    className="flex-1 h-7 text-xs" />
                  <span className="text-xs text-gray-400 w-12 text-right flex-shrink-0">{durLabel}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Page principale ─────────────────────────────────────────────────────────
export default function CreateEvent() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const editEventId     = searchParams.get('editEventId');
  const missionTemplateParam = searchParams.get('missionTemplate');   // ex: 'corporate_4a7'
  const isEditMode      = Boolean(editEventId);

  const [currentUser, setCurrentUser] = useState(null);
  const [checkpoints, setCheckpoints] = useState([]);
  const [checkpointSearch, setCheckpointSearch] = useState('');
  const [domains, setDomains] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState(false);
  const [createdEventId, setCreatedEventId] = useState(null);
  const [createdSessionId, setCreatedSessionId] = useState(null);
  const [errors, setErrors] = useState({});
  const [existingEvent, setExistingEvent] = useState(null);
  const [changelog, setChangelog] = useState([]);
  const [appliedMissionTemplate, setAppliedMissionTemplate] = useState(null); // template actif

  // Domaines / rôles / styles
  const [selectedDomains, setSelectedDomains] = useState([]);
  const [activeDomainTab, setActiveDomainTab] = useState(null);
  const [rolesByDomain, setRolesByDomain] = useState({});
  const [stylesByRole, setStylesByRole] = useState({});
  const [roleNameMap, setRoleNameMap] = useState({});  // systemId → nameFr

  // Scènes + horaire
  const [scenes, setScenes] = useState([
    { sceneId: 'sc-1', label: 'Scène principale', icon: '🎛' },
  ]);
  const [schedule, setSchedule] = useState([]);

  const [form, setForm] = useState({
    title: '', description: '', checkpointId: '',
    // _checkpointTimezone : fuseau du lieu sélectionné — non stocké en base,
    // utilisé uniquement pour interpréter les saisies datetime-local correctement.
    _checkpointTimezone: DEFAULT_TIMEZONE,
    dateStart: '', dateEnd: '', budget: '',
  });

  useEffect(() => { loadData(); }, []);

  // ── Pré-remplissage depuis le template de mission ──────────────────────
  // Déclenché une seule fois après chargement si missionTemplateParam est présent
  useEffect(() => {
    if (!missionTemplateParam || isEditMode || loading) return;
    const tpl = MISSION_TEMPLATES[missionTemplateParam];
    if (!tpl) return;

    // Champs texte / budget
    setForm(prev => ({
      ...prev,
      title:       prev.title || tpl.title,
      description: prev.description || tpl.description,
      budget:      prev.budget || tpl.budget,
    }));

    // Scènes
    setScenes(tpl.scenes);

    // Horaire : générer les plages si les dates sont déjà remplies, sinon sera recalculé par ScheduleConfigurator
    // On stocke les préférences pour que ScheduleConfigurator s'initialise sur le bon template
    // (ScheduleConfigurator lit son propre templateKey local — on lui passe via un data-attr ou on force via schedule vide)
    setSchedule([]);   // vide = ScheduleConfigurator utilisera son défaut, qu'on override via templateKey

    // Domaines + rôles : résolution dynamique après chargement des rôles
    const activateDomains = async () => {
      const domainKeys = tpl.domainsToActivate || [];
      const rebuiltByDomain = {};

      for (const dk of domainKeys) {
        try {
          const res = await base44.functions.invoke('getRolesForDomain', { domainKey: dk });
          const roles = res?.data?.roles || [];
          const keywords = (tpl.roleKeywords?.[dk] || []).map(k => k.toLowerCase());
          // Sélectionner les rôles dont le label/systemId matche un keyword
          const matched = roles
            .filter(r => {
              const label = (r.label || r.name || r.systemId || '').toLowerCase();
              return keywords.some(kw => label.includes(kw));
            })
            .map(r => r.systemId);
          if (matched.length > 0) rebuiltByDomain[dk] = matched;
        } catch (e) {
          console.warn(`[MissionTemplate] getRolesForDomain(${dk}) failed:`, e);
        }
      }

      setRolesByDomain(rebuiltByDomain);
      setSelectedDomains(domainKeys);
      if (domainKeys.length > 0) setActiveDomainTab(domainKeys[0]);
    };

    activateDomains();
    setAppliedMissionTemplate(tpl);
  }, [missionTemplateParam, isEditMode, loading]);

  // Construire roleNameMap à chaque changement de domaines sélectionnés
  useEffect(() => {
    if (!selectedDomains.length) return;
    let cancelled = false;
    const buildMap = async () => {
      const newMap = {};
      for (const dk of selectedDomains) {
        try {
          const res = await base44.functions.invoke('getRolesForDomain', { domainKey: dk });
          for (const r of (res?.data?.roles || [])) {
            if (r.systemId) newMap[r.systemId] = r.nameFr || r.label || r.systemId;
          }
        } catch { /* non-fatal */ }
      }
      if (!cancelled) setRoleNameMap(prev => ({ ...prev, ...newMap }));
    };
    buildMap();
    return () => { cancelled = true; };
  }, [selectedDomains.join(',')]);

  const loadData = async () => {
    try {
      // v2 — domaines chargés depuis l'entité Domain en DB via taxonomyCache
      const [user, cps, taxonomies] = await Promise.all([
        base44.auth.me(),
        base44.entities.Checkpoint.filter({}),
        getTaxonomies(),
      ]);
      setCurrentUser(user);
      setCheckpoints((cps || []).filter(cp => cp.active === true || cp.active === 'true'));

      // Normaliser au format { key, label, icon } attendu par le reste du composant
      const rawDomains = (taxonomies.domains || []).length > 0
        ? taxonomies.domains
        : FALLBACK_DOMAINS;
      const domainsNormalized = rawDomains.map(d => ({
        key:   d.key,
        label: d.labelFr || d.label || d.key,
        icon:  d.icon || '',
      }));
      setDomains(domainsNormalized);

      // domainsRes rétrocompatibilité pour le code de reconstruction edit-mode ci-dessous
      const domainsRes = { data: { domains: domainsNormalized } };

      // Mode édition : charger l'événement + reconstruire domaines/rôles
      if (editEventId) {
        const evList = await base44.entities.Event.filter({ id: editEventId });
        const ev = evList?.[0];
        if (ev && (ev.organizerId === user?.id || ev.organizerUserId === user?.id)) {
          setExistingEvent(ev);

          // Pré-remplir les champs texte/dates/budget
          setForm({
            title:        ev.title        || '',
            description:  ev.description  || '',
            checkpointId: ev.checkpointId || '',
            _checkpointTimezone: getCheckpointTimezone(
              checkpoints.find(cp => (cp.systemId || cp.id) === ev.checkpointId)
            ),
            dateStart: toCheckpointDatetimeInput(ev.dateStart, getCheckpointTimezone(
              checkpoints.find(cp => (cp.systemId || cp.id) === ev.checkpointId)
            )),
            dateEnd:   toCheckpointDatetimeInput(ev.dateEnd, getCheckpointTimezone(
              checkpoints.find(cp => (cp.systemId || cp.id) === ev.checkpointId)
            )),
            budget:    ev.budget != null ? String(ev.budget) : '',
          });

          // Scènes et horaire
          if (Array.isArray(ev.scenes)   && ev.scenes.length)   setScenes(ev.scenes);
          if (Array.isArray(ev.schedule) && ev.schedule.length) setSchedule(ev.schedule);

          // Reconstruire selectedDomains + rolesByDomain depuis rolesNeeded
          // On charge tous les rôles disponibles et on mappe chaque rôle à son domaine
          const rolesNeeded = Array.isArray(ev.rolesNeeded) ? ev.rolesNeeded : [];
          if (rolesNeeded.length > 0) {
            try {
              // Charger tous les rôles de tous les domaines disponibles
              const domainsData = domainsRes?.data?.domains || [];
              const domainKeys = domainsData.map(d => d.key || d.domainKey);

              const rolesPerDomain = {};
              // Appels SÉQUENTIELS — évite les cold starts Deno en parallèle qui causent des 502
              for (const dk of domainKeys) {
                try {
                  const res = await base44.functions.invoke('getRolesForDomain', { domainKey: dk });
                  rolesPerDomain[dk] = (res?.data?.roles || []).map(r => r.systemId);
                } catch {
                  rolesPerDomain[dk] = [];
                }
              }

              // Mapper chaque rôle recherché à son domaine
              const rebuiltByDomain = {};
              const rebuiltDomains = [];
              for (const roleId of rolesNeeded) {
                let found = false;
                for (const [dk, roleIds] of Object.entries(rolesPerDomain)) {
                  if (roleIds.includes(roleId)) {
                    if (!rebuiltByDomain[dk]) { rebuiltByDomain[dk] = []; rebuiltDomains.push(dk); }
                    rebuiltByDomain[dk].push(roleId);
                    found = true;
                    break;
                  }
                }
                // Rôle non trouvé dans aucun domaine → bucket fallback
                if (!found) {
                  if (!rebuiltByDomain['_other']) { rebuiltByDomain['_other'] = []; }
                  rebuiltByDomain['_other'].push(roleId);
                }
              }

              setRolesByDomain(rebuiltByDomain);
              setSelectedDomains(rebuiltDomains);
              if (rebuiltDomains.length > 0) setActiveDomainTab(rebuiltDomains[0]);
            } catch (err) {
              console.warn('Reconstruction rolesByDomain failed:', err);
              // Fallback basique — les rôles seront au moins dans allRolesNeeded
              setRolesByDomain({ _edit: rolesNeeded });
            }
          }

          setChangelog(Array.isArray(ev.changelog) ? ev.changelog : []);
        }
      }
    } catch (err) {
      console.error('loadData error:', err);
    } finally {
      setLoading(false);
    }
  };

  const toggleDomain = (key) => {
    setSelectedDomains(prev => {
      const next = prev.includes(key) ? prev.filter(d => d !== key) : [...prev, key];
      if (!next.includes(key)) setRolesByDomain(r => { const n = { ...r }; delete n[key]; return n; });
      if (next.length > 0 && !next.includes(activeDomainTab)) setActiveDomainTab(next[0]);
      if (next.length === 0) setActiveDomainTab(null);
      return next;
    });
    if (!selectedDomains.includes(key)) setActiveDomainTab(key);
  };

  const toggleRole = (domainKey, roleId) => {
    setRolesByDomain(prev => {
      const current = prev[domainKey] || [];
      const next = current.includes(roleId) ? current.filter(r => r !== roleId) : [...current, roleId];
      if (!next.includes(roleId)) setStylesByRole(s => { const n = { ...s }; delete n[roleId]; return n; });
      return { ...prev, [domainKey]: next };
    });
  };

  const toggleStyle = (roleId, styleId) => {
    setStylesByRole(prev => {
      const current = new Set(prev[roleId] || []);
      if (current.has(styleId)) current.delete(styleId); else current.add(styleId);
      return { ...prev, [roleId]: new Set(current) };
    });
  };

  const allRolesNeeded = Object.values(rolesByDomain).flat();
  const allStyles = [...new Set(Object.values(stylesByRole).flatMap(s => [...s]))];

  const validate = () => {
    const e = {};
    if (!form.title.trim() || form.title.trim().length < 3) e.title = 'Titre requis (min 3 caractères).';
    if (!form.dateStart) e.dateStart = 'Date de début requise.';
    if (!form.dateEnd) e.dateEnd = 'Date de fin requise.';
    if (form.dateStart && form.dateEnd && form.dateEnd <= form.dateStart) e.dateEnd = 'Doit être après le début.';
    if (allRolesNeeded.length === 0) e.rolesNeeded = 'Sélectionnez au moins un rôle recherché.';
    if (scenes.length === 0) e.scenes = 'Configurez au moins une scène.';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSubmitting(true);
    try {
      if (isEditMode && editEventId) {
        // ── MODE ÉDITION ──
        const res = await base44.functions.invoke('updateEvent', {
          eventId: editEventId,
          updates: {
            title:       form.title.trim(),
            description: form.description.trim() || null,
            dateStart:   checkpointDatetimeToUtc(form.dateStart, form._checkpointTimezone),
            dateEnd:     checkpointDatetimeToUtc(form.dateEnd,   form._checkpointTimezone),
            budget:      form.budget ? parseFloat(form.budget) : 0,
            rolesNeeded: allRolesNeeded,
            scenes,
            schedule,
          },
        });
        setChangelog(res?.data?.changelog || []);
        setCreatedEventId(editEventId);
        setCreated(true);
      } else {
        // ── MODE CRÉATION ──
      const event = await base44.entities.Event.create({
        title: form.title.trim(),
        description: form.description.trim() || null,
        checkpointId: form.checkpointId || null,
        // 6-H — adresse libre si pas de checkpoint sélectionné
        ...((!form.checkpointId && form.addressFree?.trim()) ? {
          addressData: { address: form.addressFree.trim() }
        } : {}),
        organizerId: currentUser?.id || null,
        dateStart: checkpointDatetimeToUtc(form.dateStart, form._checkpointTimezone),
        dateEnd:   checkpointDatetimeToUtc(form.dateEnd,   form._checkpointTimezone),
        budget: form.budget ? parseFloat(form.budget) : 0,
        rolesNeeded: allRolesNeeded,
        styles: allStyles,
        scenes,
        schedule,
        missionTemplate: appliedMissionTemplate?.missionTemplate || null,
        status: 'draft',
        escrowStatus: 'none',
        escrowAmount: 0,
        createdAt: new Date().toISOString(),
      });
      setCreatedEventId(event?.id || null);

      // Déclencher la progression de mission si cet événement est lié à un template
      if (appliedMissionTemplate?.missionTemplate) {
        try {
          await base44.functions.invoke('checkMissionProgress', {
            triggerType: 'event_created',
            missionTemplate: appliedMissionTemplate.missionTemplate,
          });
        } catch (missionErr) {
          console.warn('[CreateEvent] checkMissionProgress failed (non-bloquant):', missionErr?.message);
        }
      }

      let lobbySessionId = null;
      try {
        const lobbyRes = await base44.functions.invoke('openEventLobby', { eventId: event.id, scenes, schedule });
        lobbySessionId = lobbyRes?.data?.session?.id || null;
      } catch (lobbyErr) {
        console.warn('[CreateEvent] openEventLobby failed:', lobbyErr?.message);
      }
      setCreatedSessionId(lobbySessionId);
      setCreated(true);
      }
    } catch (err) {
      setErrors({ submit: err?.message || isEditMode ? 'Erreur lors de la modification.' : 'Erreur lors de la création.' });
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setCreated(false); setCreatedEventId(null); setCreatedSessionId(null);
    setForm({ title:'', description:'', checkpointId:'', _checkpointTimezone: DEFAULT_TIMEZONE, dateStart:'', dateEnd:'', budget:'' });
    setSelectedDomains([]); setRolesByDomain({}); setStylesByRole({});
    setScenes([{ sceneId: 'sc-1', label: 'Scène principale', icon: '🎛' }]);
    setSchedule([]); setErrors({});
  };

  if (loading) return <div className="flex items-center justify-center min-h-screen"><Loader2 className="w-8 h-8 animate-spin text-indigo-500" /></div>;

  if (created) {
    return (
      <div className="container mx-auto px-4 py-16 max-w-lg text-center">
        <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Événement créé !</h2>
        <div className="mb-4 p-3 bg-gray-50 rounded-xl text-left text-sm space-y-1">
          <p className="font-medium text-gray-700">Configuration</p>
          <p className="text-gray-500">🎭 {scenes.length} scène{scenes.length > 1 ? 's' : ''} : {scenes.map(s => `${s.icon} ${s.label}`).join(', ')}</p>
          <p className="text-gray-500">⏱ {schedule.length} plage{schedule.length > 1 ? 's' : ''} horaires</p>
          <p className="text-gray-500">👤 {allRolesNeeded.length} rôle{allRolesNeeded.length > 1 ? 's' : ''} recherché{allRolesNeeded.length > 1 ? 's' : ''}</p>
        </div>
        {createdSessionId ? (
          <div className="mb-6 p-4 bg-indigo-50 rounded-xl border border-indigo-200">
            <p className="text-indigo-700 font-semibold text-sm mb-1">🎯 Lobby ouvert — les talents peuvent postuler</p>
            <p className="text-indigo-600 text-xs">Confirmez les candidatures puis construisez votre lineup depuis le Lobby.</p>
          </div>
        ) : (
          <div className="mb-6 p-4 bg-yellow-50 rounded-xl border border-yellow-200">
            <p className="text-yellow-700 text-sm">Événement sauvegardé. Ouvrez le lobby depuis la page Événements.</p>
          </div>
        )}
        {/* Panneau paiement — visible si budget > 0 */}
        {createdEventId && (
          <PaymentOptionsPanel
            event={{ id: createdEventId, budget: parseFloat(form.budget) || 0, escrowStatus: 'none', dateStart: form.dateStart ? checkpointDatetimeToUtc(form.dateStart, form._checkpointTimezone) : null }}
            onEscrowSecured={() => {}}
          />
        )}

        <div className="flex gap-3 justify-center flex-wrap">
          {createdSessionId && createdEventId && (
            <Button onClick={() => navigate(createPageUrl('EventLobby') + `?eventId=${createdEventId}`)} className="bg-indigo-600 hover:bg-indigo-700">
              <ArrowRight className="w-4 h-4 mr-2" /> Gérer le lobby
            </Button>
          )}
          <Button variant="outline" onClick={() => navigate(createPageUrl('Events'))}>Mes événements</Button>
          <Button variant="outline" onClick={resetForm}>Créer un autre</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-1">{isEditMode ? "Modifier l'événement" : "Créer un événement"}</h1>
          {isEditMode && existingEvent && ['published', 'lobby'].includes(existingEvent.status) && (
            <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
              ⚠️ Cet événement est <strong>{existingEvent.status === 'lobby' ? 'en lobby' : 'publié'}</strong> — les talents confirmés seront notifiés de vos modifications.
            </div>
          )}
        <p className="text-gray-500">Configurez votre événement — les scènes et l'horaire définiront le plateau de lineup.</p>
      </div>

      <div className="space-y-6">

        {/* ── Bannière template mission ── */}
        {appliedMissionTemplate && (
          <div className="flex items-center gap-3 px-4 py-3 bg-indigo-50 border border-indigo-200 rounded-xl text-sm">
            <span className="text-lg">{appliedMissionTemplate.label.split(' ')[0]}</span>
            <div className="flex-1">
              <p className="font-semibold text-indigo-800">Template mission : {appliedMissionTemplate.label}</p>
              <p className="text-indigo-600 text-xs mt-0.5">Rôles, horaire et budget pré-remplis. Ajustez au besoin.</p>
            </div>
            <button
              onClick={() => { setAppliedMissionTemplate(null); }}
              className="text-indigo-400 hover:text-indigo-700 text-xs underline flex-shrink-0"
            >
              Effacer
            </button>
          </div>
        )}

        {/* ① Infos générales */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg"><Calendar className="w-5 h-5 text-indigo-500" />Informations générales</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Titre *</Label>
              <Input placeholder="ex: Micro Rave au Bar Le Ritz — Soirée Techno"
                value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
                className={`mt-1 ${errors.title ? 'border-red-400' : ''}`} />
              {errors.title && <p className="text-red-500 text-xs mt-1">{errors.title}</p>}
            </div>
            <div>
              <Label>Description</Label>
              <textarea className="w-full mt-1 p-3 border rounded-md text-sm" rows={3}
                placeholder="Décrivez l'ambiance, les attentes, le contexte…"
                value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Début *</Label>
                <Input type="datetime-local" value={form.dateStart}
                  onChange={e => setForm(p => ({ ...p, dateStart: e.target.value }))}
                  className={`mt-1 ${errors.dateStart ? 'border-red-400' : ''}`} />
                {errors.dateStart && <p className="text-red-500 text-xs mt-1">{errors.dateStart}</p>}
              </div>
              <div>
                <Label>Fin *</Label>
                <Input type="datetime-local" value={form.dateEnd}
                  onChange={e => setForm(p => ({ ...p, dateEnd: e.target.value }))}
                  className={`mt-1 ${errors.dateEnd ? 'border-red-400' : ''}`} />
                {errors.dateEnd && <p className="text-red-500 text-xs mt-1">{errors.dateEnd}</p>}
              </div>
            </div>
            <div>
              <Label>Budget total ($ CAD)</Label>
              <Input type="number" min="0" placeholder="ex: 500" value={form.budget}
                onChange={e => setForm(p => ({ ...p, budget: e.target.value }))} className="mt-1" />
            </div>
          </CardContent>
        </Card>

        {/* ② Lieu */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg"><MapPin className="w-5 h-5 text-indigo-500" />Lieu</CardTitle>
            <CardDescription>Sélectionnez un checkpoint existant</CardDescription>
          </CardHeader>
          <CardContent>
            <CheckpointPicker
              checkpoints={checkpoints}
              filteredCheckpoints={checkpoints.filter(cp => {
                if (!checkpointSearch.trim()) return true;
                const q = checkpointSearch.toLowerCase();
                return (cp.name || '').toLowerCase().includes(q)
                  || (cp.type || '').toLowerCase().includes(q)
                  || (cp.vibe || '').toLowerCase().includes(q)
                  || (cp.city || cp.ville || '').toLowerCase().includes(q)
                  || (cp.neighborhood || '').toLowerCase().includes(q);
              })}
              checkpointSearch={checkpointSearch}
              onSearchChange={setCheckpointSearch}
              selectedSystemId={form.checkpointId || ''}
              onPick={(cpId) => {
                const cp = checkpoints.find(c => (c.systemId || c.id) === cpId);
                const cpTz = cp ? getCheckpointTimezone(cp) : DEFAULT_TIMEZONE;
                setForm(p => ({ ...p, checkpointId: cpId, _checkpointTimezone: cpTz }));
              }}
              isCaptain={true}
              isLocked={false}
              title="Checkpoint"
              description="Recherche, carte ou liste — choisis le lieu de l'événement."
            />

            {/* 6-H — Adresse libre quand aucun checkpoint n'est sélectionné */}
            {!form.checkpointId && (
              <div className="mt-4 pt-4 border-t border-dashed border-gray-200">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  Adresse libre <span className="font-normal normal-case text-gray-400">(si le lieu n'est pas dans les checkpoints)</span>
                </p>
                <Input
                  placeholder="Ex : 1420 rue Saint-Denis, Montréal, QC"
                  value={form.addressFree || ''}
                  onChange={e => setForm(p => ({ ...p, addressFree: e.target.value }))}
                  className="text-sm"
                />
                <p className="text-xs text-gray-400 mt-1.5">
                  Ce lieu sera affiché sur le contrat et visible dans les résultats de recherche.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ③ Talents recherchés */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg"><Users className="w-5 h-5 text-indigo-500" />Talents recherchés *</CardTitle>
            <CardDescription>Domaine → Rôles → Styles — active le matchmaking</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {errors.rolesNeeded && <p className="text-red-500 text-xs">{errors.rolesNeeded}</p>}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">① Domaine(s)</p>
              <div className="flex flex-wrap gap-2">
                {domains.map(d => {
                  const isSel = selectedDomains.includes(d.key);
                  return (
                    <button key={d.key} type="button" onClick={() => toggleDomain(d.key)}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border-2 text-sm font-medium transition-all ${isSel ? 'border-indigo-500 bg-indigo-50 text-indigo-800' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                      <span>{d.icon}</span><span>{d.label}</span>
                      {isSel && <span className="ml-0.5 text-xs text-indigo-500">({(rolesByDomain[d.key] || []).length})</span>}
                    </button>
                  );
                })}
              </div>
            </div>
            {selectedDomains.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">② Rôles & ③ Styles</p>
                {selectedDomains.length > 1 && (
                  <div className="flex gap-1 mb-3 border-b border-gray-200">
                    {selectedDomains.map(key => {
                      const d = domains.find(d => d.key === key);
                      return (
                        <button key={key} type="button" onClick={() => setActiveDomainTab(key)}
                          className={`px-3 py-1.5 text-sm font-medium border-b-2 transition-colors -mb-px ${activeDomainTab === key ? 'border-indigo-500 text-indigo-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                          {d?.icon} {d?.label}
                        </button>
                      );
                    })}
                  </div>
                )}
                {selectedDomains.map(key => {
                  const isVisible = selectedDomains.length === 1 || activeDomainTab === key;
                  if (!isVisible) return null;
                  return (
                    <RolePicker key={key} domainKey={key}
                      selectedRoles={rolesByDomain[key] || []}
                      onToggleRole={(rid) => toggleRole(key, rid)}
                      selectedStylesByRole={stylesByRole}
                      onToggleStyle={toggleStyle} />
                  );
                })}
              </div>
            )}
            {allRolesNeeded.length > 0 && (
              <div className="pt-2 border-t border-gray-100">
                <p className="text-xs text-gray-400 mb-1.5">Récapitulatif</p>
                <div className="flex flex-wrap gap-1.5">
                  {allRolesNeeded.map(rid => <Badge key={rid} variant="secondary" className="text-xs">{roleNameMap[rid] || rid}</Badge>)}
                  {allStyles.length > 0 && <span className="text-xs text-gray-400 self-center">+ {allStyles.length} style{allStyles.length > 1 ? 's' : ''}</span>}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ④ Scènes */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Layers className="w-5 h-5 text-indigo-500" />
              Scènes & espaces *
            </CardTitle>
            <CardDescription>Nommez vos espaces physiques — ils deviendront les colonnes du plateau de lineup</CardDescription>
          </CardHeader>
          <CardContent>
            {errors.scenes && <p className="text-red-500 text-xs mb-2">{errors.scenes}</p>}
            <SceneConfigurator scenes={scenes} onChange={setScenes} />
          </CardContent>
        </Card>

        {/* ⑤ Horaire */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Clock className="w-5 h-5 text-indigo-500" />
              Horaire & plages
            </CardTitle>
            <CardDescription>Découpez la soirée en plages — elles deviendront les lignes du plateau de lineup</CardDescription>
          </CardHeader>
          <CardContent>
            <ScheduleConfigurator
              dateStart={form.dateStart}
              dateEnd={form.dateEnd}
              schedule={schedule}
              onScheduleChange={setSchedule}
            />
          </CardContent>
        </Card>

        {errors.submit && <p className="text-red-500 text-sm text-center">{errors.submit}</p>}

        <Button onClick={handleSubmit} disabled={submitting} className="w-full bg-indigo-600 hover:bg-indigo-700 py-6 text-base">
          {submitting
            ? <><Loader2 className="w-5 h-5 mr-2 animate-spin" />Création en cours…</>
            : <><DollarSign className="w-5 h-5 mr-2" />{isEditMode ? 'Enregistrer les modifications' : "Créer l'événement"}</>
          }
        </Button>
        <p className="text-center text-xs text-gray-400">
          Brouillon — le séquestre sera activé en W3. Les scènes et plages définissent le plateau de lineup.
        </p>
      </div>
    </div>
  );
}