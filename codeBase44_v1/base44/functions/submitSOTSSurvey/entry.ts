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
        const { sessionId, funWork, toxicityAvoidance, fairnessResourcefulness, attitudePositivity, communication, comment, tags, wouldRecommend } = body;

        if (!sessionId) {
            return json(400, { ok: false, code: 'INVALID_INPUT', error: 'Missing sessionId' });
        }

        // Valider les 5 dimensions
        if (![funWork, toxicityAvoidance, fairnessResourcefulness, attitudePositivity, communication].every(v => v >= 1 && v <= 5)) {
            return json(400, { ok: false, code: 'INVALID_SCORES', error: 'All 5 dimensions must be between 1 and 5' });
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
        
        // VERROU 2: Evaluator doit être participant OU membre de l'audience (vérifiée ou non)
        // RWE — PRINCIPE NON BLOQUANT :
        //   La présence physique est un signal de qualité, pas une condition d'accès.
        //   - Participant lineup (artiste/organisateur) → voterRole = 'participant'
        //   - Audience avec SessionPresence validée   → voterRole = 'audience' (signal fort)
        //   - Audience sans SessionPresence           → voterRole = 'audience_unverified' (signal faible)
        //   Dans tous les cas, le vote est autorisé.
        //   L'audienceFactor sera ajusté en conséquence (voir plus bas).
        let evaluatorP = participants.find(p => normalizeId(p?.userId) === evaluatorUserId);
        let voterRole = 'participant'; // 'participant' | 'audience' | 'audience_unverified'

        if (!evaluatorP) {
            // Chercher une SessionPresence pour cet utilisateur
            const presences = await base44.asServiceRole.entities.SessionPresence.filter({
                sessionId,
                userId: evaluatorUserId,
            }).catch(() => []);
            const myPresence = (presences || []).find(p => ['completed','active','auto_closed'].includes(p.status));

            if (myPresence && myPresence.role === 'audience') {
                // Audience avec présence vérifiée — signal fort
                voterRole = 'audience';
                evaluatorP = {
                    userId: evaluatorUserId,
                    roleSystemId: 'RL-AUDIENCE',
                    styleSystemIds: [],
                    submittedBallot: myPresence.audienceVoteSubmitted || false,
                    sotsSubmitted: myPresence.audienceVoteSubmitted || false,
                };
            } else {
                // Audience sans SessionPresence (bug présence ou session type quickplay)
                // Non bloquant — autorisé mais marqué 'audience_unverified'
                // audienceFactor sera 1.0 (poids standard non amplifié)
                voterRole = 'audience_unverified';
                evaluatorP = {
                    userId: evaluatorUserId,
                    roleSystemId: 'RL-AUDIENCE',
                    styleSystemIds: [],
                    submittedBallot: false,
                    sotsSubmitted: false,
                };
                console.log(`[submitSOTSSurvey] AUDIENCE_UNVERIFIED evaluatorId=${evaluatorUserId} sessionId=${sessionId} — vote autorisé, signal faible`);
            }
        }

        // VERROU 3: Pas de double soumission
        if (evaluatorP.submittedBallot === true || evaluatorP.sotsSubmitted === true) {
            return json(409, {
                ok: false,
                code: 'DUPLICATE_SURVEY',
                error: 'Survey already submitted',
                alreadySubmitted: true
            });
        }

        // VERROU 4: Tous les participants doivent avoir un rôle
        // Styles optionnels pour rôles non-musicaux (responsable, video, photo, food, tech, producer)
        // Seul le rôle est obligatoire — les styles peuvent être vides pour certains rôles
        for (const p of participants) {
            const roleId = normalizeId(p?.roleSystemId);
            if (!roleId) {
                return json(400, {
                    ok: false,
                    code: 'MISSING_PARTICIPANT_SNAPSHOTS',
                    error: `Participant ${normalizeId(p?.userId)} has no role snapshot`
                });
            }
            // Styles vides → OK (rôles non-musicaux comme Sentinelle, Vidéaste, Photographe, etc.)
        }

        // Récupérer profil evaluator pour weight
        const evaluatorProfiles = await base44.entities.TalentProfile.filter({ userId: evaluatorUserId });
        const evaluatorXP = evaluatorProfiles.length > 0 ? evaluatorProfiles[0].xpGlobal || 0 : 0;
        const evaluatorWeight = Math.max(1, Math.log(evaluatorXP + 10));

        // RWE-7 — Facteur d'amplification audience
        // La présence est un signal de qualité, pas une condition d'accès.
        // 3 niveaux de signal selon voterRole :
        //   'participant'          → audienceFactor depuis audienceCountFrozen (1.0 → 2.0)
        //   'audience'             → même facteur (présence GPS vérifiée)
        //   'audience_unverified'  → factor = 1.0 (poids standard, pas d'amplification)
        const audienceCountFrozen = Number(session.audienceCountFrozen) || 0;
        const audienceFactor = voterRole === 'audience_unverified'
          ? 1.0  // signal faible — pas de présence vérifiée, poids standard
          : Math.min(1 + audienceCountFrozen / 50, 2.0);
        const evaluatorWeightWithRWE = parseFloat((evaluatorWeight * audienceFactor).toFixed(4));

        // Snapshots evaluator
        const myRoleId = normalizeId(evaluatorP.roleSystemId) || '';
        const myStyleIds = asArray(evaluatorP.styleSystemIds).map(normalizeId).filter(Boolean);
        // Source of truth: session.checkpointSystemId = Checkpoint.systemId (jamais checkpointId)
        const checkpointSystemId = normalizeId(session.checkpointSystemId);
        const sessionTypeVal = session.sessionType || 'quickplay';

        // Gamification anti-bulle: bonus cosmétique
        let cosmeticBonus = 0;
        let newBadges = [];
        
        try {
            const evaluatorProfiles = await base44.entities.TalentProfile.filter({ userId: evaluatorUserId });
            if (evaluatorProfiles.length > 0) {
                const profile = evaluatorProfiles[0];
                const habitualStyles = asArray(profile.primaryStyleSystemIds, []);
                const chosenStyles = myStyleIds;
                
                // Vérifier si au moins un style est hors-bulle
                const hasOutOfBubbleStyle = chosenStyles.some(s => !habitualStyles.includes(s));
                
                if (hasOutOfBubbleStyle) {
                    cosmeticBonus = 10;
                    
                    // Charger le checkpoint pour vérifier le vibe
                    const checkpoints = await base44.asServiceRole.entities.Checkpoint.filter({ systemId: checkpointSystemId });
                    if (checkpoints.length > 0 && checkpoints[0].vibe === 'experimental') {
                        cosmeticBonus = 20;
                    }
                    
                    // Ajouter badge Explorer si absent
                    const currentBadges = asArray(profile.cosmeticBadges, []);
                    if (!currentBadges.includes('Explorer')) {
                        newBadges = [...currentBadges, 'Explorer'];
                    }
                    
                    // Mettre à jour le profil avec bonus
                    const updateData = {
                        cosmeticXp: (profile.cosmeticXp || 0) + cosmeticBonus
                    };
                    if (newBadges.length > 0) {
                        updateData.cosmeticBadges = newBadges;
                    }
                    
                    await base44.asServiceRole.entities.TalentProfile.update(profile.id, updateData);
                }
            }
        } catch (err) {
            console.error('Gamification bonus error (non-fatal):', err);
        }

        // Calculer scoreRaw (moyenne des 5 dimensions)
        const scores = [
            parseFloat(funWork),
            parseFloat(toxicityAvoidance),
            parseFloat(fairnessResourcefulness),
            parseFloat(attitudePositivity),
            parseFloat(communication)
        ];
        const scoreRaw = parseFloat((scores.reduce((a, b) => a + b, 0) / 5).toFixed(2));

        const createdLogs = [];

        // Créer un SOTSLog pour chaque autre participant (N-1)
        const targets = participants.filter(p => normalizeId(p?.userId) !== evaluatorUserId);

        for (const targetP of targets) {
            const targetId = normalizeId(targetP.userId);
            const targetRoleId = normalizeId(targetP.roleSystemId) || '';
            const targetStyleIds = asArray(targetP.styleSystemIds).map(normalizeId).filter(Boolean);

            const sotsLog = {
                sessionId,
                evaluatorUserId,
                targetType: 'user',
                targetId,
                scoreRaw,
                funWork: parseFloat(funWork),
                toxicityAvoidance: parseFloat(toxicityAvoidance),
                fairnessResourcefulness: parseFloat(fairnessResourcefulness),
                attitudePositivity: parseFloat(attitudePositivity),
                communication: parseFloat(communication),
                comment: comment || null,
                // RWE-7 — evaluatorWeightWithRWE = evaluatorWeight × audienceFactor
                evaluatorWeightSnapshot: evaluatorWeightWithRWE,
                scoreWeighted: parseFloat((scoreRaw * evaluatorWeightWithRWE).toFixed(4)),
                tags: Array.isArray(tags) ? tags : [],
                // TARGET snapshots
                roleSystemId: targetRoleId || undefined,
                styleSystemIds: targetStyleIds.length > 0 ? targetStyleIds : undefined,
                // EVALUATOR snapshots
                evaluatorRoleSystemId: myRoleId || undefined,
                evaluatorStyleSystemIds: myStyleIds.length > 0 ? myStyleIds : undefined,
                sessionType: sessionTypeVal || undefined,
                checkpointSystemId: checkpointSystemId || undefined, // source of truth
                // LEGACY (lecture seule, plus jamais écrit via checkpointId)
                sessionRoleSystemId: targetRoleId || undefined,
                sessionStyleSystemIds: targetStyleIds.length > 0 ? targetStyleIds : undefined,
                sessionStyleSystemId: targetStyleIds[0] || undefined,
                sessionCheckpointSystemId: checkpointSystemId || undefined,
                sessionTags: Array.from(new Set([targetRoleId, ...targetStyleIds, checkpointSystemId].filter(Boolean))),
                targetRoleSystemId: targetRoleId || undefined,
                targetStyleSystemIds: targetStyleIds.length > 0 ? targetStyleIds : undefined,
                // Rôle du votant : 'participant' (artiste/organisateur) ou 'audience'
                voterRole: voterRole || 'participant',
                // 6-G — Recommandation binaire (null = non répondu)
                wouldRecommend: wouldRecommend === true ? true : wouldRecommend === false ? false : null,
            };

            const created = await base44.asServiceRole.entities.SOTSLog.create(sotsLog);
            createdLogs.push(created);
        }

        // Mettre à jour participant.submittedBallot = true
        // Pour l'audience : marquer via SessionPresence plutôt que participants[]
        let updatedParticipants = participants;
        if (voterRole === 'audience') {
            // Audience vérifiée — marquer dans SessionPresence.audienceVoteSubmitted
            const presences = await base44.asServiceRole.entities.SessionPresence.filter({
                sessionId, userId: evaluatorUserId,
            }).catch(() => []);
            const myPresence = (presences || []).find(p => p.role === 'audience');
            if (myPresence) {
                await base44.asServiceRole.entities.SessionPresence.update(myPresence.id, {
                    audienceVoteSubmitted: true
                }).catch(() => {});
            }
        } else if (voterRole === 'audience_unverified') {
            // Audience non vérifiée — pas de SessionPresence à mettre à jour
            // Le vote est enregistré dans sotsSubmittedBy uniquement
            console.log(`[submitSOTSSurvey] AUDIENCE_UNVERIFIED vote recorded evaluatorId=${evaluatorUserId}`);
        } else {
            updatedParticipants = participants.map(p => 
                normalizeId(p?.userId) === evaluatorUserId ? { ...p, submittedBallot: true, sotsSubmitted: true } : p
            );
        }
        
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

        // CRITICAL: Apply session to checkpoint stats if all done
        if (allDone) {
            try {
                await base44.functions.invoke('applySessionToStats', {
                    sessionId
                });
            } catch (err) {
                console.error('applySessionToStats failed (non-fatal):', err);
            }
        }

        // DROP ENGINE: Calculer et attribuer drop après SOTS
        let dropResult = null;
        
        try {
            // Identifier domainKey du rôle du participant
            let participantDomainKey = null;
            const participantRoleId = myRoleId;
            
            if (participantRoleId) {
                // Chercher domainKey via RoleDomainMap
                const domainMaps = await base44.asServiceRole.entities.RoleDomainMap.filter({
                    roleSystemId: participantRoleId,
                    isActive: true
                });
                
                if (domainMaps.length > 0) {
                    participantDomainKey = domainMaps[0].domainKey;
                } else {
                    // Fallback: chercher via RoleHierarchy racine
                    const roles = await base44.asServiceRole.entities.RoleHierarchy.filter({
                        systemId: participantRoleId
                    });
                    
                    if (roles.length > 0) {
                        const role = roles[0];
                        if (role.level === 1) {
                            participantDomainKey = role.domainKey;
                        } else if (role.racineSystemId) {
                            const rootRoles = await base44.asServiceRole.entities.RoleHierarchy.filter({
                                systemId: role.racineSystemId
                            });
                            if (rootRoles.length > 0) {
                                participantDomainKey = rootRoles[0].domainKey;
                            }
                        }
                    }
                }
            }
            
            // DEFAULT SAFE
            if (!participantDomainKey) {
                participantDomainKey = 'music';
                console.warn('No domainKey found for role, defaulting to music');
            }
            
            // Charger ou créer DomainProgress
            const progressData = await base44.asServiceRole.entities.DomainProgress.filter({
                userId: evaluatorUserId,
                domainKey: participantDomainKey
            });
            
            let progress;
            if (progressData.length > 0) {
                progress = progressData[0];
            } else {
                progress = await base44.asServiceRole.entities.DomainProgress.create({
                    userId: evaluatorUserId,
                    domainKey: participantDomainKey,
                    xp: 0,
                    level: 1,
                    updatedAt: new Date().toISOString()
                });
            }
            
            // Vérifier idempotence drop
            const existingDrops = await base44.asServiceRole.entities.DropLog.filter({
                userId: evaluatorUserId,
                sessionId
            });
            
            if (existingDrops.length === 0) {
                const levelBefore = progress.level;
                const xpBefore = progress.xp;
                
                // Compute rarity
                const roll = Math.random();
                const levelBonus = Math.floor(levelBefore / 5);
                
                const legendaryChance = Math.min(0.005 + levelBonus * 0.002, 0.02);
                const epicChance = Math.min(0.02 + levelBonus * 0.005, 0.08);
                const rareChance = Math.min(0.12 + levelBonus * 0.01, 0.35);
                
                let rarityTier;
                if (roll < legendaryChance) {
                    rarityTier = 'legendary';
                } else if (roll < legendaryChance + epicChance) {
                    rarityTier = 'epic';
                } else if (roll < legendaryChance + epicChance + rareChance) {
                    rarityTier = 'rare';
                } else {
                    rarityTier = 'common';
                }
                
                // Compute XP
                const xpBase = 120;
                const xpBonus = 20 * Math.min(levelBefore, 10);
                const totalBaseXP = xpBase + xpBonus;
                
                const multipliers = { common: 1, rare: 2, epic: 4, legendary: 8 };
                const xpGained = totalBaseXP * multipliers[rarityTier];
                
                // Update DomainProgress
                const newXP = xpBefore + xpGained;
                const newLevel = Math.min(25, Math.max(1, 1 + Math.floor(newXP / 500)));
                
                await base44.asServiceRole.entities.DomainProgress.update(progress.id, {
                    xp: newXP,
                    level: newLevel,
                    lastDropAt: new Date().toISOString(),
                    totalDrops: (progress.totalDrops || 0) + 1,
                    updatedAt: new Date().toISOString()
                });
                
                // Create DropLog
                await base44.asServiceRole.entities.DropLog.create({
                    userId: evaluatorUserId,
                    sessionId,
                    domainKey: participantDomainKey,
                    rarityTier,
                    xpGained,
                    source: 'SOTS_DROP',
                    createdAt: new Date().toISOString(),
                    meta: {
                        roll: parseFloat(roll.toFixed(4)),
                        levelBefore,
                        levelAfter: newLevel,
                        xpBefore,
                        xpAfter: newXP
                    }
                });
                
                dropResult = {
                    domainKey: participantDomainKey,
                    rarityTier,
                    xpGained,
                    levelBefore,
                    levelAfter: newLevel,
                    xpBefore,
                    xpAfter: newXP
                };
            }
        } catch (dropError) {
            console.error('Drop engine error (non-fatal):', dropError);
        }

        console.log(JSON.stringify({
            action: 'submitSOTSSurvey',
            sessionId,
            evaluatorUserId,
            votes: createdLogs.length,
            allDone,
            drop: dropResult ? dropResult.rarityTier : null
        }));

        return json(200, {
            ok: true,
            success: true,
            created: createdLogs.length,
            allVotesReceived: allDone,
            drop: dropResult
        });

    } catch (error) {
        console.error('submitSOTSSurvey error:', error);
        return json(500, { ok: false, code: 'INTERNAL', error: error.message || 'Unexpected error' });
    }
});