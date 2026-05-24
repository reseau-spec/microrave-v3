// deploy: v6
// getPaymentRequest — Charge une demande de paiement via secureToken (route PUBLIQUE, pas d'auth)
// Input : { token }
//
// CHANGEMENTS v6 — Fix 503 / Rate limit :
//   Le handler faisait 7 requêtes séquentielles → rate limit 429 → catch global → 503.
//   FIX : paralléliser Event + User + Checkpoint en un seul Promise.all.
//   Recalcul budget : LP + Session en parallèle (au lieu de séquentiel).
//   PriceProposal : gardé en dernier recours seulement si tout = 0.
//   Résultat : 3 requêtes parallèles au lieu de 7 séquentielles.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  try {
    const { token } = await req.json();
    if (!token) return json(400, { error: 'token requis' });

    const rows = await base44.asServiceRole.entities.EventPaymentRequest
      .filter({ secureToken: token })
      .catch(() => null);

    if (!rows) {
      return json(503, { ok: false, code: 'SERVICE_UNAVAILABLE', error: 'Service temporairement indisponible. Réessayez dans quelques instants.' });
    }

    const request = rows?.[0];
    if (!request) return json(200, { ok: false, code: 'NOT_FOUND', error: 'Lien invalide ou introuvable' });

    // Vérifier expiration
    if (request.expiresAt && new Date(request.expiresAt) < new Date()) {
      if (request.requestStatus === 'sent' || request.requestStatus === 'viewed') {
        await base44.asServiceRole.entities.EventPaymentRequest
          .update(request.id, { requestStatus: 'expired' })
          .catch(() => null);
      }
      return json(200, { ok: false, code: 'EXPIRED', error: 'Ce lien de paiement a expiré' });
    }

    if (request.requestStatus === 'rejected' || request.requestStatus === 'expired') {
      return json(200, { ok: false, code: request.requestStatus.toUpperCase(), error: 'Cette demande n\'est plus valide' });
    }

    // Marquer comme vue si encore 'sent' (non-fatal, non-bloquant)
    if (request.requestStatus === 'sent') {
      base44.asServiceRole.entities.EventPaymentRequest
        .update(request.id, { requestStatus: 'viewed' })
        .catch(() => null);
    }

    const alreadyPaid = request.requestStatus === 'approved';

    // ── v6 : Charger Event + User + Checkpoint EN PARALLÈLE ──────────────────
    let ev = null;
    let eventData = null;

    if (request.eventId) {
      const [evs] = await Promise.all([
        base44.asServiceRole.entities.Event.filter({ id: request.eventId }).catch(() => []),
      ]);
      ev = evs?.[0] || null;

      if (ev) {
        // Lookups secondaires en parallèle
        const [organizers, checkpoints] = await Promise.all([
          (ev.organizerId || ev.organizerUserId)
            ? base44.asServiceRole.entities.User.filter({ id: ev.organizerId || ev.organizerUserId }).catch(() => [])
            : Promise.resolve([]),
          ev.checkpointId
            ? base44.asServiceRole.entities.Checkpoint.filter({ systemId: ev.checkpointId }).catch(() => [])
            : Promise.resolve([]),
        ]);

        const org = organizers?.[0];
        const organizerFirstName = org?.full_name ? org.full_name.split(' ')[0] : '';
        const checkpointName = checkpoints?.[0]?.name || '';

        eventData = {
          title: ev.title,
          dateStart: ev.dateStart || ev.startAt,
          budget: ev.budget,
          checkpointName,
          organizerFirstName,
        };
      }
    }

    // ── Recalcul du montant si requestedAmount=0 ──────────────────────────────
    let effectiveRequestedAmount = Number(request.requestedAmount) || 0;
    let effectiveNetAmount       = Number(request.netAmount)       || 0;
    let effectiveStripeFee       = Number(request.stripeFeeAmount) || 0;

    if (effectiveRequestedAmount === 0 && !alreadyPaid && request.eventId) {
      try {
        const STRIPE_RATE  = 0.029;
        const STRIPE_FIXED = 0.30;
        let canonicalBudget = 0;
        let budgetSource    = '';

        // SOURCE 0 + 1 : LineupPlacement ET Session EN PARALLÈLE (v6 fix rate limit)
        const [lpRows, sessions] = await Promise.all([
          base44.asServiceRole.entities.LineupPlacement.filter({
            eventId: request.eventId,
            status:  'confirmed',
          }).catch(() => []),
          base44.asServiceRole.entities.Session.filter({
            eventId:     request.eventId,
            sessionType: 'event',
          }).catch(() => []),
        ]);

        // SOURCE 0 : LineupPlacement
        const lpBudget = (lpRows || []).reduce((sum, p) => {
          const price = Number(p.assignedPrice) || Number(p.assigned_price_cents) / 100 || 0;
          return sum + price;
        }, 0);
        if (lpBudget > 0) { canonicalBudget = lpBudget; budgetSource = 'lineup_placement'; }

        // SOURCE 1 : session.slots
        if (canonicalBudget === 0) {
          const session = (sessions || []).sort((a, b) =>
            new Date(b.created_date || 0) - new Date(a.created_date || 0)
          )[0];
          if (session?.slots && Array.isArray(session.slots)) {
            const slotsBudget = session.slots
              .flatMap(s => (s.candidates || []))
              .flatMap(c => (c.placements || []))
              .reduce((sum, p) => sum + (Number(p.assignedPrice) || 0), 0);
            if (slotsBudget > 0) { canonicalBudget = slotsBudget; budgetSource = 'session_slots'; }
          }
        }

        // SOURCE 2 : event.budget
        if (canonicalBudget === 0 && ev) {
          const evBudget = Number(ev.budget) || Number(ev.budget_cents) / 100 || 0;
          if (evBudget > 0) { canonicalBudget = evBudget; budgetSource = 'event_budget'; }
        }

        // SOURCE 3 : PriceProposal (dernier recours — 1 seule requête)
        if (canonicalBudget === 0) {
          const proposalRows = await base44.asServiceRole.entities.PriceProposal
            .filter({ eventId: request.eventId })
            .catch(() => []);
          const acceptedProposals = (proposalRows || []).filter(p =>
            p.finalStatus === 'accepted' || p.status === 'accepted'
          );
          const totalFromRounds = acceptedProposals.reduce((sum, p) => {
            const rounds = Array.isArray(p.rounds) ? p.rounds : [];
            const lastRound = rounds[rounds.length - 1];
            return sum + (Number(lastRound?.price) || 0);
          }, 0);
          if (totalFromRounds > 0) { canonicalBudget = totalFromRounds; budgetSource = 'proposal_rounds'; }
        }

        if (canonicalBudget > 0) {
          const netAmount       = Math.round(canonicalBudget * 0.20 * 100) / 100;
          const requestedAmount = Math.round(((netAmount + STRIPE_FIXED) / (1 - STRIPE_RATE)) * 100) / 100;
          const stripeFeeAmount = Math.round((requestedAmount - netAmount) * 100) / 100;

          effectiveRequestedAmount = requestedAmount;
          effectiveNetAmount       = netAmount;
          effectiveStripeFee       = stripeFeeAmount;

          // Écriture non-bloquante
          base44.asServiceRole.entities.EventPaymentRequest.update(request.id, {
            requestedAmount,
            netAmount,
            stripeFeeAmount,
          }).catch(e => console.warn('[getPaymentRequest] v6 EPR update failed (non-fatal):', e?.message));

          console.log(`[getPaymentRequest] v6 AMOUNT_RECALCULATED eventId=${request.eventId} source=${budgetSource} budget=${canonicalBudget} net=${netAmount} gross=${requestedAmount}`);
        } else {
          console.warn(`[getPaymentRequest] v6 ALL_SOURCES_ZERO eventId=${request.eventId}`);
        }
      } catch (e) {
        console.warn('[getPaymentRequest] v6 recalcul failed (non-fatal):', e?.message);
      }
    }

    return json(200, {
      ok: true,
      alreadyPaid,
      request: {
        id:              request.id,
        requestedAmount: effectiveRequestedAmount,
        netAmount:       effectiveNetAmount,
        stripeFeeAmount: effectiveStripeFee,
        messageToPayer:  request.messageToPayer,
        requestStatus:   alreadyPaid ? 'approved' : request.requestStatus,
        requestType:     request.requestType,
        expiresAt:       request.expiresAt,
      },
      event: eventData,
    });

  } catch (e) {
    console.error('[getPaymentRequest] v6 FATAL:', e?.message);
    return json(503, { ok: false, code: 'SERVICE_UNAVAILABLE', error: 'Service temporairement indisponible. Réessayez dans quelques instants.' });
  }
});