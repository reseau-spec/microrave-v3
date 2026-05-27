/**
 * MICRO RAVE V3 — Base44 Repositories Adapter (Deno runtime)
 * ============================================================
 * PORT-2 — créé le 27 mai 2026
 *
 * Source : D-001 (Souveraineté) · STATE.md V2 SECTION 2 · OS V15
 * Prérequis : PORT-1 (ESM global) + PORT-1b (split LedgerRepository)
 *
 * RÔLE :
 *   Transforme le SDK Base44 (base44.entities.X — disponible côté
 *   Deno via le context d'une fonction Base44) en l'objet
 *   `repositories` attendu par les guards et services canoniques
 *   de src/core/ et src/services/.
 *
 *   Ce fichier rend POSSIBLE la Règle 9 ("zéro logique métier dans
 *   les fonctions Base44") : chaque fonction Base44 peut désormais
 *   importer src/core/transitionEngagement.js et l'appeler avec
 *   le résultat de createBase44Repositories(base44).
 *
 * BARRIÈRE LOI TRANSITION-01 :
 *   repositories.engagements.updateStatus() lance physiquement une
 *   Error. Toute fonction Base44 qui tenterait de muter un status
 *   d'engagement hors de transitionEngagement() est arrêtée par le
 *   moteur lui-même, pas par un commentaire. C'est exactement le
 *   contraire d'un bypass : c'est un mur d'enceinte.
 *
 * DUALITÉ DOCUMENTÉE (DETTE-PORT-002) :
 *   Il existe deux adaptateurs Base44 dans le repo :
 *     1. src/repositories/index.js — adapteur Node HTTP, utilisé
 *        par les scripts/, les tests P0 Node, et le webhook proxy.
 *        Communique avec Base44 via fetch() vers l'API REST.
 *     2. CE FICHIER — adapteur Deno, utilisé par les fonctions
 *        Base44 déployées (codeBase44_v3/base44/functions/).
 *        Reçoit `base44` injecté par le runtime, n'utilise pas fetch.
 *   Ces deux adapteurs EXPOSENT LA MÊME INTERFACE. La logique
 *   métier qu'ils servent (src/core/, src/services/) ne sait pas
 *   et n'a pas à savoir lequel l'appelle. C'est le sens technique
 *   de "src/ fait loi".
 *
 * EXTENSION FUTURE :
 *   Cet adapteur est volontairement permissif sur les schémas —
 *   il transmet `data` à base44.entities.X.create() sans validation
 *   stricte. La validation est dans les guards canoniques (src/),
 *   pas ici. Si une fonction Base44 essaie d'écrire un LedgerRecord
 *   sans engagementId, c'est LedgerInvariantGuard qui doit l'arrêter,
 *   pas l'adapteur. L'adapteur est un pipe.
 *
 * NOTE TYPESCRIPT :
 *   STATE.md V2 demande un .ts. Le fichier est en .js pour la
 *   cohérence avec PORT-1 (tout le repo Node est .js post-bascule
 *   "type: module"). Deno accepte les deux extensions de façon
 *   identique. Une migration vers .ts est triviale et peut être
 *   faite quand l'écosystème Deno du projet le justifiera.
 * ============================================================
 */

'use strict';

/**
 * Crée l'objet `repositories` attendu par les guards canoniques
 * à partir du SDK Base44 injecté dans le context Deno.
 *
 * @param {object} base44 - Le SDK Base44 (depuis `context.base44`
 *                          dans une fonction Base44 Deno).
 * @returns {object} L'interface repositories complète.
 *
 * @example
 *   // Dans une fonction Base44 (Deno) :
 *   import { transitionEngagement } from '../../../src/core/transitionEngagement.js';
 *   import { createBase44Repositories } from '../../../src/repositories/adapters/base44-adapter.js';
 *
 *   export default async function handler(req, { base44, auth }) {
 *     const { engagementId, targetState } = await req.json();
 *     const me = auth.me();
 *     const repos = createBase44Repositories(base44);
 *     const eng = (await base44.entities.Engagement.filter({ systemId: engagementId }))[0];
 *     const result = await transitionEngagement(eng, repos, {
 *       actorId: me.id, actorRole: me.role, targetState
 *     });
 *     return new Response(JSON.stringify(result), { status: result.ok ? 200 : 422 });
 *   }
 */
export function createBase44Repositories(base44) {
  if (!base44 || !base44.entities) {
    throw new Error(
      'BASE44_ADAPTER_ERROR: base44.entities absent. ' +
      'Cet adaptateur s\'attend à recevoir le SDK Base44 ' +
      'depuis le context Deno (context.base44).'
    );
  }

  const E = base44.entities;
  const nowIso = () => new Date().toISOString();
  const first = (arr) => (Array.isArray(arr) && arr.length > 0 ? arr[0] : null);

  return {
    // ── Engagements ──────────────────────────────────────────
    // updateStatus() est physiquement interdit : la barrière
    // LOI TRANSITION-01 vit dans le code, pas dans une convention.
    engagements: {
      findById: async (systemId) => first(await E.Engagement.filter({ systemId })),
      findByEventId: async (eventId) => E.Engagement.filter({ eventId }),
      updateStatus: () => {
        throw new Error(
          'LOI_TRANSITION_01_VIOLATION: mutation directe de Engagement.status interdite. ' +
          'Utiliser transitionEngagement(eng, repositories, context) depuis src/core/.'
        );
      },
      // update() reste autorisé pour des champs non-status (ex. cs2SystemId).
      // C'est un trou nécessaire — TODO PHASE 3 : filtrer les champs autorisés
      // ou imposer un wrapper qui rejette les payloads contenant `status`.
      update: async (id, data) => {
        if (Object.prototype.hasOwnProperty.call(data || {}, 'status')) {
          throw new Error(
            'LOI_TRANSITION_01_VIOLATION: update() ne peut pas modifier status. ' +
            'Utiliser transitionEngagement().'
          );
        }
        return E.Engagement.update(id, data);
      },
    },

    // ── ContractSnapshot (Moment WORM 1 et 2) ────────────────
    contractSnapshots: {
      create: async (data) => E.ContractSnapshot.create({
        ...data,
        createdAt: data.createdAt || nowIso(),
      }),
      findByEngagementId: async (engagementId) =>
        E.ContractSnapshot.filter({ engagementId }),
      findByEngagementIdAndPhase: async (engagementId, phase) =>
        E.ContractSnapshot.filter({ engagementId, phase }),
    },

    // ── LedgerRecord (écritures comptables append-only) ──────
    // Le préfixe LDG-* est généré côté src/ (IDFactory) avant
    // l'appel ici — cet adaptateur ne génère rien, c'est un pipe.
    ledgerRecords: {
      append: async (data) => E.LedgerRecord.create({
        ...data,
        createdAt: data.createdAt || nowIso(),
      }),
      findByEngagementId: async (engagementId) =>
        E.LedgerRecord.filter({ engagementId }),
      findByTransactionGroupId: async (transactionGroupId) =>
        E.LedgerRecord.filter({ transactionGroupId }),
      findByEventId: async (eventId) =>
        E.LedgerRecord.filter({ eventId }),
    },

    // ── LedgerRecordStatusHistory (D-060-E reversal traceability) ─
    ledgerRecordStatusHistory: {
      append: async (data) => E.LedgerRecordStatusHistory.create({
        ...data,
        createdAt: data.createdAt || nowIso(),
      }),
    },

    // ── Admin (DAL + Incidents) ──────────────────────────────
    // Guard 5 de la chaîne : AuditLogger appelle systématiquement
    // appendToDataAccessLedger à chaque transition réussie.
    admin: {
      appendToDataAccessLedger: async (data) => E.DataAccessLedgerEntry.create({
        ...data,
        createdAt: data.createdAt || nowIso(),
      }),
      createAdminIncidentRecord: async (data) => E.AdminIncidentRecord.create({
        ...data,
        createdAt: data.createdAt || nowIso(),
      }),
      createAdminAction: async (data) => E.AdminAction.create({
        ...data,
        createdAt: data.createdAt || nowIso(),
      }),
    },

    // ── Scheduler (D-014-A : tâches J+24h/J+48h) ─────────────
    scheduler: {
      createTask: async (data) => E.SchedulerDueTask.create({
        ...data,
        status: data.status || 'PENDING',
        attemptCount: data.attemptCount ?? 0,
        createdAt: data.createdAt || nowIso(),
      }),
      findDueTasks: async (beforeIso) => {
        // Base44 SDK n'expose pas d'opérateur < en filter — on récupère
        // les pending et filtre côté client. Acceptable car le volume
        // de tâches en attente est petit (dizaines, pas milliers).
        const pending = await E.SchedulerDueTask.filter({ status: 'PENDING' });
        return pending.filter((t) => t.dueAt && t.dueAt <= beforeIso);
      },
      markRunning: async (id, runId) => E.SchedulerDueTask.update(id, {
        status: 'RUNNING',
        lockedByRunId: runId,
        lockedAt: nowIso(),
      }),
      markCompleted: async (id) => E.SchedulerDueTask.update(id, {
        status: 'COMPLETED',
        completedAt: nowIso(),
      }),
      markFailed: async (id, reason) => E.SchedulerDueTask.update(id, {
        status: 'FAILED',
        failureReason: reason,
        attemptCount: (await first(await E.SchedulerDueTask.filter({ id })))?.attemptCount + 1 || 1,
      }),
    },

    // ── PolicyConfig (D-128 fail-closed) ─────────────────────
    // getConfig retourne juste la valeur, pas le record complet.
    // Le getConfigs(keys) en batch est laissé à un appelant qui
    // boucle — Base44 ne supporte pas le filter par tableau de keys.
    policyConfig: {
      getConfig: async (key) => {
        const row = first(await E.PolicyConfig.filter({ key }));
        return row?.value ?? null;
      },
      findByKey: async (key) => first(await E.PolicyConfig.filter({ key })),
    },

    // ── SessionPresence (D-058 GPS Haversine) ────────────────
    sessionPresence: {
      create: async (data) => E.SessionPresence.create({
        ...data,
        createdAt: data.createdAt || nowIso(),
      }),
      findByEngagementId: async (engagementId) =>
        E.SessionPresence.filter({ engagementId }),
      updateCheckout: async (id, data) => E.SessionPresence.update(id, {
        ...data,
        checkOutAt: data.checkOutAt || nowIso(),
      }),
    },

    // ── SOTS (D-019 service-on-time signals) ─────────────────
    sots: {
      create: async (data) => E.SOTSSubmission.create({
        ...data,
        createdAt: data.createdAt || nowIso(),
      }),
      findByEngagementId: async (engagementId) =>
        E.SOTSSubmission.filter({ engagementId }),
      createSnapshot: async (data) => E.SOTSScoreSnapshot.create({
        ...data,
        createdAt: data.createdAt || nowIso(),
      }),
      findSnapshotByEngagementId: async (engagementId) =>
        first(await E.SOTSScoreSnapshot.filter({ engagementId })),
      markConsolidated: async (id) => E.SOTSSubmission.update(id, {
        consolidated: true,
        consolidatedAt: nowIso(),
      }),
    },

    // ── Reputation (D-022 ReputationLedger) ──────────────────
    reputation: {
      append: async (data) => E.ReputationLedger.create({
        ...data,
        createdAt: data.createdAt || nowIso(),
      }),
      findByTalentUserId: async (talentUserId) =>
        E.ReputationLedger.filter({ talentUserId }),
    },

    // ── Membership (D-027 plans + UserMembership) ────────────
    membership: {
      findActiveByUserId: async (userId) => {
        const rows = await E.UserMembership.filter({ userId, status: 'ACTIVE' });
        return first(rows);
      },
      findPlanById: async (planId) => first(await E.MembershipPlan.filter({ systemId: planId })),
    },

    // ── PayoutExecutionRecord (D-101 Verrou 1) ───────────────
    payoutExecutionRecords: {
      create: async (data) => E.PayoutExecutionRecord.create({
        ...data,
        createdAt: data.createdAt || nowIso(),
      }),
      findByEngagementId: async (engagementId, talentUserId) => {
        const filter = talentUserId
          ? { engagementId, talentUserId }
          : { engagementId };
        return first(await E.PayoutExecutionRecord.filter(filter));
      },
    },

    // ── SettlementInstruction (D-101 Verrou 3) ───────────────
    settlementInstructions: {
      create: async (data) => E.SettlementInstruction.create({
        ...data,
        createdAt: data.createdAt || nowIso(),
      }),
      findByEngagementAndTalent: async (engagementId, talentUserId) =>
        first(await E.SettlementInstruction.filter({ engagementId, talentUserId })),
      markConsumed: async (id, data) => E.SettlementInstruction.update(id, {
        consumed: true,
        consumedAt: nowIso(),
        ...data,
      }),
    },

    // ── TalentPaymentProfile (Stripe Connect routing) ────────
    talentPaymentProfiles: {
      findByTalentUserId: async (talentUserId) =>
        first(await E.TalentPaymentProfile.filter({ talentUserId })),
      upsert: async (data) => {
        const existing = first(await E.TalentPaymentProfile.filter({
          talentUserId: data.talentUserId,
        }));
        if (existing) {
          return E.TalentPaymentProfile.update(existing.id, {
            ...data,
            updatedAt: nowIso(),
          });
        }
        return E.TalentPaymentProfile.create({
          ...data,
          createdAt: data.createdAt || nowIso(),
        });
      },
    },

    // ── WebhookProcessedLog (D-097 idempotency) ──────────────
    webhookProcessedLogs: {
      create: async (data) => E.WebhookProcessedLog.create({
        ...data,
        createdAt: data.createdAt || nowIso(),
      }),
      findByEventId: async (stripeEventId) =>
        first(await E.WebhookProcessedLog.filter({ stripeEventId })),
      markCompleted: async (id, data) => E.WebhookProcessedLog.update(id, {
        status: 'COMPLETED',
        completedAt: nowIso(),
        ...data,
      }),
    },

    // ── EngagementAmendment (D-073) ──────────────────────────
    engagementAmendments: {
      create: async (data) => E.EngagementAmendment.create({
        ...data,
        createdAt: data.createdAt || nowIso(),
      }),
    },

    // ── CommercialOperationLock (D-097 idempotency niveau 2) ─
    // Optionnel : selon les guards, peut être implémenté plus tard.
    // Stub minimum pour ne pas casser les imports.
    commercialOperationLock: {
      isActive: async (key) => {
        try {
          const rows = await E.CommercialOperationLock.filter({ key, active: true });
          return rows.length > 0;
        } catch {
          // Entité non encore déployée — comportement par défaut : pas de lock.
          return false;
        }
      },
    },

    // ── KPI Snapshots (lecture seule, optionnel) ─────────────
    kpiSnapshots: {
      getLatest: async (kpiName) => {
        try {
          const rows = await E.KPISnapshot.filter({ kpiName });
          return first(rows.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')));
        } catch {
          return null;
        }
      },
    },
  };
}

// Export default + named pour compat double-pattern PORT-1
export default { createBase44Repositories };
