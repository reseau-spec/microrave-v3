
/**
 * ExploreCommandBar.jsx
 * -----------------------------------------------------------------------------
 * RESPONSABILITÉ
 *   Interface d'intention principale d'Explore.
 *
 * CE COMPOSANT REMPLACE LA SEARCH BAR CLASSIQUE.
 *   On ne demande pas d'abord "où / quand / quoi ?"
 *   On demande :
 *     "Qu'est-ce que tu veux vivre ?"
 *
 * CE COMPOSANT DOIT PERMETTRE 3 MODES :
 *   1. passif     -> suggestions d'intention
 *   2. semi-actif -> tokens manipulés directement
 *   3. actif      -> texte libre transformé en tokens
 *
 * TOKENS OFFICIELS
 *   - arrondissement
 *   - type
 *   - temps
 *   - distance
 *   - searchText
 *   - éventuellement vibe / état
 *
 * GARDE-FOU
 *   Ne pas reconstruire une barre de recherche Airbnb-like.
 *   Le texte libre est un fallback de précision.
 *   L'entrée principale est l'intention guidée.
 */

/**
 * -----------------------------------------------------------------------------
 * CLARIFICATION ARCHITECTURALE — COMMAND BAR ET DOMAINE
 * -----------------------------------------------------------------------------
 *
 * ExploreCommandBar remplace la search bar classique,
 * mais ne remplace pas la structure métier du réseau.
 *
 * RÈGLE
 *   La barre d'intention exprime ce que l'utilisateur veut vivre.
 *   Elle ne doit pas invisibiliser le domaine.
 *
 * LE DOMAINE RESTE CENTRAL CAR IL :
 *   - structure l'offre
 *   - stabilise la lecture culturelle de la carte
 *   - organise les univers Explore
 *
 * MAIS LA COMMAND BAR AJOUTE :
 *   - type
 *   - temps
 *   - territoire
 *   - vibe
 *   - texte libre
 *
 * FORMULE DE RÉFÉRENCE
 *   Le domaine structure. Le contexte déclenche.
 *
 * CONSÉQUENCE
 *   Cette barre doit guider l'intention sans détruire la grammaire du réseau.
 * -----------------------------------------------------------------------------
 */

import React, { useState, useRef } from 'react';
import { X, RotateCcw, Search } from 'lucide-react';
import { TIME_OPTIONS, VIBE_OPTIONS } from '../../hooks/useExploreContext';

// ---------------------------------------------------------------------------
// Composant token pill
// ---------------------------------------------------------------------------

function TokenPill({ token, onRemove }) {
  return (
    <span className="inline-flex items-center gap-1 pl-2 pr-1 py-1 rounded-full bg-indigo-100 text-indigo-800 text-xs font-medium border border-indigo-200">
      {token.icon && <span aria-hidden="true">{token.icon}</span>}
      {token.label}
      {token.removable && (
        <button
          type="button"
          onClick={() => onRemove(token)}
          className="ml-0.5 w-4 h-4 rounded-full flex items-center justify-center hover:bg-indigo-200 transition-colors"
          aria-label={`Retirer ${token.label}`}
        >
          <X className="w-2.5 h-2.5" />
        </button>
      )}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Composant principal
// ---------------------------------------------------------------------------

export default function ExploreCommandBar({
  arrondissement,
  types = [],
  time = 'now',
  searchText = '',
  selectedVibe = null,
  activeTokens = [],
  onSelectVibe,
  onToggleType,
  onSetTime,
  onSetSearchText,
  onRemoveToken,
  onClearAll,
  onOpenArrondissementPicker,
  onOpenTypePicker,
  compact = false,
  // Optionnel — texte de contexte, ex: "6 lieux actifs"
  contextHint = null,
}) {
  const [searchFocused, setSearchFocused] = useState(false);
  const inputRef = useRef(null);

  const currentTimeOption = TIME_OPTIONS.find((o) => o.key === time);

  return (
    <div className="bg-white border-b border-gray-100 shadow-sm flex-shrink-0">
      <div className="px-4 py-3 space-y-3">

        {/* ── A. HEADER INTENTION ── */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-base font-bold text-gray-900 leading-tight">
              Qu'est-ce que tu veux vivre ?
            </p>
            {contextHint && (
              <p className="text-xs text-indigo-500 mt-0.5 font-medium">{contextHint}</p>
            )}
          </div>
          {activeTokens.length > 0 && (
            <button
              type="button"
              onClick={onClearAll}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors"
              aria-label="Réinitialiser tous les filtres"
            >
              <RotateCcw className="w-3 h-3" />
              Réinitialiser
            </button>
          )}
        </div>

        {/* ── B. VIBES ── */}
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-0.5" role="group" aria-label="Vibes">
          {VIBE_OPTIONS.map((vibe) => {
            const isActive = selectedVibe === vibe.key;
            return (
              <button
                key={vibe.key}
                type="button"
                onClick={() => onSelectVibe?.(vibe.key)}
                className={`flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all duration-150 ${
                  isActive
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-300 hover:text-indigo-600'
                }`}
                aria-pressed={isActive}
              >
                <span aria-hidden="true">{vibe.icon}</span>
                {vibe.label}
              </button>
            );
          })}
        </div>

        {/* ── C. TOKENS ACTIFS ── */}
        {activeTokens.length > 0 && (
          <div className="flex flex-wrap gap-1.5" role="list" aria-label="Filtres actifs">
            {activeTokens.map((token) => (
              <div key={`${token.kind}-${token.key}`} role="listitem">
                <TokenPill token={token} onRemove={onRemoveToken} />
              </div>
            ))}
          </div>
        )}

        {/* ── D. TEMPS RAPIDE + CHAMP DE PRÉCISION ── */}
        <div className="flex gap-2 items-center">
          {/* Chips de temps */}
          <div className="flex gap-1 overflow-x-auto no-scrollbar flex-shrink-0" role="group" aria-label="Période">
            {TIME_OPTIONS.map((opt) => {
              const isActive = time === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => onSetTime?.(opt.key)}
                  className={`flex-shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border transition-all duration-150 ${
                    isActive
                      ? 'bg-gray-900 text-white border-gray-900'
                      : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400 hover:text-gray-700'
                  }`}
                  aria-pressed={isActive}
                >
                  <span aria-hidden="true">{opt.icon}</span>
                  {opt.label}
                </button>
              );
            })}
          </div>

          {/* Séparateur */}
          <div className="w-px h-5 bg-gray-200 flex-shrink-0" aria-hidden="true" />

          {/* Champ texte secondaire */}
          <div className={`flex-1 min-w-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border transition-colors ${
            searchFocused ? 'border-indigo-300 bg-indigo-50/50' : 'border-gray-200 bg-gray-50'
          }`}>
            <Search className="w-3 h-3 text-gray-400 flex-shrink-0" aria-hidden="true" />
            <input
              ref={inputRef}
              type="text"
              value={searchText}
              onChange={(e) => onSetSearchText?.(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              placeholder="Préciser un lieu, une ambiance…"
              className="flex-1 min-w-0 text-xs bg-transparent outline-none text-gray-700 placeholder-gray-400"
              aria-label="Préciser la recherche"
            />
            {searchText && (
              <button
                type="button"
                onClick={() => onSetSearchText?.('')}
                className="text-gray-400 hover:text-gray-600"
                aria-label="Effacer la recherche"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}