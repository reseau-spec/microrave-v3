// src/components/profile/CheckpointProfile.jsx

import React, { useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Loader2,
  MapPin,
  TrendingUp,
  Star,
  Users,
  Activity,
  DollarSign,
  Music,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '../../utils';
import { DOMAIN_LABELS } from '../feed/feedScoring';
import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';

const DONE_STATUSES = new Set(['completed', 'sots_submitted', 'archived']);
const OPEN_STATUSES = new Set(['queueing', 'matched', 'lobby', 'ready']);
const SEVEN_DAYS_MS = 7 * 24 * 3600 * 1000;

/* ──────────────────────────────────────────────────────────────────────────────
  Small UI helpers
────────────────────────────────────────────────────────────────────────────── */

function DomainBadge({ domainKey, weight }) {
  const label = DOMAIN_LABELS[domainKey] || domainKey;
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-white/20 text-white">
      {label}
      {weight != null && <span className="opacity-75">{Math.round(weight * 100)}%</span>}
    </span>
  );
}

function SessionMiniCard({ session }) {
  const count = session.participants?.length || 0;
  const sotsScore = session.sessionSotsScore ?? session.sotsGlobalScore;
  const isOpen = OPEN_STATUSES.has(session.status);
  const date = session.actualEndAt ? new Date(session.actualEndAt).toLocaleDateString('fr-CA') : null;

  return (
    <Card className={`${isOpen ? 'border-green-200 bg-green-50/30' : ''}`}>
      <CardContent className="p-3 flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium capitalize">{session.sessionType}</p>
          <p className="text-xs text-gray-500">
            {count} participants · {session.status}
          </p>
          {date && <p className="text-xs text-gray-400">{date}</p>}
        </div>
        <div className="flex items-center gap-1.5">
          {isOpen && <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />}
          {sotsScore > 0 && (
            <Badge variant="secondary" className="flex items-center gap-1 text-xs">
              <Star className="w-3 h-3" />
              {Number(sotsScore).toFixed(1)}
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function TalentMiniCard({ talent, momentum }) {
  const domains = talent.activeDomains || [];
  return (
    <Link to={createPageUrl('Profile') + '?type=talent&id=' + talent.userId}>
      <Card className="hover:shadow-md transition-shadow cursor-pointer">
        <CardContent className="p-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
            <Users className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{talent.displayName}</p>
            <div className="flex flex-wrap gap-1 mt-0.5">
              {domains.slice(0, 3).map((d) => (
                <span key={d} className="text-xs text-gray-500">
                  {DOMAIN_LABELS[d] || d}
                </span>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {momentum > 0 && (
              <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium">
                <TrendingUp className="w-3 h-3" />
                {momentum}
              </span>
            )}
            {talent.sotsGlobalScore > 0 && (
              <span className="flex items-center gap-1 text-xs text-amber-600">
                <Star className="w-3 h-3" />
                {talent.sotsGlobalScore.toFixed(1)}
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

/* ──────────────────────────────────────────────────────────────────────────────
  Tabs
────────────────────────────────────────────────────────────────────────────── */

// PressKit
function PressKitTab({ checkpoint, domainRanking }) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Carte d'identité</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-gray-500">Type</p>
              <p className="font-medium">{checkpoint.type || '—'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Ambiance</p>
              <p className="font-medium capitalize">{checkpoint.vibe || '—'}</p>
            </div>

            <div>
              <p className="text-xs text-gray-500">Difficulté</p>
              <div className="flex gap-1 mt-1">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div
                    key={i}
                    className={`w-3 h-3 rounded-sm ${
                      i <= (checkpoint.difficultyTier || 0) ? 'bg-purple-500' : 'bg-gray-100'
                    }`}
                  />
                ))}
              </div>
            </div>

            <div>
              <p className="text-xs text-gray-500">Rayon couverture</p>
              <p className="font-medium">{checkpoint.radiusKm || 5} km</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Domaines actifs</CardTitle>
        </CardHeader>
        <CardContent>
          {domainRanking.length > 0 ? (
            <div className="space-y-2">
              {domainRanking.map((d, i) => (
                <div key={d.key} className="flex items-center justify-between">
                  <span className="text-sm text-gray-700 flex items-center gap-1">
                    <span className="text-xs text-gray-400 w-4">{i + 1}.</span>
                    {DOMAIN_LABELS[d.key] || d.key}
                  </span>
                  <div className="flex items-center gap-2">
                    <div className="w-24 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-purple-500 rounded-full"
                        style={{ width: `${Math.round((d.weight || 0) * 100)}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-500 w-8 text-right">
                      {Math.round((d.weight || 0) * 100)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400">Aucun domaine enregistré</p>
          )}
        </CardContent>
      </Card>

      {checkpoint.styleTags?.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Styles associés</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {checkpoint.styleTags.map((tag) => (
                <Badge key={tag} variant="outline">
                  {tag}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// Historique
function HistoryTab({ doneSessions }) {
  const [page, setPage] = useState(0);
  const PER_PAGE = 10;
  const total = doneSessions.length;
  const pages = Math.ceil(total / PER_PAGE);
  const visible = doneSessions.slice(page * PER_PAGE, (page + 1) * PER_PAGE);

  useEffect(() => {
    setPage(0);
  }, [total]);

  if (total === 0) {
    return <p className="text-center text-gray-400 py-10">Aucune session enregistrée pour ce lieu</p>;
  }

  return (
    <div className="space-y-3">
      <div className="grid sm:grid-cols-2 gap-3">
        {visible.map((s) => (
          <SessionMiniCard key={s.id} session={s} />
        ))}
      </div>

      {pages > 1 && (
        <div className="flex justify-center gap-2 pt-2">
          {Array.from({ length: pages }).map((_, i) => (
            <button
              key={i}
              onClick={() => setPage(i)}
              className={`w-8 h-8 rounded text-sm ${
                i === page ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {i + 1}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Attestations (badges)
function BadgesTab({ checkpoint, doneSessions, momentum7d }) {
  const sotsScore = Number(checkpoint?.sotsGlobalScore || 0);
  const totalSessions = Number(checkpoint?.totalVotes || 0) || doneSessions.length;

  const badges = [
    {
      key: 'premium',
      label: 'Lieu Premium',
      icon: '⭐',
      earned: sotsScore >= 4.7 && totalSessions >= 20,
      desc: `SOTS ≥ 4.7 et ≥ 20 sessions (actuel: ${sotsScore.toFixed(1)} / ${totalSessions})`,
    },
    {
      key: 'multidomain',
      label: 'Multidisciplinaire',
      icon: '🎨',
      earned: (checkpoint.domainRanking || []).length >= 3,
      desc: `Sessions dans ≥ 3 domaines (actuel: ${(checkpoint.domainRanking || []).length})`,
    },
    {
      key: 'momentum',
      label: 'En Vogue',
      icon: '🔥',
      earned: momentum7d >= 5,
      desc: `≥ 5 sessions sur 7 jours (actuel: ${momentum7d})`,
    },
    {
      key: 'active',
      label: 'Lieu Actif',
      icon: '🟢',
      earned: totalSessions >= 10,
      desc: `≥ 10 sessions au total (actuel: ${totalSessions})`,
    },
  ];

  return (
    <div className="space-y-3">
      {badges.map((b) => (
        <Card key={b.key} className={b.earned ? 'border-amber-200 bg-amber-50/30' : 'opacity-50'}>
          <CardContent className="p-4 flex items-center gap-4">
            <span className="text-3xl">{b.icon}</span>
            <div className="flex-1">
              <p className="font-semibold text-sm">{b.label}</p>
              <p className="text-xs text-gray-500">{b.desc}</p>
            </div>
            {b.earned && <Badge className="bg-amber-500 text-white border-0">Obtenu</Badge>}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// Pricing
function PricingTab({ checkpoint }) {
  const pricing = checkpoint.pricing || null;

  if (!pricing) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-gray-400">
          <DollarSign className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p>Grille tarifaire non configurée</p>
          <p className="text-xs mt-1">Disponible en W3</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Grille tarifaire</CardTitle>
      </CardHeader>
      <CardContent>
        <pre className="text-sm text-gray-700 whitespace-pre-wrap">{JSON.stringify(pricing, null, 2)}</pre>
      </CardContent>
    </Card>
  );
}

// Spirit of the Sound
function SpiritTab({ checkpoint, doneSessions }) {
  const [sotsData, setSotsData] = useState(null);
  const [loading, setLoading] = useState(true);

  const checkpointSystemId = checkpoint?.systemId || null;

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      setLoading(true);
      try {
        if (!checkpointSystemId) {
          if (mounted) setSotsData(null);
          return;
        }

        // Source of truth: SOTSLog.checkpointSystemId = Checkpoint.systemId (snapshot)
        let allLogs = await base44.entities.SOTSLog.filter({ checkpointSystemId }).catch(() => []);

        // Fallback legacy: fetch by sessionId (doneSessions)
        if (allLogs.length === 0 && doneSessions.length > 0) {
          const sessionIds = doneSessions.slice(0, 50).map((s) => s.id);
          const logsArrays = await Promise.all(
            sessionIds.map((sid) => base44.entities.SOTSLog.filter({ sessionId: sid }).catch(() => []))
          );
          allLogs = logsArrays.flat();
        }

        if (allLogs.length === 0) {
          if (mounted) setSotsData(null);
          return;
        }

        // dimensions standard SOTS
        const dims = [
          'funWork',
          'toxicityAvoidance',
          'fairnessResourcefulness',
          'attitudePositivity',
          'communication',
        ];

        // moyennes par dimension
        const totals = Object.fromEntries(dims.map((d) => [d, 0]));
        const counts = Object.fromEntries(dims.map((d) => [d, 0]));

        for (const log of allLogs) {
          for (const d of dims) {
            const v = log?.[d];
            if (v !== null && v !== undefined && !Number.isNaN(Number(v))) {
              totals[d] += Number(v);
              counts[d] += 1;
            }
          }
        }

        const averages = {};
        for (const d of dims) {
          averages[d] = counts[d] > 0 ? totals[d] / counts[d] : 0;
        }

        // score global = moyenne des 5 dimensions
        const globalScore = dims.reduce((sum, d) => sum + (averages[d] || 0), 0) / dims.length;

        // radar data
        const radarData = [
          { dimension: 'Plaisir', value: averages.funWork },
          { dimension: 'Non-toxicité', value: averages.toxicityAvoidance },
          { dimension: 'Équité', value: averages.fairnessResourcefulness },
          { dimension: 'Attitude', value: averages.attitudePositivity },
          { dimension: 'Communication', value: averages.communication },
        ];

        if (mounted) {
          setSotsData({
            globalScore,
            totalVotes: allLogs.length,
            radarData,
            averages,
          });
        }
      } catch (e) {
        console.error('[SpiritTab]', e);
        if (mounted) setSotsData(null);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    load();
    return () => {
      mounted = false;
    };
  }, [checkpointSystemId, doneSessions]);

  const shownGlobal = sotsData?.globalScore ?? 0;
  const pct = Math.max(0, Math.min(100, (shownGlobal / 5) * 100));

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="w-6 h-6 animate-spin text-purple-600" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-gray-500 mb-2">Score SOTS (moyenne sessions tenues ici)</p>

            <div className="h-2 bg-gray-100 rounded-full overflow-hidden mb-3">
              <div className="h-full bg-amber-500 rounded-full" style={{ width: `${pct}%` }} />
            </div>

            <p className="text-4xl font-bold text-amber-600">
              {sotsData?.globalScore != null ? sotsData.globalScore.toFixed(2) : '—'}
            </p>
            <p className="text-xs text-gray-400 mt-1">/ 5.00</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-gray-500 mb-1">Votes SOTS (lieu)</p>
            <p className="text-4xl font-bold text-purple-700">{sotsData?.totalVotes ?? 0}</p>
            <p className="text-xs text-gray-400 mt-1">évaluations</p>
          </CardContent>
        </Card>
      </div>

      {sotsData?.radarData ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Radar SOTS (sessions récentes)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <RadarChart data={sotsData.radarData}>
                <PolarGrid />
                <PolarAngleAxis dataKey="dimension" tick={{ fontSize: 12 }} />
                <PolarRadiusAxis
                  domain={[0, 5]}
                  tickCount={6}
                  angle={90}
                />
                <Radar
                  name="Score"
                  dataKey="value"
                  fillOpacity={0.3}
                />
                <Tooltip formatter={(v) => Number(v).toFixed(2)} />
              </RadarChart>
            </ResponsiveContainer>

          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-10 text-center text-gray-400">
            <Music className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p>Pas encore évalué via les sessions</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────────
  Main component
────────────────────────────────────────────────────────────────────────────── */

export default function CheckpointProfile({ checkpointId, currentUser }) {
  const [loading, setLoading] = useState(true);
  const [checkpoint, setCheckpoint] = useState(null);
  const [openSessions, setOpenSessions] = useState([]);
  const [doneSessions, setDoneSessions] = useState([]);
  const [topTalents, setTopTalents] = useState([]);
  const [momentum7d, setMomentum7d] = useState(0);

  useEffect(() => {
    if (checkpointId) loadCheckpoint();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkpointId]);

  const loadCheckpoint = async () => {
    setLoading(true);
    try {
      // IMPORTANT: unifier sur checkpointSystemId partout
      const [cps, sessions] = await Promise.all([
        base44.entities.Checkpoint.filter({ systemId: checkpointId }),
        base44.entities.Session.filter({ checkpointSystemId: checkpointId }),
      ]);

      const cp = cps?.[0];
      setCheckpoint(cp);
      if (!cp) return;

      const now = Date.now();
      const open = sessions.filter((s) => OPEN_STATUSES.has(s.status));
      const done = sessions
        .filter((s) => DONE_STATUSES.has(s.status))
        .sort((a, b) => (new Date(b.actualEndAt || 0) - new Date(a.actualEndAt || 0)));

      const recent7d = done.filter(
        (s) => s.actualEndAt && new Date(s.actualEndAt).getTime() > now - SEVEN_DAYS_MS
      );

      setOpenSessions(open.slice(0, 6));
      setDoneSessions(done);
      setMomentum7d(recent7d.length);

      // Top talents (7d)
      const talentMomentum = {};
      for (const s of recent7d) {
        for (const p of s.participants || []) {
          const uid = p?.userId || (typeof p === 'string' ? p : null);
          if (uid) talentMomentum[uid] = (talentMomentum[uid] || 0) + 1;
        }
      }

      const sorted = Object.entries(talentMomentum)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 8);

      const topUserIds = sorted.map(([uid]) => uid);

      if (topUserIds.length > 0) {
        const results = await Promise.all(
          topUserIds.map((uid) => base44.entities.TalentProfile.filter({ userId: uid }).catch(() => []))
        );
        const talentProfiles = results.flat();
        const talentMap = new Map(talentProfiles.map((t) => [t.userId, t]));

        setTopTalents(
          sorted
            .map(([uid, mom]) => ({ talent: talentMap.get(uid), momentum: mom }))
            .filter((x) => x.talent)
        );
      } else {
        setTopTalents([]);
      }

      // Signal: object_view (sans userId explicite si ta function le déduit)
      if (currentUser) {
        const domainKeys = (cp.domainRanking || []).map((d) => d.key).filter(Boolean);
        if (cp.domainDominantKey && !domainKeys.includes(cp.domainDominantKey)) {
          domainKeys.unshift(cp.domainDominantKey);
        }
        if (domainKeys.length > 0) {
          base44.functions
            .invoke('recordPreferenceSignal', { domainKeys, reason: 'object_view' })
            .catch(() => {});
        }
      }
    } catch (err) {
      console.error('[CheckpointProfile] load error:', err);
    } finally {
      setLoading(false);
    }
  };

  const domainRanking = useMemo(
    () => (Array.isArray(checkpoint?.domainRanking) ? checkpoint.domainRanking : []),
    [checkpoint]
  );

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (!checkpoint) {
    return <p className="text-center text-gray-500 py-12">Lieu introuvable</p>;
  }

  const sotsScore = Number(checkpoint.sotsGlobalScore || 0);

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl">
      {/* Hero Header */}
      <div className="bg-gradient-to-r from-purple-600 to-pink-600 rounded-xl p-8 mb-8 text-white">
        <div className="flex items-start gap-6">
          <div className="w-20 h-20 rounded-xl bg-white/20 flex items-center justify-center backdrop-blur flex-shrink-0">
            <MapPin className="w-10 h-10" />
          </div>

          <div className="flex-1">
            <h1 className="text-3xl font-bold mb-1">{checkpoint.name}</h1>
            <p className="text-white/70 mb-3">{checkpoint.type || 'Lieu'}</p>

            <div className="flex flex-wrap gap-2 items-center">
              {domainRanking.slice(0, 4).map((d) => (
                <DomainBadge key={d.key} domainKey={d.key} weight={d.weight} />
              ))}
              {checkpoint.vibe && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-white/20 text-white capitalize">
                  {checkpoint.vibe}
                </span>
              )}
            </div>
          </div>

          <div className="text-right flex-shrink-0 space-y-1">
            {momentum7d > 0 && (
              <div className="flex items-center gap-1 text-emerald-300 font-semibold">
                <TrendingUp className="w-4 h-4" />
                {momentum7d} / 7j
              </div>
            )}
            {sotsScore > 0 && (
              <div className="flex items-center gap-1 text-amber-300 font-semibold">
                <Star className="w-4 h-4" />
                {sotsScore.toFixed(2)} SOTS
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="presskit">
        <TabsList className="grid w-full grid-cols-5 mb-6">
          <TabsTrigger value="presskit">PressKit</TabsTrigger>
          <TabsTrigger value="history">Historique</TabsTrigger>
          <TabsTrigger value="badges">Attestations</TabsTrigger>
          <TabsTrigger value="pricing">Pricing</TabsTrigger>
          <TabsTrigger value="sots">Spirit of Sound</TabsTrigger>
        </TabsList>

        <TabsContent value="presskit">
          <div className="grid lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <PressKitTab checkpoint={checkpoint} domainRanking={domainRanking} />
            </div>

            <div className="space-y-4">
              {/* Sessions ouvertes */}
              {openSessions.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                      Sessions ouvertes
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {openSessions.map((s) => (
                      <SessionMiniCard key={s.id} session={s} />
                    ))}
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Activity className="w-4 h-4 text-purple-600" />
                    Activité
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold text-gray-900">{momentum7d}</p>
                  <p className="text-sm text-gray-500">sessions / 7 jours</p>
                </CardContent>
              </Card>

              {/* Top talents */}
              {topTalents.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-emerald-600" />
                      Talents en vogue (7j)
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {topTalents.slice(0, 4).map(({ talent, momentum }) => (
                      <TalentMiniCard key={talent.id} talent={talent} momentum={momentum} />
                    ))}
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="history">
          <HistoryTab doneSessions={doneSessions} />
        </TabsContent>

        <TabsContent value="badges">
          <BadgesTab checkpoint={checkpoint} doneSessions={doneSessions} momentum7d={momentum7d} />
        </TabsContent>

        <TabsContent value="pricing">
          <PricingTab checkpoint={checkpoint} />
        </TabsContent>

        <TabsContent value="sots">
          <SpiritTab checkpoint={checkpoint} doneSessions={doneSessions} />
        </TabsContent>
      </Tabs>
    </div>
  );
}