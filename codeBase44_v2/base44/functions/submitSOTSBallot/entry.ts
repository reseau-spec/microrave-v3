// deploy: v3
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const SOTS_VALID_STATES = ['completed', 'aborted'];

function asArray(value, fallback = []) {
    if (Array.isArray(value)) return value;
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

function json(status, body) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' }
    });
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return json(401, { ok: false, code: 'UNAUTHORIZED', error: 'Utilisateur non authentifié' });
        }

        const body = await req.json().catch(() => ({}));
        const { sessionId, votes: rawVotes } = body;
        const votes = asArray(rawVotes, []);

        if (!sessionId || votes.length === 0) {
            return json(400, { ok: false, code: 'INVALID_INPUT', error: 'Missing sessionId or votes' });
        }

        const evaluatorUserId = user.id;

        // Récupérer session
        const sessions = await base44.asServiceRole.entities.Session.filter({ id: sessionId });
        if (sessions.length === 0) {
            return json(404, { ok: false, code: 'SESSION_NOT_FOUND', error: 'Session not found' });
        }

        const session = sessions[0];

        // VERROU 1: Session doit être completed ou aborted
        if (!SOTS_VALID_STATES.includes(session.status)) {
            return json(403, { 
                ok: false,
                code: 'INVALID_SESSION_STATUS',
                error: `SOTS can only be submitted for completed/aborted sessions. Current: ${session.status}`,
                currentStatus: session.status
            });
        }

        const participants = asArray(session.participants, []);
        
        // VERROU 2: Evaluator doit être participant
        const evaluatorP = participants.find(p => normalizeId(p?.userId) === evaluatorUserId);
        if (!evaluatorP) {
            return json(403, {
                ok: false,
                code: 'NOT_PARTICIPANT',
                error: 'Evaluator must be a participant'
            });
        }

        // VERROU 3: Pas de double soumission
        if (evaluatorP.submittedBallot === true) {
            return json(409, {
                ok: false,
                code: 'DUPLICATE_BALLOT',
                error: 'Ballot already submitted',
                alreadySubmitted: true
            });
        }

        // VERROU 4: votes.length doit être participants.length - 1
        const expectedVotes = participants.length - 1;
        if (votes.length !== expectedVotes) {
            return json(400, {
                ok: false,
                code: 'INVALID_VOTE_COUNT',
                error: `Expected ${expectedVotes} votes, got ${votes.length}`
            });
        }

        // VERROU 5: Chaque targetId doit être participant et != evaluator
        for (const vote of votes) {
            const targetId = normalizeId(vote.targetId);
            if (targetId === evaluatorUserId) {
                return json(400, {
                    ok: false,
                    code: 'SELF_RATING_FORBIDDEN',
                    error: 'Cannot rate yourself'
                });
            }
            
            const targetP = participants.find(p => normalizeId(p?.userId) === targetId);
            if (!targetP) {
                return json(400, {
                    ok: false,
                    code: 'INVALID_TARGET',
                    error: `Target ${targetId} is not a participant`
                });
            }
        }

        // Récupérer profil evaluator pour weight
        const evaluatorProfiles = await base44.entities.TalentProfile.filter({ userId: evaluatorUserId });
        const evaluatorXP = evaluatorProfiles.length > 0 ? evaluatorProfiles[0].xpGlobal || 0 : 0;
        const evaluatorWeight = Math.max(1, Math.log(evaluatorXP + 10));

        // Snapshots evaluator
        const myRoleId = normalizeId(evaluatorP.roleSystemId) || '';
        const myStyleIds = asArray(evaluatorP.styleSystemIds).map(normalizeId).filter(Boolean);
        const checkpointId = normalizeId(
            session.checkpointSystemId ?? 
            session.checkpointId ?? 
            evaluatorP.checkpointSystemId
        );
        const sessionTypeVal = session.sessionType || 'quickplay';

        const createdLogs = [];

        // Créer un SOTSLog pour chaque vote
        for (const vote of votes) {
            const targetId = normalizeId(vote.targetId);
            const targetP = participants.find(p => normalizeId(p?.userId) === targetId);
            
            const targetRoleId = normalizeId(targetP.roleSystemId) || '';
            const targetStyleIds = asArray(targetP.styleSystemIds).map(normalizeId).filter(Boolean);

            const { scoreRaw, funWork, toxicityAvoidance, fairnessResourcefulness, attitudePositivity, communication, comment } = vote;

            const sotsLog = {
                sessionId,
                evaluatorUserId,
                // voteType distingue les votes ballot (structurés N-1) des votes one-shot
                voteType: 'sots_ballot',
                targetType: 'user',
                targetId,
                scoreRaw: parseFloat(scoreRaw),
                funWork: funWork ? parseFloat(funWork) : undefined,
                toxicityAvoidance: toxicityAvoidance ? parseFloat(toxicityAvoidance) : undefined,
                fairnessResourcefulness: fairnessResourcefulness ? parseFloat(fairnessResourcefulness) : undefined,
                attitudePositivity: attitudePositivity ? parseFloat(attitudePositivity) : undefined,
                communication: communication ? parseFloat(communication) : undefined,
                comment: comment || null,
                evaluatorWeightSnapshot: parseFloat(evaluatorWeight.toFixed(4)),
                scoreWeighted: parseFloat((scoreRaw * evaluatorWeight).toFixed(4)),
                tags: [],
                // TARGET snapshots
                roleSystemId: targetRoleId || undefined,
                styleSystemIds: targetStyleIds.length > 0 ? targetStyleIds : undefined,
                // EVALUATOR snapshots
                evaluatorRoleSystemId: myRoleId || undefined,
                evaluatorStyleSystemIds: myStyleIds.length > 0 ? myStyleIds : undefined,
                sessionType: sessionTypeVal || undefined,
                checkpointSystemId: checkpointId || undefined,
                // LEGACY
                sessionRoleSystemId: targetRoleId || undefined,
                sessionStyleSystemIds: targetStyleIds.length > 0 ? targetStyleIds : undefined,
                sessionStyleSystemId: targetStyleIds[0] || undefined,
                sessionCheckpointSystemId: checkpointId || undefined,
                sessionTags: Array.from(new Set([targetRoleId, ...targetStyleIds, checkpointId].filter(Boolean))),
                targetRoleSystemId: targetRoleId || undefined,
                targetStyleSystemIds: targetStyleIds.length > 0 ? targetStyleIds : undefined
            };

            const created = await base44.asServiceRole.entities.SOTSLog.create(sotsLog);
            createdLogs.push(created);
        }

        // Mettre à jour participant.submittedBallot = true
        const updatedParticipants = participants.map(p => 
            normalizeId(p?.userId) === evaluatorUserId ? { ...p, submittedBallot: true, sotsSubmitted: true } : p
        );
        
        // Mettre à jour sotsSubmittedBy
        const submittedBy = asArray(session.sotsSubmittedBy, []);
        const updatedSubmittedBy = Array.from(new Set([...submittedBy, evaluatorUserId]));
        
        const participantIds = participants.map(p => normalizeId(p?.userId)).filter(Boolean);
        const allDone = participantIds.length > 0 && participantIds.every(uid => updatedSubmittedBy.includes(uid));
        
        await base44.asServiceRole.entities.Session.update(sessionId, {
            participants: updatedParticipants,
            sotsSubmittedBy: updatedSubmittedBy,
            ...(allDone ? { status: 'sots_submitted' } : {})
        });

        // Recalculer scores (optionnel)
        const uniqueTargets = Array.from(new Set(createdLogs.map(log => log.targetId)));
        for (const targetId of uniqueTargets) {
            try {
                await base44.functions.invoke('computeSOTS', {
                    targetType: 'user',
                    targetId
                });
            } catch (err) {
                console.error(`computeSOTS failed for ${targetId}:`, err);
            }
        }

        console.log(JSON.stringify({
            action: 'submitSOTSBallot',
            sessionId,
            evaluatorUserId,
            votes: createdLogs.length,
            allDone
        }));

        return json(200, {
            ok: true,
            success: true,
            created: createdLogs.length,
            allVotesReceived: allDone
        });

    } catch (error) {
        console.error('submitSOTSBallot error:', error);
        return json(500, { ok: false, code: 'INTERNAL', error: error.message || 'Unexpected error' });
    }
});