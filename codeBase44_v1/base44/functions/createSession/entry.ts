// deploy: v2
/**
 * createSession — deprecated for W2
 * Use joinQueue which creates/matches sessions safely.
 * Kept to avoid breaking references but blocks usage to prevent duplication.
 */

function jsonError(status, code, message, extra = {}) {
    return new Response(JSON.stringify({ ok: false, code, error: message, ...extra }), {
        status,
        headers: { 'content-type': 'application/json' }
    });
}

Deno.serve(async (_req) => {
    return jsonError(
        410,
        'DEPRECATED',
        'createSession est désactivé. Utilisez joinQueue pour QuickPlay (W2).'
    );
});