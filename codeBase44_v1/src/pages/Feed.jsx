import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Loader2 } from 'lucide-react';
import HeroBanner from '../components/feed/HeroBanner';
import { chooseFeatured } from '../components/feed/chooseFeatured';
import { createPageUrl } from '../utils';
import {
  VALID_DOMAINS, DEFAULT_AFFINITY, getItemDomains,
  scoreNew, scoreTrending, scoreOpenSession, scoreDoneSession,
  normalizeParticipantId
} from '../components/feed/feedScoring';
import { TalentCard, CheckpointCard, OpenSessionCard, DoneSessionCard } from '../components/feed/FeedCard';
import FeedRail from '../components/feed/FeedRail';
import ImpressionObserver from '../components/feed/ImpressionObserver';
import CulturalMomentsRail from '../components/feed/CulturalMomentsRail';
import FeedFilterBar from '../components/feed/FeedFilterBar';

const OPEN_STATUSES = new Set(['queueing', 'matched', 'lobby', 'ready']);
const DONE_STATUSES = new Set(['completed', 'sots_submitted', 'archived']);
const SEVEN_DAYS_MS = 7 * 24 * 3600 * 1000;
const NEW_CUTOFF_DAYS = 14 * 24 * 3600 * 1000;
const FEED_HERO_ENABLED = true;
const HERO_ROTATION_MINUTES = 10;
const HERO_ROTATION_KEY = 'mr_feed_hero_kind';
const HERO_ROTATION_AT_KEY = 'mr_feed_hero_rotated_at';
const HERO_KIND_ORDER = ['session_open', 'talent', 'checkpoint'];
const AFFINITY_REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const RAIL_PAGE_SIZE = 20; // items affichés par rail au chargement initial

function getNeutralAffinity() {
  return Object.fromEntries(VALID_DOMAINS.map(d => [d, DEFAULT_AFFINITY]));
}

function getRotatedKinds() {
  try {
    const lastKind = localStorage.getItem(HERO_ROTATION_KEY);
    const lastAt = Number(localStorage.getItem(HERO_ROTATION_AT_KEY) || 0);
    const now = Date.now();
    const elapsedMin = (now - lastAt) / (1000 * 60);
    let idx = HERO_KIND_ORDER.indexOf(lastKind);
    if (idx < 0) idx = 0;
    if (!lastAt || elapsedMin >= HERO_ROTATION_MINUTES) {
      idx = (idx + 1) % HERO_KIND_ORDER.length;
      localStorage.setItem(HERO_ROTATION_KEY, HERO_KIND_ORDER[idx]);
      localStorage.setItem(HERO_ROTATION_AT_KEY, String(now));
    }
    const ordered = [];
    for (let i = 0; i < HERO_KIND_ORDER.length; i++) {
      ordered.push(HERO_KIND_ORDER[(idx + i) % HERO_KIND_ORDER.length]);
    }
    return ordered;
  } catch {
    return HERO_KIND_ORDER;
  }
}

export default function Feed() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [rails, setRails] = useState({ newItems: [], trending: [], openSessions: [], doneSessions: [] });
  // Indexes complets côté mémoire — jamais envoyés au DOM directement
  const allItemsRef = useRef({ newItems: [], trending: [], openSessions: [], doneSessions: [] });
  // Curseurs par rail
  const [cursors, setCursors] = useState({ newItems: RAIL_PAGE_SIZE, trending: RAIL_PAGE_SIZE, openSessions: RAIL_PAGE_SIZE, doneSessions: RAIL_PAGE_SIZE });
  const [loadingMore, setLoadingMore] = useState({ newItems: false, trending: false, openSessions: false, doneSessions: false });
  const [currentUser, setCurrentUser] = useState(null);
  const [feedSearch, setFeedSearch] = useState('');
  const [feedTypes, setFeedTypes] = useState([]);
  const [feedArr, setFeedArr] = useState(null);
  const [userContext, setUserContext] = useState({});

  // ─── CLEF DU FIX ─────────────────────────────────────────────────────────
  // L'affinité vit dans une REF, pas dans le state React.
  //
  // Pourquoi le correctif précédent ne suffisait pas :
  //   refreshAffinityQuiet appelait encore setAffinity(state)
  //   → re-render complet du composant
  //   → tous les useCallback recréés (nouvelles références)
  //   → ImpressionObserver reçoit un nouveau prop onImpression
  //   → React démonte/remonte l'observer → firedRef.current = false
  //   → nouvelles impressions → trackSignal → refreshAffinityQuiet
  //   → setAffinity → re-render → ... boucle infinie → 429
  //
  // Solution : affinityRef.current est lu au moment de loadFeed() (snapshot),
  // donc le scoring est correct, mais AUCUN setState n'est déclenché lors des
  // mises à jour silencieuses post-impression.
  // ─────────────────────────────────────────────────────────────────────────
  const affinityRef = useRef(getNeutralAffinity());

  // Signal booléen pour déclencher loadFeed une seule fois (montage initial)
  const [affinityReady, setAffinityReady] = useState(false);

  // Guard anti-concurrence sur loadFeed
  const isFeedLoadingRef = useRef(false);

  // Throttle des appels UserPreferences
  const lastAffinityLoadAt = useRef(0);

  // Anti-spam impressions : 1 max par item par session de navigation
  const firedImpressions = useRef(new Set());

  useEffect(() => {
    base44.auth.me().then(u => {
      setCurrentUser(u);
      loadAffinityInitial(u?.id);
    }).catch(() => loadAffinityInitial(null));

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => setUserContext({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => {}
      );
    }
  }, []);

  // Chargement initial — appelé une seule fois, écrit dans la ref puis
  // met setAffinityReady(true) pour déclencher loadFeed via useEffect
  const loadAffinityInitial = async (userId) => {
    if (!userId) {
      affinityRef.current = getNeutralAffinity();
      lastAffinityLoadAt.current = Date.now();
      setAffinityReady(true);
      return;
    }
    try {
      const prefs = await base44.entities.UserPreferences.filter({ userId });
      affinityRef.current = prefs?.[0]?.domainAffinity
        ? { ...getNeutralAffinity(), ...prefs[0].domainAffinity }
        : getNeutralAffinity();
      lastAffinityLoadAt.current = Date.now();
    } catch {
      affinityRef.current = getNeutralAffinity();
    }
    setAffinityReady(true);
  };

  // loadFeed se déclenche une seule fois quand affinityReady passe à true
  useEffect(() => {
    if (affinityReady) loadFeed();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [affinityReady]);

  const loadFeed = async () => {
    if (isFeedLoadingRef.current) return;
    isFeedLoadingRef.current = true;
    setLoading(true);
    const now = Date.now();

    try {
      const [talents, checkpoints, allSessions, liveStatsList] = await Promise.all([
        base44.entities.TalentProfile.list('-created_date', 40),
        base44.entities.Checkpoint.filter({ active: true }),
        base44.entities.Session.list('-created_date', 60),
        base44.entities.CheckpointLiveStats.list('-momentumScore', 100),
      ]);

      const liveStatsIndex = new Map(liveStatsList.map(s => [s.checkpointSystemId, s]));

      const cpMap = {};
      for (const cp of checkpoints) cpMap[cp.systemId] = cp;

      const recentDone = allSessions.filter(s =>
        DONE_STATUSES.has(s.status) &&
        s.actualEndAt && new Date(s.actualEndAt).getTime() > now - SEVEN_DAYS_MS
      );

      const talentMomentum = {};
      for (const s of recentDone) {
        for (const p of (s.participants || [])) {
          const uid = normalizeParticipantId(p);
          if (uid) talentMomentum[uid] = (talentMomentum[uid] || 0) + 1;
        }
      }

      const cpMomentum = {};
      for (const s of recentDone) {
        const cpId = s.checkpointSystemId;
        if (cpId) cpMomentum[cpId] = (cpMomentum[cpId] || 0) + 1;
      }

      const enrichSession = (s) => {
        const cp = cpMap[s.checkpointSystemId];
        return {
          ...s,
          _checkpointDominant: cp?.domainDominantKey || null,
          _cpLat: cp?.geoLat || null,
          _cpLng: cp?.geoLng || null,
        };
      };

      const openSessions = allSessions.filter(s => OPEN_STATUSES.has(s.status)).map(enrichSession);
      const doneSessions = allSessions.filter(s => DONE_STATUSES.has(s.status)).map(enrichSession);

      // Snapshot de la ref au moment du calcul
      const aff = affinityRef.current;

      const talentsEnriched = talents.map(t => ({
        ...t, type: 'talent', _momentum7d: talentMomentum[t.userId] || 0
      }));
      const checkpointsEnriched = checkpoints.map(cp => ({
        ...cp, type: 'checkpoint', _cpType: cp.type, _momentum7d: cpMomentum[cp.systemId] || 0,
        _liveStats: liveStatsIndex.get(cp.systemId) || null,
      }));

      const newItems = [
        ...talentsEnriched.filter(t => now - new Date(t.created_date || 0).getTime() < NEW_CUTOFF_DAYS),
        ...checkpointsEnriched.filter(cp => now - new Date(cp.created_date || 0).getTime() < NEW_CUTOFF_DAYS),
      ].sort((a, b) => scoreNew(b, aff, now, userContext) - scoreNew(a, aff, now, userContext)); // complet — pas de slice ici

      const maxMomentum = Math.max(...[...talentsEnriched, ...checkpointsEnriched].map(i => i._momentum7d), 1);
      const trending = [...talentsEnriched, ...checkpointsEnriched]
        .filter(i => i._momentum7d > 0 || (i.sotsRecent30Score || 0) > 0)
        .sort((a, b) => scoreTrending(b, aff, maxMomentum, userContext) - scoreTrending(a, aff, maxMomentum, userContext)); // complet — pas de slice ici

      const scoredOpen = openSessions
        .map(s => ({ ...s, type: 'session_open' }))
        .sort((a, b) => scoreOpenSession(b, aff, now, userContext) - scoreOpenSession(a, aff, now, userContext)); // complet

      const scoredDone = doneSessions
        .map(s => ({ ...s, type: 'session_done' }))
        .sort((a, b) => scoreDoneSession(b, aff, now, userContext) - scoreDoneSession(a, aff, now, userContext)); // complet

      // Stocker les tableaux complets en mémoire — jamais envoyés au DOM d'un coup
      allItemsRef.current = { newItems, trending, openSessions: scoredOpen, doneSessions: scoredDone };
      // Remettre les curseurs à 20 (cas de reload)
      setCursors({ newItems: RAIL_PAGE_SIZE, trending: RAIL_PAGE_SIZE, openSessions: RAIL_PAGE_SIZE, doneSessions: RAIL_PAGE_SIZE });
      // Exposer seulement le premier batch de chaque rail
      setRails({
        newItems: newItems.slice(0, RAIL_PAGE_SIZE),
        trending: trending.slice(0, RAIL_PAGE_SIZE),
        openSessions: scoredOpen.slice(0, RAIL_PAGE_SIZE),
        doneSessions: scoredDone.slice(0, RAIL_PAGE_SIZE),
      });
    } catch (err) {
      console.error('loadFeed error:', err);
    } finally {
      setLoading(false);
      isFeedLoadingRef.current = false;
    }
  };

  // Mise à jour silencieuse post-signal :
  // - écrit dans affinityRef UNIQUEMENT (zéro setState → zéro re-render)
  // - throttlé à 1 appel / 5 min
  // - ne déclenche jamais loadFeed
  // - deps vides → référence stable → les ImpressionObserver ne se remontent jamais
  const refreshAffinityQuiet = useCallback(async (userId) => {
    const now = Date.now();
    if (now - lastAffinityLoadAt.current < AFFINITY_REFRESH_INTERVAL_MS) return;
    lastAffinityLoadAt.current = now;
    try {
      const prefs = await base44.entities.UserPreferences.filter({ userId });
      // REF uniquement — aucun setState
      affinityRef.current = prefs?.[0]?.domainAffinity
        ? { ...getNeutralAffinity(), ...prefs[0].domainAffinity }
        : getNeutralAffinity();
    } catch {
      // silencieux
    }
  }, []); // deps vides : référence 100% stable

  // Appelé par FeedRail quand l'utilisateur arrive en fin de scroll
  // Ajoute les 20 items suivants depuis allItemsRef — zéro refetch réseau
  const loadMoreForRail = useCallback((railKey) => {
    setLoadingMore(prev => {
      if (prev[railKey]) return prev; // déjà en cours
      return { ...prev, [railKey]: true };
    });
    // Simuler un délai réseau (150ms) pour que le spinner soit visible
    setTimeout(() => {
      setCursors(prev => {
        const next = prev[railKey] + RAIL_PAGE_SIZE;
        setRails(prevRails => ({
          ...prevRails,
          [railKey]: allItemsRef.current[railKey].slice(0, next),
        }));
        return { ...prev, [railKey]: next };
      });
      setLoadingMore(prev => ({ ...prev, [railKey]: false }));
    }, 150);
  }, []);

  const trackSignal = useCallback(async (item, reason) => {
    if (!currentUser) return;
    const domains = getItemDomains(item).filter(d => VALID_DOMAINS.includes(d));
    if (!domains.length) return;
    try {
      await base44.functions.invoke('recordPreferenceSignal', {
        userId: currentUser.id,
        domainKeys: domains,
        reason
      });
      refreshAffinityQuiet(currentUser.id);
    } catch (e) {
      console.warn('trackSignal failed:', e);
    }
  }, [currentUser, refreshAffinityQuiet]);

  const trackImpression = useCallback((itemId, item) => {
    if (firedImpressions.current.has(itemId)) return;
    firedImpressions.current.add(itemId);
    trackSignal(item, 'feed_impression');
  }, [trackSignal]);

  const wrapWithImpression = useCallback((item, card) => (
    <ImpressionObserver key={item.id} itemId={item.id} item={item} onImpression={trackImpression}>
      {card}
    </ImpressionObserver>
  ), [trackImpression]);

  const renderTalentOrCheckpoint = useCallback((item) => {
    if (item.type === 'talent') return wrapWithImpression(item,
      <TalentCard item={item} onTrack={trackSignal} />
    );
    if (item.type === 'checkpoint') return wrapWithImpression(item,
      <CheckpointCard item={item} onTrack={trackSignal} />
    );
    return null;
  }, [trackSignal, wrapWithImpression]);

  // ── Feed filters ─────────────────────────────────────────────────────────
  // Règle fondamentale : un filtre actif bypass la pagination et opère sur
  // allItemsRef complet — zéro inconsistance avant/après scroll.
  // Sans filtre : comportement pagination normal (rails slice).
  const hasActiveFilter = feedSearch.trim() || feedTypes.length > 0 || feedArr;

  const applyFeedFilters = (items) => {
    let r = items;
    if (feedSearch.trim()) {
      const q = feedSearch.toLowerCase();
      // Talents : match sur nom uniquement (pas d'arrondissement)
      // Checkpoints : match sur nom, type, arrondissement, vibe
      r = r.filter(i =>
        (i.name || i.displayName || '').toLowerCase().includes(q) ||
        (i.type === 'checkpoint' && (
          (i.type || '').toLowerCase().includes(q) ||
          (i.arrondissement || '').toLowerCase().includes(q) ||
          (i.vibe || '').toLowerCase().includes(q)
        ))
      );
    }
    if (feedTypes.length > 0) {
      // Type filter only applies to checkpoints — never exclude talents by type
      r = r.filter(i => i.type === 'talent' || feedTypes.includes(i._cpType));
    }
    if (feedArr) {
      // Arrondissement filter : ONLY show checkpoints matching — talents excluded entirely
      r = r.filter(i => i.type === 'checkpoint' &&
        (i.arrondissement || '').toLowerCase().includes(feedArr.toLowerCase())
      );
    }
    return r;
  };

  // Source : toujours allItemsRef complet pour les filtres et les options disponibles
  const _allCps = [
    ...allItemsRef.current.newItems,
    ...allItemsRef.current.trending,
  ].filter(i => i.type === 'checkpoint');

  const availableTypes = [...new Set(_allCps.map(i => i._cpType).filter(Boolean))].sort();
  const availableArrs  = [...new Set(_allCps.map(i => i.arrondissement).filter(Boolean))].sort();

  // Si filtre actif → résultat complet depuis allItemsRef (bypass pagination)
  // Si pas de filtre → slice normale depuis rails (pagination normale)
  const filteredNewItems = hasActiveFilter
    ? applyFeedFilters(allItemsRef.current.newItems)
    : rails.newItems;
  const filteredTrending = hasActiveFilter
    ? applyFeedFilters(allItemsRef.current.trending)
    : rails.trending;
  const totalFilteredCount = filteredNewItems.length + filteredTrending.length;

  const now = Date.now();
  const preferredKinds = FEED_HERO_ENABLED ? getRotatedKinds() : null;
  const featured = FEED_HERO_ENABLED
    ? chooseFeatured({ rails, affinity: affinityRef.current, now, userContext, preferredKinds })
    : null;

  const onHeroPrimary = (f) => {
    if (!f?.item) return;
    trackSignal(f.item, 'feed_hero_click');
    if (f.kind === 'talent') {
      navigate(createPageUrl('Profile') + `?type=talent&id=${f.item.userId}`);
    } else if (f.kind === 'checkpoint') {
      navigate(createPageUrl('Profile') + `?type=checkpoint&id=${f.item.systemId}`);
    } else {
      navigate(createPageUrl('Play'));
    }
  };

  const onHeroSecondary = (f) => {
    if (!f?.item) return;
    trackSignal(f.item, 'feed_hero_secondary_click');
    if (f.kind === 'session') navigate(createPageUrl('Play'));
  };

  return (
    <div style={{ maxWidth: "100%" }}>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
        </div>
      ) : (
        <>
          <CulturalMomentsRail />
          {featured?.item ? (
            <div className="-mx-0 mb-6">
            <ImpressionObserver
              itemId={featured.heroKey}
              item={featured.item}
              onImpression={(itemId, item) => {
                if (firedImpressions.current.has(itemId)) return;
                firedImpressions.current.add(itemId);
                trackSignal(item, 'feed_hero_impression');
              }}
            >
              <HeroBanner
                featured={featured}
                onPrimary={onHeroPrimary}
                onSecondary={onHeroSecondary}
              />
            </ImpressionObserver>
            </div>
          ) : null}
          <div style={{ padding: '12px 16px 0' }}>
            <FeedFilterBar
              types={availableTypes} selectedTypes={feedTypes}
              onToggleType={(t) => setFeedTypes(p => p.includes(t) ? p.filter(x=>x!==t) : [...p,t])}
              arrondissements={availableArrs} selectedArr={feedArr} onSetArr={setFeedArr}
              searchText={feedSearch} onSetSearch={setFeedSearch}
              resultCount={totalFilteredCount}
              onClear={() => { setFeedSearch(''); setFeedTypes([]); setFeedArr(null); }}
            />
          </div>
          <div style={{ paddingLeft: 0, paddingRight: 0 }}>
          <FeedRail
            title="En vogue cette semaine"
            icon="🔥"
            items={filteredTrending}
            hasMore={!hasActiveFilter && cursors.trending < allItemsRef.current.trending.length}
            onLoadMore={() => loadMoreForRail('trending')}
            isLoadingMore={loadingMore.trending}
            renderItem={renderTalentOrCheckpoint}
            emptyLabel="Pas encore de tendances"
          />
          <FeedRail
            title="Nouveautés"
            icon="🌱"
            items={filteredNewItems}
            hasMore={!hasActiveFilter && cursors.newItems < allItemsRef.current.newItems.length}
            onLoadMore={() => loadMoreForRail('newItems')}
            isLoadingMore={loadingMore.newItems}
            renderItem={renderTalentOrCheckpoint}
            emptyLabel="Aucune nouveauté récente"
          />
          <FeedRail
            title="Sessions ouvertes"
            icon="🎮"
            items={rails.openSessions}
            hasMore={cursors.openSessions < allItemsRef.current.openSessions.length}
            onLoadMore={() => loadMoreForRail('openSessions')}
            isLoadingMore={loadingMore.openSessions}
            renderItem={(item) => wrapWithImpression(item,
              <OpenSessionCard item={item} onTrack={trackSignal} />
            )}
            emptyLabel="Aucune session ouverte"
          />
          <FeedRail
            title="Sessions récentes"
            icon="⭐"
            items={rails.doneSessions}
            hasMore={cursors.doneSessions < allItemsRef.current.doneSessions.length}
            onLoadMore={() => loadMoreForRail('doneSessions')}
            isLoadingMore={loadingMore.doneSessions}
            renderItem={(item) => wrapWithImpression(item,
              <DoneSessionCard item={item} onTrack={trackSignal} />
            )}
            emptyLabel="Aucune session terminée récente"
          />
          </div>
        </>
      )}
    </div>
  );
}