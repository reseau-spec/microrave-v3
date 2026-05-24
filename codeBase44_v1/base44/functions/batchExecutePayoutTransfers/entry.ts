// deploy: v3
// batchExecutePayoutTransfers — Exécute les paiements talents + remboursements no-show.
//
// CHANGEMENTS v3 — Remboursements no-show :
//
//   PROBLÈME v2 :
//   Les splits talent_noshow_refund créés par generatePayoutSplits n'étaient jamais
//   exécutés. recipientUserId = null (logique correcte : le remboursement va au PAYEUR
//   de l'event, pas à un talent). batchExecutePayoutTransfers filtrait uniquement
//   roleType=talent_payout → les no-show étaient silencieusement ignorés.
//
//   FIX v3 :
//   Après le batch talent_payout habituel, un second pass traite les splits
//   talent_noshow_refund via stripe.refunds.create (et non stripe.transfers.create).
//   Logique de résolution du payeur :
//     1. EventPaymentLog (source de vérité) → stripeChargeId → stripe.refunds.create
//     2. Fallback : EPR.stripePaymentIntentId → stripe.refunds.create
//     3. Si aucun PI disponible → skip avec raison 'no_charge_for_refund'
//   Idempotence : clé refund:{splitId} dans metadata Stripe.
//   FinancialLedger : paire noshow_refund_issued Dr refund_liability / Cr stripe_balance.
//   split.status → 'paid', split.stripeTransferId → refund.id (re:xxx)
//   EventPaymentLog.refundedAmount cumulé, status → 'refunded' si intégral.
//
// CHANGEMENTS v2 — Fix source_transaction :
//
//   PROBLÈME v1 :
//   Le transfer Stripe était créé avec source_transaction = charge du PI dépôt.
//   Règle Stripe : un transfer avec source_transaction ne peut pas dépasser
//   le montant de cette charge source. Dépôt = 20% du budget → le transfer
//   était plafonné à 20% du budget, alors que le talent doit recevoir ~88% du prix.
//   Résultat : "Transfers using this transaction as a source must not exceed $60.00."
//
//   CAUSE RACINE :
//   Dans l'architecture Separate Charges and Transfers de Micro Rave, la balance 80%
//   est capturée sur un PI séparé (stripeBalancePaymentIntentId). L'argent total
//   (dépôt + balance) est dans le compte platform Stripe mais réparti sur 2 PI.
//   Utiliser source_transaction sur le seul PI dépôt contractait le transfer à 20%.
//
//   FIX v2 :
//   Retirer source_transaction pour les events où la balance a été payée.
//   L'argent est déjà capturé dans le compte platform — transfer_group + metadata
//   assurent la traçabilité complète sans contraindre le montant.
//   source_transaction est conservé UNIQUEMENT si aucune balance n'a été payée
//   (event dépôt-only) et que le split <= escrowAmount.
//
// INPUT :
//   { dryRun?, eventId?, maxAmount?, maxSplits? }
//
//   dryRun     (boolean, défaut: true)  — si true : analyse sans rien exécuter
//   eventId    (string, optionnel)      — filtrer sur un seul event
//   maxAmount  (number, défaut: 1000)   — plafond total CAD par run (sécurité)
//   maxSplits  (number, défaut: 50)     — plafond nombre de splits par run
//
// OUTPUT :
//   {
//     ok, dryRun, processed, skipped, failed, totalAmount,
//     results: [{ splitId, eventId, recipientUserId, amount, status, reason }]
//   }
//
// SÉCURITÉS :
//   - dryRun=true par défaut — jamais d'exécution accidentelle
//   - maxAmount : plafond de sécurité par run (évite overpayment sur bug de split)
//   - Admin only
//   - Pour chaque split : vérification escrowStatus=released avant transfert
//   - Idempotence Stripe : clé transfer:{splitId} — un split ne peut être payé 2 fois
//   - TalentProfile.stripeConnectOnboardingStatus=active requis (KYC gate)
//
// USAGE RECOMMANDÉ :
//   1. Toujours commencer avec dryRun=true pour vérifier la liste des splits éligibles
//   2. Inspecter results — vérifier amounts, recipients, reasons des skips
//   3. Si ok → relancer avec dryRun=false + maxAmount conservateur (ex: 500)
//   4. Répéter jusqu'à épuisement des splits pending
//
// LOGIQUE DE FILTRAGE (splits éligibles) :
//   - status=pending
//   - roleType=talent_payout
//   - Event.escrowStatus=released (fonds réels disponibles)
//   - TalentProfile.stripeConnectAccountId présent
//   - TalentProfile.stripeConnectOnboardingStatus=active
//   - amount > 0
//
// POST-TRAITEMENT (dryRun=false uniquement) :
//   Après le batch, pour chaque event dont des splits ont été payés :
//   Si tous les PayoutSplits talent_payout sont paid → EventPayout.status = 'completed'
//   Fix R3 : EventPayout.status restait 'processing' indéfiniment.
//
// RAISONS DE SKIP (non-fatal — split ignoré, batch continue) :
//   'escrow_not_released'     — event pas encore libéré
//   'no_connect_account'      — talent sans compte Connect
//   'connect_not_active'      — KYC pas complété (pending/restricted)
//   'amount_zero'             — split avec montant nul
//   'maxAmount_exceeded'      — plafond run atteint
//   'maxSplits_exceeded'      — nombre max splits atteint

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
import Stripe from 'npm:stripe@14.21.0';

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status, headers: { 'content-type': 'application/json' },
  });
}

function toCents(amount) {
  return Math.round(Number(amount) * 100);
}

// ── FinancialLedger double-entry (non-fatal) ──────────────────────────────────
async function writeLedgerPair(service, { entryType, debitAccount, creditAccount, amount_cents, eventId, stripeRef, payoutSplitId, note }) {
  try {
    const existing = await service.entities.FinancialLedger
      .filter({ eventId, stripeRef, entryType, debitCredit: 'debit' })
      .catch(() => []);
    if (existing && existing.length > 0) return { skipped: true };

    const nowIso = new Date().toISOString();
    const debitEntry = await service.entities.FinancialLedger.create({
      entryType, debitCredit: 'debit', accountCode: debitAccount,
      amount_cents, currency: 'CAD', eventId, stripeRef,
      payoutSplitId: payoutSplitId || null,
      note: `${note} [Dr ${debitAccount}]`, createdAt: nowIso,
    });
    const creditEntry = await service.entities.FinancialLedger.create({
      entryType, debitCredit: 'credit', accountCode: creditAccount,
      amount_cents, currency: 'CAD', eventId, stripeRef,
      payoutSplitId: payoutSplitId || null,
      relatedEntryId: debitEntry?.id || null,
      note: `${note} [Cr ${creditAccount}]`, createdAt: nowIso,
    });
    if (debitEntry?.id && creditEntry?.id) {
      await service.entities.FinancialLedger.update(debitEntry.id, { relatedEntryId: creditEntry.id }).catch(() => null);
    }
    return { debitId: debitEntry?.id, creditId: creditEntry?.id };
  } catch (e) {
    console.warn(`[batchExecutePayoutTransfers] Ledger write failed (non-fatal) ${entryType} ref=${stripeRef}:`, e?.message);
    return { error: e?.message };
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user   = await base44.auth.me();
    if (!user)              return json(401, { ok: false, error: 'Unauthorized' });
    if (user.role !== 'admin') return json(403, { ok: false, error: 'Admin only' });

    const body       = await req.json().catch(() => ({}));
    const dryRun     = body.dryRun     !== false; // défaut true — sécurité
    const filterEventId = body.eventId || null;
    const maxAmount  = Number(body.maxAmount)  || 1000;  // plafond CAD par run
    const maxSplits  = Number(body.maxSplits)  || 50;    // max splits par run
    const nowIso     = new Date().toISOString();

    const service = base44.asServiceRole;
    const stripe  = dryRun ? null : new Stripe(Deno.env.get('STRIPE_SECRET_KEY'));

    console.log(`[batchExecutePayoutTransfers] v3 START dryRun=${dryRun} eventId=${filterEventId || 'all'} maxAmount=${maxAmount} maxSplits=${maxSplits}`);

    // ── 1. Charger tous les PayoutSplits pending talent_payout ───────────────
    const allSplits = await service.entities.PayoutSplit.filter({
      status:   'pending',
      roleType: 'talent_payout',
    }).catch(() => []);

    const candidates = (allSplits || []).filter(s => {
      if (filterEventId && s.eventId !== filterEventId) return false;
      if (!(Number(s.amount_cents) > 0) && !(Number(s.amount) > 0)) return false;
      return true;
    });

    console.log(`[batchExecutePayoutTransfers] ${candidates.length} candidates (avant guards)`);

    // ── 2. Pré-charger events et profiles en batch ───────────────────────────
    const eventIds     = [...new Set(candidates.map(s => s.eventId))];
    const recipientIds = [...new Set(candidates.map(s => s.recipientUserId).filter(Boolean))];

    const eventCache   = {};
    const profileCache = {};

    for (const eid of eventIds) {
      const ev = await service.entities.Event.get(eid).catch(() => null);
      if (ev) eventCache[eid] = ev;
    }

    for (const uid of recipientIds) {
      const profiles = await service.entities.TalentProfile.filter({ userId: uid }).catch(() => []);
      if (profiles?.[0]) profileCache[uid] = profiles[0];
    }

    // ── 3. Évaluer l'éligibilité de chaque split ─────────────────────────────
    const results     = [];
    let processed     = 0;
    let skipped       = 0;
    let failed        = 0;
    let runAmount     = 0;
    let splitsCount   = 0;

    for (const split of candidates) {
      const splitId = split.id;
      const amount  = Number(split.amount_cents) > 0
        ? Number(split.amount_cents) / 100
        : Number(split.amount) || 0;

      // ── Guards ──────────────────────────────────────────────────────────────
      const event   = eventCache[split.eventId];
      if (!event || event.escrowStatus !== 'released') {
        results.push({ splitId, eventId: split.eventId, recipientUserId: split.recipientUserId, amount, status: 'skipped', reason: 'escrow_not_released' });
        skipped++;
        continue;
      }

      const profile = profileCache[split.recipientUserId];
      if (!profile?.stripeConnectAccountId) {
        results.push({ splitId, eventId: split.eventId, recipientUserId: split.recipientUserId, amount, status: 'skipped', reason: 'no_connect_account' });
        skipped++;
        continue;
      }

      if (profile.stripeConnectOnboardingStatus !== 'active') {
        results.push({ splitId, eventId: split.eventId, recipientUserId: split.recipientUserId, amount, status: 'skipped', reason: `connect_not_active:${profile.stripeConnectOnboardingStatus}` });
        skipped++;
        continue;
      }

      const amount_cents = toCents(amount);
      if (amount_cents <= 0) {
        results.push({ splitId, eventId: split.eventId, recipientUserId: split.recipientUserId, amount, status: 'skipped', reason: 'amount_zero' });
        skipped++;
        continue;
      }

      // Plafond run
      if (splitsCount >= maxSplits) {
        results.push({ splitId, eventId: split.eventId, recipientUserId: split.recipientUserId, amount, status: 'skipped', reason: 'maxSplits_exceeded' });
        skipped++;
        continue;
      }
      if (runAmount + amount > maxAmount) {
        results.push({ splitId, eventId: split.eventId, recipientUserId: split.recipientUserId, amount, status: 'skipped', reason: 'maxAmount_exceeded' });
        skipped++;
        continue;
      }

      // ── DryRun : simulation sans exécution ───────────────────────────────
      if (dryRun) {
        results.push({
          splitId,
          eventId:         split.eventId,
          recipientUserId: split.recipientUserId,
          amount,
          amount_cents,
          connectAccount:  profile.stripeConnectAccountId,
          status:          'would_transfer',
          reason:          null,
        });
        runAmount   += amount;
        splitsCount += 1;
        processed++;
        continue;
      }

      // ── Exécution réelle ─────────────────────────────────────────────────
      try {
        // v2 fix : source_transaction retiré pour les events avec balance payée.
        //
        // Stripe règle : source_transaction plafonne le transfer au montant de la charge.
        // Dans Micro Rave, dépôt (20%) et balance (80%) sont sur 2 PI séparés.
        // Si on ancre sur le PI dépôt → transfer plafonné à 20% → erreur sur tout split > dépôt.
        //
        // Solution : utiliser source_transaction seulement pour les events dépôt-only
        // (balancePaid = 0) ET si le split amount <= escrowAmount.
        // Pour les events avec balance payée : transfer sans source_transaction.
        // transfer_group + metadata assurent la traçabilité sans contrainte de montant.
        const hasBalancePaid = Number(event.balancePaid || 0) > 0;
        let resolvedChargeId = null;

        if (!hasBalancePaid && event.stripePaymentIntentId) {
          // Event dépôt-only : on peut ancrer sur la charge du dépôt
          // seulement si le split amount <= escrowAmount (sinon on retombe dans le même bug)
          if (amount <= Number(event.escrowAmount || 0)) {
            try {
              const pi = await stripe.paymentIntents.retrieve(event.stripePaymentIntentId);
              resolvedChargeId = pi.latest_charge || null;
            } catch (e) {
              console.warn(`[batchExecutePayoutTransfers] v2 PI charge resolve failed event=${split.eventId}:`, e?.message);
              resolvedChargeId = null; // continuer sans source_transaction
            }
          }
        }
        // Events avec balance payée : resolvedChargeId reste null → pas de source_transaction
        // L'argent est dans le compte platform (dépôt capturé + balance capturée).

        // Vérification live compte Connect
        const account = await stripe.accounts.retrieve(profile.stripeConnectAccountId);
        if (!account.charges_enabled || !account.payouts_enabled) {
          // Sync statut en DB
          await service.entities.TalentProfile.update(profile.id, {
            stripeConnectOnboardingStatus: 'restricted',
          }).catch(() => null);
          results.push({ splitId, eventId: split.eventId, recipientUserId: split.recipientUserId, amount, status: 'skipped', reason: 'connect_restricted_live' });
          skipped++;
          continue;
        }

        // Stripe transfer
        const transfer = await stripe.transfers.create(
          {
            amount:      amount_cents,
            currency:    (split.currency || 'cad').toLowerCase(),
            destination: profile.stripeConnectAccountId,
            description: `Cachet Micro Rave — event ${split.eventId} — split ${splitId}`,
            metadata: {
              payoutSplitId:           splitId,
              eventId:                 split.eventId,
              recipientUserId:         split.recipientUserId,
              effectiveCommissionRate: String(split.effectiveCommissionRate ?? ''),
              batchRun:                nowIso,
            },
            ...(resolvedChargeId ? { source_transaction: resolvedChargeId } : {}),
            transfer_group: `event_${split.eventId}`,
          },
          { idempotencyKey: `transfer_v2:${splitId}` }
          // v2 : clé différente de v1 (transfer:${splitId}) pour éviter le conflit
          // d'idempotence Stripe quand les paramètres ont changé entre versions
          // (v1 avait source_transaction, v2 ne l'a pas pour les events avec balance).
        );

        // Marquer split paid
        await service.entities.PayoutSplit.update(splitId, {
          status:           'paid',
          stripeTransferId: transfer.id,
          paidAt:           nowIso,
          updatedAt:        nowIso,
        });

        // FinancialLedger talent_transfer
        await writeLedgerPair(service, {
          entryType:     'talent_transfer',
          debitAccount:  'stripe_connect_transit',
          creditAccount: 'stripe_balance',
          amount_cents,
          eventId:       split.eventId,
          stripeRef:     transfer.id,
          payoutSplitId: splitId,
          note:          `Batch cachet — event ${split.eventId} — ${(amount_cents / 100).toFixed(2)}$ → ${profile.stripeConnectAccountId.slice(-8)}`,
        });

        // FinancialLedger commission_earned — chercher le fee split frère
        try {
          const feeSplits = await service.entities.PayoutSplit.filter({
            eventId:  split.eventId,
            payoutId: split.payoutId,
            roleType: 'platform_fee',
          }).catch(() => []);
          const talentSuffix = split.recipientUserId.slice(-6);
          const feeSplit = (feeSplits || []).find(f => f.note && f.note.includes(talentSuffix))
                        || (feeSplits || [])[0];

          if (feeSplit && Number(feeSplit.amount) > 0) {
            const fee_cents = toCents(feeSplit.amount);
            await writeLedgerPair(service, {
              entryType:     'commission_earned',
              debitAccount:  'escrow_liability',
              creditAccount: 'revenue_commission',
              amount_cents:  fee_cents,
              eventId:       split.eventId,
              stripeRef:     transfer.id,
              payoutSplitId: feeSplit.id,
              note:          `Batch commission — event ${split.eventId} — ${(fee_cents / 100).toFixed(2)}$`,
            });
            await service.entities.PayoutSplit.update(feeSplit.id, {
              status: 'paid', paidAt: nowIso, updatedAt: nowIso,
            }).catch(() => null);
          }
        } catch (feeErr) {
          console.warn(`[batchExecutePayoutTransfers] commission_earned failed (non-fatal) split=${splitId}:`, feeErr?.message);
        }

        results.push({
          splitId,
          eventId:          split.eventId,
          recipientUserId:  split.recipientUserId,
          amount,
          amount_cents,
          stripeTransferId: transfer.id,
          connectAccount:   profile.stripeConnectAccountId,
          status:           'paid',
          reason:           null,
        });

        runAmount   += amount;
        splitsCount += 1;
        processed++;
        console.log(`[batchExecutePayoutTransfers] PAID split=${splitId} transfer=${transfer.id} amount=${amount}`);

      } catch (transferErr) {
        console.error(`[batchExecutePayoutTransfers] FAILED split=${splitId}:`, transferErr?.message);
        results.push({
          splitId,
          eventId:         split.eventId,
          recipientUserId: split.recipientUserId,
          amount,
          status:          'failed',
          reason:          transferErr?.message,
        });
        failed++;
      }
    }


    // ── NO-SHOW REFUNDS (v3) ─────────────────────────────────────────────────
    // Second pass : rembourser le payeur pour chaque talent absent (no-show).
    // Ces splits ont roleType='talent_noshow_refund' et recipientUserId=null.
    // On résout le payeur via EventPaymentLog (stripeChargeId) ou EPR (PI).
    const noshowSplits = await service.entities.PayoutSplit.filter({
      status:   'pending',
      roleType: 'talent_noshow_refund',
    }).catch(() => []);

    const noshowCandidates = (noshowSplits || []).filter(s => {
      if (filterEventId && s.eventId !== filterEventId) return false;
      if (!(Number(s.amount_cents) > 0) && !(Number(s.amount) > 0)) return false;
      return true;
    });

    console.log(`[batchExecutePayoutTransfers] v3 noshow candidates: ${noshowCandidates.length}`);

    for (const split of noshowCandidates) {
      const splitId      = split.id;
      const amount  = Number(split.amount_cents) > 0
        ? Number(split.amount_cents) / 100
        : Number(split.amount) || 0;
      const amount_cents = toCents(amount);

      if (amount_cents <= 0) {
        results.push({ splitId, eventId: split.eventId, amount, status: 'skipped', reason: 'noshow_amount_zero' });
        skipped++;
        continue;
      }

      // Guard escrow
      const event = eventCache[split.eventId]
        || await service.entities.Event.get(split.eventId).catch(() => null);
      if (!event || event.escrowStatus !== 'released') {
        results.push({ splitId, eventId: split.eventId, amount, status: 'skipped', reason: 'escrow_not_released' });
        skipped++;
        continue;
      }

      if (dryRun) {
        results.push({ splitId, eventId: split.eventId, amount, amount_cents, status: 'would_refund', reason: null });
        processed++;
        continue;
      }

      try {
        // ── Résoudre le chargeId pour le remboursement ──────────────────────
        // Priorité 1 : EventPaymentLog (stripeChargeId direct)
        let chargeId = null;
        let piId     = null;
        let logEntryId = null;

        const paymentLogs = await service.entities.EventPaymentLog
          .filter({ eventId: split.eventId }).catch(() => []);
        const capturedLogs = (paymentLogs || [])
          .filter(l => l.stripeChargeId && l.status !== 'refunded')
          .sort((a, b) => (a.sequenceNumber || 0) - (b.sequenceNumber || 0));

        if (capturedLogs.length > 0) {
          chargeId   = capturedLogs[0].stripeChargeId;
          logEntryId = capturedLogs[0].id;
        }

        // Priorité 2 : EPR.stripePaymentIntentId (fallback si EventPaymentLog absent)
        if (!chargeId) {
          const eventEprs = await service.entities.EventPaymentRequest
            .filter({ eventId: split.eventId }).catch(() => []);
          const approvedEpr = (eventEprs || []).find(e =>
            e.requestStatus === 'approved' && e.stripePaymentIntentId
          );
          if (approvedEpr) {
            piId = approvedEpr.stripePaymentIntentId;
          }
        }

        if (!chargeId && !piId) {
          results.push({ splitId, eventId: split.eventId, amount, status: 'skipped', reason: 'no_charge_for_refund' });
          skipped++;
          continue;
        }

        // ── Stripe refund ─────────────────────────────────────────────────
        const refundParams = {
          amount: amount_cents,
          reason: 'requested_by_customer',
          metadata: {
            payoutSplitId: splitId,
            eventId:       split.eventId,
            type:          'noshow_refund',
            batchRun:      nowIso,
          },
          ...(chargeId ? { charge: chargeId } : { payment_intent: piId }),
        };

        const refund = await stripe.refunds.create(
          refundParams,
          { idempotencyKey: `refund:${splitId}` }
        );

        // ── Marquer split paid ────────────────────────────────────────────
        await service.entities.PayoutSplit.update(splitId, {
          status:           'paid',
          stripeTransferId: refund.id, // re_xxx
          paidAt:           nowIso,
          updatedAt:        nowIso,
        });

        // ── FinancialLedger noshow_refund_issued ──────────────────────────
        // Dr refund_liability (on réduit le passif) → Cr stripe_balance (sortie)
        await writeLedgerPair(service, {
          entryType:     'noshow_refund_issued',
          debitAccount:  'refund_liability',
          creditAccount: 'stripe_balance',
          amount_cents,
          eventId:       split.eventId,
          stripeRef:     refund.id,
          payoutSplitId: splitId,
          note:          `No-show remboursé ${(amount_cents/100).toFixed(2)}$ — event ${split.eventId}`,
        });

        // ── Mettre à jour EventPaymentLog.refundedAmount ─────────────────
        if (logEntryId) {
          try {
            const logEntry = await service.entities.EventPaymentLog.get(logEntryId).catch(() => null);
            if (logEntry) {
              const newRefunded = Math.round(((Number(logEntry.refundedAmount) || 0) + amount) * 100) / 100;
              const isFullRefund = newRefunded >= (Number(logEntry.netAmount) || 0);
              await service.entities.EventPaymentLog.update(logEntryId, {
                refundedAmount: newRefunded,
                ...(isFullRefund ? { status: 'refunded' } : {}),
              });
            }
          } catch (logErr) {
            console.warn(`[batchExecutePayoutTransfers] v3 EventPaymentLog update failed (non-fatal):`, logErr?.message);
          }
        }

        results.push({
          splitId,
          eventId:  split.eventId,
          amount,
          amount_cents,
          refundId: refund.id,
          status:   'refunded',
          reason:   null,
        });

        runAmount   += amount;
        splitsCount += 1;
        processed++;
        console.log(`[batchExecutePayoutTransfers] v3 NOSHOW_REFUNDED split=${splitId} refund=${refund.id} amount=${amount}`);

      } catch (refundErr) {
        console.error(`[batchExecutePayoutTransfers] v3 NOSHOW_REFUND_FAILED split=${splitId}:`, refundErr?.message);
        results.push({ splitId, eventId: split.eventId, amount, status: 'failed', reason: refundErr?.message });
        failed++;
      }
    }

    // ── R3 fix: marquer EventPayout completed si tous ses splits talent sont payés ──
    // EventPayout.status reste 'processing' indéfiniment après generatePayoutSplits
    // car aucune fonction ne le passe à 'completed'. On le fait ici après le batch,
    // pour chaque eventId traité, si tous ses PayoutSplits talent_payout sont paid.
    if (!dryRun && processed > 0) {
      const processedEventIds = [...new Set(
        results.filter(r => r.status === 'paid').map(r => r.eventId)
      )];

      for (const eid of processedEventIds) {
        try {
          // Vérifier que tous les splits talent_payout de cet event sont paid
          const allTalentSplits = await service.entities.PayoutSplit.filter({
            eventId:  eid,
            roleType: 'talent_payout',
          }).catch(() => []);

          const allPaid = (allTalentSplits || []).length > 0 &&
            (allTalentSplits || []).every(s => s.status === 'paid');

          if (allPaid) {
            const payouts = await service.entities.EventPayout.filter({ eventId: eid }).catch(() => []);
            const payout  = (payouts || []).find(p => p.status === 'processing' || p.status === 'pending');
            if (payout) {
              await service.entities.EventPayout.update(payout.id, {
                status:    'completed',
                updatedAt: nowIso,
              });
              console.log(`[batchExecutePayoutTransfers] EVENTPAYOUT_COMPLETED eventId=${eid} payoutId=${payout.id}`);
            }
          }
        } catch (completionErr) {
          console.warn(`[batchExecutePayoutTransfers] EventPayout completion check failed eventId=${eid}:`, completionErr?.message);
        }
      }
    }

    const summary = {
      ok:          true,
      dryRun,
      processed,
      skipped,
      failed,
      totalAmount: Math.round(runAmount * 100) / 100,
      totalAmountCents: toCents(runAmount),
      candidatesCount: candidates.length,
      results,
    };

    console.log(
      `[batchExecutePayoutTransfers] v3 DONE dryRun=${dryRun} ` +
      `processed=${processed} skipped=${skipped} failed=${failed} ` +
      `totalAmount=${summary.totalAmount}$`
    );

    return json(200, summary);

  } catch (error) {
    console.error('[batchExecutePayoutTransfers] v1 FATAL:', error?.message);
    return json(500, { ok: false, error: error.message });
  }
});