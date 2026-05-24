// deploy: v13
// MIGRATION CENTS: tous les champs monétaires renommés en _cents (integer).
// CHANGEMENTS v11 — EventPaymentLog :
//   Ajout du helper writePaymentLog + écriture dans les 4 cas de paiement
//   (deposit, balance, adjustment, deposit_supplement).
//   EventPaymentLog = registre immuable par PI : séquence, qui a payé,
//   montants brut/net/frais, stripeChargeId pour remboursements futurs.
// CHANGEMENTS v10 — Dépréciation effective PaymentLedger :
//   Les 3 writes PaymentLedger (balance_secured, deposit_supplement, dépôt initial)
//   sont supprimés. FinancialLedger est désormais la seule source de vérité.
//   Le PaymentLedger reste en lecture pour l'historique pré-14 avril mais n'est
//   plus alimenté par aucune nouvelle transaction.
// confirmStripePayment — Confirme le paiement après succès Stripe
//
// CHANGEMENTS v5 — Fix race condition ledger (dépôt initial) :
//
//   CAUSE DU BUG :
//   Deux appelants simultanés arrivent pour le même token —
//   typiquement le frontend (redirect Stripe) ET le webhook Stripe.
//   Les deux lisent request.requestStatus='pending' avant que l'un écrive.
//   Le guard filter(PaymentLedger, stripeRef) était TOCTOU : les deux lisent []
//   avant que l'un écrive → doublon avec amountEscrow=0 dans le ledger.
//
//   FIX :
//   EPR marquée 'approved' EN PREMIER, avant l'escrow et le ledger.
//   Tout appel concurrent trouvant requestStatus='approved' au guard
//   initial (ligne 2) retournera alreadyPaid=true immédiatement.
//   Guard filter(stripeRef) conservé comme filet secondaire.
//
//   v4 inchangé : deposit_supplement, balance triple fallback.
//
// CHANGEMENTS v6 — FinancialLedger cash-in (Fix architecture cible Bloc C) :
//
//   PROBLÈME v5 :
//   confirmStripePayment écrivait uniquement dans PaymentLedger (mutable, hors enum).
//   FinancialLedger ne recevait aucune entrée cash-in — bilan et P&L impossibles.
//   La trace Stripe → DB était : PI autorisé → Event.escrow_amount_cents écrit,
//   mais aucune écriture double-entry ne documentait le mouvement.
//
//   FIX :
//   Après chaque type de paiement confirmé, créer les entrées FinancialLedger
//   en double-entry (1 debit + 1 credit), append-only, amount_cents entier.
//   PaymentLedger conservé pour rétrocompatibilité historique — ne plus écrire
//   de nouvelles fonctions dessus.
//
//   ÉCRITURES AJOUTÉES :
//   Dépôt initial :
//     Dr stripe_clearing    → Cr escrow_liability   (deposit_authorized)
//   Balance :
//     Dr stripe_balance     → Cr balance_liability   (balance_received)
//   Complément dépôt :
//     Dr stripe_clearing    → Cr escrow_liability   (deposit_authorized)
//
//   IDEMPOTENCE :
//   Guard stripeRef avant chaque paire d'entrées — un appel rejoué ne crée
//   pas de doublon si les entrées existent déjà (même stripeRef + même entryType).
//
// CHANGEMENTS v13 — Enrichissement notes FinancialLedger (traçabilité financière) :
//
//   PROBLÈME v12 :
//   Les notes des entrées FinancialLedger n'incluaient pas event.title.
//   Les exports du ledger étaient illisibles sans lookup externe sur chaque eventId.
//   event (ev) était déjà chargé — aucun coût supplémentaire.
//
//   FIX :
//   Toutes les notes writeLedgerPair incluent désormais event.title entre guillemets
//   pour permettre la lecture directe des exports sans jointure.
//   Aucune modification du flux Stripe — ce fichier ne crée pas de PaymentIntent,
//   il retrieve le PI existant (déjà enrichi par initiatePaymentForRequest v3).
//
// Input : { token, paymentIntentId }

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
import Stripe from 'npm:stripe@14';

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

// ── Écriture FinancialLedger double-entry (append-only) ─────────────────────
// ── Helper : EventPaymentLog ───────────────────────────────────────────────
// Une entrée immuable par PI capturé. Source de vérité pour remboursements
// ordonnés (FIFO inversé) et réconciliation Stripe.
async function writePaymentLog(service, {
  eventId, paymentRequestId, stripePaymentIntentId, stripeChargeId,
  payerUserId, payerEmail, payerName, paymentType,
  requested_amount_cents, stripe_fee_amount_cents, net_amount_cents,
}) {
  try {
    const existing = await service.entities.EventPaymentLog
      .filter({ stripePaymentIntentId }).catch(() => []);
    if (existing?.length > 0) return existing[0];

    const allLogs = await service.entities.EventPaymentLog
      .filter({ eventId }).catch(() => []);
    const sequenceNumber = (allLogs?.length || 0) + 1;

    const nowIso = new Date().toISOString();
    return await service.entities.EventPaymentLog.create({
      eventId,
      paymentRequestId:    paymentRequestId || null,
      stripePaymentIntentId,
      stripeChargeId:      stripeChargeId   || null,
      payerUserId:         payerUserId      || null,
      payerEmail:          payerEmail       || null,
      payerName:           payerName        || null,
      paymentType,
      requested_amount_cents:     requested_amount_cents  || 0,
      stripe_fee_amount_cents:     stripe_fee_amount_cents  || 0,
      net_amount_cents:           net_amount_cents        || 0,
      sequenceNumber,
      status:              'captured',
      refunded_amount_cents:      0,
      capturedAt:          nowIso,
      createdAt:           nowIso,
    });
  } catch (e) {
    console.warn('[writePaymentLog] non-fatal:', e?.message);
    return null;
  }
}

// Crée exactement 2 entrées : 1 debit + 1 credit.
// Non-fatal : une erreur ledger ne bloque jamais le flux Stripe.
// Idempotence : vérifie stripeRef + entryType avant écriture.
async function writeLedgerPair(service, { entryType, debitAccount, creditAccount, amount_cents, eventId, stripeRef, payerUserId, note }) {
  try {
    // Guard idempotence : si une entrée debit avec ce stripeRef + entryType existe déjà, skip
    const existing = await service.entities.FinancialLedger
      .filter({ eventId, stripeRef, entryType, debitCredit: 'debit' })
      .catch(() => []);
    if (existing && existing.length > 0) {
      console.log(`[FinancialLedger] SKIP idempotent stripeRef=${stripeRef} entryType=${entryType}`);
      return { skipped: true };
    }

    const nowIso = new Date().toISOString();
    const debitEntry = await service.entities.FinancialLedger.create({
      entryType,
      debitCredit:   'debit',
      accountCode:   debitAccount,
      amount_cents,
      currency:      'CAD',
      eventId,
      stripeRef,
      payerUserId:   payerUserId || null,
      note:          `${note} [Dr ${debitAccount}]`,
      createdAt:     nowIso,
    });

    const creditEntry = await service.entities.FinancialLedger.create({
      entryType,
      debitCredit:   'credit',
      accountCode:   creditAccount,
      amount_cents,
      currency:      'CAD',
      eventId,
      stripeRef,
      payerUserId:   payerUserId || null,
      relatedEntryId: debitEntry?.id || null,
      note:          `${note} [Cr ${creditAccount}]`,
      createdAt:     nowIso,
    });

    // Lier la contrepartie sur l'entrée debit
    if (debitEntry?.id && creditEntry?.id) {
      await service.entities.FinancialLedger.update(debitEntry.id, {
        relatedEntryId: creditEntry.id,
      }).catch(() => null); // non-fatal
    }

    console.log(`[FinancialLedger] WRITTEN entryType=${entryType} Dr=${debitAccount} Cr=${creditAccount} amount_cents=${amount_cents} ref=${stripeRef}`);
    return { debitId: debitEntry?.id, creditId: creditEntry?.id };
  } catch (e) {
    console.warn(`[FinancialLedger] write failed (non-fatal) entryType=${entryType} ref=${stripeRef}:`, e?.message);
    return { error: e?.message };
  }
}

Deno.serve(async (req) => {
  const base44  = createClientFromRequest(req);
  const service = base44.asServiceRole;

  const { token, paymentIntentId } = await req.json();
  if (!token || !paymentIntentId) {
    return json(400, { error: 'token et paymentIntentId requis' });
  }

  const rows    = await service.entities.EventPaymentRequest.filter({ secureToken: token });
  const request = rows?.[0];

  if (!request) return json(200, { ok: false, error: 'Demande introuvable' });
  if (request.requestStatus === 'approved') return json(200, { ok: true, alreadyPaid: true });

  const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'), { apiVersion: '2024-06-20' });
  // v8 — Retrieve avec expand billing_details pour capturer l'identité réelle du payeur.
  // billing_details.name + billing_details.email sont renseignés par Stripe Elements
  // quand le payeur saisit ses informations de carte. Ce sont les données vérifiées
  // par le réseau bancaire — elles peuvent différer du payerEmail désigné par l'organisateur.
  const pi = await stripe.paymentIntents.retrieve(paymentIntentId, {
    expand: ['payment_method'],
  });

  // Identité réelle du payeur — extraite des données Stripe vérifiées
  const billingDetails = pi.payment_method?.billing_details || {};
  const actualPayerName  = billingDetails.name  || pi.receipt_email?.split('@')[0] || null;
  const actualPayerEmail = billingDetails.email || pi.receipt_email || null;
  const stripeCustomerId = typeof pi.customer === 'string' ? pi.customer : pi.customer?.id || null;

  console.log(`[confirmStripePayment] v13 PAYER_IDENTITY payerName=${actualPayerName} payerEmail=${actualPayerEmail}`);

  if (pi.status !== 'requires_capture') {
    return json(200, { ok: false, error: `Statut Stripe inattendu : ${pi.status}` });
  }

  const evs = await service.entities.Event.filter({ id: request.eventId });
  const ev  = evs?.[0];
  if (!ev) return json(404, { ok: false, error: 'Événement introuvable' });

  // v13 — eventName résolu une fois, utilisé dans toutes les notes ledger
  const eventName = ev.title ?? ev.name ?? '';

  const nowIso = new Date().toISOString();

  // ── Détection du type ─────────────────────────────────────────────────────
  const isBalance =
    request.requestType === 'balance' ||
    (ev.stripeBalancePaymentIntentId && ev.stripeBalancePaymentIntentId === paymentIntentId) ||
    (typeof request.messageToPayer === 'string' && request.messageToPayer.includes('80%'));

  // S1 fix : les ajustements de programme (requestType='adjustment') sont traités
  // comme de l'argent réel entrant — capturé immédiatement, tracé dans le ledger
  // avec un entryType 'adjustment_received'. Sans ce cas, l'argent entre dans Stripe
  // sans écriture comptable → divergence croissante entre Stripe et le FinancialLedger.
  const isAdjustment = !isBalance && request.requestType === 'adjustment';

  const isDepositSupplement =
    !isBalance && !isAdjustment &&
    request.requestType === 'deposit' &&
    ev.escrowStatus === 'secured';

  // ── CAS BALANCE ──────────────────────────────────────────────────────────
  if (isBalance) {
    const balanceAmount = pi.amount;

    await service.entities.Event.update(ev.id, {
      stripeBalancePaymentIntentId: paymentIntentId,
      balance_paid_cents:   balanceAmount,
      balancePaidAt: nowIso,
    });

    try {
      await stripe.paymentIntents.capture(paymentIntentId);
      console.log(`[BALANCE_CAPTURED] eventId=${ev.id} amount=${balanceAmount}`);
    } catch (e) {
      console.warn(`[confirmStripePayment] balance capture error: ${e?.message}`);
    }

    // v10: PaymentLedger write supprimé — FinancialLedger est la seule source de vérité

    // v6: FinancialLedger cash-in double-entry
    // La balance est capturée immédiatement — argent réel reçu dans stripe_balance.
    // Dr stripe_balance (actif) → Cr balance_liability (passif — dû au talent/organisateur)
    // v13: note enrichie avec eventName pour lisibilité directe des exports
    await writeLedgerPair(service, {
      entryType:     'balance_received',
      debitAccount:  'stripe_balance',
      creditAccount: 'balance_liability',
      amount_cents:  Math.round(balanceAmount * 100),
      eventId:       ev.id,
      stripeRef:     paymentIntentId,
      payerUserId:   request.payerUserId || null,
      note:          `Balance 80% reçue — event ${ev.id} "${eventName}" — ${(balanceAmount / 100).toFixed(2)}$ CAD`,
    });

    await service.entities.EventPaymentRequest.update(request.id, {
      requestStatus:     'approved',
      stripePaymentIntentId: paymentIntentId,
      paidAt:            nowIso,
      actualPayerName:   actualPayerName  || null,
      actualPayerEmail:  actualPayerEmail || null,
      stripeReceiptEmail: actualPayerEmail || null,
      stripeCustomerId:  stripeCustomerId || null,
    });

    console.log(`[BALANCE_CONFIRMED] v13 eventId=${ev.id} eventName="${eventName}" pi=${paymentIntentId} amount=${balanceAmount}`);

    // EventPaymentLog — registre immuable de la transaction balance
    await writePaymentLog(service, {
      eventId:               ev.id,
      paymentRequestId:      request.id,
      stripePaymentIntentId: paymentIntentId,
      stripeChargeId:        pi.latest_charge || null,
      payerUserId:           request.payerUserId || null,
      payerEmail:            actualPayerEmail,
      payerName:             actualPayerName,
      paymentType:           'balance',
      requested_amount_cents:       request.requested_amount_cents || balanceAmount,
      stripe_fee_amount_cents:       request.stripe_fee_amount_cents || 0,
      net_amount_cents:             request.net_amount_cents || balanceAmount,
    });

    return json(200, { ok: true, type: 'balance', amount: balanceAmount });
  }

  // ── CAS COMPLÉMENT DE DÉPÔT ──────────────────────────────────────────────
  if (isDepositSupplement) {
    const supplementAmount = pi.amount;
    const previousEscrow   = Number(ev.escrow_amount_cents) || 0;
    const newEscrowAmount  = Math.round((previousEscrow + supplementAmount) * 100) / 100;

    try {
      await stripe.paymentIntents.capture(paymentIntentId);
      console.log(`[DEPOSIT_SUPPLEMENT_CAPTURED] eventId=${ev.id} +${supplementAmount} escrow=${previousEscrow}→${newEscrowAmount}`);
    } catch (e) {
      console.warn(`[confirmStripePayment] deposit supplement capture error: ${e?.message}`);
    }

    await service.entities.Event.update(ev.id, { escrow_amount_cents: newEscrowAmount });

    // v10: PaymentLedger write supprimé — FinancialLedger est la seule source de vérité

    // v6: FinancialLedger cash-in double-entry — complément dépôt
    // Capturé immédiatement — même traitement qu'un dépôt standard.
    // Dr stripe_clearing (autorisé) → Cr escrow_liability (séquestre étendu)
    // v13: note enrichie avec eventName
    await writeLedgerPair(service, {
      entryType:     'deposit_authorized',
      debitAccount:  'stripe_clearing',
      creditAccount: 'escrow_liability',
      amount_cents:  Math.round(supplementAmount * 100),
      eventId:       ev.id,
      stripeRef:     paymentIntentId,
      payerUserId:   request.payerUserId || null,
      note:          `Complément dépôt — event ${ev.id} "${eventName}" — +${(supplementAmount / 100).toFixed(2)}$ CAD (escrow ${(previousEscrow / 100).toFixed(2)} → ${(newEscrowAmount / 100).toFixed(2)})`,
    });

    await service.entities.EventPaymentRequest.update(request.id, {
      requestStatus:     'approved',
      stripePaymentIntentId: paymentIntentId,
      paidAt:            nowIso,
      actualPayerName:   actualPayerName  || null,
      actualPayerEmail:  actualPayerEmail || null,
      stripeReceiptEmail: actualPayerEmail || null,
      stripeCustomerId:  stripeCustomerId || null,
    });

    console.log(`[DEPOSIT_SUPPLEMENT_CONFIRMED] v13 eventId=${ev.id} eventName="${eventName}" newEscrow=${newEscrowAmount}`);

    await writePaymentLog(service, {
      eventId:               ev.id,
      paymentRequestId:      request.id,
      stripePaymentIntentId: paymentIntentId,
      stripeChargeId:        pi.latest_charge || null,
      payerUserId:           request.payerUserId || null,
      payerEmail:            actualPayerEmail,
      payerName:             actualPayerName,
      paymentType:           'deposit_supplement',
      requested_amount_cents:       request.requested_amount_cents || supplementAmount,
      stripe_fee_amount_cents:       request.stripe_fee_amount_cents || 0,
      net_amount_cents:             request.net_amount_cents || supplementAmount,
    });

    return json(200, { ok: true, type: 'deposit_supplement', amount: supplementAmount, newEscrowAmount });
  }

  // ── CAS DÉPÔT INITIAL ────────────────────────────────────────────────────
  //
  // PORTE D'IDEMPOTENCE (v5) — EPR marquée 'approved' avant toute écriture.
  // Tout appel concurrent arrivant après cette ligne trouvera
  // ── CAS AJUSTEMENT DE PROGRAMME ─────────────────────────────────────────
  // L'ajustement est capturé immédiatement (argent réel dû suite à modification
  // du lineup). Écriture comptable : adjustment_received dans FinancialLedger.
  // L'Event.balance_paid_cents est incrémenté pour maintenir la cohérence du bilan.
  if (isAdjustment) {
    const adjustmentAmount = pi.amount;

    // Capture immédiate — l'ajustement est de l'argent ferme, pas un escrow
    try {
      await stripe.paymentIntents.capture(paymentIntentId);
      console.log(`[ADJUSTMENT_CAPTURED] eventId=${ev.id} amount=${adjustmentAmount}`);
    } catch (e) {
      console.warn(`[confirmStripePayment] adjustment capture error: ${e?.message}`);
    }

    // Incrémenter balance_paid_cents pour refléter le montant total récolté
    const newBalancePaid = Math.round(((Number(ev.balance_paid_cents) || 0) + adjustmentAmount) * 100) / 100;
    await service.entities.Event.update(ev.id, {
      balance_paid_cents:   newBalancePaid,
      balancePaidAt: nowIso,
    });

    // Écriture comptable double-entrée
    // Dr stripe_balance (argent reçu) → Cr balance_liability (dû au talent)
    // v13: note enrichie avec eventName
    await writeLedgerPair(service, {
      entryType:     'adjustment_received',
      debitAccount:  'stripe_balance',
      creditAccount: 'balance_liability',
      amount_cents:  Math.round(adjustmentAmount * 100),
      eventId:       ev.id,
      stripeRef:     paymentIntentId,
      payerUserId:   request.payerUserId || null,
      note:          `Ajustement programme — event ${ev.id} "${eventName}" — ${request.adjustmentReason || 'sans motif'} — ${(adjustmentAmount / 100).toFixed(2)}$ CAD`,
    });

    await service.entities.EventPaymentRequest.update(request.id, {
      requestStatus:     'approved',
      stripePaymentIntentId: paymentIntentId,
      paidAt:            nowIso,
      actualPayerName:   actualPayerName  || null,
      actualPayerEmail:  actualPayerEmail || null,
      stripeReceiptEmail: actualPayerEmail || null,
      stripeCustomerId:  stripeCustomerId || null,
    });

    console.log(`[ADJUSTMENT_CONFIRMED] v13 eventId=${ev.id} eventName="${eventName}" pi=${paymentIntentId} amount=${adjustmentAmount} reason=${request.adjustmentReason}`);

    await writePaymentLog(service, {
      eventId:               ev.id,
      paymentRequestId:      request.id,
      stripePaymentIntentId: paymentIntentId,
      stripeChargeId:        pi.latest_charge || null,
      payerUserId:           request.payerUserId || null,
      payerEmail:            actualPayerEmail,
      payerName:             actualPayerName,
      paymentType:           'adjustment',
      requested_amount_cents:       request.requested_amount_cents || adjustmentAmount,
      stripe_fee_amount_cents:       request.stripe_fee_amount_cents || 0,
      net_amount_cents:             request.net_amount_cents || adjustmentAmount,
    });

    return json(200, {
      ok: true,
      type: 'adjustment',
      eventId: ev.id,
      adjustmentAmount,
      newBalancePaid,
    });
  }

  // requestStatus='approved' au guard initial et retournera alreadyPaid=true.
  // C'est la seule protection efficace sans transaction atomique native.
  //
  await service.entities.EventPaymentRequest.update(request.id, {
    requestStatus:     'approved',
    stripePaymentIntentId: paymentIntentId,
    paidAt:            nowIso,
    actualPayerName:   actualPayerName  || null,
    actualPayerEmail:  actualPayerEmail || null,
    stripeReceiptEmail: actualPayerEmail || null,
    stripeCustomerId:  stripeCustomerId || null,
  });

  // B15 fix: figer commissionRateApplied au moment du dépôt.
  // Le taux applicable est déterminé contractuellement quand l'organisateur
  // paie le dépôt — pas au moment du payout (où le tier peut avoir changé).
  // On stocke 'default_12pct' ici ; generatePayoutSplits lit le taux réel
  // depuis MembershipPlan, mais ce champ prouve qu'un taux a été observé.
  // Il sera enrichi par generatePayoutSplits avec le taux effectif appliqué.
  const preUpdatePayload = { stripePaymentIntentId: paymentIntentId };
  if (request.payerUserId) preUpdatePayload.payerUserId = request.payerUserId;
  if (!ev.commissionRateApplied) {
    // Marquer qu'un taux sera appliqué — valeur symbolique jusqu'au payout
    preUpdatePayload.commissionRateApplied = 'pending_payout';
  }
  await service.entities.Event.update(ev.id, preUpdatePayload);

  await base44.functions.invoke('transitionEscrowStatus', {
    eventId: ev.id, fromStatus: ev.escrowStatus || 'none', toStatus: 'securing',
    reason: 'confirmStripePayment v13 — dépôt PI enregistré',
  });

  const freshPi = await stripe.paymentIntents.retrieve(paymentIntentId);
  if (freshPi.status === 'requires_capture') {
    await service.entities.Event.update(ev.id, { escrow_amount_cents: freshPi.amount });
    await base44.functions.invoke('transitionEscrowStatus', {
      eventId: ev.id, fromStatus: 'securing', toStatus: 'secured',
      reason: 'confirmStripePayment v13 — requires_capture détecté synchrone',
    });
    console.log(`[ESCROW_SECURED_SYNC] eventId=${ev.id} eventName="${eventName}" escrow_amount_cents=${freshPi.amount} (${freshPi.amount / 100}$)`);
  }

  // v10: PaymentLedger write supprimé — FinancialLedger est la seule source de vérité

  // v6: FinancialLedger cash-in double-entry — dépôt initial
  // PI en requires_capture : l'argent est AUTORISÉ par la carte mais pas encore reçu.
  // Le dépôt sera physiquement capturé plus tard par releaseEventEscrow.
  // Dr stripe_clearing (en transit autorisé) → Cr escrow_liability (passif séquestre)
  // v13: note enrichie avec eventName
  await writeLedgerPair(service, {
    entryType:     'deposit_authorized',
    debitAccount:  'stripe_clearing',
    creditAccount: 'escrow_liability',
    amount_cents:  freshPi.amount,
    eventId:       ev.id,
    stripeRef:     paymentIntentId,
    payerUserId:   request.payerUserId || null,
    note:          `Dépôt 20% autorisé (requires_capture) — event ${ev.id} "${eventName}" — ${(freshPi.amount / 100).toFixed(2)}$ CAD`,
  });

  console.log(`[DEPOSIT_CONFIRMED] v13 eventId=${ev.id} eventName="${eventName}" pi=${paymentIntentId}`);

  // EventPaymentLog — registre immuable du dépôt initial
  await writePaymentLog(service, {
    eventId:               ev.id,
    paymentRequestId:      request.id,
    stripePaymentIntentId: paymentIntentId,
    stripeChargeId:        freshPi.latest_charge || null,
    payerUserId:           request.payerUserId || null,
    payerEmail:            actualPayerEmail,
    payerName:             actualPayerName,
    paymentType:           'deposit',
    requested_amount_cents:       request.requested_amount_cents || (freshPi.amount),
    stripe_fee_amount_cents:       request.stripe_fee_amount_cents || 0,
    net_amount_cents:             request.net_amount_cents || (freshPi.amount),
  });

  const organizerId = ev.organizerId || ev.organizerUserId;
  const payerIsDiff = request.payerUserId ? request.payerUserId !== organizerId : true;
  if (payerIsDiff && organizerId) {
    const profiles = await service.entities.TalentProfile.filter({ userId: organizerId }).catch(() => []);
    const profile  = profiles?.[0];
    if (profile) {
      const earned = Array.isArray(profile.earnedRoles) ? profile.earnedRoles : [];
      if (!earned.includes('Vendeur')) {
        await service.entities.TalentProfile.update(profile.id, { earnedRoles: [...earned, 'Vendeur'] });
      }
    }
  }

  if (organizerId) {
    const orgUser = (await service.entities.User.filter({ id: organizerId }).catch(() => []))?.[0];
    if (orgUser?.email) {
      try {
        await service.integrations.Core.SendEmail({
          to: orgUser.email,
          subject: `✅ Dépôt reçu — ${request.requested_amount_cents} $ CAD`,
          body: `Bonjour,\n\nLe dépôt de ${request.requested_amount_cents} $ CAD a été reçu pour l'événement "${ev.title}".\n\nMicro Rave`,
          from_name: 'Micro Rave',
        });
      } catch (e) { console.warn('[confirmStripePayment] email org failed:', e.message); }
    }
  }

  return json(200, { ok: true, type: 'deposit' });
});