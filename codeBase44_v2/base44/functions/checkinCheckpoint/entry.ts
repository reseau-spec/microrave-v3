// deploy: v2
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

/**
 * checkinCheckpoint
 *
 * Input: { checkpointSystemId, geoLat, geoLng }
 * - Valide la distance < 500m
 * - Cooldown : 1 check-in / checkpoint / 4h par user
 * - Crée un enregistrement CheckpointCheckin
 * - Attribue +25 XP au TalentProfile
 */

const MAX_DISTANCE_M = 500;
const COOLDOWN_MS = 4 * 60 * 60 * 1000; // 4h
const XP_REWARD = 25;

function jsonRes(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function haversineM(lat1, lon1, lat2, lon2) {
  const R = 6371000; // mètres
  const toRad = x => x * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return jsonRes({ error: 'Authentication required' }, 401);

    const body = await req.json().catch(() => ({}));
    const { checkpointSystemId, geoLat, geoLng } = body;

    if (!checkpointSystemId) return jsonRes({ error: 'checkpointSystemId requis' }, 400);
    if (geoLat == null || geoLng == null) return jsonRes({ error: 'Coordonnées GPS requises' }, 400);

    const service = base44.asServiceRole;

    // 1. Charger le checkpoint
    const checkpoints = await service.entities.Checkpoint.filter({ systemId: checkpointSystemId });
    const cp = checkpoints?.[0];
    if (!cp) return jsonRes({ error: 'Checkpoint introuvable' }, 404);
    if (!cp.geoLat || !cp.geoLng) return jsonRes({ error: 'Checkpoint sans coordonnées GPS' }, 400);

    // 2. Validation distance
    const distanceM = Math.round(haversineM(geoLat, geoLng, cp.geoLat, cp.geoLng));
    if (distanceM > MAX_DISTANCE_M) {
      return jsonRes({
        ok: false,
        error: 'too_far',
        distanceM,
        maxDistanceM: MAX_DISTANCE_M,
        message: `Vous êtes à ${distanceM}m. Approchez-vous à moins de ${MAX_DISTANCE_M}m.`,
      }, 422);
    }

    // 3. Cooldown : dernier check-in de cet user sur ce checkpoint
    const cooldownSince = new Date(Date.now() - COOLDOWN_MS).toISOString();
    const recentCheckins = await service.entities.CheckpointCheckin.filter({
      userId: user.id,
      checkpointSystemId,
    }, '-checkinAt', 1);

    const lastCheckin = recentCheckins?.[0];
    if (lastCheckin && lastCheckin.checkinAt > cooldownSince) {
      const nextAt = new Date(new Date(lastCheckin.checkinAt).getTime() + COOLDOWN_MS);
      return jsonRes({
        ok: false,
        error: 'cooldown',
        nextCheckinAt: nextAt.toISOString(),
        message: 'Check-in déjà effectué récemment sur ce lieu.',
      }, 429);
    }

    // 4. Créer le check-in
    const nowIso = new Date().toISOString();
    await service.entities.CheckpointCheckin.create({
      userId: user.id,
      checkpointSystemId,
      checkinAt: nowIso,
      geoLat,
      geoLng,
      distanceM,
      xpAwarded: XP_REWARD,
    });

    // 5. Attribuer XP au TalentProfile (upsert)
    const profiles = await service.entities.TalentProfile.filter({ userId: user.id });
    const profile = profiles?.[0];
    if (profile) {
      const newXp = (profile.xpGlobal || 0) + XP_REWARD;
      const newCosmeticXp = (profile.cosmeticXp || 0) + XP_REWARD;
      await service.entities.TalentProfile.update(profile.id, {
        xpGlobal: newXp,
        cosmeticXp: newCosmeticXp,
      });
    }

    console.log(`[checkinCheckpoint] user=${user.id} cp=${checkpointSystemId} dist=${distanceM}m xp=+${XP_REWARD}`);

    // Déclencher la progression des missions (fire-and-forget)
    base44.functions.invoke('checkMissionProgress', {
      triggerType: 'checkin',
      checkpointSystemId,
    }).catch(e => console.warn('[checkinCheckpoint] checkMissionProgress error:', e));

    return jsonRes({
      ok: true,
      xpAwarded: XP_REWARD,
      distanceM,
      checkpointSystemId,
      checkpointName: cp.name,
      nextCheckinAt: new Date(Date.now() + COOLDOWN_MS).toISOString(),
    });

  } catch (error) {
    console.error('[checkinCheckpoint] error:', error);
    return jsonRes({ ok: false, error: error.message }, 500);
  }
});