━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FICHE D'ÉVALUATION — F. SCHEDULER
(heartbeat, tâches P0, anti-double, vélocité cron)

Date d'évaluation : 22 mai 2026 07:17 EST
Par Claude Sonnet 4.6
Documents sources :
  • MICRORAVE_V3_OPERATING_SYSTEM_V15.md (OS V15)
  • EXPORT_BRUT—REGISTRES_SOUVERAINS_MICRO_RAVE_V3.md
    (D-099, D-100, D-104, TEST_REGISTRY Catégorie 6)
  • src/services/SchedulerService.js
  • src/repositories/SchedulerRepository.js
  • scripts/cron.js
  • docs/PlanImplantation/20260521-0942_Plan_Implantation.md
  • tests/p0/SCHEDULER-TASK-01.js

Niveau de confiance : HAUTE pour SchedulerService, Scheduler-
  Repository et cron.js (code complet, logique cohérente avec D-099).
  PARTIELLE pour le déploiement du rail cron (la décision
  Option B "service externe" est mentionnée dans SchedulerService
  mais aucun fichier de déploiement Railway/Render n'est visible).
  INFÉRENCE pour la décision SOTS consolidation dans le scheduler
  (documentée en commentaire mais non implémentée comme appel réel).
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

──────────────────────────────────────────────────
1. CRITÈRES DE COMPLÉTUDE

Ce domaine est prêt pour la première transaction quand :

- Les trois transitions temporelles P0 ont chacune leur
  SchedulerDueTask créée en base à l'instant où l'échéance
  est connue : BALANCE_DEADLINE_CHECK (à deposit_secured),
  SOTS_WINDOW_EXPIRATION (à event_completed),
  CONTESTATION_WINDOW_EXPIRATION (à sots_window_closed).
  Source : OS V15 D-099 — *"Quand Micro Rave connaît une
  échéance, elle crée le réveil immédiatement."*

- Le dispatcher (cron.js) est exécuté périodiquement sur
  un rail opérationnel (Base44 natif ou service externe).
  Source : OS V15 D-099, Plan Implantation §1.4 — décision
  requise avant implémentation.

- L'idempotency D-099 est active : lockedByRunId empêche
  toute double exécution d'une même tâche.
  Source : OS V15 D-099.

- Chaque SchedulerRun est créé avant l'exécution des
  tâches et complété (immuable) après — trace permanente.
  Source : OS V15 D-099, D-107 ADMIN-ABS-SCHEDULERRUN.

Ce domaine bloque tout le reste si :

- Aucune SchedulerDueTask n'est créée pour BALANCE_DEADLINE_
  CHECK : LOI ANNULATION-02 (annulation automatique J-6)
  ne s'arme jamais — un organisateur défaillant n'est
  jamais sanctionné automatiquement.
  Source : OS V15 D-014-A, Plan Implantation §0.3.

- Le dispatcher cron n'est pas déployé sur un rail
  opérationnel : toutes les transitions temporelles
  (SOTS, contestation, annulation J-7) restent manuelles —
  CONTROLLED SUCCESS possible, FULL SUCCESS impossible.
  Source : Plan Implantation §2.2 — Phase 2 Gate.

──────────────────────────────────────────────────
2. ÉTAT ACTUEL DOCUMENTÉ

Ce qui existe et fonctionne selon les documents :

- SchedulerService : implémenté. runDueTasks() crée un
  SchedulerRun avant de lire les tâches (T-06 vérifié),
  verrouille chaque tâche (markProcessing), exécute via
  executeTask(), complète le run après. Résilience : échec
  d'une tâche → AdminIncidentRecord P1, run continue.
  executeTask() couvre les 3 taskTypes P0 :
  BALANCE_DEADLINE_CHECK, SOTS_WINDOW_EXPIRATION,
  CONTESTATION_WINDOW_EXPIRATION. taskType inconnu → incident
  P1 sans throw (résilience maximale).
  Source : SchedulerService.js complet.

- SchedulerRepository : complet. createTask() avec
  validation systemId SCH-* et dueAt entier. findDueTasks()
  filtre en JS (dueAt ≤ nowMs + lockedByRunId=null) car
  Base44 ne supporte pas les comparaisons de dates nativement.
  markProcessing(), markDone(), markFailed(), markCancelled(),
  cancelAllPendingTasksForEngagement(), createRun(),
  completeRun(). Statut immuable sur completeRun() documenté.
  Source : SchedulerRepository.js complet.

- cron.js : script one-shot opérationnel. Injecte tous
  les repositories dans SchedulerService (pattern DI pur —
  SchedulerService n'a aucun require direct). process.exit(0)
  si succès, process.exit(1) si tasksFailed > 0 (Railway
  détecte l'échec). Commentaire explique deux modes :
  one-shot Railway et daemon node-cron.
  Source : cron.js complet.

- Test SCHEDULER-TASK-01 : 7 cas couverts — zéro tâche due,
  tâche SOTS exécutée, idempotency lockedByRunId, résilience
  (policyConfig cassée → incident créé, run continue),
  taskType inconnu, ordre createRun < findDueTasks,
  completeRun avec summary. Test marqué PASSED dans son
  propre message de confirmation.
  Source : SCHEDULER-TASK-01.js — message final *"Phase 2.2
  validée : SchedulerService opérationnel."*

- Idempotency T-03 PASSED : une tâche avec lockedByRunId
  non-null est sautée silencieusement, markProcessing n'est
  pas appelé.
  Source : SCHEDULER-TASK-01.js T-03.

- Plan Implantation §2.2 liste SchedulerService comme Phase 2
  livrable — il est présent et testé dans le code.
  Même situation que SOTSSubmissionService (domaine E) :
  le Plan Implantation est en retard sur la réalité du code.

Ce qui vient de V1 et est encore actif :

- INFÉRENCE : aucune infrastructure cron dans V1. Pas de
  dette directe.

Ce qui vient de V2 et a survécu :

- V2 abandonnée. Aucune dette identifiée.

──────────────────────────────────────────────────
3. LACUNES IDENTIFIÉES

BLOQUANT (empêche la première transaction) :

- BLOQUANT-F1 — Bug variable non déclarée dans
  SchedulerService.js. Ligne 78 :
  `const runBase44Id = runRecord.id || runBase44Id;`
  La variable `runBase44Id` n'existe pas encore au moment
  de cette déclaration — c'est une référence à elle-même.
  ReferenceError en Node.js strict mode, ou `undefined`
  en mode non-strict. Ligne 87 utilise `runDbId` (déclaré
  ligne 86 correctement). L'impact : completeRun() est
  bien appelé avec runRecord.id à la ligne 86–87. La ligne
  78 est une déclaration morte. Non-bloquant à l'exécution
  (runRecord.id est utilisé correctement à la ligne 86),
  mais le code contient une référence circulaire qui lèvera
  un avertissement ou une erreur selon la version de Node.
  Source : SchedulerService.js L.78 — `const runBase44Id
  = runRecord.id || runBase44Id`.
  CORRECTION : supprimer la ligne 78 ou la remplacer par
  `const runBase44Id = runRecord.id;` (la vraie déclaration
  est déjà à la ligne 86 sous le nom runDbId).

- BLOQUANT-F2 — Rail cron non déployé. SchedulerService
  et cron.js sont implémentés. Aucun fichier de configuration
  Railway/Render/Fly.io ni Procfile ni workflow GitHub
  Actions n'est visible dans le ZIP pour déclencher
  automatiquement cron.js toutes les 5 minutes.
  Sans déploiement, toutes les transitions temporelles
  (BALANCE_DEADLINE_CHECK, SOTS_WINDOW_EXPIRATION,
  CONTESTATION_WINDOW_EXPIRATION) restent manuelles.
  Source : Plan Implantation §2.2 — *"Décision requise avant
  implémentation : Base44 cron natif ou service externe."*
  La décision a été prise (Option B — service externe,
  commentaire SchedulerService.js header), mais le
  déploiement n'est pas visible.
  NOTE : Pour Event 0A, ce bloquant est contournable par
  déclenchement manuel de `node scripts/cron.js` à chaque
  échéance. SoloFounderOverride documenté suffit.

- BLOQUANT-F3 — SchedulerDueTask BALANCE_DEADLINE_CHECK
  jamais créée. EventPaymentGuard ne retourne pas encore
  l'objet schedulerTask (Plan Implantation §0.3 — livrable
  Phase 0 non encore livré). transitionEngagement() persiste
  la tâche si guardResult.schedulerTask existe (code présent
  en Phase 0.3), mais le guard ne le retourne pas.
  LOI ANNULATION-02 non armée.
  Source : Plan Implantation §0.3 — *"BLOQUANT (LOI
  ANNULATION-02)."*
  NOTE : Non-bloquant pour Event 0A si le fondateur ne
  manque pas le solde. Bloquant si l'organisateur ne paie
  pas le solde et que personne ne déclenche manuellement.

DÉGRADANT (réduit la qualité, n'empêche pas) :

- DÉGRADANT-F1 — consolidate() SOTS absent du dispatcher.
  executeTask() pour SOTS_WINDOW_EXPIRATION appelle
  transitionEngagement(event_completed → sots_window_closed)
  directement, avec contextOverrides.sotsConsolidated=true
  en dur. Mais SOTSSubmissionService.consolidate() n'est
  jamais appelé avant. Le flag est injecté comme vrai par
  convention dans contextOverrides, sans que la consolidation
  ait réellement eu lieu. SOTSWindowGuard passera
  (sotsConsolidated=true fourni), mais le SOTSScoreSnapshot
  ne sera jamais créé par ce chemin.
  Source : SchedulerService.js executeTask() case
  SOTS_WINDOW_EXPIRATION + SOTSWindowGuard contextOverrides
  *"le scheduler consolidera avant de déclencher"* — non implémenté.

- DÉGRADANT-F2 — findDueTasks() filtre en mémoire.
  SchedulerRepository.findDueTasks() récupère toutes les
  tâches `pending` depuis Base44 puis filtre dueAt ≤ now
  en JavaScript. Avec N engagements actifs simultanés, la
  requête retourne toutes les tâches pending sans filtre
  temporel — overhead de pagination et de transfert réseau
  à chaque run. Non-critique pour MVP (faible volume).
  Source : SchedulerRepository.js findDueTasks() — commentaire
  *"Base44 ne supporte pas les comparaisons de dates
  nativement."*

- DÉGRADANT-F3 — HEARTBEAT_MISSING non implémenté.
  D-099 et TEST_REGISTRY Catégorie 6 exigent la détection
  HEARTBEAT_MISSING (dispatcher ne se réveille pas). Aucun
  mécanisme de surveillance externe du cron n'est visible
  dans le code. SchedulerIncidentRecord non créé en cas
  d'absence du dispatcher.
  Source : OS V15 D-099 — *"Surveillance en deux dimensions :
  HEARTBEAT_MISSING et DUE_TASK_OVERDUE."*
  Test requis : SCHEDULER-HEARTBEAT-01 (requiredBeforeEvent=0B).

REPORTABLE (peut attendre l'événement 2+) :

- D-104 CronBudgetPolicyConfig — suivi mensuel des crédits
  cron, 4 états (healthy/watch/critical_only/exhausted).
  SchedulerCreditBudget non implémenté. Non-critique pour
  Event 0A (estimation 3 630 crédits/mois sur 10 000
  disponibles).
  Source : OS V15 D-104.

- SCHEDULER-OVERDUE-01, SCHEDULER-CREDITS-01,
  MIGRATION-TRIGGER-01 : tests P0 Catégorie 6 requis avant
  Event 0B. Non créés dans le ZIP.
  Source : TEST_REGISTRY Catégorie 6.

- ManualJobRunRequest (D-099, D-102) : interface admin pour
  relancer manuellement un job. Non implémenté. Reportable.

ANGLE MORT POTENTIEL :

- Aucune gestion de retry sur tâche échouée. Si une
  SchedulerDueTask passe de `pending` à `failed`, elle ne
  repasse jamais en `pending`. Le dispatcher la saute
  (status != 'pending'). Il n'y a pas de mécanisme de
  retry automatique avec backoff. L'AdminIncidentRecord
  prévient — mais qui remet la tâche en pending ?
  INFÉRENCE NON DOCUMENTÉE — D-099 mentionne `attemptCount`
  dans la structure mais aucune logique de retry n'est
  visible dans le code. À valider avec le fondateur : le
  retry est-il manuel (via ManualJobRunRequest) ou
  automatique ?

- cron.js injecte LedgerRepository et EngagementRepository
  dans les repositories, mais SchedulerService n'utilise
  que scheduler, admin et policyConfig dans runDueTasks().
  executeTask() appelle transitionEngagement() qui lui-même
  peut nécessiter payoutExecutionRecords, settlementInstructions,
  talentPaymentProfiles (pour payable→settled). Ces sous-objets
  ne sont pas dans les repositories de cron.js. Pour CONTESTATION_
  WINDOW_EXPIRATION → payable, si le guard appelle PayoutExecutor,
  il manquera ces repositories.
  INFÉRENCE NON DOCUMENTÉE — à valider : CONTESTATION_WINDOW_
  EXPIRATION déclenche-t-il directement payable→settled ou
  uniquement contestation_window→payable ?

──────────────────────────────────────────────────
4. DETTE HÉRITÉE

Neutre : Domaine entièrement nouveau en V3, pas de dette V1/V2.

Dette interne active :
Le Plan Implantation du 21 mai liste SchedulerService comme
Phase 2 "à créer". Il est livré et testé — même décalage que
pour SOTSSubmissionService (domaine E). Le Plan Implantation
sous-estime l'avancement réel du code.

Le bug de variable BLOQUANT-F1 (runBase44Id circulaire) est
une dette technique introduite lors de la rédaction du service.
Correction triviale (2 lignes) mais potentiellement bloquante
en strict mode.

──────────────────────────────────────────────────
5. DELTA VERS COMPLÉTUDE

Pour la première transaction (Event 0A) : corriger le bug
runBase44Id (ligne 78 de SchedulerService.js), s'assurer
que SchedulerDueTask BALANCE_DEADLINE_CHECK est créée par
EventPaymentGuard à deposit_secured (BLOQUANT-F3), et
accepter que le rail cron soit déclenché manuellement par
le fondateur (`node scripts/cron.js`) pour Event 0A — le
dispatcher est prêt, seul le déploiement automatique reste.

──────────────────────────────────────────────────
6. STATUT FINAL

☑ PRÊT SOUS CONDITIONS

Conditions :
  C1 — Corriger le bug SchedulerService.js L.78
       (runBase44Id déclaration circulaire) — 2 lignes.
  C2 — EventPaymentGuard doit retourner schedulerTask
       BALANCE_DEADLINE_CHECK (BLOQUANT-F3 — Phase 0.3
       non encore livrée).
  C3 — Pour Event 0A : déclenchement manuel de cron.js
       acceptable (SoloFounderOverride documenté).
  C4 — Pour Event 0B : déployer cron.js sur un rail
       externe (Railway ou équivalent).

──────────────────────────────────────────────────
7. DÉPENDANCES SORTANTES

- Domaine A (Ontologie / machine d'état) dépend de ce
  domaine pour que les transitions temporelles s'exécutent
  automatiquement sans intervention humaine — condition
  du FULL SUCCESS D-144 Seuil 2.
  Source : OS V15 D-099 + Plan Implantation Phase 2 Gate.

- Domaine E (SOTS) dépend de ce domaine pour que
  SOTS_WINDOW_EXPIRATION déclenche event_completed →
  sots_window_closed — et idéalement pour que consolida-
  te() soit appelé avant (DÉGRADANT-F1).
  Source : SOTSWindowGuard contextOverrides — *"le
  scheduler consolidera avant de déclencher."*

- Domaine B (Finance) dépend de ce domaine pour que
  CONTESTATION_WINDOW_EXPIRATION déclenche payable et que
  BALANCE_DEADLINE_CHECK arme LOI ANNULATION-02.
  Source : OS V15 D-014-A, D-019-B.

- Domaine G (Admin) dépend de ce domaine pour que les
  AdminIncidentRecord produits sur échec scheduler soient
  tracés dans le DataAccessLedger.
  Source : SchedulerService.js — admin.createAdminIncident-
  Record() sur chaque taskFailed.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FIN DE LA FICHE — F. SCHEDULER
Conserver pour le Prompt de Synthèse.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━