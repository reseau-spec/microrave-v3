━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FICHE D'ÉVALUATION — C. Stripe et paiements
(webhooks, idempotency, rawbody, KYC, payout)
Date d'évaluation : 20 mai 2026
Documents sources :
  • MICRORAVE_V3_OPERATING_SYSTEM_V15.md (OS V15 — source souveraine)
  • EXPORT_BRUT—REGISTRES_SOUVERAINS_MICRO_RAVE_V3.md
    (D-097, D-101, D-129, D-130, D-132, D-133, D-144)
  • StripeAdapter.js · StripeConnectService.js · WebhookProcessor.js
  • PayoutExecutor.js · stripe-webhook-proxy/index.js
  • EventPaymentGuard.js · .env
  • tests/p0/ : STRIPE-J8-01, WEBHOOK-RAWBODY-01
    (exécutés en direct)
Niveau de confiance : HAUTE sur la logique de code Stripe
                      HAUTE sur les tests STRIPE-J8-01 (19/19 PASSED)
                      PARTIELLE sur WEBHOOK-RAWBODY-01 (bug test, non bug prod)
                      INFÉRENCE sur l'état réel Base44 webhook endpoint
──────────────────────────────────────────────────
1. CRITÈRES DE COMPLÉTUDE

Ce domaine est prêt pour la première transaction quand :

- STRIPE_SECRET_KEY et STRIPE_WEBHOOK_SECRET configurés en .env
  avec clés non-placeholder — D-097 règle 1 + 3,
  EXPORT_BRUT section D-097
- Signature webhook validée avec raw body préservé avant tout
  traitement — D-097 règle 6, EXPORT_BRUT section D-097 +
  D-129 : "Un seul FAILED = Event 0B interdit"
- WebhookProcessedLog idempotent opérationnel en database —
  D-097 règle 7, EXPORT_BRUT section D-097
- KYCStatus = VERIFIED pour le talent payé avant tout Transfer
  — D-097 règle 5, EXPORT_BRUT section D-097
- 6 verrous anti-double payout (D-101) exécutés dans l'ordre
  à payable→settled — EXPORT_BRUT section D-101
- TalentPaymentProfile avec stripeAccountId persisté pour le
  talent de la Pierre de Rosette (DJ Alex) — D-097 règle 5
- Webhook endpoint Base44 configuré et reçoit les événements
  payment_intent.succeeded / payment_intent.payment_failed —
  OS V15 section 14.9 C06, D-129
- STRIPE_WEBHOOK_SECRET réel (non placeholder) configuré sur
  l'endpoint Stripe Dashboard — D-097 règle 3

Ce domaine bloque tout le reste si :

- WEBHOOK-RAWBODY-01 FAILED et proxy non déployé — D-129 :
  "Un FAILED = Event 0B interdit" + EXPORT_BRUT D-129 :
  "Le proxy est une précondition, pas un plan B"
- STRIPE_WEBHOOK_SECRET = 'whsec_REMPLACER' en production —
  signature invalide sur chaque webhook Stripe → aucun
  deposit_secured ne peut être créé — source : .env ligne active
- Double payout si D-101 non respecté — EXPORT_BRUT D-101
- KYC non vérifié → Transfer Stripe refusé → settled impossible

──────────────────────────────────────────────────
2. ÉTAT ACTUEL DOCUMENTÉ

Ce qui existe et fonctionne selon les documents :

StripeAdapter.js — Opérationnel, conforme D-097.
  • Point d'accès unique à l'API Stripe (require('stripe')
    centralisé en un seul endroit) — D-097 règle 2.
  • Lazy singleton avec fail-fast si clé absente ou 'REMPLACER'
    — D-097 règle 1.
  • checkConfig() retourne { configured, missing } —
    fail-fast au démarrage.
  • Idempotency keys dérivées sur toutes les opérations :
    createPaymentIntent → `pi-{engagementId}-{phase}`,
    createTransfer → `tr-{engagementId}-{talentUserId}`,
    createRefund → `re-{engagementId}-{reason}`,
    createConnectAccount → `acct-create-{talentUserId}` —
    source : StripeAdapter.js.
  • constructWebhookEvent(rawBody, signature) — délègue à
    stripe.webhooks.constructEvent — D-097 règle 6.
  • Résultats normalisés { ok, data, error } — force la
    gestion d'erreur à chaque call-site.

StripeConnectService.js — Onboarding complet implémenté.
  • initiateTalentOnboarding() : idempotent (vérifie profil
    existant avant de créer le compte Express) — D-097.
  • verifyKYCStatus() : dérive PENDING/IN_REVIEW/VERIFIED/
    RESTRICTED depuis details_submitted + charges_enabled +
    payouts_enabled — D-097 règle 5.
  • handleAccountUpdated() dans WebhookProcessor : met à jour
    KYC en temps réel sur webhook account.updated — D-097.

WebhookProcessor.js — Architecture sécurisée.
  • Validation signature → idempotency check → logger AVANT
    dispatch (fail-safe D-097) → dispatcher → markCompleted.
  • HANDLED_EVENT_TYPES : payment_intent.succeeded,
    payment_intent.payment_failed, account.updated,
    transfer.created — source : WebhookProcessor.js.
  • payment_intent.succeeded → StripePaymentSignal persisté
    (signal non-couplé — la transition deposit_secured est
    déclenchée par la couche appelante, pas directement ici).
  • payment_intent.payment_failed → signal SC-DEPOSIT-FAIL
    avec amountReceivedCents=0 — source : WebhookProcessor.js.

PayoutExecutor — 6 verrous D-101 opérationnels.
  • Verrous 1–6 exécutés dans l'ordre strict.
  • STRIPE-J8-01 : 19/19 PASSED — source : exécution directe.
  • Tests couvrent : signature invalide (T-01), idempotency
    webhook (T-02), KYC PENDING bloque (T-03), 6 verrous
    (T-04→T-10), onboarding idempotent (T-11), KYC update
    (T-12), payment signals (T-13/T-14), batch multi-talent
    (T-15/T-16), checkConfig (T-17/T-18).

stripe-webhook-proxy/index.js — Proxy de secours présent.
  • Utilise express.raw() pour préserver le raw body — conforme
    D-129. Valide la signature, vérifie l'idempotency, forward
    à Base44 uniquement les events validés — source :
    stripe-webhook-proxy/index.js.

Ce qui vient de V1 et est encore actif :
  STRIPE_SECRET_KEY sk_test_51TZFgN... présent dans .env et
  fonctionnel — source : .env. Comptes Stripe Connect des
  talents V1 potentiellement réutilisables. ACQUIS : réseau
  Stripe établi. DETTE : STRIPE_WEBHOOK_SECRET = 'whsec_REMPLACER'
  — jamais configuré, aucun webhook de production ne peut être
  validé avec ce placeholder.

Ce qui vient de V2 :
  Néant. V2 abandonnée.

──────────────────────────────────────────────────
3. LACUNES IDENTIFIÉES

BLOQUANT (empêche la première transaction) :

- BLOQUANT-C1 — STRIPE_WEBHOOK_SECRET = 'whsec_REMPLACER'.
  Source : .env ligne active. Toute validation de signature
  Stripe lève STRIPE_CONFIG_MISSING — source : StripeAdapter.js
  constructWebhookEvent() ligne 114.
  CONSÉQUENCE : aucun webhook Stripe ne peut être validé.
  deposit_pending→deposit_secured est déclenché par webhook
  payment_intent.succeeded — source : OS V15 section 2.7.1
  tableau transition. Sans webhook validé = aucun acompte
  sécurisé = chemin nominal bloqué dès la 3e transition.

- BLOQUANT-C2 — WEBHOOK-RAWBODY-01 : FAILED (Test A).
  Source : exécution directe. Le test échoue car l'HMAC du
  test est calculé en strippant 'whsec_' du secret, mais
  Stripe SDK 14.25.0 attend le secret complet (avec préfixe)
  pour la validation. Résultat : le test produit FAILED même
  quand le raw body est correctement préservé comme string —
  source : exécution node -e de diagnostic (PASSED avec secret
  complet, FAILED avec secret strippé).
  DISTINCTION CRITIQUE : c'est un BUG DU TEST, pas un bug de
  production. La logique StripeAdapter.constructWebhookEvent()
  passe le secret complet à stripe.webhooks.constructEvent()
  — ce code est correct. Mais tant que WEBHOOK-RAWBODY-01
  reste FAILED, D-129 interdit Event 0B — EXPORT_BRUT D-129 :
  "Un seul FAILED = Event 0B interdit."
  → Deux sous-problèmes indépendants : (a) corriger le test
  pour qu'il utilise le bon HMAC, (b) vérifier que Base44
  préserve le raw body en production.

- BLOQUANT-C3 — TalentPaymentProfile non seeded pour DJ Alex.
  Source : INFÉRENCE — aucun profil de paiement visible dans
  le code V3 livré, aucun seed script pour TalentPaymentProfile.
  PayoutExecutor.verrou4 exige KYCStatus = VERIFIED —
  source : PayoutExecutor.js. Sans profil, le Transfer Stripe
  ne peut pas être exécuté. À valider : le KYC de DJ Alex
  est-il VERIFIED dans Base44 ?

- BLOQUANT-C4 — Webhook endpoint Base44 non configuré ni testé.
  Source : INFÉRENCE — rien dans le code ou les docs confirme
  qu'un endpoint Base44 recevant des webhooks Stripe existe
  et est pointé dans le Stripe Dashboard. WEBHOOK-RAWBODY-01
  est précisément conçu pour tester ça — mais il ne peut
  s'exécuter qu'avec un endpoint réel actif. PROXY_BASE44_ENDPOINT
  = 'https://REMPLACER...' dans .env — non configuré.

DÉGRADANT (réduit la qualité, n'empêche pas) :

- Proxy stripe-webhook-proxy/index.js utilise un Set()
  en mémoire pour l'idempotency (processedEvents) — source :
  stripe-webhook-proxy/index.js ligne 29. D-097 règle 7 exige
  WebhookProcessedLog en database. Un redémarrage du proxy
  = perte de l'état idempotency = risque de double-traitement.
  Non-bloquant si Base44 peut gérer le rawbody directement
  (proxy non utilisé), bloquant si proxy requis en production.

- STRIPE_PUBLISHABLE_KEY = 'pk_test_REMPLACER' — source : .env.
  Non bloquant pour le backend (la clé publiable est frontale),
  mais le frontend ne peut pas créer de PaymentMethod sans
  cette clé. Si l'organisateur paie via le frontend V3, c'est
  bloquant. Si le paiement est géré via Base44 UI, impact à
  évaluer.

- Restricted keys Stripe par usage (D-097 règle 8) — non
  implémenté. La même clé sk_test_* est utilisée pour tous
  les usages (webhooks, Connect, Transfers). Non bloquant
  pour le premier event, requis avant mise en production.

- events futurs payment_intent.canceled et charge.refunded
  documentés dans WebhookProcessor.js mais non implémentés
  — source : WebhookProcessor.js commentaire. Non bloquant
  pour SC-01 chemin nominal.

REPORTABLE (peut attendre l'événement 2+) :

- SecretsRotationPolicyConfig + rotation après incident
  — D-097 règle 4. Post-MVP.
- D-098 (7 signaux de fraude, 3 niveaux, rail HOLD) — non
  implémenté. Post-Event 1.
- Restricted Stripe keys par usage — post-Event 1.
- D-133 observabilité MVP (10 alertes P0) — précondition
  Event 0B selon EXPORT_BRUT D-133. À valider si requis
  avant Event 1 ou seulement Event 0B.

ANGLE MORT POTENTIEL :
→ INFÉRENCE NON DOCUMENTÉE 1 : L'OS V15 section 14.9 stipule
  que la première transaction requiert un « talent réel payé
  via Stripe Connect » — mais aucun document ne précise si
  les clés live doivent être actives pour Event 1 ou si
  Stripe test mode suffit. La séquence EXPORT_BRUT D-144
  distingue Event 0A (Stripe test), Event 0B (Stripe live
  5-10$), Event 1 (réel). Si Event 1 peut se faire en mode
  test, BLOQUANT-C1 est moins urgent. Si Event 1 nécessite
  les clés live, STRIPE_WEBHOOK_SECRET live est bloquant
  immédiatement.
→ INFÉRENCE NON DOCUMENTÉE 2 : WebhookProcessor.js persiste
  le StripePaymentSignal (via repositories.stripePaymentSignals?.create)
  mais la transition deposit_secured n'est PAS déclenchée
  automatiquement — l'appelant (couche Base44/API) doit le
  faire. Il n'existe pas dans le code V3 livré de service
  ou de cron qui consomme les StripePaymentSignals et déclenche
  transitionEngagement(). Ce chaînon manquant est architecturalement
  non documenté dans l'OS. À valider avec le fondateur.

──────────────────────────────────────────────────
4. DETTE HÉRITÉE

De V1 : STRIPE_SECRET_KEY sk_test_* opérationnel — ACQUIS
  direct. Les comptes Stripe Connect des talents V1 sont
  potentiellement réutilisables sans re-onboarding. DETTE :
  aucune gestion webhooks ni idempotency en V1 — la discipline
  de WebhookProcessedLog est entièrement nouvelle.

De Base44 : PROXY_BASE44_ENDPOINT non configuré. La question
  de si Base44 préserve le raw body (D-129) n'a pas encore
  été résolue sur l'instance V3 — test bloqué par BLOQUANT-C1
  (webhook secret absent). Cette incertitude a été anticipée
  dans l'architecture par la présence du proxy de secours.

De l'infrastructure locale : WEBHOOK-RAWBODY-01 est conçu
  pour être exécuté sur un endpoint Base44 réel avec Stripe
  CLI forwarding. Il ne peut pas être résolu en isolation dans
  un environnement de test unitaire sans l'infrastructure réelle.

──────────────────────────────────────────────────
5. DELTA VERS COMPLÉTUDE

Configurer STRIPE_WEBHOOK_SECRET avec une vraie valeur dans
.env et dans le Stripe Dashboard, corriger le calcul HMAC
dans WEBHOOK-RAWBODY-01 (utiliser le secret complet sans
stripping), valider que Base44 préserve le raw body (ou
déployer le proxy avec WebhookProcessedLog en database),
vérifier que KYCStatus de DJ Alex = VERIFIED, et implémenter
le service qui consomme les StripePaymentSignals pour déclencher
automatiquement transitionEngagement().

──────────────────────────────────────────────────
6. STATUT FINAL

☑ PRÊT SOUS CONDITIONS → lesquelles :

  1. STRIPE_WEBHOOK_SECRET configuré (non-placeholder)
     dans .env et Stripe Dashboard
  2. WEBHOOK-RAWBODY-01 corrigé (bug test HMAC)
     et résultat PASSED sur endpoint Base44 réel
  3. TalentPaymentProfile DJ Alex = KYCStatus VERIFIED
  4. Chaînon StripePaymentSignal → transitionEngagement()
     implémenté (consommateur des signaux webhook)

  La logique Stripe elle-même (StripeAdapter, StripeConnectService,
  WebhookProcessor, PayoutExecutor, 6 verrous D-101) est
  architecturalement complète et testée à 19/19. Les conditions
  bloquantes sont toutes de configuration ou d'intégration,
  pas de logique métier.

──────────────────────────────────────────────────
7. DÉPENDANCES SORTANTES

- A. Machine d'état (transitionEngagement) dépend de ce
  domaine pour la transition deposit_pending→deposit_secured
  — source : OS V15 section 2.7.1 tableau. Sans webhook
  payment_intent.succeeded validé, cette transition ne peut
  jamais être déclenchée.

- B. Finance et ledger dépend de ce domaine pour que
  SealingGuard reçoive un dépôt et une balance confirmés
  (depositReceivedCents, balanceReceivedCents) — source :
  SealingGuard.js context requis.

- E. Archivage global (settled→archived) dépend du Transfer
  Stripe confirmé via PayoutExecutor — source : OS V15
  section 2.7.1 payable→settled (GUARD 4.5).

- INFÉRENCE : GoNoGoDecisionRecord = GO (condition de la
  première transaction) exige zéro BugReplayRecord P0
  non PASSED et payout exécuté automatiquement — source :
  EXPORT_BRUT D-144. Ce domaine est sur le chemin critique
  du GoNoGo.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FIN DE LA FICHE — C. Stripe et paiements
Conserver cette fiche pour le Prompt de Synthèse.