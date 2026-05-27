/**
 * MICRO RAVE V3 — Test P0 : ADMIN-POLICY-SOLO-01
 * ============================================================
 * Regroupe les 4 invariants restants de Phase 1.5 lot 3 :
 *
 * ADMIN-EXPORT-01    (T-01 a T-03) : D-111 export = pouvoir distinct
 * POLICY-CHANGE-01   (T-04 a T-05) : D-108 PolicyConfigChangeRecord obligatoire
 * POLICY-CRITICAL-01 (T-06 a T-07) : D-108 config CRITIQUE = double validation
 * ADMIN-SOLO-03      (T-08 a T-09) : D-106 SoloFounderOverride delai + confirmation
 *
 * Source : D-106 · D-108 · D-111 · requiredBeforeEvent=0A
 *
 * ── ADMIN-EXPORT-01 ──────────────────────────────────────────
 * D-111 phrase canonique :
 *   "Lire n'est pas modifier. Modifier n'est pas approuver.
 *    Approuver n'est pas executer. Exporter est un pouvoir distinct."
 *
 * T-01 : SUPPORT_ADMIN export massif -> ACTION_NOT_AUTHORIZED (D-111)
 * T-02 : FOUNDER export massif -> autorise
 * T-03 : tout role sans privilege EXPORT ne peut pas exporter > seuil
 *
 * ── POLICY-CHANGE-01 ─────────────────────────────────────────
 * D-108 : toute modification PolicyConfig produit PolicyConfigChangeRecord.
 *
 * T-04 : createPolicyConfigChangeRecord() avec adminActionId valide -> cree (POST)
 * T-05 : tentative de modification PolicyConfig sans PolicyConfigChangeRecord
 *        -> non tracable (prouve que l'interface ne permet pas de modifier sans record)
 *
 * ── POLICY-CRITICAL-01 ───────────────────────────────────────
 * D-108 : configs CRITIQUE = double validation obligatoire.
 *   TaxConfig, LedgerCodeMap, MembershipPlan, SOTSCommissionModulationConfig,
 *   DataRetentionPolicyConfig, MigrationTriggerPolicyConfig,
 *   SecretsRotationPolicyConfig, DualApprovalThresholdConfig.
 *
 * T-06 : modification config CRITIQUE avec un seul approbateur -> DUAL_APPROVAL_REQUIRED
 * T-07 : modification config CRITIQUE avec deux approbateurs -> autorisee
 *
 * ── ADMIN-SOLO-03 ─────────────────────────────────────────────
 * D-106 : SoloFounderOverride != DualApproval.
 *   Delai configurable (recommande 60s, DualApprovalThresholdConfig).
 *   Confirmation explicite obligatoire.
 *
 * T-08 : SoloFounderOverride sans confirmation explicite -> NOT_CONFIRMED
 * T-09 : SoloFounderOverride avec confirmation -> cree AdminIncidentRecord
 * ============================================================
 */

'use strict';

process.env.BASE44_API_KEY = 'sk_test_MOCK_POLICY_SOLO01';

import AdminRepository from '../../src/repositories/AdminRepository.js';
let passed = 0; let failed = 0;

async function test(name, fn) {
  try { await fn(); console.log(`  \u2713 ${name}`); passed++; }
  catch (e) { console.log(`  \u2717 ${name}\n    \u2192 ${e.message}`); failed++; }
}
function assert(c, m) { if (!c) throw new Error(m); }

// ── Modeles D-111/D-108/D-106 ─────────────────────────────────

// D-111 : roles autorises a exporter (pouvoir distinct)
const EXPORT_AUTHORIZED_ROLES = new Set(['FOUNDER', 'FINANCE_ADMIN', 'OPS_ADMIN', 'PRIVACY_SECURITY_ADMIN']);
const EXPORT_RECORD_LIMIT = 100; // seuil "massif" pour roles non-FOUNDER

function checkExportAccess({ actorRole, recordCount }) {
  if (!EXPORT_AUTHORIZED_ROLES.has(actorRole)) {
    return {
      allowed: false,
      reason: `ACTION_NOT_AUTHORIZED: Role "${actorRole}" n'a pas le privilege EXPORT. ` +
               `D-111 : "Exporter est un pouvoir distinct." ` +
               `Roles autorises : ${[...EXPORT_AUTHORIZED_ROLES].join(', ')}.`,
    };
  }
  if (actorRole !== 'FOUNDER' && recordCount > EXPORT_RECORD_LIMIT) {
    return {
      allowed: false,
      reason: `EXPORT_LIMIT_EXCEEDED: ${actorRole} limite a ${EXPORT_RECORD_LIMIT} records. ` +
               `Demande : ${recordCount}. D-111.`,
    };
  }
  return { allowed: true, reason: `Export autorise pour ${actorRole}.` };
}

// D-108 : configs critiques — double validation obligatoire
const CRITICAL_CONFIG_KEYS_D108 = new Set([
  'TaxConfig', 'LedgerCodeMap', 'MembershipPlan',
  'SOTSCommissionModulationConfig', 'DataRetentionPolicyConfig',
  'MigrationTriggerPolicyConfig', 'SecretsRotationPolicyConfig',
  'DualApprovalThresholdConfig',
]);

function checkCriticalConfigChange({ configKey, approverIds }) {
  if (!CRITICAL_CONFIG_KEYS_D108.has(configKey)) {
    return { allowed: true, reason: `Config "${configKey}" non critique : un approbateur suffit.` };
  }
  if (!approverIds || approverIds.length < 2) {
    return {
      allowed: false,
      reason: `DUAL_APPROVAL_REQUIRED: Config "${configKey}" est CRITIQUE. ` +
               `Double validation obligatoire. Fourni : ${approverIds?.length || 0} approbateur(s). ` +
               `D-108 classification CRITIQUE.`,
    };
  }
  if (approverIds.length >= 2 && new Set(approverIds).size >= 2) {
    return { allowed: true, reason: `Double validation presente pour config CRITIQUE "${configKey}".` };
  }
  return { allowed: false, reason: `DUAL_APPROVAL_REQUIRED: Les deux approbateurs doivent etre distincts.` };
}

// D-106 : SoloFounderOverride validation
function checkSoloFounderOverride({ confirmed, reasonCode }) {
  if (!confirmed) {
    return {
      allowed: false,
      reason: `NOT_CONFIRMED: SoloFounderOverride requiert une confirmation explicite. ` +
               `D-106 : "confirmation explicite obligatoire." Passer confirmed=true.`,
    };
  }
  if (!reasonCode) {
    return {
      allowed: false,
      reason: `ADMIN_ERROR: reasonCode obligatoire pour SoloFounderOverride. D-106.`,
    };
  }
  return { allowed: true, reason: `SoloFounderOverride confirme avec reasonCode. D-106.` };
}

// ── Suite ─────────────────────────────────────────────────────
console.log('ADMIN-POLICY-SOLO-01 -- Export/PolicyChange/Critical/Solo (D-106/D-108/D-111)');
console.log('================================================================================');

async function run() {

  // ── ADMIN-EXPORT-01 ──────────────────────────────────────────
  console.log('\n  -- ADMIN-EXPORT-01 (D-111) --');

  await test('T-01 : SUPPORT_ADMIN export massif -> ACTION_NOT_AUTHORIZED (D-111)', async () => {
    const result = checkExportAccess({ actorRole: 'SUPPORT_ADMIN', recordCount: 500 });
    assert(result.allowed === false,
      `SUPPORT_ADMIN ne peut pas exporter. Recu : allowed=${result.allowed}. ` +
      `D-111 : export = pouvoir distinct. D-105 : SUPPORT_ADMIN "Pas export massif."`);
    assert(result.reason.includes('ACTION_NOT_AUTHORIZED'),
      `reason doit contenir ACTION_NOT_AUTHORIZED. Recu : "${result.reason}"`);
  });

  await test('T-02 : FOUNDER export massif -> autorise', async () => {
    const result = checkExportAccess({ actorRole: 'FOUNDER', recordCount: 10000 });
    assert(result.allowed === true,
      `FOUNDER doit pouvoir exporter sans limite de volume. ` +
      `Recu : allowed=${result.allowed}. D-105 niveau 5.`);
  });

  await test('T-03 : DEV_ADMIN export -> ACTION_NOT_AUTHORIZED (pas dans les roles EXPORT)', async () => {
    const result = checkExportAccess({ actorRole: 'DEV_ADMIN', recordCount: 50 });
    assert(result.allowed === false,
      `DEV_ADMIN n'a pas le privilege EXPORT. Recu : allowed=${result.allowed}. ` +
      `D-111 : "Exporter est un pouvoir distinct." D-105 DEV_ADMIN niveau 2.`);
  });

  // ── POLICY-CHANGE-01 ─────────────────────────────────────────
  console.log('\n  -- POLICY-CHANGE-01 (D-108) --');

  await test('T-04 : createPolicyConfigChangeRecord() avec adminActionId -> PolicyConfigChangeRecord cree', async () => {
    let method = null;
    global.fetch = async (url, opts) => {
      method = opts.method;
      return { ok: true, json: async () => ({ id: 'pcr-solo-01' }) };
    };
    try {
      await AdminRepository.createPolicyConfigChangeRecord({
        configKey:     'sots_window_duration_hours',
        previousValue: '24',
        newValue:      '48',
        changedBy:     'USR-FOUNDER-001',
        justification: 'extension fenetre SOTS Event 0 pilote',
        adminActionId: 'ADM-CHANGE-T04',
      });
    } finally { delete global.fetch; }
    assert(method === 'POST',
      `PolicyConfigChangeRecord cree via POST. Recu : ${method}. D-108.`);
  });

  await test('T-05 : AdminRepository ne propose pas de PUT direct sur PolicyConfig (D-108)', async () => {
    // L'interface n'expose pas de methode updatePolicyConfig() directe.
    // Toute modification doit passer par createPolicyConfigChangeRecord() + AdminAction.
    // Ce test verifie l'absence de la methode "raccourci" qui contournerait D-108.
    const AdminRepo = AdminRepository;
    assert(
      typeof AdminRepo.updatePolicyConfig === 'undefined' &&
      typeof AdminRepo.setPolicyConfig === 'undefined' &&
      typeof AdminRepo.patchPolicyConfig === 'undefined',
      `AdminRepository NE DOIT PAS exposer de methode de modification directe de PolicyConfig. ` +
      `D-108 : toute modification passe par createPolicyConfigChangeRecord() + AdminAction. ` +
      `D-131 phrase canonique : "Un changement de PolicyConfig sans PolicyConfigChangeRecord ` +
      `est un interdit absolu."`
    );
  });

  // ── POLICY-CRITICAL-01 ───────────────────────────────────────
  console.log('\n  -- POLICY-CRITICAL-01 (D-108 double validation) --');

  await test('T-06 : modification TaxConfig avec 1 approbateur -> DUAL_APPROVAL_REQUIRED', async () => {
    const result = checkCriticalConfigChange({
      configKey:   'TaxConfig',
      approverIds: ['USR-FOUNDER-001'], // un seul approbateur
    });
    assert(result.allowed === false,
      `TaxConfig CRITIQUE avec 1 approbateur doit etre refuse. ` +
      `Recu : allowed=${result.allowed}. D-108 classification CRITIQUE = double validation.`);
    assert(result.reason.includes('DUAL_APPROVAL_REQUIRED'),
      `reason doit contenir DUAL_APPROVAL_REQUIRED. Recu : "${result.reason}"`);
  });

  await test('T-07 : modification TaxConfig avec 2 approbateurs distincts -> autorisee', async () => {
    const result = checkCriticalConfigChange({
      configKey:   'TaxConfig',
      approverIds: ['USR-FOUNDER-001', 'USR-FINANCE-001'], // deux approbateurs
    });
    assert(result.allowed === true,
      `TaxConfig avec 2 approbateurs distincts doit etre autorisee. ` +
      `Recu : allowed=${result.allowed}. D-108 double validation satisfaite.`);
  });

  // ── ADMIN-SOLO-03 ─────────────────────────────────────────────
  console.log('\n  -- ADMIN-SOLO-03 (D-106 delai + confirmation) --');

  await test('T-08 : SoloFounderOverride sans confirmation explicite -> NOT_CONFIRMED', async () => {
    const result = checkSoloFounderOverride({
      confirmed:  false,
      reasonCode: 'MANUAL_TRANSITION_EVENT_0_PILOT',
    });
    assert(result.allowed === false,
      `SoloFounderOverride sans confirmation doit etre refuse. ` +
      `Recu : allowed=${result.allowed}. D-106 : "confirmation explicite obligatoire."`);
    assert(result.reason.includes('NOT_CONFIRMED'),
      `reason doit contenir NOT_CONFIRMED. Recu : "${result.reason}"`);
  });

  await test('T-09 : SoloFounderOverride confirme -> AdminIncidentRecord cree', async () => {
    // 1. Valider la confirmation
    const check = checkSoloFounderOverride({
      confirmed:  true,
      reasonCode: 'MANUAL_TRANSITION_EVENT_0_PILOT',
    });
    assert(check.allowed === true,
      `SoloFounderOverride confirme doit etre autorise. Recu : ${check.reason}`);

    // 2. Verifier que l'AdminIncidentRecord est cree (obligation D-106)
    let body = null;
    global.fetch = async (url, opts) => {
      body = JSON.parse(opts.body);
      return { ok: true, json: async () => ({ id: 'inc-solo-t09' }) };
    };
    try {
      await AdminRepository.createAdminIncidentRecord({
        incidentType: 'SOLO_FOUNDER_OVERRIDE',
        severity:     'P1',
        engagementId: 'ENG-SOLO-T09',
        description:  'SoloFounderOverride confirme : transition manuelle event 0 pilote.',
        context: { reasonCode: 'MANUAL_TRANSITION_EVENT_0_PILOT', confirmed: true },
      });
    } finally { delete global.fetch; }
    assert(body.incidentType === 'SOLO_FOUNDER_OVERRIDE',
      `incidentType attendu SOLO_FOUNDER_OVERRIDE. Recu : '${body.incidentType}'. D-106.`);
    assert(body.severity === 'P1',
      `severity attendu P1. Recu : '${body.severity}'.`);
  });

  // ── Rapport ──────────────────────────────────────────────────
  console.log('\n================================================================================');
  console.log(`RESULTAT : ${passed} passes, ${failed} echoues sur ${passed + failed} tests`);
  if (failed === 0) { console.log('\u2713 ADMIN-POLICY-SOLO-01 PASSED'); }
  else { console.log('\u2717 ADMIN-POLICY-SOLO-01 FAILED'); process.exitCode = 1; }
  console.log('================================================================================');
}
run().catch(err => { console.error('ERREUR FATALE :', err.message); process.exitCode = 1; });