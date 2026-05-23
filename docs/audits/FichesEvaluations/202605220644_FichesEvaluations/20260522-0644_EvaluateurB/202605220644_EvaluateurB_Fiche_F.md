FICHE D'ÉVALUATION — F. SCHEDULER
Date d'évaluation : 22 mai 2026 06:44 EST
Fait par Claude Opus 4.7
Documents sources : OS V15 §2.7.1 (transitions temporelles), EXPORT_BRUT (D-099 architecture Scheduler doctrine centrale, D-100 jobs P0/P1/P2 liste complète, D-101 6 verrous anti-double payout, D-102 politique de relance, D-103 ledger imbalance, D-104 CronBudgetPolicyConfig), Plan d'Implantation §1.4 + §2.2 (option B externe), code src/services/SchedulerService.js (213 l.), src/repositories/SchedulerRepository.js (216 l.), scripts/cron.js (85 l.), package.json (dépendance node-cron), config/policy-config-schema.js, tests P0 SCHEDULER-TASK-01 (7/7), BALANCE-DEADLINE-01 (7/7), ADMIN-ABS-SCHEDULERRUN (4/4).
Niveau de confiance : HAUTE sur l'idempotency + dispatcher des 3 tâches couvertes ; PARTIELLE sur la complétude D-100 (3 sur 11 P0 implémentées) et l'injection repositories ; INFÉRENCE sur le déclencheur externe (Railway/Render/cron Unix).
──────────────────────────────────────────────────
1. CRITÈRES DE COMPLÉTUDE
Ce domaine est prêt pour la première transaction quand :

Une SchedulerDueTask est créée immédiatement à toute échéance connue — D-099 phrase canonique : "Quand Micro Rave connaît une échéance, elle crée le réveil immédiatement." Le système ne « calcule pas plus tard ce qui peut être planifié maintenant ».
Le dispatcher se réveille périodiquement — D-099 phrase canonique : "Le cron réveille; la tâche dit quoi faire." Cycle de réveil documenté dans SchedulerPolicyConfig.
Idempotency garantie par lockedByRunId — D-099 + D-101 verrou 1 : "lockedByRunId — anti-double-exécution". Une tâche déjà verrouillée par un run en cours est sautée silencieusement par les runs suivants.
Status transition appliquée : pending → processing → done | failed | cancelled — D-099 structure SchedulerDueTask. "Statut cancelled obligatoire si objet cible atteint état rendant la tâche caduque."
SchedulerRun complété est immuable — D-107 interdit absolu (test P0 ADMIN-ABS-SCHEDULERRUN) : "Modifier ou supprimer un SchedulerRun complété" est interdit.
Les 11 jobs P0 D-100 sont implémentés : capture_deposit, deposit_deadline_check, balance_deadline_check, seal_event, sots_window_close, payout_approver, execute_payout_transfer, chargeback_hold, expire_dispute_window, transfer_expiry_check, ledger_balance_check. Au minimum pour la première transaction nominale Pierre de Rosette : balance_deadline_check + sots_window_close + expire_dispute_window (= CONTESTATION_WINDOW_EXPIRATION).
Surveillance HEARTBEAT_MISSING + DUE_TASK_OVERDUE — D-099 : "Surveillance en deux dimensions (...) Seuils dans SchedulerPolicyConfig." SchedulerIncidentRecord créé sur détection.
CronBudgetPolicyConfig armée avec 4 états — D-104 : healthy < 6500 / watch 6500-8000 / critical_only 8000-9900 / exhausted > 9900. "Si exhausted pendant 3 mois consécutifs → signal MigrationTriggerPolicyConfig."
ManualJobRunRequest pour relances admin — D-099 + D-102 : "Relançables par admin via ManualJobRunRequest + AdminAction". Champs : adminUserId, targetJobKey, reasonCode, policyId, adminActionId.
Interdits absolus respectés — D-102 : "SchedulerRun complété (immuable), SchedulerDueTask de type payout (pas de création directe admin), execute_payout_transfer, capture_deposit".
Le rail HOLD est armé sur ledger_balance_check détectant une LEDGER_BALANCE_VIOLATION — D-103 : "payouts de l'event gelés (rail HOLD), autres events non affectés".

Ce domaine bloque tout le reste si :

Le déclencheur cron externe n'est pas configuré → cron.js n'est jamais exécuté → aucune tâche temporelle ne s'exécute → balance_deadline_check ne tire jamais, SOTS_WINDOW_EXPIRATION ne ferme jamais la fenêtre, CONTESTATION_WINDOW_EXPIRATION ne déclenche jamais → payable. Conséquence : la chaîne nominale automatique stoppe à event_completed.
lockedByRunId est ignoré → double exécution possible → risque double payout via execute_payout_transfer.
Un SchedulerRun complété est modifié → viole D-107 interdit absolu.

──────────────────────────────────────────────────
2. ÉTAT ACTUEL DOCUMENTÉ
Ce qui existe et fonctionne selon les documents :

SchedulerService.js (213 l.) orchestre runDueTasks() (point d'entrée du cron) + executeTask() (dispatch par taskType). Acteur souverain USR-SYSTEM-SCHED01 pour les transitions déclenchées par le scheduler (l. 43, cohérent avec D-099 "le cron est l'acteur, pas un humain").
Idempotency D-099 respectée : avant toute exécution, if (task.lockedByRunId) → push outcome: 'skipped', reason: 'already_locked' et continue (l. 91-94). Puis markProcessing(task.id, runId) verrouille immédiatement avant l'exécution.
Résilience par tâche : chaque échec produit un AdminIncidentRecord P1 sans interrompre le run (l. 105-121). "Un echec sur une tache n'arrete pas les suivantes. Le run se complete meme si toutes les taches echouent." Conforme à la décision Plan §2.2.
SchedulerRun créé AVANT exécution (l. 73-78), complété APRÈS exécution (l. 128-131). Conforme à D-107 — immutabilité après complétion garantie par le fait que completeRun() n'est appelée qu'une fois.
Trois taskType implémentés (l. 147-196) :

BALANCE_DEADLINE_CHECK → deposit_secured → cancelled_J7 (LOI ANNULATION-02 / D-014-A)
SOTS_WINDOW_EXPIRATION → event_completed → sots_window_closed (D-077)
CONTESTATION_WINDOW_EXPIRATION → contestation_window → payable (D-019-B)


taskType inconnu géré gracieusement (l. 198-209) : AdminIncidentRecord P1 type UNKNOWN_TASK_TYPE créé, run continue. Pas de throw.
SchedulerRepository.js (216 l.) expose : createTask, findDueTasks, markProcessing, markDone, markFailed, markCancelled, cancelAllPendingTasksForEngagement + createRun, completeRun. Validation stricte sur createTask : préfixe SCH-* obligatoire (l. 85-89), taskType obligatoire (l. 91-93), dueAt doit être un timestamp Unix ms entier (l. 94-96).
findDueTasks(nowTimestamp) filtre côté serveur sur status: 'pending' puis côté client sur dueAt <= now && !lockedByRunId (l. 110-116). Acceptable pour le MVP malgré la limitation Base44 sur les comparaisons de dates.
cancelAllPendingTasksForEngagement(engagementId, reason) disponible (l. 167-174) — utile pour SC-DEPOSIT-FAIL (annulation cascade des SchedulerDueTasks lors d'un échec dépôt). Aucun appelant identifié dans le code aujourd'hui.
scripts/cron.js (85 l.) est un script one-shot prêt à être déclenché par un cron externe. Exit code conforme : process.exit(1) si tasksFailed > 0 (permet à Railway/Render de détecter l'échec), process.exit(0) sinon.
npm run cron dans package.json permet l'exécution manuelle.
Dépendance node-cron@^3.0.0 dans package.json — disponible pour un futur daemon local, mais le commentaire cron.js l. 13-15 indique "(a creer si besoin)" → pas utilisé en l'état.
SchedulerService injecté pur — "zero logique metier. transitionEngagement() reste le seul point d'entree pour les mutations d'etat. Tous les repositories sont injectes — pas de require direct dans ce service." (commentaire l. 12-15). Conforme à D-127 (architecture portable).
Tests P0 réussis le 22 mai 2026 :

SCHEDULER-TASK-01 : 7/7 PASSED (zéro tâche, taskType valide, idempotency lockedByRunId, échec → AdminIncidentRecord, taskType inconnu, création run, complétion run).
BALANCE-DEADLINE-01 : 7/7 PASSED (création SchedulerDueTask à deposit_pending→deposit_secured, fail-closed sur balanceDeadlineDays absent, non-bloquant si scheduler absent — "SoloFounderOverride").
ADMIN-ABS-SCHEDULERRUN : 4/4 PASSED (SchedulerRun complété immuable, conforme D-107 #13).


Préfixe IDFactory SCH- pour SchedulerDueTask (l. 34 IDFactory). SchedulerService.runDueTasks() utilise IDFactory.generate('SchedulerDueTask') pour runId (l. 69) — élégant : le runId est lui-même un systemId souverain.

Ce qui vient de V1 et est encore actif :

Aucun composant scheduler V1. La doctrine SchedulerDueTask + SchedulerRun est V3 native (D-099 BLOC 12).

Ce qui vient de V2 et a survécu :

Rien. Scheduler est une fondation V3.

──────────────────────────────────────────────────
3. LACUNES IDENTIFIÉES
BLOQUANT (empêche la première transaction) :

cron.js n'injecte que 5 repositories sur ceux requis par les transitions déclenchées. cron.js l. 40-46 expose scheduler, admin, policyConfig, engagements, ledger. Or :

BALANCE_DEADLINE_CHECK → CancellationGuard (l. 99 transition_table) nécessite contractSnapshots et payment pour calculer les écritures LOI ANNULATION-02.
CONTESTATION_WINDOW_EXPIRATION → PresenceProofGuard nécessite policyConfig (✓) mais aussi le contexte sessionPresence + contractSnapshotPhase2 + sotsSubmission + activeDispute + settlementInstruction. Le SchedulerService transmet contextOverrides (l. 191-193) provenant de task.contextOverrides. Si ces overrides ne contiennent pas tous les champs requis → guard fail-closed. La task a-t-elle été créée avec les bons overrides ? À voir.
Le financialGuard: true sur contestation_window→payable (transitionEngagement l. 125) déclenche LedgerInvariantGuard qui exige contractSnapshotPhase2 en context — encore une donnée hors-overrides.

Source de l'identification : scripts/cron.js l. 40-46 + transition_table financialGuard flags + signature des guards. Conséquence directe : à 24h après sots_window_closed, le cron tire la SchedulerDueTask CONTESTATION_WINDOW_EXPIRATION, appelle transitionEngagement(contestation_window → payable), mais le PresenceProofGuard reçoit un context vide (sauf schedulerTaskId et contextOverrides posés par le scheduler) — pas de sessionPresence, pas de contractSnapshotPhase2, pas de sotsSubmission → C-02_MISSING_SNAPSHOT ou C-03_NO_SESSION_PRESENCE. La transition automatique vers payable échoue silencieusement (AdminIncidentRecord P1) → DJ Alex ne sera jamais payé sans intervention manuelle.
Aucun déclencheur externe configuré dans le repo. cron.js est un script one-shot conçu pour être déclenché toutes les 5 minutes par Railway / Render / un cron Unix. Recherche find . -name "railway.toml" -o -name "render.yaml" -o -name "*.cron" -o -name "Dockerfile" → 0 résultat. Conséquence : cron.js ne s'exécutera jamais en production tant qu'un déclencheur externe n'est pas configuré (action hors-code, à valider opérationnellement).

DÉGRADANT (réduit la qualité, n'empêche pas) :

Surveillance HEARTBEAT_MISSING et DUE_TASK_OVERDUE non implémentée. D-099 "Surveillance en deux dimensions" — aucun SchedulerIncidentRecord typé HEARTBEAT_MISSING/DUE_TASK_OVERDUE. grep -rnE "(SchedulerIncidentRecord|HEARTBEAT_MISSING|DUE_TASK_OVERDUE)" src/ → 0 résultat. Si le cron crashe silencieusement (Railway timeout, panne réseau), personne ne le sait — AdminIncidentRecord P0 n'est pas créé en absence de réveil. Mitigation : Railway / Render envoient leurs propres alertes sur échec de scheduled job — externalisation organisationnelle.
attemptCount jamais incrémenté — SchedulerRepository.createTask l'initialise à 0 (l. 100), mais aucun appelant ne l'incrémente sur échec. D-099 le liste dans la structure SchedulerDueTask comme champ. Sans incrément, impossible de détecter une tâche qui échoue répétitivement.
Pas de retry automatique sur échec — markFailed met status: 'failed' et l'incident est créé. La tâche est définitivement perdue jusqu'à intervention admin manuelle. D-102 permet la relance via ManualJobRunRequest mais ce mécanisme n'est pas implémenté (grep → 0 résultat).
CronBudgetPolicyConfig non seedée + non utilisée — grep -nE "CronBudget|cron_budget" config/ → 0 résultat. Le scheduler ne dégrade pas par budget (D-104 "exhausted → P0 seulement"). Pour MVP territorial avec ~3 630 crédits/mois estimés, pas critique immédiat.
8 jobs P0 manquants sur 11 (D-100) : capture_deposit, deposit_deadline_check, seal_event, payout_approver, execute_payout_transfer, chargeback_hold, transfer_expiry_check, ledger_balance_check.

Pour Pierre de Rosette nominale : capture_deposit (PaymentIntent capture côté Stripe — automatique avec automatic_payment_methods), payout_approver (D-075 vérifié in-line par PresenceProofGuard), execute_payout_transfer (intégré dans PayoutExecutor au moment de payable → settled), ledger_balance_check (vérifié in-line par LedgerInvariantGuard) — sont de facto exécutés à chaque transition pertinente, pas en tant que tâches scheduler indépendantes. Sémantiquement équivalent mais ne suit pas la lettre de D-100.
seal_event (passage automatique deposit_secured → event_sealed à réception webhook solde) — confirmé en Fiche C §3 BLOQUANT : pas de consommateur du webhook solde. Donc seal_event n'a effectivement aucun déclencheur, ni in-line ni scheduler.
transfer_expiry_check, chargeback_hold, deposit_deadline_check — pour scénarios non-nominaux.


Pas de calcul de SchedulerCreditBudget mensuel. D-104 mentionne "Consommation anormalement rapide → AdminIncidentRecord automatique". Hors scope MVP.

REPORTABLE (peut attendre l'événement 2+) :

Jobs P1/P2 non implémentés : saas_revenue_recognition_daily, tax_remittance_reminder, client_attribution_renewal, seller_portfolio_health (P1) ; sots_snapshot, checkpoint_cultural_profile, fraud_pattern_scan, data_retention_enforcement, rounding_reconciliation, scheduler_credit_budget_report (P2). Tous hors scope MVP.
MigrationTriggerPolicyConfig lié à cron_budget exhausted 3 mois consécutifs — hors scope.

ANGLE MORT POTENTIEL :
Y a-t-il quelque chose que ce domaine requiert pour la première transaction que l'OS ne documente pas explicitement ?
→ OUI — trois INFÉRENCES NON DOCUMENTÉES, à valider par le fondateur :

Comment les contextOverrides d'une SchedulerDueTask sont-ils alimentés au moment de leur création pour transporter sessionPresence, contractSnapshotPhase2, sotsSubmission jusqu'au moment de l'exécution ? D-099 documente le champ sourceEventType + sourceEventId + policyId mais pas les overrides riches nécessaires aux guards. INFÉRENCE possible (a) : le SchedulerService re-lit ces données depuis les repositories au moment de l'exécution (recharger l'Engagement + son ContractSnapshotV2 + sa SessionPresence + ses SOTSSubmissions). Cela nécessite que les repositories soient injectés (cf. lacune BLOQUANTE supra). INFÉRENCE possible (b) : les contextOverrides sont posés au moment de la création de la SchedulerDueTask, donc à deposit_pending→deposit_secured pour BALANCE_DEADLINE_CHECK, à event_completed→sots_window_closed pour CONTESTATION_WINDOW_EXPIRATION — mais les données au moment de la création ne sont pas les mêmes qu'au moment de l'exécution (J-6 plus tard, ou 24h plus tard, l'event a évolué). Décision architecturale majeure non documentée. À valider — sans réponse, la chaîne automatique post-event est inopérante.
Quel rail externe sera utilisé pour déclencher cron.js toutes les 5 minutes ? Plan §2.2 mentionne "Décision requise avant implémentation : Base44 cron natif ou service externe ? — Décision fondateur 2026-05-21 Option B" (Option B = service externe). Mais aucun fichier de configuration n'indique lequel (Railway / Render / Fly.io / cron-job.org / cron Unix sur VPS). À valider — la décision conditionne le coût opérationnel et la portabilité, et son absence rend le scheduler littéralement inerte.
Comment le scheduler interagit-il avec la fonction Base44 stripeWebhook (cf. Fiche C INFÉRENCE 1) ? Si Base44 expose une fonction webhook qui appelle WebhookProcessor → SignalConsumerService → transitionEngagement(deposit_pending → deposit_secured), alors la SchedulerDueTask BALANCE_DEADLINE_CHECK doit être créée pendant cette transition (côté V3 via EventPaymentGuard.validateDepositConfirmation retournant schedulerTask, persistée via transitionEngagement.js l. 407-420). Mais si Base44 modifie directement le statut Engagement (court-circuit transitionEngagement()), la SchedulerDueTask n'est jamais créée. La portabilité de la chaîne dépend strictement du respect par Base44 du point d'entrée souverain. À valider.

──────────────────────────────────────────────────
4. DETTE HÉRITÉE

De V1 : rien. Doctrine entièrement V3.
De V2 : rien. Scheduler est une fondation.
De l'OS V3 lui-même : doctrine très riche (D-099 à D-104 = 6 décisions, 11 jobs P0, 4 jobs P1, 6 jobs P2, 4 états budget, 3 catégories de relance). Le code implémente le minimum opérationnel viable (3 tâches sur 11 P0, idempotency, dispatch propre). C'est une simplification choisie, alignée avec la décision Phase 2.2 (service externe). La distance entre la doctrine et le code n'est pas une dette de conception — c'est une dette d'injection et de surveillance. Le squelette est extensible : ajouter un taskType = ajouter une case dans executeTask(), sans refonte.

──────────────────────────────────────────────────
5. DELTA VERS COMPLÉTUDE
Configurer le rail externe de déclenchement périodique (Railway/Render/cron Unix appelant npm run cron toutes les 5 min), enrichir scripts/cron.js pour injecter tous les repositories requis par les transitions (sots, reputation, sessionPresence, payment, talentPaymentProfiles, contractSnapshots, settlementInstructions, payoutExecutionRecords, ledgerRecords), prévoir une stratégie d'enrichissement du contexte au moment de l'exécution (re-lecture des repositories ou contextOverrides explicites), et obtenir validation fondateur sur les trois INFÉRENCES (contextOverrides, rail externe, interaction Base44).
──────────────────────────────────────────────────
6. STATUT FINAL
☒ EN COURS → environ 45 %
Décomposition de l'estimation :

✅ Architecture SchedulerDueTask + SchedulerRun + lockedByRunId (D-099) : 100 %
✅ Idempotency anti-double exécution + résilience par tâche : 100 %
✅ Immutabilité SchedulerRun complété (D-107 #13) : 100 %
✅ Repository scheduler exposé dans index.js : 100 %
✅ Dispatch BALANCE_DEADLINE_CHECK / SOTS_WINDOW_EXPIRATION / CONTESTATION_WINDOW_EXPIRATION : 100 % sur la logique
✅ Création SchedulerDueTask en aval des transitions (BALANCE-DEADLINE-01 PASSED) : 100 %
✅ Tests P0 SCHEDULER-TASK-01 / BALANCE-DEADLINE-01 / ADMIN-ABS-SCHEDULERRUN : 100 %
❌ Injection complète des repositories dans cron.js : 40 % (5 sur ~10 nécessaires)
❌ Rail externe configuré (Railway/Render) : 0 % (hors archive)
❌ Enrichissement contextOverrides pour les guards de transition aval : 0 % (les guards échoueront à l'exécution)
❌ Surveillance HEARTBEAT_MISSING + DUE_TASK_OVERDUE : 0 %
❌ Retry / attemptCount incrément / ManualJobRunRequest : 0 %
❌ CronBudgetPolicyConfig 4 états (D-104) : 0 %
❌ 8 jobs P0 manquants (D-100) : 0 % (in-line sémantique mais pas formalisés en taskType)

──────────────────────────────────────────────────
7. DÉPENDANCES SORTANTES

Domaine A (Ontologie) : les transitions temporelles deposit_secured→cancelled_J7 (LOI ANNULATION-02), event_completed→sots_window_closed (Moment WORM 5), contestation_window→payable (chemin nominal post-SOTS) dépendent du scheduler pour leur déclenchement automatique. Sans scheduler armé : la machine d'état stoppe à event_completed et n'atteint jamais settled. Source : OS V15 §2.7.1.
Domaine B (Finance et ledger) : la transition payable → settled ne peut être atteinte sans contestation_window → payable (lui-même déclenché par le scheduler). Le job D-100 execute_payout_transfer est de facto l'invocation de PayoutExecutor.executePayoutBatch() à payable→settled. Sans cron : pas de payout automatique → pas de cent qui bouge → D-117 violé.
Domaine C (Stripe et paiements) : la création des SchedulerDueTask BALANCE_DEADLINE_CHECK dépend de EventPaymentGuard.validateDepositConfirmation qui s'exécute sur le webhook payment_intent.succeeded (consommé par SignalConsumerService). Sans webhook (cf. Fiche C BLOQUANT) : pas de SchedulerDueTask créée → LOI ANNULATION-02 non armée.
Domaine D (Présence et preuve) : la chaîne event_sealed → performed → event_completed n'utilise pas le scheduler (manuelle, déclenchée par le talent et l'organisateur). Mais la chaîne aval event_completed → sots_window_closed → contestation_window → payable est entièrement scheduler-driven. Domaine D fournit la donnée SessionPresence que PresenceProofGuard lira au moment où le scheduler tire CONTESTATION_WINDOW_EXPIRATION.
Domaine E (SOTS) : SchedulerService case SOTS_WINDOW_EXPIRATION déclenche event_completed → sots_window_closed mais n'appelle pas SOTSSubmissionService.consolidate() avant (cf. Fiche E BLOQUANT). Bidirectionnel : E ne peut pas faire son travail sans F, et F ne fait pas le travail de E.
Domaine G (Admin et sécurité) : SchedulerService crée des AdminIncidentRecord P1 sur échec de tâche (l. 110-118). Domaine G fournit le repository admin. Bidirectionnel.
Domaine I (UX et vérité perçue) : D-085 "état payout lisible", D-084 "format universel par état". L'UX doit refléter qu'une SchedulerDueTask est armée (ex: "Le scheduler tirera ton payout le YYYY-MM-DD à HH:MM"). Sans scheduler armé et observable : l'UX ne peut pas projeter la vérité. INFÉRENCE — à valider.
→ INFÉRENCE non documentée explicitement dans l'OS : le domaine F est le chef d'orchestre temporel de la chaîne nominale post-event. Sans lui, la promesse D-117 "premier event réel complété sans intervention manuelle" ne tient pas — même si tous les autres domaines sont prêts, l'absence de réveil automatique force des interventions manuelles à chaque transition temporelle, ce qui dégrade le résultat de FULL SUCCESS vers CONTROLLED SUCCESS (D-144). À valider que cette criticité est consciente — F n'est pas une infrastructure passive, c'est un acteur souverain à part entière (acteur USR-SYSTEM-SCHED01).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FIN DE LA FICHE — F. SCHEDULER
Fiche conservée pour le Prompt de Synthèse.