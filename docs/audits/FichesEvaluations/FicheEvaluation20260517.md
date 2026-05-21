
17 mai
Je lis le code soumis avant de produire quoi que ce soit — il peut avoir évolué depuis la dernière session.J'ai tout. Je produis la fiche actualisée — qui reflète l'état réel du zip soumis ce matin, pas la session précédente.

FICHE D'ÉVALUATION — A. Ontologie et machine d'état
Date d'évaluation : 17 mai 2026 — 07h40 Documents sources : MICRORAVE_V3_OPERATING_SYSTEM_V10__1_.md (OS V10, source souveraine) · code V10.1 extrait du zip (transitionEngagement.js, MissionConversionGuard.js, PlacementGuard.js, EventPaymentGuard.js, IDFactory.js, tests P0) · tests P0 exécutés sur Linux ce jour : 73/73 PASSED Niveau de confiance : HAUTE sur la spécification · HAUTE sur le code (lu ligne par ligne + tests exécutés) · INFÉRENCE sur la persistence Base44 (non vérifiable depuis le code)

1. CRITÈRES DE COMPLÉTUDE
Ce domaine est prêt pour la première transaction quand :
transitionEngagement() est l'unique point d'entrée — LOI TRANSITION-01 : "Toute mutation du champ status d'un Engagement est interdite sauf via transitionEngagement()" — source : OS V10 section 16.2
Les 5 guards s'exécutent dans l'ordre invariant (MissionConversionGuard → WORMGuard → Guard spécifique → FinancialInvariantGuard → AuditLogger) — source : OS V10 section 2.7.1
Les 6 moments WORM sont actifs avec leurs niveaux de sévérité — source : OS V10 section 2.7 tableau
SealingGuard vérifie réellement les conditions à balance_pending → event_sealed (W2 — Moment 3 — "WORM financier complet") — source : OS V10 section 2.7.1
ContractSnapshot phase 1 est créé à accepted, retourné par transitionEngagement() et persisté en database — source : OS V10 section 2.7 moment 1
ContractSnapshot phase 2 est créé à event_sealed par SealingGuard — source : OS V10 section 2.7 moment 3
AuditLogger écrit au DataAccessLedger à chaque transition (Guard 5) — source : OS V10 section 2.7.1
MissionConversionGuard vérifie que le MissionSlot existe avant proposed → accepted — "MissionSlot existe · acteur autorisé" — source : OS V10 section 2.7.1
isSelfOrganized calculé et les trois règles applicables — source : OS V10 section 2.2 BLOC 1 V8
Pierre de Rosette C02 traversable : accepted → deposit_secured → event_sealed → performed → payable → settled → archived — source : OS V10 section 14.9
Ce domaine bloque tout le reste si :
transitionEngagement() peut être contournée — LOI TRANSITION-01 niveau 2 (fraude architecturale) — source : OS V10 section 16.2
event_sealed (W2) peut être modifié sans AdminIncidentRecord P0 + SYSTEM_HOLD — source : OS V10 section 2.7 BLOC 2 V8
ContractSnapshot phase 1 non persisté à accepted — la phase 2 n'a pas de fondation — source : OS V10 section 2.7 moment 1

2. ÉTAT ACTUEL DOCUMENTÉ
Ce qui existe et fonctionne selon les documents :
transitionEngagement() V10.1 — 43 transitions, opérationnelle. La porte anti-corruption existe. WORMGuard actif avec W3/W2/W1 (W1 = console.warn, conforme "jamais silencieux"). IDFactory.validate() sur engagementId et actor en entrée. contractSnapshot retourné si MCG le produit (correction V10.1). isSelfOrganized retourné si PlacementGuard le calcule. Tests P0 : 25/25 PASSED sur Linux — source : exécution locale.
WORM_STATES V10.1 conforme aux 6 moments officiels. accepted (W1 — Moment 1), deposit_secured (W1 — Moment 2 "Liaison contractuelle"), event_sealed (W2 — Moment 3), event_completed (W1 — Moment 4), sots_window_closed (W1 — Moment 5), archived (W3 — Moment 6). Plus payable (W1) comme protection pragmatique documentée — source : code transitionEngagement.js + OS V10 section 2.7.
Chemin nominal V10.1 conforme à OS section 2.6. placed → deposit_pending → deposit_secured → balance_pending → event_sealed — les états intermédiaires sont dans la table avec leurs guards corrects. SealingGuard couvre uniquement balance_pending → event_sealed (W2). Test chemin complet : TRANSITION-01 test ligne 206 — 25/25 PASSED.
Guards réels opérationnels (3/18) : MissionConversionGuard (dispatch par targetState correct), PlacementGuard (CS1- vérifié, Lineup cohérent, isSelfOrganized calculé), EventPaymentGuard (dépôt + confirmation Stripe avec tolérance ±2 centimes). Tests : 14/14 + 27/27 PASSED.
43 transitions couvrant tous les états OS V10 section 2.6. Aucun dead-end inattendu — vérifié par analyse automatique. États terminaux attendus uniquement : archived, refunded, withdrawn. no_show_pre_event présent. Disputes depuis tous les états actifs avec financialGuard: true post-paiement.
IDFactory — 26 types d'entités. Préfixes CS1- (phase 1) et CS2- (phase 2) distincts — source : code IDFactory.js lignes 36-37.
Ce qui vient de V1 et est encore actif :
V1 opère des events réels sur microrave.ca. UserProfiles, comptes Stripe Connect, KYC existants. Pas de WORM ni de guards documentés en V1 — INFÉRENCE. Acquis : réseau de co-testeurs (DJ Alex Dubois + Le Trèfle) préexistant. Dette de pattern : risque de mutation directe du champ status depuis l'interface Base44, contournant transitionEngagement(). Sans DataAccessLedger opérationnel, ce contournement est indétectable.
Ce qui vient de V2 :
Néant. V2 abandonnée pour anti-pattern architectural.

3. LACUNES IDENTIFIÉES
BLOQUANT :
SealingGuard est un placeholder { passed: true }. La transition balance_pending → event_sealed — WORM W2, "WORM financier complet", Moment 3 — passe sans aucune vérification. Conditions OS non vérifiées : balance reçue, ContractSnapshot phase 2 créé, LOI LINEUP-01/02 vérifiées, LOI LEDGER-02 respectée, TaxLiabilityAllocation snapshotée — source : OS V10 section 2.7.1. C'est le scellement de l'argent réel. Un placeholder ici = l'argent peut être scellé sans preuves.


DataAccessLedger absent. Guard 5 : // TODO: repositories.audit?.writeToDataAccessLedger(auditEntry) — source : code ligne 268. LOI TRANSITION-01 "Toute tentative de mutation directe déclenche un DataAccessLedger entry" — source : OS V10 section 16.2. Sans lui, les violations de la loi fondatrice du système sont indétectables.


MissionConversionGuard ne vérifie pas l'existence du MissionSlot. L'OS section 2.7.1 exige "MissionSlot existe · acteur autorisé" à proposed → accepted. Le guard vérifie les acteurs, le cachet, le taux — mais aucune ligne de code ne vérifie qu'un MissionSlot existe pour cet Engagement — source : grep sur MissionConversionGuard.js retournant zéro occurrence de MissionSlot. Un Engagement peut être accepté sans MissionSlot valide.


ContractSnapshot phase 1 retourné mais persistence non garantie. V10.1 retourne contractSnapshot dans le résultat de transitionEngagement(). Mais rien dans le code ne force l'appelant à le persister. Si l'intégration Base44 ignore ce champ, le Moment WORM 1 est calculé et jeté — source : INFÉRENCE sur l'intégration Base44, non vérifiable depuis le code.


FinancialInvariantGuard (Guard 4) est un console.log. Pour 24 des 43 transitions (financialGuard: true), LOI LEDGER-02 n'est jamais vérifiée — source : code ligne 264. balance_pending → event_sealed, deposit_secured → cancelled_J30, disputed → refunded et toutes les transitions financières passent sans vérification d'invariant.


DÉGRADANT :
15 guards sur 18 sont des placeholders { passed: true }. PresenceProofGuard, LedgerInvariantGuard, ArchiveWORMGuard, CancellationGuard, RefundGuard, DisputeGuard, DisputeResolutionGuard entre autres. Ces guards ouvrent des chemins financiers réels (annulations avec dépôt, remboursements, disputes, payout) sans aucune vérification. Un placeholder sur une transition financière n'est pas neutre — c'est une porte ouverte — source : analyse des 18 cases dans runSpecificGuard().


Guard 1 (MissionConversionGuard) = pass-through pour 40 des 43 transitions. L'OS prescrit que Guard 1 "valide la légitimité de la transition ET l'autorisation de l'acteur" — source : OS V10 section 2.7.1. Pour toutes les transitions non-MCG (SealingGuard, PresenceProofGuard, LedgerInvariantGuard...), runMissionConversionCheck() retourne { passed: true } sans vérifier qu'un USR-X a le droit d'agir sur cet ENG-Y. IDFactory.validate(actor) prouve que le format USR- est correct, pas que l'acteur est autorisé.


PlacementGuard ne vérifie pas les signatures. L'OS section 2.7.1 exige "signatures valides" à accepted → placed. Le guard vérifie CS1-, eventId, Lineup — mais aucune vérification de signature ou de consentement — source : grep sur PlacementGuard.js retournant zéro occurrence de signature.


REPORTABLE :
Voie QuickPlay — MissionConversionGuard ne couvre pas l'entrée directe en accepted — source : OS V10 section 2.6 note QuickPlay. Non bloquant pour Event 1 (voie CreateEvent pure).
TalentRolePreference — objet QuickPlay — source : OS V10 section 2.5.1. Non requis pour Event 1.
Capitaine sunset (BLOC 8 V8) — source : OS V10 section 2.5. Post-Event 2+.
EngagementCollectif — source : OS V10 section 2.3. Non requis pour Event 1 SC-01.
ANGLE MORT POTENTIEL :
→ INFÉRENCE NON DOCUMENTÉE : L'OS V10 section 2.7.1 présuppose implicitement une autorisation par rôle pour chaque transition — un talent peut proposed → negotiating, pas payable → settled. Aujourd'hui aucun mécanisme de RBAC (Role-Based Access Control) n'est implémenté dans les guards. IDFactory.validate(actor, 'User') prouve que l'actor est un systemId USR- valide, pas qu'il est le talent de cet Engagement et non un tiers. Un acteur quelconque peut déclencher performed → no_show sur l'Engagement d'un autre talent. À valider : le RBAC par transition est-il un prérequis de l'Event 1 ou reportable aux événements ultérieurs ?

4. DETTE HÉRITÉE
De V1 (dette de contournement silencieux) : Sans DataAccessLedger, toute mutation directe de status dans Base44 UI est indétectable. V1 opère présumément avec mutations directes. La transition vers V3 requiert une discipline active de la part du fondateur pendant la construction — aucun filet de sécurité automatique.
De Base44 (contrainte structurelle) : Base44 permet la modification directe des champs d'enregistrement depuis l'interface. Cette possibilité existe pour tous les champs, y compris status. La seule protection est architecturale (couches portables) + comportementale (discipline du fondateur). L'OS l'a anticipé — section 11.1 : "Base44 est la rampe, pas la destination."

5. DELTA VERS COMPLÉTUDE
Implémenter SealingGuard avec ses conditions réelles (balance reçue, ContractSnapshot phase 2, LOI LEDGER-02, TaxLiabilityAllocation), implémenter DataAccessLedger pour que l'AuditLogger écrive réellement, et ajouter la vérification MissionSlot dans MissionConversionGuard.

6. STATUT FINAL
☑ EN COURS — 45% estimé
Composant
État
Spécification OS V10.1
100% — complète, cohérente, 6 moments WORM, 43 transitions, Pierre de Rosette
transitionEngagement() + WORM
~90% — porte opérationnelle, IDFactory validation, contractSnapshot retourné
Guards réels (MCG, Placement, EventPayment)
~75% — opérationnels avec lacunes identifiées (MissionSlot, signatures)
Guards placeholder (15/18)
0% — SealingGuard, PresenceProofGuard, LedgerInvariantGuard, ArchiveWORMGuard, Cancellation, Refund, Dispute
DataAccessLedger (Guard 5)
0% — TODO
FinancialInvariantGuard (Guard 4)
0% — console.log
Persistence ContractSnapshot
INCONNU — retourné mais non garanti persisté

Ce qui reste pour atteindre PRÊT SOUS CONDITIONS :
SealingGuard réel — W2, ContractSnapshot phase 2, LOI LEDGER-02
DataAccessLedger persisté — LOI TRANSITION-01 avec dents
MissionSlot existence check dans MissionConversionGuard
PresenceProofGuard réel — LOI CO-DÉPENDANCE-01
LedgerInvariantGuard réel — LOI LEDGER-02 + KYC
ArchiveWORMGuard réel — GoNoGoDecisionRecord + BugReplayRecords P0

7. DÉPENDANCES SORTANTES
B (Finance) : LedgerInvariantGuard (payable → settled) et FinancialInvariantGuard (24 transitions) exigent un FinancialLedger opérationnel — source : OS V10 sections 2.7.1 + 4.2. Sans A, B n'a pas d'objet sur lequel vérifier l'invariant.
C (Stripe) : deposit_pending → deposit_secured est déclenché par webhook Stripe validé — source : OS V10 section 2.7.1. Sans A opérationnel jusqu'à deposit_secured, C n'a nulle part où livrer sa confirmation.
D (Présence) : PresenceProofGuard (sots_window_closed → payable) est un composant de A — source : OS V10 section 2.7.1. Sans A, D ne peut pas prouver que "tu étais là" — LOI CO-DÉPENDANCE-01 — source : OS V10 section 16.2.
E (SOTS) : SOTSWindowGuard (event_completed → sots_window_closed) et ArchiveWORMGuard (SOTS window closed obligatoire) sont des composants de A — source : OS V10 section 2.7.1. Sans A, archived n'est jamais atteint.
G (Admin) : AdminIncidentRecord P0 déclenché par violation W2 est un composant de A — source : OS V10 section 2.7 BLOC 2 V8. DataAccessLedger (Guard 5) est le registre institutionnel central — sans A, G n'a pas de surface de détection.
Tous : LOI TRANSITION-01 est la loi transversale. Sans transitionEngagement() comme unique porte — et sans DataAccessLedger pour détecter les contournements — chaque domaine opère sans filet — source : OS V10 section 16.2.

FIN DE LA FICHE — A. Ontologie et machine d'état (V10.1) Fiche conservée pour le Prompt de Synthèse.
Le code est déjà extrait dans /tmp/mr9. Je lis les composants financiers du zip soumis.J'ai tout. La fiche reflète l'état mesuré ce jour.

FICHE D'ÉVALUATION — B. Finance et ledger
Date d'évaluation : 17 mai 2026 — 07h42 Documents sources : MICRORAVE_V3_OPERATING_SYSTEM_V10__1_.md (OS V10) · code V10.1 extrait du zip · analyse automatique des composants financiers exécutée sur Linux · POLICYCONFIG-FAILCLOSED-01 : 4/5 PASSED (échec database attendu) Niveau de confiance : HAUTE — absence des composants financiers confirmée par grep exhaustif sur tout le src/

1. CRITÈRES DE COMPLÉTUDE
Ce domaine est prêt pour la première transaction quand :
Le waterfall LOI WATERFALL-01 complet (9 étapes) est exécuté sans float, avec floor sur commission et ceil sur frais Stripe — source : OS V10 section 3.3
LOI LEDGER-02 est vérifiée avant event_sealed : sum(nets) + sum(commissions) + rounding = prix_vendu — "Si cet invariant n'est pas respecté → LEDGER_BALANCE_VIOLATION → event_sealed bloqué" — source : OS V10 section 4.2
TaxLiabilityAllocation est snapshotée au scellement — "Règle fail-closed : si absente → event_sealed bloqué" — source : OS V10 section 3.10
TaxConfig.paymentFeesTaxTreatment est configuré — "Fail-closed si absent" — source : OS V10 section 3.9
Les 5 mouvements d'archivage sont exécutés dans l'ordre, solde 5200 = 0,00 $ en sortie — source : OS V10 section 4.1
Les 6 verrous anti-double payout sont actifs — source : OS V10 section 8.3
MoneyMovementRouter est le seul chemin pour tout mouvement d'argent — "Contournement = interdit absolu" — source : OS V10 section 3.8
Scénario SC-01 nominal en BugReplayRecord P0 PASSED — source : OS V10 section 3.7
Toute constante financière vit en database — source : OS V10 section 4.5
Ce domaine bloque tout le reste si :
Un float entre dans le calcul — "amount: 1000.00 / commissionRate: 0.19" = interdits absolus — source : OS V10 section 3.2
LOI LEDGER-02 non vérifiée avant event_sealed — l'argent peut être scellé sur un calcul déséquilibré — source : OS V10 section 4.2
TaxLiabilityAllocation absente — source : OS V10 section 3.10. Scellement architecturalement bloqué
TaxConfig.paymentFeesTaxTreatment absent — source : OS V10 section 3.9

2. ÉTAT ACTUEL DOCUMENTÉ
Ce qui existe et fonctionne dans le code soumis :
Standard numérique — partiellement appliqué sur le ContractSnapshot. MissionConversionGuard valide cachetBrutCents comme entier positif et tauxPpm comme entier ppm (0–1 000 000). commissionMrCents = Math.floor(cachetBrutCents * tauxPpm / 1_000_000) — floor conforme à la section 3.3 étape 3. talentNetCents = cachetBrutCents - commissionMrCents — conforme à la section 4.4 (net comme reste, jamais recalculé). Ces calculs s'appliquent au cachet signé — avant coefficient. C'est correct : le ContractSnapshot phase 1 fixe le cachet signé, le waterfall complet avec coefficient est calculé au scellement — source : code MissionConversionGuard.js lignes 195-196.
EventPaymentGuard — calcul du dépôt conforme. depositCents = Math.floor(totalCents * depositRatioPpm / 1_000_000) — floor conforme. totalCents documenté comme prix TTC (prix_vendu_HT + TPS + TVQ + frais_Stripe) — conforme section 3.3. Tolérance Stripe ±2 centimes (Math.abs) — source : code EventPaymentGuard.js lignes 130-131.
PolicyConfig seed — complet et correctement architecturé. 13 configs fondamentales en database : tps_ppm (50000), tvq_ppm (99750), stripe_ppm (29000), stripe_fixe_cents (30), deposit_ratio_ppm (200000), event_payment_cap_cents (350000), free_weight_cents (100), payment_fees_tax_treatment (DEBOURS), + 4 comptes ledger (4310, 4325, 4326, 4530) — source : code policy-config-schema.js. Aucune valeur financière hardcodée — conforme section 4.5.
PolicyConfigResolver fail-closed réel. Exception immédiate sur clé absente. CRITICAL_CONFIG_KEYS auto-générée depuis le schema — source unique de vérité — source : code policy-config-resolver.js.
IDFactory — préfixes financiers déclarés. LedgerEntry: 'LDG', PayoutExecution: 'PAY' — source : code IDFactory.js lignes 28-29. Ces objets ont des systemId prévus. Ils ne sont pas encore implémentés.
Ce qui vient de V1 :
Payouts Stripe Connect réels (88,60$ et 2 388,57$ CAD). Connaissance opérationnelle des comportements Stripe (latences, retry, KYC). Acquis : le fondateur sait ce qui se passe en production. Dette de pattern : le ledger V1 est présumé sans standard ppm ni LOI LEDGER-02 — INFÉRENCE. Risque de reproduire des calculs V1 dans V3.
Ce qui vient de V2 :
Néant. L'anti-pattern V2 (SystemConfig JSON blob à la place d'entités LedgerCodeMap et CommissionRateConfig) a été identifié et corrigé par la refondation — source : mémoire de session. Le policy-config-schema.js est la matérialisation de cette correction.

3. LACUNES IDENTIFIÉES
BLOQUANT :
Waterfall LOI WATERFALL-01 — étapes 1, 2, 5, 6, 7, 9 absentes du code. Constaté par analyse automatique. Le calcul du coefficient (max(1, prix_vendu / total_lineup_effectif)), de cachet_brut_final_i, de commission_MR_totale, des taxes, du sous_total et du total_payeur n'existent nulle part dans le src/ — source : grep exhaustif. MissionConversionGuard calcule commission sur cachet signé (correct pour le ContractSnapshot phase 1), pas le waterfall complet. Le waterfall complet n'est implémenté dans aucun fichier.


FinancialLedger absent. Aucun objet, aucune table, aucune écriture DR/CR dans le code — source : grep exhaustif retournant 0 occurrence. Les 5 mouvements d'archivage (section 4.1) ne peuvent pas être exécutés. Le compte 5200 ne peut jamais atteindre 0.


LOI LEDGER-02 non vérifiée. LEDGER_BALANCE_VIOLATION est absent du code. FinancialInvariantGuard (Guard 4) est console.log — source : code transitionEngagement.js ligne 264. LedgerInvariantGuard est { passed: true } — source : code ligne 377. L'invariant zéro cent n'est vérifié à aucune transition.


TaxLiabilityAllocation absente. Aucun fichier, aucun objet, aucun champ dans le code — source : grep exhaustif. Règle fail-closed OS section 3.10 : "si absente → event_sealed bloqué". Puisque SealingGuard est un placeholder, ce blocage n'est pas actif — l'argent peut être scellé sans allocation fiscale.


MoneyMovementRouter absent. Aucun des 6 rails (COLLECT, HOLD, DISTRIBUTE, REFUND, TRANSFER, RECONCILE) n'existe dans le code — source : grep exhaustif. Interdit absolu 17 : "Contourner le MoneyMovementRouter" — source : OS V10 section 9.4. Sans lui, tout mouvement d'argent contourne architecturalement cet interdit.


6 verrous anti-double payout absents. lockedByRunId, PayoutExecutionRecord, Stripe idempotency key, SettlementInstruction.consumedAt, invariant LEDGER-02 — tous absents — source : analyse automatique des 6 verrous retournant ABSENT sur chacun — source OS : section 8.3. Un retry webhook Stripe peut déclencher un double payout sans protection.


Doctrine A non validée fiscalement. OS V10 section 3.10 : "⚠️ VALIDATION FISCALISTE REQUISE AVANT TOUT LANCEMENT COMMERCIAL RÉEL." Ce n'est pas un blocage de code — c'est un blocage de lancement avec risque légal documenté dans l'OS.


DÉGRADANT :
LOI LINEUP-03 non vérifiée dans EventPaymentGuard. La condition prix_vendu_client ≥ total_lineup_signé devrait déclencher LINEUP_PRICE_FLOOR_VIOLATION — source : OS V10 section 3.4. EventPaymentGuard vérifie le plafond cap mais pas ce plancher. Un event dont le prix vendu est inférieur au lineup signé peut passer placed → deposit_pending.


Cache PolicyConfig non invalidé sur upsert. clearCache() existe mais n'est jamais appelé après upsert() — source : code PolicyConfigRepository.js + PolicyConfigAdapter.js. Une modification de tps_ppm ou deposit_ratio_ppm reste invisible 60 secondes — source : code policy-config-resolver.js ligne 35.


RoundingReconciliationRecord et compte 6591 absents. Sans eux, les résidus du calcul largest remainder sur le coefficient ne sont tracés nulle part — source : OS V10 section 4.4. Pour Event 1 avec coefficient = 1, non critique. Pour tout event avec coefficient > 1, les poussières mathématiques disparaissent.


REPORTABLE :
SC-03 (coefficient > 1), SC-05 (annulation J-30), SC-06 (balance J-6), SC-07 (no-show) — P0 global mais non bloquants avant Event 1 SC-01 nominal — source : OS V10 section 3.7
Doctrines B et C — non pertinentes avant Event 1 — source : OS V10 section 3.10
SellerCompensationPlan (LOI SELLER-COMP-01) — hors waterfall, hors Event 1 — source : OS V10 section 3.5
TaxConfig multi-provinces — non requis avant un event hors Québec — source : OS V10 section 4.6
ANGLE MORT POTENTIEL :
→ INFÉRENCE NON DOCUMENTÉE : L'OS V10 section 4.1 décrit les 5 mouvements d'archivage comme une séquence ordonnée. Il ne précise pas si c'est ArchiveWORMGuard qui les exécute atomiquement (transaction unique) ou le scheduler P0 execute_payout_transfer qui les déclenche séquentiellement (5 jobs distincts). L'atomicité impacte la gestion des erreurs : si le mouvement 3 (payout talent) échoue après les mouvements 1-2, le système est dans un état partiellement archivé. À valider : les 5 mouvements sont-ils une transaction atomique ou une séquence de jobs scheduler ?

4. DETTE HÉRITÉE
De V1 (acquis positif) : Payouts Stripe Connect réels. Connaissance des comportements Stripe en production. Capital de confiance avec les co-testeurs.
De V1 (dette de calcul) : Le ledger V1 est présumé sans LOI LEDGER-02 ni standard ppm — INFÉRENCE. Le risque concret : un développeur qui calcule "comme V1" introduit un float ou un arrondi incorrect. La protection existante (tests MISSIONCONVERSION-01 sur Number.isInteger()) couvre le ContractSnapshot phase 1, pas le waterfall complet.
De V2 (dette résolue) : L'anti-pattern V2 (SystemConfig JSON blob) est corrigé. policy-config-schema.js est la preuve de cette correction — entités dédiées, séparation nette, fail-closed documenté.

5. DELTA VERS COMPLÉTUDE
Implémenter le moteur waterfall complet (9 étapes, LOI LINEUP-01/02, coefficient, floor/ceil conformes), FinancialLedger avec les 5 mouvements d'archivage et contrôle solde 5200 = 0, TaxLiabilityAllocation snapshotée au scellement, MoneyMovementRouter avec ses 6 rails, les 6 verrous anti-double payout — et obtenir la validation fiscaliste de Doctrine A.

6. STATUT FINAL
☑ EN COURS — 18% estimé
Composant
État
Spécification OS V10
100% — waterfall 9 étapes, LOI LEDGER-02, 5 mouvements, arrondi, 6 verrous, MoneyMovementRouter, TaxLiabilityAllocation — tout documenté
Standard numérique + fail-closed config
~80% — appliqué dans MCG et EventPaymentGuard, validé par tests
Moteur waterfall complet (étapes 1-9)
0% — absent du code
FinancialLedger
0% — absent
TaxLiabilityAllocation
0% — absente
MoneyMovementRouter
0% — absent
6 verrous anti-double payout
0% — absents
LOI LEDGER-02 vérifiée
0% — console.log
Validation fiscaliste Doctrine A
INCONNU

Le 18% reflète exclusivement la valeur des fondations (seed configs en database, fail-closed, standard numérique partiel, IDFactory préfixes financiers) qui accélèrent la construction mais ne constituent pas le moteur.

7. DÉPENDANCES SORTANTES
A (Machine d'état) : LedgerInvariantGuard (payable → settled) et FinancialInvariantGuard (24 transitions financialGuard: true) exigent un FinancialLedger et LOI LEDGER-02 opérationnels — source : OS V10 sections 2.7.1 + 4.2. Sans B, ces deux guards ne peuvent jamais être réels.
C (Stripe) : le mouvement d'archivage 1 ("Stripe reprend physiquement les frais") est confirmé par webhook transfer.paid — source : OS V10 section 4.1 mouvement 1. Sans MoneyMovementRouter rail DISTRIBUTE, C n'a nulle part où livrer sa confirmation.
D (Présence) : PresenceProofGuard exige "ledger équilibré" — source : OS V10 section 2.7.1. Sans LOI LEDGER-02 vérifiable, cette condition ne peut jamais être évaluée.
F (Scheduler) : jobs P0 execute_payout_transfer, ledger_balance_check, capture_deposit présupposent FinancialLedger et MoneyMovementRouter — source : OS V10 section 8.2. Sans B, le scheduler P0 n'a pas d'objet sur lequel opérer.
Pierre de Rosette C03 : "Invariant Zéro Cent · 200$ signé · Livres = 0 · LEDGER-02 respecté" — source : OS V10 section 14.9. La Pierre de Rosette ne peut pas être complétée sans B opérationnel.

FIN DE LA FICHE — B. Finance et ledger Fiche conservée pour le Prompt de Synthèse.

Le code est dans /tmp/mr9. Je lis les composants Stripe avant de produire.J'ai tout. Je produis la fiche.

FICHE D'ÉVALUATION — C. Stripe et paiements
Date d'évaluation : 17 mai 2026 — 07h52  Documents sources : MICRORAVE_V3_OPERATING_SYSTEM_V10__1_.md (OS V10) · code V10.1 extrait du zip (stripe-webhook-proxy/index.js, tests/p0/WEBHOOK-RAWBODY-01.js, .env.example, .gitignore, transitionEngagement.js) · WEBHOOK-RAWBODY-01 exécuté sur Linux ce jour · audit exhaustif des 10 règles Stripe section 7.7 Niveau de confiance : HAUTE — résultats mesurés sur Linux, composants absents confirmés par grep exhaustif

1. CRITÈRES DE COMPLÉTUDE
Ce domaine est prêt pour la première transaction quand :
WEBHOOK-RAWBODY-01 passe en BugReplayRecord P0 PASSED — "P0 global : Toujours requis avant argent réel" — source : OS V10 section 15.3
Proxy externe déployé et PROXY_BASE44_ENDPOINT configuré — "webhook proxy externe obligatoire avant argent réel — pas un plan B, une précondition" — source : OS V10 section 11.3
WebhookProcessedLog persisté en database (pas en mémoire) — source : OS V10 section 7.7 règle 7 + interdit absolu 11 ("Modifier un WebhookIdempotencyRecord traité") — source : OS V10 section 9.4
EventPaymentRecord créé à placed → deposit_pending — "EventPaymentRecord créé · Lineup verrouillé" — source : OS V10 section 2.7.1
KYCStatus = VERIFIED vérifié avant tout payout via LedgerInvariantGuard — source : OS V10 section 7.7 règle 5
Stripe idempotency key = systemId + "payout" + attempt_version (verrou 4) — source : OS V10 section 8.3
PayoutExecutionRecord créé avant tout payout (verrou 3 — "si existant → no-op absolu") — source : OS V10 section 8.3
Alertes #2 (double payout) et #3 (webhook invalide) opérationnelles — source : OS V10 section 11.7
Les 10 règles Stripe section 7.7 respectées
Ce domaine bloque tout le reste si :
Proxy non déployé ET WEBHOOK-RAWBODY-01 FAILED — aucun webhook Stripe ne peut être validé → deposit_pending → deposit_secured ne peut jamais être déclenché automatiquement — source : OS V10 section 11.3 + test mesuré sur Linux
Un secret Stripe est dans le code source ou les logs — exposition = compromission de tous les comptes Connect — source : OS V10 section 7.7 règle 1
WebhookProcessedLog absent — un retry Stripe automatique (comportement standard sur erreur 5xx) déclenche un double paiement sans verrou 4 — source : OS V10 section 8.3 verrou 4

2. ÉTAT ACTUEL DOCUMENTÉ
Ce qui existe et fonctionne dans le code soumis :
Proxy webhook Stripe — code complet, architecture correcte, non déployé. express.raw() préserve le raw body. stripe.webhooks.constructEvent() valide la signature. L'idempotency est vérifiée via processedEvents.has(event.id). La transmission à Base44 est conditionnelle à la validation. Architecture conforme à l'OS section 11.3 — source : code stripe-webhook-proxy/index.js.
WEBHOOK-RAWBODY-01 exécuté sur Linux — Test A FAILED, conclusion claire. Base44 parse le JSON avant de le donner au handler — la signature Stripe est invalidée. Test B confirme le comportement. Conclusion : proxy est une précondition confirmée, pas une option — source : exécution locale + OS V10 section 11.3.
10 règles Stripe — 5 respectées, 5 absentes. Respectées (R1, R2, R3, R6, R9) : aucun secret dans le code, .env dans .gitignore, process.env.STRIPE_*, constructEvent() avec raw body, aucune sk_live_ dans le code. Absentes (R4, R5, R7, R8, R10) : rotation planifiée, KYCStatus, WebhookProcessedLog, restricted keys, rotation = AdminAction — source : audit automatique sur /tmp/mr9/microrave-v3.
Ce qui vient de V1 :
Comptes Stripe Connect actifs, KYC validés pour les co-testeurs (DJ Alex Dubois + Le Trèfle). Payouts réels (88,60$ et 2 388,57$ CAD). Connaissance opérationnelle des comportements Stripe. Acquis : réseau Stripe éprouvé, aucune première prise de contact avec l'API. Dette de pattern : V1 a présumément validé les webhooks sans proxy ni raw body — INFÉRENCE. Risque de reproduire ce pattern dans l'intégration Base44 V3.
Ce qui vient de V2 :
Néant.

3. LACUNES IDENTIFIÉES
BLOQUANT :
Proxy non déployé. PROXY_BASE44_ENDPOINT = 'https://REMPLACER_PAR_ENDPOINT_BASE44' — source : code .env.example ligne 25. Sans déploiement sur Railway/Render et sans endpoint configuré, aucun webhook Stripe n'est transmis à Base44. deposit_pending → deposit_secured (Moment WORM 2) ne peut jamais être déclenché automatiquement par un paiement réel — source : OS V10 section 11.3.


WebhookProcessedLog absent — idempotency en mémoire. Le proxy stocke processedEvents dans un Set() JavaScript — source : code ligne 29. Un restart du proxy (déploiement, crash, scaling horizontal) vide le Set. Un webhook Stripe qui arrive après un restart est retraité — double paiement possible. L'OS exige un WebhookProcessedLog persisté en database — source : OS V10 section 7.7 règle 7. L'interdit absolu 11 ("Modifier un WebhookIdempotencyRecord traité") présuppose l'existence de cet objet — source : OS V10 section 9.4.


EventPaymentRecord absent. L'OS section 2.7.1 exige "EventPaymentRecord créé · Lineup verrouillé" à placed → deposit_pending. EventPaymentGuard calcule le dépôt et retourne les montants, mais aucun objet EPR n'est créé ni persisté — source : grep exhaustif sur tout le src/. Sans EPR, verrou 3 anti-double payout est structurellement impossible.


PayoutExecutionRecord absent (verrou 3). OS V10 section 8.3 verrou 3 : "PayoutExecutionRecord — si existant → no-op absolu". Absent du code — source : grep exhaustif. Sans lui, deux exécutions concurrentes de execute_payout_transfer (retry Stripe, scheduler P0 doublé) peuvent aboutir à un double payout.


Stripe idempotency key pour payout absente (verrou 4). OS V10 section 8.3 verrou 4 : "systemId + 'payout' + attempt_version". Absent du code — source : grep exhaustif. L'idempotency du proxy couvre les webhooks entrants, pas les payouts sortants vers Stripe Connect. Ce sont deux mécanismes distincts.


KYCStatus = VERIFIED non vérifié. LedgerInvariantGuard est { passed: true } — source : code transitionEngagement.js ligne 377. La condition à payable → settled n'est jamais évaluée — source : OS V10 section 7.7 règle 5 + section 2.7.1.


DÉGRADANT :
Gestion d'erreur Base44 dans le proxy — silence sur échec. Si forwardToBase44() lève une exception (timeout, Base44 500), le proxy loggue l'erreur et retourne 200 à Stripe ("Ne pas retourner d'erreur à Stripe — loguer pour retry manuel") — source : code ligne 63-65. Un webhook validé mais non traité par Base44 est perdu silencieusement. Sans dead-letter queue ou retry automatique, la perte est définitive. Stripe ne retente que si une erreur 5xx est retournée.


Règles 4 et 10 — rotation planifiée absente. SecretsRotationPolicyConfig n'existe pas dans le code. Aucun AdminAction lié à une rotation — source : grep exhaustif. Rotation après incident = procédure manuelle non outillée — source : OS V10 section 7.7 règle 4 + 10.


Règle 8 — restricted keys non segmentées. Une seule STRIPE_SECRET_KEY dans .env.example — source : code .env.example. L'OS prescrit des clés distinctes par usage (lecture, paiement, Connect, webhook) — source : OS V10 section 7.7 règle 8. Non bloquant pour Event 1 (fondateur seul), mais absence de moindre privilège.


Alerte #3 (Webhook invalide) non opérationnelle. Infrastructure observabilité (Sentry, logs externalisés, dashboard) absente — source : OS V10 section 11.7 : "Infrastructure obligatoire avant Event 0B". Sans alerte, une vague de webhooks forgés passe silencieusement (ils échouent à la validation mais sans trace côté fondateur).


REPORTABLE :
Règle 4 rotation complète — acceptable pour Event 1 avec rotation manuelle documentée comme AdminAction
Restricted keys segmentées — optimisation de sécurité, pas bloquant avec un seul opérateur
CHARGEBACK_HOLD_APPLIED (webhook chargeback Stripe) — non bloquant pour Event 1 avec co-testeurs consentants
ANGLE MORT POTENTIEL :
→ INFÉRENCE NON DOCUMENTÉE : Le proxy actuel transmet tous les événements Stripe validés à Base44 sans filtrage par type. L'OS section 11.3 dit que le proxy "ne transmet que des événements validés" — mais ne spécifie pas si "validés" signifie uniquement signature valide, ou signature valide ET type d'événement attendu. Un événement customer.subscription.deleted ou radar.early_fraud_warning.created arriverait validé et serait transmis à Base44 sans logique de traitement. À valider : faut-il une allowlist explicite des types Stripe (payment_intent.succeeded, transfer.paid, charge.refunded, payment_intent.payment_failed) dans le proxy ?

4. DETTE HÉRITÉE
De V1 (acquis stratégique) : Comptes Stripe Connect actifs, KYC validés pour les co-testeurs, payouts réels exécutés. Le fondateur connaît les latences, retry patterns, comportements webhook en production. Ce capital opérationnel ne s'achète pas avec du code.
De V1 (risque de pattern) : V1 a présumément traité les webhooks sans proxy ni raw body — INFÉRENCE. Si l'intégration Base44 V3 reproduit ce pattern, WEBHOOK-RAWBODY-01 échouera à chaque déploiement. La résolution est connue et documentée (proxy existe). Elle nécessite uniquement le déploiement et la configuration de PROXY_BASE44_ENDPOINT.
De Base44 (contrainte structurelle confirmée) : WEBHOOK-RAWBODY-01 Test A FAILED confirme que Base44 parse le JSON avant de le donner au handler. Ce n'est pas un bug réparable — c'est le comportement de la plateforme. Le proxy n'est pas un contournement — c'est l'architecture choisie pour cette contrainte, anticipée par l'OS section 11.3.

5. DELTA VERS COMPLÉTUDE
Déployer le proxy sur Railway/Render, configurer PROXY_BASE44_ENDPOINT, migrer l'idempotency de Set() vers WebhookProcessedLog persisté en database, implémenter EventPaymentRecord à placed → deposit_pending, PayoutExecutionRecord avant tout payout, et la Stripe idempotency key systemId + "payout" + attempt_version.

6. STATUT FINAL
☑ EN COURS — 28% estimé
Composant
État
Spécification 10 règles Stripe
100% — documentée
Secrets management (R1, R2, R3, R9)
✅ Conforme
Raw body + signature (R6)
✅ Code proxy implémenté
Proxy déployé + endpoint configuré
❌ Non déployé
WebhookProcessedLog persisté
❌ Set() en mémoire
EventPaymentRecord
❌ Absent
PayoutExecutionRecord (verrou 3)
❌ Absent
Stripe idempotency key payout (verrou 4)
❌ Absente
KYCStatus vérifié (verrou 5)
❌ LedgerInvariantGuard placeholder
Rotation planifiée (R4, R10)
❌ Absente
Alertes #2 et #3
❌ Infrastructure observabilité absente

Le 28% reflète : secrets correctement gérés (valeur réelle), code proxy architecture conforme, comptes Stripe Connect V1 actifs.

7. DÉPENDANCES SORTANTES
A (Machine d'état) : deposit_pending → deposit_secured (Moment WORM 2) est déclenché par webhook payment_intent.succeeded validé par le proxy — source : OS V10 section 2.7.1. Sans C déployé, cette transition ne peut jamais être déclenchée automatiquement. Le château attend derrière une porte sans clochette.
B (Finance) : mouvement d'archivage 1 ("Stripe reprend physiquement les frais") est confirmé par webhook transfer.paid — source : OS V10 section 4.1. Sans C, le MoneyMovementRouter rail DISTRIBUTE n'a jamais de signal de confirmation. Le solde 5200 ne peut jamais atteindre 0.
A (verrous anti-double payout) : verrous 3 (PayoutExecutionRecord) et 4 (Stripe idempotency key) sont des composants de ce domaine — source : OS V10 section 8.3. Sans C, deux des six verrous sont structurellement absents.
G (Admin) : alerte #3 (Webhook Stripe invalide) est une des 10 alertes P0 obligatoires avant Event 0B — source : OS V10 section 11.7. Sans infrastructure d'observabilité, cette alerte n'existe pas.
GoNoGo Event 0B : WEBHOOK-RAWBODY-01 est un prérequis explicite d'Event 0B — "+ WEBHOOK-RAWBODY-01, Portability Readiness D-132, 10 alertes P0" — source : OS V10 section 15.5. Tant que C n'est pas à PRÊT, Event 0B ne peut pas démarrer. Et Event 1 ne peut pas démarrer sans Event 0B.

FIN DE LA FICHE — C. Stripe et paiements Fiche conservée pour le Prompt de Synthèse.

Le code est dans /tmp/mr9. Je lis les sections présence de l'OS et audite le code.J'ai tout. La fiche reflète l'état mesuré.

FICHE D'ÉVALUATION — D. Présence et preuve
Date d'évaluation : 17 mai 2026 — 07h52 Documents sources : MICRORAVE_V3_OPERATING_SYSTEM_V10__1_.md (OS V10) · code V10.1 extrait du zip · audit exhaustif par grep sur tout le src/ · audit des 13 composants présence — 13/13 absents ou non fonctionnels Niveau de confiance : HAUTE — absence confirmée par mesure directe, zéro inférence sur les composants présence

1. CRITÈRES DE COMPLÉTUDE
Ce domaine est prêt pour la première transaction quand :
SessionPresence.checkedInAt != null est vrai pour l'Engagement avant tout déclenchement de payout — "aucun chemin de code ne peut déclencher un payout sans que SessionPresence.checkedInAt != null soit vrai" — source : OS V10 section 6.1 LOI CO-DÉPENDANCE-01
PresenceWindowGuard ouvre la fenêtre check-in à event_sealed → performed avec les seuils maxDistancePolicy et minDurationPolicy — source : OS V10 section 2.7.1
PresenceProofGuard évalue les conditions 3-5 des 11 à sots_window_closed → payable : checkedInAt != null (C3), géolocalisation cohérente (C4), présence temporelle cohérente (C5) — source : OS V10 section 6.3
PresenceProofResolver résout le faisceau d'indices pondérés (TalentCheckIn, GPS, timestamp) et produit PAYOUT_APPROVED ou SYSTEM_HOLD — "jamais silencieux" — source : OS V10 section 7.4
EventCompletionGuard vérifie tous les talents en performed, aucun no-show non résolu avant performed → event_completed — source : OS V10 section 2.7.1
Condition 6 auto-satisfaite par délai si isSelfOrganized = true — source : OS V10 section 6.3 + section 2.2 BLOC 1 V8
Pierre de Rosette C06 : "GPS ✓ · SOTS ✓ · Ledger ✓ · Pas de dispute ✓ · 11/11" — source : OS V10 section 14.9
Ce domaine bloque tout le reste si :
SessionPresence.checkedInAt peut être null et le payout s'exécute quand même — LOI CO-DÉPENDANCE-01 : "Tu n'es pas payé parce que tu as signé. Tu es payé parce que tu étais là" — source : OS V10 section 6.1. C'est le contrat fondamental de l'institution, pas une règle de produit
PresenceProofGuard est un placeholder — sots_window_closed → payable passe sans aucune vérification de présence — source : code transitionEngagement.js ligne 367

2. ÉTAT ACTUEL DOCUMENTÉ
Ce qui existe et fonctionne dans le code soumis :
IDFactory — préfixe SessionPresence: 'SPS' déclaré. Source : code IDFactory.js ligne 35. C'est la seule trace du domaine présence dans le code source. Le type d'objet est prévu ; l'objet n'existe pas.
PresenceWindowGuard et PresenceProofGuard — nommés dans la table, placeholders. Les transitions event_sealed → performed et sots_window_closed → payable + performed → payable existent dans la TRANSITION_TABLE V10.1. Les guards retournent { passed: true, reason: 'placeholder' } — source : code transitionEngagement.js lignes 361, 367.
isSelfOrganized calculé par PlacementGuard et documenté pour la Condition 6. Le champ est calculé, loggué, et retourné pour persistence. Le commentaire interne dit explicitement : "Condition 6 auto-satisfaite par délai (domaine présence)" — source : code PlacementGuard.js lignes 17, 122. C'est le seul pont entre le domaine A et le domaine D.
Ce qui vient de V1 :
V1 opère des events réels sans système de présence documenté — INFÉRENCE. La confirmation de présence en V1 est présumée manuelle (l'organisateur confirme verbalement ou par interface directe). Acquis : connaissance du comportement réel des talents au check-in (latences, oublis, arrivées tardives). Dette de pattern : si V1 n'a pas de SessionPresence, le fondateur et les co-testeurs de l'Event 1 n'ont aucune habitude de check-in numérique. La LOI CO-DÉPENDANCE-01 est une rupture comportementale avec V1.
Ce qui vient de V2 :
Néant.

3. LACUNES IDENTIFIÉES
BLOQUANT :
SessionPresence n'existe pas. Aucun fichier, aucun objet, aucun champ checkedInAt dans le code — source : grep exhaustif retournant zéro occurrence. LOI CO-DÉPENDANCE-01 : "aucun chemin de code ne peut déclencher un payout sans que SessionPresence.checkedInAt != null soit vrai" — source : OS V10 section 6.1. Aujourd'hui, aucun code ne vérifie cette condition. PresenceProofGuard est un placeholder — le payout peut s'exécuter sans aucune trace de présence.


PresenceProofGuard est un placeholder { passed: true }. La transition sots_window_closed → payable — chemin nominal de tout paiement post-SOTS — passe sans vérifier aucune des conditions 3-5 des 11 — source : code transitionEngagement.js ligne 367 + OS V10 section 6.3. Un talent peut être payé sans avoir jamais été présent. C'est la violation directe du contrat fondamental de l'institution.


PresenceProofResolver absent. Aucune implémentation du faisceau d'indices pondérés (TalentCheckIn, GPS, timestamp, QR code) — source : grep exhaustif. L'OS section 7.4 prescrit une résolution par faisceau convergent. Sans lui, même si SessionPresence existait, la résolution de la présence serait impossible.


PresenceWindowGuard est un placeholder { passed: true }. La fenêtre check-in n'est jamais ouverte à event_sealed → performed. maxDistancePolicy et minDurationPolicy ne sont jamais lus — source : grep exhaustif. Les seuils de géolocalisation et de durée minimale n'existent pas dans le code.


EventCompletionGuard est un placeholder { passed: true }. La condition "tous les talents en performed, aucun no-show non résolu" avant performed → event_completed n'est jamais vérifiée — source : OS V10 section 2.7.1. Un event peut être complété même si un talent n'a jamais performé.


Conditions 3-5 des 11 non évaluables mécaniquement. Sans SessionPresence.checkedInAt, sans maxDistancePolicy, sans minDurationPolicy — les conditions 3 ("checkedInAt != null"), 4 ("géolocalisation cohérente"), 5 ("présence temporelle cohérente") ne peuvent jamais être vraies ou fausses — elles sont simplement indéfinies — source : OS V10 section 6.3.


DÉGRADANT :
AudienceCheckIn / TalentCheckIn absents. Deux des signaux forts du PresenceProofResolver n'existent pas comme objets dans le code — source : grep exhaustif + OS V10 section 7.4. Pour l'Event 1 (admin concierge sur place), le fondateur peut suppléer manuellement. Au-delà, il n'y a pas de signal fort de présence.


PresencePrivacyGate absente. La règle d'accès différencié (organisateur voit tous, talent voit uniquement sa présence, public voit l'agrégat) n'est pas implémentée — source : OS V10 section 7.5. Non bloquant pour Event 1 (fondateur seul admin), mais absence de protection des données de présence.


Condition 6 — isSelfOrganized calculé mais non consommé. PlacementGuard calcule isSelfOrganized et le retourne pour persistence. Mais PresenceProofGuard étant un placeholder, la logique d'auto-satisfaction de la Condition 6 par délai n'est jamais appliquée — source : code PlacementGuard.js ligne 122 + OS V10 section 6.3 exception inline. Le field est produit ; son effet n'est pas implémenté.


REPORTABLE :
Données GPS — signal fort conditionnel ("si disponible") — source : OS V10 section 7.4. Pour Event 1, TalentCheckIn + timestamp suffisent si le fondateur est présent.
TicketAdmissionRight — conditionnel à la billetterie — source : OS V10 section 7.4. Non requis pour Event 1 sans billetterie payante.
PresencePrivacyGate complète — reportable tant que fondateur est seul admin — source : OS V10 section 7.5.
AudienceCheckIn pour SOTS — requis pour notation audience, non requis pour payout talent — source : OS V10 section 7.4. Reportable pour Event 1 si audience non notante.
ANGLE MORT POTENTIEL :
→ INFÉRENCE NON DOCUMENTÉE : L'OS V10 section 7.4 documente PresenceProofResolver comme algorithme de résolution. Il ne documente pas explicitement qui déclenche sa création ni à quel moment dans le flux : est-ce PresenceWindowGuard qui crée la SessionPresence à event_sealed → performed ? Est-ce l'application mobile qui pousse un check-in GPS ? Est-ce un scan QR ? Le déclencheur de la création de SessionPresence.checkedInAt n'est pas prescrit dans une seule section. À valider : SessionPresence est-elle créée par une action explicite de l'utilisateur dans l'interface (bouton check-in), par un signal automatique (GPS), ou par les deux en mode faisceau ?

4. DETTE HÉRITÉE
De V1 (dette comportementale) : V1 n'a pas de système de présence numérique documenté. Les co-testeurs de l'Event 1 n'ont aucune habitude de check-in électronique. La LOI CO-DÉPENDANCE-01 est une rupture comportementale : "Tu es payé parce que tu étais là" implique que le talent doit activement prouver sa présence. Ce changement doit être explicitement communiqué aux co-testeurs avant l'Event 1, indépendamment de l'implémentation.
De V1 (acquis terrain) : La connaissance des comportements réels (talent qui arrive 20 minutes en retard, qui oublie de confirmer) est précieuse pour calibrer minDurationPolicy et le délai de grâce no-show. Ces valeurs ne se devinent pas — elles se mesurent sur le terrain.

5. DELTA VERS COMPLÉTUDE
Implémenter SessionPresence comme objet persisté avec checkedInAt, PresenceProofResolver avec le faisceau d'indices (TalentCheckIn + timestamp minimum), PresenceWindowGuard et PresenceProofGuard réels vérifiant les conditions 3-5 des 11 — de sorte qu'aucun chemin de code ne puisse déclencher un payout si SessionPresence.checkedInAt == null.

6. STATUT FINAL
☑ EN COURS — 5% estimé
Composant
État
Spécification OS V10
100% — LOI CO-DÉPENDANCE-01, 11 conditions, PresenceProofResolver, PresencePrivacyGate, rétention GPS
IDFactory préfixe SPS
✅ Déclaré
isSelfOrganized calculé
✅ PlacementGuard — Condition 6 documentée
SessionPresence objet
❌ Absent
checkedInAt
❌ Absent
PresenceProofResolver
❌ Absent
PresenceWindowGuard (réel)
❌ Placeholder
PresenceProofGuard (réel)
❌ Placeholder
EventCompletionGuard (réel)
❌ Placeholder
maxDistancePolicy / minDurationPolicy
❌ Absent
AudienceCheckIn / TalentCheckIn
❌ Absent
Test P0 PRÉSENCE-01
❌ Absent

Le 5% reflète uniquement le préfixe IDFactory déclaré et isSelfOrganized calculé. Sans ces deux éléments, ce serait 0%.

7. DÉPENDANCES SORTANTES
A (Machine d'état) : PresenceProofGuard (sots_window_closed → payable) et EventCompletionGuard (performed → event_completed) sont des composants de ce domaine — source : OS V10 section 2.7.1. Sans D, ces deux transitions de la machine d'état ne peuvent jamais être réelles.
B (Finance) : la Condition 3 des 11 (SessionPresence.checkedInAt != null) est requise par PresenceProofGuard avant d'approuver le payout — source : OS V10 section 6.3. Sans D, LedgerInvariantGuard ne peut jamais vérifier cette condition.
E (SOTS) : AudienceCheckIn validé est le prérequis de notation SOTS pour l'audience — source : OS V10 section 7.4. Sans D, la notation audience est impossible (non bloquant pour Event 1 si audience non notante).
Pierre de Rosette C06 : "GPS ✓ · SOTS ✓ · Ledger ✓ · Pas de dispute ✓ · 11/11" — source : OS V10 section 14.9. Le paiement automatique de la Pierre de Rosette requiert les 11 conditions, dont les conditions 3-5 qui dépendent entièrement de D. Sans D, la Pierre de Rosette ne peut pas être jouée.
LOI CO-DÉPENDANCE-01 : loi invariante — "Jamais silencieux. Jamais automatique sans preuve." — source : OS V10 section 16.0 + section 6.1. Sans D implémenté, cette loi est une phrase dans un document. Elle n'a aucun effet dans le code.

FIN DE LA FICHE — D. Présence et preuve Fiche conservée pour le Prompt de Synthèse.

FICHE D'ÉVALUATION — E. SOTS ET RÉPUTATION
(check-in requis, auto-note bloquée, append-only, EMA)

Date d'évaluation : 17 mai 2026, 07:55 EST
Documents sources :
  - MICRORAVE_V3_OPERATING_SYSTEM_V10.md (source primaire)
  - src/core/transitionEngagement.js (V10.1)
  - src/core/guards/ (MissionConversionGuard, PlacementGuard, EventPaymentGuard)
  - tests/p0/ (TRANSITION-01, PLACEMENT-01, MISSIONCONVERSION-01, POLICYCONFIG-FAILCLOSED-01)
  - docs/FichesEvaluations/FicheEvaluation20260516.md
  - docs/cartes/microrave_v4_05_sots_reputation.drawio (non lu — binaire drawio)

Niveau de confiance : PARTIELLE
  Spécification SOTS : HAUTE (OS V10 sections 5.0–5.6 très détaillées)
  Implémentation SOTS : INFÉRENCE — aucun fichier src/core/sots/* ou
  src/core/reputation/* trouvé dans le zip. Aucun test p0 SOTS-*.js
  trouvé dans tests/p0/. La fiche V1 antérieure confirmait :
  "Implémentation V3 réelle : Début."

1. CRITÈRES DE COMPLÉTUDE
Ce domaine est prêt pour la première transaction quand :
Le check-in AudienceCheckIn + TalentCheckIn est requis comme condition préalable à toute soumission SOTS — OS section 5.3 : "TicketAdmissionRight actif + AudienceCheckIn validé" pour l'audience ; "Engagement actif + présence validée" pour le talent.
L'auto-notation est architecturalement bloquée dans deux cas : (a) auto-note directe (section 5.5 : "Auto-note directe ou indirecte : blocage absolu") ; (b) cas isSelfOrganized : la permission Organisateur → ce talent spécifique est supprimée (section 5.3, BLOC 1 V8).
Le ReputationLedger est append-only — aucune suppression ni modification directe d'une entrée, uniquement des reversals ajoutés en avant (section 5.6 : "Jamais suppression", section 16.0 LOI WORM-APPEND-01).
Le calcul EMA est résolu depuis SOTSCalculationPolicyConfig — si la config est absente → fail-closed, le snapshot n'est pas calculé (section 5.1).
SOTSScoreSnapshot contient la décomposition byRole dès le MVP (section 5.4).
Score par défaut = 3 000 score_units pour tout acteur entrant (section 5.2).
Multiplicateur neutre (1 000 000 ppm) en dessous du seuil de 10 soumissions (section 5.4).
Fenêtre de soumission = 24h après event_completed — une seule soumission SOTS complète par noteur par event (section 5.1 + 5.0 tableau).
Condition 7 des 11 conditions de payout vérifiée : "SOTSSubmission talent soumis — requis, pas optionnel" (section 6.3).
SOTSQualitativeRecord écrit dans le ReputationLedger avec financialEffect: NONE invariant (section 5.1).
Soumissions en quarantaine : inscrites QUARANTINED, jamais supprimées (section 5.5).
Ce domaine bloque tout le reste si :
L'auto-notation n'est pas bloquée architecturalement — section 5.5 : "blocage absolu". Un payout déclenché sur un score auto-infecté invalide l'invariant institutionnel du SOTS.
Le SOTSQualitativeRecord.financialEffect n'est pas forcé à NONE — section 5.1 : "invariant — jamais dans le multiplicateur". Si ce champ alimente la commission, toute la couche réputationnelle est compromise.
La Condition 7 n'est pas vérifiée dans le chemin payable : sans SOTS talent obligatoire, le paiement se fait sans mémoire, violant LOI-ZERO-01 ("puis une mémoire territoriale").
Le ReputationLedger accepte des modifications directes — viole LOI WORM-APPEND-01 (section 16.0), catégorie interdit absolu n°2 de la section 9.4.
SOTSCalculationPolicyConfig absente → fail-closed : le snapshot est bloqué, le score n'est pas calculé, mais aucune valeur par défaut silencieuse n'est acceptable (section 5.1).

2. ÉTAT ACTUEL DOCUMENTÉ
Ce qui existe et fonctionne selon les documents :
La spécification SOTS est exhaustive dans l'OS V10 sections 5.0 à 5.6. Elle couvre : la philosophie donnée-témoin vs donnée-pétrole (BLOC 4 V8, section 5.0), les 7 dimensions configurables en database (section 5.1a), l'architecture ReputationLedger + SOTSScoreSnapshot + SOTSQualitativeRecord (section 5.1), le score par défaut 3 000 (section 5.2), la matrice de notation par relation réelle avec l'exception isSelfOrganized (section 5.3), les seuils de confiance 1/3/5/10 (section 5.4), les garde-fous fraude (section 5.5) et la procédure de contestation (section 5.6).
La connexion SOTS ↔ machine d'état est présente dans transitionEngagement.js : la transition event_completed→sots_window_closed existe dans la table souveraine avec SOTSWindowGuard (V10.1). La transition sots_window_closed→payable existe et est testée dans TRANSITION-01 (25/25 PASSED). Ces deux transitions sont des stubs (console.log + passed: true, reason: 'placeholder'). Source : src/core/transitionEngagement.js, lignes SOTSWindowGuard et PresenceProofGuard.
isSelfOrganized est calculé et retourné par PlacementGuard (src/core/guards/PlacementGuard.js). La règle "auto-notation bloquée" est documentée dans le code avec un log explicite. Elle n'est pas encore enforced architecturalement — le SOTSWindowGuard qui devrait appliquer cette règle est un placeholder.
Ce qui vient de V1 et est encore actif :
V1 tourne sur microrave.ca avec des events réels et des paiements Stripe effectués. INFÉRENCE : V1 n'a pas de SOTS au sens V3 — aucune mention d'un ReputationLedger append-only, de 7 dimensions EMA, ou de SOTSScoreSnapshot dans les documents V1 accessibles. L'acquis V1 est la connaissance terrain des comportements réels des talents et des organisateurs — pas d'infrastructure réputationnelle réutilisable.
Ce qui vient de V2 et a survécu :
V2 abandonnée pour défaut de fondations. Aucun composant SOTS V2 cité comme survivant. Source : FicheEvaluation20260516.md.

3. LACUNES IDENTIFIÉES
BLOQUANT (empêche la première transaction) :
Aucun fichier src/core/sots/ ni src/core/reputation/ trouvé dans le zip. Aucun test p0/SOTS-*.js trouvé dans tests/p0/. L'ensemble du domaine SOTS — SOTSWindowGuard, ReputationLedger, SOTSScoreSnapshot, AudienceCheckIn, TalentCheckIn, SOTSQualitativeRecord, SOTSSubmission — est à implémenter. Source d'identification : inventaire complet du zip + section 15.4 catégorie 4 ("SOTS et réputation : check-in requis, auto-note bloquée, append-only") comme catégorie P0 de tests.
La Condition 7 des 11 conditions de payout ("SOTSSubmission talent soumis — requis, pas optionnel" — section 6.3) ne peut pas être vérifiée si le système SOTS n'existe pas. Le PresenceProofGuard est un placeholder. Sans Condition 7, sots_window_closed→payable passe dans le vide. Source : transitionEngagement.js — case 'PresenceProofGuard' : return { passed: true, reason: 'placeholder' }.
SOTSCalculationPolicyConfig absente → fail-closed sur le calcul EMA (section 5.1). Cette config est une config critique (section 9.6 : "Opérationnel : SOTSCalculationPolicyConfig"). Elle n'est pas dans la liste des configs testées par POLICYCONFIG-FAILCLOSED-01 (qui teste payment_fees_tax_treatment, tps_ppm, tvq_ppm, event_payment_cap_cents). Source : tests/p0/POLICYCONFIG-FAILCLOSED-01.js + src/core/policy-config-resolver.js.
DÉGRADANT (réduit la qualité, n'empêche pas) :
La carte microrave_v4_05_sots_reputation.drawio est dans le zip mais n'a pas pu être lue (format binaire). Le risque d'un désalignement entre la carte et l'OS V10 (qui intègre BLOC 4 V8, exception isSelfOrganized en section 5.3, décomposition byRole validée) existe. Source : inventaire du zip.
La pondération des notes Talent → Checkpoint par roleMetier actif (section 5.3 : SOTSDimensionConfig.noteurRoleWeight) est une config database requise. Non testée explicitement dans les tests P0 existants.
REPORTABLE (peut attendre l'événement 2+) :
SC-16 SOTS contesté — quarantaine → review → DecisionRecord → reversal (section 3.7) : conditionnel selon section 15.3. Non requis pour Event 1 nominal.
Décomposition byRole avec score null pour roleMetier sans Engagement noté (section 5.4, SOTSScoreSnapshot structure complète) : requis dès le MVP mais peut démarrer à 0 engagements et null sans bloquer le premier event.
Traitement sémantique de SOTSQualitativeRecord "quand le volume est suffisant" (section 5.1) : "archivé append-only — traitement sémantique différé". Reportable par définition dans l'OS lui-même.
ANGLE MORT POTENTIEL :
→ INFÉRENCE NON DOCUMENTÉE : L'OS définit la fenêtre SOTS comme "24h après event_completed" (section 5.0 + 5.1). Mais il ne documente pas explicitement le mécanisme qui ferme la fenêtre si aucune note n'est soumise. Le SOTSWindowGuard est supposé déclencher event_completed→sots_window_closed via le Scheduler après 24h (scheduler_dispatcher_p0, job sots_window_close — section 8.2). Mais la connexion Scheduler → SOTSWindowGuard n'est pas documentée dans la section 8.2 au niveau du code. Si un talent ne soumet pas de SOTS (Condition 7 requise), est-il bloqué indéfiniment ou la fenêtre se ferme-t-elle malgré tout ? À valider : la Condition 7 est-elle bloquante ou déclenchante d'un admin review sans blocage du payout ?
→ INFÉRENCE NON DOCUMENTÉE : La section 5.3 dit que l'audience peut noter si "TicketAdmissionRight actif + AudienceCheckIn validé". Pour un Event 1 type "4 à 7 Premium" sans billetterie publique (section 12.2), l'audience est présente mais il n'est pas clair si un TicketAdmissionRight à 0$ (SC-11 — "Billet 0$, droit SOTS, aucune fausse recette") doit être créé pour débloquer la notation audience. Si oui : la billetterie mince doit être active même pour Event 1. À valider par le fondateur.

4. DETTE HÉRITÉE
De V1 : Aucune infrastructure réputationnelle SOTS réutilisable. Acquis indirect : la connaissance des comportements terrain (talents qui ne répondent pas, organisateurs qui changent d'avis) est une donnée de calibrage des 7 dimensions et des seuils — pas du code.
De V2 : Abandonnée. Aucun composant SOTS survivant.
De l'OS lui-même : La philosophie donnée-témoin (BLOC 4 V8, LOI SOTS-TEMOIN-01) crée une contrainte d'architecture forte — les 7 dimensions et les poids ne peuvent jamais être hardcodés. Tout vit en database (SOTSDimensionConfig, SOTSCalculationPolicyConfig, SOTSCommissionModulationConfig, SOTSConfidencePolicyConfig). Cette contrainte est une dette de configuration : avant le premier event, quatre tables de config SOTS doivent exister en database avec des valeurs seed. Aucune d'elles n'est actuellement testée dans les P0 existants.

5. DELTA VERS COMPLÉTUDE
Implémenter de zéro l'ensemble du domaine SOTS : TalentCheckIn/AudienceCheckIn, ReputationLedger append-only, SOTSScoreSnapshot avec EMA, SOTSQualitativeRecord, SOTSWindowGuard et PresenceProofGuard réels (actuellement stubs), Condition 7 enforcée dans le chemin payable, quatre tables de config SOTS en database, et un test P0 SOTS-CHECKIN-01 couvrant la catégorie 4 de la section 15.4.

6. STATUT FINAL
☑ EN COURS → 15% estimé
La spécification est complète et cohérente (OS V10). Les connexions dans la machine d'état existent (transitions event_completed→sots_window_closed et sots_window_closed→payable dans la table souveraine, tests passing). Mais le corps du domaine — ReputationLedger, SOTSScoreSnapshot, guards réels, check-in, auto-note bloquée architecturalement, Condition 7 enforcée — est intégralement à implémenter. Aucun fichier src/sots ni test P0 SOTS trouvé.

7. DÉPENDANCES SORTANTES
Domaine paiement (Partie III + VI) ne peut pas atteindre payable de façon conforme tant que la Condition 7 (SOTSSubmission talent requis — section 6.3) n'est pas enforcée. Sans SOTS, le payout automatique viole les 11 conditions. Source : OS section 6.3 + section 14.5 Seuil 1 ("100% tests P0 du chemin exercé = PASS").
Domaine présence (SessionPresence / PresenceProofResolver) est co-dépendant : la présence prouvée (check-in) est à la fois une condition du paiement (Condition 3-5) ET la condition d'accès à la notation SOTS (section 5.3 : "Tu ne peux pas noter une expérience que le système ne t'a pas vu vivre"). Si check-in n'existe pas → ni payout automatique ni SOTS. Source : OS sections 5.3, 6.3, 7.4.
Domaine tests P0 (catégorie 4 section 15.4) est directement bloqué : aucun test SOTS existe, aucun BugReplayRecord SOTS ne peut atteindre PASSED, ce qui bloque formellement le GoNoGoDecisionRecord = GO selon la section 14.5.
Domaine archivage (transition settled→archived) dépend de "SOTS window closed" comme condition dans ArchiveWORMGuard (section 2.7.1 table : "SOTS window closed · tous les LedgerRecords finaux · GoNoGoDecisionRecord = GO"). Source : OS section 2.7.1.

FIN DE LA FICHE — E. SOTS ET RÉPUTATION Conservée pour le Prompt de Synthèse.

J'ai maintenant tous les éléments nécessaires. Je produis la fiche.

FICHE D'ÉVALUATION — F. SCHEDULER
(heartbeat, tâches P0, anti-double, vélocité cron)

Date d'évaluation : 17 mai 2026, 08:30 EST
Documents sources :
  - MICRORAVE_V3_OPERATING_SYSTEM_V10.md sections 8.1–8.5 (source primaire)
  - src/core/transitionEngagement.js (V10.1)
  - src/core/policy-config-resolver.js
  - config/policy-config-schema.js
  - stripe-webhook-proxy/index.js
  - tests/p0/ (inventaire complet — aucun test SCHEDULER-* trouvé)
  - docs/FichesEvaluations/FicheEvaluation20260516.md

Niveau de confiance : PARTIELLE
  Spécification Scheduler : HAUTE (OS V10 section 8 complète)
  Implémentation Scheduler : INFÉRENCE — aucun fichier src/scheduler/* 
  ni tests/p0/SCHEDULER-*.js trouvé dans le zip.


1. CRITÈRES DE COMPLÉTUDE
Ce domaine est prêt pour la première transaction quand :
Trois dispatchers sont opérationnels selon leur fréquence respective — OS section 8.2 : scheduler_dispatcher_p0 (15 min), scheduler_dispatcher_p1 (1h), scheduler_dispatcher_daily (1/jour).
Les 11 jobs P0 sont implémentés et exécutables par le dispatcher P0 — OS section 8.2 : capture_deposit, deposit_deadline_check, balance_deadline_check, seal_event, sots_window_close, payout_approver, execute_payout_transfer, chargeback_hold, expire_dispute_window, transfer_expiry_check, ledger_balance_check.
La SchedulerDueTask est créée immédiatement dès qu'une échéance est connue — OS section 8.1 : "Quand Micro Rave connaît une échéance, elle crée le réveil immédiatement."
L'anti-double exécution via lockedByRunId est actif — OS section 8.1 : "Anti-double exécution : lockedByRunId. Tout verrou déclenché = PayoutBlockReason créé avec code explicite."
Les 6 verrous anti-double payout sont tous enforced — OS section 8.3 : lockedByRunId, status check, PayoutExecutionRecord, Stripe idempotency key, SettlementInstruction.consumedAt, LOI LEDGER-02.
La surveillance opérationnelle couvre les deux dimensions — OS section 8.5 : HEARTBEAT_MISSING (dispatcher ne se réveille pas) et DUE_TASK_OVERDUE (tâche P0 non traitée même si dispatcher tourne).
Le CronBudgetPolicyConfig est configuré en database et le budget est suivi — OS section 8.4 : états healthy / watch / critical_only / exhausted avec seuils.
Les 10 alertes P0 d'observabilité sont actives avant Event 0B — OS section 11.7 : alerte n°4 (Heartbeat manquant), n°5 (SchedulerDueTask P0 expirée sans traitement), n°9 (Consommation cron anormalement rapide).
Aucune tâche P0 ne reste en blocage silencieux — OS section 8.1 : "Jamais de blocage silencieux."
Ce domaine bloque tout le reste si :
Le job seal_event n'existe pas ou échoue silencieusement — sans lui, balance_pending→event_sealed ne peut pas être déclenché par le Scheduler, et l'argent reste dans un état intermédiaire sans paiement talent possible.
Le job payout_approver + execute_payout_transfer sont absents — sans eux, le payout automatique après les 11 conditions ne peut pas se déclencher. Le règlement talent devient impossible sans intervention manuelle, ce qui invalide l'objectif de la première transaction — OS section 14.5 Seuil 1 : "payout sans intervention manuelle."
Le job sots_window_close est absent — la transition event_completed→sots_window_closed ne peut pas se fermer après 24h, bloquant le chemin vers payable — OS section 8.2 + table 2.7.1.
Un double payout se produit faute de lockedByRunId ou d'idempotency Stripe — OS section 8.3 : "6 verrous anti-double payout." Une seule exécution double est un incident P0 financier irréversible.
DUE_TASK_OVERDUE n'est pas monitored — OS section 8.5 : sans cette surveillance, une tâche P0 peut expirer sans alerte, ce qui revient à un blocage silencieux interdit.

2. ÉTAT ACTUEL DOCUMENTÉ
Ce qui existe et fonctionne selon les documents :
La spécification du Scheduler est complète dans l'OS V10 sections 8.1 à 8.5. Elle couvre : la doctrine "cron réveille / tâche dit quoi faire" (8.1), les trois dispatchers avec fréquences (8.2), la liste des 11 jobs P0 (8.2), les 6 verrous anti-double payout (8.3), le budget cron par paliers (8.4), et les deux dimensions de surveillance (8.5).
Les transitions dépendantes du Scheduler sont présentes dans transitionEngagement.js V10.1 : balance_pending→event_sealed (SealingGuard — W2), event_completed→sots_window_closed (SOTSWindowGuard), sots_window_closed→payable (PresenceProofGuard). Ces transitions sont dans la table souveraine, testées dans TRANSITION-01 (25/25 PASSED). Leurs guards sont des stubs (placeholder). Source : src/core/transitionEngagement.js.
Le PolicyConfigRepository et getConfig() sont implémentés avec fail-closed — mécanisme dont dépend CronBudgetPolicyConfig pour les seuils de budget cron. Source : src/core/policy-config-resolver.js.
Le proxy Stripe webhook est présent dans stripe-webhook-proxy/index.js avec idempotency en mémoire (processedEvents Set) et validation de signature raw body. Le test WEBHOOK-RAWBODY-01 est présent dans tests/p0/. Ce proxy est une précondition au job chargeback_hold et à tous les jobs déclenchés par événement Stripe. Source : stripe-webhook-proxy/index.js + OS section 11.3.
Ce qui vient de V1 et est encore actif :
INFÉRENCE : V1 sur microrave.ca gère des paiements réels. Il existe probablement une forme de déclenchement temporel (cron Base44 ou tâches planifiées) pour gérer les deadlines de paiement. Mais l'architecture SchedulerDueTask avec dispatchers P0/P1/daily, lockedByRunId, et PayoutBlockReason explicite est spécifique à V3 et n'est pas citée comme existant dans V1. Aucun document ne confirme la réutilisabilité.
Ce qui vient de V2 et a survécu :
V2 abandonnée. Aucun composant Scheduler V2 cité comme survivant. Source : FicheEvaluation20260516.md.

3. LACUNES IDENTIFIÉES
BLOQUANT (empêche la première transaction) :
Aucun fichier src/scheduler/ trouvé dans le zip. La SchedulerDueTask, les trois dispatchers, et les 11 jobs P0 n'existent pas en tant que code V3. Source d'identification : inventaire complet du répertoire src/ — seuls core/, adapters/, et repositories/ existent.


Aucun test tests/p0/SCHEDULER-*.js trouvé. La catégorie 6 de la section 15.4 ("Scheduler : heartbeat, overdue, anti-double, vélocité cron") est listée comme catégorie P0. Sans ces tests, aucun BugReplayRecord Scheduler ne peut atteindre PASSED, ce qui bloque formellement le GoNoGoDecisionRecord = GO — OS section 14.5 : "100% tests P0 du chemin exercé = PASS."


Les guards SealingGuard, SOTSWindowGuard, et PresenceProofGuard sont des stubs. Ce sont précisément les transitions que le Scheduler doit déclencher (via seal_event, sots_window_close, payout_approver). Le Scheduler ne peut pas être testé en isolation si les guards en aval ne répondent pas correctement. Source : src/core/transitionEngagement.js — cases SealingGuard, SOTSWindowGuard, PresenceProofGuard retournent { passed: true, reason: 'placeholder' }.


CronBudgetPolicyConfig n'est pas dans CRITICAL_CONFIG_KEYS du schema actuel — OS section 9.6 classe cette config comme "Élevé : CronBudgetPolicyConfig." Sans elle, les paliers healthy/watch/critical_only/exhausted ne sont pas appliqués, et le signal MigrationTriggerPolicyConfig à 9 900 crédits pendant 3 mois ne peut pas se déclencher — OS section 8.4. Source d'identification : config/policy-config-schema.js — CronBudgetPolicyConfig absent de POLICY_CONFIGS_FONDAMENTALES.


DÉGRADANT (réduit la qualité, n'empêche pas) :
L'idempotency du webhook proxy est en mémoire (processedEvents = new Set()) — un redémarrage du proxy efface tous les event IDs déjà traités. L'OS section 7.7 règle 7 exige : "Idempotency obligatoire — WebhookProcessedLog." Un Set en mémoire n'est pas un WebhookProcessedLog persisté. En production, un redémarrage après un paiement reçu mais avant traitement peut déclencher un double-traitement. Source : stripe-webhook-proxy/index.js ligne const processedEvents = new Set().


PROXY_BASE44_ENDPOINT est une variable d'environnement non vérifiée au démarrage du proxy — le code lance throw new Error('PROXY_BASE44_ENDPOINT non configuré') seulement au moment d'un forward. Aucune validation au démarrage. Source : stripe-webhook-proxy/index.js + OS section 8.1 : "Jamais de blocage silencieux."


REPORTABLE (peut attendre l'événement 2+) :
scheduler_dispatcher_p1 et scheduler_dispatcher_daily — les jobs P1 (relances, attributions, SaaS) et daily (audits, réconciliations) ne sont pas requis pour le chemin nominal de l'Event 1. Source : OS section 8.2 — seul P0 à 15 min est critique pour le premier event.
MigrationTriggerPolicyConfig et le signal de migration — le seuil des 9 900 crédits cron pendant 3 mois consécutifs ne peut pas se déclencher en un seul event. Source : OS section 8.4.
transfer_expiry_check — job P0 lié au domaine transfert de talent (SC-15 conditionnel). Source : OS section 3.7 — "Conditionnel."
ANGLE MORT POTENTIEL :
→ INFÉRENCE NON DOCUMENTÉE : L'OS section 8.1 dit "Quand Micro Rave connaît une échéance, elle crée le réveil immédiatement." Mais il ne documente pas qui crée la SchedulerDueTask : est-ce la transition transitionEngagement() elle-même qui, après balance_pending→event_sealed, crée la tâche sots_window_close pour dans 24h ? Ou est-ce le dispatcher qui scanne les Engagements en état event_completed pour créer la tâche ? Si c'est transitionEngagement(), alors le Guard 5 (AuditLogger) devrait aussi écrire dans SchedulerDueTasks — ce qui n'est pas documenté dans la section 2.7.1. À valider par le fondateur : qui est responsable de la création des SchedulerDueTasks ?
→ INFÉRENCE NON DOCUMENTÉE : L'OS section 11.7 liste 10 alertes P0 avec "Heartbeat manquant" (n°4) et "SchedulerDueTask P0 expirée sans traitement" (n°5). Mais "infrastructure obligatoire avant Event 0B" (section 11.7) inclut "monitoring heartbeat externe." La solution de monitoring externe (Sentry, UptimeRobot, Datadog, ou équivalent) n'est pas spécifiée. C'est une décision d'infrastructure non prise dans les documents disponibles. Si elle est absente à Event 0B, la condition "infrastructure obligatoire" n'est pas remplie — OS section 15.5 grille de readiness.

4. DETTE HÉRITÉE
De V1 : INFÉRENCE — Si V1 utilise des tâches planifiées Base44 (crons natifs), leur logique est couplée à Base44 et non portable. L'OS section 11.1 liste explicitement "SchedulerDueTask" comme couche portable — ce qui implique que la version V1 n'est pas réutilisable telle quelle. Aucun acquis direct transférable.
De Base44 : La doctrine section 11.1 dit "Peut rester couplé Base44 au MVP : UI / pages / formulaires / routing / auth technique MVP / queries simples non critiques." Le Scheduler ne figure pas dans cette liste — il est dans les "couches portables." Construire le Scheduler directement sur des crons Base44 sans abstraction SchedulerDueTask portable créerait une dette architecturale que l'OS interdit explicitement.
De l'OS lui-même : La contrainte CronBudgetPolicyConfig avec paliers et signal de migration (section 8.4) est une dette de conception anticipée — elle existe pour préparer la sortie de Base44 avant d'en avoir besoin. C'est une contrainte proactive, pas une dette négative.

5. DELTA VERS COMPLÉTUDE
Implémenter de zéro l'ensemble du Scheduler V3 : la SchedulerDueTask comme unité métier centrale, le dispatcher P0 (15 min) avec ses 11 jobs, les 6 verrous anti-double payout, l'observabilité heartbeat + overdue, l'idempotency persistée du webhook proxy (WebhookProcessedLog), et un test P0 SCHEDULER-HEARTBEAT-01 couvrant la catégorie 6 de la section 15.4 — avec en particulier la vérification que payout_approver + execute_payout_transfer produisent un payout sans intervention manuelle et avec ledger zéro cent.

6. STATUT FINAL
☑ EN COURS → 10% estimé
La spécification est complète et précise (OS V10 section 8). Les transitions que le Scheduler doit déclencher sont dans la table souveraine et testées (TRANSITION-01 : 25/25 PASSED). Le proxy Stripe est présent avec sa logique d'idempotency partielle. Mais tout le corps du domaine — SchedulerDueTask, dispatchers, 11 jobs P0, anti-double payout, heartbeat monitoring, WebhookProcessedLog persisté — est à implémenter. Aucun fichier src/scheduler/ ni test P0 Scheduler trouvé.

7. DÉPENDANCES SORTANTES
Domaine paiement / ledger ne peut pas atteindre event_sealed sans le job seal_event, ni déclencher le payout talent sans payout_approver + execute_payout_transfer. La première transaction "sans intervention manuelle" est architecturalement impossible sans le Scheduler P0. Source : OS section 14.5 Seuil 1 + section 8.2 jobs P0.


Domaine SOTS dépend du job sots_window_close pour fermer la fenêtre 24h et déclencher event_completed→sots_window_closed. Sans ce job, le chemin vers payable reste ouvert indéfiniment ou bloqué. Source : OS section 8.2 + transition table 2.7.1.


Domaine Stripe / webhooks : le job chargeback_hold dépend du webhook proxy fonctionnel avec idempotency persistée. Un chargeback reçu deux fois sans WebhookProcessedLog peut créer un double HOLD. Source : OS section 8.2 + section 7.7 règle 7.


Domaine observabilité (Event 0B) : les 10 alertes P0 de la section 11.7 incluent trois alertes directement Scheduler (n°4 Heartbeat, n°5 SchedulerDueTask P0 expirée, n°9 vélocité cron anormale). Sans monitoring externe, Event 0B est bloqué par la grille de readiness section 15.5. Source : OS sections 11.7 + 15.5.


Domaine annulations automatiques : le job balance_deadline_check déclenche balance_pending→cancelled_J7 si le solde n'est pas reçu à J-6 (LOI ANNULATION-02, section 16.1). Sans ce job, l'annulation automatique devient manuelle — violant l'invariant SC-06 P0 global (section 3.7).



FIN DE LA FICHE — F. SCHEDULER Conservée pour le Prompt de Synthèse.
J'ai tout ce qu'il faut. Je produis la fiche.

FICHE D'ÉVALUATION — G. ADMIN ET SÉCURITÉ
(19 interdits, DataAccessLedger, double validation, PolicyConfig)

Date d'évaluation : 17 mai 2026, 09:05 EST
Documents sources :
  - MICRORAVE_V3_OPERATING_SYSTEM_V10.md sections 7, 9, 4.5, 11.5 (source primaire)
  - src/core/policy-config-resolver.js
  - src/repositories/PolicyConfigRepository.js
  - src/adapters/base44/PolicyConfigAdapter.js
  - config/policy-config-schema.js
  - tests/p0/POLICYCONFIG-FAILCLOSED-01.js (résultat : 4 PASSED / 1 FAILED)
  - src/core/transitionEngagement.js (Guard 5 AuditLogger)
  - docs/FichesEvaluations/FicheEvaluation20260516.md

Niveau de confiance : PARTIELLE
  Spécification Admin/Sécurité : HAUTE (OS V10 sections 7 + 9 très complètes)
  PolicyConfig infrastructure : HAUTE (code existant, test partiel)
  DataAccessLedger, AdminAuthorityResolver, 19 interdits : INFÉRENCE
  — aucun fichier src/admin/* ni src/security/* trouvé dans le zip.


1. CRITÈRES DE COMPLÉTUDE
Ce domaine est prêt pour la première transaction quand :
validateCriticalConfigs() passe intégralement — toutes les configs de catégorie CRITIQUE présentes en database avant démarrage — OS section 9.5 : "Modification directe en database de production = interdit absolu" + section 4.5 : "Configuration absente → erreur bloquante. Jamais de valeur par défaut silencieuse."
Tout accès à une donnée de niveau 3+ produit un DataAccessLedgerEntry immuable — OS section 7.2 : "Tout accès niveau 3+ → DataAccessLedgerEntry obligatoire. Immuable." L'alerte P0 n°10 de la section 11.7 : "Échec d'écriture DataAccessLedger sur action sensible."
Les 19 interdits absolus de la section 9.4 sont architecturalement impossibles — aucun chemin de code, script admin, migration ou console de debug ne peut les contourner. Source : OS section 9.4 BLOC 13 V8.
AdminAuthorityResolver est opérationnel pour les 10 rôles canoniques — OS section 9.2 : FOUNDER, FINANCE_ADMIN, OPS_ADMIN, SUPPORT_ADMIN, DISPUTE_ADMIN, DEV_ADMIN, PRIVACY_SECURITY_ADMIN, POLICY_ADMIN, CELL_MANAGER, AUDITOR_EXTERNAL.
Toute modification de PolicyConfig produit : AdminAction + DataAccessLedgerEntry + PolicyConfigChangeRecord — OS section 9.5 : "règle universelle."
Les configs critiques (TaxConfig, LedgerCodeMap, MembershipPlan, SOTSCommissionModulationConfig, DataRetentionPolicyConfig, MigrationTriggerPolicyConfig, SecretsRotationPolicyConfig, DualApprovalThresholdConfig) requièrent double validation — OS section 9.6.
SoloFounderOverride est documenté, délai configurable (recommandé 60s), confirmation explicite obligatoire, AdminIncidentRecord type SOLO_FOUNDER_OVERRIDE produit — OS section 9.3.
Aucun secret Stripe dans le code source, les logs, la Base44 UI, ou le debug — OS section 7.7, règles 1 à 10.
PolicyConfigAdapter est connecté à Base44 (pas un stub retournant null) — source : src/adapters/base44/PolicyConfigAdapter.js état actuel.
Ce domaine bloque tout le reste si :
PolicyConfigAdapter.findByKey() retourne null pour toute clé — tout appel à getConfig() lève POLICY_CONFIG_MISSING, bloquant EventPaymentGuard, le waterfall financier, et tout calcul de taux. État actuel confirmé : test POLICYCONFIG-FAILCLOSED-01 : 4 PASSED / 1 FAILED — source : exécution du test.
Le DataAccessLedger ne s'écrit pas sur une action sensible — la LOI TRANSITION-01 dit que l'AuditLogger (Guard 5) doit écrire "toujours, sans exception" — OS section 2.7.1. L'alerte P0 n°10 (section 11.7) en fait un déclencheur de blocage opérationnel.
Un des 19 interdits est contournable depuis un chemin de code existant — OS section 9.4 : "architecturalement impossibles — même pour le fondateur." En particulier l'interdit n°17 : "Contourner le MoneyMovementRouter" et n°19 : "Contourner les 6 verrous anti-double payout."
payment_fees_tax_treatment est absent de la database — OS section 3.9 : "Règle fail-closed : si TaxConfig.paymentFeesTaxTreatment est absent → blocage. Jamais de valeur par défaut silencieuse." + section 3.10 : "Si TaxLiabilityAllocation est absente, ambiguë ou non supportée → event_sealed bloqué."

2. ÉTAT ACTUEL DOCUMENTÉ
Ce qui existe et fonctionne selon les documents :
L'infrastructure PolicyConfig est partiellement implémentée et testée. getConfig() avec fail-closed est opérationnel : si la clé est absente en database, l'erreur POLICY_CONFIG_MISSING est levée immédiatement — comportement confirmé par POLICYCONFIG-FAILCLOSED-01 tests 1 et 2 (PASSED). Source : src/core/policy-config-resolver.js.
Le schéma des 12 configs fondamentales est défini et testé — POLICYCONFIG-FAILCLOSED-01 test 3 (PASSED) : stripe_ppm, stripe_fixe_cents, payment_fees_tax_treatment, free_weight_cents, event_payment_cap_cents, deposit_ratio_ppm, tps_ppm, tvq_ppm, ledger_4310, ledger_4325, ledger_4326, ledger_4530. payment_fees_tax_treatment est catégorie CRITIQUE, valeur seed DEBOURS — test 4 (PASSED). Source : config/policy-config-schema.js.
L'interface PolicyConfigRepository est portable (pattern adapter) — si Micro Rave migre vers PostgreSQL, seul l'adapter change. Source : src/repositories/PolicyConfigRepository.js + section 11.2.
L'AuditLogger (Guard 5) est câblé dans transitionEngagement() — il produit un console.log avec engagementId, transition, actor, timestamp, guardApplied, wormLevel pour chaque transition. C'est un stub qui remplace le vrai repositories.audit?.writeToDataAccessLedger() — commenté avec "DETTE CRITIQUE" dans le code. Source : src/core/transitionEngagement.js Guard 5.
La séparation environnements est documentée dans l'OS section 11.5 et dans .env.example (présent dans le zip) : dev + staging → Stripe test keys uniquement / prod → Stripe live keys (accès minimal). Source : OS section 11.5 + .env.example.
Ce qui vient de V1 et est encore actif :
INFÉRENCE : V1 a des paiements réels via Stripe Connect sur microrave.ca. Il existe donc au moins une configuration de secrets Stripe en production. La gestion de ces secrets selon les 10 règles de la section 7.7 (rotation planifiée, restricted keys, aucun secret dans les logs) est inconnue pour V1 — aucun document ne confirme leur conformité aux règles V3. Dette potentielle : secrets V1 à auditer avant de réutiliser en V3.
Ce qui vient de V2 et a survécu :
V2 abandonnée pour "défaut de fondations" — la dette V2 était précisément un SystemConfig en JSON blob (anti-pattern). La refondation V3 avec policy_config en database et getConfig() fail-closed est la correction directe de cette dette V2. Acquis indirect : la leçon architecturale de V2 est gravée dans le design V3. Source : FicheEvaluation20260516.md.

3. LACUNES IDENTIFIÉES
BLOQUANT (empêche la première transaction) :
PolicyConfigAdapter.findByKey() retourne null pour toutes les clés — l'adapter Base44 n'est pas connecté. validateCriticalConfigs() échoue sur les 4 configs CRITIQUE. Résultat direct : getConfig('tps_ppm') lève POLICY_CONFIG_MISSING → event_sealed bloqué → aucune transaction possible. Source d'identification : exécution POLICYCONFIG-FAILCLOSED-01 : 1 FAILED, message "adapter Base44 non connecté. Retourne null."


Le DataAccessLedger est un console.log dans transitionEngagement.js — le Guard 5 ne persiste rien. L'OS section 2.7.1 dit "AuditLogger — toujours, sans exception, append au DataAccessLedger." L'alerte P0 n°10 (section 11.7) : "Échec d'écriture DataAccessLedger sur action sensible" — sans écriture réelle, cette alerte ne peut pas être testée. L'interdit absolu n°9 (section 9.4) : "Supprimer un DataAccessLedgerEntry" — un ledger qui n'existe pas ne peut pas être protégé. Source d'identification : src/core/transitionEngagement.js commentaire "DETTE CRITIQUE : sans DataAccessLedger, LOI TRANSITION-01 ne peut pas détecter les mutations directes dans Base44 UI."


Aucun src/admin/ ni src/security/ trouvé. AdminAuthorityResolver est cité dans la section 11.1 comme couche portable obligatoire — il n'existe pas. Sans AdminAuthorityResolver, aucune vérification d'autorisation réelle ne peut être effectuée lors d'une dispute, d'un override, ou d'un accès à données sensibles. Source d'identification : inventaire complet du répertoire src/.


Aucun test tests/p0/ADMIN-*.js ni tests/p0/SECURITY-*.js trouvé. La catégorie 5 de la section 15.4 ("Admin, sécurité et PolicyConfig : 19 interdits, DataAccessLedger, double validation") est P0. Sans ces tests, aucun BugReplayRecord Admin ne peut atteindre PASSED, bloquant le GoNoGoDecisionRecord = GO — OS section 14.5 Seuil 1.


DÉGRADANT (réduit la qualité, n'empêche pas) :
CronBudgetPolicyConfig, SOTSCalculationPolicyConfig, SOTSCommissionModulationConfig, SOTSConfidencePolicyConfig sont absentes du schéma POLICY_CONFIGS_FONDAMENTALES. Ces configs sont requises pour le Scheduler (section 8.4) et le SOTS (section 5.0–5.4). Leur absence de la liste CRITICAL_CONFIG_KEYS signifie que validateCriticalConfigs() ne les validera pas au démarrage. Source d'identification : config/policy-config-schema.js — aucune de ces clés dans le tableau.


PolicyConfigChangeRecord n'est pas implémenté. La section 9.5 dit : "Toute modification de toute PolicyConfig produit : AdminAction + DataAccessLedgerEntry + PolicyConfigChangeRecord." L'upsert() dans PolicyConfigAdapter.js est un stub qui retourne null. Source d'identification : src/adapters/base44/PolicyConfigAdapter.js — async function upsert(data) { console.warn(...); return null; }.


La double validation des configs critiques (section 9.6) n'a pas de mécanisme implémenté. DualApprovalThresholdConfig est listée parmi les configs critiques mais n'est pas dans le schéma fondamental. INFÉRENCE : au MVP, le SoloFounderOverride remplace temporairement la double validation — OS section 9.3. Mais sans AdminIncidentRecord réel, même l'override ne laisse pas de trace.


REPORTABLE (peut attendre l'événement 2+) :
CELL_MANAGER (section 9.2) — "Post-MVP. Territoire uniquement." Non requis pour Event 1.
AUDITOR_EXTERNAL — lecture seule sur périmètre DataAccessAuditRoleConfig. Non requis avant ouverture élargie.
ConflictOfInterestRecord et procédure formelle de déclaration (section 9.7) — requis si dispute, non requis pour le chemin nominal de l'Event 1.
PortfolioTransfer et PortfolioValuation — hors scope indéfini (section 13.3).
ANGLE MORT POTENTIEL :
→ INFÉRENCE NON DOCUMENTÉE : L'OS section 9.4 liste les 19 interdits comme "architecturalement impossibles." Mais l'architecture actuelle dans Base44 repose sur l'UI Base44 pour la plupart des mutations de données. L'interdit n°3 ("Modifier les données d'un ContractSnapshot WORM") et n°6 ("Modifier un Engagement archivé") sont des interdits de logique métier — ils n'existent que si le code applicatif les enforce. Depuis la console d'admin Base44, un administrateur technique pourrait théoriquement éditer directement une ligne de table. L'OS dit que ce cas déclenche un AdminIncidentRecord P0 — mais si le DataAccessLedger ne s'écrit pas (lacune bloquante ci-dessus), l'incident n'est pas tracé. La question non résolue : Base44 fournit-il un mécanisme de protection des lignes de table contre l'édition directe depuis l'UI ? À valider par le fondateur avant Event 0B.
→ INFÉRENCE NON DOCUMENTÉE : L'OS section 7.3 dit que les événements SECRET ne sont pas visibles par défaut aux admins centraux — accès uniquement pour support client, fraude, fiscalité, etc. Ce niveau de contrôle d'accès par attribut d'event requiert que AdminAuthorityResolver connaisse non seulement le rôle de l'acteur mais aussi les attributs de l'objet cible. L'OS ne documente pas si Base44 supporte des ACL au niveau de la ligne de table, ou si c'est le code applicatif qui doit l'enforcer. À valider.

4. DETTE HÉRITÉE
De V2 : La dette directe de V2 était le SystemConfig en JSON blob — un objet de configuration unique non typé, sans catégorie, sans fail-closed. V3 a tiré la leçon : POLICY_CONFIGS_FONDAMENTALES avec types, catégories, descriptions, et CRITICAL_CONFIG_KEYS auto-dérivées. C'est une accélération — la leçon V2 est intégrée dans l'architecture V3. Source : FicheEvaluation20260516.md + config/policy-config-schema.js.
De V1 : Les secrets Stripe V1 (live keys sur microrave.ca) constituent une dette de gouvernance non évaluable depuis les documents disponibles. Si ces keys ne sont pas des "restricted keys Stripe par usage" (règle 8, section 7.7) et si elles n'ont pas de SecretsRotationPolicyConfig, elles sont non conformes aux règles V3 dès leur première utilisation en V3. Aucun acquis positif transférable sur ce point.
De Base44 : Le couplage entre l'UI Base44 et les données métier crée une surface d'attaque pour les interdits 3, 6, 10, 15 de la section 9.4 (modifier ContractSnapshot, Engagement archivé, BugReplayRecord, systemId). L'OS section 11.1 dit que la couche Admin Authority est portable — mais tant que Base44 est l'interface principale, les protections sont au niveau applicatif, pas au niveau base de données.

5. DELTA VERS COMPLÉTUDE
Connecter PolicyConfigAdapter à Base44 et insérer les 12 configs fondamentales en database (bloquant immédiat) ; implémenter DataAccessLedger avec persistance réelle pour le Guard 5 ; implémenter AdminAuthorityResolver portable pour les 10 rôles ; et produire un test P0 ADMIN-POLICY-01 couvrant la catégorie 5 de la section 15.4 — les 19 interdits, le DataAccessLedger, et la double validation des configs critiques.

6. STATUT FINAL
☑ EN COURS → 20% estimé
L'infrastructure PolicyConfig existe avec la bonne architecture (fail-closed, adapter portable, schéma typé) et 4/5 tests POLICYCONFIG-FAILCLOSED-01 passent. Mais le test bloquant échoue faute de connexion Base44. Le DataAccessLedger est un stub. L'AdminAuthorityResolver n'existe pas. Les 19 interdits ne sont pas enforced architecturalement. Aucun test P0 Admin/Sécurité au sens catégorie 5 (section 15.4) n'existe.

7. DÉPENDANCES SORTANTES
Tous les domaines financiers (Partie III, IV) sont bloqués par l'absence de PolicyConfigAdapter connecté : getConfig('tps_ppm'), getConfig('event_payment_cap_cents'), getConfig('deposit_ratio_ppm') lèvent POLICY_CONFIG_MISSING — EventPaymentGuard, le waterfall, et event_sealed sont impossibles. Source : OS section 4.5 + src/core/policy-config-resolver.js.


Domaine machine d'état : le Guard 5 (AuditLogger) est déclaré "toujours, sans exception" dans la LOI TRANSITION-01 (OS section 2.7.1 + section 16.2). Un AuditLogger qui console.log sans persister ne satisfait pas la loi. Chaque transition peut théoriquement passer, mais sans trace institutionnelle — ce qui viole l'interdit n°9 (section 9.4 : "Supprimer un DataAccessLedgerEntry" — impossible si l'entrée n'a jamais été écrite).


Domaine Scheduler : les jobs P0 qui déclenchent des payouts doivent vérifier l'autorisation de l'acteur via AdminAuthorityResolver pour toute action déclenchée manuellement (override, dispute résolue). Sans AdminAuthorityResolver, ces vérifications sont impossibles. Source : OS section 9.2 + section 6.2 ("Manuel (admin review) au MVP").


Domaine portabilité (Event 0B) : la grille de readiness section 15.5 exige "100% P0 chemin exercé = PASS" pour Event 0B. POLICYCONFIG-FAILCLOSED-01 est actuellement à 4/5 (FAILED). Source : OS section 15.5.


GoNoGoDecisionRecord : le GoNoGoDecisionRecord = GO (condition de la transition settled→archived — table 2.7.1) ne peut pas être prononcé si des tests P0 Admin/Sécurité n'existent pas ou échouent. Source : OS section 14.5 Seuil 1 : "zéro BugReplayRecord non PASSED."



FIN DE LA FICHE — G. ADMIN ET SÉCURITÉ Conservée pour le Prompt de Synthèse.

Je produis la fiche directement — les sources UX de l'OS V10 sont déjà chargées en contexte, et l'inventaire complet du zip a été établi dans les fiches précédentes.

FICHE D'ÉVALUATION — I. UX ET VÉRITÉ PERÇUE
(ventilation avant acceptation, état payout lisible, fonds protégés)

Date d'évaluation : 17 mai 2026, 10:15 EST
Documents sources :
  - MICRORAVE_V3_OPERATING_SYSTEM_V10.md sections 10.1–10.5,
    3.1, 5.0, 13.2, 14.3, 14.4, 15.4 catégorie 8 (source primaire)
  - Inventaire zip complet (fiches précédentes) :
    aucune UI / page / composant frontend trouvé dans src/
  - docs/FichesEvaluations/FicheEvaluation20260516.md
  - README.md

Niveau de confiance : PARTIELLE
  Spécification UX : HAUTE (OS V10 sections 10 + 13.2 + 3.1 détaillées)
  Implémentation UX : INFÉRENCE — aucun fichier UI V3 trouvé dans le zip.
  L'UI vit dans Base44 (plateforme de construction) — non accessible
  via le dépôt GitHub soumis. Son état réel est inconnu depuis les
  documents disponibles.


1. CRITÈRES DE COMPLÉTUDE
Ce domaine est prêt pour la première transaction quand :
La ventilation complète est affichée au talent avant que le bouton de confirmation soit activable — OS section 3.1 : "Dans les deux voies, cette ventilation s'affiche intégralement avant que le bouton de confirmation soit activable. Le talent ne peut pas confirmer sans avoir vu sa ventilation complète." Voie CreateEvent : cachet brut offert, tier, taux de courtage de base, score SOTS et modulation, taux effectif, commission MR, cachet net estimé. Voie QuickPlay : idem + mention "Ce montant est basé sur vos préférences tarifaires pour ce rôle."
Chaque état visible de l'Engagement affiche les 5 champs obligatoires pour le talent — OS section 10.2 : (1) Statut, (2) Argent (montant net attendu / reçu / bloqué), (3) Prochaine action, (4) Délai, (5) Preuve ou blocage.
Le mot "Escrow" est absent de l'interface — remplacé par "Fonds protégés" — OS section 10.3 : "✅ Fonds protégés — ❌ Escrow : interdit dans l'interface."
Les notifications négatives suivent la structure obligatoire — OS section 10.3 : "raison lisible → preuve utilisée → règle appliquée → recours → délai → arbitre." Non accusatoires.
L'explication des frais MR est disponible pour le talent et pour le payeur — OS section 10.4 : textes canoniques distincts pour chaque rôle.
L'interface ne projette jamais un état faux optimiste — OS section 10.1 : "Si la vérité métier est incertaine : afficher un état intermédiaire honnête ('en traitement') — jamais un état faux optimiste."
Le critère MVT n°1 est satisfait : "Talent voit ventilation complète avant acceptation — Premier event" — OS section 13.2 tableau ligne 1.
Le critère MVT n°2 est satisfait : "Talent voit état payout avec raison de blocage lisible — Premier event" — OS section 13.2 tableau ligne 2.
Le critère MVT n°3 est satisfait : "Payeur comprend 'fonds protégés' — Premier event" — OS section 13.2 tableau ligne 3.
Le critère MVT n°11 est satisfait : "QuickPlay compréhensible en 30 secondes — Premier event" — OS section 13.2 tableau ligne 11.
La catégorie 8 de tests P0 passe — OS section 15.4 : "UX et vérité perçue : ventilation avant acceptation, état payout lisible, fonds protégés, QuickPlay 30s."
Ce domaine bloque tout le reste si :
Le talent peut confirmer un Engagement sans avoir vu sa ventilation complète — OS section 3.1 : le bouton de confirmation est architecturalement conditionné à l'affichage de la ventilation. Un talent qui accepte sans voir son net estimé n'a pas donné un consentement éclairé. Ce n'est pas une dégradation UX — c'est une violation de la promesse fondamentale : "Ce que tu acceptes est transparent" — OS section 1.4.
Le mot "Escrow" apparaît dans l'interface — OS section 10.3 interdit explicite. Ce terme crée une confusion réglementaire dans le contexte canadien (l'escrow est une structure légale distincte du mécanisme Stripe Connect utilisé).
L'état payout ne montre pas la raison de blocage — OS section 13.2 MVT n°2 : "Premier event." Un talent dont le paiement est bloqué sans explication perd confiance dans l'institution — c'est une violation directe de la promesse "Micro Rave garantit ce règlement si tu livres ta présence" — OS section 1.4.

2. ÉTAT ACTUEL DOCUMENTÉ
Ce qui existe et fonctionne selon les documents :
La spécification UX est complète dans l'OS V10 sections 10.1 à 10.5 et transversalement dans les sections 3.1, 13.2, et 15.4. Le niveau de détail est opérationnel : textes canoniques pour les frais (section 10.4), structure de notification négative (section 10.3), 5 champs obligatoires par état (section 10.2), interdits de vocabulaire (section 10.3), et 12 critères MVT avec niveau de maturité requis (section 13.2).
Les textes MVT sont prêts à intégrer tels quels dans l'interface — OS section 10.4 :
Pour le talent : "Le taux Micro Rave couvre la mise en relation, la contractualisation, la sécurisation du paiement, la preuve de présence et la garantie de règlement. Ton net est garanti si tu es présent."
Pour le payeur : "Les frais de service Micro Rave couvrent la sélection du talent, la gestion du contrat, la sécurisation des fonds et le règlement garanti de la prestation."
La ventilation complète CreateEvent est spécifiée au niveau du champ — OS section 3.1, sept lignes précises. La ventilation QuickPlay ajoute la mention de source tarifaire. Les deux sont déjà calculables par MissionConversionGuard qui produit commissionMrCents et talentNetCents entiers dans le ContractSnapshot. Source : src/core/guards/MissionConversionGuard.js.
Ce qui vient de V1 et est encore actif :
INFÉRENCE : V1 sur microrave.ca a une interface utilisateur fonctionnelle avec des paiements réels. Elle a donc une UX existante pour la mise en relation talent/organisateur. La qualité de cette UX au regard des critères V3 (ventilation complète, "fonds protégés" vs "Escrow", notifications structurées) est inconnue depuis les documents disponibles. Acquis potentiel : les patterns UX qui ont fonctionné avec les premiers talents sont des données de calibrage précieuses. Dette potentielle : des habitudes utilisateurs établies sur V1 peuvent créer des frictions si V3 introduit une UX plus formelle (ventilation obligatoire avant confirmation).
Ce qui vient de V2 et a survécu :
V2 abandonnée. Aucun composant UI V2 cité comme survivant.

3. LACUNES IDENTIFIÉES
BLOQUANT (empêche la première transaction) :
Aucun fichier UI V3 trouvé dans le zip — le dépôt GitHub contient uniquement la couche métier portable (src/core/, src/repositories/, src/adapters/, tests/, config/). L'UI vit dans Base44 et n'est pas versionnable via ce dépôt. Son état réel (existence, conformité aux critères UX de l'OS) est impossible à évaluer depuis les documents soumis. Source d'identification : inventaire complet du zip confirmé dans les fiches E, F, G, H.


Aucun test P0 de catégorie 8 trouvé — tests/p0/ contient 6 fichiers, aucun ne couvre la UX. OS section 15.4 catégorie 8 est une catégorie P0. OS section 14.5 Seuil 1 : "100% tests P0 du chemin exercé = PASS." Sans tests UX, aucun BugReplayRecord UX ne peut atteindre PASSED, bloquant formellement le GoNoGoDecisionRecord = GO. Source d'identification : tests/p0/ — aucun fichier UX-*.js ni MVT-*.js.


Le connecteur entre MissionConversionGuard (qui calcule talentNetCents) et l'interface de confirmation talent n'est pas documenté côté implémentation — le guard produit le ContractSnapshot mais la séquence "comment ce snapshot alimente l'écran de confirmation" n'est pas traçable depuis le code V3 disponible. INFÉRENCE : ce connecteur vit dans Base44. Si Base44 affiche la ventilation depuis le ContractSnapshot sans gate sur le bouton de confirmation, le critère MVT n°1 n'est pas satisfait même si les données sont disponibles.


DÉGRADANT (réduit la qualité, n'empêche pas) :
Le critère MVT n°4 "Frais MR expliqués comme service de confiance — Premier event" (OS section 13.2) requiert que les textes canoniques de la section 10.4 soient intégrés. Ces textes sont prêts dans l'OS mais leur présence dans l'interface est inconnue.


Le critère MVT n°5 "Décision négative = explication + recours — Premier event" (OS section 13.2) requiert la structure de notification obligatoire de la section 10.3. Sans elle, un talent refusé ou bloqué reçoit une notification non conforme — friction de confiance sans blocage financier.


L'OS section 1.3 définit "Le Micro-Onde" : pendant l'event, le téléphone "reste au vestiaire." Cette doctrine impacte l'UX de check-in (AudienceCheckIn, TalentCheckIn) — un check-in qui nécessite une interaction téléphonique prolongée contredit le principe fondateur. La séquence de check-in n'est pas spécifiée dans l'OS section 10 au niveau de l'interaction — seulement dans la section 7.4 (PresenceProofResolver) au niveau des signaux.


REPORTABLE (peut attendre l'événement 2+) :
Critère MVT n°6 "Payout readiness prouvé (payout de test réussi) — Premier event" (OS section 13.2) — ce critère dépend du domaine Scheduler (Fiche F) et est hors portée directe de la UX.
Critère MVT n°11 "QuickPlay compréhensible en 30 secondes — Premier event" (OS section 13.2) — Event 1 est un "4 à 7 Premium" par voie CreateEvent. QuickPlay n'est pas le chemin exercé pour Event 1. Source : OS section 12.2 + section 14.3 "Talent : fiable du réseau direct du fondateur."
Critère MVT n°12 "Au moins un event réel complété — ouverture élargie seulement" (OS section 13.2) — par définition reportable.
Dashboard Checkpoint complet — OS section 13.3 V3.2 : "Dashboard Checkpoint" est en V3.2, pas MVP.
ANGLE MORT POTENTIEL :
→ INFÉRENCE NON DOCUMENTÉE : L'OS section 10.2 spécifie le "Format universel par état — talent" avec 5 champs obligatoires. Mais il ne spécifie pas le format équivalent pour l'organisateur et le payeur. L'Event 1 implique un organisateur/payeur connu du fondateur (section 14.3) — mais ses états visibles (confirmation dépôt reçu, balance due, event scellé) ne sont pas documentés avec la même rigueur que les états talent. À valider : existe-t-il une spécification des 5 champs équivalents pour l'organisateur, ou l'OS considère-t-il que la section 10.2 s'applique universellement ?
→ INFÉRENCE NON DOCUMENTÉE : L'OS section 14.3 dit que tous les participants Event 1 doivent explicitement accepter : "Je comprends que je participe à un événement pilote Micro Rave avec argent réel, support humain, et suivi post-event." Ce consentement est une exigence UX — un écran ou un document à signer avant l'event. Son mécanisme (email, écran in-app, document papier) n'est pas spécifié dans l'OS. À valider par le fondateur.

4. DETTE HÉRITÉE
De V1 : L'interface V1 existe et des talents réels l'utilisent. La présence d'une UX établie est un acquis — les utilisateurs ont une référence. La dette : si V1 n'affiche pas de ventilation complète avant confirmation et ne dit pas "fonds protégés," les utilisateurs V1 migrés vers V3 devront adapter leurs habitudes. Cette friction de transition n'est pas documentée dans l'OS. Acquis indirect positif : V1 a prouvé que la mise en relation talent/organisateur est techniquement faisable et acceptée par les utilisateurs cibles.
De Base44 : L'UI V3 vit dans Base44. C'est l'un des éléments listés comme "Peut rester couplé Base44 au MVP" (OS section 11.1). La dette : toute modification UX passe par l'interface Base44, non par le dépôt GitHub. Les tests P0 UX devront soit tester la logique métier (côté core/) qui conditionne l'affichage, soit être des tests d'intégration Base44 — dont le mécanisme n'est pas défini.

5. DELTA VERS COMPLÉTUDE
Construire dans Base44 les écrans de confirmation talent (avec ventilation complète gating le bouton), les états payout avec raison de blocage lisible, le vocabulaire "fonds protégés" systématique, les textes canoniques de la section 10.4 — et produire un test P0 de catégorie 8 qui valide au moins les critères MVT 1, 2, 3 et 5 avant Event 0A.

6. STATUT FINAL
☑ IMPOSSIBLE À ÉVALUER → ce qui manque :
L'UI V3 vit dans Base44 et n'est pas accessible depuis le dépôt GitHub soumis. L'état réel des écrans — existence de la ventilation, présence du vocabulaire "fonds protégés," structure des notifications négatives — est inconnu. Ce qui est évaluable (spécification OS, calculs MissionConversionGuard) est complet et conforme. Ce qui n'est pas évaluable (implémentation Base44 des écrans) représente l'intégralité du travail d'intégration UX.
Reformulation conditionnelle : Si l'UI Base44 n'a pas encore été construite pour V3, le statut est NON COMMENCÉ côté implémentation. Si une UI V3 partielle existe dans Base44, le statut est EN COURS à un pourcentage inconnu. À valider par le fondateur avec un accès direct à l'environnement Base44 dev.

7. DÉPENDANCES SORTANTES
Domaine machine d'état / MissionConversionGuard alimente directement la UX : le ContractSnapshot produit à proposed→accepted contient talentNetCents, commissionMrCents, tauxPpm, tier — toutes les données nécessaires à la ventilation de la section 3.1. La UX dépend de la qualité de ce snapshot. Source : src/core/guards/MissionConversionGuard.js + OS section 3.1.


Domaine Admin/Sécurité (Fiche G) : les notifications négatives structurées (section 10.3 : "raison lisible → preuve utilisée → règle appliquée → recours → délai → arbitre") requièrent que AdminAuthorityResolver et les AdminAction logs existent — on ne peut pas afficher un recours si le mécanisme de recours n'est pas implémenté. Source : OS section 10.3 + section 9.2.


Domaine présence / SOTS (Fiche E) : l'état payout "avec raison de blocage lisible" (MVT n°2) doit afficher les conditions manquantes parmi les 11 — notamment la Condition 7 (SOTSSubmission requis). Si le SOTS n'existe pas, l'interface ne peut pas expliquer pourquoi le payout est bloqué sur cette condition. Source : OS section 13.2 MVT n°2 + section 6.3 Condition 7.


Domaine Scheduler (Fiche F) : l'état "en traitement" (OS section 10.1) reflète des tâches en attente de traitement par le Scheduler. Sans Scheduler actif, l'interface affichera soit un état faux optimiste soit une attente indéfinie — les deux sont interdits par la section 10.1. Source : OS section 10.1 + section 8.1.


INFÉRENCE : Le critère MVT n°9 "Canal support disponible avec délai de réponse — Premier event" (OS section 13.2) est une exigence UX qui dépend d'une décision opérationnelle (quel canal : email, SMS, WhatsApp ?) non documentée dans l'OS. À valider.



FIN DE LA FICHE — I. UX ET VÉRITÉ PERÇUE Conservée pour le Prompt de Synthèse.
Je produis la fiche directement — toutes les sources pertinentes sont en contexte.

FICHE D'ÉVALUATION — J. ACTEURS ET ONBOARDING
(profils, KYC Stripe, TalentRolePreference, Checkpoint)

Date d'évaluation : 17 mai 2026, 10:50 EST
Documents sources :
  - MICRORAVE_V3_OPERATING_SYSTEM_V10.md sections 1.4, 2.2, 2.5,
    2.5.1, 2.5.2, 2.8, 2.10, 5.2, 7.7, 12.6, 13.1, 14.3, 14.4
    (source primaire)
  - src/core/IDFactory.js (préfixes: USR, TAL, CKP, EVL, TRP)
  - src/core/guards/MissionConversionGuard.js (contexte: talentUserId,
    organizerUserId)
  - src/core/guards/PlacementGuard.js (contexte: isSelfOrganized)
  - Inventaire zip complet (fiches précédentes)
  - docs/FichesEvaluations/FicheEvaluation20260516.md

Niveau de confiance : PARTIELLE
  Spécification acteurs/onboarding : HAUTE (OS V10 couvre les
  règles de profil, KYC, TalentRolePreference, Checkpoint en détail)
  Implémentation profils/onboarding : INFÉRENCE — aucun fichier
  src/user/, src/talent/, src/checkpoint/ trouvé dans le zip.
  L'UI d'onboarding vit dans Base44, non accessible depuis le dépôt.


1. CRITÈRES DE COMPLÉTUDE
Ce domaine est prêt pour la première transaction quand :
Un UserProfile avec systemId valide (USR-*) existe pour le talent avant toute création d'Engagement — OS section 2.9 : "Chaque entité du système possède un systemId unique, lisible, préfixé, portable et indépendant de l'infrastructure." Le transitionEngagement() valide actor via IDFactory.validate(actor, 'User') — sans USR-* valide, toute transition est bloquée à l'entrée.
KYCStatus = VERIFIED pour le talent avant payout — OS section 7.7 règle 5 : "KYC Stripe Connect obligatoire avant payout (KYCStatus = VERIFIED)." La condition 11 des 11 conditions de payout (section 6.3) : "Escrow réellement secured" — liée à la capacité Stripe Connect du talent à recevoir un virement.
Au moins une TalentRolePreference existe par talent participant au chemin QuickPlay — OS section 2.5.1 : "TalentRolePreference est l'objet souverain qui porte le tarif, le style et la signature d'un talent pour un rôle donné. Il précède tout Engagement QuickPlay." Pour Event 1 (voie CreateEvent), la TalentRolePreference alimente la ventilation affichée — section 3.1 voie QuickPlay.
Le score SOTS par défaut est initialisé à 3 000 score_units pour tout acteur entrant — OS section 5.2 : "Tout acteur entrant dans l'écosystème commence à 3/5 = 3 000 score_units = multiplicateur neutre (1 000 000 ppm)." Sans ce score, le MissionConversionGuard ne peut pas renseigner sotsSnapshotPpm dans le ContractSnapshot (actuellement hardcodé à 1_000_000 dans le code — source : MissionConversionGuard.js).
Un Checkpoint avec systemId valide (CKP-*) ou une EventLocation (EVL-*) existe pour l'event — OS section 2.8 : l'EventLocation est requise pour tout event, le Checkpoint est optionnel. Un event peut exister avec seulement une EventLocation.
Le compte Stripe Connect du talent est créé et l'account_id Stripe est lié au UserProfile — OS section 7.7 règle 5 : KYC Stripe Connect obligatoire avant payout. Sans Stripe Connect actif, execute_payout_transfer est impossible.
Les participants Event 1 ont explicitement accepté leur statut de co-testeurs — OS section 14.3 : "Tous acceptent explicitement : 'Je comprends que je participe à un événement pilote Micro Rave avec argent réel, support humain, et suivi post-event.'"
La sélection des 20 premiers talents respecte le profil — OS section 12.6 : 10 DJs / 3 photographes-vidéastes / 2 VJ / 2 MC-hôtes / 2 techniciens son-lumière / 1 talent hybride. "Fiabilité avant notoriété."
Ce domaine bloque tout le reste si :
KYCStatus ≠ VERIFIED pour le talent au moment du payout — OS section 7.7 règle 5 + table des guards section 2.7.1 : LedgerInvariantGuard sur payable→settled vérifie KYCStatus = VERIFIED. Sans vérification Stripe KYC complétée, le payout est architecturalement bloqué. C'est la seule condition des 11 qui dépend d'une action externe (Stripe) que ni le fondateur ni le talent ne contrôlent entièrement.
Le talent n'a pas de USR-* valide — transitionEngagement() lève INVALID_SYSTEM_ID à chaque transition. Zéro Engagement possible. Source : src/core/transitionEngagement.js validation IDFactory en entrée.
Le compte Stripe Connect talent n'est pas créé avant deposit_pending — si le Lineup est verrouillé et le dépôt reçu mais que le talent n'a pas de Stripe Connect account, le payout reste bloqué jusqu'à résolution manuelle, violant l'objectif "sans intervention manuelle d'urgence" — OS destination de l'audit.

2. ÉTAT ACTUEL DOCUMENTÉ
Ce qui existe et fonctionne selon les documents :
Les préfixes IDFactory pour tous les acteurs sont définis et opérationnels — USR (UserProfile), TAL (Talent), CKP (Checkpoint), EVL (EventLocation), TRP (TalentRolePreference) — source : src/core/IDFactory.js. La génération et validation de ces identifiants sont testées (IDFACTORY-01 : 7/7 PASSED).
La validation USR-* pour l'acteur est enforcée dans transitionEngagement() avant toute transition — source : src/core/transitionEngagement.js, validation IDFactory.validate(actor, 'User'). Tout acteur non souverain est bloqué dès l'entrée.
isSelfOrganized est calculé dans PlacementGuard dès accepted→placed — talentUserId === organizerUserId — et ses trois conséquences sont documentées dans le code : auto-notation bloquée, Condition 6 auto-satisfaite par délai, flag CONFLICT_OF_INTEREST_SELF si dispute. Source : src/core/guards/PlacementGuard.js.
Le ContractSnapshot phase 1 inclut sotsSnapshotPpm: 1_000_000 — multiplicateur neutre par défaut sous seuil 10, conforme à OS section 5.4. Source : src/core/guards/MissionConversionGuard.js — valeur calculée à accepted.
La règle multi-rôle contextuel est documentée dans l'OS — un utilisateur peut être talent dans un event et organisateur dans un autre, sans conflit — OS section 2.2 BLOC 1 V8. Ce design n'est pas encore implémenté comme objet de code séparé mais est encodé dans la logique de isSelfOrganized.
La spécification du Checkpoint est complète dans l'OS section 2.8 : systemId, ownerId, eventLocationId, name, type, status (VERIFIED / UNVERIFIED / PRIVATE), capacity, calendarId, culturalProfile (EMA). La règle de mémoire culturelle sur lat/long est précise. La relation EventLocation ↔ Checkpoint est claire : un Checkpoint est toujours associé à une EventLocation sous-jacente.
La doctrine des 20 premiers talents est spécifiée — OS section 12.6 : composition précise par roleMetier, critère "fiabilité avant notoriété," et règle explicite : "N'importe lequel peut être capitaine selon l'ordre d'arrivée dans le lobby. Aucun recrutement de 'profil capitaine'."
Ce qui vient de V1 et est encore actif :
V1 a des talents et des organisateurs réels sur microrave.ca. Ces profils existent avec des données d'identité, des rôles, et possiblement des comptes Stripe Connect partiels ou complets. INFÉRENCE : ces profils portent des Base44 ids natifs sans USR-* souverain V3. Acquis positif majeur : les 20 premiers talents sont probablement à recruter depuis le réseau actif V1 — la relation de confiance est établie. Dette : la migration des profils V1 vers des USR-* V3 nécessite une procédure de rétrofitage des systemIds non documentée dans l'OS.
Ce qui vient de V2 et a survécu :
V2 abandonnée. Aucun composant profil V2 cité comme survivant.

3. LACUNES IDENTIFIÉES
BLOQUANT (empêche la première transaction) :
Aucun UserRepository, TalentRepository, ni CheckpointRepository implémenté — les interfaces sont listées dans l'OS section 11.2 mais absentes de src/repositories/. Sans UserRepository, le transitionEngagement() ne peut pas vérifier si un USR-* correspond à un profil réel en database — il valide uniquement le format du systemId, pas l'existence de l'entité. Source d'identification : inventaire src/repositories/ — un seul fichier (PolicyConfigRepository).


KYCStatus = VERIFIED est une condition du guard LedgerInvariantGuard (table 2.7.1, payable→settled) — mais LedgerInvariantGuard est un stub (placeholder). La vérification KYC réelle n'est pas implémentée. Si un talent n'a pas complété son KYC Stripe Connect avant l'Event 1, le payout sera bloqué sans raison lisible — violant MVT n°2. Source d'identification : src/core/transitionEngagement.js case 'LedgerInvariantGuard' : return { passed: true, reason: 'placeholder' }.


La TalentRolePreference (TRP-*) est l'objet souverain du chemin QuickPlay — OS section 2.5.1 : "Il précède tout Engagement QuickPlay." Pour Event 1 (voie CreateEvent), cette structure est moins critique, mais le MissionConversionGuard dans la voie QuickPlay en a besoin pour calculer le cachet suggéré. Aucun TalentRolePreferenceRepository ni objet TRP n'est implémenté. Source d'identification : inventaire complet src/.


Le Checkpoint CP-PLATEAU-0001 (référencé dans la Pierre de Rosette — OS section 14.9 : "Le Trèfle, Montréal · Checkpoint CP-PLATEAU-0001") doit exister en database avant l'Event 1. Ce Checkpoint n'a aucun équivalent trouvé dans le code — aucun seed data, aucun CheckpointRepository. Source d'identification : OS section 14.9 + inventaire src/.


DÉGRADANT (réduit la qualité, n'empêche pas) :
Le score SOTS par défaut (3 000 score_units) est actuellement hardcodé dans MissionConversionGuard.js comme sotsSnapshotPpm: 1_000_000. C'est le comportement correct pour un talent sous seuil 10 — mais la valeur est dans le code, pas résolue depuis SOTSCalculationPolicyConfig en database. Si le fondateur veut changer la valeur neutre, il doit modifier le code, non la database. OS section 4.5 : "Aucune constante financière n'est dans le code." Ce cas est financièrement neutre (1 000 000 ppm = pas de modulation) mais viole la règle de configuration. Source : src/core/guards/MissionConversionGuard.js ligne sotsSnapshotPpm: 1_000_000.


La granularité publique pour les lieux privés n'est pas enforcée par code — OS section 2.8 : "Jamais l'adresse exacte ni les coordonnées précises. Zoom ≥ 10 en affichage public — rue ou quartier uniquement." Cette règle dépend de l'UI Base44 pour son enforcement. Sans contrôle au niveau de l'API, une adresse résidentielle pourrait être exposée si l'UI est mal configurée.


Le statut Checkpoint (VERIFIED / UNVERIFIED / PRIVATE) détermine la visibilité publique — OS section 2.8. Aucun workflow de vérification de Checkpoint n'est documenté côté implémentation. Le fondateur devrait pouvoir marquer CP-PLATEAU-0001 comme VERIFIED manuellement avant Event 1.


REPORTABLE (peut attendre l'événement 2+) :
CheckpointCulturalProfile calculé par EMA — OS section 2.8 : cité comme couche portable (section 11.1). Le premier event ne génère pas assez d'historique pour un profil culturel enrichi. Reportable par nature.
SellerPortfolio et ClientAttributionRight — OS section 2.10 : "Droits économiques conditionnels." Hors scope MVP direct pour Event 1 sans vendeur assigné.
TalentTaxProfile UI — OS section 13.3 V3.0.1 : "Corrections frictions pilote." Post-Event 1.
EngagementCollectif et gestion de lobby complet — requis pour Event 2+ (ALL NIGHT LONG, SC-13). Source : OS section 3.7.
ANGLE MORT POTENTIEL :
→ INFÉRENCE NON DOCUMENTÉE : L'OS section 7.7 règle 5 dit "KYC Stripe Connect obligatoire avant payout." Mais il ne documente pas quand dans le pipeline le KYCStatus doit être vérifié pour la première fois. Est-ce à la création du profil talent (onboarding) ? À accepted ? À deposit_pending ? À payable ? Si c'est seulement vérifié à payable→settled, un talent peut traverser tout le pipeline sans KYC complété, découvrir le blocage seulement au moment du paiement, et créer une friction majeure. À valider par le fondateur : point d'entrée KYC dans le pipeline — et délai moyen de vérification Stripe Connect en production canadienne.
→ INFÉRENCE NON DOCUMENTÉE : L'OS section 12.6 dit "20 premiers talents." Il ne documente pas si ces 20 talents doivent tous être créés en base avant Event 1, ou si seul le talent de l'Event 1 doit être onboardé. Pour Event 1 (1 DJ, 1 event), un seul profil talent est techniquement suffisant. Mais la logique QuickPlay (Event 2+) requiert plusieurs talents avec TalentRolePreference. À valider : combien de profils doivent exister en database avant Event 0A ?

4. DETTE HÉRITÉE
De V1 : Les profils V1 existent avec des comptes Stripe Connect potentiellement en production. Cette maturité Stripe est un acquis opérationnel — certains talents V1 ont peut-être déjà KYCStatus = VERIFIED sur la plateforme V1. La dette : ces profils portent des Base44 ids natifs, pas des USR-* V3. La question non résolue : les talents V1 seront-ils migrés vers V3 (rétrofitage) ou recréés de zéro ? Le rétrofitage crée un risque d'intégrité référentielle. La recréation crée une friction utilisateur (re-KYC). L'OS ne tranche pas.
De Base44 : L'onboarding talent, organisateur et checkpoint vit dans l'UI Base44. La création de TalentRolePreference (objet souverain critique pour QuickPlay) dépend d'un formulaire Base44. Si Base44 ne crée pas ces objets avec des TRP-* souverains, la couche portable est contournée. OS section 11.1 : "Le code Base44 ne contient jamais la vérité métier. Il appelle des fonctions métier portables." La conformité de l'onboarding Base44 à cette règle est inconnue depuis les documents disponibles.

5. DELTA VERS COMPLÉTUDE
Créer les profils minimum requis pour Event 1 dans Base44 (1 talent avec USR-* + Stripe Connect KYC en cours, 1 organisateur/payeur avec USR-*, 1 EventLocation ou Checkpoint CKP-*) ; implémenter UserRepository et CheckpointRepository comme interfaces portables ; vérifier que KYCStatus = VERIFIED est validé dans LedgerInvariantGuard avant le premier payout réel.

6. STATUT FINAL
☑ EN COURS → 15% estimé
Les préfixes IDFactory pour tous les acteurs sont définis et opérationnels. La validation USR-* est enforcée dans transitionEngagement(). isSelfOrganized est calculé à accepted→placed. Mais les repositories acteurs (UserRepository, CheckpointRepository, TalentRepository) n'existent pas, le KYC Stripe Connect n'est pas vérifié dans les guards réels, la TalentRolePreference n'est pas implémentée, et le Checkpoint de l'Event 1 n'existe pas en database. L'UI d'onboarding vit dans Base44 — son état est inconnu depuis le dépôt.

7. DÉPENDANCES SORTANTES
Domaine machine d'état est bloqué au premier appel si actor n'est pas un USR-* valide — transitionEngagement() lève INVALID_SYSTEM_ID sans profil talent souverain. Source : src/core/transitionEngagement.js + OS section 2.9.


Domaine paiement / payout (payable→settled) est bloqué si KYCStatus ≠ VERIFIED — OS section 7.7 règle 5 + table 2.7.1 LedgerInvariantGuard. Sans KYC complété, le règlement talent est impossible. C'est la dépendance externe la plus risquée — elle dépend de Stripe et du talent, pas seulement du code.


Domaine SOTS (Fiche E) : la matrice de notation (section 5.3) dépend des profils acteurs pour identifier le noteur (noteurId), la cible (targetEntityId), et vérifier les conditions d'accès (TicketAdmissionRight, AudienceCheckIn). Sans profils réels en database, aucune soumission SOTS ne peut être validée. Source : OS section 5.3.


Domaine QuickPlay (Event 2+) dépend entièrement de la TalentRolePreference — OS section 2.5.1 : "TalentRolePreference est l'objet souverain qui porte le tarif, le style et la signature d'un talent pour un rôle donné. Il précède tout Engagement QuickPlay." Sans TRP-* en database, le chemin QuickPlay est architecturalement impossible. Source : OS sections 2.5, 2.5.1, 2.5.2.


Domaine Portabilité (Fiche H) : le mapping Base44 id → systemId (IDM-*) doit être créé pour chaque profil inséré. Sans IdMapping persisté dès la création des profils acteurs, l'export des tables critiques (item 2 Portability Readiness) sera incomplet. Source : OS section 11.6 item 2.



FIN DE LA FICHE — J. ACTEURS ET ONBOARDING Conservée pour le Prompt de Synthèse.
