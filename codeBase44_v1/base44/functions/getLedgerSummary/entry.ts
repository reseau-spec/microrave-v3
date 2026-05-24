// deploy: v2
// CHANGEMENTS v2 — Ajout pending_recognition :
//   Splits hors FinancialLedger (platform_production, seller_commission, talent_video)
//   affichés séparément — ne modifient pas isBalanced.
// getLedgerSummary — Reporting financier depuis FinancialLedger (double-entry)
//
// Produit : Bilan (Balance Sheet), P&L (Income Statement), Cashflow
// Source  : FinancialLedger uniquement — append-only, WORM, double-entry
// Unité   : amount_cents (integer centimes) → converti en dollars CAD dans la réponse
//
// ── PLAN COMPTABLE ──────────────────────────────────────────────────────────
//
//   ACTIFS (Assets)
//   ┌─ stripe_clearing         Autorisations en transit (requires_capture)
//   └─ stripe_balance          Fonds réels dans le compte Stripe plateforme
//
//   PASSIFS (Liabilities)
//   ┌─ escrow_liability         Dû aux talents/organisateurs (dépôt séquestré)
//   ├─ balance_liability        Dû aux talents (balance + ajustements capturés)
//   └─ stripe_connect_transit   Transferts en transit vers comptes Connect talents
//
//   REVENUS (Revenue)
//   └─ revenue_commission       Commissions Micro Rave (P&L)
//
//   DÉPENSES / PASSIF SPÉCIAL
//   └─ refund_payable           Remboursements à effectuer
//
// ── RÈGLE DOUBLE-ENTRY ──────────────────────────────────────────────────────
//
//   Pour chaque compte :
//     solde = Σ(debits) - Σ(credits)   [pour les comptes actifs]
//     solde = Σ(credits) - Σ(debits)   [pour les comptes passifs + revenus]
//
//   Équation comptable vérifiable :
//     Actif total = Passif total + Capitaux propres (revenus nets)
//
// ── FLUX COMPLET PAR ENTRYTYPE ──────────────────────────────────────────────
//
//   deposit_authorized    Dr stripe_clearing    / Cr escrow_liability
//   deposit_captured      Dr stripe_balance     / Cr stripe_clearing
//   escrow_released       Dr escrow_liability   / Cr stripe_balance
//   balance_received      Dr stripe_balance     / Cr balance_liability
//   adjustment_received   Dr stripe_balance     / Cr balance_liability
//   talent_transfer       Dr escrow_liability   / Cr stripe_connect_transit
//   commission_earned     Dr escrow_liability   / Cr revenue_commission
//   noshow_refund         Dr balance_liability  / Cr refund_payable
//   cancellation_deposit_split  Dr escrow_liability / Cr refund_payable
//   reversal              Inversion d'une entrée existante (sens opposé)
//
// Input (query params ou body) :
//   eventId    (optionnel) — filtrer sur un event précis
//   dateFrom   (optionnel) — ISO date début de période
//   dateTo     (optionnel) — ISO date fin de période
//   currency   (optionnel, défaut CAD) — devise de rapport
//
// Output :
//   balanceSheet : { assets, liabilities, equity, isBalanced }
//   pnl          : { revenue, cogs, grossProfit, netIncome }
//   cashflow     : { inflows, outflows, netCashflow }
//   ledgerStats  : { totalEntries, eventCount, currency }

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

// Convertir centimes en dollars, arrondi 2 décimales
function toDollars(cents) {
  return Math.round(cents) / 100;
}

// Grouper les entrées par compte et calculer les soldes
function computeAccountBalances(entries) {
  const accounts = {};

  for (const entry of entries) {
    const code = entry.accountCode;
    if (!accounts[code]) accounts[code] = { debits: 0, credits: 0 };
    const amount = Math.abs(Math.round(Number(entry.amount_cents) || 0));
    if (entry.debitCredit === 'debit') {
      accounts[code].debits += amount;
    } else {
      accounts[code].credits += amount;
    }
  }

  const result = {};
  for (const [code, { debits, credits }] of Object.entries(accounts)) {
    // Actifs : solde = debits - credits (positif = ressource)
    // Passifs + Revenus : solde = credits - debits (positif = dette / revenu)
    const isAsset = ['stripe_clearing', 'stripe_balance'].includes(code);
    result[code] = {
      debits,
      credits,
      balance: isAsset ? (debits - credits) : (credits - debits),
    };
  }
  return result;
}

Deno.serve(async (req) => {
  try {
    const base44  = createClientFromRequest(req);
    const user    = await base44.auth.me().catch(() => null);
    if (!user) return json(401, { error: 'Non authentifié' });

    // Seuls les admins peuvent accéder au ledger global
    // Les organisateurs peuvent accéder à leur propre eventId
    const isAdmin = user.role === 'admin';

    // Parser les paramètres
    let params = {};
    if (req.method === 'POST') {
      params = await req.json().catch(() => ({}));
    } else {
      const url = new URL(req.url);
      url.searchParams.forEach((v, k) => { params[k] = v; });
    }

    const { eventId, dateFrom, dateTo } = params;
    const currency = (params.currency || 'CAD').toUpperCase();

    // Guard : non-admin ne peut accéder qu'à son propre event
    if (!isAdmin && !eventId) {
      return json(403, { error: 'eventId requis pour les non-admins' });
    }

    const service = base44.asServiceRole;

    // ── Charger les entrées FinancialLedger ──────────────────────────────────
    const filterQuery = {};
    if (eventId) filterQuery.eventId = eventId;
    if (currency !== 'ALL') filterQuery.currency = currency;

    let entries = await service.entities.FinancialLedger.filter(filterQuery).catch(() => []);
    entries = entries || [];

    // Filtres temporels (post-fetch car Base44 filter() ne supporte pas range)
    if (dateFrom) {
      const from = new Date(dateFrom).getTime();
      entries = entries.filter(e => {
        const t = e.createdAt ? new Date(e.createdAt).getTime() : 0;
        return t >= from;
      });
    }
    if (dateTo) {
      const to = new Date(dateTo).getTime();
      entries = entries.filter(e => {
        const t = e.createdAt ? new Date(e.createdAt).getTime() : 0;
        return t <= to;
      });
    }

    // Guard accès organisateur : vérifier que l'event appartient au user
    if (!isAdmin && eventId) {
      const evRows = await service.entities.Event.filter({ id: eventId }).catch(() => []);
      const ev = evRows?.[0];
      if (!ev) return json(404, { error: 'Événement introuvable' });
      const orgId = ev.organizerId || ev.organizerUserId;
      if (orgId !== user.id) return json(403, { error: 'Accès refusé' });
    }

    // ── Calculer les soldes par compte ────────────────────────────────────────
    const balances = computeAccountBalances(entries);

    const get = (code) => balances[code] || { debits: 0, credits: 0, balance: 0 };

    // ── BILAN (Balance Sheet) ─────────────────────────────────────────────────
    //
    // ACTIFS
    const stripeClearing   = get('stripe_clearing').balance;   // autorisations en transit
    const stripeBalance    = get('stripe_balance').balance;    // fonds réels capturés
    const totalAssets      = stripeClearing + stripeBalance;

    // PASSIFS
    const escrowLiability         = get('escrow_liability').balance;         // dépôts séquestrés
    const balanceLiability        = get('balance_liability').balance;        // balances dues
    const stripeConnectTransit    = get('stripe_connect_transit').balance;   // transferts en transit
    const refundPayable           = get('refund_payable').balance;           // remboursements à faire
    const totalLiabilities        = escrowLiability + balanceLiability + stripeConnectTransit + refundPayable;

    // CAPITAUX PROPRES = Revenus nets (P&L cumulé)
    const revenueCommission = get('revenue_commission').balance;
    const totalEquity       = revenueCommission;

    // Vérification équation comptable : Actif = Passif + Capitaux propres
    const theoreticalBalance = totalLiabilities + totalEquity;
    const imbalance          = Math.abs(totalAssets - theoreticalBalance);
    const isBalanced         = imbalance < 2; // tolérance 2 centimes (arrondis)

    // ── P&L (Income Statement) ───────────────────────────────────────────────
    //
    // REVENUS
    // revenue_commission : commissions prélevées sur les cachets
    const commissionRevenue = get('revenue_commission').balance;

    // CASH-IN TOTAL (informationnel — pas un poste P&L mais utile)
    const totalCashIn =
      // dépôts autorisés
      (balances['escrow_liability']?.credits || 0) +
      // balances reçues
      (balances['balance_liability']?.credits || 0);

    // CASH-OUT TOTAL (informationnel)
    const totalTalentTransfers  = get('stripe_connect_transit').credits;
    const totalRefundsIssued    = get('refund_payable').credits;

    // ── CASHFLOW ─────────────────────────────────────────────────────────────
    //
    // Inflows : argent entrant dans le compte plateforme
    const depositsCaptured      = (balances['stripe_balance']?.debits || 0);   // captures Stripe
    const balanceReceived       = (balances['balance_liability']?.credits || 0); // balances + ajustements

    // Outflows : argent sortant vers les talents ou remboursements
    const payoutsExecuted       = (balances['stripe_connect_transit']?.credits || 0);
    const refundsExecuted       = (balances['refund_payable']?.credits || 0);

    const netCashflow           = depositsCaptured - payoutsExecuted - refundsExecuted;

    // ── Statistiques ledger ───────────────────────────────────────────────────
    const eventIds  = [...new Set(entries.map(e => e.eventId).filter(Boolean))];
    const entryTypeDistribution = {};
    for (const e of entries) {
      const t = e.entryType || 'unknown';
      entryTypeDistribution[t] = (entryTypeDistribution[t] || 0) + 1;
    }

    // ── Construire la réponse ─────────────────────────────────────────────────
    // ── SPLITS HORS LEDGER (v2) ─────────────────────────────────────────────
    // platform_production, seller_commission, talent_video : créés par
    // generatePayoutSplits mais sans paire Dr/Cr dans FinancialLedger.
    const pendingSplitTotals = { platform_production: 0, seller_commission: 0, talent_video: 0 };
    try {
      const allPendingSplits = await service.entities.PayoutSplit
        .filter({ status: 'pending' }).catch(() => []);
      for (const s of (allPendingSplits || [])) {
        const rt = s.roleType;
        if (rt in pendingSplitTotals) {
          pendingSplitTotals[rt] = Math.round(
            (pendingSplitTotals[rt] + (Number(s.amount) || 0)) * 100
          ) / 100;
        }
      }
    } catch (e) {
      console.warn('[getLedgerSummary] v2 pending splits (non-fatal):', e?.message);
    }

    const report = {
      ok: true,
      generatedAt: new Date().toISOString(),
      currency,
      filters: { eventId: eventId || null, dateFrom: dateFrom || null, dateTo: dateTo || null },

      // ── BILAN ──────────────────────────────────────────────────────────────
      balanceSheet: {
        assets: {
          stripe_clearing:    toDollars(stripeClearing),
          stripe_balance:     toDollars(stripeBalance),
          total:              toDollars(totalAssets),
          description: {
            stripe_clearing: 'Autorisations carte en attente de capture (requires_capture)',
            stripe_balance:  'Fonds réels dans le compte Stripe plateforme',
          },
        },
        liabilities: {
          escrow_liability:        toDollars(escrowLiability),
          balance_liability:       toDollars(balanceLiability),
          stripe_connect_transit:  toDollars(stripeConnectTransit),
          refund_payable:          toDollars(refundPayable),
          total:                   toDollars(totalLiabilities),
          description: {
            escrow_liability:       'Dépôts séquestrés — dus aux talents/organisateurs',
            balance_liability:      'Balances capturées — dues aux talents',
            stripe_connect_transit: 'Transferts Stripe Connect en cours vers talents',
            refund_payable:         'Remboursements à effectuer',
          },
        },
        equity: {
          revenue_commission: toDollars(revenueCommission),
          total:              toDollars(totalEquity),
          description: 'Commissions Micro Rave accumulées (P&L)',
        },
        isBalanced,
        imbalance_cents: imbalance,
        // Actif doit égaler Passif + Capitaux propres
        // Si isBalanced=false : divergence dans le ledger à investiguer
        equation: `${toDollars(totalAssets).toFixed(2)}$ = ${toDollars(totalLiabilities).toFixed(2)}$ + ${toDollars(totalEquity).toFixed(2)}$`,
      },

      // ── P&L ────────────────────────────────────────────────────────────────
      pnl: {
        revenue: {
          commission_earned: toDollars(commissionRevenue),
          total:             toDollars(commissionRevenue),
        },
        // COGS = coût direct des paiements (dans ce modèle : frais Stripe, si tracés)
        // Pour l'instant non tracés dans le ledger → COGS = 0
        cogs: 0,
        grossProfit:  toDollars(commissionRevenue),
        netIncome:    toDollars(commissionRevenue),
        // Métriques informelles
        cashInTotal:  toDollars(totalCashIn),
        cashOutTalents: toDollars(totalTalentTransfers),
        cashOutRefunds: toDollars(totalRefundsIssued),
      },

      // ── CASHFLOW ───────────────────────────────────────────────────────────
      cashflow: {
        inflows: {
          deposits_captured:  toDollars(depositsCaptured),
          balance_received:   toDollars(balanceReceived),
          total:              toDollars(depositsCaptured + balanceReceived),
        },
        outflows: {
          payouts_executed:  toDollars(payoutsExecuted),
          refunds_executed:  toDollars(refundsExecuted),
          total:             toDollars(payoutsExecuted + refundsExecuted),
        },
        netCashflow: toDollars(netCashflow),
        // Trésorerie disponible = stripe_balance - passifs immédiats
        // (commissions déjà reconnues donc déduites des passifs)
        availableCash: toDollars(stripeBalance - escrowLiability - balanceLiability),
      },

      // ── DÉTAIL PAR COMPTE (pour audit) ─────────────────────────────────────
      accountDetail: Object.fromEntries(
        Object.entries(balances).map(([code, { debits, credits, balance }]) => [
          code,
          {
            debits_dollars:  toDollars(debits),
            credits_dollars: toDollars(credits),
            balance_dollars: toDollars(balance),
          },
        ])
      ),

      // ── STATISTIQUES LEDGER ────────────────────────────────────────────────
      ledgerStats: {
        totalEntries:        entries.length,
        eventCount:          eventIds.length,
        currency,
        entryTypeDistribution,
        // Alerte si le nombre d'entrées debit ≠ crédits (ledger corrompu)
        debitCount:  entries.filter(e => e.debitCredit === 'debit').length,
        creditCount: entries.filter(e => e.debitCredit === 'credit').length,
        isSymmetric: entries.filter(e => e.debitCredit === 'debit').length ===
                     entries.filter(e => e.debitCredit === 'credit').length,
      },


      // ── SPLITS HORS LEDGER ─────────────────────────────────────────────────
      pending_recognition: {
        description: 'Splits générés sans entrée FinancialLedger — hors bilan équilibré',
        platform_production: toDollars(pendingSplitTotals.platform_production),
        seller_commission:   toDollars(pendingSplitTotals.seller_commission),
        talent_video:        toDollars(pendingSplitTotals.talent_video),
        total: toDollars(
          pendingSplitTotals.platform_production +
          pendingSplitTotals.seller_commission +
          pendingSplitTotals.talent_video
        ),
        note: 'Ces montants nécessitent un chemin batchExecutePayoutTransfers pour les roleTypes correspondants',
      },

      // ── AVERTISSEMENTS ─────────────────────────────────────────────────────
      warnings: [
        ...(!isBalanced ? [`BILAN DÉSÉQUILIBRÉ : écart de ${toDollars(imbalance).toFixed(4)}$ — investiguer les entrées orphelines`] : []),
        ...(entries.filter(e => e.debitCredit === 'debit').length !==
            entries.filter(e => e.debitCredit === 'credit').length
          ? ['SYMÉTRIE ROMPUE : nombre debits ≠ credits — entrées orphelines détectées']
          : []),
        ...(eventIds.length === 0 && !eventId
          ? ["Aucune entrée FinancialLedger trouvée. Les events antérieurs à FinancialLedger v6 ne sont pas inclus — consulter PaymentLedger pour l'historique ancien."]
          : []),
      ],
    };

    return json(200, report);

  } catch (err) {
    console.error('[getLedgerSummary] error:', err?.message);
    return json(500, { ok: false, error: err?.message });
  }
});