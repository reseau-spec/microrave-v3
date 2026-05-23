━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FICHE D'ÉVALUATION — B. FINANCE ET LEDGER
(waterfall, invariant zéro cent, arrondi, commission)

Date d'évaluation : 22 mai 2026 07:17 EST
Par Claude Sonnet 4.6
Documents sources :
  • MICRORAVE_V3_OPERATING_SYSTEM_V15.md (OS V15)
  • EXPORT_BRUT—REGISTRES_SOUVERAINS_MICRO_RAVE_V3.md
    (D-038, D-049, D-053, D-059, D-060, D-060-A, D-063/064,
     D-068, D-069/070, D-101, LOI LEDGER-01/02, LOI WATERFALL-01)
  • src/core/MoneyMath.js
  • src/core/guards/LedgerInvariantGuard.js
  • src/core/guards/SealingGuard.js
  • src/services/PayoutExecutor.js
  • src/services/MembershipPlanService.js
  • src/repositories/LedgerRepository.js
  • src/repositories/PaymentRepository.js
  • config/policy-config-schema.js
  • docs/PlanImplantation/20260521-0942_Plan_Implantation.md
  • tests/p0/ : SEALING-01, PAYOUT-SETTLED-01, NOSHOW-REFUND-01,
    DEPOSIT-FAIL-01, BALANCE-DEADLINE-01, CANCELLATION-01,
    CONTESTATION-WINDOW-01

Niveau de confiance : HAUTE pour le calcul du waterfall
  (MoneyMath, SealingGuard, LedgerInvariantGuard, PayoutExecutor
  entièrement lisibles et testés).
  PARTIELLE pour les écritures ledger comptables (PayoutExecutor
  utilise le compte 4310 mais les entrées de réception dépôt/solde
  ne sont pas visibles dans les guards — elles dépendent d'un
  appelant dont l'implémentation n'est pas visible dans le ZIP).
  INFÉRENCE pour fiscalité (TPS/TVQ dans le waterfall SealingGuard
  absente — voir §3 BLOQUANT-B3) et pour MoneyMovementRouter
  (D-049 le liste comme MVP obligatoire, non trouvé dans le code).
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

──────────────────────────────────────────────────
1. CRITÈRES DE COMPLÉTUDE

Ce domaine est prêt pour la première transaction quand :

- Le standard numérique invariant est appliqué partout :
  entiers en centimes, taux en ppm, zéro Math.floor libre
  hors MoneyMath.
  Source : OS V15 §16 D-063, D-064 — *"Le cent est une
  unité de vérité. Le ppm est une unité de taux."*

- Le waterfall est calculé correctement pour chaque talent :
  coefficient LOI LINEUP-01, prorata surplus, commission
  floor(), net = brut − commission.
  Source : OS V15 D-049, LOI WATERFALL-01 — registres §D-049.

- LOI LEDGER-02 est vérifiée et bloquante avant event_sealed :
  Σnets + Σcommissions + roundingCents = prixVenduClientCents,
  résidu ≤ n talents, résidu vers 6591 (D-070).
  Source : OS V15 §16, registres D-069.

- Les 6 verrous anti-double payout D-101 sont actifs avant
  tout Transfer Stripe réel.
  Source : OS V15 registres §D-101.

- CommissionRatePpm résolu depuis MembershipPlan en base
  (jamais hardcodé).
  Source : OS V15 D-027.

- LedgerRepository est append-only, jamais de PUT sur un
  enregistrement existant.
  Source : OS V15 LOI GREFFIER-01, registres D-038.

- LOI LEDGER-01 respectée : revenus MR reconnus uniquement
  à l'archivage (4530 → 7110).
  Source : OS V15 registres D-038.

Ce domaine bloque tout le reste si :

- MoneyMath contient des Math.floor libres dans le code
  métier — violation D-063, erreurs d'arrondi non tracées.
  Source : OS V15 D-063.

- LOI LEDGER-02 non vérifiée à event_sealed : l'argent
  encaissé ne balance pas avec les obligations — le
  système distribue des fonds non équilibrés.
  Source : OS V15 D-069.

- D-101 non respecté : un double payout est possible —
  erreur financière irréversible.
  Source : OS V15 D-101 — registres.

──────────────────────────────────────────────────
2. ÉTAT ACTUEL DOCUMENTÉ

Ce qui existe et fonctionne selon les documents :

- MoneyMath : complet et conforme D-063/D-064. Cinq
  fonctions — depositAmount(), balanceDue(), applyRatePpm(),
  prorataCents(), lineupCoefficientPpm(). Chacune valide
  l'entier avant de procéder, lève une erreur explicite sur
  float, aucun Math.floor libre hors ce module.
  Source : MoneyMath.js — commentaire EXCEPTION UNIQUE.

- SealingGuard : calcule le waterfall complet à
  deposit_secured → event_sealed. Vérifie LOI LINEUP-01
  (coefficient), LOI LINEUP-02 (talent gratuit →
  freeWeightCents=100), LOI LEDGER-02 (résidu ≤ n talents),
  plancher contractuel par talent. Retourne ContractSnapshot
  phase 2 avec le waterfall immuable.
  Source : SealingGuard.js — logique complète lisible.

- LedgerInvariantGuard : vérifie LOI LEDGER-02 avant
  payable→settled (GUARD 4 dans transitionEngagement).
  Double-check du waterfall : Σnets + Σcommissions +
  rounding = prixVenduClientCents, tolérance ≤ n talents,
  résidu tracé vers 6591 avec direction et note.
  Vérifie aussi la cohérence interne :
  cachetBrutFinalCents = talentNetCents + commissionMrCents.
  Source : LedgerInvariantGuard.js — COVERED_TRANSITIONS.

- PayoutExecutor : 6 verrous D-101 implémentés dans l'ordre.
  Verrou 1 (status=payable), Verrou 2 (idempotency — pas
  de PayoutExecutionRecord existant), Verrou 3 (Settlement-
  Instruction présente + non consommée + montant cohérent),
  Verrou 4 (KYC=VERIFIED), Verrou 5 (double-check
  LedgerInvariant interne), Verrou 6 (Stripe Transfer avec
  idempotency key). Post-payout : crée PayoutExecutionRecord,
  marque SettlementInstruction consommée, append LedgerRecord
  payout_executed compte 4310.
  Source : PayoutExecutor.js — executePayoutBatch() complet.

- LedgerRepository : append-only enforced (pas de UPDATE
  dans le module), validation amountCents entier >= 0,
  systemId LDG- vérifié. Auto-génération du systemId si
  absent (aligné avec PayoutExecutor qui ne le fournit pas).
  Source : LedgerRepository.js append().

- MembershipPlanService : résout le tauxPpm depuis
  MembershipPlan en base via repositories.membership.
  Fail-closed si plan absent ou taux invalide.
  Cinq plans canoniques documentés en commentaire.
  Source : MembershipPlanService.js.

- PaymentRepository : interfaces pour StripePaymentSignal,
  PayoutExecutionRecord (sous-objet payoutExecutionRecords
  aligné avec interface PayoutExecutor), SettlementInstruction
  (markConsumed), WebhookProcessedLog, EventPaymentRequest.
  Source : PaymentRepository.js — exports incluant sous-objets
  d'interface PayoutExecutor.

- Tests P0 couverts : SEALING-01 (SealingGuard complet),
  PAYOUT-SETTLED-01 (7 cas dont idempotency et KYC),
  NOSHOW-REFUND-01, DEPOSIT-FAIL-01, BALANCE-DEADLINE-01,
  CANCELLATION-01, CONTESTATION-WINDOW-01 — tous listés dans
  les 16/16 PASSED du Plan Implantation.
  Source : Plan Implantation "16/16 tests P0 verts".

- GROSS_ACCEPTED validé comme modèle V3 par défaut.
  Commission prélevée sur cachet brut, jamais ajoutée
  par-dessus. NET_GUARANTEED interdit au MVP.
  Source : registres D-055 — *"GROSS_ACCEPTED. Le talent
  accepte un cachet brut."*

Ce qui vient de V1 et est encore actif :

- INFÉRENCE : V1 (microrave.ca) avait des paiements
  manuels / semi-manuels sans waterfall structuré. V3
  reconstruit ce domaine from scratch — aucun code V1
  identifié dans ce périmètre. Avantage : pas de dette
  d'arrondi héritée.

Ce qui vient de V2 et a survécu :

- V2 abandonnée. Aucune dette identifiée dans ce domaine.

──────────────────────────────────────────────────
3. LACUNES IDENTIFIÉES

BLOQUANT (empêche la première transaction) :

- BLOQUANT-B1 — MoneyMovementRouter absent du code.
  D-049 et le registre D-RAIL-01 l'exigent explicitement :
  *"Tout mouvement sans rail rejeté."* Interdit absolu #17
  (registres §D-107). Aucun fichier MoneyMovementRouter.js
  trouvé dans src/. PayoutExecutor appelle StripeAdapter
  directement sans passer par ce routeur.
  Source : registres D-049, D-107, RAIL-01.
  NUANCE : Pour SC-01 mono-talent chemin nominal, l'absence
  du routeur ne bloque pas mécaniquement l'exécution —
  PayoutExecutor fonctionne sans lui. Mais l'OS le classe
  comme interdit absolu. STATUT : POTENTIELLEMENT BLOQUANT
  selon interprétation stricte de D-107. À trancher par
  le fondateur avant Event 0A.

- BLOQUANT-B2 — Écritures ledger de réception (dépôt +
  solde) absentes. SealingGuard calcule le waterfall et
  retourne ContractSnapshot phase 2 mais n'écrit aucune
  LedgerRecord DR 5200 / CR 4310 / CR 4530 / CR 4410 / CR
  4420 (D-038 Phase 1). PayoutExecutor écrit uniquement
  DR 4310 / CR 5100 (Phase 2 payout). La réception du
  paiement ne produit aucune écriture comptable traçable.
  LOI LEDGER-01 (revenu différé 4530 jusqu'à archivage)
  non vérifiable sans ces entrées.
  Source : registres D-038 Phase 1, LOI LEDGER-01.
  NUANCE : L'invariant zéro cent (LOI LEDGER-02) est vérifié
  par LedgerInvariantGuard AVANT payout — la décision de
  payer est saine. Mais le ledger comptable ne reflète pas
  les encaissements intermédiaires. Pour Event 0A pilote,
  c'est acceptable sous SoloFounderOverride documenté.
  Bloquant pour Event 0B (DATAACCESS-WRITE-01 requis).

- BLOQUANT-B3 — Taxes TPS/TVQ absentes du waterfall
  SealingGuard. D-038 montre CR 4410 TPS + CR 4420 TVQ
  lors de la réception du paiement. SealingGuard ne calcule
  ni ne stocke ces montants dans ContractSnapshot phase 2.
  La formule D-049 §ÉTAPE 6 (TPS = commission_MR_totale ×
  taux_TPS) n'est pas implémentée dans SealingGuard ni dans
  LedgerInvariantGuard. PolicyConfig a tps_ppm et tvq_ppm
  comme configs, mais SealingGuard ne les lit pas.
  Source : registres D-038, D-049 §ÉTAPE 6, D-059.
  NUANCE : TaxConfig concerne les taxes sur la commission MR
  (service courtier). Micro Rave est en dessous du seuil
  d'inscription obligatoire selon D-053. Pour Event 0A
  avec un montant symbolique, l'impact est nul. Bloquant
  à partir du moment où Micro Rave atteint le seuil
  d'inscription ou facture les taxes au client.

DÉGRADANT (réduit la qualité, n'empêche pas) :

- DÉGRADANT-B1 — D-068 (méthode des plus grands restes
  pour lineup multi-talent) non implémentée. SealingGuard
  utilise prorataCents() avec floor() pour tous les
  talents. Pour 2 talents ou plus, un résidu systématique
  de 1¢ peut ne pas être distribué selon D-068. Non-bloquant
  pour SC-01 mono-talent DJ Alex.
  Source : Plan Implantation §3.3, registres D-068.

- DÉGRADANT-B2 — LOI LEDGER-01 (reconnaissance du revenu
  à l'archivage 4530→7110) non implémentée dans
  ArchiveWORMGuard. Le guard vérifie ledgerBalanced mais
  ne produit pas les écritures de reconnaissance du revenu.
  Cela ne bloque pas le payout mais crée un ledger
  comptablement incomplet.
  Source : registres D-038 Phase 2, LOI LEDGER-01.

- DÉGRADANT-B3 — SellerCommission (D-036/D-049) absente
  du waterfall SealingGuard. LOI SELLER-01 : seller_commission
  = commission_MR_totale × seller_rate. SealingGuard
  calcule uniquement les montants talent + commission MR.
  Si un vendeur est attaché à l'Engagement, sa commission
  n'est pas calculée ni gravée dans ContractSnapshot phase 2.
  Non-bloquant pour Event 0A si pas de vendeur impliqué.
  Source : registres D-036, D-049 §ÉTAPE 7.

- DÉGRADANT-B4 — PaymentFeeVarianceRecord (compte 6119,
  D-060-A) non implémenté. L'écart entre frais Stripe
  estimés (prixVenduClientCents inclut la marge Stripe) et
  frais réels n'est pas tracé. Non-bloquant pour Event 0A.
  Source : registres D-060-A.

REPORTABLE (peut attendre l'événement 2+) :

- D-053 AnnualTalentPaymentSummary et T4A : données à
  collecter dès MVP mais génération automatique post-MVP.
  Source : registres D-053.

- TaxRemittanceRecord semi-automatique (D-059) : remises
  TPS/TVQ. Applicable seulement après dépassement du seuil
  d'inscription. Source : registres D-059.

- RoundingReconciliationRecord (D-070) : réconciliation
  mensuelle du compte 6591. Non critique pour Event 0A.
  Source : registres D-070.

ANGLE MORT POTENTIEL :

- SettlementInstruction : PayoutExecutor exige une
  SettlementInstruction présente et non consommée (Verrou 3).
  Aucun service ni guard ne crée cette SettlementInstruction
  dans le code visible. D-047 la définit (engagementId,
  decisionRecordId, allocatedCents, consumedAt). Qui la
  crée ? À quel moment ? Le Plan Implantation ne la mentionne
  pas comme livrable manquant. INFÉRENCE NON DOCUMENTÉE —
  à valider : est-elle créée par PresenceProofGuard ou
  manuellement par le fondateur pour Event 0A ?

- SealingGuard — freeWeightCents : le commentaire TODO
  est explicite : *"TODO : passer via getConfig(
  'free_weight_cents') quand PolicyConfig branché."*
  La valeur 100 est défaut hardcodé. PolicyConfig a la
  config correspondante en base (policy-config-schema.js).
  Le branchement n'est pas fait. Pour SC-01 mono-talent
  payant, ce TODO est sans impact (aucun talent gratuit).
  INFÉRENCE NON DOCUMENTÉE pour SC-01 multi-talent avec
  talent gratuit.

──────────────────────────────────────────────────
4. DETTE HÉRITÉE

Neutre : V3 repart de zéro sur la finance. La dette vient
des contradictions V2 résolues explicitement : D-031 remplacé
par D-049 (double comptage surplus commercial), CT-006 résolu
(base commission), CT-014 résolu (no-show avec coefficient).
Ces corrections sont documentées, les erreurs passées sont
toutes fermées dans les registres.

Dette active documentaire : SealingGuard cite
*"Source : OS V10 section 4.2"* au lieu de OS V14/V15 pour
LOI LEDGER-02. Commentaire obsolète — pas d'impact fonctionnel
car la logique est correcte, mais peut induire en erreur.
Source : SealingGuard.js L. ~220 commentaire LOI LEDGER-02.

──────────────────────────────────────────────────
5. DELTA VERS COMPLÉTUDE

Pour la première transaction (SC-01, DJ Alex, mono-talent,
sans vendeur, sans taxes facturées) : trancher la question
MoneyMovementRouter (BLOQUANT-B1 — interdit absolu D-107 ou
exception fondateur Event 0A), créer la SettlementInstruction
avant le payout (angle mort critique — rien dans le code
ne la génère), et accepter que les écritures d'encaissement
ledger (BLOQUANT-B2) et les taxes (BLOQUANT-B3) soient
reportées à Event 0B sous SoloFounderOverride documenté.

──────────────────────────────────────────────────
6. STATUT FINAL

☑ PRÊT SOUS CONDITIONS

Conditions :
  C1 — Décision fondateur sur MoneyMovementRouter :
       interdit absolu appliqué (implémenter avant Event 0A)
       ou exception Event 0A documentée (SoloFounderOverride).
  C2 — Créer la SettlementInstruction manuellement pour
       DJ Alex avant d'appeler payable→settled
       (angle mort non documenté — qui la crée ?).
  C3 — Accepter BLOQUANT-B2 et B3 sous SoloFounderOverride
       documenté pour Event 0A. Les résoudre avant Event 0B.

──────────────────────────────────────────────────
7. DÉPENDANCES SORTANTES

- Domaine C (Stripe et paiements) dépend de ce domaine
  pour que PayoutExecutor produise des LedgerRecords
  corrects après Transfer Stripe. Le Verrou 5 de D-101
  valide le waterfall — si LOI LEDGER-02 est fausse,
  le payout est bloqué.
  Source : PayoutExecutor.js Verrou 5 + D-101.

- Domaine A (Ontologie) dépend de ContractSnapshot phase 2
  produit par SealingGuard — si le waterfall est erroné,
  toute la chaîne aval (PresenceProofGuard, PayoutExecutor,
  LedgerInvariantGuard) opère sur des données fausses.
  Source : OS V15 §2.7 Moment 3.

- Domaine I (UX et vérité perçue) dépend de ce domaine
  pour afficher la ventilation D-024 (cachet signé → brut
  final → commission → net) avant acceptation. Si le
  waterfall n'est pas calculé correctement, la ventilation
  affichée est mensongère. Source : registres D-024, D-084.

- Domaine G (Admin et sécurité) dépend des LedgerRecords
  corrects pour que LedgerCodeMap soit auditables.
  LedgerCodeMap classifié CRITIQUE (double validation
  fondateur uniquement). Source : registres D-060,
  Admin Authority Matrix.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FIN DE LA FICHE — B. FINANCE ET LEDGER
Conserver pour le Prompt de Synthèse.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━