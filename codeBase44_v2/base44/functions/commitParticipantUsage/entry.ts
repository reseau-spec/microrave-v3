// deploy: v4
/**
 * commitParticipantUsage — Appelée N fois (une par participant) quand session completed.
 * Responsabilité: CheckpointUserStats, CheckpointRoleStats, CheckpointStyleStats
 * NE TOUCHE PAS: CheckpointDomainLedger, CheckpointDomainStats, Checkpoint.domainRanking
 * Ces responsabilités sont EXCLUSIVES à commitCheckpointDomainUsage.
 */
// deploy: v3
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

// v3 — VALID_DOMAINS chargé depuis StyleHierarchy au lieu d'être hardcodé.
// La constante est construite une fois par invocation Deno (scope module-level
// non disponible sans warm cache). Pour les fonctions Deno stateless, on passe
// le Set en paramètre depuis le caller ou on le reconstruit depuis les styles reçus.
// Stratégie : extraire les domainKey uniques depuis les snapshots reçus en input
// + garder le Set comme validation loose (ne rejette pas les domaines inconnus mais log).
const VALID_DOMAINS_FALLBACK = new Set(['music', 'humour', 'photo', 'video', 'food', 'art', 'responsable']);

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function normalizeId(v) {
  if (!v) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  if (typeof v === 'object') return String(v.userId || v.systemId || v.id || v._id || '');
  return '';
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return json(401, { ok: false, error: 'Unauthorized' });

    const body = await req.json().catch(() => ({}));
    const { sessionId, checkpointSystemId, participant, domainKeysSnapshot } = body;

    if (!sessionId) return json(400, { ok: false, error: 'sessionId required' });
    if (!checkpointSystemId) return json(400, { ok: false, error: 'checkpointSystemId required' });
    if (!participant) return json(400, { ok: false, error: 'participant required' });

    const talentUserId = normalizeId(participant?.userId || participant?.id || participant);
    const roleSystemId = normalizeId(participant?.roleSystemId) || 'RL-001';
    const styleSystemIds = Array.isArray(participant?.styleSystemIds)
      ? participant.styleSystemIds.map(normalizeId).filter(Boolean)
      : [];

    // Déterminer domainKey principal (premier domaine valide du snapshot ou fallback)
    // v3 — accepter tous les domainKey présents dans le snapshot (dynamiques)
    // Le fallback null évite d'attribuer 'music' par défaut à des sessions non-musicales
    const validSnapDomains = (domainKeysSnapshot || []).filter(
      (d) => typeof d === 'string' && d.length > 0
    );
    const domainKey = validSnapDomains[0] || null;

    if (!domainKey) {
      console.warn(
        `[commitParticipantUsage] v3 NO_DOMAIN participant=${participant?.userId} sessionId=${sessionId} — snapshot vide, stats non commitées`
      );
      // Ne pas inventer un domaine — retourner sans écrire de stats erronées
      return json(200, { ok: true, skipped: true, reason: 'no_domain' });
    }

    if (!talentUserId) return json(400, { ok: false, error: 'participant.userId required' });

    const nowIso = new Date().toISOString();
    const svc = base44.asServiceRole;

    // Charger les SOTS logs pour ce talent dans cette session
    const sotsLogs = await svc.entities.SOTSLog.filter({ sessionId });
    const sotsForTalent = sotsLogs.filter((log) => log.targetId === talentUserId);
    const sotsCountR = sotsForTalent.length;
    const sotsSumR = sotsForTalent.reduce((s, l) => s + (l.scoreRaw || 0), 0);
    const sotsAvgR = sotsCountR > 0 ? sotsSumR / sotsCountR : 0;
    const sotsCount = sotsLogs.length;
    const sotsSum = sotsLogs.reduce((s, l) => s + (l.scoreRaw || 0), 0);
    const sotsAvg = sotsCount > 0 ? sotsSum / sotsCount : 0;

    // DO NOT CALL DomainStats FROM participant loop — see commitCheckpointDomainUsage

    // 1) Upsert CheckpointUserStats
    // ⚠️ R1 : filter sur 1 seul champ indexé, filtrage JS sur domainKey + userId
    try {
      const allUserStats = await svc.entities.CheckpointUserStats.filter({ checkpointSystemId });
      const existing = allUserStats.filter(
        (r) => r.domainKey === domainKey && r.userId === talentUserId
      );

      if (existing.length > 0) {
        const s = existing[0];
        const newSotsCountR = (s.sotsCountReceived || 0) + sotsCountR;
        const newSotsSumR = (s.sotsSumReceived || 0) + sotsSumR;

        await svc.entities.CheckpointUserStats.update(s.id, {
          playsCount: (s.playsCount || 0) + 1,
          sotsCountReceived: newSotsCountR,
          sotsSumReceived: newSotsSumR,
          sotsAvgReceived: newSotsCountR > 0 ? newSotsSumR / newSotsCountR : 0,
          lastPlayedAt: nowIso,
          updatedAt: nowIso,
        });
      } else {
        await svc.entities.CheckpointUserStats.create({
          checkpointSystemId,
          domainKey,
          userId: talentUserId,
          playsCount: 1,
          sotsCountReceived: sotsCountR,
          sotsSumReceived: sotsSumR,
          sotsAvgReceived: sotsAvgR,
          lastPlayedAt: nowIso,
          updatedAt: nowIso,
        });
      }
    } catch (e) {
      console.warn('[commitParticipantUsage] CheckpointUserStats failed:', e.message);
    }

    // 2) Upsert CheckpointRoleStats
    // ⚠️ R1 : filter sur 1 seul champ indexé, filtrage JS sur domainKey + roleSystemId
    try {
      const allRoleStats = await svc.entities.CheckpointRoleStats.filter({ checkpointSystemId });
      const existing = allRoleStats.filter(
        (r) => r.domainKey === domainKey && r.roleSystemId === roleSystemId
      );

      if (existing.length > 0) {
        const s = existing[0];
        const newSotsCount = (s.sotsCount || 0) + sotsCount;
        const newSotsSum = (s.sotsSum || 0) + sotsSum;

        await svc.entities.CheckpointRoleStats.update(s.id, {
          playsCount: (s.playsCount || 0) + 1,
          sotsCount: newSotsCount,
          sotsSum: newSotsSum,
          sotsAvg: newSotsCount > 0 ? newSotsSum / newSotsCount : 0,
          lastPlayedAt: nowIso,
          updatedAt: nowIso,
        });
      } else {
        await svc.entities.CheckpointRoleStats.create({
          checkpointSystemId,
          domainKey,
          roleSystemId,
          playsCount: 1,
          uniqueTalentsCount: 0,
          sotsCount,
          sotsSum,
          sotsAvg,
          lastPlayedAt: nowIso,
          updatedAt: nowIso,
        });
      }
    } catch (e) {
      console.warn('[commitParticipantUsage] CheckpointRoleStats failed:', e.message);
    }

    // 3) Upsert CheckpointStyleStats (une ligne par style)
    for (const styleLeafId of styleSystemIds) {
      if (!styleLeafId) continue;

      try {
        // ⚠️ R1 : filter sur 1 seul champ indexé, filtrage JS sur domainKey + styleLeafId
        const allStyleStats = await svc.entities.CheckpointStyleStats.filter({ checkpointSystemId });
        const existing = allStyleStats.filter(
          (r) => r.domainKey === domainKey && r.styleLeafId === styleLeafId
        );

        if (existing.length > 0) {
          const s = existing[0];
          const newSotsCount = (s.sotsCount || 0) + sotsCount;
          const newSotsSum = (s.sotsSum || 0) + sotsSum;

          await svc.entities.CheckpointStyleStats.update(s.id, {
            playsCount: (s.playsCount || 0) + 1,
            sotsCount: newSotsCount,
            sotsSum: newSotsSum,
            sotsAvg: newSotsCount > 0 ? newSotsSum / newSotsCount : 0,
            lastPlayedAt: nowIso,
            updatedAt: nowIso,
          });
        } else {
          await svc.entities.CheckpointStyleStats.create({
            checkpointSystemId,
            domainKey,
            styleLeafId,
            playsCount: 1,
            uniqueTalentsCount: 0,
            sotsCount,
            sotsSum,
            sotsAvg,
            lastPlayedAt: nowIso,
            updatedAt: nowIso,
          });
        }
      } catch (e) {
        console.warn(`[commitParticipantUsage] StyleStats failed for ${styleLeafId}:`, e.message);
      }
    }

    // RWE-2 — Accumuler rweTotal sur TalentProfile depuis audienceCountFrozen de la session
    // Cette accumulation transforme chaque session en point de données objectif dans
    // le Real World Engagement du talent. Impossible à faker — lié à des présences GPS vérifiées.
    try {
      const sessions = await svc.entities.Session.filter({ id: sessionId }).catch(() => []);
      const session = sessions?.[0];
      const audienceCountFrozen = Number(session?.audienceCountFrozen) || 0;

      if (audienceCountFrozen > 0) {
        const profiles = await svc.entities.TalentProfile.filter({ userId: talentUserId }).catch(
          () => []
        );
        const profile = profiles?.[0];

        if (profile) {
          // Idempotence — RWE-4 : vérifier que cette session n'a pas déjà été commitée
          const committed = Array.isArray(profile.rweCommittedSessionIds)
            ? profile.rweCommittedSessionIds
            : [];

          if (committed.includes(sessionId)) {
            console.log(
              `[commitParticipantUsage] RWE SKIP (already committed) talentId=${talentUserId} sessionId=${sessionId}`
            );
          } else {
            const currentRwe = Number(profile.rweTotal) || 0;
            const currentCount = Number(profile.rweSessionCount) || 0;
            const newRwe = currentRwe + audienceCountFrozen;
            const newCount = currentCount + 1;
            const newAvg = Math.round((newRwe / newCount) * 10) / 10;

            await svc.entities.TalentProfile.update(profile.id, {
              rweTotal: newRwe,
              rweSessionCount: newCount,
              rweAvgPerSession: newAvg,
              rweCommittedSessionIds: [...committed, sessionId],
            }).catch((e) =>
              console.warn('[commitParticipantUsage] rweTotal update failed:', e?.message)
            );

            console.log(
              `[commitParticipantUsage] RWE talentId=${talentUserId} +${audienceCountFrozen} → total=${newRwe} avg=${newAvg}`
            );
          }
        }
      }
    } catch (rweErr) {
      console.warn('[commitParticipantUsage] RWE non-fatal:', rweErr?.message);
    }

    return json(200, {
      ok: true,
      userId: talentUserId,
      stylesUpdated: styleSystemIds.length,
    });
  } catch (err) {
    console.error('[commitParticipantUsage] Error:', err);
    return json(500, { ok: false, error: err.message });
  }
});