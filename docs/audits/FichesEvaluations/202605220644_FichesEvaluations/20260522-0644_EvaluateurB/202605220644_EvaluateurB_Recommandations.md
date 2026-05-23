# MARCHE À SUIVRE — DE MAINTENANT JUSQU'AU SUCCÈS
Évaluateur B 
2026-05-22 23:44 EST

**Arbitrage validé** : *CONTROLLED SUCCESS d'abord, FULL SUCCESS ensuite.* L'OS le prévoit (D-144 palier intermédiaire). C'est un chemin honoré, pas un compromis.

**Doctrine de séquençage** : prouver que la machine marche **avec interventions humaines documentées** (chaque intervention = AdminAction + DataAccessLedger + SoloFounderOverride tracés). Puis remplacer chaque intervention par son automatisation, une à une, jusqu'à ce qu'il n'en reste aucune.

---

## PHASE 1 — CONTROLLED SUCCESS

**Cible** : DJ Alex effectivement payé via Stripe Connect au Bar Le Trèfle, ledger équilibré, ContractSnapshot WORM phases 1 et 2 persistés, présence prouvée (override documenté), archivage global, GoNoGoDecisionRecord = GO. Avec interventions humaines tracées partout où la chaîne automatique n'est pas câblée.

**Estimation** : 5 à 10 jours ouvrables si exécutée concentrée.

### Vague 1.A — Corrections triviales et bloquantes (Jour 1, en parallèle)

Ces actions n'ont aucune dépendance entre elles. Une équipe de deux à trois personnes peut les mener en une journée.

**1.1 — Corriger le bug `runBase44Id` dans `src/services/SchedulerService.js` ligne 78**

Référence circulaire dans la déclaration `const runBase44Id = runRecord.id || runBase44Id;`. En mode strict, ReferenceError silencieuse. Correction :

```js
const runBase44Id = runRecord.id;
```

Effort : 2 minutes. Sans cette correction, `cron.js` lève une erreur à la première exécution.

**1.2 — Exposer les interfaces manquantes dans `src/repositories/index.js`**

Ajouter `webhookProcessedLogs` et `stripePaymentSignals` comme sous-objets exposant les méthodes attendues par `WebhookProcessor` et `SignalConsumerService` (`create`, `findByEventId`, `markCompleted`, etc.). Le PaymentRepository expose déjà ces méthodes en interne — il s'agit juste de les exposer au point d'entrée.

Effort : 2 à 3 heures.

**1.3 — Exécuter le seedage de production sur la base Base44 cible**

```bash
node scripts/seed-policy-config.js   # configs CRITIQUES en DB
node scripts/seed-pilot-data.js       # DJ Alex + Le Trèfle + MembershipPlan + Engagement
```

Effort : 10 minutes incluant la vérification des `.pilot-ids.json` produits.

**1.4 — Initier l'onboarding Stripe Connect de DJ Alex**

```bash
node scripts/run-j9-pilot.js --step=onboard
```

Récupérer l'URL produite, la transmettre à DJ Alex, lui demander de compléter Stripe Express (informations personnelles, coordonnées bancaires, vérification d'identité). **Cette étape déclenche un délai Stripe de quelques heures à 24h** — c'est la première étape à lancer, pour que le délai humain tourne en parallèle des corrections code.

Effort code : 5 minutes. Effort opérationnel : à monitorer.

### Vague 1.B — Câblage opérationnel (Jours 2 à 3)

Ces actions dépendent de la Vague 1.A.

**1.5 — Décider le canal webhook Stripe et le déployer**

Deux options. Choisir l'une, exécuter, ne pas revenir dessus.

*Option A — Fonction Base44 native* : créer la fonction `stripeWebhook` côté Base44 UI (référencée dans `.env`), qui reçoit le webhook brut, le passe à `WebhookProcessor.processWebhook()`, puis appelle `SignalConsumerService` pour déclencher la transition. Avantage : un seul environnement. Inconvénient : couplage Base44.

*Option B — Proxy autonome `stripe-webhook-proxy/index.js`* : déjà présent dans le repo, prêt à déployer sur Railway ou Render. Valide la signature en raw body (D-129), transmet à V3 via API. Avantage : portabilité D-127 préservée. Inconvénient : un service de plus à monitorer.

**Recommandation auditeur** : Option B. Elle est déjà codée, elle respecte D-127 et D-129 (test P0 bloquant pour Event 0B futur), et elle prépare la migration PostgreSQL future. L'effort marginal sur Option B vs A est faible.

Effort : 1 jour (déploiement + configuration endpoint Stripe Dashboard + tests sandbox).

**1.6 — Compléter l'injection de repositories dans `scripts/cron.js`**

Le `cron.js` actuel n'injecte que 5 repositories. Compléter pour injecter `sots`, `reputation`, `sessionPresence`, `payment`, `talentPaymentProfiles`, `contractSnapshots`, `settlementInstructions`, `payoutExecutionRecords`, `ledgerRecords`. Sans cela, les guards exécutés par les transitions du scheduler échouent sur context incomplet.

Effort : 30 minutes.

**1.7 — Vérifier que DJ Alex a complété son KYC Stripe**

```bash
node scripts/run-j9-pilot.js --step=kyc
```

Le résultat doit afficher `kycStatus: VERIFIED, payoutsEnabled: true`. Si encore `PENDING` ou `IN_REVIEW`, attendre et relancer.

**Point de gate inflexible** : sans `VERIFIED`, Phase 1 est interrompue. Pas de contournement, pas d'override possible — Stripe refusera le Transfer.

### Vague 1.C — Exécution Pierre de Rosette avec interventions documentées (Jours 4 à 7)

À ce stade, tout le code prérequis est en place et seedé. Reste à exécuter la chaîne, en remplaçant chaque maillon manquant par une intervention humaine **tracée** plutôt que silencieuse.

**1.8 — Transition `proposed → negotiating → accepted` (manuelle, documentée)**

`run-j9-pilot.js` ou un script ad hoc. Persister effectivement le `ContractSnapshot V1` retourné par `MissionConversionGuard` (sinon WORM Moment 1 reste virtuel). Créer un `AdminAction` type `MANUAL_ACCEPTANCE_PIERRE_DE_ROSETTE` + `DataAccessLedgerEntry` marqueur `FOUNDER_PILOT_DRIVING`.

**1.9 — Encaissement dépôt via Stripe (réel)**

Le payeur (Bar Le Trèfle) règle le dépôt de 60$ via PaymentIntent Stripe. Le webhook `payment_intent.succeeded` arrive sur le proxy déployé en 1.5, qui déclenche `WebhookProcessor → SignalConsumerService → transitionEngagement(deposit_pending → deposit_secured)`. Cette transition produit aussi la SchedulerDueTask `BALANCE_DEADLINE_CHECK`.

**Vérification gate** : confirmer manuellement que les écritures D-038 Phase 1 sont créées en base (DR 5200 / DR 4190 / CR 4310 / CR 4530 / CR 4410 / CR 4420). Si elles ne sont pas créées automatiquement (cf. Fiche B BLOQUANT), créer un script `scripts/manual-d038-phase1.js` qui les insère **avec** AdminAction tracé. Acceptable en Phase 1 — à automatiser en Phase 2.

**1.10 — Encaissement solde + transition `event_sealed`**

Le payeur règle le solde de 240$. Webhook arrive. **MAIS** : Fiche C BLOQUANT — aucun consommateur ne déclenche `deposit_secured → event_sealed` à réception du solde. Deux options en Phase 1 :

*Option courte* : déclencher manuellement la transition via un script avec `actor='USR-FOUNDER-*', transitionReason='MANUAL_SEAL_PIERRE_DE_ROSETTE'`. Persister le `ContractSnapshot V2` retourné par `SealingGuard`.

*Option propre Phase 1* : ajouter un case dans `SignalConsumerService` qui reconnaît "solde reçu" et déclenche `deposit_secured → event_sealed`. Effort : 2 heures. Préférable.

**1.11 — Jour de l'event : check-in manuel + SessionPresence**

DJ Alex arrive au Bar Le Trèfle. Le founder (ou un délégué) insère **manuellement** un `SessionPresence` avec :
- `engagementId, talentUserId, checkedInAt: <timestamp arrivée>, checkOutAt: <timestamp départ>, gpsCoordinates: <lat,lng>, finalDurationMinutes: <durée réelle>`.

**Important** : utiliser `checkedInAt` (avec 'e', le nom attendu par PresenceProofGuard) en attendant la correction Phase 2. Inserer aussi un champ `gpsDistanceMeters: 0` (talent sur place) pour passer C-04, ou `signalTypes: ['MANUAL']` documenté.

Créer l'`AdminAction` type `MANUAL_PRESENCE_PILOT` + `DataAccessLedgerEntry` justifiant l'override.

**1.12 — Transition `event_sealed → performed → event_completed`**

Toutes manuelles, avec SoloFounderOverride tracé. Persister chaque DataAccessLedgerEntry. À `event_completed`, le scheduler armé en 1.6 doit créer automatiquement la SchedulerDueTask `SOTS_WINDOW_EXPIRATION`. Vérifier qu'elle apparaît bien en base.

**1.13 — Fenêtre SOTS (24h) — soumission manuelle**

L'organisateur (Le Trèfle) doit pouvoir noter DJ Alex. UI absente en Phase 1. Solution Phase 1 : script `scripts/manual-sots-submit.js` qui appelle `SOTSSubmissionService.submit({engagementId, submittedBy: organizerUserId, scores: {...}, repositories})`. Tracer en AdminAction.

**1.14 — Expiration fenêtre SOTS — déclenchement cron**

Configurer le rail externe (Railway scheduled job, Render cron, ou cron-job.org) qui exécute `npm run cron` toutes les 5 minutes. À l'expiration des 24h, le cron tire `SOTS_WINDOW_EXPIRATION` et déclenche `event_completed → sots_window_closed`.

**Point critique Phase 1** : Fiche E BLOQUANT — le scheduler transmet `sotsConsolidated: true` sans avoir appelé `consolidate()`. En Phase 1, accepter cette dette : insérer manuellement le `SOTSScoreSnapshot` avant que le scheduler ne tire l'expiration, OU patcher `SchedulerService.executeTask()` case `SOTS_WINDOW_EXPIRATION` pour appeler `consolidate()` avant la transition (effort : 30 minutes — recommandé).

**1.15 — Fenêtre de contestation (24h) → `payable`**

Le scheduler tire `CONTESTATION_WINDOW_EXPIRATION` et déclenche `contestation_window → payable`. Vérifier que `PresenceProofGuard` accepte la transition (C-01 OK car `transitionReason='CONTESTATION_WINDOW_EXPIRED'`, C-03 OK si SessionPresence a bien `checkedInAt`, C-04 OK avec `gpsDistanceMeters: 0` injecté, etc.).

Si un guard échoue : intervenir manuellement avec SoloFounderOverride + AdminIncidentRecord type `SOLO_FOUNDER_OVERRIDE` + DataAccessLedgerEntry marqueur `FOUNDER_SOLO_OVERRIDE` (D-106 strict).

**1.16 — Créer la SettlementInstruction (manuelle en Phase 1)**

Fiche B BLOQUANT majeur (apporté par Évaluateur B). Aucun service ne crée la SettlementInstruction. Avant le payout, le founder insère manuellement :

```js
repositories.settlementInstructions.create({
  systemId: IDFactory.generate('SettlementInstruction'),  // préfixe à ajouter en IDFactory
  engagementId,
  talentUserId: 'USR-DJALE-*',
  talentNetCents: 26400,  // 264.00$
  currency: 'cad',
  consumed: false,
  createdAt: new Date().toISOString(),
  // Lien vers DecisionRecord obligatoire (D-107 #18)
  decisionRecordId: <id_de_l_AdminAction_de_payout>
});
```

Préfixe `SettlementInstruction` à ajouter dans `IDFactory.PREFIXES` (par exemple `'STI'`) avant de pouvoir générer le systemId. Tracer en AdminAction + DataAccessLedger.

**1.17 — Exécution du payout (cron ou manuel)**

Le scheduler tire `payable → settled` (transition à câbler — pas dans les 3 cases actuels du SchedulerService, ajouter un `taskType: 'PAYOUT_EXECUTION'` ou déclencher manuellement). PayoutExecutor exécute les 6 verrous D-101, crée le Transfer Stripe, persiste le `PayoutExecutionRecord`, écrit le ledger.

**Vérification gate** : `LedgerInvariantGuard` doit passer. Si écritures D-038 Phase 1 absentes (Fiche B), l'invariant ne pourra pas se vérifier proprement. Compenser par les écritures manuelles de l'étape 1.9.

**1.18 — Transition `settled → archived` avec GoNoGoDecisionRecord**

Créer un `GoNoGoDecisionRecord` avec `decision: 'GO'`, signé par le founder, attaché à l'Engagement. Déclencher `settled → archived` (W3, irréversible).

**1.19 — Validation Pierre de Rosette**

Audit final manuel :
- DJ Alex a-t-il effectivement reçu les fonds (vérifier dans son compte bancaire) ?
- Le ledger Engagement totalise-t-il bien zéro cent (LOI LEDGER-02) ?
- Les deux ContractSnapshots V1 et V2 sont-ils persistés ?
- L'archive globale est-elle créée ?
- Tous les `AdminAction + DataAccessLedger + AdminIncidentRecord` documentent-ils les interventions humaines ?

Si oui : **CONTROLLED SUCCESS atteint (D-144 niveau intermédiaire)**.

La phrase finale reste réservée — elle est pour FULL SUCCESS, pas pour CONTROLLED SUCCESS.

---

## PHASE 2 — RAFFINEMENT VERS FULL SUCCESS

**Cible** : remplacer chaque intervention humaine de Phase 1 par son automatisation câblée. Atteindre D-117 strict : *"premier event réel complété avec payout sans intervention manuelle, ledger zéro cent, visible/référençable."*

**Estimation** : 3 à 6 semaines après Phase 1.

**Doctrine de progression** : une intervention humaine documentée en Phase 1 = un ticket d'automatisation en Phase 2. Pas de raccourci. Si une intervention humaine s'est produite et qu'elle n'est pas convertie en ticket Phase 2, la dette s'enracine.

### Vague 2.A — Câblages financiers (1 à 2 semaines)

**2.1 — Implémenter les écritures D-038 Phase 1 automatiques**

Service `LedgerWritingService` ou intégration dans `SignalConsumerService` : à `deposit_pending → deposit_secured`, écrire automatiquement les 6 écritures D-038 (DR 5200 / DR 4190 / CR 4310 / CR 4530 / CR 4410 / CR 4420) en utilisant les configs `tps_ppm, tvq_ppm, stripe_ppm` seedées.

**2.2 — Implémenter le calcul TPS/TVQ + frais Stripe en amont**

Dans le calcul du `prixVenduClientCents`, lire les configs et produire le détail. Permet à l'UI Phase 3 d'afficher la facture D-025 correcte.

**2.3 — Créer le `SettlementInstructionService`**

Au moment de `event_sealed`, créer automatiquement les SettlementInstructions pour chaque talent du waterfall. Lien obligatoire avec un DecisionRecord (D-107 #18). Préfixe IDFactory `'STI'` officiellement ajouté.

**2.4 — Implémenter les écritures D-038 Phase 2 (passage 4530 → 7110, purge 4190 → 6110) à `settled → archived`**

Compléter la double phase comptable D-038.

### Vague 2.B — Câblage de présence (1 semaine)

**2.5 — Aligner le nommage `checkInAt` / `checkedInAt`**

Une seule convention. Recommandation : renommer le service pour matcher le guard (le guard est plus fixe doctrinalement). Mettre à jour les tests P0 SESSION-PRESENCE-01 en conséquence.

**2.6 — Implémenter le calcul `gpsDistanceMeters`**

Service `GpsDistanceCalculator` avec formule Haversine. Lit les coordonnées du talent (depuis SessionPresence) et les coordonnées du lieu (depuis CheckpointRepository — à créer en parallèle, Vague 2.D).

**2.7 — Câbler le bouton "Je suis arrivé" et "C'est terminé"**

Endpoint API V3 ou fonction Base44 qui appelle `SessionPresenceService.create()` puis `recordCheckout()`. Inclut récupération automatique des coordonnées GPS côté client (HTML5 Geolocation API).

### Vague 2.C — Câblage scheduler complet (1 à 2 semaines)

**2.8 — Patcher `SchedulerService.case 'SOTS_WINDOW_EXPIRATION'`**

Appeler `SOTSSubmissionService.consolidate()` avant la transition. Effort : 30 minutes mais à faire propre (test P0 dédié).

**2.9 — Câbler `seal_event` comme consommateur de webhook**

À réception du webhook solde Stripe (`payment_intent.succeeded` sur le PI du solde), `SignalConsumerService` doit déclencher `deposit_secured → event_sealed`. Effort : 4 heures.

**2.10 — Ajouter `taskType: 'PAYOUT_EXECUTION'` au scheduler**

Pour automatiser `payable → settled` sans intervention manuelle. Effort : 1 jour.

**2.11 — Implémenter `HEARTBEAT_MISSING` + `DUE_TASK_OVERDUE` (D-099)**

Surveillance opérationnelle. Création automatique de `SchedulerIncidentRecord` typés. Effort : 2 jours.

### Vague 2.D — Câblage UX + repository (2 semaines, en parallèle de 2.A-2.C)

**2.12 — Persister automatiquement le `ContractSnapshot V1` à `placed → accepted`**

Modifier `transitionEngagement.js` pour appeler `repositories.contractSnapshots.create(missionResult.contractSnapshot)` au moment de la transition `placed → accepted`. Idem `ContractSnapshot V2` à `deposit_secured → event_sealed`.

**2.13 — Créer `UserRepository`, `CheckpointRepository`, `DisputeRepository`**

Conformité D-128. Le `CheckpointRepository` est dépendance forte du calcul GPS (2.6).

**2.14 — Adapter les pages V1 microrave.ca aux exigences UX V3**

Page Talent : ventilation D-024 obligatoire avant acceptation, état Engagement format D-084 5 éléments. Page Payeur : facture D-025 (5 lignes canoniques), vocabulaire "fonds protégés" D-085. Notification négative format D-087 (non accusatoire). Strings externalisées en i18n D-088.

Effort : 2 à 3 semaines selon l'état réel des pages V1 (hors archive V3, non-évaluable depuis l'audit). À budgéter sérieusement.

**2.15 — Câbler `SOLO_FOUNDER_OVERRIDE` à la triple traçabilité D-106**

`AdminIncidentRecord type SOLO_FOUNDER_OVERRIDE` + `DataAccessLedgerEntry marqueur FOUNDER_SOLO_OVERRIDE` + `reasonCode` obligatoire. Pas une chaîne magique. Effort : 1 jour.

**2.16 — Câbler la création automatique des `PolicyConfigChangeRecord`**

Toute modification PolicyConfig produit automatiquement le triplet `AdminAction + DataAccessLedgerEntry + PolicyConfigChangeRecord`. Effort : 1 jour.

### Vague 2.E — Préparation Event 0B (D-132) — facultative pour FULL SUCCESS Event 0A

Si l'arbitrage est *"FULL SUCCESS sur Event 0A en mode Stripe test suffit"*, cette vague est reportable.

Si l'arbitrage est *"FULL SUCCESS doit être validé sur Event 0B (Stripe live 5-10$)"*, alors D-132 s'active :

- Variabilisation URL Base44 (env vars)
- Scripts export / backup / restauration hors Base44
- Vérification intégrité référentielle Event ↔ Lineup ↔ Engagement ↔ Ledger
- Schema registry machine-lisible
- Table `IdMapping` explicite
- `MigrationTriggerPolicyConfig` 3 niveaux seedée et active

Effort : 1 à 2 semaines.

### Vague 2.F — Exécution Pierre de Rosette mode FULL SUCCESS

Refaire un event Pierre de Rosette dans les mêmes conditions que Phase 1, **sans aucune intervention humaine** entre `proposed` et `archived`. Toutes les transitions doivent se déclencher automatiquement (webhooks Stripe + cron + UI utilisateur). Zéro `AdminAction type MANUAL_*` ou `FOUNDER_PILOT_DRIVING`.

Si tous les contrôles passent : créer le `GoNoGoDecisionRecord` final pour FULL SUCCESS.

À ce moment, et seulement à ce moment, la phrase finale réservée devient prononçable.

---

## CRITÈRES DE GATE ENTRE PHASES

**Gate Phase 1 → confirmation CONTROLLED SUCCESS** :
- DJ Alex a reçu les fonds dans son compte bancaire (preuve Stripe).
- Le ledger Engagement totalise zéro cent.
- Les deux ContractSnapshots sont persistés (CS1-* et CS2-* récupérables par `findByEngagementIdAndPhase`).
- Chaque intervention humaine a une trace `AdminAction + DataAccessLedger` correspondante.
- L'archive globale est créée (status `archived`).
- Un `GoNoGoDecisionRecord = GO` Phase 1 est signé par le founder.

**Gate Phase 2 → FULL SUCCESS** :
- Tous les critères Phase 1 +
- Aucun `AdminAction type MANUAL_*` dans la chaîne nominale.
- Toutes les transitions WORM (Moments 1, 2, 3, 4, 5, 6) déclenchées automatiquement par webhooks Stripe ou scheduler cron.
- `BugReplayRecord` inventoriés : zéro non-PASSED.
- `POLICYCONFIG-FAILCLOSED-01` PASSED en production (pas en sandbox).
- Un nouveau `GoNoGoDecisionRecord = GO` Phase 2 signé.

À ce moment, et seulement à ce moment :

> **« 100% complété — nous avons atteint notre objectif. »**

---

## INSTRUMENTATION PERMANENTE

Pendant tout le processus, tenir à jour un journal :

- Chaque intervention humaine en Phase 1 = une entrée du journal nommant la cause, la résolution, et le ticket Phase 2 qui l'automatise.
- Chaque automatisation Phase 2 = la clôture de l'entrée correspondante.
- Si à un moment une intervention humaine est nécessaire mais qu'aucun ticket Phase 2 n'existe : créer le ticket avant d'intervenir.

C'est la traduction opérationnelle de la doctrine LOI GREFFIER-01 : ce qui n'est pas tracé n'a pas eu lieu, mais surtout, ce qui n'est pas converti en automatisation est une dette qui s'enracine.

---

## NOTE FINALE

L'arbitrage retenu — **CONTROLLED SUCCESS d'abord, puis FULL SUCCESS** — est aligné avec la doctrine D-144 (paliers). C'est le chemin que prennent les institutions qui veulent rester honnêtes. La promesse au talent (*"Ton net est garanti si tu es présent"*) sera tenable juridiquement et opérationnellement dès Phase 1, parce que le founder s'engage personnellement à la chaîne quand l'automatisation manque. Elle deviendra tenable institutionnellement en Phase 2, quand la chaîne tient seule.

La séquence à retenir tient en une ligne :

**Jour 1** : corrections triviales + seed + KYC lancé.
**Jours 2-3** : webhook + cron câblés.
**Jours 4-7** : Pierre de Rosette en mode interventions documentées → CONTROLLED SUCCESS.
**Semaines 2-7** : conversion des interventions en automatisations, ticket par ticket.
**Semaine 8** : Pierre de Rosette en mode automatique → FULL SUCCESS → phrase finale prononçable.

Le prompt reste actif jusqu'à cette dernière étape.