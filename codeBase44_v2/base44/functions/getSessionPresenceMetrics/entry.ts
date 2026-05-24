// deploy: v1
// getSessionPresenceMetrics — Métriques de présence d'une session.
//
// UTILISÉ PAR
// - Organisateur dans EventLobby (onglet Présence — à créer)
// - Dashboard sponsor (future)
// - completeEventSession pour calculer les outputs finaux
//
// RETOURNE
// {
// totalUnique, // personnes distinctes ayant été présentes
// currentActive, // actifs en ce moment
// peakSimultaneous, // maximum de simultanés sur la session
// avgDurationMin, // durée moyenne (personnes ayant check-out)
// presenceUnits, // totalUnique × avgDurationMin (metrique sponsor)
// byRole: { // breakdown par rôle
// artist: { count, avgDuration, payoutEligible },
// organizer: { count, avgDuration, payoutEligible },
// audience: { count, avgDuration },
// },
// palier, // ex: "Red Room 70" si audience >= 70
// }

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

function json(status, body) {
 return new Response(JSON.stringify(body), {
 status,
 headers: { 'content-type': 'application/json' },
 });
}

// Seuils de palier — "Red Room 30", "Red Room 70", etc.
// Ces paliers seront configurables par lieu dans une future version.
const PALIERS = [10, 30, 50, 70, 100, 150, 200, 300, 500];

function calcPalier(audienceCount) {
 const reached = PALIERS.filter(p => audienceCount >= p);
 if (reached.length === 0) return null;
 return String(reached[reached.length - 1]);
}

Deno.serve(async (req) => {
 try {
 const base44 = createClientFromRequest(req);
 const user = await base44.auth.me().catch(() => null);

 const body = await req.json().catch(() => ({}));
 const { sessionId, eventId } = body;

 if (!sessionId && !eventId) {
 return json(400, { error: 'sessionId ou eventId requis' });
 }

 const service = base44.asServiceRole;

 // ── Charger toutes les présences de la session ────────────────────────────
 const filter = sessionId ? { sessionId } : { eventId };
 const allPresences = await service.entities.SessionPresence.filter(filter).catch(() => []);

 if (!allPresences || allPresences.length === 0) {
 return json(200, {
 ok: true,
 totalUnique: 0,
 currentActive: 0,
 peakSimultaneous: 0,
 avgDurationMin: 0,
 presenceUnits: 0,
 byRole: {
 artist: { count: 0, avgDuration: 0, payoutEligibleCount: 0 },
 organizer: { count: 0, avgDuration: 0, payoutEligibleCount: 0 },
 audience: { count: 0, avgDuration: 0 },
 },
 palier,
 palierLabel,
 });
 }

 // ── Métriques de base ─────────────────────────────────────────────────────
 const validPresences = allPresences.filter(
 (p) =>
 p.status !== 'invalid' && p.isValidEntry !== false
 );

 const totalUnique = new Set(validPresences.map((p) => p.userId)).size;
 const currentActive = validPresences.filter((p) => p.status === 'active').length;

 // Durée moyenne (seulement les check-outs faits)
 const completed = validPresences.filter(
 (p) =>
 ['completed', 'auto_closed'].includes(p.status) && (p.durationMin || 0) > 0
 );
 const avgDurationMin = completed.length > 0
 ? Math.round(completed.reduce((s, p) => s + p.durationMin, 0) / completed.length)
 : 0;

 // Presence Units (métrique sponsor) : unique × avgDuration
 const presenceUnits = totalUnique * avgDurationMin;

 // ── Peak simultané ─────────────────────────────────────────────────────────
 // Reconstruction approximative du peak depuis coPresenceCountAtCheckin
 // (la valeur exacte nécessiterait une timeline minute par minute — futur)
 const maxCo = validPresences.reduce(
 (max, p) =>
 Math.max(max, (p.coPresenceCountAtCheckin || 0) + 1), // +1 = soi-même
 0
 );
 const peakSimultaneous = Math.max(maxCo, currentActive);

 // ── Breakdown par rôle ────────────────────────────────────────────────────
 const byRole = {
 artist: { count: 0, durations: [], payoutEligible: [] },
 organizer: { count: 0, durations: [], payoutEligible: [] },
 audience: { count: 0, durations: [], payoutEligible: [] },
 };

 for (const p of validPresences) {
 const role = p.role || 'audience';
 if (!byRole[role]) byRole[role] = { count: 0, durations: [], payoutEligible: [] };
 byRole[role].count++;
 if (p.durationMin) byRole[role].durations.push(p.durationMin);
 if (p.payoutEligible) byRole[role].payoutEligible.push(1);
 }

 const roleStats = {};
 for (const [role, data] of Object.entries(byRole)) {
 const avg = data.durations.length > 0
 ? Math.round(data.durations.reduce((a, b) => a + b, 0) / data.durations.length)
 : 0;
 roleStats[role] = {
 count: data.count,
 avgDuration: avg,
 ...(role !== 'audience' ? { payoutEligibleCount: data.payoutEligible.length } : {}),
 };
 }

 // ── Palier atteint ────────────────────────────────────────────────────────
 const audienceCount = totalUnique;
 const palier = calcPalier(audienceCount);

 // Récupérer le nom du lieu pour le label "Red Room 70"
 let venueName = '';
 if (sessionId) {
      const sess = await service.entities.Session.get(sessionId).catch(() => null);
 if (sess?.checkpointSystemId) {
 const cps = await service.entities.Checkpoint.filter({ systemId: sess.checkpointSystemId }).catch(() => []);
 venueName = cps?.[0]?.name || '';
 }
 }

 const palierLabel = palier && venueName ? `${venueName} ${palier}` : palier ? `Niveau ${palier}` : null;

 console.log(
 `[getSessionPresenceMetrics] session=${sessionId || 'event:' + eventId} ` +
 `unique=${totalUnique} active=${currentActive} peak=${peakSimultaneous} ` +
 `avgDur=${avgDurationMin}min PU=${presenceUnits} palier=${palierLabel}`
 );

 return json(200, {
 ok: true,
 totalUnique,
 currentActive,
 peakSimultaneous,
 avgDurationMin,
 presenceUnits,
 byRole: roleStats,
 palier,
 palierLabel,
 });

 } catch (error) {
 console.error('[getSessionPresenceMetrics]', (error)?.message);
 return json(500, { error: (error).message });
 }
});