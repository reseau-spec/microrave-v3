━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FICHE D'ÉVALUATION — H. PORTABILITÉ ET INFRASTRUCTURE
(systemId, export, restauration, intégrité référentielle)

Date d'évaluation : 22 mai 2026 07:17 EST
Par Claude Sonnet 4.6
Documents sources :
  • MICRORAVE_V3_OPERATING_SYSTEM_V15.md (OS V15)
  • EXPORT_BRUT—REGISTRES_SOUVERAINS_MICRO_RAVE_V3.md
    (D-127, D-128, D-130, D-132, D-133, TEST_REGISTRY Catégorie 7)
  • src/core/IDFactory.js
  • src/repositories/ (tous les fichiers — revus fiches A–G)
  • src/repositories/index.js
  • docs/PlanImplantation/20260521-0942_Plan_Implantation.md §3.2
  • tests/p0/ : IDFACTORY-01, PORTABILITY-SYSTEMID-01,
    REPOSITORIES-01

Niveau de confiance : HAUTE pour IDFactory, les interfaces
  repository (D-128) et la séparation logique/adapter (D-127).
  PARTIELLE pour les 7 items D-132 (checklist exécutée manuellement
  dans le Plan Implantation, non vérifiée automatiquement sauf item 1).
  INFÉRENCE pour le backup planifié (item 5) et la restauration
  (item 6) — aucun script ni configuration visible dans le ZIP.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

──────────────────────────────────────────────────
1. CRITÈRES DE COMPLÉTUDE

Ce domaine est prêt pour la première transaction quand :

- Tout objet métier critique est créé avec un systemId
  souverain (PREFIX-TIMESTAMP-RANDOM) généré par IDFactory
  avant insertion en base — jamais l'id Base44 interne.
  Source : OS V15 D-127 — *"Base44 peut héberger l'objet.
  Il ne doit pas devenir l'objet."*

- Toute logique métier critique est dans des couches
  portables, indépendantes de Base44 : IDFactory, guards,
  waterfall, LedgerCodeMap, PayoutExecutor, PolicyConfig-
  Resolver, SchedulerService, SOTSSubmissionService.
  Source : OS V15 D-127 liste des couches portables.

- Les 11 interfaces repository D-128 sont implémentées
  comme adapters Base44 HTTP — si Micro Rave migre, seul
  l'adapter change, pas la logique.
  Source : OS V15 D-128.

- REPOSITORY-ADAPTER-01 et BASE44-ID-01 (requiredBefore-
  Event=0A) sont PASSED.
  Source : TEST_REGISTRY Catégorie 7.

Ce domaine bloque tout le reste si :

- Un objet métier critique utilise le Base44 id interne
  comme identifiant souverain — migration et restauration
  impossibles, intégrité référentielle brisée.
  Source : OS V15 D-127, D-107 interdit #15.

- Un item D-132 FAILED à l'approche d'Event 0B — D-132
  est précondition d'Event 0B.
  Source : OS V15 D-132 — *"Un item FAILED = Event 0B
  interdit."*

──────────────────────────────────────────────────
2. ÉTAT ACTUEL DOCUMENTÉ

Ce qui existe et fonctionne selon les documents :

- IDFactory : 28 préfixes souverains couvrant toutes les
  entités V3 (ENG-, EVT-, LDG-, CS1-, CS2-, AMD-, SPR-,
  etc.). generate() produit PREFIX-TIMESTAMP_BASE36-RANDOM_6.
  validate() et getType() permettent la vérification et
  la détection du type depuis l'ID. Unicité des préfixes
  vérifiée dans IDFACTORY-01.
  Source : IDFactory.js + IDFACTORY-01.js PASSED (16/16).

- PORTABILITY-SYSTEMID-01 : présent et conçu pour être
  PASSED. Vérifie que tout entityType génère un ID au
  format PREFIX-TIMESTAMP-RANDOM (jamais UUID Base44),
  que validate() rejette les IDs Base44 nus, que tous les
  préfixes sont alphabétiques souverains.
  Source : PORTABILITY-SYSTEMID-01.js — *"D-127/D-132
  valides. Préfixes souverains cohérents."*

- REPOSITORIES-01 : présent. 30 cas couvrant les
  validations d'entrée de chaque repository sans réseau
  (mock fetch). Vérifie les règles D-064 (entiers), les
  validations de format systemId sur chaque entité, et
  l'interface PayoutExecutor D-101 complète.
  Source : REPOSITORIES-01.js — architecture mock fetch.

- 11 interfaces repository D-128 : toutes implémentées
  comme adapters Base44 HTTP dans src/repositories/.
  Pattern uniforme : base44Post/Get/Put, buildHeaders(),
  validation à l'entrée, retour normalisé. Séparation
  nette logique/adapter — aucun import Base44-spécifique
  dans les guards ou services.
  Source : src/repositories/ (revus fiches A–G) +
  D-128 liste complète — 11/11 interfaces présentes.

- Séparation logique/adapter (D-127) effective : IDFactory,
  transitionEngagement, tous les guards, MoneyMath,
  PayoutExecutor, SOTSSubmissionService, SchedulerService,
  SessionPresenceService, MembershipPlanService, toutes les
  couches listées dans D-127 n'importent pas Base44
  directement — ils reçoivent les repositories par injection.
  Source : vérification croisée des imports dans src/core/
  et src/services/.

- Plan Implantation §3.2 : évaluation manuelle des 7 items
  D-132 datée du 21 mai :
  - Item 1 (systemId) : IDMapping 'IDM' dans IDFactory —
    service de maintenance absent
  - Item 2 (mapping Base44→systemId) : documenté dans
    IDFactory, service absent
  - Item 3 (schema registry versionné) : cartes drawio
    existantes, non versionnées en base
  - Item 4 (export lisible hors Base44) : seul PolicyConfig
    exporté — Engagement, ContractSnapshot, LedgerRecord absent
  - Item 5 (backup planifié) : non documenté
  - Item 6 (test restauration) : PORTABILITY-RESTORE-01
    non créé
  - Item 7 (intégrité référentielle) : non testé
    automatiquement
  Source : Plan Implantation §3.2 tableau D-132.

Ce qui vient de V1 et est encore actif :

- INFÉRENCE : V1 utilisait les IDs Base44 natifs directement.
  V3 a introduit IDFactory comme rupture architecturale
  deliberée. Avantage net : V3 est propre dès le départ.
  Pas de dette héritée sur les IDs.

Ce qui vient de V2 et a survécu :

- V2 abandonnée. Aucune dette identifiée.

──────────────────────────────────────────────────
3. LACUNES IDENTIFIÉES

BLOQUANT (empêche la première transaction) :

- Aucun bloquant identifié pour Event 0A. Tous les items
  D-132 sont classés requiredBeforeEvent=0B. Pour la première
  transaction pilote (Event 0A), ce domaine n'est pas sur
  le chemin critique.
  Source : TEST_REGISTRY Catégorie 7 — tous requiredBefore-
  Event=0B sauf REPOSITORY-ADAPTER-01 et BASE44-ID-01 (0A)
  dont les tests sont présents et PASSED.

DÉGRADANT (réduit la qualité, n'empêche pas) :

- DÉGRADANT-H1 — IDMapping service absent. IDFactory.
  PREFIXES contient le type 'IdMapping' avec préfixe 'IDM',
  documenté comme nécessaire pour maintenir la correspondance
  Base44 id interne ↔ systemId. Aucun service ni script
  ne maintient ce mapping activement. En cas de migration,
  retrouver un objet Base44 à partir de son systemId serait
  manuel.
  Source : Plan Implantation §3.2 item 2 — *"IDMapping 'IDM'
  existe dans IDFactory — service de maintenance absent."*

- DÉGRADANT-H2 — Export lisible hors Base44 incomplet.
  Seul PolicyConfig dispose d'un script d'export/seed
  (seed-policy-config.js). Les tables Engagement, Contract-
  Snapshot, LedgerRecord — les données financières les
  plus critiques — n'ont aucun script d'export autonome.
  D-132 item 4 explicitement non satisfait.
  Source : Plan Implantation §3.2 item 4.

- DÉGRADANT-H3 — Schéma registry non versionné en base.
  Les cartes drawio (microrave_v4_0X_*.drawio) constituent
  le schéma visuel. Elles ne sont pas versionnable auto-
  matiquement en base — en cas de migration, la structure
  cible doit être reconstituée manuellement depuis ces
  cartes.
  Source : Plan Implantation §3.2 item 3.

- DÉGRADANT-H4 — D-133 : 10 alertes P0 observabilité non
  implémentées. Logs externalisés, Sentry ou équivalent,
  monitoring heartbeat externe, dashboard fondateur : aucun
  de ces éléments n'est visible dans le ZIP.
  Précondition Event 0B.
  Source : OS V15 D-133.

REPORTABLE (peut attendre l'événement 2+) :

- D-132 items 5–7 (backup, restauration, intégrité
  référentielle automatique) : tous requiredBeforeEvent=0B.
  PORTABILITY-RESTORE-01 et PORTABILITY-REF-01 non créés.
  Source : TEST_REGISTRY Catégorie 7 + Plan Implantation
  §3.2.

- MigrationTriggerPolicyConfig (D-130) : non implémenté.
  Triggers d'alerte et de migration non configurés.
  Reportable post-MVP Event 1.
  Source : OS V15 D-130.

- D-131 (GitHub + CI/CD + environnements) : hors scope
  de cet audit — .github/PULL_REQUEST_TEMPLATE.md présent,
  mais CI/CD non visible dans le ZIP.

ANGLE MORT POTENTIEL :

- AUTH-SYSTEMID-01 (requiredBeforeEvent=0A) est listé dans
  le TEST_REGISTRY mais absent de tests/p0/ dans le ZIP.
  Ce test vérifie que le Base44 Auth user id ≠ systemId
  métier. INFÉRENCE NON DOCUMENTÉE — si le fondateur
  utilise son Base44 Auth id comme actorUserId dans les
  transitions (ex: dans transitionEngagement.js), le DAL
  contiendrait un id non souverain.
  Source : TEST_REGISTRY Catégorie 7 — *"AUTH-SYSTEMID-01
  requiredBeforeEvent=0A"* — test non trouvé dans tests/p0/.

- Les repositories injectent le Base44 id interne (record.id)
  dans les méthodes de mise à jour (markProcessing(task.id),
  updateCheckout(sessionPresenceId), etc.). Le Base44 id
  circule donc en interne — la séparation systemId/Base44 id
  est respectée au niveau des données mais pas au niveau
  des appels API internes. La migration exigera de retrouver
  ce mapping.
  INFÉRENCE NON DOCUMENTÉE — à valider : les services
  qui reçoivent un Base44 id pour un PUT conservent-ils
  aussi le systemId correspondant dans leur contexte ?

──────────────────────────────────────────────────
4. DETTE HÉRITÉE

Neutre : Domaine entièrement nouveau en V3. La doctrine
D-127 ("Base44 est la rampe, pas la destination") est
architecturalement saine et appliquée dans tout le code.

La dette principale de ce domaine est documentaire, non
technique : les items D-132 manquants (export, backup,
restauration, intégrité référentielle) sont des scripts
et tests à écrire, pas des refactors. L'architecture sous-
jacente supporte déjà la migration — il manque les outils
de validation.

──────────────────────────────────────────────────
5. DELTA VERS COMPLÉTUDE

Pour la première transaction (Event 0A) : aucun delta
requis — REPOSITORY-ADAPTER-01 et BASE44-ID-01 sont
couverts par les tests présents (PORTABILITY-SYSTEMID-01
+ REPOSITORIES-01). Pour Event 0B : écrire les scripts
d'export (Engagement, ContractSnapshot, LedgerRecord),
créer PORTABILITY-RESTORE-01 et PORTABILITY-REF-01, et
résoudre l'absence de AUTH-SYSTEMID-01.

──────────────────────────────────────────────────
6. STATUT FINAL

☑ PRÊT SOUS CONDITIONS

Conditions :
  C1 — Event 0A : aucune condition — domaine hors chemin
       critique pour la première transaction.
  C2 — Event 0B : satisfaire les 7 items D-132.
       Priorité haute : items 4 (export) et 6 (restauration).
  C3 — Vérifier l'absence de AUTH-SYSTEMID-01 dans les
       tests et créer ce test (requiredBeforeEvent=0A).

──────────────────────────────────────────────────
7. DÉPENDANCES SORTANTES

- Domaine A (Ontologie) dépend de ce domaine pour que
  l'identité des objets soit portable : si le systemId
  ENG-* n'est pas le vrai identifiant souverain, toute
  la chaîne de transitionEngagement() est liée à Base44.
  Source : OS V15 D-127, D-107 interdit #15.

- Domaine G (Admin) dépend de ce domaine pour que les
  DataAccessLedgerEntries soient reconstituables hors
  Base44 (export item 4 D-132).
  Source : OS V15 D-132 item 4.

- Tous les domaines (A–J) dépendent indirectement de ce
  domaine pour la résilience systémique : si Base44 devient
  inaccessible sans alternative, l'intégralité des
  operations est paralysée. La portabilité est la garantie
  de continuité.
  Source : OS V15 D-127 — *"Base44 sert à aller vite.
  L'architecture souveraine sert à durer."*

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FIN DE LA FICHE — H. PORTABILITÉ ET INFRASTRUCTURE
Conserver pour le Prompt de Synthèse.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━