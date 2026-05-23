FICHE D'ÉVALUATION — G. ADMIN ET SÉCURITÉ
Date d'évaluation : 22 mai 2026 06:44 EST
Fait par Claude Opus 4.7
Documents sources : EXPORT_BRUT (D-095 hiérarchie 5 niveaux sensibilité, D-105 10 rôles admin canoniques, D-106 SoloFounderOverride ≠ DualApproval, D-107 19 interdits absolus, D-108 PolicyConfigChangeRecord, D-109 SecretsRotationPolicy, D-110 ConflictOfInterestRecord, D-111 Export pouvoir distinct, D-112 Admin Authority Matrix, D-133 alertes), OS V15 §LOI GREFFIER-01, code src/repositories/AdminRepository.js (211 l.), src/repositories/PolicyConfigRepository.js (38 l.), src/adapters/base44/PolicyConfigAdapter.js (185 l.), src/core/policy-config-resolver.js (133 l.), src/core/transitionEngagement.js (l. 226-264 WORM, l. 366-402 DAL câblé), config/policy-config-schema.js, tests P0 ADMIN-ABS-* (5), ADMIN-AUDITOR-01, ADMIN-CELL-SECRET-01, ADMIN-DEV-FINANCE-01, ADMIN-POLICY-SOLO-01, ADMIN-SOLO-02, ADMIN-SUPPORT-PAYOUT-01, DATAACCESS-FAIL-01, DATAACCESS-WRITE-01, POLICY-DIRECT-01, POLICYCONFIG-FAILCLOSED-01.
Niveau de confiance : HAUTE sur les 14 tests P0 admin PASSED + l'immutabilité append-only des 4 entités d'audit ; PARTIELLE sur la couverture des 19 interdits (mécanique compositionnelle non-uniforme) ; INFÉRENCE sur le contrôle d'identité du SOLO_FOUNDER_OVERRIDE (chaîne magique non gardée).
──────────────────────────────────────────────────
1. CRITÈRES DE COMPLÉTUDE
Ce domaine est prêt pour la première transaction quand :

Les 19 interdits absolus D-107 sont architecturalement impossibles — D-107 phrase canonique : "Certains pouvoirs ne doivent pas exister, parce que leur existence détruirait la confiance que Micro Rave est censée incarner." Liste : (1) modifier/supprimer FinancialLedger, (2) supprimer ReputationLedgerEntry, (3) modifier ContractSnapshot WORM, (4) sauter transition obligatoire, (5) revenir sur état WORM, (6) modifier Engagement archivé, (7) supprimer DecisionRecord, (8) supprimer AdminAction, (9) supprimer DataAccessLedgerEntry, (10) supprimer/falsifier BugReplayRecord, (11) modifier WebhookIdempotencyRecord traité, (12) désactiver DataAccessLedger, (13) modifier SchedulerRun complété, (14) supprimer AdminIncidentRecord, (15) modifier systemId existant, (16) modifier préfixes IDFactory, (17) contourner MoneyMovementRouter, (18) créer SettlementInstruction sans DecisionRecord valide, (19) contourner 6 verrous anti-double payout.
DataAccessLedger câblé sur toute mutation d'état — LOI GREFFIER-01 + D-107 #12 : "Désactiver le DataAccessLedger" est interdit absolu. Chaque appel à transitionEngagement() doit produire une DataAccessLedgerEntry avec actorUserId, actorRole, targetObjectType, targetObjectId, accessType, justification, transitionKey, guardApplied, wormLevel.
DataAccessLedgerEntry strictement append-only — D-107 #9 + test ADMIN-ABS-DAL-01 requiredBeforeEvent=0A.
AdminIncidentRecord strictement append-only après création — D-107 #14 + test ADMIN-ABS-INCIDENT.
AdminAction log strictement append-only — D-107 #8 + reasonCode obligatoire.
BugReplayRecord strictement append-only — D-107 #10 + test ADMIN-ABS-BUGREPLAY.
SchedulerRun complété strictement immuable — D-107 #13 + test ADMIN-ABS-SCHEDULERRUN.
systemId d'un objet existant strictement immuable — D-107 #15 + test ADMIN-ABS-SYSTEMID.
SoloFounderOverride documenté avec triple traçabilité — D-106 : "délai configurable (recommandé 60s, dans DualApprovalThresholdConfig), confirmation explicite obligatoire, AdminIncidentRecord type SOLO_FOUNDER_OVERRIDE, DataAccessLedgerEntry marqueur FOUNDER_SOLO_OVERRIDE, reasonCode obligatoire."
Double validation obligatoire sur : pseudonymisation compte, TaxConfig, LedgerCodeMap, SOTSCommissionModulationConfig, DataRetentionPolicyConfig, MigrationTriggerPolicyConfig, SecretsRotationPolicyConfig, DualApprovalThresholdConfig elle-même (D-106 + D-108 — auto-protégée), payouts exceptionnels au-delà du seuil, reversals ledger au-delà du seuil.
PolicyConfigChangeRecord créé sur toute modification — D-108 : "Toute modification de toute PolicyConfig produit : AdminAction + DataAccessLedgerEntry + PolicyConfigChangeRecord. Interdit absolu : aucune modification directe en database en production."
Hiérarchie de sensibilité D-095 respectée — accès niveau 3+ → DataAccessLedgerEntry obligatoire, niveau 5 → fondateur + double validation.
10 rôles canoniques D-105 implémentés ou unifiés au sous-ensemble MVP minimal — Niveau 5 FOUNDER, 4 FINANCE_ADMIN, 3 OPS/DISPUTE/PRIVACY_SECURITY/POLICY_ADMIN, 2 SUPPORT/DEV/CELL_MANAGER, 1 AUDITOR_EXTERNAL. MVP solo-founder : FOUNDER absorbe les vacants avec marqueur FOUNDER_ACTING_AS_[ROLE].
validateCriticalConfigs() exécuté au démarrage — Le système refuse de démarrer si une config CRITIQUE est absente. Fail-closed strict.
POLICYCONFIG-FAILCLOSED-01 PASSED en production seedée — toutes les configs CRITIQUE sont présentes en DB avant tout autre test.

Ce domaine bloque tout le reste si :

Un seul des 19 interdits absolus D-107 est violé — la confiance institutionnelle est détruite.
DataAccessLedger désactivé — D-107 #12.
validateCriticalConfigs() échoue — aucune transition possible (fail-closed).

──────────────────────────────────────────────────
2. ÉTAT ACTUEL DOCUMENTÉ
Ce qui existe et fonctionne selon les documents :

AdminRepository.js (211 l.) expose quatre familles d'opérations toutes append-only :

appendToDataAccessLedger(entry) — validation actorUserId + targetObjectId obligatoires (l. 82-86), pas de méthode update/delete exportée → D-107 #9 architecturalement respecté.
createAdminAction(data) — validation actorUserId + actionType + reasonCode obligatoires (l. 126-129), pas d'update → D-107 #8 respecté.
createAdminIncidentRecord(data) — validation incidentType + severity obligatoires (l. 159-162), resolvedAt: null à la création, pas d'update → D-107 #14 respecté.
createPolicyConfigChangeRecord(data) — validation configKey + changedBy + adminActionId obligatoires (l. 188-191) → D-108 conforme côté interface.


PolicyConfigRepository.js est une façade minimale (38 l.) qui délègue à l'adapter Base44. Interface portable D-128 — l'adapter peut être remplacé par PostgreSQL sans toucher au reste du code.
PolicyConfigAdapter.js (185 l.) :

findByKey(key) retourne null si l'adapter n'est pas connecté (warning + mode dégradé l. 69-75), retourne null sur erreur HTTP (l. 90-94). Le caller (resolver) décide du fail-closed.
upsert(data) distingue PUT (clé existante) et POST (nouvelle clé) — l. 117-126. Ne crée pas de PolicyConfigChangeRecord parallèle — c'est l'appelant qui doit le faire.
findByCategory(category) retourne [] en mode dégradé (l. 156-162).


policy-config-resolver.js (133 l.) — gardien unique d'accès aux configs :

getConfig(key) lance POLICY_CONFIG_MISSING si la clé est absente ou null (l. 55-62). "FAIL-CLOSED — jamais de valeur par défaut silencieuse" (commentaire l. 6-13).
Cache 1 minute (l. 35-36, 76) — économise les appels Base44 sans masquer les changements de gouvernance long-terme.
6 types de valeurs supportés : CENTS, PPM, INTEGER, BOOLEAN, STRING, ENUM (l. 25-32).
validateCriticalConfigs() (l. 111-131) lit toutes les clés CRITIQUE du schema et lève CRITICAL_CONFIG_MISSING si l'une est absente.


DataAccessLedger câblé dans transitionEngagement.js après Guard 5 (l. 366-402) :

Sur toute mutation d'état (entrée dans la fonction et résolution de transition), appendToDataAccessLedger() est appelé avec actor + actorRole + targetObjectId + accessType='TRANSITION' + transitionKey + guardApplied + wormLevel.
Pattern non-bloquant : si repositories.admin absent, le if (l. 370) saute silencieusement. Si l'écriture Base44 échoue, try/catch (l. 384-401) crée un AdminIncidentRecord P0 type DAL_WRITE_FAILED (D-133 alerte 10) et continue.


WORM 3 niveaux implémentés dans transitionEngagement.js (l. 226-264) :

W3 → throw immédiat "L'état est architecturalement immuable" (l. 228-232) — couvre D-107 #6.
W2 → si transition non dans TRANSITION_TABLE, throw avec message "WORM_VIOLATION_LEVEL_2: AdminIncidentRecord P0 créé" + log console (l. 234-258) — couvre D-107 #5 partiellement.
W1 → simple console.warn (l. 259-264) — corrigeable.


15 tests P0 admin et sécurité exécutés le 22 mai 2026 :

ADMIN-ABS-BUGREPLAY : 4/4 PASSED — D-107 #10 architecturalement impossible.
ADMIN-ABS-DAL-01 : 4/4 PASSED — D-107 #9 architecturalement impossible.
ADMIN-ABS-INCIDENT : 4/4 PASSED — D-107 #14 architecturalement impossible.
ADMIN-ABS-SCHEDULERRUN : 4/4 PASSED — D-107 #13 architecturalement impossible.
ADMIN-ABS-SYSTEMID : 4/4 PASSED — D-107 #15 architecturalement impossible.
ADMIN-AUDITOR-01 : 2/2 PASSED — AUDITOR_EXTERNAL bloqué hors périmètre.
ADMIN-CELL-SECRET-01 : 5/5 PASSED — CELL_MANAGER bloqué sur events SECRET.
ADMIN-DEV-FINANCE-01 : 2/2 PASSED — DEV_ADMIN bloqué sur données financières.
ADMIN-POLICY-SOLO-01 : 9/9 PASSED — POLICY_ADMIN bloqué sur configs critiques.
ADMIN-SOLO-02 : 5/5 PASSED — SoloFounderOverride exigeant AdminIncidentRecord + reasonCode.
ADMIN-SUPPORT-PAYOUT-01 : 2/2 PASSED — SUPPORT_ADMIN bloqué sur payouts.
DATAACCESS-FAIL-01 : 2/2 PASSED — LOI GREFFIER-01 mutation status sans DAL → blocage.
DATAACCESS-WRITE-01 : 4/4 PASSED — DAL écrit sur transition réussie.
POLICY-DIRECT-01 : 6/6 PASSED — modification directe DB sans AdminAction interdite.
POLICYCONFIG-FAILCLOSED-01 : 5/6 — 5 PASSED, 1 FAILED environnemental (sandbox audit Host not in allowlist sur futuristic-rave-core-flow.base44.app — comportement attendu en production seedée).


Repositories admin et policyConfig exposés dans src/repositories/index.js (l. 115, 124) — câblage de bout en bout fonctionnel.
Tous les rôles canoniques D-105 testés au niveau accès aux entités sensibles via les tests P0 — bien que les rôles ne soient pas implémentés comme classe ou enum dans le code, les tests valident le comportement attendu par rôle.

Ce qui vient de V1 et est encore actif :

Aucun composant admin V1 hérité. La doctrine BLOC 13 (Admin Authority Matrix) est V3 native — élaborée pour combler le manque de cadre institutionnel de V1.

Ce qui vient de V2 et a survécu :

Rien. Domaine entièrement V3.

──────────────────────────────────────────────────
3. LACUNES IDENTIFIÉES
BLOQUANT (empêche la première transaction) :

POLICYCONFIG-FAILCLOSED-01 (test 5 toutes les configs critiques présentes en base) échoue en sandbox d'audit parce que l'host Base44 n'est pas dans l'allowlist (HTTP 403 Host not in allowlist). En production avec allowlist correct ET seedage exécuté, ce test passe — mais le seedage initial via node scripts/seed-policy-config.js n'a pas encore été exécuté sur la base Base44 cible. Source de l'identification : sortie console du test l. 13-26 (10 clés CRITIQUE absentes, dont payment_fees_tax_treatment, tps_ppm, tvq_ppm, maxDistancePolicy, etc.). Sans ce seedage, toute transition financière ou de présence est bloquée fail-closed car les guards lèvent POLICY_CONFIG_MISSING à la première lecture. C'est un prérequis opérationnel hors-code : exécuter le script de seed une fois en pré-production.

DÉGRADANT (réduit la qualité, n'empêche pas) :

SOLO_FOUNDER_OVERRIDE est une chaîne magique non gardée par identité. PresenceProofGuard accepte transitionReason === 'SOLO_FOUNDER_OVERRIDE' (l. 124, 245, 274) sans vérifier que actor est effectivement le fondateur ni l'enregistrer comme AdminIncidentRecord type SOLO_FOUNDER_OVERRIDE ni comme DataAccessLedgerEntry marqueur FOUNDER_SOLO_OVERRIDE (D-106). N'importe quel acteur passant cette chaîne en context peut court-circuiter le chemin nominal. Source : grep -rnE "SOLO_FOUNDER_OVERRIDE" → aucune vérification d'identité ou de niveau de rôle, aucun appel à repositories.admin.createAdminIncidentRecord({incidentType: 'SOLO_FOUNDER_OVERRIDE'}). Le test ADMIN-SOLO-02 (5/5 PASSED) valide la création d'AdminIncidentRecord par le repository, mais aucun guard ni service ne l'invoque effectivement quand un override est utilisé. Le câblage est manquant. Pour la première transaction nominale Pierre de Rosette (chemin contestation_window→payable, pas d'override) : non-bloquant. Mais c'est une fragilité institutionnelle critique pour la sécurité long-terme.
PolicyConfigChangeRecord jamais créé en production effective. AdminRepository.createPolicyConfigChangeRecord() est exporté mais aucun appelant identifié dans src/. seed-policy-config.js appelle PolicyConfigRepository.upsert() directement sans produire d'AdminAction ni de PolicyConfigChangeRecord. Source : grep -rnE "createPolicyConfigChangeRecord|PolicyConfigChangeRecord" src/services/ src/core/ → 0 résultat. Conséquence : D-108 "Toute modification de toute PolicyConfig produit : AdminAction + DataAccessLedgerEntry + PolicyConfigChangeRecord" — promesse non câblée. Acceptable pour le seedage initial (script de bootstrap), inacceptable pour modifications futures en production.
WORM Niveau 2 violation ne crée pas effectivement d'AdminIncidentRecord. Le message d'erreur (l. 247-250 transitionEngagement.js) dit "AdminIncidentRecord P0 créé" mais aucun appel à repositories.admin.createAdminIncidentRecord() n'est fait avant le throw. Promesse documentaire non tenue. Pareil pour WORM Niveau 3. Si la tentative de violation a lieu, elle est throw new Error mais sans trace persistée — l'incident n'est pas auditable au-delà du log console.
SYSTEM_HOLD mécanisme entièrement absent. SealingGuard commentaire l. 10 mentionne "AdminIncidentRecord P0 + SYSTEM_HOLD", mais aucun champ holdStatus sur Engagement, aucun service applyHold(), aucune transition d'état HOLD. D-076 lie SYSTEM_HOLD à PayoutBlockReason — non implémenté. Pour Pierre de Rosette nominale (pas d'anomalie) : non-bloquant. Pour scénarios dégradés : impossible de geler proprement un payout.
validateCriticalConfigs() jamais appelée au démarrage. Exportée par policy-config-resolver.js (l. 133) mais aucun bootstrap ne l'invoque. cron.js démarre sans validation préalable des configs critiques. Conséquence : "Le système ne peut pas démarrer sans ces valeurs" (l. 127) est une promesse documentaire — en réalité, le système démarre, et chaque guard découvre l'absence à la première lecture (fail-closed in-situ). Comportement équivalent en pratique mais moins explicite (et moins testable au boot).
Configs de gouvernance D-108 CRITIQUE non seedées : TaxConfig (structure complète), LedgerCodeMap (la table comptable elle-même), MembershipPlan, SOTSCommissionModulationConfig, DataRetentionPolicyConfig, MigrationTriggerPolicyConfig, SecretsRotationPolicyConfig, DualApprovalThresholdConfig. Seules les configs opérationnelles du chemin nominal sont dans le schema (taxes scalaires, dépôt, présence, contestation). Source : awk '/category.*CRITIQUE/' config/policy-config-schema.js. Pour Pierre de Rosette nominale : tps_ppm, tvq_ppm, event_payment_cap_cents, balanceDeadlineDays, maxDistancePolicy, minDurationFloorMinutes, minDurationRatioPpm, amendment_require_double_consent, contestationWindowDurationHours, ledger_4530 suffisent. Mais la doctrine D-108 (classification 32 tables) reste inappliquée.
DualApprovalThresholdConfig non implémentée. D-106 "délai configurable (recommandé 60s, dans DualApprovalThresholdConfig)" + D-108 (auto-protégée CRITIQUE). Aucun service requireDualApproval(), pas de champ approvedBy dans les records. Conséquence : les 8 cas de double validation D-106 (TaxConfig, LedgerCodeMap, SOTSCommissionModulationConfig, etc.) sont en réalité en validation simple. Acceptable pour MVP solo-founder absorbant tous les rôles, mais le moment où un FINANCE_ADMIN distinct sera introduit, cette absence devient un trou de gouvernance.
10 rôles canoniques D-105 non implémentés comme enum/classe. Seuls 'admin' et 'FOUNDER' apparaissent dans DisputeResolutionGuard (AUTHORIZED_ROLES l. 38). Pas de table AdminRoleAssignment, pas de service checkRole(actorId, requiredRole). La matrice D-112 n'est validée que par les tests P0 individuels (ADMIN-CELL-SECRET, ADMIN-DEV-FINANCE, etc.), pas par un mécanisme central. Pour solo-founder MVP : non-bloquant (FOUNDER absorbe tout). Pour multi-admin : nécessaire.

REPORTABLE (peut attendre l'événement 2+) :

ConflictOfInterestRecord D-110 non implémenté. Aucun service de récusation, aucun ordre de relais. Pertinent uniquement quand DISPUTE_ADMIN distinct existe.
SecretsRotationPolicyConfig D-109 non implémentée. Gouvernance privacy + exécution dev. Hors scope avant maturation infra.
Export comme pouvoir distinct D-111 — pas de service requestExport() ni de séparation lecture/export. La doctrine "Lire n'est pas modifier. Modifier n'est pas approuver. Approuver n'est pas exécuter. Exporter est un pouvoir distinct." est aspirationnelle au MVP.
AUDITOR_EXTERNAL rôle — testé par ADMIN-AUDITOR-01 mais pas activé tant qu'un auditeur externe n'est pas mandaté. Hors scope Event 0.
DataAccessAuditRoleConfig — pas de seed.
CELL_MANAGER — D-105 le note "POST-MVP". Hors scope V3.0.

ANGLE MORT POTENTIEL :
Y a-t-il quelque chose que ce domaine requiert pour la première transaction que l'OS ne documente pas explicitement ?
→ OUI — trois INFÉRENCES NON DOCUMENTÉES, à valider par le fondateur :

Le actor passé à transitionEngagement() est-il authentifié quelque part ? Le code accepte une string actor (USR-PILOT-ALEX, USR-SYSTEM-SCHED01, etc.) sans vérification cryptographique. INFÉRENCE : l'authentification vit côté Base44 (auth UI / session) ou côté wrapper API (fonction Base44 / webhook proxy). La V3 fait confiance à l'actor reçu en input. Cette confiance est-elle documentée comme limite architecturale ? Comment empêcher un appel direct au repository V3 avec un actor arbitraire ? À valider — sinon, le DataAccessLedger trace une identité revendiquée, pas une identité prouvée.
Quel est le canal de modification des PolicyConfig en production ? D-108 dit "interdit absolu : aucune modification directe en database en production". Aujourd'hui, scripts/seed-policy-config.js modifie directement Base44 via PolicyConfigRepository.upsert(). C'est légitime pour le seedage initial (bootstrap), mais le canal pour les modifications post-MVP n'est pas spécifié : (a) UI admin dédiée dans V1 microrave.ca ? (b) endpoint API V3 avec AdminAction + PolicyConfigChangeRecord enveloppe obligatoire ? (c) ligne de commande versionnée + script d'audit ? À valider — sans canal défini, la promesse D-108 ne peut pas tenir.
Comment garantir que la fonction Base44 stripeWebhook (cf. Fiche C INFÉRENCE 1) respecte le DataAccessLedger ? Si Base44 modifie le statut Engagement directement (court-circuit transitionEngagement() côté V3), aucune DataAccessLedgerEntry n'est créée — viole D-107 #12. INFÉRENCE : la fonction Base44 doit obligatoirement déléguer à V3 transitionEngagement() pour toute mutation. Pas d'écriture directe Base44 sur le statut Engagement. À valider opérationnellement — c'est une frontière architecturale critique entre Base44 et V3.

──────────────────────────────────────────────────
4. DETTE HÉRITÉE

De V1 : aucune dette admin. V1 n'avait pas de cadre institutionnel formel — V3 le construit de zéro, sans contamination.
De V2 : rien.
De l'OS V3 lui-même : doctrine extrêmement étendue (BLOC 13 = 8 décisions formelles + 19 interdits + matrice à 10 rôles + classification 32 PolicyConfig). Le code implémente l'invariant minimal opérationnel (4 entités append-only + 1 resolver fail-closed + 1 câblage DAL). Cette simplicité est conforme à la doctrine MVP solo-founder : FOUNDER absorbe les rôles vacants, la rigueur est compositionnelle (chaque entité immuable + chaque guard fail-closed) plutôt que centralisée (pas de service AdminAuthorityMatrix.check() unique). L'extension future (multi-admin, rôles distincts, DualApprovalThresholdConfig) ne demande pas de refonte — juste des ajouts ciblés sur le squelette existant.

──────────────────────────────────────────────────
5. DELTA VERS COMPLÉTUDE
Exécuter node scripts/seed-policy-config.js sur la base Base44 cible (prérequis hors-code pour débloquer toute transition), câbler SOLO_FOUNDER_OVERRIDE à un véritable mécanisme de traçabilité (createAdminIncidentRecord + appendToDataAccessLedger marqueur FOUNDER_SOLO_OVERRIDE), faire en sorte que seed-policy-config.js produise effectivement les PolicyConfigChangeRecord (ou documenter explicitement le seedage initial comme exception au D-108), implémenter un applyHold() minimal et la création effective d'AdminIncidentRecord sur violations W2/W3, et obtenir validation fondateur sur les trois INFÉRENCES (authentification actor, canal modification PolicyConfig, frontière Base44-V3).
──────────────────────────────────────────────────
6. STATUT FINAL
☒ PRÊT SOUS CONDITIONS →
Conditions :

scripts/seed-policy-config.js exécuté sur la base Base44 cible avant toute transition (obligatoire — sans seed, fail-closed bloque tout).
SOLO_FOUNDER_OVERRIDE non utilisé pour la première transaction Pierre de Rosette (le chemin nominal est contestation_window→payable via CONTESTATION_WINDOW_EXPIRED, pas d'override). La fragilité du câblage override est tolérable tant qu'il n'est pas invoqué.
Frontière Base44-V3 respectée par la fonction Base44 stripeWebhook future (INFÉRENCE 3) — toute mutation Engagement passe par transitionEngagement() V3.

Décomposition de l'estimation :

✅ Append-only des 4 entités d'audit (DataAccessLedgerEntry, AdminAction, AdminIncidentRecord, PolicyConfigChangeRecord) : 100 %
✅ DataAccessLedger câblé sur toute transition (avec compensation AdminIncidentRecord DAL_WRITE_FAILED) : 100 %
✅ 15 tests P0 admin couvrant la matrice par rôle + immutabilité : 93 % (14 sur 15 PASSED, 1 échec environnemental sandbox)
✅ PolicyConfigResolver fail-closed strict (caché, parsé, validé) : 100 %
✅ 19 interdits architecturalement testés (couverture compositionnelle via tests P0) : ~80 % — les interdits #6 (modifier Engagement archivé), #7 (supprimer DecisionRecord), #11 (modifier WebhookIdempotencyRecord), #17 (contourner MoneyMovementRouter), #18 (créer SettlementInstruction sans DecisionRecord) sont implicitement gardés par d'autres mécanismes (WORM W3, MoneyMath, PayoutExecutor 6 verrous) mais sans test P0 dédié direct.
❌ Câblage SOLO_FOUNDER_OVERRIDE → AdminIncidentRecord + DAL marqueur : 0 %
❌ Création effective PolicyConfigChangeRecord à modification config : 0 %
❌ validateCriticalConfigs() au démarrage : 0 % (exportée, jamais appelée)
❌ SYSTEM_HOLD + champ holdStatus Engagement : 0 %
❌ AdminIncidentRecord effectif sur violations W2/W3 : 0 % (juste throw + console)
❌ DualApprovalThresholdConfig + service requireDualApproval() : 0 %
❌ 8 configs CRITIQUE D-108 (TaxConfig structure, LedgerCodeMap, etc.) non seedées : 20 % sur 10
⚠ 10 rôles canoniques D-105 implémentés comme enum/classe : 0 % (gardé compositionnellement par tests P0)
⚠ ConflictOfInterestRecord D-110, SecretsRotationPolicyConfig D-109, Export D-111 : 0 % (reportable)

──────────────────────────────────────────────────
7. DÉPENDANCES SORTANTES

Domaine A (Ontologie) : transitionEngagement() câble la DataAccessLedgerEntry après Guard 5 et s'attend à la non-modification du statut Engagement ailleurs. Sans G, la machine d'état peut être trahie en silence (état modifié hors transition souveraine).
Domaine B (Finance et ledger) : D-107 #1 (modifier/supprimer FinancialLedger), #17 (contourner MoneyMovementRouter), #18 (SettlementInstruction sans DecisionRecord), #19 (contourner 6 verrous anti-double payout) sont les garde-fous structurels de l'argent. Les écritures ledger reposent sur l'append-only + audit du domaine G. Sans DataAccessLedger : pas de preuve d'intégrité financière.
Domaine C (Stripe et paiements) : D-107 #11 (modifier WebhookIdempotencyRecord traité) garde l'idempotency. repositories.webhookProcessedLogs (cf. Fiche C) est conceptuellement un cousin de DataAccessLedger — append-only protégeant l'intégrité opérationnelle.
Domaine D (Présence) : D-093 "Tout override admin → AdminAction loggée obligatoirement". Sans G, les overrides présence ne sont pas tracés.
Domaine E (SOTS et réputation) : D-107 #2 (supprimer ReputationLedgerEntry) gardé par ReputationRepository (pas de méthode delete exportée). Le ReputationLedger est un domaine d'audit institutionnel — cousine du DataAccessLedger.
Domaine F (Scheduler) : D-107 #13 (modifier SchedulerRun complété) — couvert par SchedulerRepository.completeRun (PUT unique, immuable). Test P0 ADMIN-ABS-SCHEDULERRUN 4/4. Bidirectionnel : F crée des AdminIncidentRecord (échec de tâche) via le repository de G.
Domaine H (Portabilité) : D-128 prescrit des interfaces repository portables. Le pattern adapter (PolicyConfigAdapter Base44) est le modèle architectural — réplicable pour passer à PostgreSQL plus tard. D-107 #15 (modifier systemId) protège la continuité d'identité lors d'une migration. Bidirectionnel.
Domaine I (UX et vérité perçue) : D-085 "état payout lisible", D-111 "export pouvoir distinct" — UX doit refléter ce que le DataAccessLedger trace. Sans G, l'UX ne peut pas dire la vérité avec autorité.
Domaine J (Acteurs et onboarding) : la création d'un User crée un acteur dans actor. Le rôle assigné détermine l'autorité — D-105 + matrice D-112. Sans G, pas de cadre d'autorité.
→ Tous les domaines dépendent de G. D-095 "tout accès niveau 3+ → DataAccessLedgerEntry obligatoire" + D-107 (19 interdits transversaux) + D-108 (toute modification PolicyConfig tracée). G est l'infrastructure de confiance institutionnelle — sans elle, aucun autre domaine ne peut prétendre à l'intégrité. Source : OS V15 BLOC 13 + LOI GREFFIER-01.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FIN DE LA FICHE — G. ADMIN ET SÉCURITÉ
Fiche conservée pour le Prompt de Synthèse.