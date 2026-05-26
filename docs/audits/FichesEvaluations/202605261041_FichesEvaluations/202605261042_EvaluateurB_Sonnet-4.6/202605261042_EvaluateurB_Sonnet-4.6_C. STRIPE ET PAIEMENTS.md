━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FICHE D'ÉVALUATION — C. STRIPE ET PAIEMENTS
Date d'évaluation : 26 mai 2026 14:33 EST
Fait avec Sonnet 4.6 Adaptatif

Documents sources :
  • MICRORAVE_V3_OPERATING_SYSTEM_V15.md (OS V15)
  • src/services/StripeAdapter.js
  • src/services/StripeConnectService.js
  • src/services/WebhookProcessor.js
  • src/services/SignalConsumerService.js
  • src/services/PayoutExecutor.js (section verrous D-101)
  • stripe-webhook-proxy/index.js
  • codeBase44_v3/base44/functions/stripeWebhookHandler/entry.ts v4 [DÉPLOYÉ]
  • codeBase44_v3/base44/functions/initiateDepositPayment/entry.ts [DÉPLOYÉ]
  • codeBase44_v3/base44/functions/initiateBalancePayment/entry.ts [DÉPLOYÉ]
  • codeBase44_v3/base44/functions/executePayoutTransfer/entry.ts [DÉPLOYÉ]
  • codeBase44_v3/base44/entities/TalentPaymentProfile.jsonc
  • codeBase44_v3/dataBase/WebhookProcessedLog_export.csv (9 entrées)
  • codeBase44_v3/dataBase/StripePaymentSignal_export.csv (4 entrées)
  • codeBase44_v3/dataBase/TalentPaymentProfile_export.csv (1 VERIFIED)
  • codeBase44_v3/dataBase/PayoutExecutionRecord_export.csv (1 réel)
  • codeBase44_v3/dataBase/SettlementInstruction_export.csv (1 consommée)
  • tests/p0/STRIPE-J8-01.js, WEBHOOK-RAWBODY-01.js
Niveau de confiance : HAUTE — pipeline complet prouvé en production.
──────────────────────────────────────────────────
1. CRITÈRES DE COMPLÉTUDE
   (Tirés de l'OS V15)

Ce domaine est prêt pour la première transaction quand :

• La signature Stripe est validée via HMAC-SHA256 sur rawBody non parsé
  (D-097 : "raw body doit être préservé intact pour la validation de
  signature"). Toute validation sur un body parsé invalide la signature.

• Chaque event Stripe est traité exactement une fois — idempotency
  garantie via WebhookProcessedLog et idempotency ledger —
  D-097 règle 7 : idempotency obligatoire.

• Le payout est exécuté avec les 6 verrous D-101 dans l'ordre,
  incluant verrou 4 (KYCStatus === VERIFIED) — OS V15 §2.7.1 :
  "payable→settled : KYCStatus = VERIFIED".

• Le talent a complété son onboarding Stripe Connect Express (KYC VERIFIED :
  details_submitted=true + charges_enabled=true) avant tout Transfer —
  D-097 règle 5 : "jamais de Transfer sans KYC vérifié".

• Le Transfer Stripe utilise une idempotency key dérivée d'engagementId +
  talentUserId — D-101 verrou 6 : idempotency réseau garantie par Stripe.

Ce domaine bloque tout le reste si :

• Un Stripe Transfer est exécuté vers un talent avec kycStatus ≠ VERIFIED —
  D-097 règle 5 + verrou 4 PayoutExecutor.

• La signature webhook est validée sur un body parsé (JSON) plutôt que
  sur le rawBody — toute transition triggered par webhook serait impossible
  à valider cryptographiquement (D-097).

• Un double Transfer est exécuté sur le même engagement (absence d'idempotency
  verrou 2 — PayoutExecutionRecord) — D-101.

──────────────────────────────────────────────────
2. ÉTAT ACTUEL DOCUMENTÉ

Ce qui existe et fonctionne selon les documents :

  PIPELINE COMPLET PROUVÉ EN PRODUCTION :
  La séquence Checkout Session → webhook → deposit_secured → event_sealed
  → payout → archived est confirmée pour ENG-H5V66Q-WBJ7N2 :
  — StripePaymentSignal : deposit pi_3TbIRu2eLVUrCnnJ1NVWDGaj (10000¢) ✓
  — StripePaymentSignal : balance pi_3TbJ2w2eLVUrCnnJ0ziYoT7k (40000¢) ✓
  — PayoutExecutionRecord PAY-MPIHYIID-0VYYNQ : tr_1TaHDt2eLVUrCnnJyDflLNEa
    verrouxPassed = [V1,V2,V3,V4_KYC_VERIFIED,V5,V6_STRIPE_TRANSFER_MANUAL] ✓
  — TalentPaymentProfile USR-MPIG0A0O-9CZ5JA : kycStatus=VERIFIED,
    chargesEnabled=true, detailsSubmitted=true (acct_1TaGqTKCWuw3ufQV) ✓

  RAWBODY RÉSOLU DANS LE DÉPLOYÉ :
  stripeWebhookHandler v4 utilise `const rawBody = await req.text()` (l.363)
  avant toute validation ou parsing. L'HMAC-SHA256 est calculé sur ce
  string brut via crypto.subtle. Le body JSON est parsé APRÈS validation
  (JSON.parse(rawBody)). La préoccupation documentée dans stripe-webhook-
  proxy/index.js est donc résolue directement dans la fonction Deno.
  Source : stripeWebhookHandler/entry.ts l.363-381.

  IDEMPOTENCY DOUBLE COUCHE :
  Couche 1 (webhook) : WebhookProcessedLog vérifié avant dispatch —
  si processingStatus=COMPLETED → skip. 9 entries en production,
  toutes COMPLETED. Source : entry.ts l.386-393.
  Couche 2 (ledger) : avant toute écriture LedgerRecord, la fonction
  `ledgerAlreadyWritten()` vérifie qu'aucune ligne DR n'existe avec le
  même reconciliationKey + economicEvent. Source : entry.ts
  `ledgerAlreadyWritten()` (guard inline).

  CHECKOUT SESSION COMME EVENT PIVOT :
  Le handler déploie `checkout.session.completed` et
  `payment_intent.succeeded`. En pratique, les paiements Stripe
  génèrent les deux events. Le `payment_intent.succeeded` est skippé
  avec `SKIPPED_NO_ENGAGEMENT_ID` (le PI ne porte pas `engagementId`
  dans ses métadonnées — seule la Checkout Session le porte).
  `checkout.session.completed` est l'event pivot authoritative.
  Preuve : WebhookProcessedLog montre checkout.session.completed →
  DEPOSIT_SECURED / BALANCE_PAYMENT_SECURED. Source : export CSV.

  STRIPE-J8-01 : 19/19 PASSED — couvre signature invalide rejetée,
  idempotency webhook, KYC bloque payout, 6 verrous D-101, onboarding
  idempotent, waterfall zéro cent DJ Alex.

  TRANSFER RÉEL CONFIRMÉ : tr_1TaHDt2eLVUrCnnJyDflLNEa (264$) exécuté
  le 2026-05-23 vers acct_1TaGqTKCWuw3ufQV. Verrou V6_STRIPE_TRANSFER_MANUAL
  — payout exécuté via executePayoutTransfer (déployé), pas via le
  script Node.js. Source : PayoutExecutionRecord_export.csv.

Ce qui vient de V1 et est encore actif :
  Aucun. La couche Stripe/paiement est une construction V3 native.

Ce qui vient de V2 et a survécu :
  Aucun.

──────────────────────────────────────────────────
3. LACUNES IDENTIFIÉES

BLOQUANT — conditionnel (dépend du talent de Event 1) :

• [C-C-01] `account.updated` Stripe webhook NON géré dans le déployé.
  Le dispatche du stripeWebhookHandler v4 ne couvre que
  `payment_intent.succeeded` et `checkout.session.completed`. L'event
  `account.updated` (qui déclenche la mise à jour KYCStatus en VERIFIED
  après onboarding du talent) est absent de la table de dispatch.
  En production, le KYC du talent pilote (VERIFIED) a été mis à jour
  manuellement. Pour Event 1 avec un nouveau talent qui complète son
  onboarding Stripe, KYCStatus restera PENDING/IN_REVIEW jusqu'à
  intervention manuelle.
  Source : grep account.updated dans stripeWebhookHandler/entry.ts → 0.
  BLOQUANT si : Event 1 implique un talent différent du talent pilote
  (USR-MPIG0A0O-9CZ5JA). NON-BLOQUANT si : Event 1 réutilise ce talent.
  Source D-097 règle 5 : "jamais de Transfer sans KYC vérifié".

DÉGRADANT (réduit la qualité, n'empêche pas) :

• [D-C-01] SignalConsumerService.js (canonique) jamais appelé en production.
  Les 4 StripePaymentSignal ont `processed: false` — ils ne sont jamais
  consommés par le SignalConsumerService canonique (qui appelle
  transitionEngagement()). Le stripeWebhookHandler déployé gère tout
  en inline sans passer par la machine d'état canonique.
  Conséquence : la doctrine "WebhookProcessor persiste → SignalConsumer
  consomme → transitionEngagement() avance l'état" n'est pas opérationnelle.
  Le système fonctionne (transitions se font via Engagement.update direct),
  mais le découplage observé en Domaines A et B se répète ici.
  Source : StripePaymentSignal_export.csv (processed=false sur 4 records).

• [D-C-02] Proxy stripe-webhook-proxy/index.js utilise un Set en mémoire
  pour l'idempotency (pas une database). Tout redémarrage du proxy efface
  la déduplication. Mais puisque le déployé Deno gère les webhooks
  directement (req.text() + crypto.subtle), le proxy n'est pas actif
  en production — c'est un fallback non déployé. La faiblesse est
  documentée pour le cas où le proxy serait activé.

• [D-C-03] `V6_STRIPE_TRANSFER_MANUAL` dans verrouxPassed : le premier
  payout en production a été labellisé "MANUAL" dans la liste des verrous.
  Pour Event 1 commercial, le verrou V6 devrait être `V6_STRIPE_TRANSFER`
  via l'appel automatique au Transfer Stripe dans executePayoutTransfer.
  Source : PayoutExecutionRecord PAY-MPIHYIID-0VYYNQ.

• [D-C-04] Les métadonnées Stripe du PaymentIntent créé directement via
  `StripeAdapter.createPaymentIntent()` ne contiennent pas le routage
  vers un engagementId dans le webhook. Le handler déployé ne peut router
  qu'un `payment_intent.succeeded` si l'engagementId est dans le PI
  metadata. Pour les Checkout Sessions (cas actuel), le PI ne porte pas
  engagementId — donc SKIPPED — mais le checkout.session.completed porte.
  Cette dépendance implicite au Checkout comme point pivot n'est pas
  documentée formellement dans l'OS.

REPORTABLE (peut attendre l'événement 2+) :

• `payment_intent.canceled` non géré (documenté dans WebhookProcessor.js
  comme "futur").
• `charge.refunded` non géré (documenté comme "futur").
• `transfer.created` géré dans le WebhookProcessor.js canonique
  (audit trail) mais absent du dispatche déployé.

ANGLE MORT POTENTIEL :
Y a-t-il quelque chose que ce domaine requiert pour la première
transaction que l'OS ne documente pas explicitement ?

→ OUI — INFÉRENCE NON DOCUMENTÉE : Le handler déployé gère
  `checkout.session.completed` comme event pivot. Mais l'OS (D-097)
  parle de `payment_intent.succeeded` comme l'event déclencheur de
  `deposit_pending → deposit_secured`. La divergence entre la doctrine
  (PI.succeeded) et l'implémentation (CS.completed en pivot) n'est pas
  formalisée. Pour Event 1, cette divergence n'est pas bloquante car
  le CS.completed contient toutes les données nécessaires. Mais si Stripe
  modifie l'ordre de livraison des events, le CS.completed arrivant avant
  le PI.succeeded crée une fenêtre de race condition dans la couche
  ledger. La garde ledgerAlreadyWritten() protège contre le double-write,
  mais pas contre le cas inverse (CS.completed non livré, PI.succeeded
  seul). À documenter formellement. À valider par le fondateur.

──────────────────────────────────────────────────
4. DETTE HÉRITÉE

V1/V2 : aucune.

Dette interne V3 : Le code du stripeWebhookHandler a traversé 4 versions
(v1→v4). La v4 corrige : waterfall 4335→4110, idempotency ledger,
branche balance manquante, EPR.status deposit non mis à jour.
Ces corrections sont documentées dans le header de entry.ts. Elles
confirment que le pipeline Stripe a nécessité plusieurs itérations pour
être stable — il l'est maintenant. La dette résiduelle (account.updated,
SignalConsumerService) est qualitative, pas opérationnelle pour Event 1
avec le talent pilote.

──────────────────────────────────────────────────
5. DELTA VERS COMPLÉTUDE

Pour Event 1 avec le talent pilote déjà VERIFIED : aucune action
requise — le pipeline est prouvé bout-en-bout.
Pour Event 1 avec un nouveau talent : implémenter le dispatch
`account.updated` dans stripeWebhookHandler (ou accepter la mise
à jour KYC manuelle comme procédure pilote).

──────────────────────────────────────────────────
6. STATUT FINAL

  ☑ PRÊT SOUS CONDITIONS

  Condition unique : talent de Event 1 = USR-MPIG0A0O-9CZ5JA (déjà
  VERIFIED) OU mise à jour KYC manuelle acceptée comme procédure
  opérationnelle pour Event 1. Pour tout Event 2+ avec un nouveau
  talent, implémenter le dispatch `account.updated`.

──────────────────────────────────────────────────
7. DÉPENDANCES SORTANTES

• A. Ontologie dépend de ce domaine pour la transition
  deposit_pending→deposit_secured (déclenchée par le webhook) —
  OS V15 §2.7.1 table. Statut : OPÉRATIONNEL en production via
  Engagement.update direct (bypass LOI TRANSITION-01 identifié en A).

• B. Finance dépend de ce domaine pour les LedgerRecords encaissement_depot
  et encaissement_solde — prouvés en production.

• J. Acteurs et onboarding dépend de ce domaine pour la complétion
  du KYC Stripe Connect et la mise à jour automatique de kycStatus
  (account.updated) — OS V15 §2.7.1 : "KYCStatus = VERIFIED" requis
  pour payout.

  INFÉRENCE : F. Scheduler (paiement de la balance deadline) déclenche
  des transitions d'annulation depuis deposit_secured. Ces transitions
  seront exécutées par Stripe (remboursement) via createRefund() dans
  StripeAdapter. La logique de remboursement partiel n'est pas testée
  en production — à valider pour Event 1 si scénario d'annulation
  J-7 est possible.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FIN DE LA FICHE — C. STRIPE ET PAIEMENTS
Conserver pour le Prompt de Synthèse.