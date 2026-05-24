/**
 * createEngagement — Base44 Function
 * ============================================================
 * Crée un Event + un Engagement en état initial `placed`.
 *
 * CORRECTIONS AUDIT #005 #006 #007 #012 :
 *   #012 — organizerUserId = user.id (auth) — JAMAIS le payload client
 *   #005 — tauxPpm résolu depuis MembershipPlan de l'organisateur
 *          (fallback Freemium 120000 si aucun plan actif)
 *   #006 — champ écrit : depositCents (conforme schéma Engagement.jsonc)
 *   #007 — roleMetier transmis par le formulaire (non plus hardcodé 'DJ')
 *
 * WATERFALL (D-038 · LOI LEDGER-02) :
 *   tauxPpm depuis MembershipPlan → commissionMrCents
 *   deposit_ratio_ppm depuis PolicyConfig → depositCents
 *   talentNetCents = cachetSigneCents − commissionMrCents
 *   balanceCents = cachetSigneCents − depositCents
 *
 * Source : D-016, D-019-A, D-027, D-038, OS V15
 * ============================================================
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// ── Helpers ──────────────────────────────────────────────────

function generateId(prefix: string): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const seg1 = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  const seg2 = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `${prefix}-${seg1}-${seg2}`;
}

function floorPpm(amountCents: number, ratePpm: number): number {
  return Math.floor(amountCents * ratePpm / 1_000_000);
}

// ── Main ─────────────────────────────────────────────────────

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // ── Authentification — CORRECTION #012 ───────────────────
    // organizerUserId = utilisateur authentifié uniquement.
    // Jamais depuis le payload client (vecteur d'usurpation d'identité).
    const me = await base44.auth.me();
    if (!me?.id) {
      return Response.json({ ok: false, error: 'AUTH_REQUIRED: utilisateur non authentifié.' }, { status: 401 });
    }
    const organizerUserId = me.id;

    const body = await req.json();
    const {
      talentUserId,
      eventName,
      eventDate,
      venueAddress,
      cachetSigneCents,
      roleMetier,     // #007 — transmis par CreateEngagement.jsx
      description,
    } = body;

    // ── Validation des champs obligatoires ────────────────────
    if (!talentUserId)              return Response.json({ ok: false, error: 'VALIDATION: talentUserId obligatoire.' }, { status: 400 });
    if (!eventName)                 return Response.json({ ok: false, error: 'VALIDATION: eventName obligatoire.' }, { status: 400 });
    if (!eventDate)                 return Response.json({ ok: false, error: 'VALIDATION: eventDate obligatoire.' }, { status: 400 });
    if (!venueAddress)              return Response.json({ ok: false, error: 'VALIDATION: venueAddress obligatoire.' }, { status: 400 });
    if (!Number.isInteger(cachetSigneCents) || cachetSigneCents <= 0) {
      return Response.json({ ok: false, error: 'VALIDATION: cachetSigneCents doit être un entier positif en cents.' }, { status: 400 });
    }

    // ── CORRECTION #005 — tauxPpm depuis MembershipPlan ──────
    // Résout le plan actif de l'organisateur → commission_rate_ppm.
    // Fallback : Freemium 120 000 ppm (12%).
    let tauxPpm = 120_000; // fallback Freemium
    try {
      const memberships = await base44.entities.UserMembership.filter({
        userId: organizerUserId,
        status: 'active',
      }, '-created_date', 1);

      if (memberships?.length > 0 && memberships[0].planId) {
        const plans = await base44.entities.MembershipPlan.filter({
          id: memberships[0].planId,
          is_active: true,
        }, '-created_date', 1);

        if (plans?.length > 0 && plans[0].commission_rate_ppm) {
          tauxPpm = Number(plans[0].commission_rate_ppm);
        }
      }
    } catch (_) {
      // Fallback silencieux — Freemium garanti
    }

    // ── Ratio dépôt depuis PolicyConfig ──────────────────────
    let depositRatioPpm = 200_000; // fallback 20%
    try {
      const configs = await base44.entities.PolicyConfig.filter(
        { key: 'deposit_ratio_ppm' }, '-created_date', 1
      );
      if (configs?.length > 0) depositRatioPpm = Number(configs[0].value);
    } catch (_) {}

    // ── Calcul waterfall (D-038) ──────────────────────────────
    const commissionMrCents = floorPpm(cachetSigneCents, tauxPpm);
    const talentNetCents    = cachetSigneCents - commissionMrCents;
    const depositCents      = floorPpm(cachetSigneCents, depositRatioPpm);
    const balanceCents      = cachetSigneCents - depositCents;

    // ── Génération des IDs ────────────────────────────────────
    const eventSystemId      = generateId('EVT');
    const engagementSystemId = generateId('ENG');
    const now                = new Date().toISOString();

    // ── Création Event ────────────────────────────────────────
    const event = await base44.entities.Event.create({
      systemId:          eventSystemId,
      organizerUserId,
      name:              eventName,
      venue:             venueAddress,
      scheduledStartAt:  eventDate,
      status:            'draft',
      createdAt:         now,
    });

    // ── Création Engagement ───────────────────────────────────
    // CORRECTION #006 : champ `depositCents` (conforme Engagement.jsonc)
    // CORRECTION #007 : roleMetier depuis le payload, fallback 'NON_SPECIFIE'
    const engagement = await base44.entities.Engagement.create({
      systemId:            engagementSystemId,
      eventId:             eventSystemId,
      talentUserId,
      organizerUserId,
      roleMetier:          roleMetier || 'NON_SPECIFIE',
      cachetSigneCents,
      tauxPpm,
      commissionMrCents,
      talentNetCents,
      depositCents,        // #006 — champ canonique du schéma
      balanceCents,
      prixVenduClientCents: cachetSigneCents,
      currency:            'cad',
      status:              'placed',
      description:         description || '',
      createdAt:           now,
    });

    return Response.json({
      ok:           true,
      engagementId: engagementSystemId,
      eventId:      eventSystemId,
      engagement: {
        systemId:         engagementSystemId,
        status:           'placed',
        cachetSigneCents,
        tauxPpm,
        commissionMrCents,
        talentNetCents,
        depositCents,
        balanceCents,
        organizerUserId,
        talentUserId,
        roleMetier:       roleMetier || 'NON_SPECIFIE',
      },
    });

  } catch (error) {
    console.error('[createEngagement]', error.message);
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});