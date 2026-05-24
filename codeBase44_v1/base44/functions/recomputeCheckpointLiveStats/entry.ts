// deploy: v3
// CHANGEMENTS v3 — Fix rate limit 429 :
//
// CAUSE : chaque run chargeait l'intégralité de Session, SOTSLog, CheckpointCheckin
//   sans aucun filtre → charge DB croissante, quota dépassé à 5min d'intervalle.
//
// FIX :
//   - Sessions actives (lobby/ready/in_progress/matched) : filtrées par status $in
//   - Sessions récentes complétées : filtrées par updated_date >= window start
//   - SOTSLog : filtrées par created_date >= window start (24h)
//   - CheckpointCheckin : filtrées par created_date >= window start (4h)
//   - UserQueueState : déjà filtré par status='queueing' — inchangé
//   - CheckpointLiveStats / Checkpoint / Event : petits volumes — inchangés
//
// Les writes CheckpointLiveStats sont séquentiels avec await (pas de Promise.all)
// pour éviter les bursts de writes qui triggent aussi le 429.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const WINDOWS = {
  sessionsHours: 4,
  checkinsHours: 4,
  sotsHours: 24,
};

const WEIGHTS = {
  lobbyOpen: 8,
  readyOpen: 10,
  inProgressOpen: 14,
  matchedOpen: 10,
  completedSession: 18,
  checkin: 10,
  sotsVote: 3,
};

function jsonRes(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function hoursSince(iso, nowMs = Date.now()) {
  if (!iso) return Number.POSITIVE_INFINITY;
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) return Number.POSITIVE_INFINITY;
  return (nowMs - ts) / 3600000;
}

function decay(ageHours, halfLifeHours) {
  if (!Number.isFinite(ageHours) || ageHours < 0) return 0;
  return Math.exp(-ageHours / halfLifeHours);
}

function getOpenBaseWeight(status) {
  switch (status) {
    case 'lobby':       return WEIGHTS.lobbyOpen;
    case 'ready':       return WEIGHTS.readyOpen;
    case 'in_progress': return WEIGHTS.inProgressOpen;
    case 'matched':     return WEIGHTS.matchedOpen;
    default:            return 0;
  }
}

function getSessionRelevantTimestamp(session) {
  return (
    session?.actualStartAt ||
    session?.completedAt ||
    session?.lobbyOpenedAt ||
    session?.updated_date ||
    session?.created_date ||
    null
  );
}

function getSotsTimestamp(row) {
  return row?.created_date || row?.recordedAt || row?.updated_date || null;
}

function getCheckinTimestamp(row) {
  return row?.checkinAt || row?.created_date || row?.updated_date || null;
}

function getLatestIso() {
  const values = Array.from(arguments);
  const valid = values
    .filter(Boolean)
    .map((v) => new Date(String(v)).getTime())
    .filter((v) => Number.isFinite(v));
  if (valid.length === 0) return null;
  return new Date(Math.max(...valid)).toISOString();
}

function toArray(val) {
  if (Array.isArray(val)) return val;
  if (val && Array.isArray(val.items)) return val.items;
  return [];
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const service = base44.asServiceRole;

    const body = await req.json().catch(() => ({}));
    const dryRun = body?.dryRun === true;

    const startedAtMs = Date.now();
    const now = new Date();
    const nowIso = now.toISOString();
    const nowMs = now.getTime();

    const sessionsWindowStartIso = new Date(nowMs - WINDOWS.sessionsHours * 3600000).toISOString();
    const checkinsWindowStartIso = new Date(nowMs - WINDOWS.checkinsHours * 3600000).toISOString();
    const sotsWindowStartIso     = new Date(nowMs - WINDOWS.sotsHours     * 3600000).toISOString();

    // ── Chargement ciblé — volumes limités ────────────────────────────────────
    // Sessions actives : seulement les statuts ouverts (lobby/ready/in_progress/matched)
    // Sessions récentes complétées : filtrées par updated_date dans la fenêtre
    // SOTSLog : filtrées par created_date dans la fenêtre (24h)
    // CheckpointCheckin : filtrées par created_date dans la fenêtre (4h)
    const [
      activeSessionsRaw,
      completedSessionsRaw,
      queueingUsersRaw,
      allCheckpointsRaw,
      existingLiveStatsRaw,
      recentSotsRaw,
      recentCheckinsRaw,
      allEventsRaw,
    ] = await Promise.all([
      // Sessions actives — filtre par status (petit volume)
      service.entities.Session.filter({
        status: { $in: ['lobby', 'ready', 'in_progress', 'matched'] },
      }).catch(() => []),
      // Sessions complétées dans la fenêtre — filtrées par date
      service.entities.Session.filter({
        status: { $in: ['completed', 'sots_submitted'] },
        updated_date: { $gte: sessionsWindowStartIso },
      }).catch(() => []),
      // File d'attente active — déjà filtré par status
      service.entities.UserQueueState.filter({ status: 'queueing' }).catch(() => []),
      // Checkpoints actifs — petit volume fixe
      service.entities.Checkpoint.filter({}).catch(() => []),
      // Stats existantes — petit volume
      service.entities.CheckpointLiveStats.filter({}).catch(() => []),
      // SOTSLog dans la fenêtre de 24h seulement
      service.entities.SOTSLog.filter({
        created_date: { $gte: sotsWindowStartIso },
      }).catch(() => []),
      // Checkins dans la fenêtre de 4h seulement
      service.entities.CheckpointCheckin.filter({
        created_date: { $gte: checkinsWindowStartIso },
      }).catch(() => []),
      // Events pour résolution checkpoint — petit volume relatif
      service.entities.Event.filter({}).catch(() => []),
    ]);

    const activeSessions    = toArray(activeSessionsRaw);
    const completedSessions = toArray(completedSessionsRaw);
    const queueingUsers     = toArray(queueingUsersRaw);
    const allCheckpoints    = toArray(allCheckpointsRaw).filter(
      (cp) => cp?.active === true || cp?.active === 'true'
    );
    const existingLiveStats = toArray(existingLiveStatsRaw);
    const recentSots        = toArray(recentSotsRaw);
    const recentCheckins    = toArray(recentCheckinsRaw);
    const allEvents         = toArray(allEventsRaw);

    const checkpointIndex = new Map();
    for (const cp of allCheckpoints) checkpointIndex.set(cp.systemId, cp);

    const liveStatsIndex = new Map();
    for (const ls of existingLiveStats) liveStatsIndex.set(ls.checkpointSystemId, ls);

    const eventIdToCheckpoint = new Map();
    for (const ev of allEvents) {
      if (ev?.id && ev?.checkpointId) eventIdToCheckpoint.set(ev.id, ev.checkpointId);
    }

    const allSessions = [...activeSessions, ...completedSessions];

    // Résoudre le checkpointSystemId pour chaque session
    const resolvedSessions = allSessions
      .map((s) => {
        if (s?.checkpointSystemId) return s;
        if (s?.eventId && eventIdToCheckpoint.get(s.eventId)) {
          return { ...s, checkpointSystemId: eventIdToCheckpoint.get(s.eventId) };
        }
        return null;
      })
      .filter(Boolean)
      .filter((s) => s?.checkpointSystemId);

    const accumulator = new Map();

    function getOrInit(cpId) {
      if (!accumulator.has(cpId)) {
        accumulator.set(cpId, {
          recentSessionsOpened: 0,
          recentSessionsConfirmed: 0,
          nearbyEligibleTalents: 0,
          attendanceSignal: 0,
          openSignal: 0,
          completedSignal: 0,
          checkinSignal: 0,
          sotsSignal: 0,
          lastActivityAt: null,
        });
      }
      return accumulator.get(cpId);
    }

    for (const session of resolvedSessions) {
      const cpId = session.checkpointSystemId;
      const acc  = getOrInit(cpId);
      const ts   = getSessionRelevantTimestamp(session);
      const ageHours  = hoursSince(ts, nowMs);
      const participants = Array.isArray(session?.participants) ? session.participants.length : 0;

      if (['lobby', 'ready', 'in_progress', 'matched'].includes(session?.status)) {
        acc.recentSessionsOpened += 1;
        const base = getOpenBaseWeight(session?.status);
        acc.openSignal       += base * decay(Math.max(ageHours, 0), 1.5);
        acc.attendanceSignal += participants * decay(Math.max(ageHours, 0), 2);
      }

      if (['completed', 'sots_submitted'].includes(session?.status)) {
        acc.recentSessionsConfirmed += 1;
        acc.completedSignal  += WEIGHTS.completedSession * decay(Math.max(ageHours, 0), 2.5);
        acc.attendanceSignal += participants * decay(Math.max(ageHours, 0), 2.5);
      }

      acc.lastActivityAt = getLatestIso(acc.lastActivityAt, ts);
    }

    const checkinsByCheckpoint = new Map();
    for (const ci of recentCheckins) {
      if (!ci?.checkpointSystemId) continue;
      const cpId    = ci.checkpointSystemId;
      const acc     = getOrInit(cpId);
      const ts      = getCheckinTimestamp(ci);
      const ageHours = hoursSince(ts, nowMs);
      acc.checkinSignal += WEIGHTS.checkin * decay(Math.max(ageHours, 0), 2.5);
      acc.lastActivityAt = getLatestIso(acc.lastActivityAt, ts);
      checkinsByCheckpoint.set(cpId, (checkinsByCheckpoint.get(cpId) || 0) + 1);
    }

    for (const row of recentSots) {
      const cpId = row?.sessionCheckpointSystemId || row?.checkpointSystemId;
      if (!cpId) continue;
      const acc      = getOrInit(cpId);
      const ts       = getSotsTimestamp(row);
      const ageHours = hoursSince(ts, nowMs);
      acc.sotsSignal    += WEIGHTS.sotsVote * decay(Math.max(ageHours, 0), 6);
      acc.lastActivityAt = getLatestIso(acc.lastActivityAt, ts);
    }

    for (const u of queueingUsers) {
      if (!u?.checkpointSystemId) continue;
      const acc = getOrInit(u.checkpointSystemId);
      acc.nearbyEligibleTalents += 1;
      acc.lastActivityAt = getLatestIso(acc.lastActivityAt, u?.updated_date || u?.created_date);
    }

    const checkpointsToProcess = new Set();
    for (const cp of allCheckpoints)     checkpointsToProcess.add(cp.systemId);
    for (const ls of existingLiveStats)  checkpointsToProcess.add(ls.checkpointSystemId);
    for (const cpId of accumulator.keys()) checkpointsToProcess.add(cpId);

    let created = 0;
    let updated = 0;
    let skipped = 0;

    // Writes séquentiels pour éviter un burst de writes qui triggerait aussi le 429
    for (const cpId of checkpointsToProcess) {
      const cpRecord = checkpointIndex.get(cpId);
      const prev     = liveStatsIndex.get(cpId);
      const acc      = accumulator.get(cpId) || {
        recentSessionsOpened: 0, recentSessionsConfirmed: 0,
        nearbyEligibleTalents: 0, attendanceSignal: 0,
        openSignal: 0, completedSignal: 0, checkinSignal: 0, sotsSignal: 0,
        lastActivityAt: null,
      };

      if (!cpRecord && !prev) { skipped++; continue; }

      const momentumRaw   = acc.openSignal + acc.completedSignal + acc.checkinSignal + acc.sotsSignal;
      const momentumScore = clamp(Math.round(momentumRaw), 0, 100);
      const prevScore     = Number(prev?.momentumScore || 0);
      const momentumDelta = momentumScore - prevScore;
      const recentCheckinsCount = checkinsByCheckpoint.get(cpId) || 0;

      const currentDomainKey =
        prev?.currentDomainKey || cpRecord?.domainDominantKey || 'music';

      const payload = {
        currentDomainKey,
        momentumScore,
        momentumDelta,
        recentCheckins:           recentCheckinsCount,
        recentSessionsOpened:     acc.recentSessionsOpened,
        recentSessionsConfirmed:  acc.recentSessionsConfirmed,
        nearbyEligibleTalents:    acc.nearbyEligibleTalents,
        attendanceSignal:         Number(acc.attendanceSignal.toFixed(2)),
        lastActivityAt:           acc.lastActivityAt || prev?.lastActivityAt || nowIso,
        lastComputedAt:           nowIso,
      };

      if (!dryRun) {
        if (prev) {
          await service.entities.CheckpointLiveStats.update(prev.id, payload);
          updated++;
        } else if (
          momentumScore > 0 ||
          payload.recentSessionsOpened > 0 ||
          payload.recentSessionsConfirmed > 0 ||
          payload.recentCheckins > 0
        ) {
          await service.entities.CheckpointLiveStats.create({ checkpointSystemId: cpId, ...payload });
          created++;
        } else {
          skipped++;
        }
      } else {
        if (prev) updated++;
        else if (momentumScore > 0) created++;
        else skipped++;
      }
    }

    const durationMs = Date.now() - startedAtMs;

    console.log('[recomputeCheckpointLiveStats.v3]', JSON.stringify({
      dryRun, created, updated, skipped, durationMs,
      activeSessions: activeSessions.length,
      completedSessions: completedSessions.length,
      recentSots: recentSots.length,
      recentCheckins: recentCheckins.length,
    }));

    return jsonRes({
      ok: true,
      dryRun,
      created,
      updated,
      skipped,
      durationMs,
      windows: WINDOWS,
      weights: WEIGHTS,
      startedAt: nowIso,
      sessionsWindowStartIso,
      checkinsWindowStartIso,
      sotsWindowStartIso,
    });

  } catch (error) {
    console.error('[recomputeCheckpointLiveStats.v3] error:', error);
    return jsonRes({ ok: false, error: error?.message || 'Unknown error' }, 500);
  }
});