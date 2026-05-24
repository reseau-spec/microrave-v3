// deploy: v2
// Fonction backend pour le tableau de bord RSI.
// Lit User (auth table) + TalentProfile + Session via asServiceRole.
// Retourne les données fusionnées pour le RSIDashboard.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Auth check — admin only
    const me = await base44.auth.me();
    if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (me.role !== 'admin' && !me.systemRoles?.includes('admin')) {
      return Response.json({ error: 'Admin only' }, { status: 403 });
    }

    // Charger les 3 sources en parallèle
    const [users, profiles, sessions] = await Promise.all([
      // User — table auth, accessible uniquement via asServiceRole
      base44.asServiceRole.entities.User.list('-created_date', 200),
      base44.asServiceRole.entities.TalentProfile.list('-created_date', 200),
      base44.asServiceRole.entities.Session.list('-created_date', 300),
    ]);

    // Index TalentProfile par userId pour jointure rapide
    const profileByUserId = {};
    for (const p of (profiles || [])) {
      if (p.userId) profileByUserId[p.userId] = p;
    }

    // Compter sessions complétées par userId
    const DONE = new Set(['completed', 'sots_submitted', 'archived']);
    const sessionCountByUser = {};
    const firstSessionByUser = {};
    const lastSessionByUser = {};

    for (const s of (sessions || [])) {
      if (!DONE.has(s.status)) continue;
      for (const p of (s.participants || [])) {
        const uid = typeof p === 'string' ? p : p?.userId;
        if (!uid) continue;
        sessionCountByUser[uid] = (sessionCountByUser[uid] || 0) + 1;
        const sDate = s.actualEndAt || s.created_date;
        if (sDate) {
          if (!firstSessionByUser[uid] || new Date(sDate) < new Date(firstSessionByUser[uid])) {
            firstSessionByUser[uid] = sDate;
          }
          if (!lastSessionByUser[uid] || new Date(sDate) > new Date(lastSessionByUser[uid])) {
            lastSessionByUser[uid] = sDate;
          }
        }
      }
    }

    // Compter référencés par userId (combien de personnes ont été référées par ce user)
    // Source primaire : TalentProfile.referrerId (écrit par resolveReferral via asServiceRole)
    // Source secondaire : User.referrerId (fallback si écrit directement sur User)
    // Les deux sont mergés pour éviter de manquer des référencements selon le chemin d'écriture
    const referralCountByUser = {};

    // 1. Depuis TalentProfile.referrerId (source canonique après déploiement de resolveReferral)
    for (const p of (profiles || [])) {
      const rid = p.referrerId;
      if (rid) {
        referralCountByUser[rid] = (referralCountByUser[rid] || 0) + 1;
      }
    }

    // 2. Depuis User.referrerId (fallback / source legacy)
    for (const u of (users || [])) {
      const rid = u.referrerId;
      if (rid) {
        // Éviter le double comptage si le même referrerId est dans les deux sources
        // On vérifie si ce user a déjà été compté via TalentProfile
        const alreadyCounted = (profiles || []).some(p => p.userId === u.id && p.referrerId === rid);
        if (!alreadyCounted) {
          referralCountByUser[rid] = (referralCountByUser[rid] || 0) + 1;
        }
      }
    }

    // Construire la fiche fusionnée par user
    const enrichedUsers = (users || []).map(u => {
      const profile = profileByUserId[u.id] || null;
      const sessionCount = sessionCountByUser[u.id] || 0;
      const referralsMade = referralCountByUser[u.id] || 0;
      const firstSession = firstSessionByUser[u.id] || null;
      const lastSession = lastSessionByUser[u.id] || null;

      // Temps en jours depuis created_date
      const createdAt = u.created_date || null;
      const daysToFirstSession = firstSession && createdAt
        ? Math.floor((new Date(firstSession) - new Date(createdAt)) / 86400000)
        : null;

      return {
        // Identité (User)
        userId: u.id,
        email: u.email || null,
        displayName: profile?.displayName || u.full_name || u.username || null,
        role: u.role || (u.systemRoles?.[0]) || 'user',
        status: u.status || 'active',

        // Dates clés (User)
        createdAt,
        lastLoginAt: u.lastLoginAt || null,
        lastSeenAt: u.lastSeenAt || null,

        // Referral (User — source canonique)
        referralCode: u.referralCode || profile?.referralCode || null,
        referrerId: u.referrerId || profile?.referrerId || null,
        originContext: u.originContext || profile?.originContext || null,

        // Activité calculée
        sessionCount,
        referralsMade,
        firstSessionAt: firstSession,
        lastSessionAt: lastSession,
        daysToFirstSession,

        // XP depuis TalentProfile
        xpGlobal: profile?.xpGlobal || 0,
        sotsGlobalScore: profile?.sotsGlobalScore || 0,
        avatarUrl: profile?.avatarUrl || null,
        hasProfile: !!profile,
      };
    });

    // KPIs globaux
    const total = enrichedUsers.length;
    const withReferrer = enrichedUsers.filter(u => u.referrerId).length;
    const referrers = new Set(enrichedUsers.map(u => u.referrerId).filter(Boolean)).size;
    const withSessions = enrichedUsers.filter(u => u.sessionCount > 0).length;

    // RSI = référencés totaux / profils actifs (utilisateurs onboardés)
    // Définition du plan d'affaires : "nombre moyen de nouveaux utilisateurs introduits par un utilisateur actif"
    // 8 référencés / 29 profils = 0.28 — chaque profil actif a amené en moyenne 0.28 nouvel utilisateur
    const withProfile = enrichedUsers.filter(u => u.hasProfile).length;
    const rsiRatio = withProfile > 0 ? (withReferrer / withProfile) : 0;

    // rsiRatioAmongReferrers = ratio parmi ceux qui référencent activement (métrique secondaire)
    // 8 référencés / 2 référents actifs = 4 — chaque référent actif amène en moyenne 4 personnes
    const rsiRatioAmongReferrers = referrers > 0 ? (withReferrer / referrers) : 0;

    return Response.json({
      ok: true,
      kpis: {
        total,
        withProfile,        // profils complétés (onboarding fait) — dénominateur RSI
        noProfile: total - withProfile,
        withReferrer,
        referrers,
        withSessions,
        rsiRatio: Math.round(rsiRatio * 100) / 100,
        rsiRatioAmongReferrers: Math.round(rsiRatioAmongReferrers * 100) / 100,
        rsiTarget: 1.1,
        aboveTarget: rsiRatio >= 1.1,
      },
      users: enrichedUsers,
      computedAt: new Date().toISOString(),
    });

  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
});