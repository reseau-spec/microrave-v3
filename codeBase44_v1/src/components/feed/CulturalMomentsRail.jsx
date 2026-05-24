import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Flame, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '../../utils';

const DOMAIN_COLORS = {
  music: 'bg-purple-100 text-purple-800 border-purple-200',
  humour: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  photo: 'bg-blue-100 text-blue-800 border-blue-200',
  video: 'bg-red-100 text-red-800 border-red-200',
  food: 'bg-orange-100 text-orange-800 border-orange-200',
  art: 'bg-pink-100 text-pink-800 border-pink-200',
  responsable: 'bg-green-100 text-green-800 border-green-200',
};

const STATUS_LABELS = {
  rising: { label: 'En hausse', color: 'bg-amber-100 text-amber-800' },
  live: { label: 'Live', color: 'bg-green-100 text-green-800' },
  peak: { label: 'Peak 🔥', color: 'bg-red-100 text-red-800' },
};

function MomentCard({ moment }) {
  const domainStyle = DOMAIN_COLORS[moment.domainKey] || 'bg-gray-100 text-gray-800';
  const statusInfo = STATUS_LABELS[moment.status] || { label: moment.status, color: 'bg-gray-100 text-gray-800' };

  return (
    <div className="flex-shrink-0 w-72 bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow p-4 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Badge className={`${domainStyle} text-xs font-medium`}>{moment.domainLabel}</Badge>
        <Badge className={`${statusInfo.color} text-xs`}>{statusInfo.label}</Badge>
      </div>
      <p className="text-sm font-semibold text-gray-900 leading-snug line-clamp-2">
        {moment.headline || `Moment ${moment.domainLabel} — ${moment.checkpointName}`}
      </p>
      {moment.subheadline && (
        <p className="text-xs text-gray-500 line-clamp-1">{moment.subheadline}</p>
      )}
      <p className="text-xs text-gray-400 mt-auto">{moment.checkpointName}</p>
      <Link to={createPageUrl('Play')}>
        <Button variant="outline" size="sm" className="w-full gap-1 text-xs">
          Explorer <ArrowRight className="w-3 h-3" />
        </Button>
      </Link>
    </div>
  );
}

export default function CulturalMomentsRail() {
  const [moments, setMoments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    base44.functions.invoke('getExploreFeed', { limit: 10 }).catch(() => ({ data: { moments: [] } }))
      .then(res => setMoments(res.data?.moments || []))
      .catch(() => setMoments([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading || moments.length === 0) return null;

  return (
    <section className="mb-10">
      <div className="flex items-center gap-2 mb-4">
        <Flame className="w-5 h-5 text-orange-500" />
        <h2 className="text-lg font-semibold text-gray-800">Moments culturels actifs</h2>
        <span className="text-sm text-gray-400">({moments.length})</span>
      </div>
      <div className="flex gap-4 overflow-x-auto pb-2 -mx-1 px-1">
        {moments.map(m => <MomentCard key={m.id} moment={m} />)}
      </div>
    </section>
  );
}