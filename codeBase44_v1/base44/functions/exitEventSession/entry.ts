// deploy: v2
// exitEventSession — Check-out d'un acteur, calcul final de présence et éligibilité payout.
//
// APPELÉ QUAND
// - User clique "Je pars" dans Play
// - Session se ferme (completeEventSession auto-close toutes les présences actives)
// - Admin force la fermeture
//
// CE QUE CETTE FONCTION DÉCIDE
// Elle finalise le SessionPresence et calcule payoutEligible.
// C'est la décision la plus importante du cycle — elle détermine qui reçoit quoi.
//
// RÈGLE PAYOUT (artiste/organisateur)
// validationScore >= 70 AND durationMin >= 30 → payoutEligible = true
// validationScore >= 70 AND durationMin >= 15 → payoutEligible = true (pénalité 50%)
// sinon → payoutEligible = false (no-show)
//
// NOTE : l'audience n'a jamais payoutEligible = true.
// Leur présence alimente les métriques d'audience uniquement.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

// ── Seuils payout ─────────────────────────────────────────────────────────────
const PAYOUT_MIN_SCORE = 70; // Score minimum pour être eligible
const PAYOUT_MIN_DURATION = 30; // Minutes pour payout plein
const PAYOUT_PARTIAL_MIN = 15; // Minutes pour payout partiel (50%)

function json(status, body) {
 return new Response(JSON.stringify(body), {
 status,
 headers: { 'content-type': 'application/json' },
 });
}

function haversineM(lat1, lon1, lat2, lon2) {
 const R = 6_371_000;
 const toRad = (x) => (x * Math.PI) / 180;
 const dLat = toRad(lat2 - lat1);
 const dLon = toRad(lon2 - lon1);
 const a =
 Math.sin(dLat / 2) ** 2 +
 Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
 return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

Deno.serve(async (req) => {
 try {
 const base44 = createClientFromRequest(req);
 const user = await base44.auth.me();
 if (!user) return json(401, { error: 'Unauthorized' });

 const body = await req.json();
 const {
 sessionId,
 geoLat,
 geoLng,
 // Pour auto-close depuis completeEventSession : le service role appelle avec userId explicite
 targetUserId,
 isAutoClose = false,
 } = body;

 if (!sessionId) return json(400, { error: 'sessionId requis' });

 const service = base44.asServiceRole;
 const nowIso = new Date().toISOString();
 const now = Date.now();

 // L'appelant est soit l'user lui-même, soit un auto-close admin
 const actorId = targetUserId || user.id;

 // ── Trouver la présence active ────────────────────────────────────────────
 const presences = await service.entities.SessionPresence.filter({
 sessionId,
 userId: actorId,
 status: 'active',
 }).catch(() => []);

 const presence = presences?.[0];
 if (!presence) {
 return json(200, {
 ok: false,
 error: 'no_active_presence',
 message: 'Aucune présence active trouvée pour cette session.',
 });
 }

 // ── Calculer la durée ─────────────────────────────────────────────────────
 const checkInMs = new Date(presence.checkInAt).getTime();
 const durationMin = Math.round((now - checkInMs) / 60_000);

 // ── Valider le GPS de sortie ──────────────────────────────────────────────
 let isValidExit = true; // on commence optimiste
 let geoLatOut = geoLat ?? null;
 let geoLngOut = geoLng ?? null;

 // Auto-close : on marque comme valid (la session s'est terminée naturellement)
 if (isAutoClose) {
 isValidExit = true;
 } else if (durationMin < 2) {
 // Check-out instantané suspect (< 2 min) — invalider
 isValidExit = false;
 }

 // ── Ajouter +10 au score si durée >= 20 min ───────────────────────────────
 let finalScore = presence.validationScore || 0;
 if (durationMin >= 20) {
 finalScore = Math.min(finalScore + 10, 100);
 }

 // ── Calculer l'éligibilité payout ─────────────────────────────────────────
 const isArtistOrOrganizer = ['artist', 'organizer'].includes(presence.role);
 let payoutEligible = false;
 let payoutMultiplier = 0; // 0 | 0.5 | 1.0

 if (isArtistOrOrganizer) {
 if (finalScore >= PAYOUT_MIN_SCORE && durationMin >= PAYOUT_MIN_DURATION) {
 payoutEligible = true;
 payoutMultiplier = 1.0;
 } else if (finalScore >= PAYOUT_MIN_SCORE && durationMin >= PAYOUT_PARTIAL_MIN) {
 payoutEligible = true;
 payoutMultiplier = 0.5; // pénalité 50% pour présence courte
 } else {
 payoutEligible = false;
 payoutMultiplier = 0;
 }
 }

 // ── Mettre à jour la SessionPresence ──────────────────────────────────────
 const finalStatus = isAutoClose ? 'auto_closed' : 'completed';

 await service.entities.SessionPresence.update(presence.id, {
 checkOutAt: nowIso,
 geoLatOut,
 geoLngOut,
 durationMin,
 isValidExit,
 validationScore: finalScore,
 payoutEligible,
 status: finalStatus,
 autoClosedAt: isAutoClose ? nowIso : null,
 });

 console.log(
 `[exitEventSession] CHECK-OUT userId=${actorId} role=${presence.role} ` +
 `session=${sessionId} dur=${durationMin}min score=${finalScore} ` +
 `payout=${payoutEligible}(x${payoutMultiplier}) autoClose=${isAutoClose}`
 );

 // RWE-6 — Recalculer audienceCount sur la Session après check-out
 // Sans ceci, audienceCount ne descend jamais même si tout le monde est parti.
 // Idempotent : recalcul depuis SessionPresence (source canonique).
 try {
   const allPresences = await service.entities.SessionPresence.filter({ sessionId }).catch(() => []);
   const activePresences = (allPresences || []).filter(p => p.status === 'active');
   const audienceCount      = activePresences.filter(p => p.role === 'audience').length;
   const artistCount        = activePresences.filter(p => p.role === 'artist').length;
   const organizerCount     = activePresences.filter(p => p.role === 'organizer').length;
   const totalPresenceCount = audienceCount + artistCount + organizerCount;

   await service.entities.Session.update(sessionId, {
     audienceCount,
     artistCount,
     totalPresenceCount,
   }).catch(e => console.warn('[exitEventSession] RWE session update failed:', e?.message));

   console.log(`[exitEventSession] RWE sessionId=${sessionId} audience=${audienceCount} total=${totalPresenceCount}`);
 } catch (rweErr) {
   console.warn('[exitEventSession] RWE update non-fatal:', rweErr?.message);
 }

 return json(200, {
 ok: true,
 action: isAutoClose ? 'auto_closed' : 'checked_out',
 presenceId: presence.id,
 checkOutAt: nowIso,
 durationMin,
 validationScore: finalScore,
 payoutEligible,
 payoutMultiplier,
 status: finalStatus,
 summary: isArtistOrOrganizer
 ? payoutEligible
 ? `Présence validée. ${durationMin} min. Éligible au payout (×${payoutMultiplier}).`
 : `Présence insuffisante. ${durationMin} min, score ${finalScore}/100. Non éligible au payout.`
 : `Présence audience enregistrée. ${durationMin} min.`,
 });

 } catch (error) {
 console.error('[exitEventSession]', (error)?.message);
 return json(500, { error: (error).message });
 }
});