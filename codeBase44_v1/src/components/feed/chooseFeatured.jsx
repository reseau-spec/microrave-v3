import { scoreOpenSession } from './feedScoring';

/**
 * chooseFeatured({ rails, affinity, now, userContext, preferredKinds })
 *
 * preferredKinds: array dans l'ordre de rotation, ex:
 * ['session_open', 'talent', 'checkpoint']
 *
 * Retour:
 * { kind: 'session'|'talent'|'checkpoint', item, score, reason, heroKey }
 */
export function chooseFeatured({ rails, affinity, now, userContext, preferredKinds } = {}) {
  if (!rails || !affinity) return null;

  const kinds = Array.isArray(preferredKinds) && preferredKinds.length
    ? preferredKinds
    : ['session_open', 'talent', 'checkpoint'];

  const pickOpenSession = () => {
    if (!rails.openSessions?.length) return null;
    const sorted = [...rails.openSessions].sort(
      (a, b) => scoreOpenSession(b, affinity, now, userContext) - scoreOpenSession(a, affinity, now, userContext)
    );
    const item = sorted[0];
    if (!item) return null;
    return {
      kind: 'session',
      item,
      score: scoreOpenSession(item, affinity, now, userContext),
      reason: 'rotation_session_open',
      heroKey: `hero:session_open:${item.id}`,
    };
  };

  const pickTalent = () => {
    const pool =
      (rails.trending || []).filter(x => x?.type !== 'checkpoint')
      .concat((rails.newItems || []).filter(x => x?.type !== 'checkpoint'));
    if (!pool.length) return null;
    const item = pool[0];
    if (!item) return null;
    return {
      kind: 'talent',
      item,
      score: 1,
      reason: 'rotation_talent',
      heroKey: `hero:talent:${item.id || item.systemId || item.userId}`,
    };
  };

  const pickCheckpoint = () => {
    const pool =
      (rails.trending || []).filter(x => x?.type === 'checkpoint')
      .concat((rails.newItems || []).filter(x => x?.type === 'checkpoint'));
    if (!pool.length) return null;
    const item = pool[0];
    if (!item) return null;
    return {
      kind: 'checkpoint',
      item,
      score: 1,
      reason: 'rotation_checkpoint',
      heroKey: `hero:checkpoint:${item.id || item.systemId}`,
    };
  };

  const pickers = {
    session_open: pickOpenSession,
    talent: pickTalent,
    checkpoint: pickCheckpoint,
  };

  // 1) tenter dans l'ordre demandé
  for (const k of kinds) {
    const res = pickers[k]?.();
    if (res?.item) return res;
  }

  // 2) fallback hard
  return pickOpenSession() || pickTalent() || pickCheckpoint() || null;
}