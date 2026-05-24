/**
 * EventLobby.jsx — Interface de gestion du lobby événementiel.
 * LineupBoard et ProgrammeView sont dans components/event/ pour limiter la taille.
 *
 * ARCHITECTURE PRICING — voir components/event/LineupBoard.jsx pour les règles métier.
 */

import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import PaymentRequestPanel from '@/components/event/PaymentRequestPanel';
import ContractView from '@/components/event/ContractView';
import EscrowButton from '@/components/event/EscrowButton';
import ParticipantsList from '@/components/event/ParticipantsList';
import LineupBoard from '@/components/event/LineupBoard';
import ProgrammeView from '@/components/event/ProgrammeView';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '../utils';
import { getTaxonomies } from '../components/taxonomyCache';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Loader2, CheckCircle2, Clock, Circle, X, Check, Rocket,
  AlertCircle, AlertTriangle, LayoutGrid, FileText, List,
  ChevronRight, CreditCard, ScrollText
} from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

// ── Constantes ──────────────────────────────────────────────────────────────
const SLOT_STATUS_CONFIG = {
  open:      { label: 'Disponible', color: 'bg-gray-100 text-gray-600',    icon: Circle },
  pending:   { label: 'En attente', color: 'bg-yellow-100 text-yellow-700', icon: Clock },
  confirmed: { label: 'Confirmé',   color: 'bg-green-100 text-green-700',  icon: CheckCircle2 },
};

// ── Source de vérité du lobby — backend only ───────────────────────────────
async function fetchEventLobby(eventId) {
  if (!eventId) return { ok: false, code: 'NO_EVENT_ID' };
  try {
    const res = await base44.functions.invoke('getEventLobby', { eventId });
    const data = res?.data;
    if (!data?.ok) return { ok: false, code: data?.code || 'BACKEND_ERROR' };
    return data;
  } catch (err) {
    console.error('[fetchEventLobby]', err);
    return { ok: false, error: err.message };
  }
}

// ── Composant SlotCard ─────────────────────────────────────────────────────
function SlotCard({ slot, roleMap, styleMap, currentUserId, isOrganizer, onApply, onWithdraw, onConfirm, onUnconfirm, onReject, actionLoading, profileMap = {}, myActiveStyles = [], allParticipants = [], allSlots = [] }) {
  const navigate = useNavigate();
  const [selectedStyles, setSelectedStyles] = useState([]);
  const [roleStyles, setRoleStyles] = useState([]);
  const [roleStylesLoading, setRoleStylesLoading] = useState(false);
  const role = roleMap[slot.roleSystemId];

  const rawCandidates = Array.isArray(slot.candidates) ? [...slot.candidates] : [];
  const knownUserIds = new Set(rawCandidates.map(c => c.userId).filter(Boolean));

  if (slot.candidateUserId && !knownUserIds.has(slot.candidateUserId)) {
    rawCandidates.push({ userId: slot.candidateUserId, styleSystemIds: slot.candidateStyleSystemIds || [], status: slot.status === 'confirmed' ? 'confirmed' : 'pending', appliedAt: null, confirmedAt: slot.confirmedAt || null, placements: [] });
    knownUserIds.add(slot.candidateUserId);
  }

  const sameRoleSlots = (Array.isArray(allSlots) ? allSlots : []).filter(s => s?.roleSystemId === slot.roleSystemId);
  (Array.isArray(allParticipants) ? allParticipants : []).filter(p => {
    if (!p?.userId || knownUserIds.has(p.userId)) return false;
    if (p.slotId) return p.slotId === slot.slotId;
    if (p.roleSystemId === slot.roleSystemId && sameRoleSlots.length === 1) return true;
    return false;
  }).forEach(p => {
    rawCandidates.push({ userId: p.userId, styleSystemIds: Array.isArray(p.styleSystemIds) ? p.styleSystemIds : [], status: p.status === 'confirmed' ? 'confirmed' : 'pending', appliedAt: p.joinedAt || null, confirmedAt: p.confirmedAt || null, placements: [] });
    knownUserIds.add(p.userId);
  });

  const candidates = rawCandidates;
  const activeCandidates = candidates.filter(c => !['withdrawn', 'rejected'].includes(c.status));
  const confirmedCandidates = activeCandidates.filter(c => c.status === 'confirmed');
  const pendingCandidates = activeCandidates.filter(c => c.status === 'pending');
  const myCandidate = candidates.find(c => c.userId === currentUserId && !['withdrawn', 'rejected'].includes(c.status));
  const hasApplied = !!myCandidate;

  useEffect(() => {
    if (!slot.roleSystemId || isOrganizer || hasApplied) return;
    let cancelled = false;
    setRoleStylesLoading(true);
    base44.functions.invoke('getStylesForRole', { roleSystemId: slot.roleSystemId })
      .then(res => {
        if (cancelled) return;
        const fetched = res?.data?.styles || [];
        setRoleStyles(fetched);
        if (myActiveStyles.length > 0 && fetched.length > 0) {
          const compat = new Set(fetched.map(s => s.systemId));
          setSelectedStyles(myActiveStyles.filter(sid => compat.has(sid)));
        }
      })
      .catch(() => { if (!cancelled) setRoleStyles([]); })
      .finally(() => { if (!cancelled) setRoleStylesLoading(false); });
    return () => { cancelled = true; };
  }, [slot.roleSystemId, isOrganizer, hasApplied, myActiveStyles]);

  const availableStyles = (() => {
    if (roleStyles.length > 0) {
      const roleSet = new Set(roleStyles.map(s => s.systemId));
      const prefSet = new Set(myActiveStyles);
      return roleStyles.filter(s => prefSet.has(s.systemId) && roleSet.has(s.systemId));
    }
    return myActiveStyles.map(sid => styleMap[sid]).filter(Boolean);
  })();

  return (
    <Card className="border-gray-200 transition-all">
      <CardContent className="pt-4 pb-3 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <span className="font-semibold text-sm">{role?.nameFr || role?.displayName || slot.roleSystemId}</span>
          <div className="flex items-center gap-1.5">
            {confirmedCandidates.length > 0 && <Badge className="text-xs bg-green-100 text-green-700 border-green-200">✓ {confirmedCandidates.length} confirmé{confirmedCandidates.length > 1 ? 's' : ''}</Badge>}
            {pendingCandidates.length > 0 && <Badge className="text-xs bg-yellow-100 text-yellow-700 border-yellow-200">{pendingCandidates.length} en attente</Badge>}
            {activeCandidates.length === 0 && <Badge className="text-xs bg-gray-100 text-gray-500">{SLOT_STATUS_CONFIG.open.label}</Badge>}
          </div>
        </div>

        {activeCandidates.length > 0 && (
          <div className="space-y-2">
            {activeCandidates.map(cand => {
              const prof = profileMap[cand.userId];
              const safeSuffix = typeof cand.userId === 'string' ? cand.userId.slice(-4) : '????';
              const name = prof?.displayName || `Talent …${safeSuffix}`;
              const isMe = cand.userId === currentUserId;
              const isConfirmed = cand.status === 'confirmed';
              const isPlaced = (Array.isArray(cand.placements) ? cand.placements : []).length > 0;
              return (
                <div key={cand.userId} className={`flex items-center gap-2 p-2 rounded-lg ${isConfirmed ? 'bg-green-50 border border-green-200' : 'bg-gray-50'}`}>
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex-shrink-0 overflow-hidden flex items-center justify-center">
                    {prof?.avatarUrl ? <img src={prof.avatarUrl} alt={name} className="w-full h-full object-cover" /> : <span className="text-white text-xs font-bold">{name[0]?.toUpperCase()}</span>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{isMe ? `${name} (Vous)` : name}</p>
                    {cand.styleSystemIds?.length > 0 && <p className="text-xs text-gray-500 truncate">{cand.styleSystemIds.map(sid => styleMap[sid]?.displayName || sid).join(' · ')}</p>}
                  </div>
                  {isConfirmed && isPlaced && <Badge variant="outline" className="text-xs border-indigo-300 text-indigo-600 shrink-0">📌 Placé</Badge>}
                  {/* 6-F — Bouton voir profil : organisateur → lecture seule */}
                  {isOrganizer && (
                    <button
                      type="button"
                      onClick={() => navigate(`${createPageUrl('Profile')}?userId=${cand.userId}`)}
                      className="text-xs text-indigo-500 hover:text-indigo-700 underline shrink-0"
                      title="Voir le profil"
                    >
                      Profil
                    </button>
                  )}
                  {isOrganizer && !isConfirmed && (
                    <div className="flex gap-1 shrink-0">
                      <Button size="sm" onClick={() => onConfirm(slot.slotId, cand.userId)} disabled={actionLoading} className="h-7 px-2 bg-green-600 hover:bg-green-700 text-white text-xs"><Check className="w-3 h-3" /></Button>
                      <Button size="sm" variant="outline" onClick={() => onReject(slot.slotId, cand.userId)} disabled={actionLoading} className="h-7 px-2 border-red-300 text-red-600 hover:bg-red-50 text-xs"><X className="w-3 h-3" /></Button>
                    </div>
                  )}
                  {isOrganizer && isConfirmed && <Button size="sm" variant="outline" onClick={() => onUnconfirm(slot.slotId, cand.userId)} disabled={actionLoading} className="h-7 px-2 text-xs shrink-0">Annuler</Button>}
                  {!isOrganizer && isMe && cand.status === 'pending' && <Button size="sm" variant="outline" onClick={() => onWithdraw(slot.slotId)} disabled={actionLoading} className="h-7 px-2 text-xs border-red-300 text-red-600 hover:bg-red-50 shrink-0">Retirer</Button>}
                </div>
              );
            })}
          </div>
        )}

        {!isOrganizer && !hasApplied && (
          <div className="space-y-2 pt-1">
            {roleStylesLoading ? (
              <div className="flex items-center gap-2 text-xs text-gray-400"><Loader2 className="w-3 h-3 animate-spin" />Chargement styles…</div>
            ) : availableStyles.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {availableStyles.map(s => {
                  const sid = s.systemId || s.id;
                  const sel = selectedStyles.includes(sid);
                  return (
                    <button key={sid} type="button" onClick={() => setSelectedStyles(prev => sel ? prev.filter(x => x !== sid) : [...prev, sid])}
                      className={`text-xs px-2 py-0.5 rounded-full border transition-all ${sel ? 'bg-purple-600 text-white border-purple-600' : 'border-gray-300 text-gray-600 hover:border-purple-400'}`}>
                      {s.displayName || sid}
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-gray-400 italic">Aucun style compatible — vous pouvez quand même postuler.</p>
            )}
            <Button size="sm" onClick={() => onApply(slot.slotId, slot.roleSystemId, selectedStyles)} disabled={actionLoading} className="w-full bg-indigo-600 hover:bg-indigo-700">
              {actionLoading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
              Postuler
            </Button>
          </div>
        )}

        {!isOrganizer && hasApplied && myCandidate?.status === 'pending' && <p className="text-xs text-yellow-600 italic text-center pt-1">⏳ Candidature en attente de confirmation</p>}
        {!isOrganizer && hasApplied && myCandidate?.status === 'confirmed' && <p className="text-xs text-green-600 font-medium text-center pt-1">✓ Votre candidature est confirmée</p>}
      </CardContent>
    </Card>
  );
}

// ── Page principale ─────────────────────────────────────────────────────────
export default function EventLobby() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const eventId = searchParams.get('eventId');

  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const pollingPausedUntil = useRef(0);

  const [currentUser, setCurrentUser] = useState(null);
  const [event, setEvent] = useState(null);
  const [session, setSession] = useState(null);
  const [roleMap, setRoleMap] = useState({});
  const [styleMap, setStyleMap] = useState({});
  const [isOrganizer, setIsOrganizer] = useState(false);
  const [profileMap, setProfileMap] = useState({});
  const [myActiveStyles, setMyActiveStyles] = useState([]);
  const tabParam = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState(tabParam || 'slots');

  useEffect(() => { if (eventId) loadAll(); }, [eventId]);

  useEffect(() => {
    if (!eventId) return;
    const intervalId = setInterval(async () => {
      if (document.hidden) return;
      try {
        const res = await fetchEventLobby(eventId);
        if (!res?.ok) return;
        const s = res.session;
        if (s?.status === 'in_progress') {
          clearInterval(intervalId);
          // v — Appeler enterEventSession AVANT de naviguer vers Play.
          // Sans cet appel, SessionPresence n'est jamais créée pour les talents
          // qui n'ont pas ouvert Play.jsx à temps (ou organisateur qui gère depuis ici).
          // Rôle déduit : organisateur si ev.organizerId === currentUser?.id, sinon 'artist'
          // (le backend valide contre LineupPlacement et corrige si besoin).
          try {
            const myId = (await base44.auth.me().catch(() => null))?.id;
            if (myId && s.id) {
              const pos = await new Promise(resolve => {
                if (!navigator.geolocation) { resolve(null); return; }
                navigator.geolocation.getCurrentPosition(
                  p => resolve(p),
                  () => resolve(null),
                  { timeout: 4000, maximumAge: 60000, enableHighAccuracy: false }
                );
              });
              const payload = { sessionId: s.id, role: 'artist' };
              if (pos?.coords?.latitude) {
                payload.geoLat = pos.coords.latitude;
                payload.geoLng = pos.coords.longitude;
              }
              await base44.functions.invoke('enterEventSession', payload).catch(() => null);
              console.log(`[EventLobby] enterEventSession called before Play redirect — sessionId=${s.id}`);
            }
          } catch (checkinErr) {
            console.warn('[EventLobby] enterEventSession pre-redirect failed (non-fatal):', checkinErr?.message);
          }
          window.location.href = `${createPageUrl('Play')}?sessionId=${s.id}`;
        }
        if (s && s.status !== 'in_progress' && Date.now() > pollingPausedUntil.current) setSession(s);
      } catch { /* silent */ }
    }, 10000);
    return () => clearInterval(intervalId);
  }, [eventId, navigate]);

  const loadAll = async () => {
    try {
      const [user, events, tax] = await Promise.all([
        base44.auth.me(),
        base44.entities.Event.filter({ id: eventId }),
        getTaxonomies(),
      ]);
      setCurrentUser(user);
      const ev = events?.[0] || null;
      setEvent(ev);
      setRoleMap(tax.roleMap);
      setStyleMap(tax.styleMap);
      const organizer = ev?.organizerId === user?.id;
      setIsOrganizer(organizer);
      await refreshLobby();
      if (user) {
        const myProfiles = await base44.entities.TalentProfile.filter({ userId: user.id }).catch(() => []);
        const myTp = myProfiles?.[0] || null;
        if (myTp?.activeStyles?.length) setMyActiveStyles(myTp.activeStyles);
      }
    } catch (err) {
      console.error('[EventLobby] loadAll:', err);
    } finally {
      setLoading(false);
    }
  };

  const refreshLobby = async () => {
    const res = await fetchEventLobby(eventId);
    if (res?.ok) {
      const s = res.session;
      if (s?.status === 'in_progress') {
        // v — même logique que dans le polling : enterEventSession avant Play
        try {
          const myId = (await base44.auth.me().catch(() => null))?.id;
          if (myId && s.id) {
            const pos = await new Promise(resolve => {
              if (!navigator.geolocation) { resolve(null); return; }
              navigator.geolocation.getCurrentPosition(p => resolve(p), () => resolve(null), { timeout: 4000 });
            });
            const payload = { sessionId: s.id, role: 'artist' };
            if (pos?.coords?.latitude) { payload.geoLat = pos.coords.latitude; payload.geoLng = pos.coords.longitude; }
            await base44.functions.invoke('enterEventSession', payload).catch(() => null);
          }
        } catch { /* non-fatal */ }
        window.location.href = `${createPageUrl('Play')}?sessionId=${s.id}`; return;
      }
      setSession(s);
      const ids = [...new Set([
        ...(s?.slots || []).map(sl => sl.candidateUserId),
        ...(s?.slots || []).flatMap(sl => (sl.candidates || []).map(c => c.userId)),
        ...(s?.participants || []).map(p => p.userId),
        // Organisateur — pas dans les slots mais a un TalentProfile (créé à l'onboarding)
        event?.organizerId,
        event?.organizerUserId,
      ].filter(Boolean))];
      if (ids.length > 0) {
        const [profiles, pricingRows] = await Promise.all([
          base44.entities.TalentProfile.filter({ userId: { $in: ids } }).catch(() => []),
          base44.entities.TalentPricing.filter({ userId: { $in: ids } }).catch(() => []),
        ]);
        const pricingByUser = {};
        for (const row of (pricingRows || [])) {
          if (!row?.userId || !row?.roleSystemId) continue;
          if (!pricingByUser[row.userId]) pricingByUser[row.userId] = {};
          pricingByUser[row.userId][row.roleSystemId] = {
            hourlyRate: row.hourlyRate != null ? Number(row.hourlyRate) : null,
            fixedRate: row.fixedRate != null ? Number(row.fixedRate) : null,
          };
        }
        const pMap = {};
        profiles.forEach(p => { pMap[p.userId] = { ...p, pricingByRole: pricingByUser[p.userId] || {} }; });
        setProfileMap(prev => ({ ...prev, ...pMap }));
      }
    } else {
      // getEventLobby a retourné ok:false (erreur réseau, 500 transitoire, timeout).
      // Si une session est déjà chargée → la conserver intacte.
      // setSession(null) uniquement au tout premier chargement (session encore null).
      setSession(prev => prev ?? null);
    }
  };

  const withAction = (fn) => async (...args) => {
    setActionLoading(true);
    try {
      await fn(...args);
      await refreshLobby();
    } catch (err) {
      toast({ title: 'Erreur', description: err?.response?.data?.error || err?.response?.data?.message || err?.message || 'Une erreur est survenue.', variant: 'destructive' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleOpenLobby = withAction(async () => {
    const existing = await base44.entities.Session.filter({ eventId, sessionType: 'event' }).catch(() => []);
    const TERMINAL = ['completed', 'archived', 'aborted'];
    const active = (existing || []).filter(s => !TERMINAL.includes(s.status));
    if (active.length > 0) { toast({ title: 'Lobby déjà ouvert' }); return; }
    await base44.entities.Session.create({
      eventId, sessionType: 'event', status: 'lobby',
      hostUserId: (await base44.auth.me()).id,
      slots: (event?.rolesNeeded || []).map((roleSystemId, i) => ({
        slotId: `SL-${Date.now()}-${i}`, roleSystemId, status: 'open',
        candidateUserId: null, candidateStyleSystemIds: [], candidates: [], confirmedAt: null, confirmedBy: null,
      })),
      participants: [],
    });
    toast({ title: 'Lobby ouvert !' });
  });

  const handleApply     = withAction(async (slotId, roleSystemId, styleSystemIds) => { await base44.functions.invoke('applyToSlot', { sessionId: session.id, slotId, roleSystemId, styleSystemIds: styleSystemIds || [] }); toast({ title: 'Candidature envoyée !' }); });
  const handleWithdraw  = withAction(async (slotId) => { await base44.functions.invoke('withdrawFromSlot', { sessionId: session.id, slotId }); toast({ title: 'Candidature retirée' }); });
  const handleConfirm   = withAction(async (slotId, candidateUserId) => { await base44.functions.invoke('confirmSlot', { sessionId: session.id, slotId, candidateUserId }); toast({ title: '✓ Talent confirmé !' }); });
  const handleReject    = withAction(async (slotId, candidateUserId) => { await base44.functions.invoke('rejectSlotCandidate', { sessionId: session.id, slotId, candidateUserId }); toast({ title: 'Candidature rejetée' }); });
  const handleUnconfirm = withAction(async (slotId, candidateUserId) => { await base44.functions.invoke('unconfirmSlot', { sessionId: session.id, slotId, candidateUserId }); toast({ title: 'Confirmation annulée' }); });

  const applyReturnedSession = (returned) => {
    if (!returned?.slots) return false;
    setSession(prev => ({ ...prev, slots: returned.slots, scenes: returned.scenes?.length ? returned.scenes : prev.scenes, schedule: returned.schedule?.length ? returned.schedule : prev.schedule }));
    const newIds = [...new Set((returned.slots || []).flatMap(s => [s.candidateUserId, ...((s.candidates || []).map(c => c.userId))]).filter(Boolean))];
    if (newIds.length > 0) {
      base44.entities.TalentProfile.filter({ userId: { $in: newIds } })
        .then(profiles => { const pMap = {}; (profiles || []).forEach(p => { pMap[p.userId] = p; }); setProfileMap(prev => ({ ...prev, ...pMap })); })
        .catch(() => {});
    }
    return true;
  };

  // v11 — styleIds : styles sélectionnés par l'organisateur dans NegotiationPanelOrganizer
  const handleAssign = async (slotId, sceneId, plageId, assignedPrice, styleIds = []) => {
    setActionLoading(true);
    try {
      // Extraire le talentUserId du slotId composé "realSlotId:userId"
      const parts = slotId.includes(':') ? slotId.split(':') : [slotId, null];
      const realSlotId = parts[0];
      const talentUserId = parts[1] || null;

      // Utiliser proposePriceToTalent si un talentUserId est connu
      // Cela crée la PriceProposal, notifie le talent, et enregistre le cachet proposé
      if (talentUserId) {
        console.log('[EventLobby] handleAssign → proposePriceToTalent', {
          slotId, realSlotId, talentUserId, sceneId, plageId,
          offeredPrice: assignedPrice ?? 0, styleIds,
        });
        await base44.functions.invoke('proposePriceToTalent', {
          sessionId:    session.id,
          slotId:       realSlotId,
          talentUserId,
          sceneId,
          plageId,
          offeredPrice: assignedPrice ?? 0,
          styleSystemIds: Array.isArray(styleIds) && styleIds.length > 0 ? styleIds : undefined,
        });
        await refreshLobby();
        pollingPausedUntil.current = Date.now() + 15000;
        toast({ title: '📨 Proposition envoyée au talent !' });
      } else {
        // Fallback si pas de talentUserId (ne devrait pas arriver)
        const res = await base44.functions.invoke('assignLineupSlot', { sessionId: session.id, slotId, sceneId, plageId, assignedPrice });
        const applied = applyReturnedSession(res?.data?.session);
        if (!applied) await refreshLobby();
        pollingPausedUntil.current = Date.now() + 15000;
        toast({ title: '📌 Talent placé sur le plateau !' });
      }
    } catch (err) {
      const code = err?.response?.data?.code;
      const msg = code === 'HORAIRE_CONFLICT' ? 'Ce talent est déjà sur cette plage horaire.'
        : code === 'CANDIDATE_NOT_CONFIRMED' ? "Ce talent n'est pas encore confirmé."
        : code === 'SLOT_NOT_CONFIRMED' ? "Confirmez d'abord ce talent avant de le placer."
        : code === 'CONFLICT_SCHEDULE' ? (err?.response?.data?.error || 'Conflit de plage horaire avec un autre événement.')
        : err?.response?.data?.error || err?.message;
      toast({ title: 'Impossible de placer', description: msg, variant: 'destructive' });
    } finally { setActionLoading(false); }
  };

  const handleUnassign = async (slotId, targetUserId = null, sceneId = null, plageId = null) => {
    setActionLoading(true);
    try {
      const res = await base44.functions.invoke('assignLineupSlot', { sessionId: session.id, slotId, targetUserId, sceneId, plageId, action: 'unassign' });
      const applied = applyReturnedSession(res?.data?.session);
      if (!applied) await refreshLobby();
      pollingPausedUntil.current = Date.now() + 15000;
      toast({ title: 'Talent retiré du plateau' });
    } catch (err) {
      const code = err?.response?.data?.code;
      const msg = code === 'TARGET_USER_UNRESOLVED' ? "Impossible d'identifier le talent." : code === 'TARGET_USER_AMBIGUOUS' ? 'Cible ambiguë.' : code === 'PLACEMENT_NOT_FOUND' ? "Aucun placement trouvé." : err?.response?.data?.error || err?.message;
      toast({ title: 'Impossible de retirer', description: msg, variant: 'destructive' });
    } finally { setActionLoading(false); }
  };

  // ── Démarrer la session — avec capture escrow intégrée ──────────────────────
  // Le démarrage de session et la capture des fonds sont une seule action irréversible.
  // Si escrowStatus='secured' : capture Stripe déclenchée avant la transition session.
  // Si escrowStatus='released' : fonds déjà capturés, on passe directement.
  // Une modale de confirmation est affichée dans tous les cas (action irréversible).
  const [showStartConfirm, setShowStartConfirm] = useState(false);

  const handleStartSession = async () => {
    setShowStartConfirm(false);
    setActionLoading(true);
    try {
      // Si escrow encore en 'secured' → capturer maintenant, avant de démarrer
      if (event?.escrowStatus === 'secured') {
        try {
          await base44.functions.invoke('releaseEventEscrow', { eventId: event.id });
          setEvent(prev => prev ? { ...prev, escrowStatus: 'released' } : prev);
        } catch (escrowErr) {
          const msg = escrowErr?.response?.data?.error || escrowErr?.message || 'Erreur inconnue';
          toast({
            title: '🔒 Capture des fonds échouée',
            description: `Impossible de capturer les fonds avant de démarrer. ${msg}`,
            variant: 'destructive',
          });
          setActionLoading(false);
          return;
        }
      }
      // Transition session → in_progress
      await base44.functions.invoke('transitionSession', { sessionId: session.id, action: 'START_SESSION' });
      toast({ title: '🚀 Session démarrée !' });
      // v — enregistrer la présence de l'organisateur avant Play
      try {
        const pos = await new Promise(resolve => {
          if (!navigator.geolocation) { resolve(null); return; }
          navigator.geolocation.getCurrentPosition(p => resolve(p), () => resolve(null), { timeout: 4000 });
        });
        const payload = { sessionId: session.id, role: 'organizer' };
        if (pos?.coords?.latitude) { payload.geoLat = pos.coords.latitude; payload.geoLng = pos.coords.longitude; }
        await base44.functions.invoke('enterEventSession', payload).catch(() => null);
      } catch { /* non-fatal */ }
      window.location.href = `${createPageUrl('Play')}?sessionId=${session.id}`;
    } catch (err) {
      toast({ title: 'Erreur', description: err?.response?.data?.error || err?.message, variant: 'destructive' });
      setActionLoading(false);
    }
  };

  if (!eventId) return <div className="container mx-auto px-4 py-16 text-center text-gray-500">eventId manquant</div>;
  if (loading) return <div className="flex items-center justify-center min-h-screen"><Loader2 className="w-8 h-8 animate-spin text-indigo-500" /></div>;

  const slots = session?.slots || [];
  const participants = session?.participants || [];
  const confirmedCount = slots.filter(s => s.status === 'confirmed').length;
  const pendingCount = slots.filter(s => s.status === 'pending').length;
  const openCount = slots.filter(s => s.status === 'open').length;
  const placedCount = slots.flatMap(s => (s.candidates || []).flatMap(c => c.placements || [])).length;

  const TABS = [
    { id: 'slots',     label: 'Candidatures', icon: List,       badge: pendingCount > 0 ? pendingCount : null },
    { id: 'lineup',    label: 'Lineup Board', icon: LayoutGrid, badge: null, locked: !session || confirmedCount === 0 },
    { id: 'programme', label: 'Programme',    icon: FileText,   badge: placedCount > 0 ? placedCount : null },
    ...(isOrganizer ? [{ id: 'payment',  label: 'Paiement',  icon: CreditCard,  badge: null }] : []),
    ...(session && placedCount > 0 ? [{ id: 'contrat', label: 'Contrat', icon: ScrollText, badge: null }] : []),
  ];

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      {/* Notifications modifications */}
      {currentUser && event && (event.pendingNotifications || []).filter(n => n.userId === currentUser.id && !n.read).length > 0 && (
        <div className="mb-4 p-4 bg-amber-50 border border-amber-300 rounded-xl">
          <p className="text-sm font-semibold text-amber-800 mb-1">📣 L&apos;organisateur a modifié cet événement</p>
          {(event.pendingNotifications || []).filter(n => n.userId === currentUser.id && !n.read).map(n => (
            <div key={n.id} className="text-xs text-amber-700 mt-1">
              <span className="font-medium">{new Date(n.at).toLocaleDateString('fr-CA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
              {' — '}Champs modifiés : {n.changes?.join(', ')}
            </div>
          ))}
        </div>
      )}

      {/* Historique modifications */}
      {isOrganizer && event?.changelog?.length > 0 && (
        <details className="mb-4">
          <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600">📋 Historique des modifications ({event.changelog.length})</summary>
          <div className="mt-2 p-3 bg-gray-50 rounded-lg space-y-1">
            {event.changelog.map((entry, i) => (
              <div key={i} className="text-xs text-gray-600">
                <span className="text-gray-400">{new Date(entry.at).toLocaleDateString('fr-CA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                {' '}<span className="font-medium">{entry.label}</span>
                {entry.oldVal != null && <span className="text-gray-400">{' '}· {String(entry.oldVal).slice(0, 30)} → {String(entry.newVal).slice(0, 30)}</span>}
              </div>
            ))}
          </div>
        </details>
      )}

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{event?.title || 'Événement'}</h1>
        <div className="flex flex-wrap items-center gap-3 mt-1 text-sm text-gray-500">
          <span>{confirmedCount} confirmé(s)</span>
          <span>·</span>
          <span>{pendingCount} en attente</span>
          <span>·</span>
          <span>{openCount} ouvert(s)</span>
          {placedCount > 0 && <><span>·</span><span className="text-indigo-600 font-medium">{placedCount} placé(s) sur le plateau</span></>}
        </div>

        {/* Badges organisateur + statut escrow */}
        <div className="flex items-center gap-3 flex-wrap mt-2">
          {isOrganizer && <Badge className="bg-indigo-600 text-white text-xs">Organisateur</Badge>}
          {isOrganizer && event?.escrowStatus === 'none' && (event?.budget || 0) > 0 && (
            <EscrowButton event={event} onSecured={() => setEvent(prev => prev ? { ...prev, escrowStatus: 'secured' } : prev)} />
          )}
          {isOrganizer && event?.escrowStatus === 'securing' && <span className="text-xs text-yellow-600 font-medium">⏳ Dépôt en cours…</span>}
          {isOrganizer && event?.escrowStatus === 'secured' && <span className="text-xs text-green-600 font-medium">🔒 Budget sécurisé</span>}
          {isOrganizer && event?.escrowStatus === 'released' && <span className="text-xs text-blue-600 font-medium">✅ Budget libéré</span>}
        </div>
      </div>

      {/* Bandeau talents confirmés + démarrer */}
      {session && isOrganizer && confirmedCount > 0 && (() => {
        // Calcul des montants pour la modale de confirmation
        const depositAmt  = Number(event?.escrowAmount)  || 0;
        const balanceAmt  = Number(event?.balancePaid)    || 0;
        const totalAmt    = Math.round((depositAmt + balanceAmt) * 100) / 100;
        const needsCapture = event?.escrowStatus === 'secured';
        return (
          <>
            <div className="mb-6 p-4 bg-green-50 border-2 border-green-300 rounded-xl flex flex-col sm:flex-row items-center gap-4">
              <div className="flex-1">
                <p className="font-semibold text-green-900 flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                  {confirmedCount} talent{confirmedCount > 1 ? 's' : ''} confirmé{confirmedCount > 1 ? 's' : ''}
                  {pendingCount > 0 && <span className="text-sm font-normal text-yellow-700">{' '}· {pendingCount} en attente</span>}
                </p>
                <p className="text-sm text-green-700 mt-0.5">
                  {placedCount >= confirmedCount ? '✓ Tous les talents confirmés sont placés sur le plateau.' : `${confirmedCount - placedCount} talent(s) restent à placer dans le Lineup Board.`}
                </p>
              </div>
              <Button
                onClick={() => setShowStartConfirm(true)}
                disabled={actionLoading}
                className="bg-green-600 hover:bg-green-700 text-white shrink-0 px-6"
                size="lg"
              >
                {actionLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Rocket className="w-4 h-4 mr-2" />}
                Démarrer la session
              </Button>
            </div>

            {/* Modale de confirmation — action irréversible */}
            {showStartConfirm && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
                <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
                  <div className="flex items-start gap-3 mb-4">
                    <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <AlertTriangle className="w-5 h-5 text-amber-600" />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-gray-900">⚠️ Action irréversible</h2>
                      <p className="text-sm text-gray-500 mt-0.5">Veuillez confirmer avant de continuer.</p>
                    </div>
                  </div>

                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-5 space-y-2 text-sm text-amber-900">
                    <p className="font-medium">En démarrant la session :</p>
                    <ul className="space-y-2 mt-2">
                      {totalAmt > 0 ? (
                        <li className="flex items-start gap-2">
                          <span className="mt-0.5 text-amber-500">•</span>
                          <span>
                            Le dépôt de <strong>{depositAmt.toFixed(2)} $</strong>{balanceAmt > 0 && <> et les fonds de <strong>{balanceAmt.toFixed(2)} $</strong></>}, valeur de{' '}
                            <strong>{totalAmt.toFixed(2)} $</strong>, seront capturés immédiatement sur la carte du payeur.
                            Les soldes seront transférés aux talents après l&apos;événement selon leur présence.
                          </span>
                        </li>
                      ) : (
                        <li className="flex items-start gap-2">
                          <span className="mt-0.5 text-amber-500">•</span>
                          <span>La session sera démarrée. Aucun fonds n&apos;est actuellement en séquestre.</span>
                        </li>
                      )}
                      <li className="flex items-start gap-2">
                        <span className="mt-0.5 text-amber-500">•</span>
                        <span>Cette action <strong>ne peut pas être annulée</strong>.</span>
                      </li>
                    </ul>
                  </div>

                  <div className="flex gap-3">
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => setShowStartConfirm(false)}
                      disabled={actionLoading}
                    >
                      Annuler
                    </Button>
                    <Button
                      className="flex-1 bg-green-600 hover:bg-green-700 text-white font-semibold"
                      onClick={handleStartSession}
                      disabled={actionLoading}
                    >
                      {actionLoading
                        ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />
                          {needsCapture ? 'Capture en cours…' : 'Démarrage…'}</>
                        : <><Rocket className="w-4 h-4 mr-2" />Confirmer et démarrer</>
                      }
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </>
        );
      })()}

      {!session && isOrganizer && (
        <Card className="mb-6">
          <CardContent className="pt-6 text-center">
            <p className="text-gray-500 mb-4">Le lobby n&apos;est pas encore ouvert.</p>
            <Button onClick={handleOpenLobby} disabled={actionLoading} className="bg-indigo-600 hover:bg-indigo-700">
              {actionLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Ouvrir le lobby
            </Button>
          </CardContent>
        </Card>
      )}

      {!session && !isOrganizer && (
        <Card className="mb-6"><CardContent className="pt-6 text-center text-gray-500">Le lobby n&apos;est pas encore ouvert par l&apos;organisateur.</CardContent></Card>
      )}

      {session && (
        <>
          {/* Tabs */}
          <div className="flex gap-1 mb-6 border-b border-gray-200">
            {TABS.map(tab => {
              const Icon = tab.icon;
              return (
                <button key={tab.id} type="button" disabled={tab.locked} onClick={() => !tab.locked && setActiveTab(tab.id)}
                  className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${activeTab === tab.id ? 'border-indigo-500 text-indigo-700' : 'border-transparent text-gray-500 hover:text-gray-700'} ${tab.locked ? 'opacity-40 cursor-not-allowed' : ''}`}>
                  <Icon className="w-4 h-4" />
                  {tab.label}
                  {tab.badge != null && <span className="ml-0.5 bg-amber-100 text-amber-700 text-xs rounded-full px-1.5 py-0.5 font-semibold">{tab.badge}</span>}
                  {tab.locked && <span className="text-[10px] text-gray-300 ml-1">🔒</span>}
                </button>
              );
            })}
          </div>

          {activeTab === 'slots' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-3">
                <h2 className="font-semibold text-gray-700 text-sm uppercase tracking-wide mb-2">Slots disponibles</h2>
                {slots.length === 0 && <p className="text-gray-400 text-sm">Aucun slot configuré.</p>}
                {slots.map(slot => (
                  <SlotCard key={slot.slotId} slot={slot} roleMap={roleMap} styleMap={styleMap} currentUserId={currentUser?.id} isOrganizer={isOrganizer}
                    onApply={handleApply} onWithdraw={handleWithdraw} onConfirm={handleConfirm} onUnconfirm={handleUnconfirm} onReject={handleReject}
                    actionLoading={actionLoading} profileMap={profileMap} myActiveStyles={myActiveStyles} allParticipants={participants} allSlots={slots} />
                ))}
                {confirmedCount > 0 && (
                  <button type="button" onClick={() => setActiveTab('lineup')}
                    className="w-full mt-2 py-3 rounded-xl bg-indigo-50 border-2 border-dashed border-indigo-200 text-indigo-600 text-sm font-medium hover:bg-indigo-100 transition-colors flex items-center justify-center gap-2">
                    <LayoutGrid className="w-4 h-4" />
                    Construire le Lineup Board ({confirmedCount} confirmé{confirmedCount > 1 ? 's' : ''})
                    <ChevronRight className="w-4 h-4" />
                  </button>
                )}
              </div>
              <div className="space-y-3">
                <h2 className="font-semibold text-gray-700 text-sm uppercase tracking-wide mb-2">Participants ({participants.length})</h2>
                <ParticipantsList participants={participants} slots={slots} roleMap={roleMap} profileMap={profileMap} currentUserId={currentUser?.id} />
              </div>
            </div>
          )}

          {activeTab === 'lineup' && (
            <LineupBoard session={session} roleMap={roleMap} styleMap={styleMap} profileMap={profileMap} currentUserId={currentUser?.id}
              isOrganizer={isOrganizer} onAssign={handleAssign} onUnassign={handleUnassign} actionLoading={actionLoading}
              refreshLobby={refreshLobby} toast={toast} setActionLoading={setActionLoading} />
          )}

          {activeTab === 'programme' && (
            <ProgrammeView session={session} roleMap={roleMap} styleMap={styleMap} profileMap={profileMap} currentUserId={currentUser?.id} isOrganizer={isOrganizer} />
          )}

          {activeTab === 'payment' && isOrganizer && (() => {
            // Budget canonique — retourné directement par getEventLobby.canonicalBudget
            // Calculé backend depuis moodFilterSnapshot.lineupPlacements[isPlaced=true].assignedPrice
            // = prix contractuels finaux figés (même source que generatePayoutSplits).
            // Fallback : event.budget DB si snapshot vide (assignation directe).
            const sessionBudget = Number(session?.canonicalBudget) || Number(event?.budget) || 0;

            return (
              <PaymentRequestPanel
                eventId={eventId}
                eventBudget={sessionBudget}
                isOrganizer={isOrganizer}
                event={event}
              />
            );
          })()}

          {activeTab === 'contrat' && session && placedCount > 0 && (
            <ContractView
              session={session}
              event={event}
              roleMap={roleMap}
              styleMap={styleMap}
              profileMap={profileMap}
              currentUserId={currentUser?.id}
              isOrganizer={isOrganizer}
            />
          )}
        </>
      )}
    </div>
  );
}