/**
 * MICRO RAVE V3 — scripts/close-pierre-de-rosette.js
 * ============================================================
 * Script de clôture Phase 1 — CONTROLLED SUCCESS
 *
 * Exécute les 4 étapes finales après le Transfer Stripe manuel :
 *
 *   1. AdminAction MANUAL_PAYOUT_TRANSFER (traçabilité D-106)
 *   2. SettlementInstruction marquée consommée
 *   3. PayoutExecutionRecord créé (idempotency V2 D-101)
 *   4. GoNoGoDecisionRecord = GO + archivage conceptuel
 *
 * PRÉREQUIS :
 *   - Transfer Stripe exécuté : tr_1TaHDt2eLVUrCnnJyDflLNEa
 *   - SettlementInstruction existante (id dans .pilot-ids.json ou Base44)
 *   - .env configuré avec PILOT_ENGAGEMENT_ID et PILOT_TALENT_USER_ID
 *
 * USAGE :
 *   node scripts/close-pierre-de-rosette.js
 *
 * Source : Marche à suivre Phase 1 · Étapes 1.18-1.19 · 2026-05-23
 * ============================================================
 */

'use strict';

require('dotenv').config();

const IDFactory    = require('../src/core/IDFactory');
const repositories = require('../src/repositories');

// ── Configuration ──────────────────────────────────────────────
const PILOT = {
  engagementId:    process.env.PILOT_ENGAGEMENT_ID  || 'ENG-MPIG0BUZ-N084HN',
  talentUserId:    process.env.PILOT_TALENT_USER_ID || 'USR-MPIG0A0O-9CZ5JA',
  talentNetCents:  parseInt(process.env.PILOT_TALENT_NET_CENTS || '26400', 10),
  currency:        'cad',
  stripeTransferId: 'tr_1TaHDt2eLVUrCnnJyDflLNEa',  // Transfer exécuté via Stripe Shell
  stripeAccountId:  'acct_1TaGqTKCWuw3ufQV',         // Compte Connect DJ Alex
  founderUserId:    process.env.PILOT_FOUNDER_USER_ID || 'USR-FOUNDER-PILOT',
};

const NOW = new Date().toISOString();

// ── Helpers ────────────────────────────────────────────────────
function section(title) {
  console.log(`\n${'─'.repeat(56)}`);
  console.log(`  ${title}`);
  console.log('─'.repeat(56));
}
function ok(msg, data) {
  console.log(`  ✅ ${msg}`);
  if (data) console.log(`     ${JSON.stringify(data, null, 2)}`);
}
function warn(msg) { console.log(`  ⚠️  ${msg}`); }
function fail(msg) { console.error(`  ❌ ${msg}`); }

// ══════════════════════════════════════════════════════════════
// ÉTAPE 1 — AdminAction MANUAL_PAYOUT_TRANSFER
// D-106 : SoloFounderOverride documenté avec triple traçabilité
// ══════════════════════════════════════════════════════════════
async function step1_AdminAction() {
  section('Étape 1 — AdminAction MANUAL_PAYOUT_TRANSFER (D-106)');

  const adminAction = await repositories.admin.createAdminAction({
    systemId:    IDFactory.generate('AdminAction'),
    actorUserId: PILOT.founderUserId,
    actionType:  'MANUAL_PAYOUT_TRANSFER',
    reasonCode:  'CONTROLLED_SUCCESS_PHASE_1',
    targetId:    PILOT.engagementId,
    detail: {
      stripeTransferId: PILOT.stripeTransferId,
      talentUserId:     PILOT.talentUserId,
      amountCents:      PILOT.talentNetCents,
      currency:         PILOT.currency,
      method:           'Stripe Shell — stripe transfers create',
      justification:    'Phase 1 CONTROLLED SUCCESS — Transfer Stripe exécuté manuellement ' +
                        'via Stripe Shell car PayoutExecutor verrou 6 échouait sur idempotency ' +
                        'key en cache (tentatives précédentes avec insufficient funds). ' +
                        'Les 5 premiers verrous D-101 ont tous été validés automatiquement par le code V3. ' +
                        'Intervention documentée conformément à D-106 SoloFounderOverride.',
      piertreDeRosettePhase: 'PHASE_1_CONTROLLED_SUCCESS',
    },
    createdAt: NOW,
  });

  ok('AdminAction créée', { id: adminAction?.id, systemId: adminAction?.systemId });
  return adminAction;
}

// ══════════════════════════════════════════════════════════════
// ÉTAPE 1b — DataAccessLedgerEntry (marqueur FOUNDER_SOLO_OVERRIDE)
// D-106 : DataAccessLedgerEntry marqueur obligatoire
// ══════════════════════════════════════════════════════════════
async function step1b_DataAccessLedger(adminActionId) {
  section('Étape 1b — DataAccessLedgerEntry FOUNDER_SOLO_OVERRIDE (D-106)');

  const dalEntry = await repositories.admin.appendToDataAccessLedger({
    actorUserId:      PILOT.founderUserId,
    actorRole:        'FOUNDER',
    targetObjectType: 'Engagement',
    targetObjectId:   PILOT.engagementId,
    accessType:       'OVERRIDE',
    justification:    'MANUAL_PAYOUT_TRANSFER — Phase 1 Pierre de Rosette. ' +
                      'Transfer Stripe tr_1TaHDt2eLVUrCnnJyDflLNEa exécuté hors PayoutExecutor. ' +
                      'AdminAction: ' + (adminActionId || 'voir étape 1'),
    transitionKey:    'payable->settled',
    guardApplied:     'PayoutExecutor (5/6 verrous passés, V6 manuel)',
    wormLevel:        'W1',
    createdAt:        NOW,
  });

  ok('DataAccessLedgerEntry créée', { id: dalEntry?.id });
  return dalEntry;
}

// ══════════════════════════════════════════════════════════════
// ÉTAPE 1c — AdminIncidentRecord SOLO_FOUNDER_OVERRIDE
// D-106 : AdminIncidentRecord type obligatoire
// ══════════════════════════════════════════════════════════════
async function step1c_AdminIncident(adminActionId) {
  section('Étape 1c — AdminIncidentRecord SOLO_FOUNDER_OVERRIDE (D-106)');

  const incident = await repositories.admin.createAdminIncidentRecord({
    systemId:     IDFactory.generate('AdminAction'),  // réutilise le préfixe ADM
    incidentType: 'SOLO_FOUNDER_OVERRIDE',
    severity:     'P1',
    engagementId: PILOT.engagementId,
    description:  'Phase 1 CONTROLLED SUCCESS — Payout Transfer exécuté manuellement via Stripe Shell. ' +
                  'Cause : idempotency key Stripe en cache après échecs précédents (insufficient funds). ' +
                  'Les 5 premiers verrous D-101 ont été validés automatiquement. ' +
                  'Ce record documente l\'intervention conformément à D-106.',
    context: {
      stripeTransferId: PILOT.stripeTransferId,
      adminActionId:    adminActionId || null,
      verrouxPassed:    ['V1_PAYABLE_STATUS', 'V2_NO_EXISTING_RECORD', 'V3_SETTLEMENT_INSTRUCTION_VALID',
                         'V4_KYC_VERIFIED', 'V5_LEDGER_INVARIANT'],
      verrouxManuel:    'V6_STRIPE_TRANSFER',
    },
    createdAt: NOW,
  });

  ok('AdminIncidentRecord créé', { id: incident?.id });
  return incident;
}

// ══════════════════════════════════════════════════════════════
// ÉTAPE 2 — Marquer SettlementInstruction consommée
// ══════════════════════════════════════════════════════════════
async function step2_MarkSettlementConsumed() {
  section('Étape 2 — SettlementInstruction → consommée');

  // Retrouver la SettlementInstruction existante
  const si = await repositories.settlementInstructions.findByEngagementAndTalent(
    PILOT.engagementId,
    PILOT.talentUserId
  );

  if (!si) {
    fail('SettlementInstruction non trouvée. Vérifier Base44.');
    return null;
  }

  if (si.consumedAt) {
    warn(`Déjà consommée le ${si.consumedAt}`);
    return si;
  }

  await repositories.settlementInstructions.markConsumed(si.id, {
    consumedAt:      NOW,
    stripeTransferId: PILOT.stripeTransferId,
  });

  ok('SettlementInstruction marquée consommée', {
    id:               si.id,
    amountCents:      si.amountCents,
    consumedAt:       NOW,
    stripeTransferId: PILOT.stripeTransferId,
  });

  return si;
}

// ══════════════════════════════════════════════════════════════
// ÉTAPE 3 — Créer PayoutExecutionRecord
// D-101 verrou 2 : idempotency — un seul record par engagement+talent
// ══════════════════════════════════════════════════════════════
async function step3_PayoutExecutionRecord() {
  section('Étape 3 — PayoutExecutionRecord (idempotency D-101)');

  // Vérifier qu'il n'existe pas déjà (verrou 2)
  const existing = await repositories.payoutExecutionRecords.findByEngagementId(
    PILOT.engagementId,
    PILOT.talentUserId
  );

  if (existing) {
    warn('PayoutExecutionRecord existe déjà — idempotency respectée.');
    ok('Record existant', { id: existing.id });
    return existing;
  }

  const record = await repositories.payoutExecutionRecords.create({
    systemId:         IDFactory.generate('PayoutExecution'),
    engagementId:     PILOT.engagementId,
    talentUserId:     PILOT.talentUserId,
    stripeTransferId: PILOT.stripeTransferId,
    amountCents:      PILOT.talentNetCents,
    currency:         PILOT.currency,
    executedAt:       NOW,
    verrouxPassed:    ['V1_PAYABLE_STATUS', 'V2_NO_EXISTING_RECORD', 'V3_SETTLEMENT_INSTRUCTION_VALID',
                       'V4_KYC_VERIFIED', 'V5_LEDGER_INVARIANT', 'V6_STRIPE_TRANSFER_MANUAL'],
    createdAt:        NOW,
  });

  ok('PayoutExecutionRecord créé', {
    id:               record?.id,
    systemId:         record?.systemId,
    stripeTransferId: PILOT.stripeTransferId,
    amountCents:      PILOT.talentNetCents,
  });

  return record;
}

// ══════════════════════════════════════════════════════════════
// ÉTAPE 4 — GoNoGoDecisionRecord + archivage conceptuel
// ══════════════════════════════════════════════════════════════
async function step4_GoNoGo() {
  section('Étape 4 — GoNoGoDecisionRecord = GO');

  // Le GoNoGoDecisionRecord est une AdminAction de type spécial
  const goNoGo = await repositories.admin.createAdminAction({
    systemId:    IDFactory.generate('AdminAction'),
    actorUserId: PILOT.founderUserId,
    actionType:  'GO_NO_GO_DECISION',
    reasonCode:  'PHASE_1_CONTROLLED_SUCCESS_COMPLETE',
    targetId:    PILOT.engagementId,
    detail: {
      decision:            'GO',
      phase:               'PHASE_1_CONTROLLED_SUCCESS',
      stripeTransferId:    PILOT.stripeTransferId,
      talentPaid:          true,
      talentNetCents:      PILOT.talentNetCents,
      currency:            PILOT.currency,
      verrouxAutomatic:    5,
      verrouxManual:       1,
      interventionsHumaines: [
        'Transfer Stripe exécuté via Stripe Shell (V6)',
        'SettlementInstruction créée via run-j9-pilot.js --step=payout',
        'KYC complété manuellement par DJ Alex via formulaire Stripe Express',
        'Seed données pilote via seed-pilot-data.js',
        'Seed configs via seed-policy-config.js',
      ],
      automatisationsPhase2: [
        'Câbler webhook → SignalConsumerService → transitions automatiques',
        'Câbler SchedulerService → cron externe → transitions temporelles',
        'Câbler SOTSSubmissionService.consolidate() avant transition SOTS_WINDOW_EXPIRATION',
        'Aligner nommage checkInAt/checkedInAt SessionPresence',
        'Implémenter calcul gpsDistanceMeters (Haversine)',
        'Créer SettlementInstructionService automatique',
        'Persister ContractSnapshot V1/V2 automatiquement',
        'Adapter pages V1 microrave.ca → UX V3 (D-024/D-025/D-084/D-085)',
      ],
      verdict: 'DJ Alex a été payé 264.00$ CAD via Stripe Connect Transfer ' +
               'pour une prestation pilote au Bar Le Trèfle. ' +
               'CONTROLLED SUCCESS atteint — D-144 palier intermédiaire. ' +
               'La phrase finale "100% complété" reste réservée pour FULL SUCCESS Phase 2.',
    },
    createdAt: NOW,
  });

  ok('GoNoGoDecisionRecord créé — decision: GO', {
    id:       goNoGo?.id,
    systemId: goNoGo?.systemId,
    decision: 'GO',
    phase:    'PHASE_1_CONTROLLED_SUCCESS',
  });

  return goNoGo;
}

// ══════════════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════════════
async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║  MICRO RAVE V3 — Clôture Pierre de Rosette Phase 1     ║');
  console.log('║  CONTROLLED SUCCESS — DJ Alex payé au Bar Le Trèfle    ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log(`\n  Engagement : ${PILOT.engagementId}`);
  console.log(`  Talent     : ${PILOT.talentUserId}`);
  console.log(`  Montant    : ${(PILOT.talentNetCents / 100).toFixed(2)}$ ${PILOT.currency.toUpperCase()}`);
  console.log(`  Transfer   : ${PILOT.stripeTransferId}`);
  console.log(`  Timestamp  : ${NOW}`);

  // Étape 1 — Triple traçabilité D-106
  const adminAction = await step1_AdminAction();
  const adminActionId = adminAction?.id || adminAction?.systemId || null;

  await step1b_DataAccessLedger(adminActionId);
  await step1c_AdminIncident(adminActionId);

  // Étape 2 — SettlementInstruction consommée
  await step2_MarkSettlementConsumed();

  // Étape 3 — PayoutExecutionRecord
  await step3_PayoutExecutionRecord();

  // Étape 4 — GoNoGoDecisionRecord
  await step4_GoNoGo();

  // ── Verdict final ──────────────────────────────────────────
  console.log('\n' + '═'.repeat(58));
  console.log('  PHASE 1 — CONTROLLED SUCCESS — COMPLÉTÉ');
  console.log('═'.repeat(58));
  console.log('\n  DJ Alex a reçu 264.00$ CAD via Stripe Connect.');
  console.log('  Transfer : tr_1TaHDt2eLVUrCnnJyDflLNEa');
  console.log('  GoNoGoDecisionRecord : GO');
  console.log('\n  Interventions humaines documentées : 5');
  console.log('  Automatisations Phase 2 identifiées : 8');
  console.log('\n  La phrase finale reste verrouillée.');
  console.log('  → Phase 2 : convertir chaque intervention en automatisation.');
  console.log('  → Quand zéro intervention manuelle : FULL SUCCESS.');
  console.log('  → Alors seulement : "100% complété — nous avons atteint notre objectif."');
  console.log('\n' + '═'.repeat(58));
}

main().catch(err => {
  console.error('\n ❌ ERREUR FATALE :', err.message);
  process.exit(1);
});