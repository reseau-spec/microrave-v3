/**
 * MICRO RAVE V3 — scripts/seed-pilot-data.js
 * ============================================================
 * Crée les données pilote SC-01 dans Base44 V3.
 *
 * SC-01 : DJ Alex au Bar Le Trèfle · 300$ CAD · Event 0 pilote
 *
 * Crée si absent :
 *   1. Utilisateur DJ Alex (talent)       → USR-DJALE-*
 *   2. Utilisateur Le Trèfle (organisateur) → USR-TREFLE-*
 *   3. MembershipPlan Freemium            → (si absent)
 *   4. UserMembership DJ Alex Freemium    → (si absent)
 *   5. Event pilote                       → EVT-PILOT-*
 *   6. Engagement pilote                  → ENG-PILOT-*
 *
 * IDEMPOTENT : vérifie l'existence avant de créer.
 * Persiste les systemIds dans .pilot-ids.json pour run-j9-pilot.js.
 *
 * Source : D-127 · Plan Phase 1.3 · SC-01
 * ============================================================
 */

'use strict';

require('dotenv').config();

const IDFactory = require('../src/core/IDFactory');
const fs        = require('fs');
const path      = require('path');

const BASE44_BASE_URL = 'https://futuristic-rave-core-flow.base44.app/api';
const IDS_FILE        = path.join(__dirname, '.pilot-ids.json');

function buildHeaders() {
  const apiKey = process.env.BASE44_API_KEY;
  if (!apiKey || apiKey === 'REMPLACER_PAR_API_KEY_BASE44') {
    throw new Error('CONFIG_MISSING: BASE44_API_KEY absent de .env.');
  }
  return { 'Content-Type': 'application/json', 'api_key': apiKey };
}

async function get(path) {
  const res = await fetch(`${BASE44_BASE_URL}${path}`, { headers: buildHeaders() });
  if (!res.ok) return null;
  const json = await res.json();
  return Array.isArray(json) ? json : (json.data || json);
}

async function post(path, data) {
  const res = await fetch(`${BASE44_BASE_URL}${path}`, {
    method: 'POST', headers: buildHeaders(), body: JSON.stringify(data),
  });
  if (!res.ok) {
    const b = await res.text().catch(() => '');
    throw new Error(`BASE44_HTTP_${res.status}: POST ${path} — ${b}`);
  }
  return res.json();
}

async function findBySystemId(entity, systemId) {
  const q = encodeURIComponent(JSON.stringify({ systemId }));
  const arr = await get(`/entities/${entity}?q=${q}`);
  return Array.isArray(arr) ? arr[0] || null : null;
}

function section(title) {
  console.log(`\n${'─'.repeat(56)}`);
  console.log(`  ${title}`);
  console.log('─'.repeat(56));
}

function ok(msg, data) {
  console.log(`  ✅ ${msg}`);
  if (data) console.log(`     ${JSON.stringify(data)}`);
}

function skip(msg) { console.log(`  ⏭  ${msg} (déjà présent)`); }
function info(msg) { console.log(`  ℹ  ${msg}`); }

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log('║  MICRO RAVE V3 — Seed données pilote SC-01           ║');
  console.log('║  DJ Alex au Bar Le Trèfle · 300$ CAD                 ║');
  console.log('╚══════════════════════════════════════════════════════╝');

  // Charger IDs existants si le fichier existe
  let ids = {};
  if (fs.existsSync(IDS_FILE)) {
    ids = JSON.parse(fs.readFileSync(IDS_FILE, 'utf8'));
    info(`IDs existants chargés depuis ${IDS_FILE}`);
  }

  // ── 1. Utilisateur DJ Alex ──────────────────────────────────
  section('1. Utilisateur DJ Alex (talent)');
  if (!ids.talentUserId) ids.talentUserId = IDFactory.generate('User');
  let djAlex = await findBySystemId('User', ids.talentUserId);
  if (djAlex) {
    skip(`DJ Alex : ${ids.talentUserId}`);
  } else {
    djAlex = await post('/entities/User', {
      systemId:    ids.talentUserId,
      full_name:   'DJ Alex',
      role:        'talent',
      displayName: 'DJ Alex',
      email:       process.env.PILOT_TALENT_EMAIL || 'dj.alex.pilot@microrave.ca',
      createdAt:   new Date().toISOString(),
    });
    ok(`DJ Alex créé`, { systemId: ids.talentUserId, id: djAlex.id });
  }
  ids.talentBase44Id = djAlex.id || ids.talentBase44Id;

  // ── 2. Utilisateur Bar Le Trèfle (organisateur) ─────────────
  section('2. Utilisateur Bar Le Trèfle (organisateur)');
  if (!ids.organizerUserId) ids.organizerUserId = IDFactory.generate('User');
  let trefle = await findBySystemId('User', ids.organizerUserId);
  if (trefle) {
    skip(`Le Trèfle : ${ids.organizerUserId}`);
  } else {
    trefle = await post('/entities/User', {
      systemId:    ids.organizerUserId,
      full_name:   'Bar Le Trèfle',
      role:        'organisateur',
      displayName: 'Bar Le Trèfle',
      email:       process.env.PILOT_ORGANIZER_EMAIL || 'contact.pilot@letrefle.ca',
      createdAt:   new Date().toISOString(),
    });
    ok(`Bar Le Trèfle créé`, { systemId: ids.organizerUserId, id: trefle.id });
  }
  ids.organizerBase44Id = trefle.id || ids.organizerBase44Id;

  // ── 3. MembershipPlan Freemium ──────────────────────────────
  section('3. MembershipPlan Freemium (12% = 120 000 ppm)');
  const freemiumQ = encodeURIComponent(JSON.stringify({ name: 'Freemium' }));
  const freemiumPlans = await get(`/entities/MembershipPlan?q=${freemiumQ}`);
  let freemiumPlan = Array.isArray(freemiumPlans) ? freemiumPlans[0] || null : null;
  if (freemiumPlan) {
    skip(`MembershipPlan Freemium : ${freemiumPlan.id}`);
  } else {
    freemiumPlan = await post('/entities/MembershipPlan', {
      name:              'Freemium',
      tier:              'A',
      commissionRatePpm: 120000,
      description:       'Plan de base — 12% commission MR. Source : D-027.',
      createdAt:         new Date().toISOString(),
    });
    ok(`MembershipPlan Freemium créé`, { id: freemiumPlan.id });
  }
  ids.freemiumPlanId = freemiumPlan.id || ids.freemiumPlanId;

  // ── 4. UserMembership DJ Alex Freemium ──────────────────────
  section('4. UserMembership DJ Alex — Freemium');
  const membershipQ = encodeURIComponent(JSON.stringify({ userId: ids.talentUserId, status: 'active' }));
  const memberships = await get(`/entities/UserMembership?q=${membershipQ}`);
  const existingMembership = Array.isArray(memberships) ? memberships[0] || null : null;
  if (existingMembership) {
    skip(`UserMembership actif : ${existingMembership.id}`);
    ids.membershipId = existingMembership.id;
  } else {
    const membership = await post('/entities/UserMembership', {
      userId:            ids.talentUserId,
      planId:            ids.freemiumPlanId,
      status:            'active',
      commissionRatePpm: 120000,  // dénormalisé pour MembershipRepository
      startedAt:         new Date().toISOString(),
      createdAt:         new Date().toISOString(),
    });
    ok(`UserMembership Freemium créé`, { id: membership.id });
    ids.membershipId = membership.id;
  }

  // ── 5. Event pilote ─────────────────────────────────────────
  section('5. Event pilote SC-01');
  if (!ids.eventId) ids.eventId = IDFactory.generate('Event');
  let event = await findBySystemId('Event', ids.eventId);
  if (event) {
    skip(`Event : ${ids.eventId}`);
  } else {
    event = await post('/entities/Event', {
      systemId:          ids.eventId,
      organizerUserId:   ids.organizerUserId,
      name:              'SC-01 Pilote — Bar Le Trèfle',
      venue:             'Bar Le Trèfle, Montréal',
      scheduledStartAt:  process.env.PILOT_EVENT_DATE || new Date(Date.now() + 7 * 86400000).toISOString(),
      status:            'draft',
      createdAt:         new Date().toISOString(),
    });
    ok(`Event créé`, { systemId: ids.eventId, id: event.id });
  }
  ids.eventBase44Id = event.id || ids.eventBase44Id;

  // ── 6. Engagement pilote ────────────────────────────────────
  section('6. Engagement pilote ENG-*');
  if (!ids.engagementId) ids.engagementId = IDFactory.generate('Engagement');
  let engagement = await findBySystemId('Engagement', ids.engagementId);
  if (engagement) {
    skip(`Engagement : ${ids.engagementId}`);
    info(`État actuel : ${engagement.status}`);
  } else {
    engagement = await post('/entities/Engagement', {
      systemId:            ids.engagementId,
      eventId:             ids.eventId,
      talentUserId:        ids.talentUserId,
      organizerUserId:     ids.organizerUserId,
      roleMetier:          'DJ',
      cachetSigneCents:    20000,   // 200$ signé
      status:              'proposed',
      tauxPpm:             120000,  // Freemium 12%
      prixVenduClientCents: 30000,  // 300$ TTC
      depositCents:        6000,    // 20% = 60$
      currency:            'cad',
      createdAt:           new Date().toISOString(),
    });
    ok(`Engagement créé`, { systemId: ids.engagementId, id: engagement.id });
  }
  ids.engagementBase44Id = engagement.id || ids.engagementBase44Id;

  // ── Persister les IDs ────────────────────────────────────────
  fs.writeFileSync(IDS_FILE, JSON.stringify(ids, null, 2));
  info(`IDs persistés dans ${IDS_FILE}`);

  // ── Résumé ───────────────────────────────────────────────────
  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log('║  SEED PILOTE COMPLET                                 ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log(`
  Ajouter dans .env avant run-j9-pilot.js :

  PILOT_TALENT_USER_ID=${ids.talentUserId}
  PILOT_ENGAGEMENT_ID=${ids.engagementId}

  Puis lancer l'onboarding Stripe Connect :

    node scripts/run-j9-pilot.js --step=onboard
  `);
}

main().catch(err => {
  console.error('\n  ❌ ERREUR FATALE :', err.message);
  process.exit(1);
});