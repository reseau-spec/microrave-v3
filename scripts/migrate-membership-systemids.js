/**
 * MICRO RAVE V3 — Migration : systemId pour MembershipPlan et UserMembership
 * ============================================================
 * PHASE 3 — TÂCHE A
 *
 * PROBLÈME :
 *   MembershipPlan et UserMembership n'avaient pas de systemId IDFactory
 *   lors de leur création. Leurs identifiants étaient des ids Base44 opaques,
 *   ce qui viole la règle absolue : "Le Base44 id n'est JAMAIS un identifiant
 *   métier souverain." (D-001)
 *
 * CE QUE CE SCRIPT FAIT :
 *   1. Lire tous les MembershipPlan sans systemId → assigner MBP-*
 *   2. Lire tous les UserMembership sans systemId → assigner UMB-*
 *   3. Pour les UserMembership dont planId est un id Base44 brut (non MBP-*) :
 *      résoudre le MembershipPlan via son id Base44, récupérer le MBP-* créé,
 *      réécrire planId avec le MBP-*.
 *   4. Logger chaque modification : ancien id / nouveau systemId.
 *
 * IDEMPOTENCE :
 *   Toute entité ayant déjà un systemId valide (MBP-* ou UMB-*) est ignorée.
 *   Le script peut être relancé sans effets de bord.
 *
 * EXÉCUTION :
 *   node scripts/migrate-membership-systemids.js
 *
 * PRÉREQUIS :
 *   BASE44_API_KEY en variable d'environnement (ou .env chargé).
 *   Connexion à la base de données Base44 opérationnelle.
 *
 * ⚠️ DÉCISION DU FONDATEUR REQUISE AVANT EXÉCUTION SUR LA DB LIVE ⚠️
 *    Ce script est produit pour revue — ne pas exécuter sans validation.
 *
 * Source : D-001, D-027, PHASE-3, 28 mai 2026
 * ============================================================
 */

'use strict';

import IDFactory from '../src/core/IDFactory.js';

// ── Utilitaires ───────────────────────────────────────────────────────────────

function isSovereignId(id, prefix) {
  return typeof id === 'string' && id.startsWith(`${prefix}-`);
}

function log(label, base44Id, systemId) {
  console.log(`  [MIGRATED] ${label}`);
  console.log(`             base44_id  : ${base44Id}`);
  console.log(`             systemId   : ${systemId}`);
  console.log('');
}

function logSkip(label, base44Id, systemId) {
  console.log(`  [SKIP]     ${label} — systemId déjà présent : ${systemId} (base44_id: ${base44Id})`);
}

function logError(label, base44Id, err) {
  console.error(`  [ERROR]    ${label} (base44_id: ${base44Id}) — ${err.message}`);
}

// ── Connexion Base44 ──────────────────────────────────────────────────────────
// Le script utilise le client HTTP Node (src/repositories/) pour appeler l'API
// Base44 REST. Pas le runtime Deno — univers séparés.

async function connectBase44() {
  // Charge la configuration depuis l'environnement ou config/
  const { default: repos } = await import('../src/repositories/index.js');
  return repos;
}

// ── Étape 1 & 2 : Migration MembershipPlan ───────────────────────────────────

async function migrateMembershipPlans(repos) {
  console.log('\n── Étape 1 : MembershipPlan → MBP-* ────────────────────────────────────────');

  const plans = await repos.membershipPlans.list({});

  // Map : base44_id → systemId fraîchement assigné (pour résolution planId ensuite)
  const base44ToSystemId = new Map();

  let migrated = 0;
  let skipped  = 0;

  for (const plan of plans) {
    if (isSovereignId(plan.systemId, 'MBP')) {
      logSkip('MembershipPlan', plan.id, plan.systemId);
      base44ToSystemId.set(plan.id, plan.systemId);
      skipped++;
      continue;
    }

    try {
      const systemId = IDFactory.generate('MembershipPlan');
      await repos.membershipPlans.update(plan.id, { systemId });
      base44ToSystemId.set(plan.id, systemId);
      log('MembershipPlan', plan.id, systemId);
      migrated++;
    } catch (err) {
      logError('MembershipPlan', plan.id, err);
    }
  }

  console.log(`  → ${migrated} migré(s), ${skipped} ignoré(s) (déjà souverains)`);
  return base44ToSystemId;
}

// ── Étape 3 & 4 : Migration UserMembership ───────────────────────────────────

async function migrateUserMemberships(repos, base44ToSystemId) {
  console.log('\n── Étape 2 : UserMembership → UMB-* + résolution planId ────────────────────');

  const memberships = await repos.userMemberships.list({});

  let migrated = 0;
  let skipped  = 0;
  let planIdFixed = 0;

  for (const umb of memberships) {
    const patch = {};
    let touched = false;

    // systemId
    if (isSovereignId(umb.systemId, 'UMB')) {
      logSkip('UserMembership systemId', umb.id, umb.systemId);
      skipped++;
    } else {
      patch.systemId = IDFactory.generate('UserMembership');
      touched = true;
    }

    // planId : si ce n'est pas déjà un MBP-*, résoudre depuis la map
    if (!isSovereignId(umb.planId, 'MBP')) {
      const resolvedPlanSystemId = base44ToSystemId.get(umb.planId);
      if (resolvedPlanSystemId) {
        patch.planId = resolvedPlanSystemId;
        touched = true;
        planIdFixed++;
        console.log(`  [PLANID_RESOLVED] UserMembership ${umb.id}`);
        console.log(`                    planId (base44 brut) : ${umb.planId}`);
        console.log(`                    planId (MBP-*)       : ${resolvedPlanSystemId}`);
        console.log('');
      } else {
        console.warn(`  [WARN] UserMembership ${umb.id} — planId "${umb.planId}" introuvable dans la map MBP. Vérification manuelle requise.`);
      }
    }

    if (!touched) continue;

    try {
      await repos.userMemberships.update(umb.id, patch);
      if (patch.systemId) {
        log('UserMembership', umb.id, patch.systemId);
        migrated++;
      }
    } catch (err) {
      logError('UserMembership', umb.id, err);
    }
  }

  console.log(`  → ${migrated} systemId migré(s), ${skipped} ignoré(s), ${planIdFixed} planId résolu(s)`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║  MIGRATION : systemId MembershipPlan + UserMembership        ║');
  console.log('║  PHASE 3 — 28 mai 2026                                       ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('\n⚠️  Mode DRY-RUN désactivé — les modifications seront persistées.');
  console.log('   Pour annuler, Ctrl+C dans les 3 secondes.\n');

  await new Promise(r => setTimeout(r, 3000));

  let repos;
  try {
    repos = await connectBase44();
  } catch (err) {
    console.error(`\n[FATAL] Impossible de se connecter à Base44 : ${err.message}`);
    console.error('        Vérifier BASE44_API_KEY et la connexion réseau.');
    process.exit(1);
  }

  try {
    // Étape 1 : Plans → MBP-* (retourne la map pour résolution planId)
    const base44ToSystemId = await migrateMembershipPlans(repos);

    // Étape 2 : Memberships → UMB-* + planId MBP-*
    await migrateUserMemberships(repos, base44ToSystemId);

    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║  MIGRATION TERMINÉE                                          ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');
  } catch (err) {
    console.error(`\n[FATAL] Erreur non récupérable : ${err.message}`);
    console.error(err.stack);
    process.exit(1);
  }
}

main();
