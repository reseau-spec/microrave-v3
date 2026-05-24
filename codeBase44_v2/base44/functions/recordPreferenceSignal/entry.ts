// deploy: v2
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

// v — VALID_DOMAINS chargé dynamiquement depuis StyleHierarchy dans le handler.
// Fallback statique utilisé uniquement si StyleHierarchy inaccessible.
const VALID_DOMAINS_FALLBACK = new Set(['music','humour','photo','video','food','art','responsable']);
const DEFAULT_AFFINITY = 0.5;
// NEUTRAL_AFFINITY utilise VALID_DOMAINS_FALLBACK au module scope (avant chargement handler)
// Le handler injecte VALID_DOMAINS dynamique pour les validations runtime
const NEUTRAL_AFFINITY = Object.fromEntries([...VALID_DOMAINS_FALLBACK].map(d => [d, DEFAULT_AFFINITY]));

// Signal raw 0..1, multiplié par 0.1 pour obtenir delta effectif
const SIGNAL_WEIGHTS = {
  feed_impression: 0.2,
  feed_click: 0.6,
  object_view: 0.7,
  follow: 0.8,
  join_session: 0.9,
  attend_event: 0.9,
  feed_hero_impression: 0.3,
  feed_hero_click: 0.8,
  feed_hero_secondary_click: 0.6,
  // aliases compatibilité ancienne version
  event_view: 0.7,
  session_join: 0.9,
  vote: 1.0
};

const ALPHA = 0.15;
const DECAY = 0.998;

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    // v — VALID_DOMAINS dynamique depuis StyleHierarchy
    const _stylesForDomains = await base44.asServiceRole.entities.StyleHierarchy.filter({}). catch(() => []);
    const VALID_DOMAINS = new Set((_stylesForDomains || []).map(s => s.domainKey).filter(Boolean));
    if (!user) {
      return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    // SECURITY: ignore userId from client — always use authenticated user
    const userId = user.id;

    const body = await req.json().catch(() => ({}));
    const { reason } = body;

    // Support domainKeys[] (nouveau) ou domainKey (compat)
    let domainKeys = body.domainKeys;
    if (!domainKeys && body.domainKey) {
      domainKeys = [body.domainKey];
    }

    if (!reason) {
      return Response.json({ ok: false, error: 'reason requis' }, { status: 400 });
    }
    if (!domainKeys || domainKeys.length === 0) {
      return Response.json({ ok: true, skipped: 'NO_DOMAIN', results: [] });
    }
    const validDomainKeys = domainKeys.filter(d => VALID_DOMAINS.has(d));
    const filteredOut = domainKeys.filter(d => !VALID_DOMAINS.has(d));
    if (filteredOut.length > 0) {
      console.warn(`[recordPreferenceSignal] Filtered out invalid domains: ${filteredOut.join(', ')}`);
    }
    if (validDomainKeys.length === 0) {
      return Response.json({ ok: true, skipped: 'ALL_DOMAINS_INVALID', filtered: filteredOut, results: [] });
    }
    domainKeys = validDomainKeys;

    const signalRaw = SIGNAL_WEIGHTS[reason];
    if (signalRaw === undefined) {
      return Response.json({ ok: false, error: `reason invalide: ${reason}. Valeurs: ${Object.keys(SIGNAL_WEIGHTS).join(', ')}` }, { status: 400 });
    }

    // Delta effectif = signal * 0.1
    const signalEff = signalRaw * 0.1;
    const nowIso = new Date().toISOString();

    // Charger ou auto-init UserPreferences
    const existing = await base44.asServiceRole.entities.UserPreferences.filter({ userId });
    let prefs = existing?.[0];
    const currentAffinity = { ...NEUTRAL_AFFINITY, ...(prefs?.domainAffinity || {}) };

    const results = [];
    const updatedAffinity = { ...currentAffinity };

    for (const domainKey of domainKeys) {
      const affinityOld = updatedAffinity[domainKey] ?? DEFAULT_AFFINITY;
      const affinityNew = clamp(affinityOld * DECAY + ALPHA * signalEff, 0, 1);
      const delta = affinityNew - affinityOld;
      updatedAffinity[domainKey] = Math.round(affinityNew * 10000) / 10000;
      results.push({ domainKey, affinityOld: Math.round(affinityOld * 10000) / 10000, affinityNew: updatedAffinity[domainKey], delta: Math.round(delta * 10000) / 10000 });
    }

    // Sauvegarder UserPreferences
    if (prefs) {
      await base44.asServiceRole.entities.UserPreferences.update(prefs.id, {
        domainAffinity: updatedAffinity,
        updatedAt: nowIso
      });
    } else {
      await base44.asServiceRole.entities.UserPreferences.create({
        userId,
        domainAffinity: updatedAffinity,
        updatedAt: nowIso
      });
    }

    // Insérer une ligne ledger par domainKey (append-only)
    for (const r of results) {
      await base44.asServiceRole.entities.UserPreferenceLedger.create({
        systemId: `LOG-${userId}-${r.domainKey}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        userId,
        domainKey: r.domainKey,
        signal: signalEff,
        reason,
        timestamp: nowIso
      });
    }

    return Response.json({ ok: true, results, updatedAffinity });

  } catch (error) {
    console.error('[recordPreferenceSignal] Error:', error);
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});