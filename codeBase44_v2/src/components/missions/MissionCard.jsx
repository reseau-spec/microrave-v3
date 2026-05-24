import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Circle, Trophy, Star, Zap, PlusCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';

const DOMAIN_LABELS = {
  music: '🎵', humour: '🎭', photo: '📷', video: '🎬',
  food: '🍽️', art: '🎨', responsable: '🌿',
};

const OBJ_LABELS = {
  session: 'Session(s)',
  checkin: 'Check-in(s)',
  sots_vote: 'Vote(s) SOTS',
  event_created: 'Événement(s) créé(s)',
};

const STATUS_CONFIG = {
  not_started: { label: 'À démarrer', color: 'bg-gray-100 text-gray-600' },
  in_progress: { label: 'En cours',   color: 'bg-blue-100 text-blue-700' },
  completed:   { label: 'Terminée!',  color: 'bg-green-100 text-green-700' },
  claimed:     { label: 'Réclamée',   color: 'bg-purple-100 text-purple-700' },
};

// Missions qui ont un template CreateEvent associé
const MISSION_TEMPLATE_MAP = {
  'corporate_4a7':    'corporate_4a7',
  'all_night_long':   'all_night_long',
};

export default function MissionCard({ mission, onClaim }) {
  const navigate = useNavigate();
  const cfg = STATUS_CONFIG[mission.status] || STATUS_CONFIG.not_started;
  const isCompleted = mission.status === 'completed';
  const isClaimed   = mission.status === 'claimed';

  // Déduire si cette mission a un template de création d'événement
  const eventTemplate = MISSION_TEMPLATE_MAP[mission.missionKey] || MISSION_TEMPLATE_MAP[mission.missionTemplate] || null;
  const hasEventTrigger = (mission.objectives || []).some(o => o.type === 'event_created') || !!eventTemplate;
  const showCreateEventCTA = hasEventTrigger && eventTemplate && !isClaimed;

  const handleCreateEvent = () => {
    navigate(`${createPageUrl('CreateEvent')}?missionTemplate=${eventTemplate}`);
  };

  return (
    <Card className={`transition-all ${isCompleted ? 'ring-2 ring-green-300' : ''}`}>
      <CardContent className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-1 flex-wrap">
              {mission.domainKey && (
                <span className="text-base">{DOMAIN_LABELS[mission.domainKey]}</span>
              )}
              {mission.zoneName && (
                <span className="text-xs text-gray-500 font-medium">{mission.zoneName}</span>
              )}
              <Badge className={`text-xs border-0 ${cfg.color}`}>{cfg.label}</Badge>
            </div>
            <h3 className="font-bold text-gray-900 leading-tight">{mission.title}</h3>
            {mission.description && (
              <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{mission.description}</p>
            )}
          </div>
          <div className="flex flex-col items-center flex-shrink-0 text-center">
            {isClaimed ? (
              <Trophy className="w-7 h-7 text-yellow-500" />
            ) : (
              <>
                <Star className="w-5 h-5 text-indigo-400" />
                <span className="text-xs font-bold text-indigo-600">+{mission.rewardXp} XP</span>
              </>
            )}
          </div>
        </div>

        {/* Progress bar */}
        <div className="mb-3">
          <div className="flex justify-between mb-1">
            <span className="text-xs text-gray-500">Progression</span>
            <span className="text-xs font-semibold text-gray-700">{mission.completionPct}%</span>
          </div>
          <div className="bg-gray-100 rounded-full h-2">
            <div
              className="h-2 rounded-full transition-all duration-500"
              style={{
                width: `${mission.completionPct}%`,
                backgroundColor: isCompleted || isClaimed ? '#10B981' : '#6366F1',
              }}
            />
          </div>
        </div>

        {/* Objectives */}
        <div className="space-y-1.5 mb-3">
          {(mission.objectives || []).map((obj, i) => (
            <div key={i} className="flex items-center gap-2">
              {obj.done
                ? <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                : <Circle className="w-4 h-4 text-gray-300 flex-shrink-0" />
              }
              <span className={`text-xs ${obj.done ? 'text-green-700 line-through' : 'text-gray-600'}`}>
                {OBJ_LABELS[obj.type] || obj.type}: {obj.current}/{obj.count}
              </span>
            </div>
          ))}
        </div>

        {/* Reward badge */}
        {mission.rewardBadge && (
          <div className="flex items-center gap-1.5 mb-3">
            <Zap className="w-3.5 h-3.5 text-yellow-500" />
            <span className="text-xs text-gray-500">Badge: <span className="font-semibold text-gray-700">{mission.rewardBadge}</span></span>
          </div>
        )}

        {/* CTAs */}
        <div className="flex flex-col gap-2">
          {showCreateEventCTA && (
            <Button
              className="w-full gap-2 bg-indigo-600 hover:bg-indigo-700"
              size="sm"
              onClick={handleCreateEvent}
            >
              <PlusCircle className="w-4 h-4" /> Créer l'événement
            </Button>
          )}
          {isCompleted && onClaim && (
            <Button className="w-full gap-2 bg-green-600 hover:bg-green-700" size="sm" onClick={() => onClaim(mission)}>
              <Trophy className="w-4 h-4" /> Réclamer la récompense
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}