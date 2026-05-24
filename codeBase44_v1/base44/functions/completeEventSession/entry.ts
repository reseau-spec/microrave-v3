// deploy: v4
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

function jsonError(status, code, message, extra = {}) {
  return new Response(JSON.stringify({ ok: false, code, error: message, ...extra }), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

function normalizeId(v) {
  if (!v) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  if (typeof v === 'object') return String(v.systemId || v.id || v._id || v.value || '');
  return '';
}

function asArray(value, fallback = []) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch { return fallback; }
  }
  return fallback;
}

// v4 — VALID_CP_DOMAINS construit dynamiquement depuis StyleHierarchy au runtime.
// Ajouter un domaine = ajouter des styles dans StyleHierarchy, aucun code à modifier.
// buildValidDomains() est appelé une fois par invocation, au début du handler.
async function buildValidDomains(service) {
  try {
    const allStyles = await service.entities.StyleHierarchy.filter({});
    const keys = [...new Set((allStyles || []).map(s => s.domainKey).filter(Boolean))];
    return keys.length > 0 ? new Set(keys) : new Set(['music','humour','photo','video','food','art','responsable']);
  } catch {
    // Fallback sécurisé si StyleHierarchy inaccessible
    return new Set(['music','humour','photo','video','food','art','responsable']);
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return jsonError(401, 'UNAUTHENTICATED', 'Non authentifié');

    const body = await req.json().catch(() => ({}));
    const { sessionId } = body;
    if (!sessionId) return jsonError(400, 'BAD_REQUEST', 'sessionId requis');

    const serviceRole = base44.asServiceRole;
    if (!serviceRole) return jsonError(503, 'SERVICE_ROLE_UNAVAILABLE', 'Service role unavailable');

    // v4 — Set de domaines valides construit dynamiquement (plus de hardcode)
    const VALID_CP_DOMAINS = await buildValidDomains(serviceRole);

    const sessions = await serviceRole.entities.Session.filter({ id: sessionId });
    const session = sessions?.[0];
    if (!session) return jsonError(404, 'SESSION_NOT_FOUND', 'Session introuvable');

    const actorUserId = user.id;
    const nowIso = new Date().toISOString();
    const participants = asArray(session.participants, []);

    // Auth: organizer or confirmed participant
    const isOrganizer = normalizeId(session.organizerId) === actorUserId ||
                        normalizeId(session.hostUserId) === actorUserId;
    const isConfirmed = participants.some(p =>
      normalizeId(p?.userId) === actorUserId && p?.status === 'confirmed'
    );
    if (!isOrganizer && !isConfirmed) {
      return jsonError(403, 'FORBIDDEN', 'Organisateur ou participant confirmé requis');
    }

    if (session.status !== 'in_progress') {
      return jsonError(409, 'INVALID_TRANSITION',
        `Transition invalide: ${session.status} -> COMPLETE_SESSION`);
    }

    const update = {
      status: 'completed',
      actualEndAt: nowIso,
    };

    // RWE-1 — Freeze des compteurs de présence à la clôture (immuables après)
    // audienceCountFrozen = source de vérité pour SOTS pondéré et rweTotal
    try {
      const allPresences = await serviceRole.entities.SessionPresence
        .filter({ sessionId }).catch(() => []);
      const validPresences = (allPresences || []).filter(p =>
        ['active', 'completed', 'auto_closed'].includes(p.status)
      );
      const audienceCount   = validPresences.filter(p => p.role === 'audience').length;
      const artistCount     = validPresences.filter(p => p.role === 'artist').length;
      const organizerCount  = validPresences.filter(p => p.role === 'organizer').length;
      const totalPresenceCount = audienceCount + artistCount + organizerCount;

      update.audienceCount       = audienceCount;
      update.artistCount         = artistCount;
      update.totalPresenceCount  = totalPresenceCount;
      update.audienceCountFrozen = audienceCount; // immuable dès ici

      console.log(`[completeEventSession] RWE FROZEN sessionId=${sessionId} audience=${audienceCount} artists=${artistCount} total=${totalPresenceCount}`);
    } catch (rweErr) {
      console.warn('[completeEventSession] RWE freeze failed (non-fatal):', rweErr?.message);
    }

    // ── Résoudre le checkpoint ────────────────────────────────────────────
    let cpId = session.checkpointSystemId || null;
    let eventRecord = null;
    if (!cpId && session.eventId) {
      try {
        const events = await serviceRole.entities.Event.filter({ id: session.eventId });
        eventRecord = events?.[0] || null;
        if (eventRecord?.checkpointId) cpId = eventRecord.checkpointId;
      } catch (e) { console.warn('Event lookup failed:', e?.message); }
    }
    if (cpId) update.checkpointSystemId = cpId;

    // ── Commit domain stats ───────────────────────────────────────────────
    if (cpId) {
      try {
        const allStyleIds = [...new Set(
          participants.flatMap(p => {
            const styles = Array.isArray(p?.styleSystemIds) ? p.styleSystemIds : [];
            if (p?.styleSystemId && !styles.includes(p.styleSystemId)) styles.push(p.styleSystemId);
            return styles.filter(Boolean);
          })
        )];

        const domainKeySet = new Set();

        for (const styleId of allStyleIds) {
          try {
            const styles = await serviceRole.entities.StyleHierarchy.filter({ systemId: styleId });
            if (styles?.[0]?.domainKey && VALID_CP_DOMAINS.has(styles[0].domainKey))
              domainKeySet.add(styles[0].domainKey);
          } catch { /* non-fatal */ }
        }

        if (domainKeySet.size === 0) {
          if (!eventRecord && session.eventId) {
            try {
              const events = await serviceRole.entities.Event.filter({ id: session.eventId });
              eventRecord = events?.[0] || null;
            } catch { /* non-fatal */ }
          }
          if (eventRecord?.styles?.length > 0) {
            for (const styleId of eventRecord.styles) {
              try {
                const styles = await serviceRole.entities.StyleHierarchy.filter({ systemId: styleId });
                if (styles?.[0]?.domainKey && VALID_CP_DOMAINS.has(styles[0].domainKey))
                  domainKeySet.add(styles[0].domainKey);
              } catch { /* non-fatal */ }
            }
          }
        }

        if (domainKeySet.size === 0) {
          try {
            const cps = await serviceRole.entities.Checkpoint.filter({ systemId: cpId });
            if (cps?.[0]?.domainDominantKey && VALID_CP_DOMAINS.has(cps[0].domainDominantKey))
              domainKeySet.add(cps[0].domainDominantKey);
          } catch { /* non-fatal */ }
        }

        if (domainKeySet.size === 0) {
          const eligibleRoleIds = [...new Set(
            participants.map(p => normalizeId(p?.roleSystemId)).filter(r => r && r !== 'RL-ORGANIZER')
          )];
          for (const roleId of eligibleRoleIds) {
            try {
              const domainMaps = await serviceRole.entities.RoleDomainMap.filter({
                roleSystemId: roleId, isActive: true
              });
              for (const dm of domainMaps) {
                if (dm.domainKey && VALID_CP_DOMAINS.has(dm.domainKey))
                  domainKeySet.add(dm.domainKey);
              }
            } catch { /* non-fatal */ }
          }
        }

        // v4 — si aucun domaine détecté, on ne force plus 'music'.
        // Un event sans domaine identifiable a domainKeysSnapshot = [] — acceptable.
        // Ne pas inventer un domaine qui fausserait les stats du checkpoint.
        if (domainKeySet.size === 0) {
          console.warn(`[completeEventSession] v4 NO_DOMAIN_DETECTED sessionId=${session.id} — domainKeysSnapshot vide`);
        }

        const domainKeysSnapshot = [...domainKeySet];
        update.domainKeysSnapshot = domainKeysSnapshot;

        await base44.functions.invoke('commitCheckpointDomainUsage', {
          sessionId: session.id, checkpointSystemId: cpId, domainKeysSnapshot,
        });

        for (const participant of participants) {
          const pUserId = normalizeId(participant?.userId);
          if (!pUserId || participant?.isOrganizer) continue;
          try {
            await base44.functions.invoke('commitParticipantUsage', {
              sessionId: session.id, checkpointSystemId: cpId,
              participant, domainKeysSnapshot,
            });
          } catch (e) {
            console.warn(`commitParticipantUsage failed for ${pUserId}:`, e?.message);
          }
        }
      } catch (statsErr) {
        console.warn('Stats commit failed (non-fatal):', statsErr?.message);
      }
    }

    // ── Fermer l'Event ────────────────────────────────────────────────────
    if (session.eventId) {
      try {
        await serviceRole.entities.Event.update(session.eventId, {
          status: 'completed', completedAt: nowIso,
        });

        // ── Créer l'EventPayout avec triggerDate +24h ─────────────────────
        try {
          const eventData = await serviceRole.entities.Event.filter({ id: session.eventId });
          const ev = eventData?.[0];
          const existingPayouts = await serviceRole.entities.EventPayout.filter({ eventId: session.eventId });
          if (ev && (!existingPayouts || existingPayouts.length === 0)) {
            const triggerDate = new Date(new Date(nowIso).getTime() + 24 * 60 * 60 * 1000).toISOString();
            await serviceRole.entities.EventPayout.create({
              eventId: session.eventId,
              totalGrossAmount: Number(ev.priceTotal) || Number(ev.budget) || 0,
              status: 'pending',
              triggerDate,
              createdAt: nowIso,
              updatedAt: nowIso,
            });
            console.log(`[completeEventSession] EventPayout créé pour eventId=${session.eventId} triggerDate=${triggerDate}`);
          }
        } catch (payoutErr) {
          console.warn('[completeEventSession] EventPayout creation failed (non-fatal):', payoutErr?.message);
        }

      } catch (e) { console.warn('Could not close Event:', e?.message); }
    }


    // ── Auto-close intelligent des SessionPresence actives ───────────────────
    // Problème : si completeEventSession est appelé avant que tous les talents
    // aient fait leur check-out manuellement, leurs présences restent status=active
    // avec payoutEligible=false — ils ne sont jamais payés même s'ils étaient là.
    //
    // Règle :
    //   - Présence active avec durationMin >= 30 ET validationScore >= 40
    //     → auto-close avec payoutEligible=true  (talent était là, durée suffisante)
    //   - Présence active avec durationMin < 30 OU validationScore < 40
    //     → auto-close avec payoutEligible=false  (durée insuffisante ou absent)
    //
    // La durée est calculée depuis checkInAt si durationMin n'est pas encore écrit.
    if (session.eventId || sessionId) {
      try {
        const activePresences = await serviceRole.entities.SessionPresence.filter({
          sessionId,
          status: 'active',
        }).catch(() => []);

        const nowMs = Date.now();
        let autoClosedCount = 0;
        let autoEligibleCount = 0;

        for (const presence of (activePresences || [])) {
          // Calculer la durée réelle si durationMin pas encore écrit
          let durationMin = Number(presence.durationMin) || 0;
          if (durationMin === 0 && presence.checkInAt) {
            durationMin = Math.round((nowMs - new Date(presence.checkInAt).getTime()) / 60000);
          }

          const validationScore = Number(presence.validationScore) || 0;

          // Règle d'éligibilité : 30 min minimum ET score >= 40 (GPS partiel accepté)
          const eligible = durationMin >= 30 && validationScore >= 40;

          await serviceRole.entities.SessionPresence.update(presence.id, {
            status:          'auto_closed',
            checkOutAt:      nowIso,
            durationMin,
            payoutEligible:  eligible,
            autoClosedAt:    nowIso,
            autoClosedBy:    'completeEventSession',
          }).catch(e => console.warn('[autoClose] update failed:', e?.message));

          autoClosedCount++;
          if (eligible) autoEligibleCount++;
        }

        if (autoClosedCount > 0) {
          console.log(
            `[completeEventSession] AUTO_CLOSE_PRESENCES sessionId=${sessionId}` +
            ` closed=${autoClosedCount} eligible=${autoEligibleCount}`
          );
        }
      } catch (presenceErr) {
        console.warn('[completeEventSession] auto-close presences failed (non-fatal):', presenceErr?.message);
      }
    }

    await serviceRole.entities.Session.update(sessionId, update);

    console.log(JSON.stringify({ action: 'COMPLETE_SESSION', sessionId, cpId }));
    return json(200, { ok: true, sessionId, status: 'completed' });

  } catch (err) {
    console.error('completeEventSession error:', err);
    return json(500, { ok: false, code: 'TRANSITION_FAILED', error: err?.message || 'Erreur interne' });
  }
});