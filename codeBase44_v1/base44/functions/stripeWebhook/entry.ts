// deploy: v2
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

// États valides pour soumettre SOTS - INVARIANT
const SOTS_VALID_STATES = ['completed', 'aborted'];

class HttpError extends Error {
    constructor(status, code, message, extra = {}) {
        super(message);
        this.status = status;
        this.code = code;
        this.extra = extra;
    }
}

function asJsonError(err) {
    return {
        status: err.status,
        body: { ok: false, code: err.code, error: err.message, ...err.extra },
    };
}

function json(status, body) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' }
    });
}

function jsonError(status, code, message, extra = {}) {
    return json(status, { ok: false, code, error: message, ...extra });
}

// Helpers pour normaliser JSON
function asArray(value, fallback = []) {
    if (Array.isArray(value)) return value;
    if (typeof value === 'string') {
        try { return JSON.parse(value); } catch { return fallback; }
    }
    return fallback;
}

function asObject(value, fallback = {}) {
    if (value && typeof value === 'object' && !Array.isArray(value)) return value;
    if (typeof value === 'string') {
        try { return JSON.parse(value); } catch { return fallback; }
    }
    return fallback;
}

function normalizeId(v) {
    if (!v) return '';
    if (typeof v === 'string') return v;
    if (typeof v === 'number') return String(v);
    if (typeof v === 'object') return String(v.systemId || v.id || v._id || v.value || '');
    return '';
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            throw new HttpError(401, 'UNAUTHORIZED', 'Utilisateur non authentifié');
        }

        const body = await req.json().catch(() => ({}));
        const { sessionId, evaluatorUserId, votes: rawVotes } = body;

        const votes = asArray(rawVotes, []);

        if (!sessionId || !evaluatorUserId || votes.length === 0) {
            throw new HttpError(400, 'INVALID_INPUT', 'Missing required fields');
        }

        if (evaluatorUserId !== user.id) {
            throw new HttpError(403, 'EVALUATOR_MISMATCH', 'Evaluator mismatch');
        }

        // Vérifier que la session existe et est complétée ou abandonnée
        const sessions = await base44.asServiceRole.entities.Session.filter({ id: sessionId });
        
        if (sessions.length === 0) {
            return json(404, { ok: false, error: 'Session not found' });
        }

        const session = sessions[0];

        // VERROU 1 (INVARIANT): Session doit être completed ou aborted
        if (!SOTS_VALID_STATES.includes(session.status)) {
            return json(403, { 
                ok: false,
                code: 'INVALID_SESSION_STATUS',
                error: `SOTS can only be submitted for completed/aborted sessions. Current: ${session.status}`,
                currentStatus: session.status,
                validStates: SOTS_VALID_STATES
            });
        }

        // VERROU IDEMPOTENCE: vérifier sotsSubmittedBy avant vérification SOTSLog
        const submittedBy = asArray(session.sotsSubmittedBy, []);
        const alreadySubmitted = submittedBy.includes(evaluatorUserId);

        if (alreadySubmitted) {
            return json(200, {
                ok: true,
                alreadySubmitted: true,
                sessionId,
                message: 'SOTS déjà soumis par cet utilisateur'
            });
        }

        // VERROU 2: Evaluator doit être participant
        const participants = asArray(session.participants, []);
        const isParticipant = participants.some(p => p?.userId === evaluatorUserId);
        
        if (!isParticipant) {
            return json(403, {
                ok: false,
                error: 'Evaluator must be a participant of this session',
                evaluatorUserId,
                participants: participants.map(p => p?.userId).filter(Boolean)
            });
        }

        // Récupérer le profil de l'évaluateur pour calculer le poids
        const evaluatorProfiles = await base44.entities.TalentProfile.filter({ userId: evaluatorUserId });
        const evaluatorXP = evaluatorProfiles.length > 0 ? evaluatorProfiles[0].xpGlobal || 0 : 0;
        
        // Poids = max(1, log(xpGlobal + 10))
        const evaluatorWeight = Math.max(1, Math.log(evaluatorXP + 10));

        const createdLogs = [];
        const skippedLogs = [];
        const errors = [];

        for (const vote of votes) {
            const { targetType, targetId, scoreRaw, sotsBreakdown, comment, tags } = vote;

            if (!targetType || !targetId || scoreRaw === undefined) {
                errors.push({ vote, error: 'Missing fields' });
                continue;
            }

            // VERROU 3: Auto-notation interdite
            if (targetType === 'user' && targetId === evaluatorUserId) {
                errors.push({ vote, error: 'Auto-rating forbidden' });
                continue;
            }

            // VERROU 4: Si targetType=user, targetId doit être participant
            if (targetType === 'user') {
                const targetIsParticipant = participants.some(p => p?.userId === targetId);
                if (!targetIsParticipant) {
                    errors.push({ 
                        vote, 
                        error: 'Target user must be participant',
                        targetId,
                        participants: participants.map(p => p?.userId).filter(Boolean)
                    });
                    continue;
                }
            }

            // VERROU 5 (ZIP55): Styles requis seulement pour domaines artistiques
            // Domaines music/humour/art → styles obligatoires
            // Domaines video/photo/food/producer/tech/responsable → styles optionnels
            if (targetType === 'user') {
                const targetP = participants.find(p => normalizeId(p?.userId) === normalizeId(targetId));
                const targetStylesRaw = targetP?.styleSystemIds;
                const targetStylesArr = Array.isArray(targetStylesRaw)
                    ? targetStylesRaw.map(normalizeId).filter(Boolean)
                    : [];
                const isOrganizerTarget = targetP?.roleSystemId === 'RL-ORGANIZER' || targetP?.isOrganizer === true;

                // Déterminer si le rôle requiert des styles
                // On résoudra le domaine depuis les données disponibles
                // Pour l'instant : RL-ORGANIZER exempt, styles toujours optionnels si absents
                // (la validation dure est déplacée côté snapshot uniquement)
                const stylesRequired = false; // assouple complètement — le snapshot stocke ce qu'il y a

                if (targetStylesArr.length === 0 && !isOrganizerTarget && stylesRequired) {
                    return json(400, {
                        ok: false,
                        code: 'MISSING_PARTICIPANT_STYLES',
                        error: 'Target participant has no styles in Session.participants.',
                        targetId,
                        sessionId,
                        participantSnapshot: targetP
                    });
                }
            }

            // IDEMPOTENCE: vérifier si vote existe déjà
            const existing = await base44.asServiceRole.entities.SOTSLog.filter({
                sessionId,
                evaluatorUserId,
                targetType,
                targetId
            });

            if (existing.length > 0) {
                skippedLogs.push({ targetType, targetId, reason: 'already_exists' });
                continue;
            }

            // SNAPSHOT DURABLE: extraire contexte session
            let targetRole = '';
            let targetStyles = [];
            let evaluatorRole = '';
            let evaluatorStyles = [];
            let checkpointId = '';

            if (targetType === 'user') {
                const targetPart = participants.find(p => normalizeId(p?.userId) === normalizeId(targetId));
                const evalPart = participants.find(p => normalizeId(p?.userId) === normalizeId(evaluatorUserId));
                
                if (!targetPart) {
                    errors.push({ vote, error: 'TARGET_NOT_IN_SESSION' });
                    continue;
                }

                // Target snapshots
                targetRole = normalizeId(targetPart.roleSystemId);
                
                const targetStylesArr = Array.isArray(targetPart.styleSystemIds)
                    ? targetPart.styleSystemIds.map(normalizeId).filter(Boolean)
                    : [];
                
                const targetSingleStyle = normalizeId(targetPart.styleSystemId);
                
                targetStyles = targetStylesArr.length > 0 
                    ? targetStylesArr 
                    : (targetSingleStyle ? [targetSingleStyle] : []);

                if (!targetRole) {
                    errors.push({ vote, error: 'MISSING_SESSION_ROLE' });
                    continue;
                }

                // Styles vides OK pour rôles non-musicaux (vidéaste, photographe, etc.)
                // On stocke un tableau vide dans le snapshot plutôt que de bloquer
                if (targetStyles.length === 0) {
                    console.warn(`[submitSOTS] No styles for ${targetId} role=${targetRole} — allowed for non-musical roles`);
                }

                // Evaluator snapshots
                if (evalPart) {
                    evaluatorRole = normalizeId(evalPart.roleSystemId);
                    
                    const evalStylesArr = Array.isArray(evalPart.styleSystemIds)
                        ? evalPart.styleSystemIds.map(normalizeId).filter(Boolean)
                        : [];
                    
                    const evalSingleStyle = normalizeId(evalPart.styleSystemId);
                    
                    evaluatorStyles = evalStylesArr.length > 0 
                        ? evalStylesArr 
                        : (evalSingleStyle ? [evalSingleStyle] : []);
                }
            }

            checkpointId = normalizeId(
                session.checkpointSystemId ?? 
                session.checkpointId ?? 
                participants.find(p => normalizeId(p?.userId) === normalizeId(targetId))?.checkpointSystemId
            );

            const sessionTypeVal = session.sessionType || session.sessionTypeSnapshot || 'quickplay';

            // Trouver les participants pour enrichir les snapshots
            const targetParticipant = participants.find(p => normalizeId(p?.userId) === normalizeId(targetId));
            const evaluatorParticipant = participants.find(p => normalizeId(p?.userId) === normalizeId(evaluatorUserId));

            const myRoleId = evaluatorRole || normalizeId(evaluatorParticipant?.roleSystemId) || '';
            const myStyleIds = evaluatorStyles.length > 0 
                ? evaluatorStyles 
                : (Array.isArray(evaluatorParticipant?.styleSystemIds) 
                    ? evaluatorParticipant.styleSystemIds.map(normalizeId).filter(Boolean) 
                    : []);

            const targetRoleId = targetRole || normalizeId(targetParticipant?.roleSystemId) || '';
            const targetStyleIds = targetStyles.length > 0 
                ? targetStyles 
                : (Array.isArray(targetParticipant?.styleSystemIds) 
                    ? targetParticipant.styleSystemIds.map(normalizeId).filter(Boolean) 
                    : []);

            // Créer le SOTS log avec snapshots (insert-only)
            const sotsLog = {
                sessionId,
                evaluatorUserId,
                targetType,
                targetId,
                scoreRaw: parseFloat(scoreRaw),
                funWork: vote.funWork ? parseFloat(vote.funWork) : undefined,
                toxicityAvoidance: vote.toxicityAvoidance ? parseFloat(vote.toxicityAvoidance) : undefined,
                fairnessResourcefulness: vote.fairnessResourcefulness ? parseFloat(vote.fairnessResourcefulness) : undefined,
                attitudePositivity: vote.attitudePositivity ? parseFloat(vote.attitudePositivity) : undefined,
                communication: vote.communication ? parseFloat(vote.communication) : undefined,
                sotsBreakdown: sotsBreakdown || null,
                comment: comment || null,
                evaluatorWeightSnapshot: parseFloat(evaluatorWeight.toFixed(4)),
                scoreWeighted: parseFloat((scoreRaw * evaluatorWeight).toFixed(4)),
                tags: Array.isArray(tags) ? tags : [],
                // SNAPSHOTS DURABLES (nouveaux noms) - contexte complet
                roleSystemId: targetRoleId || undefined,
                styleSystemIds: targetStyleIds.length > 0 ? targetStyleIds : undefined,
                evaluatorRoleSystemId: myRoleId || undefined,
                evaluatorStyleSystemIds: myStyleIds.length > 0 ? myStyleIds : undefined,
                sessionType: sessionTypeVal || undefined,
                checkpointSystemId: checkpointId || undefined,
                // LEGACY (ZIP58: corriger pour refléter TARGET, pas EVALUATOR)
                sessionRoleSystemId: targetRoleId || undefined,
                sessionStyleSystemIds: targetStyleIds.length > 0 ? targetStyleIds : undefined,
                sessionStyleSystemId: targetStyleIds[0] || undefined,
                sessionCheckpointSystemId: checkpointId || undefined,
                sessionTags: Array.from(new Set([targetRoleId, ...targetStyleIds, checkpointId].filter(Boolean))),
                // Target snapshots
                targetRoleSystemId: targetRoleId || undefined,
                targetStyleSystemIds: targetStyleIds.length > 0 ? targetStyleIds : undefined
            };

            const created = await base44.asServiceRole.entities.SOTSLog.create(sotsLog);
            createdLogs.push(created);
        }

        // Mettre à jour sotsSubmittedBy ET participants[].sotsSubmitted
        const updatedSubmittedBy = Array.from(new Set([...submittedBy, evaluatorUserId]));
        
        const updatedParticipants = participants.map(p => 
            p?.userId === evaluatorUserId ? { ...p, sotsSubmitted: true } : p
        );
        
        const participantIds = participants.map(p => p?.userId).filter(Boolean);
        const allDone = participantIds.length > 0 && participantIds.every(uid => updatedSubmittedBy.includes(uid));
        
        await base44.asServiceRole.entities.Session.update(sessionId, {
            sotsSubmittedBy: updatedSubmittedBy,
            participants: updatedParticipants,
            ...(allDone ? { status: 'sots_submitted' } : {})
        });

        // Recalculer les scores pour tous les targets créés (user, style, role, checkpoint, event)
        const allTargets = createdLogs.map(log => ({ targetType: log.targetType, targetId: log.targetId }));
        
        // Déduplication par (targetType, targetId)
        const uniqueTargets = Array.from(
            new Map(allTargets.map(t => [`${t.targetType}:${t.targetId}`, t])).values()
        );

        for (const target of uniqueTargets) {
            try {
                await base44.functions.invoke('computeSOTS', {
                    targetType: target.targetType,
                    targetId: target.targetId
                });
            } catch (err) {
                console.error(`computeSOTS failed for ${target.targetType}/${target.targetId}:`, err);
            }
        }

        // Audit log (minimal)
        if (createdLogs.length > 0) {
            console.log(JSON.stringify({
                action: 'submitSOTS',
                sessionId,
                votes: createdLogs.length,
                allDone
            }));
        }

        return json(200, {
            ok: true,
            success: true,
            created: createdLogs.length,
            skipped: skippedLogs.length,
            allVotesReceived: allDone,
            errors: errors.length > 0 ? errors : undefined
        });

    } catch (error) {
        console.error('submitSOTS error:', error);
        if (error instanceof HttpError) {
            const errorResponse = asJsonError(error);
            return json(errorResponse.status, errorResponse.body);
        }
        return jsonError(500, 'INTERNAL', error.message || 'Unexpected error');
    }
});