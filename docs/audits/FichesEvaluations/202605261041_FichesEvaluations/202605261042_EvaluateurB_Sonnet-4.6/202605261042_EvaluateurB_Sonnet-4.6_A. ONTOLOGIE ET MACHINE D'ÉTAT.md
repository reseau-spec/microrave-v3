━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FICHE D'ÉVALUATION — A. ONTOLOGIE ET MACHINE D'ÉTAT
Date d'évaluation : 26 mai 2026 10:51 EST
Fait avec Sonnet 4.6 Adaptatif
Documents sources :
  • MICRORAVE_V3_OPERATING_SYSTEM_V15.md
  • src/core/transitionEngagement.js (553 l.)
  • src/core/guards/ (18 guards)
  • src/repositories/ContractSnapshotRepository.js
  • src/repositories/EngagementRepository.js
  • src/core/IDFactory.js
  • codeBase44_v3/base44/functions/transitionEngagement/entry.ts [DÉPLOYÉ]
  • codeBase44_v3/base44/functions/createEngagement/entry.ts [DÉPLOYÉ]
  • codeBase44_v3/base44/functions/stripeWebhookHandler/entry.ts [DÉPLOYÉ]
  • codeBase44_v3/base44/functions/executePayoutTransfer/entry.ts [DÉPLOYÉ]
  • codeBase44_v3/base44/functions/recognizeRevenue/entry.ts [DÉPLOYÉ]
  • codeBase44_v3/base44/entities/Engagement.jsonc
  • codeBase44_v3/base44/entities/MissionSlot.jsonc
  • codeBase44_v3/base44/entities/ContractSnapshot.jsonc
  • codeBase44_v3/dataBase/Engagement_export.csv (23 enregistrements réels)
  • codeBase44_v3/dataBase/MissionSlot_export.csv (vide)
  • [absence] ContractSnapshot_export.csv
  • tests/p0/TRANSITION-01.js, CHEMIN-NOMINAL-01.js, SEALING-01.js
  • Fiche EvaluateurB_Fiche_A.md du 22 mai 2026
Niveau de confiance : HAUTE sur la couche JS canonique ;
                     HAUTE sur les lacunes de la couche déployée Base44.
──────────────────────────────────────────────────
1. CRITÈRES DE COMPLÉTUDE
   (Tirés de l'OS V15)

Ce domaine est prêt pour la première transaction quand :

• transitionEngagement() est l'UNIQUE point d'entrée pour toute
  mutation de status — OS V15 §16.2 LOI TRANSITION-01 : "Toute
  mutation du champ status d'un Engagement est interdite sauf via
  la fonction souveraine transitionEngagement()."

• Les 6 moments WORM officiels sont respectés selon la hiérarchie
  de sévérité (W1 : accepted, deposit_secured, event_completed,
  sots_window_closed ; W2 : event_sealed ; W3 : archived) —
  OS V15 §2.7 Bloc 2 V8.

• ContractSnapshot phase 2 est créé et persisté à event_sealed
  (Moment WORM 3), avec cachet_brut_final_i gravé comme source de
  vérité pour tout calcul ultérieur — OS V15 §2.7 table ligne 3
  + D-147 : "Le cachet_brut_final de chaque talent est gravé ici.
  C'est cette valeur qui sert de base à tout calcul ultérieur."

• Le chemin nominal V4 complet est exécutable de placed jusqu'à
  archived sans intervention manuelle — D-019-A + OS V15 §2.6.

• Le test P0 CHEMIN-NOMINAL-01 complète 14/14 PASSED sans
  BugReplayRecord ouvert — OS V15 §15 + D-117.

Ce domaine bloque tout le reste si :

• Une mutation directe de status (Engagement.update) existe en
  dehors de transitionEngagement() — LOI TRANSITION-01, OS V15 §16.2.

• Les moments WORM déployés ne correspondent pas aux 6 moments
  officiels — D-014 OS V15 §2.7.

• ContractSnapshot phase 2 n'existe pas en base au moment de
  payable → settled — toute exécution de payout est aveugle (D-147,
  CT-014, PayoutExecutor).

──────────────────────────────────────────────────
2. ÉTAT ACTUEL DOCUMENTÉ

Ce qui existe et fonctionne selon les documents :

  COUCHE JS CANONIQUE (src/) :
  transitionEngagement.js contient 47 transitions couvrant le
  chemin nominal V4 complet, le Frein d'Urgence (9 états), la
  Contestation de Prestation, les transferts D-013, les annulations,
  le no-show et tous les archivages. Source : grep sur
  TRANSITION_TABLE, code l. 77-172.

  WORM_STATES JS contient exactement les 6 moments officiels et
  exclut balance_pending, payable, settled — D-014-A + D-014-B.
  Vérifié : test TRANSITION-01 34/34 PASSED (exécution confirmée
  ce jour).

  Les 5 guards traversent dans l'ordre canonique MissionConversion
  → WORM → spécifique → LedgerInvariant → AuditLogger+DAL.
  DataAccessLedger et SchedulerDueTasks présents (non-bloquants si
  repositories absents).

  18 guards implémentés et câblés dans runSpecificGuard() :
  MissionConversionGuard, PlacementGuard, EventPaymentGuard,
  SealingGuard, PresenceWindowGuard, EventCompletionGuard,
  SOTSWindowGuard, ContestationWindowGuard, PresenceProofGuard,
  LedgerInvariantGuard, NoShowGuard, CancellationGuard, DisputeGuard,
  DisputeResolutionGuard, TransferGuard, WithdrawalGuard,
  ArchiveWORMGuard, EngagementAmendmentGuard.

  CHEMIN-NOMINAL-01 : 14/14 PASSED ce jour. SEALING-01 : 19/19.
  TRANSITION-01 : 34/34. Tous sur la couche JS.

  COUCHE DÉPLOYÉE BASE44 (codeBase44_v3/base44/functions/) :
  La fonction transitionEngagement/entry.ts déployée couvre
  15 transitions (chemin nominal principal + annulations partielles).
  Elle valide actorRole (organizer/talent/system) et dispose de
  5 guards inline : guardPresenceWindow, guardEventCompletion,
  guardPresenceProof, guardBalancePayment v3.1, guardPayoutReady.
  La résistance aux EPR fantômes (re-clics) est implémentée dans
  guardBalancePayment v3.1.

  DONNÉES EN PRODUCTION : 23 Engagements réels dans la base,
  dont 1 en état event_sealed avec stripeDepositIntentId réel
  (ENG-WE66GU-AASWFD, pi_3TbL3A2eLVUrCnnJ1sUq1oI2).
  Un Engagement archived (ENG-H5V66Q-WBJ7N2) — la Pierre de
  Rosette complète à archivedAt confirmé.

Ce qui vient de V1 et est encore actif :
  Aucun : l'ontologie, la machine d'état et les guards sont une
  construction V3 native. V1 (microrave.ca) n'apporte ni acquis
  ni dette pour ce domaine.

Ce qui vient de V2 et a survécu :
  Aucun. V2 abandonnée — les fondations que V3 reconstruit ici
  sont précisément ce qui manquait à V2.

──────────────────────────────────────────────────
3. LACUNES IDENTIFIÉES

BLOQUANT — empêche la première transaction (Event 1 commercial) :

• [B-A-01] BIFURCATION CRITIQUE entre machine d'état canonique
  et machine déployée.
  La couche JS (47 transitions, 18 guards, WORM 6 moments) passe
  tous les tests. La couche Base44 déployée ne contient que
  15 transitions et une WORM_STATES réduite à 3 états uniquement :
  {archived, deposit_failed, no_show_pre_event}. Les 3 moments WORM
  officiels event_sealed (W2), accepted (W1), deposit_secured (W1),
  event_completed (W1), sots_window_closed (W1) sont ABSENTS de la
  protection WORM déployée.
  Justification du code déployé : "retrait de event_sealed et settled
  — états intermédiaires avec transitions sortantes légitimes."
  Mais l'OS dit W2 = Fraude si touché. Cette divergence de doctrine
  est non documentée comme décision formelle.
  Source : codeBase44_v3/base44/functions/transitionEngagement/entry.ts
  commentaire v2→v3 + grep WORM_STATES.
  Impact sur la première transaction : la protection W2 d'event_sealed
  n'existe pas en production. Un acteur peut atteindre settled sans
  que event_sealed ait jamais été verrouillé institutionnellement.

• [B-A-02] LOI TRANSITION-01 violée — 4 fonctions Base44 déployées
  mutent Engagement.status directement (hors transitionEngagement) :
  — createEngagement/entry.ts l.324 : placed → deposit_pending
    direct via Engagement.update(), contournant transitionEngagement().
  — stripeWebhookHandler/entry.ts l.298 : idem (deposit_pending →
    deposit_secured sans passer par la fonction souveraine).
  — executePayoutTransfer/entry.ts l.343 : transition vers settled.
  — recognizeRevenue/entry.ts l.174 : transition vers archived.
  Source : grep Engagement.update dans codeBase44_v3/base44/functions/.
  Note : initiateDepositPayment/entry.ts l.169 est également suspect.
  Total : 5 mutations directes confirmées. transitionEngagement/entry.ts
  est la seule qui est le moteur de la machine — les 4 autres sont des
  bypasses.
  Impact : LOI TRANSITION-01 (OS V15 §16.2) stipule "interdite sauf
  via la fonction souveraine." Chaque bypass est une violation.
  La première transaction est déjà partiellement exécutée via ce
  mécanisme (ENG-H5V66Q-WBJ7N2 archived).

• [B-A-03] ContractSnapshot jamais persisté en production.
  Aucun ContractSnapshot export dans la base. Aucune fonction Base44
  déployée ne crée de ContractSnapshot (grep sur codeBase44_v3/base44/
  functions/ : 0 résultat). L'entité ContractSnapshot dans Base44
  ne définit que 4 champs (systemId, engagementId, phase, createdAt)
  — sans aucun champ financier (cachetBrutFinalCents, tauxPpm,
  commissionMrCents, etc.).
  La ContractSnapshotRepository.js existe dans src/repositories/ et
  est correcte, mais n'est jamais appelée par le code déployé.
  D-147 / CT-014 / OS V15 §2.7 ligne 3 : "WORM financier complet —
  montants, taux, taxes, frais Stripe snapshotés immuables. Source
  de vérité pour PayoutExecutor." Sans CS2, le PayoutExecutor est
  aveugle — tout paiement sur Event 1 commercial est impossible de
  façon conforme.

DÉGRADANT — réduit la qualité, n'empêche pas le pilote :

• [D-A-01] SoloFounderOverride hardcodé dans guardBalancePayment
  et guardPayoutReady (Base44 déployé) : les deux retournent
  passed:true en cas d'absence de données. Valide pour le pilote
  Event 0 — DOIT être désactivé avant Event 1 commercial.
  Source : transitionEngagement/entry.ts, commentaires explicites
  "À durcir pour Event 1 : remplacer passed:true par passed:false ici."

• [D-A-02] IDFactory expose ContractSnapshot:'CSN' (legacy) en
  parallèle de ContractSnapshotV1:'CS1' et ContractSnapshotV2:'CS2'.
  La ContractSnapshotRepository valide correctement CS1-/CS2-, mais
  le préfixe CSN orphelin peut induire en erreur.
  Source : src/core/IDFactory.js l.22 vs l.38-39.

• [D-A-03] MissionSlot : 0 enregistrement en production. L'entité
  définit un status machine informel (proposed, accepted, etc.) mais
  sans définition formelle des transitions. La fonction MissionConversion
  Guard existe en JS mais n'est pas déployée sur Base44. Le chemin
  proposed→accepted en production bypass toute validation MissionSlot.

• [D-A-04] Suite de tests P0 non orchestrée : CHEMIN-NOMINAL-01,
  SEALING-01, GUARDS-CHAIN-01, AMENDMENT-01, CONTESTATION-WINDOW-01
  passent individuellement mais ne font pas partie de npm run test.
  D-117 exige 100% tests P0 PASS mécaniquement.

REPORTABLE — peut attendre l'événement 2+ :

• EngagementAmendmentRepository absent (src/repositories/) : bloquant
  uniquement pour les scénarios SC-07-AMENDMENT. Non requis pour
  premier event simple.

• D-068 méthode des plus grands restes : non-bloquant pour lineup
  mono-talent (Pierre de Rosette). Requis avant tout event multi-talent.

• Guards de litige (DisputeGuard, DisputeResolutionGuard, TransferGuard,
  WithdrawalGuard) : implémentés en JS Phase 2.3, non déployés en
  Base44. Non requis pour chemin nominal.

ANGLE MORT POTENTIEL :
Y a-t-il quelque chose que ce domaine requiert pour la première
transaction que l'OS ne documente pas explicitement ?

→ OUI — INFÉRENCE NON DOCUMENTÉE : L'OS définit la machine d'état
  canonique dans src/core/ mais ne spécifie pas explicitement quelle
  couche fait foi : la couche JS (scripts/tests) ou la couche Base44
  déployée. Ces deux couches divergent significativement (47 vs 15
  transitions, 6 vs 3 WORM moments, présence ou non des 5 guards
  canoniques). L'OS ne tranche pas cette dualité architecturale.
  Jusqu'à ce que le fondateur valide formellement quelle couche est
  souveraine pour Event 1 commercial, le risque de régression est réel.
  À valider par le fondateur.

──────────────────────────────────────────────────
4. DETTE HÉRITÉE

V3 est une reconstruction native — aucune dette V1/V2 sur l'ontologie.

Dette interne V3 identifiée :
La divergence entre la couche JS canonique (construite pour satisfaire
les tests et la doctrine) et la couche Base44 déployée (construite
pour faire fonctionner le pilote Event 0) est la principale dette.
Elle s'est créée par itérations rapides sur le pilote sans synchroniser
la doctrine à chaque déploiement. C'est une dette architecturale
volontaire et temporaire — mais elle doit être soldée avant Event 1.

La présence de l'Engagement ENG-H5V66Q-WBJ7N2 archivé en production
avec un payout réel (88.60$ et 2388$ documentés en mémoire) prouve
que le circuit fonctionne bout-en-bout avec les bypasses actuels.
Ceci est un acquis opérationnel, pas une validation doctrinale.

──────────────────────────────────────────────────
5. DELTA VERS COMPLÉTUDE

Trois actions bloquantes pour que ce domaine soit prêt pour Event 1
commercial : (1) créer une ContractSnapshot phase 2 à chaque
event_sealed (entité enrichie + persistance Base44 déployée) ;
(2) unifier la machine d'état déployée avec la machine canonique
ou documenter formellement la doctrine des deux couches, en
particulier la WORM_STATES ; (3) éliminer les 4 mutations directes
d'Engagement.status hors transitionEngagement(), ou les encapsuler
dans un appel à la fonction souveraine.

──────────────────────────────────────────────────
6. STATUT FINAL

  ☑ EN COURS → 65% estimé

  Acquis solides : machine d'état canonique complète et testée,
  WORM doctrine correcte en JS, 18 guards implémentés, chemin
  nominal exécutable et testé bout-en-bout, un engagement archivé
  en production (preuve de vie).

  Ce qui reste : synchronisation doctrine↔déploiement Base44 sur
  WORM_STATES (B-A-01), élimination des 4 bypasses LOI TRANSITION-01
  (B-A-02), création effective de ContractSnapshot en production
  avec entité enrichie (B-A-03).

──────────────────────────────────────────────────
7. DÉPENDANCES SORTANTES

• B. Finance et ledger ne peut pas être déclaré PRÊT tant que
  ContractSnapshot phase 2 n'est pas persisté (B-A-03) — le
  PayoutExecutor et l'invariant zéro cent sont calculés depuis
  le CS2 (D-147, CT-014, OS V15 §16.1).

• C. Stripe et paiements dépend de la résolution de B-A-02
  (bypasses stripeWebhookHandler et executePayoutTransfer
  contournent transitionEngagement — les deux domaines sont
  enchevêtrés sur ce point).

• D. Présence et preuve dépend de B-A-01 : si event_sealed n'est
  pas un moment WORM en production, la protection de la fenêtre
  de présence perd son ancrage institutionnel.

• E. SOTS et réputation dépend de B-A-01 : sots_window_closed
  absent de WORM_STATES déployé — la gravure réputationnelle
  n'est pas verrouillée en production.

  INFÉRENCE : les domaines B, C, D, E sont tous tributaires des
  trois bloquants B-A-01, B-A-02, B-A-03. Aucun ne peut être
  déclaré PRÊT tant que ces trois points ne sont pas résolus ou
  formellement acceptés par le fondateur avec une décision de
  doctrine explicite (ex. : "la couche JS est documentaire ;
  la couche Base44 déployée est souveraine pour le pilote").
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FIN DE LA FICHE — A. ONTOLOGIE ET MACHINE D'ÉTAT
Conserver pour le Prompt de Synthèse.