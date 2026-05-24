import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Layers } from 'lucide-react';

const DOMAIN_LABELS = {
  music: '🎵 Musique', humour: '🎭 Humour', photo: '📷 Photo',
  video: '🎬 Vidéo', food: '🍽️ Bouffe', art: '🎨 Art', responsable: '🌿 Responsable',
};

export default function ScenesOverview({ scenes }) {
  const active = scenes.filter(s => s.active);
  const byDomain = {};
  for (const s of active) byDomain[s.domainKey] = (byDomain[s.domainKey] || 0) + 1;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Layers className="w-4 h-4 text-indigo-500" />
          Scenes actives
          <span className="ml-auto text-2xl font-bold text-indigo-600">{active.length}</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {active.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-2">Aucune scène active</p>
        )}
        <div className="space-y-2">
          {Object.entries(byDomain).sort((a, b) => b[1] - a[1]).map(([dk, count]) => (
            <div key={dk} className="flex items-center justify-between">
              <span className="text-sm text-gray-700">{DOMAIN_LABELS[dk] || dk}</span>
              <span className="text-sm font-semibold text-gray-900">{count}</span>
            </div>
          ))}
        </div>
        {active.length > 0 && (
          <div className="mt-3 pt-3 border-t border-gray-100">
            <p className="text-xs text-gray-400">
              {scenes.filter(s => !s.active).length} scène(s) inactive(s) · Dernier calcul{' '}
              {active[0]?.lastComputedAt ? new Date(active[0].lastComputedAt).toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' }) : 'inconnu'}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}