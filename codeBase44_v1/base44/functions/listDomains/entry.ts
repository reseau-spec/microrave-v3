// deploy: v2
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me().catch(() => null);

        if (!user) {
            return new Response(JSON.stringify({ 
                ok: false, 
                error: 'Unauthenticated' 
            }), { 
                status: 401, 
                headers: { 'content-type': 'application/json' } 
            });
        }

        const domains = [
            { key: 'music', label: 'Music', icon: '🎵' },
            { key: 'humour', label: 'Humour', icon: '🎭' },
            { key: 'photo', label: 'Photo', icon: '📸' },
            { key: 'video', label: 'Video', icon: '🎥' },
            { key: 'food', label: 'Food', icon: '🍽' },
            { key: 'art', label: 'Art', icon: '🎨' },
            { key: 'responsable', label: 'Festivité responsable', icon: '❤️‍🩹' }
        ];

        return new Response(JSON.stringify({ 
            ok: true,
            domains
        }), { 
            status: 200, 
            headers: { 'content-type': 'application/json' } 
        });

    } catch (error) {
        console.error('listDomains error:', error);
        return new Response(JSON.stringify({ 
            ok: false, 
            error: error.message 
        }), { 
            status: 500, 
            headers: { 'content-type': 'application/json' } 
        });
    }
});