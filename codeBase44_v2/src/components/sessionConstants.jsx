/**
 * SESSION CONSTANTS & INVARIANTS
 * Source unique de vérité pour les états de session
 */

export const SESSION_STATUS = {
  IDLE: 'idle',
  QUEUEING: 'queueing',
  MATCHED: 'matched',
  LOBBY: 'lobby',
  READY: 'ready',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  ABORTED: 'aborted',
  SOTS_SUBMITTED: 'sots_submitted',
  ARCHIVED: 'archived'
};

export const SESSION_STATUS_ARRAY = Object.values(SESSION_STATUS);

// États où SOTS peut être soumis
export const SOTS_VALID_STATES = [
  SESSION_STATUS.COMPLETED,
  SESSION_STATUS.ABORTED
];

// États nécessitant un polling actif
export const POLLING_STATES = [
  SESSION_STATUS.QUEUEING,
  SESSION_STATUS.MATCHED,
  SESSION_STATUS.LOBBY,
  SESSION_STATUS.READY,
  SESSION_STATUS.IN_PROGRESS
];

// États terminaux (pas de retour en arrière)
export const TERMINAL_STATES = [
  SESSION_STATUS.SOTS_SUBMITTED,
  SESSION_STATUS.ARCHIVED
];

/**
 * INVARIANTS SYSTÈME
 * Ces règles DOIVENT être respectées partout
 */
export const INVARIANTS = {
  // Jouer ne crée jamais d'objets durables (Style/Role/Checkpoint)
  NO_DURABLE_CREATION_FROM_PLAY: true,
  
  // SOTS nécessite session terminée (completed/aborted)
  SOTS_REQUIRES_TERMINAL_SESSION: true,
  
  // Ready nécessite au moins 1 Role et 1 Style actif
  READY_REQUIRES_ROLE_AND_STYLE: true,
  
  // Une session ne peut pas avoir d'états divergents UI/backend
  ENFORCE_STATE_CONSISTENCY: true
};