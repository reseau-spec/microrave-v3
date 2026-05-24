import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Trophy, Medal, Award, MapPin, Zap, Users, TrendingUp } from 'lucide-react';
import { Loader2 } from 'lucide-react';

const DOMAIN_LABELS = {
  music: '🎵 Musique', humour: '🎭 Humour', photo: '📷 Photo',
  video: '🎬 Vidéo', food: '🍽️ Bouffe', art: '🎨 Art', responsable: '🌿 Responsable',
};
const DOMAIN_COLORS = {
  music: '#8B5CF6', humour: '#F59E0B', photo: '#3B82F6',
  video: '#EF4444', food: '#F97316', art: '#EC4899', responsable: '#10B981', default: '#6366F1',
};

function RankIcon({ rank }) {
  if (rank === 1) return <Trophy className="w-5 h-5 text-yellow-500" />;
  if (rank === 2) return <Medal className="w-5 h-5 text-gray-400" />;
  if (rank === 3) return <Award className="w-5 h-5 text-orange-500" />;
  return <span className="text-sm font-bold text-gray-400">#{rank}</span>;
}

export default function TerritorialLeaderboard({ domainKey = null }) {
  const [scenes, setScenes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    base44.functions.invoke('getTerritorialLeaderboard', { domainKey }).catch(() => ({ data: { zones: [] } }))
      .then(r => setScenes(r.data?.scenes || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [domainKey]);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
      </div>
    );
  }

  if (scenes.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-gray-500">
          Aucune zone territoriale disponible — le pipeline recomputeScenes doit tourner d'abord.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <MapPin className="w-4 h-4 text-indigo-500" />
          Leaderboard Territorial
          <span className="ml-auto text-xs text-gray-400">{scenes.length} zones</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {scenes.map(scene => {
          const color = DOMAIN_COLORS[scene.domainKey] || DOMAIN_COLORS.default;
          return (
            <div
              key={scene.id}
              className={`flex items-center gap-3 p-3 rounded-xl border transition-all hover:shadow-sm ${scene.rank <= 3 ? 'bg-gradient-to-r from-white to-gray-50 border-gray-200' : 'bg-white border-gray-100'}`}
            >
              <div className="w-8 flex justify-center flex-shrink-0">
                <RankIcon rank={scene.rank} />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                  <span className="font-semibold text-sm text-gray-900 truncate">{scene.zoneName}</span>
                  <Badge className="text-xs border-0 px-1.5 py-0.5" style={{ backgroundColor: color + '20', color }}>
                    {DOMAIN_LABELS[scene.domainKey]?.split(' ')[0]}
                  </Badge>
                </div>
                <div className="flex items-center gap-3 text-xs text-gray-400">
                  <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{scene.checkpointCount} CP</span>
                  {scene.activeMomentCount > 0 && (
                    <span className="flex items-center gap-1 text-green-600 font-medium">
                      <Zap className="w-3 h-3" />{scene.activeMomentCount} moments
                    </span>
                  )}
                  {scene.totalCheckins24h > 0 && (
                    <span className="flex items-center gap-1"><Users className="w-3 h-3" />{scene.totalCheckins24h} check-ins 24h</span>
                  )}
                </div>
              </div>

              <div className="flex flex-col items-end flex-shrink-0">
                <div className="flex items-center gap-1">
                  <TrendingUp className="w-3.5 h-3.5" style={{ color }} />
                  <span className="text-lg font-bold tabular-nums" style={{ color }}>
                    {scene.territorialScore.toLocaleString()}
                  </span>
                </div>
                <span className="text-xs text-gray-400">pts</span>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}