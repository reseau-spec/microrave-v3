FICHE D'ÉVALUATION — B. FINANCE ET LEDGER
Date d'évaluation : 22 mai 2026 06:44 EST
Fait par Claude Opus 4.7
Documents sources : OS V15 (MICRORAVE_V3_OPERATING_SYSTEM_V15.md), EXPORT_BRUT Registres Souverains (D-038, D-039 à D-046, D-049, D-060 à D-070, D-101, D-117), Plan d'Implantation 2026-05-21, code src/core/MoneyMath.js (147 l.), src/core/guards/SealingGuard.js (294 l.), src/core/guards/LedgerInvariantGuard.js (202 l.), src/core/guards/EventPaymentGuard.js (318 l.), src/core/guards/NoShowGuard.js, src/core/guards/CancellationGuard.js, src/core/guards/EngagementAmendmentGuard.js, src/services/PayoutExecutor.js (318 l.), src/services/SignalConsumerService.js (241 l.), src/repositories/LedgerRepository.js (141 l.), src/repositories/PaymentRepository.js, src/repositories/ContractSnapshotRepository.js, config/policy-config-schema.js, scripts/seed-policy-config.js, 10 tests P0 financiers.
Niveau de confiance : HAUTE sur l'arithmétique (MoneyMath, invariant LEDGER-02 du waterfall) ; PARTIELLE sur le câblage ledger (présence du code, absence de production d'écritures); INFÉRENCE sur les calculs de taxes/Stripe en amont.
──────────────────────────────────────────────────
1. CRITÈRES DE COMPLÉTUDE
Ce domaine est prêt pour la première transaction quand :

Tous les montants sont en entiers de centimes et tous les taux en ppm, sans exception — D-061 (FinancialNumericStandard) : "Le dollar est une unité d'affichage. Le cent est une unité de vérité. Le ppm est une unité de taux." + D-064 : interdiction de amount: 1000.00, commissionRate: 0.19, sotsScore: 4.1.
Aucun arrondi artisanal dans le code métier — D-063 : "Toutes les règles d'arrondi vivent dans RoundingPolicyConfig. Tous les calculs financiers passent par MoneyMath. Aucun Math.round, Math.floor, Math.ceil libre dans le code métier."
La commission MR utilise floor() et le net talent est le reste protégé — D-064 : commission_MR_i = floor(gross_final_i × effective_rate_ppm / 1_000_000) et talent_net_i = gross_final_i − commission_MR_i. Phrase canonique : "Le net talent n'est pas un deuxième calcul; c'est le reste protégé."
LOI LEDGER-02 vérifiée au scellement et avant payout — D-069 : sum(talent_net_payable_i) + sum(commission_MR_i) + rounding_adjustment_cents = prix_vendu_client_cents. Phrase canonique : "Le résidu peut naître dans le calcul; il doit mourir dans l'écriture ledger." Si violé → LEDGER_BALANCE_VIOLATION → event_sealed bloqué.
Tout résidu d'arrondi est tracé vers le compte 6591 par un RoundingReconciliationRecord — D-070 : "6591 est une loupe, pas une poubelle. Toute écriture vers 6591 exige un RoundingReconciliationRecord traçable."
Le compte 6119 est utilisé pour les écarts réels de frais processeur avec PaymentFeeVarianceRecord — D-060-A : "6591 = ajustements d'arrondi mathématique interne. 6119 = écarts réels de frais processeur. Toute écriture vers 6119 exige un PaymentFeeVarianceRecord."
Les écritures Phase 1 D-038 sont produites à la réception du paiement : DR 5200 Stripe en attente · DR 4190 Frais Stripe différés · CR 4310 Talent payable (net) · CR 4530 Revenus différés (commission) · CR 4410 TPS · CR 4420 TVQ — D-038 + LOI LEDGER-01.
Les écritures Phase 2 D-038 sont produites à l'archivage : DR 4310 · DR 4530 · DR 6110 · CR 5100 · CR 7110 · CR 4190 — D-038. Phrase canonique LOI LEDGER-01 : "Aucun revenu n'est reconnu tant que l'Engagement n'est pas archivé. La commission MR vit en 4530 (passif — revenu différé) jusqu'à archivage. Elle passe en 7110 (revenu) uniquement à l'archivage."
Le ledger est append-only — LOI GREFFIER-01 + en-tête LedgerRepository.js : "Aucun DELETE. Aucun UPDATE sur un record existant. Le ledger est la vérité financière immuable. Toute correction passe par une écriture compensatoire, jamais par modification."
Le mode commission est GROSS_ACCEPTED : le talent accepte un cachet brut, la commission MR est calculée sur ce brut, le net est le reste — D-062. NET_GUARANTEED interdit MVP.
Les configs financières fail-closed : si une config (TPS, TVQ, deposit_ratio_ppm, stripe_ppm, payment_fees_tax_treatment, balanceDeadlineDays, event_payment_cap_cents) est absente, le système refuse de calculer — D-042 + D-063 + D-127.
Les 6 verrous D-101 anti-double payout sont armés sur payable→settled — D-101 + EXPORT_BRUT D-101.
Les frais Stripe refacturés au payeur utilisent ceil() et les frais absorbés par MR utilisent les comptes 6110/6115/6116/6119/6120/6130/6140 — D-066. "Micro Rave ne sous-collecte jamais."

Ce domaine bloque tout le reste si :

Un seul LEDGER_BALANCE_VIOLATION non résolu existe — D-069 : "event_sealed bloqué".
Une écriture financière passe en dehors du ledger append-only — viole LOI GREFFIER-01.
Les configs critiques (payment_fees_tax_treatment, tps_ppm, tvq_ppm, event_payment_cap_cents, balanceDeadlineDays, etc.) ne sont pas seedées en base — sortie observée du test POLICYCONFIG-FAILCLOSED-01 : "Le système ne peut pas démarrer sans ces valeurs."

──────────────────────────────────────────────────
2. ÉTAT ACTUEL DOCUMENTÉ
Ce qui existe et fonctionne selon les documents :

MoneyMath.js est conforme à D-063 / D-064 — 5 fonctions exportées : depositAmount(), balanceDue(), applyRatePpm(), prorataCents(), lineupCoefficientPpm(). Le commentaire en-tête déclare : "EXCEPTION UNIQUE : MoneyMath.js lui-même (ce fichier) est le seul endroit autorisé à appeler Math.floor directement." Validation systématique de tous les arguments comme entiers (Number.isInteger), applyRatePpm borne ratePpm ∈ [0, 1_000_000], lineupCoefficientPpm impose le plancher 1_000_000 ppm (LOI LINEUP-01) — code l. 132-145.
SealingGuard construit le ContractSnapshot phase 2 complet avec waterfall, totaux, coefficient ppm, surplusPool et résidu — code l. 197-279. La structure retournée contient waterfall[].cachetSigneCents/cachetBrutFinalCents/commissionMrCents/talentNetCents/tauxPpm, totalNets, totalCommissions, coefficientPpm, roundingCents, surplusPoolCents, freeWeightCents. Vérifié par le test SEALING-01 : 19/19 PASSED le 22 mai 2026.
LOI LEDGER-02 vérifiée à trois endroits indépendants :

SealingGuard.js l. 234-250 — vérification à la sortie du scellement.
LedgerInvariantGuard.js l. 129-150 — guard 4 sur toutes les transitions financières contestation_window→payable, performed→payable, payable→settled (code l. 38-42).
PayoutExecutor.verifyLedgerInvariant() l. 284-312 — verrou 5 D-101 avant tout stripe.transfers.create.

Les trois utilisent la même tolérance : Math.abs(residuCents) ≤ waterfall.length (1 centime par talent).
Le plancher contractuel est protégé — SealingGuard.js l. 208-216 : si cachetBrutFinalCents < cachetSigneCents → LINEUP_FLOOR_VIOLATED. Conforme à LOI LINEUP-02.
L'invariant prix encaissé ≈ prix vendu est vérifié au scellement — SealingGuard.js l. 136-144 : tolérance ±2 centimes sur (depositReceivedCents + balanceReceivedCents) − prixVenduClientCents. Conforme à D-066 (frais Stripe ±2¢).
EventPaymentGuard calcule le dépôt via MoneyMath — code l. 140 : depositCents = MoneyMath.depositAmount(totalCents, depositRatioPpm). Vérifie le plafond eventPaymentCapCents (l. 123-129, conforme OS V10 section 9.6). Lecture fail-closed de balanceDeadlineDays via repositories.policyConfig.getConfig() (l. 219-238).
PayoutExecutor implémente les 6 verrous D-101 dans l'ordre canonique :

V1 : engagementStatus === 'payable'
V2 : payoutExecutionRecords.findByEngagementAndTalent() absent
V3 : SettlementInstruction présente + consumedAt === null + amountCents === talentNetCents
V4 : KYCStatus === VERIFIED via StripeConnectService.getTalentPaymentProfile()
V5 : verifyLedgerInvariant(contractSnapshotPhase2)
V6 : StripeAdapter.createTransfer() avec idempotency key engagementId+talentUserId

Test PAYOUT-SETTLED-01 : 7/7 PASSED — "L'argent bouge maintenant. payable→settled = preuve avant irréversibilité."
NoShowGuard implémente LOI NO-SHOW-01 + CT-014 — code l. 299-300 : écritures DR 4310 cachetNetFinalCents (annulation dette talent) et CR 4530 commissionMrCents (MR conserve commission). Test NOSHOW-REFUND-01 : 16/16 PASSED.
CancellationGuard implémente LOI ANNULATION-01/02 (D-039/D-040). Test CANCELLATION-01 : 5/5 PASSED — "Phase 2.3 validée : CancellationGuard opérationnel. Placeholder éliminé."
EngagementAmendmentGuard implémente le calcul delta D-147 avec écritures DR 4310 / CR 4530 / CR 6591 (code l. 371-385). Test AMENDMENT-01 : 14/14 PASSED.
LedgerRepository.append() enforce le standard numérique — refuse amountCents non-entier ou négatif (l. 86-91) et exige LDG-* préfixe. Auto-génération du systemId si absent (l. 79). Aucun champ updatedAt — immuable dès création (commentaire l. 96).
LedgerRepository.appendRoundingRecord() est défini (l. 126-134) — endpoint Base44 /entities/RoundingReconciliationRecord disponible.
Tri chronologique garanti sur findByEngagementId() (l. 108) et findByEventId() (l. 118) : ASC sur createdAt. Permet à LedgerInvariantGuard de lire l'ordre des écritures.
20 configs financières seedables dans config/policy-config-schema.js : stripe_ppm (29000), stripe_fixe_cents (30), payment_fees_tax_treatment (DEBOURS CRITIQUE), tps_ppm (50000), tvq_ppm (99750 CRITIQUE), free_weight_cents, event_payment_cap_cents, deposit_ratio_ppm, balanceDeadlineDays, etc.
Test POLICYCONFIG-FAILCLOSED-01 valide le comportement fail-closed — vérifie que getConfig() lève POLICY_CONFIG_MISSING sur clé absente (3 assertions PASSED) et que validateCriticalConfigs() liste exactement les configs critiques manquantes. (L'échec observé dans l'environnement d'audit est dû à Host not in allowlist sur Base44 — comportement attendu en sandbox, pas un défaut de code.)

Ce qui vient de V1 et est encore actif :

Aucun composant financier hérité de V1. La recherche exhaustive sur microrave.ca + finance/ledger/Stripe/paiement dans docs/ retourne uniquement la mention OS V15 "Aucune modification dans les sections financières" (référence à V11, version interne de l'OS V3). LedgerCodeMap V3 (D-060) est explicitement "V3" et porte l'ajout V3 du compte 6119 (D-060-A). MoneyMath, PayoutExecutor, SealingGuard sont du code V3 natif.

Ce qui vient de V2 et a survécu :

Rien. Aucune trace de comptabilité, ledger ou paiement V2 dans les documents. Cohérent avec la déclaration du fondateur "V2 abandonnée faute de fondations" — la finance est précisément l'une de ces fondations.

──────────────────────────────────────────────────
3. LACUNES IDENTIFIÉES
BLOQUANT (empêche la première transaction) :

Aucun service ne produit les écritures Phase 1 D-038 à deposit_pending → deposit_secured. L'OS D-038 exige six écritures simultanées à la réception du paiement : DR 5200 (Stripe en attente), DR 4190 (Frais Stripe différés), CR 4310 (Talent payable net), CR 4530 (Revenus différés commission), CR 4410 (TPS à remettre), CR 4420 (TVQ à remettre). Vérification du code :

EventPaymentGuard.validateDepositConfirmation() retourne seulement schedulerTask (code l. 255-267) — aucune écriture ledger.
SignalConsumerService.processOneSignal() appelle transitionEngagement() puis engagements.updateEngagementStatus() — aucun appel à repositories.ledger.append().
grep -rnE "ledger\.append|ledgerRecords\.append" dans src/ retourne uniquement deux usages : PayoutExecutor.js l. 212 (DR 4310 sur payout_executed) et EngagementAmendmentService.js (delta amendment). Aucune écriture sur l'encaissement initial.
Source de l'identification : D-038 + EventPaymentGuard.js + SignalConsumerService.js. Conséquence directe : à event_sealed, le ledger Base44 est vide. LOI LEDGER-01 ("La commission MR vit en 4530 jusqu'à archivage") ne peut pas être respectée — il faudrait que 4530 existe en base.


Aucun service ne produit les écritures Phase 2 D-038 à settled → archived. PayoutExecutor produit uniquement DR 4310 payout_executed (code l. 212-222). Manquent : DR 4530 → CR 7110 (passage revenu différé → revenu reconnu), DR 6110 → CR 4190 (purge frais Stripe différés), CR 5100 (Stripe disponible). ArchiveWORMGuard produit seulement les écritures spécifiques au cas no_show_pre_event (montants 0$). Source : grep sur les comptes + ArchiveWORMGuard.js l. 243-246. Sans Phase 2, la commission MR ne devient jamais un revenu (7110) — viole LOI LEDGER-01.
RoundingReconciliationRecord jamais créé. LedgerRepository.appendRoundingRecord() est défini mais aucun appelant dans le code. LedgerInvariantGuard produit roundingNote.ledgerAccount = '6591' (code l. 152-165) mais ne le persiste pas. D-070 exige : "Toute écriture vers 6591 exige un RoundingReconciliationRecord traçable." Si un résidu d'arrondi existe (probable pour tout prixVenduClient non multiple parfait du tauxPpm), il est calculé mais non tracé. Pour DJ Alex à 200$ rond avec coefficient 1.0 : résidu probable 0¢ (cas trivial) → non-bloquant si scénario canonique parfait, mais fragile dès qu'un montant non-rond apparaît.
Aucun calcul de TPS / TVQ / frais Stripe en amont du SealingGuard. Le SealingGuard accepte prixVenduClientCents comme une donnée d'entrée et fait confiance à l'appelant pour qu'elle soit TTC. L'en-tête EventPaymentGuard.js l. 17-21 confirme : "CONTRAT D'INTERFACE — totalCents : totalCents = prix_vendu_client TTC = prix_vendu_HT + TPS + TVQ + frais_Stripe. C'est le montant réel encaissé sur la carte du client." grep -rnE "(tps|tvq|TPS|TVQ|stripe_ppm|stripe_fixe)" dans src/core/ retourne zéro occurrence de calcul actif (uniquement des commentaires). Les configs tps_ppm (99750 ppm = 9.975%), tvq_ppm, stripe_ppm sont dans le schéma de seed mais aucun service ne les lit. Source : config/policy-config-schema.js + recherche exhaustive src/. Conséquence pour la première transaction : si DJ Alex est payé 200$ net mais le client paie 200$ TTC, le ledger sera incohérent (TPS/TVQ non séparées des cachets). Si la décision est "DJ Alex 200$ flat, MR absorbe taxes", cette décision n'apparaît dans aucun document.

DÉGRADANT (réduit la qualité, n'empêche pas) :

Tolérance LOI LEDGER-02 = waterfall.length au lieu de 0¢ strict. D-069 dit "zéro cent d'écart". Le code (LedgerInvariantGuard.js l. 138-148, SealingGuard.js l. 242, PayoutExecutor.verifyLedgerInvariant() l. 300) accepte jusqu'à 1¢ par talent. Pour SC-01 mono-talent : tolérance 1¢ → 99,99% conforme. Le critère D-070 impose qu'un résidu non-nul produise un RoundingReconciliationRecord ; ce record n'est pas créé (voir BLOQUANT supra). La cohérence formelle exige soit (a) zéro résidu, soit (b) résidu + RoundingReconciliationRecord. Aucune des deux n'est garantie aujourd'hui.
PaymentFeeVarianceRecord jamais créé. D-060-A exige : "Toute écriture vers 6119 exige un PaymentFeeVarianceRecord." Aucun appel appendPaymentFeeVarianceRecord ni équivalent dans src/. Pour la première transaction sans écart processeur : non-bloquant. Pour Event 2+ : reportable.
Tolérance Stripe sur le dépôt = ±2¢ silencieuse (EventPaymentGuard.js l. 197-214). Si écart de 1 ou 2¢ : console.warn + acceptation. Aucune écriture vers 6119, aucun PaymentFeeVarianceRecord. D-066 dit "Micro Rave ne sous-collecte jamais" — mais ici on accepte 1-2¢ de sous-collection silencieuse.

REPORTABLE (peut attendre l'événement 2+) :

D-068 « largest remainder » non implémenté — Plan §3.3 confirme : "Non-bloquant pour SC-01 (DJ Alex seul). À implémenter avant tout event multi-talent." SealingGuard utilise MoneyMath.prorataCents() (floor) au lieu de l'allocation par méthode des plus grands restes.
Écritures dispute (disputed → payable / partially_settled / refunded) : DisputeResolutionGuard existe (test RESOLUTION-01 présent), mais le scénario nominal Pierre de Rosette ne déclenche aucune dispute. Non-bloquant pour SC-01.
D-046 / D-047 voies B et C (remboursements post-event tardifs) : non implémentées explicitement. Hors scope MVP nominal.

ANGLE MORT POTENTIEL :
Y a-t-il quelque chose que ce domaine requiert pour la première transaction que l'OS ne documente pas explicitement ?
→ OUI — quatre INFÉRENCES NON DOCUMENTÉES, à valider par le fondateur :

Quel acteur calcule le prixVenduClientCents TTC avant placed → deposit_pending ? L'OS définit la formule (prix_vendu_HT + TPS + TVQ + frais_Stripe) en commentaire de EventPaymentGuard.js, mais aucun service ou fonction nommée n'est citée comme producteur. INFÉRENCE : un PricingService.calculateTotal() est attendu mais absent. À valider : où vit le calcul TTC ? Dans l'UI ? Dans Base44 côté workflow ? Faut-il créer un PriceCalculatorService côté V3 ?
Où sont produites les écritures Phase 1 D-038 si ce n'est pas dans EventPaymentGuard.validateDepositConfirmation() ? Une possibilité : l'OS suppose que l'écriture ledger Phase 1 vit dans la fonction Base44 qui appelle transitionEngagement() — donc côté workflow Base44, pas côté V3 portable. Si c'est le cas, la portabilité D-128 est violée pour la finance (la vérité financière vit hors interface portable). À valider — décision architecturale majeure.
payment_fees_tax_treatment = DEBOURS : que cela implique-t-il concrètement sur les écritures ledger ? La config est CRITIQUE (fail-closed), mais aucune branche de code ne consomme cette valeur. INFÉRENCE : la doctrine fiscale québécoise existe en config, mais le code ne sait pas encore quoi en faire. À valider — quel service applique le traitement DEBOURS vs TAXABLE_SERVICE ?
Le compte 5100 (Stripe disponible) n'apparaît dans aucune écriture du code. PayoutExecutor produit DR 4310 (sortie talent payable) mais aucune CR 5100 correspondante. Comptablement : DR 4310 sans contrepartie laisse le bilan déséquilibré. L'OS D-038 attend DR 4310 / CR 5100. INFÉRENCE : soit la CR 5100 est implicite (l'écriture côté Stripe disponible se fait via un autre service de réconciliation bancaire à venir), soit le ledger V3 est en mode "partie simple" sur ces écritures. À valider — décision architecturale.

──────────────────────────────────────────────────
4. DETTE HÉRITÉE

De V1 : aucune dette financière, aucun acquis sur ce domaine. Une seule note Plan §3.1 cite "Adapter les pages existantes de V1 microrave.ca vers V3" pour l'UX (factures, ventilation), hors-domaine B.
De V2 : rien. Le domaine finance est précisément la "fondation absente" qui a conduit à l'abandon de V2 — il est entièrement reconstruit en V3.
De l'OS V3 lui-même : la doctrine financière est exceptionnellement bien documentée (D-038 à D-070 = 32 décisions formelles, LedgerCodeMap V3 complet, 6 lois LEDGER + ANNULATION + NO-SHOW + WATERFALL + DISPUTE). Accélération massive : MoneyMath, SealingGuard, LedgerInvariantGuard, PayoutExecutor sont écrits contre cette doctrine, non à côté. La distance entre la doctrine et le code n'est pas une dette de conception — c'est une dette de câblage (qui appelle quoi, qui écrit dans le ledger à quel moment).

──────────────────────────────────────────────────
5. DELTA VERS COMPLÉTUDE
Câbler la production des écritures ledger Phase 1 D-038 à deposit_pending → deposit_secured (et Phase 2 à settled → archived), créer le RoundingReconciliationRecord automatiquement quand roundingCents ≠ 0, faire calculer le prixVenduClientCents TTC (TPS + TVQ + frais Stripe) en amont du placed → deposit_pending par un service explicite, et obtenir validation fondateur sur les quatre INFÉRENCES non documentées.
──────────────────────────────────────────────────
6. STATUT FINAL
☒ EN COURS → environ 65 %
Décomposition de l'estimation :

✅ Arithmétique (MoneyMath, applyRatePpm, prorataCents, lineupCoefficientPpm) : 100 %
✅ Verrous LedgerInvariant à trois endroits indépendants : 100 %
✅ Construction du ContractSnapshot phase 2 (waterfall + coefficient + plancher) : 100 %
✅ 6 verrous D-101 anti-double payout : 100 %
✅ Écriture ledger payout_executed (DR 4310 partie simple) : 50 % (contrepartie 5100 manquante)
❌ Écritures Phase 1 D-038 (6 lignes simultanées à la réception du paiement) : 0 %
❌ Écritures Phase 2 D-038 (passage 4530→7110, purge 4190→6110) : 0 %
❌ Calcul TPS/TVQ/frais Stripe (les configs existent, le code ne les consomme pas) : 5 %
❌ Création automatique de RoundingReconciliationRecord : 0 % (repository méthode présente, appelant absent)
⚠ Tolérance ±1¢ par talent au lieu de 0¢ strict + RoundingRecord : conforme au code, non-conforme à D-069 lettrée

──────────────────────────────────────────────────
7. DÉPENDANCES SORTANTES

Domaine I (UX — ventilation talent D-024) ne peut pas afficher "cachet brut final → commission → net" tant que le ContractSnapshot phase 2 n'est pas persisté avec les bonnes valeurs — D-024 + D-084 (UXTruthProjection). Le code retourne le snapshot, mais comme noté en domaine A, la persistence reste à la charge de l'appelant.
Domaine I (UX — facture payeur 5 lignes D-025) : la facture canonique exige 5 lignes : prix vendu HT · TPS · TVQ · frais Stripe refacturés · total TTC. Sans calcul TPS/TVQ en amont, la facture ne peut pas être produite — source D-025.
Domaine G (Admin — DataAccessLedger) : chaque écriture ledger doit produire une DataAccessLedgerEntry (LOI TRANSITION-01). Aujourd'hui DAL écrit sur les transitions (transitionEngagement.js l. 370-402), pas sur les append ledger. INFÉRENCE NON DOCUMENTÉE : si LedgerRepository.append() doit aussi écrire dans DAL, ce n'est pas câblé.
Domaine C (Stripe et paiements) : domaine B dépend de C pour les webhooks payment_intent.succeeded (acompte) ET (INFÉRENCE) le webhook du paiement du solde. Le SignalConsumerService ne traite aujourd'hui que le premier — la chaîne ledger Phase 1 D-038 ne peut s'écrire que si C livre l'information du paiement complet.
Domaine F (Scheduler) : balance_deadline_check exécute (à J-6 si solde impayé) la transition deposit_secured → cancelled_J7 qui invoque CancellationGuard avec écritures ledger LOI ANNULATION-02. Sans scheduler armé, cette voie financière n'est pas atteignable automatiquement.
Domaine A (Ontologie) : LedgerInvariantGuard est appelé comme Guard 4 par transitionEngagement() — la machine d'état est la condition d'entrée de toute écriture ledger. Le domaine B dépend du domaine A à PRÊT.
Domaine H (Portabilité) : si une partie des écritures ledger vit dans Base44 workflow (INFÉRENCE §3 angle mort 2), D-128 ("Repository interfaces — si Micro Rave migre hors Base44, seul l'adapter change") est compromis. À valider.

→ INFÉRENCE non documentée explicitement dans l'OS : le domaine B est précurseur du domaine I (ventilation, facture, fonds protégés). Sans facture cinq lignes calculable, la promesse "Au payeur : fonds protégés, frais MR expliqués comme service de confiance" (D-085, D-086) n'a pas de support comptable. À valider que cette dépendance est consciente.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FIN DE LA FICHE — B. FINANCE ET LEDGER
Fiche conservée pour le Prompt de Synthèse.