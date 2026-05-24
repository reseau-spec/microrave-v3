import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from '../utils';
import { Zap, Users, Calendar, User, Play, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { base44 } from '../api/base44Client';

// ── Bannière session active ─────────────────────────────────────────────────
function ActiveSessionBanner({ session, onDismiss }) {
  const navigate = useNavigate();
  if (!session) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between gap-3 px-4 py-3
      bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg animate-in slide-in-from-top duration-300">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center animate-pulse">
          <Play className="w-4 h-4 fill-white" />
        </div>
        <div>
          <p className="font-semibold text-sm">
            {session.eventName ? `${session.eventName} — ` : ''}Ta session a démarré !
          </p>
          <p className="text-xs text-indigo-200">Rejoins le lobby maintenant pour ne rien manquer</p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Button
          size="sm"
          className="bg-white text-indigo-700 hover:bg-indigo-50 font-semibold text-xs px-4"
          onClick={() => {
            window.location.href = `${createPageUrl('Play')}?sessionId=${session.id}`;
          }}
        >
          <Play className="w-3 h-3 mr-1 fill-indigo-700" /> Rejoindre
        </Button>
        <button
          type="button"
          onClick={onDismiss}
          className="w-6 h-6 rounded-full flex items-center justify-center hover:bg-white/20 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// ── Page Home ───────────────────────────────────────────────────────────────
export default function Home() {
  const [activeSession, setActiveSession] = useState(null);
  const [dismissed, setDismissed] = useState(false);
  const dismissedSessionId = useRef(null);

  // Poll toutes les 15s pour détecter une session in_progress
  useEffect(() => {
    let isMounted = true;

    const checkSession = async () => {
      if (document.hidden) return;
      try {
        const res = await base44.functions.invoke('getMyActiveEventSession').catch(() => null);
        if (!isMounted) return;
        const s = res?.data?.session;
        if (s && s.id !== dismissedSessionId.current) {
          setActiveSession(s);
          setDismissed(false);
        } else if (!s) {
          setActiveSession(null);
        }
      } catch { /* silent */ }
    };

    checkSession(); // vérification immédiate au montage
    const intervalId = setInterval(checkSession, 15000);
    return () => {
      isMounted = false;
      clearInterval(intervalId);
    };
  }, []);

  const handleDismiss = () => {
    if (activeSession) dismissedSessionId.current = activeSession.id;
    setDismissed(true);
  };

  return (
    <>
      {/* Bannière session active */}
      {activeSession && !dismissed && (
        <ActiveSessionBanner session={activeSession} onDismiss={handleDismiss} />
      )}

      <div className={`min-h-screen bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 ${activeSession && !dismissed ? 'pt-14' : ''}`}>
        <div className="container mx-auto px-4 py-16">
          {/* Hero */}
          <div className="text-center mb-16">
            <h1 className="text-5xl font-bold text-gray-900 mb-4">
              Micro Rave
            </h1>
            <p className="text-xl text-gray-600 mb-8">
              Plateforme d'orchestration événementielle — Talents, Lieux, Organisateurs
            </p>
            <div className="flex gap-4 justify-center">
              <Link to={createPageUrl('Onboarding')}>
                <Button size="lg" className="bg-indigo-600 hover:bg-indigo-700">
                  Commencer
                </Button>
              </Link>
              <Link to={createPageUrl('Feed')}>
                <Button size="lg" variant="outline">
                  Découvrir
                </Button>
              </Link>
            </div>
          </div>

          {/* Features Grid */}
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            <Card className="border-2 hover:border-indigo-300 transition-colors">
              <CardHeader>
                <Zap className="w-10 h-10 text-indigo-600 mb-2" />
                <CardTitle>Jouer</CardTitle>
                <CardDescription>
                  Sessions QuickPlay avec matchmaking basé sur vos préférences
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Link to={createPageUrl('Play')}>
                  <Button variant="ghost" className="w-full">
                    Voir plus →
                  </Button>
                </Link>
              </CardContent>
            </Card>

            <Card className="border-2 hover:border-purple-300 transition-colors">
              <CardHeader>
                <User className="w-10 h-10 text-purple-600 mb-2" />
                <CardTitle>Profil</CardTitle>
                <CardDescription>
                  Votre identité talent avec XP, SOTS, badges et ligues
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Link to={createPageUrl('Profile')}>
                  <Button variant="ghost" className="w-full">
                    Voir plus →
                  </Button>
                </Link>
              </CardContent>
            </Card>

            <Card className="border-2 hover:border-green-300 transition-colors">
              <CardHeader>
                <Calendar className="w-10 h-10 text-green-600 mb-2" />
                <CardTitle>Événements</CardTitle>
                <CardDescription>
                  Organisez ou participez à des événements avec lineup et budget
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Link to={createPageUrl('Events')}>
                  <Button variant="ghost" className="w-full">
                    Voir plus →
                  </Button>
                </Link>
              </CardContent>
            </Card>

            <Card className="border-2 hover:border-pink-300 transition-colors">
              <CardHeader>
                <Users className="w-10 h-10 text-pink-600 mb-2" />
                <CardTitle>Réseau</CardTitle>
                <CardDescription>
                  Découvrez les talents, événements et sessions récents
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Link to={createPageUrl('Network')}>
                  <Button variant="ghost" className="w-full">
                    Voir plus →
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </div>

          {/* Footer info */}
          <div className="mt-16 text-center text-sm text-gray-500">
            <p>© 2026 Micro Rave — Plateforme d'orchestration événementielle</p>
            <p className="mt-1 flex items-center justify-center gap-4">
              <span>QuickPlay, Sessions, SOTS</span>
              <span>·</span>
              <span>Lineup Board, Programme, Budget</span>
            </p>
          </div>
        </div>
      </div>
    </>
  );
}