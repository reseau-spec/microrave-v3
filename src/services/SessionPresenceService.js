/**
 * MICRO RAVE V3 — SessionPresenceService
 * ============================================================
 * Service de gestion de la présence physique du talent.
 *
 * Source : D-093 · D-093-A · Fiche D BLOQUANT-D2 · Plan Phase 1.1
 *
 * PROBLÈME RÉSOLU (Phase 1.1) :
 *   PresenceWindowGuard vérifie l'existence d'un sessionPresenceId.
 *   PresenceProofGuard vérifie GPS + durée depuis le record.
 *   Aucun service ne créait la SessionPresence en base —
 *   le talent n'avait nulle part dans le code pour déclencher son check-in.
 *
 * RESPONSABILITÉS :
 *   create()           → check-in talent (bouton "Je suis arrivé")
 *   recordCheckout()   → enregistre la durée réelle à la fin du set
 *   getByEngagementId() → lit le record pour le contexte des guards
 *
 * CE SERVICE NE CONTIENT AUCUNE LOGIQUE DE VALIDATION DE PRÉSENCE.
 *   La validation (GPS, durée, fenêtre) est dans PresenceProofGuard.
 *   Ce service est de la persistence, pas un guard.
 *
 * Préfixe IDFactory : SPR-*
 * Source : IDFactory.PREFIXES.SessionPresence = 'SPR'
 * ============================================================
 */

'use strict';

const IDFactory = require('../core/IDFactory');

/**
 * Crée une SessionPresence (check-in talent).
 * Appelé depuis le bouton "Je suis arrivé" dans l'interface talent.
 *
 * @param {object} params
 * @param {string}   params.engagementId    — ENG-* obligatoire
 * @param {string}   params.talentUserId    — USR-* obligatoire
 * @param {object}   [params.gpsCoordinates] — { lat, lng, accuracyMeters }
 * @param {string[]} [params.signalTypes]   — ['GPS', 'WIFI', 'MANUAL']
 * @param {object}   params.repositories
 * @param {object}     params.repositories.sessionPresence — SessionPresenceRepository
 *
 * @returns {Promise<{ systemId: string, createdAt: string }>}
 */
async function create({ engagementId, talentUserId, gpsCoordinates, signalTypes, repositories }) {
  // ── Validations fail-closed ──────────────────────────────
  if (!engagementId) {
    throw new Error(
      'SESSION_PRESENCE_ERROR: engagementId obligatoire. ' +
      'Source : D-093 — la SessionPresence est liée à un Engagement précis.'
    );
  }
  if (!talentUserId) {
    throw new Error(
      'SESSION_PRESENCE_ERROR: talentUserId obligatoire. ' +
      'Source : D-093 — la présence est prouvée par talent, pas par event.'
    );
  }
  if (!repositories || !repositories.sessionPresence) {
    throw new Error(
      'SESSION_PRESENCE_ERROR: repositories.sessionPresence obligatoire. ' +
      'Fournir une instance de SessionPresenceRepository.'
    );
  }

  // ── Génération du systemId souverain ─────────────────────
  // Source : IDFactory.PREFIXES.SessionPresence = 'SPR' · D-127
  const systemId   = IDFactory.generate('SessionPresence');
  const createdAt  = new Date().toISOString();
  const checkInAt  = Date.now();

  // ── Persistence via repository ───────────────────────────
  // Ce service ne touche pas Base44 directement — pattern D-128.
  await repositories.sessionPresence.create({
    systemId,
    engagementId,
    talentUserId,
    checkInAt,
    gpsCoordinates:  gpsCoordinates  || null,
    signalTypes:     signalTypes     || ['MANUAL'],
    createdAt,
  });

  return { systemId, createdAt };
}

/**
 * Enregistre le check-out et la durée finale du set.
 * Appelé à la fin du set talent.
 *
 * @param {object} params
 * @param {string}  params.sessionPresenceId    — SPR-* (base44 id ou systemId selon impl.)
 * @param {string}  params.engagementId         — ENG-* (pour traçabilité)
 * @param {string}  [params.checkoutAt]         — ISO timestamp (défaut : maintenant)
 * @param {number}  params.finalDurationMinutes — entier ≥ 0, minutes de présence réelle
 * @param {object}  params.repositories
 * @param {object}    params.repositories.sessionPresence — SessionPresenceRepository
 */
async function recordCheckout({ sessionPresenceId, engagementId, checkoutAt, finalDurationMinutes, repositories }) {
  if (!sessionPresenceId) {
    throw new Error('SESSION_PRESENCE_ERROR: sessionPresenceId obligatoire pour recordCheckout().');
  }
  if (!repositories || !repositories.sessionPresence) {
    throw new Error('SESSION_PRESENCE_ERROR: repositories.sessionPresence obligatoire.');
  }

  // ── Validation finalDurationMinutes — D-064 (entier, jamais float) ──
  if (!Number.isInteger(finalDurationMinutes)) {
    throw new Error(
      `SESSION_PRESENCE_ERROR: finalDurationMinutes doit être un entier. ` +
      `Reçu : ${finalDurationMinutes} (${typeof finalDurationMinutes}). ` +
      `Source : D-064 — jamais float pour les durées métier.`
    );
  }
  if (finalDurationMinutes < 0) {
    throw new Error(
      `SESSION_PRESENCE_ERROR: finalDurationMinutes doit être ≥ 0. ` +
      `Reçu : ${finalDurationMinutes}. Une durée négative est impossible.`
    );
  }

  await repositories.sessionPresence.updateCheckout(sessionPresenceId, {
    checkOutAt:           checkoutAt || new Date().toISOString(),
    finalDurationMinutes,
  });
}

/**
 * Retourne la SessionPresence d'un Engagement.
 * Utilisé pour construire le contexte de PresenceWindowGuard et PresenceProofGuard.
 *
 * @param {object} params
 * @param {string}  params.engagementId   — ENG-*
 * @param {object}  params.repositories
 * @param {object}    params.repositories.sessionPresence — SessionPresenceRepository
 *
 * @returns {Promise<object|null>}
 */
async function getByEngagementId({ engagementId, repositories }) {
  if (!engagementId) {
    throw new Error('SESSION_PRESENCE_ERROR: engagementId obligatoire pour getByEngagementId().');
  }
  if (!repositories || !repositories.sessionPresence) {
    throw new Error('SESSION_PRESENCE_ERROR: repositories.sessionPresence obligatoire.');
  }
  return repositories.sessionPresence.findByEngagementId(engagementId);
}

module.exports = { create, recordCheckout, getByEngagementId };