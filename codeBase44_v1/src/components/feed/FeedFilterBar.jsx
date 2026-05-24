/**
 * FeedFilterBar — barre de filtre légère pour le Feed.
 * 
 * Réutilise la même logique de filtre qu'Explore (type, arrondissement, search)
 * sans dupliquer les données — filtre sur allItemsRef déjà en mémoire.
 * 
 * Props :
 *   types          — string[]  — types de checkpoint disponibles
 *   selectedTypes  — string[]  — types actifs
 *   onToggleType   — (type) => void
 *   arrondissements — string[] — arrondissements disponibles
 *   selectedArr    — string|null
 *   onSetArr       — (arr|null) => void
 *   searchText     — string
 *   onSetSearch    — (text) => void
 *   resultCount    — number — nb d'items après filtre
 *   onClear        — () => void
 */
import React, { useState } from 'react';
import { Search, X, SlidersHorizontal, ChevronDown } from 'lucide-react';

const TYPE_EMOJI = {
  'Bar': '🍺', 'Bistro': '🥂', 'Club': '🎶', 'Cabaret': '🎭',
  'Pub': '🍻', 'Karaoké': '🎤', 'Microbrasserie': '🍺',
  'Coworking': '💼', 'Salle de spectacle': '🎪',
  "Gérance d'artistes": '🎨', 'Radio et télévision': '📻',
};

export default function FeedFilterBar({
  types = [],
  selectedTypes = [],
  onToggleType,
  arrondissements = [],
  selectedArr = null,
  onSetArr,
  searchText = '',
  onSetSearch,
  resultCount,
  onClear,
}) {
  const [showTypes, setShowTypes] = useState(false);
  const [showArr, setShowArr] = useState(false);

  const hasActiveFilters = selectedTypes.length > 0 || selectedArr || searchText.trim();

  return (
    <div style={{ marginBottom: 16 }}>
      {/* Search + toggle row */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
        {/* Search input */}
        <div style={{
          flex: 1, display: 'flex', alignItems: 'center', gap: 8,
          background: '#f9fafb', border: '1px solid #e5e7eb',
          borderRadius: 10, padding: '7px 12px',
        }}>
          <Search size={14} color="#9ca3af" style={{ flexShrink: 0 }} />
          <input
            type="text"
            value={searchText}
            onChange={e => onSetSearch(e.target.value)}
            placeholder="Rechercher un lieu, une ambiance..."
            style={{
              flex: 1, border: 'none', background: 'transparent',
              fontSize: 13, outline: 'none', color: '#374151',
            }}
          />
          {searchText && (
            <button onClick={() => onSetSearch('')} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 0 }}>
              <X size={13} color="#9ca3af" />
            </button>
          )}
        </div>

        {/* Type filter button */}
        <button
          onClick={() => { setShowTypes(v => !v); setShowArr(false); }}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '7px 12px', borderRadius: 10, border: '1px solid',
            borderColor: selectedTypes.length > 0 ? '#6366f1' : '#e5e7eb',
            background: selectedTypes.length > 0 ? '#eef2ff' : '#f9fafb',
            color: selectedTypes.length > 0 ? '#6366f1' : '#6b7280',
            fontSize: 12, fontWeight: selectedTypes.length > 0 ? 600 : 400,
            cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
          }}
        >
          <SlidersHorizontal size={13} />
          Type{selectedTypes.length > 0 ? ` (${selectedTypes.length})` : ''}
          <ChevronDown size={11} style={{ transform: showTypes ? 'rotate(180deg)' : 'none', transition: '0.2s' }} />
        </button>

        {/* Arrondissement filter button — seulement si données disponibles */}
        {arrondissements.length > 0 && (
          <button
            onClick={() => { setShowArr(v => !v); setShowTypes(false); }}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '7px 12px', borderRadius: 10, border: '1px solid',
              borderColor: selectedArr ? '#6366f1' : '#e5e7eb',
              background: selectedArr ? '#eef2ff' : '#f9fafb',
              color: selectedArr ? '#6366f1' : '#6b7280',
              fontSize: 12, fontWeight: selectedArr ? 600 : 400,
              cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
            }}
          >
            📍 {selectedArr ? selectedArr.split('–')[0].trim() : 'Quartier'}
            <ChevronDown size={11} style={{ transform: showArr ? 'rotate(180deg)' : 'none', transition: '0.2s' }} />
          </button>
        )}
      </div>

      {/* Type pills dropdown */}
      {showTypes && (
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: 6, padding: '10px 12px',
          background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10,
          marginBottom: 8,
        }}>
          {types.map(t => {
            const active = selectedTypes.includes(t);
            return (
              <button
                key={t}
                onClick={() => onToggleType(t)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  padding: '4px 10px', borderRadius: 20, fontSize: 12,
                  border: '1px solid', cursor: 'pointer',
                  borderColor: active ? '#6366f1' : '#e5e7eb',
                  background: active ? '#eef2ff' : '#f9fafb',
                  color: active ? '#6366f1' : '#374151',
                  fontWeight: active ? 600 : 400,
                }}
              >
                {TYPE_EMOJI[t] || '📍'} {t}
              </button>
            );
          })}
          {selectedTypes.length > 0 && (
            <button
              onClick={() => selectedTypes.forEach(t => onToggleType(t))}
              style={{ padding: '4px 10px', borderRadius: 20, fontSize: 11, border: '1px solid #fca5a5', background: '#fef2f2', color: '#ef4444', cursor: 'pointer' }}
            >
              Effacer
            </button>
          )}
        </div>
      )}

      {/* Arrondissement dropdown */}
      {showArr && (
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: 6, padding: '10px 12px',
          background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10,
          marginBottom: 8,
        }}>
          {arrondissements.map(a => {
            const active = selectedArr === a;
            return (
              <button
                key={a}
                onClick={() => { onSetArr(active ? null : a); setShowArr(false); }}
                style={{
                  padding: '4px 10px', borderRadius: 20, fontSize: 12, cursor: 'pointer',
                  border: '1px solid',
                  borderColor: active ? '#6366f1' : '#e5e7eb',
                  background: active ? '#eef2ff' : '#f9fafb',
                  color: active ? '#6366f1' : '#374151',
                  fontWeight: active ? 600 : 400,
                }}
              >
                {a}
              </button>
            );
          })}
        </div>
      )}

      {/* Active filters summary */}
      {hasActiveFilters && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#6b7280' }}>
          <span>{resultCount} résultat{resultCount !== 1 ? 's' : ''}</span>
          <span>·</span>
          <button onClick={onClear} style={{ color: '#6366f1', border: 'none', background: 'none', cursor: 'pointer', fontSize: 11, padding: 0 }}>
            Effacer les filtres
          </button>
        </div>
      )}
    </div>
  );
}