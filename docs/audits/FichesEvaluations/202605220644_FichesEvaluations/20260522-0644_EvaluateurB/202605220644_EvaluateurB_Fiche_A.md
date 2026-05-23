FICHE D'ÉVALUATION — A. ONTOLOGIE ET MACHINE D'ÉTAT
Date d'évaluation : 22 mai 2026 06:44 EST
Fait par Claude Opus 4.7
Documents sources : OS V15 (MICRORAVE_V3_OPERATING_SYSTEM_V15.md, 785 l.), EXPORT_BRUT Registres Souverains V3 (3 317 l.), Plan d'Implantation 2026-05-21 (356 l.), code src/core/transitionEngagement.js (553 l.), 18 guards src/core/guards/*.js (4 423 l. cumulées), src/repositories/EngagementRepository.js, src/repositories/ContractSnapshotRepository.js, src/repositories/index.js, src/services/EngagementAmendmentService.js (101 l.), 7 tests P0 du domaine.
Niveau de confiance : HAUTE sur la doctrine et la table de transitions ; PARTIELLE sur le câblage de persistence ; INFÉRENCE sur quelques angles morts identifiés.
──────────────────────────────────────────────────
1. CRITÈRES DE COMPLÉTUDE
Ce domaine est prêt pour la première transaction quand :

La fonction souveraine transitionEngagement() est l'unique point d'entrée pour toute mutation de status — OS V15 §2.7.1 : "Toute mutation du champ status d'un Engagement est interdite sauf via la fonction souveraine".
Les 5 guards traversent dans l'ordre canonique : MissionConversionGuard → WORMGuard → guard spécifique → FinancialInvariantGuard (si financier) → AuditLogger — OS V15 §2.7.1.
Les 6 moments WORM officiels (accepted W1 · deposit_secured W1 · event_sealed W2 · event_completed W1 · sots_window_closed W1 · archived W3) sont respectés avec la hiérarchie de sévérité — OS V15 §2.7 Bloc 2 V8.
Le ContractSnapshot phase 1 est gravé à accepted (Moment 1) et le ContractSnapshot phase 2 est gravé à event_sealed (Moment 3, WORM W2), avec cachet_brut_final_i qui devient la base de tout calcul ultérieur — OS V15 §2.7 table ligne 3 + D-147 : "Le cachet_brut_final de chaque talent (après coefficient) est gravé ici. C'est cette valeur qui sert de base à tout calcul ultérieur".
Le chemin nominal V4 D-019-A est exécutable de bout en bout : proposed → negotiating → accepted → placed → deposit_pending → deposit_secured → event_sealed → performed → event_completed → sots_window_closed → contestation_window → payable → settled → archived — OS V15 §2.6 + D-019-A.
contestation_window (état non-WORM) est inséré entre sots_window_closed et payable, avec durée configurée dans DisputeAccessPolicyConfig.contestationWindowDurationHours — OS V15 §2.6 D-019-B.
balance_pending est absent de WORM_STATES (fusionné dans deposit_secured) et payable est absent de WORM_STATES (état opérationnel protégé par D-101) — OS V15 §2.7 D-014-A + D-014-B.
Toute transition non listée dans la table souveraine est bloquée par défaut (fail-closed) — OS V15 §2.7.1.
Chaque transition produit une DataAccessLedgerEntry immuable via AuditLogger (Guard 5) — OS V15 §2.7.1 + EXPORT_BRUT D-095 + Plan §0.5.
Le test P0 CHEMIN-NOMINAL-01 exécute la chaîne complète sans BugReplayRecord ouvert — D-117 : "Premier event réel : 100% tests P0 chemin exercé = PASS, 0 BugReplayRecord non PASSED, GoNoGoDecisionRecord = GO".

Ce domaine bloque tout le reste si :

transitionEngagement() est contournable depuis l'UI ou un service tiers (mutation directe de status) — viole LOI TRANSITION-01 (EXPORT_BRUT D-095, OS V15 §16.2).
Un état WORM est modifié sans AdminIncidentRecord P0 — viole D-014 et le niveau 2 « Fraude » (EVENT_SEALED) ou niveau 3 « Architecturalement impossible » (ARCHIVED), OS V15 §2.7 Bloc 2.
ContractSnapshot phase 2 n'est pas créé ou pas persisté à event_sealed — supprime la base de calcul de tout payout, no-show, ou amendment ultérieur (D-147, CT-014).

──────────────────────────────────────────────────
2. ÉTAT ACTUEL DOCUMENTÉ
Ce qui existe et fonctionne selon les documents :

src/core/transitionEngagement.js (553 l.) est implémenté avec la table souveraine TRANSITION_TABLE contenant 47 transitions (vérifié par grep) couvrant tout le chemin nominal V4, le Frein d'Urgence (Régime 1), la Contestation de Prestation (Régime 2), les transferts D-013, les annulations LOI ANNULATION-01/02, le no-show, et les terminaisons d'archivage — source : code l. 77-172.
WORM_STATES contient exactement les 6 moments officiels et exclut balance_pending, payable, settled — source : code l. 188-195 + test TRANSITION-01 qui assert explicitement "balance_pending ABSENT de WORM_STATES", "payable ABSENT de WORM_STATES", "WORM_STATES contient exactement les 6 moments officiels".
Les 5 guards traversent dans l'ordre canonique : exécution séquentielle vérifiée code l. 215-364 (Guard 1 MissionConversion → Guard 2 WORM → Guard 3 spécifique → Guard 4 LedgerInvariant si financialGuard:true → Guard 4.5 PayoutExecutor sur payable→settled uniquement → Guard 5 AuditLogger + DataAccessLedger).
18 guards implémentés (4 976 lignes cumulées) : MissionConversionGuard, PlacementGuard, EventPaymentGuard, SealingGuard, PresenceWindowGuard, EventCompletionGuard, SOTSWindowGuard, ContestationWindowGuard, PresenceProofGuard, LedgerInvariantGuard, NoShowGuard, CancellationGuard, DisputeGuard, DisputeResolutionGuard, TransferGuard, WithdrawalGuard, ArchiveWORMGuard, EngagementAmendmentGuard. La chaîne post-event (PresenceWindowGuard + EventCompletionGuard + SOTSWindowGuard) est résolue selon GUARDS-CHAIN-01 (19/19 PASSED) — "Les trois guards fantômes ont un corps".
WORMGuard discrimine les trois niveaux : W3 → throw immédiat WORM_VIOLATION_LEVEL_3 (code l. 228) ; W2 → si la transition n'est pas dans la table, throw WORM_VIOLATION_LEVEL_2 avec log [WORM] Violation Niveau 2 simulant l'AdminIncidentRecord (code l. 240-251) ; W1 → warning console (code l. 259-264).
Toute transition absente de TRANSITION_TABLE est rejetée avec TRANSITION_UNAUTHORIZED et liste les transitions valides (code l. 268-273) — fail-closed strict.
IDFactory expose le préfixe AMD- pour EngagementAmendment (D-147) — code IDFactory.js l. 35.
7 tests P0 du domaine exécutés avec succès le 22 mai 2026 :

IDFACTORY-01 : 7/7 PASSED
TRANSITION-01 : 34/34 PASSED (incluant assertions sur les retraits balance_pending/payable de WORM_STATES, présence de toutes les transitions D-019-A/D-019-B, Frein d'Urgence depuis 8+1 états)
MISSIONCONVERSION-01 : 14/14 PASSED (ContractSnapshot phase 1 construit, idempotency vérifiée)
PLACEMENT-01 : 33/33 PASSED (intégration transitionEngagement() réelle)
SEALING-01 : 19/19 PASSED (ContractSnapshot phase 2 retourné via deposit_secured→event_sealed)
AMENDMENT-01 : 14/14 PASSED (D-147 — "Le contrat ne change pas — il s'étend")
CONTESTATION-WINDOW-01 : 16/16 PASSED
CHEMIN-NOMINAL-01 : 14/14 PASSED ("La machine d'état Micro Rave V3 fonctionne de bout en bout sur le chemin nominal")
GUARDS-CHAIN-01 : 19/19 PASSED


ContractSnapshotRepository expose create() immuable, refuse toute modification — "Les deux snapshots sont immuables après création. Toute correction = amendment ou reversal formel (D-147). Jamais de modification directe." (header du fichier).
EngagementAmendmentService (101 l.) appelle EngagementAmendmentGuard.validate(), persiste l'amendment append-only, et écrit le delta ledger.
Le câblage DataAccessLedger est partiellement implémenté : transitionEngagement() appelle repositories.admin.appendToDataAccessLedger() après Guard 5 (code l. 370-402), avec création d'AdminIncidentRecord P0 type DAL_WRITE_FAILED en cas d'échec (alerte D-133 #10).
La SchedulerDueTask retournée par les guards est persistée via repositories.scheduler.createTask() après Guard 5 (code l. 407-420).

Ce qui vient de V1 et est encore actif :

Aucun : la machine d'état, l'ontologie, les guards et les snapshots sont une construction V3 native. Le préambule du fondateur cite "V1 tourne sur microrave.ca" mais le Plan d'Implantation §3.1 ne référence V1 que pour les pages UX (Phase 3, hors Domaine A) : "Adapter les pages existantes de V1 microrave.ca vers V3. Ne pas repartir de zéro." — V1 n'apporte ni dette ni acquis ontologique.

Ce qui vient de V2 et a survécu :

Aucun pour l'ontologie. Une seule trace de V2 dans tous les documents : EXPORT_BRUT D-120-A l. 1933 — "Code V2 confirmé : isCaptain = (user.id === session.captainUserId)" — touche la doctrine du Capitaine QuickPlay (lobby), pas la machine d'état Engagement. Pour le Domaine A : V2 est une page blanche. Cohérent avec la déclaration du fondateur : "V2 abandonnée faute de fondations". Les fondations sont précisément ce que V3 reconstruit ici.

──────────────────────────────────────────────────
3. LACUNES IDENTIFIÉES
BLOQUANT (empêche la première transaction) :

engagementAmendments repository absent de src/repositories/index.js — EngagementAmendmentService exige repositories.engagementAmendments.create() (ligne 61-65 du service : "AMENDMENT_SERVICE_ERROR: repositories.engagementAmendments.create() absent") et lève une exception si absent. Aucun EngagementAmendmentRepository.js n'existe dans src/repositories/. Source de l'identification : grep -rn "engagementAmendments" src/ → seules les références dans le service. Conséquence directe sur le Domaine A : tout scénario nécessitant un amendment (SC-07-AMENDMENT, et plus largement toute extension de plage D-147) fait planter le pipeline. Statut sur la première transaction simple (DJ Alex seul, sans amendment) : non-bloquant si le scénario nominal n'invoque pas d'extension. Statut comme bloqueur conditionnel — à valider.
Test P0 CHEMIN-NOMINAL-01 non orchestré dans npm run test:p0:all — package.json script test:p0:all n'enchaîne que 4 tests (IDFACTORY, TRANSITION, MISSIONCONVERSION, PLACEMENT). CHEMIN-NOMINAL-01, SEALING-01, AMENDMENT-01, CONTESTATION-WINDOW-01, GUARDS-CHAIN-01 existent comme fichiers, passent individuellement, mais ne font pas partie de la suite de qualification. Source : cat package.json. D-117 exige "100% tests P0 chemin exercé = PASS" — sans orchestration, la garantie de non-régression sur le chemin nominal n'est pas mécanique. INFÉRENCE sur le statut bloquant : le test passe individuellement, donc le critère D-117 peut être satisfait par exécution manuelle ; mais la discipline D-131 ("Discipline développement") suggère qu'une suite de qualification non-orchestrée est une dette opérationnelle.

DÉGRADANT (réduit la qualité, n'empêche pas) :

D-068 « méthode des plus grands restes » non implémentée — Plan §3.3 : "SealingGuard utilise prorata floor via MoneyMath.prorataCents(). Pour un lineup de 2 talents : résidu systématique de 1¢ non conforme à D-068". Plan déclare explicitement "Non-bloquant pour SC-01 (DJ Alex seul). À implémenter avant tout event multi-talent." Le scénario canonique Pierre de Rosette (OS V15 §14.9) est mono-talent → non-bloquant pour la première transaction.
EventPaymentGuard.js cite Source : OS V10.1 alors qu'il devrait citer OS V14 · D-014-A — Plan §3.4. Trace documentaire incohérente, pas d'impact fonctionnel.
Carte microrave_v4_08_lois_invariantes.drawio mentionne encore BALANCE_PENDING dans la liste WORM N1 — Plan §3.4. Dette documentaire sur le registre visuel.

REPORTABLE (peut attendre l'événement 2+) :

6 placeholders de guards de litige (Plan §2.3) — CancellationGuard, DisputeGuard, DisputeResolutionGuard, TransferGuard, WithdrawalGuard, RefundGuard câblage. Mise à jour de l'inspection : les fichiers existent et ont entre 83 et 319 lignes chacun, le commentaire en tête de transitionEngagement.js annonce "[Phase 2.3] CancellationGuard implemente", "[Phase 2.3] DisputeGuard", etc. → Le Plan §2.3 doit être lui-même mis à jour. Le chemin nominal (sans dispute, sans annulation, sans transfert) n'invoque aucun de ces guards.
EngagementCollectif (préfixe EGC dans IDFactory) n'apparaît dans aucun guard ni transition. INFÉRENCE : hors scope MVP / première transaction.

ANGLE MORT POTENTIEL :
Y a-t-il quelque chose que ce domaine requiert pour la première transaction que l'OS ne documente pas explicitement ?
→ OUI — trois INFÉRENCES NON DOCUMENTÉES, à valider par le fondateur :

Le ContractSnapshot phase 2 doit être persisté en base avant que event_sealed → performed puisse être validé — OS §2.7 dit que cachet_brut_final_i est gravé à event_sealed, et SealingGuard.js retourne ce snapshot, mais le code transitionEngagement.js (l. 427-428) propage le snapshot dans result.contractSnapshot et délègue la persistence à l'appelant : "La persistence appartient à l'appelant via repositories.contracts." (header SealingGuard). Si l'appelant oublie d'écrire, la transition est valide en mémoire mais le WORM n'existe pas en base. Pas de garde-fou architectural dans transitionEngagement(). → À valider : le fondateur a-t-il acté que SealingGuard ne doit pas persister lui-même ? Et où est la garantie que l'appelant l'a fait ?
balance_pending retiré mais aucune fenêtre temporelle entre deposit_secured et event_sealed — D-014-A absorbe la surveillance du solde dans deposit_secured. OS dit "Solde reçu" dans le guard SealingGuard. INFÉRENCE : la transition deposit_secured → event_sealed est déclenchée par un événement Stripe (paiement du solde), pas par un timer ou un état intermédiaire. Le EventPaymentGuard côté deposit_pending → deposit_secured reçoit le webhook de l'acompte ; quel signal déclenche deposit_secured → event_sealed ? Le Plan §0.1 traite seulement "StripePaymentSignal → deposit_pending → deposit_secured". INFÉRENCE : le signal du deuxième paiement (solde) n'a pas de consommateur documenté. À valider.
Niveau de sévérité du WORMGuard Niveau 2 (Fraude) : le code se contente d'un console.error + throw (code l. 240-251) — l'OS §2.7 Bloc 2 V8 exige "Déclenchement immédiat d'un AdminIncidentRecord P0 et SYSTEM_HOLD sur tous les fonds liés". Le SYSTEM_HOLD financier et la création d'AdminIncidentRecord ne sont pas implémentés à cet endroit. INFÉRENCE : la fraude tentée sur event_sealed est bloquée (throw) mais l'effet de bord institutionnel n'est pas câblé. À valider — peut-être prévu via DataAccessLedger Phase 0.5 + alerte D-133, mais le lien n'est pas explicite.

──────────────────────────────────────────────────
4. DETTE HÉRITÉE

De V1 : aucune dette ontologique. V1 fournit un actif UX (pages microrave.ca) qui sera adapté en Phase 3, hors Domaine A. La machine d'état est entièrement neuve.
De V2 : aucune dette ontologique. V2 n'a légué que la convention isCaptain (Capitaine QuickPlay, lobby), sans impact sur l'Engagement, le MissionSlot, le ContractSnapshot ou les états WORM.
De l'OS V3 lui-même : dette interne notable — l'OS V15 contient 11 sections marquées "(inchangée — voir V11)" (sections 2.1, 2.2, 2.3, 2.4, 2.5, 2.5.1, 2.5.2, 2.8, 2.9, 2.10, parties III à XIII, partie XV, section 16.0, 16.1, 16.2, 16.3). Pour vérifier l'ontologie complète, l'auditeur doit assembler V11 + amendements V12/V13/V14/V15 — risque de désynchronisation. Le code et les tests ont déjà été vérifiés indépendamment ; cette dette est documentaire, pas fonctionnelle pour la première transaction.

──────────────────────────────────────────────────
5. DELTA VERS COMPLÉTUDE
Créer EngagementAmendmentRepository.js et l'exposer dans repositories/index.js, orchestrer CHEMIN-NOMINAL-01 + SEALING-01 + AMENDMENT-01 dans test:p0:all du package.json, et obtenir validation du fondateur sur les trois INFÉRENCES non documentées (persistence du ContractSnapshot phase 2, signal du paiement du solde, effet de bord WORM Niveau 2).
──────────────────────────────────────────────────
6. STATUT FINAL
☒ PRÊT SOUS CONDITIONS
Conditions :

Confirmation explicite du fondateur que EngagementAmendmentRepository peut être créé après la première transaction (si et seulement si le scénario canonique « Pierre de Rosette » DJ Alex mono-talent n'invoque jamais D-147). Sinon : BLOQUANT, repository à créer en amont.
Orchestration de CHEMIN-NOMINAL-01, SEALING-01, AMENDMENT-01, CONTESTATION-WINDOW-01, GUARDS-CHAIN-01 dans npm run test:p0:all — sinon D-117 n'est pas mécaniquement attestable.
Réponse fondateur sur les trois INFÉRENCES NON DOCUMENTÉES (§3 angle mort).

Sous ces trois conditions remplies, le Domaine A satisfait la doctrine de la machine d'état, les 6 moments WORM, les ContractSnapshots phase 1 et 2, et le chemin nominal V4 D-019-A.
──────────────────────────────────────────────────
7. DÉPENDANCES SORTANTES

Domaine B (Finance et ledger) dépend du ContractSnapshot phase 2 gravé à event_sealed — OS V15 §2.7 ligne 3 : "WORM financier complet. Montants, taux, taxes, frais Stripe snapshotés immuables." + D-147 : "C'est cette valeur qui sert de base à tout calcul ultérieur — paiement, no-show, amendment." Sans le snapshot phase 2 immuable, la LOI LEDGER-02 (zéro cent) n'a pas de référence stable.
Domaine C (Stripe et paiements) dépend du déclenchement des transitions deposit_pending → deposit_secured et (INFÉRENCE) deposit_secured → event_sealed par les webhooks Stripe — Plan §0.1 explicite cette dépendance pour l'acompte.
Domaine D (Présence et preuve) dépend de l'état event_sealed → performed (PresenceWindowGuard) et contestation_window → payable (PresenceProofGuard) — table de transitions, OS V15 §2.7.1.
Domaine E (SOTS) dépend de event_completed → sots_window_closed et de la durée gravée — OS V15 §2.7.1, SOTSWindowGuard.
Domaine F (Scheduler) est en dépendance bidirectionnelle : la machine d'état crée des SchedulerDueTask (balance_deadline_check, contestation_window_expiration, sots_window_close) que le Scheduler doit exécuter pour faire avancer les transitions temporelles — Plan §1.4 + §2.2.
Domaine G (Admin/sécurité) dépend de l'écriture DataAccessLedger à chaque transition (Guard 5) — code l. 370-402, OS V15 §16.2 LOI TRANSITION-01.
Domaine I (UX et vérité perçue) dépend de l'UXTruthProjection D-084 — Plan §3.1 : "connecter chaque statut visible à transitionEngagement(), pas à un champ libre". Sans une machine d'état stable et observable, l'UX ne peut pas projeter la vérité.
→ INFÉRENCE NON DOCUMENTÉE : le Domaine H (Portabilité) dépend de la stabilité de la table TRANSITION_TABLE pour produire un export reproductible — D-128 + D-132. À valider.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FIN DE LA FICHE — A. ONTOLOGIE ET MACHINE D'ÉTAT
Fiche conservée pour le Prompt de Synthèse.