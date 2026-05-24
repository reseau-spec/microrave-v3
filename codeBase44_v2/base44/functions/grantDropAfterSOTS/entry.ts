// deploy: v3
// PATCH v3: StyleUsageStats était vide (jamais peuplé) → le drop échouait toujours.
// On pioche maintenant directement dans StyleHierarchy par domainKey + rarityTier.
// Le rarityTier (common/rare/epic/legendary) remplace rarityIndex (0-100) comme
// critère de sélection — il est présent sur tous les styles actifs.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

// Mapping rarityTier → probabilité de drop (somme = 100%)
const RARITY_WEIGHTS = {
  legendary: 5,   //  5% — ultra rare
  epic:      20,  // 20% — rare
  rare:      35,  // 35% — peu commun
  common:    40,  // 40% — commun (fallback dominant)
};

// Tirage pondéré selon les seuils cumulatifs
function pickRarityTier(roll) {
  if (roll < RARITY_WEIGHTS.legendary) return 'legendary';
  if (roll < RARITY_WEIGHTS.legendary + RARITY_WEIGHTS.epic) return 'epic';
  if (roll < RARITY_WEIGHTS.legendary + RARITY_WEIGHTS.epic + RARITY_WEIGHTS.rare) return 'rare';
  return 'common';
}

function pickRandom(arr) {
  if (!arr || arr.length === 0) return null;
  return arr[Math.floor(Math.random() * arr.length)];
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return json(401, { ok: false, error: 'Authentication required' });
    }

    const body = await req.json().catch(() => ({}));
    const { sessionId } = body;

    if (!sessionId) {
      return json(400, { ok: false, error: 'sessionId is required' });
    }

    const service = base44.asServiceRole;

    // Charger session
    const sessions = await service.entities.Session.filter({ id: sessionId }).catch(() => []);
    if (sessions.length === 0) {
      return json(404, { ok: false, error: 'Session not found' });
    }
    const session = sessions[0];

    // Vérifier que l'user a soumis SOTS
    const sotsSubmittedBy = Array.isArray(session.sotsSubmittedBy) ? session.sotsSubmittedBy : [];
    if (!sotsSubmittedBy.includes(user.id)) {
      return json(400, { ok: false, error: 'User has not submitted SOTS for this session' });
    }

    // Anti-duplication: DropLog existant ?
    const existingDrops = await service.entities.DropLog.filter({
      userId: user.id,
      sessionId,
    }).catch(() => []);

    if (existingDrops.length > 0) {
      return json(200, { ok: true, alreadyGranted: true, drop: existingDrops[0] });
    }

    // Trouver le participant pour récupérer le rôle
    const participants = Array.isArray(session.participants) ? session.participants : [];
    const me = participants.find(p => p.userId === user.id);

    if (!me || !me.roleSystemId) {
      return json(400, { ok: false, error: 'User role not found in session' });
    }

    // Résoudre domainKey depuis RoleDomainMap
    const roleMappings = await service.entities.RoleDomainMap.filter({
      roleSystemId: me.roleSystemId,
    }).catch(() => []);

    if (roleMappings.length === 0) {
      return json(400, { ok: false, error: 'Role domain mapping not found' });
    }

    const domainKey = roleMappings[0].domainKey;

    // PATCH v3: charger les styles depuis StyleHierarchy (actifs, L3 de préférence, même domaine)
    // StyleUsageStats était vide — on n'en dépend plus.
    const allStyles = await service.entities.StyleHierarchy.filter({
      domainKey,
      active: true,
    }).catch(() => []);

    // Préférer les styles L3 (sous-genres, les plus précis) pour le drop
    const stylesL3 = allStyles.filter(s => s.level === 3);
    const stylesPool = stylesL3.length > 0 ? stylesL3 : allStyles;

    if (stylesPool.length === 0) {
      return json(500, { ok: false, error: 'No styles available for drop in this domain' });
    }

    // Grouper par rarityTier
    const byTier = {
      legendary: stylesPool.filter(s => s.rarityTier === 'legendary'),
      epic:      stylesPool.filter(s => s.rarityTier === 'epic'),
      rare:      stylesPool.filter(s => s.rarityTier === 'rare'),
      common:    stylesPool.filter(s => s.rarityTier === 'common' || !s.rarityTier),
    };

    // Tirage probabiliste avec cascade de fallback
    const roll = Math.floor(Math.random() * 100);
    const targetTier = pickRarityTier(roll);

    // Cascade : si le tier cible est vide, descendre vers common
    const tierOrder = ['legendary', 'epic', 'rare', 'common'];
    let selectedStyle = null;
    let actualTier = targetTier;

    for (const tier of [targetTier, ...tierOrder.filter(t => t !== targetTier)]) {
      if (byTier[tier].length > 0) {
        selectedStyle = pickRandom(byTier[tier]);
        actualTier = tier;
        break;
      }
    }

    // Fallback ultime
    if (!selectedStyle) {
      selectedStyle = pickRandom(stylesPool);
      actualTier = selectedStyle?.rarityTier || 'common';
    }

    if (!selectedStyle) {
      return json(500, { ok: false, error: 'Could not select a style for drop' });
    }

    const now = new Date().toISOString();

    // Convertir rarityTier → rarityIndex approximatif pour rétrocompatibilité UI
    const TIER_TO_INDEX = { legendary: 95, epic: 75, rare: 55, common: 25 };
    const rarityIndex = TIER_TO_INDEX[actualTier] ?? 25;

    // Créer DropLog
    const dropLog = await service.entities.DropLog.create({
      userId: user.id,
      sessionId,
      domainKey,
      dropType: 'style_unlock',
      payload: {
        styleSystemId: selectedStyle.systemId,
        styleName: selectedStyle.displayName || selectedStyle.systemId,
        rarityTier: actualTier,
        rarityIndex,
        roll,
      },
      createdAt: now,
    });

    // Créer UserUnlocks (idempotent)
    const existingUnlock = await service.entities.UserUnlocks.filter({
      userId: user.id,
      styleSystemId: selectedStyle.systemId,
    }).catch(() => []);

    if (existingUnlock.length === 0) {
      await service.entities.UserUnlocks.create({
        userId: user.id,
        styleSystemId: selectedStyle.systemId,
        domainKey,
        unlockedAt: now,
      }).catch(e => console.warn('[grantDropAfterSOTS] UserUnlocks create failed:', e?.message));
    }

    console.log('[grantDropAfterSOTS] drop granted', {
      userId: user.id,
      sessionId,
      styleSystemId: selectedStyle.systemId,
      rarityTier: actualTier,
      rarityIndex,
      roll,
    });

    return json(200, {
      ok: true,
      alreadyGranted: false,
      drop: {
        styleSystemId: selectedStyle.systemId,
        styleName: selectedStyle.displayName || selectedStyle.systemId,
        domainKey,
        rarityTier: actualTier,
        rarityIndex,
        roll,
      },
    });

  } catch (error) {
    console.error('[grantDropAfterSOTS] error:', error);
    return json(500, { ok: false, error: error?.message || 'Unexpected error' });
  }
});