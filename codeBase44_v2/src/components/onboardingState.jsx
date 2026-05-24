import { createPageUrl } from "../utils";

export function parsePrefObject(value) {
  if (!value) return {};
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }
  return typeof value === 'object' ? value : {};
}

export function activeIdsFromPrefObject(prefObject) {
  const parsed = parsePrefObject(prefObject);
  return Object.entries(parsed)
    .filter(([, v]) => v?.active !== false)
    .map(([k]) => k)
    .filter(Boolean);
}

export function styleWeightsFromPrefObject(prefObject) {
  const parsed = parsePrefObject(prefObject);
  const out = {};
  for (const [styleId, value] of Object.entries(parsed)) {
    if (value?.active === false) continue;
    const weight = Number(value?.weight);
    out[styleId] = Number.isFinite(weight) ? weight : 50;
  }
  return out;
}

export function buildProfileSyncPayload({ rolePrefs, stylePrefs, roleDomainMap = {} }) {
  const activeRoles = activeIdsFromPrefObject(rolePrefs);
  const activeStyles = activeIdsFromPrefObject(stylePrefs);
  const styleWeights = styleWeightsFromPrefObject(stylePrefs);
  const activeDomains = Array.from(new Set(activeRoles.map((rid) => roleDomainMap[rid]).filter(Boolean)));

  return {
    activeRoles,
    activeStyles,
    styleWeights,
    activeDomains,
    updatedAt: new Date().toISOString(),
  };
}

export function defaultTalentProfilePayload(user, overrides = {}) {
  const emailPrefix = user?.email ? String(user.email).split('@')[0] : 'talent';
  return {
    userId: user?.id,
    displayName: overrides.displayName || user?.full_name || emailPrefix,
    bio: overrides.bio || '',
    avatarUrl: overrides.avatarUrl || '',
    xpGlobal: 0,
    sotsGlobalScore: 0,
    sotsRecent30Score: 0,
    trustScore: 0,
    verifiedRevenueTotal: 0,
    activeRoles: [],
    activeStyles: [],
    activeCheckpoints: [],
    activeDomains: [],
    styleWeights: {},
    referralCode: overrides.referralCode || generateReferralCode(),
  };
}

export function generateReferralCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = 'MR';
  for (let i = 0; i < 8; i += 1) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export async function ensureUserPreferences(base44, user) {
  if (!user?.id) return null;
  const rows = await base44.entities.UserPreferences.filter({ userId: user.id }).catch(() => []);
  if (rows?.[0]) return rows[0];
  return base44.entities.UserPreferences.create({
    userId: user.id,
    rolePrefs: {},
    stylePrefs: {},
    checkpointPrefs: {},
  });
}

export async function ensureTalentProfile(base44, user, overrides = {}) {
  if (!user?.id) return null;
  const rows = await base44.entities.TalentProfile.filter({ userId: user.id }).catch(() => []);
  if (rows?.[0]) return rows[0];
  return base44.entities.TalentProfile.create(defaultTalentProfilePayload(user, overrides));
}

export async function syncTalentProfileFromPreferences(base44, user, prefs, options = {}) {
  if (!user?.id || !prefs) return null;
  const profile = await ensureTalentProfile(base44, user, options.profileOverrides || {});
  if (!profile?.id) return null;
  const payload = buildProfileSyncPayload({
    rolePrefs: prefs.rolePrefs,
    stylePrefs: prefs.stylePrefs,
    roleDomainMap: options.roleDomainMap || {},
  });
  return base44.entities.TalentProfile.update(profile.id, payload);
}

export function onboardingRoute() {
  return createPageUrl('Onboarding');
}