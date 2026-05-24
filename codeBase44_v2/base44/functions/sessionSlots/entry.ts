/**
 * sessionSlots.js
 * Utilitaires pour la gestion des slots de session event (multi-rôle).
 * Ces helpers sont UNIQUEMENT utilisés pour sessionType === "event".
 * QuickPlay n'est jamais concerné.
 *
 * Méthode propre: chaque fonction a une responsabilité unique et échoue
 * de façon prévisible plutôt que silencieusement.
 */

/**
 * @typedef {Object} SessionSlot
 * @property {string} slotId
 * @property {string} roleSystemId
 * @property {"open"|"pending"|"confirmed"} status
 * @property {string|null} candidateUserId
 * @property {string[]} candidateStyleSystemIds
 * @property {string|null} confirmedAt
 * @property {string|null} confirmedBy
 */

const VALID_STATUSES = ['open', 'pending', 'confirmed'];

/**
 * dedupeSlotsById(slots) — supprime les duplicates de slotId (garde la 1ère occurrence).
 * Retourne { slots, duplicates } pour permettre au caller de logger les warnings.
 * @param {SessionSlot[]} slots  (déjà filtrés/valides)
 * @returns {{ slots: SessionSlot[], duplicates: number }}
 */
export function dedupeSlotsById(slots) {
  const seen = new Set();
  let duplicates = 0;
  const deduped = [];
  for (const slot of slots) {
    if (seen.has(slot.slotId)) {
      // Duplicate détecté — on ignore l'entrée redondante
      duplicates++;
      console.warn(`[sessionSlots] duplicate slotId ignored: "${slot.slotId}"`);
    } else {
      seen.add(slot.slotId);
      deduped.push(slot);
    }
  }
  return { slots: deduped, duplicates };
}

/**
 * normalizeSlots(input) — retourne toujours un tableau safe de SessionSlot.
 *
 * Garanties (Méthode propre — production-grade):
 * 1. null / undefined / non-array => []
 * 2. Entrées non-objet => discardées
 * 3. slotId: doit être string trim() non vide, sinon discard
 * 4. roleSystemId: doit être string trim() non vide, sinon discard
 * 5. status: si hors enum => "open" (safe default)
 * 6. candidateUserId: si pas string non vide => null
 * 7. candidateStyleSystemIds: si pas array de strings => []
 * 8. confirmedAt / confirmedBy: si pas string => null
 * 9. Unicité slotId: les duplicates sont supprimés (première occurrence gagnante)
 *
 * @param {unknown} input
 * @returns {SessionSlot[]}
 */
export function normalizeSlots(input) {
  if (!input || !Array.isArray(input)) return [];

  const valid = [];
  for (const s of input) {
    // Doit être un objet
    if (!s || typeof s !== 'object') continue;

    // slotId: string trim non vide
    const slotId = typeof s.slotId === 'string' ? s.slotId.trim() : '';
    if (!slotId) continue;

    // roleSystemId: string trim non vide
    const roleSystemId = typeof s.roleSystemId === 'string' ? s.roleSystemId.trim() : '';
    if (!roleSystemId) continue;

    // status: enum guard
    const status = VALID_STATUSES.includes(s.status) ? s.status : 'open';

    // candidateUserId: string non vide ou null
    const candidateUserId =
      typeof s.candidateUserId === 'string' && s.candidateUserId.trim()
        ? s.candidateUserId
        : null;

    // candidateStyleSystemIds: array de strings non vides
    const candidateStyleSystemIds = Array.isArray(s.candidateStyleSystemIds)
      ? s.candidateStyleSystemIds.filter(x => typeof x === 'string' && x.trim())
      : [];

    // confirmedAt / confirmedBy: string ou null
    const confirmedAt = typeof s.confirmedAt === 'string' ? s.confirmedAt : null;
    const confirmedBy = typeof s.confirmedBy === 'string' ? s.confirmedBy : null;

    valid.push({ slotId, roleSystemId, status, candidateUserId, candidateStyleSystemIds, confirmedAt, confirmedBy });
  }

  // Unicité slotId — la première occurrence gagne
  const { slots } = dedupeSlotsById(valid);
  return slots;
}

/**
 * findSlot(slots, slotId) — cherche un slot par slotId.
 * @param {SessionSlot[]} slots
 * @param {string} slotId
 * @returns {{ slot: SessionSlot, index: number }}
 * @throws si introuvable
 */
export function findSlot(slots, slotId) {
  const index = slots.findIndex(s => s.slotId === slotId);
  if (index === -1) {
    const err = new Error(`Slot not found: ${slotId}`);
    err.code = 'SLOT_NOT_FOUND';
    err.slotId = slotId;
    throw err;
  }
  return { slot: slots[index], index };
}

/**
 * assertSlotState(slot, allowed, context?) — vérifie l'état d'un slot.
 * @param {SessionSlot} slot
 * @param {Array<"open"|"pending"|"confirmed">} allowed
 * @param {string} [context]
 * @throws si status non autorisé
 */
export function assertSlotState(slot, allowed, context) {
  if (!allowed.includes(slot.status)) {
    const err = new Error(
      `Invalid slot state for slot "${slot.slotId}": ` +
      `current="${slot.status}", allowed=[${allowed.join(',')}]` +
      (context ? ` (context: ${context})` : '')
    );
    err.code = 'INVALID_SLOT_STATE';
    err.slotId = slot.slotId;
    err.currentStatus = slot.status;
    err.allowedStates = allowed;
    throw err;
  }
}

/**
 * buildSlotsFromRolesNeeded(sessionId, rolesNeeded) — génère les slots initiaux.
 * slotId est STABLE: dépend uniquement de sessionId + index.
 * @param {string} sessionId
 * @param {string[]} rolesNeeded
 * @returns {SessionSlot[]}
 */
export function buildSlotsFromRolesNeeded(sessionId, rolesNeeded) {
  if (!Array.isArray(rolesNeeded) || rolesNeeded.length === 0) return [];

  return rolesNeeded.map((roleSystemId, index) => ({
    slotId:                  `SL-${sessionId}-${index}`,
    roleSystemId,
    status:                  'open',
    candidateUserId:         null,
    candidateStyleSystemIds: [],
    confirmedAt:             null,
    confirmedBy:             null,
  }));
}