import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const THRESHOLDS = {
  minMomentumToSeed: 8,
  risingDelta: 10,
  liveScore: 35,
  peakScore: 60,
  fadingScore: 10,
  publishScore: 18,
  expirationMinutes: 180,
};

function jsonRes(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function generateHeadline(domainKey, momentType, checkpointName) {
  const domainLabels = {
    music: 'musique',
    humour: 'humour',
    photo: 'photo',
    video: 'vidéo',
    food: 'bouffe',
    art: 'art',
    responsable: 'culture responsable',
  };

  const typeLabels = {
    emergence: 's’éveille',
    convergence: 'converge',
    climax: 'atteint son peak',
    persistence: 'reste actif',
  };

  return `${checkpointName || 'Ce lieu'} — la scène ${
    domainLabels[domainKey] || domainKey
  } ${typeLabels[momentType] || 's’anime'}`;
}

function generateSubheadline(liveStats) {
  const parts = [];

  // Sessions ouvertes = signal d'action immédiate — toujours affiché
  if ((liveStats?.recentSessionsOpened || 0) > 0) {
    parts.push(`${liveStats.recentSessionsOpened} session(s) ouverte(s)`);
  }

  // Sessions complétées = signal de momentum passé, pas d'action possible.
  // N'afficher que si une session est AUSSI ouverte (contexte de soirée active).
  // Seul, ce signal est trompeur : l'utilisateur ne peut pas rejoindre une session terminée.
  if ((liveStats?.recentSessionsConfirmed || 0) > 0 && (liveStats?.recentSessionsOpened || 0) > 0) {
    parts.push(`${liveStats.recentSessionsConfirmed} complétée(s)`);
  }

  if ((liveStats?.recentCheckins || 0) > 0) {
    parts.push(`${liveStats.recentCheckins} check-in(s) récent(s)`);
  }

  if (parts.length === 0) {
    // Fallback sur le momentum si aucun signal d'activité direct
    if ((liveStats?.momentumScore || 0) >= 20) return 'Lieu en activité';
    return 'Activité récente';
  }
  return parts.join(' · ');
}

function detectMomentType(liveStats) {
  if ((liveStats?.momentumScore || 0) >= THRESHOLDS.peakScore) return 'climax';
  if (
    (liveStats?.recentSessionsOpened || 0) >= 1 &&
    (liveStats?.recentCheckins || 0) >= 2
  ) {
    return 'convergence';
  }
  if ((liveStats?.momentumDelta || 0) >= THRESHOLDS.risingDelta) return 'emergence';
  return 'persistence';
}

async function writeSignals(service, momentId, cpId, liveStats, nowIso) {
  const signals = [];

  if ((liveStats?.recentSessionsConfirmed || 0) > 0) {
    signals.push({
      culturalMomentId: momentId,
      checkpointSystemId: cpId,
      signalType: 'session_confirmed',
      signalValue: liveStats.recentSessionsConfirmed,
      sourceTable: 'CheckpointLiveStats',
      sourceId: cpId,
      recordedAt: nowIso,
    });
  }

  if ((liveStats?.recentSessionsOpened || 0) > 0) {
    signals.push({
      culturalMomentId: momentId,
      checkpointSystemId: cpId,
      signalType: 'session_opened',
      signalValue: liveStats.recentSessionsOpened,
      sourceTable: 'CheckpointLiveStats',
      sourceId: cpId,
      recordedAt: nowIso,
    });
  }

  if ((liveStats?.recentCheckins || 0) > 0) {
    signals.push({
      culturalMomentId: momentId,
      checkpointSystemId: cpId,
      signalType: 'checkin',
      signalValue: liveStats.recentCheckins,
      sourceTable: 'CheckpointLiveStats',
      sourceId: cpId,
      recordedAt: nowIso,
    });
  }

  if ((liveStats?.momentumDelta || 0) > 10) {
    signals.push({
      culturalMomentId: momentId,
      checkpointSystemId: cpId,
      signalType: 'session_opened',
      signalValue: Math.round(liveStats.momentumDelta || 0),
      sourceTable: 'CheckpointLiveStats',
      sourceId: cpId,
      recordedAt: nowIso,
    });
  }

  if (signals.length > 0) {
    await service.entities.CulturalMomentSignal.bulkCreate(signals);
  }
}

function computeMomentScore(liveStats) {
  return (
    (liveStats?.momentumScore || 0) +
    Math.max(0, liveStats?.momentumDelta || 0) * 2
  );
}

/**
 * Parseur de date défensif — évite les faux négatifs sur Invalid Date.
 * Retourne null si la valeur n'est pas parseable.
 */
function safeParseDateMs(value) {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function transitionStatus(current, score, delta, expiresAt) {
  const now = new Date();

  // Parsing défensif : new Date(expiresAt) peut retourner Invalid Date
  // si le format ISO varie côté base (ex. sans 'Z', avec offset, etc.)
  const expiresMs = safeParseDateMs(expiresAt);
  if (expiresMs !== null && expiresMs < now.getTime()) return 'closed';
  if (score >= THRESHOLDS.peakScore) return 'peak';
  if (score >= THRESHOLDS.liveScore) return 'live';
  if (score >= THRESHOLDS.publishScore || delta >= THRESHOLDS.risingDelta) return 'rising';
  if (current === 'peak' || current === 'live') return 'fading';
  if (score < THRESHOLDS.fadingScore && current === 'fading') return 'closed';

  return current;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const service = base44.asServiceRole;
    const body = await req.json().catch(() => ({}));
    const dryRun = body?.dryRun === true;

    const startTs = Date.now();
    const now = new Date();
    const nowIso = now.toISOString();

    function toArray(val) {
      if (Array.isArray(val)) return val;
      if (val && Array.isArray(val.items)) return val.items;
      return [];
    }

    const [allLiveStatsRaw, existingMomentsRaw, allCheckpointsRaw] = await Promise.all([
      service.entities.CheckpointLiveStats.filter({}).catch(() => []),
      service.entities.CulturalMoment.filter({}).catch(() => []),
      service.entities.Checkpoint.filter({}).catch(() => []),
    ]);

    const allLiveStats = toArray(allLiveStatsRaw);
    const existingMoments = toArray(existingMomentsRaw);

    const allCheckpoints = toArray(allCheckpointsRaw).filter(
      (cp) => cp?.active === true || cp?.active === 'true'
    );

    const checkpointIndex = new Map(
      allCheckpoints.map((cp) => [cp.systemId, cp])
    );

    const momentIndex = new Map(
      (existingMoments || []).map((m) => [m.momentKey, m])
    );

    /**
     * Index de continuité — résout le problème de transition minuit.
     *
     * momentKey est date-based (cpId_domainKey_YYYY-MM-DD). À minuit, le key
     * change et le lookup normal échoue, forçant une re-création du moment
     * avec status 'rising' même si le lieu était en 'live' à 23h59.
     *
     * Cet index mappe `cpId__domainKey` → moment actif le plus récent
     * (non closé, non expiré), quel que soit son jour de création.
     * La boucle principale l'utilise en fallback si momentIndex.get() échoue.
     */
    const ACTIVE_STATUSES = new Set(['seeded', 'rising', 'live', 'peak', 'fading']);
    const activeMomentByCpDomain = new Map();
    for (const m of existingMoments) {
      if (!ACTIVE_STATUSES.has(m?.status)) continue;
      const expiresMs = safeParseDateMs(m?.expiresAt);
      if (expiresMs !== null && expiresMs < now.getTime()) continue; // déjà expiré
      const continuityKey = `${m.checkpointSystemId}__${m.domainKey}`;
      const current = activeMomentByCpDomain.get(continuityKey);
      // Garder le plus récent par startedAt si plusieurs actifs (ne devrait pas arriver)
      if (!current || (m.startedAt || '') > (current.startedAt || '')) {
        activeMomentByCpDomain.set(continuityKey, m);
      }
    }

    let created = 0;
    let updated = 0;
    let closed = 0;
    let skipped = 0;

    // Opérations batchées — collectées pendant la boucle, exécutées après
    const updateOps = [];
    const createOps = [];

    for (const liveStats of allLiveStats) {
      const cpId = liveStats?.checkpointSystemId;
      const checkpoint = checkpointIndex.get(cpId);

      if (!checkpoint) {
        skipped++;
        continue;
      }

      const domainKey =
        liveStats?.currentDomainKey ||
        checkpoint?.domainDominantKey ||
        'music';

      const momentumScore = Number(liveStats?.momentumScore || 0);

      if (momentumScore < THRESHOLDS.minMomentumToSeed) {
        skipped++;
        continue;
      }

      const checkpointName = checkpoint?.name || cpId;
      const momentType = detectMomentType(liveStats);
      const momentScore = computeMomentScore(liveStats);

      const dateStr = nowIso.slice(0, 10);
      const momentKey = `${cpId}_${domainKey}_${dateStr}`;

      const expiresAt = new Date(
        now.getTime() + THRESHOLDS.expirationMinutes * 60 * 1000
      ).toISOString();

      // Lookup 1 — clé exacte du jour (cas nominal)
      // Lookup 2 — continuité cross-minuit : moment actif existant pour ce cp+domaine
      const existing =
        momentIndex.get(momentKey) ||
        activeMomentByCpDomain.get(`${cpId}__${domainKey}`) ||
        null;

      // Si on a trouvé un moment via continuité (momentKey différent du jour),
      // on repousse son expiresAt pour éviter qu'il expire pendant la nuit.
      const isCarryOver = existing && existing.momentKey !== momentKey;

      if (existing) {
        const newStatus = transitionStatus(
          existing.status,
          momentScore,
          liveStats?.momentumDelta || 0,
          existing.expiresAt
        );

        const isPublished = ['rising', 'live', 'peak'].includes(newStatus);
        const statusChanged = newStatus !== existing.status;
        const scoreChanged = Math.abs(momentScore - Number(existing?.momentScore || 0)) > 1;

        if (statusChanged || scoreChanged) {
          updateOps.push({
            id: existing.id,
            data: {
              status: newStatus,
              momentScore,
              momentumScore: liveStats?.momentumScore,
              momentumDelta: liveStats?.momentumDelta || 0,
              headline: generateHeadline(domainKey, momentType, checkpointName),
              subheadline: generateSubheadline(liveStats),
              isPublishedInExplore: isPublished,
              ...(isCarryOver ? { expiresAt } : {}),
              ...(newStatus === 'closed' && !existing?.closedAt
                ? { closedAt: nowIso }
                : {}),
            },
            // Écrire les signaux seulement lors d'un vrai changement d'état (pas à chaque score update)
            // pour éviter la consommation excessive de crédits d'intégration.
            writeSignal: statusChanged,
            momentId: existing.id,
            cpId,
            liveStats,
          });

          if (newStatus === 'closed') closed++;
          else updated++;
        } else {
          skipped++;
        }
      } else {
        const initialStatus =
          momentScore >= THRESHOLDS.publishScore ? 'rising' : 'seeded';

        const isPublished = initialStatus === 'rising';

        createOps.push({
          momentKey,
          checkpointSystemId: cpId,
          domainKey,
          momentType,
          status: initialStatus,
          headline: generateHeadline(domainKey, momentType, checkpointName),
          subheadline: generateSubheadline(liveStats),
          ctaType:
            (liveStats?.recentSessionsOpened || 0) > 0
              ? 'join_session'
              : 'explore_checkpoint',
          momentScore,
          momentumScore: liveStats?.momentumScore,
          momentumDelta: liveStats?.momentumDelta || 0,
          styleCoherenceScore: 0,
          rarityScore: 0,
          timeUrgencyScore: 0,
          startedAt: nowIso,
          expiresAt,
          isPublishedInExplore: isPublished,
          _cpId: cpId,
          _liveStats: liveStats,
        });

        created++;
      }
    }

    // Exécution batchée des updates pour éviter le rate limiting (429)
    if (!dryRun) {
      await Promise.all(
        updateOps.map(async (op) => {
          await service.entities.CulturalMoment.update(op.id, op.data);
          // Signaux seulement sur changement de statut (pas à chaque tick de score)
          if (op.writeSignal) {
            await writeSignals(service, op.momentId, op.cpId, op.liveStats, nowIso);
          }
        })
      );

      // Créations séquentielles pour récupérer les IDs et écrire les signaux
      for (const op of createOps) {
        const { _cpId, _liveStats, ...momentData } = op;
        delete momentData._cpId;
        delete momentData._liveStats;
        const newMoment = await service.entities.CulturalMoment.create(momentData);
        if (newMoment?.id) {
          await writeSignals(service, newMoment.id, _cpId, _liveStats, nowIso);
        }
      }
    }

    // Nettoyage défensif des moments expirés non closés.
    const expiredMoments = existingMoments.filter((m) => {
      if (m?.status === 'closed') return false;
      const expiresMs = safeParseDateMs(m?.expiresAt);
      return expiresMs !== null && expiresMs < now.getTime();
    });

    if (!dryRun && expiredMoments.length > 0) {
      await Promise.all(
        expiredMoments.map((m) =>
          service.entities.CulturalMoment.update(m.id, {
            status: 'closed',
            closedAt: nowIso,
            isPublishedInExplore: false,
          })
        )
      );
    }
    closed += expiredMoments.length;

    const durationMs = Date.now() - startTs;

    console.log(
      '[recomputeCulturalMoments.v2]',
      JSON.stringify({
        dryRun,
        created,
        updated,
        closed,
        skipped,
        durationMs,
      })
    );

    return jsonRes({
      ok: true,
      dryRun,
      created,
      updated,
      closed,
      skipped,
      durationMs,
      thresholds: THRESHOLDS,
      startedAt: nowIso,
    });
  } catch (error) {
    console.error('[recomputeCulturalMoments.v2] error:', error);

    const message =
      error && typeof error === 'object' && 'message' in error
        ? error.message
        : 'Unknown error';

    return jsonRes(
      {
        ok: false,
        error: message,
      },
      500
    );
  }
});