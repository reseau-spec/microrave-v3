/**
 * MICRO RAVE V3 — IDFactory
 * ============================================================
 * Génère les systemId portables pour tous les objets du système.
 *
 * RÈGLE ABSOLUE :
 * - Le systemId est généré ICI, avant toute insertion en database.
 * - Le Base44 id n'est JAMAIS un identifiant métier souverain.
 * - Le systemId est immuable une fois créé.
 * - Format : PREFIX-TIMESTAMP_BASE36-RANDOM_6CHARS
 *   Exemple : EVT-M5KQZA-3F9X2B
 * ============================================================
 */

const PREFIXES = {
  Event:               'EVT',
  Engagement:          'ENG',
  EngagementCollectif: 'EGC',
  MissionSlot:         'MSL',
  MissionApplication:  'MAP',
  MissionProposal:     'MPR',
  ContractSnapshot:    'CSN',
  Lobby:               'LBY',
  User:                'USR',
  Talent:              'TAL',
  Checkpoint:          'CKP',
  EventLocation:       'EVL',
  LedgerEntry:         'LDG',
  TransactionGroup:    'TXG',  // D-038 — lie les lignes DR+CR d'une même transaction comptable
  PayoutExecution:     'PAY',
  DisputeRecord:       'DSP',
  AdminAction:         'ADM',
  PolicyConfig:        'PCF',
  TalentRolePreference:'TRP',
  SchedulerDueTask:    'SCH',
  EngagementAmendment: 'AMD',  // D-147 — Amendment durée accord mutuel
  SessionPresence:     'SPR',
  ContractSnapshotV1:  'CS1',  // Phase 1 WORM (accepted)
  ContractSnapshotV2:  'CS2',  // Phase 2 WORM (event_sealed)
  SOTSRecord:          'SOT',
  ReputationEntry:     'REP',
  WebhookRecord:       'WHK',
  IdMapping:           'IDM',
  CancellationRecord:  'CXL',  // Phase 2.3 -- D-039/D-040 LOI ANNULATION-01/02
};

/**
 * Génère un systemId unique pour un type d'entité donné.
 * @param {string} entityType - doit être une clé de PREFIXES
 * @returns {string} systemId — ex: EVT-M5KQZA-3F9X2B
 */
function generate(entityType) {
  const prefix = PREFIXES[entityType];

  if (!prefix) {
    throw new Error(
      `IDFactory.generate() — type inconnu : "${entityType}". ` +
      `Types valides : ${Object.keys(PREFIXES).join(', ')}`
    );
  }

  // Timestamp en base36 (court, lisible, ordonné dans le temps)
  const timestamp = Date.now().toString(36).toUpperCase();

  // 6 caractères aléatoires en base36
  const random = Math.random().toString(36).slice(2, 8).toUpperCase().padEnd(6, '0');

  return `${prefix}-${timestamp}-${random}`;
}

/**
 * Vérifie qu'un systemId a le bon format pour un type donné.
 * Utile pour valider les données entrantes.
 */
function validate(systemId, entityType) {
  if (!systemId || typeof systemId !== 'string') return false;
  const prefix = PREFIXES[entityType];
  if (!prefix) return false;
  return systemId.startsWith(`${prefix}-`);
}

/**
 * Extrait le type d'entité depuis un systemId.
 * @returns {string|null} entityType ou null si format invalide
 */
function getType(systemId) {
  if (!systemId || typeof systemId !== 'string') return null;
  const prefix = systemId.split('-')[0];
  const entry = Object.entries(PREFIXES).find(([, v]) => v === prefix);
  return entry ? entry[0] : null;
}

module.exports = { generate, validate, getType, PREFIXES };