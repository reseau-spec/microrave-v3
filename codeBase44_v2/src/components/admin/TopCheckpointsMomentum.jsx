import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

const DOMAIN_COLORS = {
  music: '#8B5CF6', humour: '#F59E0B', photo: '#3B82F6',
  video: '#EF4444', food: '#F97316', art: '#EC4899',
  responsable: '#10B981', default: '#6366F1',
};
const DOMAIN_LABELS = {
  music: '🎵', humour: '🎭', photo: '📷',
  video: '🎬', food: '🍽️', art: '🎨', responsable: '🌿',
};

export default function TopCheckpointsMomentum({ liveStatsList, checkpointIndex }) {
  const top10 = [...liveStatsList]
    .filter(ls => (ls.momentumScore || 0) > 0)
    .sort((a, b) => (b.momentumScore || 0) - (a.momentumScore || 0))
    .slice(0, 10);

  const maxScore = top10.length > 0 ? top10[0].momentumScore : 1;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Top 10 — Momentum</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {top10.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-4">Aucune donnée de momentum</p>
        )}
        {top10.map((ls, i) => {
          const cp = checkpointIndex.get(ls.checkpointSystemId);
          const name = cp?.name || ls.checkpointSystemId;
          const domain = ls.currentDomainKey;
          const color = DOMAIN_COLORS[domain] || DOMAIN_COLORS.default;
          const pct = maxScore > 0 ? Math.round((ls.momentumScore / maxScore) * 100) : 0;
          const delta = ls.momentumDelta || 0;

          return (
            <div key={ls.checkpointSystemId} className="flex items-center gap-3">
              <span className="text-xs font-bold text-gray-400 w-5 text-right">{i + 1}</span>
              <span className="text-sm w-4">{DOMAIN_LABELS[domain] || '📍'}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-sm font-medium text-gray-800 truncate">{name}</span>
                  <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
                    {delta > 2 ? <TrendingUp className="w-3 h-3 text-green-500" />
                      : delta < -2 ? <TrendingDown className="w-3 h-3 text-red-400" />
                      : <Minus className="w-3 h-3 text-gray-300" />}
                    <span className="text-sm font-bold tabular-nums" style={{ color }}>
                      {Math.round(ls.momentumScore)}
                    </span>
                  </div>
                </div>
                <div className="bg-gray-100 rounded-full h-1.5">
                  <div className="h-1.5 rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
                </div>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}