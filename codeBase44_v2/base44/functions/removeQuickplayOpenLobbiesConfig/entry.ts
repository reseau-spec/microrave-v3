// deploy: v1
// deploy: v1
// ⚠️  RENOMMER EN: processRefund  (quand crédits disponibles)
// NOM TEMPORAIRE: removeQuickplayOpenLobbiesConfig
// Cette fonction remplace removeQuickplayOpenLobbiesConfig (one-shot terminé).
// Invoquer avec: base44.functions.invoke('removeQuickplayOpenLobbiesConfig', {
//   eventPaymentRequestId, refundReason, amount?, initiatedBy?
// })

// processRefund — Rembourse un paiement Stripe avec metadata complètes.
//
// CONTEXTE :
//   Avant cette fonction, tous les remboursements Micro Rave étaient effectués
//   manuellement dans le Dashboard Stripe, sans metadata, sans trace en DB.
//   Le Stripe RAW (balance_history) montre -426$ de remboursements avec zéro
//   information sur le motif, l'événement d'origine, ou le déclencheur.
//   Le FinancialLedger ne recevait aucune écriture pour ces sorties.
//
// CETTE FONCTION :
//   Centralise tous les remboursements Stripe en un point unique qui :
//   1. Enrichit chaque refund Stripe de 5 metadata traçables
//   2. Met à jour EventPaymentLog.refunded_amount_cents (registre immuable)
//   3. Écrit une paire FinancialLedger refund_issued (double-entry)
//   4. Met à jour l'EPR (escrowStatus si remboursement total)
//
// AUTH :
//   - admin : tous les motifs
//   - organizer : uniquement refundReason='cancelled_event' sur ses propres events
//
// INPUT :
//   {
//     eventPaymentRequestId  string   — ID de l'EPR à rembourser
//     refundReason           string   — enum métier (voir REFUND_REASONS)
//     amount?                number   — montant en $ CAD (omit = remboursement total)
//     initiatedBy?           string   — "organizer" | "admin" | "system" (défaut: rôle user)
//   }
//
// OUTPUT :
//   { ok, stripeRefundId, amount_cents, amountRefunded, type }
//
// METADATA STRIPE sur chaque Refund :
//   refundReason       → enum métier (cancelled_event | dispute | admin_override | duplicate | noshow)
//   originalEventId    → event._id
//   originalRequestId  → eventPaymentRequest._id
//   initiatedBy        → "organizer" | "admin" | "system"
//   platform           → "microrave"
//
// ÉCRITURE FINANCIALLEDGER :
//   entryType: refund_issued
//   Dr refund_payable (passif — obligation de remboursement soldée)
//   Cr stripe_balance (actif — argent sort du compte Stripe)
//   Idempotence : guard stripeRef + entryType avant écriture.
//
// STRIPEREF RESOLUTION :
//   Priorité 1 : EventPaymentLog.stripeChargeId (charge directe — requis par stripe.refunds.create)
//   Priorité 2 : stripe.paymentIntents.retrieve → latest_charge
//   Priorité 3 : EPR.stripePaymentIntentId (fallback — Stripe accepte PI ou charge)

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
import Stripe from 'npm:stripe@14';

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status, headers: { 'content-type': 'application/json' },
  });
}

// Enum des motifs de remboursement Micro Rave
// Mappé sur le champ metadata.refundReason dans Stripe
const REFUND_REASONS = {
  cancelled_event: 'cancelled_event',   // event annulé par l'organisateur ou la plateforme
  dispute:         'dispute',           // litige ouvert (Stripe dispute ou réclamation payeur)
  admin_override:  'admin_override',    // décision admin sans litige formel
  duplicate:       'duplicate',         // double paiement accidentel
  noshow:          'noshow',            // no-show organisateur (contexte exceptionnel)
};

// Raison Stripe native la plus proche pour chaque motif métier
// Stripe accepte: "duplicate" | "fraudulent" | "requested_by_customer"
const STRIPE_REASON_MAP = {
  cancelled_event: 'requested_by_customer',
  dispute:         'requested_by_customer',
  admin_override:  'requested_by_customer',
  duplicate:       'duplicate',
  noshow:          'requested_by_customer',
};

// ── FinancialLedger — refund_issued (double-entry, append-only) ───────────────
async function writeLedgerRefund(service, { amount_cents, stripeRefundId, eventId, requestId, refundReason }) {
  try {
    const existing = await service.entities.FinancialLedger
      .filter({ stripeRef: stripeRefundId, entryType: 'refund_issued', debitCredit: 'debit' })
      .catch(() => []);
    if (existing?.length > 0) {
      console.log(`[FinancialLedger] SKIP idempotent refund_issued stripeRef=${stripeRefundId}`);
      return { skipped: true };
    }

    const nowIso = new Date().toISOString();
    const note   = `Remboursement — event ${eventId} — motif=${refundReason} — ${(amount_cents / 100).toFixed(2)}$ CAD`;

    // Dr refund_payable : la dette de remboursement est soldée
    const debitEntry = await service.entities.FinancialLedger.create({
      entryType:    'refund_issued',
      debitCredit:  'debit',
      accountCode:  'refund_payable',
      amount_cents,
      currency:     'CAD',
      eventId:      eventId || null,
      stripeRef:    stripeRefundId,
      note:         `${note} [Dr refund_payable]`,
      createdAt:    nowIso,
    });

    // Cr stripe_balance : argent remboursé sort du compte Stripe
    const creditEntry = await service.entities.FinancialLedger.create({
      entryType:      'refund_issued',
      debitCredit:    'credit',
      accountCode:    'stripe_balance',
      amount_cents,
      currency:       'CAD',
      eventId:        eventId || null,
      stripeRef:      stripeRefundId,
      relatedEntryId: debitEntry?.id || null,
      note:           `${note} [Cr stripe_balance]`,
      createdAt:      nowIso,
    });

    if (debitEntry?.id && creditEntry?.id) {
      await service.entities.FinancialLedger.update(debitEntry.id, {
        relatedEntryId: creditEntry.id,
      }).catch(() => null);
    }

    console.log(`[FinancialLedger] WRITTEN refund_issued amount_cents=${amount_cents} ref=${stripeRefundId}`);
    return { debitId: debitEntry?.id, creditId: creditEntry?.id };
  } catch (e) {
    console.warn(`[processRefund] FinancialLedger write failed (non-fatal) ref=${stripeRefundId}:`, e?.message);
    return { error: e?.message };
  }
}

Deno.serve(async (req) => {
  try {
    const base44  = createClientFromRequest(req);
    const user    = await base44.auth.me();
    if (!user) return json(401, { ok: false, error: 'Unauthorized' });

    const isAdmin     = user.role === 'admin';
    const isOrganizer = user.role === 'organizer' || user.role === 'user';

    const body = await req.json().catch(() => ({}));
    const { eventPaymentRequestId, refundReason, amount, initiatedBy: bodyInitiatedBy } = body;

    // ── Validation input ─────────────────────────────────────────────────────
    if (!eventPaymentRequestId) {
      return json(400, { ok: false, error: 'eventPaymentRequestId requis' });
    }

    if (!refundReason || !REFUND_REASONS[refundReason]) {
      return json(400, {
        ok: false,
        error: `refundReason invalide. Valeurs acceptées: ${Object.keys(REFUND_REASONS).join(' | ')}`,
        received: refundReason,
      });
    }

    // Auth : organizer ne peut rembourser que ses propres events annulés
    if (!isAdmin && !isOrganizer) {
      return json(403, { ok: false, error: 'Admin ou organizer requis' });
    }
    if (!isAdmin && refundReason !== 'cancelled_event') {
      return json(403, {
        ok: false,
        error: `Les organisateurs ne peuvent rembourser qu'avec refundReason=cancelled_event. Motif demandé: ${refundReason}`,
      });
    }

    const service = base44.asServiceRole;
    const stripe  = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'), { apiVersion: '2024-06-20' });
    const nowIso  = new Date().toISOString();

    // ── Charger l'EPR ────────────────────────────────────────────────────────
    const epr = await service.entities.EventPaymentRequest.get(eventPaymentRequestId).catch(() => null);
    if (!epr) return json(404, { ok: false, error: 'EventPaymentRequest introuvable' });

    if (epr.requestStatus !== 'approved') {
      return json(409, {
        ok: false,
        error: `Seules les EPR avec requestStatus=approved peuvent être remboursées. Actuel: ${epr.requestStatus}`,
      });
    }

    if (!epr.stripePaymentIntentId) {
      return json(409, { ok: false, error: 'EPR sans stripePaymentIntentId — remboursement impossible' });
    }

    // ── Charger l'Event ──────────────────────────────────────────────────────
    const event = epr.eventId
      ? await service.entities.Event.get(epr.eventId).catch(() => null)
      : null;

    // Auth organizer : vérifier ownership
    if (!isAdmin && event) {
      const isOwner = event.organizerId === user.id;
      if (!isOwner) {
        return json(403, { ok: false, error: 'Vous ne pouvez rembourser que vos propres événements' });
      }
    }

    const eventId   = event?.id    ?? epr.eventId ?? null;
    const eventName = event?.title ?? event?.name  ?? '';

    // ── Résoudre le stripeChargeId ───────────────────────────────────────────
    // Stripe refunds.create préfère un chargeId — plus fiable qu'un PI sur les PI en requires_capture
    // Priorité 1 : EventPaymentLog (registre le plus fiable, contient stripeChargeId)
    // Priorité 2 : retrieve le PI pour latest_charge
    // Priorité 3 : utiliser le PI directement (Stripe accepte les deux)
    let chargeId = null;

    try {
      const logs = await service.entities.EventPaymentLog
        .filter({ stripePaymentIntentId: epr.stripePaymentIntentId })
        .catch(() => []);
      const log = logs?.[0];
      if (log?.stripeChargeId) {
        chargeId = log.stripeChargeId;
        console.log(`[processRefund] chargeId résolu depuis EventPaymentLog: ${chargeId}`);
      }
    } catch (e) {
      console.warn(`[processRefund] EventPaymentLog lookup failed (non-fatal):`, e?.message);
    }

    if (!chargeId) {
      try {
        const pi = await stripe.paymentIntents.retrieve(epr.stripePaymentIntentId);
        chargeId = pi.latest_charge || null;
        if (chargeId) {
          console.log(`[processRefund] chargeId résolu depuis PI.latest_charge: ${chargeId}`);
        }
      } catch (e) {
        console.warn(`[processRefund] PI retrieve failed (non-fatal):`, e?.message);
      }
    }

    // ── Calculer le montant ──────────────────────────────────────────────────
    // Si amount non fourni → remboursement total (Stripe déduit le max remboursable)
    const amountCents = amount ? Math.round(Number(amount) * 100) : undefined;

    if (amountCents !== undefined && amountCents <= 0) {
      return json(400, { ok: false, error: `Montant invalide: ${amount} → ${amountCents} cents` });
    }

    // ── Créer le remboursement Stripe ────────────────────────────────────────
    const initiatedBy = bodyInitiatedBy || (isAdmin ? 'admin' : 'organizer');

    const refundParams = {
      reason:   STRIPE_REASON_MAP[refundReason],
      metadata: {
        // Enum métier — plus précis que le reason Stripe natif
        refundReason,
        // Traçabilité vers l'event et la demande d'origine
        originalEventId:   eventId        ?? '',
        originalRequestId: epr.id,
        // Contexte de déclenchement
        initiatedBy,
        platform:          'microrave',
      },
    };

    // Attacher à la charge si disponible, sinon au PI
    if (chargeId) {
      refundParams.charge = chargeId;
    } else {
      refundParams.payment_intent = epr.stripePaymentIntentId;
    }

    if (amountCents !== undefined) {
      refundParams.amount = amountCents;
    }

    let refund;
    try {
      refund = await stripe.refunds.create(refundParams);
    } catch (stripeErr) {
      console.error(`[processRefund] Stripe refund échoué:`, stripeErr.message);
      return json(502, {
        ok: false,
        error:      `Stripe refund échoué: ${stripeErr.message}`,
        stripeCode: stripeErr.code || null,
      });
    }

    const refundedAmount = refund.amount; // centimes, natif Stripe

    console.log(
      `[processRefund] v1 REFUND_CREATED refundId=${refund.id} ` +
      `amount_cents=${refundedAmount} reason=${refundReason} ` +
      `eventId=${eventId} eprId=${epr.id} initiatedBy=${initiatedBy}`
    );

    // ── Mettre à jour EventPaymentLog ────────────────────────────────────────
    // Incrémenter refunded_amount_cents sur le log de la transaction d'origine
    // (pattern FIFO inversé pour les remboursements partiels successifs)
    try {
      const logs = await service.entities.EventPaymentLog
        .filter({ stripePaymentIntentId: epr.stripePaymentIntentId })
        .catch(() => []);
      const log = logs?.[0];
      if (log) {
        const previousRefunded = Number(log.refunded_amount_cents) || 0;
        await service.entities.EventPaymentLog.update(log.id, {
          refunded_amount_cents: previousRefunded + refundedAmount,
          status:                previousRefunded + refundedAmount >= (Number(log.requested_amount_cents) || 0)
            ? 'refunded'
            : 'partial_refund',
        });
        console.log(
          `[processRefund] EventPaymentLog UPDATED logId=${log.id} ` +
          `refunded=${previousRefunded} → ${previousRefunded + refundedAmount}`
        );
      }
    } catch (e) {
      console.warn(`[processRefund] EventPaymentLog update failed (non-fatal):`, e?.message);
    }

    // ── FinancialLedger — refund_issued ──────────────────────────────────────
    await writeLedgerRefund(service, {
      amount_cents: refundedAmount,
      stripeRefundId: refund.id,
      eventId,
      requestId: epr.id,
      refundReason,
    });

    // ── Mettre à jour l'EPR ──────────────────────────────────────────────────
    // Si remboursement total : marquer l'EPR comme refunded
    // Si partiel : conserver approved (plusieurs remboursements partiels possibles)
    const isFullRefund = !amountCents; // pas de montant = Stripe rembourse tout
    if (isFullRefund || refund.status === 'succeeded') {
      await service.entities.EventPaymentRequest.update(epr.id, {
        requestStatus: isFullRefund ? 'refunded' : epr.requestStatus,
        refundedAt:    nowIso,
        refundReason,
        stripeRefundId: refund.id,
      }).catch(e => console.warn('[processRefund] EPR update failed (non-fatal):', e?.message));
    }

    // ── Transition escrowStatus si remboursement total sur un event sécurisé ──
    // Un remboursement total = l'escrow ne couvre plus rien → 'disputed'
    if (isFullRefund && event && ['secured', 'releasing'].includes(event.escrowStatus)) {
      try {
        await base44.functions.invoke('transitionEscrowStatus', {
          eventId:    event.id,
          fromStatus: event.escrowStatus,
          toStatus:   'disputed',
          reason:     `processRefund v1 — remboursement total refundReason=${refundReason} refundId=${refund.id}`,
        });
        console.log(`[processRefund] escrowStatus → disputed eventId=${event.id}`);
      } catch (e) {
        console.warn(`[processRefund] transitionEscrowStatus failed (non-fatal):`, e?.message);
      }
    }

    return json(200, {
      ok:             true,
      stripeRefundId: refund.id,
      amount_cents:   refundedAmount,
      amountRefunded: refundedAmount / 100,
      currency:       'CAD',
      status:         refund.status,
      refundReason,
      initiatedBy,
      eventId,
      eventPaymentRequestId,
    });

  } catch (error) {
    console.error('[processRefund] v1 FATAL:', error?.message);
    return json(500, { ok: false, error: error.message });
  }
});