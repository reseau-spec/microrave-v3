// Helper pour erreurs HTTP structurées
export class HttpError extends Error {
    constructor(status, code, message, details = null) {
        super(message);
        this.status = status;
        this.code = code;
        this.details = details;
    }
}

export function asJsonError(err) {
    if (err instanceof HttpError) {
        return {
            status: err.status,
            body: { 
                ok: false, 
                code: err.code, 
                message: err.message, 
                details: err.details 
            }
        };
    }
    console.error('Unhandled error:', err);
    return {
        status: 500,
        body: { 
            ok: false, 
            code: 'INTERNAL_ERROR', 
            message: 'Erreur serveur', 
            details: null 
        }
    };
}