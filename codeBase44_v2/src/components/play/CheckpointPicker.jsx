import React, { useMemo, useCallback } from 'react';
import { Search, MapPin, Crown, Lock } from 'lucide-react';
import ExploreMapGL from '../explore/ExploreMapGL';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DEFAULT_CENTER, DEFAULT_ZOOM } from '../../map/checkpointMapUtils';

export default function CheckpointPicker({
  checkpoints = [],
  filteredCheckpoints = [],
  checkpointSearch = '',
  onSearchChange,
  selectedSystemId = '',
  onPick,
  title = 'Checkpoint',
  description = 'Choisis ton lieu avec la recherche, la liste ou la carte.',
  className = '',
  selectedCheckpoint = null,
  isCaptain = false,
  isLocked = false,
  checkpointLabels = null,
  session = null,
}) {
  const canEdit = isCaptain && !isLocked;

  const effectiveCheckpoints = useMemo(() => {
    if (Array.isArray(filteredCheckpoints)) return filteredCheckpoints;
    if (Array.isArray(checkpoints)) return checkpoints;
    return [];
  }, [filteredCheckpoints, checkpoints]);

  const resolvedSelectedCheckpoint = useMemo(() => {
    if (selectedCheckpoint) return selectedCheckpoint;
    if (!selectedSystemId) return null;

    return (
      effectiveCheckpoints.find((cp) => (cp?.systemId || cp?.id) === selectedSystemId) ||
      checkpoints.find((cp) => (cp?.systemId || cp?.id) === selectedSystemId) ||
      null
    );
  }, [selectedCheckpoint, selectedSystemId, effectiveCheckpoints, checkpoints]);

  const handlePick = useCallback(
    (checkpointId) => {
      if (!checkpointId) return;
      if (!canEdit) return;
      if (checkpointId === selectedSystemId) return;
      onPick?.(checkpointId);
    },
    [canEdit, selectedSystemId, onPick]
  );

  const mapCheckpoints = useMemo(() => {
    if (!selectedSystemId) return effectiveCheckpoints;

    const selectedOnly = effectiveCheckpoints.filter(
      (cp) => (cp?.systemId || cp?.id) === selectedSystemId
    );

    if (selectedOnly.length > 0) return selectedOnly;

    const fallbackSelected = checkpoints.filter(
      (cp) => (cp?.systemId || cp?.id) === selectedSystemId
    );

    return fallbackSelected.length > 0 ? fallbackSelected : effectiveCheckpoints;
  }, [effectiveCheckpoints, checkpoints, selectedSystemId]);

  const emptyStateText = useMemo(() => {
    if ((checkpointSearch || '').trim()) {
      return 'Aucun checkpoint trouvé pour cette recherche';
    }
    return 'Aucun checkpoint trouvé';
  }, [checkpointSearch]);

  return (
    <div className={`space-y-4 ${className}`}>
      <div>
        <Label className="text-sm font-medium">{title}</Label>
        {description ? <p className="text-xs text-gray-500 mt-1">{description}</p> : null}

        <div className="mt-2 space-y-1">
          {!isCaptain && (
            <div className="flex items-center gap-2 text-xs text-amber-600">
              <Crown className="w-3.5 h-3.5" />
              <span>Seul le capitaine peut choisir le checkpoint.</span>
            </div>
          )}

          {isLocked && (
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <Lock className="w-3.5 h-3.5" />
              <span>Le checkpoint est verrouillé pour cette session.</span>
            </div>
          )}
        </div>
      </div>

      <div className="relative">
        <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="text"
          value={checkpointSearch || ''}
          onChange={(e) => onSearchChange?.(e.target.value)}
          placeholder="Rechercher un lieu, une vibe, une ville..."
          disabled={!canEdit}
          className="w-full h-11 rounded-xl border border-gray-200 bg-white pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-violet-500 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed"
        />
      </div>

      <div className="space-y-1">
        <Label className="text-xs text-gray-500">Choix rapide</Label>
        <Select
          value={selectedSystemId || ''}
          onValueChange={canEdit ? handlePick : undefined}
          disabled={!canEdit}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Choisir un checkpoint" />
          </SelectTrigger>
          <SelectContent className="max-h-80">
            {effectiveCheckpoints.map((cp) => {
              const cpId = cp?.systemId || cp?.id;
              if (!cpId) return null;

              return (
                <SelectItem key={cpId} value={cpId}>
                  {cp.name || 'Checkpoint'}
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <Label className="text-xs text-gray-500">Carte</Label>
        <div className="relative h-52 rounded-2xl border border-gray-200 overflow-hidden bg-gray-50">
          <ExploreMapGL
            checkpoints={mapCheckpoints}
            selectedId={selectedSystemId || null}
            onCheckpointClick={canEdit ? handlePick : undefined}
            compact={true}
            center={DEFAULT_CENTER}
            zoom={DEFAULT_ZOOM}
          />
        </div>
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <Label className="text-xs text-gray-500">Liste complète</Label>
          <span className="text-xs text-gray-400">
            {effectiveCheckpoints.length} checkpoint{effectiveCheckpoints.length > 1 ? 's' : ''}
          </span>
        </div>

        <div className="border border-gray-200 rounded-2xl overflow-hidden bg-white">
          <div className="max-h-72 overflow-y-auto overscroll-contain">
            {effectiveCheckpoints.length === 0 ? (
              <div className="px-4 py-8 text-sm text-gray-400 text-center">
                {emptyStateText}
              </div>
            ) : (
              effectiveCheckpoints.map((cp) => {
                const cpId = cp?.systemId || cp?.id;
                if (!cpId) return null;

                const isSelected = selectedSystemId === cpId;

                return (
                  <button
                    key={cpId}
                    type="button"
                    onClick={() => canEdit && handlePick(cpId)}
                    disabled={!canEdit}
                    className={`w-full text-left px-4 py-3 border-b last:border-b-0 transition ${
                      isSelected
                        ? 'bg-violet-50 border-violet-100'
                        : 'bg-white hover:bg-gray-50'
                    } ${!canEdit ? 'opacity-60 cursor-not-allowed' : ''}`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-gray-900 truncate">
                          {cp.name || 'Checkpoint'}
                        </div>
                        <div className="text-xs text-gray-500 truncate">
                          <span>{cp.type || 'Lieu'}</span>
                          {cp.vibe ? <span> · {cp.vibe}</span> : null}
                          {cp.city || cp.ville ? <span> · {cp.city || cp.ville}</span> : null}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0">
                        {isSelected ? (
                          <span className="text-xs font-semibold text-violet-600">
                            Sélectionné
                          </span>
                        ) : (
                          <MapPin className="w-4 h-4 text-gray-300" />
                        )}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>

      {resolvedSelectedCheckpoint ? (
        <div className="rounded-2xl border border-violet-100 bg-violet-50 px-4 py-3">
          <div className="text-xs text-violet-600 font-semibold mb-1">
            Checkpoint sélectionné
          </div>

          <div className="text-sm font-semibold text-gray-900">
            {resolvedSelectedCheckpoint.name || 'Checkpoint'}
          </div>

          <div className="text-xs text-gray-500 mt-1">
            {resolvedSelectedCheckpoint.type || 'Lieu'}
            {resolvedSelectedCheckpoint.vibe ? ` · ${resolvedSelectedCheckpoint.vibe}` : ''}
            {resolvedSelectedCheckpoint.city || resolvedSelectedCheckpoint.ville
              ? ` · ${resolvedSelectedCheckpoint.city || resolvedSelectedCheckpoint.ville}`
              : ''}
          </div>

          {checkpointLabels?.selected ? (
            <div className="text-[11px] text-violet-500 mt-2">
              {checkpointLabels.selected}
            </div>
          ) : null}
        </div>
      ) : null}

      {session?.captainUserId ? (
        <div className="text-[11px] text-gray-400">
          Le choix du checkpoint suit la logique de capitaine de la session.
        </div>
      ) : null}
    </div>
  );
}