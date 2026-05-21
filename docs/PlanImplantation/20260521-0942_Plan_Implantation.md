# Plan d'implantation — Micro Rave V3
## De 16/16 tests verts à FULL SUCCESS D-144

**Date :** 21 mai 2026 10:09 EST   
**Baseline :** 16/16 tests P0 verts · Base44 connectée · PolicyConfig seedée (20 configs)  
**Objectif :** FULL SUCCESS D-144 — premier event réel complété sans intervention manuelle

---

## Situation réelle au 21 mai 2026 10:06 EST

La constitution est opérationnelle. La logique de calcul est prouvée par 16 tests P0. La base est connectée et pilotable. Ce qui manque : la couche d'exécution — les services qui branchent les guards sur la réalité opérationnelle.

**Acquis :**
- `transitionEngagement()` : 43 transitions, machine d'état complète, fail-closed
- 13 guards implémentés (dont 3 guards de la chaîne de preuve post-event résolus le 21 mai)
- `PayoutExecutor` : 6 verrous D-101 opérationnels, Transfer Stripe branché
- `MoneyMath` : zéro Math.floor libre, conformité D-063/D-064
- `EngagementAmendmentGuard` : D-147 complet, 14/14 PASSED
- PolicyConfig : 20 configs seedées en base, Market Pivot opérationnel
- `WEBHOOK-RAWBODY-01` : ✓ PASSED — Base44 préserve le raw body

**Ce qui manque :** câblages, repositories, services de persistence, automatisation temporelle, UX.

---

## Phase 0 — Câblages manquants
### Ce qui bloque SC-01 aujourd'hui · Gate : Event 0B

---

### 0.1 Chaînon StripePaymentSignal → transitionEngagement()
**Priorité :** BLOQUANT SC-01  
**Source :** D-097 · `WebhookProcessor.js` · Fiche C INFÉRENCE 2

`WebhookProcessor` persiste le signal dans `StripePaymentSignal`. Aucun consommateur ne déclenche `deposit_pending → deposit_secured`. Le dépôt Stripe confirmé ne fait jamais avancer la machine d'état. Sans ce câblage : le premier vrai paiement reste en `deposit_pending` indéfiniment.

**À livrer :**
- `src/services/SignalConsumerService.js` — lit les `StripePaymentSignal` non traités (`processed: false`), appelle `transitionEngagement()` avec le contexte approprié, marque le signal `processed: true`
- L'appelant Base44 (fonction API ou cron) appelle `SignalConsumerService.processUnhandledSignals()` après chaque webhook reçu

---

### 0.2 no_show → refunded — mauvais câblage dans runSpecificGuard()
**Priorité :** BLOQUANT (chemin no-show)  
**Source :** `NoShowGuard.js` L.41 · `transitionEngagement.js` L.432

`TRANSITION_TABLE` route `no_show→refunded` vers `RefundGuard` (placeholder `{ passed: true }`). La logique `validateRefundTrigger()` existe dans `NoShowGuard` et est correcte — elle n'est jamais appelée. L'argent passe vers `refunded` sans calcul de remboursement, sans écriture ledger.

**À livrer :**
- Dans `runSpecificGuard()`, case `'RefundGuard'` : détecter si `transitionKey === 'no_show->refunded'` et appeler `NoShowGuard.validate()` à la place
- Ou modifier `TRANSITION_TABLE` pour router `no_show→refunded` directement vers `NoShowGuard`

---

### 0.3 EventPaymentGuard — en-tête V10.1 + SchedulerDueTask balance_deadline_check absente
**Priorité :** BLOQUANT (LOI ANNULATION-02)  
**Source :** D-014-A · OS V15 §2.7 tableau ligne `deposit_pending→deposit_secured`

`validateDepositConfirmation()` passe correctement. Elle ne crée pas la `SchedulerDueTask balance_deadline_check`. L'OS V15 dit explicitement : *"[D-014-A] SchedulerDueTask `balance_deadline_check` créée · surveillance solde activée · notifications progressives armées."* Sans cette tâche, LOI ANNULATION-02 (annulation automatique J-6 si solde impayé) ne s'arme jamais.

**À livrer :**
- Mettre à jour l'en-tête : `Source : OS V10.1` → `Source : OS V14+ · D-014-A`
- Retirer la référence à `BalanceRequestGuard` (supprimé depuis D-014-A V12)
- Dans `validateDepositConfirmation()`, construire et retourner un objet `schedulerTask` avec `taskType: 'BALANCE_DEADLINE_CHECK'`, `dueAt: now + balanceDeadlineDays * 86400000` (config DB), `engagementId`
- L'appelant persiste cette tâche via `SchedulerRepository`

---

### 0.4 9 repositories manquants (D-128)
**Priorité :** BLOQUANT — débloque tout le reste  
**Source :** D-128 · `src/repositories/` (un seul fichier : `PolicyConfigRepository.js`)

Seul `PolicyConfigRepository` existe. Tous les guards calculent correctement mais leur output est éphémère — rien n'est persisté en dehors de PolicyConfig.

**Repositories à créer (`src/repositories/`) :**

| Repository | Entités couvertes | Méthodes minimales |
|---|---|---|
| `EngagementRepository` | Engagement, Event, Lineup, MissionSlot | findById, findByEventId, updateStatus, create |
| `LedgerRepository` | LedgerRecord, RoundingReconciliationRecord | append (append-only), findByEngagementId |
| `PaymentRepository` | StripePaymentSignal, PayoutExecutionRecord, SettlementInstruction, WebhookProcessedLog, EventPaymentRequest | create, findByEngagementId, findByEventId, markConsumed, markCompleted |
| `SchedulerRepository` | SchedulerDueTask, SchedulerRun | create, findDueTasks, markProcessing, markDone, markFailed, markCancelled |
| `SessionPresenceRepository` | SessionPresence | create, findByEngagementId, updateCheckout |
| `SOTSRepository` | SOTSSubmission, SOTSScoreSnapshot | create, findByEngagementId, markConsolidated |
| `ReputationRepository` | ReputationLedger (append-only), ReputationLedgerEntry | append, findByUserId, findByEngagementId |
| `AdminRepository` | DataAccessLedgerEntry, AdminAction, AdminIncidentRecord, PolicyConfigChangeRecord | append (append-only), create, findByActorId |
| `ContractSnapshotRepository` | ContractSnapshot phase 1 + 2 | create, findByEngagementId, findByPhase |

**Pattern d'implémentation :** Chaque repository = adapter Base44 HTTP, même pattern que `PolicyConfigAdapter.js`. Interface portable — si Micro Rave migre hors Base44, seul l'adapter change.

---

### 0.5 DataAccessLedger absent — Guard 5 écrit en console uniquement
**Priorité :** BLOQUANT Event 0B (DATAACCESS-WRITE-01 requis)  
**Source :** D-095 · D-107 · `transitionEngagement.js` L.359

```javascript
// État actuel — Guard 5
console.log('[AuditLogger]', JSON.stringify(auditEntry));
```

LOI TRANSITION-01 : *"Toute mutation du champ status déclenche un DataAccessLedger entry."* Sans implémentation : les contournements depuis l'UI Base44 sont indétectables. LOI GREFFIER-01 non vérifiable.

**À livrer :**
- Dans Guard 5 de `transitionEngagement()` : appeler `repositories.admin.appendToDataAccessLedger(auditEntry)` (via `AdminRepository`)
- Test P0 `DATAACCESS-WRITE-01` : vérifie qu'une entrée DataAccessLedger est créée sur chaque transition
- Test P0 `DATAACCESS-FAIL-01` : vérifie que l'échec d'écriture DAL produit un `AdminIncidentRecord`

---

## Phase 1 — Infrastructure persistence
### CONTROLLED SUCCESS — Event 0 pilote avec fondateur · Gate : D-144 CONTROLLED

> D-144 définit CONTROLLED SUCCESS comme : *"Complété avec intervention humaine documentée → GO avec réserves si aucun P0 FAILED."* Pour Event 0 pilote, chaque transition temporelle manuelle doit être documentée dans un `AdminIncidentRecord` type `SOLO_FOUNDER_OVERRIDE`.

---

### 1.1 SessionPresenceService — création + lecture check-in
**Source :** D-093 · Fiche D BLOQUANT-D2

`PresenceWindowGuard` vérifie l'existence d'un `sessionPresenceId`. Aucun service ne crée la `SessionPresence` en base. Le talent n'a nulle part dans le code pour déclencher son check-in.

**À livrer :**
- `src/services/SessionPresenceService.js`
  - `create({ engagementId, talentUserId, gpsCoordinates, signalTypes })` → crée la SessionPresence, retourne l'ID `SPR-*`
  - `recordCheckout({ sessionPresenceId, checkoutAt, finalDurationMinutes })` → met à jour la durée
  - `getByEngagementId(engagementId)` → retourne la SessionPresence pour le contexte de `PresenceProofGuard`
- Page ou endpoint dans Base44 : bouton "Je suis arrivé" pour le talent → appelle `SessionPresenceService.create()`

---

### 1.2 MembershipPlan Freemium seedé + service résolution tauxPpm
**Source :** D-027 · Fiche J BLOQUANT-J1/J2

`MissionConversionGuard` reçoit `tauxPpm` via `context` (fourni par l'appelant). Aucun service ne résout ce taux depuis `MembershipPlan`. L'appelant doit "savoir" que Freemium = 120000 ppm — ce qui est une valeur hardcodée implicite, violant D-027.

**À livrer :**
- Seeder la table `MembershipPlan` dans Base44 avec : Freemium (12% = 120000 ppm), Base (9% = 90000 ppm), Pro (6% = 60000 ppm), Studio (3.5% = 35000 ppm), Fondateur (5% = 50000 ppm)
- `src/services/MembershipPlanService.js`
  - `getTauxPpmForUser(userId)` → lit `UserMembership` en base, résout vers `MembershipPlan.commissionRate`, retourne taux en ppm
  - Fail-closed si aucun plan actif : lever `FINANCIAL_CONFIG_MISSING`

---

### 1.3 KYC DJ Alex = VERIFIED
**Source :** D-097 règle 5 · `PayoutExecutor` Verrou 4

`PayoutExecutor.Verrou4` exige `KYCStatus = VERIFIED`. Si `PENDING` : Transfer Stripe refusé, `settled` impossible.

**À faire :**
```bash
node scripts/run-j9-pilot.js --step=kyc
```
Ou vérifier directement dans Base44 → TalentPaymentProfile → champ `kycStatus`. Si `PENDING` : compléter l'onboarding Stripe Connect Express de DJ Alex (Stripe Dashboard → Connected accounts).

---

### 1.4 SchedulerDueTask persistence + dispatcher manuel MVP
**Source :** D-099 · Fiche F BLOQUANT-F1/F2

Les guards retournent des objets `schedulerTask` mais `transitionEngagement()` ne les persiste pas. Même si un dispatcher existait, il n'aurait rien à lire.

**À livrer (MVP manuel) :**
- Dans `transitionEngagement()`, après Guard 5 : si `guardResult.schedulerTask`, appeler `repositories.scheduler.create(guardResult.schedulerTask)`
- Pour Event 0 pilote : le fondateur déclenche manuellement chaque transition temporelle avec `SoloFounderOverride` documenté
- Décision requise : rail cron (Base44 natif ou service externe) — conditionne Phase 2

**Transitions temporelles concernées :**

| Transition | Délai | SchedulerTask créée par |
|---|---|---|
| `event_completed → sots_window_closed` | 24h | `SOTSWindowGuard` |
| `contestation_window → payable` | 24-48h | `ContestationWindowGuard` |
| `deposit_pending → annulation J-6` | J-6 avant event | `EventPaymentGuard` (Phase 0.3) |

---

### 1.5 Tests P0 requis Event 0A — 15 tests manquants
**Source :** D-107 · TEST_REGISTRY Catégorie 5 · tous `requiredBeforeEvent=0A`

Tests à créer dans `tests/p0/` :

| testCode | Ce qu'il vérifie | Décision |
|---|---|---|
| ADMIN-ABS-DAL-01 | DataAccessLedgerEntry immuable | D-107 |
| ADMIN-ABS-BUGREPLAY | BugReplayRecord immuable | D-107 |
| ADMIN-ABS-SYSTEMID | systemId d'un objet existant immuable | D-107 |
| ADMIN-ABS-SCHEDULERRUN | SchedulerRun complété immuable | D-107 |
| ADMIN-ABS-INCIDENT | AdminIncidentRecord immuable | D-107 |
| POLICY-DIRECT-01 | Modification directe DB prod rejetée | D-108 |
| POLICY-CHANGE-01 | PolicyConfigChangeRecord obligatoire | D-108 |
| POLICY-CRITICAL-01 | Config critique = double validation | D-108 |
| ADMIN-SOLO-02 | SoloFounderOverride → AdminIncidentRecord créé | D-106 |
| ADMIN-SOLO-03 | SoloFounderOverride ≠ DualApproval — délai + confirmation | D-106 |
| ADMIN-CELL-SECRET-01 | CELL_MANAGER ne voit pas events SECRET par défaut | D-018, D-105 |
| ADMIN-AUDITOR-01 | AUDITOR_EXTERNAL limité par DataAccessAuditRoleConfig | D-105 |
| ADMIN-DEV-FINANCE-01 | DEV_ADMIN — accès données financières réelles prod interdit | D-105 |
| ADMIN-SUPPORT-PAYOUT-01 | SUPPORT_ADMIN ne peut pas approuver payout | D-105 |
| ADMIN-EXPORT-01 | Export massif interdit à SUPPORT_ADMIN | D-111 |

---

## Phase 2 — Couche SOTS + automatisation
### FULL SUCCESS — Event 1 sans intervention manuelle · Gate : D-144 FULL

> D-144 Seuil 2 : *"Au moins un event réel complété avec payout sans intervention manuelle, ledger zéro cent, GoNoGoDecisionRecord = GO."*

---

### 2.1 SOTSSubmissionService + ReputationLedger append-only
**Source :** D-077 · D-082 · Fiche E BLOQUANT-E1

`SOTSWindowGuard` exige `sotsConsolidated: true`. Aucun service ne crée ni ne consolide les `SOTSSubmission`. La chaîne `event_completed → sots_window_closed → contestation_window → payable` est architecturalement gardée mais fonctionnellement bloquée sans ce service.

**À livrer :**
- `src/services/SOTSSubmissionService.js`
  - `submit({ engagementId, submittedBy, role, scoreCategories, reasonCodes })` → crée `SOTSSubmission`, ajoute `ReputationLedgerEntry` immuable
  - `consolidate(engagementId)` → agrège les soumissions, calcule scores EMA, crée `SOTSScoreSnapshot`, marque `sotsConsolidated: true`
  - `isConsolidated(engagementId)` → retourne boolean pour le contexte de `SOTSWindowGuard`
- Vérification D-094 pattern 6 : `SOTS_SELF_BENEFICIAL` — blocage absolu de l'auto-note directe ou indirecte
- Test P0 `SOTS-SELF-01` (annoncé dans OS V14 section D-147, non créé)

---

### 2.2 Dispatcher cron — transitions temporelles automatiques
**Source :** D-099 · Fiche F BLOQUANT-F1

**Décision requise avant implémentation :** Base44 cron natif ou service externe ?

- Base44 cron : plus simple, dépendance plateforme, limitée à ce que Base44 expose
- Service externe (ex: node-cron sur VPS, Railway, Render) : portable, plus flexible, coût infra

**À livrer (quel que soit le rail) :**
- `src/services/SchedulerService.js`
  - `runDueTasks({ repositories })` → lit `SchedulerDueTasks` où `status: 'pending'` et `dueAt ≤ now`, exécute `transitionEngagement()`, marque `done` ou `failed` avec `AdminIncidentRecord` si échec
  - Idempotency via `lockedByRunId` (D-099)
  - Rate limit : configurable, jamais hardcodé
- Test P0 Catégorie 6 (Scheduler) : 4 tests à créer — `SCHEDULER-TASK-01`, `SCHEDULER-EXPIRE-01`, `SCHEDULER-IDEMPOTENCY-01`, `SCHEDULER-FAIL-01`

---

### 2.3 Guards de litige — 6 placeholders restants
**Source :** Fiche A DÉGRADANT · D-074

**Ordre d'implémentation recommandé (par risque opérationnel) :**

1. `CancellationGuard` — annulation pré-dépôt et post-dépôt (J-7 / J-30). Waterfall d'annulation LOI ANNULATION-01/02.
2. `DisputeGuard` — Frein d'Urgence : standing validé + EvidenceBundle soumis + fenêtre active. Sans standing : n'importe qui peut ouvrir un litige depuis n'importe quel état.
3. `DisputeResolutionGuard` — DecisionRecord + SettlementInstruction émise + acteur admin autorisé.
4. `TransferGuard` — transfert de talent : Talent B accepte/refuse, ContractSnapshot substitution documentée.
5. `WithdrawalGuard` — retrait avant accord.
6. Compléter le câblage `RefundGuard` → `NoShowGuard` (Phase 0.2 si non fait).

---

### 2.4 Test P1 d'intégration réelle — Market Pivot prouvé automatiquement
**Source :** Discussion 21 mai 2026 10:06 EST

Créer `tests/p1/POLICYCONFIG-INTEGRATION-01.js` :
- Appelle `getConfig('maxDistancePolicy')` via le vrai `PolicyConfigAdapter` (réseau réel)
- Vérifie que la valeur retournée = 500 (valeur en base)
- Ce test échoue si la connexion Base44 est coupée — proof of life du Market Pivot
- Distingué des tests P0 (mocks) : les tests P1 requièrent `BASE44_API_KEY` et une vraie connexion

---

### 2.5 Tests P0 requis Event 0B — 4 tests manquants
**Source :** D-095 · D-132 · TEST_REGISTRY Catégories 5/7 · tous `requiredBeforeEvent=0B`

| testCode | Ce qu'il vérifie | Décision |
|---|---|---|
| DATAACCESS-WRITE-01 | Toute action sensible produit DataAccessLedgerEntry | D-095 |
| DATAACCESS-FAIL-01 | Échec écriture DAL = blocage ou AdminIncidentRecord | D-133 |
| WEBHOOK-PROXY-01 | Proxy externe validé si Base44 échoue raw body (conditionnel) | D-129 |
| PORTABILITY-RESTORE-01 | Test restauration hors Base44 | D-132 |

---

## Phase 3 — UX + portabilité + ouverture publique
### Seuil 2 D-144 — Event 2 autorisé sans réserve

---

### 3.1 Pages UX talent / organisateur / payeur
**Source :** D-084 · D-085 · Fiche I · `requiredBeforeEvent=1`

Tests `UX-VENTILATION-01`, `UX-PAYOUT-STATUS-01`, `UX-FONDSPROTEGÉS-01`, `UX-01` requis avant Event 1.

- Page talent : ventilation D-024 (cachet signé → brut final → commission → net), état payout, check-in GPS
- Page organisateur : dashboard lineup, timeline event, état par talent
- Page payeur : fonds protégés D-085, facture TTC, statut remboursement si applicable
- UXTruthProjection D-084 : état affiché = état métier prouvé — connecter chaque statut visible à `transitionEngagement()`, pas à un champ libre

**Stratégie :** Adapter les pages existantes de V1 microrave.ca vers V3. Ne pas repartir de zéro.

---

### 3.2 Portability Readiness D-132 — 7 items ordonnés
**Source :** D-132 · Fiche H · `requiredBeforeEvent=0B`

| Item | Description | État |
|---|---|---|
| 1 | IDMapping Base44 id → systemId documenté | `IDMapping 'IDM'` existe dans IDFactory — service de maintenance absent |
| 2 | Schema registry versionné | Cartes drawio = registry visuelle — non versionnée en database |
| 3 | Export lisible hors Base44 | Seul PolicyConfig exporté — Engagement, ContractSnapshot, LedgerRecord absent |
| 4 | Backup planifié | Non documenté |
| 5 | Test restauration hors Base44 | `PORTABILITY-RESTORE-01` non créé |
| 6 | Intégrité référentielle Event↔Lineup↔Engagement↔Ledger | Non testé automatiquement |
| 7 | `MigrationTriggerPolicyConfig` 3 niveaux | D-130 — non implémenté |

---

### 3.3 D-068 — méthode des plus grands restes (lineup multi-talent)
**Source :** D-068 · Fiche B BLOQUANT-B1 (non-bloquant pour SC-01 mono-talent)

`SealingGuard` utilise `prorata floor` via `MoneyMath.prorataCents()`. Pour un lineup de 2 talents : résidu systématique de 1¢ non conforme à D-068 qui exige la méthode des plus grands restes pour garantir `sum(gross_final_i) = prix_vendu_client_cents`.

Non-bloquant pour SC-01 (DJ Alex seul). À implémenter avant tout event multi-talent.

---

### 3.4 Corrections documentaires résiduelles
**Source :** Audit constitutionnel 21 mai 2026 10:06 EST

- Carte 08 `microrave_v4_08_lois_invariantes.drawio` : retirer `BALANCE_PENDING` de la liste WORM Niveau 1, ajouter note *"Retiré — D-014-A V12. Absorbé dans DEPOSIT_SECURED."*
- `EventPaymentGuard.js` header : `Source : OS V10.1` → `Source : OS V14 · D-014-A`
- Retirer la référence à `BalanceRequestGuard` dans le header (supprimé depuis D-014-A V12)

---

## Tableau de bord synthétique

| Phase | Deliverables clés | Gate | Statut D-144 |
|---|---|---|---|
| **Phase 0** | SignalConsumerService · no_show câblage · SchedulerDueTask dans EventPaymentGuard · 9 repositories · DataAccessLedger | Event 0B | Débloque SC-01 |
| **Phase 1** | SessionPresenceService · MembershipPlanService · KYC DJ Alex · SchedulerDueTask persistence · 15 tests P0 admin | Event 0A | CONTROLLED SUCCESS |
| **Phase 2** | SOTSSubmissionService · ReputationLedger · Dispatcher cron · 6 guards litige · 4 tests P0 0B | Event 0B → 1 | FULL SUCCESS |
| **Phase 3** | Pages UX · Portability D-132 · D-068 multi-talent · Corrections documentaires | Event 1 → 2 | Seuil 2 D-144 |

---

## Règle de priorisation

**1. Toujours câbler avant de construire.** La logique des guards est correcte. Les connexions manquent. Chaque service de Phase 0 est du câblage, pas de la nouvelle architecture.

**2. Event 0 pilote avant Event 1 public.** Un CONTROLLED SUCCESS documenté avec DJ Alex au Bar Le Trèfle vaut plus que 6 semaines de développement sans validation terrain.

**3. La décision cron est structurante.** Choisir le rail (Base44 natif vs service externe) avant d'implémenter `SchedulerService`. Cette décision conditionne la portabilité et le coût opérationnel de toute la Phase 2.

**4. Les tests P0 admin (Phase 1.5) peuvent avancer en parallèle** des repositories. Ils testent des invariants de logique pure (immuabilité des records) — pas tous des connexions réseau.

---

*Document produit le 21 mai 2026 10:06 EST · Sourcé sur OS V15, EXPORT_BRUT Registres Souverains V3, Fiches d'évaluation A–J du 20 mai 2026 10:06 EST, audits constitutionnels du 19 et 21 mai 2026 10:06 EST.*
