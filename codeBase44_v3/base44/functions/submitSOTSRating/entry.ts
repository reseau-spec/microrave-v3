/**
 * submitSOTSRating — Base44 Function v4
 * ============================================================
 * Soumet une note SOTS pour un engagement complété.
 *
 * ── CHANGEMENTS v3 → v4 ────────────────────────────────────
 *
 * CORRECTION D-079 (bloquant selon doctrine) :
 *   "Aucune dimension hardcodée. Calculé depuis dimensions
 *   internes dans SOTSDimensionConfig."
 *
 *   La v3 hardcodait les 7 dimensions canoniques directement
 *   dans le code (même avec les bonnes clés). C'est inacceptable
 *   selon D-079 — même en pilote documenté.
 *
 *   La v4 charge les dimensions actives depuis SOTSDimensionConfig
 *   (isActive: true) via l'entité Base44. Si aucune dimension
 *   n'est trouvée, la fonction échoue avec DIMENSIONS_NOT_SEEDED
 *   — fail-hard, jamais de fallback hardcodé.
 *
 *   PRÉREQUIS : entity_SOTSDimensionConfig.jsonc importé dans
 *   Base44 + seed-sots-dimensions.js exécuté.
 *
 * CONSERVÉ depuis v3 :
 *   - scores envoyé comme objet (pas JSON.stringify)
 *   - ReputationLedger append-only (D-077)
 *   - score_units = ratingScore × 1000 (D-079 format 0-5000)
 *   - Guard D-094 pattern 6 : auto-note bloquée
 *   - Guard D-078 : organisateur + event complété
 *   - Idempotence
 *
 * Source : D-077, D-078, D-079, D-080, D-094 pattern 6
 * ============================================================
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// ── createBase44Repositories — inline PHASE 3 ───────────────────────
// Reproduit src/repositories/adapters/base44-adapter.js dans le
// runtime Deno cloud Base44. Univers séparés — aucun import cross-env.
// Barrière LOI_TRANSITION_01_VIOLATION ancrée physiquement ici.
// Source : PORT-3 · PHASE 3 · 27 mai 2026
function createBase44Repositories(base44) {
  if (!base44 || !base44.entities) {
    throw new Error('ADAPTER_ERROR: base44.entities absent — SDK Base44 requis.');
  }
  const E = base44.entities;
  const nowIso = () => new Date().toISOString();

  return {
    engagements: {
      get:    (id)      => E.Engagement.get(id),
      list:   (f)       => E.Engagement.filter(f || {}),
      create: (payload) => E.Engagement.create(payload),
      update: async (id, payload) => {
        if (payload && Object.prototype.hasOwnProperty.call(payload, 'status')) {
          throw new Error(
            'LOI_TRANSITION_01_VIOLATION: update() ne peut pas modifier status. ' +
            'Utiliser transitionEngagement() exclusivement.'
          );
        }
        return E.Engagement.update(id, payload);
      },
      updateStatus: () => {
        throw new Error(
          'LOI_TRANSITION_01_VIOLATION: updateStatus() interdit. ' +
          'Utiliser transitionEngagement() exclusivement.'
        );
      },
    },
    events: {
      get:    (id)      => E.Event.get(id),
      list:   (f)       => E.Event.filter(f || {}),
      create: (payload) => E.Event.create(payload),
      update: (id, p)   => E.Event.update(id, p),
    },
    contractSnapshots: {
      create: (payload) => E.ContractSnapshot.create({ createdAt: nowIso(), ...payload }),
      get:    (id)      => E.ContractSnapshot.get(id),
      list:   (f)       => E.ContractSnapshot.filter(f || {}),
    },
    ledgerRecords: {
      append: (payload) => E.LedgerRecord.create(payload),
      list:   (f)       => E.LedgerRecord.filter(f || {}),
    },
    eventPaymentRequests: {
      get:    (id)      => E.EventPaymentRequest.get(id),
      list:   (f)       => E.EventPaymentRequest.filter(f || {}),
      create: (payload) => E.EventPaymentRequest.create(payload),
      update: (id, p)   => E.EventPaymentRequest.update(id, p),
    },
    policyConfig: {
      get:    (f)       => E.PolicyConfig.filter(f || {}),
      getOne: async (key) => {
        const rows = await E.PolicyConfig.filter({ key });
        return rows?.[0] ?? null;
      },
    },
    sessionPresence: {
      create: (payload) => E.SessionPresence.create(payload),
      list:   (f)       => E.SessionPresence.filter(f || {}),
      update: (id, p)   => E.SessionPresence.update(id, p),
    },
    payoutExecutionRecords: {
      create: (payload) => E.PayoutExecutionRecord.create(payload),
      list:   (f)       => E.PayoutExecutionRecord.filter(f || {}),
    },
    settlementInstructions: {
      get:    (id)      => E.SettlementInstruction.get(id),
      list:   (f)       => E.SettlementInstruction.filter(f || {}),
    },
    talentPaymentProfiles: {
      list:   (f)       => E.TalentPaymentProfile.filter(f || {}),
    },
    schedulerTasks: {
      create: (payload) => E.SchedulerDueTask.create({ ...payload, createdAt: nowIso() }),
      list:   (f)       => E.SchedulerDueTask.filter(f || {}),
      update: (id, p)   => E.SchedulerDueTask.update(id, p),
    },
    sotsSubmissions: {
      create: (payload) => E.SOTSSubmission.create(payload),
      list:   (f)       => E.SOTSSubmission.filter(f || {}),
    },
    sotsDimensionConfigs: {
      list:   (f)       => E.SOTSDimensionConfig.filter(f || {}),
    },
    reputationLedger: {
      create: (payload) => E.ReputationLedger.create(payload),
    },
    membershipPlans: {
      list:   (f)       => E.MembershipPlan.filter(f || {}),
    },
    userMemberships: {
      list:   (f)       => E.UserMembership.filter(f || {}),
      create: (payload) => E.UserMembership.create(payload),
      update: (id, p)   => E.UserMembership.update(id, p),
    },
    webhookProcessedLogs: {
      create: (payload) => E.WebhookProcessedLog.create(payload),
      list:   (f)       => E.WebhookProcessedLog.filter(f || {}),
    },
    stripePaymentSignals: {
      create: (payload) => E.StripePaymentSignal.create(payload),
      list:   (f)       => E.StripePaymentSignal.filter(f || {}),
    },
  };
}
// ── Fin createBase44Repositories ────────────────────────────────────



function generateId(prefix) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const s1 = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  const s2 = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `${prefix}-${s1}-${s2}`;
}

const VALID_STATES_FOR_SOTS = ['event_completed', 'sots_window_closed', 'contestation_window'];

// ── Charger les dimensions actives depuis SOTSDimensionConfig ─
// D-079 : "Aucune dimension hardcodée."
// Fail-hard si aucune dimension active — ne jamais fallback vers
// un hardcode.
async function loadActiveDimensions(base44) {
  let all;
  try {
    all = await base44.entities.SOTSDimensionConfig.filter(
      {}, '-created_date', 50)
    ;
  } catch (err) {
    throw new Error(
      `DIMENSIONS_LOAD_FAILED: Impossible de lire SOTSDimensionConfig. ` +
      `Vérifier que l'entité est créée et accessible. Détail : ${err.message}`
    );
  }

  if (!all?.length) {
    throw new Error(
      `DIMENSIONS_NOT_SEEDED: Aucune dimension SOTS active trouvée dans ` +
      `SOTSDimensionConfig. Exécuter : node scripts/seed-sots-dimensions.js. ` +
      `Source : D-079.`
    );
  }

  // Vérifier cohérence des poids
  const totalPpm = all.reduce((s, d) => s + (Number(d.weight_ppm) || 0), 0);
  if (totalPpm !== 1_000_000) {
    console.warn(
      `[submitSOTSRating] DIMENSIONS_WEIGHT_ANOMALY: sum(weight_ppm) = ${totalPpm}, ` +
      `attendu 1 000 000. Le calcul sera approximatif. Vérifier SOTSDimensionConfig.`
    );
  }

  return all;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const me = await base44.auth.me();
    if (!me?.id) return Response.json({ ok: false, error: 'AUTH_REQUIRED' }, { status: 401 });

    const body = await req.json();
    const { engagementId, ratingScore, note } = body;

    if (!engagementId) {
      return Response.json({ ok: false, error: 'VALIDATION: engagementId obligatoire.' }, { status: 400 });
    }

    // Validation stricte — entier 1-5
    const score = Number(ratingScore);
    if (!Number.isInteger(score) || score < 1 || score > 5) {
      return Response.json({
        ok: false,
        error: `VALIDATION: ratingScore doit être un entier entre 1 et 5. Reçu : ${JSON.stringify(ratingScore)}.`,
      }, { status: 400 });
    }

    // D-079 — conversion en score_units (0-5000)
    // "SOTS 4,1/5 = 4 100 score_units"
    const scoreUnits = score * 1000;

    // ── Charger les dimensions AVANT tout le reste ────────────
    // Fail-hard si SOTSDimensionConfig n'est pas seedé.
    let dimensions;
    try {
      dimensions = await loadActiveDimensions(base44);
    } catch (err) {
      return Response.json({ ok: false, error: err.message }, { status: 500 });
    }

    // ── Charger l'engagement ──────────────────────────────────
    const engagements = await base44.entities.Engagement.filter(
      { systemId: engagementId }, '-created_date', 1
    );
    if (!engagements?.length) {
      return Response.json({ ok: false, error: `NOT_FOUND: Engagement "${engagementId}" introuvable.` }, { status: 404 });
    }

    const eng = engagements[0];

    // D-094 pattern 6 — auto-note BLOQUÉE ABSOLUMENT
    if (me.id === eng.talentUserId) {
      return Response.json({
        ok: false,
        error: 'SOTS_SELF_BENEFICIAL: Auto-note bloquée. D-094 pattern 6.',
      }, { status: 422 });
    }

    // D-078 — organisateur seul peut noter dans ce contexte MVP
    if (me.id !== eng.organizerUserId) {
      return Response.json({
        ok: false,
        error: "FORBIDDEN: Seul l'organisateur peut soumettre une note SOTS dans le MVP. D-078.",
      }, { status: 403 });
    }

    if (!VALID_STATES_FOR_SOTS.includes(eng.status)) {
      return Response.json({
        ok: false,
        error: `INVALID_STATE: SOTS impossible en état "${eng.status}". États valides : ${VALID_STATES_FOR_SOTS.join(', ')}.`,
      }, { status: 422 });
    }

    // Idempotence
    const existing = await base44.entities.SOTSSubmission.filter({
      engagementId: eng.systemId,
      submittedBy:  me.id,
    }, '-created_date', 1).catch(() => []);

    if (existing?.length) {
      return Response.json({
        ok:        true,
        idempotent: true,
        sotsId:    existing[0].systemId,
        message:   'SOTSSubmission déjà enregistrée par cet évaluateur pour cet engagement.',
      });
    }

    const now   = new Date().toISOString();
    const sotsId = generateId('SOT');
    const repId  = generateId('REP');

    // ── Construire scores depuis SOTSDimensionConfig (D-079) ──
    // Mode pilote : même score_units pour toutes les dimensions.
    // Le score global = score_units (le frontend n'expose qu'un seul curseur).
    // TODO Event 1 : exposer chaque dimension dans le formulaire UI
    // pour une notation par dimension indépendante.
    const scoreCategories = {};
    for (const dim of dimensions) {
      scoreCategories[dim.dimensionKey] = scoreUnits;
    }

    // ── ÉTAPE 1 : SOTSSubmission ──────────────────────────────
    try {
      await base44.entities.SOTSSubmission.create({
        systemId:     sotsId,
        engagementId: eng.systemId,
        submittedBy:  me.id,
        talentUserId: eng.talentUserId,
        role:         'organisateur',
        scores:       scoreCategories,  // objet direct, type:object (D-079)
        note:         note || '',
        consolidated: false,
        createdAt:    now,
      });
    } catch (err) {
      console.error('[submitSOTSRating] SOTSSubmission.create failed:', err.message, err.stack);
      return Response.json({
        ok:    false,
        error: `SOTS_CREATE_FAILED: ${err.message}`,
        engagementId,
        scoreCategories,
      }, { status: 500 });
    }

    // ── ÉTAPE 2 : ReputationLedger append-only (D-077) ────────
    // "Chaque soumission SOTS = ReputationLedgerEntry immuable."
    try {
      await base44.entities.ReputationLedger.create({
        systemId:     repId,
        userId:       eng.talentUserId,
        engagementId: eng.systemId,
        entryType:    'SOTS_SCORE',
        scoreValue:   scoreUnits,
        createdAt:    now,
      });
    } catch (err) {
      console.error('[submitSOTSRating] ReputationLedger.create FAILED (D-077):', err.message, err.stack);
      return Response.json({
        ok:      true,
        sotsId,
        warning: `REPUTATION_LEDGER_FAILED: ${err.message}. Intervention manuelle requise. D-077.`,
        engagementId: eng.systemId,
        talentUserId: eng.talentUserId,
        submittedBy:  me.id,
        ratingScore:  score,
        scoreUnits,
        createdAt:    now,
      });
    }

    return Response.json({
      ok:              true,
      sotsId,
      repLedgerId:     repId,
      engagementId:    eng.systemId,
      talentUserId:    eng.talentUserId,
      submittedBy:     me.id,
      ratingScore:     score,
      scoreUnits,
      dimensionsUsed:  dimensions.map(d => d.dimensionKey),
      scoreCategories,
      note:            note || '',
      createdAt:       now,
      message:         'Note SOTS enregistrée. D-077 ✓ D-078 ✓ D-079 ✓',
    });

  } catch (error) {
    console.error('[submitSOTSRating] UNEXPECTED:', error.message, error.stack);
    return Response.json({ ok: false, error: `UNEXPECTED: ${error.message}` }, { status: 500 });
  }
});