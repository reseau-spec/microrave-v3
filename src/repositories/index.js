/**
 * MICRO RAVE V3 — src/repositories/index.js
 * ============================================================
 * Point d'entrée unique pour tous les repositories.
 * Utilisé par run-j9-pilot.js, cron.js, et SignalConsumerService.
 *
 * Source : D-128 · Plan Phase 0.4 · 2026-05-21
 *
 * CORRECTION 2026-05-23 — Audit institutionnel Phase 1.2
 * ────────────────────────────────────────────────────────
 * Ajout des 4 interfaces manquantes identifiées par les deux
 * évaluateurs comme BLOQUANT pour le câblage webhook :
 *
 *   1. webhookProcessedLogs   — attendu par WebhookProcessor.js
 *      (findByEventId, create, markCompleted)
 *      Source : Fiche C §3 BLOQUANT · WebhookProcessor.js L.52/73/85/102
 *
 *   2. stripePaymentSignals   — attendu par WebhookProcessor.js
 *      (create)
 *      Source : Fiche C §3 BLOQUANT · WebhookProcessor.js L.159/196
 *
 *   3. talentPaymentProfiles.findByStripeAccountId
 *      — attendu par WebhookProcessor.handleAccountUpdated()
 *      Source : Fiche C §3 BLOQUANT · WebhookProcessor.js L.224
 *
 *   4. talentPaymentProfiles.upsert
 *      — attendu par StripeConnectService L.78/205
 *        et WebhookProcessor.handleAccountUpdated L.245
 *      Source : Fiche C §3 BLOQUANT
 *
 * NOTE sur markCompleted :
 *   WebhookProcessor appelle markCompleted(stripeEventId, data)
 *   mais PaymentRepository.markWebhookCompleted(base44Id, data)
 *   attend un base44Id. L'adaptateur ci-dessous résout la
 *   correspondance stripeEventId → base44Id via findByEventId
 *   avant de passer au PUT.
 *
 * NOTE sur upsert :
 *   StripeConnectService et WebhookProcessor appellent upsert()
 *   qui crée ou met à jour un TalentPaymentProfile. L'adaptateur
 *   résout via findByTalentUserId : si existe → update, sinon → create.
 * ============================================================
 */

'use strict';

const EngagementRepository        = require('./EngagementRepository');
const LedgerRepository             = require('./LedgerRepository');
const PaymentRepository            = require('./PaymentRepository');
const SchedulerRepository          = require('./SchedulerRepository');
const SessionPresenceRepository    = require('./SessionPresenceRepository');
const SOTSRepository               = require('./SOTSRepository');
const ReputationRepository         = require('./ReputationRepository');
const AdminRepository              = require('./AdminRepository');
const ContractSnapshotRepository   = require('./ContractSnapshotRepository');
const MembershipRepository         = require('./MembershipRepository');
const PolicyConfigRepository       = require('./PolicyConfigRepository');

const BASE44_BASE_URL = 'https://futuristic-rave-core-flow.base44.app/api';

function buildHeaders() {
  const apiKey = process.env.BASE44_API_KEY;
  if (!apiKey || apiKey === 'REMPLACER_PAR_API_KEY_BASE44') {
    throw new Error('CONFIG_MISSING: BASE44_API_KEY absent.');
  }
  return { 'Content-Type': 'application/json', 'api_key': apiKey };
}

async function base44Get(path) {
  const res = await fetch(`${BASE44_BASE_URL}${path}`, { headers: buildHeaders() });
  if (!res.ok) { const b = await res.text().catch(() => ''); throw new Error(`BASE44_HTTP_${res.status}: GET ${path} — ${b}`); }
  const json = await res.json();
  return Array.isArray(json) ? json : (json.data || json);
}

async function base44Post(path, data) {
  const res = await fetch(`${BASE44_BASE_URL}${path}`, {
    method: 'POST', headers: buildHeaders(), body: JSON.stringify(data),
  });
  if (!res.ok) { const b = await res.text().catch(() => ''); throw new Error(`BASE44_HTTP_${res.status}: POST ${path} — ${b}`); }
  return res.json();
}

async function base44Put(path, data) {
  const res = await fetch(`${BASE44_BASE_URL}${path}`, {
    method: 'PUT', headers: buildHeaders(), body: JSON.stringify(data),
  });
  if (!res.ok) { const b = await res.text().catch(() => ''); throw new Error(`BASE44_HTTP_${res.status}: PUT ${path} — ${b}`); }
  return res.json();
}

module.exports = {
  // ── Engagement + Event + Lineup ────────────────────────────
  engagements:    EngagementRepository,

  // ── Ledger financier (append-only) ─────────────────────────
  ledger:         LedgerRepository,
  ledgerRecords:  LedgerRepository,  // alias interface PayoutExecutor D-101

  // ── Paiements Stripe ───────────────────────────────────────
  payment:        PaymentRepository,

  // Interface sub-objets attendue par PayoutExecutor D-101
  payoutExecutionRecords:  PaymentRepository.payoutExecutionRecords,
  settlementInstructions: {
    // Adapter les noms : findByEngagementAndTalent = alias de findSettlementInstruction
    findByEngagementAndTalent: (engagementId, talentUserId) =>
      PaymentRepository.findSettlementInstruction(engagementId, talentUserId),
    findSettlementInstruction: PaymentRepository.findSettlementInstruction,
    markConsumed:              PaymentRepository.settlementInstructions.markConsumed,
    create: async (data) => base44Post('/entities/SettlementInstruction', {
      ...data,
      createdAt: data.createdAt || new Date().toISOString(),
    }),
  },

  // ══════════════════════════════════════════════════════════
  // AJOUT Phase 1.2 — webhookProcessedLogs
  // ══════════════════════════════════════════════════════════
  // Attendu par : WebhookProcessor.processWebhook()
  //   - findByEventId(stripeEventId) → L.73
  //   - create(data)                 → L.85
  //   - markCompleted(stripeEventId, data) → L.102
  //
  // PaymentRepository expose :
  //   - findWebhookLogByEventId(stripeEventId) → retourne record ou null
  //   - createWebhookLog(data) → POST /entities/WebhookProcessedLog
  //   - markWebhookCompleted(base44Id, data) → PUT /entities/WebhookProcessedLog/:id
  //
  // ATTENTION signature markCompleted :
  //   WebhookProcessor passe stripeEventId comme premier argument.
  //   PaymentRepository.markWebhookCompleted attend un base44Id.
  //   L'adaptateur résout la correspondance via findWebhookLogByEventId.
  // ──────────────────────────────────────────────────────────
  webhookProcessedLogs: {
    findByEventId: PaymentRepository.findWebhookLogByEventId,

    create: PaymentRepository.createWebhookLog,

    async markCompleted(stripeEventId, updateData) {
      // Résoudre stripeEventId → base44Id
      const record = await PaymentRepository.findWebhookLogByEventId(stripeEventId);
      if (!record || !record.id) {
        throw new Error(
          `WEBHOOK_LOG_NOT_FOUND: Impossible de marquer comme complété — ` +
          `aucun WebhookProcessedLog trouvé pour stripeEventId "${stripeEventId}". ` +
          `Le log doit être créé (étape 3) avant d'être complété (étape 5). ` +
          `Source : D-097 règle 7 — idempotency.`
        );
      }
      return PaymentRepository.markWebhookCompleted(record.id, updateData);
    },
  },

  // ══════════════════════════════════════════════════════════
  // AJOUT Phase 1.2 — stripePaymentSignals
  // ══════════════════════════════════════════════════════════
  // Attendu par : WebhookProcessor.handlePaymentIntentSucceeded() L.159
  //               WebhookProcessor.handlePaymentIntentFailed()    L.196
  //
  // NOTE : WebhookProcessor utilise l'opérateur optionnel (?.)
  //   donc l'absence de cette interface ne crashe pas — mais le
  //   signal est silencieusement perdu, et SignalConsumerService
  //   ne peut jamais consommer le signal pour déclencher la
  //   transition deposit_pending → deposit_secured.
  //   Exposer cette interface rend la chaîne effective.
  //
  // PaymentRepository expose :
  //   - createStripePaymentSignal(data)
  //   - findAllUnprocessedSignals()
  //   - findUnprocessedSignalsByEngagementId(engagementId)
  //   - markSignalConsumed(base44Id, consumedAt)
  // ──────────────────────────────────────────────────────────
  stripePaymentSignals: {
    create:                           PaymentRepository.createStripePaymentSignal,
    findAllUnprocessed:               PaymentRepository.findAllUnprocessedSignals,
    findUnprocessedByEngagementId:    PaymentRepository.findUnprocessedSignalsByEngagementId,
    markConsumed:                     PaymentRepository.markSignalConsumed,
  },

  // ── TalentPaymentProfile (KYC Stripe Connect) ──────────────
  // ══════════════════════════════════════════════════════════
  // CORRECTION Phase 1.2 — ajout findByStripeAccountId + upsert
  // ══════════════════════════════════════════════════════════
  // findByStripeAccountId :
  //   Attendu par WebhookProcessor.handleAccountUpdated() L.224
  //   Nécessaire pour retrouver le TalentPaymentProfile à partir
  //   du stripeAccountId reçu dans le webhook account.updated.
  //
  // upsert :
  //   Attendu par StripeConnectService L.78/205
  //   et WebhookProcessor.handleAccountUpdated L.245
  //   Crée si inexistant, met à jour si existant.
  //   Résolution via findByTalentUserId (clé fonctionnelle).
  // ──────────────────────────────────────────────────────────
  talentPaymentProfiles: {
    async findByTalentUserId(talentUserId) {
      const q = encodeURIComponent(JSON.stringify({ talentUserId }));
      try {
        const arr = await base44Get(`/entities/TalentPaymentProfile?q=${q}`);
        return Array.isArray(arr) ? arr[0] || null : null;
      } catch { return null; }
    },

    async findByStripeAccountId(stripeAccountId) {
      const q = encodeURIComponent(JSON.stringify({ stripeAccountId }));
      try {
        const arr = await base44Get(`/entities/TalentPaymentProfile?q=${q}`);
        return Array.isArray(arr) ? arr[0] || null : null;
      } catch { return null; }
    },

    async create(data) {
      return base44Post('/entities/TalentPaymentProfile', {
        ...data, createdAt: data.createdAt || new Date().toISOString(),
      });
    },

    async update(base44Id, data) {
      return base44Put(`/entities/TalentPaymentProfile/${base44Id}`, {
        ...data, updatedAt: new Date().toISOString(),
      });
    },

    async upsert(data) {
      // Résolution : si talentUserId existe, trouver le profil existant
      if (data.talentUserId) {
        const existing = await this.findByTalentUserId(data.talentUserId);
        if (existing && existing.id) {
          return this.update(existing.id, data);
        }
      }
      return this.create(data);
    },
  },

  // ── Scheduler ──────────────────────────────────────────────
  scheduler:      SchedulerRepository,

  // ── Présence GPS ───────────────────────────────────────────
  sessionPresence: SessionPresenceRepository,

  // ── SOTS + Réputation ──────────────────────────────────────
  sots:           SOTSRepository,
  reputation:     ReputationRepository,

  // ── Admin + Audit ──────────────────────────────────────────
  admin:          AdminRepository,

  // ── ContractSnapshot (phases 1 + 2) ────────────────────────
  contractSnapshots: ContractSnapshotRepository,

  // ── Membership + Plans ─────────────────────────────────────
  membership:     MembershipRepository,

  // ── PolicyConfig ───────────────────────────────────────────
  policyConfig:   PolicyConfigRepository,
};