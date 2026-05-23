━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FICHE D'ÉVALUATION — H. Portabilité et infrastructure
(systemId, export, restauration, intégrité référentielle)
Date d'évaluation : 20 mai 2026
Documents sources :
  • MICRORAVE_V3_OPERATING_SYSTEM_V15.md (OS V15 — source souveraine)
  • EXPORT_BRUT—REGISTRES_SOUVERAINS_MICRO_RAVE_V3.md
    (D-127, D-128, D-129, D-130, D-131, D-132, D-133,
     D-134, TEST_REGISTRY Catégorie 7)
  • IDFactory.js · policy-config-resolver.js
  • src/adapters/base44/PolicyConfigAdapter.js
  • src/repositories/PolicyConfigRepository.js
  • .github/PULL_REQUEST_TEMPLATE.md · README.md
  • docs/cartes/ (11 fichiers .drawio)
  • database/PolicyConfig_export (3).csv (Base44 live export)
  • IDFACTORY-01.js (exécuté)
Niveau de confiance : HAUTE sur IDFactory et isolation core/Base44
                      HAUTE sur configs seeded (confirmées via CSV export)
                      INFÉRENCE sur mapping Base44 id → systemId,
                        schema registry versionné, export/restauration
──────────────────────────────────────────────────
1. CRITÈRES DE COMPLÉTUDE

Ce domaine est prêt pour la première transaction quand :

- Aucun objet métier critique sans systemId (D-132 item 1) —
  PORTABILITY-SYSTEMID-01 PASSED (requiredBeforeEvent=0B)
  — EXPORT_BRUT D-132
- Mapping Base44 id → systemId documenté (D-132 item 2) —
  EXPORT_BRUT D-132
- Schema registry versionné (D-132 item 3) — EXPORT_BRUT D-132
- Export complet tables critiques lisible hors Base44
  (D-132 item 4) — PORTABILITY-EXPORT-01 PASSED —
  EXPORT_BRUT TEST_REGISTRY Catégorie 7
- Backup planifié (D-132 item 5) — EXPORT_BRUT D-132
- Test restauration hors Base44 réussi (D-132 item 6) —
  PORTABILITY-RESTORE-01 PASSED — EXPORT_BRUT TEST_REGISTRY
- Vérification intégrité référentielle Event ↔ Lineup ↔
  MissionSlot ↔ Engagement ↔ Ledger (D-132 item 7) —
  PORTABILITY-REF-01 PASSED — EXPORT_BRUT TEST_REGISTRY
- REPOSITORY-ADAPTER-01 PASSED (requiredBeforeEvent=0A) :
  logique métier critique ne dépend pas directement de Base44
  — D-128, EXPORT_BRUT TEST_REGISTRY
- BASE44-ID-01 PASSED (requiredBeforeEvent=0A) : aucun
  Base44 id comme identifiant métier souverain — D-127
- AUTH-SYSTEMID-01 PASSED (requiredBeforeEvent=0A) :
  Base44 Auth user id ≠ systemId métier — D-127

Ce domaine bloque tout le reste si :

- Objets métier critiques sans systemId → perte d'identité
  souveraine à la migration — D-127 : "Base44 est la rampe"
- Un item FAILED de D-132 = Event 0B interdit — D-132 règle
  invariante
- src/core/ dépend directement de Base44 → impossible de
  migrer vers PostgreSQL sans refactoring — D-127/D-128

──────────────────────────────────────────────────
2. ÉTAT ACTUEL DOCUMENTÉ

Ce qui existe et fonctionne selon les documents :

IDFactory — Opérationnel, 7/7 PASSED (IDFACTORY-01).
  • 26 types d'entités avec préfixes uniques, immuables —
    source : IDFactory.js PREFIXES.
  • generate(), validate(), getType() — source : IDFactory.js.
  • Règle absolue documentée : "Le Base44 id n'est JAMAIS
    un identifiant métier souverain" — source : IDFactory.js
    ligne 8, D-127.
  • IdMapping 'IDM' prévu pour tracer Base44 id → systemId
    — source : IDFactory.js ligne 42.

Isolation core/ de Base44 — conforme D-127/D-128.
  • Tous les guards documentent "Ce guard NE touche PAS
    Base44 directement" — source : MissionConversionGuard.js,
    SealingGuard.js, ContestationWindowGuard.js.
  • src/core/ ne contient aucun import de Base44 — source :
    grep 'base44' sur src/core/ retourne uniquement des
    commentaires.
  • src/adapters/base44/PolicyConfigAdapter.js : seul point
    de contact explicite avec Base44 — source : ls adapters/.
  • REPOSITORY-ADAPTER-01 passe implicitement : la
    logique de tous les guards est dans src/core/, pas dans
    les adapters.

PolicyConfig seeded en production Base44 — CONFIRMÉ.
  • 16 configs présentes dans la base live (exportées dans
    PolicyConfig_export.csv) incluant les CRITIQUES :
    tps_ppm (50000), tvq_ppm (99750),
    payment_fees_tax_treatment (DEBOURS),
    event_payment_cap_cents (350000),
    maxDistancePolicy (500), minDurationFloorMinutes (30),
    minDurationRatioPpm (950000),
    contestationWindowDurationHours (24),
    deposit_ratio_ppm (200000), stripe_ppm (29000),
    stripe_fixe_cents (30) — source : database/
    PolicyConfig_export (3).csv.
  • POLICYCONFIG-FAILCLOSED-01 FAILED dans ce sandbox
    pour cause réseau (HTTP 403) — non pas données
    manquantes. En production Base44, les configs sont
    présentes.

Architecture documentée dans docs/cartes/.
  • 11 fichiers .drawio couvrant ontologie, machine d'état,
    waterfall, QuickPlay, SOTS, admin, fiscalité, lois
    invariantes, Pierre de Rosette, SKU analytique —
    source : ls docs/cartes/.
  • Ces cartes constituent un schema registry visuel —
    D-132 item 3 partiellement couvert.

PR template porte la discipline portabilité.
  • "Chaque nouvel objet utilise IDFactory.generate()" dans
    checklist obligatoire — source : PULL_REQUEST_TEMPLATE.md.
  • "Aucune constante financière hardcodée dans le code
    (tout passe par getConfig())" — source : PR template.

Git discipline conforme D-131.
  • Branches dev/staging/main avec PR obligatoire —
    source : README.md, git log.
  • Aucun secret dans le code (vérifié via .gitignore) —
    source : D-131.

Ce qui vient de V1 et est encore actif :
  V1 sur microrave.ca utilise Base44 directement pour tout.
  Aucun systemId souverain en V1 — tous les objets sont
  identifiés uniquement par leur Base44 id. DETTE : si V1
  génère des objets qui doivent migrer vers V3 (utilisateurs,
  lieux), le mapping Base44 id → systemId doit être créé
  pour eux. ACQUIS : l'instance Base44 est opérationnelle
  avec les configs seeded.

Ce qui vient de V2 :
  Néant. V2 abandonnée.

──────────────────────────────────────────────────
3. LACUNES IDENTIFIÉES

BLOQUANT (empêche la première transaction) :

- BLOQUANT-H1 — D-132 items 2–7 non vérifiés ni testés.
  Les 4 tests P0 de portabilité (PORTABILITY-SYSTEMID-01,
  PORTABILITY-EXPORT-01, PORTABILITY-RESTORE-01,
  PORTABILITY-REF-01 — tous requiredBeforeEvent=0B) ne
  sont pas dans tests/p0/ — source : ls tests/p0/ | grep -i
  portab retourne rien. Un item FAILED = Event 0B interdit
  — D-132.
  DÉTAIL PAR ITEM :
  — Item 2 (Mapping Base44 id → systemId documenté) :
    IDMapping 'IDM' existe dans IDFactory mais aucun
    service ne crée ni ne maintient ce mapping — source :
    IDFactory.js, grep IdMapping sur src/.
  — Item 3 (Schema registry versionné) : les docs/cartes/
    .drawio constituent une registry visuelle mais ne sont
    pas versionnés formellement en database — INFÉRENCE.
  — Item 4 (Export lisible hors Base44) : seul le CSV
    PolicyConfig est exporté. Aucun export Engagement,
    ContractSnapshot, LedgerRecord, etc. — INFÉRENCE.
  — Item 5 (Backup planifié) : non documenté dans le code
    ni dans les scripts — INFÉRENCE.
  — Item 6 (Test restauration hors Base44) : aucun script
    de restauration visible — source : ls scripts/ retourne
    seulement run-j9-pilot.js et seed-policy-config.js.
  — Item 7 (Intégrité référentielle Event↔Lineup↔
    MissionSlot↔Engagement↔Ledger) : aucun test ni
    validation automatique — INFÉRENCE.

- BLOQUANT-H2 — REPOSITORY-ADAPTER-01 et BASE44-ID-01
  (requiredBeforeEvent=0A) non formellement testés.
  Le code respecte ces principes en pratique (isolation
  confirmée), mais les tests P0 déclarés ne sont pas
  dans tests/p0/ — source : ls tests/p0/ | grep -iE
  'portab|base44|repo|systemid' retourne rien. Les tests
  requiredBeforeEvent=0A doivent passer avant Event 0A.

- BLOQUANT-H3 — src/repositories/ incomplet.
  D-128 liste 10 repositories (EngagementRepository,
  LedgerRepository, PaymentRepository, SchedulerRepository,
  UserRepository, CheckpointRepository, DisputeRepository,
  ReputationRepository, AdminRepository, PolicyConfigRepository)
  — source : EXPORT_BRUT D-128. Seul PolicyConfigRepository
  est implémenté — source : ls src/repositories/. Le script
  run-j9-pilot.js importe '../src/repositories' qui n'existe
  pas en tant que module — source : node require fail.
  CONSÉQUENCE : tout service qui a besoin d'un repository
  autre que PolicyConfig ne peut pas fonctionner en production.

- BLOQUANT-H4 — 4 configs manquantes dans la base live.
  En confrontant le schéma vs le CSV exporté :
  sots_window_duration_hours, checkInWindowMinutes,
  amendment_max_extension_minutes,
  amendment_require_double_consent sont dans le schéma
  mais absentes du CSV — source : diff schema/CSV.
  Ces configs sont lues par SOTSWindowGuard,
  PresenceWindowGuard, et EngagementAmendmentGuard.
  Sans elles, ces guards fail-closed en production.

DÉGRADANT (réduit la qualité, n'empêche pas) :

- D-133 observabilité (10 alertes P0, requiredBeforeEvent=0B)
  — non implémentée. "Logs externalisés, Sentry ou
  équivalent, monitoring heartbeat externe, dashboard
  fondateur" — D-133. Non critique pour Event 1 si le
  fondateur surveille manuellement.

- MIGRATION-TRIGGER-01 (requiredBeforeEvent=0B) :
  MigrationTriggerPolicyConfig non seeded — si les seuils
  D-130 sont atteints, aucune alerte ne sera générée
  automatiquement — source : CSV ne contient pas cette config.

- L'export CSV PolicyConfig (futuristic-rave-core-flow) est
  la seule preuve d'export lisible hors Base44. D-132 item 4
  exige un export complet de TOUTES les tables critiques —
  Engagement, ContractSnapshot, LedgerRecord, etc. Ces tables
  n'ont pas de script d'export documenté.

REPORTABLE (peut attendre l'événement 2+) :

- D-130 MIGRATION ACCÉLÉRÉE (PostgreSQL) — critères non
  atteints pour Event 1. Aucun bug financier P0 causé par
  Base44 n'est documenté.
- Schema registry formellement versionné en database —
  post-Event 1.
- PORTABILITY-RESTORE-01 avec test complet hors Base44 —
  post-Event 0B (requiredBeforeEvent=0B).

ANGLE MORT POTENTIEL :
→ INFÉRENCE NON DOCUMENTÉE 1 : L'OS exige que le mapping
  Base44 id → systemId soit documenté (D-132 item 2). Dans
  la pratique, Base44 crée automatiquement un id interne
  (ex: '6a09ba74...') lorsqu'un objet est inséré. Pour les
  objets créés depuis src/ (qui génèrent d'abord un systemId
  via IDFactory), le Base44 id et le systemId coexistent.
  Qui maintient ce mapping ? L'IDMapping entity ('IDM')
  dans IDFactory le préfixe, mais aucun service ne le
  crée. À valider : est-ce que Base44 stocke le systemId
  comme champ sur chaque objet, rendant le mapping implicite?

→ INFÉRENCE NON DOCUMENTÉE 2 : L'OS V15 (section 11.1)
  dit "Base44 est la rampe, pas la destination". La
  Portability Readiness (D-132) est requiredBeforeEvent=0B
  (pas Event 0A ni Event 1). Cela signifie qu'au moins
  Event 0A (Stripe test interne) peut se dérouler sans
  que la portabilité complète soit prouvée. À clarifier :
  le fondateur accepte-t-il Event 0A avant D-132 complet?

──────────────────────────────────────────────────
4. DETTE HÉRITÉE

De V1 : tous les objets V1 (utilisateurs, checkpoints,
  events passés) n'ont pas de systemId souverain. Si
  une migration de données V1→V3 est prévue, un IDMapping
  batch doit être créé. L'OS ne prescrit pas cette migration.
  INFÉRENCE : pour Event 1, les objets seront créés
  directement en V3 (DJ Alex, Le Trèfle) sans migration
  V1 — dette différée.

De Base44 : Base44 génère ses propres IDs internes qui
  coexistent avec les systemIds. Cette dualité est
  architecturalement intentionnelle (D-127) mais n'est
  pas documentée comme un pattern géré en code. La
  discipline IDFactory dans le PR template est le seul
  garde-fou.

──────────────────────────────────────────────────
5. DELTA VERS COMPLÉTUDE

Seeder les 4 configs manquantes (sots_window_duration_hours,
checkInWindowMinutes, amendment_max_extension_minutes,
amendment_require_double_consent) dans la base live,
implémenter les 9 repositories manquants (D-128) avec un
index.js qui les expose, créer les tests P0
REPOSITORY-ADAPTER-01, BASE44-ID-01 et AUTH-SYSTEMID-01
(requis avant Event 0A), et documenter le backup + export
des tables critiques (D-132 items 4-6) avant Event 0B.

──────────────────────────────────────────────────
6. STATUT FINAL

☑ EN COURS → ~50% estimé

Justification :
  IDFactory et isolation core/Base44 : 95% — opérationnel,
    IDFACTORY-01 7/7 PASSED.
  Configs seeded en base live : 80% — 16/20 présentes,
    4 manquantes (SOTS window, check-in window, amendment).
  D-128 repositories : 10% — 1/10 implémenté.
  D-132 checklist 7 items : 14% — item 1 probable, items 2-7
    non testés ni prouvés.
  Tests P0 portabilité (0A requis) : 0% — aucun créé.
  Tests P0 portabilité (0B requis) : 0% — aucun créé.

──────────────────────────────────────────────────
7. DÉPENDANCES SORTANTES

- Tous les domaines dépendent de D-128 repositories pour
  que leurs services puissent persister leurs données en
  production — source : EXPORT_BRUT D-128. Sans repositories,
  chaque domaine peut valider la logique mais pas écrire
  en database.

- F. Scheduler dépend de SchedulerRepository (D-128)
  pour persister et lire les SchedulerDueTasks — source :
  D-099 architecture.

- G. Admin dépend d'AdminRepository (D-128) pour persister
  AdminAction, AdminIncidentRecord, DataAccessLedgerEntry
  — source : D-107/D-108.

- E. SOTS dépend de ReputationRepository (D-128) pour
  persister ReputationLedger et SOTSScoreSnapshot —
  source : D-077.

- INFÉRENCE globale : ce domaine est la fondation
  de persistance de tous les autres. Les guards calculent
  correctement, mais sans repositories leur output
  est éphémère. La première transaction réelle (talent
  payé, Engagement archivé) requiert que chaque objet
  créé par les guards soit persisté dans Base44 via
  les repositories appropriés. L'absence de 9/10
  repositories sur 10 est le déficit d'infrastructure
  le plus systémique de V3.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FIN DE LA FICHE — H. Portabilité et infrastructure
Conserver cette fiche pour le Prompt de Synthèse.