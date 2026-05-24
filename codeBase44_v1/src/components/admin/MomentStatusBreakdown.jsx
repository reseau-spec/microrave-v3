import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Zap } from 'lucide-react';

const STATUS_CONFIG = {
  seeded:    { label: 'Seeded',   color: '#94A3B8', bg: '#F1F5F9' },
  rising:    { label: 'Rising',   color: '#F59E0B', bg: '#FFFBEB' },
  live:      { label: 'Live',     color: '#10B981', bg: '#ECFDF5' },
  peak:      { label: 'Peak',     color: '#8B5CF6', bg: '#F5F3FF' },
  fading:    { label: 'Fading',   color: '#F97316', bg: '#FFF7ED' },
  closed:    { label: 'Closed',   color: '#6B7280', bg: '#F9FAFB' },
};

export default function MomentStatusBreakdown({ moments }) {
  const counts = {};
  for (const m of moments) {
    counts[m.status] = (counts[m.status] || 0) + 1;
  }
  const active = moments.filter(m => ['rising', 'live', 'peak'].includes(m.status)).length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Zap className="w-4 h-4 text-yellow-500" />
          Cultural Moments
          <span className="ml-auto text-2xl font-bold text-green-600">{active}</span>
          <span className="text-sm font-normal text-gray-400">actifs</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-2">
          {Object.entries(STATUS_CONFIG).map(([status, cfg]) => (
            <div key={status} className="rounded-lg px-3 py-2 flex flex-col items-center" style={{ backgroundColor: cfg.bg }}>
              <span className="text-xl font-bold" style={{ color: cfg.color }}>{counts[status] || 0}</span>
              <span className="text-xs text-gray-500 mt-0.5">{cfg.label}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}