━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FICHE D'ÉVALUATION — C. STRIPE ET PAIEMENTS
(webhooks, idempotency, rawbody, KYC, payout)

Date d'évaluation : 22 mai 2026 07:17 EST
Documents sources :
  • MICRORAVE_V3_OPERATING_SYSTEM_V15.md (OS V15)
  • EXPORT_BRUT—REGISTRES_SOUVERAINS_MICRO_RAVE_V3.md
    (D-097, D-101, D-129, RAIL-01, TEST_REGISTRY Catégories 2/3)
  • src/services/StripeAdapter.js
  • src/services/StripeConnectService.js
  • src/services/WebhookProcessor.js
  • src/services/SignalConsumerService.js
  • src/services/PayoutExecutor.js (relu domaine B)
  • src/repositories/index.js
  • src/repositories/PaymentRepository.js
  • stripe-webhook-proxy/index.js
  • scripts/run-j9-pilot.js
  • .env (structure sans valeurs)
  • docs/PlanImplantation/20260521-0942_Plan_Implantation.md
  • tests/p0/ : STRIPE-J8-01, WEBHOOK-RAWBODY-01

Niveau de confiance : HAUTE pour la mécanique de signature,
  idempotency, KYC et Transfer Stripe (code complet et lisible).
  PARTIELLE pour les interfaces repository dans WebhookProcessor
  (trois lacunes d'interface identifiées — voir §3).
  INFÉRENCE pour l'état réel de STRIPE_SECRET_KEY et
  STRIPE_WEBHOOK_SECRET en production (valeurs masquées dans .env).
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

──────────────────────────────────────────────────
1. CRITÈRES DE COMPLÉTUDE

Ce domaine est prêt pour la première transaction quand :

- La signature webhook est validée sur raw body non parsé
  avant tout traitement. Un événement Stripe avec signature
  invalide est rejeté immédiatement.
  Source : OS V15 D-097 règle 6 — *"Webhook signature
  validation obligatoire — raw body préservé."*

- L'idempotency webhook est garantie via WebhookProcessedLog :
  un même stripeEventId n'est traité qu'une seule fois.
  Source : OS V15 D-097 règle 7.

- payment_intent.succeeded déclenche la transition
  deposit_pending → deposit_secured via SignalConsumerService
  sans intervention manuelle.
  Source : Plan Implantation §0.1 — *"Bloquant SC-01."*

- KYCStatus = VERIFIED sur le TalentPaymentProfile avant
  tout Transfer Stripe. Verrou 4 de D-101.
  Source : OS V15 D-097 règle 5, D-101 Verrou 4.

- WEBHOOK-RAWBODY-01 = PASSED confirmé (Base44 préserve le
  raw body) OU proxy opérationnel et validé par WEBHOOK-
  PROXY-01.
  Source : OS V15 D-129 — *"Règle invariante : Un seul
  FAILED = Event 0B interdit."*

Ce domaine bloque tout le reste si :

- STRIPE_WEBHOOK_SECRET absent ou invalide : aucun webhook
  ne peut être validé, deposit_pending ne se lève jamais,
  la machine d'état est bloquée après placed.
  Source : OS V15 D-097 règle 6, .env commentaire
  *"BLOQUANT : sans cette clé réelle, aucun webhook Stripe
  ne peut être validé."*

- SignalConsumerService n'est pas appelé après réception
  du webhook : le signal reste `processed: false` indéfini-
  ment et la transition ne se déclenche jamais.
  Source : Plan Implantation §0.1.

- KYC DJ Alex = PENDING : PayoutExecutor.Verrou4 bloque
  payable→settled, transfer refusé.
  Source : Plan Implantation §1.3.

──────────────────────────────────────────────────
2. ÉTAT ACTUEL DOCUMENTÉ

Ce qui existe et fonctionne selon les documents :

- StripeAdapter : complet et conforme D-097. Point d'accès
  unique à Stripe (règle 2), lazy singleton avec fail-fast
  si clé absente (règle 3), résultats normalisés { ok, data,
  error } sur toutes les opérations, idempotency keys
  dérivées de l'engagementId sur PaymentIntents, Transfers
  et Refunds. Couvre PaymentIntents, Webhooks, Connect
  Express, AccountLinks, Transfers, Refunds. checkConfig()
  pour fail-fast au démarrage.
  Source : StripeAdapter.js — commentaire "RÈGLES ABSOLUES
  (D-097)" et ensemble du module.

- StripeConnectService : flux KYC complet en 5 étapes.
  initiateTalentOnboarding() idempotent (vérifie profil
  existant avant create). verifyKYCStatus() dérive le
  statut depuis les flags Stripe (details_submitted,
  charges_enabled, payouts_enabled) avec les 4 états
  canoniques (PENDING/IN_REVIEW/VERIFIED/RESTRICTED).
  getTalentPaymentProfile() utilisé par PayoutExecutor
  Verrou 4. handleAccountUpdated() dans WebhookProcessor
  maintient le KYC à jour en temps réel.
  Source : StripeConnectService.js complet.

- WebhookProcessor : architecture correcte en 5 étapes
  (validation signature → idempotency → log AVANT dispatch
  → dispatch → update log). Pattern fail-safe : log créé
  avant dispatch pour ne jamais perdre un event. Couvre
  payment_intent.succeeded, payment_intent.payment_failed,
  account.updated, transfer.created. Ne déclenche PAS
  transitionEngagement() directement — persiste un signal
  et délègue à SignalConsumerService (séparation correcte).
  Source : WebhookProcessor.js — commentaire "Ce handler
  ne déclenche PAS transitionEngagement directement."

- SignalConsumerService : câblage webhook → machine d'état
  implémenté. Lit les StripePaymentSignal non traités,
  retrouve l'Engagement, construit le contexte, appelle
  transitionEngagement(), marque le signal consommé. En
  cas d'échec : AdminIncidentRecord P0 créé, signal non
  marqué consommé (permettant retry manuel). SYSTEM_ACTOR_ID
  souverain pour la traçabilité.
  Source : SignalConsumerService.js — complet.

- WEBHOOK-RAWBODY-01 = PASSED confirmé.
  Source : Plan Implantation ligne 21 — *"WEBHOOK-RAWBODY-01 :
  ✓ PASSED — Base44 préserve le raw body."*

- Proxy stripe-webhook-proxy/index.js : présent et
  opérationnel en fallback. express.raw() pour préserver
  le body, idempotency en mémoire (Set), transmission à
  Base44 via PROXY_BASE44_ENDPOINT configurable.
  Non requis pour l'instant (rawbody PASSED) mais disponible.
  Source : stripe-webhook-proxy/index.js.

- repositories/index.js : agrège tous les repositories.
  Fournit talentPaymentProfiles (findByTalentUserId,
  create, update), payoutExecutionRecords, settlement-
  Instructions (avec create inline via base44Post), et
  tous les sous-objets attendus par PayoutExecutor D-101.
  Source : src/repositories/index.js complet.

- run-j9-pilot.js : script pilote complet pour les étapes
  d'onboarding, KYC et payout réel avec sk_test_. Inclut
  le commentaire *"Vérifier que la SettlementInstruction
  existe et est non-consommée"* — confirme la conscience
  de l'angle mort B.
  Source : run-j9-pilot.js header.

Ce qui vient de V1 et est encore actif :

- INFÉRENCE : V1 (microrave.ca) utilisait des paiements
  Stripe partiellement intégrés selon l'historique des
  sessions. V3 refactorise entièrement — aucun code V1
  identifié. Avantage possible : clés Stripe test déjà
  configurées pour le territoire CA.

Ce qui vient de V2 et a survécu :

- V2 abandonnée. Aucune dette Stripe identifiée.

──────────────────────────────────────────────────
3. LACUNES IDENTIFIÉES

BLOQUANT (empêche la première transaction) :

- BLOQUANT-C1 — findByStripeAccountId absent de
  repositories/index.js. WebhookProcessor.handleAccountUpdated()
  appelle repositories.talentPaymentProfiles.findByStripe-
  AccountId(account.id) à la ligne 224. L'objet
  talentPaymentProfiles dans index.js n'expose que
  findByTalentUserId, create, update — pas findByStripe-
  AccountId. Quand Stripe envoie un webhook account.updated
  (ex : après completion onboarding KYC DJ Alex), le handler
  lèvera un TypeError silencieux (optional chaining ?.
  retourne undefined) et le KYC ne sera jamais mis à jour
  automatiquement. Pour Event 0A, ce bloquant peut être
  contourné par verifyKYCStatus() manuel via run-j9-pilot.js
  --step=kyc. Bloquant pour toute automatisation KYC.
  Source : WebhookProcessor.js L.224 vs index.js
  talentPaymentProfiles — absence de findByStripeAccountId.

- BLOQUANT-C2 — repositories.webhookProcessedLogs absent
  de index.js. WebhookProcessor.processWebhook() exige
  repositories.webhookProcessedLogs.findByEventId() et
  .create() et .markCompleted() pour l'idempotency et le
  logging (étapes 2, 3, 5). index.js n'exporte pas ce
  sous-objet. Sans lui, processWebhook() lève TypeError
  à la première ligne d'idempotency, rejetant tout webhook
  entrant, même signé correctement.
  Source : WebhookProcessor.js L.68 vs index.js —
  absence de webhookProcessedLogs.

- BLOQUANT-C3 — repositories.stripePaymentSignals absent
  de index.js. WebhookProcessor.handlePaymentIntentSucceeded()
  appelle repositories.stripePaymentSignals?.create() avec
  optional chaining — fail silencieux si absent. Le signal
  n'est jamais persisté, SignalConsumerService ne trouve
  rien à consommer, la transition deposit_secured ne se
  déclenche jamais.
  Source : WebhookProcessor.js L.187 — optional chaining
  `?.create()` vs index.js — absence de stripePaymentSignals.
  NOTE : repositories.payment.createStripePaymentSignal()
  existe dans PaymentRepository. Il faut exposer un alias
  stripePaymentSignals dans index.js pointant vers les
  méthodes existantes.

- BLOQUANT-C4 — upsert absent de talentPaymentProfiles
  dans index.js. StripeConnectService.initiateTalentOnboarding()
  et verifyKYCStatus() appellent repositories.talentPayment-
  Profiles.upsert(). L'objet dans index.js expose create
  et update mais pas upsert. L'onboarding et la mise à
  jour KYC lèvent TypeError à l'appel de upsert().
  Source : StripeConnectService.js initiateTalentOnboarding()
  L.56 et verifyKYCStatus() L.104 vs index.js
  talentPaymentProfiles — absence de upsert.

DÉGRADANT (réduit la qualité, n'empêche pas) :

- DÉGRADANT-C1 — Proxy idempotency en mémoire (Set).
  stripe-webhook-proxy/index.js stocke processedEvents
  dans un Set JavaScript — perdu à chaque redémarrage du
  proxy. En cas de crash + redémarrage, un même événement
  peut être re-transmis et re-traité. L'idempotency de
  WebhookProcessor (WebhookProcessedLog en base) reste
  la protection principale. Le proxy doit utiliser la base
  ou Redis pour une idempotency durable.
  Source : stripe-webhook-proxy/index.js L.15 —
  commentaire "remplacer par database en production".

- DÉGRADANT-C2 — buildTransitionContext() pour
  deposit_pending → deposit_secured utilise un fallback
  silencieux sur expectedDepositCents. Si le signal ne
  contient pas expectedDepositCents, la valeur est égale
  à amountReceivedCents — ce qui masque tout écart entre
  le montant attendu et le montant reçu. EventPaymentGuard
  ne peut pas détecter une sous-facturation Stripe.
  Source : SignalConsumerService.js buildTransitionContext()
  ligne `expectedDepositCents: signal.expectedDepositCents
  || signal.amountReceivedCents`.

- DÉGRADANT-C3 — transfer.created webhook handler est
  audit-only sans LedgerRecord. D-060-A exige un
  PaymentFeeVarianceRecord (compte 6119) pour l'écart entre
  frais Stripe estimés et réels. Le handler retourne
  uniquement une confirmation audit sans aucune écriture.
  Source : WebhookProcessor.js handleTransferCreated() vs
  registres D-060-A.

REPORTABLE (peut attendre l'événement 2+) :

- D-097 règle 8 — Restricted keys Stripe par usage
  (moindre privilège). Actuellement une seule clé couvre
  toutes les opérations. Séparation en clés restreintes
  par usage post-MVP.
  Source : OS V15 D-097 règle 8.

- D-097 règle 4 — Rotation planifiée dans
  SecretsRotationPolicyConfig. Non implémentée.
  Source : OS V15 D-097 règle 4.

- payment_intent.canceled et charge.refunded — deux types
  d'events documentés comme "futurs non implémentés MVP"
  dans WebhookProcessor. Non-bloquant pour SC-01.
  Source : WebhookProcessor.js commentaire "Events futurs".

ANGLE MORT POTENTIEL :

- L'appelant de WebhookProcessor.processWebhook() n'est
  pas visible dans le ZIP. WebhookProcessor documente
  que c'est *"Le proxy stripe-webhook-proxy/index.js"*
  ou *"une fonction Base44"* (voir .env commentaire
  `URL: https://app.base44.com/api/apps/.../functions/
  stripeWebhook`). INFÉRENCE NON DOCUMENTÉE : qui instancie
  WebhookProcessor avec le bon objet repositories complet
  (incluant BLOQUANT-C2/C3 une fois résolus) ? Un endpoint
  Base44 ou le proxy ? Si c'est le proxy, il faut qu'il
  initialise repositories et les injecte. Ce câblage final
  n'est pas visible.

- SignalConsumerService doit être appelé "après chaque
  webhook reçu" selon son commentaire. Qui l'appelle ?
  La logique n'est pas visible dans le ZIP (pas de fonction
  Base44 ou cron branché). INFÉRENCE NON DOCUMENTÉE —
  à valider : Base44 expose-t-il un hook post-webhook
  qui appelle processUnhandledSignals() ?

──────────────────────────────────────────────────
4. DETTE HÉRITÉE

Positive : WEBHOOK-RAWBODY-01 = PASSED élimine la
dépendance au proxy pour Event 0A. C'est un résultat
concret obtenu avant le présent audit. La dette potentielle
d'un proxy externe (5$/mois, latence, point de défaillance
supplémentaire) est évitée.

Active : Les 4 bloquants C1–C4 sont des lacunes d'interface
repository — toutes résolues par des ajouts dans
src/repositories/index.js (10–20 lignes chacun). Ce ne
sont pas des lacunes architecturales profondes. La logique
métier de WebhookProcessor, StripeConnectService et
SignalConsumerService est correcte — seul le câblage vers
les repositories manque.

──────────────────────────────────────────────────
5. DELTA VERS COMPLÉTUDE

Pour la première transaction : ajouter dans
src/repositories/index.js les quatre interfaces manquantes
(webhookProcessedLogs, stripePaymentSignals alias vers
PaymentRepository, findByStripeAccountId dans
talentPaymentProfiles, upsert dans talentPaymentProfiles),
vérifier que KYC DJ Alex est VERIFIED via run-j9-pilot.js
--step=kyc, et identifier l'appelant de processWebhook()
et processUnhandledSignals() dans la couche Base44.

──────────────────────────────────────────────────
6. STATUT FINAL

☑ EN COURS → 70% · Ce qui reste :
  BLOQUANT-C1 à C4 (4 ajouts dans repositories/index.js
  — code trivial, 1–2h de travail)
  + KYC DJ Alex VERIFIED (run-j9-pilot.js --step=kyc)
  + Câblage Base44 endpoint → WebhookProcessor → Signal-
  ConsumerService (INFÉRENCE NON DOCUMENTÉE — à valider)

──────────────────────────────────────────────────
7. DÉPENDANCES SORTANTES

- Domaine A (Ontologie / machine d'état) dépend de ce
  domaine pour que deposit_pending → deposit_secured se
  déclenche automatiquement. Sans SignalConsumerService
  câblé, toutes les transitions post-dépôt sont bloquées.
  Source : Plan Implantation §0.1.

- Domaine B (Finance et ledger) dépend de ce domaine pour
  que le Transfer Stripe réel soit exécuté (Verrou 6 D-101)
  et que la SettlementInstruction soit marquée consommée.
  Sans KYC VERIFIED, payable→settled est impossible.
  Source : PayoutExecutor.js Verrou 4.

- Domaine J (Acteurs et onboarding) dépend de ce domaine
  pour l'onboarding Stripe Connect Express du talent.
  Sans upsert et findByStripeAccountId dans repositories,
  StripeConnectService ne peut ni créer ni mettre à jour
  le TalentPaymentProfile.
  Source : StripeConnectService.js — BLOQUANT-C1/C4.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FIN DE LA FICHE — C. STRIPE ET PAIEMENTS
Conserver pour le Prompt de Synthèse.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━