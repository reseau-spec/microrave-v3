// deploy: v5
// sendPaymentRequest — Crée une EventPaymentRequest et notifie le payeur
// Input : { eventId, payerEmail?, payerUserId?, payerName?, messageToPayer? }
//
// Deux cas :
//   Cas A — payeur externe  : payerEmail obligatoire, envoi email + lien public
//   Cas B — membre du site  : payerUserId obligatoire, notification in-app + email backup
//
// CHANGEMENTS v4 — PRIORITÉ 4 ajoutée dans la cascade budget :
//   Si toutes les sources (LP → slots → snapshot → event.budget) retournent 0
//   ET ev.escrowAmount > 0 → reconstruire le budget depuis l'escrow.
//   escrowAmount = budget × 20% → budget = escrowAmount / 0.20.
//   Toujours logué. Event.budget synchronisé en DB.
//
// CHANGEMENTS v3 — Fix budget=0 : SOURCE 0 LineupPlacement ajoutée :
//   Avant : SOURCE 1 = slots, SOURCE 2 = snapshot. Sur les sessions ancien format
//   (candidates[] vide), les deux sources retournaient 0 → "budget non défini".
//   FIX : ajouter SOURCE 0 = LineupPlacement.filter({eventId, status:'confirmed'})
//   avant toutes les autres. Source contractuelle, toujours à jour post-v10.
//   La cascade devient : LP → slots → snapshot → event.budget → erreur.
//
// CHANGEMENTS v2 :
//   - Budget canonique calculé depuis session.slots[].candidates[].placements[].assignedPrice
//     (même source que ProgrammeView) au lieu de event.budget (champ DB potentiellement stale).
//     event.budget est mis à jour avec la valeur recalculée avant de créer l'EPR.
//   - requestType: 'deposit' écrit sur chaque EPR créée ici.
//     Corrige le bug #8 (EPR sans requestType → confirmStripePayment tombait dans le mauvais path).
//   - Fallback : si aucune session active trouvée, utilise event.budget comme avant.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  const user = await base44.auth.me();
  if (!user) return json(401, { error: 'Non autorisé' });

  const body = await req.json();
  const { eventId, payerEmail, payerUserId, payerName, messageToPayer } = body;

  if (!eventId) return json(400, { error: 'eventId requis' });

  const isMemberPayer   = !!payerUserId;
  const isExternalPayer = !!payerEmail;

  if (!isMemberPayer && !isExternalPayer) {
    return json(400, { error: 'payerEmail ou payerUserId requis' });
  }

  // Vérifier que l'appelant est bien l'organisateur
  const events = await base44.asServiceRole.entities.Event.filter({ id: eventId });
  const ev = events?.[0];
  if (!ev) return json(404, { error: 'Événement introuvable' });

  const isOrganizer = ev.organizerId === user.id || ev.organizerUserId === user.id;
  if (!isOrganizer) {
    return json(403, { error: "Seul l'organisateur peut envoyer des demandes de paiement" });
  }

  // ── Budget canonique depuis lineup — cascade stricte ─────────────────────
  // SOURCE 0 : LineupPlacement (source contractuelle, priorité absolue) — v3
  // SOURCE 1 : session.slots[].candidates[].placements[] (format v6+)
  // SOURCE 2 : session.moodFilterSnapshot.lineupPlacements (format pré-v6)
  // FALLBACK  : event.budget (valeur DB)
  // ERREUR    : si tout = 0 → retourner 400
  let canonicalBudget = 0;
  let budgetSource = 'fallback_event_budget';

  try {
    // SOURCE 0 : LineupPlacement en DB — toujours prioritaire (post-v10, source contractuelle)
    const lpRows = await base44.asServiceRole.entities.LineupPlacement.filter({
      eventId,
      status: 'confirmed',
    }).catch(() => []);

    const lpBudget = (lpRows || []).reduce((sum, p) => sum + (Number(p.assignedPrice) || 0), 0);
    if (lpBudget > 0) {
      canonicalBudget = lpBudget;
      budgetSource    = 'lineup_placement_db';
      // Sync event.budget si divergence
      if (Math.abs(lpBudget - (Number(ev.budget) || 0)) > 0.01) {
        await base44.asServiceRole.entities.Event.update(eventId, { budget: lpBudget })
          .catch(e => console.warn('[sendPaymentRequest] event.budget sync (LP) failed:', e?.message));
        console.log(`[sendPaymentRequest] v3 BUDGET_SYNCED_FROM_LP eventId=${eventId} lp=${lpBudget}`);
      }
    }
  } catch (lpErr) {
    console.warn('[sendPaymentRequest] LineupPlacement budget lookup failed:', lpErr?.message);
  }

  // SOURCE 1 + 2 : Session (slots puis snapshot) — si SOURCE 0 n'a rien trouvé
  if (canonicalBudget === 0) {
    try {
      const sessions = await base44.asServiceRole.entities.Session.filter({
        eventId,
        sessionType: 'event',
      }).catch(() => []);

      // Prendre la session la plus récente (ou la seule)
      const session = (sessions || []).sort((a, b) =>
        new Date(b.created_date || 0) - new Date(a.created_date || 0)
      )[0];

      if (session?.slots && Array.isArray(session.slots)) {
        // SOURCE 1 : session.slots[].candidates[].placements[] (format v6+)
        const sessionBudget = session.slots
          .flatMap(slot => (slot.candidates || []))
          .flatMap(candidate => (candidate.placements || []))
          .reduce((sum, p) => sum + (Number(p.assignedPrice) || 0), 0);

        if (sessionBudget > 0) {
          canonicalBudget = sessionBudget;
          budgetSource = 'session_slots';

          if (Math.abs(canonicalBudget - (Number(ev.budget) || 0)) > 0.01) {
            await base44.asServiceRole.entities.Event.update(eventId, {
              budget: canonicalBudget,
            }).catch(e => console.warn('[sendPaymentRequest] event.budget sync failed:', e?.message));
            console.log(`[sendPaymentRequest] v3 BUDGET_SYNCED eventId=${eventId} old=${ev.budget} new=${canonicalBudget}`);
          }
        }

        // SOURCE 2 : moodFilterSnapshot.lineupPlacements (sessions pré-v6)
        if (canonicalBudget === 0) {
          const snap = session?.moodFilterSnapshot || {};
          const snapBudget = Object.values(snap.lineupPlacements || {})
            .filter(p => p?.isPlaced === true && p?.assignedPrice != null)
            .reduce((sum, p) => sum + Number(p.assignedPrice), 0);

          if (snapBudget > 0) {
            canonicalBudget = snapBudget;
            budgetSource = 'snapshot_lineupPlacements';
            console.log(`[sendPaymentRequest] v3 BUDGET_FROM_SNAPSHOT eventId=${eventId} budget=${snapBudget}`);
          }
        }
      }

      // Diagnostic complet
      console.log('[sendPaymentRequest] v3 budget debug', {
        sessionFound: !!session,
        slotsCount: session?.slots?.length,
        firstSlotCandidatesCount: session?.slots?.[0]?.candidates?.length,
        firstSlotFirstCandPlacements: session?.slots?.[0]?.candidates?.[0]?.placements?.length,
        snapPlacementsCount: Object.keys(session?.moodFilterSnapshot?.lineupPlacements || {}).length,
        canonicalBudget,
        budgetSource,
        eventBudgetDB: Number(ev.budget) || 0,
      });
    } catch (err) {
      console.warn('[sendPaymentRequest] session budget lookup failed, using event.budget:', err?.message);
    }
  }

  // FALLBACK : event.budget si aucune source n'a retourné de valeur
  if (canonicalBudget === 0) {
    canonicalBudget = Number(ev.budget) || 0;
  }

  // PRIORITÉ 4 — Reconstruction depuis escrowAmount (fallback final anti-blocage)
  // Si escrow > 0, le budget était connu et valide au moment du dépôt.
  // budget = escrowAmount / 0.20 — seule preuve contractuelle disponible.
  if (canonicalBudget === 0) {
    const escrow = Number(ev.escrowAmount) || 0;
    if (escrow > 0) {
      canonicalBudget = Math.round((escrow / 0.20) * 100) / 100;
      budgetSource    = 'reconstructed_from_escrow';
      // Synchroniser Event.budget en DB
      await base44.asServiceRole.entities.Event.update(eventId, { budget: canonicalBudget })
        .catch(e => console.warn('[sendPaymentRequest] BUDGET_SYNC_FROM_ESCROW failed:', e?.message));
      console.log(`[sendPaymentRequest] v4 BUDGET_RECONSTRUCTED_FROM_ESCROW eventId=${eventId} escrow=${escrow} budget=${canonicalBudget}`);
    }
  }

  if (canonicalBudget <= 0) {
    return json(400, {
      error: "L'événement n'a pas de budget défini",
      detail: "Aucun LineupPlacement confirmé, aucun slot avec placements, aucun snapshot isPlaced=true, et event.budget=0. Vérifiez que des talents ont été assignés et que leurs propositions ont été acceptées.",
      budgetSource,
    });
  }

  // Montant = 20% du budget canonique — frais Stripe répercutés sur le payeur.
  // Formule : requestedAmount = (net + STRIPE_FIXED) / (1 - STRIPE_RATE)
  // Le payeur paie requestedAmount. Stripe prélève ses frais. MR reçoit exactement netAmount.
  // MR n'absorbe aucun frais Stripe.
  const STRIPE_RATE  = 0.029;   // 2.9%
  const STRIPE_FIXED = 0.30;    // 0.30$ fixe par transaction
  const netAmount        = Math.round(canonicalBudget * 0.20 * 100) / 100;
  const requestedAmount  = Math.round(((netAmount + STRIPE_FIXED) / (1 - STRIPE_RATE)) * 100) / 100;
  const stripeFeeAmount  = Math.round((requestedAmount - netAmount) * 100) / 100;

  console.log(`[sendPaymentRequest] v5 eventId=${eventId} canonicalBudget=${canonicalBudget} net=${netAmount} gross=${requestedAmount} stripeFee=${stripeFeeAmount} source=${budgetSource}`);

  // ── Cas B : résoudre l'email du membre ────────────────────────────────────
  let resolvedEmail = payerEmail || null;
  let resolvedName  = payerName  || null;

  if (isMemberPayer) {
    try {
      const memberUsers = await base44.asServiceRole.entities.User.filter({ id: payerUserId });
      const memberUser  = memberUsers?.[0];
      if (!memberUser) return json(404, { error: 'Membre introuvable' });
      resolvedEmail = memberUser.email || null;

      if (!resolvedName) {
        const profiles = await base44.asServiceRole.entities.TalentProfile.filter({ userId: payerUserId });
        resolvedName = profiles?.[0]?.displayName || memberUser.full_name || memberUser.username || 'Membre';
      }
    } catch (err) {
      console.warn('[sendPaymentRequest] Impossible de résoudre le membre:', err.message);
      return json(400, { error: 'Impossible de trouver le membre spécifié' });
    }
  }

  const secureToken = crypto.randomUUID();
  const expiresAt   = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();
  const createdAt   = new Date().toISOString();

  // Créer la demande — requestType: 'deposit' écrit explicitement (bug #8 fix)
  const request = await base44.asServiceRole.entities.EventPaymentRequest.create({
    eventId,
    organizerUserId: user.id,
    payerEmail:      resolvedEmail || '',
    payerUserId:     payerUserId   || null,
    payerName:       resolvedName  || '',
    requestedAmount,   // montant brut payé par le payeur (avec frais Stripe)
    netAmount,         // montant net reçu par MR après frais Stripe
    stripeFeeAmount,   // frais Stripe = requestedAmount - netAmount
    messageToPayer:  messageToPayer || '',
    secureToken,
    requestStatus:   'sent',
    requestType:     'deposit',
    expiresAt,
    createdAt,
  });

  // Construire l'URL de paiement
  const origin = req.headers.get('origin')
    || req.headers.get('referer')?.split('/').slice(0, 3).join('/')
    || 'https://app.microrave.ca';
  const paymentUrl = `${origin}/PaymentPage?token=${secureToken}`;

  const dateLabel = ev.dateStart
    ? new Date(ev.dateStart).toLocaleDateString('fr-CA', {
        weekday: 'long', day: 'numeric', month: 'long'
      })
    : '';

  // ── Notification in-app membre ────────────────────────────────────────────
  if (isMemberPayer) {
    console.log(`[MEMBER_PAYMENT_REQUEST] payerUserId=${payerUserId} eventId=${eventId} amount=${requestedAmount}`);
  }

  // ── Email ─────────────────────────────────────────────────────────────────
  if (resolvedEmail) {
    const emailBody = `Bonjour${resolvedName ? ' ' + resolvedName.split(' ')[0] : ''},

${user.full_name || 'Un organisateur'} vous invite à payer le dépôt de sécurité pour l'événement :

🎉 ${ev.title}${dateLabel ? `\n📅 ${dateLabel}` : ''}

Montant du dépôt : ${requestedAmount} $ CAD (20% du budget total)
${messageToPayer ? `\n💬 Message de l'organisateur :\n"${messageToPayer}"\n` : ''}
Votre argent est protégé par Micro Rave — libéré uniquement après confirmation de l'événement.

👉 Payer maintenant (lien valide 72h) :
${paymentUrl}

—
Micro Rave · Plateforme d'orchestration événementielle`.trim();

    try {
      await base44.asServiceRole.integrations.Core.SendEmail({
        to:        resolvedEmail,
        subject:   `Dépôt requis — ${ev.title} (${requestedAmount} $ CAD)`,
        body:      emailBody,
        from_name: 'Micro Rave',
      });
    } catch (err) {
      console.warn('[sendPaymentRequest] Email non envoyé:', err.message);
    }
  }

  console.log(`[PAYMENT_REQUEST_SENT] v2 eventId=${eventId} to=${resolvedEmail || payerUserId} amount=${requestedAmount} isMember=${isMemberPayer}`);

  return json(200, {
    ok: true,
    requestId:       request.id,
    secureToken,
    requestedAmount,
    canonicalBudget,
    budgetSource,
    paymentUrl,
    isMemberPayer,
  });
});