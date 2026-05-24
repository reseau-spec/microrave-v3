// deploy: v1
// resetAndRegeneratePayoutSplits — Fonction admin one-shot.
//
// OBJECTIF :
//   Invalider les splits fantômes (générés par processScheduledPayouts v2 sur
//   event.budget au lieu de totalCollected) et les régénérer via generatePayoutSplits v7.
//
// RÈGLE : un split est fantôme si :
//   sum(PayoutSplit.amount) pour un event > (escrowAmount + balancePaid) + 0.50$
//   ET qu'aucun stripeTransferId n'existe sur ces splits (pas encore payés)
//
// POUR LES SPLITS DÉJÀ PAYÉS (stripeTransferId présent) :
//   → NE PAS toucher. Le transfert Stripe est irréversible.
//   → Signaler comme anomalie dans le résultat.
//
// STRATÉGIE D'INVALIDATION :
//   1. Marquer les PayoutSplit fantômes status='blocked' (enum à ajouter)
//      OU les supprimer si la DB le permet sans FK contrainte
//   2. Réinitialiser EventPayout.status = 'pending'
//   3. Appeler generatePayoutSplits v7 (calcule sur collecté réel)
//
// ADMIN ONLY. Supporte dryRun: true pour prévisualisation.
// Supporte eventId pour cibler un seul event.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status, headers: { 'content-type': 'application/json' },
  });
}

function round2(n) { return Math.round(n * 100) / 100; }

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const service = base44.asServiceRole;
    if (!service) return json(503, { ok: false, error: 'Service role unavailable' });

    const user = await base44.auth.me().catch(() => null);
    if (!user || user.role !== 'admin') return json(403, { ok: false, error: 'Admin only' });

    const body          = await req.json().catch(() => ({}));
    const dryRun        = body.dryRun === true;
    const forceEventId  = body.eventId || null;
    const OVERAGE_TOLERANCE = 0.50;

    const nowIso = new Date().toISOString();

    // ── Charger les events à analyser ─────────────────────────────────────────
    let events;
    if (forceEventId) {
      const ev = await service.entities.Event.get(forceEventId).catch(() => null);
      events = ev ? [ev] : [];
    } else {
      // Tous les events avec des payouts (completed ou processing)
      const allPayouts = await service.entities.EventPayout.filter({}).catch(() => []);
      const eventIds   = [...new Set((allPayouts || []).map(p => p.eventId).filter(Boolean))];
      events = [];
      for (const eid of eventIds) {
        const ev = await service.entities.Event.get(eid).catch(() => null);
        if (ev) events.push(ev);
      }
    }

    console.log(`[resetAndRegenerate] v1 — analysing ${events.length} events (dryRun=${dryRun})`);

    const results = [];

    for (const ev of events) {
      const escrowCaptured  = Number(ev.escrowAmount)  || 0;
      const balanceReceived = Number(ev.balancePaid)   || 0;
      const totalCollected  = round2(escrowCaptured + balanceReceived);

      if (totalCollected <= 0) continue; // rien collecté → skip

      // Charger les splits de cet event
      const splits = await service.entities.PayoutSplit.filter({ eventId: ev.id }).catch(() => []);
      if (!splits || splits.length === 0) continue;

      const totalSplits  = round2(splits.reduce((s, sp) => s + (Number(sp.amount) || 0), 0));
      const hasPaidSplit = splits.some(sp => sp.stripeTransferId);

      // Cet event est-il en overage ?
      if (totalSplits <= totalCollected + OVERAGE_TOLERANCE) continue;

      const overage = round2(totalSplits - totalCollected);

      if (hasPaidSplit) {
        // Splits partiellement payés — ne pas toucher, signaler
        results.push({
          eventId: ev.id, title: ev.title,
          action: 'SKIPPED_HAS_PAID_SPLITS',
          totalCollected, totalSplits, overage,
          message: 'Des splits ont déjà un stripeTransferId — intervention manuelle requise.',
        });
        continue;
      }

      // ── Tous les splits sont fantômes et non payés → reset ────────────────
      if (!dryRun) {
        // 1. Supprimer les splits fantômes
        for (const sp of splits) {
          await service.entities.PayoutSplit.delete(sp.id).catch(async () => {
            // Si delete n'est pas disponible, on tente un update status='blocked'
            // Note: 'blocked' devra être ajouté à l'enum PayoutSplit.status
            await service.entities.PayoutSplit.update(sp.id, {
              status: 'blocked',
              note:   (sp.note || '') + ' | INVALIDATED: phantom split (totalSplits > totalCollected)',
              updatedAt: nowIso,
            }).catch(e => console.warn(`PayoutSplit update failed: ${e?.message}`));
          });
        }

        // 2. Trouver et réinitialiser l'EventPayout
        const payouts = await service.entities.EventPayout.filter({ eventId: ev.id }).catch(() => []);
        const activePayout = (payouts || []).find(p =>
          ['completed', 'processing'].includes(p.status)
        );

        if (activePayout) {
          await service.entities.EventPayout.update(activePayout.id, {
            status:           'pending',
            totalGrossAmount: totalCollected, // set to collecté réel
            errorNote:        `Réinitialisé par resetAndRegeneratePayoutSplits v1 — splits fantômes invalidés (${splits.length} splits, overage=${overage}$)`,
            updatedAt:        nowIso,
          });

          // 3. Appeler generatePayoutSplits v7
          const regenResult = await base44.functions.invoke('generatePayoutSplits', {
            eventId:  ev.id,
            payoutId: activePayout.id,
          }).catch(e => ({ data: { ok: false, error: e?.message } }));

          results.push({
            eventId:         ev.id,
            title:           ev.title,
            action:          regenResult?.data?.ok ? 'RESET_AND_REGENERATED' : 'RESET_REGEN_FAILED',
            totalCollected,
            totalSplits,
            overage,
            splitsDeleted:   splits.length,
            newSplits:       regenResult?.data?.splits || 0,
            regenAvailable:  regenResult?.data?.availableAmount,
            regenUnderfunded: regenResult?.data?.isUnderfunded || false,
            regenError:      regenResult?.data?.error || null,
          });
        } else {
          // Pas d'EventPayout actif — juste supprimer les splits
          results.push({
            eventId: ev.id, title: ev.title,
            action: 'SPLITS_DELETED_NO_PAYOUT',
            totalCollected, totalSplits, overage,
            splitsDeleted: splits.length,
            message: 'Splits supprimés mais aucun EventPayout actif trouvé pour régénérer.',
          });
        }
      } else {
        // DryRun — prévisualisation uniquement
        results.push({
          eventId:       ev.id,
          title:         ev.title,
          action:        'DRY_RUN_WOULD_RESET',
          totalCollected,
          totalSplits,
          overage,
          splitsToDelete: splits.length,
          splitIds:       splits.map(s => s.id),
        });
      }
    }

    const reset    = results.filter(r => r.action === 'RESET_AND_REGENERATED');
    const failed   = results.filter(r => r.action === 'RESET_REGEN_FAILED');
    const skipped  = results.filter(r => r.action.startsWith('SKIPPED'));
    const dryRuns  = results.filter(r => r.action.startsWith('DRY_RUN'));

    return json(200, {
      ok:        true,
      dryRun,
      processed: results.length,
      reset:     reset.length,
      failed:    failed.length,
      skipped:   skipped.length,
      dryRunCount: dryRuns.length,
      results,
    });

  } catch (error) {
    console.error('[resetAndRegeneratePayoutSplits]', error?.message);
    return json(500, { ok: false, error: error?.message });
  }
});