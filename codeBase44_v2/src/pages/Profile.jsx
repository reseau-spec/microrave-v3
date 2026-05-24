import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '../utils';
import { getTaxonomies } from '../components/taxonomyCache';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, User, Star, Trophy, DollarSign, Award, Calendar, ArrowRight, Zap, Music2, MapPin, Clock, TrendingUp, Shield, Hash, Copy, Share2, Gift, CreditCard, AlertTriangle, ExternalLink, Lock, Check, XCircle, RefreshCw } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { Progress } from '@/components/ui/progress';
import SOTSRadar from '../components/profile/SOTSRadar';
import CheckpointProfile from '../components/profile/CheckpointProfile';
import MediaUploader from '../components/media/MediaUploader';

function normalizeId(v) {
  if (!v) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  if (typeof v === 'object') return String(v.systemId || v.id || v._id || v.value || '');
  return '';
}

function asArray(x) {
  return Array.isArray(x) ? x : (x ? [x] : []);
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Fallback durable:
 * - Si un vote n'a pas sessionRoleSystemId / sessionStyleSystemIds,
 *   on va lire la Session (vote.sessionId)
 * - on prend le participant dont userId === targetUserId (celui qui reçoit les votes)
 * - et on injecte sessionRoleSystemId / sessionStyleSystemIds / sessionCheckpointSystemId
 */
async function enrichVotesWithSessions(base44, votes, targetUserId) {
  const arr = Array.isArray(votes) ? votes : [];
  const targetId = normalizeId(targetUserId);

  // votes qui ont besoin d'enrichissement
  const need = arr.filter(v => {
    const hasRole = !!normalizeId(v?.sessionRoleSystemId ?? v?.roleSystemId);
    const hasStyles = asArray(v?.sessionStyleSystemIds ?? v?.styleSystemIds).length > 0;
    const sid = normalizeId(v?.sessionId);
    return sid && (!hasRole || !hasStyles);
  });

  if (need.length === 0) return arr;

  const sessionIds = Array.from(new Set(need.map(v => normalizeId(v.sessionId)).filter(Boolean)));
  if (sessionIds.length === 0) return arr;

  // Charger les sessions par lots (sécuritaire)
  const sessions = [];
  const batches = chunk(sessionIds, 25);

  for (const ids of batches) {
    try {
      const found = await base44.entities.Session.filter({ id: { $in: ids } });
      if (Array.isArray(found) && found.length) sessions.push(...found);
    } catch (e) {
      // fallback 1 par 1 si $in n'est pas supporté
      for (const oneId of ids) {
        try {
          const foundOne = await base44.entities.Session.filter({ id: oneId });
          if (Array.isArray(foundOne) && foundOne.length) sessions.push(foundOne[0]);
        } catch (_) {}
      }
    }
  }

  const sessionMap = new Map(sessions.map(s => [normalizeId(s?.id), s]));

  const enriched = arr.map(v => {
    const sid = normalizeId(v?.sessionId);
    if (!sid) return v;

    const hasRole = !!normalizeId(v?.sessionRoleSystemId ?? v?.roleSystemId);
    const hasStyles = asArray(v?.sessionStyleSystemIds ?? v?.styleSystemIds).length > 0;
    if (hasRole && hasStyles) return v; // déjà ok

    const sess = sessionMap.get(sid);
    if (!sess) return v;

    const parts = asArray(sess?.participants);
    const me = parts.find(p => normalizeId(p?.userId) === targetId);
    if (!me) return v;

    const role = normalizeId(me?.roleSystemId ?? me?.sessionRoleSystemId);
    const styles = asArray(me?.styleSystemIds ?? me?.sessionStyleSystemIds).map(normalizeId).filter(Boolean);
    const checkpoint = normalizeId(sess?.checkpointSystemId ?? me?.checkpointSystemId);

    return {
      ...v,
      sessionRoleSystemId: normalizeId(v?.sessionRoleSystemId) || role || undefined,
      sessionStyleSystemIds: asArray(v?.sessionStyleSystemIds).length ? v.sessionStyleSystemIds : (styles.length ? styles : undefined),
      sessionCheckpointSystemId: normalizeId(v?.sessionCheckpointSystemId) || checkpoint || undefined,
    };
  });

  return enriched;
}

export default function Profile() {
  const [searchParams] = useSearchParams();
  const profileType = searchParams.get('type') || 'talent'; // default: talent
  const profileId = searchParams.get('id');

  // Route checkpoint directly to CheckpointProfile
  if (profileType === 'checkpoint') {
    return <CheckpointProfileWrapper checkpointId={profileId} />;
  }

  return <TalentProfile profileUserId={profileId} />;
}

function CheckpointProfileWrapper({ checkpointId }) {
  const [currentUser, setCurrentUser] = useState(null);
  useEffect(() => {
    base44.auth.me().then(setCurrentUser).catch(() => {});
  }, []);
  return <CheckpointProfile checkpointId={checkpointId} currentUser={currentUser} />;
}

function TalentProfile({ profileUserId }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const copyReferralLink = async (code) => {
    const link = `${window.location.origin}?ref=${code}`;
    try {
      await navigator.clipboard.writeText(link);
      toast({ title: '✓ Lien copié', description: link });
    } catch {
      toast({ title: '✓ Lien copié' });
    }
  };

  // Cloudinary — credentials publics (preset unsigned, safe côté client)
  const CLOUDINARY_CLOUD_NAME = 'dnp8eionl';
  const CLOUDINARY_UPLOAD_PRESET = 'microrave_unsigned';

  const [currentUser, setCurrentUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [isOwnProfile, setIsOwnProfile] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [applications, setApplications] = useState([]);
  const [applicationsLoading, setApplicationsLoading] = useState(false);
  const [pendingPayments, setPendingPayments] = useState([]);
  const [pendingLoading, setPendingLoading] = useState(false);
  const [pendingProposals, setPendingProposals] = useState([]);
  const [proposalResponding, setProposalResponding] = useState(null); // proposalId en cours
  const [proposalCounterState, setProposalCounterState] = useState({}); // { [proposalId]: { price, note, show } }

  // Labels taxonomies
  const [styleLabels, setStyleLabels] = useState({});
  const [roleLabels, setRoleLabels] = useState({});
  const [talentPricing, setTalentPricing] = useState({});
  const [checkpointLabels, setCheckpointLabels] = useState({});

  // Filtres SOTS
  const [activeFilters, setActiveFilters] = useState([]);
  const [isEventOrganizer, setIsEventOrganizer] = useState(false);
  const [allUserVotes, setAllUserVotes] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);

  useEffect(() => {
    loadProfile();
  }, [profileUserId]);

  const toggleFilter = (id) => {
    const sid = normalizeId(id);
    if (!sid) return;
    setActiveFilters(prev =>
      prev.includes(sid) ? prev.filter(x => x !== sid) : [...prev, sid]
    );
  };

  const loadProfile = async () => {
    try {
      const user = await base44.auth.me();
      setCurrentUser(user);

      const targetUserId = profileUserId || user.id;
      setIsOwnProfile(targetUserId === user.id);

      const [profiles, tax, votes, pricingRows] = await Promise.all([
        base44.entities.TalentProfile.filter({ userId: targetUserId }),
        getTaxonomies(),
        base44.entities.SOTSLog.filter({ targetType: 'user', targetId: targetUserId }),
        base44.entities.TalentPricing.filter({ userId: targetUserId }).catch(() => []),
      ]);
      // Build pricingByRole map directly from TalentPricing rows
      const pricingByRole = {};
      for (const row of (pricingRows || [])) {
        if (row.roleSystemId && (row.hourlyRate || row.fixedRate)) {
          pricingByRole[row.roleSystemId] = {
            hourlyRate: row.hourlyRate || null,
            fixedRate: row.fixedRate || null,
            currency: row.currency || 'CAD',
            notes: row.notes || null,
          };
        }
      }
      setTalentPricing(pricingByRole);

      const { roles, styles, checkpoints } = tax;
      
      if (profiles.length > 0) {
        setProfile(profiles[0]);
      }

      setStyleLabels(styles.reduce((acc, s) => ({ ...acc, [s.systemId]: s.displayName }), {}));
      setRoleLabels(roles.reduce((acc, r) => ({ ...acc, [r.systemId]: r.nameFr }), {}));
      setCheckpointLabels(checkpoints.reduce((acc, c) => ({ ...acc, [c.systemId]: c.name }), {}));
      const enrichedVotes = await enrichVotesWithSessions(base44, votes || [], targetUserId);
      setAllUserVotes(enrichedVotes);

      // Load event applications if own profile
      if (targetUserId === user.id) {
        setApplicationsLoading(true);
        try {
          const eventSessions = await base44.entities.Session.filter({ sessionType: 'event' }).catch(() => []);
          const matched = [];
          const eventIdsNeeded = new Set();
          for (const sess of (eventSessions || [])) {
            const slots = Array.isArray(sess.slots) ? sess.slots : [];
            // Check candidates[] (new model) + candidateUserId (legacy)
            const mySlots = slots.filter(s => {
              const inCandidates = Array.isArray(s.candidates) && s.candidates.some(c => c.userId === user.id && !['withdrawn','rejected'].includes(c.status));
              const isLegacy = s.candidateUserId === user.id && ['pending','confirmed'].includes(s.status);
              return inCandidates || isLegacy;
            });
            if (mySlots.length > 0) {
              if (sess.eventId) eventIdsNeeded.add(sess.eventId);
              mySlots.forEach(s => matched.push({ ...s, eventId: sess.eventId, _sessId: sess.id }));
            }
          }
          // Batch fetch all events in one query instead of N+1
          if (eventIdsNeeded.size > 0) {
            const evs = await base44.entities.Event.filter({ id: { $in: [...eventIdsNeeded] } }).catch(() => []);
            const evMap = Object.fromEntries((evs || []).map(e => [e.id, e.title]));
            matched.forEach(s => { s.eventTitle = evMap[s.eventId] || 'Événement'; });
          }
          setApplications(matched);
        } catch (e) {
          console.warn('applications load failed:', e);
        } finally {
          setApplicationsLoading(false);
        }
      }

      // Charger les demandes de paiement en attente (payeur = currentUser)
      if (targetUserId === user.id) {
        setPendingLoading(true);
        try {
          const [paymentRows, proposalRows] = await Promise.all([
            base44.entities.EventPaymentRequest.filter({ payerUserId: user.id }).catch(() => []),
            base44.entities.PriceProposal.filter({ talentUserId: user.id, status: 'pending_talent' }).catch(() => []),
          ]);

          const active = (paymentRows || []).filter(r => ['sent', 'viewed'].includes(r.requestStatus));
          const eventIds = [...new Set([
            ...active.map(r => r.eventId),
            ...(proposalRows || []).map(p => p.eventId),
          ].filter(Boolean))];
          let evTitles = {};
          if (eventIds.length > 0) {
            const evs = await base44.entities.Event.filter({ id: { $in: eventIds } }).catch(() => []);
            evTitles = Object.fromEntries((evs || []).map(e => [e.id, { title: e.title, dateStart: e.dateStart }]));
          }
          setPendingPayments(active.map(r => ({
            ...r,
            _eventTitle: evTitles[r.eventId]?.title || 'Événement',
            _eventDate: evTitles[r.eventId]?.dateStart || null,
          })));
          setPendingProposals((proposalRows || []).map(p => ({
            ...p,
            _eventTitle: evTitles[p.eventId]?.title || 'Événement',
            _eventDate: evTitles[p.eventId]?.dateStart || null,
          })));
        } catch (e) {
          console.warn('pendingPayments load failed:', e);
        } finally {
          setPendingLoading(false);
        }
      }

      setSessionsLoading(true);
      try {
        // Charger les sessions où le user est participant — directement sans function invoke
        const allSessions = await base44.entities.Session.filter({}).catch(() => []);
        const cpMap = {};
        for (const cp of checkpoints) cpMap[cp.systemId] = cp;

        const userSessions = (allSessions || []).filter(s => {
          // Participant dans la session
          const parts = Array.isArray(s.participants) ? s.participants : [];
          const isParticipant = parts.some(p => {
            const uid = typeof p?.userId === 'string' ? p.userId : String(p?.userId?.id || p?.userId || '');
            return uid === targetUserId;
          });
          // Ou hôte/organisateur
          const isHost = s.hostUserId === targetUserId || s.organizerId === targetUserId;
          return isParticipant || isHost;
        });

        const mappedSessions = userSessions.map(s => ({
          ...s,
          _checkpointName: cpMap[s.checkpointSystemId]?.name || 'Lieu inconnu',
          _myParticipant: (s.participants || []).find(p => {
            const uid = typeof p?.userId === 'string' ? p.userId : String(p?.userId?.id || p?.userId || '');
            return uid === targetUserId;
          })
        }));
        setSessions(mappedSessions);
        const hasOrganizedEvents = mappedSessions.some(
          s => s.sessionType === 'event' && (s.hostUserId === targetUserId || s.organizerId === targetUserId)
        );
        setIsEventOrganizer(hasOrganizedEvents);
      } catch (e) {
        console.warn('sessions load failed:', e);
      } finally {
        setSessionsLoading(false);
      }
    } catch (error) {
      console.error('Load profile error:', error);
    } finally {
      setLoading(false);
    }
  };

  const globalVotes = useMemo(() => {
    return Array.isArray(allUserVotes) ? allUserVotes : [];
  }, [allUserVotes]);

  const filteredVotes = useMemo(() => {
    if (activeFilters.length === 0) return globalVotes;

    return globalVotes.filter(vote => {
      // ZIP58: Priorité TARGET (roleSystemId/styleSystemIds), fallback legacy
      const roleId = normalizeId(vote?.roleSystemId ?? vote?.sessionRoleSystemId);
      const styleIdsRaw = vote?.styleSystemIds ?? vote?.sessionStyleSystemIds;
      const checkpointSystemId = normalizeId(vote?.checkpointSystemId ?? vote?.sessionCheckpointSystemId);
      
      const styleIds = asArray(styleIdsRaw).map(normalizeId).filter(Boolean);
      
      // Construire le set de tags du TARGET
      const targetTagSet = new Set([roleId, ...styleIds, checkpointSystemId].filter(Boolean));
      
      // Fallback sessionTags si aucun tag TARGET trouvé
      if (targetTagSet.size === 0) {
        const sessionTags = asArray(vote?.sessionTags).map(normalizeId).filter(Boolean);
        sessionTags.forEach(t => targetTagSet.add(t));
      }

      // Match si au moins un activeFilter est dans targetTagSet
      return activeFilters.some(filterId => targetTagSet.has(filterId));
    });
  }, [activeFilters, globalVotes]);

  const calculateAverageSots = (votes) => {
    const arr = Array.isArray(votes) ? votes : [];
    const n = arr.length;

    if (n === 0) return null;

    const dimensions = ['funWork', 'toxicityAvoidance', 'fairnessResourcefulness', 'attitudePositivity', 'communication'];
    const totals = {};
    const counts = {};

    dimensions.forEach(dim => {
      totals[dim] = 0;
      counts[dim] = 0;
    });

    arr.forEach(log => {
      dimensions.forEach(dim => {
        if (log[dim] !== undefined && log[dim] !== null) {
          totals[dim] += log[dim];
          counts[dim]++;
        }
      });
    });

    const averages = {};
    dimensions.forEach(dim => {
      averages[dim] = counts[dim] > 0 ? totals[dim] / counts[dim] : 0;
    });

    const globalScore = dimensions.reduce((sum, dim) => sum + averages[dim], 0) / dimensions.length;

    const radarData = [
      { dimension: 'Plaisir', value: averages.funWork },
      { dimension: 'Non-toxicité', value: averages.toxicityAvoidance },
      { dimension: 'Équité', value: averages.fairnessResourcefulness },
      { dimension: 'Attitude', value: averages.attitudePositivity },
      { dimension: 'Communication', value: averages.communication }
    ];

    return {
      globalScore: Math.round(globalScore * 100) / 100,
      totalVotes: n,
      radarData,
      averages
    };
  };

  const sotsDisplay = useMemo(() => calculateAverageSots(filteredVotes), [filteredVotes]);

  const filteredSessions = useMemo(() => {
    if (activeFilters.length === 0) return sessions;
    return sessions.filter(s => {
      const myP = s._myParticipant;
      if (!myP) {
        // Session event organisée : vérifier si filtre RL-ORGANIZER actif
        if (s.sessionType === 'event' && activeFilters.includes('RL-ORGANIZER')) return true;
        return false;
      }
      const roleId = typeof myP.roleSystemId === 'string' ? myP.roleSystemId : String(myP.roleSystemId?.id || myP.roleSystemId || '');
      const styleIds = Array.isArray(myP.styleSystemIds) ? myP.styleSystemIds.map(x => typeof x === 'string' ? x : String(x?.id || x || '')) : [];
      const tagSet = new Set([roleId, ...styleIds].filter(Boolean));
      if (s.sessionType === 'event') tagSet.add('RL-ORGANIZER');
      return activeFilters.some(f => tagSet.has(f));
    });
  }, [activeFilters, sessions]);
  const isFilteredView = activeFilters.length > 0;
  const hasGlobal = globalVotes.length > 0;

  // ── Parcours dérivé du vrai vécu (votes reçus + sessions) ──────────────
  // PressKit = accumulation réelle, pas les préférences de TalentProfile
  const parcoursData = useMemo(() => {
    const votesToUse = isFilteredView ? filteredVotes : globalVotes;
    const sessionsToUse = isFilteredView ? filteredSessions : sessions;

    // Rôles : depuis les votes reçus + les sessions jouées
    const rolesSet = new Set();
    for (const v of votesToUse) {
      const r = normalizeId(v?.sessionRoleSystemId ?? v?.roleSystemId);
      if (r) rolesSet.add(r);
    }
    for (const s of sessionsToUse) {
      const r = normalizeId(s._myParticipant?.roleSystemId);
      if (r) rolesSet.add(r);
      if (s.sessionType === 'event' && (s.hostUserId === s._myParticipant?.userId || isEventOrganizer)) {
        rolesSet.add('RL-ORGANIZER');
      }
    }

    // Styles : depuis les votes reçus + sessions
    const stylesSet = new Set();
    for (const v of votesToUse) {
      for (const sid of asArray(v?.sessionStyleSystemIds ?? v?.styleSystemIds).map(normalizeId).filter(Boolean)) {
        stylesSet.add(sid);
      }
    }
    for (const s of sessionsToUse) {
      for (const sid of asArray(s._myParticipant?.styleSystemIds).map(normalizeId).filter(Boolean)) {
        stylesSet.add(sid);
      }
    }

    // Checkpoints : depuis les votes + sessions
    const checkpointsSet = new Set();
    for (const v of votesToUse) {
      const c = normalizeId(v?.sessionCheckpointSystemId ?? v?.checkpointSystemId);
      if (c) checkpointsSet.add(c);
    }
    for (const s of sessionsToUse) {
      const c = normalizeId(s.checkpointSystemId);
      if (c) checkpointsSet.add(c);
    }

    return {
      roles: [...rolesSet].filter(r => r !== 'RL-ORGANIZER'),
      hasOrganizer: rolesSet.has('RL-ORGANIZER') || isEventOrganizer,
      styles: [...stylesSet],
      checkpoints: [...checkpointsSet],
    };
  }, [globalVotes, filteredVotes, sessions, filteredSessions, isFilteredView, isEventOrganizer]);

  // Tags pour l'entête = union de tout le parcours global (pour navigation)
  const headerTags = useMemo(() => {
    const rolesSet = new Set();
    const stylesSet = new Set();
    for (const v of globalVotes) {
      const r = normalizeId(v?.sessionRoleSystemId ?? v?.roleSystemId);
      if (r) rolesSet.add(r);
      for (const sid of asArray(v?.sessionStyleSystemIds ?? v?.styleSystemIds).map(normalizeId).filter(Boolean)) {
        stylesSet.add(sid);
      }
    }
    for (const s of sessions) {
      const r = normalizeId(s._myParticipant?.roleSystemId);
      if (r) rolesSet.add(r);
      for (const sid of asArray(s._myParticipant?.styleSystemIds).map(normalizeId).filter(Boolean)) {
        stylesSet.add(sid);
      }
    }
    return { roles: [...rolesSet], styles: [...stylesSet].slice(0, 4) };
  }, [globalVotes, sessions]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="container mx-auto px-4 py-8">
        <p className="text-center text-gray-600">Profil introuvable</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      {/* ── HERO ───────────────────────────────────────────────────────── */}
      {(() => {
        const xp = profile.xpGlobal || 0;
        const xpLevel = Math.floor(Math.sqrt(xp / 100)) + 1;
        const xpForCurrent = Math.pow(xpLevel - 1, 2) * 100;
        const xpForNext    = Math.pow(xpLevel, 2) * 100;
        const xpProgress   = xpForNext > xpForCurrent
          ? Math.round(((xp - xpForCurrent) / (xpForNext - xpForCurrent)) * 100)
          : 100;
        const sotsScore = profile.sotsGlobalScore ? Number(profile.sotsGlobalScore).toFixed(2) : null;
        const sotsStars = sotsScore ? Math.round(Number(sotsScore)) : 0;

        // 6-G — Taux de recommandation depuis les SOTSLogs
        const logsWithRec = allUserVotes.filter(v => v.wouldRecommend != null);
        const recommendPct = logsWithRec.length >= 3
          ? Math.round((logsWithRec.filter(v => v.wouldRecommend === true).length / logsWithRec.length) * 100)
          : null;
        const avatarUrl = profile.avatarUrl || null;
        const statusCfg = {
          candidat:     { label: 'Candidat',     color: 'bg-gray-200/30 text-white' },
          exploratoire: { label: 'Exploratoire', color: 'bg-blue-400/30 text-white' },
          actif:        { label: 'Actif',        color: 'bg-green-400/30 text-white' },
          vitrine:      { label: 'Vitrine ⭐',   color: 'bg-yellow-400/30 text-white' },
        }[profile.talentStatus] || { label: 'Candidat', color: 'bg-gray-200/30 text-white' };
        const badges = asArray(profile.badges);

        return (
          <div className="bg-gradient-to-br from-indigo-600 via-indigo-500 to-purple-600 rounded-2xl mb-8 text-white overflow-hidden">
            {/* Top band */}
            <div className="px-6 pt-6 pb-4 flex items-start gap-5">
              {/* Avatar — upload si propre profil */}
              <div className="relative flex-shrink-0">
                <div className="w-20 h-20 rounded-2xl overflow-hidden bg-white/20 flex items-center justify-center ring-2 ring-white/30">
                  {avatarUrl
                    ? <img src={avatarUrl} alt={profile.displayName} className="w-full h-full object-cover" />
                    : <span className="text-3xl font-bold text-white">{(profile.displayName || '?').charAt(0).toUpperCase()}</span>
                  }
                </div>
                <span className={`absolute -bottom-1 -right-1 text-xs font-semibold px-1.5 py-0.5 rounded-full ${statusCfg.color}`}>
                  {statusCfg.label}
                </span>

                {/* Bouton caméra — visible seulement sur son propre profil */}
                {isOwnProfile && (
                  <label
                    title="Changer la photo de profil"
                    className="absolute -top-1.5 -right-1.5 w-7 h-7 rounded-full bg-white shadow-md flex items-center justify-center cursor-pointer hover:bg-indigo-50 transition-colors"
                  >
                    {avatarUploading
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600" />
                      : <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 text-indigo-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 0 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                    }
                    <input
                      type="file"
                      accept="image/jpeg,image/jpg,image/png,image/webp"
                      className="hidden"
                      disabled={avatarUploading}
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file || !profile?.id) return;
                        e.target.value = '';

                        const maxBytes = 10 * 1024 * 1024;
                        if (file.size > maxBytes) {
                          toast({ title: 'Fichier trop volumineux', description: 'Maximum 10 MB.', variant: 'destructive' });
                          return;
                        }
                        const allowed = ['image/jpeg','image/jpg','image/png','image/webp'];
                        if (!allowed.includes(file.type)) {
                          toast({ title: 'Format non supporté', description: 'JPG, PNG ou WEBP uniquement.', variant: 'destructive' });
                          return;
                        }

                        try {
                          setAvatarUploading(true);
                          const formData = new FormData();
                          formData.append('file', file);
                          formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
                          formData.append('folder', 'microrave/avatars');

                          const res = await fetch(
                            `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
                            { method: 'POST', body: formData }
                          );
                          const payload = await res.json();
                          if (!res.ok) throw new Error(payload?.error?.message || 'Erreur Cloudinary');
                          const url = payload?.secure_url;
                          if (!url) throw new Error('URL manquante dans la réponse Cloudinary');

                          await base44.entities.TalentProfile.update(profile.id, { avatarUrl: url });
                          setProfile(prev => ({ ...prev, avatarUrl: url }));
                          toast({ title: 'Photo mise à jour ✓' });
                        } catch (err) {
                          toast({ title: 'Erreur upload', description: err?.message || 'Réessaie.', variant: 'destructive' });
                        } finally {
                          setAvatarUploading(false);
                        }
                      }}
                    />
                  </label>
                )}
              </div>

              {/* Identity */}
              <div className="flex-1 min-w-0">
                <h1 className="text-2xl font-bold truncate">{profile.displayName}</h1>
                {profile.bio && (
                  <p className="text-white/70 text-sm mt-0.5 line-clamp-2">{profile.bio}</p>
                )}
                {/* Rôles cliquables — dérivés du vrai parcours */}
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {headerTags.roles.slice(0, 3).map(sid => {
                    const sel = activeFilters.includes(sid);
                    return (
                      <button
                        key={sid}
                        onClick={() => toggleFilter(sid)}
                        className={`text-xs px-2 py-0.5 rounded-full font-medium transition-all border ${
                          sel ? 'bg-white text-indigo-700 border-white' : 'bg-white/10 border-white/20 hover:bg-white/20'
                        }`}
                      >
                        {roleLabels[sid] || sid}
                      </button>
                    );
                  })}
                  {headerTags.styles.map(sid => {
                    const sel = activeFilters.includes(sid);
                    return (
                      <button
                        key={sid}
                        onClick={() => toggleFilter(sid)}
                        className={`text-xs px-2 py-0.5 rounded-full font-medium transition-all border ${
                          sel ? 'bg-white text-purple-700 border-white' : 'bg-white/10 border-white/20 hover:bg-white/20'
                        }`}
                      >
                        {styleLabels[sid] || sid}
                      </button>
                    );
                  })}
                  {isEventOrganizer && (() => {
                    const sel = activeFilters.includes('RL-ORGANIZER');
                    return (
                      <button
                        onClick={() => toggleFilter('RL-ORGANIZER')}
                        className={`text-xs px-2 py-0.5 rounded-full font-medium transition-all border ${
                          sel ? 'bg-white text-indigo-700 border-white' : 'bg-white/10 border-white/20 hover:bg-white/20'
                        }`}
                      >
                        Organisateur
                      </button>
                    );
                  })()}
                </div>
              </div>

              {/* SOTS score */}
              {sotsScore && (
                <div className="flex-shrink-0 text-center bg-white/10 rounded-xl px-3 py-2 border border-white/20">
                  <div className="text-xl font-bold">{sotsScore}</div>
                  <div className="flex justify-center gap-0.5 my-0.5">
                    {[1,2,3,4,5].map(n => (
                      <Star key={n} className={`w-2.5 h-2.5 ${n <= sotsStars ? 'fill-yellow-300 text-yellow-300' : 'text-white/30'}`} />
                    ))}
                  </div>
                  <div className="text-xs text-white/60">SOTS</div>
                </div>
              )}
              {/* 6-G — Taux de recommandation (affiché si ≥ 3 votes) */}
              {recommendPct !== null && (
                <div className="flex-shrink-0 text-center bg-white/10 rounded-xl px-3 py-2 border border-white/20">
                  <div className="text-xl font-bold">{recommendPct}%</div>
                  <div className="text-xs text-white/60 mt-0.5">recommandent</div>
                </div>
              )}
              {/* RWE — Audience physique cumulée (affiché si > 0) */}
              {(profile.rweTotal || 0) > 0 && (
                <div className="flex-shrink-0 text-center bg-orange-500/30 rounded-xl px-3 py-2 border border-orange-400/40">
                  <div className="text-xl font-bold text-orange-200">
                    {Number(profile.rweTotal) >= 1000
                      ? `${(Number(profile.rweTotal) / 1000).toFixed(1)}k`
                      : profile.rweTotal}
                  </div>
                  <div className="text-[10px] text-orange-300 uppercase tracking-wide mt-0.5">🔥 présences</div>
                </div>
              )}
            </div>

            {/* XP bar */}
            <div className="px-6 py-3 bg-black/10 border-t border-white/10">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-yellow-300" />
                  <span className="text-xs font-semibold text-white/90">Niveau {xpLevel}</span>
                </div>
                <span className="text-xs text-white/60">{xp} XP · {xpForNext - xp} avant niv.{xpLevel + 1}</span>
              </div>
              <div className="w-full h-1.5 bg-white/20 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-yellow-300 to-yellow-400 rounded-full transition-all"
                  style={{ width: `${xpProgress}%` }}
                />
              </div>
            </div>

            {/* Badges — si présents */}
            {badges.length > 0 && (
              <div className="px-6 py-2 flex gap-2 flex-wrap border-t border-white/10">
                {badges.slice(0, 6).map((b, i) => (
                  <span key={i} className="text-xs bg-white/10 border border-white/20 px-2 py-0.5 rounded-full text-white/80">
                    {b}
                  </span>
                ))}
              </div>
            )}
          </div>
        );
      })()}

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Stats Sidebar */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Star className="w-5 h-5 text-yellow-500" />
                XP
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{profile.xpGlobal || 0}</p>
              {profile.talentStatus && (() => {
                const cfg = {
                  candidat:     { label: 'Candidat',     color: 'bg-gray-100 text-gray-600' },
                  exploratoire: { label: 'Exploratoire', color: 'bg-blue-100 text-blue-700' },
                  actif:        { label: 'Actif',        color: 'bg-green-100 text-green-700' },
                  vitrine:      { label: 'Vitrine ⭐',   color: 'bg-yellow-100 text-yellow-700' },
                }[profile.talentStatus] || { label: 'Candidat', color: 'bg-gray-100 text-gray-600' };
                return (
                  <span className={`inline-block mt-2 text-xs font-semibold px-2 py-1 rounded-full ${cfg.color}`}>
                    {cfg.label}
                  </span>
                );
              })()}
            </CardContent>
          </Card>

          <SOTSRadar 
            sotsData={sotsDisplay} 
            isFilteredView={isFilteredView} 
            hasGlobal={hasGlobal}
            onResetFilters={() => setActiveFilters([])}
          />

          {/* Badges — réels si disponibles */}
          {(() => {
            const badges = asArray(profile.badges);
            if (badges.length === 0) return null;
            return (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Award className="w-4 h-4 text-yellow-500" />
                    Badges
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-1.5">
                  {badges.map((b, i) => (
                    <span key={i} className="text-xs bg-yellow-50 border border-yellow-200 text-yellow-700 px-2 py-0.5 rounded-full font-medium">
                      {b}
                    </span>
                  ))}
                </CardContent>
              </Card>
            );
          })()}

          {/* Stats rapides */}
          <Card>
            <CardContent className="pt-4 pb-4 space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500 flex items-center gap-1.5"><Hash className="w-3.5 h-3.5" />Sessions</span>
                <span className="font-semibold">
                  {isFilteredView ? <><span className="text-indigo-600">{filteredSessions.length}</span><span className="text-gray-400">/{sessions.length}</span></> : sessions.length}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500 flex items-center gap-1.5"><Star className="w-3.5 h-3.5" />Votes reçus</span>
                <span className="font-semibold">
                  {isFilteredView ? <><span className="text-indigo-600">{filteredVotes.length}</span><span className="text-gray-400">/{globalVotes.length}</span></> : globalVotes.length}
                </span>
              </div>
              {profile.trustScore > 0 && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500 flex items-center gap-1.5"><Shield className="w-3.5 h-3.5" />Trust</span>
                  <span className="font-semibold">{Number(profile.trustScore).toFixed(0)}</span>
                </div>
              )}
              {profile.verifiedRevenueTotal > 0 && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500 flex items-center gap-1.5"><DollarSign className="w-3.5 h-3.5" />Revenus certifiés</span>
                  <span className="font-semibold text-green-600">{profile.verifiedRevenueTotal} $</span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Main Content */}
        <div className="lg:col-span-2">
          <Tabs defaultValue="presskit">
            <TabsList className="grid w-full grid-cols-6">
              <TabsTrigger value="presskit">PressKit</TabsTrigger>
              <TabsTrigger value="history">Historique</TabsTrigger>
              {isOwnProfile && (
                <TabsTrigger value="actions" className="relative">
                  Actions
                  {(pendingPayments.length + pendingProposals.length) > 0 && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                      {pendingPayments.length + pendingProposals.length}
                    </span>
                  )}
                </TabsTrigger>
              )}
              {isOwnProfile && <TabsTrigger value="applications">Candidatures</TabsTrigger>}
              <TabsTrigger value="attestations" disabled>Attestations</TabsTrigger>
              <TabsTrigger value="pricing">Tarifs</TabsTrigger>
              {isOwnProfile && <TabsTrigger value="network">Réseau</TabsTrigger>}
            </TabsList>

            <TabsContent value="presskit" className="mt-6">
              <Card>
                <CardHeader>
                  <CardTitle>PressKit</CardTitle>
                  <CardDescription>
                    {isFilteredView ? 'Parcours filtré par sélection' : 'Accumulation du parcours sur le site'}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <h3 className="font-semibold mb-2">Rôles actifs</h3>
                      <div className="flex flex-wrap gap-2">
                        {(parcoursData.roles.length > 0 || parcoursData.hasOrganizer) ? (
                          <>
                            {parcoursData.roles.map(roleId => (
                              <Badge
                                key={roleId}
                                variant={activeFilters.includes(roleId) ? 'default' : 'outline'}
                                className="cursor-pointer"
                                onClick={() => toggleFilter(roleId)}
                              >
                                {roleLabels[roleId] || roleId}
                              </Badge>
                            ))}
                            {parcoursData.hasOrganizer && (
                              <Badge
                                variant={activeFilters.includes('RL-ORGANIZER') ? 'default' : 'outline'}
                                className="cursor-pointer"
                                onClick={() => toggleFilter('RL-ORGANIZER')}
                              >
                                Organisateur
                              </Badge>
                            )}
                          </>
                        ) : (
                          <p className="text-gray-500 text-sm">Aucun rôle joué pour l'instant</p>
                        )}
                      </div>
                    </div>

                    <div>
                      <h3 className="font-semibold mb-2">Styles joués</h3>
                      <div className="flex flex-wrap gap-2">
                        {parcoursData.styles.length > 0 ? (
                          parcoursData.styles.map(styleId => (
                            <Badge
                              key={styleId}
                              variant={activeFilters.includes(styleId) ? 'default' : 'outline'}
                              className="cursor-pointer"
                              onClick={() => toggleFilter(styleId)}
                            >
                              {styleLabels[styleId] || styleId}
                            </Badge>
                          ))
                        ) : (
                          <p className="text-gray-500 text-sm">Aucun style enregistré</p>
                        )}
                      </div>
                    </div>

                    <div>
                      <h3 className="font-semibold mb-2">Checkpoints fréquentés</h3>
                      <div className="flex flex-wrap gap-2">
                        {parcoursData.checkpoints.length > 0 ? (
                          parcoursData.checkpoints.map(cpId => (
                            <Badge key={cpId} variant="outline">
                              {checkpointLabels[cpId] || cpId}
                            </Badge>
                          ))
                        ) : (
                          <p className="text-gray-500 text-sm">Aucun checkpoint fréquenté</p>
                        )}
                      </div>
                    </div>

                    {isFilteredView && (
                      <button
                        onClick={() => setActiveFilters([])}
                        className="text-xs text-indigo-500 hover:underline mt-2"
                      >
                        ✕ Effacer le filtre
                      </button>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="history">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Trophy className="w-5 h-5 text-indigo-500" />
                    Historique des sessions
                  </CardTitle>
                  <CardDescription>{isFilteredView ? `${filteredSessions.length} / ${sessions.length}` : sessions.length} dernières sessions jouées</CardDescription>
                </CardHeader>
                <CardContent>
                  {sessionsLoading ? (
                    <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-indigo-400" /></div>
                  ) : sessions.length === 0 ? (
                    <div className="text-center py-10">
                      <Trophy className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                      <p className="text-gray-400 text-sm">Aucune session complétée pour l'instant</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {filteredSessions.map(s => {
                        const date = s.actualEndAt || s.updated_date || s.created_date;
                        const now = Date.now();
                        const diff = date ? now - new Date(date).getTime() : null;
                        let timeAgo = '—';
                        if (diff !== null) {
                          const mins = Math.floor(diff / 60000);
                          const hrs  = Math.floor(diff / 3600000);
                          const days = Math.floor(diff / 86400000);
                          if (mins < 60)        timeAgo = `${mins}min`;
                          else if (hrs < 24)    timeAgo = `${hrs}h`;
                          else if (days < 7)    timeAgo = `${days}j`;
                          else timeAgo = new Date(date).toLocaleDateString('fr-CA', { month: 'short', day: 'numeric' });
                        }

                        const myRole   = normalizeId(s._myParticipant?.roleSystemId);
                        const myStyles = asArray(s._myParticipant?.styleSystemIds).map(normalizeId).filter(Boolean);
                        const sotsScore = s._myParticipant?.sotsScores?.scoreRaw;
                        const isEval   = s.status === 'sots_submitted' || s.status === 'archived';
                        const isQuick  = s.sessionType !== 'event';

                        // Narration : "QuickPlay · DJ · Ghetto House · Le Belmont · 3h"
                        const parts = [];
                        parts.push(isQuick ? 'QuickPlay' : 'Événement');
                        if (myRole && roleLabels[myRole]) parts.push(roleLabels[myRole]);
                        if (myStyles.length > 0) parts.push(myStyles.slice(0,2).map(id => styleLabels[id] || id).join(', '));
                        if (s._checkpointName && s._checkpointName !== 'Lieu inconnu') parts.push(s._checkpointName);

                        const nParticipants = asArray(s.participants).length;

                        return (
                          <div key={s.id} className="flex items-center gap-3 p-3 rounded-xl border hover:border-indigo-200 hover:bg-indigo-50/40 transition-all group">
                            {/* Icône session type */}
                            <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                              isEval ? 'bg-green-100' : 'bg-indigo-100'
                            }`}>
                              {isQuick
                                ? <Zap className={`w-4 h-4 ${isEval ? 'text-green-600' : 'text-indigo-600'}`} />
                                : <Calendar className={`w-4 h-4 ${isEval ? 'text-green-600' : 'text-indigo-600'}`} />
                              }
                            </div>

                            {/* Narration */}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900 truncate">
                                {parts.join(' · ')}
                              </p>
                              <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-400">
                                <Clock className="w-3 h-3" />
                                <span>{timeAgo}</span>
                                {nParticipants > 1 && (
                                  <><span>·</span><User className="w-3 h-3" /><span>{nParticipants}</span></>
                                )}
                                {isEval && (
                                  <><span>·</span><span className="text-green-600 font-medium">✓ Évalué</span></>
                                )}
                              </div>
                            </div>

                            {/* Score SOTS */}
                            {sotsScore != null ? (
                              <div className="flex-shrink-0 text-right">
                                <div className="text-sm font-bold text-indigo-600">{Number(sotsScore).toFixed(1)}</div>
                                <div className="flex justify-end gap-0.5 mt-0.5">
                                  {[1,2,3,4,5].map(n => (
                                    <Star key={n} className={`w-2.5 h-2.5 ${n <= Math.round(Number(sotsScore)) ? 'fill-yellow-400 text-yellow-400' : 'text-gray-200'}`} />
                                  ))}
                                </div>
                              </div>
                            ) : (
                              <div className="flex-shrink-0 w-8" />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {isOwnProfile && (
            <TabsContent value="actions">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CreditCard className="w-5 h-5 text-indigo-500" />
                    Actions en attente
                    {(pendingPayments.length + pendingProposals.length) > 0 && (
                      <Badge className="bg-red-100 text-red-700 border-0 ml-1">
                        {pendingPayments.length + pendingProposals.length}
                      </Badge>
                    )}
                  </CardTitle>
                  <CardDescription>Paiements, propositions de cachet et obligations transactionnelles</CardDescription>
                </CardHeader>
                <CardContent>
                  {pendingLoading ? (
                    <div className="flex justify-center py-8">
                      <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
                    </div>
                  ) : (pendingPayments.length + pendingProposals.length) === 0 ? (
                    <div className="text-center py-10">
                      <div className="w-12 h-12 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-3">
                        <Lock className="w-6 h-6 text-green-400" />
                      </div>
                      <p className="text-gray-500 text-sm font-medium">Aucune action en attente</p>
                      <p className="text-xs text-gray-400 mt-1">Tu es à jour — rien à traiter pour l'instant.</p>
                    </div>
                  ) : (
                    <div className="space-y-4">

                      {/* ── Propositions de cachet ─────────────────────────── */}
                      {pendingProposals.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-purple-600 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                            <DollarSign className="w-3.5 h-3.5" />
                            Propositions de cachet ({pendingProposals.length})
                          </p>
                          <div className="space-y-3">
                            {pendingProposals.map(prop => {
                              const proposed    = Number(prop.currentOfferPrice) || 0;
                               const calculated  = Number(prop.calculatedPrice) || proposed;
                               const isGratuit   = proposed === 0;
                               const diff        = calculated > 0 ? Math.round(((proposed - calculated) / calculated) * 100) : 0;
                               const counter     = proposalCounterState[prop.id] || {};
                               const isResponding = proposalResponding === prop.id;
                               const isPending   = prop.status === 'pending_talent';
                               const isCounter   = prop.status === 'pending_organizer';
                               const isAccepted  = prop.status === 'accepted' || prop.finalStatus === 'accepted';
                               const finalPrice  = prop.finalPrice != null ? Number(prop.finalPrice) : null;

                              const handleRespond = async (action, cprice, cnote) => {
                                setProposalResponding(prop.id);
                                try {
                                  await base44.functions.invoke('respondToPriceProposal', {
                                    proposalId: prop.id,
                                    action,
                                    counterPrice: cprice,
                                    counterNote: cnote,
                                  });
                                  // Retirer la proposition de la liste localement
                                  setPendingProposals(prev => prev.filter(p => p.id !== prop.id));
                                  if (action === 'accept') toast({ title: '✅ Proposition acceptée !' });
                                  if (action === 'reject') toast({ title: '❌ Proposition refusée.' });
                                  if (action === 'counter') toast({ title: '💬 Contre-proposition envoyée !' });
                                } catch (err) {
                                  const code = err?.response?.data?.code;
                                  const msg = code === 'CONFLICT_SCHEDULE'
                                    ? (err?.response?.data?.error || 'Conflit de plage horaire.')
                                    : err?.response?.data?.error || err?.message;
                                  toast({ title: 'Erreur', description: msg, variant: 'destructive' });
                                } finally {
                                  setProposalResponding(null);
                                }
                              };

                              return (
                                <div key={prop.id} className="rounded-xl border border-purple-200 bg-gradient-to-br from-[#1e1030] to-[#150d25] text-white overflow-hidden">
                                  {/* Header */}
                                  <div className="px-4 pt-4 pb-3 border-b border-purple-800/40">
                                    <p className="text-purple-300 text-xs uppercase tracking-wider font-semibold mb-1">
                                      {isPending ? 'En attente de ta réponse' : isCounter ? 'Contre-offre envoyée' : isAccepted ? 'Accepté ✓' : 'Proposition'}
                                    </p>
                                    <p className="text-white font-semibold text-sm truncate">{prop._eventTitle}</p>
                                    {prop._eventDate && (
                                      <p className="text-purple-400 text-xs mt-0.5">
                                        {new Date(prop._eventDate).toLocaleDateString('fr-CA', { weekday: 'short', day: 'numeric', month: 'long' })}
                                      </p>
                                    )}
                                  </div>

                                  {/* Prix — lecture seule */}
                                  <div className="px-4 py-3 text-center border-b border-purple-800/40">
                                    {isAccepted && finalPrice != null ? (
                                      <p className="text-2xl font-black text-green-300">{finalPrice} <span className="text-sm text-green-500">$ · figé</span></p>
                                    ) : proposed === 0 ? (
                                      <p className="text-2xl font-black text-amber-300">Bénévolat</p>
                                    ) : (
                                      <p className="text-2xl font-black text-white">{proposed} <span className="text-sm text-purple-300">$ CAD</span></p>
                                    )}
                                  </div>

                                  {/* Lien vers l'événement — actions dans l'EventLobby */}
                                  <div className="px-4 py-3 space-y-2">
                                    {(isPending || isCounter) && (
                                      <p className="text-amber-300 text-xs text-center">
                                        {isPending ? "⚡ En attente de ta réponse" : "⚡ Contre-offre — réponds dans l'événement"}
                                      </p>
                                    )}
                                    <a href={`/EventLobby?eventId=${prop.eventId}`}
                                      className="w-full py-2.5 rounded-xl bg-purple-700 hover:bg-purple-600 text-white font-semibold text-sm flex items-center justify-center gap-2 transition-all">
                                      Voir dans l'événement →
                                    </a>
                                    {prop.expiresAt && !isAccepted && (
                                      <p className="text-purple-600 text-[10px] text-center">
                                        Expire {new Date(prop.expiresAt).toLocaleDateString('fr-CA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* ── Demandes de paiement ───────────────────────────── */}
                      {pendingPayments.length > 0 && (
                        <div>
                          {pendingProposals.length > 0 && (
                            <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                              <CreditCard className="w-3.5 h-3.5" />
                              Demandes de paiement ({pendingPayments.length})
                            </p>
                          )}
                          <div className="space-y-3">
                      {pendingPayments.map(req => {
                        const paymentUrl = `${window.location.origin}/PaymentPage?token=${req.secureToken}`;
                        const isExpiringSoon = req.expiresAt && (new Date(req.expiresAt) - Date.now()) < 24 * 60 * 60 * 1000;
                        const expiresLabel = req.expiresAt
                          ? new Date(req.expiresAt).toLocaleDateString('fr-CA', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
                          : null;
                        const eventDateLabel = req._eventDate
                          ? new Date(req._eventDate).toLocaleDateString('fr-CA', { weekday: 'long', day: 'numeric', month: 'long' })
                          : null;

                        return (
                          <div
                            key={req.id}
                            className={`rounded-xl border p-4 space-y-3 ${isExpiringSoon ? 'border-red-200 bg-red-50' : 'border-indigo-100 bg-indigo-50/40'}`}
                          >
                            {/* Header événement */}
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="font-semibold text-gray-900 text-sm truncate">{req._eventTitle}</p>
                                {eventDateLabel && (
                                  <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
                                    <Calendar className="w-3 h-3 inline" />
                                    {eventDateLabel}
                                  </p>
                                )}
                              </div>
                              <Badge className={`text-xs border-0 shrink-0 ${req.requestStatus === 'viewed' ? 'bg-blue-100 text-blue-700' : 'bg-yellow-100 text-yellow-700'}`}>
                                {req.requestStatus === 'viewed' ? '👁 Vue' : '⏳ En attente'}
                              </Badge>
                            </div>

                            {/* Montant */}
                            <div className="flex items-center justify-between py-2 px-3 bg-white rounded-lg border border-gray-100">
                              <div>
                                <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Dépôt requis</p>
                                <p className="text-xl font-bold text-indigo-700">{req.requestedAmount} $ CAD</p>
                                <p className="text-xs text-gray-400">20% du budget total de l'événement</p>
                              </div>
                              <Shield className="w-8 h-8 text-indigo-100" />
                            </div>

                            {/* Message de l'organisateur */}
                            {req.messageToPayer && (
                              <div className="px-3 py-2 bg-amber-50 border-l-3 border-amber-300 rounded-r-lg">
                                <p className="text-xs text-amber-600 font-medium mb-0.5">Message de l'organisateur</p>
                                <p className="text-xs text-amber-900 italic">"{req.messageToPayer}"</p>
                              </div>
                            )}

                            {/* Expiration */}
                            {expiresLabel && (
                              <p className={`text-xs flex items-center gap-1 ${isExpiringSoon ? 'text-red-600 font-medium' : 'text-gray-400'}`}>
                                <Clock className="w-3 h-3 inline" />
                                {isExpiringSoon ? '⚠ Expire bientôt — ' : "Valide jusqu'au "}
                                {expiresLabel}
                              </p>
                            )}

                            {/* CTA */}
                            <Button
                              className="w-full bg-indigo-600 hover:bg-indigo-700 text-sm h-10"
                              onClick={() => window.open(paymentUrl, '_blank')}
                            >
                              <Lock className="w-4 h-4 mr-2" />
                              Payer maintenant — {req.requestedAmount} $ CAD
                              <ExternalLink className="w-3.5 h-3.5 ml-2 opacity-60" />
                            </Button>
                          </div>
                        );
                      })}
                        </div>
                      </div>
                      )}

                      </div>
                      )}
                      </CardContent>
                      </Card>
                      </TabsContent>
                      )}

                      {isOwnProfile && (
                      <TabsContent value="applications">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-indigo-500" />
                    Mes candidatures
                  </CardTitle>
                  <CardDescription>Slots auxquels vous avez postulé</CardDescription>
                </CardHeader>
                <CardContent>
                  {applicationsLoading ? (
                    <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-indigo-400" /></div>
                  ) : applications.length === 0 ? (
                    <p className="text-gray-500 text-center py-8">Aucune candidature active pour l'instant</p>
                  ) : (
                    <div className="space-y-3">
                      {applications.map((app, i) => (
                        <div key={i} className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium text-sm truncate">{app.eventTitle}</span>
                              <Badge className={app.status === 'confirmed' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}>
                                {app.status === 'confirmed' ? '✓ Confirmé' : '⏳ En attente'}
                              </Badge>
                            </div>
                            <div className="text-xs text-gray-500 mt-1">
                              {roleLabels[app.roleSystemId] || app.roleSystemId}
                            </div>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            className="shrink-0 ml-2"
                            onClick={() => navigate(`${createPageUrl('EventLobby')}?eventId=${app.eventId}`)}
                          >
                            <ArrowRight className="w-4 h-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
            )}

            <TabsContent value="attestations">
              <Card>
                <CardContent className="pt-6">
                  <p className="text-gray-500">Attestations disponibles en W4</p>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="pricing">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <DollarSign className="w-5 h-5 text-green-600" />
                    Tarification
                  </CardTitle>
                  <CardDescription>Taux déclarés par rôle</CardDescription>
                </CardHeader>
                <CardContent>
                  {(() => {
                    const roleEntries = Object.entries(talentPricing)
                      .filter(([, p]) => p?.hourlyRate || p?.fixedRate);
                    const legacy = profile?.pricingBase;
                    const hasLegacy = !roleEntries.length && (legacy?.hourlyRate || legacy?.fixedRate);

                    if (!roleEntries.length && !hasLegacy) {
                      return (
                        <div className="text-center py-6">
                          <DollarSign className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                          <p className="text-gray-500 text-sm">Aucun tarif déclaré</p>
                          {isOwnProfile && (
                            <p className="text-xs text-gray-400 mt-1">Ajoutez vos taux dans Préférences → Tarification</p>
                          )}
                        </div>
                      );
                    }

                    const rows = roleEntries.length > 0 ? roleEntries : [[null, legacy]];

                    return (
                      <div className="space-y-3">
                        {rows.map(([roleId, pricing]) => (
                          <div key={roleId || 'legacy'} className="border rounded-xl p-4 space-y-2">
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                              {roleId ? (roleLabels[roleId] || roleId) : 'Tarif général'}
                            </p>
                            {pricing.hourlyRate && (
                              <div className="flex items-center justify-between">
                                <span className="text-sm text-gray-500">Taux horaire</span>
                                <span className="font-semibold text-green-700">{pricing.hourlyRate} $ CAD / h</span>
                              </div>
                            )}
                            {pricing.fixedRate && (
                              <div className="flex items-center justify-between">
                                <span className="text-sm text-gray-500">Cachet événement</span>
                                <span className="font-semibold text-green-700">{pricing.fixedRate} $ CAD</span>
                              </div>
                            )}
                            {pricing.notes && (
                              <p className="text-xs text-gray-500 pt-1 border-t mt-2">{pricing.notes}</p>
                            )}
                          </div>
                        ))}
                        {isOwnProfile && (
                          <p className="text-xs text-gray-400 text-center pt-1">Modifiez vos tarifs dans Préférences</p>
                        )}
                      </div>
                    );
                  })()}
                </CardContent>
              </Card>
            </TabsContent>

            {isOwnProfile && (
            <TabsContent value="network">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Gift className="w-5 h-5 text-indigo-500" />
                    Ton réseau
                  </CardTitle>
                  <CardDescription>Invite des gens sur Micro Rave avec ton lien personnel</CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  {profile?.referralCode ? (() => {
                    const link = `${window.location.origin}?ref=${profile.referralCode}`;
                    return (
                      <div className="space-y-4">
                        <div>
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Ton lien d'invitation</p>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 font-mono text-xs text-gray-700 truncate select-all">
                              {link}
                            </div>
                            <Button size="sm" variant="outline" className="flex-shrink-0 gap-2"
                              onClick={() => copyReferralLink(profile.referralCode)}>
                              <Copy className="w-3.5 h-3.5" />Copier
                            </Button>
                          </div>
                          <p className="text-xs text-gray-400 mt-2">
                            Quand quelqu'un s'inscrit via ce lien, tu es identifié comme leur référent.
                          </p>
                        </div>
                        <div className="flex items-center justify-between p-4 bg-indigo-50 border border-indigo-100 rounded-xl">
                          <div>
                            <p className="text-xs font-semibold text-gray-500 mb-1">Ton code</p>
                            <p className="font-mono font-bold text-indigo-700 text-xl tracking-widest">{profile.referralCode}</p>
                          </div>
                          <Button size="sm" variant="ghost" className="text-indigo-500 hover:text-indigo-700 gap-1.5"
                            onClick={() => copyReferralLink(profile.referralCode)}>
                            <Copy className="w-3.5 h-3.5" />Copier le lien
                          </Button>
                        </div>
                        {typeof navigator !== 'undefined' && navigator.share && (
                          <Button variant="outline" className="w-full gap-2" onClick={async () => {
                            try { await navigator.share({ title: 'Rejoins Micro Rave',
                              text: `Je t'invite sur Micro Rave — la plateforme pour les talents et les lieux culturels.`,
                              url: link }); } catch {}
                          }}>
                            <Share2 className="w-4 h-4" />Partager via ton téléphone
                          </Button>
                        )}
                        <div className="pt-2 border-t border-gray-100">
                          <p className="text-xs text-gray-400 leading-relaxed">
                            Chaque inscription via ton lien contribue à ton RSI (Référencement Spontané Identifiable) —
                            l'indicateur de propagation organique de Micro Rave. Mesuré passivement, sans gamification forcée.
                          </p>
                        </div>
                      </div>
                    );
                  })() : (
                    <div className="text-center py-6">
                      <Gift className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                      <p className="text-gray-500 text-sm">Code non encore généré</p>
                      <p className="text-xs text-gray-400 mt-1">Reconnecte-toi pour qu'il soit créé automatiquement</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
            )}

          </Tabs>
        </div>
      </div>
    </div>
  );
}