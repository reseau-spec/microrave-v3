import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { createPageUrl } from './utils';
import ErrorBoundary from './components/ErrorBoundary';
import { useAuth } from '@/lib/AuthContext';
import { base44 } from '@/api/base44Client';
import { onboardingRoute } from '@/components/onboardingState';
import { Menu, Home, User, Settings, Play, Users, Calendar, Shield, Compass, Target, Crown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import GlobalActionBar from '@/components/GlobalActionBar';
import { useGlobalActions } from '@/contexts/GlobalActionContext';

export default function Layout({ children, currentPageName }) {
  const { user, isLoadingAuth } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [guardLoading, setGuardLoading] = useState(true);
  const { totalPending } = useGlobalActions();

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const ref = (params.get('ref') || '').trim();
      if (ref.length > 0) {
        sessionStorage.setItem('mr_ref', ref);
      }
    } catch {}
  }, []);

  useEffect(() => {
    let cancelled = false;

    const safetyTimer = setTimeout(() => {
      if (!cancelled) setGuardLoading(false);
    }, 5000);

    const runGuard = async () => {
      if (isLoadingAuth) return;

      const isBypassedPage = ['Onboarding', 'Health'].includes(currentPageName);
      if (!user?.id || isBypassedPage) {
        if (!cancelled) setGuardLoading(false);
        return;
      }

      try {
        const profiles = await base44.entities.TalentProfile.filter({ userId: user.id }).catch(() => []);
        const hasProfile = (profiles || []).length > 0;

        if (!hasProfile) {
          const savedRef = (() => { try { return sessionStorage.getItem('mr_ref') || ''; } catch { return ''; } })();
          const onboardingUrl = savedRef
            ? `${onboardingRoute()}?ref=${savedRef}`
            : onboardingRoute();
          navigate(onboardingUrl, {
            replace: true,
            state: { from: location.pathname + location.search },
          });
          return;
        }
      } finally {
        if (!cancelled) setGuardLoading(false);
      }
    };

    setGuardLoading(true);
    runGuard();
    return () => {
      cancelled = true;
      clearTimeout(safetyTimer);
    };
  }, [user?.id, isLoadingAuth, currentPageName, navigate, location.pathname, location.search]);

  if (guardLoading && !['Onboarding', 'Health'].includes(currentPageName)) {
    return (
      <ErrorBoundary>
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
        </div>
      </ErrorBoundary>
    );
  }

  const navigation = [
    { name: 'Accueil',     icon: Home,     href: createPageUrl('Home'),        active: true },
    { name: 'Profil',      icon: User,     href: createPageUrl('Profile'),     active: true },
    { name: 'Abonnement',  icon: Crown,    href: createPageUrl('Membership'),  active: true },
    { name: 'Préférences', icon: Settings, href: createPageUrl('Preferences'), active: true },
    { name: 'Feed',        icon: Users,    href: createPageUrl('Feed'),        active: true },
    { name: 'Explore',     icon: Compass,  href: createPageUrl('Explore'),     active: true },
    { name: 'Missions',    icon: Target,   href: createPageUrl('Missions'),    active: true },
    { name: 'Jouer',       icon: Play,     href: createPageUrl('Play'),        active: true },
    { name: 'Événements',  icon: Calendar, href: createPageUrl('Events'),      active: true },
    { name: 'Réseau',      icon: Users,    href: createPageUrl('Network'),     active: false, badge: 'W4' },
    { name: 'Admin',       icon: Shield,   href: createPageUrl('Admin'),       active: false, badge: 'W5' },
  ];

  const NavLinks = ({ mobile = false }) => (
    <nav className={mobile ? 'flex flex-col space-y-2' : 'hidden lg:flex lg:items-center lg:space-x-6'}>
      {navigation.map((item) => {
        const Icon = item.icon;
        const isActive = currentPageName === item.name;
        const showAlertBadge = item.name === 'Profil' && totalPending > 0;

        return (
          <Link
            key={item.name}
            to={item.href}
            className={`
              relative flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors
              ${isActive
                ? 'bg-indigo-100 text-indigo-900'
                : item.active
                  ? 'text-gray-700 hover:bg-gray-100'
                  : 'text-gray-400 cursor-not-allowed'
              }
            `}
            onClick={(e) => !item.active && e.preventDefault()}
          >
            <Icon className="w-4 h-4" />
            {item.name}
            {item.badge && (
              <span className="ml-1 px-1.5 py-0.5 text-xs bg-gray-200 text-gray-600 rounded">
                {item.badge}
              </span>
            )}
            {showAlertBadge && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] flex items-center justify-center px-1 text-[10px] font-bold bg-red-600 text-white rounded-full leading-none">
                {totalPending > 9 ? '9+' : totalPending}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
          <div className="container mx-auto px-4">
            <div className="flex items-center justify-between h-16">
              <Link to={createPageUrl('Home')} className="flex items-center">
                <img
                  src="https://media.base44.com/images/public/698c747aee05acfdd23ea577/6d083959f_microravenewlogo-transparent.png"
                  alt="Micro Rave"
                  className="h-10 w-auto"
                />
              </Link>

              <NavLinks />

              <Sheet>
                <SheetTrigger asChild className="lg:hidden">
                  <Button variant="ghost" size="icon" className="relative">
                    <Menu className="w-6 h-6" />
                    {totalPending > 0 && (
                      <span className="absolute top-1 right-1 min-w-[14px] h-[14px] flex items-center justify-center px-0.5 text-[9px] font-bold bg-red-600 text-white rounded-full leading-none">
                        {totalPending > 9 ? '9+' : totalPending}
                      </span>
                    )}
                  </Button>
                </SheetTrigger>
                <SheetContent side="right">
                  <div className="mt-6">
                    <NavLinks mobile />
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          </div>

          <GlobalActionBar />
        </header>

        <main className="min-h-[calc(100vh-4rem)]">
          {children}
        </main>

        <footer className={`bg-white border-t border-gray-200 py-6 mt-12 ${['Explore', 'Play'].includes(currentPageName) ? 'hidden' : ''}`}>
          <div className="container mx-auto px-4">
            <div className="flex flex-col md:flex-row justify-between items-center gap-4">
              <p className="text-sm text-gray-600">
                © 2026 Micro Rave — Plateforme d'orchestration événementielle
              </p>
              <div className="flex items-center gap-4">
                <Link to={createPageUrl('Health')} className="text-sm text-gray-500 hover:text-gray-900">
                  Health Check
                </Link>
                <span className="text-xs text-gray-400">v0.1.0 (W1)</span>
              </div>
            </div>
          </div>
        </footer>
      </div>
    </ErrorBoundary>
  );
}