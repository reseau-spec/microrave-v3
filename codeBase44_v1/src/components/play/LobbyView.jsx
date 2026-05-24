import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Users } from 'lucide-react';
import CheckpointPicker from './CheckpointPicker';

export default function LobbyView({
  session,
  user,
  participants,
  userReady,
  profile,
  lobbyRole,
  setLobbyRole,
  lobbyStyles,
  availableStyleIds,
  availableStylesForRole,
  profilesCache,
  roleLabels,
  styleLabels,
  filteredCheckpoints,
  checkpointSearch,
  onCheckpointSearchChange,
  selectedCheckpoint,
  checkpointLabels,
  handleToggleReady,
  handleLaunch,
  handleCancelQueue,
  handleCheckpointPick,
  toggleLobbyStyle,
  isLobbyDirty,
  canBeReady,
  actionLoading,
  normalizeId,
  asArray,
}) {
  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-6 h-6 text-indigo-600" />
            Lobby — Ready Check
          </CardTitle>
          <CardDescription>
            {participants.length}/{session?.maxPlayers || 6} participant(s)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {participants.map((p) => {
            const pid = normalizeId(p?.userId);
            const isMe = pid === user.id;
            const participantProfile = profilesCache[pid];
            const displayName = isMe
              ? user.full_name || `Joueur ${String(pid).slice(-4)}`
              : participantProfile?.displayName || `Joueur ${String(pid).slice(-4)}`;
            const roleId = normalizeId(p?.roleSystemId);
            const statusBadge = p.status === 'ready' ? 'Prêt' : p.status === 'lobby' ? 'En lobby' : 'Attente';

            return (
              <div key={pid} className="border rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-lg">{isMe ? `${displayName} (Vous)` : displayName}</span>
                  <Badge className={p.status === 'ready' ? 'bg-green-500' : 'bg-gray-400'}>{statusBadge}</Badge>
                </div>

                {isMe ? (
                  <div className="space-y-3">
                    <div>
                      <Label className="text-xs text-gray-600 mb-1 block">Rôle</Label>
                      <Select
                        value={lobbyRole}
                        onValueChange={(value) => {
                          isLobbyDirty.current = true;
                          setLobbyRole(value);
                        }}
                        disabled={userReady}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Sélectionner..." />
                        </SelectTrigger>
                        <SelectContent>
                          {(profile?.activeRoles || []).map((r) => {
                            const rid = normalizeId(r);
                            if (!rid) return null;
                            return (
                              <SelectItem key={rid} value={rid}>
                                {roleLabels[rid] || rid}
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label className="text-xs text-gray-600 mb-2 block">Styles (multi-sélection)</Label>
                      {!lobbyRole && <p className="text-xs text-gray-500 italic py-2">Sélectionnez d&apos;abord un rôle</p>}
                      {lobbyRole && availableStyleIds.length === 0 && (
                        <p className="text-xs text-yellow-600 italic py-2">Aucun style disponible pour ce rôle.</p>
                      )}
                      <div className="flex flex-wrap gap-2">
                        {availableStyleIds.map((sid) => {
                          const isSelected = lobbyStyles.includes(sid);
                          return (
                            <Button
                              key={sid}
                              type="button"
                              size="sm"
                              variant={isSelected ? 'default' : 'outline'}
                              className={isSelected ? 'bg-indigo-600 hover:bg-indigo-700' : 'hover:bg-gray-100'}
                              disabled={userReady}
                              onClick={() => toggleLobbyStyle(sid)}
                            >
                              {styleLabels[sid] || sid}
                            </Button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2 text-sm text-gray-600">
                    <div><span className="font-medium">Rôle:</span> {roleId ? roleLabels[roleId] || roleId : '—'}</div>
                    <div>
                      <span className="font-medium">Styles:</span>{' '}
                      {(() => {
                        const pStyleIds = asArray(p?.styleSystemIds).map(normalizeId).filter(Boolean);
                        const pStyleId = normalizeId(p?.styleSystemId);
                        const finalStyleIds = pStyleIds.length > 0 ? pStyleIds : pStyleId ? [pStyleId] : [];
                        return finalStyleIds.length > 0 ? finalStyleIds.map((x) => styleLabels[x] || x).join(', ') : '—';
                      })()}
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {!canBeReady && !userReady && (
            <div className="bg-yellow-50 border border-yellow-200 rounded p-3 text-sm text-yellow-800">
              Choisissez un rôle et au moins 1 style avant de vous marquer prêt.
            </div>
          )}

          <div className="border rounded-lg p-4 bg-gray-50 space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold">🗺️ Carte / Checkpoint</Label>
              <Badge variant="outline" className="text-xs">
                👑 Capitaine {user?.id === session?.captainUserId ? '(Vous)' : ''}
              </Badge>
            </div>

            {!lobbyRole ? (
              <div className="bg-yellow-50 border border-yellow-200 rounded p-3 text-sm text-yellow-800">
                Sélectionne d&apos;abord un rôle pour voir les cartes compatibles
              </div>
            ) : (
              <CheckpointPicker
                checkpoints={[]}
                filteredCheckpoints={filteredCheckpoints}
                checkpointSearch={checkpointSearch}
                onSearchChange={onCheckpointSearchChange}
                selectedSystemId={session?.checkpointSystemId || ''}
                onPick={handleCheckpointPick}
                isCaptain={user?.id === session?.captainUserId}
                isLocked={!!session?.lockedAt}
                selectedCheckpoint={selectedCheckpoint}
                checkpointLabels={checkpointLabels}
                session={session}
              />
            )}
          </div>

          <div className="grid grid-cols-1 gap-3">
            <Button onClick={handleToggleReady} disabled={actionLoading} className="w-full" variant={userReady ? 'outline' : 'default'}>
              {actionLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {userReady ? 'Annuler prêt' : 'Je suis prêt'}
            </Button>

            {(() => {
              const isCaptain = user?.id === session?.captainUserId;
              const allReady = participants.every((p) => p.status === 'ready');
              const hasMinPlayers = participants.length >= (session?.minPlayers || 2);
              const hasCheckpoint = !!session?.checkpointSystemId;
              const canLaunch = isCaptain && allReady && hasMinPlayers && hasCheckpoint;

              let tooltip = '';
              if (!isCaptain) tooltip = 'Seul le capitaine peut lancer';
              else if (!hasCheckpoint) tooltip = 'Choisis une carte pour lancer';
              else if (!allReady) tooltip = 'Tous doivent être prêts';
              else if (!hasMinPlayers) tooltip = 'Pas assez de joueurs';

              return (
                <Button
                  onClick={handleLaunch}
                  disabled={!canLaunch || actionLoading}
                  className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-300"
                  title={tooltip}
                >
                  {actionLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  {isCaptain ? '🚀 Lancer la session' : '🔒 Lancer (capitaine uniquement)'}
                </Button>
              );
            })()}

            <Button variant="outline" onClick={handleCancelQueue} disabled={actionLoading} className="w-full">
              Quitter le lobby
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}