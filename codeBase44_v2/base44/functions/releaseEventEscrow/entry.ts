// deploy: v7
// releaseEventEscrow — Capture le PI Stripe du dépôt 20% et marque l'escrow libéré.
//
// v7 — FinancialLedger cash-in double-entry (Fix architecture cible Bloc C) :
//
//   PROBLÈME v6 :
//   releaseEventEscrow ne créait aucune entrée dans FinancialLedger.
//   La capture physique Stripe (fonds réels dans le compte) n'était pas tracée.
//   Bilan actif (stripe_balance) non reconstituable depuis le ledger.
//
//   FIX :
//   Après la capture Stripe réussie, créer les paires double-entry FinancialLedger :
//
//   Capture dépôt (clearing → balance) :
//     Dr stripe_balance    → Cr stripe_clearing     (deposit_captured)
//   Libération escrow (escrow liability éteinte) :
//     Dr escrow_liability  → Cr stripe_balance       (escrow_released)
//
//   Ces deux paires ensemble expriment : l'argent est passé de "autorisé en transit"
//   à "réel dans le compte ET disponible pour distribution".
//
//   IDEMPOTENCE :
//   Guard stripeRef avant écriture — appel rejoué ne crée pas de doublon.
//   Non-fatal : la capture Stripe ayant réussi, on ne bloque jamais sur erreur ledger.
//
// v4 — Supporte deux PaymentIntents distincts :
//   1. stripePaymentIntentId     → dépôt 20% (capturé ici)
//   2. stripeBalancePaymentIntentId → balance 80% (capturée ici si présente)
//
// PRÉSENCE : lit SessionPresence.payoutEligible pour qualifier les artistes.
// Les splits sont générés par generatePayoutSplits (cron +24h).

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import Stripe from 'npm:stripe@14';

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status, headers: { 'content-type': 'application/json' }
  });
}

function normalizeId(v) {
  if (!v) return null;
  if (typeof v === 'string') return v;
  if (typeof v === 'object') return String(v.id || v._id || v.value || '');
  return String(v);
}

// ── Écriture FinancialLedger double-entry (append-only) ─────────────────────
// Identique à confirmStripePayment v6 — à factoriser dans un module partagé
// quand Base44 supportera les imports inter-fonctions.
async function writeLedgerPair(service, { entryType, debitAccount, creditAccount, amount_cents, eventId, stripeRef, note }) {
  try {
    const existing = await service.entities.FinancialLedger
      .filter({ eventId, stripeRef, entryType, debitCredit: 'debit' })
      .catch(() => []);
    if (existing && existing.length > 0) {
      console.log(`[FinancialLedger] SKIP idempotent stripeRef=${stripeRef} entryType=${entryType}`);
      return { skipped: true };
    }
    const nowIso = new Date().toISOString();
    const debitEntry = await service.entities.FinancialLedger.create({
      entryType, debitCredit: 'debit', accountCode: debitAccount,
      amount_cents, currency: 'CAD', eventId, stripeRef,
      note: `${note} [Dr ${debitAccount}]`, createdAt: nowIso,
    });
    const creditEntry = await service.entities.FinancialLedger.create({
      entryType, debitCredit: 'credit', accountCode: creditAccount,
      amount_cents, currency: 'CAD', eventId, stripeRef,
      relatedEntryId: debitEntry?.id || null,
      note: `${note} [Cr ${creditAccount}]`, createdAt: nowIso,
    });
    if (debitEntry?.id && creditEntry?.id) {
      await service.entities.FinancialLedger.update(debitEntry.id, {
        relatedEntryId: creditEntry.id,
      }).catch(() => null);
    }
    console.log(`[FinancialLedger] WRITTEN entryType=${entryType} Dr=${debitAccount} Cr=${creditAccount} amount_cents=${amount_cents} ref=${stripeRef}`);
    return { debitId: debitEntry?.id, creditId: creditEntry?.id };
  } catch (e) {
    console.warn(`[FinancialLedger] write failed (non-fatal) entryType=${entryType} ref=${stripeRef}:`, e?.message);
    return { error: e?.message };
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return json(401, { ok: false, error: 'Unauthorized' });

    const body = await req.json().catch(() => ({}));
    const { eventId } = body;
    if (!eventId) return json(400, { ok: false, error: 'eventId required' });

    const service = base44.asServiceRole;
    if (!service) return json(503, { ok: false, error: 'Service role unavailable' });

    // ── Charger l'event ───────────────────────────────────────────────────────
    const event = await service.entities.Event.get(eventId).catch(() => null);
    if (!event) return json(404, { ok: false, error: 'Event not found' });

    // Auth : organisateur de l'event OU admin plateforme
    // Admin peut forcer la capture sur des events dont il n'est pas l'organisateur
    // (cas : expiration PI imminente, event complété sans release, orphan escrow)
    const isOrganizer = normalizeId(event.organizerId) === normalizeId(user.id);
    const isAdmin     = user.role === 'admin';

    if (!isOrganizer && !isAdmin) {
      return json(403, { ok: false, error: 'Only the organizer or an admin can release escrow' });
    }

    if (event.escrowStatus === 'released') {
      return json(200, { ok: true, action: 'already_released' });
    }
    if (event.escrowStatus === 'disputed') {
      return json(409, { ok: false, error: 'Cannot release disputed escrow.' });
    }
    if (event.escrowStatus !== 'secured') {
      return json(409, { ok: false, error: `escrowStatus must be 'secured'. Current: ${event.escrowStatus}` });
    }
    if (!event.stripePaymentIntentId) {
      return json(400, { ok: false, error: 'No stripePaymentIntentId on event' });
    }

    // ── Lire les SessionPresence liées à cet event ────────────────────────────
    const allPresences = await service.entities.SessionPresence.filter({ eventId }).catch(() => []);

    const presenceByUser = {};
    for (const p of (allPresences || [])) {
      if (p.role === 'artist' || p.role === 'organizer') {
        const uid = normalizeId(p.userId);
        if (uid) {
          if (!presenceByUser[uid] || p.payoutEligible === true) {
            presenceByUser[uid] = {
              userId: uid,
              role: p.role,
              payoutEligible: p.payoutEligible === true,
              validationScore: p.validationScore || 0,
              durationMin: p.durationMin || 0,
            };
          }
        }
      }
    }

    const hasPresenceData = Object.keys(presenceByUser).length > 0;
    const eligibleUsers = Object.values(presenceByUser).filter(p => p.payoutEligible);
    const ineligibleUsers = Object.values(presenceByUser).filter(p => !p.payoutEligible);

    console.log(
      `[releaseEventEscrow] eventId=${eventId} ` +
      `presence=${hasPresenceData} eligible=${eligibleUsers.length} ineligible=${ineligibleUsers.length}`
    );

    // ── Capturer les PI Stripe ────────────────────────────────────────────────
    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'), { apiVersion: '2024-06-20' });

    const capturedPIs = [];

    // Dépôt 20%
    await stripe.paymentIntents.capture(event.stripePaymentIntentId);
    capturedPIs.push(event.stripePaymentIntentId);

    // Balance 80% (si présente et manual_capture)
    if (event.stripeBalancePaymentIntentId) {
      try {
        const balancePI = await stripe.paymentIntents.retrieve(event.stripeBalancePaymentIntentId);
        if (balancePI.status === 'requires_capture') {
          await stripe.paymentIntents.capture(event.stripeBalancePaymentIntentId);
          capturedPIs.push(event.stripeBalancePaymentIntentId);
          console.log(`[releaseEventEscrow] balance PI captured: ${event.stripeBalancePaymentIntentId}`);
        } else {
          console.log(`[releaseEventEscrow] balance PI status=${balancePI.status}, skipped capture`);
        }
      } catch (balanceErr) {
        console.warn(`[releaseEventEscrow] balance PI capture error (non-fatal): ${balanceErr?.message}`);
      }
    }

    // ── Transition d'état canonique ───────────────────────────────────────────
    const transition = await base44.functions.invoke('transitionEscrowStatus', {
      eventId,
      fromStatus: 'secured',
      toStatus: 'released',
      reason: `Stripe capture effectuée — PIs: ${capturedPIs.join(',')}`,
    });
    if (!transition?.data?.ok) {
      console.error(`[releaseEventEscrow] transition failed: ${JSON.stringify(transition?.data)}`);
      return json(500, { ok: false, error: 'Échec transition escrow → released', detail: transition?.data });
    }

    console.log(`[releaseEventEscrow] RELEASED eventId=${eventId} pis=${capturedPIs.join(',')}`);

    // ── Mettre à jour PaymentLedger — enregistrer la capture et la release ─────
    // v_fix B19 : ajouter une entrée 'balance_released' pour la balance si payée.
    // Le ledger doit refléter les deux flux (escrow + balance) pour être auditable.
    try {
      const ledgerRows = await service.entities.PaymentLedger
        .filter({ eventId }).catch(() => []);

      if (ledgerRows && ledgerRows.length > 0) {
        // Mettre à jour le ledger existant (dépôt) avec amountReleased
        const depositLedger = ledgerRows.find(l => l.status === 'secured' || l.status === 'escrow') || ledgerRows[0];
        await service.entities.PaymentLedger.update(depositLedger.id, {
          amountReleased: event.escrowAmount || depositLedger.amountEscrow || 0,
          status: 'released',
        });
        console.log(`[PAYMENT_LEDGER_RELEASED] eventId=${eventId} escrow=${event.escrowAmount}`);
      } else {
        // Aucun ledger existant — créer une entrée de release directe
        await service.entities.PaymentLedger.create({
          eventId,
          payerUserId:    event.payerUserId || null,
          payeeUserId:    event.organizerId || null,
          amountTotal:    event.escrowAmount || 0,
          amountEscrow:   event.escrowAmount || 0,
          amountReleased: event.escrowAmount || 0,
          stripeRef:      capturedPIs.join(','),
          status:         'released',
        });
        console.log(`[PAYMENT_LEDGER_CREATED_AT_RELEASE] eventId=${eventId}`);
      }

      // Entrée séparée pour la balance si elle a été payée — B19 fix
      // Sans cette entrée, le ledger ne retrace pas les ~80% du montant collecté.
      const balancePaid = Number(event.balancePaid) || 0;
      const balancePiId = event.stripeBalancePaymentIntentId || null;
      if (balancePaid > 0 && balancePiId) {
        // Vérifier que cette entrée n'existe pas déjà (idempotence)
        const existingBalanceLedger = (ledgerRows || []).find(l =>
          l.status === 'balance_released' && l.stripeRef === balancePiId
        );
        if (!existingBalanceLedger) {
          await service.entities.PaymentLedger.create({
            eventId,
            payerUserId:    event.payerUserId || null,
            payeeUserId:    event.organizerId || null,
            amountTotal:    balancePaid,
            amountEscrow:   balancePaid,
            amountReleased: balancePaid,
            stripeRef:      balancePiId,
            status:         'balance_released',
          });
          console.log(`[PAYMENT_LEDGER_BALANCE_RELEASED] eventId=${eventId} balance=${balancePaid}`);
        }
      }
    } catch (ledgerErr) {
      // Non-fatal — la capture Stripe a réussi, on ne bloque pas
      console.warn('[releaseEventEscrow] PaymentLedger update failed (non-fatal):', ledgerErr?.message);
    }

    // v7: FinancialLedger double-entry — capture physique du dépôt
    // La capture Stripe a réussi — les fonds sont maintenant réels dans le compte.
    // PAIRE 1 — deposit_captured : le dépôt sort du clearing et entre dans stripe_balance
    //   Dr stripe_balance (actif augmente) → Cr stripe_clearing (transit éteint)
    // PAIRE 2 — escrow_released : la dette escrow est éteinte
    //   Dr escrow_liability (passif diminue) → Cr stripe_balance (contrepartie comptable)
    const escrowAmountCents = Math.round((Number(event.escrowAmount) || 0) * 100);
    if (escrowAmountCents > 0) {
      await writeLedgerPair(service, {
        entryType:     'deposit_captured',
        debitAccount:  'stripe_balance',
        creditAccount: 'stripe_clearing',
        amount_cents:  escrowAmountCents,
        eventId,
        stripeRef:     event.stripePaymentIntentId,
        note:          `Dépôt capturé — event ${eventId} — ${(escrowAmountCents / 100).toFixed(2)}$ CAD`,
      });
      await writeLedgerPair(service, {
        entryType:     'escrow_released',
        debitAccount:  'escrow_liability',
        creditAccount: 'stripe_balance',
        amount_cents:  escrowAmountCents,
        eventId,
        stripeRef:     event.stripePaymentIntentId,
        note:          `Escrow libéré — event ${eventId} — ${(escrowAmountCents / 100).toFixed(2)}$ CAD`,
      });
    }

    // v7: Si la balance était en requires_capture et a été capturée ici,
    // elle a déjà été enregistrée en balance_received par confirmStripePayment.
    // Pas de nouvelle écriture — éviter le doublon.
    // Si la balance était déjà capturée (confirmStripePayment), idem.

    return json(200, {
      ok: true,
      action: 'released',
      eventId,
      capturedPaymentIntents: capturedPIs,
      escrowAmount: event.escrowAmount,
      presenceSummary: {
        hasPresenceData,
        eligibleCount: eligibleUsers.length,
        ineligibleCount: ineligibleUsers.length,
        eligibleUserIds: eligibleUsers.map(u => u.userId),
        ineligibleUserIds: ineligibleUsers.map(u => u.userId),
        redistributionRequired: ineligibleUsers.length > 0,
      },
    });

  } catch (error) {
    console.error('[releaseEventEscrow]', error?.message);
    return json(500, { ok: false, error: error?.message });
  }
});