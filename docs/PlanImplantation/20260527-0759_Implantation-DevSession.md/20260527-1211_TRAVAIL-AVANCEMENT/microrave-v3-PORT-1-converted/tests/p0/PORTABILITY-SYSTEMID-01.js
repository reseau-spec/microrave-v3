/**
 * MICRO RAVE V3 — Test P0 : PORTABILITY-SYSTEMID-01
 * ============================================================
 * Prouve D-127/D-132 : tout objet cree via IDFactory a un prefixe
 * souverain reconnu, jamais l'id Base44 interne nu.
 *
 * Source : D-127 · D-132 item 1 · requiredBeforeEvent=0B
 *
 * D-127 : "Les IDs souverains sont generees par IDFactory.
 *   Format : PREFIX-XXXXXXXX-XXXXXX.
 *   Jamais l'id Base44 interne."
 *
 * D-132 : "Portabilite : tout objet doit etre identifiable
 *   hors Base44 via son systemId."
 *
 * T-01 : tout objet cree via IDFactory.generate() a un prefixe souverain reconnu
 * T-02 : le prefixe ne contient jamais l'id Base44 interne (UUID format)
 * T-03 : IDFactory.validate(id) rejette un id Base44 nu (sans prefixe)
 * ============================================================
 */

'use strict';

import IDFactory from '../../src/core/IDFactory.js';
let passed = 0; let failed = 0;

async function test(name, fn) {
  try { await fn(); console.log(`  \u2713 ${name}`); passed++; }
  catch (e) { console.log(`  \u2717 ${name}\n    \u2192 ${e.message}`); failed++; }
}
function assert(c, m) { if (!c) throw new Error(m); }

console.log('=======================================================');
console.log('Test P0 : PORTABILITY-SYSTEMID-01');
console.log('Prefixes souverains IDFactory -- D-127, D-132 item 1 -- 0B');
console.log('=======================================================\n');

async function run() {

  // ── T-01 : tous les types PREFIXES → prefixe reconnu ─────
  await test('T-01 : tout objet cree via IDFactory.generate() a un prefixe souverain reconnu', async () => {
    const knownPrefixes = new Set(Object.values(IDFactory.PREFIXES));
    const generatedIds  = [];
    const errors        = [];

    // Generer un ID pour chaque type
    for (const [entityType, prefix] of Object.entries(IDFactory.PREFIXES)) {
      const id = IDFactory.generate(entityType);
      generatedIds.push({ entityType, prefix, id });

      // Verifier format PREFIX-XXXXXXXX-XXXXXX (au moins 3 parties separees par -)
      const parts = id.split('-');
      if (parts.length < 3) {
        errors.push(`${entityType}: format invalide "${id}" — attendu PREFIX-TIMESTAMP-RANDOM`);
        continue;
      }
      // Verifier que le prefixe correspond
      if (parts[0] !== prefix) {
        errors.push(`${entityType}: prefixe "${parts[0]}" != attendu "${prefix}"`);
        continue;
      }
      // Verifier que le prefixe est dans la liste souveraine
      if (!knownPrefixes.has(parts[0])) {
        errors.push(`${entityType}: prefixe "${parts[0]}" absent de IDFactory.PREFIXES`);
      }
    }

    assert(errors.length === 0,
      `${errors.length} erreur(s) de prefixe souverain :\n  ${errors.join('\n  ')}`);

    // Log pour visibilite
    console.log(`    ${generatedIds.length} types valides : ${generatedIds.map(g => g.id.split('-')[0]).join(', ')}`);
  });

  // ── T-02 : prefixe ne contient jamais un UUID Base44 nu ──
  await test('T-02 : le prefixe ne contient jamais l\'id Base44 interne (UUID nu)', async () => {
    // Un id Base44 interne ressemble a un UUID : xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx (32 hex)
    // ou un string alphanum sans tiret de separation PREFIX-*.
    // IDFactory genere PREFIX-TIMESTAMP_HEX-RANDOM — jamais un UUID.
    const errors = [];

    for (const entityType of Object.keys(IDFactory.PREFIXES)) {
      const id = IDFactory.generate(entityType);
      const parts = id.split('-');

      // Un UUID Base44 aurait un premier segment de 8 hex chars minuscules
      // Un prefixe souverain est 2-4 lettres MAJUSCULES
      const firstPart = parts[0];
      if (/^[a-f0-9]{8}$/.test(firstPart)) {
        errors.push(
          `${entityType}: "${id}" commence par un UUID hex "${firstPart}" — ` +
          `semblerait un id Base44 interne. Source : D-127.`
        );
      }

      // Verifier que le prefixe est alphabetique (pas numerique)
      // Prefixe souverain : 2-4 caracteres alphanum commencant par une majuscule (CS1, CS2 valides)
      if (!/^[A-Z][A-Z0-9]{1,3}$/.test(firstPart)) {
        errors.push(
          `${entityType}: prefixe "${firstPart}" invalide — ` +
          `doit etre 2-4 caracteres commencant par une majuscule (ex: ENG, CS1, LDG). Source : D-127.`
        );
      }
    }

    assert(errors.length === 0,
      `${errors.length} prefixe(s) ressemblant a un id Base44 nu :\n  ${errors.join('\n  ')}`);
  });

  // ── T-03 : validate() rejette un id Base44 nu ────────────
  await test('T-03 : IDFactory.validate(id) rejette un id Base44 nu (sans prefixe souverain)', async () => {
    // IDs Base44 nus — differents formats possibles
    const base44StyleIds = [
      '6723ab4c1d2e3f456789abcd',           // ObjectID MongoDB-style
      'a1b2c3d4-e5f6-7890-abcd-ef1234567890', // UUID v4
      '12345678',                              // id numerique
      'base44_internal_id',                   // string sans prefixe
      'eng-lowercase-001',                    // prefixe minuscule (jamais valide)
    ];

    const errors = [];
    for (const badId of base44StyleIds) {
      // validate(id, entityType) doit retourner false pour ces ids
      const isValidEngagement = IDFactory.validate(badId, 'Engagement');
      const isValidLedger     = IDFactory.validate(badId, 'LedgerEntry');
      if (isValidEngagement || isValidLedger) {
        errors.push(
          `"${badId}" accepte par IDFactory.validate() — devrait etre rejete. ` +
          `D-127 : seuls les ids au format PREFIX-TIMESTAMP-RANDOM sont valides.`
        );
      }
    }

    assert(errors.length === 0,
      `${errors.length} id Base44 nu accepte a tort :\n  ${errors.join('\n  ')}`);

    // Verifier aussi que getType() retourne null pour ces ids
    for (const badId of base44StyleIds) {
      const type = IDFactory.getType(badId);
      if (type !== null) {
        // eng-lowercase-001 → split gives 'eng', not in PREFIXES values → null expected
        // Seuls les prefixes exactement dans PREFIXES seraient trouves
        const prefix = badId.split('-')[0].toUpperCase();
        const inPrefixes = Object.values(IDFactory.PREFIXES).includes(prefix);
        if (inPrefixes) {
          errors.push(
            `getType("${badId}") = "${type}" — prefixe "${prefix}" est dans PREFIXES ` +
            `mais l'id est sans le format valide PREFIX-TIMESTAMP-RANDOM.`
          );
        }
      }
    }

    // Valider qu'un vrai systemId souverain est reconnu
    const validId = IDFactory.generate('Engagement');
    const isValid = IDFactory.validate(validId, 'Engagement');
    assert(isValid === true,
      `IDFactory.validate() doit accepter un id souverain genere. Recu : ${isValid} pour "${validId}"`);

    const detectedType = IDFactory.getType(validId);
    assert(detectedType === 'Engagement',
      `getType("${validId}") doit retourner 'Engagement'. Recu : '${detectedType}'`);
  });

  console.log('\n=======================================================');
  console.log(`RESULTAT : ${passed} passes, ${failed} echoues sur ${passed + failed} tests`);
  if (failed === 0) {
    console.log('\u2713 PORTABILITY-SYSTEMID-01 PASSED');
    console.log('  D-127/D-132 valides. Prefixes souverains coherents.');
    console.log(`  ${Object.keys(IDFactory.PREFIXES).length} types IDFactory couverts.`);
  } else {
    console.log('\u2717 PORTABILITY-SYSTEMID-01 FAILED');
    process.exitCode = 1;
  }
  console.log('=======================================================');
}
run().catch(err => { console.error('ERREUR FATALE :', err.message); process.exitCode = 1; });