import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RefreshCw, Shield, AlertTriangle } from 'lucide-react';
import MomentStatusBreakdown from '../components/admin/MomentStatusBreakdown';
import TopCheckpointsMomentum from '../components/admin/TopCheckpointsMomentum';
import RecentMomentsLog from '../components/admin/RecentMomentsLog';
import ScenesOverview from '../components/admin/ScenesOverview';
import RSIDashboard from '../components/admin/RSIDashboard';

export default function Admin() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [moments, setMoments] = useState([]);
  const [scenes, setScenes] = useState([]);
  const [liveStatsList, setLiveStatsList] = useState([]);
  const [checkpointIndex, setCheckpointIndex] = useState(new Map());
  const [lastRefresh, setLastRefresh] = useState(null);

  // Pipeline run states
  const [activeTab, setActiveTab] = useState('pipeline');
  const [pipelineRunning, setPipelineRunning] = useState(false);
  const [pipelineResult, setPipelineResult] = useState(null);

  useEffect(() => {
    base44.auth.me().then(u => setUser(u)).catch(() => setUser(null));
  }, []);

  const loadData = async () => {
    setRefreshing(true);
    try {
      const [moms, scns, stats, cps] = await Promise.all([
        base44.entities.CulturalMoment.list('-updated_date', 100),
        base44.entities.Scene.list('-lastComputedAt', 50),
        base44.entities.CheckpointLiveStats.list('-momentumScore', 50),
        base44.entities.Checkpoint.filter({ active: true }),
      ]);
      setMoments(moms || []);
      setScenes(scns || []);
      setLiveStatsList(stats || []);
      setCheckpointIndex(new Map((cps || []).map(cp => [cp.systemId, cp])));
      setLastRefresh(new Date());
    } catch (e) {
      console.error(e);
    }
    setRefreshing(false);
  };

  useEffect(() => {
    loadData().finally(() => setLoading(false));
  }, []);

  const runPipeline = async () => {
    setPipelineRunning(true);
    setPipelineResult(null);
    try {
      const r1 = await base44.functions.invoke('recomputeCheckpointLiveStats', {});
      const r2 = await base44.functions.invoke('recomputeCulturalMoments', {});
      const r3 = await base44.functions.invoke('recomputeScenes', {});
      setPipelineResult({ ok: true, liveStats: r1.data, moments: r2.data, scenes: r3.data });
      await loadData();
    } catch (e) {
      setPipelineResult({ ok: false, error: e.message });
    }
    setPipelineRunning(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <RefreshCw className="w-6 h-6 animate-spin text-indigo-500" />
      </div>
    );
  }

  if (!user || user.role !== 'admin') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <Shield className="w-12 h-12 text-red-400" />
        <h2 className="text-xl font-bold text-gray-800">Accès restreint</h2>
        <p className="text-gray-500">Cette page est réservée aux administrateurs.</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Shield className="w-5 h-5 text-indigo-500" /> Admin — Pipeline Dashboard
          </h1>
          {lastRefresh && (
            <p className="text-xs text-gray-400 mt-1">
              Dernière màj : {lastRefresh.toLocaleTimeString('fr-CA')}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={loadData} disabled={refreshing} className="gap-2">
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            Rafraîchir
          </Button>
          <Button size="sm" onClick={runPipeline} disabled={pipelineRunning} className="gap-2 bg-indigo-600 hover:bg-indigo-700">
            <RefreshCw className={`w-4 h-4 ${pipelineRunning ? 'animate-spin' : ''}`} />
            {pipelineRunning ? 'Pipeline en cours…' : 'Lancer le pipeline'}
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24, borderBottom: '2px solid #e5e7eb', paddingBottom: 0 }}>
        {[{ key: 'pipeline', label: '⚙️ Pipeline' }, { key: 'rsi', label: '📡 RSI' }].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              fontSize: 13, fontWeight: 600, padding: '8px 18px',
              border: 'none', background: 'none', cursor: 'pointer',
              borderBottom: activeTab === tab.key ? '2px solid #6366f1' : '2px solid transparent',
              color: activeTab === tab.key ? '#6366f1' : '#6b7280',
              marginBottom: -2,
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Pipeline result banner */}
      {pipelineResult && (
        <div className={`mb-6 px-4 py-3 rounded-lg text-sm font-medium flex items-center gap-3 ${pipelineResult.ok ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {pipelineResult.ok ? (
            <>
              ✅ Pipeline terminé —{' '}
              LiveStats: {JSON.stringify(pipelineResult.liveStats)} ·{' '}
              Moments: {JSON.stringify(pipelineResult.moments)} ·{' '}
              Scenes: {JSON.stringify(pipelineResult.scenes)}
            </>
          ) : (
            <><AlertTriangle className="w-4 h-4" /> Erreur pipeline : {pipelineResult.error}</>
          )}
        </div>
      )}

      {activeTab === 'pipeline' && (
        <>
          {/* Row 1 — KPI */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">
            <MomentStatusBreakdown moments={moments} />
            <ScenesOverview scenes={scenes} />
          </div>

          {/* Row 2 — Top checkpoints + log */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <TopCheckpointsMomentum liveStatsList={liveStatsList} checkpointIndex={checkpointIndex} />
            <RecentMomentsLog moments={moments} />
          </div>
        </>
      )}

      {activeTab === 'rsi' && (
        <RSIDashboard />
      )}
    </div>
  );
}