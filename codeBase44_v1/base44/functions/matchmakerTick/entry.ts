/**
 * matchmakerTick.ts — QUICKPLAY MATCHMAKER CANONIQUE
 *
 * RÈGLES CANONIQUES À NE PAS CASSER
 * ---------------------------------
 * 1) Le matchmaker quickplay est HIÉRARCHIQUE, pas purement score-based.
 * 2) Il choisit le MEILLEUR GROUPE DISPONIBLE à l’instant T.
 * 3) Il ne part PAS d’une ancre "plus vieille d’abord" si cela pénalise
 *    un meilleur match arrivé juste après.
 *
 * ORDRE DES PALIERS
 * -----------------
 * - immédiat : même rôle exact + L3
 * - après 15s : même rôle exact + L2
 * - après 30s : même rôle exact + L1
 * - après 45s : même rôle exact + L0
 * - après 60s : ANY (n’importe quel matching)
 *
 * DÉFINITIONS
 * -----------
 * - L3 / L2 / L1 viennent de StyleHierarchy (proximité hiérarchique des styles)
 * - L0 signifie :
 *     même rôle exact, mais aucune proximité style L1/L2/L3
 * - ANY signifie :
 *     après 60s, on autorise n’importe quel matching pour débloquer la file
 *
 * SOURCE DE VÉRITÉ
 * ----------------
 * - queueing + heartbeat récent = joueur matchable
 * - Session.status='lobby' + sessionType='quickplay' = lobby ouvert
 *
 * PRIORITÉ DE CHOIX
 * -----------------
 * Parmi les actions possibles, on choisit :
 * 1. le meilleur palier (L3 > L2 > L1 > L0 > ANY)
 * 2. la meilleure qualité interne dans le palier
 * 3. l’attente la plus forte comme départage seulement
 *
 * IMPORTANT
 * ---------
 * - on ne favorise JAMAIS un autre rôle juste parce qu’il est différent
 * - le temps d’attente ouvre progressivement les paliers ;
 *   il ne renverse pas la hiérarchie métier
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

// ─────────────────────────────────────────────────────────────────────────────
// Style helpers
// ─────────────────────────────────────────────────────────────────────────────
function buildStyleSets(styleIds, styleMap) {
  const L1 = new Set();
  const L2 = new Set();
  const L3 = new Set();

  for (const sid of styleIds || []) {
    if (!sid || !styleMap[sid]) continue;

    const node = styleMap[sid];

    if (node.level === 3) {
      L3.add(sid);
      if (node.parentSystemId) L2.add(node.parentSystemId);
      if (node.racineSystemId) L1.add(node.racineSystemId);
    } else if (node.level === 2) {
      L2.add(sid);
      if (node.racineSystemId) L1.add(node.racineSystemId);
    } else if (node.level === 1) {
      L1.add(sid);
    }
  }

  return { L1, L2, L3 };
}

function intersects(a, b) {
  for (const v of a) {
    if (b.has(v)) return true;
  }
  return false;
}

function computeStyleMatchLevel(setsA, setsB) {
  if (intersects(setsA.L3, setsB.L3)) return 3;
  if (intersects(setsA.L2, setsB.L2)) return 2;
  if (intersects(setsA.L1, setsB.L1)) return 1;
  return 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Style cache
// ─────────────────────────────────────────────────────────────────────────────
let STYLE_CACHE = { at: 0, map: {} };
const STYLE_CACHE_TTL_MS = 600_000;

async function getStyleMap(service) {
  const now = Date.now();

  if (
    Object.keys(STYLE_CACHE.map).length > 0 &&
    now - STYLE_CACHE.at < STYLE_CACHE_TTL_MS
  ) {
    return STYLE_CACHE.map;
  }

  const styles = await service.entities.StyleHierarchy.filter({}).catch(() => []);
  const map = {};

  for (const s of styles || []) {
    if (!s?.systemId) continue;

    map[s.systemId] = {
      level: s.level || 1,
      parentSystemId: s.parentSystemId || null,
      racineSystemId: s.racineSystemId || null,
    };
  }

  STYLE_CACHE = { at: now, map };
  return map;
}

// ─────────────────────────────────────────────────────────────────────────────
// Debug flag
// ─────────────────────────────────────────────────────────────────────────────
const DEBUG_MATCHMAKER = true;

function dbg(label, payload) {
  if (DEBUG_MATCHMAKER) console.log(label, JSON.stringify(payload));
}

function getOpenTierForWaitMs(waitMs) {
  const s = Math.floor((waitMs || 0) / 1000);
  if (s >= 60) return 'ANY';
  if (s >= 45) return 'L0';
  if (s >= 30) return 'L1';
  if (s >= 15) return 'L2';
  return 'L3_only';
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────
// TTL augmenté de 15s à 30s — la fenêtre de 15s était trop courte
// quand deux users entrent en queue à des moments décalés :
// le tick de 7s pouvait rater la fenêtre où les deux sont simultanément "frais".
// 30s = heartbeat écrit toutes les 5s × 6 cycles de tolérance.
const HEARTBEAT_TTL_MS = 30_000;
const TICK_LIMIT = 40;
const LOBBY_SCAN_LIMIT = 50;

const THROTTLE_MS = 0;
const THROTTLE_KEY = 'matchmaker_lastTickAt';

const LOCK_KEY = 'matchmaker_lock';
const LOCK_TTL_MS = 2_500;

const TIER_WAIT_SECONDS = {
  L3: 0,
  L2: 15,
  L1: 30,
  L0: 45,
  ANY: 60,
};

const TIER_RANK = {
  L3: 5,
  L2: 4,
  L1: 3,
  L0: 2,
  ANY: 1,
  NONE: 0,
};

// ─────────────────────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────────────────────
function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function asArray(v, fallback = []) {
  if (Array.isArray(v)) return v;

  if (typeof v === 'string') {
    try {
      const parsed = JSON.parse(v);
      return Array.isArray(parsed) ? parsed : fallback;
    } catch {
      return fallback;
    }
  }

  return fallback;
}

function normalizeId(v) {
  if (!v) return null;
  if (typeof v === 'string') return v;
  if (typeof v === 'object') return v.id || v._id || v.value || null;
  return null;
}

function normalizeParticipants(raw) {
  return asArray(raw, [])
    .map((p) => (typeof p === 'string' ? { userId: p } : p))
    .filter(Boolean);
}

function getUserWaitMs(q, now) {
  const queuedAtMs = q?.queuedAt ? new Date(q.queuedAt).getTime() : null;
  if (queuedAtMs && !Number.isNaN(queuedAtMs)) {
    return Math.max(0, now - queuedAtMs);
  }

  const createdAtMs = q?.created_date ? new Date(q.created_date).getTime() : null;
  if (createdAtMs && !Number.isNaN(createdAtMs)) {
    return Math.max(0, now - createdAtMs);
  }

  return 0;
}

function getTierForSameRole(styleLevel, waitSeconds) {
  if (styleLevel >= 3 && waitSeconds >= TIER_WAIT_SECONDS.L3) return 'L3';
  if (styleLevel >= 2 && waitSeconds >= TIER_WAIT_SECONDS.L2) return 'L2';
  if (styleLevel >= 1 && waitSeconds >= TIER_WAIT_SECONDS.L1) return 'L1';
  if (waitSeconds >= TIER_WAIT_SECONDS.L0) return 'L0';
  return 'NONE';
}

/**
 * TIER STRICT PAR USER — chaque user a son propre palier ouvert selon son waitMs.
 * Un match est valide si le palier COMMUN (min des deux) autorise ce styleLevel.
 * Le palier commun = le plus restrictif des deux (celui qui a le moins attendu).
 *
 * Règle : pour former une paire, on prend le palier du user qui a le MOINS attendu.
 * Ce user définit le niveau minimum requis. Si l'autre a plus attendu, tant mieux —
 * mais on ne peut pas matcher "mieux" que ce que le plus récent autorise.
 */
function getTierForPair(a, b, styleLevel, sameRole) {
  const tierA = getOpenTierForWaitMs(a.waitMs || 0);
  const tierB = getOpenTierForWaitMs(b.waitMs || 0);

  const tierOrder = ['L3_only', 'L2', 'L1', 'L0', 'ANY'];
  const rankA = tierOrder.indexOf(tierA);
  const rankB = tierOrder.indexOf(tierB);
  const commonTierKey = tierOrder[Math.min(rankA, rankB)];

  if (!sameRole) {
    return commonTierKey === 'ANY' ? 'ANY' : 'NONE';
  }

  if (commonTierKey === 'L3_only') {
    return styleLevel >= 3 ? 'L3' : 'NONE';
  }
  if (commonTierKey === 'L2') {
    return styleLevel >= 2 ? (styleLevel >= 3 ? 'L3' : 'L2') : 'NONE';
  }
  if (commonTierKey === 'L1') {
    if (styleLevel >= 3) return 'L3';
    if (styleLevel >= 2) return 'L2';
    if (styleLevel >= 1) return 'L1';
    return 'NONE';
  }
  if (commonTierKey === 'L0') {
    if (styleLevel >= 3) return 'L3';
    if (styleLevel >= 2) return 'L2';
    if (styleLevel >= 1) return 'L1';
    return 'L0';
  }
  if (commonTierKey === 'ANY') {
    if (styleLevel >= 3) return 'L3';
    if (styleLevel >= 2) return 'L2';
    if (styleLevel >= 1) return 'L1';
    return 'L0';
  }

  return 'NONE';
}

function getTierForLobbyJoin(queueUser, worstLobbyRelation) {
  const openTier = getOpenTierForWaitMs(queueUser.waitMs || 0);

  if (!worstLobbyRelation.sameRole) {
    return openTier === 'ANY' ? 'ANY' : 'NONE';
  }

  if (openTier === 'L3_only') {
    return worstLobbyRelation.styleLevel >= 3 ? 'L3' : 'NONE';
  }
  if (openTier === 'L2') {
    return worstLobbyRelation.styleLevel >= 2
      ? (worstLobbyRelation.styleLevel >= 3 ? 'L3' : 'L2')
      : 'NONE';
  }
  if (openTier === 'L1') {
    if (worstLobbyRelation.styleLevel >= 3) return 'L3';
    if (worstLobbyRelation.styleLevel >= 2) return 'L2';
    if (worstLobbyRelation.styleLevel >= 1) return 'L1';
    return 'NONE';
  }
  if (openTier === 'L0') {
    if (worstLobbyRelation.styleLevel >= 3) return 'L3';
    if (worstLobbyRelation.styleLevel >= 2) return 'L2';
    if (worstLobbyRelation.styleLevel >= 1) return 'L1';
    return 'L0';
  }
  if (openTier === 'ANY') {
    if (worstLobbyRelation.sameRole) {
      if (worstLobbyRelation.styleLevel >= 3) return 'L3';
      if (worstLobbyRelation.styleLevel >= 2) return 'L2';
      if (worstLobbyRelation.styleLevel >= 1) return 'L1';
      return 'L0';
    }
    return 'ANY';
  }

  return 'NONE';
}


// ─────────────────────────────────────────────────────────────────────────────
// Action comparator — Rule Engine strict
// ─────────────────────────────────────────────────────────────────────────────
/**
 * RULE ENGINE STRICT — ordre de priorité :
 * 1. Tier le plus haut (L3 > L2 > L1 > L0 > ANY) — JAMAIS de contamination cross-tier
 * 2. À tier égal : create propre > fill (cohérence > remplissage)
 * 3. styleLevel le plus élevé dans le tier
 * 4. sameRole explicite (pour ANY tier)
 * 5. Attente la plus longue (fairness)
 */
function compareActionsDesc(a, b) {
  // 1. Tier strict — un match L3 bat toujours un match L2, peu importe le reste
  const tierDelta = (TIER_RANK[b.tier] || 0) - (TIER_RANK[a.tier] || 0);
  if (tierDelta !== 0) return tierDelta;

  // 2. create > fill à tier égal (cohérence > remplissage)
  const typeA = a.actionType === 'create' ? 1 : 0;
  const typeB = b.actionType === 'create' ? 1 : 0;
  if (typeB !== typeA) return typeB - typeA;

  // 3. Meilleur styleLevel dans le tier
  const styleDelta = (b.styleLevel || 0) - (a.styleLevel || 0);
  if (styleDelta !== 0) return styleDelta;

  // 4. sameRole explicite (pour ANY tier)
  const sameRoleDelta = Number(Boolean(b.sameRole)) - Number(Boolean(a.sameRole));
  if (sameRoleDelta !== 0) return sameRoleDelta;

  // 5. Attente la plus longue (fairness)
  const waitDelta = (b.waitScore || 0) - (a.waitScore || 0);
  if (waitDelta !== 0) return waitDelta;

  return 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Throttle / Lock helpers
// ─────────────────────────────────────────────────────────────────────────────
async function checkThrottle(service, now) {
  const allCfg = await service.entities.SystemConfig.filter({}).catch(() => []);
  const rows = (allCfg || []).filter((r) => r.key === THROTTLE_KEY);
  const cfg = rows?.[0] || null;
  const lastAt = cfg?.value ? Number(cfg.value) : 0;

  if (lastAt && now - lastAt < THROTTLE_MS) {
    return { skip: true, cfg };
  }

  return { skip: false, cfg };
}

async function writeThrottle(service, cfg, now) {
  const nowIso = new Date(now).toISOString();

  if (cfg?.id) {
    await service.entities.SystemConfig.update(cfg.id, {
      value: String(now),
      updatedAt: nowIso,
    }).catch(() => {});
  } else {
    await service.entities.SystemConfig.create({
      key: THROTTLE_KEY,
      value: String(now),
      updatedAt: nowIso,
    }).catch(() => {});
  }
}

async function tryAcquireLock(service, now) {
  const allCfg = await service.entities.SystemConfig.filter({}).catch(() => []);
  const rows = (allCfg || []).filter((r) => r.key === LOCK_KEY);
  const cfg = rows?.[0] || null;
  const lockedUntil = cfg?.value ? Number(cfg.value) : 0;

  if (lockedUntil && lockedUntil > now) {
    return false;
  }

  const nowIso = new Date(now).toISOString();
  const newVal = String(now + LOCK_TTL_MS);

  if (cfg?.id) {
    await service.entities.SystemConfig.update(cfg.id, {
      value: newVal,
      updatedAt: nowIso,
    }).catch(() => {});
  } else {
    await service.entities.SystemConfig.create({
      key: LOCK_KEY,
      value: newVal,
      updatedAt: nowIso,
    }).catch(() => {});
  }

  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Candidate builders
// ─────────────────────────────────────────────────────────────────────────────
function buildQueueRecord(q, now, styleMap) {
  const userId = normalizeId(q?.userId);
  const roleSystemId = q?.roleSystemId || null;
  const styleSystemIds = asArray(q?.styleSystemIds, []);
  const waitMs = getUserWaitMs(q, now);
  const styleSets = buildStyleSets(styleSystemIds, styleMap);

  return {
    raw: q,
    queueStateId: q?.id || null,
    userId,
    roleSystemId,
    styleSystemIds,
    styleSets,
    waitMs,
  };
}

function buildPairAction(a, b) {
  const sameRole = Boolean(a.roleSystemId && b.roleSystemId && a.roleSystemId === b.roleSystemId);
  const styleLevel = computeStyleMatchLevel(a.styleSets, b.styleSets);
  const tier = getTierForPair(a, b, styleLevel, sameRole);

  // ── AUDIT LOG MM PAIR ───────────────────────────────────────────────────
  console.log('[MM][PAIR]', JSON.stringify({
    a: a.userId,
    b: b.userId,
    aWaitMs: a.waitMs,
    bWaitMs: b.waitMs,
    sameRole,
    styleLevel,
    tier,
    allowed: tier !== 'NONE',
  }));

  dbg('[matchmakerTick] pairEval', {
    userA: a.userId,
    userB: b.userId,
    roleA: a.roleSystemId,
    roleB: b.roleSystemId,
    sameRole,
    styleIdsA: a.styleSystemIds,
    styleIdsB: b.styleSystemIds,
    styleLevel,
    waitMsA: a.waitMs,
    waitMsB: b.waitMs,
    pairWaitMsMin: Math.min(a.waitMs || 0, b.waitMs || 0),
    tier,
  });

  if (tier === 'NONE') {
    // ── AUDIT LOG MM PAIR_REJECT ──────────────────────────────────────────
    console.log('[MM][PAIR_REJECT]', JSON.stringify({
      a: a.userId,
      b: b.userId,
      aWaitMs: a.waitMs,
      bWaitMs: b.waitMs,
      aTier: getOpenTierForWaitMs(a.waitMs),
      bTier: getOpenTierForWaitMs(b.waitMs),
      sameRole,
      styleLevel,
      tier,
      aRole: a.roleSystemId,
      bRole: b.roleSystemId,
    }));
    return null;
  }

  return {
    actionType: 'create',
    tier,
    sameRole,
    styleLevel,
    waitScore: Math.min(a.waitMs, b.waitMs),
    targetParticipants: 2,
    players: [a, b],
    session: null,
  };
}

/**
 * LOBBY COHERENCE — WORST LINK (not best)
 * Un candidat ne rejoint le lobby que si sa compatibilité avec TOUS les membres
 * satisfait le palier courant. On prend le lien le plus faible (min styleLevel).
 * sameRole doit être vrai avec TOUS les membres (jusqu'à ANY).
 */
function getWorstLobbyRelation(queueUser, lobbyParticipants, styleMap) {
  let checkedCount = 0;
  let worstStyleLevel = 3; // start optimistic, degrade toward worst
  let allSameRole = true;

  for (const p of lobbyParticipants) {
    const pUserId = normalizeId(p?.userId);
    if (!pUserId || pUserId === queueUser.userId) continue;

    const pStyles = asArray(
      p?.styleSystemIds,
      p?.styleSystemId ? [p.styleSystemId] : []
    );

    const pSets = buildStyleSets(pStyles, styleMap);
    const styleLevel = computeStyleMatchLevel(queueUser.styleSets, pSets);
    const sameRole = Boolean(
      queueUser.roleSystemId &&
        p?.roleSystemId &&
        queueUser.roleSystemId === p.roleSystemId
    );

    worstStyleLevel = Math.min(worstStyleLevel, styleLevel);
    if (!sameRole) allSameRole = false;
    checkedCount++;
  }

  if (checkedCount === 0) return { sameRole: false, styleLevel: 0 };
  return { sameRole: allSameRole, styleLevel: worstStyleLevel };
}

function buildLobbyJoinAction(queueUser, lobbyEntry, styleMap) {
  const bestRelation = getWorstLobbyRelation(
    queueUser,
    lobbyEntry.parts,
    styleMap
  );

  const tier = getTierForLobbyJoin(queueUser, bestRelation);

  dbg('[matchmakerTick] lobbyEval', {
    queueUserId: queueUser.userId,
    sessionId: lobbyEntry?.s?.id,
    participantIds: (lobbyEntry?.parts || []).map(p => p?.userId),
    sameRole: bestRelation.sameRole,
    styleLevel: bestRelation.styleLevel,
    waitMs: queueUser.waitMs,
    tier,
  });

  if (tier === 'NONE') {
    console.log('[MM][LOBBY_REJECT]', JSON.stringify({
      userId: queueUser.userId,
      sessionId: lobbyEntry?.s?.id,
      waitMs: queueUser.waitMs,
      userTier: getOpenTierForWaitMs(queueUser.waitMs),
      sameRole: bestRelation.sameRole,
      styleLevel: bestRelation.styleLevel,
    }));
    return null;
  }

  return {
    actionType: 'fill',
    tier,
    sameRole: bestRelation.sameRole,
    styleLevel: bestRelation.styleLevel,
    waitScore: queueUser.waitMs,
    targetParticipants: (lobbyEntry.parts?.length || 0) + 1,
    players: [queueUser],
    session: lobbyEntry.s,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  const startTs = Date.now();

  try {
    const base44 = createClientFromRequest(req);
    const service = base44.asServiceRole;

    if (!service) {
      return json(503, { ok: false, code: 'SERVICE_ROLE_UNAVAILABLE' });
    }

    const now = Date.now();
    const nowIso = new Date(now).toISOString();

    const { skip, cfg: throttleCfg } = await checkThrottle(service, now);
    if (skip) {
      return json(200, {
        ok: true,
        skipped: true,
        reason: 'throttled',
      });
    }

    const gotLock = await tryAcquireLock(service, now);
    if (!gotLock) {
      return json(200, {
        ok: true,
        skipped: true,
        reason: 'locked',
      });
    }

    await writeThrottle(service, throttleCfg, now);

    // 1) Pool queueing matchable
    const allQueueing = await service.entities.UserQueueState.filter({
      status: 'queueing',
    }).catch(() => []);

    const exclusions = {
      already_matched: 0,
      already_active: 0,
      no_heartbeat: 0,
      heartbeat_stale: 0,
      no_user_id: 0,
      no_role: 0,
    };

    const styleMap = await getStyleMap(service);

    const queueRecords = (allQueueing || [])
      .filter((q) => {
        if (q?.matchedSessionId) {
          exclusions.already_matched++;
          return false;
        }

        if (q?.activeSessionId) {
          exclusions.already_active++;
          return false;
        }

        const hb = q?.lastHeartbeatAt ? new Date(q.lastHeartbeatAt).getTime() : null;
        if (!hb || Number.isNaN(hb)) {
          exclusions.no_heartbeat++;
          return false;
        }

        if (now - hb > HEARTBEAT_TTL_MS) {
          exclusions.heartbeat_stale++;
          return false;
        }

        return true;
      })
      .slice(0, TICK_LIMIT)
      .map((q) => buildQueueRecord(q, now, styleMap))
      .filter((q) => {
        if (!q.userId) {
          exclusions.no_user_id++;
          return false;
        }
        if (!q.roleSystemId) {
          exclusions.no_role++;
          return false;
        }
        return true;
      });

    if (allQueueing.length > 0) {
      console.log('[matchmakerTick] pool', JSON.stringify({
        queueing: allQueueing.length,
        matchable: queueRecords.length,
        excluded: exclusions,
      }));

      // ── AUDIT LOG MM USER ─────────────────────────────────────────────────
      for (const q of queueRecords) {
        const openTier = getOpenTierForWaitMs(q.waitMs);
        console.log('[MM][USER]', JSON.stringify({
          userId: q.userId,
          waitMs: q.waitMs,
          allowedTier: openTier,
          roleSystemId: q.roleSystemId,
          styleSystemIds: q.styleSystemIds,
          styleCount: q.styleSystemIds?.length ?? 0,
        }));
      }
    }

    if (queueRecords.length < 1) {
      // ── AUDIT LOG MM POOL (pool vide) ──────────────────────────────────
      console.log('[MM][POOL]', JSON.stringify({
        queueingCount: allQueueing.length,
        matchableCount: 0,
        excluded: exclusions,
        userIds: [],
      }));

      return json(200, {
        ok: true,
        matched: 0,
        poolSize: 0,
        reason: 'no_players',
        excluded: exclusions,
        durationMs: Date.now() - startTs,
      });
    }

    // ── AUDIT LOG MM POOL (pool actif) ─────────────────────────────────────
    console.log('[MM][POOL]', JSON.stringify({
      queueingCount: allQueueing.length,
      matchableCount: queueRecords.length,
      excluded: exclusions,
      userIds: queueRecords.map(q => q.userId),
      roles: queueRecords.map(q => q.roleSystemId),
      styleCounts: queueRecords.map(q => q.styleSystemIds?.length ?? 0),
    }));

    // 2) Open lobbies
    const allLobbies = await service.entities.Session.filter({
      status: 'lobby',
      sessionType: 'quickplay',
    }).catch(() => []);

    const openLobbies = (allLobbies || [])
      .slice(0, LOBBY_SCAN_LIMIT)
      .map((s) => {
        const parts = normalizeParticipants(s?.participants);
        const maxP = s?.maxPlayers || 6;
        return { s, parts, maxP };
      })
      .filter((entry) => entry.parts.length < entry.maxP);

    // 3) Build all actions
    const actions = [];

    // 3A) Fill existing lobbies
    for (const q of queueRecords) {
      for (const lobbyEntry of openLobbies) {
        const alreadyInside = lobbyEntry.parts.some(
          (p) => normalizeId(p?.userId) === q.userId
        );
        if (alreadyInside) continue;

        const action = buildLobbyJoinAction(q, lobbyEntry, styleMap);
        if (action) actions.push(action);
      }
    }

    // 3B) Create best new pair
    for (let i = 0; i < queueRecords.length; i++) {
      for (let j = i + 1; j < queueRecords.length; j++) {
        const a = queueRecords[i];
        const b = queueRecords[j];

        if (!a?.userId || !b?.userId) continue;
        if (a.userId === b.userId) continue;

        const action = buildPairAction(a, b);
        if (action) actions.push(action);
      }
    }

    // ── AUDIT LOG MM ACTIONS COUNT ─────────────────────────────────────────
    console.log('[MM][ACTIONS_COUNT]', JSON.stringify({
      total: actions.length,
      creates: actions.filter(a => a.actionType === 'create').length,
      fills: actions.filter(a => a.actionType === 'fill').length,
      byTier: actions.reduce((acc, a) => {
        acc[a.tier] = (acc[a.tier] || 0) + 1;
        return acc;
      }, {}),
    }));

    if (actions.length < 1) {
      // ── AUDIT LOG MM NO_ACTION ───────────────────────────────────────────
      console.log('[MM][NO_ACTION]', JSON.stringify({
        reason: 'no_action_after_build',
        poolSize: queueRecords.length,
        pairsAttempted: queueRecords.length * (queueRecords.length - 1) / 2,
        users: queueRecords.map(q => ({
          userId: q.userId,
          waitMs: q.waitMs,
          tier: getOpenTierForWaitMs(q.waitMs),
          role: q.roleSystemId,
          styleCount: q.styleSystemIds?.length ?? 0,
        })),
      }));

      return json(200, {
        ok: true,
        matched: 0,
        poolSize: queueRecords.length,
        reason: 'no_action',
        durationMs: Date.now() - startTs,
      });
    }

    dbg('[matchmakerTick] actionsBeforeSort', actions.slice(0, 25).map(a => ({
      actionType: a.actionType,
      tier: a.tier,
      styleLevel: a.styleLevel,
      sameRole: a.sameRole,
      waitScore: a.waitScore,
      players: (a.players || []).map(p => p.userId),
      sessionId: a.session?.id || null,
    })));

    actions.sort(compareActionsDesc);
    const best = actions[0];

    dbg('[matchmakerTick] winner', {
      actionType: best.actionType,
      tier: best.tier,
      styleLevel: best.styleLevel,
      sameRole: best.sameRole,
      waitScore: best.waitScore,
      players: (best.players || []).map(p => p.userId),
      sessionId: best.session?.id || null,
    });

    // 4) Execute best action
    if (best.actionType === 'fill') {
      const queueUser = best.players[0];
      const lobby = best.session;

      const currentParticipants = normalizeParticipants(lobby?.participants);
      const nextParticipants = [
        ...currentParticipants,
        {
          userId: queueUser.userId,
          roleSystemId: queueUser.roleSystemId,
          styleSystemId: queueUser.styleSystemIds[0] || null,
          styleSystemIds: queueUser.styleSystemIds,
          status: 'lobby',
          ready: false,
          joinedAt: nowIso,
          submittedBallot: false,
        },
      ];

      await service.entities.Session.update(lobby.id, {
        participants: nextParticipants,
        updatedAt: nowIso,
      });

      try {
        await service.entities.UserQueueState.update(queueUser.queueStateId, {
          status: 'matched',
          matchedSessionId: lobby.id,
          activeSessionId: lobby.id,
          matchedAt: nowIso,
          lastHeartbeatAt: nowIso,
        });
      } catch (error) {
        try {
          const fresh = await service.entities.Session.get(lobby.id).catch(() => null);
          if (fresh) {
            const reverted = normalizeParticipants(fresh.participants).filter(
              (p) => normalizeId(p?.userId) !== queueUser.userId
            );
            await service.entities.Session.update(lobby.id, {
              participants: reverted,
              updatedAt: nowIso,
            }).catch(() => {});
          }
        } catch {
          // best effort rollback
        }

        return json(200, {
          ok: false,
          code: 'QS_UPDATE_FAILED',
          durationMs: Date.now() - startTs,
        });
      }

      const durationMs = Date.now() - startTs;

      console.log(
        '[matchmakerTick] fill',
        JSON.stringify({
          sessionId: lobby.id,
          userId: queueUser.userId,
          tier: best.tier,
          styleLevel: best.styleLevel,
          sameRole: best.sameRole,
          participantsNow: nextParticipants.length,
          durationMs,
        })
      );

      return json(200, {
        ok: true,
        joined: true,
        sessionId: lobby.id,
        tier: best.tier,
        styleLevel: best.styleLevel,
        participantsNow: nextParticipants.length,
        durationMs,
      });
    }

    if (best.actionType === 'create') {
      const a = best.players[0];
      const b = best.players[1];

      // captain = plus ancien des deux, mais seulement APRÈS choix du meilleur groupe
      const ordered = [a, b].sort((x, y) => (y.waitMs || 0) - (x.waitMs || 0));
      const host = ordered[0];
      const guest = ordered[1];

      const session = await service.entities.Session.create({
        sessionType: 'quickplay',
        status: 'lobby',
        minPlayers: 2,
        maxPlayers: 6,
        lobbyOpenedAt: nowIso,
        hostUserId: host.userId,
        captainUserId: host.userId,
        participants: [
          {
            userId: host.userId,
            roleSystemId: host.roleSystemId,
            styleSystemId: host.styleSystemIds[0] || null,
            styleSystemIds: host.styleSystemIds,
            status: 'lobby',
            ready: false,
            joinedAt: nowIso,
            submittedBallot: false,
          },
          {
            userId: guest.userId,
            roleSystemId: guest.roleSystemId,
            styleSystemId: guest.styleSystemIds[0] || null,
            styleSystemIds: guest.styleSystemIds,
            status: 'lobby',
            ready: false,
            joinedAt: nowIso,
            submittedBallot: false,
          },
        ],
        matchSnapshot: {
          algo: 'canon-tiered-best-group-v1',
          tier: best.tier,
          sameRole: best.sameRole,
          styleLevel: best.styleLevel,
          waitMsMin: Math.min(a.waitMs || 0, b.waitMs || 0),
          createdAt: nowIso,
        },
      });

      const createdParts = Array.isArray(session?.participants)
        ? session.participants
        : [];

      if (!session?.id || createdParts.length < 2) {
        if (session?.id) {
          await service.entities.Session.update(session.id, {
            status: 'aborted',
            actualEndAt: nowIso,
          }).catch(() => {});
        }

        return json(200, {
          ok: false,
          code: 'SESSION_INVALID',
          durationMs: Date.now() - startTs,
        });
      }

      let okA = false;
      let okB = false;

      try {
        await service.entities.UserQueueState.update(a.queueStateId, {
          status: 'matched',
          matchedSessionId: session.id,
          activeSessionId: session.id,
          matchedAt: nowIso,
          lastHeartbeatAt: nowIso,
        });
        okA = true;
      } catch {
        okA = false;
      }

      try {
        await service.entities.UserQueueState.update(b.queueStateId, {
          status: 'matched',
          matchedSessionId: session.id,
          activeSessionId: session.id,
          matchedAt: nowIso,
          lastHeartbeatAt: nowIso,
        });
        okB = true;
      } catch {
        okB = false;
      }

      if (!okA || !okB) {
        await service.entities.Session.update(session.id, {
          status: 'aborted',
          actualEndAt: nowIso,
        }).catch(() => {});

        if (okA) {
          await service.entities.UserQueueState.update(a.queueStateId, {
            status: 'queueing',
            matchedSessionId: null,
            activeSessionId: null,
            matchedAt: null,
          }).catch(() => {});
        }

        if (okB) {
          await service.entities.UserQueueState.update(b.queueStateId, {
            status: 'queueing',
            matchedSessionId: null,
            activeSessionId: null,
            matchedAt: null,
          }).catch(() => {});
        }

        return json(200, {
          ok: false,
          code: 'COMMIT_FAILED',
          durationMs: Date.now() - startTs,
        });
      }

      const durationMs = Date.now() - startTs;

      console.log(
        '[matchmakerTick] create',
        JSON.stringify({
          sessionId: session.id,
          userA: a.userId,
          userB: b.userId,
          tier: best.tier,
          styleLevel: best.styleLevel,
          sameRole: best.sameRole,
          durationMs,
        })
      );

      return json(200, {
        ok: true,
        matched: 2,
        sessionId: session.id,
        tier: best.tier,
        styleLevel: best.styleLevel,
        poolSize: queueRecords.length,
        durationMs,
      });
    }

    return json(200, {
      ok: true,
      matched: 0,
      poolSize: queueRecords.length,
      reason: 'no_supported_action',
      durationMs: Date.now() - startTs,
    });
  } catch (err) {
    const durationMs = Date.now() - startTs;

    console.log(
      '[matchmakerTick] ERROR',
      JSON.stringify({
        error: err?.message || 'unknown',
        durationMs,
      })
    );

    return json(500, {
      ok: false,
      code: 'MATCHMAKER_FAILED',
      error: err?.message || 'unknown',
      durationMs,
    });
  }
});