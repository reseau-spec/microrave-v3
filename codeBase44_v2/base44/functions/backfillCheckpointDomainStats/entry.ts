// deploy: v2
/**
 * backfillCheckpointDomainStats
 * Recalcule CheckpointDomainLedger + CheckpointDomainStats + Checkpoint.domainRanking
 * pour les sessions completed d'un checkpoint donné (ou tous).
 * Admin only.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

// v2 — VALID_DOMAINS construit dynamiquement dans le handler depuis StyleHierarchy
// (plus de Set hardcodé en module scope)

function json(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function normalizeId(v) {
  if (!v) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'object') return String(v.systemId || v.id || v._id || '');
  return String(v);
}

function asArray(v) {
  if (Array.isArray(v)) return v;
  return [];
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return json(401, { ok: false, error: 'Unauthorized' });
    if (user.role !== 'admin') return json(403, { ok: false, error: 'Admin only' });

    const body = await req.json().catch(() => ({}));
    const { checkpointSystemId: filterCpId } = body;

    const svc = base44.asServiceRole;
    const nowIso = new Date().toISOString();

    // v2 — VALID_DOMAINS construit depuis StyleHierarchy (dynamique)
    const _allStylesForDomains = await svc.entities.StyleHierarchy.filter({}).catch(() => []);
    const VALID_DOMAINS = new Set((_allStylesForDomains || []).map(s => s.domainKey).filter(Boolean));

    // Charger toutes les sessions terminales avec un checkpoint
    const TERMINAL_STATUSES = ['completed', 'sots_submitted', 'archived'];
    const allSessionBatches = await Promise.all(
      TERMINAL_STATUSES.map(st => svc.entities.Session.filter({ status: st }).catch(() => []))
    );
    const allSessions = allSessionBatches.flat();
    const sessions = filterCpId
      ? allSessions.filter(s => s.checkpointSystemId === filterCpId)
      : allSessions.filter(s => !!s.checkpointSystemId);

    console.log(`[backfillCheckpointDomainStats] Processing ${sessions.length} completed sessions${filterCpId ? ` for ${filterCpId}` : ''}`);

    const results = { processed: 0, skipped: 0, errors: [] };

    // Pré-charger tous les rôles (cache)
    const allRoles = await svc.entities.RoleHierarchy.filter({}).catch(() => []);
    const roleCache = {};
    for (const r of allRoles) {
      if (r.systemId) roleCache[r.systemId] = r;
    }

    // Pré-charger styles si besoin (cache partiel - chargé à la demande)
    const styleCache = {};

    async function resolveStyleDomain(styleId) {
      if (!styleId) return null;
      if (styleCache[styleId] !== undefined) return styleCache[styleId];
      try {
        const styles = await svc.entities.StyleHierarchy.filter({ systemId: styleId });
        const dk = styles?.[0]?.domainKey || null;
        styleCache[styleId] = VALID_DOMAINS.has(dk) ? dk : null;
        return styleCache[styleId];
      } catch {
        styleCache[styleId] = null;
        return null;
      }
    }

    for (const session of sessions) {
      try {
        const participants = asArray(session.participants);
        const countedParticipants = participants.filter(p => {
          const uid = normalizeId(p?.userId);
          const rid = normalizeId(p?.roleSystemId);
          if (!uid || !rid) return false;
          if (p?.isNoShow || p?.status === 'cancelled' || p?.status === 'removed') return false;
          return true;
        });

        if (countedParticipants.length === 0) {
          results.skipped++;
          continue;
        }

        const domainCounts = {};
        const roleCounts = {};

        for (const p of countedParticipants) {
          const rid = normalizeId(p.roleSystemId);
          roleCounts[rid] = (roleCounts[rid] || 0) + 1;

          // Source primaire: rôle → domaine
          let dk = roleCache[rid]?.domainKey || null;
          if (!dk || !VALID_DOMAINS.has(dk)) {
            // Fallback: style actif de la session uniquement
            const activeStyleId = normalizeId(p?.styleSystemId) || normalizeId(asArray(p?.styleSystemIds)[0]);
            dk = await resolveStyleDomain(activeStyleId);
          }

          if (!dk || !VALID_DOMAINS.has(dk)) continue;
          domainCounts[dk] = (domainCounts[dk] || 0) + 1;
        }

        const totalDomainCount = Object.values(domainCounts).reduce((s, v) => s + v, 0);
        if (totalDomainCount === 0) { results.skipped++; continue; }

        const domainWeights = {};
        for (const [dk, count] of Object.entries(domainCounts)) {
          domainWeights[dk] = Math.round((count / totalDomainCount) * 10000) / 10000;
        }

        // --- Commit ledger ---
        const cpId = session.checkpointSystemId;
        const sessId = session.id;

        // Idempotence: supprimer lignes existantes
        const existingLedger = await svc.entities.CheckpointDomainLedger.filter({ sessionId: sessId }).catch(() => []);
        for (const row of existingLedger) {
          await svc.entities.CheckpointDomainLedger.delete(row.id).catch(() => {});
        }

        // Écrire nouvelles lignes
        for (const [dk, w] of Object.entries(domainWeights)) {
          await svc.entities.CheckpointDomainLedger.create({
            checkpointSystemId: cpId,
            sessionId: sessId,
            domainKey: dk,
            weight: w,
            participantCount: countedParticipants.length,
            occurredAt: session.actualEndAt || session.updated_date || nowIso,
            timestamp: nowIso,
          }).catch(e => console.warn('ledger insert failed:', e.message));
        }

        results.processed++;
      } catch (e) {
        results.errors.push({ sessionId: session.id, error: e.message });
      }
    }

    // --- Recompute stats par checkpoint unique ---
    const cpIds = [...new Set(sessions.map(s => s.checkpointSystemId).filter(Boolean))];
    const statsResults = [];

    for (const cpId of cpIds) {
      try {
        const allLedger = await svc.entities.CheckpointDomainLedger.filter({ checkpointSystemId: cpId }).catch(() => []);
        const domainTotals = {};
        let totalLedgerWeight = 0;

        for (const row of allLedger) {
          const w = Number(row.weight) || Number(row.delta) || 1;
          if (w <= 0 || !VALID_DOMAINS.has(row.domainKey)) continue;
          domainTotals[row.domainKey] = (domainTotals[row.domainKey] || 0) + w;
          totalLedgerWeight += w;
        }

        const domainRanking = Object.entries(domainTotals)
          .map(([key, total]) => ({ key, weight: totalLedgerWeight > 0 ? Math.round((total / totalLedgerWeight) * 10000) / 10000 : 0 }))
          .sort((a, b) => b.weight - a.weight);

        const domainDominantKey = domainRanking[0]?.key || null;

        // Upsert CheckpointDomainStats
        const existingStats = await svc.entities.CheckpointDomainStats.filter({ checkpointSystemId: cpId }).catch(() => []);
        for (const entry of domainRanking) {
          const sessionCount = allLedger.filter(r => r.domainKey === entry.key).length;
          const existing = existingStats.find(s => s.domainKey === entry.key);
          if (existing) {
            await svc.entities.CheckpointDomainStats.update(existing.id, {
              weight: entry.weight, countSessions: sessionCount, lastSessionAt: nowIso, updatedAt: nowIso,
            }).catch(() => {});
          } else {
            await svc.entities.CheckpointDomainStats.create({
              checkpointSystemId: cpId, domainKey: entry.key,
              weight: entry.weight, countSessions: sessionCount, lastSessionAt: nowIso, updatedAt: nowIso,
            }).catch(() => {});
          }
        }

        // Sync Checkpoint
        const cps = await svc.entities.Checkpoint.filter({ systemId: cpId }).catch(() => []);
        if (cps.length > 0) {
          await svc.entities.Checkpoint.update(cps[0].id, { domainDominantKey, domainRanking }).catch(() => {});
        }

        statsResults.push({ checkpointSystemId: cpId, domainDominantKey, domainRanking });
        console.log(`[backfill] ${cpId} dominant=${domainDominantKey} ranking=${JSON.stringify(domainRanking)}`);
      } catch (e) {
        results.errors.push({ checkpointSystemId: cpId, error: e.message });
      }
    }

    return json(200, { ok: true, ...results, checkpoints: statsResults });

  } catch (err) {
    console.error('[backfillCheckpointDomainStats] Error:', err);
    return json(500, { ok: false, error: err.message });
  }
});