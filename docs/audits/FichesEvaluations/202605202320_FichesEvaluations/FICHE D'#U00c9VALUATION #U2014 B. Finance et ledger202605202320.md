━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FICHE D'ÉVALUATION — B. Finance et ledger
(waterfall, invariant zéro cent, arrondi, commission)
Date d'évaluation : 20 mai 2026
Documents sources :
  • MICRORAVE_V3_OPERATING_SYSTEM_V15.md (OS V15 — source souveraine)
  • EXPORT_BRUT—REGISTRES_SOUVERAINS_MICRO_RAVE_V3.md
    (D-028/D-030/D-034/D-035/D-038/D-049/D-060/D-061–D-070/D-101)
  • MoneyMath.js · SealingGuard.js · LedgerInvariantGuard.js
  • PayoutExecutor.js · config/policy-config-schema.js
  • tests/p0/ : SEALING-01, PAYOUT-SETTLED-01, POLICYCONFIG-FAILCLOSED-01
    (exécutés en direct)
Niveau de confiance : HAUTE sur les calculs de base (SealingGuard/LedgerInvariantGuard)
                      PARTIELLE sur le waterfall multi-talent (D-068 non implémenté)
                      INFÉRENCE sur les écritures ledger comptables (Base44, non vérifiable)
──────────────────────────────────────────────────
1. CRITÈRES DE COMPLÉTUDE

Ce domaine est prêt pour la première transaction quand :

- MoneyMath est l'unique couche de calcul numérique — aucun
  Math.round/floor/ceil libre dans le code métier — D-063,
  EXPORT_BRUT section D-063
- Toutes les unités sont en centimes (entiers) + taux en ppm
  — D-064, EXPORT_BRUT section D-061
- SealingGuard construit le ContractSnapshot phase 2 avec le
  waterfall complet (coefficient, cachet_brut_final_i, commission,
  net) — D-035 + D-049, EXPORT_BRUT sections D-035/D-049
- LOI LEDGER-02 vérifiée à event_sealed :
  sum(nets) + sum(commissions) + rounding = prix_vendu_client
  — D-069, EXPORT_BRUT section D-069
- LOI LINEUP-01 vérifiée : coefficient = max(1, prix_vendu /
  total_lineup_effectif) — D-028, EXPORT_BRUT section D-028
- LOI LINEUP-02 vérifiée : talent gratuit → freeWeightCents
  — D-030, EXPORT_BRUT section D-030
- LOI LINEUP-03 vérifiée : EPR bloquée si prix < total signé
  — D-034, EXPORT_BRUT section D-034
- D-101 (6 verrous anti-double payout) exécutés dans l'ordre
  à payable→settled — EXPORT_BRUT section D-101
- Résidu d'arrondi tracé vers compte 6591 avec
  RoundingReconciliationRecord — D-070, EXPORT_BRUT section D-070
- PolicyConfig fail-closed : tps_ppm, tvq_ppm,
  payment_fees_tax_treatment, deposit_ratio_ppm en database
  et lisibles — D-032/D-042/D-065, EXPORT_BRUT sections D-032/D-042

Ce domaine bloque tout le reste si :

- LOI LEDGER-02 n'est pas vérifiée à event_sealed — le WORM W2
  peut être gravé avec un déséquilibre comptable — D-069
- Les configs critiques (tps_ppm, tvq_ppm,
  payment_fees_tax_treatment) sont absentes de la database —
  POLICYCONFIG-FAILCLOSED-01 test output (fail-closed obligatoire)
- Un paiement Stripe réel double est possible si D-101 non
  respecté — D-101, EXPORT_BRUT

──────────────────────────────────────────────────
2. ÉTAT ACTUEL DOCUMENTÉ

Ce qui existe et fonctionne selon les documents :

MoneyMath.js — Opérationnel et conforme D-063/D-064.
  • depositAmount(), balanceDue(), applyRatePpm(),
    prorataCents(), lineupCoefficientPpm() — 5 fonctions,
    toutes avec validation d'entiers, arrondi floor centralisé,
    exception levée si paramètre invalide — source : MoneyMath.js.
  • Aucun Math.round/floor/ceil libre hors MoneyMath.js dans le
    code métier vérifié (transitionEngagement.js, SealingGuard.js,
    LedgerInvariantGuard.js, EventPaymentGuard.js).

SealingGuard.js — Implémenté (non-placeholder).
  • Vérifie : dépôt reçu, balance reçue, LOI LINEUP-01 (coefficient
    via MoneyMath.lineupCoefficientPpm), LOI LINEUP-02 (freeWeightCents
    configurable), LOI LEDGER-02 (roundingCents ≤ lineupEntries.length).
  • Construit et retourne ContractSnapshot phase 2 avec waterfall
    complet : cachetBrutFinalCents, commissionMrCents, talentNetCents
    pour chaque talent — source : SealingGuard.js lignes 177–288.
  • Testé en isolation (via node -e) : cas nominal 1 talent
    PASSED, calculs exacts (250$, coefficient 1.25, net 22000¢,
    commission 3000¢, rounding 0).

LedgerInvariantGuard.js — Opérationnel.
  • Vérifie LOI LEDGER-02 sur les transitions
    contestation_window→payable et payable→settled.
  • Vérifie cohérence interne : cachetBrutFinalCents =
    talentNetCents + commissionMrCents — source : LedgerInvariantGuard.js.
  • Trace le résidu vers compte 6591 avec direction CREDIT_MR/DEBIT_MR.

PayoutExecutor.js — 6 verrous D-101 implémentés.
  • Verrou 1 (status payable), Verrou 2 (idempotency via
    PayoutExecutionRecord), Verrou 3 (SettlementInstruction consumedAt null),
    Verrou 4 (KYC VERIFIED), Verrou 5 (LedgerInvariant), Verrou 6
    (Stripe idempotency key engagementId+talentUserId) — source :
    PayoutExecutor.js header + D-101.
  • STRIPE-J8-01 : 19/19 PASSED — source : exécution directe.

policy-config-schema.js — 20 configs définies avec types et
  catégories. Toutes les configs critiques documentées :
  tps_ppm (PPM), tvq_ppm (PPM), payment_fees_tax_treatment (ENUM),
  deposit_ratio_ppm (PPM), event_payment_cap_cents (CENTS),
  maxDistancePolicy (INTEGER), contestationWindowDurationHours (INTEGER),
  amendment_require_double_consent (BOOLEAN) — source : policy-config-schema.js.

Ce qui vient de V1 et est encore actif :
  V1 utilise Stripe en production — les taux Stripe et les flows
  de paiement sont éprouvés. ACQUIS : connexion Stripe Connect
  et KYC existants. DETTE : aucune traçabilité de type LedgerRecord
  ni LOI LEDGER-02 en V1 — les écritures comptables sont entièrement
  nouvelles en V3.

Ce qui vient de V2 :
  Néant. V2 abandonnée.

──────────────────────────────────────────────────
3. LACUNES IDENTIFIÉES

BLOQUANT (empêche la première transaction) :

- BLOQUANT-B1 — D-068 non implémenté dans SealingGuard :
  allocation par « méthode des plus grands restes » absente.
  SealingGuard utilise prorata floor (MoneyMath.prorataCents),
  ce qui produit un résidu d'arrondi de 1 centime pour un lineup
  de 2 talents (ex. 13333 + 26666 = 39999 ≠ 40000 sur prix
  vendu 40000¢) — source : exécution directe node -e,
  résultat rounding=1. D-068 exige explicitement
  « allocation par méthode des plus grands restes pour garantir
  sum(gross_final_i) = prix_vendu_client_cents » — EXPORT_BRUT
  section D-068.
  CONSÉQUENCE POUR SC-01 : 1 talent dans la Pierre de Rosette →
  résidu toujours 0, LOI LEDGER-02 respectée. Non-bloquant pour
  SC-01 spécifiquement. MAIS : pour tout event multi-talent,
  ce résidu serait tracé vers 6591 sans les plus grands restes —
  techniquement non conforme à D-068. INFÉRENCE : si le premier
  event est strictement 1 talent (DJ Alex), ce bloquant peut
  être reporté à l'événement 2+.
  → À valider par le fondateur : SC-01 a-t-il un seul talent ?

- BLOQUANT-B2 — POLICYCONFIG-FAILCLOSED-01 : FAILED (2 tests).
  Échec 1 : value_type 'BOOLEAN' dans le schéma (clé
  `amendment_require_double_consent`) — le test n'accepte que
  ['INTEGER','PPM','CENTS','STRING','ENUM'] — source : test
  ligne 86. La config schema définit 'BOOLEAN' mais le
  validateur du test ne le reconnaît pas.
  Échec 2 : validateCriticalConfigs() retourne
  CRITICAL_CONFIG_MISSING pour tps_ppm, tvq_ppm,
  payment_fees_tax_treatment, event_payment_cap_cents,
  maxDistancePolicy — les configs critiques ne sont pas
  seeded en database — source : test output.
  CONSÉQUENCE : SealingGuard.getConfig('tps_ppm') et
  getConfig('tvq_ppm') retournent null → taxes calculées à 0
  → ContractSnapshot phase 2 fiscalement incorrect → WORM W2
  gravé sans les taxes.

- BLOQUANT-B3 (hérité du Domaine A) — Casse de fichier Linux
  dans transitionEngagement.js bloque SEALING-01 et
  PAYOUT-SETTLED-01 — source : Fiche A.
  Les tests P0 financiers critiques ne s'exécutent pas.
  SealingGuard est implémenté mais non validé bout-en-bout
  via transitionEngagement().

DÉGRADANT (réduit la qualité, n'empêche pas) :

- Waterfall multi-talent non validé bout en bout (D-068
  non implémenté, D-044 non testé). Pour SC-01 mono-talent :
  non critique. Pour tout event 2+ talents : résidu systématique
  de 1 centime par talent, tracé vers 6591 mais non conforme
  à la méthode des plus grands restes.

- LOI LEDGER-01 (reconnaissance différée du revenu en 4530 →
  7110 à archivage) non testée. Aucune suite de tests P0 ne
  vérifie les écritures comptables phases 1 et 2 du D-038 —
  source : analyse des 16 tests P0. INFÉRENCE : pas de test
  dédié au plan comptable (4310, 4530, 7110, etc.).

- Seller commission (SellerCommissionPolicy, LOI SELLER-01,
  D-036) — non implémentée et non testée. Aucun fichier
  SellerCommissionGuard ou SellerCommissionService dans le code.

- TaxLiabilityAllocation (D-049 ÉTAPE 6-9 : TPS + TVQ +
  frais Stripe + total payeur) — calcul présent dans le
  waterfall doctrinal mais non validé si les configs sont
  absentes (voir BLOQUANT-B2). Si tps_ppm = null, la taxe
  est 0, ce qui fausse le total payeur.

REPORTABLE (peut attendre l'événement 2+) :

- D-067 (arrondi seller commission) — reportable car seller
  commission non implémentée MVP.
- D-043 (cancelled_J7 coefficient forcé à 1) — reportable
  si l'event 1 ne s'annule pas à J-7.
- SC-05/SC-06 waterfall d'annulation (LOI ANNULATION-01/02)
  — reportable pour event 1.
- AnnualTalentPaymentSummary + T4A — source : EXPORT_BRUT
  section fiscalité talent. Post-MVP.
- LOI DISPUTE-01 et SC-08-PARTIEL financier complet —
  reportable post-event 1.

ANGLE MORT POTENTIEL :
→ INFÉRENCE NON DOCUMENTÉE : L'OS V15 et le EXPORT_BRUT
  documentent le plan comptable complet (D-038/D-060), mais
  aucun LedgerRecord entity n'est visible dans le code V3
  livré — ni dans src/services/, ni dans src/repositories/.
  PayoutExecutor appelle repositories.ledgerRecords?.append()
  (optionnel avec ?.) — source : PayoutExecutor.js.
  Si repositories.ledgerRecords est absent à l'appel, les
  écritures ledger sont silencieusement ignorées. Les comptes
  4310, 4530, 7110 ne reçoivent aucune écriture réelle.
  À valider : existe-t-il un LedgerRecord adapter Base44
  opérationnel non inclus dans le zip ?

──────────────────────────────────────────────────
4. DETTE HÉRITÉE

De V1 : aucune comptabilité formelle. V1 utilise Stripe comme
  source de vérité — pas de plan comptable, pas de 4310/4530/7110.
  La transition vers le double-entry bookkeeping de V3 est une
  rupture totale. DETTE : habitude de lire directement les
  montants Stripe plutôt que les LedgerRecords.

De Base44 : les configs PolicyConfig existent en database
  mais ne sont pas seeded avec les valeurs de production
  (tps_ppm, tvq_ppm, etc.) — source : BLOQUANT-B2. Le seed
  manuel est requis avant le premier event.

De l'architecture hors-sandbox : SealingGuard lit les configs
  via PolicyConfigRepository → Base44 adapter → HTTP 403
  (hors sandbox). En test isolation (node -e), le fallback
  à null est utilisé (freeWeightCents=100, etc.), ce qui masque
  les valeurs manquantes. En production réelle, si la config
  est absente, le guard fail-closed — comportement correct
  mais non testé dans l'environnement CI.

──────────────────────────────────────────────────
5. DELTA VERS COMPLÉTUDE

Seeder les configs critiques en database (tps_ppm, tvq_ppm,
payment_fees_tax_treatment, deposit_ratio_ppm,
event_payment_cap_cents), corriger value_type 'BOOLEAN' →
'INTEGER' (ou aligner le validateur), corriger la casse Linux
dans transitionEngagement.js pour débloquer SEALING-01 et
PAYOUT-SETTLED-01, et valider que repositories.ledgerRecords
est branché dans la couche d'appel Base44.

──────────────────────────────────────────────────
6. STATUT FINAL

☑ EN COURS → ~65% estimé

Justification :
  Calculs (MoneyMath) : 100% — conforme D-063/D-064
  Waterfall mono-talent (SC-01) : 95% — SealingGuard opérationnel,
    LOI LEDGER-02 vérifiée, D-068 non-bloquant pour 1 talent
  Waterfall multi-talent : 60% — D-068 non implémenté
  Configs critiques en database : 0% — non seeded (BLOQUANT-B2)
  LedgerRecord persistence réelle : INCONNUE — non vérifiable
  Tests P0 financiers exécutables : 40% (SEALING-01/PAYOUT-SETTLED-01
    bloqués par casse Linux hérité de Domaine A)

──────────────────────────────────────────────────
7. DÉPENDANCES SORTANTES

- C. Stripe Connect / Paiement ne peut pas être validé bout
  en bout sans les configs tps_ppm/tvq_ppm/deposit_ratio_ppm
  en database — source : EventPaymentGuard + SealingGuard
  ÉTAPE 6-9 D-049.

- D. SOTS et réputation dépend d'un waterfall correctement
  scellé (event_sealed → WORM W2) pour que les conditions
  de payout post-SOTS soient financièrement cohérentes —
  source : OS V15 section 2.7 tableau D-014 Moment 3.

- E. Archivage global dépend du ledger équilibré à
  settled→archived (LOI LEDGER-02 + LedgerRecord persisté)
  — source : OS V15 section 2.7.1 ArchiveWORMGuard.

- INFÉRENCE : Tout domaine utilisant PolicyConfigRepository
  pour lire un taux financier (tps_ppm, tvq_ppm, stripe_ppm,
  deposit_ratio_ppm) sera bloqué en production tant que le
  seed database n'est pas exécuté — à valider.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FIN DE LA FICHE — B. Finance et ledger
Conserver cette fiche pour le Prompt de Synthèse.