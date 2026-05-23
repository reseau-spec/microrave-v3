FICHE D'ÉVALUATION — C. STRIPE ET PAIEMENTS
Date d'évaluation : 22 mai 2026
Date d'évaluation : 22 mai 2026 06:44 EST
Fait par Claude Opus 4.7
Documents sources : OS V15 (§2.7.1 transitions financières), EXPORT_BRUT (D-097 secrets Stripe, D-098 fraude, D-101 anti-double payout, D-127 doctrine Base44 rampe, D-129 WEBHOOK-RAWBODY-01, D-130 MigrationTrigger, D-131 discipline, D-132 portability), Plan d'Implantation §0.1 + §1.3, code src/services/StripeAdapter.js (343 l.), src/services/StripeConnectService.js (258 l.), src/services/WebhookProcessor.js (280 l.), src/services/SignalConsumerService.js (241 l.), src/services/PayoutExecutor.js (318 l.), src/repositories/PaymentRepository.js (223 l.), src/repositories/index.js (125 l.), stripe-webhook-proxy/index.js (106 l.), scripts/run-j9-pilot.js, .env, 4 tests P0 (STRIPE-J8-01, WEBHOOK-RAWBODY-01, PAYOUT-SETTLED-01, DEPOSIT-FAIL-01).
Niveau de confiance : HAUTE sur StripeAdapter, ConnectService, idempotency arithmétique ; PARTIELLE sur le câblage repository ↔ WebhookProcessor (écart d'interface détecté) ; INFÉRENCE sur la fonction Base44 stripeWebhook absente de l'archive.
──────────────────────────────────────────────────
1. CRITÈRES DE COMPLÉTUDE
Ce domaine est prêt pour la première transaction quand :

Aucun secret Stripe dans le code source, uniquement dans des variables d'environnement plateforme — D-097 règle 1 + règle 3 : "Aucun secret Stripe dans le code source. Secrets dans variables d'environnement plateforme uniquement."
Environnements séparés dev/staging (Stripe test) et prod (Stripe live) — D-097 règle 2 + D-131 : "dev + staging → Stripe test keys. prod → Stripe live keys."
KYC Stripe Connect = VERIFIED obligatoire avant payout — D-097 règle 5 : "KYC Stripe Connect obligatoire avant payout (KYCStatus = VERIFIED)." Implémenté comme Verrou 4 D-101 dans PayoutExecutor.
Webhook signature validation obligatoire avec raw body préservé — D-097 règle 6. Test bloquant WEBHOOK-RAWBODY-01 doit être PASSED — D-129 : "Un seul FAILED = Event 0B interdit."
Idempotency webhook via WebhookProcessedLog — D-097 règle 7 + EXPORT_BRUT l. 1576. Chaque event.id Stripe traité une seule fois.
Idempotency Stripe sur chaque appel mutant : PaymentIntent (pi-{engagementId}-{phase}), Account (acct-create-{talentUserId}), Transfer (tr-{engagementId}-{talentUserId}), Refund (re-{engagementId}-{reason}) — D-101 Verrou 6 + EXPORT_BRUT l. 1648 : "Stripe idempotency key — Engagement.systemId + 'payout' + attempt_version."
Restricted keys Stripe par usage (moindre privilège) — D-097 règle 8 (organisationnel, non-vérifiable par code).
Aucune clé prod dans logs / Base44 UI / debug — D-097 règle 9.
Webhook proxy externe disponible si Base44 ne préserve pas le raw body — D-129 : "Si Base44 ne permet pas la validation fiable du raw body Stripe : webhook proxy externe obligatoire avant argent réel. (...) Ce proxy est une précondition, pas un plan B."
Le webhook payment_intent.succeeded déclenche deposit_pending → deposit_secured via WebhookProcessor → StripePaymentSignal → SignalConsumerService → transitionEngagement() — OS V15 §2.6 D-014-A + Plan §0.1.
Le webhook account.updated met à jour le kycStatus du TalentPaymentProfile — D-097 règle 5 + code WebhookProcessor.handleAccountUpdated().
6 verrous D-101 anti-double payout armés sur tout Transfer Stripe : lockedByRunId, Status check, PayoutExecutionRecord absent, KYC VERIFIED, SettlementInstruction non consommée, Invariant LEDGER-02 — EXPORT_BRUT D-101.
Tolérance ±2¢ sur le montant confirmé vs attendu pour absorber les arrondis Stripe — EventPaymentGuard.validateDepositConfirmation() + D-066 ("Micro Rave ne sous-collecte jamais").
Plafond event_payment_cap_cents respecté au MVP — EventPaymentGuard.validateDepositCreation() + D-123 (plafond MVP database, deux niveaux).
StripeAdapter.checkConfig() au démarrage détecte les clés manquantes (fail-fast).

Ce domaine bloque tout le reste si :

WEBHOOK-RAWBODY-01 est FAILED — D-129 : "Un seul FAILED = Event 0B interdit."
Une seule clé Stripe est commitée dans un log, le code source, ou GitHub — D-097 règle 9 + Plan §3.4 + D-131.
Le KYC du talent reste PENDING ou IN_REVIEW au moment du payout — Verrou 4 D-101 + Plan §1.3 : "PayoutExecutor.Verrou4 exige KYCStatus = VERIFIED. Si PENDING : Transfer Stripe refusé, settled impossible."
Un payment_intent.succeeded est traité deux fois (faille idempotency) — viole D-097 règle 7 et risque double-paiement.

──────────────────────────────────────────────────
2. ÉTAT ACTUEL DOCUMENTÉ
Ce qui existe et fonctionne selon les documents :

StripeAdapter.js (343 l.) est le point d'accès unique à l'API Stripe — D-097 règle 1 respectée en code : commentaire l. 8 "Ce module est le SEUL endroit où require('stripe') est appelé". Instanciation lazy (l. 34-47) + erreur explicite STRIPE_CONFIG_MISSING si STRIPE_SECRET_KEY absent. Normalisation des résultats en {ok, data, error} (l. 56-73) pour forcer la gestion d'erreur à chaque call-site.
Idempotency Stripe systématique sur toutes les opérations mutantes :

createPaymentIntent: pi-${engagementId}-${phase} (l. 92)
createConnectAccount: acct-create-${talentUserId} (l. 170)
createTransfer: tr-${engagementId}-${talentUserId} (l. 250) — Verrou 6 D-101
createRefund: re-${engagementId}-${reason} (l. 287)


constructWebhookEvent() valide la signature Stripe avec le STRIPE_WEBHOOK_SECRET — code l. 141-154. Refus explicite si le secret est REMPLACER ou absent. Lève une erreur normalisée si la signature est invalide.
StripeConnectService.js (258 l.) orchestre l'onboarding KYC complet — 5 étapes : initiateTalentOnboarding, createOnboardingLink, refreshOnboardingLink, verifyKYCStatus, getTalentPaymentProfile. Dérivation KYC stricte (l. 192-202) :

!details_submitted → PENDING
details_submitted && !charges_enabled → IN_REVIEW
details_submitted && charges_enabled && !payouts_enabled → RESTRICTED
details_submitted && charges_enabled && payouts_enabled → VERIFIED

Idempotency initiateTalentOnboarding : si profil existe déjà avec stripeAccountId, retourne alreadyOnboarded: true sans recréer le compte (l. 56-64).
WebhookProcessor.js implémente l'idempotency D-097 règle 7 — code l. 73-82 : lecture WebhookProcessedLog.findByEventId(event.id) ; si déjà traité, retourne SKIPPED_IDEMPOTENT sans dispatcher. Logging AVANT dispatch (l. 85-90) — pattern fail-safe D-097 : si le handler crash, le log existe déjà en IN_PROGRESS.
Quatre types d'events Stripe couverts (WebhookProcessor.HANDLED_EVENT_TYPES l. 38-43) : payment_intent.succeeded, payment_intent.payment_failed, account.updated, transfer.created.
SignalConsumerService (241 l.) consomme les StripePaymentSignal non traités — séparation propre entre webhook (synchrone, court) et consommation (asynchrone, transitionnel). Code l. 152-160 : appelle transitionEngagement() avec acteur souverain USR-SYSTEM-STRIPE01. En cas d'échec : AdminIncidentRecord P0 type SIGNAL_TRANSITION_FAILED + le signal n'est pas marqué consumed (permet retry) — code l. 161-172.
Stripe webhook proxy autonome (stripe-webhook-proxy/index.js) prêt à déployer Railway/Render/Fly.io si Base44 échoue le rawBody — implémente la validation signature, l'idempotency in-memory (processedEvents Set), forwarding à Base44 via PROXY_BASE44_ENDPOINT.
6 verrous D-101 dans l'ordre canonique dans PayoutExecutor.executePayout() — déjà détaillé en Fiche B §2. Tests confirmés : STRIPE-J8-01 19/19 PASSED, PAYOUT-SETTLED-01 7/7 PASSED.
Tests D-097 dédiés réussis (intégrés dans STRIPE-J8-01) :

T-01 WEBHOOK-SIG-02 : signature invalide rejetée ✓
T-02 WEBHOOK-IDEM-01 : même eventId traité une seule fois ✓
T-03 PAYOUT-BLOCK-KYC : KYC PENDING bloque le payout ✓


DEPOSIT-FAIL-01 : 23/23 PASSED. Le scénario SC-DEPOSIT-FAIL (deposit_pending → deposit_failed → archived avec zéro écriture ledger) est entièrement câblé.
WEBHOOK-RAWBODY-01 : passe le test cryptographique local (signature valide sur string raw, invalide sur objet parsé). Le Plan d'Implantation l. 23 déclare "WEBHOOK-RAWBODY-01 : ✓ PASSED — Base44 préserve le raw body" — assertion fondateur sur Base44 réel.
.env.example documente toutes les variables Stripe nécessaires : STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, PROXY_BASE44_ENDPOINT, PROXY_PORT. Le .env réel (non versionné dans GitHub via .gitignore) contient une vraie clé sk_test_... et un vrai whsec_... pour le pilote J9.
scripts/run-j9-pilot.js orchestre le flux pilote en trois étapes documentées : --step=onboard (création account Connect + URL onboarding), --step=kyc (vérification), --step=payout (exécution finale). Garde-fou explicite : "Vérifier STRIPE_SECRET_KEY commence par sk_test_ (pas sk_live_)".
KYC_STATUS exhaustif (4 valeurs, pas de string libre) : PENDING, IN_REVIEW, VERIFIED, RESTRICTED. Conforme à la doctrine D-097 règle 5.

Ce qui vient de V1 et est encore actif :

Aucun composant Stripe hérité de V1. Recherche grep exhaustive sur microrave.ca + Stripe : retourne uniquement les URLs app.microrave.ca/talent/onboarding/refresh|complete (StripeConnectService.js l. 101-102) — ce sont des URLs cibles V3 reposant sur le domaine V1 (rampe de retour). C'est une dépendance d'URL, pas une dette de code.

Ce qui vient de V2 et a survécu :

Rien. Aucune trace de Stripe ou de paiement V2 dans le code ou les documents. La déclaration du fondateur "V2 abandonnée faute de fondations" est cohérente : Stripe Connect + webhooks + KYC + 6 verrous = fondation V3 native.

──────────────────────────────────────────────────
3. LACUNES IDENTIFIÉES
BLOQUANT (empêche la première transaction) :

repositories.webhookProcessedLogs n'est pas exposé dans src/repositories/index.js. WebhookProcessor.processWebhook() appelle repositories.webhookProcessedLogs.findByEventId(event.id) (l. 73), .create() (l. 85), .markCompleted() (l. 102) sans optional chaining — donc en production, dès le premier webhook reçu, TypeError: Cannot read property 'findByEventId' of undefined. Source de l'identification : grep -nE "webhookProcessedLogs" src/repositories/index.js retourne 0 ligne. Le test STRIPE-J8-01 ne révèle pas ce bug parce qu'il fournit le sous-objet via un mock local (l. 167-174). Conséquence directe : aucun webhook ne peut être traité en environnement réel, donc deposit_pending → deposit_secured ne se déclenche jamais.
repositories.stripePaymentSignals n'est pas exposé dans src/repositories/index.js. WebhookProcessor.handlePaymentIntentSucceeded() appelle repositories.stripePaymentSignals?.create() (l. 159) avec optional chaining — l'appel est silencieusement no-op si le sous-objet est absent. Source de l'identification : même grep retourne 0 ligne dans index.js. Conséquence : le webhook semble réussir (200 OK retourné à Stripe), mais aucun StripePaymentSignal n'est persisté → SignalConsumerService.findAllUnprocessedSignals() retourne toujours [] → la transition n'a jamais lieu. Pire : le bug est silencieux (pas de crash, pas d'incident, pas de trace), conforme au seul interdit que D-101 nomme "jamais blocage silencieux" — ici c'est un succès silencieusement faux.
Aucun consommateur de webhook ne déclenche deposit_secured → event_sealed. SignalConsumerService.processOneSignal() (l. 131-160) ne traite que les signaux où engagement.status === 'deposit_pending' ; les autres sont marqués UNEXPECTED_STATE_xxx. Le webhook du paiement du solde (metadata.phase === 'balance') arrive alors que l'engagement est en deposit_secured → il est ignoré (skipped). Source : SignalConsumerService.js l. 132-140 + recherche grep -rE "deposit_secured.*event_sealed" src/services/ → 0 résultat. Conséquence directe : même si l'organisateur paie le solde, l'engagement ne passe jamais à event_sealed automatiquement — donc pas de ContractSnapshot phase 2, pas de payout possible, pas de première transaction réelle.
La fonction Base44 stripeWebhook est absente de l'archive. Le .env ligne 21 référence https://app.base44.com/api/apps/6a09b5c6ace6051fecd365ae/functions/stripeWebhook mais aucun fichier stripeWebhook* n'existe dans le repo (find . -name "stripeWebhook*" → vide). Source : recherche file system. INFÉRENCE : cette fonction est définie dans l'UI workflow Base44, non versionnée. Si elle n'existe pas dans Base44 réel (à vérifier), aucun webhook Stripe n'arrive jamais à WebhookProcessor. Si elle existe mais ne forward pas correctement le rawBody, D-129 est violé. À valider opérationnellement.

DÉGRADANT (réduit la qualité, n'empêche pas) :

Aucun handler pour charge.refunded ni payment_intent.canceled. Documentés comme "events futurs" dans WebhookProcessor.js l. 23-25. Pour la première transaction nominale (Pierre de Rosette sans dispute, sans annulation), ces events ne se déclenchent pas. Mais dès qu'une annulation J-30/J-7 ou un remboursement no-show survient, le webhook de confirmation Stripe n'est pas écouté — les écritures de réconciliation devront être faites manuellement.
HANDLED_EVENT_TYPES ne contient pas charge.dispute.created (chargeback Stripe). D-098 signal 6 : "PRIOR_CHARGEBACK_ACCOUNT — chargeback MR précédent → lourd (admin review avant event_sealed)" + D-100 job P0 chargeback_hold. Sans webhook chargeback, la doctrine de fraude D-098 n'a pas de déclencheur amont.
Aucune implémentation des 7 signaux de fraude D-098. FraudDetectionPolicyConfig mentionné dans l'OS, aucune config seedée correspondante dans policy-config-schema.js. Pour la première transaction simple (DJ Alex au Trèfle, montant 200-300$), le risque de fraude est négligeable. Mais Event 1+ public sera exposé.
Pas de rotation programmatique des secrets — D-097 règle 4 : "Rotation planifiée dans SecretsRotationPolicyConfig + rotation après incident." SecretsRotationPolicyConfig non implémentée ni seedée. Compensation : rotation manuelle possible via Stripe Dashboard (organisationnel).
Le proxy Stripe stripe-webhook-proxy/index.js utilise un Set in-memory pour l'idempotency (l. 29). Si le proxy redémarre, le Set est vidé → un event Stripe rejoué juste après redémarrage sera traité deux fois. Le commentaire l. 28 le reconnaît : "(remplacer par database en production)". Pour le pilote J9, où le proxy n'est même pas requis si Base44 préserve le rawBody (D-129), ce n'est pas bloquant.

REPORTABLE (peut attendre l'événement 2+) :

Pas de PaymentMethod saved customers (Stripe Customer ID) — createPaymentIntent accepte customerId en option mais aucun service ne le persiste. Pour 1er event : le payeur entre sa carte chaque fois. Acceptable MVP, à industrialiser Event 2+.
Pas de Setup Intents pour pré-autoriser des cartes avant l'event. Hors scope MVP.
Pas de Connect Custom (KYC plus profond) — uniquement Connect Express. Suffisant pour MVP territorial canadien.
Pas de gestion payouts_enabled = false distincte du RESTRICTED global. Pour DJ Alex avec KYC normal canadien : non-bloquant.

ANGLE MORT POTENTIEL :
Y a-t-il quelque chose que ce domaine requiert pour la première transaction que l'OS ne documente pas explicitement ?
→ OUI — quatre INFÉRENCES NON DOCUMENTÉES, à valider par le fondateur :

Quel est le statut opérationnel réel de la fonction Base44 stripeWebhook ? L'archive ne la contient pas (cohérent avec D-127 : "Base44 peut héberger l'objet. Il ne doit pas devenir l'objet."). À valider : (a) la fonction existe-t-elle dans Base44 ? (b) appelle-t-elle bien WebhookProcessor.processWebhook() côté V3 via un endpoint API ? (c) Base44 préserve-t-il le rawBody en pratique réelle (pas seulement en test crypto local) ? Sans cette validation opérationnelle, D-129 est INCONNU, pas PASSED.
Le pont webhook → SignalConsumer est-il câblé ? Plan §0.1 : "L'appelant Base44 (fonction API ou cron) appelle SignalConsumerService.processUnhandledSignals() après chaque webhook reçu." Question : qui en pratique appelle SignalConsumerService ? Si c'est la fonction Base44 stripeWebhook (absente de l'archive), à vérifier. Si c'est un cron, à confirmer dans cron.js.
metadata.phase est-il garanti sur tous les PaymentIntents créés ? Le code WebhookProcessor.handlePaymentIntentSucceeded() lit paymentIntent.metadata?.engagementId et ?.phase (l. 148-149). Si l'amont (Base44 ou UI) ne met pas phase: 'deposit' ou 'balance' dans le metadata, le signal est créé sans phase → SignalConsumerService ne peut pas distinguer. StripeAdapter.createPaymentIntent() reçoit phase en paramètre et le met bien dans metadata (l. 99) — mais l'appelant est-il garanti côté Base44 ? À valider.
Comment se gère un webhook arrivant avant que l'Engagement existe en base ? SignalConsumerService.processOneSignal() (l. 116-129) traite ce cas comme SIGNAL_ORPHAN_NO_ENGAGEMENT P1 et marque le signal consumed — bonne défense. Mais le scénario inverse, un webhook retardé arrivant après un timeout de batch (Stripe peut retry pendant jusqu'à 3 jours), n'est pas couvert spécifiquement. Le signal serait dans UNEXPECTED_STATE_deposit_secured → skipped — comportement défendable, mais à acter explicitement.

──────────────────────────────────────────────────
4. DETTE HÉRITÉE

De V1 : aucune dette Stripe. Les seules URLs V1 sont les refreshUrl/returnUrl (app.microrave.ca/talent/onboarding/...) — la rampe UX de V1 sera réutilisée comme cible de redirection pour l'onboarding Stripe Connect (Plan §3.1 : "Adapter les pages existantes de V1 microrave.ca vers V3"). Accélération : V3 n'a pas à créer les pages d'onboarding talent — V1 les fournit. Dette : V1 doit afficher correctement le retour de Stripe, à valider côté UX.
De V2 : rien. Stripe est l'une des fondations explicitement reconstruites en V3.
De l'OS V3 lui-même : doctrine Stripe exceptionnellement précise — D-097 (10 règles), D-098 (7 signaux fraude), D-101 (6 verrous), D-129 (WEBHOOK-RAWBODY-01 test bloquant), D-130 (MigrationTrigger), D-131 (discipline secrets). Accélération massive : StripeAdapter, ConnectService, WebhookProcessor implémentent cette doctrine ligne-à-ligne — D-097 règles 1, 5, 6, 7 sont câblées avec assertions de tests dédiés (T-01, T-02, T-03 de STRIPE-J8-01).

──────────────────────────────────────────────────
5. DELTA VERS COMPLÉTUDE
Exposer webhookProcessedLogs et stripePaymentSignals dans src/repositories/index.js, ajouter un consommateur du signal phase === 'balance' pour déclencher deposit_secured → event_sealed, valider opérationnellement la fonction Base44 stripeWebhook (existence + forwarding + rawBody préservé sur Base44 réel, pas en test local), et obtenir validation fondateur sur les quatre INFÉRENCES non documentées.
──────────────────────────────────────────────────
6. STATUT FINAL
☒ EN COURS → environ 75 %
Décomposition de l'estimation :

✅ Doctrine D-097 (10 règles) câblée en code : 100 %
✅ StripeAdapter (PaymentIntent, Connect, Transfer, Refund) avec idempotency partout : 100 %
✅ StripeConnectService (5 étapes onboarding + 4 statuts KYC) : 100 %
✅ WebhookProcessor (signature, idempotency, dispatch) — logique : 100 %
✅ 6 verrous D-101 PayoutExecutor : 100 %
✅ Webhook proxy autonome prêt à déployer : 100 % (in-memory idempotency à durcir post-MVP)
✅ Tests P0 D-097 (WEBHOOK-SIG-02, WEBHOOK-IDEM-01, PAYOUT-BLOCK-KYC) : 100 % (intégrés dans STRIPE-J8-01)
❌ Câblage webhookProcessedLogs dans repositories/index.js : 0 % (TypeError garanti en prod)
❌ Câblage stripePaymentSignals dans repositories/index.js : 0 % (no-op silencieux)
❌ Consommateur du paiement du solde (phase='balance') : 0 % (transition event_sealed inatteignable)
⚠ Fonction Base44 stripeWebhook : INCONNU (hors archive)
⚠ KYC réel DJ Alex VERIFIED : INCONNU (Plan §1.3 indique "vérifier directement dans Base44")
⚠ Validation D-129 sur Base44 réel (pas en test local) : INCONNU

──────────────────────────────────────────────────
7. DÉPENDANCES SORTANTES

Domaine A (Ontologie) dépend du déclenchement webhook pour les transitions financières — sans Stripe webhook → deposit_pending → deposit_secured impossible, donc machine d'état bloquée à deposit_pending. Source : OS V15 §2.7.1 ligne deposit_pending→deposit_secured "Webhook Stripe payment_intent.succeeded reçu".
Domaine B (Finance et ledger) : sans Transfer Stripe (Verrou 6 D-101), payable → settled impossible. La première écriture ledger payout_executed n'a lieu qu'après Transfer réussi. Source : PayoutExecutor.js l. 168-187 + D-101.
Domaine D (Présence et preuve) : indépendant de Stripe sur le court terme. INFÉRENCE — à valider.
Domaine F (Scheduler) : Job P0 execute_payout_transfer (D-100) appelle PayoutExecutor → Stripe Transfer. Job P0 chargeback_hold (D-100) dépend du webhook charge.dispute.created non implémenté (DÉGRADANT).
Domaine G (Admin et sécurité) : DataAccessLedgerEntry doit être créée à chaque webhook reçu (D-095). Aujourd'hui non câblé — WebhookProcessor n'appelle pas repositories.admin.appendToDataAccessLedger(). Source : grep sur WebhookProcessor.js.
Domaine J (Acteurs et onboarding) : KYC DJ Alex doit être à VERIFIED avant payout — Plan §1.3 + D-097 règle 5. Domaine J dépend de Stripe Connect orchestration livrée par C — bidirectionnelle.
→ INFÉRENCE non documentée explicitement dans l'OS : le domaine C est précurseur de la première écriture comptable réelle (deposit_pending → deposit_secured) et de la dernière écriture comptable réelle (payable → settled). Sans Stripe fonctionnel, aucun cent ne bouge — donc aucun autre domaine ne peut prouver son fonctionnement au-delà des mocks. C est le goulot d'étranglement temporel du Premier Événement Réel. À valider que cette criticité est partagée par le fondateur.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FIN DE LA FICHE — C. STRIPE ET PAIEMENTS
Fiche conservée pour le Prompt de Synthèse.