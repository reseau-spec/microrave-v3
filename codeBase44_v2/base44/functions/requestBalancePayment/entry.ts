// deploy: v12
// CHANGEMENTS v12 — Formule balance universelle (remplace v11) :
//   calcPercuNet() = sum(EPR.netAmount WHERE approved)
//   balanceNet = budget - calcPercuNet()
//   Couvre : dépôt partiel, double dépôt, modification programme, ajustements.
//   NE dépend plus de escrowAmount (brut) ni de budget × 80% (faux si modifié).
// requestBalancePayment — v10
//
// CHANGEMENTS v10 — Fix définitif "budget indéfini" malgré dépôt encaissé :
//
//   PROBLÈME RACINE :
//   resolveCanonicalBudget retourne 0 quand :
//     - LP = 0 (assignation directe sans respondToPriceProposal)
//     - slots candidates[].placements[] vide (ancien format)
//     - snapshot lineupPlacements vide
//     - Event.budget DB = 0
//   Dans ce cas, eligible filter exclut l'event même si escrowAmount > 0.
//   Or escrowAmount = sendPaymentRequest.requestedAmount / 1 = budget × 20%
//   → le budget était connu au moment du dépôt.
//
//   FIX — PRIORITÉ 4 dans resolveCanonicalBudget :
//   Si toutes les sources précédentes retournent 0 ET ev.escrowAmount > 0 :
//     canonicalBudget = round(escrowAmount / 0.20)
//     budgetSource    = 'reconstructed_from_escrow'
//   Logger : BUDGET_RECONSTRUCTED_FROM_ESCROW — jamais silencieux.
//   Synchroniser Event.budget en DB avec la valeur reconstruite.
//
//   RÈGLE : escrowAmount / 0.20 est la seule reconstruction autorisée.
//   C'est la seule preuve cryptographique que le budget était connu et valide.
//
// CHANGEMENTS v9 — Fix TERMINAL filter + budget SOURCE 0 (LineupPlacement) :
//
//   BUG 1 — TERMINAL filter bloque les events completed :
//     TERMINAL incluait 'completed'. Or un event completed avec escrow>0 et balancePaid=0
//     a besoin d'une demande de balance pour que son payout soit financé.
//     9 events réels dans cet état confirmé en DB.
//     FIX : retirer 'completed' de TERMINAL. Garder seulement 'cancelled' et 'aborted'.
//     Guard additionnel : si event.balancePaid > 0 → balance déjà reçue, ignorer.
//
//   BUG 2 — resolveCanonicalBudget manquait LineupPlacement comme SOURCE 0 :
//     Les sources existantes (slots → snapshot) pouvaient retourner 0 sur des events
//     dont les LineupPlacement en DB avaient les prix corrects.
//     FIX : ajouter LineupPlacement.filter({eventId, status:'confirmed'}) comme
//     PRIORITÉ 0 avant slots et snapshot. Identique à resolveCanonicalBudget de
//     respondToPriceProposal v11.
//
// CHANGEMENTS v8 — Mode adjustment (ajustement de programme) :
//
//   Nouveau mode : 'adjustment'
//   Déclenché quand le programme est modifié après un premier paiement (dépôt encaissé).
//   Cas typiques : ajout d'un talent, modification d'un cachet, changement de scène.
//
//   Paramètres requis :
//     adjustmentReason : string — description lisible (ex: "Talent Dupont ajouté — +150$")
//     adjustmentAmount : number (optionnel) — montant exact à facturer. Si absent, calculé
//                        comme (budget canonique - total collecté).
//     programmeSnapshotBefore : object (optionnel) — snapshot JSON avant modification
//     programmeSnapshotAfter  : object (optionnel) — snapshot JSON après modification
//
//   L'EPR créé a requestType='adjustment' et porte adjustmentReason, deltaAmount,
//   programmeSnapshotBefore/After — lisibles dans la timeline ContractView.
//
// CHANGEMENTS v7 — Fix liaison démarrage/escrow :
//
//   PROBLÈME v6 :
//   La requête initiale filtre sur escrowStatus='secured'. Depuis que releaseEventEscrow
//   est déclenché automatiquement au démarrage de session, l'escrowStatus passe à 'released'
//   avant que la balance soit payée. L'event devient invisible pour requestBalancePayment
//   → "Aucun event éligible trouvé."
//
//   De plus, le filtre temporel (dateStart > now) bloque les events de test dont
//   la date de début est passée, même quand l'appel est manuel (forceEventId fourni).
//
//   FIX :
//   1. Charger les events avec escrowStatus IN ('secured', 'released') au lieu de 'secured' seul.
//   2. Pour les appels manuels (forceEventId fourni), supprimer le filtre dateStart > now.
//      L'organisateur sait ce qu'il fait — il demande la balance sur un event précis.
//      Le filtre temporel reste actif pour les appels cron (sans forceEventId).
//   3. balanceRequestSentAt : si la balance a déjà été demandée UNE FOIS mais pas payée,
//      permettre un renvoi manuel via forceResend=true (comportement existant, inchangé).
//
// CHANGEMENTS v6 — Fix D3 (budget fallback snapshot)
//
// CHANGEMENTS v5 :
//   Nouveau paramètre optionnel : mode
//     'balance_only'    (défaut) : EPR = budget - escrowAmount  (solde réel exact)
//     'deposit_gap'              : EPR = (budget × 20%) - escrowAmount  — compléter le dépôt
//     'full_settlement'          : EPR = budget - escrowAmount  — tout régler d'un coup
//
//   requestType sur l'EPR :
//     'deposit'  pour deposit_gap
//     'balance'  pour balance_only et full_settlement
//
//   Seuil depositGap : si < 5$, deposit_gap est refusé (dépôt considéré complet).
//   Pour deposit_gap : ne pas écraser balanceRequestSentAt (la vraie balance n'a pas encore été demandée).
//
// CHANGEMENTS v6 — Fix D3 (budget fallback snapshot) :
//
//   PROBLÈME v5 :
//   Le guard `if (Number(ev.budget) <= 0) return false` filtre les events
//   dont le budget DB est 0 — cas prouvé sur 27 events completed.
//   Event.budget peut être 0 si assignLineupSlot n'a pas encore recalculé le champ
//   ou si les données ont été écrites directement en DB lors de tests.
//   La demande de balance est alors silencieusement bloquée sans erreur explicite.
//
//   FIX :
//   Avant d'appliquer le guard budget <= 0, tenter de recalculer le budget
//   canonique depuis les mêmes sources que sendPaymentRequest v2 :
//     SOURCE 1 : Session.slots[].candidates[].placements[].assignedPrice
//     SOURCE 2 : Session.moodFilterSnapshot.lineupPlacements[isPlaced].assignedPrice
//   Si une de ces sources retourne un budget > 0, l'utiliser ET synchroniser
//   Event.budget en DB (même logique que sendPaymentRequest v2 BUDGET_SYNCED).
//   Fallback final : Event.budget (comportement v5 si aucune session trouvée).
//
//   IMPACT :
//   - Events avec budget DB = 0 mais lineup réel → balance débloquée
//   - Events sans session ni lineup → comportement inchangé (bloqué, 400)
//   - Aucune régression sur les events avec budget DB valide

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status, headers: { 'content-type': 'application/json' }
  });
}

const DEPOSIT_GAP_MIN = 5;

// ── Résoudre le budget canonique depuis les sources lineup ──────────────────
// v9 — Cascade stricte sur 3 sources (ordre de priorité décroissant) :
//   SOURCE 0 : LineupPlacement.filter({eventId, status:'confirmed'}) — source contractuelle v10
//   SOURCE 1 : session.slots[].candidates[].placements[].assignedPrice (format v6+)
//   SOURCE 2 : session.moodFilterSnapshot.lineupPlacements[isPlaced].assignedPrice
//   FALLBACK  : event.budget (valeur DB existante)
//
// ── Helper : calcPercuNet ─────────────────────────────────────────────────
// Calcule le total net déjà perçu par MR pour un event depuis les EPR approuvés.
// Source de vérité universelle : couvre dépôt simple, dépôt partiel, double dépôt,
// ajustements. Ne dépend pas de escrowAmount (brut payeur) ni de balancePaid.
// Pour les EPR sans netAmount (historiques) : reconstruction depuis requestedAmount.
const STRIPE_RATE  = 0.029;
const STRIPE_FIXED = 0.30;

async function calcPercuNet(service, eventId) {
  try {
    const eprs = await service.entities.EventPaymentRequest
      .filter({ eventId, requestStatus: 'approved' })
      .catch(() => []);
    return Math.round(
      (eprs || []).reduce((sum, r) => {
        if (r.netAmount) return sum + Number(r.netAmount);
        // Fallback historique : inverser la formule Stripe
        const brut = Number(r.requestedAmount) || 0;
        const net  = brut > 0
          ? Math.max(0, Math.round(((brut * (1 - STRIPE_RATE)) - STRIPE_FIXED) * 100) / 100)
          : 0;
        return sum + net;
      }, 0) * 100
    ) / 100;
  } catch (e) {
    console.warn('[calcPercuNet] failed, fallback 0:', e?.message);
    return 0;
  }
}

// RÈGLE : si source retourne 0 → passer à la suivante.
// Synchronise event.budget en DB si une divergence est détectée (non-fatal).
async function resolveCanonicalBudget(service, ev) {
  let canonicalBudget = 0;
  let budgetSource    = 'fallback_event_budget';

  try {
    // SOURCE 0 : LineupPlacement en DB (source contractuelle post-v10) — PRIORITÉ ABSOLUE
    const placements = await service.entities.LineupPlacement.filter({
      eventId:  ev.id,
      status:   'confirmed',
    }).catch(() => []);

    const lpBudget = (placements || []).reduce((sum, p) => sum + (Number(p.assignedPrice) || 0), 0);
    if (lpBudget > 0) {
      canonicalBudget = lpBudget;
      budgetSource    = 'lineup_placement_db';
    }

    if (canonicalBudget === 0) {
      const sessions = await service.entities.Session.filter({
        eventId:     ev.id,
        sessionType: 'event',
      }).catch(() => []);

      const session = (sessions || []).sort((a, b) =>
        new Date(b.created_date || 0) - new Date(a.created_date || 0)
      )[0];

      if (session?.slots && Array.isArray(session.slots)) {
        // SOURCE 1 : session.slots (format v6+)
        const slotsBudget = session.slots
          .flatMap(sl => (sl.candidates || []))
          .flatMap(c  => (c.placements  || []))
          .reduce((sum, p) => sum + (Number(p.assignedPrice) || 0), 0);

        if (slotsBudget > 0) {
          canonicalBudget = slotsBudget;
          budgetSource    = 'session_slots';
        }

        // SOURCE 2 : moodFilterSnapshot.lineupPlacements (sessions pré-v6)
        if (canonicalBudget === 0) {
          const snap       = session?.moodFilterSnapshot || {};
          const snapBudget = Object.values(snap.lineupPlacements || {})
            .filter(p => p?.isPlaced === true && p?.assignedPrice != null)
            .reduce((sum, p) => sum + Number(p.assignedPrice), 0);

          if (snapBudget > 0) {
            canonicalBudget = snapBudget;
            budgetSource    = 'snapshot_lineupPlacements';
          }
        }

        // Synchroniser event.budget si la valeur DB est divergente
        if (canonicalBudget > 0 && Math.abs(canonicalBudget - (Number(ev.budget) || 0)) > 0.01) {
          await service.entities.Event.update(ev.id, { budget: canonicalBudget })
            .catch(e => console.warn('[requestBalancePayment] event.budget sync failed:', e?.message));
          console.log(`[requestBalancePayment] v9 BUDGET_SYNCED eventId=${ev.id} db=${ev.budget} canon=${canonicalBudget} src=${budgetSource}`);
        }
      }
    } else {
      // SOURCE 0 a retourné un budget — sync si divergence
      if (Math.abs(lpBudget - (Number(ev.budget) || 0)) > 0.01) {
        await service.entities.Event.update(ev.id, { budget: lpBudget })
          .catch(e => console.warn('[requestBalancePayment] event.budget sync (LP) failed:', e?.message));
        console.log(`[requestBalancePayment] v9 BUDGET_SYNCED_FROM_LP eventId=${ev.id} db=${ev.budget} lp=${lpBudget}`);
      }
    }
  } catch (err) {
    console.warn('[requestBalancePayment] v9 session budget lookup failed:', err?.message);
  }

  // Fallback DB si aucune source lineup trouvée
  if (canonicalBudget === 0) {
    canonicalBudget = Number(ev.budget) || 0;
    budgetSource    = 'event_budget_db';
  }

  // PRIORITÉ 4 — Reconstruction depuis escrowAmount (fallback final)
  // Si toutes les sources précédentes retournent 0 ET escrow > 0 :
  // escrowAmount = budget × 20% → budget = escrowAmount / 0.20
  // C'est la seule preuve que le budget était connu et valide au moment du dépôt.
  // JAMAIS silencieux — toujours logué.
  if (canonicalBudget === 0) {
    const escrow = Number(ev.escrowAmount) || 0;
    if (escrow > 0) {
      const reconstructed = Math.round((escrow / 0.20) * 100) / 100;
      canonicalBudget = reconstructed;
      budgetSource    = 'reconstructed_from_escrow';
      // Synchroniser Event.budget en DB avec la valeur reconstruite
      try {
        await service.entities.Event.update(ev.id, { budget: reconstructed });
        console.log(`[requestBalancePayment] v10 BUDGET_RECONSTRUCTED_FROM_ESCROW eventId=${ev.id} escrow=${escrow} budget=${reconstructed}`);
      } catch (syncErr) {
        console.warn(`[requestBalancePayment] v10 BUDGET_SYNC_FAILED eventId=${ev.id}:`, syncErr?.message);
      }
    } else {
      console.warn(`[requestBalancePayment] v10 BUDGET_UNRESOLVABLE eventId=${ev.id} — toutes sources=0, escrow=0. Budget réellement inconnu.`);
    }
  }

  return { canonicalBudget, budgetSource };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const service = base44.asServiceRole;
    if (!service) return json(503, { ok: false, error: 'Service role unavailable' });

    const user = await base44.auth.me().catch(() => null);
    if (!user) return json(401, { ok: false, error: 'Unauthorized' });

    const body = await req.json().catch(() => ({}));
    const forceEventId = body.eventId     || null;
    const forceResend  = body.forceResend === true;
    const mode              = body.mode              || 'balance_only';
    const adjustmentReason  = body.adjustmentReason  || null;  // requis si mode=adjustment
    const adjustmentAmount  = body.adjustmentAmount  != null   // montant exact à facturer
      ? Number(body.adjustmentAmount) : null;
    const snapshotBefore    = body.programmeSnapshotBefore || null;
    const snapshotAfter     = body.programmeSnapshotAfter  || null;

    if (!['balance_only', 'deposit_gap', 'full_settlement', 'adjustment'].includes(mode)) {
      return json(400, { ok: false, error: `mode invalide: ${mode}` });
    }

    if (!forceEventId && user.role !== 'admin') {
      return json(403, { ok: false, error: 'Admin only — appel cron sans eventId' });
    }

    const appUrl   = Deno.env.get('VITE_APP_URL') || 'https://microrave.ca';
    const now      = new Date();
    const nowIso   = now.toISOString();
    const isManual = Boolean(forceEventId);

    // v9 fix : retirer 'completed' du TERMINAL.
    // Un event completed avec escrow>0 et balancePaid=0 a besoin de la balance
    // pour financer son payout. Le bloquer ici = payout jamais financé.
    // 'cancelled' et 'aborted' restent terminaux (remboursement, pas de balance).
    const TERMINAL = ['cancelled', 'aborted'];

    // v9 fix : charger les events secured, released ET completed
    // completed peut avoir besoin de balance si balancePaid = 0.
    const allEvents = await service.entities.Event.filter({
      escrowStatus: { $in: ['secured', 'released'] },
    }).catch(() => []);

    // v6: résoudre les budgets en pré-passe async avant de filtrer
    // Nécessaire car resolveCanonicalBudget est async et filter() ne l'est pas.
    // On pré-calcule le budget canonique pour chaque event qui passe les guards
    // rapides (TERMINAL, forceEventId) puis on filtre sur le budget résolu.
    const budgetCache = {};
    const preFiltered = (allEvents || []).filter(ev => {
      if (TERMINAL.includes(ev.status)) return false;
      if (forceEventId && ev.id !== forceEventId) return false;
      if (forceEventId && user.role !== 'admin') {
        const orgId = ev.organizerId || ev.organizerUserId;
        if (orgId !== user.id) return false;
      }
      return true;
    });

    // Résoudre budget canonique pour chaque event pré-filtré
    for (const ev of preFiltered) {
      const { canonicalBudget, budgetSource } = await resolveCanonicalBudget(service, ev);
      budgetCache[ev.id] = { canonicalBudget, budgetSource };
      // Mettre à jour ev.budget en mémoire pour les calculs suivants
      ev._resolvedBudget = canonicalBudget;
    }

    const eligible = preFiltered.filter(ev => {
      // v9 : guard balancePaid — si balance déjà reçue, rien à demander
      if (Number(ev.balancePaid) > 0 && mode !== 'adjustment') return false;

      if (ev.balanceRequestSentAt && !forceResend && mode !== 'deposit_gap') return false;

      // v6 fix: utiliser le budget résolu (snapshot fallback) au lieu de ev.budget direct
      const resolvedBudget = ev._resolvedBudget ?? Number(ev.budget) ?? 0;
      if (resolvedBudget <= 0) return false;

      // v7 fix : pour les appels manuels (forceEventId fourni), ne pas filtrer sur la date.
      // L'organisateur demande explicitement la balance sur un event précis — peu importe
      // si la date est passée (events de test, events récents, etc.).
      // Le filtre temporel reste actif uniquement pour les appels cron (sans forceEventId).
      if (!isManual) {
        const dateStr = ev.dateStart || ev.startAt;
        if (!dateStr) return false;
        const dateStart = new Date(dateStr);
        if (dateStart <= now) return false;

        const balanceDueDate = new Date(dateStart.getTime() - 7 * 24 * 60 * 60 * 1000);
        if (balanceDueDate <= now) return false;
      }

      return true;
    });

    console.log(`[requestBalancePayment] v6 — ${eligible.length} event(s) éligibles (mode=${mode})`);

    const results = [];

    for (const ev of eligible) {
      // v6: utiliser le budget canonique pré-résolu (snapshot fallback)
      const budget        = ev._resolvedBudget ?? Number(ev.budget) ?? 0;
      const _budgetSource = budgetCache[ev.id]?.budgetSource || 'event_budget_db';
      const escrowAmount  = Number(ev.escrowAmount) || 0;
      const depositTarget = Math.round(budget * 0.20 * 100) / 100;
      const depositGap    = Math.round(Math.max(0, depositTarget - escrowAmount) * 100) / 100;

      // v7 fix : pour les appels manuels sur events passés, dateStart peut être dans le passé.
      // Dans ce cas, expiresAt = +72h (lien valide 3 jours).
      const dateStartRaw = ev.dateStart || ev.startAt;
      const dateStart    = dateStartRaw ? new Date(dateStartRaw) : null;
      const balanceDueDateRaw = dateStart ? new Date(dateStart.getTime() - 7 * 24 * 60 * 60 * 1000) : null;
      const isLate       = !balanceDueDateRaw || balanceDueDateRaw <= now;
      // Si l'event est passé (dateStart dans le passé ou absent), lien valide 72h
      const expiresAt    = (dateStart && dateStart > now)
        ? (isLate ? dateStart : balanceDueDateRaw)
        : new Date(now.getTime() + 72 * 60 * 60 * 1000);
      const dueDateDisplay = expiresAt.toLocaleDateString('fr-CA');

      // ── Calcul selon le mode ──────────────────────────────────────────────
      const STRIPE_RATE  = 0.029;
      const STRIPE_FIXED = 0.30;
      let requestedAmount;
      let netAmount       = 0;
      let stripeFeeAmount = 0;
      let requestType;
      let messageToPayer;

      // ── Mode adjustment : ajustement suite à modification du programme ────
      // Déclenché par l'organisateur après avoir ajouté/retiré un talent ou
      // modifié un cachet sur un event dont le dépôt a déjà été encaissé.
      // Le montant est fourni explicitement (adjustmentAmount) ou calculé
      // comme (nouveau budget - ancienne escrow - balance déjà payée).
      // Un EPR de type 'adjustment' est créé avec le contexte complet :
      //   - adjustmentReason  : texte lisible (ex: "Talent X ajouté — +150$")
      //   - deltaAmount       : différence signée pour la timeline ContractView
      //   - programmeSnapshotBefore/After : traçabilité historique des modifications
      if (mode === 'adjustment') {
        if (!adjustmentReason) {
          return json(400, {
            ok: false,
            error: 'adjustmentReason requis pour mode=adjustment — décrire la modification du programme.',
          });
        }
        const prevCollected = Math.round((escrowAmount + (Number(ev.balancePaid) || 0)) * 100) / 100;
        const newBudget     = budget; // budget canonique résolu
        requestedAmount     = adjustmentAmount != null
          ? Math.round(adjustmentAmount * 100) / 100
          : Math.round((newBudget - prevCollected) * 100) / 100;

        if (requestedAmount <= 0) {
          return json(200, {
            ok: false, processed: 0,
            error: `Montant d'ajustement (${requestedAmount}$) nul ou négatif — aucun paiement requis.`,
            results: [],
          });
        }
        requestType    = 'adjustment';
        messageToPayer = `Ajustement de programme — ${adjustmentReason}. Montant additionnel : ${requestedAmount.toFixed(2)} $`;

      } else if (mode === 'deposit_gap') {
        if (depositGap < DEPOSIT_GAP_MIN) {
          if (forceEventId) {
            return json(200, {
              ok: false, processed: 0,
              error: `Complément de dépôt (${depositGap}$) inférieur au seuil de ${DEPOSIT_GAP_MIN}$ — dépôt considéré complet.`,
              depositGap, results: [],
            });
          }
          continue;
        }
        requestedAmount = depositGap;
        requestType     = 'deposit';
        messageToPayer  = `Complément de dépôt suite à modification du lineup — ${depositGap.toFixed(2)} $ (dépôt reçu : ${escrowAmount.toFixed(2)} $, attendu : ${depositTarget.toFixed(2)} $)`;

      } else if (mode === 'full_settlement') {
        // full_settlement : budget total - tout ce qui a déjà été perçu net
        const percuNet = await calcPercuNet(service, ev.id);
        const balanceNet   = Math.round(Math.max(0, budget - percuNet) * 100) / 100;
        const balanceGross = Math.round(((balanceNet + STRIPE_FIXED) / (1 - STRIPE_RATE)) * 100) / 100;
        const balanceFee   = Math.round((balanceGross - balanceNet) * 100) / 100;
        requestedAmount = balanceGross;
        netAmount       = balanceNet;
        stripeFeeAmount = balanceFee;
        requestType     = 'balance';
        messageToPayer  = `Règlement complet — ${budget.toFixed(2)} $ total, ${percuNet.toFixed(2)} $ déjà reçu (net), ${requestedAmount.toFixed(2)} $ restant (dont ${balanceFee.toFixed(2)} $ frais Stripe)`;

      } else {
        // balance_only : budget - total net déjà perçu (dépôts + ajustements approuvés)
        // Formule universelle : couvre dépôt partiel, double dépôt, modification programme.
        // Source : sum(EPR.netAmount WHERE status=approved).
        const percuNet     = await calcPercuNet(service, ev.id);
        const balanceNet   = Math.round(Math.max(0, budget - percuNet) * 100) / 100;
        const balanceGross = Math.round(((balanceNet + STRIPE_FIXED) / (1 - STRIPE_RATE)) * 100) / 100;
        const balanceFee   = Math.round((balanceGross - balanceNet) * 100) / 100;
        requestedAmount = balanceGross;
        netAmount       = balanceNet;
        stripeFeeAmount = balanceFee;
        requestType     = 'balance';
        messageToPayer  = isLate
          ? `Solde restant (${balanceNet.toFixed(2)} $ + ${balanceFee.toFixed(2)} $ frais = ${requestedAmount.toFixed(2)} $) — à régler avant le début de l'événement le ${dueDateDisplay}`
          : `Solde restant (${balanceNet.toFixed(2)} $ + ${balanceFee.toFixed(2)} $ frais = ${requestedAmount.toFixed(2)} $) — à régler avant le ${dueDateDisplay}`;
      }

      if (requestedAmount <= 0) continue;

      const token      = crypto.randomUUID();
      const paymentUrl = `${appUrl}/PaymentPage?token=${token}`;

      const epr = await service.entities.EventPaymentRequest.create({
        eventId:         ev.id,
        organizerUserId: ev.organizerId || ev.organizerUserId,
        payerEmail:      ev.payerEmail  || '',
        payerUserId:     ev.payerUserId || null,
        requestedAmount,
        netAmount,
        stripeFeeAmount,
        messageToPayer,
        secureToken:     token,
        requestStatus:   'sent',
        expiresAt:       expiresAt.toISOString(),
        createdAt:       nowIso,
        requestType,
        // Champs v8 — contexte d'ajustement et traçabilité
        adjustmentReason:         mode === 'adjustment' ? adjustmentReason : null,
        deltaAmount:              mode === 'adjustment' ? requestedAmount  : null,
        programmeSnapshotBefore:  mode === 'adjustment' ? snapshotBefore   : null,
        programmeSnapshotAfter:   mode === 'adjustment' ? snapshotAfter    : null,
      });

      // deposit_gap ne marque PAS balanceRequestSentAt — la balance n'a pas encore été demandée
      if (mode !== 'deposit_gap') {
        await service.entities.Event.update(ev.id, {
          balanceRequestSentAt:    nowIso,
          balanceDueDate:          balanceDueDateRaw ? balanceDueDateRaw.toISOString() : expiresAt.toISOString(),
          balancePaymentRequestId: epr.id,
        });
      }

      const toEmail = ev.payerEmail || '';
      if (toEmail) {
        try {
          await service.integrations.Core.SendEmail({
            to:      toEmail,
            subject: `${mode === 'deposit_gap' ? 'Complément de dépôt' : mode === 'adjustment' ? 'Ajustement de programme' : 'Solde à régler'} — ${ev.title}`,
            body:    `Bonjour,\n\n${messageToPayer}\n\nLien de paiement : ${paymentUrl}\n\nMerci,\nL'équipe Micro Rave`,
          });
        } catch (emailErr) {
          console.warn(`[requestBalancePayment] email error event=${ev.id}: ${emailErr?.message}`);
        }
      }

      results.push({ eventId: ev.id, title: ev.title, eprId: epr.id, requestedAmount, requestType, mode, depositGap, expiresAt: expiresAt.toISOString(), isLate, token, paymentUrl });
      console.log(`[requestBalancePayment] v8 OK eventId=${ev.id} mode=${mode} amount=${requestedAmount}$ type=${requestType} budgetSrc=${_budgetSource}`);
    }

    if (forceEventId && results.length === 1) {
      const r = results[0];
      return json(200, { ok: true, processed: 1, token: r.token, paymentUrl: r.paymentUrl, requestedAmount: r.requestedAmount, requestType: r.requestType, mode: r.mode, depositGap: r.depositGap, isLate: r.isLate, eprId: r.eprId, results });
    }

    if (forceEventId && results.length === 0) {
      return json(200, { ok: false, processed: 0, error: "Aucun event éligible trouvé.", results: [] });
    }

    return json(200, { ok: true, processed: results.length, results });

  } catch (error) {
    console.error('[requestBalancePayment]', error?.message);
    return json(500, { ok: false, error: error?.message });
  }
});