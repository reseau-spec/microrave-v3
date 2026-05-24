/**
 * enqueue.ts — QUICKPLAY SEARCH REGISTRATION CANONIQUE
 *
 * RÈGLES CANONIQUES À NE PAS CASSER
 * ---------------------------------
 * 1) enqueue n’effectue AUCUNE décision de matchmaking.
 * 2) enqueue enregistre seulement la recherche active du joueur.
 * 3) La source de vérité de la qualité du match vit dans matchmakerTick.ts.
 * 4) Les champs critiques à conserver sont :
 *    - userId
 *    - roleSystemId
 *    - styleSystemIds
 *    - checkpointSystemId (si fourni)
 *    - status='queueing'
 *    - queuedAt
 *    - lastHeartbeatAt
 *
 * IMPORTANT
 * ---------
 * - on préserve queuedAt si le joueur est déjà queueing
 * - on ne détruit pas la fairness de la file sans raison
 * - on ne doit pas transformer enqueue en moteur métier
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function jsonError(status, code, message, extra) {
  return json(status, { ok: false, code, message, ...(extra || {}) });
}

function uniqueStrings(values) {
  const seen = new Set();
  const out = [];

  for (const v of values || []) {
    if (typeof v !== 'string') continue;
    const trimmed = v.trim();
    if (!trimmed) continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }

  return out;
}

function validateRoleId(v) {
  return typeof v === 'string' && v.startsWith('RL-') ? v.trim() : null;
}

function validateStyleIds(values) {
  const cleaned = uniqueStrings(values).filter((v) => v.startsWith('ST-'));
  return cleaned.slice(0, 50);
}

function validateCheckpointId(v) {
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : null;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);

    if (!user) {
      return jsonError(401, 'UNAUTHENTICATED', 'Non authentifié');
    }

    const service = base44.asServiceRole;
    if (!service) {
      return jsonError(503, 'SERVICE_ROLE_UNAVAILABLE', 'Service role unavailable');
    }

    const body = await req.json().catch(() => ({}));
    const nowIso = new Date().toISOString();

    const roleSystemId =
      validateRoleId(body?.roleSystemId) ||
      validateRoleId(body?.serviceRoleSystemId);

    const styleSystemIds = validateStyleIds(body?.styleSystemIds || []);
    const checkpointSystemId = validateCheckpointId(body?.checkpointSystemId);
    const serviceRoleSystemId =
      typeof body?.serviceRoleSystemId === 'string' && body.serviceRoleSystemId.trim()
        ? body.serviceRoleSystemId.trim()
        : null;

    if (!roleSystemId) {
      return jsonError(400, 'INVALID_ROLE', 'roleSystemId is required');
    }

    if (styleSystemIds.length < 1) {
      return jsonError(400, 'INVALID_STYLES', 'At least one styleSystemId is required');
    }

    const rows = await service.entities.UserQueueState.filter({
      userId: user.id,
    }).catch(() => []);

    const existing = rows?.[0] || null;

    // ── GARDE-FOU DEAD MATCH ─────────────────────────────────────────────────
    // Un UserQueueState status='matched' peut pointer vers une session morte
    // (completed, aborted, archived, absente, ou user absent des participants).
    // On vérifie la session avant de renvoyer le matched — si morte, on remet
    // l'état à queueing et on continue le flux normal.
    if (existing?.status === 'matched' && existing?.matchedSessionId) {
      const DEAD_STATUSES = new Set(['completed', 'aborted', 'archived', 'disputed']);

      let sessionAlive = false;
      let deadReason = 'unknown';

      try {
        const sess = await service.entities.Session.get(existing.matchedSessionId).catch(() => null);

        if (!sess) {
          deadReason = 'missingSession';
        } else if (DEAD_STATUSES.has(sess.status)) {
          deadReason = `deadSession_${sess.status}`;
        } else {
          // Vérifier que l'user est encore dans la session
          const parts = Array.isArray(sess.participants)
            ? sess.participants
            : (typeof sess.participants === 'string'
              ? (() => { try { return JSON.parse(sess.participants); } catch { return []; } })()
              : []);
          const inSession = parts.some(p =>
            (typeof p === 'string' ? p : p?.userId) === user.id
          );
          if (!inSession) {
            deadReason = 'notInSession';
          } else {
            sessionAlive = true;
          }
        }
      } catch (e) {
        deadReason = `lookupError_${e?.message}`;
      }

      if (sessionAlive) {
        // Session encore valide — renvoyer matched normalement
        console.log('[enqueue] matched session still alive', {
          userId: user.id,
          matchedSessionId: existing.matchedSessionId,
        });
        return json(200, {
          ok: true,
          status: 'matched',
          queueStateId: existing.id,
          matchedSessionId: existing.matchedSessionId,
        });
      }

      // Session morte — nettoyer et continuer vers queueing
      console.log('[enqueue] dead matched session — resetting to queueing', {
        userId: user.id,
        matchedSessionId: existing.matchedSessionId,
        deadReason,
      });

      await service.entities.UserQueueState.update(existing.id, {
        status: 'queueing',
        matchedSessionId: null,
        activeSessionId: null,
        matchedAt: null,
        lastHeartbeatAt: nowIso,
      }).catch(() => {});

      // Recharger l'existing nettoyé pour la suite du flux
      existing.status = 'queueing';
      existing.matchedSessionId = null;
      existing.activeSessionId = null;
      existing.matchedAt = null;
    }

    if (existing?.status === 'queueing') {
      // Reset queuedAt si la recherche change matériellement (role ou styles)
      const existingStyles = Array.isArray(existing.styleSystemIds)
        ? [...existing.styleSystemIds].sort().join(',')
        : '';
      const newStyles = [...styleSystemIds].sort().join(',');
      const searchChanged =
        existing.roleSystemId !== roleSystemId || existingStyles !== newStyles;

      // ── NETTOYAGE RÉSIDUS ────────────────────────────────────────────────
      // matchedSessionId/activeSessionId peuvent être non-null si :
      // - un tick précédent a échoué à passer status='matched'
      // - une session a été abortée sans passer par heartbeatQueue recovery
      // Un UserQueueState{status:'queueing', matchedSessionId!=null} est EXCLU
      // du pool par matchmakerTick → le user ne sera jamais matché.
      // On les nettoie systématiquement à chaque re-enqueue.
      const hadResidualMatch = !!(existing.matchedSessionId || existing.activeSessionId);
      if (hadResidualMatch) {
        console.log('[enqueue] cleaned residual matchedSessionId', {
          userId: user.id,
          matchedSessionId: existing.matchedSessionId,
          activeSessionId: existing.activeSessionId,
        });
      }

      const updatePayload = {
        roleSystemId,
        serviceRoleSystemId: serviceRoleSystemId || existing.serviceRoleSystemId || null,
        styleSystemIds,
        checkpointSystemId: checkpointSystemId ?? existing.checkpointSystemId ?? null,
        lastHeartbeatAt: nowIso,
        // Toujours nettoyer — si un résidu existait, l'user était invisible au matchmaker
        matchedSessionId: null,
        activeSessionId: null,
        matchedAt: null,
      };

      if (searchChanged) {
        updatePayload.queuedAt = nowIso;
        console.log('[enqueue] search changed — reset queuedAt', {
          userId: user.id,
          roleChanged: existing.roleSystemId !== roleSystemId,
          stylesChanged: existingStyles !== newStyles,
        });
      }

      const updated = await service.entities.UserQueueState.update(existing.id, updatePayload).catch(() => null);

      const note = hadResidualMatch
        ? 'cleaned_residual_and_requeued'
        : searchChanged
        ? 'search_changed_reset_queuedAt'
        : 'already_queueing_preserved_queuedAt';

      console.log('[enqueue] re-enqueued existing', {
        userId: user.id,
        queueStateId: existing.id,
        note,
        styleCount: styleSystemIds.length,
        roleSystemId,
      });

      return json(200, {
        ok: true,
        status: 'queueing',
        queueStateId: existing.id,
        queue: updated || existing,
        note,
      });
    }

    if (existing) {
      const updated = await service.entities.UserQueueState.update(existing.id, {
        status: 'queueing',
        queuedAt: nowIso,
        roleSystemId,
        serviceRoleSystemId: serviceRoleSystemId || existing.serviceRoleSystemId || null,
        styleSystemIds,
        checkpointSystemId: checkpointSystemId || null,
        matchedSessionId: null,
        activeSessionId: null,
        matchedAt: null,
        cancelledAt: null,
        lastHeartbeatAt: nowIso,
      }).catch(() => null);

      return json(200, {
        ok: true,
        status: 'queueing',
        queueStateId: existing.id,
        queue: updated || existing,
      });
    }

    const created = await service.entities.UserQueueState.create({
      userId: user.id,
      status: 'queueing',
      queuedAt: nowIso,
      roleSystemId,
      serviceRoleSystemId: serviceRoleSystemId || null,
      styleSystemIds,
      checkpointSystemId: checkpointSystemId || null,
      matchedSessionId: null,
      activeSessionId: null,
      matchedAt: null,
      cancelledAt: null,
      lastHeartbeatAt: nowIso,
    });

    return json(200, {
      ok: true,
      status: 'queueing',
      queueStateId: created.id,
      queue: created,
    });
  } catch (err) {
    return json(500, {
      ok: false,
      code: 'ENQUEUE_FAILED',
      error: err?.message || 'unknown',
    });
  }
});