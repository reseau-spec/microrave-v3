// deploy: v1
// resolveReferral — résout un referralCode en referrerId et écrit les champs RSI sur TalentProfile
// Accessible uniquement via appel authentifié (utilisateur connecté pendant onboarding)
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Auth check
    const me = await base44.auth.me();
    if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { referralCode, talentProfileId } = body;

    if (!referralCode || !talentProfileId) {
      return Response.json({ error: 'referralCode et talentProfileId requis' }, { status: 400 });
    }

    // ── 1. Chercher le référent dans User (asServiceRole — seul accès possible à la table auth) ──
    let referrerUserId = null;
    let referrerSource = 'user_table';

    const referrerUsers = await base44.asServiceRole.entities.User
      .filter({ referralCode })
      .catch(() => []);

    if (referrerUsers.length > 0) {
      referrerUserId = referrerUsers[0].id;
    }

    // ── 2. Fallback : chercher dans TalentProfile (si referralCode y est dupliqué) ──
    if (!referrerUserId) {
      const referrerProfiles = await base44.asServiceRole.entities.TalentProfile
        .filter({ referralCode })
        .catch(() => []);

      if (referrerProfiles.length > 0) {
        referrerUserId = referrerProfiles[0].userId;
        referrerSource = 'talent_profile';
      }
    }

    if (!referrerUserId) {
      // Code non trouvé — pas une erreur fatale, juste pas de référent
      return Response.json({
        ok: false,
        reason: 'referral_code_not_found',
        referralCode,
      });
    }

    // ── 3. Écrire referrerId + referrerCode + originContext sur le TalentProfile du nouvel utilisateur ──
    await base44.asServiceRole.entities.TalentProfile.update(talentProfileId, {
      referrerId: referrerUserId,
      referrerCode: referralCode,
      originContext: {
        source: 'referral_link',
        ref: referralCode,
        resolvedFrom: referrerSource,
        registeredAt: new Date().toISOString(),
      },
    });

    // ── 4. (Optionnel non-bloquant) Écrire referrerId sur User aussi pour cohérence ──
    await base44.asServiceRole.entities.User
      .update(me.id, {
        referrerId: referrerUserId,
        originContext: {
          source: 'referral_link',
          ref: referralCode,
          registeredAt: new Date().toISOString(),
        },
      })
      .catch(() => {}); // non-fatal si User n'est pas modifiable

    return Response.json({
      ok: true,
      referrerUserId,
      referralCode,
      resolvedFrom: referrerSource,
    });

  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
});