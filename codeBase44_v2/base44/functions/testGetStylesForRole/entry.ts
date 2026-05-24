// ─────────────────────────────────────────────────────────────────────────────
// ⚠️  RENOMMER EN: resetForNewWave  (le 1er mai 2026 quand crédits disponibles)
// NOM TEMPORAIRE: testGetStylesForRole
// Invoquer avec: base44.functions.invoke('testGetStylesForRole', {
//   confirmPhrase, dryRun?, stripeEnvNote?
// })
// ─────────────────────────────────────────────────────────────────────────────
//
// resetForNewWave — Efface toutes les données transactionnelles pour repartir
//   avec un environnement propre (nouvelle vague de tests ou mise en production).
//
// ══ CONSERVÉ (taxonomie et comptes) ══════════════════════════════════════════
//   User, TalentProfile (structure), UserMembership, MembershipPlan,
//   Checkpoint, Domain, RoleHierarchy, StyleHierarchy,
//   RoleDomainMap, RoleStyleMap, Mission, Scene, SceneCheckpoint,
//   TalentPricing (tarifs de référence)
//
// ══ EFFACÉ — FINANCIER ═══════════════════════════════════════════════════════
//   FinancialLedger, PayoutSplit, EventPayout,
//   EventPaymentRequest, EventPaymentLog, PaymentLedger
//
// ══ EFFACÉ — ÉVÉNEMENTS & OPÉRATIONNEL ═══════════════════════════════════════
//   Event, LineupPlacement, PriceProposal,
//   Session, SessionPresence,
//   Ticket, EventTicketConfig,
//   Queue, QueueEntry, UserQueueState
//
// ══ EFFACÉ — HISTORIQUE DE JEU ════════════════════════════════════════════════
//   SOTSLog              — votes SOTS individuels
//   DomainProgress       — XP + level par domaine par user
//   UserDomainStats      — stats agrégées par domaine
//   UserCheckpointStats  — stats par lieu par user
//   CheckpointUserStats  — stats par user par lieu (inverse)
//   UserUnlocks          — styles débloqués
//   UserSkillSnapshot    — snapshot compétences (XP global, vibe rating)
//   UserPreferenceLedger — historique signaux de préférence
//   UserPreferences      — préférences calculées
//   DropLog              — historique des drops XP
//   MissionProgress      — progression des missions
//   CheckpointCheckin    — check-ins aux lieux
//   CulturalMoment       — moments culturels générés
//   CulturalMomentSignal — signaux ayant déclenché les moments
//   AdminCase            — cas admin
//
// ══ EFFACÉ — STATS AGRÉGÉES LIEUX ════════════════════════════════════════════
//   CheckpointLiveStats     — stats temps réel
//   CheckpointDomainLedger  — ledger domaines par lieu
//   CheckpointDomainStats   — stats domaines par lieu
//   CheckpointRoleStats     — stats rôles par lieu
//   CheckpointStyleStats    — stats styles par lieu
//   StyleUsageStats         — stats usage styles global
//
// ══ REMIS À ZÉRO (champs sur entités conservées) ══════════════════════════════
//   TalentProfile:
//     xpGlobal, cosmeticXp, cosmeticBadges → 0/[]
//     sotsGlobalScore, sotsRecent30Score, trustScore → 0
//     verifiedRevenueTotal → 0
//     rweTotal, rweAvgPerSession, rweSessionCount, rweCommittedSessionIds → 0/[]
//     totalVotes → 0
//   SellerTier:
//     lifetimeSellerRevenue, lifetimeEventCount → 0, tier → 'C'
//
// ══ SÉCURITÉ ═════════════════════════════════════════════════════════════════
//   - Admin only
//   - confirmPhrase obligatoire: "RESET_WAVE_CONFIRM"
//   - dryRun: true (défaut) — inspecte sans toucher
//   - dryRun: false — exécute le reset
//
// deploy: v1

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status, headers: { 'content-type': 'application/json' },
  });
}

// Efface tous les enregistrements d'une entité (batch de 50, avec garde-fou)
async function deleteAllRecords(service, entityName, label) {
  let deleted = 0;
  let iterations = 0;
  const MAX_ITERATIONS = 500;

  try {
    while (iterations < MAX_ITERATIONS) {
      iterations++;
      const records = await service.entities[entityName]?.filter({}).catch(() => []);
      if (!records || records.length === 0) break;
      const batch = records.slice(0, 50);
      await Promise.all(batch.map(r => service.entities[entityName].delete(r.id).catch(() => null)));
      deleted += batch.length;
    }
    return { entity: label, deleted, ok: true };
  } catch (err) {
    return { entity: label, deleted, ok: false, error: err?.message };
  }
}

// Compte sans effacer (pour dryRun)
async function countRecords(service, entityName, label) {
  try {
    const records = await service.entities[entityName]?.filter({}).catch(() => []);
    return { entity: label, count: records?.length || 0, ok: true };
  } catch (err) {
    return { entity: label, count: 0, ok: false, error: err?.message };
  }
}

// ── Définition des entités à traiter ─────────────────────────────────────────

const ENTITIES_FINANCIER = [
  { name: 'PayoutSplit',         label: 'PayoutSplit' },
  { name: 'EventPayout',         label: 'EventPayout' },
  { name: 'FinancialLedger',     label: 'FinancialLedger' },
  { name: 'EventPaymentRequest', label: 'EventPaymentRequest' },
  { name: 'EventPaymentLog',     label: 'EventPaymentLog' },
  { name: 'PaymentLedger',       label: 'PaymentLedger' },
];

const ENTITIES_EVENEMENTS = [
  { name: 'LineupPlacement',  label: 'LineupPlacement' },
  { name: 'PriceProposal',    label: 'PriceProposal' },
  { name: 'SessionPresence',  label: 'SessionPresence' },
  { name: 'Session',          label: 'Session' },
  { name: 'Ticket',           label: 'Ticket' },
  { name: 'EventTicketConfig',label: 'EventTicketConfig' },
  { name: 'Event',            label: 'Event' },
  { name: 'QueueEntry',       label: 'QueueEntry' },
  { name: 'UserQueueState',   label: 'UserQueueState' },
  { name: 'Queue',            label: 'Queue' },
];

const ENTITIES_JEU = [
  { name: 'SOTSLog',              label: 'SOTSLog (votes SOTS)' },
  { name: 'DomainProgress',       label: 'DomainProgress (XP+level)' },
  { name: 'UserDomainStats',      label: 'UserDomainStats' },
  { name: 'UserCheckpointStats',  label: 'UserCheckpointStats' },
  { name: 'CheckpointUserStats',  label: 'CheckpointUserStats' },
  { name: 'UserUnlocks',          label: 'UserUnlocks (styles débloqués)' },
  { name: 'UserSkillSnapshot',    label: 'UserSkillSnapshot' },
  { name: 'UserPreferenceLedger', label: 'UserPreferenceLedger' },
  { name: 'UserPreferences',      label: 'UserPreferences' },
  { name: 'DropLog',              label: 'DropLog (historique XP drops)' },
  { name: 'MissionProgress',      label: 'MissionProgress' },
  { name: 'CheckpointCheckin',    label: 'CheckpointCheckin' },
  { name: 'CulturalMoment',       label: 'CulturalMoment' },
  { name: 'CulturalMomentSignal', label: 'CulturalMomentSignal' },
  { name: 'AdminCase',            label: 'AdminCase' },
];

const ENTITIES_STATS_LIEUX = [
  { name: 'CheckpointLiveStats',    label: 'CheckpointLiveStats' },
  { name: 'CheckpointDomainLedger', label: 'CheckpointDomainLedger' },
  { name: 'CheckpointDomainStats',  label: 'CheckpointDomainStats' },
  { name: 'CheckpointRoleStats',    label: 'CheckpointRoleStats' },
  { name: 'CheckpointStyleStats',   label: 'CheckpointStyleStats' },
  { name: 'StyleUsageStats',        label: 'StyleUsageStats' },
];

const ALL_ENTITIES = [
  ...ENTITIES_FINANCIER,
  ...ENTITIES_EVENEMENTS,
  ...ENTITIES_JEU,
  ...ENTITIES_STATS_LIEUX,
];

// ── Handler ───────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) return json(401, { ok: false, error: 'Unauthorized' });
    if (user.role !== 'admin') return json(403, { ok: false, error: 'Admin only' });

    const body = await req.json().catch(() => ({}));
    const { confirmPhrase, dryRun = true, stripeEnvNote = '' } = body;

    if (confirmPhrase !== 'RESET_WAVE_CONFIRM') {
      return json(400, {
        ok: false,
        error: 'confirmPhrase invalide.',
        usage: '{ "confirmPhrase": "RESET_WAVE_CONFIRM", "dryRun": true }',
      });
    }

    const service = base44.asServiceRole;
    const nowIso = new Date().toISOString();

    // ── DRY RUN ──────────────────────────────────────────────────────────────
    if (dryRun) {
      const counts = await Promise.all(ALL_ENTITIES.map(e => countRecords(service, e.name, e.label)));
      const sellerTiers = await service.entities.SellerTier?.filter({}).catch(() => []);
      const talentProfiles = await service.entities.TalentProfile?.filter({}).catch(() => []);
      const totalToDelete = counts.reduce((sum, r) => sum + (r.count || 0), 0);

      return json(200, {
        ok: true,
        dryRun: true,
        message: `DRY RUN — rien n'a été modifié. Envoyer dryRun: false pour exécuter.`,
        totalRecordsToDelete: totalToDelete,
        breakdown: {
          financier: counts.filter(c => ENTITIES_FINANCIER.find(e => e.label === c.entity)),
          evenements: counts.filter(c => ENTITIES_EVENEMENTS.find(e => e.label === c.entity)),
          jeu: counts.filter(c => ENTITIES_JEU.find(e => e.label === c.entity)),
          stats_lieux: counts.filter(c => ENTITIES_STATS_LIEUX.find(e => e.label === c.entity)),
        },
        toReset: [
          {
            entity: 'TalentProfile',
            count: talentProfiles?.length || 0,
            fields: 'xpGlobal, cosmeticXp, cosmeticBadges, sotsGlobalScore, sotsRecent30Score, trustScore, verifiedRevenueTotal, rwe* → 0/[]',
          },
          {
            entity: 'SellerTier',
            count: sellerTiers?.length || 0,
            fields: 'lifetimeSellerRevenue, lifetimeEventCount → 0, tier → C',
          },
        ],
        conserved: [
          'User', 'TalentProfile (structure, bio, avatarUrl)',
          'UserMembership', 'MembershipPlan',
          'Checkpoint', 'Domain', 'Mission', 'Scene',
          'RoleHierarchy', 'StyleHierarchy', 'RoleDomainMap', 'RoleStyleMap',
          'TalentPricing',
        ],
      });
    }

    // ── RESET RÉEL ───────────────────────────────────────────────────────────
    const results = [];

    // 1. Effacer toutes les entités transactionnelles
    for (const entity of ALL_ENTITIES) {
      const result = await deleteAllRecords(service, entity.name, entity.label);
      results.push(result);
      console.log(`[resetForNewWave] ${entity.label}: ${result.deleted} deleted ok=${result.ok}`);
    }

    // 2. Remettre à zéro TalentProfile (scores, XP, badges)
    let talentProfilesReset = 0;
    try {
      const profiles = await service.entities.TalentProfile?.filter({}).catch(() => []);
      for (const p of (profiles || [])) {
        await service.entities.TalentProfile.update(p.id, {
          xpGlobal:               0,
          cosmeticXp:             0,
          cosmeticBadges:         [],
          sotsGlobalScore:        0,
          sotsRecent30Score:      0,
          trustScore:             0,
          verifiedRevenueTotal:   0,
          rweTotal:               0,
          rweAvgPerSession:       0,
          rweSessionCount:        0,
          rweCommittedSessionIds: [],
          totalVotes:             0,
          badgeSlots:             [],
          leagueSlots:            [],
          earnedRoles:            [],
        }).catch(() => null);
        talentProfilesReset++;
      }
    } catch (e) {
      console.warn('[resetForNewWave] TalentProfile reset error:', e?.message);
    }

    // 3. Remettre à zéro SellerTier
    let sellerTiersReset = 0;
    try {
      const tiers = await service.entities.SellerTier?.filter({}).catch(() => []);
      for (const st of (tiers || [])) {
        await service.entities.SellerTier.update(st.id, {
          tier:                  'C',
          commissionRate:        0.05,
          lifetimeSellerRevenue: 0,
          lifetimeEventCount:    0,
          tierUpgradedAt:        null,
          notes:                 `Reset wave — ${nowIso}`,
        }).catch(() => null);
        sellerTiersReset++;
      }
    } catch (e) {
      console.warn('[resetForNewWave] SellerTier reset error:', e?.message);
    }

    const totalDeleted = results.reduce((sum, r) => sum + (r.deleted || 0), 0);
    const failed = results.filter(r => !r.ok);

    return json(200, {
      ok: true,
      dryRun: false,
      executedAt: nowIso,
      totalDeleted,
      talentProfilesReset,
      sellerTiersReset,
      failed: failed.length > 0 ? failed : null,
      message: failed.length === 0
        ? `✅ Reset complet — ${totalDeleted} enregistrements supprimés, ${talentProfilesReset} TalentProfiles remis à zéro, ${sellerTiersReset} SellerTiers remis à zéro.`
        : `⚠️ Reset partiel — ${failed.length} entité(s) en erreur. Voir "failed".`,
      nextSteps: [
        '1. Mettre à jour STRIPE_SECRET_KEY dans les variables d\'env (vague test 2)',
        '2. Mettre à jour STRIPE_WEBHOOK_SECRET pour le nouvel endpoint',
        '3. Vérifier stripeWebhook et stripeWebhookReal pointent vers vague test 2',
        '4. Tester avec un premier paiement de 1$ pour valider la chaîne complète',
        '5. Renommer cette fonction en resetForNewWave (1er mai 2026)',
      ],
    });

  } catch (error) {
    console.error('[resetForNewWave]', error?.message);
    return json(500, { ok: false, error: error.message });
  }
});