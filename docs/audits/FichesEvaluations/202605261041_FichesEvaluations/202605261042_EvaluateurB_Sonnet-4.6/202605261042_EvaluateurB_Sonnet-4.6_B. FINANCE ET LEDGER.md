━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FICHE D'ÉVALUATION — B. FINANCE ET LEDGER
Date d'évaluation : 26 mai 2026
Fait avec Sonnet 4.6 Adaptatif

Documents sources :
  • MICRORAVE_V3_OPERATING_SYSTEM_V15.md (OS V15)
  • src/services/FinancialLedgerService.js
  • src/services/PayoutExecutor.js
  • src/core/MoneyMath.js
  • src/core/guards/LedgerInvariantGuard.js
  • src/repositories/LedgerRepository.js (alias LedgerCodeMapRepository)
  • src/repositories/LedgerRecordStatusHistoryRepository.js
  • src/repositories/index.js
  • codeBase44_v3/base44/entities/LedgerRecord.jsonc
  • codeBase44_v3/base44/entities/LedgerCodeMap.jsonc
  • codeBase44_v3/base44/entities/SettlementInstruction.jsonc
  • codeBase44_v3/base44/entities/PayoutExecutionRecord.jsonc
  • codeBase44_v3/base44/entities/RoundingReconciliationRecord.jsonc
  • codeBase44_v3/base44/functions/createEngagement/entry.ts [DÉPLOYÉ]
  • codeBase44_v3/base44/functions/executePayoutTransfer/entry.ts [DÉPLOYÉ]
  • codeBase44_v3/base44/functions/recognizeRevenue/entry.ts [DÉPLOYÉ]
  • codeBase44_v3/dataBase/LedgerRecord_export.csv (143 lignes)
  • codeBase44_v3/dataBase/LedgerCodeMap_export.csv (seeded)
  • codeBase44_v3/dataBase/PolicyConfig_export.csv (15 clés ledger)
  • codeBase44_v3/dataBase/PayoutExecutionRecord_export.csv (1 record)
  • codeBase44_v3/dataBase/SettlementInstruction_export.csv (1 record)
  • tests/p0/LEDGER-V4-01.js
Niveau de confiance : HAUTE sur l'état de la production ;
                     HAUTE sur les lacunes du câblage canonique.
──────────────────────────────────────────────────
1. CRITÈRES DE COMPLÉTUDE
   (Tirés de l'OS V15)

Ce domaine est prêt pour la première transaction quand :

• LOI LEDGER-02 est vérifiée avant chaque transition financière :
  sum(talentNetCents) + sum(commissionMrCents) + roundingCents =
  prixVenduClientCents — OS V15 §16.1 + §2.7.1 table (payable→settled :
  "LOI LEDGER-02 respectée · zéro cent").

• LOI LEDGER-01 est respectée : la commission MR reste en 4530
  (revenu différé) jusqu'à archivage, puis passe en 7110 (revenu
  reconnu) uniquement à l'archivage — OS V15 §16.1 + recognizeRevenue.

• Les écritures LedgerRecord sont en double-entrée append-only, jamais
  modifiées ou supprimées — OS V15 §16.0 LOI GREFFIER-01 : "WORM-APPEND-01
  s'applique à tous les registres."

• Toutes les valeurs financières sont des entiers en centimes (D-064) ;
  aucun float — LedgerRecord.amountCents type integer.

• PayoutExecutor applique les 6 verrous D-101 avant tout Stripe Transfer
  — OS V15 §2.7.1 table (payable→settled : "KYCStatus = VERIFIED").

• LedgerCodeMap V4 est la source de vérité pour les codes comptables
  (Market Pivot V3) — aucun code hardcodé dans le code source.

Ce domaine bloque tout le reste si :

• Un LedgerRecord DR ≠ CR est persisté pour un même transactionGroupId —
  violation LOI LEDGER-02 irréparable en append-only.

• Un float est écrit en amountCents — D-064 : corruption silencieuse sur
  toute agrégation ultérieure.

• PayoutExecutor exécute un Stripe Transfer sans vérifier le verrou 4
  (KYCStatus === VERIFIED) — D-097 règle 5.

──────────────────────────────────────────────────
2. ÉTAT ACTUEL DOCUMENTÉ

Ce qui existe et fonctionne selon les documents :

  PRODUCTION VÉRIFIÉE :
  143 LedgerRecord en production. Vérification computationnelle
  sur les 53 transactionGroupIds : sum(DR) = sum(CR) pour tous
  sans exception. LOI LEDGER-02 respectée dans chaque groupe.
  Source : analyse Python sur LedgerRecord_export.csv.

  Waterfall complet présent en production (5 types d'événements) :
  placement_engagement, encaissement_depot, encaissement_solde,
  payout_executed, revenue_recognition. La séquence LOI LEDGER-01
  est prouvée : 4530 CR à placement, 4530 DR / 7110 CR à archivage
  (2 revenue_recognition groups balancés).

  PolicyConfig seeded avec 15 clés ledger incluant :
  ledger_account_organizer_receivable (4110), ledger_account_talent_payable
  (4310), ledger_account_commission_escrow (4530), ledger_account_stripe_
  available (5100), ledger_account_encaissement (5200),
  ledger_account_revenue_courtage (7110). Market Pivot V3 opérationnel.

  LedgerCodeMap seeded avec D-060-B entries : INTERVENTION_TYPEs
  (PRINCIPAL_TAX_REGULARIZATION_PILOT/ERROR/AUDIT), comptes fiscaux
  passifs (4410/4420/4430/4440). Source : LedgerCodeMap_export.csv.

  COUCHE JS CANONIQUE :
  FinancialLedgerService.js : recordTransaction() avec double-entrée,
  invariant DR=CR fail-hard, validateEntry() par ligne, Account6690Guard
  (D-060-B), resolveReconciliationKey (D-060-C), detectReversal /
  writeStatusHistoryForReversal (D-060-E), VALID_ACCOUNTS whitelist
  (85 codes). Source : src/services/FinancialLedgerService.js.

  MoneyMath.js : depositAmount(), balanceDue(), applyRatePpm(),
  prorataCents(), lineupCoefficientPpm() — toutes les opérations
  financières centralisées. Arrondi floor exclusif. D-063/D-064.

  PayoutExecutor.js : 6 verrous D-101 implémentés dans l'ordre
  (V1-état, V2-idempotency, V3-SettlementInstruction, V4-KYC,
  V5-LedgerInvariant, V6-Stripe idempotency key). Preuve en
  production : PayoutExecutionRecord PAY-MPIHYIID-0VYYNQ avec
  verrouxPassed = ["V1","V2","V3","V4","V5","V6_STRIPE_TRANSFER_MANUAL"].

  LEDGER-V4-01 : 24/25 PASSED (1 seul échec : T-21).

  COUCHE DÉPLOYÉE (Base44 functions) :
  Les fonctions createEngagement v6, executePayoutTransfer, recognizeRevenue
  et stripeWebhookHandler écrivent LedgerRecord directement via
  base44.entities.LedgerRecord.create(). Elles :
  — Vérifient DR=CR manuellement avant persistance
  — Chargent les comptes depuis PolicyConfig (Market Pivot V3)
  — Utilisent le bon waterfall (4110 DR / 4310 CR + 4530 CR au placement)
  — Appliquent un idempotency check sur revenue_recognition

Ce qui vient de V1 et est encore actif :
  Aucun : la doctrine financière (plan comptable, waterfall, MoneyMath,
  PayoutExecutor) est une construction V3 native. V1 ne portait pas
  de modèle comptable formalisé.

Ce qui vient de V2 et a survécu :
  Aucun. V2 abandonnée avant tout développement de la couche financière.

──────────────────────────────────────────────────
3. LACUNES IDENTIFIÉES

BLOQUANT — aucun pour le premier événement simple

  Le premier événement (talent seul, cachet unique, pas d'annulation
  ni de litige) peut compléter son cycle financier via les fonctions
  Base44 déployées. La preuve est dans les données de production :
  l'Engagement ENG-H5V66Q-WBJ7N2 a traversé le waterfall complet
  jusqu'à archivage avec ledger équilibré.

DÉGRADANT (réduit la qualité, n'empêche pas) :

• [D-B-01] Découplage total entre FinancialLedgerService.js (canonique)
  et les fonctions Base44 déployées.
  Les fonctions déployées n'appellent jamais FinancialLedgerService.
  Les guards D-060-B (Account6690), D-060-C (reconciliationKey strict),
  D-060-E (reversal marking) sont donc INACTIFS en production.
  Pour le premier événement simple (pas de 6690, pas de reversal formel),
  l'impact est nul. Mais tout scénario exceptionnel (no-show partiel,
  litige, remboursement) passe par le code déployé sans ces protections.
  Source de l'identification : grep FinancialLedgerService dans
  codeBase44_v3/base44/functions/ → 0 résultat.

• [D-B-02] LedgerRepository.js est nommé à tort — c'est la
  LedgerCodeMapRepository (getValidAccounts, findByCode, addCode,
  deactivateCode). Elle est exportée comme `ledgerRecords` dans
  repositories/index.js, mais n'expose pas `append()`. En conséquence,
  FinancialLedgerService.recordTransaction() échouerait si appelée
  depuis la couche JS canonique (repositories.ledgerRecords.append
  serait undefined). Les tests passent car ils utilisent des mocks.
  Source : src/repositories/LedgerRepository.js header + index.js l.
  "ledgerRecords: LedgerRepository".

• [D-B-03] LedgerRecordStatusHistoryRepository.js existe
  (src/repositories/) mais n'est PAS exporté dans index.js.
  D-060-E (reversal marking) est donc opérationnel dans le code
  du service mais jamais réellement branché. Source : liste des
  fichiers repositories/ + index.js (aucune référence à LRSHR).

• [D-B-04] Test LEDGER-V4-01 T-21 ÉCHEC : LedgerRepository
  n'exporte pas findByTransactionGroupId. Requis par D-060-E
  (detectReversal cas 2 — lookup du groupe original pour reversal).

REPORTABLE (peut attendre l'événement 2+) :

• D-070 Rounding residue vers compte 6591 : aucun enregistrement
  sur 6591 en production, aucun RoundingReconciliationRecord créé.
  Pour mono-talent avec cachet entier, l'arrondi floor est 0¢ — pas
  de résidu réel. Requis avant tout event multi-talent avec prorata.

• correction_waterfall_4335_to_4110 : 24 LedgerRecords de correction
  présents en production — trace d'un bug passé (4335 utilisé comme
  compte de clearing). Corrigé dans createEngagement v6. La clé
  PolicyConfig `ledger_account_clearing: 4335` est encore présente
  mais n'est plus appelée par le code actif.

• generateBalanceSnapshot() dans FinancialLedgerService : requiert
  engagementId ou eventId obligatoires — pas de bilan global possible.
  Annoté "Sprint 4" dans le code.

ANGLE MORT POTENTIEL :
Y a-t-il quelque chose que ce domaine requiert pour la première
transaction que l'OS ne documente pas explicitement ?

→ OUI — INFÉRENCE NON DOCUMENTÉE : Les fonctions déployées récupèrent
  les montants directement depuis l'Engagement (commissionMrCents,
  talentNetCents calculés à la création). Si ces champs sont mutés
  entre la création et le payout (ex. amendment D-147), le payout
  utiliserait les montants de l'Engagement plutôt que ceux du
  ContractSnapshot phase 2 (WORM W2). L'OS stipule que CS2 est la
  "source de vérité pour PayoutExecutor" (D-147) — mais les fonctions
  déployées ne lisent pas CS2. La divergence n'est pas documentée
  formellement. Pour le premier événement sans amendment : non-bloquant.
  À valider par le fondateur pour les scénarios avec amendment.

──────────────────────────────────────────────────
4. DETTE HÉRITÉE

Aucune dette V1/V2. La dette interne V3 est :

La correction_waterfall_4335_to_4110 (24 lignes de correction en
production) documente une erreur de conception précoce : l'utilisation
de 4335 comme compte de clearing, corrigée par des scripts manuels
(scripts/correction-waterfall-4335-to-4110.js). Le code actuel est
corrigé (createEngagement v6 utilise 4110). La dette est soldée sur
le code — elle reste visible dans les données via les entrées de
correction, ce qui est conforme à l'append-only (LOI GREFFIER-01).

La vraie dette structurelle est la non-utilisation de FinancialLedger
Service.js en production : une couche canonique complète avec D-060-B/
C/E guards qui tourne dans les tests mais jamais en prod. Cette couche
est soit à brancher sur les fonctions déployées, soit à documenter
formellement comme "couche de qualification test uniquement".

──────────────────────────────────────────────────
5. DELTA VERS COMPLÉTUDE

Pour le premier événement simple, le domaine est fonctionnel (prouvé
par les données de production). Le delta restant — brancher
FinancialLedgerService.js sur les fonctions Base44 déployées ou
documenter la dualité de couches — est requis pour les scénarios
exceptionnels (no-show, litige, reversal) mais pas pour le chemin
nominal Event 1.

──────────────────────────────────────────────────
6. STATUT FINAL

  ☑ PRÊT SOUS CONDITIONS

  Conditions : (1) Pas d'amendment (D-147) sur Event 1 — les fonctions
  déployées liraient les montants de l'Engagement, pas du CS2 WORM W2 ;
  (2) Pas de scénario exceptionnel (no-show, litige, reversal) sur
  Event 1 — les guards D-060-B/C/E sont inactifs en production.

  Ces conditions correspondent précisément au chemin nominal prévu
  pour la première transaction (Pierre de Rosette). L'Engagement
  ENG-H5V66Q-WBJ7N2 archivé en production en est la preuve.

──────────────────────────────────────────────────
7. DÉPENDANCES SORTANTES

• C. Stripe et paiements dépend de ce domaine pour la persistance des
  LedgerRecords post-webhook (encaissement_depot, encaissement_solde).
  La séquence est prouvée en production — aucun bloquant additionnel
  identifié.

• I. UX et vérité perçue dépend de ce domaine pour la ventilation
  financière visible par l'organisateur (commission MR, net talent,
  dépôt/solde) — OS V15 §1.4 : "Tu sais exactement ce que tu paies."
  Cette ventilation est calculée à la création de l'Engagement et
  affichée depuis les champs de l'entité. Fonctionnel.

  INFÉRENCE : les scénarios exceptionnels (D, E, G) qui nécessitent
  des reversals ou des écritures compensatoires font implicitement
  appel à FinancialLedgerService.recordTransaction(). Tant que ce
  service n'est pas câblé aux fonctions Base44 déployées (D-B-01),
  ces domaines devront gérer leur propre écriture ledger, comme le
  font actuellement executePayoutTransfer et recognizeRevenue. À valider.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FIN DE LA FICHE — B. FINANCE ET LEDGER
Conserver pour le Prompt de Synthèse.