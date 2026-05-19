# MICRO RAVE V3 — FOUNDER-VALIDATED OPERATING SYSTEM

### Document de référence souverain — validé par Frédérik Gélin, Fondateur

---

**Ce document contient uniquement ce qui a été explicitement validé par le fondateur.** Toute décision non présente ici est une hypothèse, pas une loi. Version : MVP V3 — 19 mai 2026, 18:07 EST — V13 : D-019-A (machine d'état V4 complète) · D-019-B (séparation Frein d'Urgence / Contestation de Prestation) · `contestation_window` nouvel état · D-045 abrogé · SC-NO-SHOW-PRE · SC-DEPOSIT-FAIL · SC-08-PARTIEL

---

## TABLE DES MATIÈRES

1. Identité et vision
2. Ontologie du produit
3. Modèle financier
4. Ledger et comptabilité
5. SOTS et réputation
6. DecisionKernel et arbitrage
7. Sécurité et vie privée
8. Scheduler et opérations
9. Admin Authority Matrix
10. UX et vérité perçue
11. Technologie et infrastructure
12. Liquidité commerciale
13. MVP Scope Lock
14. Premier événement réel
15. Tests et qualité
16. Annexes — Lois canoniques et phrases fondatrices

---

# PARTIE I — IDENTITÉ ET VISION

## 1.1 Ce que Micro Rave est

Micro Rave est une **institution de règlement** et un **courtier / agent marketplace**.

Elle ne vend pas la prestation artistique. Elle facilite, contractualise, sécurise, prouve, règle, facture ses propres services et orchestre les flux entre talent, organisateur/payeur et checkpoint.

**Phrase souveraine — Loi Zéro :**

*Une capacité culturelle locale devient un engagement de prestation vérifiable, puis un règlement économique, puis une mémoire territoriale.*

Cette phrase est le critère d'inclusion et d'exclusion de toute feature. Si une feature ne contribue pas à cette chaîne, elle est hors scope.

**Triptyque fondamental :**

talent  ↔  organisateur/payeur  ↔  lieu (EventLocation ou Checkpoint)

Le lieu est l'endroit où la valeur devient réelle. Sans terrain de jeu, le talent et l'organisateur n'ont nulle part où se rencontrer. Micro Rave orchestre les trois côtés — pas deux.

Un lieu peut être un Checkpoint reconnu dans l'écosystème (bar, salle culturelle, studio) ou une simple EventLocation ponctuelle (rang privé, gymnase scolaire, résidence). Dans les deux cas, le lieu porte une mémoire culturelle attachée à ses coordonnées géographiques exactes.

## 1.2 Ce que Micro Rave refuse de devenir

- Un système où les relations personnelles dictent les relations professionnelles
- Un marché opaque où les mandats circulent par proximité sociale
- Un simple annuaire de prestataires
- Une marketplace molle sans garantie de suite
- Une boîte noire financière
- Une plateforme sans preuve, sans arbitrage et sans mémoire
- Un système qui exploite la scène culturelle au lieu de l'institutionnaliser

## 1.3 Le nom — Le Micro-Onde

Comme un micro-ondes excite les particules par ondes, Micro Rave excite un réseau d'humains par signaux. La marketplace crée les bonnes collisions. Le numérique chauffe le réseau jusqu'à faire émerger l'événement.

**Les trois phases invariantes :**

| Phase | Rôle du numérique | UX désirée |
| :---- | :---- | :---- |
| Avant | Connecter les bonnes personnes | "Je comprends où je vais, avec qui, pourquoi." |
| Pendant | Se retirer — vestiaire Le Micro-Onde | "Je suis ici. Je n'ai plus besoin d'être ailleurs." |
| Après | Mémoriser, noter, payer, archiver | "Je peux garder une trace sans avoir sacrifié le moment." |

*Avant, le téléphone ouvre la porte. Pendant, il reste au vestiaire. Après, il raconte ce qui a été vécu.*

## 1.4 Les promesses fondamentales

**Au talent :** Ce que tu acceptes est transparent. Tu vois exactement ce que tu recevras avant d'accepter — et Micro Rave garantit ce règlement si tu livres ta présence.

**À l'organisateur :** Le bon talent, au bon prix, au bon moment, avec le bon client — dans un cadre professionnel où la preuve remplace l'improvisation et où la relation personnelle ne dicte plus seule la relation professionnelle.

**Au vendeur :** Micro Rave te permet de transformer ton réseau en portefeuille. Tu touches une première commission quand tu actives un client, puis un résiduel encadré lorsque ce client rachète.

**Au checkpoint :** Micro Rave te donne la marque, la plateforme, les règles, les outils et la structure pour te développer dans un territoire dédié. Un lieu devient ce qu'il accueille.

## 1.5 Pivot de Marché

L'architecture entière est conçue pour un Pivot de Marché. Remplacer "musique, humour, vidéo" par "plomberie, électricien, déneigeur" = modifier quelques lignes de database, zéro refonte de code.

L'invariant universel : trouver le bon talent pour le bon gig, au bon prix, au bon moment. Le domaine culturel est le premier terrain — pas le seul possible.

---

# PARTIE II — ONTOLOGIE DU PRODUIT

## 2.1 Hiérarchie des entités

*(inchangée — voir V11)*

## 2.2 L'Engagement — atome central

*(inchangé — voir V11)*

## 2.3 Le Lobby — objet unique à stades multiples

*(inchangé — voir V11)*

## 2.4 QuickPlay — deux origines, un seul pipeline

*(inchangé — voir V11)*

## 2.5 Le Capitaine QuickPlay

*(inchangé — voir V11)*

## 2.5.1 Préférences tarifaires

*(inchangé — voir V11)*

## 2.5.2 Séquence QuickPlay

*(inchangée — voir V11)*

## 2.6 La machine d'état de l'Engagement

**[D-019-A] — Chemin nominal V4 :**

```
proposed → negotiating → accepted → placed → deposit_pending
→ deposit_secured → event_sealed → performed
→ event_completed → sots_window_closed → contestation_window
→ payable → settled → archived
```

**États alternatifs :**

```
disputed / contestation_window / no_show / partially_settled /
cancelled_pre_deposit / cancelled_J30 / cancelled_J7 /
transfer_requested / transfer_accepted / transfer_refused /
no_show_pre_event / refunded / deposit_failed / withdrawn
```

**Note sur l'état d'entrée selon la voie :** *(inchangée — voir V11)*

**[D-014-A] deposit\_secured :** 🔒 WORM Moment 2 — webhook Stripe `payment_intent.succeeded`
reçu. Liaison contractuelle des parties verrouillée. Le talent peut bloquer sa date en confiance —
l'acompte est techniquement et juridiquement sécurisé. Dès réception de l'acompte, le système
active la surveillance du solde : SchedulerDueTask `balance_deadline_check` créée, notifications
progressives à l'organisateur déclenchées, annulation automatique prévue à J-6 si solde impayé
(LOI ANNULATION-02). L'organisateur sait qu'il a jusqu'à J-6 pour régler le solde — il l'a accepté
au moment de payer l'acompte. Ces deux réalités sont simultanées et inséparables.

*Note D-014-A : l'état `balance_pending` est supprimé de la machine d'état. La surveillance du
solde est une responsabilité de `deposit_secured`, pas un état séparé. "En attente de solde" est
identique à "acompte reçu" — un seul moment, deux conséquences simultanées.*

**[D-019-B] contestation\_window :** État explicite post-SOTS. Durée configurée dans
`DisputeAccessPolicyConfig.contestationWindowDurationHours` (recommandé MVP : 24h).
Représente la fenêtre de Contestation de Prestation — distinct du Frein d'Urgence (Q3).
Un état doit exprimer la vérité juridique absolue du système à l'instant T. Si les parties ont
un droit de contestation ouvert, le statut financier de l'argent n'est pas encore "payable".
Voir D-019-B pour la doctrine complète.

## 2.7 Les 6 moments WORM

**[D-014-A + D-014-B] — Décisions fondateur Mai 2026**

**[BLOC 2 — V8] Hiérarchie de sévérité des WORM — trois niveaux :**

Les 6 moments WORM ne se valent pas institutionnellement. Toute tentative de modification d'un
état WORM doit être traitée selon son niveau de sévérité :

- **Niveau 1 — Erreur :** ACCEPTED, DEPOSIT\_SECURED. Toucher à ces états est une erreur
  de développement — détectable, corrigeable, jamais silencieuse. Exception : SoloFounderOverride
  avec AdminIncidentRecord obligatoire.
- **Niveau 2 — Fraude :** EVENT\_SEALED. Toucher à cet état constitue une tentative de fraude
  financière. Déclenchement immédiat d'un AdminIncidentRecord P0 et SYSTEM\_HOLD sur tous les
  fonds liés.
- **Niveau 3 — Architecturalement impossible :** ARCHIVED. Aucun mécanisme dans le système
  ne permet de modifier un état archivé. Pas même le SoloFounderOverride.

| Moment | État | Ce qui devient immuable | Niveau WORM |
| :---- | :---- | :---- | :---- |
| 1 | accepted | **Voie CreateEvent :** cachet brut, tier, taux, SOTS snapshot, historique complet de négociation. **Voie QuickPlay :** TalentRolePreferenceId, roleMetier, tarifType, tarifValeurCents, durée, cachet confirmé, timestamp, styleSignature. | 🔒 Niveau 1 — Erreur |
| 2 | deposit\_secured | Liaison contractuelle des parties — acompte reçu · artiste sécurisé · surveillance du solde activée · SchedulerDueTask créée · annulation automatique J-6 armée (LOI ANNULATION-02) | 🔒 Niveau 1 — Erreur |
| 3 | event\_sealed | WORM financier complet — montants, taux, taxes, Stripe | 🔒🔒 Niveau 2 — Fraude |
| 4 | event\_completed | Ouverture fenêtre SOTS 24h | 🔒 Niveau 1 — Erreur |
| 5 | sots\_window\_closed | WORM réputationnel — scores consolidés | 🔒 Niveau 1 — Erreur |
| 6 | archived | WORM global — lecture seule | 🔒🔒🔒 Niveau 3 — Architecturalement impossible |

**Note — `contestation_window` :** État opérationnel temporaire, non-WORM. Protégé par
`DisputeAccessPolicyConfig`. Durée configurable. Expire automatiquement vers `payable`
si aucun `DisputeRecord` ouvert.

**[D-014-A] États retirés des moments WORM :**

`balance_pending` n'est pas un moment WORM distinct. La surveillance du solde est activée à
`deposit_secured` — ces deux réalités sont simultanées et inséparables. L'obligation de régler le
solde naît avec l'acompte, pas avec un acte système séparé. La SchedulerDueTask
`balance_deadline_check` est créée dans le guard `EventPaymentGuard` à la transition
`deposit_pending → deposit_secured`. D-014 reste à 6 moments officiels.

**[D-014-B] `payable` — état opérationnel de file d'attente, non-WORM :**

`payable` est un état opérationnel de file d'attente de paiement. Il signifie : fenêtre de
contestation expirée sans obstacle actif, OU litige résolu favorablement. Le virement vers le
talent est **autorisé** et sera exécuté au prochain batch selon `PayoutBatchPolicyConfig` (jamais
hardcodé). `payable` n'est **pas** un moment WORM — il est protégé par D-101 (6 verrous
anti-double payout). Il est dans la machine d'état comme état observable et de file d'attente,
pas comme irréversibilité institutionnelle. Aucun warning W1 n'est émis depuis cet état.

**[D-014-B] Conditions d'entrée dans `payable` :**

- Fenêtre de contestation expirée sans `DisputeRecord` ouvert (via `contestation_window → payable`)
- OU litige résolu favorablement (via `disputed → payable`)
- OU exception payout urgence avec SoloFounderOverride (via `performed → payable`)

*Note : `sots_window_closed → payable` est supprimé. Le chemin nominal passe désormais par
`contestation_window`. [D-019-B — 19 mai 2026, 18:07 EST]*

## 2.7.1 Guards de transition — table souveraine

**[PATCH V9 + V13] Architecture anti-corruption de la machine d'état**

**Loi fondatrice de cette section :**

*L'état ne se déclare pas. Il se prouve. Chaque transition est une preuve, pas une assignation.
Une porte sans gardien n'est pas une porte — c'est une faille.*

Toute mutation du champ `status` d'un Engagement est interdite sauf via la fonction souveraine :

```
transitionEngagement({ engagementId, targetState, actor, context })
```

Cette fonction est **l'unique point d'entrée** pour tout changement d'état. Elle exécute les
guards dans l'ordre suivant, sans exception :

1. `MissionConversionGuard` — valide la légitimité de la transition demandée et l'autorisation de l'acteur
2. `WORMGuard` — vérifie qu'aucun état immuable n'est violé selon les niveaux de sévérité (section 2.7)
3. Guard spécifique à la transition (voir table ci-dessous)
4. `FinancialInvariantGuard` — si la transition touche un flux financier (LOI LEDGER-02)
5. `AuditLogger` — toujours, sans exception, append au DataAccessLedger

**TABLE DES GUARDS PAR TRANSITION :**

| Transition | Guard spécifique | Conditions obligatoires |
| :---- | :---- | :---- |
| `proposed → negotiating` | `MissionConversionGuard` | MissionSlot existe · acteur autorisé |
| `proposed → accepted` | `MissionConversionGuard` | MissionSlot existe · prix confirmé · roleMetier défini |
| `negotiating → accepted` | `MissionConversionGuard` | Contre-offre acceptée · prix final confirmé · historique snapshoté |
| `accepted → placed` | `PlacementGuard` | ContractSnapshot phase 1 existe · signatures valides · Lineup cohérent · Event existe |
| `accepted → cancelled_pre_deposit` | `CancellationGuard` | Aucun acompte reçu · annulation sans frais · ContractSnapshot W1 marqué CANCELLED |
| `placed → deposit_pending` | `EventPaymentGuard` | EventPaymentRecord créé · Lineup verrouillé · prix calculé · LOI LINEUP-03 respectée |
| `placed → cancelled_pre_deposit` | `CancellationGuard` | Aucun acompte reçu · annulation sans frais |
| `deposit_pending → deposit_secured` | `EventPaymentGuard` | Webhook Stripe `payment_intent.succeeded` reçu · acompte confirmé · Moment WORM 2 — liaison contractuelle verrouillée · **[D-014-A]** SchedulerDueTask `balance_deadline_check` créée · surveillance solde activée · notifications progressives armées |
| `deposit_pending → deposit_failed` | `EventPaymentGuard` | **[SC-DEPOSIT-FAIL]** Webhook Stripe échec reçu · aucun fonds capturé · zéro écriture ledger · EPR.status = FAILED · SchedulerDueTasks = CANCELLED |
| `deposit_secured → event_sealed` | `SealingGuard` | Solde reçu · ContractSnapshot phase 2 créé · LOI LINEUP-01/02 vérifiées · LOI LEDGER-02 vérifiée · Moment WORM 3 — WORM financier complet |
| `deposit_secured → cancelled_J30` | `CancellationGuard` | Acompte reçu · annulation > J-30 · remboursement dépôt moins frais Stripe |
| `deposit_secured → cancelled_J7` | `CancellationGuard` | **[D-014-A]** Solde non reçu à J-6 · annulation automatique LOI ANNULATION-02 · acompte aux talents au prorata |
| `deposit_secured → transfer_requested` | `TransferGuard` | financialGuard obligatoire car acompte reçu |
| `deposit_failed → archived` | `ArchiveWORMGuard` | **[SC-DEPOSIT-FAIL]** Aucun fonds · zéro écriture ledger · ReputationLedger organisateur mis à jour |
| `cancelled_pre_deposit → archived` | `ArchiveWORMGuard` | Aucun fonds · SchedulerDueTasks annulées |
| `cancelled_J30 → archived` | `ArchiveWORMGuard` | Remboursement exécuté · ledger équilibré |
| `cancelled_J7 → archived` | `ArchiveWORMGuard` | Payout prorata talents exécuté · ledger équilibré |
| `event_sealed → performed` | `PresenceWindowGuard` | Date event passée · check-in window ouverte · SessionPresence initiée |
| `performed → event_completed` | `EventCompletionGuard` | Tous les talents en état `performed` · aucun no-show non résolu |
| `performed → payable` | `PresenceProofGuard` | **[D-019-A]** Exception SoloFounderOverride uniquement · Présence prouvée · payout conditions PASS · ledger équilibré · event non disputé · SoloFounderOverride + AdminIncidentRecord requis · voir D-106 |
| `event_completed → sots_window_closed` | `SOTSWindowGuard` | Fenêtre 24h écoulée · SOTSSubmissions consolidées |
| `sots_window_closed → contestation_window` | `ContestationWindowGuard` | **[D-019-B]** Fenêtre SOTS close · ouverture fenêtre de Contestation de Prestation · durée configurée dans `DisputeAccessPolicyConfig.contestationWindowDurationHours` (recommandé MVP : 24h) |
| `sots_window_closed → no_show` | `NoShowGuard` | Absence confirmée après fenêtre SOTS · LOI NO-SHOW-01 applicable · DecisionRecord NO\_SHOW\_CONFIRMED requis |
| `contestation_window → payable` | `PresenceProofGuard` | **[D-019-B]** Fenêtre de contestation expirée sans DisputeRecord ouvert · 11 conditions D-075 vérifiées · payout autorisé · exécution au prochain batch `PayoutBatchPolicyConfig` |
| `contestation_window → disputed` | `DisputeGuard` | **[D-019-B] Contestation de Prestation** — standing validé · EvidenceBundle soumis · fenêtre active · cas : prestation dégradée, retard, qualité insuffisante, désaccord SOTS |
| `payable → settled` | `LedgerInvariantGuard` | LOI LEDGER-02 respectée · zéro cent · Stripe payout confirmé · KYCStatus = VERIFIED |
| `settled → archived` | `ArchiveWORMGuard` | SOTS window closed · tous LedgerRecords finaux · GoNoGoDecisionRecord = GO |
| `transfer_requested → transfer_accepted` | `TransferGuard` | Talent B accepte |
| `transfer_requested → transfer_refused` | `TransferGuard` | Talent B refuse |
| `transfer_requested → no_show_pre_event` | `TransferGuard` | Aucun remplaçant disponible dans délai · financialGuard obligatoire |
| `transfer_accepted → placed` | `TransferGuard` | Talent B confirmé · retour Lineup · ContractSnapshot substitution documentée |
| `transfer_refused → placed` | `TransferGuard` | Retour à Talent A · Lineup inchangé |
| `no_show_pre_event → archived` | `ArchiveWORMGuard` | **[SC-NO-SHOW-PRE]** Reversal complet depuis deposit\_secured · remboursement organisateur (dépôt brut − frais Stripe) · Talent A = 0$ · MR = 0$ commission · DecisionRecord NO\_SHOW\_CONFIRMED requis · compte analytique 6590 |
| `no_show → refunded` | `NoShowGuard` | LOI NO-SHOW-01 · talent 0$ · remboursement cachet net au payeur · MR conserve commission |
| `refunded → archived` | `ArchiveWORMGuard` | Remboursement exécuté · ledger équilibré |
| `disputed → payable` | `DisputeResolutionGuard` | DecisionRecord DISPUTE\_RESOLVED\_TALENT · SettlementInstruction émise · talent a raison |
| `disputed → partially_settled` | `DisputeResolutionGuard` | **[SC-08-PARTIEL]** DecisionRecord DISPUTE\_RESOLVED\_PARTIAL · deliveryRecognizedRatio défini · deux SettlementInstructions (talent + payeur) · commission MR = commission\_totale × deliveryRecognizedRatio |
| `disputed → refunded` | `DisputeResolutionGuard` | DecisionRecord DISPUTE\_RESOLVED\_PAYER · remboursement décidé |
| `partially_settled → archived` | `ArchiveWORMGuard` | Ledger équilibré · LOI LEDGER-02 vérifiée |
| `* → disputed` **(Frein d'Urgence)** | `DisputeGuard` | **[D-019-B]** Applicable depuis : `proposed`, `negotiating`, `accepted`, `placed`, `deposit_pending`, `deposit_secured`, `event_sealed`, `performed` uniquement. Temporalité : aucune fenêtre — accès instantané et permanent. Standing validé · EvidenceBundle soumis · LOI DISPUTE-01 déclenchée. Cas typiques : lieu inondé, talent absent avant event, contrat rompu, fraude, force majeure, non-paiement. |
| `disputed → *` | `DisputeResolutionGuard` | DecisionRecord existant · SettlementInstruction émise · acteur admin autorisé |

**Toute transition non listée ici est interdite par défaut — fail-closed.**

**Note sur isSelfOrganized :** *(inchangée — voir V11)*

## 2.8 EventLocation et Checkpoint

*(inchangé — voir V11)*

## 2.9 IDFactory

*(inchangé — voir V11)*

## 2.10 Vendeur

*(inchangé — voir V11)*

---

# PARTIES III à XIII

*(Inchangées — voir V11. Aucune modification dans les sections financières, ledger, SOTS,
DecisionKernel, sécurité, scheduler, admin, UX, infrastructure, liquidité, MVP scope.)*

---

# PARTIE XIV — PREMIER ÉVÉNEMENT RÉEL

## 14.9 [BLOC 12 — V8] Cas canonique de référence — La Pierre de Rosette

*Le premier événement réel n'est pas seulement un test opérationnel. C'est la preuve que la
constitution vit.*

**Cas canonique :** DJ Alex Dubois · 200$ CAD net garanti · Le Trèfle, Montréal ·
Checkpoint CP-PLATEAU-0001 · Mai 2026

| Carte | Loi / Principe | Ce qui se passe concrètement | Résultat attendu |
| :---- | :---- | :---- | :---- |
| C00 Philosophie | Loi Zéro | Alex est à Montréal. Son SOTS est visible. CP-PLATEAU le reconnaît comme talent local. | ✅ Engagement créé · DRAFT → ACCEPTED |
| C01 Ontologie | Engagement comme atome | Voie CreateEvent. Le Trèfle crée l'event, slot 23h-01h, attache Alex. | ✅ ACCEPTED · Dépôt demandé · 🔒 WORM 1 |
| C02 Machine État | **[D-019-A]** Séquence V4 complète | accepted → deposit\_secured → event\_sealed → performed → event\_completed → sots\_window\_closed → contestation\_window → payable → settled | ✅ settled · 🔒🔒🔒 ARCHIVED |
| C03 Waterfall | Invariant Zéro Cent | 200$ signé · coefficient 1.0 · taux X% · net calculé au centime | ✅ Livres = 0 · LEDGER-02 respecté |
| C05 SOTS | Donnée-témoin | Le Trèfle note Alex 24h après. Append-only. | ✅ Mémoire permanente créée |
| C06 Admin | 11 conditions | GPS ✓ · SOTS ✓ · Ledger ✓ · Pas de dispute ✓ · 11/11. | ✅ Paiement automatique |
| C08 Lois Inv. | 6 lois traversées | ① Loi Zéro ✓ ② Co-dépendance ✓ ③ Zéro Cent ✓ ④ Témoin ✓ ⑤ Greffier ✓ ⑥ Append-Only ✓ | ✅ 6/6 · Constitution vivante |

**[D-019-A] Séquence temporelle V4 :**

- J-30 : Contrat signé ACCEPTED 🔒
- J-7 : Acompte reçu DEPOSIT\_SECURED 🔒 · Surveillance solde activée · SchedulerDueTask armée
- Soir J : Solde reçu + Event SEALED 🔒🔒 · GPS OK
- 23h→01h : Alex performe PERFORMED
- J+24h : Fenêtre SOTS close → SOTS\_WINDOW\_CLOSED 🔒 → CONTESTATION\_WINDOW ouverte
- J+48h : Fenêtre de contestation expirée sans dispute → PAYABLE → exécution batch
- SETTLED · Pour toujours : Mémoire créée ARCHIVED 🔒🔒🔒

*Note : `balance_pending` supprimé (D-014-A). `contestation_window` inséré entre
`sots_window_closed` et `payable` (D-019-B). La séquence nominale comporte désormais
deux fenêtres post-event : SOTS (24h) puis Contestation de Prestation (24h configurable).*

---

# PARTIE XV — TESTS ET QUALITÉ

*(Inchangée — voir V11. Les suites de tests P0 doivent être mises à jour pour refléter V13 :
`balance_pending` absent de WORM\_STATES · `payable` absent de WORM\_STATES ·
`contestation_window` ajouté au chemin nominal · `sots_window_closed → payable` supprimé ·
nouveaux tests P0 requis : SC-08-PARTIEL-01, DEPOSIT-FAIL-01, CONTESTATION-WINDOW-01.)*

---

# PARTIE XVI — LOIS CANONIQUES ET PHRASES FONDATRICES

## 16.0 Lois invariantes

*(Les 6 lois invariantes sont inchangées — voir V11. WORM-APPEND-01 s'applique à tous les
registres. La réduction des moments WORM à 6 moments officiels renforce, pas n'affaiblit, la
doctrine d'append-only.)*

## 16.1 Lois financières

*(Inchangées — voir V11. LOI ANNULATION-02 s'applique depuis `deposit_secured` directement.
LOI NO-SHOW-01 s'applique depuis `sots_window_closed → no_show` — pas depuis `event_completed`.
SC-NO-SHOW-PRE : remboursement intégral organisateur sur `no_show_pre_event → archived`,
Talent A = 0$, MR = 0$ commission. SC-08-PARTIEL : commission MR proportionnelle au
`deliveryRecognizedRatio` décidé par le DecisionKernel.)*

## 16.2 Lois de processus

*(Inchangées — voir V11.)*

## 16.3 Phrases canoniques fondatrices

*(Inchangées — voir V11. Ajouts :)*

**[D-014-A] Moment 2 étendu :**

*L'acompte ne réserve pas seulement le talent — il arme le système. Dès que les 20% arrivent,
l'horloge tourne, la surveillance commence, et les deux parties sont liées. Ce n'est pas deux
états. C'est un seul moment avec deux vérités simultanées.*

**[D-014-B] Payable :**

*Payable ne veut pas dire payé. Ça veut dire : tout est vérifié, tout est prouvé, l'argent attend
son heure. Le batch s'en occupe. Le talent n'a rien à faire sinon avoir été là.*

**[D-019-B] Les deux régimes de litige :**

*Avant l'événement, la dispute est un frein d'urgence — on arrête tout, maintenant, sans fenêtre.
Après l'événement, la dispute est une contestation de prestation — on lit les SOTS d'abord, on
conteste ensuite. Ce n'est pas le même acte. Ce n'est pas la même fenêtre. Ce n'est pas le même
monde.*

**[SC-NO-SHOW-PRE] No-show pré-event :**

*Si aucun talent ne se présente avant même le show, l'institution ne retient rien. Elle a failli
à sa promesse fondamentale. L'organisateur récupère son dépôt. MR ne prend pas de commission
sur une prestation qui n'a jamais commencé.*

---

## DÉCISIONS FORMELLES — AMENDEMENTS D-014

### D-014-A | Amendement formel de D-014 — Retrait de `balance_pending` des moments WORM

**Statut :** VALIDÉ — 19 mai 2026, 18:07 EST
**Bloc :** BLOC 1 — Ontologie du produit
**Remplace :** La ligne "Moment 2b | balance\_pending" du tableau D-014 et toute référence à
`balance_pending` comme moment WORM dans WORM\_STATES.

**Contenu :**

`balance_pending` n'est pas un moment WORM distinct. La surveillance du solde est activée à
`deposit_secured` — ces deux réalités sont simultanées et inséparables.

L'obligation de régler le solde naît avec l'acompte, pas avec un acte système séparé. Quand
l'organisateur paie l'acompte, il sait déjà qu'il doit le reste avant J-6 — le système lui a
été explicite au moment de la transaction. `deposit_secured` absorbe l'ensemble des obligations
liées à l'attente du solde.

**Conséquences techniques :**

- `balance_pending` retiré de `WORM_STATES`
- La transition `deposit_secured → balance_pending` est supprimée de la machine d'état
- La transition `balance_pending → event_sealed` est remplacée par `deposit_secured → event_sealed`
- La transition `balance_pending → cancelled_J7` est remplacée par `deposit_secured → cancelled_J7`
- La SchedulerDueTask `balance_deadline_check` est créée dans le guard `EventPaymentGuard` à
  la transition `deposit_pending → deposit_secured`, pas dans un `BalanceRequestGuard` séparé
- `BalanceRequestGuard` est supprimé — sa logique est absorbée dans `EventPaymentGuard`
- Les transitions `balance_pending → disputed` et `balance_pending → transfer_requested` sont
  remplacées par les transitions existantes depuis `deposit_secured`

**D-014 reste à 6 moments officiels.** Toute référence à un "Moment 2b" dans l'OS V11 est abrogée.

---

### D-014-B | Définition souveraine de `payable` — État opérationnel non-WORM

**Statut :** VALIDÉ — 19 mai 2026, 18:07 EST
**Bloc :** BLOC 1 — Ontologie du produit
**Remplace :** Le commentaire "protection pragmatique" dans WORM\_STATES du code.

**Contenu :**

`payable` est un état opérationnel de file d'attente de paiement. Il représente la réalité
suivante : tout est vérifié, aucun obstacle actif, le virement est autorisé et attend son
exécution au prochain batch.

**Conditions d'entrée dans `payable` :**

- Fenêtre de contestation expirée sans `DisputeRecord` ouvert (via `contestation_window → payable`)
- OU litige ouvert résolu favorablement (via `disputed → payable`)
- OU exception payout urgence avec SoloFounderOverride (via `performed → payable`)

**Exécution :** Le virement part au prochain batch défini dans `PayoutBatchPolicyConfig`
(jamais hardcodé). Plusieurs payouts peuvent être regroupés en un seul batch.

**Ce que `payable` n'est pas :**

- Pas un moment WORM — retiré de `WORM_STATES`
- Pas une irréversibilité institutionnelle — l'état peut être modifié si un litige est ouvert
  après (transition `payable → disputed` active — Q3 souverain, Frein d'Urgence)
- Pas protégé par W1 warning — protégé par D-101 (6 verrous anti-double payout)

**Conséquences techniques :**

- `payable` retiré de `WORM_STATES`
- Aucun warning W1 depuis l'état `payable`
- Protection garantie par D-101 (6 verrous) — protection opérationnelle supérieure au W1

---

## DÉCISIONS FORMELLES — AMENDEMENTS D-019

### D-019-A | Amendement de D-019 — Machine d'état V4 complète

**Statut :** VALIDÉ — 19 mai 2026, 18:07 EST
**Bloc :** BLOC 1 — Ontologie du produit
**Remplace :** D-019 intégralement
**Décisions intégrées :** D-014-A · D-014-B · D-013 · OS V12 Q3 · Résolution V4 dispute

**Contenu brut :**

```
proposed → negotiating / withdrawn
negotiating → accepted / withdrawn
accepted → placed / cancelled_pre_deposit
placed → deposit_pending / cancelled_pre_deposit
deposit_pending → deposit_secured / deposit_failed
deposit_secured → event_sealed / transfer_requested / cancelled_J30 / cancelled_J7
transfer_requested → transfer_accepted / transfer_refused / no_show_pre_event
transfer_accepted → placed
transfer_refused → placed
event_sealed → performed
performed → event_completed / disputed / payable
event_completed → sots_window_closed
sots_window_closed → contestation_window / no_show
contestation_window → payable / disputed
payable → settled / disputed
settled → archived
disputed → payable / partially_settled / refunded
no_show → refunded
refunded → archived
partially_settled → archived
cancelled_pre_deposit → archived
cancelled_J30 → archived
cancelled_J7 → archived
deposit_failed → archived
no_show_pre_event → archived
```

**Note D-014-A :** `balance_pending` supprimé. `deposit_secured` absorbe la surveillance du solde
et arme la SchedulerDueTask `balance_deadline_check`.

**Note D-014-B :** `payable` est un état opérationnel non-WORM, protégé par D-101 (6 verrous
anti-double payout).

**Note `contestation_window` :** État explicite post-SOTS. Durée configurée dans
`DisputeAccessPolicyConfig`. Fenêtre de Contestation de Prestation — distinct du Frein
d'Urgence (Q3). Voir D-019-B.

**Note `performed → payable` :** Exception SoloFounderOverride uniquement. Voir D-106 et
OS V13 §2.7.1.

**Note `* → disputed` (Frein d'Urgence) :** Depuis tout état avant `event_completed`, le litige
est instantané et sans fenêtre temporelle. Depuis `contestation_window`, le litige est une
Contestation de Prestation soumise à la durée de `DisputeAccessPolicyConfig`. Voir D-019-B.

---

### D-019-B | Séparation souveraine des deux régimes de litige

**Statut :** VALIDÉ — 19 mai 2026, 18:07 EST
**Bloc :** BLOC 1 — Ontologie du produit
**Résout :** Contradiction AUD-02/AUD-12 — Q3 vs D-045
**Abroge :** D-045 §"Ouverture dispute : jusqu'à 24h après event\_completed"

**Principe fondateur :**
Le mot "disputed" couvrait deux réalités juridiques incompatibles. Cette décision les sépare
définitivement.

**Régime 1 — Frein d'Urgence (Q3)**

- Applicable depuis : `proposed`, `negotiating`, `accepted`, `placed`, `deposit_pending`,
  `deposit_secured`, `event_sealed`, `performed`
- Temporalité : aucune fenêtre — accès instantané et permanent
- Conditions : standing validé + EvidenceBundle soumis
- Cas typiques : lieu inondé, DJ absent avant event, contrat rompu, fraude, force majeure,
  non-paiement
- Règle invariante : la poignée de frein d'urgence doit fonctionner à tout moment avant la
  fin de l'événement

**Régime 2 — Contestation de Prestation**

- Applicable depuis : `contestation_window` uniquement
- Temporalité : durée configurée dans `DisputeAccessPolicyConfig`
  (`contestationWindowDurationHours`, recommandé MVP : 24h après `sots_window_closed`)
- Conditions : standing validé + EvidenceBundle soumis
- Cas typiques : prestation dégradée, retard, qualité insuffisante, désaccord sur le SOTS,
  non-livraison partielle
- Règle invariante : la fenêtre ne peut pas s'ouvrir avant `sots_window_closed` — lire les
  évaluations avant de contester

**Ligne du temps canonique post-event :**

```
event_completed → [+24h SOTS] → sots_window_closed
→ contestation_window → [+24h contestation]
→ contestation_window expire → payable → settled → archived
```

**Conséquence sur D-045 :**
La clause de D-045 *"Ouverture dispute : jusqu'à 24h après event\_completed"* est abrogée et
remplacée par la présente décision. La fenêtre de contestation court 24h après
`sots_window_closed`, pas après `event_completed`. Le reste de D-045 (procédure, EvidenceBundle,
DecisionRecord, SettlementInstruction) demeure inchangé.

**Configs concernées :** `DisputeAccessPolicyConfig` (champ : `contestationWindowDurationHours`)

---

## SCÉNARIOS ÉCONOMIQUES — NOUVEAUX

### SC-NO-SHOW-PRE | No-show pré-event après transfert échoué

**Statut :** VALIDÉ — 19 mai 2026, 18:07 EST
**Déclencheur :** `transfer_requested → no_show_pre_event → archived`
**Précondition :** `deposit_secured` atteint (acompte reçu et sécurisé)
**Décision souveraine :** remboursement intégral organisateur moins frais Stripe de capture.
Talent A = 0$. MR = 0$ commission.

**Justification institutionnelle :** La faute systémique incombe au pool de talents / à la
plateforme. Aucun service n'a été rendu. L'institution de règlement ne peut pas encaisser sur
une promesse non tenue.

**Écritures — Phase de reversal (depuis deposit\_secured) :**

```
DR  4310  Talent payable (net)              810,00 $
DR  4530  Revenus différés (commission)     190,00 $
DR  4410  TPS à remettre                      9,50 $
DR  4420  TVQ à remettre                     18,95 $
    CR  5200  Stripe en attente           1 028,45 $

DR  4190  Frais Stripe différés              35,66 $
    CR  5100  Stripe disponible              35,66 $

Remboursement net au payeur :
  montant_remboursé = dépôt_brut_reçu − frais_stripe_capture

DR  4320  Dépôt payeur (passif)          1 028,45 $
    CR  5100  Stripe disponible          1 028,45 $
```

**Résultat net MR :** 0$ commission reconnue.
**Résultat Talent A :** 0$.
**Résultat organisateur :** remboursement intégral moins frais Stripe.

**Compte analytique :** 6590 (Coût opérationnel exceptionnel — no-show pré-event).

**Note multi-talent :** Si l'event est multi-talent et que seul un talent déclenche
`no_show_pre_event`, traiter l'Engagement concerné selon ce SC indépendamment. Les autres
Engagements du Lineup ne sont pas affectés (D-044).

**DecisionRecord requis :** `NO_SHOW_CONFIRMED` (type D-072).
**Configs concernées :** `TransferPolicyConfig`, `CancellationGuard`.

---

### SC-DEPOSIT-FAIL | Échec Stripe sur deposit\_pending

**Statut :** VALIDÉ — 19 mai 2026, 18:07 EST
**Déclencheur :** `deposit_pending → deposit_failed → archived`
**Précondition :** aucun fonds capturé (webhook Stripe échec reçu)
**Décision souveraine :** zéro écriture dans le FinancialLedger.

**Règle architecturale :**
Le système ne pré-crédite aucun compte avant réception du webhook
`payment_intent.succeeded`. Durant `deposit_pending`, aucune écriture n'existe dans le
FinancialLedger.

**Waterfall :**

```
Aucune écriture DR/CR dans le FinancialLedger.
EPR.status → FAILED
SchedulerDueTasks liées à cet Engagement → status CANCELLED
Engagement → deposit_failed → archived
```

**Actions système requises :**

1. `EPR.status` → FAILED
2. SchedulerDueTasks liées → status CANCELLED
3. Engagement → `archived` (mémoire réputationnelle uniquement)
4. `PayoutBlockReason` créé : `DEPOSIT_FAILED_NO_FUNDS`
5. Notification organisateur (ton non-accusatoire — D-087)

**Impact réputationnel :**
L'organisateur a échoué à payer son dépôt. Cet événement est tracé dans le ReputationLedger
de l'organisateur. Aucune entrée ReputationLedger pour le talent (pas sa faute).

**Invariant LEDGER-02 :** respecté trivialement — aucune écriture, aucun écart possible.

**Test P0 à créer :** `DEPOSIT-FAIL-01` — vérifier que `deposit_failed` ne génère aucune
écriture ledger et que toutes les SchedulerDueTasks sont annulées.

---

### SC-08-PARTIEL | Résolution partielle de litige

**Statut :** VALIDÉ — 19 mai 2026, 18:07 EST
**Déclencheur :** `disputed → partially_settled → archived`
**Variable clé :** `deliveryRecognizedRatio` (ex : 0,70 = 70% de la prestation validée)
**Décision souveraine :** commission MR strictement proportionnelle au service reconnu. MR
assume sa part si la prestation est dégradée.

**Justification institutionnelle :** En tant qu'institution de règlement, Micro Rave lie sa
performance financière à la réussite de la mise en relation. Si le talent livre une prestation
dégradée, la plateforme assume sa part en n'encaissant sa commission que sur la portion validée.

**Exemple de référence :**
Cachet brut signé : 1 000$ · taux effectif MR : 19% · deliveryRecognizedRatio : 0,70

```
montant_reconnu          = 1 000$ × 0,70 = 700,00$
montant_contesté         = 1 000$ × 0,30 = 300,00$
commission_MR_reconnue   = 700$ × 0,19  = 133,00$
talent_net_reconnu       = 700$ − 133$  = 567,00$
remboursement_payeur     = 300$ + (300$ × 0,19) = 357,00$
```

**Écritures — Résolution (depuis disputed / event\_sealed) :**

```
Libération portion reconnue au talent :
DR  4310  Talent payable (net reconnu)       567,00 $
    CR  5100  Stripe disponible              567,00 $

Reconnaissance commission MR sur portion validée :
DR  4530  Revenus différés (comm.)           133,00 $
    CR  7110  Revenus courtage complété      133,00 $

Remboursement payeur sur portion contestée :
DR  4530  Revenus différés (comm. contestée)  57,00 $
DR  4310  Talent payable (net contesté)      243,00 $
    CR  5100  Stripe disponible              300,00 $

Taxes sur portion MR reconnue uniquement :
DR  4410  TPS à remettre (sur 133$)            6,65 $
DR  4420  TVQ à remettre (sur 133$)           13,27 $
    CR  5100  Stripe disponible               19,92 $

Frais Stripe — ventilation proportionnelle :
DR  6110  Frais Stripe courtage (70%)         24,96 $
DR  6119  Écart frais processeur (30%)        10,70 $
    CR  4190  Frais Stripe différés           35,66 $
```

**Vérification LOI LEDGER-02 :**
`talent_net_reconnu + commission_MR_reconnue + remboursement_payeur + rounding_adjustment = prix_vendu_client_cents` ✓

**DecisionRecord requis :** `DISPUTE_RESOLVED_PARTIAL` avec `deliveryRecognizedRatio`,
`recognizedAmount`, `contestedAmount`, `actorRole`, `policyId`.

**SettlementInstruction :** deux instructions distinctes — une vers le talent (montant reconnu),
une vers le payeur (remboursement contesté).

**Test P0 à créer :** `SC-08-PARTIEL-01` — vérifier que `sum(DR) = sum(CR)` avec
`deliveryRecognizedRatio` quelconque entre 0,01 et 0,99. Tester 0,00 (→ `refunded`) et 1,00
(→ `payable`).

---

## CHANGELOG

**V13 — 19 mai 2026, 18:07 EST :**

D-019-A — Machine d'état V4 complète. Remplace D-019 intégralement. Intègre D-014-A, D-014-B,
D-013, Q3, Résolution V4 dispute. Nouveaux états : `contestation_window`, `partially_settled`.
Nouvelles transitions documentées : `transfer_accepted → placed`, `transfer_refused → placed`,
`accepted → cancelled_pre_deposit`, `deposit_failed → archived`, `no_show_pre_event → archived`,
`performed → payable` (SoloFounderOverride), `sots_window_closed → contestation_window`,
`contestation_window → payable / disputed`, `partially_settled → archived`.

D-019-B — Séparation souveraine Frein d'Urgence / Contestation de Prestation. D-045
("24h après event\_completed") abrogé sur le point de la fenêtre. La fenêtre de contestation
court 24h après `sots_window_closed`. Q3 = Frein d'Urgence pre-event uniquement. Nouveau
guard : `ContestationWindowGuard`. Nouveau champ config : `contestationWindowDurationHours`.

SC-NO-SHOW-PRE — Waterfall `no_show_pre_event → archived`. Reversal complet depuis
`deposit_secured`. Organisateur remboursé (dépôt brut − frais Stripe). Talent A = 0$.
MR = 0$. Compte analytique 6590.

SC-DEPOSIT-FAIL — Waterfall `deposit_failed → archived`. Zéro écriture ledger.
EPR invalidée. SchedulerDueTasks annulées. Impact réputationnel organisateur uniquement.
Test P0 requis : DEPOSIT-FAIL-01.

SC-08-PARTIEL — Waterfall `disputed → partially_settled → archived`. Commission MR =
`commission_totale × deliveryRecognizedRatio`. Deux SettlementInstructions distinctes.
Test P0 requis : SC-08-PARTIEL-01.

**V12 — Mai 2026 :**
D-014-A — `balance_pending` retiré des moments WORM · fusionné dans `deposit_secured` ·
SchedulerDueTask `balance_deadline_check` créée dans `EventPaymentGuard` · `BalanceRequestGuard`
supprimé · chemin nominal simplifié `deposit_secured → event_sealed`

D-014-B — `payable` retiré de `WORM_STATES` · défini souverainement comme état opérationnel
de file d'attente · protégé par D-101, pas par WORM · `PayoutBatchPolicyConfig` en database

**V11 — Mai 2026 :**
Décisions fondateur Q1/Q2/Q3 · table 2.7.1 corrigée · chemin deux étapes paiement · litige ouvert
· transfert depuis deposit\_secured · balance\_pending ajouté dans WORM\_STATES W1 (abrogé par V12)
· Pierre de Rosette séquence · settled retiré de WORM

Fondateur : Frédérik Gélin — Montréal, 19 mai 2026, 18:07 EST
*"Une capacité culturelle locale devient un engagement de prestation vérifiable, puis un règlement économique, puis une mémoire territoriale."*