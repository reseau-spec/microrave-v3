// deploy: v3 — DEPRECATED
// ─────────────────────────────────────────────────────────────────────────────
// Cette fonction est DÉPRÉCIÉE depuis le 28 mars 2026.
//
// RAISON : doublon divergent de applySessionToStats.
//   - Les deux fonctions écrivaient dans CheckpointDomainStats et
//     CheckpointStyleStats avec des schémas différents (sessionsCount vs volume,
//     score vs contribution), causant une corruption progressive des stats.
//   - applySessionToStats (v3) est la source canonique unique.
//   - transitionSession → COMPLETE appelle applySessionToStats en fire-and-forget.
//
// MIGRATION : aucune action requise. Les données existantes sont cohérentes.
//
// NE PAS SUPPRIMER ce fichier avant d'avoir vérifié qu'aucun appel direct
// n'existe en dehors de transitionSession.
// ─────────────────────────────────────────────────────────────────────────────
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me().catch(() => null);

  console.warn('[applySessionToCheckpointStats] DEPRECATED — use applySessionToStats instead', {
    calledBy: user?.id || 'unknown',
  });

  return json(410, {
    ok: false,
    code: 'DEPRECATED',
    message: 'applySessionToCheckpointStats is deprecated. Use applySessionToStats instead.',
    replacement: 'applySessionToStats',
  });
});