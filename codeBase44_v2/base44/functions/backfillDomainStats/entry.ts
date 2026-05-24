import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

/**
 * backfillDomainStats — ONE-SHOT admin
 *
 * Le backfillEventSessionCheckpoints a patché Session.checkpointSystemId,
 * mais commitCheckpointDomainUsage n'a pas pu être appelé (403 inter-fonction).
 *
 * Cette fonction reconstruit CheckpointDomainLedger + CheckpointDomainStats + Checkpoint.domainRanking
 * depuis TOUTES les sessions terminées (completed, sots_submitted, archived) qui ont un checkpoint.
 *
 * Options :
 *   dryRun: true → compte sans écrire
 *   resetDomainStats: true → supprime CheckpointDomainStats existants avant de reconstruire
 *
 * ADMIN ONLY — exécuter UNE SEULE FOIS après le backfill sessions
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

function jsonRes(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return jsonRes({ error: 'Admin required' }, 403);
    }

    const service = base44.asServiceRole;
    const body = await req.json().catch(() => ({}));
    const dryRun = body.dryRun === true;
    const resetDomainStats = body.resetDomainStats === true;

    const startTs = Date.now();
    const nowIso = new Date().toISOString();

    console.log(`[backfillDomainStats] Starting... dryRun=${dryRun} resetDomainStats=${resetDomainStats}`);

    // Optionnel : reset CheckpointDomainStats (pas le Ledger, il est append-only)
    if (resetDomainStats && !dryRun) {
      const existing = await service.entities.CheckpointDomainStats.filter({});
      let deleted = 0;
      for (const ds of existing) {
        await service.entities.CheckpointDomainStats.delete(ds.id);
        deleted++;
        if (deleted % 20 === 0) await new Promise(r => setTimeout(r, 200));
      }
      console.log(`[backfillDomainStats] Reset: deleted ${deleted} DomainStats records`);
    }

    // Charger toutes les sessions terminées avec checkpoint
    const [s1, s2, s3] = await Promise.all([
      service.entities.Session.filter({ status: 'completed' }),
      service.entities.Session.filter({ status: 'sots_submitted' }),
      service.entities.Session.filter({ status: 'archived' }),
    ]);
    const allSessions = [...s1, ...s2, ...s3].filter(s => s.checkpointSystemId);

    console.log(`[backfillDomainStats] ${allSessions.length} finished sessions with checkpoint`);

    // Pré-charger RoleDomainMap
    const allDomainMaps = await service.entities.RoleDomainMap.filter({ isActive: true });
    const domainMapByRole = new Map();
    for (const dm of allDomainMaps) {
      if (!domainMapByRole.has(dm.roleSystemId)) domainMapByRole.set(dm.roleSystemId, []);
      domainMapByRole.get(dm.roleSystemId).push(dm);
    }

    // Pré-charger les checkpoints pour le fallback domaine
    const allCheckpointsRaw = await service.entities.Checkpoint.filter({});
    const allCheckpoints = allCheckpointsRaw.filter(cp => cp.active === true || cp.active === 'true');
    const cpIndex = new Map(allCheckpoints.map(cp => [cp.systemId, cp]));

    // Accumuler par checkpoint → domaine
    // Structure : Map<checkpointSystemId, Map<domainKey, count>>
    const accumulator = new Map();

    let processedSessions = 0;
    let skippedSessions = 0;

    for (const session of allSessions) {
      const cpId = session.checkpointSystemId;
      const participants = asArray(session.participants);

      if (participants.length === 0) {
        skippedSessions++;
        continue;
      }

      // Dériver domainKeys depuis les rôles des participants
      const domainKeySet = new Set();
      for (const p of participants) {
        const roleId = normalizeId(p?.roleSystemId);
        if (!roleId || roleId === 'RL-ORGANIZER' || p?.isOrganizer) continue;
        const maps = domainMapByRole.get(roleId) || [];
        for (const dm of maps) {
          if (dm.domainKey && VALID_DOMAINS.includes(dm.domainKey)) {
            domainKeySet.add(dm.domainKey);
          }
        }
      }

      // Fallback : domainKeysSnapshot de la session (si déjà set par transitionSession)
      if (domainKeySet.size === 0 && session.domainKeysSnapshot) {
        const snap = asArray(session.domainKeysSnapshot);
        for (const dk of snap) {
          if (VALID_DOMAINS.includes(dk)) domainKeySet.add(dk);
        }
      }

      // Fallback : Checkpoint.domainDominantKey
      if (domainKeySet.size === 0) {
        const cp = cpIndex.get(cpId);
        if (cp?.domainDominantKey && VALID_DOMAINS.includes(cp.domainDominantKey)) {
          domainKeySet.add(cp.domainDominantKey);
        }
      }

      if (domainKeySet.size === 0) domainKeySet.add('music');

      // Accumuler
      if (!accumulator.has(cpId)) accumulator.set(cpId, new Map());
      const cpDomains = accumulator.get(cpId);
      for (const dk of domainKeySet) {
        cpDomains.set(dk, (cpDomains.get(dk) || 0) + 1);
      }

      processedSessions++;
    }

    console.log(`[backfillDomainStats] Processed ${processedSessions} sessions, ${accumulator.size} checkpoints with domains`);

    // Écrire les résultats
    let domainStatsWritten = 0;
    let checkpointsUpdated = 0;

    if (!dryRun) {
      for (const [cpId, domainsMap] of accumulator) {
        const total = [...domainsMap.values()].reduce((s, c) => s + c, 0);

        for (const [domainKey, count] of domainsMap) {
          // Upsert CheckpointDomainStats
          const existing = await service.entities.CheckpointDomainStats.filter({ checkpointSystemId: cpId });
          const match = existing.filter(e => e.domainKey === domainKey);

          if (match.length > 0) {
            await service.entities.CheckpointDomainStats.update(match[0].id, {
              countSessions: count,
              weight: total > 0 ? Math.round((count / total) * 10000) / 10000 : 0,
              lastSessionAt: nowIso,
              updatedAt: nowIso,
            });
          } else {
            await service.entities.CheckpointDomainStats.create({
              checkpointSystemId: cpId,
              domainKey,
              countSessions: count,
              weight: total > 0 ? Math.round((count / total) * 10000) / 10000 : 0,
              lastSessionAt: nowIso,
              updatedAt: nowIso,
            });
          }
          domainStatsWritten++;

          // Pause anti-429
          if (domainStatsWritten % 10 === 0) await new Promise(r => setTimeout(r, 200));
        }

        // Mettre à jour Checkpoint.domainRanking + domainDominantKey
        const domainRanking = [...domainsMap.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([key, count]) => ({
            key,
            weight: total > 0 ? Math.round((count / total) * 10000) / 10000 : 0,
            count,
          }));

        const domainDominantKey = domainRanking[0]?.key || 'music';

        const cpRecords = await service.entities.Checkpoint.filter({ systemId: cpId });
        if (cpRecords.length > 0) {
          await service.entities.Checkpoint.update(cpRecords[0].id, {
            domainDominantKey,
            domainRanking,
          });
          checkpointsUpdated++;
        }

        if (checkpointsUpdated % 10 === 0) await new Promise(r => setTimeout(r, 200));
      }
    }

    const durationMs = Date.now() - startTs;

    // Résumé par domaine
    const domainSummary = {};
    for (const [cpId, domainsMap] of accumulator) {
      for (const [dk, count] of domainsMap) {
        if (!domainSummary[dk]) domainSummary[dk] = { checkpoints: 0, sessions: 0 };
        domainSummary[dk].checkpoints++;
        domainSummary[dk].sessions += count;
      }
    }

    console.log(`[backfillDomainStats] Done. domainStats=${domainStatsWritten} checkpoints=${checkpointsUpdated} durationMs=${durationMs}`);

    return jsonRes({
      ok: true,
      dryRun,
      processedSessions,
      skippedSessions,
      checkpointsWithDomains: accumulator.size,
      domainStatsWritten,
      checkpointsUpdated,
      domainSummary,
      durationMs,
    });

  } catch (error) {
    console.error('[backfillDomainStats] error:', error);
    return jsonRes({ ok: false, error: error.message }, 500);
  }
});