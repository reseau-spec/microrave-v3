import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Loader2, Target, MapPin, Trophy } from 'lucide-react';
import MissionCard from '../components/missions/MissionCard';
import TerritorialLeaderboard from '../components/leaderboard/TerritorialLeaderboard';
import { useDomains } from '@/hooks/useDomains';

export default function Missions() {
  const domainsFromDB = useDomains(); // v2 — depuis DB
  // Ajouter "Toutes" en tête de liste
  const DOMAIN_FILTERS = [
    { key: null, label: 'Toutes' },
    ...domainsFromDB.map(d => ({ key: d.key, label: `${d.icon} ${d.labelFr}` })),
  ];
  const [missions, setMissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [claimMsg, setClaimMsg] = useState(null);
  const [domainFilter, setDomainFilter] = useState(null);
  const [tab, setTab] = useState('missions');

  const loadMissions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await base44.functions.invoke('getMissionsForUser', {}).catch(() => ({ data: { missions: [] } }));
      setMissions(res.data?.missions || []);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadMissions(); }, [loadMissions]);

  const handleClaim = async (mission) => {
    // Mark as claimed
    try {
      const progressId = mission.progressId;
      if (!progressId) return;
      const service = base44;
      await base44.entities.MissionProgress.update(progressId, {
        status: 'claimed',
        claimedAt: new Date().toISOString(),
      });
      setClaimMsg(`🎉 "${mission.title}" réclamée ! +${mission.rewardXp} XP${mission.rewardBadge ? ` · Badge: ${mission.rewardBadge}` : ''}`);
      setTimeout(() => setClaimMsg(null), 5000);
      loadMissions();
    } catch (e) {
      console.error(e);
    }
  };

  const filtered = missions.filter(m => !domainFilter || m.domainKey === domainFilter);
  const inProgress = filtered.filter(m => m.status === 'in_progress' || (m.completionPct > 0 && m.status === 'not_started')).length;
  const completed = filtered.filter(m => m.status === 'completed').length;

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Target className="w-6 h-6 text-indigo-600" />
          Missions & Leaderboard
        </h1>
        <p className="text-sm text-gray-500 mt-1">Explore ta ville, complète des missions, monte dans le classement.</p>
      </div>

      {/* Claim notification */}
      {claimMsg && (
        <div className="mb-4 px-4 py-3 bg-green-50 border border-green-200 rounded-xl text-sm font-medium text-green-800 flex items-center gap-2">
          {claimMsg}
        </div>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-6">
          <TabsTrigger value="missions" className="gap-2">
            <Target className="w-4 h-4" /> Missions
            {completed > 0 && <Badge className="bg-green-500 text-white text-xs px-1.5 border-0">{completed}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="leaderboard" className="gap-2">
            <MapPin className="w-4 h-4" /> Leaderboard Territorial
          </TabsTrigger>
        </TabsList>

        <TabsContent value="missions">
          {/* Domain filter pills */}
          <div className="flex gap-2 flex-wrap mb-5">
            {DOMAIN_FILTERS.map(f => (
              <button
                key={String(f.key)}
                onClick={() => setDomainFilter(f.key)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                  domainFilter === f.key
                    ? 'bg-indigo-600 text-white shadow'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Stats summary */}
          {!loading && (
            <div className="flex gap-4 mb-5 text-sm text-gray-500">
              <span><span className="font-bold text-gray-900">{inProgress}</span> en cours</span>
              <span><span className="font-bold text-green-600">{completed}</span> à réclamer</span>
              <span><span className="font-bold text-gray-900">{filtered.length}</span> total</span>
            </div>
          )}

          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <Trophy className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="font-medium">Aucune mission disponible</p>
              <p className="text-sm mt-1">Les missions seront créées par un administrateur.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filtered.map(m => (
                <MissionCard key={m.id} mission={m} onClaim={handleClaim} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="leaderboard">
          {/* Domain filter for leaderboard */}
          <div className="flex gap-2 flex-wrap mb-5">
            {DOMAIN_FILTERS.map(f => (
              <button
                key={String(f.key)}
                onClick={() => setDomainFilter(f.key)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                  domainFilter === f.key
                    ? 'bg-indigo-600 text-white shadow'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <TerritorialLeaderboard domainKey={domainFilter} />
        </TabsContent>
      </Tabs>
    </div>
  );
}