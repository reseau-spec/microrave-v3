// deploy: v1
// releaseOrphanedEscrow — Traite les events avec escrowStatus='secured'
// mais event.status IN ('completed', 'cancelled', 'aborted').
//
// CAS D'USAGE :
//   captureAllPendingDeposits ne couvre que escrowStatus='securing'.
//   Les events completed/cancelled avec escrowStatus='secured' sont des
//   orphelins : le PI n'a jamais été capturé ni releasé. Si on ne les
//   traite pas dans la fenêtre de 7 jours Stripe, les fonds sont perdus.
//
// LOGIQUE :
//   Pour chaque event orphelin :
//   1. Vérifier le statut réel du PI côté Stripe
//   2. Si requires_capture : capturer le PI + créer l'EventPayout
//   3. Si succeeded (déjà capturé ailleurs) : juste créer l'EventPayout
//   4. Si cancelled/expired : marquer escrowStatus='expired', montant perdu
//   5. Transition escrowStatus → released (sauf si expired)
//
// ADMIN ONLY.
// Input optionnel : { eventId } pour traiter un seul event.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
import Stripe from 'npm:stripe@14';

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status, headers: { 'content-type': 'application/json' }
  });
}

const ORPHAN_STATUSES = ['completed', 'cancelled', 'aborted'];

Deno.serve(async (req) => {
  try {
    const base44  = createClientFromRequest(req);
    const service = base44.asServiceRole;
    if (!service) return json(503, { ok: false, error: 'Service role unavailable' });

    const user = await base44.auth.me().catch(() => null);
    if (!user || user.role !== 'admin') {
      return json(403, { ok: false, error: 'Admin only' });
    }

    const body        = await req.json().catch(() => ({}));
    const forceEventId = body.eventId || null;
    const dryRun      = body.dryRun === true; // si true: analyse sans modifier

    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'), { apiVersion: '2024-06-20' });
    const nowIso = new Date().toISOString();

    // Charger tous les events secured
    const securedEvents = await service.entities.Event.filter({
      escrowStatus: 'secured',
    }).catch(() => []);

    // Filtrer les orphelins : event terminal + escrow non released
    const orphans = (securedEvents || []).filter(ev =>
      ORPHAN_STATUSES.includes(ev.status) &&
      (!forceEventId || ev.id === forceEventId)
    );

    console.log(`[releaseOrphanedEscrow] v1 — ${orphans.length} orphan(s) trouvés (dryRun=${dryRun})`);

    if (orphans.length === 0) {
      return json(200, { ok: true, processed: 0, message: 'Aucun escrow orphelin trouvé.', results: [] });
    }

    const results = [];

    for (const ev of orphans) {
      const piId = ev.stripePaymentIntentId;

      if (!piId) {
        results.push({
          eventId:    ev.id, title: ev.title,
          action:     'SKIPPED_NO_PI',
          escrowAmount: ev.escrowAmount,
          message:    'Aucun stripePaymentIntentId sur cet event.',
        });
        continue;
      }

      let pi;
      try {
        pi = await stripe.paymentIntents.retrieve(piId);
      } catch (stripeErr) {
        results.push({
          eventId: ev.id, title: ev.title,
          action:  'ERROR_STRIPE_RETRIEVE', piId,
          message: stripeErr?.message,
        });
        continue;
      }

      const piStatus = pi.status;

      // ── PI requires_capture : capturer maintenant ─────────────────────────
      if (piStatus === 'requires_capture') {
        if (dryRun) {
          results.push({
            eventId: ev.id, title: ev.title, piId,
            action:  'DRY_RUN_WOULD_CAPTURE',
            amount:  pi.amount / 100,
            message: `PI valide, ${(pi.amount / 100).toFixed(2)}$ à capturer.`,
          });
          continue;
        }

        let captured;
        try {
          captured = await stripe.paymentIntents.capture(piId);
        } catch (captureErr) {
          results.push({
            eventId: ev.id, title: ev.title, piId,
            action:  'ERROR_CAPTURE', message: captureErr?.message,
          });
          continue;
        }

        const capturedAmount = captured.amount_received / 100;

        // Mettre à jour l'escrowAmount avec le montant réellement capturé
        await service.entities.Event.update(ev.id, {
          escrowAmount: capturedAmount,
        }).catch(e => console.warn(`event update escrowAmount failed: ${e?.message}`));

        // Transition secured → released via la fonction dédiée
        await base44.functions.invoke('transitionEscrowStatus', {
          eventId:    ev.id,
          fromStatus: 'secured',
          toStatus:   'released',
          reason:     `releaseOrphanedEscrow v1 — capture manuelle admin (${nowIso})`,
        }).catch(e => console.warn(`transition failed: ${e?.message}`));

        // Créer l'EventPayout si absent
        const existingPayouts = await service.entities.EventPayout
          .filter({ eventId: ev.id }).catch(() => []);
        const hasActivePayout = (existingPayouts || []).some(p =>
          ['pending', 'processing', 'completed'].includes(p.status)
        );

        if (!hasActivePayout) {
          await service.entities.EventPayout.create({
            eventId:         ev.id,
            totalGrossAmount: capturedAmount,
            status:          'pending',
            triggerDate:     nowIso,
            createdAt:       nowIso,
            updatedAt:       nowIso,
          }).catch(e => console.warn(`EventPayout create failed: ${e?.message}`));
        }

        // Entrée ledger
        try {
          await service.entities.PaymentLedger.create({
            eventId:        ev.id,
            payerUserId:    ev.payerUserId || null,
            payeeUserId:    ev.organizerId || ev.organizerUserId || null,
            amountTotal:    capturedAmount,
            amountEscrow:   capturedAmount,
            amountReleased: capturedAmount,
            stripeRef:      piId,
            status:         'released',
          });
        } catch (e) {
          console.warn(`ledger create failed: ${e?.message}`);
        }

        results.push({
          eventId: ev.id, title: ev.title, piId,
          action:  'CAPTURED_AND_RELEASED',
          amount:  capturedAmount,
          message: `PI capturé et escrow released. EventPayout ${hasActivePayout ? 'existant conservé' : 'créé'}.`,
        });
        console.log(`[releaseOrphanedEscrow] CAPTURED eventId=${ev.id} amount=${capturedAmount}`);

      // ── PI succeeded : déjà capturé, juste relaser et créer payout ────────
      } else if (piStatus === 'succeeded') {
        const capturedAmount = pi.amount_received / 100 || Number(ev.escrowAmount) || 0;

        if (dryRun) {
          results.push({
            eventId: ev.id, title: ev.title, piId,
            action:  'DRY_RUN_ALREADY_CAPTURED',
            amount:  capturedAmount,
            message: `PI déjà capturé (succeeded). Release + payout à créer.`,
          });
          continue;
        }

        await base44.functions.invoke('transitionEscrowStatus', {
          eventId: ev.id, fromStatus: 'secured', toStatus: 'released',
          reason: `releaseOrphanedEscrow v1 — PI déjà succeeded, release admin`,
        }).catch(e => console.warn(`transition failed: ${e?.message}`));

        const existingPayouts = await service.entities.EventPayout
          .filter({ eventId: ev.id }).catch(() => []);
        if (!(existingPayouts || []).some(p => ['pending','processing','completed'].includes(p.status))) {
          await service.entities.EventPayout.create({
            eventId: ev.id, totalGrossAmount: capturedAmount,
            status: 'pending', triggerDate: nowIso, createdAt: nowIso, updatedAt: nowIso,
          }).catch(e => console.warn(`EventPayout create failed: ${e?.message}`));
        }

        results.push({
          eventId: ev.id, title: ev.title, piId,
          action: 'ALREADY_CAPTURED_RELEASED',
          amount: capturedAmount,
          message: 'PI déjà capturé côté Stripe. Escrow transitionné released, EventPayout créé.',
        });

      // ── PI cancelled ou expiré : fonds perdus ────────────────────────────
      } else if (['canceled', 'requires_payment_method'].includes(piStatus)) {
        if (dryRun) {
          results.push({
            eventId: ev.id, title: ev.title, piId,
            action:  'DRY_RUN_EXPIRED',
            amount:  0,
            message: `PI ${piStatus} — fonds irrécupérables. escrowAmount=${ev.escrowAmount}$ sera mis à 0.`,
          });
          continue;
        }

        await service.entities.Event.update(ev.id, {
          escrowStatus: 'expired',
          escrowAmount: 0,
        }).catch(e => console.warn(`event update expired failed: ${e?.message}`));

        results.push({
          eventId: ev.id, title: ev.title, piId,
          action:  'EXPIRED_FUNDS_LOST',
          amount:  0,
          lostAmount: Number(ev.escrowAmount) || 0,
          message: `PI ${piStatus}. ${ev.escrowAmount}$ irrécupérables. escrowStatus → expired.`,
        });
        console.log(`[releaseOrphanedEscrow] EXPIRED eventId=${ev.id} lost=${ev.escrowAmount}`);

      // ── Autre statut PI ───────────────────────────────────────────────────
      } else {
        results.push({
          eventId: ev.id, title: ev.title, piId,
          action:  `UNKNOWN_PI_STATUS_${piStatus.toUpperCase()}`,
          message: `Statut PI inattendu: ${piStatus}. Vérification manuelle requise.`,
        });
      }
    }

    // Résumé
    const captured  = results.filter(r => r.action === 'CAPTURED_AND_RELEASED');
    const released  = results.filter(r => r.action === 'ALREADY_CAPTURED_RELEASED');
    const expired   = results.filter(r => r.action === 'EXPIRED_FUNDS_LOST');
    const skipped   = results.filter(r => r.action.startsWith('SKIPPED') || r.action.startsWith('DRY_RUN'));
    const errors    = results.filter(r => r.action.startsWith('ERROR'));

    const totalRecovered = [...captured, ...released].reduce((s, r) => s + (r.amount || 0), 0);
    const totalLost      = expired.reduce((s, r) => s + (r.lostAmount || 0), 0);

    return json(200, {
      ok:             true,
      dryRun,
      processed:      results.length,
      captured:       captured.length,
      alreadyCaptured: released.length,
      expired:        expired.length,
      skipped:        skipped.length,
      errors:         errors.length,
      totalRecoveredCAD: totalRecovered,
      totalLostCAD:   totalLost,
      results,
    });

  } catch (error) {
    console.error('[releaseOrphanedEscrow]', error?.message);
    return json(500, { ok: false, error: error?.message });
  }
});