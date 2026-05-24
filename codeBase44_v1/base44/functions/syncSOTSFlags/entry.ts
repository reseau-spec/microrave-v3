// deploy: v2
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

function asArray(value, fallback = []) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch { return fallback; }
  }
  return fallback;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return new Response(
        JSON.stringify({ ok: false, error: 'Admin access required' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const serviceRole = base44.asServiceRole;

    const sessions = await serviceRole.entities.Session.filter({
      status: { $in: ['completed', 'aborted', 'sots_submitted', 'archived'] }
    });

    let syncedCount = 0;

    for (const session of sessions) {
      const sotsSubmittedBy = asArray(session.sotsSubmittedBy, []);
      if (sotsSubmittedBy.length === 0) continue;

      const participants = asArray(session.participants, []);
      let needsUpdate = false;

      const updatedParticipants = participants.map(p => {
        if (sotsSubmittedBy.includes(p?.userId) && !p?.sotsSubmitted) {
          needsUpdate = true;
          return { ...p, sotsSubmitted: true };
        }
        return p;
      });

      if (needsUpdate) {
        await serviceRole.entities.Session.update(session.id, {
          participants: updatedParticipants
        });
        syncedCount++;

        console.log(JSON.stringify({
          action: 'syncSOTSFlags',
          sessionId: session.id,
          synced: true,
          timestamp: new Date().toISOString()
        }));
      }
    }

    return new Response(
      JSON.stringify({ ok: true, syncedCount }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('syncSOTSFlags error:', error);
    return new Response(
      JSON.stringify({ ok: false, error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});