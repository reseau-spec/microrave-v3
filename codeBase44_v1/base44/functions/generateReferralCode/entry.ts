// deploy: v2
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Générer un code de parrainage unique
        const generateCode = () => {
            const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
            let code = '';
            for (let i = 0; i < 8; i++) {
                code += chars.charAt(Math.floor(Math.random() * chars.length));
            }
            return code;
        };

        let referralCode = generateCode();
        let attempts = 0;
        const maxAttempts = 10;

        // Vérifier l'unicité
        while (attempts < maxAttempts) {
            const existing = await base44.entities.User.filter({ referralCode });
            if (existing.length === 0) {
                break;
            }
            referralCode = generateCode();
            attempts++;
        }

        if (attempts >= maxAttempts) {
            return Response.json({ error: 'Failed to generate unique referral code' }, { status: 500 });
        }

        // Mettre à jour l'utilisateur avec le code de parrainage
        await base44.asServiceRole.entities.User.update(user.id, { referralCode });

        return Response.json({ 
            success: true, 
            referralCode 
        });

    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});