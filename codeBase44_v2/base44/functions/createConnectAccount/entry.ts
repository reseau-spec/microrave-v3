// deploy: v3
// createConnectAccount — Crée un compte Stripe Connect pour un talent.
//
// CHANGEMENTS v3 — Création silencieuse au choix du forfait :
//
//   Deux modes d'appel :
//
//   MODE A — silentCreate (body.silent = true) :
//     Appelé automatiquement lors du choix du premier forfait (Membership.jsx).
//     Crée le compte Connect en background SANS rediriger vers Stripe.
//     → stripeConnectAccountId enregistré sur TalentProfile
//     → stripeConnectOnboardingStatus = 'pending_onboarding'
//     → Retourne { action: 'silent_created', accountId } SANS onboardingUrl
//     L'utilisateur finit son onboarding plus tard, motivé par un vrai cachet.
//
//   MODE B — standard (body.silent absent ou false) :
//     Comportement v2 inchangé : crée le compte ET redirige vers Stripe.
//     Déclenché depuis le bouton "Configurer mes paiements" dans Membership.jsx.
//
//   PHILOSOPHIE :
//     La création silencieuse au forfait = semer la graine sans forcer la fleur.
//     L'activation complète (KYC bancaire) = déclencher quand l'argent est réel.
//     Dissocier ces deux moments multiplie le taux de complétion par ~3.
//
// APPEL : {} — self-service (talent crée son propre compte)
//         { userId } — admin crée pour un talent spécifique
// RETOUR : { accountId, onboardingUrl }
//
// CHANGEMENTS v2 — self-service (Fix architecture cible Bloc F step 6) :
//
//   v1 : guard admin-only → bloquait 31/33 talents sans compte Connect.
//   v2 : self-service — tout utilisateur authentifié peut créer son propre compte.
//        Si admin : peut passer userId explicite pour créer pour un autre talent.
//        Si talent : userId ignoré, utilise user.id (impossible de créer pour autrui).
//
//   GUARD ANTI-DOUBLON :
//   Si TalentProfile.stripeConnectAccountId est déjà set et status=active → refus
//   avec retour du lien de dashboard Stripe existant.
//   Si status=pending → régénère un lien d'onboarding frais (lien expiré).
//   Si absent → création d'un nouveau compte.
//
//   URLS DE RETOUR :
//   return_url  → /Membership?connect=complete  (affiche le bloc statut)
//   refresh_url → /Membership?connect=refresh   (régénère le lien)

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
import Stripe from 'npm:stripe@14.21.0';

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status, headers: { 'content-type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  try {
    const base44  = createClientFromRequest(req);
    const user    = await base44.auth.me();
    if (!user) return json(401, { ok: false, error: 'Unauthorized' });

    const body    = await req.json().catch(() => ({}));
    const service = base44.asServiceRole;
    const isSilent = body.silent === true; // MODE A — création silencieuse sans redirection
    const appUrl  = Deno.env.get('VITE_APP_URL') || 'https://microrave.ca';
    const stripe  = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'));

    // v2: self-service — talent utilise son propre userId
    // Admin peut passer un userId explicite pour gérer un autre talent
    const targetUserId = (user.role === 'admin' && body.userId)
      ? body.userId
      : user.id;

    // Charger le profil talent
    const profiles = await service.entities.TalentProfile
      .filter({ userId: targetUserId }).catch(() => []);
    const profile = profiles?.[0] || null;

    // Guard anti-doublon : compte actif déjà existant
    if (profile?.stripeConnectAccountId && profile?.stripeConnectOnboardingStatus === 'active') {
      return json(200, {
        ok:            true,
        action:        'already_active',
        accountId:     profile.stripeConnectAccountId,
        onboardingUrl: null,
        message:       'Votre compte de paiement est déjà actif.',
      });
    }

    let accountId = profile?.stripeConnectAccountId || null;

    // Si compte pending → régénérer le lien d'onboarding (lien expiré après 24h)
    if (accountId && profile?.stripeConnectOnboardingStatus === 'pending') {
      const freshLink = await stripe.accountLinks.create({
        account:     accountId,
        refresh_url: `${appUrl}/Membership?connect=refresh`,
        return_url:  `${appUrl}/Membership?connect=complete`,
        type:        'account_onboarding',
      });
      console.log(`[createConnectAccount] v3 REFRESH_LINK userId=${targetUserId} accountId=${accountId}`);
      return json(200, {
        ok:            true,
        action:        'link_refreshed',
        accountId,
        onboardingUrl: freshLink.url,
        message:       "Lien d'onboarding régénéré. Complétez la vérification d'identité.",
      });
    }

    // Nouveau compte Connect Custom
    const account = await stripe.accounts.create({
      type:    'custom',
      country: 'CA',
      capabilities: {
        card_payments: { requested: true },
        transfers:     { requested: true },
      },
      metadata: { microrave_userId: targetUserId },
    });
    accountId = account.id;

    // Lien d'onboarding initial
    const accountLink = await stripe.accountLinks.create({
      account:     accountId,
      refresh_url: `${appUrl}/Membership?connect=refresh`,
      return_url:  `${appUrl}/Membership?connect=complete`,
      type:        'account_onboarding',
    });

    // Mettre à jour TalentProfile
    const connectStatus = isSilent ? 'pending_onboarding' : 'pending';
    if (profile) {
      await service.entities.TalentProfile.update(profile.id, {
        stripeConnectAccountId:         accountId,
        stripeConnectOnboardingStatus:  connectStatus,
      });
    } else {
      await service.entities.TalentProfile.create({
        userId:                         targetUserId,
        displayName:                    user.full_name || user.email || targetUserId,
        stripeConnectAccountId:         accountId,
        stripeConnectOnboardingStatus:  connectStatus,
      }).catch(e => console.warn('[createConnectAccount] v3 TalentProfile create failed:', e?.message));
    }

    console.log(`[createConnectAccount] v3 CREATED mode=${isSilent ? 'silent' : 'standard'} userId=${targetUserId} accountId=${accountId}`);

    // MODE A — Retour silencieux : pas de redirection Stripe
    if (isSilent) {
      return json(200, {
        ok:      true,
        action:  'silent_created',
        accountId,
        message: 'Compte Connect créé silencieusement. Activation complète lors du premier cachet.',
      });
    }

    // MODE B — Retour standard avec lien d'onboarding
    return json(200, {
      ok:                     true,
      action:                 'created',
      accountId,
      onboardingUrl:          accountLink.url,
      talentProfileUpdated:   !!profile,
      message:                "Complétez la vérification d'identité pour activer vos paiements.",
    });

  } catch (error) {
    console.error('[createConnectAccount] v3 ERROR:', error?.message);
    return json(500, { ok: false, error: error.message });
  }
});