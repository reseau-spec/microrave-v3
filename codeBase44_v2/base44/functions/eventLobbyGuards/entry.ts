/**
 * eventLobbyGuards.js
 * Garde-fous "Méthode propre" — exported helpers.
 * Empêche la contamination entre QuickPlay et Event lobby.
 *
 * Usage:
 *   import { assertQuickplayLobbyIsReadyCheckOnly, assertEventLobbyAllowsOrganizerControl } from './eventLobbyGuards.js';
 */

/**
 * assertQuickplayLobbyIsReadyCheckOnly(session)
 * Empêche toute écriture slot/confirm sur quickplay.
 * @throws si la session est quickplay et qu'une opération slot est tentée
 */
export function assertQuickplayLobbyIsReadyCheckOnly(session) {
  if (!session) return;
  const qpTypes = ['quickplay', 'event_gig', 'jam', 'stream'];
  if (qpTypes.includes(session.sessionType)) {
    const err = new Error(
      `Slot operations are forbidden on sessionType="${session.sessionType}". ` +
      `Only sessionType="event" supports slots/confirm. ` +
      `QuickPlay uses ready-check flow only.`
    );
    err.code = 'QUICKPLAY_SLOT_FORBIDDEN';
    err.sessionType = session.sessionType;
    throw err;
  }
}

/**
 * assertEventLobbyAllowsOrganizerControl(session)
 * Interdit la logique ready-check/captain sur un event lobby.
 * @throws si on essaie d'utiliser SET_READY / captain logic sur un event session
 */
export function assertEventLobbyAllowsOrganizerControl(session) {
  if (!session) return;
  if (session.sessionType === 'event') {
    // L'event lobby est contrôlé par l'organisateur, pas par ready-check.
    // Cette fonction est appelée dans transitionSession avant les actions quickplay-only.
    const err = new Error(
      `Event lobby sessions (sessionType="event") do not support ready-check / captain flow. ` +
      `Use confirmSlot / unconfirmSlot instead.`
    );
    err.code = 'EVENT_LOBBY_NO_READY_CHECK';
    err.sessionType = session.sessionType;
    throw err;
  }
}