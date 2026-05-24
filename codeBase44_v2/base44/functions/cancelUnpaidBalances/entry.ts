// deploy: v4
// cancelUnpaidBalances — Cron quotidien.
//
// LOGIQUE v3 :
//   Annulation SYSTÈME (balance non payée à J-6).
//   Aucun remboursement (dépôt < J-7 selon règle).
//   Distribution du dépôt aux talents via generatePayoutSplits.
//   Commission calculée depuis MembershipPlan × SOTS — jamais hardcodée.
//
// CHAMPS D'ANNULATION :
//   cancelledBySystem: true
//   cancellationReason: 'balance_unpaid_auto'
//   cancellationNote: 'Annulation automatique — balance non réglée avant J-6'
//
// PIPELINE :
//   1. Capturer le dépôt Stripe si encore en requires_capture
//   2. Annuler l'event avec les champs système
//   3. Créer EventPayout si absent
//   4. Appeler generatePayoutSplits → distribue le dépôt selon commission + SOTS réels
//   5. Notifier organisateur et talents (in-app via notification, pas email pour talents)
//
// CHANGEMENTS v4 — Fix R4 :
//   Après la capture Stripe et l'annulation, transition escrowStatus
//   secured→released via transitionEscrowStatus (non-fatal).

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import Stripe from 'npm:stripe@14.21.0';

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status, headers: { 'content-type': 'application/json' }
  });
}

function asArray(v) { return Array.isArray(v) ? v : []; }
function round2(n) { return Math.round(n * 100) / 100; }

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const service = base44.asServiceRole;
    if (!service) return json(503, { ok: false, error: 'Service role unavailable' });

    const user = await base44.auth.me().catch(() => null);
    if (user && user.role !== 'admin') {
      return json(403, { ok: false, error: 'Admin only' });
    }

    const body = await req.json().catch(() => ({}));
    const forceEventId = body.eventId || null; // pour tests manuels

    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'), { apiVersion: '2024-06-20' });
    const now = new Date();
    const nowIso = now.toISOString();
    const TERMINAL = ['completed', 'cancelled', 'aborted'];

    const allEvents = await service.entities.Event.filter({
      escrowStatus: 'secured',
    }).catch(() => []);

    const overdue = asArray(allEvents).filter(ev => {
      if (TERMINAL.includes(ev.status)) return false;
      if (ev.stripeBalancePaymentIntentId) return false; // balance déjà payée
      if (!ev.balanceDueDate) return false;
      if (forceEventId && ev.id !== forceEventId) return false;
      return new Date(ev.balanceDueDate) < now;
    });

    console.log(`[cancelUnpaidBalances] v3 — ${overdue.length} event(s) en retard`);

    const results = [];

    for (const ev of overdue) {
      try {
        // ── 1. Capturer le dépôt si encore en requires_capture ────────────────
        let escrowAmount = Number(ev.escrowAmount) || 0;
        if (ev.stripePaymentIntentId) {
          try {
            const pi = await stripe.paymentIntents.retrieve(ev.stripePaymentIntentId);
            if (pi.status === 'requires_capture') {
              const captured = await stripe.paymentIntents.capture(ev.stripePaymentIntentId);
              escrowAmount = round2(captured.amount_received / 100);
              await service.entities.Event.update(ev.id, { escrowAmount });
              console.log(`[cancelUnpaidBalances] dépôt capturé: ${escrowAmount}$`);
            } else if (pi.status === 'canceled' || pi.status === 'payment_failed') {
              console.warn(`[cancelUnpaidBalances] PI expiré/échoué pour eventId=${ev.id} — dépôt absent`);
              escrowAmount = 0;
            }
          } catch (stripeErr) {
            console.warn(`[cancelUnpaidBalances] capture error: ${stripeErr?.message}`);
          }
        }

        // ── 2. Annuler l'event (système) ──────────────────────────────────────
        await service.entities.Event.update(ev.id, {
          status:             'cancelled',
          cancelledAt:        nowIso,
          cancelledBy:        null,
          cancelledBySystem:  true,
          cancellationReason: 'balance_unpaid_auto',
          cancellationNote:   'Annulation automatique — solde de 80% non réglé avant la date limite.',
          completedAt:        nowIso, // requis par generatePayoutSplits
        });

        // ── v4 Fix R4 : synchroniser escrowStatus → released ─────────────────
        // cancelUnpaidBalances capturait le PI Stripe (étape 1) mais ne mettait
        // pas à jour escrowStatus — restait 'secured' après annulation système.
        try {
          await base44.functions.invoke('transitionEscrowStatus', {
            eventId: ev.id,
            fromStatus: 'secured',
            toStatus:   'released',
            reason:     'cancelUnpaidBalances v4 — annulation système balance_unpaid_auto',
          });
          console.log(`[cancelUnpaidBalances] v4 escrow secured→released eventId=${ev.id}`);
        } catch (escrowErr) {
          // Non-fatal — l'annulation de l'event et la capture Stripe ont réussi
          console.warn(`[cancelUnpaidBalances] v4 escrow transition failed (non-fatal): ${escrowErr?.message}`);
        }

        // ── 3. Créer EventPayout si absent ────────────────────────────────────
        const existing = await service.entities.EventPayout.filter({ eventId: ev.id }).catch(() => []);
        if (!existing?.length) {
          await service.entities.EventPayout.create({
            eventId:          ev.id,
            status:           'pending',
            totalGrossAmount: Number(ev.budget) || 0,
            triggerDate:      nowIso,
            createdAt:        nowIso,
            updatedAt:        nowIso,
          });
        }

        // ── 4. Distribuer le dépôt aux talents ───────────────────────────────
        // generatePayoutSplits détecte status='cancelled' + cancellationReason='balance_unpaid_auto'
        // et distribue escrowAmount proportionnellement selon les LineupPlacements.
        // Commission = MembershipPlan.commissionRate × modulation SOTS — jamais hardcodée.
        // Aucune commission fixe de 5% — chaque talent est traité selon son propre forfait.
        if (escrowAmount > 0) {
          try {
            const splitResult = await base44.functions.invoke('generatePayoutSplits', {
              eventId: ev.id,
            });
            console.log(`[cancelUnpaidBalances] splits générés: ${splitResult?.data?.splits} splits`);
          } catch (splitErr) {
            console.warn(`[cancelUnpaidBalances] generatePayoutSplits error: ${splitErr?.message}`);
          }
        } else {
          console.warn(`[cancelUnpaidBalances] escrowAmount=0 pour eventId=${ev.id} — aucun split`);
        }

        // ── 5. Notifier l'organisateur (email) ────────────────────────────────
        const orgId = ev.organizerId || ev.organizerUserId;
        if (orgId) {
          try {
            const orgUsers = await service.entities.User.filter({ id: orgId }).catch(() => []);
            const orgEmail = orgUsers?.[0]?.email;
            if (orgEmail) {
              await service.integrations.Core.SendEmail({
                to:      orgEmail,
                subject: `Événement annulé automatiquement — ${ev.title}`,
                body:    `Bonjour,\n\nVotre événement "${ev.title}" a été annulé automatiquement car le solde de 80% n'a pas été réglé avant la date limite du ${new Date(ev.balanceDueDate).toLocaleDateString('fr-CA')}.\n\nConformément aux conditions d'utilisation, le dépôt de 20% a été distribué aux talents confirmés selon leurs taux de commission respectifs.\n\nLes talents recevront une notification dans leur application avec le détail de leur compensation.\n\nSi vous pensez qu'il s'agit d'une erreur, contactez-nous à support@microrave.ca.\n\nL'équipe Micro Rave`,
              });
            }
          } catch (emailErr) {
            console.warn(`[cancelUnpaidBalances] email org error: ${emailErr?.message}`);
          }
        }

        // ── Note sur les notifications talents ────────────────────────────────
        // Les talents voient l'annulation et leur compensation dans leur historique
        // (fiche session archivée, mode lecture seule).
        // La notification in-app est gérée par le frontend via le PayoutSplit.status=paid
        // + le champ cancellationReason sur l'Event.
        // Pas d'email aux talents pour l'instant — notification in-app uniquement.

        results.push({
          eventId:       ev.id,
          title:         ev.title,
          escrowAmount,
          status:        'cancelled_by_system',
        });
        console.log(`[cancelUnpaidBalances] v3 DONE eventId=${ev.id} escrow=${escrowAmount}$`);

      } catch (evErr) {
        console.error(`[cancelUnpaidBalances] error eventId=${ev.id}: ${evErr?.message}`);
        results.push({ eventId: ev.id, status: 'error', error: evErr?.message });
      }
    }

    return json(200, { ok: true, processed: results.length, results });

  } catch (error) {
    console.error('[cancelUnpaidBalances]', error?.message);
    return json(500, { ok: false, error: error?.message });
  }
});