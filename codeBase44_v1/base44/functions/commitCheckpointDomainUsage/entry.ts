// deploy: v3
/**
 * commitCheckpointDomainUsage — Règle canonique v3
 * Source de vérité = domainWeights calculés par transitionSession (rôles joués, au prorata).
 * NE reconstruit PLUS les domaines depuis styleSystemIds.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

// v — VALID_DOMAINS chargé dynamiquement depuis StyleHierarchy dans le handler.
// Fallback statique utilisé uniquement si StyleHierarchy inaccessible.
const VALID_DOMAINS_FALLBACK = new Set(['music','humour','photo','video','food','art','responsable']);

function json(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return json(401, { ok: false, error: 'Unauthorized' });

    const body = await req.json().catch(() => ({}));
    const { sessionId, checkpointSystemId, domainWeights, participantCount } = body;

    if (!sessionId) return json(400, { ok: false, error: 'sessionId required' });
    if (!checkpointSystemId) return json(400, { ok: false, error: 'checkpointSystemId required' });

    // Valider domainWeights (objet { domainKey: weight })
    const validatedWeights = {};
    if (domainWeights && typeof domainWeights === 'object' && !Array.isArray(domainWeights)) {
      for (const [dk, w] of Object.entries(domainWeights)) {
        if (VALID_DOMAINS.has(dk) && typeof w === 'number' && w > 0) {
          validatedWeights[dk] = w;
        }
      }
    }

    if (Object.keys(validatedWeights).length === 0) {
      console.warn('[commitCheckpointDomainUsage] No valid domainWeights provided, skipping');
      return json(200, { ok: true, skipped: true });
    }

    const nowIso = new Date().toISOString();
    const svc = base44.asServiceRole;

    // v — VALID_DOMAINS dynamique depuis StyleHierarchy
    const _stylesForDomains = await svc.entities.StyleHierarchy.filter({}). catch(() => []);
    const VALID_DOMAINS = new Set((_stylesForDomains || []).map(s => s.domainKey).filter(Boolean));

    // ─── A. Idempotence: supprimer les ledger rows existantes pour cette session ───
    try {
      const existingRows = await svc.entities.CheckpointDomainLedger.filter({ sessionId });
      for (const row of existingRows) {
        await svc.entities.CheckpointDomainLedger.delete(row.id).catch(() => {});
      }
    } catch (e) {
      console.warn('[commitCheckpointDomainUsage] Cleanup existing ledger rows failed (non-fatal):', e.message);
    }

    // ─── B. Écrire 1 ligne ledger par domaine réel avec son weight exact ───
    for (const [domainKey, weight] of Object.entries(validatedWeights)) {
      try {
        await svc.entities.CheckpointDomainLedger.create({
          checkpointSystemId,
          sessionId,
          domainKey,
          weight,
          participantCount: participantCount || 0,
          occurredAt: nowIso,
          timestamp: nowIso,
        });
      } catch (e) {
        console.warn('[commitCheckpointDomainUsage] Ledger insert failed (non-fatal):', e.message);
      }
    }

    // ─── C. Recompute CheckpointDomainStats depuis TOUS les ledger rows ───
    try {
      const allLedgerRows = await svc.entities.CheckpointDomainLedger.filter({ checkpointSystemId });

      // Sommer les weights par domaine sur toute l'historique
      const domainTotals = {};
      let totalWeight = 0;
      for (const row of allLedgerRows) {
        const w = Number(row.weight) || 0;
        if (w <= 0 || !VALID_DOMAINS.has(row.domainKey)) continue;
        domainTotals[row.domainKey] = (domainTotals[row.domainKey] || 0) + w;
        totalWeight += w;
      }

      // Normaliser
      const domainRanking = [];
      for (const [dk, total] of Object.entries(domainTotals)) {
        const normalizedWeight = totalWeight > 0 ? Math.round((total / totalWeight) * 10000) / 10000 : 0;
        domainRanking.push({ key: dk, weight: normalizedWeight });
      }
      domainRanking.sort((a, b) => b.weight - a.weight);

      const domainDominantKey = domainRanking[0]?.key || null;

      // Upsert CheckpointDomainStats (1 row par domaine)
      const existingStats = await svc.entities.CheckpointDomainStats.filter({ checkpointSystemId });
      for (const entry of domainRanking) {
        const existing = existingStats.find(s => s.domainKey === entry.key);
        const sessionCount = allLedgerRows.filter(r => r.domainKey === entry.key).length;
        if (existing) {
          await svc.entities.CheckpointDomainStats.update(existing.id, {
            weight: entry.weight,
            countSessions: sessionCount,
            lastSessionAt: nowIso,
            updatedAt: nowIso,
          }).catch(() => {});
        } else {
          await svc.entities.CheckpointDomainStats.create({
            checkpointSystemId,
            domainKey: entry.key,
            weight: entry.weight,
            countSessions: sessionCount,
            lastSessionAt: nowIso,
            updatedAt: nowIso,
          }).catch(() => {});
        }
      }

      // ─── D. Sync vers Checkpoint ───
      const cps = await svc.entities.Checkpoint.filter({ systemId: checkpointSystemId });
      if (cps.length > 0) {
        await svc.entities.Checkpoint.update(cps[0].id, { domainDominantKey, domainRanking });
      }

      console.log(`[commitCheckpointDomainUsage] ${checkpointSystemId} updated, dominant=${domainDominantKey}, ranking=${JSON.stringify(domainRanking)}`);
      return json(200, { ok: true, domainRanking, domainDominantKey });

    } catch (e) {
      console.warn('[commitCheckpointDomainUsage] Ranking update failed (non-fatal):', e.message);
    }

    return json(200, { ok: true, domainsCommitted: Object.keys(validatedWeights) });

  } catch (err) {
    console.error('[commitCheckpointDomainUsage] Error:', err);
    return json(500, { ok: false, error: err.message });
  }
});