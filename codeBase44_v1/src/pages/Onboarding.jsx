import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { createPageUrl } from '../utils';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import { ensureTalentProfile, ensureUserPreferences, generateReferralCode } from '@/components/onboardingState';
// onboardingState canonical path: @/components/onboardingState

// Helper: extraire ref depuis URL
function getRefFromUrl(search) {
  try {
    const params = new URLSearchParams(search || window.location.search);
    const ref = (params.get('ref') || '').trim();
    return ref.length ? ref : null;
  } catch {
    return null;
  }
}

export default function Onboarding() {
  const navigate = useNavigate();
  const location = useLocation();
  const [step, setStep] = useState('persona'); // persona only - auth handled by Base44
  const [loading, setLoading] = useState(true);
  const [authUser, setAuthUser] = useState(null);
  const [formData, setFormData] = useState({
    displayName: '',
    bio: '',
    avatarUrl: ''
  });

  // Capture silencieuse du ref depuis URL + persistence session
  useEffect(() => {
    const urlRef = getRefFromUrl(location?.search);
    if (urlRef) {
      sessionStorage.setItem('mr_ref', urlRef);
    }
  }, [location?.search]);

  // Vérifier auth au montage
  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const user = await base44.auth.me();
      
      if (!user) {
        // Pas d'auth => rediriger vers login
        base44.auth.redirectToLogin(window.location.pathname + window.location.search);
        return;
      }

      setAuthUser(user);
      
      // Vérifier si TalentProfile existe déjà
      const profiles = await base44.entities.TalentProfile.filter({ userId: user.id });
      
      if (profiles.length > 0) {
        // Déjà onboardé => rediriger vers home
        navigate(createPageUrl('Home'));
        return;
      }

      // Pré-remplir avec les données auth
      setFormData({
        displayName: user.full_name || user.email.split('@')[0],
        bio: '',
        avatarUrl: ''
      });
    } catch (error) {
      console.error('Auth check error:', error);
      base44.auth.redirectToLogin(window.location.pathname + window.location.search);
    } finally {
      setLoading(false);
    }
  };

  const handlePersona = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (!authUser) {
        base44.auth.redirectToLogin();
        return;
      }

      // Récupérer le ref silencieux
      const silentReferralCode = 
        getRefFromUrl(location?.search) || 
        sessionStorage.getItem('mr_ref') || 
        null;

      const newReferralCode = generateReferralCode();

      // Créer ou réparer TalentProfile lié à authUser (idempotent)
      let newProfile = await ensureTalentProfile(base44, authUser, {
        displayName: formData.displayName || authUser.full_name || authUser.email.split('@')[0],
        bio: formData.bio,
        avatarUrl: formData.avatarUrl,
        referralCode: newReferralCode,
      });

      if (newProfile?.id) {
        newProfile = await base44.entities.TalentProfile.update(newProfile.id, {
          displayName: formData.displayName || authUser.full_name || authUser.email.split('@')[0],
          bio: formData.bio,
          avatarUrl: formData.avatarUrl,
          referralCode: newProfile.referralCode || newReferralCode,
        }).catch(() => newProfile);
      }

      // ── RSI — résolution referrerId via fonction backend ──────────────────
      // La résolution frontend était brisée : base44.entities.User n'est pas
      // accessible depuis le front. resolveReferral utilise asServiceRole côté serveur.
      console.log('[RSI] silentReferralCode:', silentReferralCode);
      console.log('[RSI] newProfile.id:', newProfile?.id);

      if (silentReferralCode && newProfile?.id) {
        try {
          const refResult = await base44.functions.invoke('resolveReferral', {
            referralCode: silentReferralCode,
            talentProfileId: newProfile.id,
          });
          console.log('[RSI] resolveReferral résultat:', refResult?.data);
          if (!refResult?.data?.ok) {
            console.warn('[RSI] Non résolu:', refResult?.data?.reason);
          }
        } catch (refErr) {
          console.error('[RSI] resolveReferral erreur:', refErr?.message || refErr);
        }
      } else {
        console.log('[RSI] Pas de code référent — inscription directe');
      }

      // Créer ou réparer UserPreferences vide
      await ensureUserPreferences(base44, authUser);

      // Mettre à jour User auth avec referral code (non bloquant)
      await base44.auth.updateMe({
        referralCode: newProfile?.referralCode || newReferralCode
      }).catch((err) => {
        console.warn('updateMe referralCode failed (non-fatal):', err);
      });

      // Nettoyer le ref après succès
      if (silentReferralCode) {
        sessionStorage.removeItem('mr_ref');
      }

      // Rediriger vers Preferences
      navigate(createPageUrl('Preferences'));
    } catch (error) {
      console.error('Onboarding error:', error);
      alert('Erreur: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-50 flex items-center justify-center p-4">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        {step === 'persona' && (
          <>
            <CardHeader>
              <CardTitle>Configurez votre profil</CardTitle>
              <CardDescription>
                Parlez-nous de vous
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handlePersona} className="space-y-4">
                <div>
                  <Label htmlFor="displayName">Nom d'affichage</Label>
                  <Input
                    id="displayName"
                    value={formData.displayName}
                    onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                    placeholder="Comment voulez-vous être appelé?"
                  />
                </div>

                <div>
                  <Label htmlFor="bio">Bio</Label>
                  <Textarea
                    id="bio"
                    value={formData.bio}
                    onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                    placeholder="Parlez-nous de votre expérience..."
                    rows={4}
                  />
                </div>

                <div>
                  <Label htmlFor="avatarUrl">URL Avatar</Label>
                  <Input
                    id="avatarUrl"
                    value={formData.avatarUrl}
                    onChange={(e) => setFormData({ ...formData, avatarUrl: e.target.value })}
                    placeholder="https://..."
                  />
                </div>

                <Button type="submit" className="w-full" disabled={loading}>
                  {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Terminer
                </Button>
              </form>
            </CardContent>
          </>
        )}
      </Card>
    </div>
  );
}