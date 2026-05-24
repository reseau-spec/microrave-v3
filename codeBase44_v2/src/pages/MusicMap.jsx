import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Search, RefreshCw, ZoomIn, ZoomOut, Home } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import StyleGraphCanvas from '../components/musicmap/StyleGraphCanvas';
import { getTaxonomies } from '@/components/taxonomyCache.jsx';
import { FALLBACK_DOMAINS } from '@/hooks/useDomains';

export default function MusicMapPage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [domains, setDomains] = useState([]);
  const [roles, setRoles] = useState([]);
  const [selectedDomain, setSelectedDomain] = useState(null);
  const [selectedRole, setSelectedRole] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [graphData, setGraphData] = useState({ nodes: [], edges: [] });
  const [selectedNodes, setSelectedNodes] = useState([]);
  const [regenerating, setRegenerating] = useState(false);

  useEffect(() => {
    init();
  }, []);

  useEffect(() => {
    if (selectedDomain) {
      loadGraph();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDomain, selectedRole]);

  const init = async () => {
    try {
      const currentUser = await base44.auth.me();
      setUser(currentUser);

      // v2 — chargé depuis l'entité Domain en DB via taxonomyCache
      const cache = await getTaxonomies();
      const raw = (cache.domains || []).length > 0 ? cache.domains : FALLBACK_DOMAINS;
      const domainsList = raw.map(d => ({
        key:   d.key,
        label: d.labelFr || d.label || d.key,
        icon:  d.icon || '',
      }));
      setDomains(domainsList);

      if (domainsList.length > 0) {
        setSelectedDomain(domainsList[0].key);
      }
    } catch (error) {
      console.error('Init error:', error);
      toast({
        title: 'Erreur',
        description: 'Impossible de charger les domaines',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const loadGraph = async () => {
    if (!selectedDomain) return;

    setLoading(true);
    try {
      const payload = { domainKey: selectedDomain };
      if (selectedRole) {
        payload.roleSystemId = selectedRole;
      }

      const result = await base44.functions.invoke('getStyleGraph', payload);
      setGraphData({
        nodes: result.data.nodes || [],
        edges: result.data.edges || []
      });

      // Charger rôles pour ce domaine
      if (!selectedRole) {
        const rolesRes = await base44.functions.invoke('getRolesForDomain', { domainKey: selectedDomain });
        setRoles(rolesRes.data.roles || []);
      }
    } catch (error) {
      console.error('Load graph error:', error);
      toast({
        title: 'Erreur',
        description: 'Impossible de charger le graphe',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRegenerateLayout = async () => {
    if (!selectedDomain) return;

    setRegenerating(true);
    try {
      const result = await base44.functions.invoke('generateStyleGraphLayout', {
        domainKey: selectedDomain
      });

      toast({
        title: 'Layout régénéré',
        description: `${result.data.created} créés, ${result.data.updated} mis à jour`
      });

      // Recharger le graphe
      await loadGraph();
    } catch (error) {
      console.error('Regenerate error:', error);
      toast({
        title: 'Erreur',
        description: error?.response?.data?.error || 'Impossible de régénérer',
        variant: 'destructive'
      });
    } finally {
      setRegenerating(false);
    }
  };

  const handleNodeToggle = (nodeId) => {
    setSelectedNodes(prev => 
      prev.includes(nodeId)
        ? prev.filter(id => id !== nodeId)
        : [...prev, nodeId]
    );
  };

  const filteredNodes = searchQuery.trim()
    ? graphData.nodes.filter(node =>
        node.label.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : graphData.nodes;

  const highlightedNodeIds = new Set(filteredNodes.map(n => n.id));

  if (loading && !selectedDomain) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 p-4">
        <div className="container mx-auto">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">🗺️ MusicMap</h1>
              <p className="text-sm text-gray-600">Carte interactive des styles</p>
            </div>

            <div className="flex items-center gap-2">
              <Badge variant="secondary">
                {filteredNodes.length} / {graphData.nodes.length} styles
              </Badge>
              <Badge variant="secondary">
                {selectedNodes.length} sélectionné(s)
              </Badge>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <label className="text-xs text-gray-600 mb-1 block">Domaine</label>
              <Select value={selectedDomain || ''} onValueChange={setSelectedDomain}>
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionner..." />
                </SelectTrigger>
                <SelectContent>
                  {domains.map(d => (
                    <SelectItem key={d.key} value={d.key}>
                      {d.icon} {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-xs text-gray-600 mb-1 block">Rôle (optionnel)</label>
              <Select value={selectedRole || ''} onValueChange={setSelectedRole}>
                <SelectTrigger>
                  <SelectValue placeholder="Tous" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={null}>Tous</SelectItem>
                  {roles.map(r => (
                    <SelectItem key={r.systemId} value={r.systemId}>
                      {r.nameFr}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-xs text-gray-600 mb-1 block">Recherche</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  placeholder="Filtrer styles..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>

            <div className="flex items-end gap-2">
              {user?.role === 'admin' && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRegenerateLayout}
                  disabled={regenerating || !selectedDomain}
                  className="flex-1"
                >
                  {regenerating && <Loader2 className="w-3 h-3 mr-2 animate-spin" />}
                  <RefreshCw className="w-3 h-3 mr-2" />
                  Régénérer
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Canvas */}
      <div className="flex-1 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
          </div>
        ) : graphData.nodes.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <Card className="max-w-md">
              <CardContent className="py-8 text-center text-gray-500">
                Aucun style trouvé pour ce domaine
              </CardContent>
            </Card>
          </div>
        ) : (
          <StyleGraphCanvas
            nodes={graphData.nodes}
            edges={graphData.edges}
            selectedNodes={selectedNodes}
            highlightedNodeIds={highlightedNodeIds}
            onNodeToggle={handleNodeToggle}
          />
        )}
      </div>
    </div>
  );
}