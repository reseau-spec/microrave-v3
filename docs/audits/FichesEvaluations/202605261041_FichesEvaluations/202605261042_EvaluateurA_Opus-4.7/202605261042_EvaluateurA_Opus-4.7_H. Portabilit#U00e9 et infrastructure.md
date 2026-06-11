━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FICHE D'ÉVALUATION — H. Portabilité et infrastructure
Date d'évaluation : 26 mai 2026
Documents sources :
  • docs/os/MICRORAVE_V3_OPERATING_SYSTEM_V15.md (§1.5 Pivot
    de Marché)
  • docs/os/EXPORT_BRUT…REGISTRES_SOUVERAINS_MICRO_RAVE_V3.md
    (D-107 #15/#16, D-127 « Base44 rampe / souverain
    destination », D-128 repository interfaces, D-129
    WEBHOOK-RAWBODY-01 P0 bloquant, D-130 MigrationTriggerPolicyConfig,
    D-131 GitHub vs database, D-132 Portability Readiness
    checklist 7 items)
  • microrave-v3/src/core/IDFactory.js (27 préfixes)
  • microrave-v3/src/repositories/ (11 repositories portables)
  • microrave-v3/src/core/ (couches portables D-127)
  • codeBase44_v3/base44/entities/ (29 schémas .jsonc)
  • codeBase44_v3/dataBase/ (20 fichiers _export.csv)
  • microrave-v3/.git/ (historique présent — D-131)
  • microrave-v3/.gitignore + .env (D-097 + D-131)
  • 20260526-1030_RAPPORT-AUDIT-FORENSIQUE.md — FICHIER VIDE
    (0 octet, INCONNU)
Niveau de confiance : HAUTE (statistiques d'intégrité
    calculées sur les 20 exports CSV, conformité d'alphabet
    vérifiée caractère par caractère)
──────────────────────────────────────────────────
1. CRITÈRES DE COMPLÉTUDE

   Ce domaine est prêt pour la première transaction quand :

   • Aucun objet métier critique sans systemId — chaque ligne
     de chaque table critique a son IDFactory.
     — Source : D-132 #1, EXPORT_BRUT §BLOC 16

   • Mapping Base44 id ↔ systemId documenté et persisté.
     — Source : D-132 #2

   • Schema registry versionné dans GitHub (commit par
     évolution de schéma).
     — Source : D-132 #3 + D-131 « GitHub trace le code »

   • Export complet des tables critiques lisible hors Base44.
     — Source : D-132 #4

   • Backup planifié (cron ou équivalent).
     — Source : D-132 #5

   • Test de restauration hors Base44 réussi.
     — Source : D-132 #6

   • Intégrité référentielle vérifiée sur la chaîne
     Event ↔ Lineup ↔ MissionSlot ↔ Engagement ↔ Ledger.
     — Source : D-132 #7

   • Couches portables D-127 hors Base44 : IDFactory,
     MissionGraph, ContractSnapshot WORM logic, FinancialLedger
     + LedgerCodeMap V3, Payment waterfall, Stripe webhook +
     idempotency, Anti-double payout 6 verrous, SOTS/
     ReputationLedger, PolicyConfig resolver, SchedulerDueTask,
     AdminAuthorityResolver, DataAccessLedger, i18n strings,
     PresenceProofResolver, MoneyMovementRouter,
     MissionConversionGuard, CheckpointCulturalProfile,
     PhoneFreeRitualGuard.
     — Source : D-127, EXPORT_BRUT §BLOC 16

   • Interdits D-107 #15 (« Modifier le systemId d'un objet
     existant ») et #16 (« Modifier les préfixes IDFactory
     d'objets déjà créés ») architecturalement empêchés.
     — Source : D-107, EXPORT_BRUT §BLOC 13

   • MigrationTriggerPolicyConfig (D-130) seedé pour détecter
     les trois niveaux : ALERTE, MIGRATION À PLANIFIER,
     MIGRATION ACCÉLÉRÉE.
     — Source : D-130, EXPORT_BRUT §BLOC 16

   « Phrase canonique D-132 : Une sortie théorique n'est pas
   une stratégie de sortie. Il faut tester qu'on peut vraiment
   sortir. »

   Ce domaine bloque tout le reste si :

   • « Un item FAILED = Event 0B interdit. »
     — Source : D-132 phrase canonique

   • Référentielle compromise → impossible de reconstruire
     l'état comptable d'un Engagement → audit institutionnel
     impossible.
     — Source : D-132 #7

──────────────────────────────────────────────────
2. ÉTAT ACTUEL DOCUMENTÉ

   Ce qui existe et fonctionne selon les documents :

   • IDFactory portable couvre 27 types d'entités avec
     préfixes typés : EVT, ENG, EGC, MSL, MAP, MPR, CSN, LBY,
     USR, TAL, CKP, EVL, LDG, TXG, PAY, DSP, ADM, PCF, TRP,
     SCH, AMD, SPR, CS1, CS2, SOT, REP, WHK, IDM, CXL.
     Format : `PREFIX-TIMESTAMP_BASE36-RANDOM_6CHARS`.
     — Source : src/core/IDFactory.js l.15-45

   • 11 repositories D-128 codés dans microrave-v3/src/
     repositories/ : EngagementRepository, EventRepository,
     LedgerRepository, PaymentRepository, SchedulerRepository,
     UserRepository, CheckpointRepository, DisputeRepository,
     ReputationRepository, AdminRepository,
     PolicyConfigRepository.
     — Source : ls src/repositories/

   • Toutes les 29 entités Base44 ont un champ `systemId`
     déclaré. Le champ est `required` pour la plupart.
     — Source : codeBase44_v3/base44/entities/*.jsonc

   • 20 exports CSV disponibles sur 29 entités déclarées
     (69 %). Les exports portent tous le format `*_export.csv`
     produit par Base44.
     — Source : ls dataBase/

   • Mapping Base44 id ↔ systemId implicitement présent :
     chaque ligne CSV porte à la fois `id` (Base44 interne
     24-char hex) et `systemId` (IDFactory). Les repositories
     portables font la médiation (cf. updateEngagementStatus
     l.113 de EngagementRepository.js qui prend un `base44Id`).
     — Source : src/repositories/EngagementRepository.js
       l.109-114

   • Repository Git intact (microrave-v3/.git) avec
     historique : `feat base44 update + protocole audit`,
     `feat correction-encaissements-4335-to-4110.js`, etc.
     D-131 « GitHub trace le code » partiellement satisfait.
     — Source : git log via .git directory

   • .env exclu de Git (.gitignore l.6 : `.env`). D-131
     respecté côté GitHub.
     — Source : .gitignore

   • Couches portables D-127 substantiellement présentes
     dans src/core/ : IDFactory, ContractSnapshot WORM
     (SealingGuard), FinancialLedger logic
     (LedgerInvariantGuard, MoneyMath), Payment waterfall
     (SealingGuard), PolicyConfig resolver
     (PolicyConfigRepository), SchedulerDueTask
     (SchedulerService), DataAccessLedger (transitionEngagement
     guard #5), PresenceProofResolver/Guard,
     MissionConversionGuard, EngagementAmendmentGuard.
     — Source : ls src/core/guards/ + src/services/

   Ce qui vient de V1 et est encore actif :

   • microrave-v3/codeBase44_v1/ contient un snapshot V1
     archivé (entities, functions, dataBase). Présent dans le
     repo comme référence — preuve d'archivage croisé.
   • V1 a démontré 119 SessionPresence portables. Le format
     V1 est lisible et restorable.
     — Source : microrave-v3/codeBase44_v1/

   Ce qui vient de V2 et a survécu :

   • microrave-v3/codeBase44_v2/ également présent — V2
     archivée avec 63 SessionPresence. Continuité documentaire
     V1→V2→V3 conservée.
   • La doctrine D-127 « Base44 rampe / souveraine destination »
     est l'acquis architectural de V2 — la V3 commence avec
     une trajectoire de sortie codée.
     — Source : microrave-v3/codeBase44_v2/ + D-127

──────────────────────────────────────────────────
3. LACUNES IDENTIFIÉES

   BLOQUANT (empêche la première transaction) :

   • IDFactory portable utilise base36 via
     `Math.random().toString(36).slice(2, 8).toUpperCase()`
     (IDFactory.js l.66). L'alphabet base36 = `0-9A-Z` inclut
     les caractères confusables O / 0 / I / 1 / L. Cette
     dette d'alphabet a produit en production :
       — Engagement : 1/24 (4 %) ID confusable
       — Event : 2/24 (8 %)
       — LedgerRecord : 29/143 (20 %)
       — AdminAction : 9/10 (90 %)
       — AdminIncidentRecord : 4/5 (80 %)
       — PayoutExecutionRecord : 1/1 (100 %) — l'unique payout
         de toute l'histoire V3 porte un ID confusable :
         `PAY-MPIHYIID-0VYYNQ` (3 × I + 1 × 0).
     Les fonctions Base44 utilisent un alphabet Crockford
     épuré (`ABCDEFGHJKLMNPQRSTUVWXYZ23456789` — sans I, L,
     O, 0, 1) — ce qui prouve que la convention propre EST
     implémentée côté backend, mais la collision portable l'a
     déjà contaminée.
     — Source : src/core/IDFactory.js l.66 vs
       codeBase44_v3/base44/functions/createEngagement/entry.ts
       l.44 + statistiques sur dataBase/*.csv

   • Conséquence directe : l'engagement Pierre de Rosette est
     scindé en DEUX systemId entre les écritures :
       — ENG-MPIGOBUZ-N084HN (lettre O) → 5 LedgerRecord +
         status='proposed' (Engagement_export.csv)
       — ENG-MPIG0BUZ-N084HN (chiffre 0) → 31 LedgerRecord +
         1 SettlementInstruction + 1 PayoutExecutionRecord +
         5 DataAccessLedgerEntry OVERRIDE
     La même transaction métier vit en double identité. Le
     payout exécuté pointe vers la variante chiffre, mais
     l'Engagement vit sous la variante lettre. C'est la
     violation D-107 #15/#16 documentée par la donnée.
     — Source : croisement Engagement_export.csv +
       LedgerRecord_export.csv + DataAccessLedgerEntry_export.csv
       + PayoutExecutionRecord_export.csv

   • Référentielle Event ↔ Engagement compromise sur 2/24
     engagements : leur `eventId` n'est pas un EVT-* mais un
     Base44 internal hex (ex. `6a13181cab550788f7c18652`).
     L'engagement ne peut pas se résoudre vers son Event par
     systemId.
     — Source : croisement Engagement_export.csv +
       Event_export.csv → 2 orphan

   • Référentielle Engagement ↔ User catastrophique sur le
     champ `talentUserId` (19 distinctes en 24 engagements) :
       — 5 placeholders bruts non-USR ('test', 'TEST',
         '10000', '012', '05', 'dj', '2000')
       — 1 ID synthétique nommé ('USR-NOMINAL-TALENT1')
       — quelques USR-* avec chars confusables
         ('USR-MPIG0A0O-9CZ5JA' contient O et 0)
       — quelques USR-* propres
     Idem pour `organizerUserId` : mélange de
     'USR-MPIGOAKA-S5NIIG' (USR + I + O), 'test-org'
     (placeholder), et `6a09b5c6ace6051fecd365af` (Base44
     internal hex). Aucune contrainte de format. D-132 #7
     échoue.
     — Source : Engagement_export.csv

   • 9 entités sur 29 (31 %) n'ont aucun export CSV — donc
     aucune trace de données :
       ContractSnapshot · Lineup · PolicyConfigChangeRecord ·
       RoundingReconciliationRecord · SOTSScoreSnapshot ·
       SchedulerDueTask · SchedulerRun · SessionPresence ·
       User
     Sept de ces neuf sont déjà identifiées comme bloqueurs
     par d'autres domaines (A, E, F, D, G). L'absence d'export
     User est particulière : impossible de vérifier qu'un
     `talentUserId='USR-MPIG0A0O-9CZ5JA'` correspond à un
     vrai user.
     — Source : diff ls dataBase/ vs entities/

   • Backup planifié ABSENT (D-132 #5). Les 20 exports CSV
     dans dataBase/ portent tous des timestamps fichier de
     2026-05-26 14:33-14:34 — ils ont été exportés
     manuellement en lot 12 minutes avant la soumission de
     cet audit. Aucune trace d'un cron de backup, aucune
     PolicyConfig liée à la rétention/sauvegarde.
     — Source : ls -lt dataBase/*.csv

   • Test restauration hors Base44 (D-132 #6) — aucune trace
     documentaire dans le repo. Aucun script tests/restoration
     ni rapport. La sortie théorique n'a pas été éprouvée.
     « Une sortie théorique n'est pas une stratégie de sortie. »
     — Source : find . -name '*restor*' → vide

   • Entité IdMapping (préfixe IDM listé dans IDFactory l.43)
     non implémentée dans Base44 (pas de IdMapping.jsonc dans
     entities/). Le mapping reste implicite par la cohabitation
     de `id` et `systemId` dans chaque ligne — fonctionne tant
     que Base44 est source ; perd toute documentation si on
     ré-import ailleurs.
     — Source : entities/ (absence) vs IDFactory.js l.43

   DÉGRADANT (réduit la qualité, n'empêche pas) :

   • Inconsistance des alphabets entre IDFactory portable
     (base36 avec confusables) et les générateurs Base44
     hardcodés en début de chaque function entry.ts (Crockford
     épuré). Les deux mécanismes coexistent sans coordination.
     L'origine d'un ID indique son générateur — diagnostic
     possible, mais surface duale fragile.

   • MigrationTriggerPolicyConfig (D-130, classification
     CRITIQUE D-108) non seedée dans les 36 entrées
     PolicyConfig. Les 3 seuils (ALERTE > 8 000 cr/mois,
     MIGRATION À PLANIFIER > 9 900 sur 3 mois, MIGRATION
     ACCÉLÉRÉE sur incident P0) n'ont pas de substrat. Sans
     compteur cron actif (Domaine F inerte), de toute façon
     l'évaluation ne peut pas démarrer.
     — Source : dataBase/PolicyConfig_export.csv

   • D-129 WEBHOOK-RAWBODY-01 est un test P0 bloquant pour
     Event 0B. Le test est codé (tests/p0/WEBHOOK-RAWBODY-01.js)
     mais aucun rapport d'exécution n'est dans l'artefact.
     INFÉRENCE indirecte : 10 webhooks Stripe traités en
     production avec succès (cf. Domaine C) impliquent que
     rawbody fonctionne. Mais la formalisation « test PASSED »
     manque pour la précondition D-129.

   • Le `.env` figure dans l'archive d'audit (microrave-v3.zip)
     — non versionné dans Git mais inclus dans le zip
     opérationnel. D-131 « Aucun secret dans code/logs/GitHub »
     respecté côté Git, mais l'artefact d'audit transmet les
     valeurs. Dette de manipulation.
     — Source : ls -l microrave-v3/.env

   • Schema registry versionné (D-132 #3) — partiellement
     satisfait via GitHub. Mais l'absence de tag de version
     sur les entités Base44 (pas de `schemaVersion` dans les
     .jsonc) rend l'évolution traçable seulement par diff Git,
     pas par version explicite.

   REPORTABLE (peut attendre l'événement 2+) :

   • DataRetentionPolicyConfig D-096 (7 ans plancher) + champ
     `retentionJustificationCode` — non seedé. Reportable
     car aucune purge prévue avant 7 ans.

   • SecretsRotationPolicyConfig D-109 — non seedé. Tant
     qu'une seule clé Stripe est en usage, reportable.

   • Pipeline CI/CD complet P0 (D-131 V3.0.1) — reportable
     post-MVP, sans bloquer Pierre de Rosette.

   ANGLE MORT POTENTIEL :

   L'OS V15 §1.5 institue le « Pivot de Marché » : « modifier
   quelques lignes de database, zéro refonte de code » pour
   passer du domaine culturel à plomberie/électricien. Cette
   ambition présuppose une portabilité totale — non seulement
   l'export Base44, mais l'export du sens métier. Or, en l'état,
   25-29 entités Base44 dépendent de la sémantique « music ·
   talent · cachet », et MembershipPlan / SOTSDimensionConfig
   sont couplés à des dimensions culturelles
   (performance_artistique, etc.).
   → INFÉRENCE NON DOCUMENTÉE : l'OS dit « zéro refonte de
     code » mais ne précise pas si SOTSDimensionConfig
     (cf. Domaine E) doit accommoder simultanément les deux
     domaines (culturel + services) via dimensions multiples,
     ou si le pivot exige un re-seed complet. À trancher
     par le fondateur, hors scope Pierre de Rosette.

──────────────────────────────────────────────────
4. DETTE HÉRITÉE

   La V3 hérite d'une doctrine de portabilité solide (D-127
   à D-132) et de couches portables en grande partie codées.
   ACQUIS : la stratégie de sortie est conçue, pas seulement
   évoquée.

   DETTE INDIVIDUELLE : la coexistence V1/V2/V3 dans le repo
   prouve trois itérations d'archivage — mais chaque
   itération a hérité d'une migration partielle. La V3 démarre
   avec deux IDFactory parallèles (base36 portable + Crockford
   Base44) sans politique de réconciliation, et avec 90 % des
   AdminAction en alphabet non-Crockford. La dette est
   structurelle, pas accidentelle.

   La preuve la plus visible de cette dette est l'unique
   PayoutExecutionRecord existant : `PAY-MPIHYIID-0VYYNQ` —
   trois I et un 0 dans un identifiant censé être confusable-
   safe. Le seul payout réussi de l'institution porte sa
   propre cicatrice d'illisibilité.

──────────────────────────────────────────────────
5. DELTA VERS COMPLÉTUDE

   Pour que le domaine soit prêt : (i) remplacer l'IDFactory
   portable base36 par l'alphabet Crockford épuré
   `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (alignement avec
   Base44), (ii) durcir les champs `talentUserId`,
   `organizerUserId`, `eventId` du schéma Engagement Base44
   avec une regex `^USR-[A-Z23456789]{6,8}-[A-Z23456789]{6}$`
   et `^EVT-...$`, refuser les placeholders, (iii) résoudre la
   dérive ENG-MPIG[O0]BUZ-N084HN par une migration
   append-only (DecisionRecord + reversal entries) plutôt que
   modification rétroactive (D-107 #15 préservé), (iv)
   exporter et persister une IdMapping (Base44 id ↔ systemId)
   pour rendre le mapping explicite et restorable, (v) écrire
   et exécuter un test restauration hors Base44 (D-132 #6) —
   import des 29 CSV dans une instance PostgreSQL locale et
   reconstruction d'un payout, (vi) planifier un backup
   quotidien automatisé (D-132 #5).

──────────────────────────────────────────────────
6. STATUT FINAL

   ☑ BLOQUÉ PAR → précondition D-132 (« Un item FAILED = Event
     0B interdit ») et dérive ID structurelle.

   Décompte D-132 (7 items) :
     #1 Aucun objet métier critique sans systemId : ÉCHEC
        (talentUserId placeholders, eventId orphans).
     #2 Mapping Base44 id → systemId documenté : PARTIEL
        (présent par cohabitation, sans IdMapping persistée).
     #3 Schema registry versionné : PARTIEL (Git + .jsonc
        sans schemaVersion).
     #4 Export complet tables critiques lisible hors Base44 :
        ÉCHEC (9/29 entités sans export, dont ContractSnapshot,
        SchedulerDueTask, SchedulerRun, SessionPresence, User).
     #5 Backup planifié : ÉCHEC (export ad-hoc manuel le jour
        de l'audit).
     #6 Test restauration hors Base44 : ÉCHEC (aucune trace).
     #7 Vérification intégrité référentielle : ÉCHEC (2 events
        orphans + dérive O/0 + placeholders userId).

   Score : 0/7 PASSED, 2/7 PARTIAL, 5/7 FAILED.
   « Un item FAILED = Event 0B interdit. » → 5 items FAILED.

   Estimation indicative hors règle 3 :
     — IDFactory définition + couverture des préfixes : 90 %.
     — Couches portables D-127 codées : 75 %.
     — 11 repositories D-128 codés : 100 %.
     — Conformité d'alphabet IDFactory portable : 40 % (la
       contamination est observable mais pas systématique).
     — Intégrité référentielle effective : 70 % (la majorité
       des liens marchent, quelques drifts critiques).
     — Backup + restauration testée : 0 %.
   Effectif fonctionnel pour première transaction réelle :
   ~ 35 %.

──────────────────────────────────────────────────
7. DÉPENDANCES SORTANTES

   • Domaine A (ontologie) — D-107 #15 et #16 sont des
     interdits architecturaux qui appartiennent au substrat
     identitaire de A. La violation ENG-MPIG[O0]BUZ-N084HN
     prouve que ces interdits sont seulement applicatifs.
     A et H se renforcent ou s'effondrent ensemble.
     — Source : D-107 + données

   • Domaine B (finance) — le ledger persisté pour la
     « Pierre de Rosette » se répartit sur 2 systemId
     fantômes du même engagement (cf. fiche B §3). Tout
     calcul agrégé par engagementId tombe à côté du sujet.
     — Source : fiche Domaine B §3 BLOQUANT

   • Domaine G (admin) — les 5 DataAccessLedgerEntry
     OVERRIDE pointent vers la variante chiffre (0) tandis
     que l'Engagement réel est à la variante lettre (O). Le
     journal d'audit consigne des cibles inexistantes.
     — Source : fiche Domaine G §3 DÉGRADANT

   • Domaine C (Stripe) — D-129 WEBHOOK-RAWBODY-01 est une
     précondition Event 0B (« Un seul FAILED = Event 0B
     interdit »). Le test conditionne le passage à la
     transaction réelle. Sans rapport d'exécution explicite,
     l'invariant reste à confirmer.
     — Source : D-129

   • Pivot de marché OS §1.5 — toute future réutilisation de
     l'architecture pour un nouveau domaine dépend de la
     pleine portabilité hors Base44. Tant que Domaine H reste
     bloqué, le pivot est théorique.
     — Source : OS V15 §1.5

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FIN DE LA FICHE — H. Portabilité et infrastructure
Fiche conservée en mémoire de session pour Prompt de Synthèse.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━