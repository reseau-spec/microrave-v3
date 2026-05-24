import React, { useRef, useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';

const NODE_RADIUS = 8;
const NODE_LABEL_OFFSET = 15;

export default function StyleGraphCanvas({ 
  nodes, 
  edges, 
  selectedNodes, 
  highlightedNodeIds, 
  onNodeToggle 
}) {
  const containerRef = useRef(null);
  const [viewBox, setViewBox] = useState({ x: 0, y: 0, width: 1000, height: 800 });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [hoveredNode, setHoveredNode] = useState(null);

  useEffect(() => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setViewBox({ x: 0, y: 0, width: rect.width, height: rect.height });
    }
  }, []);

  const handleWheel = (e) => {
    e.preventDefault();
    const delta = e.deltaY * -0.001;
    const newZoom = Math.max(0.2, Math.min(3, zoom + delta));
    setZoom(newZoom);
  };

  const handleMouseDown = (e) => {
    if (e.button === 0 && e.target.tagName === 'svg') {
      setIsDragging(true);
      setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  };

  const handleMouseMove = (e) => {
    if (isDragging) {
      setPan({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleNodeClick = (nodeId, level) => {
    // Règles de sélection
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return;

    if (level === 3) {
      onNodeToggle(nodeId);
      return;
    }

    if (level === 2) {
      const hasChildren = nodes.some(n => n.parent === nodeId && n.level === 3);
      if (!hasChildren) {
        onNodeToggle(nodeId);
      }
      return;
    }

    if (level === 1) {
      const hasChildren = nodes.some(n => n.parent === nodeId);
      if (!hasChildren) {
        onNodeToggle(nodeId);
      }
    }
  };

  const isNodeSelectable = (nodeId, level) => {
    if (level === 3) return true;
    
    const hasChildren = nodes.some(n => n.parent === nodeId);
    if (level === 2) {
      return !nodes.some(n => n.parent === nodeId && n.level === 3);
    }
    if (level === 1) {
      return !hasChildren;
    }
    return false;
  };

  const transform = `translate(${pan.x}, ${pan.y}) scale(${zoom})`;

  const rarityColors = {
    common: '#9CA3AF',
    rare: '#3B82F6',
    epic: '#A855F7',
    legendary: '#EAB308'
  };

  const levelColors = {
    1: '#4F46E5',
    2: '#8B5CF6',
    3: '#06B6D4'
  };

  return (
    <div 
      ref={containerRef}
      className="relative w-full h-full bg-gray-100 overflow-hidden"
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
    >
      <svg 
        width="100%" 
        height="100%"
        style={{ display: 'block' }}
      >
        <g transform={transform}>
          {/* Edges */}
          {edges.map(edge => {
            const sourceNode = nodes.find(n => n.id === edge.source);
            const targetNode = nodes.find(n => n.id === edge.target);
            
            if (!sourceNode || !targetNode) return null;

            const isHighlighted = 
              highlightedNodeIds.has(edge.source) && 
              highlightedNodeIds.has(edge.target);

            return (
              <line
                key={edge.id}
                x1={sourceNode.x}
                y1={sourceNode.y}
                x2={targetNode.x}
                y2={targetNode.y}
                stroke={isHighlighted ? '#6B7280' : '#E5E7EB'}
                strokeWidth={isHighlighted ? 2 : 1}
                opacity={isHighlighted ? 0.6 : 0.3}
              />
            );
          })}

          {/* Nodes */}
          {nodes.map(node => {
            const isSelected = selectedNodes.includes(node.id);
            const isHighlighted = highlightedNodeIds.has(node.id);
            const isSelectable = isNodeSelectable(node.id, node.level);
            const isHovered = hoveredNode === node.id;

            const nodeColor = isSelected 
              ? '#10B981' 
              : rarityColors[node.rarityTier] || levelColors[node.level];

            return (
              <g key={node.id}>
                {/* Node circle */}
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={isHovered ? NODE_RADIUS * 1.5 : NODE_RADIUS}
                  fill={nodeColor}
                  stroke={isSelected ? '#059669' : '#FFFFFF'}
                  strokeWidth={isSelected ? 3 : 2}
                  opacity={isHighlighted ? 1 : 0.3}
                  style={{ 
                    cursor: isSelectable ? 'pointer' : 'default',
                    transition: 'all 0.2s'
                  }}
                  onClick={() => handleNodeClick(node.id, node.level)}
                  onMouseEnter={() => setHoveredNode(node.id)}
                  onMouseLeave={() => setHoveredNode(null)}
                />

                {/* Node label */}
                {isHighlighted && (
                  <text
                    x={node.x}
                    y={node.y + NODE_LABEL_OFFSET}
                    textAnchor="middle"
                    fontSize="12"
                    fill="#374151"
                    fontWeight={isSelected ? 'bold' : 'normal'}
                    pointerEvents="none"
                  >
                    {node.label}
                  </text>
                )}

                {/* Hover tooltip */}
                {isHovered && (
                  <g>
                    <rect
                      x={node.x + 15}
                      y={node.y - 30}
                      width={150}
                      height={60}
                      fill="white"
                      stroke="#D1D5DB"
                      strokeWidth={1}
                      rx={4}
                    />
                    <text x={node.x + 20} y={node.y - 12} fontSize="11" fill="#1F2937" fontWeight="bold">
                      {node.label}
                    </text>
                    <text x={node.x + 20} y={node.y + 2} fontSize="9" fill="#6B7280">
                      Level {node.level}
                    </text>
                    <text x={node.x + 20} y={node.y + 14} fontSize="9" fill="#6B7280">
                      {node.rarityTier || 'common'}
                    </text>
                    {node.parent && (
                      <text x={node.x + 20} y={node.y + 26} fontSize="8" fill="#9CA3AF">
                        Parent: {node.parent.slice(0, 10)}...
                      </text>
                    )}
                  </g>
                )}
              </g>
            );
          })}
        </g>
      </svg>

      {/* Controls overlay */}
      <div className="absolute bottom-4 right-4 bg-white rounded-lg shadow-lg p-2 space-y-1">
        <button
          onClick={() => setZoom(z => Math.min(3, z + 0.2))}
          className="flex items-center justify-center w-8 h-8 hover:bg-gray-100 rounded"
          title="Zoom in"
        >
          +
        </button>
        <button
          onClick={() => setZoom(z => Math.max(0.2, z - 0.2))}
          className="flex items-center justify-center w-8 h-8 hover:bg-gray-100 rounded"
          title="Zoom out"
        >
          −
        </button>
        <button
          onClick={() => {
            setZoom(1);
            setPan({ x: 0, y: 0 });
          }}
          className="flex items-center justify-center w-8 h-8 hover:bg-gray-100 rounded"
          title="Reset"
        >
          ⌂
        </button>
      </div>

      {/* Legend */}
      <div className="absolute top-4 right-4 bg-white rounded-lg shadow-lg p-3 space-y-2 text-xs">
        <div className="font-semibold text-gray-900 mb-2">Légende</div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: levelColors[1] }} />
          <span>Level 1 (Racine)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: levelColors[2] }} />
          <span>Level 2 (Genre)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: levelColors[3] }} />
          <span>Level 3 (Sous-genre)</span>
        </div>
        <hr className="my-2" />
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-green-500" />
          <span>Sélectionné</span>
        </div>
      </div>
    </div>
  );
}