import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Loader2, Search, X, ChevronRight } from 'lucide-react';

export default function StyleTechTree({ 
  domainKey, 
  roleSystemId, 
  selectedStyles, 
  onSelectionChange 
}) {
  const [loading, setLoading] = useState(true);
  const [tree, setTree] = useState([]);
  const [flatIndex, setFlatIndex] = useState({});
  const [searchQuery, setSearchQuery] = useState('');
  
  const [focusedL1, setFocusedL1] = useState(null);
  const [focusedL2, setFocusedL2] = useState(null);

  useEffect(() => {
    if (domainKey) {
      loadTree();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [domainKey, roleSystemId]);

  const loadTree = async () => {
    setLoading(true);
    try {
      const result = await base44.functions.invoke('getStyleTree', {
        domainKey,
        roleSystemId: roleSystemId || undefined
      });
      
      setTree(result.data.tree || []);
      setFlatIndex(result.data.flatIndex || {});
      
      // Auto-focus premier L1 si disponible
      if (result.data.tree.length > 0) {
        setFocusedL1(result.data.tree[0].id);
      }
    } catch (error) {
      console.error('Load tree error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleStyle = (styleId, level) => {
    const node = flatIndex[styleId];
    if (!node) return;

    // Règles de sélection
    if (level === 3) {
      // L3 toujours sélectionnable
      toggleSelection(styleId);
      return;
    }

    if (level === 2) {
      // L2 sélectionnable si aucun L3 enfant
      const l2Node = findNodeInTree(styleId);
      if (!l2Node || l2Node.children.length === 0) {
        toggleSelection(styleId);
      }
      return;
    }

    if (level === 1) {
      // L1 sélectionnable si aucun enfant
      const l1Node = tree.find(n => n.id === styleId);
      if (!l1Node || l1Node.children.length === 0) {
        toggleSelection(styleId);
      }
    }
  };

  const toggleSelection = (styleId) => {
    const newSelection = { ...selectedStyles };
    
    if (newSelection[styleId]) {
      delete newSelection[styleId];
    } else {
      newSelection[styleId] = { active: true, weight: 50 };
    }
    
    onSelectionChange(newSelection);
  };

  const handleWeightChange = (styleId, weight) => {
    onSelectionChange({
      ...selectedStyles,
      [styleId]: { active: true, weight }
    });
  };

  const handleClearAll = () => {
    onSelectionChange({});
  };

  const findNodeInTree = (nodeId) => {
    for (const l1 of tree) {
      if (l1.id === nodeId) return l1;
      for (const l2 of l1.children) {
        if (l2.id === nodeId) return l2;
        for (const l3 of l2.children) {
          if (l3.id === nodeId) return l3;
        }
      }
    }
    return null;
  };

  const isStyleSelectable = (styleId, level) => {
    if (level === 3) return true;
    
    const node = findNodeInTree(styleId);
    if (!node) return false;
    
    return node.children.length === 0;
  };

  const filteredTree = searchQuery.trim() 
    ? tree.filter(l1 => {
        const matchL1 = l1.label.toLowerCase().includes(searchQuery.toLowerCase());
        const matchL2 = l1.children.some(l2 => 
          l2.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
          l2.children.some(l3 => l3.label.toLowerCase().includes(searchQuery.toLowerCase()))
        );
        return matchL1 || matchL2;
      })
    : tree;

  const selectedCount = Object.keys(selectedStyles).length;

  const rarityColors = {
    common: 'bg-gray-100 text-gray-700 border-gray-300',
    rare: 'bg-blue-100 text-blue-700 border-blue-300',
    epic: 'bg-purple-100 text-purple-700 border-purple-300',
    legendary: 'bg-yellow-100 text-yellow-700 border-yellow-300'
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Selection Bar */}
      {selectedCount > 0 && (
        <Card className="bg-indigo-50 border-indigo-200">
          <CardContent className="py-4">
            <div className="flex items-center justify-between mb-3">
              <span className="font-semibold text-indigo-900">
                {selectedCount} style(s) sélectionné(s)
              </span>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleClearAll}
                className="text-red-600 border-red-300 hover:bg-red-50"
              >
                <X className="w-3 h-3 mr-1" />
                Tout effacer
              </Button>
            </div>
            <div className="space-y-3">
              {Object.keys(selectedStyles).map(styleId => {
                const node = flatIndex[styleId];
                const pref = selectedStyles[styleId];
                if (!node) return null;
                
                return (
                  <div key={styleId} className="flex items-center gap-3 bg-white rounded p-2">
                    <Badge className={rarityColors[node.rarityTier || 'common']}>
                      {node.label}
                    </Badge>
                    <div className="flex items-center gap-2 flex-1">
                      <Slider
                        value={[pref.weight || 50]}
                        onValueChange={(val) => handleWeightChange(styleId, val[0])}
                        min={0}
                        max={100}
                        step={10}
                        className="flex-1"
                      />
                      <span className="text-sm font-medium w-8 text-gray-700">
                        {pref.weight || 50}
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleSelection(styleId)}
                      className="text-gray-500 hover:text-red-600"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <Input
          placeholder="Rechercher un style..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Tech Tree Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Column 1: Level 1 */}
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-gray-600 mb-2">Racines (Level 1)</h3>
          {filteredTree.map(l1 => {
            const isFocused = focusedL1 === l1.id;
            const isSelected = selectedStyles[l1.id];
            const isSelectable = isStyleSelectable(l1.id, 1);
            
            return (
              <Card
                key={l1.id}
                className={`
                  cursor-pointer transition-all
                  ${isFocused ? 'ring-2 ring-indigo-500 bg-indigo-50' : 'hover:bg-gray-50'}
                  ${isSelected ? 'border-green-500 bg-green-50' : ''}
                `}
                onClick={() => {
                  setFocusedL1(l1.id);
                  setFocusedL2(null);
                }}
              >
                <CardContent className="p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="font-medium">{l1.label}</div>
                      <div className="text-xs text-gray-500 mt-1">
                        {l1.children.length} sous-genre(s)
                      </div>
                    </div>
                    {isSelectable && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleStyle(l1.id, 1);
                        }}
                        className={`
                          w-5 h-5 rounded border-2 flex items-center justify-center
                          ${isSelected ? 'bg-green-500 border-green-500' : 'border-gray-300'}
                        `}
                      >
                        {isSelected && <span className="text-white text-xs">✓</span>}
                      </button>
                    )}
                    {l1.children.length > 0 && (
                      <ChevronRight className="w-4 h-4 text-gray-400 ml-2" />
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Column 2: Level 2 */}
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-gray-600 mb-2">Genres (Level 2)</h3>
          {focusedL1 && (() => {
            const l1Node = tree.find(n => n.id === focusedL1);
            if (!l1Node) return null;
            
            return l1Node.children.map(l2 => {
              const isFocused = focusedL2 === l2.id;
              const isSelected = selectedStyles[l2.id];
              const isSelectable = isStyleSelectable(l2.id, 2);
              
              return (
                <Card
                  key={l2.id}
                  className={`
                    cursor-pointer transition-all
                    ${isFocused ? 'ring-2 ring-indigo-500 bg-indigo-50' : 'hover:bg-gray-50'}
                    ${isSelected ? 'border-green-500 bg-green-50' : ''}
                  `}
                  onClick={() => setFocusedL2(l2.id)}
                >
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="font-medium text-sm">{l2.label}</div>
                        <div className="text-xs text-gray-500 mt-1">
                          {l2.children.length} variation(s)
                        </div>
                      </div>
                      {isSelectable && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleStyle(l2.id, 2);
                          }}
                          className={`
                            w-5 h-5 rounded border-2 flex items-center justify-center
                            ${isSelected ? 'bg-green-500 border-green-500' : 'border-gray-300'}
                          `}
                        >
                          {isSelected && <span className="text-white text-xs">✓</span>}
                        </button>
                      )}
                      {l2.children.length > 0 && (
                        <ChevronRight className="w-4 h-4 text-gray-400 ml-2" />
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            });
          })()}
        </div>

        {/* Column 3: Level 3 */}
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-gray-600 mb-2">Variations (Level 3)</h3>
          {focusedL2 && (() => {
            const l2Node = findNodeInTree(focusedL2);
            if (!l2Node) return null;
            
            return l2Node.children.map(l3 => {
              const isSelected = selectedStyles[l3.id];
              
              return (
                <button
                  key={l3.id}
                  onClick={() => handleToggleStyle(l3.id, 3)}
                  className={`
                    w-full text-left p-2 rounded border-2 transition-all
                    ${isSelected 
                      ? 'border-green-500 bg-green-50' 
                      : 'border-gray-200 hover:border-gray-300 bg-white'
                    }
                  `}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{l3.label}</span>
                    <div className={`
                      w-4 h-4 rounded border-2 flex items-center justify-center
                      ${isSelected ? 'bg-green-500 border-green-500' : 'border-gray-300'}
                    `}>
                      {isSelected && <span className="text-white text-xs">✓</span>}
                    </div>
                  </div>
                </button>
              );
            });
          })()}
        </div>
      </div>

      {tree.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          Aucun style disponible dans ce domaine
        </div>
      )}
    </div>
  );
}