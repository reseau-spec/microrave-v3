// deploy: v2
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function asString(v) {
  if (!v) return null;
  if (typeof v === 'string') return v;
  if (typeof v === 'object') return v.id || v._id || v.systemId || v.value || null;
  return null;
}

// ÉTAPE 0: normalizeParticipants — supports array, JSON string, array of strings
function normalizeArray(v) {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string') { try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch { return []; } }
  return [];
}

function normalizeParticipants(raw) {
  const arr = normalizeArray(raw);
  return arr.map(p => {
    if (typeof p === 'string') return { userId: p };
    return p;
  });
}

Deno.serve(async (req) => {
  const startedAt = Date.now();

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) {
      return json(401, { ok: false, code: 'UNAUTHORIZED', error: 'Utilisateur non authentifié' });
    }

    const body = await req.json().catch(() => ({}));
    const sessionId = asString(body.sessionId) || asString(body.sessionSystemId) || asString(body.id);

    if (!sessionId) {
      return json(400, { ok: false, code: 'BAD_REQUEST', error: 'sessionId requis (string)' });
    }

    const service = base44.asServiceRole;
    if (!service) {
      return json(503, { ok: false, code: 'SERVICE_ROLE_UNAVAILABLE', error: 'Service role unavailable' });
    }

    const session = await service.entities.Session.get(sessionId).catch(() => null);

    // ÉTAPE 4: normalize before returning
    if (session) {
      const rawParts = session.participants;
      session.participants = normalizeParticipants(rawParts);
      session.sotsSubmittedBy = normalizeArray(session.sotsSubmittedBy);
      console.log(`[getSession] sessionId=${sessionId} partsType=${typeof rawParts} partsLen=${session.participants.length} status=${session.status}`);
    }

    return json(200, {
      ok: true,
      session: session || null,
      notFound: !session,
      lookup: sessionId,
      ms: Date.now() - startedAt,
    });
  } catch (err) {
    return json(200, {
      ok: false,
      code: 'INTERNAL_ERROR',
      error: String(err?.message || err),
      ms: Date.now() - startedAt,
    });
  }
});