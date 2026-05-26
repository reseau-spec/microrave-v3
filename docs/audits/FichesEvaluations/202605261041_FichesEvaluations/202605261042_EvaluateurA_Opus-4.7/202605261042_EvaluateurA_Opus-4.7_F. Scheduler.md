━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FICHE D'ÉVALUATION — F. Scheduler
Date d'évaluation : 26 mai 2026
Documents sources :
  • docs/os/MICRORAVE_V3_OPERATING_SYSTEM_V15.md (§2.7.1 lignes
    EventPaymentGuard / SOTSWindowGuard / ContestationWindowGuard
    / BalanceDeadlineCheckGuard, §16 « 10 ALERTES P0 »)
  • docs/os/EXPORT_BRUT…REGISTRES_SOUVERAINS_MICRO_RAVE_V3.md
    (D-099 « Le cron réveille; la tâche dit quoi faire »,
    D-100 « jobs P0/P1/P2 », D-101 verrou 1 lockedByRunId,
    D-104 « CronBudgetPolicyConfig 4 états »)
  • codeBase44_v3/base44/functions/scheduleContestationExpiration/
    entry.ts (seule fonction scheduler côté Base44)
  • codeBase44_v3/base44/entities/{SchedulerDueTask,
    SchedulerRun}.jsonc
  • codeBase44_v3/dataBase/ — AUCUN SchedulerDueTask_export.csv,
    AUCUN SchedulerRun_export.csv (les deux entités sont vides)
  • microrave-v3/src/services/SchedulerService.js (portable,
    non branché)
  • microrave-v3/scripts/cron.js (script externe, non déployé
    selon évidence disponible)
  • microrave-v3/package.json (script `cron`, dépendance
    node-cron)
  • microrave-v3/tests/p0/{SCHEDULER-TASK-01,
    ADMIN-ABS-SCHEDULERRUN}.js
  • 20260526-1030_RAPPORT-AUDIT-FORENSIQUE.md — FICHIER VIDE
    (0 octet, INCONNU)
Niveau de confiance : HAUTE pour le constat d'absence (les
    deux tables Scheduler sont vides en V3) ; INFÉRENCE
    sur l'absence de cron déployé (pas de Procfile / railway.toml
    / render.yaml dans l'archive — mais l'archive peut être
    partielle)
──────────────────────────────────────────────────
1. CRITÈRES DE COMPLÉTUDE

   Ce domaine est prêt pour la première transaction quand :

   • Le cron externe se réveille à intervalle régulier (5 min)
     et invoque un dispatcher qui lit les SchedulerDueTask
     status='pending' AND dueAt ≤ now. « Le cron réveille; la
     tâche dit quoi faire. »
     — Source : D-099, EXPORT_BRUT §BLOC 12

   • L'idempotence par lockedByRunId est appliquée : « une tâche
     déjà verrouillée par un runId actif est sautée
     silencieusement — jamais de double exécution. »
     — Source : D-099 + D-101 verrou 1, EXPORT_BRUT §BLOC 12

   • La surveillance double dimension est armée :
       — HEARTBEAT_MISSING (dispatcher ne se réveille pas)
       — DUE_TASK_OVERDUE (tâche P0 dépassée même si dispatcher
         tourne)
     Seuils dans SchedulerPolicyConfig. Alerte P0 #4 « Heartbeat
     manquant » et P0 #5 « SchedulerDueTask P0 expirée ».
     — Source : D-099 + OS V15 §16 « 10 ALERTES P0 »

   • « Quand Micro Rave connaît une échéance, elle crée le réveil
     immédiatement. » Toutes les transitions à effet différé
     doivent armer leur SchedulerDueTask au moment du déclencheur,
     pas plus tard.
     — Source : D-099, phrase canonique 2

   • Les 11 jobs P0 D-100 sont implémentés :
       capture_deposit · deposit_deadline_check ·
       balance_deadline_check · seal_event · sots_window_close ·
       payout_approver · execute_payout_transfer ·
       chargeback_hold · expire_dispute_window ·
       transfer_expiry_check · ledger_balance_check
     — Source : D-100, EXPORT_BRUT §BLOC 12

   • CronBudgetPolicyConfig surveille la consommation cron en
     4 états (healthy < 6 500 cr/mois, watch 6 500-8 000,
     critical_only 8 000-9 900, exhausted > 9 900). « Estimation
     MVP : ~3 630 crédits/mois sur 10 000 disponibles. »
     — Source : D-104, EXPORT_BRUT §BLOC 12

   • Pour Pierre de Rosette canonique, deux échéances cron sont
     nécessaires : SOTS_WINDOW_EXPIRATION (J+1 après
     event_completed, durée 24h) et CONTESTATION_WINDOW_EXPIRATION
     (déclenche payable après expiration sans dispute).
     — Source : OS V15 §2.7.1 lignes SOTSWindowGuard +
       ContestationWindowGuard

   Ce domaine bloque tout le reste si :

   • Sans dispatcher actif, aucune transition cron-déclenchée
     ne s'exécute. La chaîne s'arrête après event_completed
     (le talent confirme la prestation, l'organisateur la valide,
     mais la fenêtre SOTS ne se ferme jamais → contestation_window
     ne s'arme jamais → payable n'arrive jamais → settled n'arrive
     jamais).
     — Source : OS V15 §2.7.1 (chaîne event_completed → … →
       settled)

   • Sans balance_deadline_check armée, LOI ANNULATION-02
     (annulation J-6 si solde impayé) est désarmée. Risque
     opérationnel direct sur la première transaction si le solde
     traîne.
     — Source : D-014-A + OS V15 §2.7.1

──────────────────────────────────────────────────
2. ÉTAT ACTUEL DOCUMENTÉ

   Ce qui existe et fonctionne selon les documents :

   • Entité SchedulerDueTask Base44 conforme au schéma D-099 :
     systemId (SCH-*), engagementId, taskType, dueAt (Unix ms),
     status (pending/processing/done/failed/cancelled),
     lockedByRunId, attemptCount, contextOverrides, cancelReason,
     createdAt. Champs verrouillage et idempotence présents.
     — Source : entities/SchedulerDueTask.jsonc

   • Entité SchedulerRun Base44 : systemId, startedAt,
     completedAt, status (running/completed), tasksProcessed,
     tasksFailed, nowMs. Conforme à D-099 « SchedulerRun
     immuable après complétion ».
     — Source : entities/SchedulerRun.jsonc

   • Une fonction Base44 crée des SchedulerDueTask :
     `scheduleContestationExpiration` (CONTESTATION_WINDOW_
     EXPIRATION, durée 24h depuis PolicyConfig
     contestationWindowDurationHours, idempotente sur
     (engagementId, taskType, status='pending'), contextOverrides
     porte targetState='payable' + actor SYSTEM).
     — Source : functions/scheduleContestationExpiration/entry.ts
       l.78-94 ; appelée depuis src/pages/CompletionFlow.jsx l.140

   • Service portable SchedulerService (microrave-v3/src/services/)
     implémente le dispatcher complet : couvre 3 taskType
     (BALANCE_DEADLINE_CHECK, SOTS_WINDOW_EXPIRATION,
     CONTESTATION_WINDOW_EXPIRATION), idempotency par lockedByRunId,
     résilience (un échec ne casse pas le run, AdminIncidentRecord
     P1 par échec), acteur système 'USR-SYSTEM-SCHED01'.
     — Source : src/services/SchedulerService.js l.1-60

   • Script `scripts/cron.js` (84 lignes) est l'entrée dispatcher
     externe : instancie les 5 repositories, appelle
     SchedulerService.runDueTasks(), retourne exit code 0/1 pour
     que le scheduler hôte (Railway/Render) détecte les échecs.
     `npm run cron` câblé dans package.json.
     — Source : scripts/cron.js + package.json

   • Tests P0 SCHEDULER-TASK-01 et ADMIN-ABS-SCHEDULERRUN existent
     dans tests/p0/.

   Ce qui vient de V1 et est encore actif :

   • Non documenté dans les fichiers soumis. L'OS V15 §1 décrit
     V1 (microrave.ca) sans mention de scheduler.
     → INFÉRENCE : aucun héritage V1 visible sur le scheduler.
       V1 vraisemblablement opéré sans surveillance autonome.
       À valider par le fondateur.

   Ce qui vient de V2 et a survécu :

   • La doctrine D-099 / D-100 / D-104 est V11/V12 — héritage
     doctrinal stable. Le portage en SchedulerService.js portable
     est l'acquis de la phase V2 → V3 (commentaire l.6 « Plan
     Phase 2.2 · Décision fondateur 2026-05-21 Option B »).
     ACQUIS : architecture pure orchestrateur + injection de
     repositories, transitionEngagement seul point d'entrée
     pour les mutations.
     DETTE : aucune trace que cette architecture ait jamais
     produit un SchedulerRun en V3.

──────────────────────────────────────────────────
3. LACUNES IDENTIFIÉES

   BLOQUANT (empêche la première transaction) :

   • Aucun dispatcher déployé côté Base44 ni évidence d'un cron
     externe en production. Le SchedulerService portable est
     codé, cron.js est codé, package.json a `npm run cron` —
     mais aucune trace d'exécution :
       — `SchedulerRun_export.csv` ABSENT de dataBase/
       — `SchedulerDueTask_export.csv` ABSENT de dataBase/
     Le cron n'a jamais tourné en V3. Aucune surveillance
     opérationnelle.
     — Source : ls dataBase/ → absence des deux fichiers

   • Aucun fichier de configuration de déploiement (Procfile,
     railway.toml, render.yaml, vercel.json, Dockerfile,
     systemd unit) dans l'archive microrave-v3 fournie. Si le
     cron externe est censé tourner sur Railway/Render ou ailleurs,
     la preuve n'est pas dans l'artefact.
     — Source : find … -maxdepth 2 -name 'Procfile/railway*/
       render*/*.toml/Dockerfile' → vide
     → INFÉRENCE : déploiement absent ou hors-archive. À valider
       par le fondateur.

   • 10 jobs P0 sur 11 (D-100) ne sont jamais créés : pas de
     fonction `arm_capture_deposit`, `arm_deposit_deadline_check`,
     `arm_balance_deadline_check`, `arm_seal_event`,
     `arm_sots_window_close`, `arm_payout_approver`,
     `arm_chargeback_hold`, `arm_expire_dispute_window`,
     `arm_transfer_expiry_check`, `arm_ledger_balance_check`.
     Seul CONTESTATION_WINDOW_EXPIRATION peut être créé.
     — Source : codeBase44_v3/base44/functions/ (liste exhaustive,
       12 fonctions, une seule scheduler)

   • Les SchedulerDueTask manquantes provoquent un trou systémique
     dans la chaîne. Pour Pierre de Rosette :
       — Au scellement (event_sealed), aucun seal_event task
         (rappel J-3 / J-1 pré-événement).
       — À la réception du dépôt (deposit_secured), aucun
         balance_deadline_check armé → LOI ANNULATION-02
         désarmée → si le solde n'arrive pas, l'engagement
         pourrit silencieusement.
       — À event_completed, aucun sots_window_close armé →
         la fenêtre SOTS ne se ferme jamais → SOTS reste
         soumissible indéfiniment.
       — Seul CONTESTATION_WINDOW_EXPIRATION est armé
         manuellement depuis l'UI (CompletionFlow.jsx l.140) —
         mais même alors, sans dispatcher, la tâche n'est
         jamais déclenchée.
     — Source : OS V15 §2.7.1 + D-100 + functions Base44

   • Heartbeat absent : aucune fonction émet un signal de vie
     pour HEARTBEAT_MISSING. Sans heartbeat, l'alerte P0 #4
     (« Heartbeat manquant ») de la liste OS V15 §16 ne peut
     pas être produite. La V3 ne peut pas savoir que la V3
     est en panne.
     — Source : OS V15 §16 ; D-099 surveillance double dimension

   • SchedulerPolicyConfig et CronBudgetPolicyConfig non
     seedés dans les 36 entrées PolicyConfig. Les seuils
     HEARTBEAT_MISSING, DUE_TASK_OVERDUE, et les 4 états
     budgétaires (healthy / watch / critical_only / exhausted)
     n'ont aucun substrat.
     — Source : dataBase/PolicyConfig_export.csv (recherche
       sots/cron/scheduler/heartbeat)

   • Si le dispatcher tournait demain et trouvait la tâche
     CONTESTATION_WINDOW_EXPIRATION, il tenterait
     `contestation_window → payable` via transitionEngagement.
     Le guardPresenceProof actuel n'évalue qu'« SOTSSubmission
     existe » (cf. Domaine D §3 BLOQUANT). Pour Pierre de
     Rosette, la SOTSSubmission existe (1 record), donc le
     guard passerait — mais la transition serait écrite sans
     vérification des 10 autres conditions D-075. L'effet utile
     du scheduler dépend de la complétude des guards (Domaine D).

   DÉGRADANT (réduit la qualité, n'empêche pas) :

   • `scheduleContestationExpiration` persiste `contextOverrides`
     en `JSON.stringify` (l.86) alors que le schéma SchedulerDueTask
     déclare `"type": "object"`. Soit l'entité ment, soit la
     fonction ment. Le dispatcher portable devra savoir
     parser/déparser cette divergence.
     — Source : SchedulerDueTask.jsonc l.34-37 vs
       scheduleContestationExpiration/entry.ts l.86-92

   • L'autorisation système est faible : `isSystem = me.id?.
     startsWith('USR-SYSTEM') || me.email?.includes('@system.')`
     (l.45). Un email contenant '@system.' suffit à passer pour
     système. Mineur en pratique (l'autorisation organisateur
     est l'usage nominal), mais surface non hygiénique.
     — Source : scheduleContestationExpiration/entry.ts l.45

   • Fallback hardcodé `durationHours = 24` (l.67) si la config
     `contestationWindowDurationHours` est absente. La doctrine
     fail-closed (D-063 contexte SOTSConfidencePolicy) suggère
     plutôt d'échouer si la config manque. Mineur car la valeur
     est seedée dans PolicyConfig (`sots_window_duration_hours
     = 24` existe mais pas `contestationWindowDurationHours` —
     à confirmer).
     — Source : scheduleContestationExpiration/entry.ts l.67-73

   • `attemptCount: 0` initialisé mais jamais incrémenté
     ailleurs — logique de retry absente car le dispatcher
     Base44 n'existe pas. La résilience est codée seulement
     côté portable.

   REPORTABLE (peut attendre l'événement 2+) :

   • ManualJobRunRequest (D-099 « champs : adminUserId,
     targetJobKey, reasonCode, policyId, adminActionId »)
     non implémenté comme entité Base44. Permet le rejeu
     manuel admin d'un job. Reportable car aucun job n'a encore
     besoin d'être rejoué — il faudrait d'abord qu'il puisse
     s'exécuter.

   • SchedulerCreditBudget objet de suivi mensuel (D-104) — non
     présent en entités Base44. Reportable post-Event 1, mais
     blocage potentiel à 3 mois d'opération continue
     (MigrationTriggerPolicyConfig).

   • Jobs P1 (saas_revenue_recognition_daily,
     tax_remittance_reminder, etc.) et P2 (sots_snapshot,
     checkpoint_cultural_profile, fraud_pattern_scan, etc.) —
     non implémentés. Reportables.

   ANGLE MORT POTENTIEL :

   D-099 phrase canonique : « Quand Micro Rave connaît une
   échéance, elle crée le réveil immédiatement. » Cela suggère
   un couplage fort entre transitionEngagement et la création
   automatique des SchedulerDueTask aux moments de transition
   pertinents (par exemple : à `deposit_secured`, créer
   automatiquement balance_deadline_check ; à `event_completed`,
   créer automatiquement sots_window_close). L'OS V15 ne dit pas
   explicitement où dans le code cet armement doit se produire —
   à l'intérieur du guard ? Dans un hook post-transition ? Dans
   une fonction séparée invoquée par l'UI ?
   → INFÉRENCE NON DOCUMENTÉE : le pattern d'armement automatique
     n'est pas précisé. L'implémentation portable
     transitionEngagement n'arme rien automatiquement (vérifié
     par recherche : aucun `SchedulerDueTask.create` dans
     src/core/transitionEngagement.js). L'OS attend
     vraisemblablement que chaque guard pertinent crée sa
     tâche. À trancher et documenter par le fondateur.

──────────────────────────────────────────────────
4. DETTE HÉRITÉE

   La V3 hérite d'une décision architecturale claire (« Décision
   fondateur 2026-05-21 Option B » référencée dans
   SchedulerService.js l.6) : cron externe + dispatcher portable
   injecté + Base44 reste passif. C'est doctrinalement sain.

   Mais la V3 n'hérite d'aucune infrastructure de déploiement
   visible. L'écart entre la doctrine codée et l'exploitation
   est total : zéro SchedulerRun, zéro SchedulerDueTask en
   production. Le système nerveux autonome est conçu, écrit, et
   inerte. Pour Pierre de Rosette qui dépend de deux échéances
   cron, cette inertie est terminale.

──────────────────────────────────────────────────
5. DELTA VERS COMPLÉTUDE

   Pour que le domaine soit prêt : (i) déployer le cron externe
   (Railway scheduled job ou équivalent) pour invoquer
   scripts/cron.js toutes les 5 min — produire le premier
   SchedulerRun et le rendre visible en base, (ii) ajouter les
   armements automatiques de SchedulerDueTask à l'intérieur des
   transitions concernées : balance_deadline_check à
   deposit_secured, sots_window_close à event_completed,
   contestation_window_expiration à sots_window_closed, (iii)
   ajouter un job heartbeat qui écrit une marque toutes les
   5 min permettant la détection HEARTBEAT_MISSING, (iv) seeder
   SchedulerPolicyConfig et CronBudgetPolicyConfig pour que les
   seuils de surveillance et le compteur de crédits aient un
   substrat.

──────────────────────────────────────────────────
6. STATUT FINAL

   ☑ NON COMMENCÉ (en production) — la doctrine et le code
     portable existent (~ 75 % de l'architecture cible), mais
     l'exécution effective est à zéro.

   Détail :
     — Entités Base44 (SchedulerDueTask, SchedulerRun) : 100 %
       schématisées.
     — SchedulerService portable + cron.js : 100 % codés.
     — Tests P0 SCHEDULER-TASK-01 + ADMIN-ABS-SCHEDULERRUN :
       100 % codés, ressentis hors-ligne.
     — Armement automatique des tâches dans transitions : 0 %
       (une seule tâche, créée manuellement via UI).
     — Dispatcher branché côté Base44 : 0 %.
     — Cron externe déployé : 0 % (preuve manquante dans
       artefact).
     — Heartbeat + surveillance HEARTBEAT_MISSING / DUE_TASK_
       OVERDUE : 0 %.
     — CronBudgetPolicyConfig + SchedulerCreditBudget : 0 %.
     — Couverture taskType : 1/11 jobs P0 D-100 (uniquement
       CONTESTATION_WINDOW_EXPIRATION).
   Effectif fonctionnel pour première transaction réelle : 0 %.

──────────────────────────────────────────────────
7. DÉPENDANCES SORTANTES

   • Domaine A (machine d'état) — la transition
     `sots_window_closed → contestation_window` est typiquement
     déclenchée par une tâche sots_window_close (D-100). Tant
     que cette tâche n'est pas armée et exécutée, la chaîne
     bloque à event_completed.
     — Source : OS V15 §2.7.1

   • Domaine A et Domaine B — `contestation_window → payable`
     dépend de CONTESTATION_WINDOW_EXPIRATION qui est armée
     manuellement (UI) mais ne se déclenche jamais sans
     dispatcher. Le payable n'est jamais atteint
     automatiquement.
     — Source : OS V15 §2.7.1

   • Domaine B (finance) — balance_deadline_check (LOI
     ANNULATION-02) protège l'organisateur ET MR contre un solde
     impayé. Sans cette tâche, un dépôt encaissé non suivi
     d'un solde reste indéfiniment en limbe deposit_secured.
     — Source : D-014-A + D-100

   • Domaine C (Stripe) — par contagion : la transition
     `deposit_pending → deposit_secured` (Domaine C) devait
     créer la balance_deadline_check (Domaine F) selon §2.7.1.
     Tant que C bypasse transitionEngagement et que F n'arme
     pas la tâche, la chaîne d'enchaînement est cassée à
     deux endroits simultanément.
     — Source : OS V15 §2.7.1 ligne EventPaymentGuard ;
       Domaine C fiche §3 BLOQUANT

   • Domaine E (SOTS) — sots_window_close (Moment WORM 5) est
     un job P0 D-100. La consolidation EMA et la création du
     SOTSScoreSnapshot exigent l'exécution de cette tâche.
     Tant que le dispatcher est inerte, Moment 5 n'a pas lieu.
     — Source : OS V15 §2.7 Moment 5 ; D-100

   • Domaine G (admin) — alerte P0 #4 (Heartbeat manquant) et
     #5 (SchedulerDueTask P0 expirée) attendent du Scheduler
     les signaux qu'il ne peut pas émettre. Le système
     d'alerte est sourd parce que la source est muette.
     — Source : OS V15 §16

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FIN DE LA FICHE — F. Scheduler
Fiche conservée en mémoire de session pour Prompt de Synthèse.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━