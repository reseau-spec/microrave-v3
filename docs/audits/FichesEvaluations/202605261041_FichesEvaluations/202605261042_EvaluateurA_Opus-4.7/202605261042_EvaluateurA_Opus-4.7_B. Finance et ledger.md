━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FICHE D'ÉVALUATION — B. Finance et ledger
Date d'évaluation : 26 mai 2026 10:59 EST
Fait avec Opus 4.7 Adaptatif
Documents sources :
  • docs/os/MICRORAVE_V3_OPERATING_SYSTEM_V15.md (§2.7, §2.7.1,
    §14.9, §16.1)
  • docs/os/EXPORT_BRUT…REGISTRES_SOUVERAINS_MICRO_RAVE_V3.md
    (D-028, D-038, D-049, D-058, D-069, D-070)
  • codeBase44_v3/base44/functions/{createEngagement,
    transitionEngagement, executePayoutTransfer,
    recognizeRevenue}/entry.ts
  • codeBase44_v3/base44/entities/{LedgerRecord, LedgerCodeMap,
    RoundingReconciliationRecord, SettlementInstruction,
    PayoutExecutionRecord, Engagement}.jsonc
  • codeBase44_v3/dataBase/*.csv (143 LedgerRecord, 115 LedgerCodeMap,
    36 PolicyConfig, 24 Engagement, 1 SettlementInstruction,
    1 PayoutExecutionRecord, 0 RoundingReconciliationRecord)
  • microrave-v3/src/core/guards/{SealingGuard,
    LedgerInvariantGuard}.js
  • 20260526-1030_RAPPORT-AUDIT-FORENSIQUE.md — FICHIER VIDE
    (0 octet, INCONNU)
Niveau de confiance : HAUTE (calculs invariants effectués sur
    le ledger persisté ; lecture directe des entrées
    PolicyConfig)
──────────────────────────────────────────────────
1. CRITÈRES DE COMPLÉTUDE

   Ce domaine est prêt pour la première transaction quand :

   • LOI LEDGER-02 (zéro cent) appliquée comme guard préalable
     à event_sealed ET à payable→settled :
     sum(talent_net_payable_i) + sum(commission_MR_i)
       + rounding_adjustment_cents = prix_vendu_client_cents
     — Source : D-069 « LOI LEDGER-02 », EXPORT_BRUT §BLOC 7 ;
       OS V15 §2.7.1 ligne `deposit_secured → event_sealed`
       (« LOI LINEUP-01/02 vérifiées · LOI LEDGER-02 vérifiée »)
       et ligne `payable → settled` (« LOI LEDGER-02 respectée ·
       zéro cent »).
     Phrase canonique : « Le résidu peut naître dans le calcul ;
     il doit mourir dans l'écriture ledger. »

   • LOI WATERFALL-01 (D-049) appliquée à l'event_sealed :
     ÉTAPE 1 : coefficient = max(1, prix_vendu_client /
                                    total_lineup_effectif)
     ÉTAPE 2 : cachet_brut_final_i =
                  cachet_effectif_signé_i × coefficient
     ÉTAPE 3 : commission_MR_i =
                  cachet_brut_final_i × taux_effectif_snapshot_i
     ÉTAPE 4 : talent_net_payable_i =
                  cachet_brut_final_i − commission_MR_i
     — Source : D-049, EXPORT_BRUT §BLOC 4

   • LOI LINEUP-02 (D-030) : convention 1$ symbolique pour talent
     gratuit (freeWeightCents) appliquée au calcul du coefficient.
     — Source : D-030, EXPORT_BRUT §BLOC 3

   • LOI LEDGER-01 (D-038) : aucun revenu MR reconnu avant
     archived. La commission vit en 4530 (passif différé) ;
     elle passe en 7110 (revenu) à l'archivage seulement.
     — Source : D-038, EXPORT_BRUT §BLOC 4

   • D-070 : toute écriture au compte 6591 (ajustement
     d'arrondi) doit produire un RoundingReconciliationRecord
     traçable. « 6591 est une loupe, pas une poubelle. »
     — Source : D-070, EXPORT_BRUT §BLOC 7

   • CT-014 (clarification SC-07) : base de remboursement
     no-show = ContractSnapshot phase 2 (cachet_brut_final_i,
     WORM W2). Le coefficient n'est pas recalculé.
     — Source : OS V15 §CT-014 + §16.1 LOI NO-SHOW-01 précisée

   • Le cas canonique Pierre de Rosette doit boucler à zéro cent :
     « 200$ signé · coefficient 1.0 · taux X% · net calculé au
     centime → Livres = 0 · LEDGER-02 respecté ».
     — Source : OS V15 §14.9 Carte C03

   Ce domaine bloque tout le reste si :

   • L'invariant LOI LEDGER-02 n'est pas vérifié AVANT scellement.
     « Si invariant non respecté → LEDGER_BALANCE_VIOLATION →
     event_sealed bloqué. »
     — Source : D-069, EXPORT_BRUT §BLOC 7
     Conséquence : ledger non balanced ⇒ aucune confiance dans
     les montants payés ⇒ payout interdit.

──────────────────────────────────────────────────
2. ÉTAT ACTUEL DOCUMENTÉ

   Ce qui existe et fonctionne selon les documents :

   • Plan comptable LedgerCodeMap V4 seedé en base de production
     avec les 15 comptes clés actifs :
       4110 ACTIF (créances clients) · 4190 (frais Stripe différés) ·
       4310 PASSIF (talent payable) · 4325/4326 (TPS/TVQ tiers) ·
       4335 (clearing temporaire) · 4410/4420 (TPS/TVQ MR) ·
       4530 (revenus différés MR) · 5100/5200 (Stripe dispo/
       en attente) · 6110 (frais Stripe) · 6591 (rounding) ·
       6690 (charges fiscales absorbées) · 7110 (revenu MR).
     — Source : dataBase/LedgerCodeMap_export.csv (115 entrées,
       103 ACCOUNT actives, 6591 présent)

   • PolicyConfig de base seedée (36 entrées) :
       tps_ppm = 50000 (5,000 %) · tvq_ppm = 99750 (9,975 %) ·
       stripe_ppm = 29000 (2,900 %) · stripe_fixe_cents = 30 ·
       deposit_ratio_ppm = 200000 (20 %) · free_weight_cents = 100
       · payment_fees_tax_treatment = DEBOURS ·
       event_payment_cap_cents = 350000.
     — Source : dataBase/PolicyConfig_export.csv

   • LedgerRecord entité riche : 27 champs dont transactionGroupId,
     financialStatement (BILAN/RESULTAT/FLUX/MEMO), economicEvent
     (placement_engagement, encaissement_depot…), flowCode,
     reconciliationKey, idempotency via systemId LDG-*.
     — Source : entities/LedgerRecord.jsonc

   • Le placement waterfall createEngagement écrit 3 lignes
     équilibrées dès la création de l'Engagement :
       DR 4110 cachetSigneCents
       CR 4310 talentNetCents
       CR 4530 commissionMrCents
     LOI LEDGER-02 structurellement satisfaite (DR=CR par
     construction puisque cachetSigne = talentNet + commission).
     — Source : createEngagement/entry.ts l.144-220

   • executePayoutTransfer applique les 6 verrous D-101 dans
     l'ordre strict (V1 état payable → V2 idempotence
     PayoutExecutionRecord → V3 SettlementInstruction non
     consommée + amount match → V4 KYC VERIFIED + stripeAccountId
     → V5 invariant ledger (Σ 4310 CR ≥ talentNetCents) → V6
     Stripe Transfer avec Idempotency-Key).
     — Source : executePayoutTransfer/entry.ts l.86-260

   • recognizeRevenue écrit 4530 DR / 7110 CR à l'archivage
     avec idempotence (re-lookup LedgerRecord
     transactionType='revenue_recognition'). Respecte LOI
     LEDGER-01.
     — Source : recognizeRevenue/entry.ts l.99-171

   • État réel de l'invariant sur les 143 LedgerRecord persistés :
       — 53 TransactionGroup uniques
       — 53/53 équilibrés (Σ DR = Σ CR par TXG)
       — Global : Σ DR = Σ CR = 1 506 329 ¢ — Δ = 0 ¢
     LOI LEDGER-02 vérifiée empiriquement sur le ledger
     existant.
     — Source : calcul direct sur LedgerRecord_export.csv

   • SealingGuard portable (microrave-v3/src/core/guards/) calcule
     complètement le waterfall multi-talent : coefficient,
     prorata, plancher contractuel, residual rounding, et
     retourne un ContractSnapshot phase 2 riche.
     — Source : src/core/guards/SealingGuard.js l.177-280

   • LedgerInvariantGuard portable applique LOI LEDGER-02 avec
     tolérance « ≤ nombre de talents » centimes, vérifie
     cohérence interne du waterfall, et marque le résidu
     pour 6591 (D-070).
     — Source : src/core/guards/LedgerInvariantGuard.js l.129-184

   Ce qui vient de V1 et est encore actif :

   • Non documenté dans les fichiers soumis. L'OS V15 ne décrit
     aucun ledger V1.
     → INFÉRENCE : aucun héritage V1 sur le plan comptable.
       À valider par le fondateur.

   Ce qui vient de V2 et a survécu :

   • Le ledger porte une cicatrice V2/V3 visible :
       — 33 lignes `backfill_placement`
       — 24 lignes `correction_waterfall_4335_to_4110`
       — 21 lignes `retroactive_pierre_de_rosette`
       —  5 lignes `reversal_pierre_de_rosette`
       —  3 lignes `fiscal_absorption_pilote`
     Soit 86 lignes (60 % des 143) de correction/backfill/
     reversal. Les tentatives passées ont laissé un sillage
     append-only que l'invariant a su digérer mais qui prouve
     qu'aucune transaction n'a passé du premier coup.
     — Source : dataBase/LedgerRecord_export.csv

──────────────────────────────────────────────────
3. LACUNES IDENTIFIÉES

   BLOQUANT (empêche la première transaction) :

   • Mono-talent hardcodé dans createEngagement : la ligne
     `prixVenduClientCents: cachetSigneCents` (entry.ts l.137)
     impose coefficient = 1 et waterfall sans Lineup. Tout cas
     multi-talent — y compris le Pierre de Rosette mono-talent
     mais avec coefficient ≠ 1 — est hors atteinte. LOI
     WATERFALL-01 ne peut pas être appliquée.
     — Source : codeBase44_v3/.../createEngagement/entry.ts l.137
     — Violation de D-049 (LOI WATERFALL-01) et D-028
       (LOI LINEUP-01)

   • L'invariant LEDGER-02 n'est PAS vérifié comme guard avant
     event_sealed dans le code Base44. La transition
     deposit_secured→event_sealed (entry.ts l.93-132) appelle
     `guardBalancePayment` qui — si aucun EPR balance n'existe —
     retourne `passed: true` avec un warning
     « SoloFounderOverride actif ». Aucun appel à LedgerInvariantGuard,
     aucun calcul Σ nets + Σ commissions = prix_vendu_client.
     — Source : codeBase44_v3/.../transitionEngagement/entry.ts
       l.100-107
     — Violation OS V15 §2.7.1 ligne `deposit_secured → event_sealed`
       (« LOI LEDGER-02 vérifiée · Moment WORM 3 »)

   • La preuve empirique de la lacune précédente est en base :
     l'Engagement ENG-WE66GU-AASWFD est à status `event_sealed`
     alors que son ledger conserve un solde net 4110 = +80 000 ¢
     (créance organisateur non éteinte — balance jamais encaissée).
     Le ContractSnapshot phase 2 censé sceller le WORM financier
     n'existe pas (Domaine A). Le scellement a eu lieu sur un
     mensonge financier.
     — Source : dataBase/Engagement_export.csv + LedgerRecord_
       export.csv ; ENG-WE66GU-AASWFD = 5 lignes ledger, type
       placement_engagement + encaissement_depot uniquement.

   • L'invariant LEDGER-02 (la version complète) n'est PAS
     vérifié au moment du payout dans Base44. executePayoutTransfer
     V5 ne contrôle que `Σ(4310 CR) ≥ talentNetCents` pour le talent
     payé — pas la formule canonique D-069 « Σ nets + Σ commissions
     + rounding = prix_vendu_client ». Sur un cas multi-talent ou
     avec coefficient ≠ 1, un résidu non détecté peut transiter.
     — Source : codeBase44_v3/.../executePayoutTransfer/entry.ts
       l.196-215

   • payable → settled bypasse transitionEngagement.
     executePayoutTransfer ligne 343 fait
     `base44.entities.Engagement.update(eng.id, { status: 'settled',
     ... })` directement. Idem pour settled → archived dans
     recognizeRevenue ligne 174. La porte unique exigée par
     l'OS §2.7.1 est court-circuitée précisément aux deux
     transitions les plus sensibles financièrement.
     — Source : executePayoutTransfer/entry.ts l.343-347 ;
       recognizeRevenue/entry.ts l.174-178
     — Violation OS V15 §2.7.1 (« Toute mutation du champ status
       d'un Engagement est interdite sauf via la fonction
       souveraine transitionEngagement »)

   • Intégrité référentielle compromise sur l'unique
     PayoutExecutionRecord persisté :
       — PayoutExecutionRecord.engagementId = ENG-MPIG0BUZ-N084HN
         (avec chiffre 0)
       — Engagement.systemId réel = ENG-MPIGOBUZ-N084HN
         (avec lettre O)
     L'alphabet IDFactory exclut explicitement 0 et O ; ces deux
     chaînes ne devraient pas pouvoir coexister. 31 LedgerRecord
     pointent vers la variante « 0 » et 5 vers la variante « O ».
     Cette dérive interdit toute reconstruction propre des comptes
     par engagement.
     — Source : dataBase/PayoutExecutionRecord_export.csv +
       Engagement_export.csv + LedgerRecord_export.csv ; alphabet
       IDFactory observé dans createEngagement/entry.ts l.44
       (`ABCDEFGHJKLMNPQRSTUVWXYZ23456789`)
     → Cette lacune est aussi un signal pour le Domaine H,
       mais ses conséquences financières sont directes : les
       agrégats par engagementId tombent à côté du sujet.

   DÉGRADANT (réduit la qualité, n'empêche pas) :

   • createEngagement écrit le waterfall sans TPS/TVQ ni 4190
     (frais Stripe différés), contrairement à la Phase 1 décrite
     dans D-038. Le `payment_fees_tax_treatment = DEBOURS` en
     PolicyConfig peut justifier l'absence (le payeur règle les
     frais), mais l'OS D-038 décrit explicitement CR 4410/4420
     dès la réception du paiement.
     — Source : D-038 (EXPORT_BRUT) vs createEngagement/entry.ts
       l.144-220
     → INFÉRENCE : cohérent avec le régime DEBOURS, mais à
       valider explicitement par le fondateur que le Pierre de
       Rosette n'exige aucune ligne TPS/TVQ.

   • Le LedgerInvariantGuard portable, qui implémente correctement
     LOI LEDGER-02 + cohérence waterfall + traçabilité 6591,
     n'est pas branché au backend Base44. Le code est écrit mais
     mort en production. Réduit la qualité du contrôle sans
     bloquer le mono-talent coefficient 1.0.

   REPORTABLE (peut attendre l'événement 2+) :

   • 0 RoundingReconciliationRecord en base. 0 ligne 6591 dans
     les 143 LedgerRecord. D-070 n'est donc jamais activé.
     Tant que le premier event canonique est mono-talent à
     coefficient 1.0 (taux ppm rond → pas de résidu attendu),
     reportable. À durcir dès le premier multi-talent ou taux
     non rond.
     — Source : dataBase (recherche 6591 et fichier
       RoundingReconciliationRecord_export.csv absent)

   • L'entité RoundingReconciliationRecord Base44 est anémique
     (4 champs : systemId, engagementId, roundingCents, createdAt).
     Pas de transactionGroupId, pas d'actor, pas de justification.
     Insuffisant pour D-070 (« écriture traçable ») mais sans
     impact tant qu'aucun résidu n'est généré.
     — Source : entities/RoundingReconciliationRecord.jsonc

   ANGLE MORT POTENTIEL :

   Le cas canonique Pierre de Rosette (§14.9) impose
   « coefficient 1.0 ». Mais l'OS V15 ne précise pas s'il faut
   un Lineup à 1 talent + 1 entrée freeWeightCents = 0 ou un
   Lineup à 1 talent sans gratuité. Le code Base44, qui hardcode
   prixVenduClient = cachetSigne et ignore Lineup, masque la
   question. SealingGuard portable lève l'ambiguïté : un Lineup
   à 1 entrée non gratuite produit toujours coefficient = 1
   (LINEUP-01). Mais l'OS ne documente pas explicitement le
   minimum de Lineup.
   → INFÉRENCE NON DOCUMENTÉE : un Engagement isolé est-il
     un Lineup à 1 ligne, ou un cas sans Lineup ? L'objet Lineup
     existe (LBY-*), mais aucune ligne en base ne s'y rattache.
     À trancher par le fondateur — affecte la portabilité vers
     les futurs cas multi-talent.

──────────────────────────────────────────────────
4. DETTE HÉRITÉE

   Le ledger porte la cicatrice de la Pierre de Rosette V2 :
   31 LedgerRecord sous ENG-MPIG0BUZ-N084HN (variante 0) avec
   types `retroactive_pierre_de_rosette` (21), `reversal_pierre_
   de_rosette` (5), `fiscal_absorption_pilote` (3), `int_capture`
   (2). Cinq autres lignes sous ENG-MPIGOBUZ-N084HN (variante O)
   en `backfill_placement` et `correction_waterfall_4335_to_4110`.
   Cette dette est paradoxale : elle PROUVE que LOI LEDGER-02
   tient append-only même après corrections (tous les TXG sont
   balanced), mais elle PROUVE aussi que la première tentative
   réelle a été reversed. La V3 n'a pas hérité d'une trésorerie
   ni d'une commission reconnue — seulement d'une mémoire
   d'échec balanced.

──────────────────────────────────────────────────
5. DELTA VERS COMPLÉTUDE

   Pour que le domaine soit prêt : (i) brancher SealingGuard et
   LedgerInvariantGuard portables dans la transition Base44
   deposit_secured→event_sealed (avec création réelle du
   ContractSnapshot phase 2, donc résolution préalable du
   bloqueur Domaine A), (ii) remplacer dans createEngagement la
   ligne `prixVenduClientCents: cachetSigneCents` par une
   construction depuis Lineup réel avec coefficient calculé, ou
   à défaut documenter en OS le mode mono-talent comme cas
   spécial conforme, (iii) faire passer payable→settled et
   settled→archived par transitionEngagement (suppression des
   `Engagement.update` directs dans executePayoutTransfer et
   recognizeRevenue), (iv) résoudre la dérive O/0 sur
   ENG-MPIG[O0]BUZ-N084HN avant toute reprise de ce dossier.

──────────────────────────────────────────────────
6. STATUT FINAL

   ☑ BLOQUÉ PAR → Domaine A (ontologie).

   Le coeur de Domaine B — l'invariant LEDGER-02 vérifié comme
   guard — exige un ContractSnapshot phase 2 (W2) comme source de
   vérité (sum nets, sum commissions, prix_vendu). Tant que
   Domaine A ne produit pas de CS2 réel et persisté, le
   LedgerInvariantGuard reste sans entrée et le SoloFounderOverride
   demeure le seul mode de scellement.

   Estimation indicative hors règle 3 :
     — Plan comptable et PolicyConfig : 100 % seedés.
     — Waterfall placement mono-talent : 100 % fonctionnel.
     — Verrous payout D-101 V1–V6 : 100 % codés.
     — Reconnaissance revenu LOI LEDGER-01 : 100 % codée.
     — LOI LEDGER-02 vérifiée empiriquement post-fait : 100 %
       (Σ DR = Σ CR sur 53/53 TXG).
     — LOI LEDGER-02 vérifiée comme guard préalable : 0 %
       (SoloFounderOverride en lieu et place).
     — LOI WATERFALL-01 / LINEUP-01 multi-talent : 0 %
       (mono-talent hardcodé).
   Effectif fonctionnel pour première transaction réelle : 0 %
   tant que CS2 n'est pas exigible.

──────────────────────────────────────────────────
7. DÉPENDANCES SORTANTES

   • Domaine C (Stripe et paiements) consomme directement la
     LOI LEDGER-02 : webhook stripe payment_intent.succeeded
     déclenche deposit_pending → deposit_secured, et la
     prochaine transition vers event_sealed exige LEDGER-02
     vérifiée.
     — Source : OS V15 §2.7.1 lignes EventPaymentGuard +
       SealingGuard

   • Domaine I (UX et vérité perçue) requiert la « ventilation
     avant acceptation » — c'est-à-dire un waterfall lisible
     côté UI dérivé du même calcul LOI WATERFALL-01. Sans le
     waterfall correct côté backend, l'UX affiche un mensonge.
     — Source : OS V15 §1.4 « Au talent : ce que tu acceptes
       est transparent. Tu vois exactement ce que tu recevras
       avant d'accepter. »

   • Domaine G (Admin) — RoundingReconciliationRecord (D-070)
     fait partie des registres protégés et exige
     DataAccessLedgerEntry pour toute écriture. Hors-scope
     tant que 6591 inactif, mais redevient bloquant en
     multi-talent.
     — Source : EXPORT_BRUT §BLOC 7 D-070 ; OS V15 §16.1

   • Domaine H (Portabilité) — la dérive O/0 sur
     ENG-MPIG[O0]BUZ-N084HN est une violation d'intégrité
     référentielle qui empêche l'export propre du registre
     financier. L'IDFactory devait l'empêcher.
     — Source : alphabet IDFactory dans createEngagement/entry.ts
       l.44 ; constat data dans LedgerRecord_export.csv
     → INFÉRENCE : la dérive vient probablement d'une saisie
       manuelle ou d'un script de correction. À valider.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FIN DE LA FICHE — B. Finance et ledger
Fiche conservée en mémoire de session pour Prompt de Synthèse.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━