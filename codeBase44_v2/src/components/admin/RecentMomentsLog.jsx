import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Activity } from 'lucide-react';

const STATUS_COLORS = {
  seeded: 'bg-slate-100 text-slate-600',
  rising: 'bg-yellow-100 text-yellow-700',
  live:   'bg-green-100 text-green-700',
  peak:   'bg-purple-100 text-purple-700',
  fading: 'bg-orange-100 text-orange-600',
  closed: 'bg-gray-100 text-gray-500',
};

function timeAgo(iso) {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'à l\'instant';
  if (m < 60) return `${m}min`;
  return `${Math.floor(m / 60)}h${m % 60 > 0 ? String(m % 60).padStart(2, '0') : ''}`;
}

export default function RecentMomentsLog({ moments }) {
  const sorted = [...moments]
    .sort((a, b) => new Date(b.updated_date || b.startedAt) - new Date(a.updated_date || a.startedAt))
    .slice(0, 12);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Activity className="w-4 h-4 text-indigo-500" />
          Activité récente
        </CardTitle>
      </CardHeader>
      <CardContent>
        {sorted.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-4">Aucun moment enregistré</p>
        )}
        <div className="divide-y divide-gray-50">
          {sorted.map(m => (
            <div key={m.id} className="flex items-start gap-3 py-2.5">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-800 font-medium truncate">{m.headline || m.momentKey}</p>
                <p className="text-xs text-gray-400 mt-0.5 truncate">{m.subheadline}</p>
              </div>
              <div className="flex flex-col items-end gap-1 flex-shrink-0">
                <Badge className={`text-xs font-semibold px-2 py-0.5 rounded-full border-0 ${STATUS_COLORS[m.status] || 'bg-gray-100 text-gray-500'}`}>
                  {m.status}
                </Badge>
                <span className="text-xs text-gray-400">{timeAgo(m.updated_date || m.startedAt)}</span>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}