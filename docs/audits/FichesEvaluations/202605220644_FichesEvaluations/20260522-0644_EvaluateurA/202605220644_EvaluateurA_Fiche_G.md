━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FICHE D'ÉVALUATION — G. ADMIN ET SÉCURITÉ
(19 interdits, DataAccessLedger, double validation, PolicyConfig)

Date d'évaluation : 22 mai 2026 07:17 EST
Documents sources :
  • MICRORAVE_V3_OPERATING_SYSTEM_V15.md (OS V15)
  • EXPORT_BRUT—REGISTRES_SOUVERAINS_MICRO_RAVE_V3.md
    (D-095, D-106, D-107, D-108, D-111, TEST_REGISTRY Catégorie 5)
  • src/repositories/AdminRepository.js
  • src/adapters/base44/PolicyConfigAdapter.js
  • src/core/policy-config-resolver.js
  • src/core/transitionEngagement.js (Guard 5 — extrait)
  • config/policy-config-schema.js (CRITICAL_CONFIG_KEYS)
  • scripts/seed-policy-config.js
  • docs/PlanImplantation/20260521-0942_Plan_Implantation.md
  • tests/p0/ : ADMIN-ABS-DAL-01, ADMIN-ABS-BUGREPLAY,
    ADMIN-ABS-INCIDENT, ADMIN-ABS-SCHEDULERRUN, ADMIN-ABS-SYSTEMID,
    ADMIN-SOLO-02, ADMIN-POLICY-SOLO-01 (ADMIN-EXPORT-01,
    POLICY-CHANGE-01, POLICY-CRITICAL-01, ADMIN-SOLO-03),
    ADMIN-AUDITOR-01, ADMIN-CELL-SECRET-01, ADMIN-DEV-FINANCE-01,
    ADMIN-SUPPORT-PAYOUT-01, POLICY-DIRECT-01,
    POLICYCONFIG-FAILCLOSED-01, DATAACCESS-WRITE-01,
    DATAACCESS-FAIL-01

Niveau de confiance : HAUTE pour AdminRepository, PolicyConfig-
  Adapter, policy-config-resolver, et le câblage Guard 5.
  HAUTE pour les tests P0 présents (logique pure, mocks — pas de
  dépendance réseau sauf POLICYCONFIG-FAILCLOSED-01 test 5).
  PARTIELLE pour l'enforcement runtime des 19 interdits (validé
  par interface API mais pas par un accès DB direct bloquant).
  INFÉRENCE pour les rôles admin (CELL_MANAGER, AUDITOR_EXTERNAL,
  DEV_ADMIN) — tests présents mais implémentation des rôles dans
  Base44 non visible dans le ZIP.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

──────────────────────────────────────────────────
1. CRITÈRES DE COMPLÉTUDE

Ce domaine est prêt pour la première transaction quand :

- Guard 5 de transitionEngagement() appelle
  repositories.admin.appendToDataAccessLedger() sur toute
  mutation de status. LOI GREFFIER-01 — traçabilité complète
  des transitions.
  Source : OS V15 D-095, D-107, Plan Implantation §0.5.

- SoloFounderOverride produit obligatoirement un AdminAction
  + AdminIncidentRecord avec reasonCode, avant d'être
  exécuté. D-106 — *"C'est une exception qui doit rester
  exceptionnelle."*
  Source : OS V15 D-106.

- PolicyConfig fail-closed : toute clé absente bloque le
  système, jamais de valeur par défaut silencieuse.
  validateCriticalConfigs() au démarrage.
  Source : OS V15 D-063, policy-config-resolver.js.

- Les 20 configs fondamentales sont seedées en base et
  lisibles avant tout Event.
  Source : Plan Implantation "PolicyConfig : 20 configs
  seedées en base."

Ce domaine bloque tout le reste si :

- DataAccessLedger non persisté + repositories.admin
  absent : LOI GREFFIER-01 non vérifiable, contournements
  UI Base44 indétectables.
  Source : Plan Implantation §0.5 — *"BLOQUANT Event 0B
  (DATAACCESS-WRITE-01 requis)."*
  NOTE : Guard 5 est non-bloquant si repositories.admin
  absent (conception intentionnelle pour Event 0A pilote).

- PolicyConfig fail-closed non respecté : un guard critique
  (PresenceProofGuard, SealingGuard) utilise une valeur de
  fallback implicite au lieu de bloquer — décisions finan-
  cières sur des données non validées.
  Source : OS V15 D-063, policy-config-resolver.js RÈGLE
  ABSOLUE FAIL-CLOSED.

──────────────────────────────────────────────────
2. ÉTAT ACTUEL DOCUMENTÉ

Ce qui existe et fonctionne selon les documents :

- AdminRepository : complet. appendToDataAccessLedger()
  (APPEND-ONLY, validation actorUserId + targetObjectId),
  createAdminAction() (validation actorUserId + actionType
  + reasonCode), createAdminIncidentRecord() (validation
  incidentType + severity), createPolicyConfigChangeRecord()
  (validation configKey + changedBy + adminActionId).
  Aucune méthode DELETE ou UPDATE sur DataAccessLedger,
  AdminAction, AdminIncidentRecord — interdits #9/14 de
  D-107 enforced par interface.
  Source : AdminRepository.js — exports exhaustifs.

- Guard 5 câblé dans transitionEngagement() : vérifie
  `if (repositories.admin && typeof repositories.admin.
  appendToDataAccessLedger === 'function')` avant d'écrire.
  Non-bloquant si absent (SoloFounderOverride Event 0A).
  Échec d'écriture DAL → AdminIncidentRecord DAL_WRITE_FAILED
  P0 créé automatiquement.
  Source : transitionEngagement.js L.368–392.

- PolicyConfigResolver : fail-closed strict. getConfig()
  lève POLICY_CONFIG_MISSING si la clé est absente ou null
  — jamais de valeur par défaut silencieuse. Cache 1 minute.
  validateCriticalConfigs() vérifie toutes les clés
  CRITICAL_CONFIG_KEYS au démarrage. CRITICAL_CONFIG_KEYS
  dérivé dynamiquement de policy-config-schema.js (jamais
  hardcodé).
  Source : policy-config-resolver.js RÈGLE ABSOLUE.

- PolicyConfigAdapter : isConnected() pour vérifier la
  disponibilité avant appel. Mode dégradé (warning + null)
  si BASE44_API_KEY absent. upsert() idempotent.
  Source : PolicyConfigAdapter.js complet.

- 20 configs seedées confirmées : Plan Implantation "Policy-
  Config : 20 configs seedées en base." seed-policy-config.js
  est idempotent (vérifie avant d'insérer). Mise à jour du
  21 mai ajoute 4 configs guards post-event.
  Source : seed-policy-config.js + Plan Implantation.

- Tests P0 présents (requiredBeforeEvent=0A) :
  ADMIN-ABS-DAL-01, ADMIN-ABS-BUGREPLAY, ADMIN-ABS-INCIDENT,
  ADMIN-ABS-SCHEDULERRUN, ADMIN-ABS-SYSTEMID (5 interdits
  d'immuabilité), ADMIN-SOLO-02 (D-106 trace obligatoire),
  ADMIN-POLICY-SOLO-01 (ADMIN-EXPORT-01 + POLICY-CHANGE-01
  + POLICY-CRITICAL-01 + ADMIN-SOLO-03), ADMIN-AUDITOR-01,
  ADMIN-CELL-SECRET-01, ADMIN-DEV-FINANCE-01, ADMIN-SUPPORT-
  PAYOUT-01, POLICY-DIRECT-01, POLICYCONFIG-FAILCLOSED-01,
  DATAACCESS-WRITE-01, DATAACCESS-FAIL-01.
  Total : 15 fichiers de tests, couvrant tous les cas
  requiredBeforeEvent=0A du TEST_REGISTRY Catégorie 5.
  Source : tests/p0/ — inventaire complet.

- D-107 interdits #1–19 : enforced par architecture —
  les interfaces repository n'exposent pas de méthodes
  DELETE/UPDATE sur les entités immuables. Les interdits
  structurels (contournement WORM, double payout) sont
  enforced par les guards et PayoutExecutor.
  Source : AdminRepository.js (aucun deleteDataAccessLedger
  exporté) + ADMIN-ABS-DAL-01 T-01/T-02 PASSED.

Ce qui vient de V1 et est encore actif :

- INFÉRENCE : V1 n'avait pas de DataAccessLedger ni de
  PolicyConfig formalisés. Pas de dette directe. Avantage :
  V3 construit sur une doctrine explicite dès le départ.

Ce qui vient de V2 et a survécu :

- V2 abandonnée. Aucune dette identifiée.

──────────────────────────────────────────────────
3. LACUNES IDENTIFIÉES

BLOQUANT (empêche la première transaction) :

- BLOQUANT-G1 — DataAccessLedger non persisté pour
  Event 0A. Guard 5 est non-bloquant si repositories.admin
  absent. Pour Event 0A pilote, si le fondateur appelle
  transitionEngagement() sans injecter AdminRepository,
  toutes les mutations de status passent sans trace dans
  le DAL. LOI GREFFIER-01 non satisfaite pour cet event.
  Source : transitionEngagement.js L.368 — *"Non-bloquant
  si repositories.admin absent (SoloFounderOverride Event 0
  pilote)."*
  NOTE : C'est une décision architecturale consciente, pas
  une anomalie. La question est : accepte-t-on que Event 0A
  laisse des transitions sans trace DAL ? Si oui, c'est
  un CONTROLLED SUCCESS documenté. Si non, AdminRepository
  doit être injecté dans tout appelant de transition-
  Engagement.

- BLOQUANT-G2 — Double validation (D-108 CRITIQUE) non
  implémentée côté enforcement runtime. POLICY-CRITICAL-01
  (T-06/T-07) vérifie la logique de double validation
  comme pure fonction (checkDualApproval() dans le test).
  Mais aucun service ou middleware dans le code source
  n'intercepte une tentative de modification de TaxConfig,
  LedgerCodeMap ou MembershipPlan sans second approbateur.
  La double validation est documentée et testée unitairement
  — pas enforced en production.
  Source : ADMIN-POLICY-SOLO-01 T-06/T-07 — logique pure
  dans le test, pas dans un service de gouvernance réel.
  NOTE : Pour Event 0A (fondateur seul, configs déjà
  seedées), ce bloquant est sans impact. Bloquant pour
  toute modification de config CRITIQUE en production.

DÉGRADANT (réduit la qualité, n'empêche pas) :

- DÉGRADANT-G1 — Rôles admin (CELL_MANAGER, AUDITOR_
  EXTERNAL, DEV_ADMIN, SUPPORT_ADMIN, FINANCE_ADMIN, etc.)
  non implémentés dans Base44. Les tests ADMIN-CELL-SECRET-
  01, ADMIN-AUDITOR-01, ADMIN-DEV-FINANCE-01, ADMIN-SUPPORT-
  PAYOUT-01 vérifient la logique de contrôle d'accès comme
  fonctions pures. Mais aucun système d'authN/authZ dans
  Base44 n'implémente ces rôles au niveau de l'API — n'importe
  quel utilisateur authentifié peut appeler n'importe quelle
  entité Base44. La Admin Authority Matrix D-112 est
  doctrinalement correcte mais opérationnellement absente.
  Source : registres D-105, D-112 — admin roles non visibles
  dans repositories/index.js ou src/.

- DÉGRADANT-G2 — PolicyConfigAdapter mode dégradé silencieux.
  Si BASE44_API_KEY est valide mais que la clé cherchée
  n'existe pas en base, findByKey() retourne null. Policy-
  ConfigResolver lève POLICY_CONFIG_MISSING (fail-closed
  correct). Mais si la clé retourne null pour une raison
  réseau ou 500 Base44, l'erreur est swallowed dans l'adapter
  (console.error + return null), PolicyConfigResolver reçoit
  null, et lève POLICY_CONFIG_MISSING — ce qui est correct
  mais masque l'erreur réseau réelle.
  Source : PolicyConfigAdapter.js findByKey() — *"console.
  error + return null"* sur erreur réseau.

- DÉGRADANT-G3 — Les 19 interdits #17 (MoneyMovementRouter)
  et #18 (SettlementInstruction sans DecisionRecord) ne sont
  pas enforced dans le code actuel. #17 est discuté en
  fiche B (BLOQUANT-B1). #18 : la SettlementInstruction est
  créée directement dans repositories/index.js sans
  vérification de DecisionRecord présent (hors chaîne
  LOI DISPUTE-01).
  Source : D-107 liste interdits #17/18 vs repositories/
  index.js settlementInstructions.create().

REPORTABLE (peut attendre l'événement 2+) :

- Tests P0 ADMIN-ROLE-01 (requiredBeforeEvent=0A dans le
  TEST_REGISTRY mais libellé "ADMIN-ROLE-02" dans le registre)
  et ADMIN-COI-01 (si dispute) : non présents dans le ZIP.
  Source : TEST_REGISTRY Catégorie 5.

- D-137 BugReplayRecord : test ADMIN-ABS-BUGREPLAY présent
  (vérifie immuabilité) mais aucun service ne crée des
  BugReplayRecord en pratique. Reportable.

- D-111 export massif et séparation des pouvoirs : ADMIN-
  EXPORT-01 PASSED dans ADMIN-POLICY-SOLO-01, mais sans
  service d'export réel. Logique pure validée, implémentation
  reportable.

ANGLE MORT POTENTIEL :

- PolicyConfigAdapter.findByKey() retourne null si la clé
  n'existe pas. policy-config-resolver reçoit null de
  PolicyConfigRepository.findByKey(). PolicyConfigRepository
  n'est pas visible dans le ZIP (hors PolicyConfigAdapter).
  La chaîne `PolicyConfigRepository → PolicyConfigAdapter →
  PolicyConfigResolver` est documentée, mais un appel direct
  à PolicyConfigRepository.findByKey() sans passer par le
  resolver contourne le fail-closed.
  INFÉRENCE NON DOCUMENTÉE — quel composant appelle
  PolicyConfigRepository directement vs via le resolver ?
  Les guards appellent repositories.policyConfig.getConfig()
  qui pointe vers PolicyConfigRepository. Est-ce le resolver
  ou l'adapter brut ?

- AdminRepository est injecté conditionnellement dans
  transitionEngagement(). Dans cron.js, le fichier injecte
  AdminRepository dans repositories. Mais les appelants
  Base44 (fonctions API, webhooks) n'ont pas de contrat
  explicite sur ce qu'ils doivent injecter. Un appelant
  qui oublie admin obtiendra des transitions sans DAL.
  INFÉRENCE NON DOCUMENTÉE — à valider : existe-t-il un
  contrat documenté sur les repositories minimaux requis
  pour appeler transitionEngagement() ?

──────────────────────────────────────────────────
4. DETTE HÉRITÉE

Neutre : Domaine entièrement nouveau en V3. La doctrine des
19 interdits, du DataAccessLedger et de la double validation
est une construction V3 sans précédent dans V1/V2.

Dette documentaire active : Plan Implantation §1.5 liste
15 tests P0 admin "à créer". Ils sont tous présents dans
tests/p0/ — même décalage que Scheduler et SOTS. Le Plan
Implantation sous-estime l'avancement réel du code d'un
sprint entier.

──────────────────────────────────────────────────
5. DELTA VERS COMPLÉTUDE

Pour la première transaction (Event 0A) : s'assurer que
AdminRepository est injecté dans tous les appelants de
transitionEngagement() (sinon accepter explicitement les
transitions sans DAL comme CONTROLLED SUCCESS documenté),
et confirmer que la chaîne policyConfig.getConfig() dans
les guards passe bien par policy-config-resolver (fail-
closed) et non par PolicyConfigAdapter brut (fail-soft).

──────────────────────────────────────────────────
6. STATUT FINAL

☑ PRÊT SOUS CONDITIONS

Conditions :
  C1 — Décision fondateur sur BLOQUANT-G1 : Event 0A
       avec ou sans DAL ? Si sans : documenter comme
       CONTROLLED SUCCESS avec SoloFounderOverride.
       Si avec : injecter AdminRepository dans tous les
       appelants de transitionEngagement().
  C2 — Confirmer que repositories.policyConfig.getConfig()
       dans les guards passe par PolicyConfigResolver
       (fail-closed) et non par PolicyConfigAdapter brut.
  C3 — Pour production réelle : implémenter l'enforcement
       runtime de la double validation CRITIQUE (BLOQUANT-G2)
       avant toute modification de TaxConfig/LedgerCodeMap/
       MembershipPlan.

──────────────────────────────────────────────────
7. DÉPENDANCES SORTANTES

- Tous les domaines (A à J) dépendent de ce domaine pour
  que les AdminIncidentRecord produits sur erreur soient
  persistés — c'est l'infrastructure d'alerte transversale
  du système.
  Source : OS V15 D-107, D-133 — AdminIncidentRecord sur
  tout échec P0.

- Domaine A (Ontologie) dépend de Guard 5 pour la
  traçabilité complète des transitions (LOI GREFFIER-01).
  Source : OS V15 §2.7.1 GUARD 5.

- Domaine B (Finance) dépend de PolicyConfigResolver pour
  les configs critiques (taux, LedgerCodeMap, tax) — fail-
  closed bloque event_sealed si config absente.
  Source : OS V15 D-063, SealingGuard.

- Domaine F (Scheduler) dépend de AdminRepository pour
  les AdminIncidentRecord sur échec de tâches.
  Source : SchedulerService.js — admin.createAdminIncident-
  Record() sur chaque taskFailed.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FIN DE LA FICHE — G. ADMIN ET SÉCURITÉ
Conserver pour le Prompt de Synthèse.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━