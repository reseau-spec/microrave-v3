FICHE D'ÉVALUATION — E. SOTS ET RÉPUTATION
Date d'évaluation : 22 mai 2026 06:44 EST
Fait par Claude Opus 4.7
Documents sources : OS V15 §2.7.1 (SOTSWindowGuard), EXPORT_BRUT (D-026 SOTS actif MVP score par défaut 3/5, D-077 ReputationLedger append-only + SOTSScoreSnapshot, D-078 matrice notation par relation, D-079 SOTS multi-dimensionnel, D-080 SOTSCommissionModulationConfig, D-081 EMA, D-082 contestation SOTS, D-083 seuils de confiance, D-094 fraude SOTS 7 patterns), Plan d'Implantation §2.1, code src/services/SOTSSubmissionService.js (241 l.), src/core/guards/SOTSWindowGuard.js (280 l.), src/repositories/SOTSRepository.js (148 l.), src/repositories/ReputationRepository.js (108 l.), src/services/SchedulerService.js (case SOTS_WINDOW_EXPIRATION l. 166-180), config/policy-config-schema.js, test P0 SOTS-SELF-01.
Niveau de confiance : HAUTE sur la doctrine append-only et le pattern 6 ; PARTIELLE sur les configs SOTS (4 sur 5 manquantes au seed) et le câblage scheduler → consolidation ; INFÉRENCE sur le scénario nominal sans note audience.
──────────────────────────────────────────────────
1. CRITÈRES DE COMPLÉTUDE
Ce domaine est prêt pour la première transaction quand :

Auto-note bloquée absolument — D-094 pattern 6 (SOTS_SELF_BENEFICIAL) : "Auto-note directe ou indirecte → blocage absolu." Test P0 dédié SOTS-SELF-01 requis avant Event 1 (référencé dans TEST_REGISTRY).
AudienceCheckIn + TicketAdmissionRight requis pour les notes audience — D-094 garde-fou structurel primaire : "TicketAdmissionRight + AudienceCheckIn = condition nécessaire pour soumettre une note audience. Rejet avant ledger si absent."
ReputationLedger strictement append-only — D-077 : "Couche 1 — ReputationLedger : append-only. Chaque soumission SOTS = ReputationLedgerEntry immuable. Invalidation = entrée reversal liée à DecisionRecord + EvidenceBundle. Jamais supprimée."
SOTSScoreSnapshot immuable créé à sots_window_closed — D-077 + D-082 + OS V15 §2.7 Moment WORM 5.
Fenêtre SOTS de 24h après event_completed — OS V15 §2.7.1 + sots_window_duration_hours (config seedée à 24).
Score EMA calculé par SOTSCalculationPolicyConfig — D-081 : "Score SOTS courant calculé par EMA avec facteur de lissage configurable dans SOTSCalculationPolicyConfig. Champs : emaAlpha_ppm, minSubmissionsForEma, calculationMethod."
Score par défaut 3/5 = 3 000 score_units pour nouveau talent — D-026 : "Tout nouveau talent sans historique reçoit un score SOTS par défaut de 3/5."
Modulation commission via SOTSCommissionModulationConfig — D-080 : "Score élevé → multiplicateur < 1 000 000 ppm. Score neutre → 1 000 000 ppm. Score faible → > 1 000 000 ppm. Fallback si seuil de confiance non atteint : multiplicateur forcé à 1 000 000 ppm."
Seuils de confiance via SOTSConfidencePolicyConfig — D-083 : 1 soumission (interne), 3 (limité), 5 (standard), 10 (modulation complète). "Sous 10 soumissions : multiplicateur forcé à 1 000 000 ppm."
Matrice de notation D-078 respectée — "Un acteur peut noter seulement ce qu'il a réellement vécu ou observé." Audience ↔ Talent/Checkpoint (avec billet), Talent ↔ Organisateur/Checkpoint, Organisateur ↔ Talent, Payeur ↔ Organisateur/Vendeur, Vendeur ↔ Organisateur/Talent, Admin ↔ tous (avec AdminAction).
Contestation SOTS conforme à D-082 — fenêtre SOTSContestPolicyConfig.contestationWindowDurationHours (recommandé MVP 48h), motifs admissibles (fraude, erreur manifeste, noteur non admissible, vengeance, conflit d'intérêt, preuve contraire). Note originale immuable + ReputationLedgerEntry reversal.
D-094 7 patterns de fraude implémentés ou explicitement reportés.
SOTS C-08 condition de payout : SOTSSubmission présente avant contestation_window → payable — D-075 Condition 7 "SOTSSubmission du talent soumis ← requis, pas optionnel" (relayé par PresenceProofGuard C-08).

Ce domaine bloque tout le reste si :

SOTS_SELF_BENEFICIAL non gardé — D-094 pattern 6 + D-107 interdit absolu : "Aucun contournement possible."
SOTSSubmission du talent absente au moment du payout — PresenceProofGuard C-08 fail-closed (sauf SoloFounderOverride).
ReputationLedger modifié ou supprimé après création — viole LOI GREFFIER-01 + D-107 interdit #11.

──────────────────────────────────────────────────
2. ÉTAT ACTUEL DOCUMENTÉ
Ce qui existe et fonctionne selon les documents :

SOTSSubmissionService.js (241 l.) expose submit, consolidate, isConsolidated. Trois validations fail-closed à l'entrée de submit() (engagementId, submittedBy, repositories.sots, repositories.reputation).
D-094 pattern 6 (SOTS_SELF_BENEFICIAL) câblé strict — code l. 85-92 : if (talentUserId && submittedBy === talentUserId) → throw SOTS_SELF_BENEFICIAL. "Jamais de contournement possible. Jamais de SoloFounderOverride pour cette regle." Vérifié par test SOTS-SELF-01 T-03.
Append-only respecté après consolidation — code l. 95-102 : si un SOTSScoreSnapshot existe déjà pour l'engagement → throw SOTS_WINDOW_CLOSED. "Soumission apres consolidation impossible. Source : D-077." Vérifié par T-06.
SOTSWindowGuard.js (280 l.) implémente correctement les deux chemins :

Chemin A (scheduler) : sotsWindowClosedAt présent + sotsConsolidated: true → passed.
Chemin B (calcul direct) : sotsWindowOpenedAt + lecture sots_window_duration_hours → si non-écoulée, retourne SchedulerDueTask SOTS_WINDOW_EXPIRATION avec dueAt, contextOverrides.sotsConsolidated: true (l. 228-244). Pattern identique à ContestationWindowGuard.
Admin override : sotsAdminOverride: true + adminIncidentRecordId obligatoire (fail-closed sans incident record, l. 129-136).


SOTSRepository.js (148 l.) : create() valide le préfixe SOT-* (l. 80-85), insère avec consolidated: false par défaut (l. 88). findByEngagementId(), markConsolidated() (PUT bulk par boucle car Base44 ne supporte pas bulk update — code l. 105-115), createSnapshot(), findSnapshotByEngagementId().
ReputationRepository.js (108 l.) strictement append-only — append() exige le préfixe REP-* + userId + engagementId (l. 70-77), pas de méthode update ni delete exportée (l. 104-108). Tri ASC sur createdAt pour permettre un calcul EMA chronologique (l. 92-93).
ReputationLedger automatiquement écrit à chaque submit — code l. 122-134 : à chaque soumission valide, repositories.reputation.append({entryType: 'SOTS_SCORE', scoreValue, userId: talentUserId, ...}). Pattern fait correctement même si consolidate() n'est pas encore appelé.
Calcul moyenne arithmétique des catégories — computeAverageScore (l. 214-225) : filtre les valeurs ∈ [1, 5], arrondit à 1 décimale max (Math.round(x * 10) / 10). computeAggregatedScore (l. 231-239) : moyenne des moyennes pour toutes les soumissions du même engagement.
SOTSRepository.markConsolidated() met à jour consolidated: true + consolidatedAt sur toutes les soumissions de l'engagement (l. 105-115). Append-only préservé puisque chaque entrée originale reste — la consolidation est un flag annexe, pas une modification du contenu.
SchedulerService case SOTS_WINDOW_EXPIRATION (l. 166-180) déclenche transitionEngagement(event_completed → sots_window_closed) avec contextOverrides propagés (sotsConsolidated: true posé par le guard l. 241).
repositories.sots et repositories.reputation exposés dans src/repositories/index.js (l. 111-112). Cohérence repository ↔ service ↔ guard intacte (contrairement à webhookProcessedLogs / stripePaymentSignals).
Config sots_window_duration_hours = 24 seedée — STANDARD (pas CRITIQUE).
Test P0 SOTS-SELF-01 : 6/6 PASSED. Couvre :

T-01 : submit() → systemId SOT-*
T-02 : engagementId manquant → erreur
T-03 : submittedBy === talentUserId → SOTS_SELF_BENEFICIAL
T-04 : consolidate() → {sotsConsolidated: true, snapshot}
T-05 : isConsolidated() retourne false si pas de snapshot
T-06 : soumission après consolidation → SOTS_WINDOW_CLOSED


Préfixes IDFactory : SOTSRecord: 'SOT' (utilisé pour SOTSSubmission et SOTSScoreSnapshot) et ReputationEntry: 'REP'. Vérifié dans IDFactory.PREFIXES.

Ce qui vient de V1 et est encore actif :

Aucune dette ni acquis SOTS de V1. Le concept SOTS (Score Objectif de la Transaction et du Service) est V3 natif — "actif dès MVP" (D-026, 2026-05-20). V1 microrave.ca n'avait pas de système de notation institutionnel.

Ce qui vient de V2 et a survécu :

Rien. SOTS est l'une des fondations V3 : "Le ReputationLedger garde pourquoi; le snapshot dit combien."

──────────────────────────────────────────────────
3. LACUNES IDENTIFIÉES
BLOQUANT (empêche la première transaction) :

SOTSSubmissionService.consolidate() n'est appelé par aucun service automatique. SchedulerService.case 'SOTS_WINDOW_EXPIRATION' (l. 166-180) appelle directement transitionEngagement() avec contextOverrides.sotsConsolidated: true provenant du guard, mais aucun appel à consolidate() n'a lieu avant. Source : grep -rnE "SOTSSubmissionService\.consolidate|consolidate\(" src/ retourne uniquement la définition du service. Conséquence : à sots_window_closed, le flag sotsConsolidated est true en context mais aucun SOTSScoreSnapshot n'a été créé en base, et markConsolidated n'a pas été appelé. Le commentaire de SOTSWindowGuard l. 241 promet "le scheduler consolidera avant de déclencher" — promesse non tenue en code. Conséquence directe : PresenceProofGuard C-08 lit le contexte (mockable), ça passe ; mais en intégration réelle, l'absence de SOTSScoreSnapshot signifie pas d'historique réputationnel pour DJ Alex après son premier event. Pour la première transaction stricte D-117 ("premier event réel complété sans intervention manuelle") : viole la chaîne complète Engagement → SOTSSubmission → ReputationLedgerEntry → SOTSScoreSnapshot. Source de l'identification : SchedulerService.js l. 166-180 + recherche grep.

DÉGRADANT (réduit la qualité, n'empêche pas) :

4 configs SOTS critiques absentes du seed : SOTSCalculationPolicyConfig (emaAlpha_ppm, minSubmissionsForEma — D-081), SOTSConfidencePolicyConfig (seuils 1/3/5/10 — D-083), SOTSDimensionConfig (7 dimensions — D-079), SOTSCommissionModulationConfig (scoreThreshold_units, multiplier_ppm — D-080). Source : grep -nE "SOTSCalc|SOTSConfid|SOTSDim|SOTSCommissionMod" config/policy-config-schema.js → 0 résultat. Conséquence : la modulation commission par score SOTS n'a aucune table de seuil à consulter — le code ne peut pas appliquer D-080 en l'état. Pour la première transaction (DJ Alex sans historique → fallback multiplicateur 1.0 selon D-080 « Sous 10 soumissions ») : non-bloquant pour SC-01 mais la doctrine D-026 ("modulation active dès MVP") n'est pas exécutable.
EMA non implémenté — D-081 exige "EMA avec facteur de lissage configurable". Le code utilise une moyenne arithmétique simple (computeAverageScore/computeAggregatedScore). Le commentaire explicite l. 25 : "D-082 — EMA scores snapshotés a WORM Moment 5" + l. 24 : "Moyenne arithmetique simple — EMA calcule par ReputationLedger sur le long terme" — promesse différée. Le ReputationLedger est tri-able chronologiquement, donc un calcul EMA peut être fait offline, mais aucun service ne le fait. Pour la première transaction : non-bloquant (un seul event = moyenne simple = EMA convergente).
Matrice D-078 (acteurs autorisés à noter) non câblée. Le service accepte role: 'talent' | 'organisateur' | 'vendeur' (l. 45) mais ne valide pas que l'acteur est effectivement habilité à noter la cible. Pas de check du standing du noteur. Pour DJ Alex à Le Trèfle : c'est l'organisateur qui note le talent — couvert par D-078 (Organisateur ↔ Talent), pas de problème de facto. Mais aucun garde-fou si un acteur arbitraire essaie.
D-094 patterns 1-5 et 7 non implémentés : SUSPICIOUS_SOTS_CLUSTER, AudienceCheckIn requis, SOTS_PATTERN_ANOMALY, compte < 30 jours, CROSS_TALENT_SOTS_SUSPICIOUS, SOTS_CONFLICT_OF_INTEREST. Seul pattern 6 (SOTS_SELF_BENEFICIAL) câblé. Pour Event 0 pilote (DJ Alex, talent connu, organisateur connu, pas d'audience public) : risque négligeable. Event public futur : nécessaire.
Contestation SOTS non implémentée (D-082) — pas de fenêtre SOTSContestPolicyConfig.contestationWindowDurationHours, pas de mécanisme de reversal lié à DecisionRecord + EvidenceBundle. Pour la première transaction nominale (pas de contestation attendue) : non-bloquant. Mais le mécanisme de correction est absent en cas d'erreur de note.
Aucun mécanisme d'initialisation du score par défaut 3/5 = 3 000 units (D-026) pour les nouveaux talents. Pas de service initializeTalentSOTS() ni de hook sur création de Talent. Pour DJ Alex existant V1 sans historique V3 : son score sera effectivement « aucun » jusqu'à premier event noté — défensible mais ne correspond pas à la lettre de D-026.

REPORTABLE (peut attendre l'événement 2+) :

SOTSScoreSnapshot périodique non implémenté — D-077 "calculé périodiquement par EMA. Snapshoté pour affichage, ContractSnapshot et calculs de commission." Le code crée un snapshot par engagement (au moment de consolidate), pas un snapshot périodique global par talent. Pour première transaction : un seul event suffit. Event 2+ avec multiple events : nécessite un mécanisme de snapshot agrégé périodique.
Audience-side : TicketAdmissionRight + AudienceCheckIn non implémentés. Pas pertinent pour Pierre de Rosette (pas de billetterie).
Notation Checkpoint (D-078 ligne 1 : "Audience peut noter Checkpoint") — hors scope MVP nominal.
Notation Vendeur (D-078 ligne 5 et 4 : "Payeur ↔ Vendeur", "Vendeur ↔ Organisateur") — D-119 roadmap, hors MVP V3.0.
Modulation affectsCommission per-dimension (D-079 SOTSDimensionConfig champ affectsCommission) — D-080 multiplicateur agrégé suffit en première approche.

ANGLE MORT POTENTIEL :
Y a-t-il quelque chose que ce domaine requiert pour la première transaction que l'OS ne documente pas explicitement ?
→ OUI — trois INFÉRENCES NON DOCUMENTÉES, à valider par le fondateur :

Qui appelle SOTSSubmissionService.submit() côté UI/Base44 ? Le service expose la fonction mais aucun consommateur identifié (ni dans cron.js, ni dans une fonction Base44 visible côté V3, ni dans un script). INFÉRENCE : (a) bouton organisateur "Noter le talent" dans Base44 → endpoint Base44 → SOTSSubmissionService ; (b) bouton talent "Noter l'organisateur/checkpoint" même chemin ; (c) page UI V1 microrave.ca adaptée. Hors-archive — à valider.
Comment l'appelant de SchedulerService orchestre-t-il consolidate() avant la transition event_completed → sots_window_closed ? Option 1 — modifier SchedulerService.case 'SOTS_WINDOW_EXPIRATION' pour appeler SOTSSubmissionService.consolidate({engagementId, repositories}) AVANT transitionEngagement(). Option 2 — un nouvel taskType: 'SOTS_CONSOLIDATE' créé en amont. Option 3 — consolider à la demande lors du calcul du score affiché. Le choix n'est pas dans l'OS. À valider — sans réponse, le scénario nominal Pierre de Rosette n'a pas de chaîne SOTS automatique.
D-026 "actif dès MVP pour tous les talents" — comment l'appliquer à DJ Alex ? Si DJ Alex n'a jamais eu d'engagement V3 noté, son ReputationLedger.findByUserId(USR-PILOT-ALEX) retournera []. Aucun service ne crée une entrée d'initialisation à 3/5. INFÉRENCE : (a) ne rien faire — le score "n'existe pas" et le multiplicateur tombe à 1.0 par fallback D-080 ; (b) script seed-pilot-data.js initialise une entrée REP-INIT-* type DEFAULT_INITIAL_SCORE ; (c) un hook lors du premier event noté. Acceptable techniquement (a), non-conforme à la lettre de D-026. À valider.

──────────────────────────────────────────────────
4. DETTE HÉRITÉE

De V1 : aucune dette SOTS, aucun acquis. Concept entièrement V3 — "D-026 : actif dès MVP, validé 2026-05-20".
De V2 : rien. SOTS est l'une des fondations.
De l'OS V3 lui-même : doctrine extrêmement riche (D-077 à D-083 + D-094 = 8 décisions formelles, 4 configs DB structurées, 7 patterns de fraude, matrice de notation à 6 acteurs). Le code implémente l'invariant minimal (append-only + pattern 6) avec une moyenne simple. C'est une simplification volontaire MVP, lisible et défendable, mais elle laisse 4 configs SOTS spécifiées en suspension. Le squelette ReputationLedger est correct et portable — l'EMA et les modulations peuvent être ajoutés ultérieurement sans refonte.

──────────────────────────────────────────────────
5. DELTA VERS COMPLÉTUDE
Brancher SOTSSubmissionService.consolidate() dans le SchedulerService.case 'SOTS_WINDOW_EXPIRATION' avant la transition (pour que la chaîne automatique produise effectivement un SOTSScoreSnapshot et marque les soumissions comme consolidées), exposer un endpoint UI permettant à l'organisateur de soumettre sa note dans la fenêtre 24h, valider opérationnellement avec le fondateur les trois INFÉRENCES (déclencheur UI, ordre scheduler-consolidate-transition, initialisation D-026).
──────────────────────────────────────────────────
6. STATUT FINAL
☒ EN COURS → environ 55 %
Décomposition de l'estimation :

✅ Append-only ReputationLedger + SOTSScoreSnapshot immuable : 100 %
✅ D-094 pattern 6 (SOTS_SELF_BENEFICIAL) fail-closed : 100 %
✅ Service submit/consolidate/isConsolidated opérationnel en logique : 100 %
✅ SOTSWindowGuard avec deux chemins + admin override : 100 %
✅ Repository SOTS / Reputation exposés dans index.js : 100 %
✅ Test P0 SOTS-SELF-01 (6/6 PASSED) : 100 %
❌ Chaîne automatique SchedulerService → consolidate() → transition : 0 % (consolidate jamais appelé)
❌ Configs SOTS au seed (Calculation, Confidence, Dimension, CommissionModulation) : 0 % sur 4 sur 5
❌ Calcul EMA effectif (D-081) : 0 % (moyenne simple en place)
❌ Matrice D-078 validation noteur ↔ cible : 0 %
❌ Score par défaut 3/5 (D-026) : 0 %
❌ Contestation SOTS D-082 : 0 %
❌ Patterns fraude D-094 1-5, 7 : 0 % (seul 6 implémenté)
⚠ UI déclencheur soumission : hors archive (INCONNU)

──────────────────────────────────────────────────
7. DÉPENDANCES SORTANTES

Domaine A (Ontologie) : la transition event_completed → sots_window_closed (Moment WORM 5) dépend de sotsConsolidated: true validé par SOTSWindowGuard. Source : OS V15 §2.7.1.
Domaine B (Finance et ledger) : la modulation commission par score SOTS (D-080) influe sur tauxPpm au moment de l'accepted (Moment WORM 1). Pour la première transaction de DJ Alex sans historique → multiplicateur fallback 1.0 → commission Freemium 12% nominale. Dépendance forte pour Event 2+ mais non-bloquante pour Event 1.
Domaine D (Présence et preuve) : C-08 (PresenceProofGuard) exige SOTSSubmission présente avant contestation_window → payable. Source : D-075 Condition 7 + code PresenceProofGuard l. 274-281. Sans submit() réellement effectué par un acteur autorisé, le payout est bloqué. Dépendance dure pour la première transaction.
Domaine F (Scheduler) : SchedulerService gère SOTS_WINDOW_EXPIRATION qui déclenche event_completed → sots_window_closed. Domaine F doit être armé pour que la fenêtre se ferme automatiquement. Bidirectionnel : E expose la SchedulerDueTask, F l'exécute.
Domaine G (Admin et sécurité) : D-082 contestation SOTS exige DecisionRecord + EvidenceBundle + AdminAction (override admin). D-105 + D-072 décident des types de DecisionRecord. Hors Event 0 nominal mais dépendance forte pour Event 2+.
Domaine J (Acteurs et onboarding) : D-078 matrice exige que les acteurs noteurs soient identifiés avec leurs relations (talent ↔ organisateur ↔ checkpoint). Le User doit exister et son rôle dans l'event doit être lisible. Pour DJ Alex au Trèfle : trivial — un talent, un organisateur. Pour audience publique : dépendance forte (TicketAdmissionRight + AudienceCheckIn dont D-094 fait un garde-fou structurel).
→ INFÉRENCE non documentée explicitement dans l'OS : le domaine E est prérequis dur au domaine B pour le payout du premier event (via D-075 Condition 7) mais prérequis souple au-delà (la modulation commission ne s'applique pas tant que < 10 soumissions). C'est une dépendance temporellement dissymétrique : forte sur l'ouverture du payout (C-08), faible sur le montant du payout au MVP. À valider que cette dissymétrie est consciente.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FIN DE LA FICHE — E. SOTS ET RÉPUTATION
Fiche conservée pour le Prompt de Synthèse.