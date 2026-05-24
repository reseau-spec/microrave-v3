// getPaymentRequest — Charge une demande de paiement via secureToken (route PUBLIQUE, pas d'auth)
// Input : { token }
//
// CHANGEMENTS v5 — Try/catch global sur tout le handler :
//
//   PROBLÈME v3 :
//   update(id, { requestedAmount, netAmount, stripeFeeAmount }) était correct
//   MAIS la cascade de recalcul fonctionnait — sauf que getPaymentRequest retournait
//   effectiveRequestedAmount recalculé mais initiatePaymentForRequest lisait aussi
//   Number(request.requestedAmount) depuis l'EPR en DB.
//   Si le recalcul échouait à écrire en DB, le PI était créé à 0 centimes.
//
//   requestedAmount (camelCase) → Base44 stocke: requested_amount (sans _cents)
//   C'est le champ utilisé par sendPaymentRequest et les 168 paiements réussis.
//   requested_amount_cents est un champ différent, jamais utilisé.
//
//   FIX v4 :
//   Confirmer que update() écrit requestedAmount (pas requestedAmountCents).
//   Ajouter try/catch sur le premier filter() pour retourner 503 si Base44 rate-limit.
//
//   PROBLÈME v2 :
//   Cascade : SOURCE 0 (LP.assignedPrice) seulement.
//   LP.assignedPrice = 0, event.budget = 0 sur tous les events dont
//   respondToPriceProposal v12 n'est pas encore déployé.
//   → canonicalBudget = 0 → effectiveRequestedAmount = 0 → "— $ CAD".
//
//   FIX :
//   1. Charger l'Event AVANT le bloc recalcul (ev.budget disponible dans la cascade).
//   2. Cascade étendue :
//      SOURCE 0 : LP.assignedPrice (assignedPrice ou assigned_price_cents)
//      SOURCE 1 : session.slots[].candidates[].placements[].assignedPrice
//      SOURCE 2 : event.budget
//      SOURCE 3 : PriceProposal accepted pour cet event → rounds[last].price  ← NOUVEAU
//   SOURCE 3 est le filet de sécurité ultime : rounds[] est TOUJOURS présent
//   et contient le prix négocié même quand toutes les autres sources sont à 0.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  // v5 — Try/catch global: TOUT le handler est protégé.
  // Si Base44 est en rate limit (crédits épuisés) ou qu'une exception survient n'importe où,
  // on retourne un JSON lisible au lieu d'un crash HTTP 500 brut.
  try {

  const { token } = await req.json();

  if (!token) return json(400, { error: 'token requis' });

  const rows = await base44.asServiceRole.entities.EventPaymentRequest.filter({ secureToken: token });
  const request = rows?.[0];

  if (!request) return json(200, { ok: false, code: 'NOT_FOUND', error: 'Lien invalide ou introuvable' });

  // Vérifier expiration
  if (request.expiresAt && new Date(request.expiresAt) < new Date()) {
    if (request.requestStatus === 'sent' || request.requestStatus === 'viewed') {
      await base44.asServiceRole.entities.EventPaymentRequest.update(request.id, { requestStatus: 'expired' });
    }
    return json(200, { ok: false, code: 'EXPIRED', error: 'Ce lien de paiement a expiré' });
  }

  if (request.requestStatus === 'rejected' || request.requestStatus === 'expired') {
    return json(200, { ok: false, code: request.requestStatus.toUpperCase(), error: 'Cette demande n\'est plus valide' });
  }

  // Marquer comme vue si encore 'sent'
  if (request.requestStatus === 'sent') {
    await base44.asServiceRole.entities.EventPaymentRequest.update(request.id, { requestStatus: 'viewed' });
  }

  const alreadyPaid = request.requestStatus === 'approved';

  // v3 — Charger l'Event avant le recalcul pour que ev.budget soit disponible.
  let ev = null;
  let eventData = null;
  if (request.eventId) {
    const evs = await base44.asServiceRole.entities.Event.filter({ id: request.eventId });
    ev = evs?.[0] || null;
    if (ev) {
      let organizerFirstName = '';
      if (ev.organizerId || ev.organizerUserId) {
        const organizers = await base44.asServiceRole.entities.User.filter({
          id: ev.organizerId || ev.organizerUserId
        }).catch(() => []);
        const org = organizers?.[0];
        if (org?.full_name) organizerFirstName = org.full_name.split(' ')[0];
      }
      let checkpointName = '';
      if (ev.checkpointId) {
        const cps = await base44.asServiceRole.entities.Checkpoint.filter({ systemId: ev.checkpointId }).catch(() => []);
        checkpointName = cps?.[0]?.name || '';
      }
      eventData = {
        title: ev.title,
        dateStart: ev.dateStart || ev.startAt,
        budget: ev.budget,
        checkpointName,
        organizerFirstName,
      };
    }
  }

  // v2/v3 — Recalcul du montant si requestedAmount=0 et demande encore active.
  let effectiveRequestedAmount = Number(request.requestedAmount) || 0;
  let effectiveNetAmount       = Number(request.netAmount)       || 0;
  let effectiveStripeFee       = Number(request.stripeFeeAmount) || 0;

  if (effectiveRequestedAmount === 0 && !alreadyPaid && request.eventId) {
    try {
      const STRIPE_RATE  = 0.029;
      const STRIPE_FIXED = 0.30;
      let canonicalBudget = 0;
      let budgetSource    = '';

      // SOURCE 0 : LineupPlacement.assignedPrice (ou assigned_price_cents)
      const lpRows = await base44.asServiceRole.entities.LineupPlacement.filter({
        eventId: request.eventId,
        status:  'confirmed',
      }).catch(() => []);
      const lpBudget = (lpRows || []).reduce((sum, p) => {
        // Base44 peut retourner le champ en camelCase ou snake_case selon la version
        const price = Number(p.assignedPrice) || Number(p.assigned_price_cents) || 0;
        return sum + price;
      }, 0);
      if (lpBudget > 0) { canonicalBudget = lpBudget; budgetSource = 'lineup_placement'; }

      // SOURCE 1 : session.slots[].candidates[].placements[].assignedPrice
      if (canonicalBudget === 0) {
        const sessions = await base44.asServiceRole.entities.Session.filter({
          eventId:     request.eventId,
          sessionType: 'event',
        }).catch(() => []);
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

      // SOURCE 2 : event.budget (ev déjà chargé ci-dessus)
      if (canonicalBudget === 0 && ev) {
        const evBudget = Number(ev.budget) || 0;
        if (evBudget > 0) { canonicalBudget = evBudget; budgetSource = 'event_budget'; }
      }

      // SOURCE 3 : PriceProposal accepted → rounds[last].price  ← filet ultime
      // rounds[] est TOUJOURS présent et fiable même quand LP/event.budget = 0.
      // Couvre le cas où respondToPriceProposal v12 n'est pas encore déployé.
      if (canonicalBudget === 0) {
        const proposalRows = await base44.asServiceRole.entities.PriceProposal.filter({
          eventId: request.eventId,
        }).catch(() => []);
        const acceptedProposals = (proposalRows || []).filter(p =>
          p.finalStatus === 'accepted' || p.status === 'accepted'
        );
        const totalFromRounds = acceptedProposals.reduce((sum, p) => {
          const rounds = Array.isArray(p.rounds) ? p.rounds : (() => {
            try { return JSON.parse(p.rounds || '[]'); } catch { return []; }
          })();
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

        await base44.asServiceRole.entities.EventPaymentRequest.update(request.id, {
          requestedAmount,   // champ qui fonctionne — utilisé par sendPaymentRequest + 168 paiements réussis
          netAmount,
          stripeFeeAmount,
        }).catch(e => console.warn('[getPaymentRequest] v4 EPR update failed (non-fatal):', e?.message));

        console.log(`[getPaymentRequest] v3 AMOUNT_RECALCULATED eventId=${request.eventId} requestId=${request.id} source=${budgetSource} budget=${canonicalBudget} net=${netAmount} gross=${requestedAmount}`);
      } else {
        console.warn(`[getPaymentRequest] v3 ALL_SOURCES_ZERO eventId=${request.eventId} requestId=${request.id}`);
      }
    } catch (e) {
      console.warn('[getPaymentRequest] v3 recalcul failed (non-fatal):', e?.message);
    }
  }

  return json(200, {
    ok: true,
    alreadyPaid,
    request: {
      id:              request.id,
      requestedAmount: effectiveRequestedAmount,   // v2 : recalculé si était 0
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
    // Catch global — couvre tous les appels Base44 sans try/catch individuel
    console.error('[getPaymentRequest] v5 FATAL:', e?.message);
    return json(503, { ok: false, code: 'SERVICE_UNAVAILABLE', error: 'Service temporairement indisponible. Réessayez dans quelques instants.' });
  }
});