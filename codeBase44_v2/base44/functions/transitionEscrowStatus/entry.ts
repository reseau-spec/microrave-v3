// transitionEscrowStatus — Machine d'état canonique pour Event.escrowStatus
// deploy: v1
//
// TRANSITIONS AUTORISÉES :
//   none      → securing   (initiation paiement)
//   securing  → secured    (PI confirmé, fonds capturables)
//   securing  → none       (paiement échoué)
//   secured   → released   (capture Stripe effectuée)
//   secured   → disputed   (annulation balance impayée)
//   released  → disputed   (litige post-release)
//
// TOUTE transition non listée est rejetée avec 409.
// Chaque transition est auditée dans PaymentLedger.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status, headers: { 'content-type': 'application/json' },
  });
}

// Graphe des transitions valides
const VALID_TRANSITIONS = {
  none:     ['securing'],
  securing: ['secured', 'none'],
  secured:  ['released', 'disputed'],
  released: ['disputed'],
  disputed: [], // état terminal
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const service = base44.asServiceRole;

    const body = await req.json().catch(() => ({}));
    const { eventId, fromStatus, toStatus, reason, meta } = body;

    if (!eventId || !fromStatus || !toStatus) {
      return json(400, { ok: false, error: 'eventId, fromStatus, toStatus requis' });
    }

    // ── Vérifier que la transition est valide ─────────────────────────────────
    const allowed = VALID_TRANSITIONS[fromStatus];
    if (!allowed) {
      return json(409, { ok: false, error: `État source inconnu : ${fromStatus}` });
    }
    if (!allowed.includes(toStatus)) {
      return json(409, {
        ok: false,
        error: `Transition interdite : ${fromStatus} → ${toStatus}`,
        allowed,
      });
    }

    // ── Charger l'event et vérifier l'état actuel ─────────────────────────────
    const event = await service.entities.Event.get(eventId).catch(() => null);
    if (!event) return json(404, { ok: false, error: 'Event introuvable' });

    const currentStatus = event.escrowStatus || 'none';
    if (currentStatus !== fromStatus) {
      return json(409, {
        ok: false,
        error: `État actuel (${currentStatus}) ≠ fromStatus attendu (${fromStatus})`,
        currentStatus,
      });
    }

    // ── Idempotence : déjà dans l'état cible ─────────────────────────────────
    if (currentStatus === toStatus) {
      return json(200, { ok: true, action: 'already_in_state', escrowStatus: toStatus });
    }

    const nowIso = new Date().toISOString();

    // ── Appliquer la transition ───────────────────────────────────────────────
    const updatePayload = { escrowStatus: toStatus };
    if (toStatus === 'released') updatePayload.escrowReleasedAt = nowIso;
    if (toStatus === 'disputed') updatePayload.escrowDisputedAt = nowIso;
    if (toStatus === 'securing') updatePayload.escrowInitiatedAt = nowIso;
    if (toStatus === 'secured')  updatePayload.escrowSecuredAt   = nowIso;
    if (toStatus === 'none' && fromStatus === 'securing') {
      updatePayload.stripePaymentIntentId = null;
    }

    await service.entities.Event.update(eventId, updatePayload);

    // ── Écrire dans PaymentLedger (audit atomique) ────────────────────────────
    try {
      await service.entities.PaymentLedger.create({
        eventId,
        payerUserId: event.payerUserId || event.organizerId || 'system',
        payeeUserId: 'platform',
        amountTotal:  event.escrowAmount || 0,
        amountEscrow: event.escrowAmount || 0,
        amountReleased: toStatus === 'released' ? (event.escrowAmount || 0) : 0,
        stripeRef: event.stripePaymentIntentId || null,
        status: toStatus === 'released' ? 'released'
               : toStatus === 'disputed' ? 'disputed'
               : 'secured',
        // Champs d'audit additionnels (stockés librement)
        _transition: `${fromStatus}→${toStatus}`,
        _reason: reason || null,
        _at: nowIso,
        ...(meta || {}),
      });
    } catch (ledgerErr) {
      // Non-fatal : la transition est déjà appliquée, on logue l'échec ledger
      console.error(`[transitionEscrowStatus] PaymentLedger write failed (non-fatal): ${ledgerErr?.message}`);
    }

    console.log(JSON.stringify({
      fn: 'transitionEscrowStatus',
      eventId,
      from: fromStatus,
      to: toStatus,
      reason: reason || null,
      at: nowIso,
    }));

    return json(200, {
      ok: true,
      action: 'transitioned',
      eventId,
      from: fromStatus,
      to: toStatus,
    });

  } catch (error) {
    console.error('[transitionEscrowStatus]', error?.message);
    return json(500, { ok: false, error: error?.message });
  }
});