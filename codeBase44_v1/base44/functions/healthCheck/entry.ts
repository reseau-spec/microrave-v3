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
    const user = await base44.auth.me().catch(() => null);
    if (!user) return new Response(JSON.stringify({ ok: false, code: 'UNAUTHENTICATED' }), { status: 401, headers: { 'content-type': 'application/json' } });

    const serviceRole = base44.asServiceRole;
    if (!serviceRole) return new Response(JSON.stringify({ ok: false, code: 'SERVICE_ROLE_UNAVAILABLE' }), { status: 503, headers: { 'content-type': 'application/json' } });

    const checks = {
      timestamp: new Date().toISOString(),
      checks: {}
    };

    // Check 1: Sessions complétées trop vieilles (>72h)
    const completedSessions = await serviceRole.entities.Session.filter({
      status: 'completed'
    });

    const now = Date.now();
    const threshold = 72 * 60 * 60 * 1000;
    const staleSessions = completedSessions.filter(s => {
      const completedAt = s.actualEndAt || s.updated_date;
      if (!completedAt) return false;
      const age = now - new Date(completedAt).getTime();
      return age > threshold;
    });

    checks.checks.staleSessions = {
      pass: staleSessions.length === 0,
      count: staleSessions.length,
      message: staleSessions.length === 0 ? 'OK' : `${staleSessions.length} sessions completed >72h`
    };

    // Check 2: Cohérence sotsSubmittedBy vs participants[].sotsSubmitted
    const allSessions = await serviceRole.entities.Session.filter({
      status: { $in: ['completed', 'aborted', 'sots_submitted', 'archived'] }
    });

    let inconsistentCount = 0;
    for (const session of allSessions) {
      const sotsSubmittedBy = asArray(session.sotsSubmittedBy, []);
      const participants = asArray(session.participants, []);
      
      for (const userId of sotsSubmittedBy) {
        const p = participants.find(p => p?.userId === userId);
        if (p && !p.sotsSubmitted) {
          inconsistentCount++;
          break;
        }
      }
    }

    checks.checks.sotsConsistency = {
      pass: inconsistentCount === 0,
      count: inconsistentCount,
      message: inconsistentCount === 0 ? 'OK' : `${inconsistentCount} sessions avec flags incohérents`
    };

    // Check 3: Sessions en queueing trop longues (>15min)
    const queueingSessions = await serviceRole.entities.Session.filter({
      status: 'queueing'
    });

    const queueThreshold = 15 * 60 * 1000;
    const stuckInQueue = queueingSessions.filter(s => {
      const created = new Date(s.created_date).getTime();
      return now - created > queueThreshold;
    });

    checks.checks.queueingTimeout = {
      pass: stuckInQueue.length === 0,
      count: stuckInQueue.length,
      message: stuckInQueue.length === 0 ? 'OK' : `${stuckInQueue.length} sessions en queueing >15min`
    };

    // Résumé global
    const allPassed = Object.values(checks.checks).every(c => c.pass);
    checks.status = allPassed ? 'healthy' : 'degraded';

    return new Response(
      JSON.stringify(checks),
      { 
        status: 200, // toujours 200 — degraded est dans body.status 
        headers: { 'Content-Type': 'application/json' } 
      }
    );
  } catch (error) {
    console.error('healthCheck error:', error);
    return new Response(
      JSON.stringify({ 
        status: 'error', 
        error: error.message,
        timestamp: new Date().toISOString()
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});