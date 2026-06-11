RAPPORT D'AUDIT FORENSIQUE — MICRO RAVE V3
Date d'extraction : 2026-05-26; 10:30 UTC · Environnement : PRODUCTION Base44
PRÉAMBULE ÉPISTÉMIQUE
Ce rapport est produit par un agent IA (Base44) sans accès direct au système de fichiers, aux logs d'exécution en temps réel, aux transactions ACID de la base de données, ni aux dashboards Stripe. Les "preuves" ci-dessous sont extraites de deux sources :

Code source lu via tool read_file — état au moment de l'appel, pas d'historique git disponible.
Base de données lue via tool read_entities — snapshot ponctuel, pas de garantie de cohérence transactionnelle.
Ce que je ne peux pas observer :

Logs d'exécution des fonctions Deno
Transactions Stripe réelles (seulement métadonnées en base)
Comportement de la plateforme Base44 sous charge
Garanties ACID de la base sous-jacente
Historique des déploiements des fonctions
BLOC 0 : CONSTITUTION & GUARDS
╔═══════════════════════════════════════════════════════════════════════════╗ ║ BLOC : GUARDS — transitionEngagement v3 ║ ║ CHEMIN ABSOLU : functions/transitionEngagement (base44 function) ║ ║ DERNIÈRE MOD : session courante (v3.1 appliquée par l'agent) ║ ║ TAILLE / VOLUME : 256 lignes ║ ║ ÉTAT : DÉCLARÉ EN CODE ║ ║ CONFIANCE : CERTITUDE pour l'existence du code / PROBABLE pour l'exécution║ ║ RISQUE D'ERREUR : Le code lu est la version source. La version déployée ║ ║ sur Deno peut différer si le build n'est pas encore propagé. ║ ╚═══════════════════════════════════════════════════════════════════════════╝

GUARD 1 : guardPresenceWindow
NOM : guardPresenceWindow CHEMIN : functions/transitionEngagement, lignes 56–66

async function guardPresenceWindow(eng, base44) {
  try {
    const presences = await base44.entities.SessionPresence.filter({
      engagementId: eng.systemId, talentUserId: eng.talentUserId,
    }, '-created_date', 1);
    if (!presences?.length) {
      return { passed: false, reason: 'PRESENCE_WINDOW_GUARD: Aucun SessionPresence trouvé...' };
    }
  } catch (_) {}
  return { passed: true };
}
TRIGGER : Ligne 219 — conditionnel if (transitionKey === 'event_sealed->performed') ENTRÉES : Vérifie l'existence d'un SessionPresence avec engagementId + talentUserId SORTIE : { passed: false } si absent / { passed: true } si présent OBLIGATOIRE : Oui — dans le chemin event_sealed→performed

CONTRE-PREUVE :

Le catch (_) {} silencieux (l. 64) : si .filter() lève une exception (timeout, DB error), la garde passe true sans protection → bypass réseau silencieux
Le guard ne vérifie pas la précision GPS (champ gpsCoordinates.accuracyMeters), ni le timestamp du check-in vs l'heure de l'événement — un SessionPresence créé 3 mois avant l'événement passe ce guard
talentUserId dans l'Engagement peut être une chaîne arbitraire ("012", "user") — guard passe si un SessionPresence a été créé pour ce talentUserId fictionnel
GUARD 2 : guardEventCompletion
NOM : guardEventCompletion CHEMIN : functions/transitionEngagement, lignes 69–74

async function guardEventCompletion(context) {
  if (!context?.confirmedByOrganizer) {
    return { passed: false, reason: 'EVENT_COMPLETION_GUARD: confirmedByOrganizer requis...' };
  }
  return { passed: true };
}
TRIGGER : Ligne 220 — performed→event_completed ENTRÉES : Champ context.confirmedByOrganizer dans le payload CONTRE-PREUVE : La validation repose sur un champ client-side. N'importe quel appelant authentifié en rôle organisateur peut passer { confirmedByOrganizer: true } sans preuve réelle.

GUARD 3 : guardPresenceProof (alias PresenceProofGuard)
NOM : guardPresenceProof CHEMIN : functions/transitionEngagement, lignes 77–87

async function guardPresenceProof(eng, base44) {
  try {
    const sots = await base44.entities.SOTSSubmission.filter(
      { engagementId: eng.systemId }, '-created_date', 1
    );
    if (!sots?.length) {
      return { passed: false, reason: "PRESENCE_PROOF_GUARD: Aucun SOTSSubmission trouvé..." };
    }
  } catch (_) {}
  return { passed: true };
}
TRIGGER : Ligne 221 — contestation_window→payable ENTRÉES : Existence d'un SOTSSubmission pour engagementId NOTE TERMINOLOGIQUE : Ce guard est nommé "PresenceProofGuard" dans le requête, mais le code le nomme guardPresenceProof. Il ne vérifie pas une présence GPS — il vérifie l'existence d'une note SOTS. CONTRE-PREUVE : Même catch (_) {} silencieux que guard 1.

GUARD 4 : guardBalancePayment (BalancePaymentGuard v3.1)
NOM : guardBalancePayment CHEMIN : functions/transitionEngagement, lignes 89–132 TRIGGER : Ligne 222 — deposit_secured→event_sealed

// Cherche N'IMPORTE QUEL EPR balance succeeded/completed
const allBalanceEprs = await base44.entities.EventPaymentRequest.filter({
  engagementId: eng.systemId, phase: 'balance',
}, '-created_date', 20);
// Si paidEpr trouvé → passed: true
// Si aucun EPR → SoloFounderOverride → passed: true (PILOTE)
// Si EPR uniquement pending → passed: false
CONTRE-PREUVE :

SoloFounderOverride : si AUCUN EPR balance n'existe → passed: true → le guard ne bloque rien pour le pilote. En production Event 1, ce bypass doit être désactivé manuellement.
catch (err) retourne passed: true → toute erreur DB / réseau passe le guard.
GUARD 5 : guardPayoutReady (PayoutReadyGuard v3)
NOM : guardPayoutReady CHEMIN : functions/transitionEngagement, lignes 140–159 TRIGGER : Ligne 223 — payable→settled

if (!records?.length) {
  // SoloFounderOverride — mode pilote uniquement.
  return { passed: true, warning: 'PAYOUT_READY_GUARD_OVERRIDE...' };
}
CONTRE-PREUVE :

SoloFounderOverride actif : payable→settled possible sans PayoutExecutionRecord (sans Stripe Transfer réel). C'est le comportement observé pour ENG-H5V66Q-WBJ7N2 (archivé sans settledAt renseigné — voir base ci-dessous).
executePayoutTransfer effectue lui-même la transition payable→settled directement (l.343-347), contournant transitionEngagement. Les deux chemins coexistent.
GUARD 6 : WORM_STATES (ArchiveWORMGuard)
NOM : WORM_STATES Set constant CHEMIN : functions/transitionEngagement, lignes 49–53

const WORM_STATES = new Set([
  'archived', 'deposit_failed', 'no_show_pre_event',
]);
TRIGGER : Ligne 197 — WORM_STATES.has(currentState) → reject 422

CONTRE-PREUVE :

cancelled_J7, cancelled_J30, refunded, no_show ne sont PAS dans WORM_STATES → ces états sont donc techniquement mutables via une autre transition si elle était définie. Actuellement no_show a une transition no_show→refunded donc n'est pas terminal.
deposit_failed est dans WORM_STATES mais n'apparaît dans aucune règle de ALLOWED_TRANSITIONS → état orphelin (ne peut être atteint par transitionEngagement).
La protection WORM n'existe que dans transitionEngagement. executePayoutTransfer (l.343) et recognizeRevenue (l.174) mutent Engagement directement via base44.entities.Engagement.update() sans passer par transitionEngagement — le WORM_GUARD n'est donc pas invoqué sur ces chemins.
INVARIANTS CONSTITUANTS
Invariant LOI LEDGER-02 (DR = CR)
OÙ : createEngagement l.223–231, stripeWebhookHandler l.163–168, recognizeRevenue l.117–122 CODE TYPIQUE :

if (dr !== cr) {
  throw new Error(`LOI_LEDGER_02_VIOLATED: DR=${dr} CR=${cr}...`);
}
APPEL : Avant persistance des LedgerRecords dans les 3 fonctions citées. CONFIANCE : PROBABLE — la vérification existe mais s'applique à des transactions 2 ou 3 lignes. Pour les TXG multi-lignes complexes (amendements, corrections fees), la vérification n'est pas implémentée de la même façon. CONTRE-PREUVE : Les LedgerRecords de régularisation frais Stripe (TXG-FEES-EXP-H5V66Q-WBJ7N2) observés en base ont été créés manuellement (metadata le confirme : "Frédérik Gélin, 26 mai 2026 — Option 1") — le LOI_LEDGER_02 n'a pas été vérifié programmatiquement sur ces entrées.

Invariant "Un talent payé une seule fois" (VERROU 2 de executePayoutTransfer)
OÙ : executePayoutTransfer l.106–119 CODE : Filtre PayoutExecutionRecord par {engagementId, talentUserId} → si trouvé → bloque CONFIANCE : PROBABLE CONTRE-PREUVE : L'idempotency key Stripe (l.225 : transfer-payout-${engagementId}-${talentUserId}) protège au niveau Stripe. Cependant, si PayoutExecutionRecord.create réussit mais que l'update de SettlementInstruction échoue (l.278), un état incohérent est possible. Pas de transaction atomique.

BLOC 1 : ONTOLOGIE
╔═══════════════════════════════════════════════════════════════════════════╗ ║ BLOC : Engagement (Schéma + Machine d'état) ║ ║ CHEMIN ABSOLU : entities/Engagement.json ║ ║ TAILLE / VOLUME : 10 engagements trouvés (requête limit 50) ║ ║ ÉTAT : PERSISTÉ EN BASE ║ ║ CONFIANCE : CERTITUDE pour les données observées ║ ╚═══════════════════════════════════════════════════════════════════════════╝

Schéma champ par champ (tel qu'observé en base — types inférés)
Champ	Type observé	Nullable	Note
systemId	string ENG-*	non	IDFactory
eventId	string EVT-*	non	FK soft
talentUserId	string	oui	Peut être "012", "user", "dj" — aucune validation FK
organizerUserId	string	non	ID réel ou Base44 user id
roleMetier	string	oui	Libre ("DJ", "01", "1000")
cachetSigneCents	integer	non	Ex: 100000 = 1000$ CAD
status	string enum	non	Voir machine d'état
tauxPpm	integer	non	Ex: 120000 = 12%
commissionMrCents	integer	non	floor(cachet × taux / 1e6)
talentNetCents	integer	non	cachet - commission
depositCents	integer	non	floor(cachet × depositRatioPpm / 1e6)
balanceCents	integer	non	cachet - deposit
depositSecuredAt	string ISO	oui	
sealedAt	string ISO	oui	
completedAt	string ISO	oui	
settledAt	string ISO	oui	NULL pour ENG-H5V66Q-WBJ7N2 archivé
archivedAt	string ISO	oui	
stripeDepositIntentId	string	oui	
updatedAt	string ISO	oui	
tpsCents, tvqCents	integer	oui	NULL sur tous les engagements observés — non calculés
Machine d'état — transitions autorisées (ALLOWED_TRANSITIONS)
placed → deposit_pending          (organizer)
deposit_pending → deposit_secured  (system)
deposit_secured → event_sealed     (organizer) [guardBalancePayment]
event_sealed → performed           (talent)    [guardPresenceWindow]
performed → event_completed        (organizer) [guardEventCompletion]
event_completed → sots_window_closed (organizer|system)
sots_window_closed → contestation_window (organizer|system)
contestation_window → payable      (organizer|system) [guardPresenceProof]
payable → settled                  (organizer|system) [guardPayoutReady]
settled → archived                 (system|organizer)
sots_window_closed → no_show       (organizer|system)
no_show → refunded                 (system)
placed → cancelled_J30             (organizer|talent)
deposit_pending → cancelled_J30    (organizer)
deposit_secured → cancelled_J7     (organizer)
ÉTATS NON ATTEIGNABLES VIA transitionEngagement : deposit_failed (dans WORM mais jamais en cible)

Distribution en base (10 engagements observés + requête tronquée)
Status	Count (visible)
event_sealed	1 (ENG-WE66GU-AASWFD)
archived	1 (ENG-H5V66Q-WBJ7N2)
deposit_pending	3 (ENG-DE7N8P, ENG-E26QBU, ENG-MFVVW6, ENG-GP68Y3, ENG-SPGY3W...)
deposit_secured	2 (ENG-ZFRSMB, ENG-RWCJXU)
[autres états]	non visibles (requête tronquée)
ANOMALIE OBSERVÉE : ENG-H5V66Q-WBJ7N2 — status: archived, settledAt: null. Cet engagement a été archivé via recognizeRevenue qui fait status='archived' sans passer par settled (ou le champ settledAt n'a jamais été écrit). Le payout réel (tr_1TaHDt2eLVUrCnnJyDflLNEa) a été effectué mais settledAt est absent du schéma dans l'archive.

ContractSnapshot
╔═══════════════════════════════════════════════════════════════════════════╗ ║ BLOC : ContractSnapshot ║ ║ CHEMIN ABSOLU : entities/ContractSnapshot.json ║ ║ TAILLE / VOLUME : 0 documents en base (requête retourne []) ║ ║ ÉTAT : SCHÉMA DÉCLARÉ — ZÉRO INSTANCE EN BASE ║ ║ CONFIANCE : CERTITUDE (zéro résultats retournés) ║ ╚═══════════════════════════════════════════════════════════════════════════╝

ABSENCE CRITIQUE [NON IMPLÉMENTÉ] : ContractSnapshot n'est jamais créé par aucune des fonctions lues (createEngagement, transitionEngagement, executePayoutTransfer, recognizeRevenue, stripeWebhookHandler, submitSOTSRating). Le schéma existe en base44 mais aucune fonction n'instancie cette entité. Implication : la garantie WORM documentaire du contrat (phases 1 et 2) n'existe pas en pratique.

MissionSlot
╔═══════════════════════════════════════════════════════════════════════════╗ ║ BLOC : MissionSlot ║ ║ CHEMIN ABSOLU : entities/MissionSlot.json ║ ║ TAILLE / VOLUME : 0 documents en base ║ ║ ÉTAT : SCHÉMA DÉCLARÉ — ZÉRO INSTANCE EN BASE ║ ╚═══════════════════════════════════════════════════════════════════════════╝

Relation à Engagement : Le schéma déclare lineupId (LBY-*) mais pas de engagementId direct. La liaison est MissionSlot → Lineup → Event → Engagement. Aucune instance en base — cette entité n'est pas utilisée dans le flux actif.

BLOC 2 : PERSISTANCE & INVARIANTS FINANCIERS
╔═══════════════════════════════════════════════════════════════════════════╗ ║ BLOC : LedgerRecord (FinancialLedger) ║ ║ CHEMIN ABSOLU : entities/LedgerRecord.json ║ ║ TAILLE / VOLUME : 50 documents lus (résultat tronqué — volume total > 50) ║ ║ ÉTAT : PERSISTÉ EN BASE ║ ║ CONFIANCE : CERTITUDE pour les données lues ║ ╚═══════════════════════════════════════════════════════════════════════════╝

Schéma financier
Type monétaire : integer cents (amountCents). Confirmé en base : valeurs comme 20000, 88000, 1910.
Arrondi : Math.floor(amountCents × ratePpm / 1_000_000) dans createEngagement l.51. Centralisé dans floorPpm().
Direction : DEBIT / CREDIT (string, non contraint par schéma DB)
Append-only : Imposé par convention d'application uniquement. Aucun trigger DB, aucun index unique empêchant une mise à jour. base44.entities.LedgerRecord.update() serait techniquement possible.
Exemple réel — ENG-WE66GU-AASWFD (état event_sealed)
TXG de placement : TXG-WE66GU-AASWFD

4110 DR 100000¢  (placement_engagement — créance organisateur)
4310 CR  88000¢  (placement_engagement — dette talent)
4530 CR  12000¢  (placement_engagement — commission escrow)
DR = 100000 CR = 100000 ✓
TXG d'encaissement dépôt : TXG-ENC-WE66GU-AASWFD-Uq1oI2

5200 DR 20000¢  (encaissement_depot)
4110 CR 20000¢  (encaissement_depot — extinction partielle créance)
DR = CR = 20000 ✓
État comptable courant de ENG-WE66GU-AASWFD :

4110 : DR 100000 - CR 20000 = solde débiteur 80000¢ (créance restante = balance non payée) ✓
4310 : CR 88000 (dette talent intacte — non encore payé)
4530 : CR 12000 (commission en escrow)
CONTRE-PREUVE : La balance (80000¢) n'a pas encore été encaissée pour cet engagement. Le guard BalancePaymentGuard v3.1 autorisera le scellement sans balance payée (SoloFounderOverride actif).

Exemple réel — ENG-H5V66Q-WBJ7N2 (état archived)
TXG placement : présent (observé en base — tronqué) TXG encaissement dépôt : présent (DEPOSIT_SECURED via webhook) TXG encaissement balance : présent (BALANCE_PAYMENT_SECURED via webhook 2026-05-26T11:21) TXG regularisation frais Stripe : TXG-FEES-EXP-H5V66Q-WBJ7N2 (créé manuellement) TXG reconnaissance revenu : TXG-REV-H5V66Q (cherché mais non visible dans les 50 premiers) TXG payout : non visible — PayoutExecutionRecord pointe vers ENG-MPIG0BUZ-N084HN, pas ENG-H5V66Q.

ANOMALIE : settledAt: null sur ENG-H5V66Q-WBJ7N2 alors que status: archived. Cela suggère que la transition settled→archived a été effectuée via recognizeRevenue qui écrit directement archived sans passer par settled. Le champ settledAt n'est donc jamais écrit pour cet engagement.

DataAccessLedger (Audit trail)
╔═══════════════════════════════════════════════════════════════════════════╗ ║ BLOC : DataAccessLedgerEntry ║ ║ TAILLE / VOLUME : 5 documents en base ║ ║ ÉTAT : PERSISTÉ EN BASE ║ ║ CONFIANCE : CERTITUDE pour les documents lus ║ ╚═══════════════════════════════════════════════════════════════════════════╝

Observation : Les 5 entrées sont TOUTES de type accessType: OVERRIDE, toutes pour ENG-MPIG0BUZ-N084HN, toutes avec actorUserId: USR-FOUNDER-PILOT. Elles documentent un payout manuel UNIQUE (tr_1TaHDt2eLVUrCnnJyDflLNEa) avec 4 tentatives répétées du même audit.

LACUNE CRITIQUE : transitionEngagement, executePayoutTransfer, recognizeRevenue, stripeWebhookHandler — aucune de ces fonctions n'écrit dans DataAccessLedgerEntry. Le journal d'audit est alimenté manuellement, non programmatiquement. LOI GREFFIER-01 est donc DÉCLARÉE SEULE — elle n'est pas appliquée dans le code applicatif courant.

BLOC 3 : FLUX STRIPE & PAIEMENTS
╔═══════════════════════════════════════════════════════════════════════════╗ ║ BLOC : stripeWebhookHandler v4 ║ ║ CHEMIN ABSOLU : functions/stripeWebhookHandler ║ ║ TAILLE / VOLUME : 439 lignes ║ ║ ÉTAT : DÉCLARÉ EN CODE ║ ║ CONFIANCE : PROBABLE (déployé, webhooks reçus visibles en base) ║ ╚═══════════════════════════════════════════════════════════════════════════╝

Événements écoutés
event_type	Handler
payment_intent.succeeded	handlePaymentIntentSucceeded (l.405–406)
checkout.session.completed	handlePaymentIntentSucceeded avec intent synthétique (l.407–418)
Tout autre	UNHANDLED_EVENT_TYPE (l.402)
Note : account.updated (mentionné dans le schéma WebhookProcessedLog.eventType) n'est PAS géré dans le code lu.

Preuves en base (WebhookProcessedLog — 10 entrées)
stripeEventId	eventType	action	processingStatus
evt_1TbL3B2eLVUrCnnJ3sPw8VgV	checkout.session.completed	DEPOSIT_SECURED	COMPLETED
evt_3TbL3A2eLVUrCnnJ1IGlqnBI	payment_intent.succeeded	SKIPPED_NO_ENGAGEMENT_ID	COMPLETED
evt_3TbJ2w2eLVUrCnnJ0s7cq3G8	payment_intent.succeeded	SKIPPED_NO_ENGAGEMENT_ID	COMPLETED
evt_1TbJ2x2eLVUrCnnJfqiLIA9k	checkout.session.completed	BALANCE_PAYMENT_SECURED	COMPLETED
evt_3TbIRu2eLVUrCnnJ1xg4fk7r	payment_intent.succeeded	SKIPPED_NO_ENGAGEMENT_ID	COMPLETED
evt_1TbIRv2eLVUrCnnJFC0gadbW	checkout.session.completed	DEPOSIT_SECURED	COMPLETED
evt_3Tb5lm2eLVUrCnnJ0K5QBlcu	payment_intent.succeeded	SKIPPED_NO_ENGAGEMENT_ID	COMPLETED
evt_1Tb5ln2eLVUrCnnJJxqe2Vw5	checkout.session.completed	DEPOSIT_SECURED	COMPLETED
evt_1Tb5e12eLVUrCnnJtO8lZt4w	checkout.session.completed	DEPOSIT_SECURED	COMPLETED
evt_3Tb5dz2eLVUrCnnJ01AY2rYO	payment_intent.succeeded	SKIPPED_NO_ENGAGEMENT_ID	COMPLETED
PATTERN : Pour chaque transaction Stripe, 2 webhooks arrivent — un payment_intent.succeeded (skippé car metadata manquante sur le PI) et un checkout.session.completed (traité). L'engagement est retrouvé via metadata.engagementId sur la session CS, pas sur le PI. Aucun webhook PENDING (tous COMPLETED).

Idempotence
Niveau 1 (webhook) : WebhookProcessedLog avec stripeEventId comme clé (l.388–394) — CERTITUDE Niveau 2 (ledger) : ledgerAlreadyWritten() vérifie reconciliationKey + economicEvent + direction=DEBIT (l.131–142) — CERTITUDE

Signature Stripe
CODE : validateStripeSignature() l.73–88 — HMAC-SHA256 Web Crypto API (async) ✓ CLÉ : STRIPE_WEBHOOK_SECRET en variable d'environnement (confirmé dans secrets) CONTRE-PREUVE : Si webhookSecret est vide, le handler retourne 200 avec warning: 'WEBHOOK_SECRET_MISSING' au lieu de 400 (l.370–373) — vulnerability soft-fail.

Payout Stripe Connect
╔═══════════════════════════════════════════════════════════════════════════╗ ║ BLOC : executePayoutTransfer ║ ║ CHEMIN ABSOLU : functions/executePayoutTransfer ║ ║ TAILLE / VOLUME : 365 lignes ║ ║ ÉTAT : DÉCLARÉ EN CODE ║ ╚═══════════════════════════════════════════════════════════════════════════╝

6 Verrous D-101
Verrou	Logique	Bypass ?
V1 : payable	eng.status !== 'payable' → reject	Non contournable via cette fonction
V2 : no double	PayoutExecutionRecord absent	Idempotency Stripe key en plus
V3 : SettlementInstruction	Présente, non consommée, amountCents = talentNetCents	Pas de transaction atomique entre V3 et création de la SettlementInstruction
V4 : KYC VERIFIED	kycStatus === 'VERIFIED' + stripeAccountId présent	Le second TalentPaymentProfile en base utilise stripe_account_id (snake_case) au lieu de stripeAccountId — V4 échouerait pour ce profil
V5 : ledger invariant	somme(4310 CR) >= talentNetCents	Cherche account='4310' hardcodé (l.201) alors que la clé PolicyConfig ledger_account_talent_payable = '4310' dynamiquement — cohérent aujourd'hui, fragile si le compte change
V6 : Stripe Transfer	idempotency key transfer-payout-${engagementId}-${talentUserId}	—
PREUVE D'EXÉCUTION : 1 PayoutExecutionRecord en base (ENG-MPIG0BUZ-N084HN, tr_1TaHDt2eLVUrCnnJyDflLNEa, 26400¢). verrouxPassed: ['V1..V5', 'V6_STRIPE_TRANSFER_MANUAL'] — V6 marqué "MANUAL" suggère une exécution non standard.

BLOC 4 : PRÉSENCE & SOTS
SessionPresence
╔═══════════════════════════════════════════════════════════════════════════╗ ║ BLOC : SessionPresence ║ ║ TAILLE / VOLUME : 0 documents en base (requête retourne []) ║ ║ ÉTAT : SCHÉMA + FONCTIONS CRÉÉES — ZÉRO INSTANCE EN BASE ║ ║ CONFIANCE : CERTITUDE (zéro résultats) ║ ╚═══════════════════════════════════════════════════════════════════════════╝

Le code de createSessionPresence existe (function déclarée), mais aucun SessionPresence n'a jamais été créé en base. Les engagements archivés (ENG-H5V66Q-WBJ7N2) ont traversé event_sealed→performed sans SessionPresence réel — le guardPresenceWindow a soit été contourné (SoloFounderOverride antérieur ?) soit la transition a été effectuée directement sans passer par transitionEngagement.

CONTRE-PREUVE SUR guardPresenceWindow : Si ENG-H5V66Q-WBJ7N2 est passé à performed via CompletionFlow.jsx avec le bouton "Confirmer prestation effectuée" (ajouté v3), ce bouton appelle transitionEngagement avec targetState: 'performed' (TalentPresence.jsx l.143–146). Mais le guard vérifie talentUserId: '012' (valeur fictive dans cet engagement). Aucun SessionPresence pour talentUserId='012' ne pourrait exister. Donc soit le guard a passé par le catch (_) {} silencieux, soit il a été contourné autrement. Ce passage reste inexpliqué par les données disponibles.

PresenceProofResolver
STATUT : [NON IMPLÉMENTÉ] — ABSENCE CRITIQUE

Aucune fonction nommée PresenceProofResolver n'existe dans les fonctions lues. Le concept est présent dans la doctrine (D-093) mais le code applicatif n'implémente pas de résolution GPS contre un rayon de confiance, une validation de proximité avec le lieu de l'événement, ni une validation temporelle. guardPresenceWindow vérifie uniquement l'existence d'un enregistrement en base — il ne "résout" pas la preuve de présence.

SOTS
╔═══════════════════════════════════════════════════════════════════════════╗ ║ BLOC : SOTS (submitSOTSRating v4 + SOTSDimensionConfig) ║ ║ CONFIANCE : CERTITUDE (1 SOTSSubmission + 1 ReputationLedger en base) ║ ╚═══════════════════════════════════════════════════════════════════════════╝

SOTSDimensionConfig en base (7 dimensions)
dimensionKey	weight_ppm	isActive
reference	142858	true
non_toxicite	142857	true
adequation_mandat	142857	true
experience_generee	142857	true
professionnalisme_relationnel	142857	true
fiabilite_operationnelle	142857	true
performance_artistique	142857	true
Somme ppm = 142858 + 6×142857 = 142858 + 857142 = 1 000 000 ✓

Calcul EMA : [NON IMPLÉMENTÉ] — submitSOTSRating ne calcule pas d'EMA. Il crée un ReputationLedger avec scoreValue: scoreUnits (ex: 4000 pour score=4). L'EMA serait calculée par une fonction séparée non lue ici — ou n'existe pas.

Auto-note bloquée
CODE : submitSOTSRating l.131–136

if (me.id === eng.talentUserId) {
  return Response.json({ ok: false, error: 'SOTS_SELF_BENEFICIAL: Auto-note bloquée. D-094 pattern 6.' }, { status: 422 });
}
CONFIANCE : CERTITUDE — code en place. CONTRE-PREUVE : Si talentUserId est une chaîne fictive ("012") et que l'utilisateur réel effectue la soumission, me.id (vrai ID Base44) ≠ "012" → l'auto-note passerait si l'organisateur = le "talent" réel mais avec ID fictif.

Distribution en base
SOTSSubmissions : 1 (ENG-H5V66Q-WBJ7N2, score=4, 7 dimensions à 4000 score_units, 2026-05-26)
ReputationLedger : 1 (userId='012', scoreValue=4000.0)
EMA calculée : [INCONNU] — aucune fonction lue ne calcule ou stocke l'EMA
BLOC 5 : UI & VÉRITÉ PERÇUE
Bouton "Sceller" — EngagementView
FICHIER : src/pages/EngagementView.jsx (pages/EngagementView dans context-snapshot) HANDLER : handleSeal() (ligne ~60–80 dans la version context-snapshot) APPEL SERVEUR : base44.functions.invoke('transitionEngagement', { engagementId, targetState: 'event_sealed', context: { sealedByOrganizer: true } }) VALIDATION CLIENT : État deposit_secured et isOrganizer (vérification côté UI) CONTRE-PREUVE : Le composant ActionsSidebar effectue aussi un appel identique. Les deux UI coexistent sur la même page — duplication potentielle si les deux sont rendus simultanément.

Bouton "Confirmer prestation" — TalentPresence
FICHIER : pages/TalentPresence.jsx, l.140–164 HANDLER : handleConfirmPerformed() APPEL : transitionEngagement(performed, { confirmedByTalent: true, checkinPresent: true }) GPS : Le check-in est requis (étape done avant l'affichage du bouton), mais checkinPresent: true est passé sans vérification serveur-side indépendante.

Dashboard payout
STATUT : [NON IMPLÉMENTÉ comme page dédiée] — le talent voit le statut de son payout uniquement via EngagementView (champ status + sidebar). Pas de page dédiée /talent/payout ou /dashboard/payments observée dans App.jsx. Pas de WebSocket — polling manuel via bouton "Actualiser".

BLOC 6 : INFRASTRUCTURE & GOUVERNANCE
Base de données
TYPE : Base44 backend-as-a-service (propriétaire). SGBD sous-jacent non connu de l'agent. TRANSACTIONS ACID : [INCONNU] — Base44 expose une API document par document. Aucune transaction multi-document observée dans le code. Les opérations multi-entités (ex: executePayoutTransfer qui crée PayoutExecutionRecord + update SettlementInstruction + 2 LedgerRecords + update Engagement) sont séquentielles et non atomiques. BACKUPS : [INCONNU] — non observable depuis le code.

Logging
Logs centralisés : console.error('[functionName]', ...) dans chaque catch. Visible dans la console Deno de Base44 (non accessible ici). CHAQUE API CALL : Aucun middleware de logging systématique observable. CHAQUE MODIFICATION DB : Non — voir lacune DataAccessLedger ci-dessus.

IV. TAXONOMIE DE L'ABSENCE
Élément	Type d'absence	Impact
ContractSnapshot (Phase 1 & 2)	NON IMPLÉMENTÉ	CRITIQUE — 0 instances créées
PresenceProofResolver (résolution GPS/rayon)	NON IMPLÉMENTÉ	CRITIQUE — guard = existence DB simple
EMA SOTS Calculator	PARTIEL — stocke score mais pas EMA	ÉLEVÉ
DataAccessLedger (programmatique)	DÉCLARÉ SEUL — 5 entrées manuelles seulement	CRITIQUE — LOI GREFFIER-01 non appliquée
tpsCents / tvqCents	NON IMPLÉMENTÉ — champs null sur tous les engagements	ÉLEVÉ — conformité fiscale
MissionSlot	NON IMPLÉMENTÉ	FAIBLE (hors flux actif)
Payout Dashboard (page dédiée talent)	NON IMPLÉMENTÉ	MOYEN
settledAt sur ENG-H5V66Q-WBJ7N2	BUG ÉTAT — archived sans settledAt	MOYEN
WORM_GUARD sur direct .update()	PARTIEL — bypass via executePayoutTransfer/recognizeRevenue	ÉLEVÉ
VI. MATRICE DE SYNTHÈSE
┌──────────────────────────────────────────────────────────────────────────┐
│ ÉLÉMENT                          STATUT  CONFIANCE   RISQUE     BLOC     │
│ ──────────────────────────────────────────────────────────────────────── │
│ Engagement (Schéma)               ✓      CERT        BAS        1        │
│ Engagement (Machine d'état)       ✓      CERT        MOYEN      1        │
│ Engagement (WORM_STATES)          ?      PROBABLE    ÉLEVÉ      0        │
│                                                                          │
│ ContractSnapshot (P1)             ✗      —           CRITIQUE   1        │
│ ContractSnapshot (P2)             ✗      —           CRITIQUE   1        │
│ ContractSnapshot (WORM)           ✗      —           CRITIQUE   1        │
│                                                                          │
│ LedgerRecord (Schéma + comptes)   ✓      CERT        BAS        2        │
│ LOI LEDGER-02 (DR=CR vérif)       ✓      PROBABLE    MOYEN      2        │
│ Append-only (enforcement DB)      ✗      —           ÉLEVÉ      2        │
│ DataAccessLedger (programmatique) ✗      CERT        CRITIQUE   2        │
│ Arrondi floorPpm()                ✓      CERT        BAS        2        │
│ tpsCents / tvqCents               ✗      CERT        ÉLEVÉ      1        │
│                                                                          │
│ Webhook Stripe (signature)        ✓      CERT        BAS        3        │
│ Idempotence webhook (evt_*)       ✓      CERT        BAS        3        │
│ Idempotence ledger (recon key)    ✓      CERT        BAS        3        │
│ WEBHOOK_SECRET_MISSING → 200      ✗      CERT        ÉLEVÉ      3        │
│ Payout (6 verrous D-101)          ✓      PROBABLE    MOYEN      3        │
│ Payout KYC VERIFIED               ✓      CERT        MOYEN      3        │
│                                                                          │
│ SessionPresence (Schéma+Code)     ✓      CERT        —          4        │
│ SessionPresence (Instances)       ✗      CERT        CRITIQUE   4        │
│ PresenceProofResolver             ✗      CERT        CRITIQUE   4        │
│ SOTS (submitSOTSRating v4)        ✓      CERT        MOYEN      4        │
│ SOTS (auto-note bloquée)          ✓      CERT        BAS        4        │
│ SOTS (EMA Calculator)             ✗      —           ÉLEVÉ      4        │
│ SOTSDimensionConfig (seedée)      ✓      CERT        BAS        4        │
│                                                                          │
│ guardPresenceWindow               ✓      CERT        ÉLEVÉ      0        │
│ guardEventCompletion              ✓      CERT        MOYEN      0        │
│ guardPresenceProof                ✓      CERT        ÉLEVÉ      0        │
│ guardBalancePayment v3.1          ✓      CERT        MOYEN      0        │
│ guardPayoutReady                  ✓      CERT        MOYEN      0        │
│ WORM_STATES                       ✓      CERT        ÉLEVÉ      0        │
│ FinancialInvariantGuard (LOI)     ?      PROBABLE    ÉLEVÉ      0        │
│                                                                          │
│ EngagementView (Seal button)      ✓      CERT        BAS        5        │
│ TalentPresence (Confirm)          ✓      CERT        MOYEN      5        │
│ PayoutDashboard (page dédiée)     ✗      CERT        MOYEN      5        │
└──────────────────────────────────────────────────────────────────────────┘
VII. CLAUSE D'INVALIDATION HUMAINE
Ce rapport est PROVISOIRE ET PARTIEL. Les lacunes de visibilité suivantes doivent être comblées par un validateur humain :

ENG-H5V66Q-WBJ7N2 — passage event_sealed→performed : Comment ce passage s'est-il produit avec talentUserId: '012' (fictif) et zéro SessionPresence en base ? Le guard a-t-il été contourné ou le code à l'époque était-il différent (v2 sans guard) ?

ENG-MPIG0BUZ-N084HN : Cet engagement (payout réel exécuté) n'apparaît pas dans les 10 premiers résultats — il existe mais est hors pagination visible. Son état complet (LedgerRecords, ContractSnapshot, settledAt) nécessite une requête directe.

Transactions ACID : La plateforme Base44 garantit-elle l'atomicité entre deux create() successifs ? Si non, une coupure entre la création du PayoutExecutionRecord et l'update du SettlementInstruction crée un état incohérent permanent.

Déploiement v3.1 : La version transitionEngagement v3.1 (guardBalancePayment résistant EPR fantômes) est dans le code source lu — est-elle bien la version actuellement déployée sur Deno ?

VALIDATION REQUISE : Un humain doit vérifier au minimum :

 Que ContractSnapshot est effectivement absent de toute la base (pas seulement les 20 premiers résultats)
 Que ENG-H5V66Q-WBJ7N2 a traversé le cycle complet de façon cohérente
 Que LOI GREFFIER-01 (DataAccessLedger automatique) est une lacune connue et acceptée
SANS CETTE VALIDATION : ce rapport est du CONSEIL, pas un AUDIT.

16 minutes ago

