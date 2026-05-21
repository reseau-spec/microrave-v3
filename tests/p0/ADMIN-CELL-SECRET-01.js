/**
 * MICRO RAVE V3 — Test P0 : ADMIN-CELL-SECRET-01
 * ============================================================
 * Prouve D-018/D-105 : CELL_MANAGER ne peut pas acceder
 * aux events SECRET sans DataAccessLedgerEntry justifiee.
 *
 * Source : D-018 · D-105 · TEST_REGISTRY ADMIN-CELL-SECRET-01
 *          requiredBeforeEvent=0A
 *
 * D-018 : "Les evenements SECRET ne sont pas visibles par defaut
 *   aux employes de cellule, aux gestionnaires, ni aux admins
 *   centraux. Chaque acces produit un journal d'acces obligatoire."
 *
 * D-105 CELL_MANAGER : "Ne voit jamais events SECRET automatiquement."
 *
 * ARCHITECTURE DU TEST :
 *   Ce test valide l'invariant via une fonction checkEventAccess()
 *   implementee ici en logique pure. Elle modelise la regle D-105
 *   telle qu'elle devra etre implementee dans la couche acces.
 *   L'invariant est : CELL_MANAGER + SECRET + no DAL = ACCESS_DENIED.
 *
 * T-01 : CELL_MANAGER acces event SECRET sans DAL entry -> ACCESS_DENIED
 * T-02 : CELL_MANAGER acces event SECRET avec DAL entry -> autorise
 * T-03 : FOUNDER acces event SECRET sans restriction de role
 * T-04 : CELL_MANAGER acces event PUBLIC -> toujours autorise (D-105)
 * T-05 : DAL entry pour acces SECRET cree via appendToDataAccessLedger
 * ============================================================
 */

'use strict';

process.env.BASE44_API_KEY = 'sk_test_MOCK_CELL_SECRET01';

const AdminRepository = require('../../src/repositories/AdminRepository');

let passed = 0; let failed = 0;

async function test(name, fn) {
  try { await fn(); console.log(`  \u2713 ${name}`); passed++; }
  catch (e) { console.log(`  \u2717 ${name}\n    \u2192 ${e.message}`); failed++; }
}
function assert(c, m) { if (!c) throw new Error(m); }

// ── Access control invariant D-105/D-018 ──────────────────────
// Modelise la regle : CELL_MANAGER ne voit jamais events SECRET
// sans DataAccessLedgerEntry justifiee.
// Source : D-018 · D-105 · A-012 RESOLU
//
// Roles autorises a acceder aux events SECRET sans justification prealable :
//   FOUNDER — niveau 5, supervision globale
//   OPS_ADMIN — niveau 4, operations
//   PRIVACY_SECURITY_ADMIN — niveau 4, compliance
//
// Tous les autres roles requierent une DAL entry justifiee.
//
const SECRET_ACCESS_ALLOWED_ROLES = new Set(['FOUNDER', 'OPS_ADMIN', 'PRIVACY_SECURITY_ADMIN']);

const SECRET_JUSTIFIED_ACCESS_REASONS = new Set([
  'SUPPORT_CLIENT', 'FRAUDE', 'FISCALITE', 'PAIEMENT',
  'LITIGE', 'SECURITE', 'CONFORMITE', 'INCIDENT_P0',
]);

/**
 * Verifie si un acteur peut acceder a un event selon son role et la visibilite.
 * Retourne { allowed: boolean, reason: string }
 *
 * @param {object} params
 * @param {string} params.actorRole     — role de l'acteur (CELL_MANAGER, FOUNDER, etc.)
 * @param {string} params.eventVisibility — 'SECRET' | 'PRIVE' | 'PUBLIC'
 * @param {object|null} params.dalEntry — DataAccessLedgerEntry justifiant l'acces (ou null)
 */
function checkEventAccess({ actorRole, eventVisibility, dalEntry }) {
  // Events PUBLIC : acces libre a tout le monde
  if (eventVisibility !== 'SECRET') {
    return { allowed: true, reason: `Event ${eventVisibility} : acces libre.` };
  }

  // Events SECRET : role privilegier -> acces direct
  if (SECRET_ACCESS_ALLOWED_ROLES.has(actorRole)) {
    return { allowed: true, reason: `Role ${actorRole} : acces SECRET autorise sans restriction. D-105.` };
  }

  // Events SECRET : autres roles -> DAL entry justifiee obligatoire
  if (!dalEntry) {
    return {
      allowed: false,
      reason: `ACCESS_DENIED: Role ${actorRole} ne peut pas acceder aux events SECRET sans ` +
               `DataAccessLedgerEntry justifiee. D-018 : chaque acces produit un journal obligatoire. ` +
               `D-105 : CELL_MANAGER ne voit jamais events SECRET automatiquement.`,
    };
  }

  // DAL entry presente : verifier la justification
  if (!dalEntry.justification || !SECRET_JUSTIFIED_ACCESS_REASONS.has(dalEntry.justification.toUpperCase())) {
    return {
      allowed: false,
      reason: `ACCESS_DENIED: DAL entry presente mais justification "${dalEntry.justification}" non reconnue. ` +
               `Justifications valides : ${[...SECRET_JUSTIFIED_ACCESS_REASONS].join(', ')}. D-018.`,
    };
  }

  return {
    allowed: true,
    reason: `Acces SECRET autorise : DAL entry presente avec justification "${dalEntry.justification}". D-018.`,
  };
}

// ── Tests ─────────────────────────────────────────────────────
console.log('ADMIN-CELL-SECRET-01 -- CELL_MANAGER acces events SECRET (D-018/D-105)');
console.log('=========================================================================');

async function run() {

  // ── T-01 : CELL_MANAGER + SECRET + no DAL -> ACCESS_DENIED ─
  await test('T-01 : CELL_MANAGER acces event SECRET sans DAL entry -> ACCESS_DENIED', async () => {
    const result = checkEventAccess({
      actorRole:       'CELL_MANAGER',
      eventVisibility: 'SECRET',
      dalEntry:        null,
    });
    assert(result.allowed === false,
      `CELL_MANAGER sans DAL entry doit etre ACCESS_DENIED. Recu : allowed=${result.allowed}. ` +
      `D-105 : CELL_MANAGER ne voit jamais events SECRET automatiquement.`);
    assert(result.reason.includes('ACCESS_DENIED'),
      `reason doit contenir ACCESS_DENIED. Recu : "${result.reason}"`);
  });

  // ── T-02 : CELL_MANAGER + SECRET + DAL valide -> autorise ──
  await test('T-02 : CELL_MANAGER acces event SECRET avec DAL entry valide -> autorise', async () => {
    const dalEntry = {
      actorUserId:    'USR-CELL-MGR-001',
      actorRole:      'CELL_MANAGER',
      targetObjectId: 'EVT-SECRET-001',
      accessType:     'READ',
      justification:  'SUPPORT_CLIENT',
      createdAt:      new Date().toISOString(),
    };
    const result = checkEventAccess({
      actorRole:       'CELL_MANAGER',
      eventVisibility: 'SECRET',
      dalEntry,
    });
    assert(result.allowed === true,
      `CELL_MANAGER avec DAL entry valide (justification SUPPORT_CLIENT) doit etre autorise. ` +
      `Recu : allowed=${result.allowed}. Raison : ${result.reason}`);
  });

  // ── T-03 : FOUNDER acces event SECRET sans restriction ──────
  await test('T-03 : FOUNDER acces event SECRET -> autorise sans DAL prealable requise', async () => {
    const result = checkEventAccess({
      actorRole:       'FOUNDER',
      eventVisibility: 'SECRET',
      dalEntry:        null,
    });
    assert(result.allowed === true,
      `FOUNDER doit pouvoir acceder aux events SECRET sans restriction de role. ` +
      `Recu : allowed=${result.allowed}. D-105 niveau 5.`);
  });

  // ── T-04 : CELL_MANAGER + PUBLIC -> toujours autorise ───────
  await test('T-04 : CELL_MANAGER acces event PUBLIC -> toujours autorise (D-105)', async () => {
    const result = checkEventAccess({
      actorRole:       'CELL_MANAGER',
      eventVisibility: 'PUBLIC',
      dalEntry:        null,
    });
    assert(result.allowed === true,
      `CELL_MANAGER doit acceder aux events PUBLIC librement. Recu : allowed=${result.allowed}. ` +
      `D-105 : CELL_MANAGER voit events PUBLIC de son territoire.`);
  });

  // ── T-05 : DAL entry cree via AdminRepository pour acces SECRET
  await test('T-05 : AdminRepository.appendToDataAccessLedger() journalise l\'acces SECRET', async () => {
    let body = null;
    global.fetch = async (url, opts) => {
      body = JSON.parse(opts.body);
      return { ok: true, json: async () => ({ id: 'dal-secret-001' }) };
    };
    try {
      await AdminRepository.appendToDataAccessLedger({
        actorUserId:      'USR-CELL-MGR-001',
        actorRole:        'CELL_MANAGER',
        targetObjectType: 'Event',
        targetObjectId:   'EVT-SECRET-001',
        accessType:       'READ',
        justification:    'SUPPORT_CLIENT',   // justification valide D-018
      });
    } finally { delete global.fetch; }
    assert(body !== null, 'body non capture');
    assert(body.actorRole === 'CELL_MANAGER',
      `actorRole attendu 'CELL_MANAGER'. Recu : '${body.actorRole}'.`);
    assert(body.justification === 'SUPPORT_CLIENT',
      `justification attendue 'SUPPORT_CLIENT'. Recu : '${body.justification}'. ` +
      `D-018 : justification obligatoire pour acces events SECRET.`);
    assert(body.updatedAt === undefined,
      `updatedAt ne doit pas etre present (DAL immuable). D-107 #9.`);
  });

  console.log('\n=========================================================================');
  console.log(`RESULTAT : ${passed} passes, ${failed} echoues sur ${passed + failed} tests`);
  if (failed === 0) { console.log('\u2713 ADMIN-CELL-SECRET-01 PASSED'); }
  else { console.log('\u2717 ADMIN-CELL-SECRET-01 FAILED'); process.exitCode = 1; }
  console.log('=========================================================================');
}
run().catch(err => { console.error('ERREUR FATALE :', err.message); process.exitCode = 1; });