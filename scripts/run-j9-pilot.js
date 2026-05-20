/**
 * MICRO RAVE V3 — run-j9-pilot.js
 * ============================================================
 * Script pilote J9 — Premier vrai paiement.
 *
 * Ce script orchestre le flux complet d'un engagement pilote
 * de bout en bout, avec de vrais appels Stripe test.
 *
 * PRÉREQUIS (voir checklist en bas) :
 *   1. STRIPE_SECRET_KEY=sk_test_... dans .env
 *   2. BASE44_API_KEY configuré dans .env
 *   3. Un compte Stripe Connect Express créé pour le talent
 *      (ou laisser le script le créer automatiquement)
 *
 * MODES D'EXÉCUTION :
 *   node scripts/run-j9-pilot.js --step=onboard
 *     → Crée le compte Stripe Connect + retourne l'URL d'onboarding
 *
 *   node scripts/run-j9-pilot.js --step=kyc
 *     → Vérifie le statut KYC du talent
 *
 *   node scripts/run-j9-pilot.js --step=payout
 *     → Exécute le payout (toutes conditions vérifiées)
 *
 *   node scripts/run-j9-pilot.js --step=all
 *     → Exécute toutes les étapes en séquence (dry-run complet)
 *
 * DONNÉES PILOTE :
 *   Engagement : ENG-PILOT-DJALE  (à remplacer par l'ID réel Base44)
 *   Talent     : USR-PILOT-ALEX   (à remplacer par l'ID réel Base44)
 *   Montant    : 26400¢ = 264.00$ CAD (net talent, 300$ - 12% MR)
 *   Lieu       : Bar Le Trèfle · CP-PLATEAU-0001 · Montréal
 *
 * ⚠️  AVANT D'EXÉCUTER --step=payout en mode LIVE :
 *   - Vérifier STRIPE_SECRET_KEY commence par sk_test_ (pas sk_live_)
 *   - Vérifier que l'engagement est bien en état 'payable' en base
 *   - Vérifier que la SettlementInstruction existe et est non-consommée
 *
 * Source : J9 · D-097 · D-101 · OS V14 section 14.9
 * ============================================================
 */

'use strict';

require('dotenv').config();

const StripeAdapter        = require('../src/services/StripeAdapter');
const StripeConnectService = require('../src/services/StripeConnectService');
const PayoutExecutor       = require('../src/services/PayoutExecutor');
const repositories         = require('../src/repositories');

// ── Configuration pilote ─────────────────────────────────────
// REMPLACER par les vrais IDs Base44 de l'engagement pilote
const PILOT = {
  engagementId:   process.env.PILOT_ENGAGEMENT_ID   || 'ENG-PILOT-DJALE',
  talentUserId:   process.env.PILOT_TALENT_USER_ID   || 'USR-PILOT-ALEX',
  talentNetCents: parseInt(process.env.PILOT_TALENT_NET_CENTS || '26400', 10),
  currency:       'cad',
  // URLs de retour après onboarding Stripe Connect
  onboardingRefreshUrl: process.env.PILOT_ONBOARDING_REFRESH_URL || 'https://app.microrave.ca/talent/onboarding/refresh',
  onboardingReturnUrl:  process.env.PILOT_ONBOARDING_RETURN_URL  || 'https://app.microrave.ca/talent/onboarding/complete',
};

// ── Helpers ───────────────────────────────────────────────────

function section(title) {
  const line = '─'.repeat(56);
  console.log(`\n${line}`);
  console.log(`  ${title}`);
  console.log(line);
}

function ok(msg, data) {
  console.log(`  ✅ ${msg}`);
  if (data) console.log('    ', JSON.stringify(data, null, 2).split('\n').join('\n     '));
}

function warn(msg) {
  console.log(`  ⚠️  ${msg}`);
}

function fail(msg) {
  console.log(`  ❌ ${msg}`);
}

function info(msg) {
  console.log(`  ℹ  ${msg}`);
}

// ── Étapes ────────────────────────────────────────────────────

/**
 * Étape 0 — Vérification de la configuration
 */
async function stepCheckConfig() {
  section('Étape 0 — Vérification de la configuration');

  const stripeConfig = StripeAdapter.checkConfig();
  if (!stripeConfig.configured) {
    fail(`Stripe non configuré. Manquant dans .env : ${stripeConfig.missing.join(', ')}`);
    console.log('\n  Copier .env.example → .env et remplir :');
    console.log('    STRIPE_SECRET_KEY=sk_test_...');
    console.log('    STRIPE_WEBHOOK_SECRET=whsec_...');
    return false;
  }

  const key = process.env.STRIPE_SECRET_KEY;
  if (key.startsWith('sk_live_')) {
    fail('STRIPE_SECRET_KEY est une clé LIVE. Utiliser sk_test_... pour J9.');
    return false;
  }
  ok('STRIPE_SECRET_KEY configuré (test mode)');

  const b44Key = process.env.BASE44_API_KEY;
  if (!b44Key || b44Key === 'REMPLACER_PAR_LA_VRAIE_CLE') {
    warn('BASE44_API_KEY absent — les repositories fonctionneront en mode dégradé (données non persistées)');
  } else {
    ok('BASE44_API_KEY configuré');
  }

  info(`Engagement pilote : ${PILOT.engagementId}`);
  info(`Talent pilote     : ${PILOT.talentUserId}`);
  info(`Montant net       : ${(PILOT.talentNetCents / 100).toFixed(2)}$ CAD`);

  return true;
}

/**
 * Étape 1 — Onboarding talent Stripe Connect
 * Crée le compte Express et retourne l'URL d'onboarding.
 */
async function stepOnboard() {
  section('Étape 1 — Onboarding talent Stripe Connect');

  try {
    // Vérifier si un profil existe déjà
    const existing = await repositories.talentPaymentProfiles.findByTalentUserId(PILOT.talentUserId);
    if (existing?.stripeAccountId) {
      ok(`Profil existant trouvé`, {
        stripeAccountId: existing.stripeAccountId,
        kycStatus:       existing.kycStatus,
      });
      info('Utiliser --step=kyc pour vérifier le statut KYC actuel.');
      return existing;
    }

    // Créer le compte
    const result = await StripeConnectService.initiateTalentOnboarding({
      talentUserId: PILOT.talentUserId,
      country:      'CA',
      repositories,
    });

    ok('Compte Stripe Express créé', {
      stripeAccountId: result.stripeAccountId,
      kycStatus:       result.kycStatus,
    });

    // Générer le lien d'onboarding
    const linkResult = await StripeConnectService.createOnboardingLink({
      stripeAccountId: result.stripeAccountId,
      refreshUrl:      PILOT.onboardingRefreshUrl,
      returnUrl:       PILOT.onboardingReturnUrl,
    });

    console.log('\n  ═══════════════════════════════════════════════════');
    console.log('  ACTION REQUISE — Ouvrir ce lien dans un navigateur :');
    console.log(`\n  ${linkResult.url}\n`);
    console.log(`  Expire le : ${linkResult.expiresAt}`);
    console.log('  ═══════════════════════════════════════════════════');
    console.log('\n  Après avoir complété l\'onboarding Stripe, exécuter :');
    console.log('  node scripts/run-j9-pilot.js --step=kyc');

    return result;

  } catch (err) {
    fail(`Onboarding échoué : ${err.message}`);
    return null;
  }
}

/**
 * Étape 2 — Vérification KYC
 */
async function stepKYC() {
  section('Étape 2 — Vérification KYC');

  try {
    const profile = await repositories.talentPaymentProfiles.findByTalentUserId(PILOT.talentUserId);
    if (!profile?.stripeAccountId) {
      fail('Aucun profil trouvé. Exécuter --step=onboard d\'abord.');
      return null;
    }

    info(`StripeAccountId : ${profile.stripeAccountId}`);

    const kycResult = await StripeConnectService.verifyKYCStatus({
      stripeAccountId: profile.stripeAccountId,
      talentUserId:    PILOT.talentUserId,
      repositories,
    });

    const statusEmoji = {
      VERIFIED:   '✅',
      IN_REVIEW:  '⏳',
      PENDING:    '⚠️',
      RESTRICTED: '❌',
    }[kycResult.kycStatus] || '?';

    console.log(`\n  ${statusEmoji} KYC Status : ${kycResult.kycStatus}`);
    console.log(`     details_submitted : ${kycResult.detailsSubmitted}`);
    console.log(`     charges_enabled   : ${kycResult.chargesEnabled}`);
    console.log(`     payouts_enabled   : ${kycResult.payoutsEnabled}`);

    if (kycResult.kycStatus === 'VERIFIED') {
      ok('KYC VERIFIED — prêt pour payout');
      console.log('\n  Prochaine étape : créer la SettlementInstruction, puis');
      console.log('  node scripts/run-j9-pilot.js --step=payout');
    } else if (kycResult.kycStatus === 'PENDING') {
      warn('Onboarding non complété. Ouvrir le lien Stripe Connect.');
    } else if (kycResult.kycStatus === 'IN_REVIEW') {
      warn('En cours de vérification Stripe. Attendre la confirmation.');
    } else {
      fail('KYC RESTRICTED — contacter Stripe support.');
    }

    return kycResult;

  } catch (err) {
    fail(`KYC check échoué : ${err.message}`);
    return null;
  }
}

/**
 * Étape 3 — Préparation de la SettlementInstruction
 * Crée (ou retrouve) l'instruction de règlement pour l'engagement pilote.
 */
async function stepPrepareSettlement() {
  section('Étape 3 — Préparation SettlementInstruction');

  try {
    // Chercher une instruction existante
    const existing = await repositories.settlementInstructions.findByEngagementAndTalent(
      PILOT.engagementId,
      PILOT.talentUserId
    );

    if (existing) {
      if (existing.consumedAt) {
        fail(`SettlementInstruction déjà consommée le ${existing.consumedAt}.`);
        fail('Le payout a déjà été exécuté pour cet engagement.');
        return null;
      }
      ok('SettlementInstruction existante trouvée', {
        id:          existing.id,
        amountCents: existing.amountCents,
        consumedAt:  existing.consumedAt,
      });
      return existing;
    }

    // Créer l'instruction
    const instruction = await repositories.settlementInstructions.create({
      engagementId:  PILOT.engagementId,
      talentUserId:  PILOT.talentUserId,
      amountCents:   PILOT.talentNetCents,
      currency:      PILOT.currency,
      type:          'PAYOUT',
    });

    if (!instruction) {
      warn('Base44 non connecté — SettlementInstruction non persistée.');
      warn('En mode dégradé, l\'instruction sera simulée en mémoire.');
      return {
        id:          `si-pilot-${Date.now()}`,
        engagementId: PILOT.engagementId,
        talentUserId: PILOT.talentUserId,
        amountCents:  PILOT.talentNetCents,
        currency:     PILOT.currency,
        consumedAt:   null,
      };
    }

    ok('SettlementInstruction créée', {
      id:          instruction.id,
      amountCents: instruction.amountCents,
    });

    return instruction;

  } catch (err) {
    fail(`Préparation settlement échouée : ${err.message}`);
    return null;
  }
}

/**
 * Étape 4 — Exécution du payout
 * Applique les 6 verrous D-101 et déclenche le Transfer Stripe.
 */
async function stepPayout(settlementInstruction) {
  section('Étape 4 — Exécution du payout (6 verrous D-101)');

  // ContractSnapshot pour verrou 5 (invariant ledger)
  const contractSnapshotPhase2 = {
    prixVenduClientCents: 30000, // 300.00$ CAD
    waterfall: [{
      talentUserId:      PILOT.talentUserId,
      talentNetCents:    PILOT.talentNetCents,    // 264.00$
      commissionMrCents: 30000 - PILOT.talentNetCents, // 36.00$
    }],
  };

  try {
    const result = await PayoutExecutor.executePayout({
      engagementId:          PILOT.engagementId,
      talentUserId:          PILOT.talentUserId,
      talentNetCents:        PILOT.talentNetCents,
      currency:              PILOT.currency,
      engagementStatus:      'payable',  // ← vérifier que c'est l'état réel en base
      settlementInstruction,
      contractSnapshotPhase2,
      repositories,
    });

    if (result.executed) {
      console.log('\n  ══════════════════════════════════════════════════');
      console.log('  ✅  PAYOUT EXÉCUTÉ — Pierre de Rosette atteinte');
      console.log('  ══════════════════════════════════════════════════');
      console.log(`\n  TransferId Stripe : ${result.stripeTransferId}`);
      console.log(`  Montant           : ${(result.amountCents / 100).toFixed(2)}$ CAD`);
      console.log(`  Exécuté le        : ${result.executedAt}`);
      console.log(`  Verrous D-101     : ${result.verrouxPassed.join(' → ')}`);
      console.log('\n  Prochaine étape : déclencher payable → settled');
      console.log('  via transitionEngagement() avec LedgerInvariantGuard.');
    } else {
      fail(`Payout bloqué : ${result.blockReason}`);
      info(`Détail : ${result.detail}`);
      console.log('\n  Verrous passés :', result.verrouxPassed.join(' → ') || 'aucun');
    }

    return result;

  } catch (err) {
    fail(`Payout échoué : ${err.message}`);
    return null;
  }
}

// ── Orchestration ─────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const stepArg = args.find(a => a.startsWith('--step='))?.split('=')[1] || 'all';

  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log('║  MICRO RAVE V3 — Script pilote J9                   ║');
  console.log('║  Premier vrai paiement · DJ Alex au Trèfle           ║');
  console.log('╚══════════════════════════════════════════════════════╝');

  const configOk = await stepCheckConfig();
  if (!configOk) {
    process.exit(1);
  }

  if (stepArg === 'onboard' || stepArg === 'all') {
    await stepOnboard();
    if (stepArg === 'onboard') {
      process.exit(0);
    }
  }

  if (stepArg === 'kyc' || stepArg === 'all') {
    const kycResult = await stepKYC();
    if (stepArg === 'kyc') process.exit(0);
    if (kycResult?.kycStatus !== 'VERIFIED') {
      warn('KYC non VERIFIED — impossible de continuer vers le payout.');
      warn('Compléter l\'onboarding Stripe puis relancer --step=kyc.');
      process.exit(1);
    }
  }

  if (stepArg === 'payout' || stepArg === 'all') {
    const instruction = await stepPrepareSettlement();
    if (!instruction) {
      process.exit(1);
    }
    await stepPayout(instruction);
  }
}

main().catch(err => {
  console.error('\n  ERREUR FATALE :', err.message);
  process.exit(1);
});