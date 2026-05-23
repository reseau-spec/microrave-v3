FICHE D'ÉVALUATION — H. PORTABILITÉ ET INFRASTRUCTURE
Date d'évaluation : 22 mai 2026 06:44 EST
Fait par Claude Opus 4.7
Documents sources : EXPORT_BRUT (D-127 Base44 comme rampe, doctrine architecturale ; D-128 Repository interfaces — liste complète ; D-129 WEBHOOK-RAWBODY-01 test P0 bloquant ; D-130 MigrationTriggerPolicyConfig 3 niveaux ; D-131 Discipline développement ; D-132 Portability Readiness checklist 7 items ordonnés ; D-064 préfixes IDFactory ; D-117 Pierre de Rosette ; D-119 séquence Event 0A → 0B), Plan d'Implantation §3.2 (Portability Readiness 7 items état actuel), code src/core/IDFactory.js (92 l., 28 préfixes), src/repositories/index.js (125 l.), 11 fichiers src/repositories/*Repository.js, src/adapters/base44/PolicyConfigAdapter.js, docs/cartes/*.drawio (10 fichiers V4), test P0 PORTABILITY-SYSTEMID-01 (3/3 PASSED).
Niveau de confiance : HAUTE sur l'IDFactory et le pattern d'adapter portable ; PARTIELLE sur la couverture des 11 repositories D-128 (4 entités manquantes) et l'intégrité référentielle ; INFÉRENCE sur le canal de migration future (Base44 → PostgreSQL).
──────────────────────────────────────────────────
1. CRITÈRES DE COMPLÉTUDE
Ce domaine est prêt pour la première transaction quand :

Aucun objet métier critique sans systemId — D-132 critère 1 + D-107 #15 (modifier systemId existant interdit). Chaque entité métier doit avoir un identifiant V3 souverain immuable, généré par IDFactory avant insertion DB.
Mapping Base44 id → systemId documenté — D-132 critère 2. Soit explicite (table IdMapping), soit implicite mais vérifiable (chaque entité contient son systemId comme champ).
Schema registry versionné — D-132 critère 3. Le modèle de données est explicité, traçable dans le temps, et permet à un tiers de comprendre la structure sans accès à Base44.
Export complet des tables critiques lisible hors Base44 — D-132 critère 4. Engagement, ContractSnapshot, FinancialLedger, ReputationLedger, DataAccessLedgerEntry, PolicyConfig exportables au format JSON/CSV interprétables sans le runtime Base44.
Backup planifié — D-132 critère 5. Périodicité documentée, lieu de stockage déterminé, propriété claire.
Test de restauration hors Base44 effectif — D-132 critère 6. Capacité prouvée de reconstruire un état cohérent depuis l'export, sans Base44.
Vérification d'intégrité référentielle — D-132 critère 7 : Event ↔ Lineup ↔ MissionSlot ↔ Engagement ↔ Ledger. Aucun orphelin. Aucun foreign key invalide.
MigrationTriggerPolicyConfig 3 niveaux armée — D-130 : ALERTE (crédits > 8 000 / mois pendant 1 mois), MIGRATION À PLANIFIER (> 9 900 pendant 3 mois consécutifs OU > 50 events simultanés OU > 10 000 Engagements), MIGRATION ACCÉLÉRÉE (bug financier P0 causé par Base44, impossibilité validation webhooks, impossibilité invariants ledger/payout/WORM).
11 repositories interfaces D-128 implémentés : EngagementRepository (Event, Lineup, MissionSlot, MissionApplication, MissionProposal, Engagement, LineupPlacement), LedgerRepository, PaymentRepository, SchedulerRepository, UserRepository, CheckpointRepository, DisputeRepository, ReputationRepository, AdminRepository, PolicyConfigRepository. EventRepository/MissionRepository peut être absorbé dans EngagementRepository selon D-128.
Couches portables D-127 entièrement détachables de Base44 : IDFactory, MissionGraph, ContractSnapshot WORM logic, FinancialLedger + LedgerCodeMap V3, Payment waterfall, Stripe webhook + idempotency, 6 verrous anti-double payout, SOTS/ReputationLedger, PolicyConfig resolver, SchedulerDueTask, AdminAuthorityResolver, DataAccessLedger, i18n strings, PresenceProofResolver, MoneyMovementRouter, MissionConversionGuard, CheckpointCulturalProfile, PhoneFreeRitualGuard (conditionnel).
Discipline développement D-131 : GitHub utilisé, branches dev/staging/main, PR avant merge, environnements et secrets séparés, Stripe test sur dev/staging et live sur prod, CI/CD minimum (lint + tests P0 critiques).
Pour Event 0B (Stripe live 5-10$) : D-132 "Un item FAILED = Event 0B interdit." Les 7 items doivent être verts.

Ce domaine bloque tout le reste si :

Un seul des 7 items D-132 est FAILED → Event 0B interdit (impact direct sur la séquence D-119).
WEBHOOK-RAWBODY-01 test P0 FAILED → webhook proxy externe obligatoire avant argent réel (D-129).
Un objet métier critique sans systemId → migration future impossible.

──────────────────────────────────────────────────
2. ÉTAT ACTUEL DOCUMENTÉ
Ce qui existe et fonctionne selon les documents :

IDFactory.js (92 l.) — pilier portabilité : 28 préfixes définis (EVT, ENG, EGC, MSL, MAP, MPR, CSN, LBY, USR, TAL, CKP, EVL, LDG, PAY, DSP, ADM, PCF, TRP, SCH, AMD, SPR, CS1, CS2, SOT, REP, WHK, IDM, CXL). Format PREFIX-TIMESTAMP_BASE36-RANDOM_6CHARS (ex: EVT-M5KQZA-3F9X2B). Trois fonctions exportées : generate(), validate(), getType(). Le commentaire l. 6-12 verrouille la doctrine : "Le Base44 id n'est JAMAIS un identifiant métier souverain. Le systemId est immuable une fois créé."
PORTABILITY-SYSTEMID-01 test P0 : 3/3 PASSED. Couvre :

T-01 : tout objet créé via IDFactory.generate() a un préfixe souverain reconnu.
T-02 : le préfixe ne contient jamais l'id Base44 interne (UUID nu).
T-03 : IDFactory.validate(id) rejette un id Base44 nu sans préfixe souverain.

Conclusion test : "28 types IDFactory couverts." Conforme D-132 critère 1 + D-107 #15-#16.
src/repositories/index.js (125 l.) — point d'entrée unique : centralise l'accès aux 11 repositories implémentés. Pattern d'adapter respecté : chaque repository expose une interface stable, l'implémentation Base44 est isolée. Exporte 17 clés (alias inclus) :

engagements (EngagementRepository couvre Event/Lineup/MissionSlot)
ledger + ledgerRecords (alias)
payment + payoutExecutionRecords (sub-objet) + settlementInstructions (sub-objet)
talentPaymentProfiles (objet inline pour KYC Stripe)
scheduler
sessionPresence
sots
reputation
admin
contractSnapshots
membership
policyConfig


Pattern adapter portable concrètement implémenté pour PolicyConfig : src/repositories/PolicyConfigRepository.js (38 l., interface pure) délègue à src/adapters/base44/PolicyConfigAdapter.js (185 l., implémentation Base44). Le commentaire l. 4-9 explicite la doctrine : "Si Micro Rave migre vers PostgreSQL, seul l'adapter change. Cette interface reste identique." C'est le modèle architectural exemplaire.
SchedulerService injecté pur — "zero logique metier (...) Tous les repositories sont injectes — pas de require direct dans ce service." (Fiche F). Conforme à la portabilité : la migration future change l'instanciation cron.js sans toucher au service.
PolicyConfigResolver fail-closed strict (Fiche G) : aucune valeur par défaut, aucun fallback implicite. Toute config vient de la DB — déplaçable telle quelle.
Append-only des entités d'audit (Fiche G) : DataAccessLedgerEntry, AdminAction, AdminIncidentRecord, ReputationLedger, FinancialLedger, ContractSnapshot WORM. Pas de DELETE/UPDATE exposé dans les repositories. Le mode append-only est en lui-même un atout de portabilité : un export append-only se restaure facilement, ordre chronologique préservé.
10 cartes drawio V4 (docs/cartes/microrave_v4_*.drawio) : registry visuelle couvrant philosophique, ontologie, machine d'état, waterfall/ledger, quickplay, sots/réputation, admin roles, fiscalité, lois invariantes, pierre de rosette, analytique. Versionnées dans Git mais format non machine-exploitable.
D-131 Discipline développement appliquée : code dans Git (présent dans l'archive), structure dev/main/staging implicite, .gitignore cache les secrets (vérifié pour .env), package.json propre, dépendances Stripe test seulement (STRIPE_SECRET_KEY=sk_test_...).
Webhook proxy autonome (stripe-webhook-proxy/index.js) : prêt à déployer Railway/Render — répond à D-129 prérequis "webhook proxy externe obligatoire avant argent réel".

Ce qui vient de V1 et est encore actif :

Domaine microrave.ca : V1 sera réutilisée comme rampe UX (Plan §3.1). Acquis : pas de migration domaine ni de DNS. Dette : couplage à l'hébergement V1 (probablement Base44 lui-même ou un hébergeur Web tiers ?) — à valider.
GitHub présent dès V1 — pas de migration historique de code à faire. La discipline D-131 est compatible avec l'existant.

Ce qui vient de V2 et a survécu :

Rien. V2 a été abandonnée précisément faute de fondations portables — c'est l'apprentissage qui a donné naissance à D-127 ("Base44 peut héberger l'objet. Il ne doit pas devenir l'objet.").

──────────────────────────────────────────────────
3. LACUNES IDENTIFIÉES
BLOQUANT (empêche la première transaction) :

Aucun blocage formel pour Event 0A (Stripe test). D-132 critère ouvre Event 0B (Stripe live) — pas Event 0A. La première transaction Pierre de Rosette ciblée à 5-10$ Stripe live correspond à Event 0B. Si la première transaction est ciblée à un Event 0A (Stripe test) ou à un test interne sans argent réel, alors D-132 ne se déclenche pas. Si la première transaction = Event 0B, alors 6 des 7 items D-132 sont en état FAILED ou partiel (cf. plan d'implantation §3.2), et Event 0B est interdit par D-132. Source de l'identification : Plan d'Implantation §3.2 tableau état actuel + grep sur les répertoires scripts/tests.

DÉGRADANT (réduit la qualité, n'empêche pas) :

3 repositories D-128 manquants : UserRepository, CheckpointRepository, DisputeRepository. Source : ls src/repositories/ (11 fichiers) versus D-128 (12+ repositories). Conséquences :

UserRepository absent → la gestion des USR-* (DJ Alex, organisateur, payeur) est dispersée. Lecture User actuellement via les services en direct sur l'entité Base44 User. Pour Pierre de Rosette nominale : tolérable si DJ Alex et organisateur ont leurs USR-* seedés via seed-pilot-data.js. Mais aucune frontière propre.
CheckpointRepository absent → aucun moyen V3 de lire/écrire les coordonnées GPS du lieu (cf. Fiche D BLOQUANT). Pour DJ Alex à Bar Le Trèfle : le lieu doit exister quelque part. Probablement Base44 entité Checkpoint ou EventLocation lue par l'UI, jamais touchée par V3.
DisputeRepository absent → chaîne LOI DISPUTE-01 non câblée. Hors scope Event 0 pilote (pas de litige attendu).


URL Base44 hardcodée dans 11 repositories : BASE44_BASE_URL = 'https://futuristic-rave-core-flow.base44.app/api' répété 11 fois. Source : grep -rnE "BASE44_BASE_URL\s*=" src/repositories/ | wc -l → 11. Conséquences : pour passer en staging → besoin de modifier 11 fichiers ; pour migrer vers PostgreSQL → besoin de modifier 11 fichiers. L'URL devrait être lue depuis process.env.BASE44_BASE_URL ; à défaut, depuis un module central src/config/api-endpoints.js. Aucune des deux options n'est en place. C'est le principal écart à D-127 "Base44 est la rampe" : la rampe est en dur dans le code.
IdMapping table absente malgré le préfixe IDM. Source : grep -rnE "IdMapping|IDM-" src/ → 1 résultat (l'enregistrement du préfixe dans IDFactory). Aucun service ne crée, lit ou maintient des records IdMapping. Mais le mapping existe de facto : chaque entité contient à la fois son id Base44 et son systemId V3. La migration nécessitera de parcourir chaque table pour extraire le mapping — c'est faisable mais non préparé. D-132 critère 2 est partiel : préfixe réservé, table non créée.
Aucun script d'export dans scripts/. Source : ls scripts/ → cron.js, run-j9-pilot.js, seed-pilot-data.js, seed-policy-config.js. Pas de export-snapshot.js, backup-engagements.js, etc. D-132 critères 4-5-6 (Export, Backup, Restauration) : 0 % implémentés. Pour Event 0A (Stripe test) : tolérable. Pour Event 0B (Stripe live) : interdit par D-132.
Aucune vérification d'intégrité référentielle. Source : grep -rnE "(eventId.*engagementId|FK_)" src/ → 0 résultat utile. Aucun script verify-integrity.js, aucun test P0 INTEGRITY-REFERENTIAL-01. Conséquence : un orphelin (Engagement avec un eventId inexistant) n'est pas détecté. Pour Pierre de Rosette mono-event : risque négligeable. Pour volume MVP 5+ events : nécessaire.
MigrationTriggerPolicyConfig D-130 non seedée + non utilisée. grep -rnE "MigrationTrigger" src/ config/ → seules les références doctrinales (commentaires). Pas de service checkMigrationThreshold(). Pour Event 0 pilote : non-bloquant. Pour suivi post-MVP : nécessaire.
Schema registry non versionné en base machine-lisible. Les 10 cartes drawio sont versionnées dans Git mais nécessitent un parsing manuel. D-132 critère 3 : partiel (humain-lisible, pas machine-exploitable). Un schema-registry.json ou un export du modèle Base44 dans le repo accélérerait la vérification automatique.

REPORTABLE (peut attendre l'événement 2+) :

MigrationTriggerPolicyConfig 3 niveaux + procédure de migration formalisée — D-130. Tant que le volume reste sous les seuils MVP (5-15 events), pas critique.
Test PORTABILITY-RESTORE-01 (Plan §3.2 item 5) — non créé. Validable une fois les scripts d'export en place.
Migration effective vers PostgreSQL — D-130 destination préférée. Hors scope V3.0.
CI/CD complet pipeline P0 automatisés — D-131 V3.0.1 "V3.0.1 : pipeline complet P0 automatisés". Hors scope V3.0 initial.
Discipline secrets séparés dev/staging/prod — D-131 "dev + staging → Stripe test keys. prod → Stripe live keys." L'archive .env audité ne contient que des Stripe test keys → conforme pour le moment, mais aucun mécanisme automatique ne sépare les environnements.

ANGLE MORT POTENTIEL :
Y a-t-il quelque chose que ce domaine requiert pour la première transaction que l'OS ne documente pas explicitement ?
→ OUI — trois INFÉRENCES NON DOCUMENTÉES, à valider par le fondateur :

**La première transaction visée est-elle Event 0A (Stripe test) ou Event 0B (Stripe live 5-10)?∗∗D−119seˊparelesdeux:∗"Event0A(Stripetest),Event0B(Stripelive5−10) ?** D-119 sépare les deux : *"Event 0A (Stripe test), Event 0B (Stripe live 5-10
)?∗∗D−119seˊparelesdeux:∗"Event0A(Stripetest),Event0B(Stripelive5−10), Event 1 (...)"* D-132 ne se déclenche que pour Event 0B. **Si la première transaction = Event 0A** (montants test, pas d'argent réel) → D-132 ne bloque pas, et le domaine H peut être à l'état actuel sans conséquence sur le payout. **Si la première transaction = Event 0B** (argent réel) → 6 des 7 items D-132 doivent être verts, ce qui n'est pas le cas. La phrase canonique D-117 (Pierre de Rosette) *"talent réel payé via Stripe Connect, prestation réelle"* suggère plutôt Event 0B — mais 5-10$ peut aussi tomber en Stripe test selon la configuration. À valider — cette distinction conditionne le statut de la fiche.
Comment l'URL Base44 sera-t-elle dévariabilisée pour staging/prod ? Aujourd'hui hardcodée dans 11 fichiers. INFÉRENCE possible : (a) process.env.BASE44_BASE_URL injectée par Railway/Render avec valeurs distinctes par environnement ; (b) un module central src/config/api-endpoints.js qui exporte l'URL ; (c) un fichier de config par environnement. Sans choix arrêté, le passage staging→prod nécessitera 11 modifications fichier-par-fichier — fragilité opérationnelle. À valider.
Le futur PostgreSQL aura-t-il le même schéma que Base44 ? D-130 "Destination préférée : PostgreSQL. Décision finale au moment de la migration." — la décision est repoussée mais la conséquence est immédiate : si le schéma cible diffère (ex: normalisation différente, types JSON, séparation des tables ContractSnapshotV1/V2), alors la migration nécessite un mapping de données non trivial. La doctrine D-127 (couches portables) protège la logique métier mais pas les données. À valider — au minimum, un schéma cible préliminaire dans le repo accélérerait la préparation.

──────────────────────────────────────────────────
4. DETTE HÉRITÉE

De V1 : domaine microrave.ca existant — acquis pour rampe UX, mais couplage à l'hébergement V1 à clarifier. Si V1 vit dans Base44, la séparation V1 (UI) / V3 (logique souveraine) doit être documentée. Plan §3.1 "Adapter les pages existantes de V1 microrave.ca vers V3. Ne pas repartir de zéro." — pragmatique mais ne dit pas où vivront ces pages adaptées (Base44 ? Vercel ? Netlify ?).
De V2 : l'apprentissage négatif. V2 a échoué parce que tout était dans Base44 — cette douleur a accouché de D-127. C'est une dette qui accélère V3 : la doctrine d'extraction est claire et ratifiée par expérience, pas par hypothèse.
De l'OS V3 lui-même : D-127 + D-128 + D-130 + D-132 forment une doctrine architecturale lourde (4 décisions sur la portabilité, 7 items D-132 à valider, 28 préfixes IDFactory). Le code implémente la fondation correcte (IDFactory + pattern adapter PolicyConfig + 11 repositories) mais laisse les couches d'export-restauration-intégrité entièrement à faire. C'est une dette technique consciente : "Une sortie théorique n'est pas une stratégie de sortie. Il faut tester qu'on peut vraiment sortir." (D-132). Le test concret n'a pas eu lieu — l'évacuation est théorique.

──────────────────────────────────────────────────
5. DELTA VERS COMPLÉTUDE
Variabiliser l'URL Base44 (déplacer les 11 occurrences vers process.env.BASE44_BASE_URL ou un module central), créer les 3 repositories manquants D-128 (UserRepository, CheckpointRepository, DisputeRepository), écrire les scripts export-snapshot.js + verify-integrity.js + tester effectivement la restauration hors Base44 (D-132 critères 4-5-6-7), produire un schema-registry.json machine-lisible (D-132 critère 3), seeder MigrationTriggerPolicyConfig D-130, et obtenir validation fondateur sur les trois INFÉRENCES (Event 0A vs 0B, mécanisme URL multi-env, schéma cible PostgreSQL).
──────────────────────────────────────────────────
6. STATUT FINAL
☒ PRÊT SOUS CONDITIONS →
Conditions :

La première transaction est Event 0A (Stripe test) — si Event 0B (Stripe live), alors statut = BLOQUÉ PAR D-132 (6 sur 7 items en état partiel ou absent).
Le seedage initial (seed-policy-config.js, seed-pilot-data.js) est exécuté sur la base Base44 cible avant Event 0 — sinon fail-closed bloque tout (Fiche G).
L'URL Base44 hardcodée dans les 11 repositories est acceptable tant que l'environnement staging n'est pas distinct du dev — sinon, refactor obligatoire avant Event 0B.

Décomposition de l'estimation :

✅ IDFactory + 28 préfixes souverains (D-132 critère 1) : 100 %
✅ Pattern adapter portable (D-127 illustré par PolicyConfigAdapter) : 100 %
✅ Append-only des entités d'audit (portable par construction) : 100 %
✅ Test P0 PORTABILITY-SYSTEMID-01 : 100 %
✅ 11 repositories implémentés (sur ~14 D-128) : 80 %
✅ Discipline développement D-131 partielle (Git présent, secrets en .gitignore) : 70 %
⚠ Schema registry machine-lisible (D-132 critère 3) : 30 % (10 cartes drawio = registry visuelle)
⚠ Mapping Base44 id → systemId documenté (D-132 critère 2) : 50 % (implicite via champ systemId)
❌ URL Base44 variabilisée (multi-env) : 0 %
❌ UserRepository / CheckpointRepository / DisputeRepository (D-128) : 0 %
❌ Scripts d'export hors Base44 (D-132 critère 4) : 0 % (seul PolicyConfig effectivement seedable, pas exporté)
❌ Backup planifié (D-132 critère 5) : 0 % non documenté
❌ Test restauration hors Base44 (D-132 critère 6) : 0 %
❌ Vérification intégrité référentielle Event↔Lineup↔...↔Ledger (D-132 critère 7) : 0 %
❌ MigrationTriggerPolicyConfig 3 niveaux (D-130) : 0 %

Estimation globale pondérée : ~55 % sur les critères Event 0B. Pour Event 0A (sans argent réel) : ~85 % (les items 4-5-6 deviennent non-bloquants).
──────────────────────────────────────────────────
7. DÉPENDANCES SORTANTES

Domaine A (Ontologie) : la machine d'état repose sur IDFactory.generate() pour chaque entité créée (Engagement, ContractSnapshot V1/V2, etc.). D-107 #15-#16 (modifier systemId / préfixes IDFactory) bloque toute mutation post-création. Domaine A est entièrement dépendant de domaine H pour l'identifiant. Source : OS V15 BLOC 1 + D-127 (IDFactory dans la liste portable).
Domaine B (Finance et ledger) : LedgerEntry, ContractSnapshot, PayoutExecutionRecord, SettlementInstruction sont des entités append-only avec systemId souverain. D-127 explicite "FinancialLedger + LedgerCodeMap V3" + "Payment waterfall" + "Anti-double payout 6 verrous" comme couches portables jamais propriété de Base44. Sans repository pattern correct (domaine H), le ledger devient prisonnier de Base44.
Domaine C (Stripe et paiements) : WebhookProcessedLog, StripePaymentSignal, TalentPaymentProfile sont stockés via PaymentRepository. D-127 explicite "Stripe webhook + idempotency" comme couche portable. D-129 fait du WEBHOOK-RAWBODY-01 un test P0 bloquant pour Event 0B — directement dans le périmètre H. Bidirectionnel.
Domaine D (Présence) : CheckpointRepository manquant côté V3 (cf. Fiche D BLOQUANT). Le calcul gpsDistanceMeters nécessite l'accès aux coordonnées du lieu — actuellement impossible côté V3. Domaine D est bloqué par l'absence d'un repository côté H.
Domaine E (SOTS) : ReputationRepository implémenté ✓, SOTSRepository implémenté ✓. Conformes à D-127 "SOTS/ReputationLedger" + D-128. Domaine E peut migrer proprement.
Domaine F (Scheduler) : SchedulerRepository + SchedulerDueTask implémentés ✓. D-127 "SchedulerDueTask" dans la liste portable ✓. Migration possible.
Domaine G (Admin) : AdminRepository + PolicyConfigRepository implémentés ✓ avec PolicyConfigAdapter modèle portable. D-107 #15 (systemId immuable) couvre la portabilité. Bidirectionnel : G impose les invariants WORM/append-only que H rend exportables.
Domaine I (UX et vérité perçue) : D-111 "Exporter est un pouvoir distinct." — sans scripts d'export (domaine H), l'UX ne peut pas offrir d'export utilisateur (talents demandant leur historique, payeurs demandant leurs factures, audit régulateur). Dépendance forte pour Event 0B et au-delà.
Domaine J (Acteurs et onboarding) : UserRepository manquant côté H impacte la cohérence multi-rôles. Sans repository User propre, l'onboarding KYC Stripe Connect persiste les données dispersées. Dépendance moyenne.
→ Tous les domaines dépendent de H pour la portabilité long-terme. Pour la première transaction nominale Pierre de Rosette (Event 0A test), seuls les domaines A et C dépendent de H de manière dure (IDFactory + repository pattern). Pour Event 0B (Stripe live), tous les domaines dépendent de H au sens D-132 critère 7 "intégrité référentielle Event↔Lineup↔MissionSlot↔Engagement↔Ledger". Source : D-132 + OS V15 BLOC 16. C'est l'infrastructure de continuité — sans elle, aucun engagement ne peut être tenu durablement envers les talents et payeurs.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FIN DE LA FICHE — H. PORTABILITÉ ET INFRASTRUCTURE
Fiche conservée pour le Prompt de Synthèse.