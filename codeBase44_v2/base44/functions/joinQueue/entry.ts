import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const SESSION_STATUS = {
  QUEUEING: 'queueing',
  MATCHED: 'matched',
  LOBBY: 'lobby',
};

const ACTIVE_STATUSES = ['queueing', 'lobby', 'ready', 'in_progress'];
const WAITING_STATUSES = [SESSION_STATUS.QUEUEING, SESSION_STATUS.LOBBY];

function normalizeId(v) {
  if (!v) return null;
  if (typeof v === 'string') return v;
  if (typeof v === 'object') return v.id || v._id || v.value || null;
  return null;
}

function jsonError(status, code, message, extra) {
  return new Response(JSON.stringify({ ok: false, code, message, ...(extra || {}) }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

async function getServiceClientOrThrow(base44) {
  try {
    if (!base44 || !base44.asServiceRole) return null;
    return base44.asServiceRole;
  } catch {
    return null;
  }
}

function asArray(value, fallback) {
  const fb = fallback || [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : fb;
    } catch {
      return fb;
    }
  }
  return fb;
}

function asObject(value, fallback) {
  const fb = fallback || {};
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : fb;
    } catch {
      return fb;
    }
  }
  return fb;
}

/**
 * Normalise les styles depuis le payload (multi-formats supportés)
 * Returns: string[] de style systemIds (ST-xxxx)
 */
function normalizeIncomingStyleIds(payload) {
  const styles = [];

  // Format 1: styleSystemIds direct (array)
  if (Array.isArray(payload?.styleSystemIds)) {
    payload.styleSystemIds.forEach((sid) => {
      if (typeof sid === 'string' && sid.trim() && sid.startsWith('ST-')) styles.push(sid.trim());
    });
  }

  // Format 2: moodAdjustments.styleSystemIds (array)
  if (Array.isArray(payload?.moodAdjustments?.styleSystemIds)) {
    payload.moodAdjustments.styleSystemIds.forEach((sid) => {
      if (typeof sid === 'string' && sid.trim() && sid.startsWith('ST-')) styles.push(sid.trim());
    });
  }

  // Format 3: moodAdjustments.styles (object active/weight)
  const mo = payload?.moodAdjustments?.styles;
  if (mo && typeof mo === 'object' && !Array.isArray(mo)) {
    Object.entries(mo).forEach(([styleId, styleData]) => {
      if (typeof styleId === 'string' && styleId.startsWith('ST-')) {
        const isActive = styleData?.active !== false;
        const hasWeight = typeof styleData?.weight === 'number' && styleData.weight > 0;
        if (isActive || hasWeight) styles.push(styleId.trim());
      }
    });
  }

  // Format 4: moodAdjustments.styles (array)
  if (Array.isArray(payload?.moodAdjustments?.styles)) {
    payload.moodAdjustments.styles.forEach((sid) => {
      if (typeof sid === 'string' && sid.trim() && sid.startsWith('ST-')) styles.push(sid.trim());
    });
  }

  // Format 5: styleSystemId single
  if (typeof payload?.styleSystemId === 'string' && payload.styleSystemId.startsWith('ST-')) {
    styles.push(payload.styleSystemId.trim());
  }

  return [...new Set(styles)];
}

// ✅ Tolérance basée sur le TEMPS D’ATTENTE DU USER
function requiredMatchLevel(userWaitMs) {
  if (userWaitMs < 10_000) return 3; // L3 exact
  if (userWaitMs < 20_000) return 2; // L2 parent
  if (userWaitMs < 30_000) return 1; // L1 parent
  return 0; // no matter what (après 30s)
}

// Style sets L3/L2/L1 depuis StyleHierarchy
function buildStyleSets(styleSystemIds, styleIndex) {
  const L3 = new Set();
  const L2 = new Set();
  const L1 = new Set();

  const ids = Array.isArray(styleSystemIds) ? styleSystemIds : [];
  for (const sid of ids) {
    if (!sid) continue;
    L3.add(sid);

    const s = styleIndex[sid];
    if (!s || !s.parentSystemId) continue;

    const p2 = styleIndex[s.parentSystemId];
    if (p2?.systemId) {
      L2.add(p2.systemId);

      if (p2.parentSystemId) {
        const p1 = styleIndex[p2.parentSystemId];
        if (p1?.systemId) L1.add(p1.systemId);
      }
    }
  }

  return { L3, L2, L1 };
}

function intersects(a, b) {
  for (const v of a) if (b.has(v)) return true;
  return false;
}

function matchLevel(a, b) {
  if (intersects(a.L3, b.L3)) return 3;
  if (intersects(a.L2, b.L2)) return 2;
  if (intersects(a.L1, b.L1)) return 1;
  return 0;
}

// FIFO helper (plus vieux d’abord)
function createdTs(session) {
  const createdAt = session.created_date || session.lobbyOpenedAt || session.updated_date || null;
  const t = createdAt ? new Date(createdAt).getTime() : 0;
  return Number.isFinite(t) ? t : 0;
}

// ✅ Choisir la meilleure session à rejoindre
// IMPORTANT: le filtre requiredLevel dépend de userWaitMs (pas de la session)
function pickBestQueue(waitingSessions, meSets, styleIndex, meUserId, requiredLevel) {
  let best = null;

  for (const s of (waitingSessions || [])) {
    if (normalizeId(s.hostUserId) === meUserId) continue;

    const participants = asArray(s.participants, []);
    const maxPlayers = s.maxPlayers || 6;

    if (s.lockedAt) continue;
    if (participants.length >= maxPlayers) continue;
    if (participants.some((p) => normalizeId(p?.userId) === meUserId)) continue;

    // garde-fou: si on est en "no matter what", éviter les sessions vides
    if (requiredLevel === 0 && participants.length === 0) continue;

    let bestScore = 0;
    for (const p of participants) {
      const pStyles = asArray(p?.styleSystemIds, []);
      if (pStyles.length === 0) continue;
      const pSets = buildStyleSets(pStyles, styleIndex);
      const lvl = matchLevel(meSets, pSets);
      if (lvl > bestScore) bestScore = lvl;
      if (bestScore === 3) break;
    }

    if (requiredLevel > 0 && bestScore < requiredLevel) continue;

    const cand = { s, score: bestScore, createdTs: createdTs(s) };

    if (!best) {
      best = cand;
      continue;
    }

    if (cand.score > best.score) {
      best = cand;
      continue;
    }

    // tie-break FIFO: plus vieille d’abord
    if (cand.score === best.score) {
      if (cand.createdTs > 0 && (best.createdTs === 0 || cand.createdTs < best.createdTs)) {
        best = cand;
      }
    }
  }

  return best ? best.s : null;
}

// ✅ UserQueueState : read/create/update
async function getOrCreateUserQueueState(serviceRole, userId, nowIso) {
  const existing = await serviceRole.entities.UserQueueState.filter({ userId }).catch(() => []);
  if (existing && existing[0]) {
    const row = existing[0];
    await serviceRole.entities.UserQueueState.update(row.id, {
      status: 'queueing',
      queueJoinedAt: nowIso,
      lastHeartbeatAt: nowIso,
      updatedAt: nowIso,
    }).catch(() => {});
    return { ...row, status: 'queueing' };
  }

  const created = await serviceRole.entities.UserQueueState.create({
    userId,
    status: 'queueing',
    queueJoinedAt: nowIso,
    activeSessionId: null,
    lastHeartbeatAt: nowIso,
    updatedAt: nowIso,
  });

  return created;
}

function computeUserWaitMs(queueJoinedAt) {
  const t = queueJoinedAt ? new Date(queueJoinedAt).getTime() : NaN;
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Date.now() - t);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return jsonError(401, 'UNAUTHENTICATED', 'Non authentifié');

    const currentUserId = user.id;
    const body = await req.json().catch(() => ({}));

    const rawMoodAdjustments = body?.moodAdjustments ?? null;
    const queueMode = body?.mode === 'event' ? 'event' : 'quickplay';
    const serviceRoleSystemId = body?.serviceRoleSystemId ?? null;
    const moodAdjustments = rawMoodAdjustments ? asObject(rawMoodAdjustments, {}) : {};

    const serviceRole = await getServiceClientOrThrow(base44);
    if (!serviceRole) {
      return jsonError(503, 'SERVICE_ROLE_UNAVAILABLE', 'Service role unavailable (Base44). Publish/permissions issue.');
    }

    const nowIso = new Date().toISOString();

    // Role
    let roleSystemId =
      typeof serviceRoleSystemId === 'string' && serviceRoleSystemId.trim()
        ? serviceRoleSystemId.trim()
        : 'RL-001';

    let roles = await serviceRole.entities.RoleHierarchy.filter({ systemId: roleSystemId }).catch(() => []);
    if (!roles || roles.length === 0) {
      const anyRoles = await serviceRole.entities.RoleHierarchy.filter({}).catch(() => []);
      if (anyRoles && anyRoles[0]) {
        roleSystemId = anyRoles[0].systemId;
      } else {
        return jsonError(503, 'NO_ROLES_AVAILABLE', 'Aucun rôle disponible dans RoleHierarchy');
      }
    }

    // Anti double-queue
    const activeSessions = await serviceRole.entities.Session.filter({
      sessionType: 'quickplay',
      status: { $in: ACTIVE_STATUSES },
    }).catch(() => []);

    const userSession = (activeSessions || []).find((s) => {
      const participants = asArray(s.participants, []);
      return participants.some((p) => normalizeId(p?.userId) === currentUserId);
    });

    if (userSession) {
      // Check if this session is stale (no participant heartbeat in 30s)
      const participants = asArray(userSession.participants, []);
      const userParticipant = participants.find(p => normalizeId(p?.userId) === currentUserId);
      const lastHb = userParticipant?.lastHeartbeatAt
        ? new Date(userParticipant.lastHeartbeatAt).getTime() : null;
      const isStale = !lastHb || (Date.now() - lastHb) > 30_000;

      if (!isStale) {
        return jsonError(409, 'ALREADY_IN_QUEUE', 'Already in queue', {
          activeQueueId: userSession.id,
          activeSessionId: normalizeId(userSession.id),
          session: userSession,
        });
      }

      // Stale session — abort it and let the user re-queue
      await serviceRole.entities.Session.update(userSession.id, {
        status: 'aborted',
        actualEndAt: nowIso,
      }).catch(() => {});
    }

    // ✅ UserQueueState (temps d’attente USER)
    const queueState = await getOrCreateUserQueueState(serviceRole, currentUserId, nowIso);
    const userWaitMs = computeUserWaitMs(queueState?.queueJoinedAt);
    const requiredLevel = requiredMatchLevel(userWaitMs);

    // Guard: créer UserPreferences si absentes (évite crashs matchmaker)
    const existingPrefs = await serviceRole.entities.UserPreferences.filter({ userId: currentUserId }).catch(() => []);
    if (!existingPrefs || existingPrefs.length === 0) {
      await serviceRole.entities.UserPreferences.create({
        userId: currentUserId,
        rolePrefs: {},
        stylePrefs: {},
        checkpointPrefs: {},
      }).catch(() => {});
    }

    // Styles
    const requestedStyleIds = normalizeIncomingStyleIds(body);

    // Charger StyleHierarchy (index)
    const styleIndex = {};
    const allStyles = await serviceRole.entities.StyleHierarchy.filter({}).catch(() => []);
    for (const s of (allStyles || [])) {
      if (s?.systemId) styleIndex[s.systemId] = s;
    }

    const meSets = buildStyleSets(requestedStyleIds, styleIndex);

    // ── EVENT MODE: match talent to open event slot ──────────────────────────
    if (queueMode === 'event') {
      const eventSessions = await serviceRole.entities.Session.filter({
        sessionType: 'event',
        status: 'lobby',
      }).catch(() => []);

      const talentRoleId = roleSystemId;
      const talentStyles = requestedStyleIds;

      let bestEvent = null;
      let bestSlot  = null;
      let bestScore = -1;

      for (const es of (eventSessions || [])) {
        const slots = Array.isArray(es.slots) ? es.slots : [];
        const openSlots = slots.filter(sl => sl.status === 'open');

        for (const sl of openSlots) {
          let score = 0;

          if (sl.roleSystemId === talentRoleId) score += 100;

          const eventStyles = Array.isArray(es.genreSystemIds) ? es.genreSystemIds : [];
          if (eventStyles.length > 0 && talentStyles.length > 0) {
            const esSets = buildStyleSets(eventStyles, styleIndex);
            const lvl = matchLevel(meSets, esSets);
            score += lvl * 10;
          }

          if (score > bestScore) {
            bestScore = score;
            bestEvent = es;
            bestSlot  = sl;
          }
        }
      }

      if (!bestEvent || !bestSlot || bestScore < 100) {
        return json(200, {
          ok: false,
          code: 'NO_EVENT_SLOT_FOUND',
          message: 'Aucun événement avec un slot correspondant à ton rôle.',
          roleSearched: talentRoleId,
        });
      }

      const updatedSlots = bestEvent.slots.map(sl =>
        sl.slotId === bestSlot.slotId
          ? { ...sl, status: 'pending', candidateUserId: currentUserId, candidateStyleSystemIds: requestedStyleIds }
          : sl
      );
      await serviceRole.entities.Session.update(bestEvent.id, {
        slots: updatedSlots,
        updatedAt: nowIso,
      });

      await serviceRole.entities.UserQueueState.update(queueState.id, {
        activeSessionId: bestEvent.id,
        updatedAt: nowIso,
      }).catch(() => {});

      const events = await serviceRole.entities.Event.filter({ id: bestEvent.eventId }).catch(() => []);
      const eventTitle = events?.[0]?.title || 'Événement';

      console.log(`[joinQueue] event mode: userId=${currentUserId} role=${talentRoleId} → session=${bestEvent.id} slot=${bestSlot.slotId} score=${bestScore}`);

      return json(200, {
        ok: true,
        action: 'event_slot_applied',
        sessionId: bestEvent.id,
        slotId: bestSlot.slotId,
        eventTitle,
        message: `Candidature envoyée pour le slot "${bestSlot.roleSystemId}" dans "${eventTitle}". L'organisateur doit confirmer.`,
      });
    }
    // ── END EVENT MODE ──────────────────────────────────────────────────────────

    // Reset stale activeSessionId from previous event mode
    if (queueState.activeSessionId) {
      const prevSess = await serviceRole.entities.Session.get(queueState.activeSessionId).catch(() => null);
      if (!prevSess || prevSess.sessionType !== 'quickplay') {
        await serviceRole.entities.UserQueueState.update(queueState.id, {
          activeSessionId: null,
          queueJoinedAt: nowIso,
          updatedAt: nowIso,
        }).catch(() => {});
        queueState.activeSessionId = null;
      }
    }

    // Sessions candidates*
    const waitingSessions = await serviceRole.entities.Session.filter({
      sessionType: 'quickplay',
      status: { $in: WAITING_STATUSES },
    }).catch(() => []);

    const openQueue = pickBestQueue(waitingSessions, meSets, styleIndex, currentUserId, requiredLevel);
    const firstStyleId = requestedStyleIds.length > 0 ? requestedStyleIds[0] : null;

    if (openQueue) {
      const existingParticipants = asArray(openQueue.participants, []);
      const currentStatus = openQueue.status === SESSION_STATUS.LOBBY ? 'lobby' : 'queueing';

      const newParticipant = {
        userId: currentUserId,
        roleSystemId,
        styleSystemId: firstStyleId,
        styleSystemIds: requestedStyleIds,
        status: currentStatus,
        isNoShow: false,
        joinedAt: nowIso,
        submittedBallot: false,
      };

      const newParticipants = [...existingParticipants, newParticipant];
      const minPlayers = openQueue.minPlayers || 2;

      const shouldOpenLobby =
        newParticipants.length >= minPlayers &&
        openQueue.status === SESSION_STATUS.QUEUEING;

      const update = { participants: newParticipants };

      if (shouldOpenLobby) {
        update.status = SESSION_STATUS.LOBBY;
        update.lobbyOpenedAt = nowIso;
        update.participants = newParticipants.map((p) => ({ ...p, status: 'lobby' }));
      }

      if (!openQueue.captainUserId) {
        const oldest = [...newParticipants].sort((a, b) => {
          const aTime = a.joinedAt ? new Date(a.joinedAt).getTime() : 0;
          const bTime = b.joinedAt ? new Date(b.joinedAt).getTime() : 0;
          return aTime - bTime;
        })[0];
        update.captainUserId = oldest?.userId || currentUserId;
      }

      const updated = await serviceRole.entities.Session.update(openQueue.id, update);

      await serviceRole.entities.UserQueueState.update(queueState.id, {
        activeSessionId: null,
        updatedAt: nowIso,
      }).catch(() => {});

      return json(200, {
        ok: true,
        action: 'matched',
        sessionId: updated.id,
        session: updated,
        debug: { userWaitMs, requiredLevel, requestedStyleCount: requestedStyleIds.length },
      });
    }

    // Créer nouvelle session
    const moodFilterSnapshot = {
      basePrefsSource: 'UserPreferences',
      moodAdjustments,
      createdAt: nowIso,
    };

    const newSession = await serviceRole.entities.Session.create({
      sessionType: 'quickplay',
      status: SESSION_STATUS.QUEUEING,
      minPlayers: 2,
      maxPlayers: 6,
      hostUserId: currentUserId,
      captainUserId: currentUserId,
      participants: [{
        userId: currentUserId,
        roleSystemId,
        styleSystemId: firstStyleId,
        styleSystemIds: requestedStyleIds,
        status: SESSION_STATUS.QUEUEING,
        isNoShow: false,
        joinedAt: nowIso,
        submittedBallot: false,
      }],
      moodFilterSnapshot,
    });

    await serviceRole.entities.UserQueueState.update(queueState.id, {
      activeSessionId: null,
      updatedAt: nowIso,
    }).catch(() => {});

    return json(200, {
      ok: true,
      action: 'queued',
      sessionId: newSession.id,
      session: newSession,
      debug: { userWaitMs, requiredLevel, requestedStyleCount: requestedStyleIds.length },
    });

  } catch (error) {
    console.error('joinQueue error:', error);
    return jsonError(500, 'INTERNAL', (error && error.message) ? error.message : 'Unexpected error');
  }
});