━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FICHE D'ÉVALUATION — G. Admin et sécurité
(19 interdits, DataAccessLedger, double validation,
PolicyConfig)
Date d'évaluation : 20 mai 2026
Documents sources :
  • MICRORAVE_V3_OPERATING_SYSTEM_V15.md (OS V15 — source souveraine)
  • EXPORT_BRUT—REGISTRES_SOUVERAINS_MICRO_RAVE_V3.md
    (D-018, D-105, D-106, D-107, D-108, D-109, D-110,
     D-111, D-112, D-118, D-133, TEST_REGISTRY Catégorie 5,
     FIRST_EVENT_REGISTER)
  • policy-config-resolver.js · policy-config-schema.js
  • transitionEngagement.js (Guard 5 AuditLogger)
  • IDFactory.js · NoShowGuard.js · EngagementAmendmentGuard.js
  • tests/p0/POLICYCONFIG-FAILCLOSED-01.js (exécuté)
Niveau de confiance : HAUTE sur la doctrine admin (D-105 à D-112)
                      HAUTE sur PolicyConfigResolver (implémenté)
                      INFÉRENCE sur DataAccessLedger, AdminAction,
                        RBAC — aucun service d'enforcement visible
──────────────────────────────────────────────────
1. CRITÈRES DE COMPLÉTUDE

Ce domaine est prêt pour la première transaction quand :

- POLICY-FAILCLOSED-01 PASSED (requiredBeforeEvent=0A) :
  config critique absente = blocage absolu, jamais valeur
  inventée — D-027, D-063, EXPORT_BRUT TEST_REGISTRY
- ADMIN-ABS-* PASSED (requiredBeforeEvent=0A) :
  les 19 interdits absolus D-107 sont testés et bloqués —
  EXPORT_BRUT TEST_REGISTRY Catégorie 5
- ADMIN-SOLO-02 et ADMIN-SOLO-03 PASSED (requiredBeforeEvent=0A) :
  SoloFounderOverride → AdminIncidentRecord créé,
  délai + confirmation obligatoires — D-106
- DataAccessLedger write test PASSED :
  "DataAccessLedger write test = PASS" figure dans la
  checklist pré-Event 1 — EXPORT_BRUT FIRST_EVENT_REGISTER
- Configs critiques seeded en database et lisibles —
  POLICYCONFIG-FAILCLOSED-01 (FAILED actuellement)
- AuditLogger (Guard 5) écrit réellement en database
  (DataAccessLedgerEntry) — LOI TRANSITION-01, OS V15
  section 2.7.1 + D-107 interdit 9 (suppression entrée)
- GoNoGoDecisionRecord = GO avant premier event réel —
  D-117, D-144, EXPORT_BRUT

Ce domaine bloque tout le reste si :

- POLICY-FAILCLOSED-01 FAILED — tous les guards qui lisent
  des configs peuvent recevoir des valeurs null silencieuses
  ou lever des exceptions non maîtrisées — D-027, D-063
- "DataAccessLedger manquant" = NO-GO — EXPORT_BRUT
  FIRST_EVENT_REGISTER AbortProtocol : "DataAccessLedger
  non écrit sur action sensible" figure dans les conditions
  d'ARRÊT IMMÉDIAT
- Interdits absolus D-107 contournables = perte de
  confiance institutionnelle — D-107 phrase canonique

──────────────────────────────────────────────────
2. ÉTAT ACTUEL DOCUMENTÉ

Ce qui existe et fonctionne selon les documents :

PolicyConfigResolver — Opérationnel, fail-closed conforme.
  • getConfig() : fail-closed strict — lance
    POLICY_CONFIG_MISSING si clé absente ou null. Jamais
    de valeur par défaut silencieuse — source :
    policy-config-resolver.js.
  • VALUE_TYPES : CENTS, PPM, INTEGER, BOOLEAN, STRING,
    ENUM supportés — source : policy-config-resolver.js
    ligne 25–30. BOOLEAN est supporté dans le resolver.
  • Cache 60s — évite les requêtes répétées.
  • validateCriticalConfigs() : boucle sur CRITICAL_CONFIG_KEYS
    depuis le schéma — source unique de vérité —
    source : policy-config-resolver.js.

POLICYCONFIG-FAILCLOSED-01 — 4/6 PASSED.
  • Test 1 (getConfig lance si absent) : PASSED.
  • Test 2 (message identifie la clé) : PASSED.
  • Test 3 (20 configs schéma complètes et cohérentes) :
    FAILED — BOOLEAN invalide dans le validateur du test
    (test line 86 accepte seulement INTEGER/PPM/CENTS/
    STRING/ENUM). Bug du test, pas du resolver ni du schéma.
  • Test 4 (configs présence ratifiées) : PASSED.
  • Test 5 (payment_fees_tax_treatment = DEBOURS) : PASSED.
  • Test 6 (validateCriticalConfigs en DB) : FAILED —
    configs absentes de la database (HTTP 403) —
    source : exécution directe.

WORMGuard dans transitionEngagement.js — actif.
  • W3 (archived) : bloquage absolu — aucune transition
    possible — interdit D-107 #5/6 — source :
    transitionEngagement.js.
  • W2 (event_sealed) : log WORM_VIOLATION_LEVEL_2 +
    erreur explicite pour toute transition non autorisée
    — D-107 #3/5 — source : transitionEngagement.js.
  • W1 (autres WORM) : console.warn — source :
    transitionEngagement.js.

SoloFounderOverride — vérifié dans les guards.
  • PresenceProofGuard exige transitionReason=
    'SOLO_FOUNDER_OVERRIDE' pour performed→payable —
    D-106 — source : PresenceProofGuard.js ligne 122.
  • EventPaymentGuard exige SoloFounderOverride si
    event_payment_cap_cents dépassé — D-106 — source :
    EventPaymentGuard.js ligne 122.
  • SOTSWindowGuard exige adminIncidentRecordId pour
    override — D-106 — source : SOTSWindowGuard.js.

IDFactory préfixes admin définis.
  • AdminAction: 'ADM' — source : IDFactory.js ligne 31.
  • PolicyConfig: 'PCF', AdminAction: 'ADM',
    DataAccessLedger implicite dans l'architecture.

Policy-config-schema.js — 20 configs définies avec
  catégories CRITIQUE/ÉLEVÉ/STANDARD/OPÉRATIONNEL et
  CRITICAL_CONFIG_KEYS exporté — source :
  policy-config-schema.js.

Ce qui vient de V1 et est encore actif :
  V1 n'a pas de DataAccessLedger ni d'AdminAction logs.
  Les actions admin sont directes sur Base44 UI sans trace.
  DETTE : comportement acquis de mutation directe — aucun
  filet de sécurité. Le fondateur est la seule protection.

Ce qui vient de V2 :
  Néant. V2 abandonnée.

──────────────────────────────────────────────────
3. LACUNES IDENTIFIÉES

BLOQUANT (empêche la première transaction) :

- BLOQUANT-G1 — POLICY-FAILCLOSED-01 FAILED (2/6).
  Échec 1 : BOOLEAN non accepté par le validateur du test
  (bug test) — source : exécution directe, test ligne 86.
  MAIS : le resolver lui-même supporte BOOLEAN et est
  conforme. À corriger pour que le test passe.
  Échec 2 : validateCriticalConfigs() retourne
  CRITICAL_CONFIG_MISSING — 9 configs absentes de la
  database — source : HTTP 403 toutes les requêtes.
  Ce test est requiredBeforeEvent=0A — EXPORT_BRUT
  TEST_REGISTRY. Tant qu'il est FAILED, Event 0A est
  interdit.

- BLOQUANT-G2 — DataAccessLedger non implémenté.
  Guard 5 (AuditLogger) écrit en console uniquement :
  console.log('[AuditLogger]', JSON.stringify(auditEntry))
  — source : transitionEngagement.js ligne 359. Aucun
  appel à repositories.audit?.writeToDataAccessLedger()
  ni équivalent dans le code. Aucun fichier
  DataAccessLedger adapter ou service dans src/ —
  source : grep DataAccessLedger sur src/.
  CONSÉQUENCE : "DataAccessLedger non écrit sur action
  sensible" = ARRÊT IMMÉDIAT — EXPORT_BRUT AbortProtocol.
  "DataAccessLedger write test = PASS" requis dans
  checklist pré-Event 1 — EXPORT_BRUT FIRST_EVENT_REGISTER.
  DATAACCESS-WRITE-01 (requiredBeforeEvent=0B) et
  DATAACCESS-FAIL-01 (requiredBeforeEvent=0B) ne peuvent
  pas passer sans implémentation — EXPORT_BRUT TEST_REGISTRY.

- BLOQUANT-G3 — Tests P0 admin manquants (tous
  requiredBeforeEvent=0A).
  ADMIN-ABS-* (19 interdits), ADMIN-SOLO-02, ADMIN-SOLO-03,
  POLICY-DIRECT-01, POLICY-CHANGE-01, POLICY-CRITICAL-01,
  ADMIN-ROLE-02 : aucun de ces tests n'existe dans
  tests/p0/ — source : ls tests/p0/ | grep -iE 'admin|role'
  retourne seulement POLICYCONFIG-FAILCLOSED-01.
  CONSÉQUENCE : tous requis avant Event 0A. Sans eux,
  les interdits absolus ne sont pas prouvés et Event 0A
  est techniquement non autorisé par l'OS.

- BLOQUANT-G4 — RBAC non implémenté.
  D-105 définit 10 rôles sur 5 niveaux. Aucun mécanisme
  dans le code ne vérifie qu'un acteur a le droit
  d'appeler telle transition ou telle action. IDFactory
  valide le format USR-* mais pas le rôle de l'acteur.
  ADMIN-SOLO-02/03 (SoloFounderOverride) est déclenché
  si le contexte dit 'SOLO_FOUNDER_OVERRIDE' — mais
  rien ne vérifie que l'appelant est effectivement le
  fondateur. INFÉRENCE partagée avec Fiche A.

DÉGRADANT (réduit la qualité, n'empêche pas) :

- PolicyConfigChangeRecord non implémenté. D-108 exige
  que toute modification de config produise AdminAction +
  DataAccessLedgerEntry + PolicyConfigChangeRecord. Le
  PolicyConfigRepository.upsert() est défini mais aucun
  code ne génère ce triple log — source :
  PolicyConfigRepository.js.

- D-106 double validation : DualApprovalThresholdConfig
  est listée comme config CRITIQUE auto-protégée mais
  n'est pas dans la database ni dans le schéma actuel —
  source : policy-config-schema.js (absente).

- AdminIncidentRecord non persisté. WORM_VIOLATION_LEVEL_2
  dans transitionEngagement.js dit "AdminIncidentRecord
  P0 créé" dans le message d'erreur, mais aucune
  persistence réelle n'est déclenchée — source :
  transitionEngagement.js ligne 244.

- D-133 observabilité (10 alertes P0) — requiredBeforeEvent
  =0B — non implémentée. Alertes 1–10 (ledger imbalance,
  double payout, webhook invalide, etc.) nécessitent
  un monitoring externe (Sentry ou équivalent) non
  configuré — source : EXPORT_BRUT D-133.

REPORTABLE (peut attendre l'événement 2+) :

- D-109 SecretsRotationPolicyConfig complète — post-Event 1.
- D-110 ConflictOfInterestRecord (ADMIN-COI-01,
  requiredBeforeEvent=1, conditionnel si dispute) —
  reportable si Event 1 sans dispute.
- D-111 Export comme pouvoir distinct (ADMIN-EXPORT-01,
  requiredBeforeEvent=0A, mais pas critique pour Event 1
  si aucun export n'est déclenché) — à évaluer.
- ADMIN-CELL-SECRET-01 (CELL_MANAGER, post-MVP rôle) —
  reportable.
- D-112 Admin Authority Matrix complète — post-MVP.

ANGLE MORT POTENTIEL :
→ INFÉRENCE NON DOCUMENTÉE : La checklist pré-Event 1
  exige "AdminAction possible" — EXPORT_BRUT FIRST_EVENT_REGISTER.
  Cela signifie qu'un AdminAction peut être créé dans
  Base44 si nécessaire. Mais si un SoloFounderOverride
  est requis (ex. performed→payable si présence non prouvée
  automatiquement), l'AdminIncidentRecord doit être
  persisté. Qui le crée ? Via quel endpoint ? L'OS ne
  précise pas si c'est via Base44 UI directement (mutation
  directe) ou via une API endpoint V3. Si c'est Base44 UI
  directement, D-108 (toute modification = AdminAction +
  log) n'est pas respecté. À valider avec le fondateur.

──────────────────────────────────────────────────
4. DETTE HÉRITÉE

De V1 : toutes les actions admin V1 sont directes sur
  Base44 sans trace. La transition vers D-107/D-108
  (append-only, AdminAction obligatoire) requiert une
  discipline active du fondateur. V1 a normalisé le
  pattern de mutation directe — c'est la dette principale.

De Base44 : Base44 permet la modification de tout champ
  depuis l'UI. D-108 ("Interdit absolu : aucune
  modification directe en database en production") ne
  peut être respecté qu'architecturalement (passer
  par les guards) et comportementalement (discipline
  fondateur). Aucun guard Base44 ne peut bloquer une
  modification directe via l'interface.

──────────────────────────────────────────────────
5. DELTA VERS COMPLÉTUDE

Corriger le bug BOOLEAN dans POLICYCONFIG-FAILCLOSED-01,
seeder les configs critiques en database, implémenter
DataAccessLedger persistence (un adapter Base44 +
repositories.audit dans transitionEngagement), créer
les tests P0 admin manquants (ADMIN-ABS-*, ADMIN-SOLO-*,
POLICY-*), et documenter la procédure pour que le fondateur
puisse créer AdminAction/AdminIncidentRecord en production
sans mutation directe.

──────────────────────────────────────────────────
6. STATUT FINAL

☑ EN COURS → ~35% estimé

Justification :
  Doctrine (D-105 à D-112) : 100% validée.
  PolicyConfigResolver fail-closed : 95% — opérationnel,
    un bug test BOOLEAN à corriger.
  Configs critiques en database : 0% — non seeded.
  DataAccessLedger persistence : 0% — console.log seulement.
  RBAC enforcement : 0% — aucun mécanisme.
  AdminAction/AdminIncidentRecord persistence : 0% —
    messages d'erreur seulement.
  Tests P0 admin requis (0A) : 6% — 1/16 tests créés
    (POLICYCONFIG-FAILCLOSED-01), FAILED.

──────────────────────────────────────────────────
7. DÉPENDANCES SORTANTES

- A. Machine d'état dépend du DataAccessLedger (Guard 5)
  pour que LOI TRANSITION-01 soit vérifiable — source :
  OS V15 section 16.2 + D-107 interdit 9.

- B. Finance dépend de POLICY-FAILCLOSED-01 PASSED pour
  que les configs tps_ppm, tvq_ppm, deposit_ratio_ppm
  soient lisibles sans erreur — source : Fiche B.

- Tous les domaines dépendent de ADMIN-ABS-* (requiredBefore
  Event=0A) pour qu'Event 0A soit autorisé. Un seul FAILED
  = Event 0A interdit = toute la séquence de lancement
  bloquée — source : EXPORT_BRUT D-134 (BugReplayRecord)
  + séquence "Event 0A = GO requis avant Event 1" =
  EXPORT_BRUT FIRST_EVENT_REGISTER.

- H. Archivage global dépend de GoNoGoDecisionRecord = GO,
  qui requiert "aucun AdminIncidentRecord P0 non résolu"
  — source : EXPORT_BRUT AbortProtocol.

- INFÉRENCE : ce domaine est transversal à tous les autres.
  L'absence de DataAccessLedger réel rend invisible toute
  tentative de contournement des guards depuis Base44 UI.
  La sécurité institutionnelle de l'Event 1 repose sur
  la discipline du fondateur tant que ce domaine n'est
  pas complété.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FIN DE LA FICHE — G. Admin et sécurité
Conserver cette fiche pour le Prompt de Synthèse.