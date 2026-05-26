━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FICHE D'ÉVALUATION — F. SCHEDULER
Date d'évaluation : 26 mai 2026
Documents sources :
  • MICRORAVE_V3_OPERATING_SYSTEM_V15.md (OS V15)
  • src/services/SchedulerService.js
  • src/repositories/SchedulerRepository.js
  • scripts/cron.js
  • codeBase44_v3/base44/entities/SchedulerDueTask.jsonc
  • codeBase44_v3/base44/entities/SchedulerRun.jsonc
  • codeBase44_v3/base44/functions/scheduleContestationExpiration/entry.ts [DÉPLOYÉ]
  • codeBase44_v3/base44/functions/ (liste complète — pas de dispatcher)
  • codeBase44_v3/dataBase/ — absence de SchedulerDueTask_export.csv
  • codeBase44_v3/dataBase/ — absence de SchedulerRun_export.csv
  • tests/p0/SCHEDULER-TASK-01.js, ADMIN-ABS-SCHEDULERRUN.js
Niveau de confiance : HAUTE sur le code canonique ;
                     HAUTE sur l'absence de déploiement du dispatcher.
──────────────────────────────────────────────────
1. CRITÈRES DE COMPLÉTUDE
   (Tirés de l'OS V15)

Ce domaine est prêt pour la première transaction quand :

• Un processus externe déclenche `scripts/cron.js` toutes les 5 minutes
  — D-099 : "Le cron réveille; la tâche dit quoi faire." Source :
  scripts/cron.js header "appele toutes les 5 minutes".

• Trois taskTypes sont traités par le dispatcher : BALANCE_DEADLINE_CHECK
  (deposit_secured→cancelled_J7), SOTS_WINDOW_EXPIRATION
  (event_completed→sots_window_closed), CONTESTATION_WINDOW_EXPIRATION
  (contestation_window→payable) — Source : SchedulerService.js
  executeTask() switch + OS V15 §2.7.1 transitions table.

• Toute SchedulerDueTask en pending avec dueAt ≤ now est traitée
  exactement une fois — idempotency garantie par lockedByRunId —
  D-099 : "lockedByRunId garantit qu'une tâche ne peut être exécutée
  que par un seul SchedulerRun à la fois."

• Chaque SchedulerRun complété est immuable — D-107 interdit #13 :
  "Modifier un SchedulerRun complété." ADMIN-ABS-SCHEDULERRUN prouvé.

• Sur échec d'une tâche : AdminIncidentRecord P1 créé, le run continue
  (résilience maximale) — Source : SchedulerService.js "Un échec sur
  une tâche n'arrête pas les suivantes."

Ce domaine bloque tout le reste si :

• Aucun processus ne déclenche le dispatcher — les transitions
  time-sensitive (balance deadline J-6, SOTS 24h, contestation 24h)
  ne se déclenchent jamais automatiquement. Le système devient captif
  de l'intervention manuelle du fondateur sur chaque événement.
  OS V15 §2.7.1 : ces transitions sont marquées allowedActors:['system'].

──────────────────────────────────────────────────
2. ÉTAT ACTUEL DOCUMENTÉ

Ce qui existe et fonctionne selon les documents :

  COUCHE JS CANONIQUE — COMPLÈTE ET TESTÉE :
  SchedulerService.js : runDueTasks() + executeTask() complets.
  Idempotency D-099 (lockedByRunId). Résilience (continue sur échec).
  AdminIncidentRecord P1 sur chaque échec. SchedulerRun immuable D-107.
  Trois taskTypes câblés sur transitionEngagement() (seul point d'entrée).
  SCHEDULER-TASK-01 : 7/7 PASSED.
  ADMIN-ABS-SCHEDULERRUN : 4/4 PASSED (deleteRun absent du repository).

  SchedulerRepository.js : CRUD complet. createTask(), findDueTasks(),
  markProcessing(), markDone(), markFailed(), markCancelled(),
  cancelAllPendingTasksForEngagement(), createRun(), completeRun().

  scripts/cron.js : entry point pour exécution externe one-shot.
  Modes documentés : Railway/Render scheduled job OU node-cron daemon.
  process.exit(1) si tasksFailed > 0 (détection d'échec pour Railway).

  COUCHE DÉPLOYÉE BASE44 :
  Une seule fonction déployée : scheduleContestationExpiration/entry.ts.
  Rôle : créer une SchedulerDueTask CONTESTATION_WINDOW_EXPIRATION pour
  un engagement en état contestation_window. Idempotency : retourne
  la tâche existante si pending. Lit PolicyConfig contestationWindow
  DurationHours (24h). Source : entry.ts.

  AUCUN DISPATCHER DÉPLOYÉ dans Base44 :
  La liste des 12 fonctions Base44 déployées ne contient pas de dispatcher
  cron. Il n'existe pas de Base44 function équivalent à scripts/cron.js.
  Base44 ne dispose pas de déclencheur temporel natif (cron) — toute
  exécution temporelle requiert un processus externe.

Ce qui vient de V1 et est encore actif :
  V1 n'avait pas de scheduler formalisé. Aucun acquis ni dette.

Ce qui vient de V2 et a survécu :
  Aucun.

──────────────────────────────────────────────────
3. LACUNES IDENTIFIÉES

BLOQUANT — pour l'autonomie du système (non bloquant si pilote supervisé) :

• [B-F-01] DISPATCHER CRON NON DÉPLOYÉ EN PRODUCTION.
  scripts/cron.js existe et est correct, mais il n'est déployé sur
  aucune infrastructure externe (pas de railway.json, render.yaml ou
  configuration de déploiement dans le codebase). Aucun SchedulerDueTask
  ni SchedulerRun en production (exports absents de la DB). Le pilote
  ENG-H5V66Q-WBJ7N2 a été archivé sans aucune tâche scheduler.
  Source : absence de SchedulerDueTask_export.csv + SchedulerRun_export.csv
  + liste des fonctions Base44 déployées (12 fonctions, 0 dispatcher).
  Catégorisation : NON BLOQUANT pour Event 1 si le fondateur déclenche
  les transitions manuellement. BLOQUANT pour toute autonomie post-Event 1.

DÉGRADANT (réduit la qualité, n'empêche pas le pilote) :

• [D-F-01] Les guards canoniques génèrent des SchedulerDueTasks
  (SOTSWindowGuard, ContestationWindowGuard) mais personne ne les
  persiste en production.
  Le deployed transitionEngagement/entry.ts ne lit pas le résultat
  des guards et ne persiste aucune SchedulerDueTask. Les guards
  canoniques JS retournent { schedulerTask } dans leur résultat mais
  ce champ est ignoré par la couche Base44 déployée. Résultat : même
  si le cron était déployé, il ne trouverait aucune tâche à traiter
  car aucune tâche n'est jamais créée par le chemin nominal déployé
  (sauf via scheduleContestationExpiration explicitement appelé).
  Source : transitionEngagement/entry.ts (aucune écriture sur
  SchedulerDueTask après appel des guards).

• [D-F-02] SchedulerService.executeTask() appelle transitionEngagement()
  de la couche JS canonique (src/core/transitionEngagement.js) — pas
  la fonction déployée Base44. Si le cron.js était déployé en externe,
  les transitions scheduler passeraient par la couche JS (47 transitions,
  18 guards, WORM 6 moments) plutôt que par la couche Base44 déployée
  (15 transitions, 5 guards simplifiés). Ce couplage est probablement
  intentionnel (le cron opère comme un client Node.js sur la même DB)
  mais crée une dualité architecturale supplémentaire.

• [D-F-03] Balance deadline check (BALANCE_DEADLINE_CHECK) : aucune
  SchedulerDueTask de ce type n'est jamais créée dans le déployé.
  La fonction qui devrait créer cette tâche (transitionEngagement au
  moment de placed→deposit_pending) ne le fait pas — le createEngagement
  déployé ne persiste pas de deadline. Pour Event 1, si l'organisateur
  paie la balance à temps, non-bloquant. Si non, la deadline devra être
  vérifiée et la transition deposit_secured→cancelled_J7 déclenchée
  manuellement.

REPORTABLE (peut attendre l'événement 2+) :

• Heartbeat / monitoring : aucun signal de santé du cron. Si Railway
  manque un déclenchement, aucune alerte automatique.
• Retry logic : une tâche failed reste en status 'failed' — aucun
  mécanisme de retry automatique (maxAttempts non implémenté).
• SOTS_WINDOW_EXPIRATION : la tâche n'est jamais créée dans le déployé
  (voir D-F-01). À câbler dans la transition performed→event_completed.

ANGLE MORT POTENTIEL :
Y a-t-il quelque chose que ce domaine requiert pour la première
transaction que l'OS ne documente pas explicitement ?

→ OUI — INFÉRENCE NON DOCUMENTÉE : L'OS (D-099) dit "quand Micro Rave
  connaît une échéance, elle crée le réveil immédiatement." Ceci implique
  que la création de SchedulerDueTask doit être atomique avec la transition
  qui ouvre la fenêtre. Mais ni la transition event_completed (qui devrait
  créer SOTS_WINDOW_EXPIRATION) ni la transition sots_window_closed (qui
  devrait créer CONTESTATION_WINDOW_EXPIRATION) ne persistent de tâches
  dans le déployé. L'OS ne définit pas explicitement QUAND et COMMENT le
  `scheduleContestationExpiration` doit être appelé dans le flux nominal.
  Il est documenté comme une fonction appelable, mais l'appelant n'est pas
  défini. Pour Event 1 : qui appelle scheduleContestationExpiration — l'UI
  organisateur, le fondateur manuellement, ou une autre fonction ?
  À valider par le fondateur.

──────────────────────────────────────────────────
4. DETTE HÉRITÉE

Aucune dette V1/V2. La dette interne V3 est architecturale :
le dispatcher (scripts/cron.js) est un processus Node.js externe
conçu pour Railway/Render, alors que toute la logique déployée est
dans Base44 (Deno). Cette fracture architecturale (JS externe + Deno
déployé) est une décision délibérée ("Decision fondateur 2026-05-21
Option B" selon le header de scripts/cron.js) mais elle n'a pas encore
été matérialisée par un déploiement réel.

──────────────────────────────────────────────────
5. DELTA VERS COMPLÉTUDE

Pour que le scheduler soit actif sur Event 1 : déployer scripts/cron.js
sur Railway ou Render en job programmé toutes les 5 minutes, ET câbler
la création automatique de SchedulerDueTasks dans les transitions
deployed (event_completed→sots_window_closed crée SOTS_WINDOW_EXPIRATION,
sots_window_closed→contestation_window crée CONTESTATION_WINDOW_EXPIRATION).
Alternative pilote : procédure opérationnelle de déclenchement manuel
par le fondateur pour Event 1.

──────────────────────────────────────────────────
6. STATUT FINAL

  ☑ PRÊT SOUS CONDITIONS

  Pour Event 1 piloté (fondateur présent) : les trois transitions
  time-sensitive peuvent être déclenchées manuellement via transitionEngagement.
  Le risque opérationnel est faible si le fondateur est disponible J+24h
  et J+48h post-event pour déclencher SOTS_close et contestation_close.

  Pour toute autonomie ou Event 2+ sans surveillance : déploiement
  du cron externe obligatoire avant mise en production autonome.

  Le code canonique est complet et testé. L'infrastructure de déploiement
  est la seule pièce manquante.

──────────────────────────────────────────────────
7. DÉPENDANCES SORTANTES

• E. SOTS et réputation dépend de ce domaine pour le déclenchement
  automatique de event_completed→sots_window_closed après 24h et
  sots_window_closed→contestation_window. Sans scheduler, E reste en
  attente d'intervention manuelle — OS V15 §2.7.1 table (allowedActors:
  system pour ces transitions).

• D. Présence dépend de ce domaine pour le déclenchement automatique
  de contestation_window→payable à expiration — OS V15 §2.7.1 D-019-B.

• A. Ontologie (machine d'état) dépend de ce domaine pour BALANCE_DEADLINE
  CHECK — deposit_secured→cancelled_J7 si balance non payée à J-6.
  Sans scheduler, la deadline J-6 n'est pas appliquée automatiquement.

  INFÉRENCE : si le fondateur déclenche ces transitions manuellement,
  les dépendances ci-dessus sont satisfaites pour Event 1. La décision
  "pilote supervisé vs déploiement automatisé" doit être formalisée
  avant J-1 de Event 1 commercial.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FIN DE LA FICHE — F. SCHEDULER
Conserver pour le Prompt de Synthèse.