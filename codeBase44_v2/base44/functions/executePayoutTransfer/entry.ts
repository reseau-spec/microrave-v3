// deploy: v5
// executePayoutTransfer — Transfère le cachet d'un talent via Stripe Connect.
//
// CHANGEMENTS v5 — Rôle contextuel du destinataire (modèle prosommateur) :
//
//   PROBLÈME v4 :
//   recipientUserId identifie QUI reçoit le cachet.
//   Mais le rôle dans CETTE transaction était absent.
//   Un même userId peut recevoir un cachet comme talent et payer comme organizer.
//   Sans recipientRole, les exports Stripe ne permettent pas de distinguer
//   les rôles économiques des parties.
//
//   FIX :
//   Ajouter recipientRole: "talent" dans les metadata du Transfer.
//   Ce champ est contextuel — il documente le rôle dans CE transfert.
//   Le Customer Stripe (userId) reste sans userType figé.
//
//   - Écriture dans FinancialLedger (double-entry, amount_cents) après transfert.
//     v1 ne traçait rien après le transfert Stripe — les cash-outs étaient invisibles.
//   - amount_cents : le montant envoyé à Stripe est calculé en entiers.
//     L'arrondi Math.round(split.amount * 100) existait déjà dans v1 pour amountMinor ;
//     on le reporte maintenant aussi dans FinancialLedger.amount_cents.
//   - Validation KYC/AML inchangée (charges_enabled + payouts_enabled sur Connect account).
//   - Idempotence Stripe inchangée (clé `transfer:${payoutSplitId}`).
//
// CHANGEMENTS v3 — commission_earned dans FinancialLedger :
//   Après l'écriture talent_transfer, chercher le PayoutSplit platform_fee
//   frère (même payoutId + eventId, roleType=platform_fee) et créer une paire
//   double-entry commission_earned dans FinancialLedger :
//     Dr escrow_liability / balance_liability → Cr revenue_commission
//   Non-fatal : une erreur sur commission_earned ne bloque pas le paiement talent.
//
// CHANGEMENTS v4 — Metadata Stripe complètes sur le Transfer (traçabilité financière) :
//
//   PROBLÈME v3 :
//   Le stripe.transfers.create n'avait que 4 metadata :
//     payoutSplitId, eventId, recipientUserId, effectiveCommissionRate
//   Cela rendait les exports Stripe illisibles sans jointure externe et
//   empêchait de calculer le P&L directement depuis Stripe RAW.
//   organizerId et eventName étaient à 0% de remplissage sur toutes les transactions.
//   costType, grossAmount, commissionAmount étaient absents — impossible de
//   distinguer les cachets des autres débits dans les états financiers.
//
//   FIX :
//   L'Event est déjà chargé (ligne ~142 : Event.get(split.eventId)).
//   Aucun lookup supplémentaire nécessaire — zéro coût en latence.
//   7 champs ajoutés dans metadata du Transfer :
//     costType          → "talent_cachet"      classification COGS
//     organizerId       → event.organizerId    attribution organisateur
//     eventName         → event.title          lisibilité export
//     grossAmount       → (amount_cents / (1 - rate) / 100).toFixed(2)
//     commissionAmount  → (grossAmount * rate).toFixed(2)
//     platform          → "microrave"          filtre multi-compte Stripe
//     flow              → "talent_payout"      catégorie flux sortant
//     batchRun          → nowIso               horodatage batch
//
//   CALCUL grossAmount / commissionAmount :
//   split.amount = cachet NET versé au talent (après commission déduite).
//   grossAmount = split.amount / (1 - rate)   ← montant contractuel brut
//   commissionAmount = grossAmount * rate      ← commission retenue par la plateforme
//   Ces deux champs permettent de reconstruire le P&L via SUM(commissionAmount)
//   sans aucune jointure externe sur le Ledger ou la DB.
//
//   METADATA COMPLÈTES v4 :
//     costType                 → "talent_cachet"
//     platform                 → "microrave"
//     flow                     → "talent_payout"
//     grossAmount              → montant contractuel brut (string décimal)
//     commissionAmount         → commission retenue (string décimal)
//     effectiveCommissionRate  → taux effectif appliqué (déjà présent v3)
//     eventId                  → ID événement (déjà présent v3)
//     eventName                → titre lisible de l'événement (NOUVEAU)
//     organizerId              → ID organisateur (NOUVEAU)
//     payoutSplitId            → ID du split (déjà présent v3)
//     recipientUserId          → ID talent (déjà présent v3)
//     batchRun                 → horodatage ISO du batch (NOUVEAU)
//
// INPUT  : { payoutSplitId }
// OUTPUT : { ok, stripeTransferId, amount_cents, amount, recipientUserId }

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
import Stripe from 'npm:stripe@14.21.0';

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status, headers: { 'content-type': 'application/json' },
  });
}

// Conversion float → centimes (entier strict)
// Exemple : toCents(149.6) → 14960
function toCents(amount) {
  return Math.round(Number(amount) * 100);
}

// ── Écriture FinancialLedger double-entry (append-only) ─────────────────────
// Identique aux helpers de confirmStripePayment v13 et releaseEventEscrow v7.
async function writeLedgerPair(service, { entryType, debitAccount, creditAccount, amount_cents, eventId, stripeRef, payoutSplitId, note }) {
  try {
    const existing = await service.entities.FinancialLedger
      .filter({ eventId, stripeRef, entryType, debitCredit: 'debit' })
      .catch(() => []);
    if (existing && existing.length > 0) {
      console.log(`[FinancialLedger] SKIP idempotent stripeRef=${stripeRef} entryType=${entryType}`);
      return { skipped: true };
    }
    const nowIso = new Date().toISOString();
    const debitEntry = await service.entities.FinancialLedger.create({
      entryType, debitCredit: 'debit', accountCode: debitAccount,
      amount_cents, currency: 'CAD', eventId, stripeRef,
      payoutSplitId: payoutSplitId || null,
      note: `${note} [Dr ${debitAccount}]`, createdAt: nowIso,
    });
    const creditEntry = await service.entities.FinancialLedger.create({
      entryType, debitCredit: 'credit', accountCode: creditAccount,
      amount_cents, currency: 'CAD', eventId, stripeRef,
      payoutSplitId: payoutSplitId || null,
      relatedEntryId: debitEntry?.id || null,
      note: `${note} [Cr ${creditAccount}]`, createdAt: nowIso,
    });
    if (debitEntry?.id && creditEntry?.id) {
      await service.entities.FinancialLedger.update(debitEntry.id, {
        relatedEntryId: creditEntry.id,
      }).catch(() => null);
    }
    console.log(`[FinancialLedger] WRITTEN entryType=${entryType} Dr=${debitAccount} Cr=${creditAccount} amount_cents=${amount_cents} ref=${stripeRef}`);
    return { debitId: debitEntry?.id, creditId: creditEntry?.id };
  } catch (e) {
    console.warn(`[FinancialLedger] write failed (non-fatal) entryType=${entryType} ref=${stripeRef}:`, e?.message);
    return { error: e?.message };
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user   = await base44.auth.me();
    if (!user) return json(401, { ok: false, error: 'Unauthorized' });
    if (user.role !== 'admin') return json(403, { ok: false, error: 'Admin only' });

    const body = await req.json().catch(() => ({}));
    const { payoutSplitId } = body;
    if (!payoutSplitId) return json(400, { ok: false, error: 'payoutSplitId requis' });

    const service = base44.asServiceRole;
    const stripe  = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'));
    const nowIso  = new Date().toISOString();

    // ── Charger le PayoutSplit ─────────────────────────────────────────────────
    const split = await service.entities.PayoutSplit.get(payoutSplitId).catch(() => null);
    if (!split) return json(404, { ok: false, error: 'PayoutSplit introuvable' });

    if (split.roleType !== 'talent_payout') {
      return json(400, { ok: false, error: `roleType doit être talent_payout. Actuel: ${split.roleType}` });
    }
    if (split.status === 'paid') {
      return json(200, { ok: true, action: 'already_paid', stripeTransferId: split.stripeTransferId });
    }
    if (split.status !== 'pending') {
      return json(409, { ok: false, error: `PayoutSplit status doit être pending. Actuel: ${split.status}` });
    }
    if (!split.recipientUserId) {
      return json(400, { ok: false, error: 'recipientUserId manquant sur le PayoutSplit' });
    }

    const amount_cents = toCents(split.amount);
    if (amount_cents <= 0) {
      return json(400, { ok: false, error: `Montant invalide: ${split.amount} → ${amount_cents} cents` });
    }

    // ── Charger l'Event ────────────────────────────────────────────────────────
    const event = await service.entities.Event.get(split.eventId).catch(() => null);
    if (!event) return json(404, { ok: false, error: 'Event introuvable' });

    if (event.escrowStatus !== 'released') {
      return json(409, {
        ok: false,
        error: `escrowStatus doit être released avant de transférer. Actuel: ${event.escrowStatus}`,
      });
    }

    // v4 — Extraire eventName et organizerId depuis l'Event déjà chargé.
    // Aucun lookup supplémentaire — event est disponible dès ce point.
    const eventName   = event.title ?? event.name ?? '';
    const organizerId = event.organizerId ?? '';

    // v4 — Calculer grossAmount et commissionAmount pour les metadata Stripe.
    // split.amount = cachet NET (après commission). On remonte au brut contractuel.
    // Si le taux est 0 ou absent, gross = net (pas de commission).
    const rate           = Number(split.effectiveCommissionRate) || 0;
    const grossAmount    = rate > 0 && rate < 1
      ? split.amount / (1 - rate)
      : split.amount;
    const commissionAmt  = grossAmount * rate;

    // Résoudre le charge source depuis le PI
    let resolvedChargeId = event.stripeChargeId || null;
    if (!resolvedChargeId && event.stripePaymentIntentId) {
      try {
        const pi = await stripe.paymentIntents.retrieve(event.stripePaymentIntentId);
        resolvedChargeId = pi.latest_charge || null;
      } catch (e) {
        console.warn(`[executePayoutTransfer] Impossible de résoudre charge depuis PI: ${e.message}`);
      }
    }

    // ── Charger le TalentProfile — vérification KYC/AML ──────────────────────
    const profiles = await service.entities.TalentProfile.filter({ userId: split.recipientUserId }).catch(() => []);
    const profile  = profiles?.[0] || null;

    if (!profile?.stripeConnectAccountId) {
      return json(409, {
        ok: false,
        error: `Le talent ${split.recipientUserId} n'a pas de compte Stripe Connect.`,
        recipientUserId: split.recipientUserId,
      });
    }

    if (profile.stripeConnectOnboardingStatus !== 'active') {
      return json(409, {
        ok: false,
        error: `Compte Connect du talent non actif. Statut: ${profile.stripeConnectOnboardingStatus}`,
        stripeConnectAccountId: profile.stripeConnectAccountId,
      });
    }

    // Vérification live du compte Connect chez Stripe (KYC/AML gate)
    try {
      const account = await stripe.accounts.retrieve(profile.stripeConnectAccountId);
      if (!account.charges_enabled || !account.payouts_enabled) {
        await service.entities.TalentProfile.update(profile.id, {
          stripeConnectOnboardingStatus: 'restricted',
        });
        return json(409, {
          ok: false,
          error: `Compte Connect restreint par Stripe. charges_enabled=${account.charges_enabled} payouts_enabled=${account.payouts_enabled}`,
        });
      }
    } catch (e) {
      return json(502, { ok: false, error: `Impossible de vérifier le compte Connect: ${e.message}` });
    }

    // ── Créer le transfert Stripe Connect ─────────────────────────────────────
    const idempotencyKey = `transfer:${payoutSplitId}`;
    let transfer;

    try {
      transfer = await stripe.transfers.create(
        {
          amount:      amount_cents,
          currency:    (split.currency || 'cad').toLowerCase(),
          destination: profile.stripeConnectAccountId,
          description: `Cachet Micro Rave — event ${split.eventId} "${eventName}" — split ${payoutSplitId}`,
          metadata: {
            // --- Classification financière (v4) ---
            costType:                'talent_cachet',
            platform:                'microrave',
            flow:                    'talent_payout',
            // --- Montants détaillés (v4) ---
            grossAmount:             grossAmount.toFixed(2),
            commissionAmount:        commissionAmt.toFixed(2),
            effectiveCommissionRate: String(split.effectiveCommissionRate ?? ''),
            // --- Événement (v4) ---
            eventId:                 split.eventId,
            eventName:               eventName,
            organizerId:             organizerId,
            // --- Références ---
            payoutSplitId,
            recipientUserId:         split.recipientUserId,
            // --- Rôle contextuel (v5) ---
            // Rôle joué dans CETTE transaction — pas identitaire.
            // Le même userId peut être organizer sur un dépôt et talent ici.
            recipientRole:           'talent',
            batchRun:                nowIso,
          },
          ...(resolvedChargeId ? { source_transaction: resolvedChargeId } : {}),
          transfer_group: `event_${split.eventId}`,
        },
        { idempotencyKey }
      );
    } catch (stripeErr) {
      console.error(`[executePayoutTransfer] v5 Stripe error:`, stripeErr.message);
      return json(502, {
        ok: false,
        error:      `Stripe transfer échoué: ${stripeErr.message}`,
        stripeCode: stripeErr.code || null,
      });
    }

    // ── Marquer le PayoutSplit comme payé ──────────────────────────────────────
    await service.entities.PayoutSplit.update(payoutSplitId, {
      status:          'paid',
      stripeTransferId: transfer.id,
      paidAt:          nowIso,
      updatedAt:       nowIso,
    });

    // ── FinancialLedger — talent_transfer (double-entry complète) ──────────────
    // PAIRE 1 — talent_transfer :
    //   Dr stripe_connect_transit (l'argent quitte le compte plateforme)
    //   Cr stripe_balance (contrepartie comptable — réduction du solde plateforme)
    // v4: note enrichie avec eventName
    await writeLedgerPair(service, {
      entryType:     'talent_transfer',
      debitAccount:  'stripe_connect_transit',
      creditAccount: 'stripe_balance',
      amount_cents,
      eventId:       split.eventId,
      stripeRef:     transfer.id,
      payoutSplitId,
      note:          `Cachet talent — event ${split.eventId} "${eventName}" — ${(amount_cents / 100).toFixed(2)}$ CAD → Connect ${profile.stripeConnectAccountId} (talent ${split.recipientUserId.slice(-6)})`,
    });
    console.log(`[FINANCIAL_LEDGER_TALENT_TRANSFER] split=${payoutSplitId} transfer=${transfer.id} amount_cents=${amount_cents}`);

    // ── FinancialLedger — commission_earned (v3, inchangé) ────────────────────
    // Après avoir payé le talent, reconnaître la commission plateforme.
    // Chercher le PayoutSplit platform_fee frère (même payoutId + eventId).
    // PAIRE 2 — commission_earned :
    //   Dr escrow_liability (la dette séquestre diminue du montant commission)
    //   Cr revenue_commission (revenu plateforme reconnu)
    try {
      const feeSplits = await service.entities.PayoutSplit.filter({
        eventId:  split.eventId,
        payoutId: split.payoutId,
        roleType: 'platform_fee',
      }).catch(() => []);

      // Trouver le split fee correspondant au talent payé
      // note du fee split contient talentUserId (6 derniers chars) — correspondance via recipientUserId
      const talentIdSuffix = split.recipientUserId.slice(-6);
      const feeSplit = (feeSplits || []).find(f =>
        f.note && f.note.includes(talentIdSuffix)
      ) || (feeSplits || [])[0]; // fallback: premier fee split si un seul talent

      if (feeSplit && feeSplit.amount > 0) {
        const fee_cents = Math.round(Number(feeSplit.amount) * 100);

        await writeLedgerPair(service, {
          entryType:     'commission_earned',
          debitAccount:  'escrow_liability',
          creditAccount: 'revenue_commission',
          amount_cents:  fee_cents,
          eventId:       split.eventId,
          stripeRef:     transfer.id,
          payoutSplitId: feeSplit.id,
          note:          `Commission plateforme — event ${split.eventId} "${eventName}" — ${(fee_cents / 100).toFixed(2)}$ CAD (${((feeSplit.effectiveCommissionRate || 0) * 100).toFixed(2)}% sur ${(feeSplit.basisAmount || 0).toFixed(2)}$)`,
        });

        // Marquer le fee split comme paid (la commission est reconnue, pas transférée)
        await service.entities.PayoutSplit.update(feeSplit.id, {
          status:  'paid',
          paidAt:  nowIso,
          updatedAt: nowIso,
        }).catch(e => console.warn('[executePayoutTransfer] v5 fee split update failed:', e?.message));

        console.log(`[FINANCIAL_LEDGER_COMMISSION_EARNED] feeSplit=${feeSplit.id} fee_cents=${fee_cents}`);
      } else {
        console.warn(`[executePayoutTransfer] v5 aucun platform_fee split trouvé pour talent=${split.recipientUserId} payoutId=${split.payoutId}`);
      }
    } catch (commissionErr) {
      // Non-fatal : la commission sera traçable via reconciliation manuelle
      console.warn(`[executePayoutTransfer] v5 commission_earned FAILED (non-fatal) split=${payoutSplitId}:`, commissionErr?.message);
    }

    console.log(
      `[executePayoutTransfer] v5 SUCCESS split=${payoutSplitId} ` +
      `transfer=${transfer.id} amount_cents=${amount_cents} ` +
      `eventName="${eventName}" organizerId=${organizerId} ` +
      `grossAmount=${grossAmount.toFixed(2)} commissionAmount=${commissionAmt.toFixed(2)} ` +
      `recipient=${split.recipientUserId} account=${profile.stripeConnectAccountId}`
    );

    return json(200, {
      ok:                    true,
      stripeTransferId:      transfer.id,
      amount_cents,
      amount:                amount_cents / 100,
      currency:              (split.currency || 'CAD').toUpperCase(),
      recipientUserId:       split.recipientUserId,
      stripeConnectAccountId: profile.stripeConnectAccountId,
      payoutSplitId,
    });

  } catch (error) {
    console.error('[executePayoutTransfer] v5 FATAL:', error?.message);
    return json(500, { ok: false, error: error.message });
  }
});