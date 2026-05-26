━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FICHE D'ÉVALUATION — C. Stripe et paiements
Date d'évaluation : 26 mai 2026
Documents sources :
  • docs/os/MICRORAVE_V3_OPERATING_SYSTEM_V15.md (§2.6 D-014-A,
    §2.7.1 lignes EventPaymentGuard / payable→settled,
    §SC-DEPOSIT-FAIL)
  • docs/os/EXPORT_BRUT…REGISTRES_SOUVERAINS_MICRO_RAVE_V3.md
    (D-097 « 10 règles absolues », D-101 « 6 verrous »,
    D-098 fraude, R-PORTPRX précondition proxy)
  • codeBase44_v3/base44/functions/{stripeWebhookHandler,
    initiateDepositPayment, initiateBalancePayment,
    executePayoutTransfer}/entry.ts
  • codeBase44_v3/base44/entities/{TalentPaymentProfile,
    EventPaymentRequest, StripePaymentSignal, WebhookProcessedLog,
    PayoutExecutionRecord, SettlementInstruction}.jsonc
  • codeBase44_v3/dataBase/*.csv (10 WebhookProcessedLog,
    5 StripePaymentSignal, 2 TalentPaymentProfile,
    23 EventPaymentRequest, 1 SettlementInstruction,
    1 PayoutExecutionRecord)
  • microrave-v3/stripe-webhook-proxy/index.js (proxy fallback)
  • microrave-v3/tests/p0/{WEBHOOK-RAWBODY-01, STRIPE-J8-01,
    DEPOSIT-FAIL-01, PAYOUT-SETTLED-01, BALANCE-DEADLINE-01}.js
  • microrave-v3/.env.example + .gitignore
  • 20260526-1030_RAPPORT-AUDIT-FORENSIQUE.md — FICHIER VIDE
    (0 octet, INCONNU)
Niveau de confiance : HAUTE (10 webhooks réels traités, 1 payout
    Stripe Transfer réussi en base, signature/idempotence
    vérifiables sur trace)
──────────────────────────────────────────────────
1. CRITÈRES DE COMPLÉTUDE

   Ce domaine est prêt pour la première transaction quand :

   Les 10 règles D-097 (« Secrets Stripe ») sont satisfaites :
   • Aucun secret Stripe dans le code source
   • Environnements séparés dev/staging→test / prod→live
   • Secrets dans variables d'environnement plateforme uniquement
   • Rotation planifiée (SecretsRotationPolicyConfig) + rotation
     après incident
   • KYC Stripe Connect obligatoire avant payout (KYCStatus =
     VERIFIED)
   • Webhook signature validation obligatoire — raw body préservé
   • Idempotency obligatoire — WebhookProcessedLog
   • Restricted keys par usage (moindre privilège)
   • Aucune clé prod dans logs, UI, debug
   • Toute rotation = AdminAction + DataAccessLedgerEntry
     — Source : D-097, EXPORT_BRUT §BLOC 11

   Les 6 verrous D-101 sont armés au payout :
   • V1 : lockedByRunId — anti-double-exécution
   • V2 : Status check — Engagement.status admissible
   • V3 : PayoutExecutionRecord — si existant → no-op absolu
   • V4 : Stripe idempotency key — engagementId + "payout" +
         attempt_version
   • V5 : SettlementInstruction.consumedAt — consommable une fois
   • V6 : Invariant LEDGER-02 — si Dr ≠ Cr → LedgerImbalanceRecord
         + SYSTEM_HOLD → PayoutBlockReason : LEDGER_IMBALANCE
   • Règle invariante : « tout verrou déclenché = PayoutBlockReason
     créé avec code explicite. Jamais blocage silencieux. »
     — Source : D-101, EXPORT_BRUT §BLOC 12

   Webhook handler conforme à l'OS :
   • `deposit_pending → deposit_secured` : « Webhook Stripe
     payment_intent.succeeded reçu · acompte confirmé · Moment
     WORM 2 — liaison contractuelle verrouillée · SchedulerDueTask
     `balance_deadline_check` créée · surveillance solde activée
     · notifications progressives armées. »
     — Source : OS V15 §2.7.1 ligne EventPaymentGuard

   • `deposit_pending → deposit_failed` : « Webhook Stripe échec
     reçu · aucun fonds capturé · zéro écriture ledger · EPR.status
     = FAILED · SchedulerDueTasks = CANCELLED. »
     — Source : OS V15 §2.7.1 + SC-DEPOSIT-FAIL

   • `payable → settled` : « LOI LEDGER-02 respectée · zéro cent
     · Stripe payout confirmé · KYCStatus = VERIFIED. »
     — Source : OS V15 §2.7.1

   Précondition de portabilité (R-PORTPRX) :
   • Si Base44 ne peut pas valider le raw body Stripe → proxy
     webhook externe obligatoire avant argent réel. « Ce proxy
     est une précondition, pas un plan B. »
     — Source : EXPORT_BRUT ligne 2041, R-PORTPRX

   Tests P0 nommément exigés : WEBHOOK-SIG-02, WEBHOOK-IDEM-01,
   PAYOUT-BLOCK-KYC, DOUBLE-PAY-01, DOUBLE-PAY-02, PAYOUT-BLOCK-
   LEDGER, WEBHOOK-RAWBODY-01.
     — Source : D-097 et EXPORT_BRUT §Catégorie 3 (l.2663+)

   Ce domaine bloque tout le reste si :

   • Le webhook ne valide pas la signature avec raw body ou ne
     déduplique pas via WebhookProcessedLog → « impossibilité
     validation webhooks → migration accélérée Base44 ».
     — Source : EXPORT_BRUT l.2055
   • KYC non VERIFIED → payout interdit (D-097 rule 5).
   • Verrous D-101 incomplets → double-payout possible →
     conséquence financière irréversible.

──────────────────────────────────────────────────
2. ÉTAT ACTUEL DOCUMENTÉ

   Ce qui existe et fonctionne selon les documents :

   • Webhook validation signature HMAC-SHA256 implémentée sur
     raw body préservé (Deno `req.text()`) : extraction t= et v1=
     du header `stripe-signature`, recalcul HMAC, comparaison
     hex.
     — Source : stripeWebhookHandler/entry.ts l.73-88, l.363
     — Conforme D-097 rule 6

   • Idempotence niveau evt_* via WebhookProcessedLog : lookup
     par stripeEventId, retour immédiat si processingStatus =
     COMPLETED, sinon marquage IN_PROGRESS → COMPLETED en fin
     de dispatch.
     — Source : stripeWebhookHandler/entry.ts l.388-431
     — Conforme D-097 rule 7

   • Idempotence niveau ledger : fonction `ledgerAlreadyWritten`
     filtre LedgerRecord par reconciliationKey + economicEvent +
     direction='DEBIT' avant écriture.
     — Source : stripeWebhookHandler/entry.ts l.131-142

   • Stripe Idempotency-Key sur les écritures sortantes :
       — Checkout Session : `cs-deposit-${engagementId}` / `cs-
         balance-${engagementId}`
       — Transfer payout : `transfer-payout-${engagementId}-
         ${talentUserId}`
     — Source : initiateDepositPayment/entry.ts l.112-138 ;
       executePayoutTransfer/entry.ts l.225-244

   • Verrous D-101 partiellement implémentés dans
     executePayoutTransfer (V1 état · V2 PayoutExecutionRecord ·
     V3 SettlementInstruction présente, non consommée, montant
     match · V4 KYC VERIFIED + stripeAccountId · V5 partiel
     ledger · V6 Stripe Transfer avec Idempotency-Key).
     — Source : executePayoutTransfer/entry.ts l.86-260

   • Preuves opérationnelles en base :
       — 10 WebhookProcessedLog tous COMPLETED (5 checkout.session.
         completed + 5 payment_intent.succeeded)
       — 5 StripePaymentSignal persistés (toutes payment_intent.
         succeeded)
       — 2 TalentPaymentProfile dont 1 KYC = VERIFIED avec
         acct_1TaGqTKCWuw3ufQV, charges_enabled = true,
         payouts_enabled = true, details_submitted = true
       — 1 SettlementInstruction consommée + 1 PayoutExecutionRecord
         avec stripeTransferId tr_1TaHDt2eLVUrCnnJyDflLNEa
       — 23 EventPaymentRequest dont 3 succeeded
     — Source : dataBase/*.csv
     → Au moins UN payout Stripe Connect réel a été exécuté avec
       succès (le 23 mai 2026, 15:22:02). C'est un acquis
       opérationnel important — mais voir Domaine B §4 pour
       l'ID-drift O/0 qui désaligne cet artefact.

   • Proxy webhook externe disponible en repli (stripe-webhook-
     proxy/index.js) : express.raw, stripe.webhooks.constructEvent,
     Set d'idempotence, forwardToBase44 paramétré par
     PROXY_BASE44_ENDPOINT. Non déployé tant que WEBHOOK-RAWBODY-01
     PASSED.
     — Source : stripe-webhook-proxy/index.js + WEBHOOK-RAWBODY-01.js

   • Tests P0 codés : WEBHOOK-RAWBODY-01, STRIPE-J8-01 (couvre
     19 cas dont WEBHOOK-SIG-02, WEBHOOK-IDEM-01, PAYOUT-BLOCK-
     KYC, V1-V6, batch payout), DEPOSIT-FAIL-01, PAYOUT-SETTLED-01,
     BALANCE-DEADLINE-01.
     — Source : tests/p0/

   Ce qui vient de V1 et est encore actif :

   • microrave.ca (V1) ne disposait pas de Stripe Connect en
     marketplace. L'OS V15 §1 décrit V1 sans détail technique
     transposable.
     → INFÉRENCE : aucun héritage V1 sur le pipeline paiement.
       À valider par le fondateur.

   Ce qui vient de V2 et a survécu :

   • La doctrine D-097 (10 règles Stripe) et D-101 (6 verrous)
     sont des décisions V11/V12 que V3 hérite intégralement et
     dont l'implémentation est en cours d'alignement (voir
     lacunes ci-dessous). Acquis : la doctrine est ferme. Dette :
     les 6 verrous ne sont pas tous codés selon la lettre.

   • La trace ledger porte 23 EPR dont 20 en `pending` non
     succedés — héritage de tentatives V2/V3 abandonnées. Bruit
     opérationnel à nettoyer avant Event 1.
     — Source : dataBase/EventPaymentRequest_export.csv

──────────────────────────────────────────────────
3. LACUNES IDENTIFIÉES

   BLOQUANT (empêche la première transaction) :

   • Transition `deposit_pending → deposit_secured` bypasse
     transitionEngagement : le webhook handler fait
     `base44.entities.Engagement.update(eng.id, { status:
     'deposit_secured', ... })` directement (l.298-303). En
     conséquence, la SchedulerDueTask `balance_deadline_check`
     exigée par §2.7.1 (D-014-A) — « surveillance solde activée
     · notifications progressives armées » — n'est JAMAIS créée.
     LOI ANNULATION-02 (annulation automatique J-6 si solde
     impayé) est désarmée.
     — Source : stripeWebhookHandler/entry.ts l.297-304 ;
       OS V15 §2.7.1 EventPaymentGuard ; OS V15 §2.6 D-014-A

   • Le handler n'écoute que `payment_intent.succeeded` et
     `checkout.session.completed`. Les events suivants ne sont
     PAS dispatchés :
       — `payment_intent.payment_failed` — exigé par SC-DEPOSIT-
         FAIL pour la transition `deposit_pending → deposit_failed`
       — `account.updated` — pour la mise à jour KYC VERIFIED
         d'un TalentPaymentProfile post-onboarding (D-097 rule 5)
       — `charge.dispute.created` / `charge.refunded` —
         déclencheur du rail HOLD et chargeback_hold (D-098 +
         D-100 P0)
       — `transfer.failed` — réconciliation post-payout
     Conséquence : EPR resteront en `pending` indéfiniment sur
     échec, et un KYC qui passe de PENDING à VERIFIED via
     Stripe ne sera pas reflété en base.
     — Source : stripeWebhookHandler/entry.ts l.405-419 ;
       OS V15 §2.7.1 + SC-DEPOSIT-FAIL ; D-098, D-100

   • Transition `payable → settled` bypasse transitionEngagement :
     executePayoutTransfer fait Engagement.update direct
     (l.343-347) au lieu d'invoquer la fonction souveraine.
     LedgerInvariantGuard exigé par §2.7.1 n'est jamais évalué.
     — Source : executePayoutTransfer/entry.ts l.343-347
     — Violation OS V15 §2.7.1 (porte unique) + ligne
       `payable → settled` (LedgerInvariantGuard)

   • Verrou D-101 #6 implémentation partielle : V5 du code
     vérifie `Σ(LedgerRecord 4310 CR pour cet engagement) ≥
     talentNetCents` — pas la formule canonique LEDGER-02
     « Σ nets + Σ commissions + rounding = prix_vendu_client ».
     Sur mono-talent coefficient 1, l'approximation peut suffire ;
     sur tout cas multi-talent ou coefficient non rond, la
     vérification ne capte pas l'imbalance globale.
     — Source : executePayoutTransfer/entry.ts l.196-215
     — Violation D-101 verrou 6 (« si Dr ≠ Cr → LedgerImbalance
       Record + SYSTEM_HOLD »)

   • Verrou D-101 #1 (`lockedByRunId` — anti-double-exécution
     scheduler) ABSENT du code. executePayoutTransfer ne pose
     pas de lock avant exécution. Deux invocations simultanées
     du même engagement pourraient toutes deux passer V2 avant
     que l'une d'elles n'écrive son PayoutExecutionRecord (race
     read-before-write). Le verrou Stripe Idempotency-Key V4
     interceptera Stripe-side, mais la trace locale (
     PayoutExecutionRecord, SettlementInstruction.consumed) peut
     dégénérer.
     — Source : executePayoutTransfer/entry.ts (absence) ;
       D-101 rule 1

   • Entité `PayoutBlockReason` ABSENTE de Base44 entities.
     D-101 invariant : « tout verrou déclenché = PayoutBlockReason
     créé avec code explicite. Jamais blocage silencieux. » Le
     code renvoie un champ `blockReason` dans le JSON HTTP mais
     ne persiste aucun enregistrement, donc aucune trace
     append-only des blocages.
     — Source : codeBase44_v3/base44/entities/ (liste exhaustive) ;
       D-101 règle invariante

   • initiateDepositPayment autorise `accepted | placed |
     deposit_pending → deposit_pending` (l.63). Mais l'OS V15
     §2.7.1 ne liste que `placed → deposit_pending`. Le chemin
     `accepted → deposit_pending` court-circuite la transition
     `accepted → placed` (PlacementGuard, WORM W1).
     — Source : initiateDepositPayment/entry.ts l.63 ;
       OS V15 §2.7.1

   • Aucun `TalentPaymentProfile` automatiquement créé/maintenu
     par webhook `account.updated` : le seul profil VERIFIED en
     base a probablement été créé manuellement. Pour Event 1
     mono-talent (Pierre de Rosette) c'est circumvented, mais
     toute nouvelle inscription bloque payout.
     — Source : dataBase/TalentPaymentProfile_export.csv
       (2 entrées, une vide) ; D-097 rule 5

   DÉGRADANT (réduit la qualité, n'empêche pas) :

   • Si `STRIPE_WEBHOOK_SECRET` env var manquante, le handler
     renvoie 200 OK avec `warning: 'WEBHOOK_SECRET_MISSING'`
     (l.370-373). Stripe interprète 200 comme delivered et ne
     retentera pas — l'event est silencieusement perdu. Pour
     un Event 0 pilote ce risque est marginal mais en
     production un 500 (forçant retry) serait plus sûr.
     — Source : stripeWebhookHandler/entry.ts l.370-373

   • Comparaison HMAC `p.slice(3) === hexMac` (l.86) non
     constant-time. Vecteur de timing attack théorique sur la
     signature. Mineur en pratique car HMAC-SHA256 sur secret
     long-aléatoire est résistant, mais s'écarte de la bonne
     pratique standard.

   • `markEprSucceeded` ne marque qu'un seul EPR `pending`
     (l.225-237) ; si plusieurs pending coexistent (le « EPR
     fantôme » documenté en commentaire de transitionEngagement),
     les autres resteront pending et apparaîtront comme dette
     dans l'UI.
     — Source : stripeWebhookHandler/entry.ts l.225-237 ;
       data : ENG-H5V66Q-WBJ7N2 phase balance a 2 EPR (pending
       + succeeded) — preuve empirique du cas non-résolu.

   • Le fichier `.env` est présent dans l'archive d'audit
     soumise (microrave-v3.zip). Il n'est pas dans le tree git
     (`git ls-files .env` vide) ni dans l'historique, conformément
     au .gitignore — mais l'archive zip a capturé le fichier
     du working directory. D-097 règle 9 (« aucune clé prod
     dans logs, UI, debug ») est observée vis-à-vis de GitHub
     mais affaiblie vis-à-vis de l'artefact d'audit. À ne pas
     transmettre tel quel.
     — Source : .gitignore l.6 vs présence dans le zip

   REPORTABLE (peut attendre l'événement 2+) :

   • Fraude D-098 (7 signaux, 3 niveaux + rail HOLD) — aucune
     trace d'implémentation. Reportable car la première
     transaction Pierre de Rosette est non fraudogène (founder-
     known talent).

   • Rotation Stripe planifiée (SecretsRotationPolicyConfig) +
     rotation post-incident — pas de PolicyConfig
     correspondante en base. Reportable post-Event 1.

   • `PayoutBatchPolicyConfig` (mentionné par OS §2.7.1 ligne
     contestation_window→payable et §D-014-B) — absent de la
     PolicyConfig persistée (36 clés vérifiées). Pas critique
     pour un payout unique, deviendra requis pour batching.
     — Source : dataBase/PolicyConfig_export.csv

   ANGLE MORT POTENTIEL :

   L'OS exige `KYCStatus = VERIFIED` (D-097 rule 5) mais ne
   précise pas qui doit créer le `TalentPaymentProfile` ni
   quand. Stripe Connect impose qu'un lien d'onboarding soit
   généré par la plateforme et complété par le talent —
   l'OS V15 ne documente pas le flow d'initiation (qui appelle
   `accounts.create` Stripe ? À quel état de l'Engagement ?).
   Le code STRIPE-J8-01 T-11/T-12 teste l'idempotence
   d'onboarding et la propagation account.updated, mais
   aucun handler de production n'est visible dans
   codeBase44_v3/base44/functions/.
   → INFÉRENCE NON DOCUMENTÉE : l'onboarding KYC Stripe Connect
     se fait hors Base44 (probablement manuel via Stripe
     Dashboard pour le pilote). À documenter et industrialiser
     pour Event 2+. À valider par le fondateur.

──────────────────────────────────────────────────
4. DETTE HÉRITÉE

   La V3 hérite d'un acquis V2 important : 10 webhooks Stripe
   réellement reçus, validés, idempotemment dédupliqués et
   ledgerisés sans incident en base. Le pipeline rawbody →
   HMAC → idempotency → dispatch fonctionne sur des transactions
   réelles. C'est l'acquis le plus tangible de tous les domaines
   examinés — il prouve que le « test WEBHOOK-RAWBODY-01 » est
   implicitement PASSED en production (sinon les LedgerRecord
   encaissement_depot n'existeraient pas).

   Dette concomitante : 20 EPR `pending` sur 23 (87 %) — la
   surface s'est encrassée d'essais avortés. Aucun grand sweep
   pre-Event-1 documenté.

──────────────────────────────────────────────────
5. DELTA VERS COMPLÉTUDE

   Pour que le domaine soit prêt : (i) brancher la transition
   `deposit_pending → deposit_secured` sur transitionEngagement
   pour que la SchedulerDueTask balance_deadline_check soit
   réellement créée (sortie de bypass dans stripeWebhookHandler),
   (ii) ajouter le dispatch `payment_intent.payment_failed` →
   transition deposit_failed et `account.updated` → MAJ
   TalentPaymentProfile, (iii) remplacer V5 par un appel au
   LedgerInvariantGuard portable complet (Σ nets + Σ commissions
   + rounding = prix_vendu) en dépendance du ContractSnapshot
   phase 2 (Domaine A), (iv) créer l'entité Base44 PayoutBlockReason
   et la persister à chaque verrou échoué, (v) sortir
   executePayoutTransfer du bypass `Engagement.update` direct
   en faisant passer payable→settled par transitionEngagement.

──────────────────────────────────────────────────
6. STATUT FINAL

   ☑ PRÊT SOUS CONDITIONS — les 5 corrections ci-dessus + le
     déblocage de Domaine A (ContractSnapshot phase 2) pour
     que LedgerInvariantGuard ait une source de vérité.

   Estimation indicative hors règle 3 :
     — Webhook rawbody + HMAC + idempotency : 100 % fonctionnel
       (10 events traités en production).
     — Stripe Connect onboarding + KYC : 50 % (1 profil VERIFIED
       en base, mais flow non productisé dans les Base44
       functions ; flot manuel par défaut).
     — Verrous D-101 1/6 : 0 % codé.
     — Verrous D-101 2/6 à 5/6 : 100 % codés.
     — Verrou D-101 6/6 (LEDGER-02 complet) : 30 % codé (V5
       partielle).
     — Dispatch event types : 2/6 nécessaires (payment_intent.
       succeeded ✓, checkout.session.completed ✓ ; manquent
       payment_intent.payment_failed, account.updated,
       transfer.failed, charge.dispute.created).
     — Conformité « porte unique » (transitionEngagement) sur
       transitions Stripe : 0 % (deposit_secured, settled, et
       autres bypass).
   Effectif fonctionnel pour première transaction réelle :
   conditionnel — un payout unique mono-talent peut techniquement
   passer (et est passé le 23 mai 2026), mais sans
   `balance_deadline_check` armée, l'engagement reste exposé à
   un solde impayé silencieux.

──────────────────────────────────────────────────
7. DÉPENDANCES SORTANTES

   • Domaine F (Scheduler) : la SchedulerDueTask
     balance_deadline_check (LOI ANNULATION-02) doit être armée
     à `deposit_pending → deposit_secured`. Tant que Domaine C
     bypasse transitionEngagement à ce moment, Domaine F ne peut
     pas être déclenché correctement, donc J-6 ne s'arme pas.
     — Source : OS V15 §2.7.1 ligne EventPaymentGuard + D-014-A

   • Domaine B (Finance et ledger) dépend du verrou 6 D-101
     pour fermer la boucle « payout exécuté ⇒ ledger zéro cent
     vérifié ⇒ engagement settled ».
     — Source : D-101 + OS V15 §2.7.1 ligne payable→settled

   • Domaine J (Acteurs et onboarding) — la KYC VERIFIED d'un
     talent dépend d'un dispatch `account.updated` non
     implémenté. Tant que ce handler n'existe pas, l'onboarding
     reste manuel.
     — Source : D-097 rule 5

   • Domaine G (Admin et sécurité) — les rotations Stripe et
     toute opération sensible sur secrets exigent AdminAction
     + DataAccessLedgerEntry. Aujourd'hui ces rotations ne
     sont pas tracées car aucune n'a eu lieu, mais la
     dépendance s'activera à la première rotation.
     — Source : D-097 rule 10

   • Domaine A (Ontologie) — réciproquement, Domaine C est
     consommateur de la « porte unique » transitionEngagement
     d'A. Tant que la porte n'est pas unique et complète, les
     bypass actuels sont la seule façon pour C de fonctionner.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FIN DE LA FICHE — C. Stripe et paiements
Fiche conservée en mémoire de session pour Prompt de Synthèse.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━