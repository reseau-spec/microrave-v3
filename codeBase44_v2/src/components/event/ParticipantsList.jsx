import React from 'react';
import { Badge } from '@/components/ui/badge';

export default function ParticipantsList({ participants, slots, roleMap, profileMap, currentUserId }) {
  if (!participants.length) {
    return <p className="text-gray-400 text-sm">Aucun participant encore.</p>;
  }
  return (
    <div className="space-y-2">
      {participants.map(p => {
        const role = roleMap[p.roleSystemId];
        const mySlot = slots.find(s => s.slotId === p.slotId);
        const myCandidate =
          mySlot?.candidates?.find(c => c.userId === p.userId) ||
          (mySlot?.candidateUserId === p.userId ? { status: mySlot?.status } : null);
        const slotStatus = myCandidate?.status || mySlot?.status;
        const prof = profileMap[p.userId];
        const name = prof?.displayName || `Joueur …${(p.userId || '').slice(-4)}`;
        const isMe = p.userId === currentUserId;

        return (
          <div key={p.userId} className="border rounded-lg p-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-7 h-7 rounded-full flex-shrink-0 overflow-hidden bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center">
                  {prof?.avatarUrl ? (
                    <img src={prof.avatarUrl} alt={name} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-white text-xs font-bold">{name[0]?.toUpperCase()}</span>
                  )}
                </div>
                <span className="font-medium text-gray-900 truncate">
                  {isMe ? `${name} (Vous)` : name}
                </span>
              </div>
              <Badge
                variant="outline"
                className={`flex-shrink-0 ${
                  slotStatus === 'confirmed' ? 'border-green-400 text-green-700' : 'border-yellow-300 text-yellow-700'
                }`}
              >
                {slotStatus === 'confirmed' ? '✓ Confirmé' : '⏳ En attente'}
              </Badge>
            </div>
            <div className="mt-1.5 text-xs text-gray-500">
              {role?.nameFr || p.roleSystemId}
            </div>
          </div>
        );
      })}
    </div>
  );
}