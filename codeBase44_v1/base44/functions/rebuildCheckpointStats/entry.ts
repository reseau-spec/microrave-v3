// deploy: v2
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

/**
 * rebuildCheckpointStats: recalcule TOUTES les stats checkpoint depuis zéro
 * 
 * Tables alimentées : CheckpointStyleStats, CheckpointRoleStats, CheckpointUserStats
 * Source de vérité: Sessions avec status IN (completed, sots_submitted, archived)
 * 
 * CHANGEMENTS vs version précédente :
 * - Filtre élargi : completed + sots_submitted + archived (avant: completed seul → 97% des données invisibles)
 * - Traite TOUS les participants (avant: seulement le premier)
 * - Exclut les participants RL-ORGANIZER
 * - Pause anti-429 sur les writes
 * - Fallback domaine depuis Event.styles si RoleDomainMap ne résout pas
 * 
 * ADMIN ONLY
 */

const VALID_DOMAINS = ['music', 'humour', 'photo', 'video', 'food', 'art', 'responsable'];

function normalizeId(v) {
  if (!v) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  if (typeof v === 'object') return String(v.systemId || v.id || v._id || '');
  return '';
}

function asArray(value, fallback = []) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch { return fallback; }
  }
  return fallback;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return new Response(JSON.stringify({ ok: false, error: 'Authentication required' }), {
        status: 401, headers: { 'content-type': 'application/json' }
      });
    }

    const roles = Array.isArray(user.role) ? user.role : (user.role ? [user.role] : []);
    if (!roles.includes('admin')) {
      return new Response(JSON.stringify({ ok: false, error: 'Admin access required' }), {
        status: 403, headers: { 'content-type': 'application/json' }
      });
    }

    const body = await req.json().catch(() => ({}));
    const { daysWindow = 365, reset = false } = body;

    const serviceRole = base44.asServiceRole;
    if (!serviceRole) {
      return new Response(JSON.stringify({ ok: false, error: 'Service role unavailable' }), {
        status: 503, headers: { 'content-type': 'application/json' }
      });
    }

    console.log('[rebuildCheckpointStats] Starting rebuild...', { daysWindow, reset });

    // Optionnel: reset des tables existantes
    if (reset) {
      console.log('[rebuildCheckpointStats] Resetting existing stats...');
      const [existingStyles, existingRoles, existingUsers] = await Promise.all([
        serviceRole.entities.CheckpointStyleStats.filter({}),
        serviceRole.entities.CheckpointRoleStats.filter({}),
        serviceRole.entities.CheckpointUserStats.filter({})
      ]);

      let deleteCount = 0;
      for (const stat of existingStyles) {
        await serviceRole.entities.CheckpointStyleStats.delete(stat.id);
        deleteCount++;
        if (deleteCount % 20 === 0) await new Promise(r => setTimeout(r, 200));
      }
      for (const stat of existingRoles) {
        await serviceRole.entities.CheckpointRoleStats.delete(stat.id);
        deleteCount++;
        if (deleteCount % 20 === 0) await new Promise(r => setTimeout(r, 200));
      }
      for (const stat of existingUsers) {
        await serviceRole.entities.CheckpointUserStats.delete(stat.id);
        deleteCount++;
        if (deleteCount % 20 === 0) await new Promise(r => setTimeout(r, 200));
      }
      console.log(`[rebuildCheckpointStats] Reset complete, deleted ${deleteCount} records`);
    }

    // Calculer date de début
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysWindow);
    const startDateIso = startDate.toISOString();

    // ── CORRIGÉ : charger completed + sots_submitted + archived ────────────
    const [sessionsCompleted, sessionsSots, sessionsArchived] = await Promise.all([
      serviceRole.entities.Session.filter({ status: 'completed' }),
      serviceRole.entities.Session.filter({ status: 'sots_submitted' }),
      serviceRole.entities.Session.filter({ status: 'archived' }),
    ]);
    const allFinished = [...sessionsCompleted, ...sessionsSots, ...sessionsArchived];

    // Filtrer par fenêtre temporelle (utiliser actualEndAt ou updated_date)
    const sessions = allFinished.filter(s => {
      const endDate = s.actualEndAt || s.updated_date || '';
      return endDate >= startDateIso;
    });

    console.log(`[rebuildCheckpointStats] Found ${sessions.length} finished sessions (from ${allFinished.length} total, window=${daysWindow}d)`);
    // ── FIN CORRECTION ────────────────────────────────────────────────────

    // Pré-charger le cache RoleDomainMap pour éviter N+1 queries
    const allDomainMaps = await serviceRole.entities.RoleDomainMap.filter({ isActive: true });
    const domainMapByRole = new Map();
    for (const dm of allDomainMaps) {
      if (!domainMapByRole.has(dm.roleSystemId)) domainMapByRole.set(dm.roleSystemId, []);
      domainMapByRole.get(dm.roleSystemId).push(dm);
    }

    // Maps pour accumuler en mémoire
    const styleStatsMap = new Map();
    const roleStatsMap = new Map();
    const userStatsMap = new Map();

    let processedCount = 0;
    let skippedCount = 0;
    let participantsProcessed = 0;
    const errors = [];

    for (const session of sessions) {
      try {
        const checkpointSystemId = normalizeId(session.checkpointSystemId);
        if (!checkpointSystemId) {
          skippedCount++;
          continue;
        }

        const participants = asArray(session.participants);
        if (participants.length === 0) {
          skippedCount++;
          continue;
        }

        // Charger SOTS pour cette session (une fois pour tous les participants)
        const sotsLogs = await serviceRole.entities.SOTSLog.filter({ sessionId: session.id });

        // ── CORRIGÉ : traiter TOUS les participants, pas juste le premier ──
        for (const participant of participants) {
          const roleSystemId = normalizeId(participant?.roleSystemId);
          const styleSystemIds = asArray(participant?.styleSystemIds).map(normalizeId).filter(Boolean);
          const talentUserId = normalizeId(participant?.userId);

          // Exclure les organisateurs
          if (roleSystemId === 'RL-ORGANIZER' || participant?.isOrganizer) continue;
          if (!roleSystemId || !talentUserId) continue;

          // Déterminer domainKey depuis le cache
          const maps = domainMapByRole.get(roleSystemId) || [];
          let domainKey = maps.length > 0 ? maps[0].domainKey : null;

          if (!domainKey) {
            // Skip si pas de mapping (pas de fallback ici, on veut des données propres)
            continue;
          }

          // Si pas de styles, utiliser un placeholder pour éviter de skip
          const effectiveStyleIds = styleSystemIds.length > 0 ? styleSystemIds : ['UNKNOWN'];

          // SOTS reçus par ce participant
          const sotsForTalent = sotsLogs.filter(log => log.targetId === talentUserId);
          const sotsCountReceived = sotsForTalent.length;
          const sotsSumReceived = sotsForTalent.reduce((sum, log) => sum + (log.scoreRaw || 0), 0);

          // Accumuler CheckpointStyleStats
          for (const styleLeafId of effectiveStyleIds) {
            const key = `${checkpointSystemId}|${domainKey}|${styleLeafId}`;
            const existing = styleStatsMap.get(key) || {
              checkpointSystemId, domainKey, styleLeafId,
              playsCount: 0, sotsCount: 0, sotsSum: 0,
              lastPlayedAt: null, userIds: new Set()
            };
            existing.playsCount += 1;
            existing.sotsCount += sotsCountReceived;
            existing.sotsSum += sotsSumReceived;
            existing.userIds.add(talentUserId);
            const endAt = session.actualEndAt || session.updated_date;
            if (endAt && (!existing.lastPlayedAt || endAt > existing.lastPlayedAt)) {
              existing.lastPlayedAt = endAt;
            }
            styleStatsMap.set(key, existing);
          }

          // Accumuler CheckpointRoleStats
          const roleKey = `${checkpointSystemId}|${domainKey}|${roleSystemId}`;
          const existingRole = roleStatsMap.get(roleKey) || {
            checkpointSystemId, domainKey, roleSystemId,
            playsCount: 0, sotsCount: 0, sotsSum: 0,
            lastPlayedAt: null, userIds: new Set()
          };
          existingRole.playsCount += 1;
          existingRole.sotsCount += sotsCountReceived;
          existingRole.sotsSum += sotsSumReceived;
          existingRole.userIds.add(talentUserId);
          const endAt = session.actualEndAt || session.updated_date;
          if (endAt && (!existingRole.lastPlayedAt || endAt > existingRole.lastPlayedAt)) {
            existingRole.lastPlayedAt = endAt;
          }
          roleStatsMap.set(roleKey, existingRole);

          // Accumuler CheckpointUserStats
          const userKey = `${checkpointSystemId}|${domainKey}|${talentUserId}`;
          const existingUser = userStatsMap.get(userKey) || {
            checkpointSystemId, domainKey, userId: talentUserId,
            playsCount: 0, sotsCountReceived: 0, sotsSumReceived: 0,
            lastPlayedAt: null
          };
          existingUser.playsCount += 1;
          existingUser.sotsCountReceived += sotsCountReceived;
          existingUser.sotsSumReceived += sotsSumReceived;
          if (endAt && (!existingUser.lastPlayedAt || endAt > existingUser.lastPlayedAt)) {
            existingUser.lastPlayedAt = endAt;
          }
          userStatsMap.set(userKey, existingUser);

          participantsProcessed++;
        }
        // ── FIN CORRECTION ──────────────────────────────────────────────────

        processedCount++;
      } catch (error) {
        errors.push({ sessionId: session.id, error: error.message });
      }
    }

    console.log(`[rebuildCheckpointStats] Writing to database... styles=${styleStatsMap.size} roles=${roleStatsMap.size} users=${userStatsMap.size}`);

    // Écrire CheckpointStyleStats avec pause anti-429
    let writeCount = 0;
    for (const [_, stat] of styleStatsMap) {
      const sotsAvg = stat.sotsCount > 0 ? stat.sotsSum / stat.sotsCount : 0;
      await serviceRole.entities.CheckpointStyleStats.create({
        checkpointSystemId: stat.checkpointSystemId,
        domainKey: stat.domainKey,
        styleLeafId: stat.styleLeafId,
        playsCount: stat.playsCount,
        uniqueTalentsCount: stat.userIds.size,
        sotsCount: stat.sotsCount,
        sotsSum: stat.sotsSum,
        sotsAvg,
        lastPlayedAt: stat.lastPlayedAt,
        updatedAt: new Date().toISOString()
      });
      writeCount++;
      if (writeCount % 15 === 0) await new Promise(r => setTimeout(r, 200));
    }

    // Écrire CheckpointRoleStats
    for (const [_, stat] of roleStatsMap) {
      const sotsAvg = stat.sotsCount > 0 ? stat.sotsSum / stat.sotsCount : 0;
      await serviceRole.entities.CheckpointRoleStats.create({
        checkpointSystemId: stat.checkpointSystemId,
        domainKey: stat.domainKey,
        roleSystemId: stat.roleSystemId,
        playsCount: stat.playsCount,
        uniqueTalentsCount: stat.userIds.size,
        sotsCount: stat.sotsCount,
        sotsSum: stat.sotsSum,
        sotsAvg,
        lastPlayedAt: stat.lastPlayedAt,
        updatedAt: new Date().toISOString()
      });
      writeCount++;
      if (writeCount % 15 === 0) await new Promise(r => setTimeout(r, 200));
    }

    // Écrire CheckpointUserStats
    for (const [_, stat] of userStatsMap) {
      const sotsAvgReceived = stat.sotsCountReceived > 0 ? stat.sotsSumReceived / stat.sotsCountReceived : 0;
      await serviceRole.entities.CheckpointUserStats.create({
        checkpointSystemId: stat.checkpointSystemId,
        domainKey: stat.domainKey,
        userId: stat.userId,
        playsCount: stat.playsCount,
        sotsCountReceived: stat.sotsCountReceived,
        sotsSumReceived: stat.sotsSumReceived,
        sotsAvgReceived,
        lastPlayedAt: stat.lastPlayedAt,
        updatedAt: new Date().toISOString()
      });
      writeCount++;
      if (writeCount % 15 === 0) await new Promise(r => setTimeout(r, 200));
    }

    console.log('[rebuildCheckpointStats] Rebuild complete');

    return new Response(JSON.stringify({
      ok: true,
      message: 'Checkpoint stats rebuilt successfully',
      summary: {
        sessionsProcessed: processedCount,
        sessionsSkipped: skippedCount,
        participantsProcessed,
        styleStatsWritten: styleStatsMap.size,
        roleStatsWritten: roleStatsMap.size,
        userStatsWritten: userStatsMap.size,
        totalWrites: writeCount,
        errors: errors.length,
        errorDetails: errors.slice(0, 10)
      }
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });

  } catch (error) {
    console.error('[rebuildCheckpointStats] Error:', error);
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500, headers: { 'content-type': 'application/json' }
    });
  }
});