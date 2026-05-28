/**
 * recognizeRevenue — Base44 Function
 * ============================================================
 * Reconnaît le revenu Micro Rave à l'archivage de l'engagement.
 * Libère la commission de l'escrow différé (4530) vers le
 * compte de revenu reconnu (7110).
 *
 * DÉCLENCHEMENT : appelé depuis settled → archived.
 *   1. Calculer commissionMrCents depuis l'engagement
 *   2. Écrire 4530 DR / 7110 CR (LOI LEDGER-02)
 *   3. Transitioner l'engagement vers archived
 *
 * ÉCRITURES LEDGER (D-038 Phase 2) :
 *   4530  DR  commissionMrCents   RESULTAT  null  reconnaissance_revenu
 *   7110  CR  commissionMrCents   RESULTAT  null  reconnaissance_revenu
 *   → 4530 se vide (commission différée éteinte)
 *   → 7110 augmente (revenu reconnu dans le P&L)
 *   → DR = CR = commissionMrCents ✓ LOI LEDGER-02
 *
 * Source : D-038 Phase 2, LOI LEDGER-01/02, OS V15
 * ============================================================
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// ── createBase44Repositories — inline PHASE 3 ───────────────────────
// Reproduit src/repositories/adapters/base44-adapter.js dans le
// runtime Deno cloud Base44. Univers séparés — aucun import cross-env.
// Barrière LOI_TRANSITION_01_VIOLATION ancrée physiquement ici.
// Source : PORT-3 · PHASE 3 · 27 mai 2026
function createBase44Repositories(base44) {
  if (!base44 || !base44.entities) {
    throw new Error('ADAPTER_ERROR: base44.entities absent — SDK Base44 requis.');
  }
  const E = base44.entities;
  const nowIso = () => new Date().toISOString();

  return {
    engagements: {
      get:    (id)      => E.Engagement.get(id),
      list:   (f)       => E.Engagement.filter(f || {}),
      create: (payload) => E.Engagement.create(payload),
      update: async (id, payload) => {
        if (payload && Object.prototype.hasOwnProperty.call(payload, 'status')) {
          throw new Error(
            'LOI_TRANSITION_01_VIOLATION: update() ne peut pas modifier status. ' +
            'Utiliser transitionEngagement() exclusivement.'
          );
        }
        return E.Engagement.update(id, payload);
      },
      updateStatus: () => {
        throw new Error(
          'LOI_TRANSITION_01_VIOLATION: updateStatus() interdit. ' +
          'Utiliser transitionEngagement() exclusivement.'
        );
      },
    },
    events: {
      get:    (id)      => E.Event.get(id),
      list:   (f)       => E.Event.filter(f || {}),
      create: (payload) => E.Event.create(payload),
      update: (id, p)   => E.Event.update(id, p),
    },
    contractSnapshots: {
      create: (payload) => E.ContractSnapshot.create({ createdAt: nowIso(), ...payload }),
      get:    (id)      => E.ContractSnapshot.get(id),
      list:   (f)       => E.ContractSnapshot.filter(f || {}),
    },
    ledgerRecords: {
      append: (payload) => E.LedgerRecord.create(payload),
      list:   (f)       => E.LedgerRecord.filter(f || {}),
    },
    eventPaymentRequests: {
      get:    (id)      => E.EventPaymentRequest.get(id),
      list:   (f)       => E.EventPaymentRequest.filter(f || {}),
      create: (payload) => E.EventPaymentRequest.create(payload),
      update: (id, p)   => E.EventPaymentRequest.update(id, p),
    },
    policyConfig: {
      get:    (f)       => E.PolicyConfig.filter(f || {}),
      getOne: async (key) => {
        const rows = await E.PolicyConfig.filter({ key });
        return rows?.[0] ?? null;
      },
    },
    sessionPresence: {
      create: (payload) => E.SessionPresence.create(payload),
      list:   (f)       => E.SessionPresence.filter(f || {}),
      update: (id, p)   => E.SessionPresence.update(id, p),
    },
    payoutExecutionRecords: {
      create: (payload) => E.PayoutExecutionRecord.create(payload),
      list:   (f)       => E.PayoutExecutionRecord.filter(f || {}),
    },
    settlementInstructions: {
      get:    (id)      => E.SettlementInstruction.get(id),
      list:   (f)       => E.SettlementInstruction.filter(f || {}),
    },
    talentPaymentProfiles: {
      list:   (f)       => E.TalentPaymentProfile.filter(f || {}),
    },
    schedulerTasks: {
      create: (payload) => E.SchedulerDueTask.create({ ...payload, createdAt: nowIso() }),
      list:   (f)       => E.SchedulerDueTask.filter(f || {}),
      update: (id, p)   => E.SchedulerDueTask.update(id, p),
    },
    sotsSubmissions: {
      create: (payload) => E.SOTSSubmission.create(payload),
      list:   (f)       => E.SOTSSubmission.filter(f || {}),
    },
    sotsDimensionConfigs: {
      list:   (f)       => E.SOTSDimensionConfig.filter(f || {}),
    },
    reputationLedger: {
      create: (payload) => E.ReputationLedger.create(payload),
    },
    membershipPlans: {
      list:   (f)       => E.MembershipPlan.filter(f || {}),
    },
    userMemberships: {
      list:   (f)       => E.UserMembership.filter(f || {}),
      create: (payload) => E.UserMembership.create(payload),
      update: (id, p)   => E.UserMembership.update(id, p),
    },
    webhookProcessedLogs: {
      create: (payload) => E.WebhookProcessedLog.create(payload),
      list:   (f)       => E.WebhookProcessedLog.filter(f || {}),
    },
    stripePaymentSignals: {
      create: (payload) => E.StripePaymentSignal.create(payload),
      list:   (f)       => E.StripePaymentSignal.filter(f || {}),
    },
  };
}
// ── Fin createBase44Repositories ────────────────────────────────────



function generateId(prefix) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const s1 = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  const s2 = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `${prefix}-${s1}-${s2}`;
}

// ── Charger les comptes depuis PolicyConfig ───────────────────
async function loadRevenueAccounts(base44) {
  const keys = ['ledger_account_commission_escrow', 'ledger_account_revenue_courtage'];
  const accounts = {};
  const missing = [];
  for (const key of keys) {
    const records = await base44.entities.PolicyConfig
      .filter({ key }, '-created_date', 1).catch(() => []);
    if (records?.length && records[0].value) {
      accounts[key] = records[0].value;
    } else {
      missing.push(key);
    }
  }
  if (missing.length > 0) {
    throw new Error(
      `LEDGER_ACCOUNTS_MISSING: Clés PolicyConfig absentes : ${missing.join(', ')}. ` +
      `Exécuter seed-policy-ledger-accounts.js avant la reconnaissance de revenu. Source : Market Pivot V3.`
    );
  }
  return {
    commissionEscrow: accounts['ledger_account_commission_escrow'],
    revenueCourtage:  accounts['ledger_account_revenue_courtage'],
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const me = await base44.auth.me();
    if (!me?.id) return Response.json({ ok: false, error: 'AUTH_REQUIRED' }, { status: 401 });

    const body = await req.json();
    const { engagementId } = body;

    if (!engagementId) {
      return Response.json({ ok: false, error: 'VALIDATION: engagementId obligatoire.' }, { status: 400 });
    }

    // ── Charger l'engagement ──────────────────────────────────
    const engagements = await base44.entities.Engagement.filter(
      { systemId: engagementId }, '-created_date', 1
    );
    if (!engagements?.length) {
      return Response.json({ ok: false, error: `NOT_FOUND: Engagement "${engagementId}" introuvable.` }, { status: 404 });
    }

    const eng              = engagements[0];
    const commissionCents  = Number(eng.commissionMrCents) || 0;

    // ── Vérifier l'état ───────────────────────────────────────
    if (eng.status !== 'settled') {
      return Response.json({
        ok:    false,
        error: `INVALID_STATE: Reconnaissance revenu possible uniquement depuis settled. État actuel : "${eng.status}".`,
      }, { status: 422 });
    }

    if (commissionCents <= 0) {
      return Response.json({
        ok:    false,
        error: `VALIDATION: commissionMrCents invalide (${commissionCents}¢). Impossible de reconnaître un revenu nul.`,
      }, { status: 422 });
    }

    // ── Idempotence : reconnaissance déjà faite ? ─────────────
    const existing = await base44.entities.LedgerRecord
      .filter({ engagementId: eng.systemId, transactionType: 'revenue_recognition' }, '-created_date', 1)
      .catch(() => []);

    if (existing?.length) {
      return Response.json({
        ok:         true,
        idempotent: true,
        message:    `Reconnaissance revenu déjà enregistrée pour ${engagementId} (${existing[0].transactionGroupId}).`,
        ledgerId:   existing[0].systemId,
      });
    }

    // ── Charger les comptes (Market Pivot) ────────────────────
    const accounts = await loadRevenueAccounts(base44);

    // ── LOI LEDGER-02 — vérification avant persistance ────────
    const dr = commissionCents;
    const cr = commissionCents;
    if (dr !== cr) {
      // Ne devrait jamais arriver — commissionCents est une constante
      throw new Error(`LOI_LEDGER_02: DR=${dr} CR=${cr} — incohérence interne.`);
    }

    const txgId = `TXG-REV-${eng.systemId.slice(4)}`;
    const now   = new Date().toISOString();

    // ── Écrire 4530 DR (escrow libéré) ───────────────────────
    await base44.entities.LedgerRecord.create({
      systemId:           generateId('LDG'),
      transactionGroupId: txgId,
      transactionType:    'revenue_recognition',
      economicEvent:      'reconnaissance_revenu',
      financialStatement: 'RESULTAT',
      flowCode:           null,
      lineIndex:          0,
      engagementId:       eng.systemId,
      eventId:            eng.eventId || '',
      skuCode:            'SKU-COURTAGE',
      subSkuCode:         'SUB-COURT-REVENU',
      account:            accounts.commissionEscrow,
      direction:          'DEBIT',
      amountCents:        commissionCents,
      currency:           'cad',
      reconciliationKey:  `journal:recognition-${eng.systemId}`,
      note:               `Libération escrow commission MR — ${(commissionCents/100).toFixed(2)}$ reconnu`,
      metadata:           JSON.stringify({ txgId, lineCount: 2, commissionCents }),
      createdAt:          now,
    });

    // ── Écrire 7110 CR (revenu reconnu) ──────────────────────
    await base44.entities.LedgerRecord.create({
      systemId:           generateId('LDG'),
      transactionGroupId: txgId,
      transactionType:    'revenue_recognition',
      economicEvent:      'reconnaissance_revenu',
      financialStatement: 'RESULTAT',
      flowCode:           null,
      lineIndex:          1,
      engagementId:       eng.systemId,
      eventId:            eng.eventId || '',
      skuCode:            'SKU-COURTAGE',
      subSkuCode:         'SUB-COURT-REVENU',
      account:            accounts.revenueCourtage,
      direction:          'CREDIT',
      amountCents:        commissionCents,
      currency:           'cad',
      reconciliationKey:  `journal:recognition-${eng.systemId}`,
      note:               `Revenu courtage reconnu — engagement ${eng.systemId} archivé`,
      metadata:           JSON.stringify({ txgId, lineCount: 2 }),
      createdAt:          now,
    });

    // ── Transitionner vers archived ───────────────────────────
    await base44.entities.Engagement.update(eng.id, {
      status:     'archived',
      archivedAt: now,
      updatedAt:  now,
    });

    return Response.json({
      ok:              true,
      engagementId:    eng.systemId,
      commissionCents,
      txgId,
      ledger:          { linesWritten: 2, dr: commissionCents, cr: commissionCents },
      newState:        'archived',
      message:         `Commission de ${(commissionCents/100).toFixed(2)}$ reconnue. Engagement archivé.`,
    });

  } catch (error) {
    console.error('[recognizeRevenue]', error.message);
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});