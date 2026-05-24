import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Check, Play, Star, Sparkles, TrendingUp, Loader2 } from 'lucide-react';

// ── RESULTS — post-SOTS sans drop ───────────────────────────────────────────
export function ResultsView({ profile, session, user, profilesCache, normalizeId, asArray, onReplay }) {
  const xp = profile?.xpGlobal ?? 0;
  const xpLevel = Math.floor(Math.sqrt(xp / 100)) + 1;
  const xpForCurrentLevel = Math.pow(xpLevel - 1, 2) * 100;
  const xpForNextLevel = Math.pow(xpLevel, 2) * 100;
  const xpProgress = xpForNextLevel > xpForCurrentLevel
    ? Math.round(((xp - xpForCurrentLevel) / (xpForNextLevel - xpForCurrentLevel)) * 100)
    : 100;

  const sessionParticipants = asArray(session?.participants);

  return (
    <div className="container mx-auto px-4 py-8 max-w-md space-y-4">

      <Card className="border-2 border-green-200 bg-green-50 text-center">
        <CardContent className="pt-8 pb-6">
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
            <Check className="w-8 h-8 text-green-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-1">Session complétée !</h2>
          <p className="text-sm text-gray-500">Votre évaluation a été enregistrée</p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5 pb-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-indigo-500" />
              <span className="font-semibold text-gray-900">Niveau {xpLevel}</span>
            </div>
            <span className="text-sm text-gray-500 font-medium">{xp} XP total</span>
          </div>
          <Progress value={xpProgress} className="h-2" />
          <p className="text-xs text-gray-400 mt-1 text-right">
            {xp - xpForCurrentLevel} / {xpForNextLevel - xpForCurrentLevel} XP vers niveau {xpLevel + 1}
          </p>
        </CardContent>
      </Card>

      {sessionParticipants.filter(p => normalizeId(p?.userId) !== normalizeId(user?.id)).length > 0 && (
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Vous avez joué avec</p>
            <div className="flex flex-wrap gap-2">
              {sessionParticipants
                .filter(p => normalizeId(p?.userId) !== normalizeId(user?.id))
                .map(p => {
                  const pid = normalizeId(p?.userId);
                  const prof = profilesCache[pid];
                  const name = prof?.displayName || `Joueur ${pid.slice(-4)}`;
                  const avatarUrl = prof?.avatarUrl || null;
                  return (
                    <div key={pid} className="flex items-center gap-2 bg-gray-50 rounded-full px-3 py-1.5 border">
                      <div className="w-6 h-6 rounded-full overflow-hidden bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center flex-shrink-0">
                        {avatarUrl
                          ? <img src={avatarUrl} alt={name} className="w-full h-full object-cover" />
                          : <span className="text-white text-xs font-bold">{name.charAt(0).toUpperCase()}</span>
                        }
                      </div>
                      <span className="text-sm font-medium text-gray-700">{name}</span>
                    </div>
                  );
                })}
            </div>
          </CardContent>
        </Card>
      )}

      <Button className="w-full bg-indigo-600 hover:bg-indigo-700 h-12" onClick={onReplay}>
        <Play className="w-4 h-4 mr-2" />
        Rejouer
      </Button>
    </div>
  );
}

// ── DROP — récompense cosmétique ──────────────────────────────────────────────
export function DropView({ dropResult, onContinue }) {
  const rarityConfig = {
    common:    { label: 'Commun',     color: 'text-gray-600',   bg: 'bg-gray-50',   border: 'border-gray-200',   emoji: '⚪' },
    rare:      { label: 'Rare',       color: 'text-blue-600',   bg: 'bg-blue-50',   border: 'border-blue-200',   emoji: '🔵' },
    epic:      { label: 'Épique',     color: 'text-purple-600', bg: 'bg-purple-50', border: 'border-purple-200', emoji: '🟣' },
    legendary: { label: 'Légendaire', color: 'text-yellow-600', bg: 'bg-yellow-50', border: 'border-yellow-200', emoji: '🌟' },
  };
  const rarity = rarityConfig[dropResult.rarityTier] || rarityConfig.common;
  const leveledUp = dropResult.levelAfter > dropResult.levelBefore;

  return (
    <div className="container mx-auto px-4 py-8 max-w-md">
      <Card className={`border-2 ${rarity.border} ${rarity.bg}`}>
        <CardHeader className="text-center pb-2">
          <div className="text-6xl mb-3">{rarity.emoji}</div>
          <CardTitle className={`text-2xl ${rarity.color}`}>Drop {rarity.label} !</CardTitle>
          <CardDescription className="text-base">Merci d&apos;avoir participé à cette session</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-white rounded-xl p-4 border flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center">
              <Sparkles className="w-6 h-6 text-indigo-600" />
            </div>
            <div>
              <div className="text-2xl font-bold text-indigo-600">+{dropResult.xpGained} XP</div>
              <div className="text-sm text-gray-500">{dropResult.xpBefore} → {dropResult.xpAfter} XP total</div>
            </div>
          </div>
          {leveledUp && (
            <div className="bg-white rounded-xl p-4 border flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <div className="text-lg font-bold text-green-600">Niveau {dropResult.levelAfter} !</div>
                <div className="text-sm text-gray-500">Niveau {dropResult.levelBefore} → {dropResult.levelAfter}</div>
              </div>
            </div>
          )}
          <div className="text-center text-sm text-gray-500">
            Domaine : <span className="font-medium capitalize">{dropResult.domainKey}</span>
          </div>
          <Button className="w-full bg-indigo-600 hover:bg-indigo-700" onClick={onContinue}>
            <Star className="w-4 h-4 mr-2" />
            Continuer
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}