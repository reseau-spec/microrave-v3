import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Loader2, Trophy, Medal, Award } from 'lucide-react';
import { getTaxonomies } from '@/components/taxonomyCache.jsx';
import { FALLBACK_DOMAINS } from '@/hooks/useDomains';

export default function LeaderboardPage() {
  const [domains, setDomains] = useState([]);
  const [selectedDomain, setSelectedDomain] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDomains();
  }, []);

  const loadDomains = async () => {
    try {
      // v2 — chargé depuis l'entité Domain en DB via taxonomyCache
      const cache = await getTaxonomies();
      const domainsList = (cache.domains || []).length > 0
        ? cache.domains
        : FALLBACK_DOMAINS;
      // Normaliser le format pour rétrocompatibilité ({ key, label, icon })
      const normalized = domainsList.map(d => ({
        key:   d.key,
        label: d.labelFr || d.label || d.key,
        icon:  d.icon || '',
      }));
      setDomains(normalized);
      if (normalized.length > 0) {
        setSelectedDomain(normalized[0].key);
      }
    } catch (error) {
      console.error('Load domains error:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2 flex items-center gap-2">
          <Trophy className="w-8 h-8 text-yellow-500" />
          Leaderboard
        </h1>
        <p className="text-gray-600">Classement des talents par domaine</p>
      </div>

      {domains.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-gray-500">
            Aucun domaine disponible
          </CardContent>
        </Card>
      ) : (
        <Tabs value={selectedDomain} onValueChange={setSelectedDomain} className="w-full">
          <TabsList className="w-full grid mb-6" style={{ gridTemplateColumns: `repeat(${Math.min(domains.length, 5)}, minmax(0, 1fr))` }}>
            {domains.slice(0, 5).map(domain => (
              <TabsTrigger key={domain.key} value={domain.key}>
                {domain.icon} {domain.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {domains.map(domain => (
            <TabsContent key={domain.key} value={domain.key}>
              <LeaderboardPanel domainKey={domain.key} domainLabel={domain.label} />
            </TabsContent>
          ))}
        </Tabs>
      )}
    </div>
  );
}

function LeaderboardPanel({ domainKey, domainLabel }) {
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState([]);

  useEffect(() => {
    loadLeaderboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [domainKey]);

  const loadLeaderboard = async () => {
    setLoading(true);
    try {
      const result = await base44.functions.invoke('getLeaderboard', {
        domainKey,
        limit: 50
      });

      setItems(result.data.items || []);
    } catch (error) {
      console.error('Leaderboard error:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-gray-500">
          Aucune donnée de classement pour {domainLabel}
        </CardContent>
      </Card>
    );
  }

  const getRankIcon = (rank) => {
    if (rank === 1) return <Trophy className="w-5 h-5 text-yellow-500" />;
    if (rank === 2) return <Medal className="w-5 h-5 text-gray-400" />;
    if (rank === 3) return <Award className="w-5 h-5 text-orange-600" />;
    return null;
  };

  const getRankBadgeColor = (rank) => {
    if (rank === 1) return 'bg-yellow-100 text-yellow-800 border-yellow-300';
    if (rank === 2) return 'bg-gray-100 text-gray-700 border-gray-300';
    if (rank === 3) return 'bg-orange-100 text-orange-700 border-orange-300';
    return 'bg-gray-50 text-gray-600 border-gray-200';
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Top 50 — {domainLabel}</CardTitle>
        <CardDescription>{items.length} talent(s) classé(s)</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {items.map((item) => (
            <div
              key={item.userId}
              className={`
                flex items-center justify-between p-4 rounded-lg border-2 transition-all
                ${item.rank <= 3 ? 'bg-gradient-to-r from-white to-gray-50' : 'bg-white'}
                hover:shadow-md
              `}
            >
              <div className="flex items-center gap-4">
                <Badge
                  variant="outline"
                  className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-base border-2 ${getRankBadgeColor(item.rank)}`}
                >
                  {getRankIcon(item.rank) || `#${item.rank}`}
                </Badge>

                <div>
                  <div className="font-semibold text-lg text-gray-900">
                    {item.displayName}
                  </div>
                  <div className="text-sm text-gray-500">
                    {item.sessionsCount} session(s) • {item.sotsSubmittedCount} vote(s)
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-4">
                {item.avgSotsScore > 0 && (
                  <div className="text-center">
                    <div className="text-xs text-gray-500">Avg SOTS</div>
                    <Badge variant="secondary" className="mt-1">
                      {item.avgSotsScore.toFixed(1)} / 5
                    </Badge>
                  </div>
                )}

                <div className="text-right">
                  <div className="text-xs text-gray-500">Points</div>
                  <div className="text-2xl font-bold text-indigo-600">
                    {item.points.toLocaleString()}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}