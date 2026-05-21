/**
 * MICRO RAVE V3 — PaymentRepository (interface)
 * ============================================================
 * Interface portable pour les entités de paiement Stripe.
 *
 * Source : D-128 · D-097 · D-101 · OS V15 BLOC 10
 *
 * Entités couvertes :
 *   StripePaymentSignal    — signal webhook non encore consommé
 *   PayoutExecutionRecord  — proof de payout exécuté (D-101)
 *   SettlementInstruction  — instruction de règlement talent
 *   WebhookProcessedLog    — idempotency webhook (D-097)
 *   EventPaymentRequest    — demande de paiement EPR
 *
 * INTERFACE PAYOUTEXECUTOR (D-101) :
 *   PayoutExecutor attend repositories avec cette forme :
 *     repositories.payoutExecutionRecords.findByEngagementId(engId, talentId)
 *     repositories.payoutExecutionRecords.create(data)
 *     repositories.settlementInstructions.markConsumed(id, data)
 *     repositories.ledgerRecords.append(entry)
 *
 *   Ces sous-objets sont exportés directement pour correspondre
 *   à l'interface déclarée dans PayoutExecutor.js lignes 68–71.
 *   Source : D-101 Verrou 2 (idempotency) · D-101 Verrou 3 (SettlementInstruction).
 *
 * RÈGLE D-097 règle 1 : Traçabilité complète.
 *   Chaque stripePaymentIntentId doit être retrouvable
 *   via son engagementId en O(1).
 *
 * CORRECTION 2026-05-21 :
 *   findPayoutRecordByEngagementId renommé en findByEngagementId
 *   sur le sous-objet payoutExecutionRecords.
 *   Raison : alignement avec l'interface attendue par PayoutExecutor.
 *   Source : PayoutExecutor.js L.99 · audit fil directeur 2026-05-21.
 * ============================================================
 */

'use strict';

const BASE44_BASE_URL = 'https://futuristic-rave-core-flow.base44.app/api';

function buildHeaders() {
  const apiKey = process.env.BASE44_API_KEY;
  if (!apiKey || apiKey === 'REMPLACER_PAR_API_KEY_BASE44') {
    throw new Error('CONFIG_MISSING: BASE44_API_KEY absent.');
  }
  return { 'Content-Type': 'application/json', 'api_key': apiKey };
}

async function base44Post(path, data) {
  const res = await fetch(`${BASE44_BASE_URL}${path}`, {
    method: 'POST', headers: buildHeaders(), body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`BASE44_HTTP_${res.status}: POST ${path} — ${body}`);
  }
  return res.json();
}

async function base44Put(path, data) {
  const res = await fetch(`${BASE44_BASE_URL}${path}`, {
    method: 'PUT', headers: buildHeaders(), body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`BASE44_HTTP_${res.status}: PUT ${path} — ${body}`);
  }
  return res.json();
}

async function base44Get(path) {
  const res = await fetch(`${BASE44_BASE_URL}${path}`, {
    method: 'GET', headers: buildHeaders(),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`BASE44_HTTP_${res.status}: GET ${path} — ${body}`);
  }
  const json = await res.json();
  return Array.isArray(json) ? json : (json.data || json);
}

// ── StripePaymentSignal ───────────────────────────────────────

async function createStripePaymentSignal(data) {
  return base44Post('/entities/StripePaymentSignal', {
    ...data,
    processed: false,
    createdAt: data.createdAt || new Date().toISOString(),
  });
}

async function findUnprocessedSignalsByEngagementId(engagementId) {
  const q = encodeURIComponent(JSON.stringify({ engagementId, processed: false }));
  return base44Get(`/entities/StripePaymentSignal?q=${q}`);
}

async function findAllUnprocessedSignals() {
  const q = encodeURIComponent(JSON.stringify({ processed: false }));
  return base44Get(`/entities/StripePaymentSignal?q=${q}`);
}

async function markSignalConsumed(base44Id, consumedAt) {
  return base44Put(`/entities/StripePaymentSignal/${base44Id}`, {
    processed: true,
    consumedAt: consumedAt || new Date().toISOString(),
  });
}

// ── WebhookProcessedLog ───────────────────────────────────────

async function findWebhookLogByEventId(stripeEventId) {
  const q = encodeURIComponent(JSON.stringify({ stripeEventId }));
  const records = await base44Get(`/entities/WebhookProcessedLog?q=${q}`);
  return Array.isArray(records) ? records[0] || null : null;
}

async function createWebhookLog(data) {
  return base44Post('/entities/WebhookProcessedLog', {
    ...data,
    createdAt: data.createdAt || new Date().toISOString(),
  });
}

async function markWebhookCompleted(base44Id, updateData) {
  return base44Put(`/entities/WebhookProcessedLog/${base44Id}`, {
    ...updateData,
    completedAt: updateData.completedAt || new Date().toISOString(),
  });
}

// ── PayoutExecutionRecord ─────────────────────────────────────

/**
 * Recherche par engagementId + talentUserId.
 * Verrou 2 D-101 — idempotency absolue.
 * Nom: findByEngagementId pour compatibilité interface PayoutExecutor.
 */
async function findByEngagementId(engagementId, talentUserId) {
  const q = encodeURIComponent(JSON.stringify({ engagementId, talentUserId }));
  const records = await base44Get(`/entities/PayoutExecutionRecord?q=${q}`);
  return Array.isArray(records) ? records[0] || null : null;
}

async function createPayoutRecord(data) {
  return base44Post('/entities/PayoutExecutionRecord', {
    ...data,
    createdAt: data.createdAt || new Date().toISOString(),
  });
}

// ── SettlementInstruction ─────────────────────────────────────

async function findSettlementInstruction(engagementId, talentUserId) {
  const q = encodeURIComponent(JSON.stringify({ engagementId, talentUserId }));
  const records = await base44Get(`/entities/SettlementInstruction?q=${q}`);
  return Array.isArray(records) ? records[0] || null : null;
}

/**
 * Marque une SettlementInstruction comme consommée.
 * Nom: markConsumed pour compatibilité interface PayoutExecutor.
 * Verrou 3 D-101.
 */
async function markConsumed(base44Id, data = {}) {
  return base44Put(`/entities/SettlementInstruction/${base44Id}`, {
    consumedAt: data.consumedAt || new Date().toISOString(),
    ...data,
  });
}

// ── EventPaymentRequest ───────────────────────────────────────

async function findEventPaymentRequestByEngagementId(engagementId) {
  const q = encodeURIComponent(JSON.stringify({ engagementId }));
  const records = await base44Get(`/entities/EventPaymentRequest?q=${q}`);
  return Array.isArray(records) ? records[0] || null : null;
}

async function createEventPaymentRequest(data) {
  return base44Post('/entities/EventPaymentRequest', {
    ...data,
    createdAt: data.createdAt || new Date().toISOString(),
  });
}

// ── Exports plats (usage direct) ─────────────────────────────

module.exports = {
  // StripePaymentSignal
  createStripePaymentSignal,
  findUnprocessedSignalsByEngagementId,
  findAllUnprocessedSignals,
  markSignalConsumed,
  // WebhookProcessedLog
  findWebhookLogByEventId,
  createWebhookLog,
  markWebhookCompleted,
  // PayoutExecutionRecord
  findByEngagementId,           // nom aligné PayoutExecutor
  createPayoutRecord,
  // SettlementInstruction
  findSettlementInstruction,
  markConsumed,                 // nom aligné PayoutExecutor
  // EventPaymentRequest
  findEventPaymentRequestByEngagementId,
  createEventPaymentRequest,

  // ── Sous-objets d'interface PayoutExecutor (D-101) ──────────
  // PayoutExecutor attend repositories.payoutExecutionRecords,
  // repositories.settlementInstructions, repositories.ledgerRecords.
  // Ces sous-objets permettent de passer ce module directement
  // sans adapter la couche appelante.
  // Source : PayoutExecutor.js lignes 68–71 · D-101 Verroux 2 et 3.
  payoutExecutionRecords: {
    findByEngagementId,
    create: createPayoutRecord,
  },
  settlementInstructions: {
    markConsumed,
  },
};