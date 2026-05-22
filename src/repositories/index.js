/**
 * MICRO RAVE V3 — src/repositories/index.js
 * ============================================================
 * Point d'entrée unique pour tous les repositories.
 * Utilisé par run-j9-pilot.js, cron.js, et SignalConsumerService.
 *
 * Source : D-128 · Plan Phase 0.4 · 2026-05-21
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

  // ── TalentPaymentProfile (KYC Stripe Connect) ──────────────
  talentPaymentProfiles: {
    async findByTalentUserId(talentUserId) {
      const q = encodeURIComponent(JSON.stringify({ talentUserId }));
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