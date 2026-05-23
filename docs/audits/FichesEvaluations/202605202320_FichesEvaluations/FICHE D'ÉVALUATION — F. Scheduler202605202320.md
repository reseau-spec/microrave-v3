━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FICHE D'ÉVALUATION — F. Scheduler
(heartbeat, tâches P0, anti-double, vélocité cron)
Date d'évaluation : 20 mai 2026
Documents sources :
  • MICRORAVE_V3_OPERATING_SYSTEM_V15.md (OS V15 — source souveraine)
  • EXPORT_BRUT—REGISTRES_SOUVERAINS_MICRO_RAVE_V3.md
    (D-099, D-100, D-101, D-102, D-103, D-104,
     TEST_REGISTRY Catégorie 6, FIRST_EVENT_REGISTER)
  • SOTSWindowGuard.js · ContestationWindowGuard.js
  • EventPaymentGuard.js · transitionEngagement.js
  • ArchiveWORMGuard.js · NoShowGuard.js
  • scripts/run-j9-pilot.js
Niveau de confiance : HAUTE sur la doctrine (D-099 à D-104)
                      HAUTE sur les objets SchedulerDueTask
                        retournés par les guards
                      INFÉRENCE sur tout le reste :
                        aucun dispatcher, aucun cron,
                        aucune persistence SchedulerDueTask visible
──────────────────────────────────────────────────
1. CRITÈRES DE COMPLÉTUDE

Ce domaine est prêt pour la première transaction quand :

- SchedulerDueTasks créées et persistées dès leur calcul :
  balance_deadline_check (EventPaymentGuard, D-014-A),
  SOTS_WINDOW_EXPIRATION (SOTSWindowGuard),
  CONTESTATION_WINDOW_EXPIRATION (ContestationWindowGuard)
  — D-099 : "Quand Micro Rave connaît une échéance, elle
  crée le réveil immédiatement", EXPORT_BRUT section D-099
- Dispatcher cron opérationnel : lit les tâches dues,
  applique lockedByRunId (anti-double), exécute
  transitionEngagement() selon le taskType —
  D-099, D-100 : 11 jobs P0, EXPORT_BRUT section D-100
- SCHEDULER-HEARTBEAT-01 PASSED (requiredBeforeEvent=0B) :
  HEARTBEAT_MISSING détecté + AdminIncidentRecord créé —
  EXPORT_BRUT TEST_REGISTRY Catégorie 6
- SCHEDULER-OVERDUE-01 PASSED (requiredBeforeEvent=0B) :
  DUE_TASK_OVERDUE P0 détecté — EXPORT_BRUT TEST_REGISTRY
- SCHEDULER-DOUBLE-01 PASSED (requiredBeforeEvent=0B) :
  lockedByRunId anti-double exécution — EXPORT_BRUT TEST_REGISTRY
- Checklist pré-Event 1 : "SchedulerDueTasks créées" vérifiée
  — EXPORT_BRUT FIRST_EVENT_REGISTER section "Event spécifique"
- SchedulerDueTask cancelled à l'archivage (ArchiveWORMGuard
  vérifie schedulerTasksCancelled=true) — ArchiveWORMGuard.js

Ce domaine bloque tout le reste si :

- Aucune SchedulerDueTask n'est persistée ni consommée → les
  transitions temporelles (balance_deadline_check J-6,
  sots_window_close 24h, contestation_window_expiration 24h)
  ne se déclenchent jamais automatiquement → payout automatique
  impossible sans intervention manuelle → FULL SUCCESS
  inaccessible — D-099, EXPORT_BRUT D-144
- Dispatcher absent → HEARTBEAT_MISSING permanent →
  SCHEDULER-HEARTBEAT-01 FAILED → Event 0B interdit —
  EXPORT_BRUT TEST_REGISTRY requiredBeforeEvent=0B

──────────────────────────────────────────────────
2. ÉTAT ACTUEL DOCUMENTÉ

Ce qui existe et fonctionne selon les documents :

Doctrine complète et validée (D-099 à D-104).
  • Architecture SchedulerDueTask : id, jobKey, dueAt,
    status (pending/processing/done/failed/cancelled),
    lockedByRunId, sourceEventType, sourceEventId,
    policyId, attemptCount — D-099.
  • 11 jobs P0 documentés, 4 P1, 6 P2 — D-100.
  • CronBudgetPolicyConfig 4 états (healthy/watch/
    critical_only/exhausted), estimation MVP ~3630
    crédits/mois sur 10000 — D-104.
  • Surveillance deux dimensions : HEARTBEAT_MISSING +
    DUE_TASK_OVERDUE — D-099.

SchedulerDueTask objects construits par les guards.
  • ContestationWindowGuard retourne schedulerTask
    {systemId, engagementId, taskType:
    'CONTESTATION_WINDOW_EXPIRATION', dueAt, ...}
    à l'appelant — source : ContestationWindowGuard.js.
  • SOTSWindowGuard retourne schedulerTask
    {taskType: 'SOTS_WINDOW_EXPIRATION', ...}
    même quand passed:false (fenêtre pas encore close) —
    source : SOTSWindowGuard.js.
  • ArchiveWORMGuard exige schedulerTasksCancelled=true
    pour cancelled_pre_deposit→archived — source :
    ArchiveWORMGuard.js ligne 323.

Anti-double payout (D-101) opérationnel via PayoutExecutor.
  Verrou 1 lockedByRunId (côté PayoutExecutor) implémenté
  — source : PayoutExecutor.js. Voir Fiche C.

scripts/run-j9-pilot.js — script d'orchestration pilote.
  • Couvre onboarding, KYC, et payout en mode step-by-step —
    source : run-j9-pilot.js.
  • Montre l'architecture cible mais ce n'est pas un
    dispatcher automatique — c'est un script manuel.

Ce qui vient de V1 et est encore actif :
  V1 n'a pas de scheduler formalisé. Les actions temporelles
  (ex. remboursement, relance) sont manuelles. DETTE : aucun
  pattern réutilisable.

Ce qui vient de V2 :
  Néant. V2 abandonnée.

──────────────────────────────────────────────────
3. LACUNES IDENTIFIÉES

BLOQUANT (empêche la première transaction) :

- BLOQUANT-F1 — Aucun dispatcher cron implémenté.
  grep sur src/ pour 'dispatcher', 'heartbeat', 'cron',
  'setInterval', 'SchedulerRun' retourne zéro résultat —
  source : exécution directe. Les guards produisent des
  objets SchedulerDueTask, mais aucun processus ne les
  lit, ne les exécute, ni ne crée de SchedulerRun.
  CONSÉQUENCE DIRECTE : aucune transition temporelle ne
  se déclenche automatiquement :
  — balance_deadline_check à J-6 (LOI ANNULATION-02)
    ne se déclenche pas → l'annulation automatique ne
    se produit pas si le solde est impayé.
  — sots_window_close à J+24h → event_completed ne
    passe jamais à sots_window_closed sans action manuelle.
  — contestation_window expiration à J+48h → payable
    ne se déclenche jamais automatiquement.
  CONSÉQUENCE SYSTÉMIQUE : toute la séquence post-event
  (sots_window_closed → contestation_window → payable →
  settled) requiert une intervention manuelle du fondateur
  pour chaque transition temporelle. C'est par définition
  un CONTROLLED SUCCESS, pas un FULL SUCCESS.

- BLOQUANT-F2 — Persistence des SchedulerDueTask absente.
  Les guards retournent des objets schedulerTask à
  l'appelant, mais aucun code dans transitionEngagement.js
  ne persiste ces objets — source : transitionEngagement.js
  grep 'schedulerTask' retourne zéro. L'appelant de
  transitionEngagement() reçoit guardResult mais
  transitionEngagement lui-même n'expose pas schedulerTask.
  Même si un dispatcher existait, il n'aurait rien à lire
  car aucune SchedulerDueTask n'est jamais écrite en
  database.

- BLOQUANT-F3 — EventPaymentGuard ne crée pas
  balance_deadline_check.
  transitionEngagement.js commente "[D-014-A] EventPaymentGuard
  crée la SchedulerDueTask balance_deadline_check" — source :
  transitionEngagement.js ligne 87. Mais grep sur
  EventPaymentGuard.js retourne zéro occurrence de
  'schedulerTask', 'SchedulerDueTask', 'balance_deadline' —
  source : exécution directe. La surveillance de solde
  (LOI ANNULATION-02, annulation automatique J-6) n'est
  donc pas armée lors du deposit_secured.

- BLOQUANT-F4 — 4 tests P0 scheduler non créés ni passés.
  SCHEDULER-HEARTBEAT-01, SCHEDULER-OVERDUE-01,
  SCHEDULER-DOUBLE-01, SCHEDULER-CREDITS-01 tous
  requiredBeforeEvent=0B — EXPORT_BRUT TEST_REGISTRY
  Catégorie 6. Aucun de ces tests n'existe dans tests/p0/ —
  source : ls tests/p0/ | grep -i scheduler retourne rien.
  Un test FAILED = Event 0B interdit — EXPORT_BRUT D-129.

DÉGRADANT (réduit la qualité, n'empêche pas) :

- Pour Event 1 opéré par le fondateur seul, les transitions
  temporelles peuvent être déclenchées manuellement via
  transitionEngagement() (SoloFounderOverride pour certains
  cas, ou appel direct de la couche Base44). Ce n'est pas
  le FULL SUCCESS mais c'est un CONTROLLED SUCCESS valide
  selon D-144.

- SchedulerRun immuabilité (ADMIN-ABS-SCHEDULERRUN,
  requiredBeforeEvent=0A) — condition remplie par défaut
  si aucun SchedulerRun n'existe. La règle "SchedulerRun
  complété immuable" s'applique quand un dispatcher existe.

- D-103 (ledger imbalance → SchedulerIncidentRecord P0,
  alerte fondateur) non implémenté — non bloquant pour
  Event 1 si le ledger est équilibré.

REPORTABLE (peut attendre l'événement 2+) :

- D-104 CronBudgetPolicyConfig complète — les 4 états
  (healthy/watch/critical_only/exhausted) requièrent un
  SchedulerCreditBudget tracker actif. Non implémenté,
  non bloquant pour Event 1.
- SCHEDULER-CREDITS-01 — requiredBeforeEvent=0B. Peut
  être traité avec les autres tests scheduler.
- P2 jobs (sots_snapshot, checkpoint_cultural_profile,
  fraud_pattern_scan, data_retention_enforcement,
  rounding_reconciliation) — post-Event 1.
- ManualJobRunRequest pour relances admin (D-102) —
  post-Event 1.

ANGLE MORT POTENTIEL :
→ INFÉRENCE NON DOCUMENTÉE 1 : L'OS prescrit un dispatcher
  cron autonome (D-099), mais il ne précise pas sur quel
  infrastructure ce dispatcher tourne pour le MVP. Base44
  supporte-t-il les cron jobs natifs? Si oui, le dispatcher
  peut être implémenté directement dans Base44 (sans Railway
  ni Render séparé). Si non, un service externe est requis
  avec son propre déploiement. Cette décision d'infrastructure
  n'est pas documentée pour Event 1 spécifiquement.

→ INFÉRENCE NON DOCUMENTÉE 2 : L'OS dit "Quand Micro Rave
  connaît une échéance, elle crée le réveil immédiatement"
  (D-099). Cela implique que l'objet SchedulerDueTask doit
  être persisté dans le même appel que la transition qui
  le génère (ex: transitionEngagement() doit persister le
  schedulerTask retourné par ContestationWindowGuard). La
  couche qui fait cette persistence n'est pas documentée
  dans le code V3 livré. Est-ce Base44 UI? Une API
  endpoint? Un hook automatique? À valider.

──────────────────────────────────────────────────
4. DETTE HÉRITÉE

De V1 : aucune dette directe — V1 n'a pas de scheduler.
  La lacune est architecturale, pas héritée.

De la structure Guards-only : les guards calculent les
  SchedulerDueTasks correctement (ContestationWindowGuard,
  SOTSWindowGuard) mais délèguent la persistence à
  l'"appelant". Dans un système sans dispatcher, cet
  "appelant" doit être le fondateur lui-même ou la couche
  Base44. C'est un design intentionnel pour la portabilité
  (D-128), mais il crée une dépendance non résolue pour
  l'automatisation.

──────────────────────────────────────────────────
5. DELTA VERS COMPLÉTUDE

Implémenter la persistence des SchedulerDueTasks depuis
transitionEngagement() (propager guardResult.schedulerTask),
implémenter le dispatcher cron qui lit et exécute les tâches
dues sur l'infrastructure cible, implémenter
balance_deadline_check dans EventPaymentGuard, et créer les
4 tests P0 scheduler (HEARTBEAT-01, OVERDUE-01, DOUBLE-01,
CREDITS-01).

──────────────────────────────────────────────────
6. STATUT FINAL

☑ NON COMMENCÉ (sur la dimension exécution)
  PARTIEL (sur la dimension doctrine + objets guards)

Justification précise :
  Doctrine (D-099 à D-104) : 100% — validée.
  Objets SchedulerDueTask construits par guards : 90% —
    ContestationWindowGuard ✓, SOTSWindowGuard ✓,
    balance_deadline_check manquant dans EventPaymentGuard.
  Persistence des SchedulerDueTasks : 0% — absente.
  Dispatcher cron : 0% — absent.
  Tests P0 scheduler : 0% — non créés.
  Infrastructure cible pour cron : INCONNU — non documentée.

──────────────────────────────────────────────────
7. DÉPENDANCES SORTANTES

- D. Présence (PresenceWindowGuard) dépend du dispatcher
  pour déclencher event_sealed→performed à l'heure exacte
  de l'event — source : OS V15 section 2.7.1.

- E. SOTS dépend du dispatcher pour déclencher
  event_completed→sots_window_closed automatiquement
  24h après la fin de l'event — source : SOTSWindowGuard.js
  schedulerTask SOTS_WINDOW_EXPIRATION.

- B. Finance dépend du dispatcher pour balance_deadline_check
  (LOI ANNULATION-02 — annulation automatique J-6 si
  solde impayé) — source : OS V15 section 2.7.1 D-014-A.

- G. Archivage / GoNoGo dépend de payable automatique, qui
  dépend de CONTESTATION_WINDOW_EXPIRATION, qui dépend du
  dispatcher — source : ContestationWindowGuard.js.
  Sans dispatcher → payout jamais déclenché automatiquement
  → FULL SUCCESS impossible → GoNoGoDecisionRecord = GO
  sans réserves inaccessible.

- INFÉRENCE globale : ce domaine est le système nerveux
  autonome de Micro Rave — source : EXPORT_BRUT D-099
  "SchedulerDueTask" décrit comme "Système nerveux autonome"
  dans l'OBJECT_REGISTRY. Son absence force le fondateur
  à jouer manuellement le rôle du cron pour chaque
  transition temporelle, ce qui est par définition
  une intervention humaine documentée = CONTROLLED SUCCESS.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FIN DE LA FICHE — F. Scheduler
Conserver cette fiche pour le Prompt de Synthèse.