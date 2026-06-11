/**
 * MICRO RAVE V3 — Test P0 : PORT-4-SHARED-01
 * ============================================================
 * Valide PHASE 3 : les modules partagés Deno sont importables
 * en Node ESM et conformes au contrat architectural.
 *
 * T-01 : shared/base44-repositories.js importable en Node ESM
 * T-02 : createBase44Repositories est typeof === 'function'
 * T-03 : LOI_TRANSITION_01 physique depuis le module partagé
 * T-04 : 18 sous-objets exposés (≥17 requis)
 * T-05 : shared/transition-rules.js importable
 * T-06 : ALLOWED_TRANSITIONS a ≥15 clés
 * T-07 : WORM_STATES a ≥3 éléments
 * T-08 : shared/financial-helpers.js importable
 * T-09 : floorPpm(20000, 120000) === 2400
 * T-10 : generateId('ENG') commence par 'ENG-'
 * T-11 : IDFactory.generate('MembershipPlan') commence par 'MBP-'
 * T-12 : IDFactory.generate('UserMembership') commence par 'UMB-'
 * T-13 : IDFactory.generate('PrefixeInconnu') throw
 *
 * Source : PHASE 3 · 28 mai 2026
 * ============================================================
 */

'use strict';

import path from 'node:path';
import url  from 'node:url';

const __filename = url.fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.log(`  ✗ ${name}`);
    console.log(`    → ${err.message}`);
    failed++;
  }
}

async function testAsync(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.log(`  ✗ ${name}`);
    console.log(`    → ${err.message}`);
    failed++;
  }
}

async function main() {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('Test P0 : PORT-4-SHARED-01');
  console.log('PHASE 3 — Modules partagés Deno (importables Node ESM)');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // ── Bloc A : shared/base44-repositories.js ────────────────────────────────
  console.log('  — A : shared/base44-repositories.js —');

  let createBase44Repositories;

  await testAsync('T-01 : shared/base44-repositories.js importable en Node ESM', async () => {
    const mod = await import(
      path.join(__dirname, '../../codeBase44_v3/shared/base44-repositories.js')
    );
    createBase44Repositories = mod.createBase44Repositories;
  });

  test('T-02 : createBase44Repositories est typeof === \'function\'', () => {
    if (typeof createBase44Repositories !== 'function') {
      throw new Error(`typeof createBase44Repositories === '${typeof createBase44Repositories}'`);
    }
  });

  await testAsync('T-03 : LOI_TRANSITION_01 physique depuis le module partagé', async () => {
    if (!createBase44Repositories) throw new Error('Module non chargé');
    const fakeBase44 = {
      entities: {
        Engagement: {
          get: () => {},
          filter: () => [],
          create: () => {},
          update: () => {},
        },
        // Stub minimal pour les autres entités
        Event:                    { get: ()=>{}, filter: ()=>[], create: ()=>{}, update: ()=>{} },
        ContractSnapshot:         { create: ()=>{}, get: ()=>{}, filter: ()=>[] },
        LedgerRecord:             { create: ()=>{}, filter: ()=>[] },
        EventPaymentRequest:      { get: ()=>{}, filter: ()=>[], create: ()=>{}, update: ()=>{} },
        PolicyConfig:             { filter: ()=>[] },
        SessionPresence:          { create: ()=>{}, filter: ()=>[], update: ()=>{} },
        PayoutExecutionRecord:    { create: ()=>{}, filter: ()=>[] },
        SettlementInstruction:    { get: ()=>{}, filter: ()=>[] },
        TalentPaymentProfile:     { filter: ()=>[] },
        SchedulerDueTask:         { create: ()=>{}, filter: ()=>[], update: ()=>{} },
        SOTSSubmission:           { create: ()=>{}, filter: ()=>[] },
        SOTSDimensionConfig:      { filter: ()=>[] },
        ReputationLedger:         { create: ()=>{} },
        MembershipPlan:           { filter: ()=>[], update: ()=>{} },
        UserMembership:           { filter: ()=>[], create: ()=>{}, update: ()=>{} },
        WebhookProcessedLog:      { create: ()=>{}, filter: ()=>[] },
        StripePaymentSignal:      { create: ()=>{}, filter: ()=>[] },
      },
    };
    const repos = createBase44Repositories(fakeBase44);

    // updateStatus() doit lancer (synchrone)
    let threw1 = false;
    try { repos.engagements.updateStatus(); } catch (e) {
      if (e.message.includes('LOI_TRANSITION_01_VIOLATION')) threw1 = true;
    }
    if (!threw1) throw new Error('LOI_TRANSITION_01 ne lance pas depuis updateStatus()');

    // update() avec status est async — doit rejeter avec LOI_TRANSITION_01
    let threw2 = false;
    try {
      await repos.engagements.update('fake-id', { status: 'event_sealed' });
    } catch (e) {
      if (e.message.includes('LOI_TRANSITION_01_VIOLATION')) threw2 = true;
    }
    if (!threw2) throw new Error('update({status}) ne rejette pas LOI_TRANSITION_01');
  });

  test('T-04 : 18 sous-objets exposés (≥17 requis)', () => {
    if (!createBase44Repositories) throw new Error('Module non chargé');
    const fakeBase44 = {
      entities: {
        Engagement: { get: ()=>{}, filter: ()=>[], create: ()=>{}, update: ()=>{} },
        Event: { get: ()=>{}, filter: ()=>[], create: ()=>{}, update: ()=>{} },
        ContractSnapshot: { create: ()=>{}, get: ()=>{}, filter: ()=>[] },
        LedgerRecord: { create: ()=>{}, filter: ()=>[] },
        EventPaymentRequest: { get: ()=>{}, filter: ()=>[], create: ()=>{}, update: ()=>{} },
        PolicyConfig: { filter: ()=>[] },
        SessionPresence: { create: ()=>{}, filter: ()=>[], update: ()=>{} },
        PayoutExecutionRecord: { create: ()=>{}, filter: ()=>[] },
        SettlementInstruction: { get: ()=>{}, filter: ()=>[] },
        TalentPaymentProfile: { filter: ()=>[] },
        SchedulerDueTask: { create: ()=>{}, filter: ()=>[], update: ()=>{} },
        SOTSSubmission: { create: ()=>{}, filter: ()=>[] },
        SOTSDimensionConfig: { filter: ()=>[] },
        ReputationLedger: { create: ()=>{} },
        MembershipPlan: { filter: ()=>[], update: ()=>{} },
        UserMembership: { filter: ()=>[], create: ()=>{}, update: ()=>{} },
        WebhookProcessedLog: { create: ()=>{}, filter: ()=>[] },
        StripePaymentSignal: { create: ()=>{}, filter: ()=>[] },
      },
    };
    const repos = createBase44Repositories(fakeBase44);
    const keys = Object.keys(repos);
    if (keys.length < 17) {
      throw new Error(`Nombre de sous-objets : ${keys.length} (attendu ≥17). Trouvés : ${keys.join(', ')}`);
    }
  });

  // ── Bloc B : shared/transition-rules.js ──────────────────────────────────
  console.log('\n  — B : shared/transition-rules.js —');

  let ALLOWED_TRANSITIONS, WORM_STATES;

  await testAsync('T-05 : shared/transition-rules.js importable', async () => {
    const mod = await import(
      path.join(__dirname, '../../codeBase44_v3/shared/transition-rules.js')
    );
    ALLOWED_TRANSITIONS = mod.ALLOWED_TRANSITIONS;
    WORM_STATES         = mod.WORM_STATES;
  });

  test('T-06 : ALLOWED_TRANSITIONS a ≥15 clés', () => {
    if (!ALLOWED_TRANSITIONS) throw new Error('Module non chargé');
    const count = Object.keys(ALLOWED_TRANSITIONS).length;
    if (count < 15) {
      throw new Error(`ALLOWED_TRANSITIONS a ${count} clés (attendu ≥15)`);
    }
  });

  test('T-07 : WORM_STATES a ≥3 éléments', () => {
    if (!WORM_STATES) throw new Error('Module non chargé');
    const size = WORM_STATES instanceof Set ? WORM_STATES.size : Object.keys(WORM_STATES).length;
    if (size < 3) {
      throw new Error(`WORM_STATES a ${size} élément(s) (attendu ≥3)`);
    }
  });

  // ── Bloc C : shared/financial-helpers.js ─────────────────────────────────
  console.log('\n  — C : shared/financial-helpers.js —');

  let floorPpm, generateId;

  await testAsync('T-08 : shared/financial-helpers.js importable', async () => {
    const mod = await import(
      path.join(__dirname, '../../codeBase44_v3/shared/financial-helpers.js')
    );
    floorPpm   = mod.floorPpm;
    generateId = mod.generateId;
  });

  test('T-09 : floorPpm(20000, 120000) === 2400', () => {
    if (!floorPpm) throw new Error('Module non chargé');
    const result = floorPpm(20000, 120000);
    if (result !== 2400) throw new Error(`floorPpm(20000, 120000) === ${result} (attendu 2400)`);
  });

  test("T-10 : generateId('ENG') commence par 'ENG-'", () => {
    if (!generateId) throw new Error('Module non chargé');
    const id = generateId('ENG');
    if (!id.startsWith('ENG-')) throw new Error(`generateId('ENG') = "${id}" — ne commence pas par ENG-`);
  });

  // ── Bloc D : IDFactory MBP + UMB ─────────────────────────────────────────
  console.log('\n  — D : IDFactory MembershipPlan + UserMembership —');

  let IDFactory;

  await testAsync('T-11/12/13 : IDFactory chargé', async () => {
    const mod = await import(
      path.join(__dirname, '../../src/core/IDFactory.js')
    );
    IDFactory = mod.default || mod;
  });

  test("T-11 : IDFactory.generate('MembershipPlan') commence par 'MBP-'", () => {
    if (!IDFactory) throw new Error('IDFactory non chargé');
    const id = IDFactory.generate('MembershipPlan');
    if (!id.startsWith('MBP-')) throw new Error(`generate('MembershipPlan') = "${id}" — ne commence pas par MBP-`);
  });

  test("T-12 : IDFactory.generate('UserMembership') commence par 'UMB-'", () => {
    if (!IDFactory) throw new Error('IDFactory non chargé');
    const id = IDFactory.generate('UserMembership');
    if (!id.startsWith('UMB-')) throw new Error(`generate('UserMembership') = "${id}" — ne commence pas par UMB-`);
  });

  test("T-13 : IDFactory.generate('PrefixeInconnu') throw", () => {
    if (!IDFactory) throw new Error('IDFactory non chargé');
    let threw = false;
    try { IDFactory.generate('PrefixeInconnu'); } catch (_) { threw = true; }
    if (!threw) throw new Error("generate('PrefixeInconnu') n'a pas lancé d'exception");
  });

  // ── Résultat ──────────────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log(`Résultat : ${passed} PASSED / ${failed} FAILED`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  if (failed > 0) process.exit(1);
}

main().catch(err => {
  console.error(`\n[FATAL] ${err.message}`);
  process.exit(1);
});
