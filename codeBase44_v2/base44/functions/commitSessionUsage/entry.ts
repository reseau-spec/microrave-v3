// deploy: v3
/**
 * commitSessionUsage — WRAPPER rétrocompat.
 * Délègue à:
 *   - commitCheckpointDomainUsage (1x) pour DomainLedger/Stats/Ranking
 *   - commitParticipantUsage (Nx) pour UserStats/RoleStats/StyleStats
 *
 * NE PAS ajouter de logique DomainStats ici — risque de double comptage.
 */
// deploy: v3
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

function json(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
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
    const { sessionId, checkpointSystemId, domainKeysSnapshot, participants } = body;

    // v3 — accepter tous les domainKey du snapshot (dynamiques, plus de whitelist hardcodée)
    let domainKeys = Array.isArray(domainKeysSnapshot) ? domainKeysSnapshot : [];
    if (domainKeys.length === 0 && body.domainKey) domainKeys = [body.domainKey];
    domainKeys = [...new Set(domainKeys.filter(d => typeof d === 'string' && d.length > 0))];
    // Ne plus forcer 'music' — une session sans domaine identifié a domainKeys=[]
    // commitParticipantUsage gère ce cas avec early return propre

    if (!sessionId) return json(400, { ok: false, error: 'sessionId required' });
    if (!checkpointSystemId) return json(400, { ok: false, error: 'checkpointSystemId required' });

    // Charger session pour récupérer participants si non fournis
    const svc = base44.asServiceRole;
    const sessions = await svc.entities.Session.filter({ id: sessionId });
    const session = sessions?.[0];
    if (!session) return json(404, { ok: false, error: 'Session not found' });

    const sessionParticipants = Array.isArray(participants) && participants.length > 0
      ? participants
      : (Array.isArray(session.participants) ? session.participants : []);

    // A) Domaine checkpoint — UNE SEULE FOIS
    await base44.functions.invoke('commitCheckpointDomainUsage', {
      sessionId,
      checkpointSystemId,
      domainKeysSnapshot: domainKeys
    });

    // B) Par participant — N fois, mais JAMAIS en boucle domainKey x participant
    const results = [];
    for (const participant of sessionParticipants) {
      const uid = normalizeId(participant?.userId || participant?.id || participant);
      if (!uid) continue;
      const result = await base44.functions.invoke('commitParticipantUsage', {
        sessionId,
        checkpointSystemId,
        participant,
        domainKeysSnapshot: domainKeys
      });
      results.push({ userId: uid, ok: result?.data?.ok });
    }

    return json(200, { ok: true, domainsCommitted: domainKeys, participantsProcessed: results.length });

  } catch (err) {
    console.error('[commitSessionUsage] Wrapper error:', err);
    return json(500, { ok: false, error: err.message });
  }
});