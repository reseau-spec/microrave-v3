/**
 * assignLineupSlot.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * RESPONSABILITÉ
 *   Placer ou retirer un talent confirmé sur une case scène×plage du Lineup Board,
 *   puis recalculer TOUS les prix de ce talent sur l'événement.
 *
 * MODÈLE DE DONNÉES — lineupPlacements dans moodFilterSnapshot
 *   Clé  : "slotId:userId:sceneId:plageId"
 *   Valeur: { slotId, userId, sceneId, plageId, roleSystemId,
 *             assignedPrice, assignedStyleSystemIds, isPlaced }
 *
 * RÈGLES MÉTIER — TARIFICATION (source de vérité = BACKEND)
 *
 *   1. SOURCE DU TAUX HORAIRE (par ordre de priorité)
 *      a) TalentPricing.filter({ userId, roleSystemId }) → hourlyRate
 *      b) TalentPricing.filter({ userId }) → premier enregistrement avec hourlyRate
 *      c) TalentProfile.filter({ userId }) → pricingBase.hourlyRate
 *      d) Fallback : 80 CAD/h
 *      ⚠️  Ne jamais écrire dans TalentProfile pour stocker un prix.
 *          TalentPricing est l'entité dédiée aux tarifs.
 *
 *   2. BLOC DE PRÉSENCE
 *      On ne facture pas case par case.
 *      On facture la PRÉSENCE REQUISE du talent sur l'événement :
 *      - Trier tous les placements du talent par heure de début
 *      - Fusionner ceux séparés de ≤ MERGE_GAP_MIN (15 min) en un seul bloc
 *      - Un seul talent peut avoir plusieurs blocs dans la même journée
 *        (ex : matin + soir avec >15 min entre les deux)
 *
 *   3. MINIMUM FACTURABLE
 *      - 0,5 h (30 min) par bloc de présence, pas par case individuelle
 *      - Si le bloc dure 25 min → facturé 30 min
 *      - Si le bloc dure 45 min → facturé 45 min (pas de minimum supplémentaire)
 *
 *   4. RÉPARTITION INTRA-BLOC (multi-rôles)
 *      Le talent peut avoir des rôles différents sur des plages différentes,
 *      donc des taux horaires différents dans un même bloc.
 *      Formule :
 *        durationFactor = billableMin / totalWorkedMin
 *        linePrice(role) = hourlyRate(role) × (workedMin / 60) × durationFactor
 *      → Si billableMin == totalWorkedMin : rien ne change
 *      → Si minimum s'applique : toutes les lignes sont "gonflées" proportionnellement
 *      → Les rôles à fort taux gardent un poids relatif plus élevé
 *
 *   5. RECALCUL GLOBAL
 *      À chaque assign ou unassign, TOUS les placements du talent concerné
 *      sont recalculés. Le frontend ne doit pas être la source de vérité du prix.
 *      Le prix éventuel envoyé par le frontend est ignoré pour le calcul final,
 *      mais peut être utilisé comme override manuel si action = 'assign_manual'.
 *
 *   6. CONFLIT HORAIRE
 *      Un talent NE PEUT PAS être sur 2 slots différents à la MÊME plage.
 *      (même user + même plageId + slotId différent → HORAIRE_CONFLICT)
 *      Exception : remplacer le prix d'un placement existant (même slot + même scène).
 *
 * ÉVOLUTIONS FUTURES PRÉVUES
 *   - Minimum de déplacement (ex: minimum 2h si déplacement > X km)
 *   - Temps de setup/démontage facturé séparément
 *   - Tarifs fixedRate pour certains rôles (concert complet)
 *   - Approbation du talent avant confirmation du prix
 * ─────────────────────────────────────────────────────────────────────────────
 */

// deploy: v6
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';


// ─── PRIMES DE TARIFICATION v5 ───────────────────────────────────────────────
// Chaque prime s'applique au taux horaire de base AVANT le calcul du bloc de présence.
// Le prix contracté final = taux_base × produit_des_multiplicateurs × durée_billable
//
// Source de vérité : backend uniquement. Le frontend ne reçoit que le prix final.
//
// Primes implémentées (dans l'ordre d'application) :
//   P1 SOTS          : ×1.15 / ×1.10 / ×1.05 selon score
//   P2 Urgence       : ×1.25 si event dans < 72h
//   P3 Jour          : ×1.10 WE, ×1.20 férié QC
//   P4 Distance      : +0.70$/km au-delà de 10km
//   P5 Style match   : ×1.04 / ×1.08 / ×1.12 selon nb de styles communs
//   P6 XP/niveau     : +0.75% par niveau talent (plafonné à +15%)
//   P7 Saisonnalité  : ×1.15 en haute saison (juin–août, déc)
//   P8 Offre/demande : réservé futur (toujours ×1.0 pour l'instant)

const FERIES_QC = [
  '01-01', // Jour de l'An
  '04-18', // Vendredi Saint 2025 (approximatif — à gérer dynamiquement si besoin)
  '05-19', // Fête des Patriotes
  '06-24', // Fête Nationale QC
  '07-01', // Fête du Canada
  '09-01', // Fête du Travail
  '10-13', // Action de Grâces
  '12-25', // Noël
  '12-26', // Lendemain Noël
];

function isFerie(dateMs) {
  const d = new Date(dateMs);
  const key = `${String(d.getMonth() + 1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  return FERIES_QC.includes(key);
}

function isWeekend(dateMs) {
  const day = new Date(dateMs).getDay(); // 0=dim, 6=sam
  return day === 0 || day === 6;
}

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2
    + Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) * Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

/**
 * Calcule le multiplicateur total des primes pour un talent sur un event.
 * Retourne { multiplier, distanceFlatAdder, meta } pour traçabilité.
 */
function computePrimeMultiplier({
  sotsScore,          // Number 0–5 (TalentProfile.sotsGlobalScore ou sotsRecent30Score)
  xpLevel,            // Number (calculé depuis xpGlobal)
  eventDateMs,        // Number — timestamp du début de l'event
  eventCreatedAtMs,   // Number — timestamp création event (pour urgence)
  checkpointLatLng,   // { lat, lng } du lieu ou null
  talentLatLng,       // { lat, lng } profil du talent ou null
  talentStyleIds,     // string[] styles du talent
  slotStyleIds,       // string[] styles requis par le slot
}) {
  let multiplier = 1.0;
  const meta = {};

  // P1 — SOTS
  if (sotsScore != null && sotsScore > 0) {
    if (sotsScore >= 4.5)      { multiplier *= 1.15; meta.sots = '+15%'; }
    else if (sotsScore >= 4.0) { multiplier *= 1.10; meta.sots = '+10%'; }
    else if (sotsScore >= 3.5) { multiplier *= 1.05; meta.sots = '+5%'; }
    else                       { meta.sots = '0%'; }
  }

  // P2 — Urgence (event dans < 72h depuis sa création)
  if (eventDateMs && eventCreatedAtMs) {
    const leadTimeH = (eventDateMs - eventCreatedAtMs) / (1000 * 60 * 60);
    if (leadTimeH < 72) { multiplier *= 1.25; meta.urgence = '+25%'; }
  }

  // P3 — Jour de semaine / férié
  if (eventDateMs) {
    if (isFerie(eventDateMs))        { multiplier *= 1.20; meta.jour = '+20% (férié)'; }
    else if (isWeekend(eventDateMs)) { multiplier *= 1.10; meta.jour = '+10% (WE)'; }
  }

  // P4 — Distance (adder plat, pas multiplicateur — appliqué séparément)
  let distanceFlatAdder = 0;
  if (checkpointLatLng?.lat && talentLatLng?.lat) {
    const km = haversineKm(
      talentLatLng.lat, talentLatLng.lng,
      checkpointLatLng.lat, checkpointLatLng.lng
    );
    if (km > 10) {
      distanceFlatAdder = Math.round((km - 10) * 0.70 * 100) / 100;
      meta.distance = `+${distanceFlatAdder}$ (${Math.round(km)}km)`;
    }
  }

  // P5 — Style match
  const talentSet = new Set(asArray(talentStyleIds).map(s => String(s)));
  const slotSet   = new Set(asArray(slotStyleIds).map(s => String(s)));
  const matchCount = [...slotSet].filter(s => talentSet.has(s)).length;
  if (matchCount >= 3)      { multiplier *= 1.12; meta.styleMatch = '+12%'; }
  else if (matchCount >= 2) { multiplier *= 1.08; meta.styleMatch = '+8%'; }
  else if (matchCount >= 1) { multiplier *= 1.04; meta.styleMatch = '+4%'; }

  // P6 — XP / niveau (plafonné à +15%)
  if (xpLevel > 1) {
    const xpBonus = Math.min((xpLevel - 1) * 0.0075, 0.15);
    multiplier *= (1 + xpBonus);
    meta.xp = `+${Math.round(xpBonus * 100)}% (niv.${xpLevel})`;
  }

  // P7 — Saisonnalité (juin, juillet, août, décembre)
  if (eventDateMs) {
    const month = new Date(eventDateMs).getMonth(); // 0-indexed
    if ([5, 6, 7, 11].includes(month)) { multiplier *= 1.15; meta.saison = '+15%'; }
  }

  // P8 — Offre/demande locale (réservé futur)
  meta.offreDemande = 'N/A';

  return { multiplier: Math.round(multiplier * 1000) / 1000, distanceFlatAdder, meta };
}
const MERGE_GAP_MIN = 15;
const MIN_BILLABLE_MIN = 30;
const FALLBACK_RATE = 80;

function asArray(v) {
  return Array.isArray(v) ? v : [];
}

function parseSnapshot(raw) {
  if (!raw) return {};
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  if (typeof raw === 'object') return raw;
  return {};
}

function normalizeCandidate(c) {
  return {
    userId: c?.userId || null,
    styleSystemIds: asArray(c?.styleSystemIds),
    status: c?.status || 'pending',
    appliedAt: c?.appliedAt || c?.joinedAt || null,
    confirmedAt: c?.confirmedAt || null,
  };
}

function normalizeSlots(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(s => s?.slotId && s?.roleSystemId)
    .map(s => ({
      slotId: s.slotId,
      roleSystemId: s.roleSystemId,
      status: s.status || 'open',
      candidateUserId: s.candidateUserId || null,
      candidateStyleSystemIds: asArray(s.candidateStyleSystemIds),
      confirmedAt: s.confirmedAt || null,
      confirmedBy: s.confirmedBy || null,
      candidates: asArray(s.candidates).map(normalizeCandidate),
    }));
}

function makePlacementKey(slotId, userId, sceneId, plageId) {
  return `${slotId}:${userId}:${sceneId}:${plageId}`;
}

function dedupeByUserId(list) {
  const map = new Map();
  for (const item of asArray(list)) {
    if (!item?.userId) continue;
    const prev = map.get(item.userId);
    if (!prev) {
      map.set(item.userId, {
        userId: item.userId,
        styleSystemIds: asArray(item.styleSystemIds),
        status: item.status || 'pending',
        appliedAt: item.appliedAt || null,
        confirmedAt: item.confirmedAt || null,
      });
    } else {
      map.set(item.userId, {
        userId: item.userId,
        styleSystemIds: Array.from(
          new Set([...asArray(prev.styleSystemIds), ...asArray(item.styleSystemIds)])
        ),
        status:
          prev.status === 'confirmed' || item.status === 'confirmed'
            ? 'confirmed'
            : (prev.status || item.status || 'pending'),
        appliedAt: prev.appliedAt || item.appliedAt || null,
        confirmedAt: prev.confirmedAt || item.confirmedAt || null,
      });
    }
  }
  return Array.from(map.values());
}

function mergeSlotCandidates(slot, participants) {
  const fromSlot = asArray(slot.candidates).map(normalizeCandidate);
  const fromParticipants = asArray(participants)
    .filter(p => p?.userId && p.roleSystemId === slot.roleSystemId)
    .map(p => ({
      userId: p.userId,
      styleSystemIds: asArray(p.styleSystemIds),
      status: p.status === 'confirmed' ? 'confirmed' : 'pending',
      appliedAt: p.joinedAt || null,
      confirmedAt: p.confirmedAt || null,
    }));
  const fromPrimary = slot.candidateUserId
    ? [{
        userId: slot.candidateUserId,
        styleSystemIds: asArray(slot.candidateStyleSystemIds),
        status: slot.status === 'confirmed' ? 'confirmed' : 'pending',
        appliedAt: null,
        confirmedAt: slot.confirmedAt || null,
      }]
    : [];

  return dedupeByUserId([...fromSlot, ...fromParticipants, ...fromPrimary]);
}

function buildScheduleMap(lineupSchedule) {
  const map = {};
  for (const plage of asArray(lineupSchedule)) {
    if (!plage?.plageId || !plage?.timeStart || !plage?.timeEnd) continue;
    const startMs = new Date(plage.timeStart).getTime();
    const endMs = new Date(plage.timeEnd).getTime();
    if (isNaN(startMs) || isNaN(endMs) || endMs <= startMs) continue;
    map[plage.plageId] = {
      startMs,
      endMs,
      durationMin: (endMs - startMs) / 60000,
    };
  }
  return map;
}

function buildPresenceBlocks(talentPlacements, scheduleMap, rateMap) {
  const resolved = talentPlacements
    .map(p => {
      const timing = scheduleMap[p.plageId];
      if (!timing) return null;
      return {
        ...p,
        startMs: timing.startMs,
        endMs: timing.endMs,
        durationMin: timing.durationMin,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.startMs - b.startMs);

  if (!resolved.length) return [];

  const blocks = [];
  let current = {
    placements: [resolved[0]],
    startMs: resolved[0].startMs,
    endMs: resolved[0].endMs,
  };

  for (let i = 1; i < resolved.length; i++) {
    const p = resolved[i];
    const gapMin = (p.startMs - current.endMs) / 60000;
    if (gapMin <= MERGE_GAP_MIN) {
      current.placements.push(p);
      current.endMs = Math.max(current.endMs, p.endMs);
    } else {
      blocks.push(current);
      current = {
        placements: [p],
        startMs: p.startMs,
        endMs: p.endMs,
      };
    }
  }
  blocks.push(current);

  return blocks.map(block => {
    const requiredMin = (block.endMs - block.startMs) / 60000;
    const billableMin = Math.max(MIN_BILLABLE_MIN, requiredMin);
    const totalWorkedMin = block.placements.reduce((s, p) => s + p.durationMin, 0);
    const durationFactor = totalWorkedMin > 0 ? billableMin / totalWorkedMin : 1;

    const pricedPlacements = block.placements.map(p => {
      const hourlyRate = rateMap[p.plageId] ?? FALLBACK_RATE;
      const price = Math.round(hourlyRate * (p.durationMin / 60) * durationFactor);
      const allocationRatio = totalWorkedMin > 0 ? p.durationMin / totalWorkedMin : 1;
      return {
        ...p,
        assignedPrice: price,
        allocationRatio,
        billableMin,
        requiredMin,
        hourlyRate,
      };
    });

    return {
      ...block,
      requiredMin,
      billableMin,
      placements: pricedPlacements,
    };
  });
}

function repriceTalentPlacements(placements, targetUserId, scheduleMap, rateByRole, fallbackRate) {
  const talentEntries = Object.entries(placements).filter(([, p]) => p?.userId === targetUserId);
  if (!talentEntries.length) return 0;

  const rateMap = {};
  for (const [, p] of talentEntries) {
    const rate =
      p.roleSystemId && rateByRole[p.roleSystemId] != null
        ? rateByRole[p.roleSystemId]
        : fallbackRate;
    rateMap[p.plageId] = rate;
  }

  const talentPlacements = talentEntries.map(([key, p]) => ({ ...p, _key: key }));
  const blocks = buildPresenceBlocks(talentPlacements, scheduleMap, rateMap);

  let updated = 0;
  for (const block of blocks) {
    for (const p of block.placements) {
      if (p._key && placements[p._key]) {
        const existing = placements[p._key];

        // Si ce placement a un prix négocié (override manuel ou gratuité),
        // on PRÉSERVE son assignedPrice — on ne recalcule pas dessus.
        // Seule la meta technique (_pricingMeta) est mise à jour pour l'affichage.
        const shouldPreservePrice = existing.priceIsOverridden === true;

        placements[p._key] = {
          ...existing,
          assignedPrice: shouldPreservePrice ? existing.assignedPrice : p.assignedPrice,
          _pricingMeta: {
            hourlyRate:    p.hourlyRate,
            workedMin:     p.durationMin,
            requiredMin:   p.requiredMin,
            billableMin:   p.billableMin,
            allocationRatio: p.allocationRatio,
            blockSize:     block.placements.length,
          },
        };
        updated++;
      }
    }
  }
  return updated;
}

// ── buildCanonicalSlots (v6 fix — multi-talent) ──────────────────────────────
// CHANGEMENT : suppression de candidateUserId comme fallback prioritaire.
//
// Avant : primaryCandidateId = candidateUserId || premier isPlaced || premier confirmed
//   → le premier talent assigné devenait "primary" pour toujours
//   → si Sam accepte après James, James restait affiché (candidateUserId stale)
//   → slot.placements = placements de James uniquement
//   → LineupBoard calculait le prix avec slot.candidateUserId = James
//
// Après : pas de "primary". Un slot peut avoir N talents placés (B2B, groupes...).
//   → slot.candidates[].placements = placements réels de chaque candidat
//   → slot.isPlaced = true si AU MOINS UN candidat est placé
//   → slot.placements = TOUS les placements de TOUS les candidats placés
//   → slot.assignedPrice = SOMME des prix de tous les placés (budget total du slot)
//   → candidateUserId conservé en lecture pour rétrocompatibilité DB,
//     mais JAMAIS utilisé pour déterminer qui afficher
function buildCanonicalSlots({ slots, participants, placements }) {
  const placementValues = Object.values(placements || {});
  const getSlotUserPlacements = (slotId, userId) =>
    placementValues.filter(p => p?.slotId === slotId && p?.userId === userId);

  return asArray(slots).map(s => {
    const effectiveCandidates = mergeSlotCandidates(s, participants);

    // Enrichir chaque candidat avec ses placements réels
    const candidatesWithPlacement = effectiveCandidates.map(c => {
      const userPlacements = getSlotUserPlacements(s.slotId, c.userId);
      const isActuallyPlaced = userPlacements.length > 0;
      const resolvedStatus = c.status === 'confirmed' || isActuallyPlaced ? 'confirmed' : 'pending';
      return {
        ...c,
        status: resolvedStatus,
        isPlaced: isActuallyPlaced,
        placements: userPlacements,
        // Pour un candidat avec plusieurs placements (multi-scène) :
        // on expose le premier pour la rétrocompat, mais placements[] contient tout
        sceneId: userPlacements[0]?.sceneId ?? null,
        plageId: userPlacements[0]?.plageId ?? null,
        assignedStyleSystemIds: userPlacements[0]?.assignedStyleSystemIds ?? [],
        // Prix de CE candidat = somme de tous ses placements sur ce slot
        assignedPrice: userPlacements.reduce((s, p) => s + (Number(p.assignedPrice) || 0), 0) || null,
      };
    });

    // Tous les placements de tous les candidats placés sur ce slot
    const allSlotPlacements = candidatesWithPlacement
      .filter(c => c.isPlaced)
      .flatMap(c => c.placements);

    // Prix total du slot = somme de tous les placés (budget du slot pour l'organisateur)
    const slotTotalPrice = allSlotPlacements.reduce(
      (sum, p) => sum + (Number(p.assignedPrice) || 0), 0
    );

    return {
      slotId: s.slotId,
      roleSystemId: s.roleSystemId,
      status: s.status,
      // candidateUserId conservé pour rétrocompat lecture, mais ne gouverne plus l'affichage
      candidateUserId: s.candidateUserId,
      candidateStyleSystemIds: asArray(s.candidateStyleSystemIds),
      confirmedAt: s.confirmedAt || null,
      confirmedBy: s.confirmedBy || null,
      candidates: candidatesWithPlacement,
      // slot.isPlaced = vrai si au moins un talent est placé
      isPlaced: allSlotPlacements.length > 0,
      // slot.placements = tous les placements de tous les talents (multi-talent support)
      placements: allSlotPlacements,
      // slot.assignedPrice = budget total du slot (somme de tous les placés)
      assignedPrice: slotTotalPrice || null,
      // Nombre de talents placés sur ce slot (B2B indicator)
      placedCount: candidatesWithPlacement.filter(c => c.isPlaced).length,
    };
  });
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const {
      sessionId,
      slotId,
      targetUserId: explicitTargetUserId,
      sceneId,
      plageId,
      assignedStyleSystemIds,
      action,
      assignedPrice: frontendPriceOverride,  // Override manuel depuis le slider (peut être 0 = gratuit)
    } = await req.json();

    // L'override est valide si c'est un nombre >= 0 envoyé explicitement
    const hasPriceOverride = frontendPriceOverride != null && !isNaN(Number(frontendPriceOverride));
    const priceOverrideValue = hasPriceOverride ? Math.round(Number(frontendPriceOverride) * 100) / 100 : null;

    if (!sessionId || !slotId) {
      return Response.json({ error: 'sessionId and slotId required' }, { status: 400 });
    }

    const service = base44.asServiceRole;
    console.log('[assignLineupSlot] START', {
      sessionId,
      slotId,
      explicitTargetUserId,
      sceneId,
      plageId,
      action,
      userId: user.id,
    });

    const sessions = await service.entities.Session.filter({ id: sessionId });
    const session = sessions?.[0];
    if (!session) {
      return Response.json({ error: 'Session not found' }, { status: 404 });
    }

    let authId = session.hostUserId || null;
    if (!authId && session.eventId) {
      const events = await service.entities.Event.filter({ id: session.eventId }).catch(() => []);
      authId = events?.[0]?.organizerId || events?.[0]?.organizerUserId || null;
    }
    if (!authId || authId !== user.id) {
      return Response.json({ error: 'Forbidden', code: 'NOT_ORGANIZER' }, { status: 403 });
    }

    const slots = normalizeSlots(asArray(session.slots));
    const participants = asArray(session.participants);

    let realSlotId = slotId;
    let targetUserId = explicitTargetUserId || null;

    if (slotId.includes(':')) {
      const parts = slotId.split(':');
      realSlotId = parts[0];
      if (!targetUserId) {
        targetUserId = parts[1] || null;
      }
    }

    const slot = slots.find(s => s.slotId === realSlotId);
    if (!slot) {
      return Response.json({ error: 'Slot not found' }, { status: 404 });
    }

    const isUnassign = action === 'unassign' || (!sceneId && !plageId);

    slot.candidates = mergeSlotCandidates(slot, participants);

    const existingSnap = parseSnapshot(session.moodFilterSnapshot);
    const placements = { ...(existingSnap.lineupPlacements || {}) };

    if (isUnassign && !targetUserId) {
      if (sceneId && plageId) {
        const candidatesAtCell = Object.values(placements).filter(
          p =>
            p?.slotId === realSlotId &&
            p?.sceneId === sceneId &&
            p?.plageId === plageId
        );

        const uniqueUsers = Array.from(new Set(candidatesAtCell.map(p => p?.userId).filter(Boolean)));

        if (uniqueUsers.length === 1) {
          targetUserId = uniqueUsers[0];
        } else if (uniqueUsers.length > 1) {
          return Response.json(
            {
              error: 'Multiple target users found for this cell',
              code: 'TARGET_USER_AMBIGUOUS',
              realSlotId,
              sceneId,
              plageId,
              targetUserIds: uniqueUsers,
            },
            { status: 409 }
          );
        }
      }

      if (!targetUserId) {
        const slotPlacements = Object.values(placements).filter(p => p?.slotId === realSlotId);
        const uniqueUsers = Array.from(new Set(slotPlacements.map(p => p?.userId).filter(Boolean)));
        if (uniqueUsers.length === 1) {
          targetUserId = uniqueUsers[0];
        }
      }
    }

    if (!isUnassign) {
      if (targetUserId) {
        const cand = slot.candidates.find(c => c.userId === targetUserId);
        const partConfirmed = participants.find(
          p => p.userId === targetUserId && p.status === 'confirmed'
        );

        if (!cand && !partConfirmed) {
          return Response.json(
            { error: 'Candidate not confirmed', code: 'CANDIDATE_NOT_CONFIRMED' },
            { status: 409 }
          );
        }

        if (!cand && partConfirmed) {
          slot.candidates.push({
            userId: targetUserId,
            styleSystemIds: asArray(partConfirmed.styleSystemIds),
            status: 'confirmed',
            appliedAt: partConfirmed.joinedAt || null,
            confirmedAt: partConfirmed.confirmedAt || null,
          });
        } else if (cand && cand.status !== 'confirmed' && partConfirmed) {
          cand.status = 'confirmed';
        }
      } else {
        const confirmedCand =
          slot.candidates.find(c => c.status === 'confirmed') ||
          participants.find(
            p => p.roleSystemId === slot.roleSystemId && p.status === 'confirmed'
          );

        if (!confirmedCand && slot.status !== 'confirmed') {
          return Response.json(
            { error: 'Slot must be confirmed', code: 'SLOT_NOT_CONFIRMED' },
            { status: 409 }
          );
        }

        targetUserId = confirmedCand?.userId || slot.candidateUserId || null;
      }
    }

    if (!targetUserId) {
      return Response.json(
        {
          error: 'Target user unresolved',
          code: 'TARGET_USER_UNRESOLVED',
          realSlotId,
          sceneId,
          plageId,
        },
        { status: 409 }
      );
    }

    if (isUnassign) {
      let removed = 0;

      if (sceneId && plageId) {
        const placementKey = makePlacementKey(realSlotId, targetUserId, sceneId, plageId);
        if (placements[placementKey]) {
          delete placements[placementKey];
          removed++;
        }
      } else {
        for (const key of Object.keys(placements)) {
          const p = placements[key];
          if (p?.slotId === realSlotId && p?.userId === targetUserId) {
            delete placements[key];
            removed++;
          }
        }
      }

      if (removed === 0) {
        return Response.json(
          {
            error: 'Placement not found for unassign',
            code: 'PLACEMENT_NOT_FOUND',
            realSlotId,
            targetUserId,
            sceneId,
            plageId,
          },
          { status: 409 }
        );
      }
    } else {
      const conflict = Object.entries(placements).find(
        ([, p]) =>
          p?.plageId === plageId &&
          p?.userId === targetUserId &&
          !(p.slotId === realSlotId && p.sceneId === sceneId)
      );

      if (conflict) {
        return Response.json(
          {
            error: 'Conflit horaire',
            code: 'HORAIRE_CONFLICT',
            conflictSlotId: conflict[1].slotId,
          },
          { status: 409 }
        );
      }

      const placementKey = makePlacementKey(realSlotId, targetUserId, sceneId, plageId);
      placements[placementKey] = {
        slotId: realSlotId,
        userId: targetUserId,
        sceneId,
        plageId,
        roleSystemId: slot.roleSystemId,
        assignedPrice: null,
        assignedStyleSystemIds: asArray(assignedStyleSystemIds),
        isPlaced: true,
      };
    }


    // ── Tarification v5 — taux de base + primes ──────────────────────────────
    const [pricingRows, profileRows, checkpointRows] = await Promise.all([
      service.entities.TalentPricing.filter({ userId: targetUserId }).catch(() => []),
      service.entities.TalentProfile.filter({ userId: targetUserId }).catch(() => []),
      // Checkpoint du lieu pour la prime distance
      session.checkpointSystemId
        ? service.entities.Checkpoint.filter({ systemId: session.checkpointSystemId }).catch(() => [])
        : Promise.resolve([]),
    ]);

    const talentProfile = profileRows?.[0] || null;

    // Taux de base par rôle
    const rateByRole = {};
    for (const row of asArray(pricingRows)) {
      if (row?.roleSystemId && row?.hourlyRate != null && row.hourlyRate !== '') {
        rateByRole[row.roleSystemId] = Number(row.hourlyRate);
      }
    }
    const profileRate  = Number(talentProfile?.pricingBase?.hourlyRate) || null;
    const fallbackRate = profileRate || FALLBACK_RATE;

    // Données pour les primes
    const checkpoint    = checkpointRows?.[0] || null;
    const sotsScore     = Number(talentProfile?.sotsRecent30Score || talentProfile?.sotsGlobalScore) || 0;
    const xpGlobal      = Number(talentProfile?.xpGlobal) || 0;
    const xpLevel       = Math.floor(Math.sqrt(xpGlobal / 100)) + 1;

    // GPS talent depuis primaryCheckpointId ou checkpoints actifs
    const talentCheckpointId = talentProfile?.primaryCheckpointId;
    let talentLatLng = null;
    if (talentCheckpointId) {
      const tc = await service.entities.Checkpoint.filter({ id: talentCheckpointId }).catch(() => []);
      if (tc?.[0]?.geoLat && tc?.[0]?.geoLng) {
        talentLatLng = { lat: Number(tc[0].geoLat), lng: Number(tc[0].geoLng) };
      }
    }

    const checkpointLatLng = (checkpoint?.geoLat && checkpoint?.geoLng)
      ? { lat: Number(checkpoint.geoLat), lng: Number(checkpoint.geoLng) }
      : null;

    // Date event pour primes temporelles
    let eventDateMs = null;
    let eventCreatedAtMs = null;
    let eventScenesForSnap = [];
    let eventScheduleForSnap = [];
    if (session.eventId) {
      const evRows = await service.entities.Event.filter({ id: session.eventId }).catch(() => []);
      const ev = evRows?.[0];
      if (ev?.dateStart) eventDateMs = new Date(ev.dateStart).getTime();
      if (ev?.created_date) eventCreatedAtMs = new Date(ev.created_date).getTime();
      // v-fix : capturer event.scenes/schedule pour fallback snapshot
      if (Array.isArray(ev?.scenes))   eventScenesForSnap   = ev.scenes;
      if (Array.isArray(ev?.schedule)) eventScheduleForSnap = ev.schedule;
    }

    // Styles requis par le slot (pour style match)
    const slotStyleIds = asArray(slot.candidateStyleSystemIds);
    const talentStyleIds = asArray(talentProfile?.primaryStyleSystemIds);

    // Calcul du multiplicateur global des primes
    const { multiplier: primeMultiplier, distanceFlatAdder, meta: primeMeta } = computePrimeMultiplier({
      sotsScore,
      xpLevel,
      eventDateMs,
      eventCreatedAtMs,
      checkpointLatLng,
      talentLatLng,
      talentStyleIds,
      slotStyleIds,
    });

    // Appliquer les primes sur rateByRole et fallbackRate
    const primedRateByRole = {};
    for (const [roleId, rate] of Object.entries(rateByRole)) {
      primedRateByRole[roleId] = Math.round(rate * primeMultiplier * 100) / 100;
    }
    const primedFallbackRate = Math.round(fallbackRate * primeMultiplier * 100) / 100;

    console.log('[assignLineupSlot] PRIMES v5', {
      targetUserId,
      sotsScore,
      xpLevel,
      primeMultiplier,
      distanceFlatAdder,
      primeMeta,
      baseRates: rateByRole,
      primedRates: primedRateByRole,
    });

    const scheduleMap = buildScheduleMap(asArray(existingSnap.lineupSchedule));
    const updatedCount = repriceTalentPlacements(
      placements,
      targetUserId,
      scheduleMap,
      primedRateByRole,
      primedFallbackRate
    );

    // Prime distance : adder plat ajouté au total du talent (non lié à un rôle spécifique)
    if (distanceFlatAdder > 0) {
      const talentKeys = Object.keys(placements).filter(k => placements[k]?.userId === targetUserId && placements[k]?.isPlaced);
      if (talentKeys.length > 0) {
        // Distribuer l'adder sur le premier placement (ou proportionnellement)
        const firstKey = talentKeys[0];
        placements[firstKey] = {
          ...placements[firstKey],
          assignedPrice: Math.round(((placements[firstKey].assignedPrice || 0) + distanceFlatAdder) * 100) / 100,
          _distanceAdder: distanceFlatAdder,
        };
      }
    }

    // Stocker les méta-primes pour audit
    for (const key of Object.keys(placements)) {
      if (placements[key]?.userId === targetUserId && placements[key]?.isPlaced) {
        placements[key] = {
          ...placements[key],
          _primeMeta: primeMeta,
          _primeMultiplier: primeMultiplier,
        };
      }
    }

    // ── Override de prix manuel (slider organisateur) ────────────────────────
    // Si l'organisateur a ajusté le prix via le slider (y compris à 0$ = gratuit),
    // on remplace le prix calculé par les primes PAR SEULEMENT LE PLACEMENT COURANT.
    //
    // RÈGLE CRITIQUE : l'override s'applique UNIQUEMENT à la plage/scène en cours.
    // Les placements précédents du talent gardent leur propre prix negotié.
    // Sans cette règle, placer un talent à 100$ sur "Closer" écraserait son 0$
    // précédemment négocié sur "Warmup".
    if (!isUnassign && hasPriceOverride && sceneId && plageId) {
      const currentPlacementKey = Object.keys(placements).find(
        k => placements[k]?.userId === targetUserId
          && placements[k]?.plageId === plageId
          && placements[k]?.sceneId === sceneId
          && placements[k]?.isPlaced
      );

      if (currentPlacementKey) {
        const calculatedForThisPlacement = placements[currentPlacementKey].assignedPrice;
        placements[currentPlacementKey] = {
          ...placements[currentPlacementKey],
          assignedPrice:     priceOverrideValue,
          priceIsOverridden: true,
          priceOverridedAt:  new Date().toISOString(),
          calculatedPrice:   calculatedForThisPlacement, // prix de référence marché
        };
        console.log(
          `[assignLineupSlot] PRICE_OVERRIDE_SCOPED` +
          ` userId=${targetUserId}` +
          ` plage=${plageId} scene=${sceneId}` +
          ` override=${priceOverrideValue}` +
          ` was=${calculatedForThisPlacement}`
        );
      }
    } else if (!isUnassign && hasPriceOverride && (!sceneId || !plageId)) {
      // Fallback sans coordonnées précises — n'overrider que le DERNIER placement ajouté
      const talentKeys = Object.keys(placements)
        .filter(k => placements[k]?.userId === targetUserId && placements[k]?.isPlaced)
        .sort((a, b) => {
          // Trier par priceOverridedAt ou par ordre d'insertion (desc) pour prendre le plus récent
          const dateA = placements[a]?.priceOverridedAt || '';
          const dateB = placements[b]?.priceOverridedAt || '';
          return dateB.localeCompare(dateA);
        });
      if (talentKeys.length > 0) {
        const key = talentKeys[0];
        const calc = placements[key].assignedPrice;
        placements[key] = {
          ...placements[key],
          assignedPrice:     priceOverrideValue,
          priceIsOverridden: true,
          priceOverridedAt:  new Date().toISOString(),
          calculatedPrice:   calc,
        };
      }
    }

    console.log('[assignLineupSlot] REPRICED v5', {
      targetUserId,
      updatedCount,
      primedRateByRole,
      primedFallbackRate,
      hasPriceOverride,
      priceOverrideValue,
      placementCount: Object.keys(placements).length,
    });

    // ── Correction 2 : écrire canonicalSlots en DB (pas slots bruts) ──────────
    // Avant : session.slots en DB = normalizeSlots() sans candidates[].placements
    //   → reload de page = budget 0$, programme vide
    // Après : session.slots en DB = canonicalSlots avec placements complets
    //   → DB et réponse HTTP sont identiques
    const canonicalSlotsForDB = buildCanonicalSlots({ slots, participants, placements });

    // v-fix : préserver lineupScenes et lineupSchedule dans le snapshot
    // Si existingSnap les contient déjà → les garder (spread)
    // Sinon → fallback sur event.scenes/schedule (cas d'une session ouverte
    // depuis Events.jsx sans scenes dans le body d'openEventLobby)
    const scenesForSnap   = asArray(existingSnap.lineupScenes).length > 0
      ? existingSnap.lineupScenes
      : eventScenesForSnap;
    const scheduleForSnap = asArray(existingSnap.lineupSchedule).length > 0
      ? existingSnap.lineupSchedule
      : eventScheduleForSnap;

    await service.entities.Session.update(sessionId, {
      slots: canonicalSlotsForDB,
      moodFilterSnapshot: {
        ...existingSnap,
        lineupPlacements: placements,
        ...(scenesForSnap.length   > 0 ? { lineupScenes:   scenesForSnap }   : {}),
        ...(scheduleForSnap.length > 0 ? { lineupSchedule: scheduleForSnap } : {}),
      },
    });

    // ── Mise à jour du budget réel sur Event ─────────────────────────────────
    // Le budget de l'event = somme des assignedPrice de tous les placements actifs
    // (isPlaced === true). C'est la source de vérité pour les paiements.
    // Le "Budget estimé" saisi à la création est écrasé par cette valeur réelle
    // dès le premier placement.
    if (session.eventId) {
      const realBudget = Object.values(placements)
        .filter(p => p?.isPlaced === true && p?.assignedPrice != null)
        .reduce((sum, p) => sum + Number(p.assignedPrice), 0);

      await service.entities.Event.update(session.eventId, {
        budget: realBudget,
      });

      console.log(`[assignLineupSlot] EVENT_BUDGET_UPDATED eventId=${session.eventId} budget=${realBudget}`);
    }

    // ── Notification email au talent ──────────────────────────────────────────
    // Notifier le talent de son placement dans le programme, avec le prix proposé.
    // Cette notification est non-fatale.
    if (!isUnassign && session.eventId && targetUserId) {
      try {
        const [talentUsers, eventRows] = await Promise.all([
          service.entities.User.filter({ id: targetUserId }).catch(() => []),
          session.eventId
            ? service.entities.Event.filter({ id: session.eventId }).catch(() => [])
            : Promise.resolve([]),
        ]);
        const talentUser = talentUsers?.[0];
        const eventData = eventRows?.[0];

        if (talentUser?.email && eventData) {
          // Calculer le prix final pour ce talent
          const talentPlacementKeys = Object.keys(placements).filter(
            k => placements[k]?.userId === targetUserId && placements[k]?.isPlaced
          );
          const totalPrice = talentPlacementKeys.reduce(
            (sum, k) => sum + (Number(placements[k]?.assignedPrice) || 0), 0
          );
          const isGratuit = totalPrice === 0;
          const isOverridden = talentPlacementKeys.some(k => placements[k]?.priceIsOverridden);

          let prixLabel = isGratuit
            ? 'Bénévolat (gratuit)'
            : `${totalPrice} $ CAD${isOverridden ? ' (tarif négocié)' : ''}`;

          await service.integrations.Core.SendEmail({
            to:        talentUser.email,
            subject:   `🎵 Proposition de placement — ${eventData.title}`,
            body:      `Bonjour,

Vous avez été placé(e) dans le programme de l'événement "${eventData.title}".

Conditions proposées :
  Rémunération : ${prixLabel}
  Nombre de plages : ${talentPlacementKeys.length}

Consultez votre profil pour accepter ou discuter les conditions.

Micro Rave`,
            from_name: 'Micro Rave',
          });
          console.log(`[assignLineupSlot] TALENT_NOTIFIED userId=${targetUserId} price=${totalPrice} isGratuit=${isGratuit}`);
        }
      } catch (notifErr) {
        console.warn('[assignLineupSlot] talent notification failed (non-fatal):', notifErr?.message);
      }
    }

    console.log('[assignLineupSlot] DONE');

    // canonicalSlotsForDB already computed above — reuse it
    const totalConfirmed = canonicalSlotsForDB.flatMap(s =>
      asArray(s.candidates).filter(c => c.status === 'confirmed')
    ).length;

    const totalPlacements = canonicalSlotsForDB.flatMap(s =>
      asArray(s.candidates).flatMap(c => asArray(c.placements))
    ).length;

    console.log('[assignLineupSlot] RETURN', {
      slotsCount: canonicalSlotsForDB.length,
      totalConfirmed,
      totalPlacements,
    });

    return Response.json({
      ok: true,
      action: isUnassign ? 'unassigned' : 'assigned',
      session: {
        id: sessionId,
        slots: canonicalSlotsForDB,   // same object written to DB → no divergence
        // v-fix : retourner les scènes/schedule APRÈS mise à jour du snapshot
        // existingSnap.lineupScenes était stale (lu avant l'update) → vide au premier appel
        // scenesForSnap/scheduleForSnap contiennent les valeurs correctes (event.scenes en fallback)
        scenes:   scenesForSnap,
        schedule: scheduleForSnap,
      },
    });
  } catch (error) {
    console.error('[assignLineupSlot]', error?.message || error);
    return Response.json(
      { error: error?.message || 'Unknown error' },
      { status: 500 }
    );
  }
});