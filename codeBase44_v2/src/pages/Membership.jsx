import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useToast } from '@/components/ui/use-toast';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, Crown, TrendingDown, CheckCircle2, Info, Wallet, ExternalLink, AlertCircle, RefreshCw, Zap } from 'lucide-react';
import { MembershipCard, MembershipBadge } from '@/components/profile/MembershipBadge';

const TIER_ORDER = ['A', 'E', 'B', 'C', 'D'];

export default function Membership() {
  const { toast } = useToast();

  const [plans,             setPlans]             = useState([]);
  const [currentMembership, setCurrentMembership] = useState(null);
  const [profile,           setProfile]           = useState(null);
  const [loading,           setLoading]           = useState(true);
  const [selecting,         setSelecting]         = useState(null);
  const [connectLoading,    setConnectLoading]    = useState(false);
  const [connectStatus,     setConnectStatus]     = useState(null);
  const [pendingPayoutAmount, setPendingPayoutAmount] = useState(null);
  const [billingCycle, setBillingCycle] = useState('monthly');
  const [checkoutLoading, setCheckoutLoading] = useState(false);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const user = await base44.auth.me();

      const [allPlans, memberships, profiles] = await Promise.all([
        base44.entities.MembershipPlan.filter({}).catch(() => []),
        base44.entities.UserMembership.filter({ userId: user.id }).catch(() => []),
        base44.entities.TalentProfile.filter({ userId: user.id }).catch(() => []),
      ]);

      const now = new Date();
      const activePlans = (allPlans || [])
        .filter(p => {
          if (p.isLegacy) return false;
          if (p.activeFrom && new Date(p.activeFrom) > now) return false;
          if (p.activeTo && new Date(p.activeTo) < now) return false;
          return true;
        })
        .sort((a, b) => {
          const ia = TIER_ORDER.indexOf(a.tier);
          const ib = TIER_ORDER.indexOf(b.tier);
          return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
        });

      setPlans(activePlans);

      const activeMembership = (memberships || []).find(m => m.status === 'active') || null;
      setCurrentMembership(activeMembership);

      if (profiles?.length > 0) {
        const p = profiles[0];
        setProfile(p);
        setConnectStatus(p.stripeConnectOnboardingStatus || null);

        if (p.stripeConnectOnboardingStatus !== 'active') {
          loadPendingPayoutAmount(user.id);
        }

        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('connect') === 'complete') {
          toast({ title: 'Vérification soumise', description: "Votre compte est en cours d'activation.", duration: 6000 });
          window.history.replaceState({}, '', window.location.pathname);
        }
        if (urlParams.get('checkout') === 'success') {
          toast({
            title: '🎉 Abonnement activé !',
            description: 'Votre forfait est maintenant actif. Votre taux de commission est mis à jour.',
            duration: 8000,
          });
          window.history.replaceState({}, '', window.location.pathname);
        }
        if (urlParams.get('checkout') === 'cancelled') {
          toast({ title: 'Paiement annulé', description: 'Votre abonnement précédent reste actif.', duration: 4000 });
          window.history.replaceState({}, '', window.location.pathname);
        }
      }

    } catch (err) {
      toast({ title: 'Erreur de chargement', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const loadPendingPayoutAmount = async (userId) => {
    try {
      const splits = await base44.entities.PayoutSplit.filter({
        talentUserId: userId,
        roleType: 'talent_payout',
        status: 'pending',
      }).catch(() => []);
      const total = (splits || []).reduce((s, p) => s + (Number(p.amount) || 0), 0);
      if (total > 0) setPendingPayoutAmount(Math.round(total * 100) / 100);
    } catch { /* silent */ }
  };

  const handleConnectSetup = async () => {
    if (connectLoading) return;
    setConnectLoading(true);
    try {
      const res = await base44.functions.invoke('createConnectAccount', {});
      const data = res?.data || res;
      if (!data?.ok) throw new Error(data?.error || 'Erreur inconnue');
      if (data.action === 'already_active') {
        setConnectStatus('active');
        toast({ title: 'Compte déjà actif', description: 'Vos paiements sont opérationnels.' });
        return;
      }
      if (data.onboardingUrl) window.location.href = data.onboardingUrl;
    } catch (err) {
      toast({ title: 'Erreur', description: err?.message || 'Impossible de démarrer la configuration.', variant: 'destructive' });
    } finally {
      setConnectLoading(false);
    }
  };

  const handleSelect = async (plan) => {
    if (selecting) return;
    setSelecting(plan.sku);
    try {
      const user = await base44.auth.me();

      if (plan.priceMonthly === 0) {
        await applyFreemiumDowngrade(user.id, plan);
        if (!profile?.stripeConnectAccountId) {
          triggerSilentConnectCreation();
        }
        return;
      }

      if (!profile?.stripeConnectAccountId) {
        triggerSilentConnectCreation();
      }

      await launchCheckout(plan);

    } catch (err) {
      toast({ title: 'Erreur', description: err?.message || 'Une erreur est survenue.', variant: 'destructive' });
    } finally {
      setSelecting(null);
    }
  };

  const launchCheckout = async (plan) => {
    setCheckoutLoading(true);
    try {
      const res = await base44.functions.invoke('createMembershipCheckout', {
        planSku:      plan.sku,
        billingCycle,
      });
      const data = res?.data || res;

      if (data?.alreadyActive) {
        toast({ title: 'Forfait déjà actif', description: 'Cet abonnement est déjà en cours.' });
        await loadData();
        return;
      }

      if (data?.code === 'MISSING_PRICE_ID') {
        toast({
          title: 'Configuration incomplète',
          description: "Les prix Stripe ne sont pas encore configurés pour ce forfait. Contactez l'équipe.",
          variant: 'destructive',
          duration: 8000,
        });
        return;
      }

      if (!data?.ok || !data?.checkoutUrl) {
        throw new Error(data?.error || 'Lien de paiement non disponible');
      }

      window.location.href = data.checkoutUrl;

    } catch (err) {
      toast({ title: 'Erreur', description: err?.message || 'Impossible de démarrer le paiement.', variant: 'destructive' });
      setCheckoutLoading(false);
    }
  };

  const triggerSilentConnectCreation = () => {
    base44.functions.invoke('createConnectAccount', { silent: true })
      .then(res => {
        const data = res?.data || res;
        if (data?.ok && data?.accountId) {
          setConnectStatus('pending_onboarding');
          setProfile(prev => prev ? {
            ...prev,
            stripeConnectAccountId: data.accountId,
            stripeConnectOnboardingStatus: 'pending_onboarding',
          } : prev);
        }
      })
      .catch(err => {
        console.warn('[Membership] Silent Connect creation failed (non-fatal):', err?.message);
      });
  };

  const applyFreemiumDowngrade = async (userId, plan) => {
    if (currentMembership?.id) {
      await base44.entities.UserMembership.update(currentMembership.id, {
        status: 'cancelled',
        cancelledAt: new Date().toISOString(),
      });
    }
    if (profile?.id) {
      await base44.entities.TalentProfile.update(profile.id, { commissionTier: plan.tier });
    }
    await loadData();
    toast({ title: '✓ Retour au plan Freemium', description: 'Votre commission est maintenant de 12%.' });
  };

  const effectiveTier = currentMembership?.tier || profile?.commissionTier || 'A';
  const effectiveRate = currentMembership
    ? `${(currentMembership.commissionRateSnapshot * 100).toFixed(1)}%`
    : null;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  const showActivationBanner =
    connectStatus !== 'active' &&
    pendingPayoutAmount !== null &&
    pendingPayoutAmount > 0;

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl">

      {showActivationBanner && (
        <div className="mb-6 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 p-4 text-white shadow-lg">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-start gap-3">
              <Zap className="w-5 h-5 text-yellow-300 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-base">
                  {pendingPayoutAmount.toFixed(2)} $ CAD vous attendent
                </p>
                <p className="text-sm text-emerald-100 mt-0.5">
                  Activez votre compte de paiement pour recevoir votre cachet automatiquement.
                </p>
              </div>
            </div>
            <button
              onClick={handleConnectSetup}
              disabled={connectLoading}
              className="flex items-center gap-2 bg-white text-emerald-700 font-semibold text-sm rounded-xl px-4 py-2.5 hover:bg-emerald-50 transition-colors disabled:opacity-60 whitespace-nowrap"
            >
              {connectLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wallet className="w-4 h-4" />}
              Activer maintenant
            </button>
          </div>
        </div>
      )}

      <div className="mb-8">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Crown className="w-6 h-6 text-indigo-600" />
              Abonnement
            </h1>
            <p className="text-gray-500 mt-1">
              Votre forfait détermine le taux de commission prélevé sur chaque paiement de performance.
            </p>
          </div>
          <MembershipBadge tier={effectiveTier} />
        </div>
      </div>

      <Card className="mb-8 bg-gradient-to-br from-indigo-50 to-purple-50 border-indigo-200">
        <CardContent className="pt-6">
          <div className="grid sm:grid-cols-3 gap-6">
            <div className="text-center">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Forfait actif</p>
              <MembershipBadge tier={effectiveTier} size="sm" />
            </div>
            <div className="text-center">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Commission effective</p>
              <p className="text-2xl font-black text-gray-900">
                {effectiveRate || `${plans.find(p => p.tier === effectiveTier)?.commissionRate != null
                  ? (plans.find(p => p.tier === effectiveTier).commissionRate * 100).toFixed(1)
                  : 12}%`}
              </p>
              <p className="text-xs text-gray-400">prélevée sur chaque payout</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">
                {currentMembership?.expiresAt ? 'Renouvellement' : 'Statut'}
              </p>
              {currentMembership?.expiresAt ? (
                <p className="text-sm font-semibold text-gray-700">
                  {new Date(currentMembership.expiresAt).toLocaleDateString('fr-CA', { month: 'long', day: 'numeric', year: 'numeric' })}
                </p>
              ) : (
                <div className="flex items-center justify-center gap-1.5 text-green-600">
                  <CheckCircle2 className="w-4 h-4" />
                  <span className="text-sm font-semibold">Actif</span>
                </div>
              )}
            </div>
          </div>
          {currentMembership?.commissionRateSnapshot && (
            <div className="mt-4 pt-4 border-t border-indigo-200 flex items-start gap-2 text-xs text-indigo-700">
              <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>
                Votre taux de <strong>{(currentMembership.commissionRateSnapshot * 100).toFixed(1)}%</strong> est
                garanti à vie, fixé au moment de votre souscription.
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {effectiveTier === 'A' && (
        <Card className="mb-8 border-green-200 bg-green-50">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-start gap-3">
              <TrendingDown className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-green-800 text-sm">Réduisez votre commission</p>
                <p className="text-xs text-green-700 mt-0.5">
                  Sur un cachet moyen de 300$/event, passer de Freemium (12%) à Founder (5%) vous fait
                  économiser <strong>21$ par performance</strong>. Le forfait Founder se rembourse en 1 event.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex items-center justify-center mb-6">
        <div className="inline-flex rounded-xl border border-gray-200 p-1 bg-gray-50">
          <button type="button" onClick={() => setBillingCycle('monthly')}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${billingCycle === 'monthly' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            Mensuel
          </button>
          <button type="button" onClick={() => setBillingCycle('yearly')}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${billingCycle === 'yearly' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            Annuel <span className="ml-1 text-[10px] font-bold text-emerald-600">-20%</span>
          </button>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {plans.map(plan => (
          <MembershipCard
            key={plan.sku}
            plan={plan}
            isCurrent={plan.tier === effectiveTier}
            billingCycle={billingCycle}
            isLoading={checkoutLoading && selecting === plan.sku}
            onSelect={plan.tier !== effectiveTier ? handleSelect : null}
          />
        ))}
      </div>

      <div className="mt-10">
        <h2 className="text-lg font-semibold text-gray-900 mb-1 flex items-center gap-2">
          <Wallet className="w-5 h-5 text-indigo-600" />
          Compte de paiement
        </h2>
        <p className="text-sm text-gray-500 mb-4">
          Requis pour recevoir vos cachets après chaque événement complété.
        </p>

        {connectStatus === 'active' ? (
          <Card className="border-green-200 bg-green-50">
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
                <div>
                  <p className="font-semibold text-green-800 text-sm">Compte actif</p>
                  <p className="text-xs text-green-700 mt-0.5">Vos paiements seront virés automatiquement après chaque événement.</p>
                </div>
              </div>
            </CardContent>
          </Card>

        ) : connectStatus === 'restricted' ? (
          <Card className="border-red-200 bg-red-50">
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-red-800 text-sm">Compte restreint par Stripe</p>
                    <p className="text-xs text-red-700 mt-0.5">Vérifiez vos informations ou contactez le support Stripe.</p>
                  </div>
                </div>
                <button onClick={handleConnectSetup} disabled={connectLoading}
                  className="flex items-center gap-1.5 text-xs font-medium text-red-700 border border-red-300 rounded-md px-3 py-1.5 hover:bg-red-100 transition-colors disabled:opacity-60">
                  {connectLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                  Relancer la vérification
                </button>
              </div>
            </CardContent>
          </Card>

        ) : connectStatus === 'pending' || connectStatus === 'pending_onboarding' ? (
          <Card className="border-amber-200 bg-amber-50">
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-start gap-3">
                  <Info className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-amber-800 text-sm">
                      {connectStatus === 'pending_onboarding'
                        ? 'Compte préparé — activation en attente'
                        : 'Vérification en cours'}
                    </p>
                    <p className="text-xs text-amber-700 mt-0.5">
                      {connectStatus === 'pending_onboarding'
                        ? 'Votre compte Stripe a été créé. Complétez la vérification pour recevoir vos paiements.'
                        : "Complétez la vérification d'identité Stripe pour activer vos paiements."}
                    </p>
                  </div>
                </div>
                <button onClick={handleConnectSetup} disabled={connectLoading}
                  className="flex items-center gap-2 text-xs font-medium text-amber-800 border border-amber-300 rounded-md px-3 py-1.5 hover:bg-amber-100 transition-colors disabled:opacity-60">
                  {connectLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ExternalLink className="w-3.5 h-3.5" />}
                  Compléter la vérification
                </button>
              </div>
            </CardContent>
          </Card>

        ) : (
          <Card className="border-indigo-200">
            <CardContent className="pt-5 pb-5">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <p className="font-semibold text-gray-800 text-sm">Activez vos paiements</p>
                  <p className="text-xs text-gray-500 mt-1 max-w-md">
                    Créez un compte Stripe Connect pour recevoir vos cachets directement.
                    La vérification prend environ 5 minutes.
                  </p>
                  <div className="flex flex-wrap gap-3 mt-3 text-xs text-gray-400">
                    <span className="flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> Virements automatiques</span>
                    <span className="flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> Sécurisé par Stripe</span>
                    <span className="flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> Aucun frais de configuration</span>
                  </div>
                </div>
                <button onClick={handleConnectSetup} disabled={connectLoading}
                  className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg px-4 py-2.5 transition-colors disabled:opacity-60 whitespace-nowrap">
                  {connectLoading
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Configuration...</>
                    : <><Wallet className="w-4 h-4" /> Configurer mes paiements</>}
                </button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <p className="text-xs text-gray-400 text-center mt-8">
        La commission est prélevée uniquement lorsqu'un paiement est libéré après un événement complété.
      </p>
    </div>
  );
}