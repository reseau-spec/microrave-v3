import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';

// ── Pages V3 MVP ──────────────────────────────────────────────
import PolicyDashboard from './pages/PolicyDashboard';
import EngagementForm  from './pages/EngagementForm';   // création engagement
import EngagementView  from './pages/EngagementView';   // suivi + paiement dépôt
import TalentPresence  from './pages/TalentPresence';   // check-in GPS talent
import CompletionFlow  from './pages/CompletionFlow';   // confirmation + SOTS

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center"
           style={{ background: '#0a0a0f' }}>
        <div className="w-8 h-8 border-4 border-slate-800 border-t-violet-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (authError) {
    if (authError.type === 'user_not_registered') return <UserNotRegisteredError />;
    if (authError.type === 'auth_required') { navigateToLogin(); return null; }
  }

  return (
    <Routes>
      {/* Admin */}
      <Route path="/policy"                     element={<PolicyDashboard />} />

      {/* ── MVP — 4 surfaces d'activation ───────────────────── */}
      <Route path="/"                           element={<EngagementForm />} />
      <Route path="/engagement/new"             element={<EngagementForm />} />
      <Route path="/engagement/:engagementId"   element={<EngagementView />} />
      <Route path="/checkin/:engagementId"      element={<TalentPresence />} />
      <Route path="/completion/:engagementId"   element={<CompletionFlow />} />

      <Route path="*"                           element={<PageNotFound />} />
    </Routes>
  );
};

function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  );
}

export default App;