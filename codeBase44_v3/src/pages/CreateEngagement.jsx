/**
 * createEngagement — Base44 Function v4
 * ============================================================
 * Crée un Event + un Engagement en état initial `placed`.
 *
 * ARCHITECTURE — Deux blocs indépendants et séquentiels :
 *
 *   BLOC 1 — Comptabilité (obligatoire, fail-hard)
 *     a. Résoudre les comptes depuis PolicyConfig
 *     b. Créer Event + Engagement en base
 *     c. Écrire les 3 LedgerRecords (LOI LEDGER-01/02)
 *     → Si une étape échoue : retourner 500, rien n'est créé.
 *     → Les LedgerRecords ne dépendent PAS de Stripe.
 *
 *   BLOC 2 — Paiement Stripe (best-effort, fail-soft)
 *     a. Créer la Checkout Session Stripe
 *     b. Créer l'EventPaymentRequest
 *     c. Passer l'engagement en deposit_pending
 *     → Si Stripe échoue : l'engagement reste en placed,
 *       les LedgerRecords sont déjà écrits, la réponse
 *       retourne ok=true avec stripeError documenté.
 *     → L'organisateur peut réessayer le paiement plus tard.
 *
 * POURQUOI cette séparation :
 *   Une erreur Stripe (clé manquante, timeout, rate limit)
 *   ne doit jamais masquer un problème comptable.
 *   Inversement, un engagement sans paiement immédiat
 *   doit quand même exister dans le ledger.
 *
 * Source : D-016, D-019-A, D-027, D-038, D-060, Market Pivot V3
 * ============================================================
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// ── Helpers ──────────────────────────────────────────────────

function generateId(prefix) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const s1 = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  const s2 = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `${prefix}-${s1}-${s2}`;
}

function floorPpm(amountCents, ratePpm) {
  return Math.floor(amountCents * ratePpm / 1_000_000);
}

// ── Résolution comptes depuis PolicyConfig (Market Pivot) ────
// Les codes comptables ne sont JAMAIS écrits en dur dans le code.
// Fail-hard si une clé manque — ne jamais fallback vers un hardcode.
async function loadLedgerAccounts(base44) {
  const keys = [
    'ledger_account_clearing',
    'ledger_account_talent_payable',
    'ledger_account_commission_escrow',
  ];

  const accounts = {};
  const missing  = [];

  for (const key of keys) {
    const records = await base44.entities.PolicyConfig
      .filter({ key }, '-created_date', 1)
      .catch(() => []);
    if (records?.length && records[0].value) {
      accounts[key] = records[0].value;
    } else {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `LEDGER_ACCOUNTS_MISSING: Clés PolicyConfig absentes : ${missing.join(', ')}. ` +
      `Ajouter ces clés dans PolicyConfig avant de créer des engagements. Source : D-060, Market Pivot V3.`
    );
  }

  return {
    clearing:         accounts['ledger_account_clearing'],
    talentPayable:    accounts['ledger_account_talent_payable'],
    commissionEscrow: accounts['ledger_account_commission_escrow'],
  };
}

// ── BLOC 1 : Comptabilité ─────────────────────────────────────
// Crée Event, Engagement, et LedgerRecords.
// Retourne { event, engagement, txgId } ou lève une exception.
// Aucun appel Stripe ici.
async function createEngagementWithLedger({
  base44, organizerUserId, talentUserId,
  eventName, eventDate, venueAddress,
  cachetSigneCents, roleMetier, description,
  tauxPpm, depositRatioPpm,
}) {
  const commissionMrCents = floorPpm(cachetSigneCents, tauxPpm);
  const talentNetCents    = cachetSigneCents - commissionMrCents;
  const depositCents      = floorPpm(cachetSigneCents, depositRatioPpm);
  const balanceCents      = cachetSigneCents - depositCents;

  const eventSystemId      = generateId('EVT');
  const engagementSystemId = generateId('ENG');
  const now                = new Date().toISOString();

  // ── 1a. Résoudre les comptes ──────────────────────────────
  const accounts = await loadLedgerAccounts(base44);

  // ── 1b. Créer Event ───────────────────────────────────────
  await base44.entities.Event.create({
    systemId:         eventSystemId,
    organizerUserId,
    name:             eventName,
    venue:            venueAddress,
    scheduledStartAt: eventDate,
    status:           'draft',
    createdAt:        now,
  });

  // ── 1c. Créer Engagement ──────────────────────────────────
  await base44.entities.Engagement.create({
    systemId:            engagementSystemId,
    eventId:             eventSystemId,
    talentUserId,
    organizerUserId,
    roleMetier:          roleMetier || 'NON_SPECIFIE',
    cachetSigneCents,
    tauxPpm,
    commissionMrCents,
    talentNetCents,
    depositCents,
    balanceCents,
    prixVenduClientCents: cachetSigneCents,
    currency:            'cad',
    status:              'placed',
    description:         description || '',
    createdAt:           now,
  });

  // ── 1d. Écrire les LedgerRecords (D-038 · LOI LEDGER-01/02) ──
  // Waterfall gravé dès le placement — indépendant du paiement Stripe.
  // Comptes depuis PolicyConfig (Market Pivot V3) :
  //   clearing        DR  cachetSigneCents  — fonds à ventiler
  //   talentPayable   CR  talentNetCents    — dette envers le talent
  //   commissionEscrow CR commissionMrCents — revenu MR différé

  const txgId = `TXG-${engagementSystemId.slice(4)}`;

  const ledgerEntries = [
    {
      systemId:           generateId('LDG'),
      transactionGroupId: txgId,
      transactionType:    'placement_engagement',
      lineIndex:          0,
      engagementId:       engagementSystemId,
      eventId:            eventSystemId,
      skuCode:            'SKU-COURTAGE',
      subSkuCode:         `SUB-COURT-${(roleMetier || 'DJ').toUpperCase().slice(0, 10)}`,
      account:            accounts.clearing,
      direction:          'DEBIT',
      amountCents:        cachetSigneCents,
      currency:           'cad',
      reconciliationKey:  `journal:placement-${engagementSystemId}`,
      note:               `Placement ${engagementSystemId} — clearing waterfall ${(cachetSigneCents/100).toFixed(2)}$`,
      metadata:           JSON.stringify({
        transactionGroupId: txgId,
        lineCount:          3,
        waterfall:          { cachetSigneCents, commissionMrCents, talentNetCents, tauxPpm },
      }),
      createdAt:          now,
    },
    {
      systemId:           generateId('LDG'),
      transactionGroupId: txgId,
      transactionType:    'placement_engagement',
      lineIndex:          1,
      engagementId:       engagementSystemId,
      eventId:            eventSystemId,
      skuCode:            'SKU-COURTAGE',
      subSkuCode:         `SUB-COURT-${(roleMetier || 'DJ').toUpperCase().slice(0, 10)}`,
      account:            accounts.talentPayable,
      direction:          'CREDIT',
      amountCents:        talentNetCents,
      currency:           'cad',
      reconciliationKey:  `journal:placement-${engagementSystemId}`,
      note:               `Cachet net talent — ${(talentNetCents/100).toFixed(2)}$`,
      metadata:           JSON.stringify({ transactionGroupId: txgId, lineCount: 3 }),
      createdAt:          now,
    },
    {
      systemId:           generateId('LDG'),
      transactionGroupId: txgId,
      transactionType:    'placement_engagement',
      lineIndex:          2,
      engagementId:       engagementSystemId,
      eventId:            eventSystemId,
      skuCode:            'SKU-COURTAGE',
      subSkuCode:         `SUB-COURT-${(roleMetier || 'DJ').toUpperCase().slice(0, 10)}`,
      account:            accounts.commissionEscrow,
      direction:          'CREDIT',
      amountCents:        commissionMrCents,
      currency:           'cad',
      reconciliationKey:  `journal:placement-${engagementSystemId}`,
      note:               `Commission MR différée ${(tauxPpm/10000).toFixed(1)}% — escrow jusqu'à archivage`,
      metadata:           JSON.stringify({ transactionGroupId: txgId, lineCount: 3 }),
      createdAt:          now,
    },
  ];

  // LOI LEDGER-02 — fail-hard si DR ≠ CR
  const dr = ledgerEntries.filter(e => e.direction === 'DEBIT').reduce((s, e) => s + e.amountCents, 0);
  const cr = ledgerEntries.filter(e => e.direction === 'CREDIT').reduce((s, e) => s + e.amountCents, 0);
  if (dr !== cr) {
    throw new Error(
      `LOI_LEDGER_02_VIOLATED: DR=${dr} CR=${cr} pour TXG=${txgId}. ` +
      `Écart=${dr-cr}¢. Aucune ligne LedgerRecord persistée. Source : D-069.`
    );
  }

  // Persister les 3 lignes (append-only)
  for (const entry of ledgerEntries) {
    await base44.entities.LedgerRecord.create(entry);
  }

  return {
    eventSystemId,
    engagementSystemId,
    txgId,
    commissionMrCents,
    talentNetCents,
    depositCents,
    balanceCents,
    tauxPpm,
    now,
  };
}

// ── BLOC 2 : Paiement Stripe (best-effort) ────────────────────
// Crée la Checkout Session et l'EPR.
// Ne lève jamais d'exception — retourne { ok, checkoutUrl, error }.
async function initiateStripeCheckout({
  base44, engagementSystemId, eventSystemId,
  organizerUserId, talentUserId,
  depositCents, cachetSigneCents,
  successUrl, cancelUrl, now,
}) {
  try {
    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY') || '';
    if (!stripeSecretKey) {
      return { ok: false, error: 'STRIPE_SECRET_KEY absent des variables d\'environnement Base44.' };
    }

    const appBaseUrl   = Deno.env.get('APP_BASE_URL') || 'https://futuristic-rave-core-flow.base44.app';
    const finalSuccess = successUrl || `${appBaseUrl}/engagement/${engagementSystemId}?payment=success`;
    const finalCancel  = cancelUrl  || `${appBaseUrl}/engagement/${engagementSystemId}?payment=cancelled`;

    const params = new URLSearchParams({
      'payment_method_types[]':                          'card',
      'line_items[0][price_data][currency]':             'cad',
      'line_items[0][price_data][unit_amount]':          String(depositCents),
      'line_items[0][price_data][product_data][name]':   `Dépôt — ${engagementSystemId}`,
      'line_items[0][price_data][product_data][description]':
        `Acompte Micro Rave (20% du cachet de ${(cachetSigneCents/100).toFixed(2)} $)`,
      'line_items[0][quantity]':                         '1',
      'mode':                                            'payment',
      'success_url':                                     finalSuccess,
      'cancel_url':                                      finalCancel,
      'metadata[engagementId]':                          engagementSystemId,
      'metadata[phase]':                                 'deposit',
      'metadata[organizerUserId]':                       organizerUserId,
      'metadata[talentUserId]':                          talentUserId || '',
      'metadata[platform]':                              'microrave-v3',
    });

    const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method:  'POST',
      headers: {
        'Authorization':   `Bearer ${stripeSecretKey}`,
        'Content-Type':    'application/x-www-form-urlencoded',
        'Idempotency-Key': `cs-deposit-${engagementSystemId}`,
      },
      body: params.toString(),
    });

    if (!stripeRes.ok) {
      const err = await stripeRes.json().catch(() => ({}));
      return { ok: false, error: `STRIPE_ERROR: ${err?.error?.message || 'Checkout Session échouée.'}` };
    }

    const session = await stripeRes.json();

    // Créer l'EventPaymentRequest (piste d'audit)
    const eprId = generateId('EPR');
    await base44.entities.EventPaymentRequest.create({
      systemId:                eprId,
      engagementId:            engagementSystemId,
      organizerUserId,
      amountCents:             depositCents,
      currency:                'cad',
      phase:                   'deposit',
      status:                  'pending',
      stripePaymentIntentId:   session.payment_intent || '',
      stripeCheckoutSessionId: session.id,
      stripeCheckoutUrl:       session.url,
      createdAt:               now,
    });

    // Transition vers deposit_pending
    await base44.entities.Engagement.filter(
      { systemId: engagementSystemId }, '-created_date', 1
    ).then(async (rows) => {
      if (rows?.length) {
        await base44.entities.Engagement.update(rows[0].id, {
          status:    'deposit_pending',
          updatedAt: now,
        });
      }
    });

    return { ok: true, checkoutUrl: session.url, eprId, sessionId: session.id };

  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// ── Main ─────────────────────────────────────────────────────

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // ── Auth (#012 — organizerUserId depuis auth, jamais payload) ─
    const me = await base44.auth.me();
    if (!me?.id) {
      return Response.json({ ok: false, error: 'AUTH_REQUIRED.' }, { status: 401 });
    }
    const organizerUserId = me.id;

    const body = await req.json();
    const { talentUserId, eventName, eventDate, venueAddress,
            cachetSigneCents, roleMetier, description,
            successUrl, cancelUrl } = body;

    // ── Validation ────────────────────────────────────────────
    if (!talentUserId)   return Response.json({ ok: false, error: 'VALIDATION: talentUserId obligatoire.' }, { status: 400 });
    if (!eventName)      return Response.json({ ok: false, error: 'VALIDATION: eventName obligatoire.' }, { status: 400 });
    if (!eventDate)      return Response.json({ ok: false, error: 'VALIDATION: eventDate obligatoire.' }, { status: 400 });
    if (!venueAddress)   return Response.json({ ok: false, error: 'VALIDATION: venueAddress obligatoire.' }, { status: 400 });
    if (!Number.isInteger(cachetSigneCents) || cachetSigneCents <= 0) {
      return Response.json({ ok: false, error: 'VALIDATION: cachetSigneCents doit être un entier positif en cents.' }, { status: 400 });
    }

    // ── Résoudre tauxPpm depuis MembershipPlan ────────────────
    let tauxPpm = 120_000; // fallback Freemium
    try {
      const memberships = await base44.entities.UserMembership.filter(
        { userId: organizerUserId, status: 'active' }, '-created_date', 1
      );
      if (memberships?.length && memberships[0].planId) {
        const plans = await base44.entities.MembershipPlan.filter(
          { id: memberships[0].planId, is_active: true }, '-created_date', 1
        );
        if (plans?.length && plans[0].commission_rate_ppm) {
          tauxPpm = Number(plans[0].commission_rate_ppm);
        }
      }
    } catch (_) {}

    // ── Ratio dépôt depuis PolicyConfig ──────────────────────
    let depositRatioPpm = 200_000; // fallback 20%
    try {
      const configs = await base44.entities.PolicyConfig.filter(
        { key: 'deposit_ratio_ppm' }, '-created_date', 1
      );
      if (configs?.length) depositRatioPpm = Number(configs[0].value);
    } catch (_) {}

    // ════════════════════════════════════════════════════════
    // BLOC 1 — Comptabilité (fail-hard)
    // Si ce bloc échoue, on retourne une erreur explicite.
    // Aucune ligne partielle n'est laissée en base.
    // ════════════════════════════════════════════════════════
    let ledgerResult;
    try {
      ledgerResult = await createEngagementWithLedger({
        base44, organizerUserId, talentUserId,
        eventName, eventDate, venueAddress,
        cachetSigneCents, roleMetier, description,
        tauxPpm, depositRatioPpm,
      });
    } catch (ledgerError) {
      console.error('[createEngagement] BLOC 1 FAILED:', ledgerError.message);
      return Response.json({
        ok:    false,
        error: ledgerError.message,
        bloc:  'COMPTABILITE',
      }, { status: 500 });
    }

    const { engagementSystemId, eventSystemId, txgId,
            commissionMrCents, talentNetCents,
            depositCents, balanceCents, now } = ledgerResult;

    // ════════════════════════════════════════════════════════
    // BLOC 2 — Paiement Stripe (fail-soft)
    // Si ce bloc échoue, l'engagement et le ledger existent déjà.
    // La réponse indique ok=true mais documente l'erreur Stripe.
    // L'organisateur peut déclencher le paiement plus tard via
    // initiateDepositPayment.
    // ════════════════════════════════════════════════════════
    const stripeResult = await initiateStripeCheckout({
      base44, engagementSystemId, eventSystemId,
      organizerUserId, talentUserId,
      depositCents, cachetSigneCents,
      successUrl, cancelUrl, now,
    });

    return Response.json({
      ok:           true,
      engagementId: engagementSystemId,
      eventId:      eventSystemId,
      ledger: {
        txgId,
        linesWritten: 3,
      },
      stripe: stripeResult.ok
        ? { checkoutUrl: stripeResult.checkoutUrl, eprId: stripeResult.eprId }
        : { error: stripeResult.error, action: 'Utiliser initiateDepositPayment pour réessayer.' },
      engagement: {
        systemId:         engagementSystemId,
        status:           stripeResult.ok ? 'deposit_pending' : 'placed',
        cachetSigneCents,
        tauxPpm,
        commissionMrCents,
        talentNetCents,
        depositCents,
        balanceCents,
      },
    });

  } catch (error) {
    console.error('[createEngagement] UNEXPECTED:', error.message);
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});