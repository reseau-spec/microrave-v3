// deploy: v3
// processScheduledPayouts — Orchestrateur cron. Zéro logique de split.
//
// CHANGEMENTS v3 (rupture totale avec v2) :
//
//   v2 SUPPRIMÉ : toute logique de génération de splits (templates hardcodés
//   corporate_4a7 / all_night_long, lecture Session.slots par rôle, calcul de
//   montants) est retirée. Cette logique produisait des splits calculés sur
//   event.budget (contracté) avec des taux fixes (10–12%), sans tenir compte
//   de UserMembership, SOTS, ni du montant réellement collecté.
//   Elle créait des splits fantômes > totalCollected et bloquait le bon pipeline
//   en marquant EventPayout.status='completed' avant generatePayoutSplits.
//
//   v3 RÔLE UNIQUE :
//   Pour chaque EventPayout{status=pending, triggerDate<=now} :
//     1. Vérifier que l'event est completed et escrowStatus=released
//     2. Déléguer à generatePayoutSplits (seul cerveau autorisé)
//     3. Marquer le résultat (processing, deferred, error)
//
//   generatePayoutSplits gère :
//     - Le calcul des montants (sur escrowAmount + balancePaid)
//     - La commission individualisée (UserMembership + SOTS + commissionSnapshot)
//     - L'idempotence (guard existingSplits)
//     - Le FinancialLedger (dans sa propre logique)
//
//   Ce cron ne génère, ne calcule, et ne suppose RIEN sur les montants.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status, headers: { 'content-type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const service = base44.asServiceRole;
    if (!service) return json(503, { ok: false, error: 'Service role unavailable' });

    // Auth : cron admin ou appel manuel admin
    const user = await base44.auth.me().catch(() => null);
    if (!user || user.role !== 'admin') {
      return json(403, { ok: false, error: 'Admin only' });
    }

    const now    = new Date();
    const nowIso = now.toISOString();

    // Charger tous les payouts pending dont le triggerDate est passé
    const allPayouts = await service.entities.EventPayout.filter({ status: 'pending' }).catch(() => []);
    const due = (allPayouts || []).filter(
      p => p.triggerDate && new Date(p.triggerDate) <= now
    );

    if (due.length === 0) {
      return json(200, { ok: true, processed: 0, message: 'Aucun payout dû.' });
    }

    console.log(`[processScheduledPayouts] v3 — ${due.length} payout(s) dû(s)`);

    const results = [];

    for (const payout of due) {
      try {
        // ── Vérifier l'event ────────────────────────────────────────────────
        const event = await service.entities.Event.get(payout.eventId).catch(() => null);

        if (!event) {
          await service.entities.EventPayout.update(payout.id, {
            status:    'disputed',
            errorNote: 'Event introuvable',
            updatedAt: nowIso,
          });
          results.push({ payoutId: payout.id, status: 'error', reason: 'event_not_found' });
          continue;
        }

        // L'event doit être completed
        const isCompleted = event.status === 'completed' || !!event.completedAt;
        if (!isCompleted) {
          // Reporter de 2h — l'event n'est pas encore terminé
          const newTrigger = new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString();
          await service.entities.EventPayout.update(payout.id, {
            triggerDate: newTrigger,
            updatedAt:   nowIso,
          });
          results.push({ payoutId: payout.id, status: 'deferred', reason: 'event_not_completed', newTrigger });
          continue;
        }

        // L'escrow doit être released — sans ça aucun fonds n'est disponible
        if (event.escrowStatus !== 'released') {
          // Ne pas reporter indéfiniment — signaler pour intervention manuelle
          const newTrigger = new Date(now.getTime() + 4 * 60 * 60 * 1000).toISOString();
          await service.entities.EventPayout.update(payout.id, {
            triggerDate: newTrigger,
            errorNote:   `escrowStatus=${event.escrowStatus} — release requis avant génération des splits`,
            updatedAt:   nowIso,
          });
          results.push({
            payoutId: payout.id,
            status: 'deferred',
            reason: `escrow_not_released (${event.escrowStatus})`,
            newTrigger,
          });
          console.warn(`[processScheduledPayouts] v3 escrow_not_released eventId=${event.id} escrowStatus=${event.escrowStatus}`);
          continue;
        }

        // ── Déléguer à generatePayoutSplits ─────────────────────────────────
        // generatePayoutSplits est le seul cerveau autorisé pour les splits.
        // Il gère lui-même : idempotence, montants, commissions, FinancialLedger.
        const result = await base44.functions.invoke('generatePayoutSplits', {
          eventId:  payout.eventId,
          payoutId: payout.id,
        }).catch(e => ({ data: { ok: false, error: e?.message } }));

        const data = result?.data;

        if (!data?.ok) {
          const errMsg = data?.error || 'generatePayoutSplits a retourné ok=false';
          await service.entities.EventPayout.update(payout.id, {
            status:    'disputed',
            errorNote: errMsg,
            updatedAt: nowIso,
          });
          results.push({ payoutId: payout.id, eventId: payout.eventId, status: 'error', error: errMsg });
          console.error(`[processScheduledPayouts] v3 ERROR payoutId=${payout.id}: ${errMsg}`);
          continue;
        }

        // generatePayoutSplits a réussi — il a mis EventPayout.status = 'processing'
        results.push({
          payoutId:        payout.id,
          eventId:         payout.eventId,
          status:          data.action || 'splits_generated',
          splits:          data.splits  || 0,
          availableAmount: data.availableAmount,
          isUnderfunded:   data.isUnderfunded || false,
          lineupSource:    data.lineupSource,
        });

        console.log(
          `[processScheduledPayouts] v3 OK payoutId=${payout.id} ` +
          `eventId=${payout.eventId} splits=${data.splits} ` +
          `available=${data.availableAmount} underfunded=${data.isUnderfunded}`
        );

      } catch (err) {
        console.error(`[processScheduledPayouts] v3 FATAL payoutId=${payout.id}:`, err?.message);
        await service.entities.EventPayout.update(payout.id, {
          status:    'disputed',
          errorNote: err?.message,
          updatedAt: nowIso,
        }).catch(() => {});
        results.push({ payoutId: payout.id, status: 'error', error: err?.message });
      }
    }

    const generated = results.filter(r => r.status === 'splits_generated' || r.status === 'already_processed');
    const deferred  = results.filter(r => r.status === 'deferred');
    const errors    = results.filter(r => r.status === 'error');

    return json(200, {
      ok:        true,
      total:     due.length,
      generated: generated.length,
      deferred:  deferred.length,
      errors:    errors.length,
      results,
    });

  } catch (error) {
    console.error('[processScheduledPayouts] v3 FATAL:', error?.message);
    return json(500, { ok: false, error: error.message });
  }
});