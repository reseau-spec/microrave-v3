// deploy: v2
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const DONE_STATUSES = ['completed', 'sots_submitted', 'archived'];
const MAX_SESSIONS = 50;

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const targetUserId = body.userId || user.id;

    // Fetch completed sessions server-side (filter by status)
    const sessions = await base44.asServiceRole.entities.Session.filter({
      status: { $in: DONE_STATUSES },
    }, '-created_date', MAX_SESSIONS * 5); // over-fetch to compensate for participant filtering

    // Filter to only sessions where this user is a participant
    const normalizeId = (v) => {
      if (!v) return '';
      if (typeof v === 'string') return v;
      if (typeof v === 'number') return String(v);
      if (typeof v === 'object') return String(v.id || v._id || v.value || '');
      return '';
    };

    const userSessions = (sessions || [])
      .filter(s =>
        Array.isArray(s.participants) &&
        s.participants.some(p => normalizeId(p?.userId) === targetUserId)
      )
      .sort((a, b) =>
        new Date(b.actualEndAt || b.created_date || 0).getTime() -
        new Date(a.actualEndAt || a.created_date || 0).getTime()
      )
      .slice(0, MAX_SESSIONS);

    return Response.json({
      ok: true,
      sessions: userSessions,
      totalFound: userSessions.length,
    });
  } catch (error) {
    console.error('getSessionsForUser error:', error);
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});