# MICRO RAVE V3 — FOUNDER-VALIDATED OPERATING SYSTEM

### Document de référence souverain — validé par Frédérik Gélin, Fondateur

---

**Ce document contient uniquement ce qui a été explicitement validé par le fondateur.** Toute décision non présente ici est une hypothèse, pas une loi. Version : MVP V3 — 19 mai 2026, 18:07 EST — V13 : D-019-A (machine d'état V4) · D-019-B (Frein d'Urgence / Contestation de Prestation) · contestation_window · D-045 abrogé · SC-NO-SHOW-PRE · SC-DEPOSIT-FAIL · SC-08-PARTIEL

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

proposed → negotiating → accepted → placed → deposit\_pending
→ deposit\_secured → event\_sealed → performed
→ event\_completed → sots\_window\_closed → payable → settled → archived

États alternatifs :

disputed / no\_show / cancelled\_pre\_deposit / cancelled\_J30
/ cancelled\_J7 / transfer\_requested / transfer\_accepted
/ transfer\_refused / no\_show\_pre\_event / refunded / deposit\_failed

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

**[D-014-A] États retirés des moments WORM :**

`balance_pending` n'est pas un moment WORM distinct. La surveillance du solde est activée à
`deposit_secured` — ces deux réalités sont simultanées et inséparables. L'obligation de régler le
solde naît avec l'acompte, pas avec un acte système séparé. La SchedulerDueTask
`balance_deadline_check` est créée dans le guard `EventPaymentGuard` à la transition
`deposit_pending → deposit_secured`. D-014 reste à 6 moments officiels.

**[D-014-B] `payable` — état opérationnel de file d'attente, non-WORM :**

`payable` est un état opérationnel de file d'attente de paiement. Il signifie : fenêtre SOTS et
litiges complétés sans obstacle actif, OU litige résolu favorablement. Le virement vers le talent
est **autorisé** et sera exécuté au prochain batch selon `PayoutBatchPolicyConfig` (jamais
hardcodé). `payable` n'est **pas** un moment WORM — il est protégé par D-101 (6 verrous
anti-double payout). Il est dans la machine d'état comme état observable et de file d'attente,
pas comme irréversibilité institutionnelle. Aucun warning W1 n'est émis depuis cet état.

## 2.7.1 Guards de transition — table souveraine

**[PATCH V9 + V12] Architecture anti-corruption de la machine d'état**

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
| `accepted → cancelled_pre_deposit` | `CancellationGuard` | Aucun acompte reçu · annulation sans frais |
| `placed → deposit_pending` | `EventPaymentGuard` | EventPaymentRecord créé · Lineup verrouillé · prix calculé · LOI LINEUP-03 respectée |
| `placed → cancelled_pre_deposit` | `CancellationGuard` | Aucun acompte reçu · annulation sans frais |
| `deposit_pending → deposit_secured` | `EventPaymentGuard` | Webhook Stripe `payment_intent.succeeded` reçu · acompte confirmé · Moment WORM 2 — liaison contractuelle verrouillée · **[D-014-A]** SchedulerDueTask `balance_deadline_check` créée · surveillance solde activée · notifications progressives armées · Décision fondateur V11 Q2 |
| `deposit_pending → deposit_failed` | `EventPaymentGuard` | Webhook Stripe échec reçu · aucun fonds capturé |
| `deposit_secured → event_sealed` | `SealingGuard` | Solde reçu · ContractSnapshot phase 2 créé · LOI LINEUP-01/02 vérifiées · LOI LEDGER-02 vérifiée · Moment WORM 3 — WORM financier complet · Décision fondateur V11 Q2 |
| `deposit_secured → cancelled_J30` | `CancellationGuard` | Acompte reçu · annulation > J-30 · remboursement dépôt moins frais Stripe |
| `deposit_secured → cancelled_J7` | `CancellationGuard` | **[D-014-A]** Solde non reçu à J-6 · annulation automatique LOI ANNULATION-02 · acompte aux talents au prorata |
| `deposit_secured → transfer_requested` | `TransferGuard` | financialGuard obligatoire car acompte reçu · Décision fondateur V11 Q1 |
| `event_sealed → performed` | `PresenceWindowGuard` | Date event passée · check-in window ouverte · SessionPresence initiée |
| `performed → event_completed` | `EventCompletionGuard` | Tous les talents en état `performed` · aucun no-show non résolu |
| `event_completed → sots_window_closed` | `SOTSWindowGuard` | Fenêtre 24h écoulée · SOTSSubmissions consolidées |
| `sots_window_closed → payable` | `PresenceProofGuard` | **[D-014-B]** 11 conditions vérifiées · fenêtre SOTS et litiges complétés sans obstacle · payout autorisé · exécution au prochain batch `PayoutBatchPolicyConfig` |
| `sots_window_closed → no_show` | `NoShowGuard` | Absence confirmée après fenêtre SOTS · LOI NO-SHOW-01 applicable |
| `sots_window_closed → disputed` | `DisputeGuard` | Standing validé · EvidenceBundle soumis |
| `performed → payable` | `PresenceProofGuard` | Présence prouvée · payout conditions PASS · ledger équilibré · event non disputé · SoloFounderOverride + AdminIncidentRecord requis |
| `payable → settled` | `LedgerInvariantGuard` | LOI LEDGER-02 respectée · zéro cent · Stripe payout confirmé · KYCStatus = VERIFIED |
| `settled → archived` | `ArchiveWORMGuard` | SOTS window closed · tous LedgerRecords finaux · GoNoGoDecisionRecord = GO |
| `transfer_requested → transfer_accepted` | `TransferGuard` | Talent B accepte |
| `transfer_requested → transfer_refused` | `TransferGuard` | Talent B refuse |
| `transfer_requested → no_show_pre_event` | `TransferGuard` | Aucun remplaçant disponible dans délai · financialGuard obligatoire |
| `transfer_accepted → placed` | `TransferGuard` | Cycle transfert fermé |
| `transfer_refused → placed` | `TransferGuard` | Retour au Lineup initial |
| `* → disputed` | `DisputeGuard` | Standing de l'acteur validé · EvidenceBundle soumis · LOI DISPUTE-01 déclenchée. **Décision fondateur V11 Q3 :** litige accessible depuis TOUS les états actifs sans restriction — la poignée de frein d'urgence doit fonctionner à tout moment. |
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
| C02 Machine État | **[D-014-A]** Séquence WORM simplifiée | accepted → deposit\_secured → event\_sealed → performed → payable → settled | ✅ settled · 🔒🔒🔒 ARCHIVED |
| C03 Waterfall | Invariant Zéro Cent | 200$ signé · coefficient 1.0 · taux X% · net calculé au centime | ✅ Livres = 0 · LEDGER-02 respecté |
| C05 SOTS | Donnée-témoin | Le Trèfle note Alex 24h après. Append-only. | ✅ Mémoire permanente créée |
| C06 Admin | 11 conditions | GPS ✓ · SOTS ✓ · Ledger ✓ · Pas de dispute ✓ · 11/11. | ✅ Paiement automatique |
| C08 Lois Inv. | 6 lois traversées | ① Loi Zéro ✓ ② Co-dépendance ✓ ③ Zéro Cent ✓ ④ Témoin ✓ ⑤ Greffier ✓ ⑥ Append-Only ✓ | ✅ 6/6 · Constitution vivante |

**[D-014-A] Séquence temporelle révisée :**

- J-30 : Contrat signé ACCEPTED 🔒
- J-7 : Acompte reçu DEPOSIT\_SECURED 🔒 · Surveillance solde activée · SchedulerDueTask armée
- Soir J : Solde reçu + Event SEALED 🔒🔒 · GPS OK
- 23h→01h : Alex performe PERFORMED
- J+24h : Le Trèfle note · SOTS append-only
- Vérification 11 conditions : Paiement autorisé PAYABLE → exécution batch
- SETTLED · Pour toujours : Mémoire créée ARCHIVED 🔒🔒🔒

*Note : `balance_pending` a été supprimé de cette séquence (D-014-A). La surveillance du solde
est une responsabilité de `deposit_secured`, pas un état séparé dans la machine d'état.*

---

# PARTIE XV — TESTS ET QUALITÉ

*(Inchangée — voir V11. Les suites de tests P0 doivent être mises à jour pour refléter D-014-A
et D-014-B : `balance_pending` absent de WORM\_STATES · `payable` absent de WORM\_STATES ·
chemin nominal `deposit_secured → event_sealed` sans état intermédiaire.)*

---

# PARTIE XVI — LOIS CANONIQUES ET PHRASES FONDATRICES

## 16.0 Lois invariantes

*(Les 6 lois invariantes sont inchangées — voir V11. WORM-APPEND-01 s'applique à tous les
registres. La réduction des moments WORM à 6 moments officiels renforce, pas n'affaiblit, la
doctrine d'append-only.)*

## 16.1 Lois financières

*(Inchangées — voir V11. LOI ANNULATION-02 s'applique désormais depuis `deposit_secured`
directement : `deposit_secured → cancelled_J7` est la transition d'annulation automatique si le
solde est impayé à J-6.)*

## 16.2 Lois de processus

*(Inchangées — voir V11.)*

## 16.3 Phrases canoniques fondatrices

*(Inchangées — voir V11. Ajout :)*

**[D-014-A] Moment 2 étendu :**

*L'acompte ne réserve pas seulement le talent — il arme le système. Dès que les 20% arrivent,
l'horloge tourne, la surveillance commence, et les deux parties sont liées. Ce n'est pas deux
états. C'est un seul moment avec deux vérités simultanées.*

**[D-014-B] Payable :**

*Payable ne veut pas dire payé. Ça veut dire : tout est vérifié, tout est prouvé, l'argent attend
son heure. Le batch s'en occupe. Le talent n'a rien à faire sinon avoir été là.*

---

## DÉCISIONS FORMELLES — AMENDEMENTS D-014

### D-014-A | Amendement formel de D-014 — Retrait de `balance_pending` des moments WORM

**Statut :** VALIDÉ — Décision fondateur Mai 2026
**Bloc :** BLOC 1 — Ontologie du produit
**Remplace :** La ligne "Moment 2b | balance_pending" du tableau D-014 et toute référence à
`balance_pending` comme moment WORM dans WORM_STATES.

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

**Statut :** VALIDÉ — Décision fondateur Mai 2026
**Bloc :** BLOC 1 — Ontologie du produit
**Remplace :** Le commentaire "protection pragmatique" dans WORM_STATES du code.

**Contenu :**

`payable` est un état opérationnel de file d'attente de paiement. Il représente la réalité
suivante : tout est vérifié, aucun obstacle actif, le virement est autorisé et attend son
exécution au prochain batch.

**Conditions d'entrée dans `payable` :**

- Fenêtre SOTS complétée sans obstacle (via `sots_window_closed → payable`)
- OU litige ouvert résolu favorablement (via `disputed → payable`)
- OU exception payout urgence avec SoloFounderOverride (via `performed → payable`)

**Exécution :** Le virement part au prochain batch défini dans `PayoutBatchPolicyConfig`
(jamais hardcodé). Plusieurs payouts peuvent être regroupés en un seul batch.

**Ce que `payable` n'est pas :**

- Pas un moment WORM — retiré de `WORM_STATES`
- Pas une irréversibilité institutionnelle — l'état peut être modifié si un litige est ouvert
  après (transition `payable → disputed` active — Q3 souverain)
- Pas protégé par W1 warning — protégé par D-101 (6 verrous anti-double payout)

**Conséquences techniques :**

- `payable` retiré de `WORM_STATES`
- Aucun warning W1 depuis l'état `payable`
- Protection garantie par D-101 (6 verrous) — protection opérationnelle supérieure au W1

---

## CHANGELOG

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

Fondateur : Frédérik Gélin — Montréal, mai 2026
*"Une capacité culturelle locale devient un engagement de prestation vérifiable, puis un règlement économique, puis une mémoire territoriale."*