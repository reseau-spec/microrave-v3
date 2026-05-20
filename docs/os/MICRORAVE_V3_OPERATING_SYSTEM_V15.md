# MICRO RAVE V3 — FOUNDER-VALIDATED OPERATING SYSTEM

### Document de référence souverain — validé par Frédérik Gélin, Fondateur

---

**Ce document contient uniquement ce qui a été explicitement validé par le fondateur.** Toute décision non présente ici est une hypothèse, pas une loi. Version : MVP V3 — 20 mai 2026 — V14 : D-147 (EngagementAmendment — extension de plage horaire sur accord mutuel) · Clarification SC-07 multi-talent coefficient (base = ContractSnapshot phase 2) · CT-014 résolu · SC-07-AMENDMENT ajouté

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
| 3 | event\_sealed | WORM financier complet — montants, taux, taxes, Stripe. **[D-147] Le cachet\_brut\_final de chaque talent (après coefficient) est gravé ici. C'est cette valeur qui sert de base à tout calcul ultérieur — paiement, no-show, amendment.** | 🔒🔒 Niveau 2 — Fraude |
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
| `deposit_secured → event_sealed` | `SealingGuard` | Solde reçu · ContractSnapshot phase 2 créé · LOI LINEUP-01/02 vérifiées · LOI LEDGER-02 vérifiée · Moment WORM 3 — WORM financier complet · **[D-147]** cachet\_brut\_final\_i de chaque talent gravé — base de tout calcul ultérieur |
| `deposit_secured → cancelled_J30` | `CancellationGuard` | Acompte reçu · annulation > J-30 · remboursement dépôt moins frais Stripe |
| `deposit_secured → cancelled_J7` | `CancellationGuard` | **[D-014-A]** Solde non reçu à J-6 · annulation automatique LOI ANNULATION-02 · acompte aux talents au prorata |
| `deposit_secured → transfer_requested` | `TransferGuard` | financialGuard obligatoire car acompte reçu |
| `deposit_failed → archived` | `ArchiveWORMGuard` | **[SC-DEPOSIT-FAIL]** Aucun fonds · zéro écriture ledger · ReputationLedger organisateur mis à jour |
| `cancelled_pre_deposit → archived` | `ArchiveWORMGuard` | Aucun fonds · SchedulerDueTasks annulées |
| `cancelled_J30 → archived` | `ArchiveWORMGuard` | Remboursement exécuté · ledger équilibré |
| `cancelled_J7 → archived` | `ArchiveWORMGuard` | Payout prorata talents exécuté · ledger équilibré |
| `event_sealed → performed` | `PresenceWindowGuard` | Date event passée · check-in window ouverte · SessionPresence initiée |
| `performed → event_completed` | `EventCompletionGuard` | Tous les talents en état `performed` ou `performed_amended` · aucun no-show non résolu |
| `performed → payable` | `PresenceProofGuard` | **[D-019-A]** Exception SoloFounderOverride uniquement · Présence prouvée · payout conditions PASS · ledger équilibré · event non disputé · SoloFounderOverride + AdminIncidentRecord requis · voir D-106 |
| `event_completed → sots_window_closed` | `SOTSWindowGuard` | Fenêtre 24h écoulée · SOTSSubmissions consolidées |
| `sots_window_closed → contestation_window` | `ContestationWindowGuard` | **[D-019-B]** Fenêtre SOTS close · ouverture fenêtre de Contestation de Prestation · durée configurée dans `DisputeAccessPolicyConfig.contestationWindowDurationHours` |
| `sots_window_closed → no_show` | `NoShowGuard` | Absence confirmée après fenêtre SOTS · LOI NO-SHOW-01 applicable · DecisionRecord NO\_SHOW\_CONFIRMED requis |
| `contestation_window → payable` | `PresenceProofGuard` | **[D-019-B]** Fenêtre de contestation expirée sans DisputeRecord ouvert · 11 conditions D-075 vérifiées · payout autorisé · exécution au prochain batch `PayoutBatchPolicyConfig` |
| `contestation_window → disputed` | `DisputeGuard` | **[D-019-B] Contestation de Prestation** — standing validé · EvidenceBundle soumis · fenêtre active |
| `payable → settled` | `LedgerInvariantGuard` | LOI LEDGER-02 respectée · zéro cent · Stripe payout confirmé · KYCStatus = VERIFIED |
| `settled → archived` | `ArchiveWORMGuard` | SOTS window closed · tous LedgerRecords finaux · GoNoGoDecisionRecord = GO |
| `transfer_requested → transfer_accepted` | `TransferGuard` | Talent B accepte |
| `transfer_requested → transfer_refused` | `TransferGuard` | Talent B refuse |
| `transfer_requested → no_show_pre_event` | `TransferGuard` | Aucun remplaçant disponible dans délai · financialGuard obligatoire |
| `transfer_accepted → placed` | `TransferGuard` | Talent B confirmé · retour Lineup · ContractSnapshot substitution documentée |
| `transfer_refused → placed` | `TransferGuard` | Retour à Talent A · Lineup inchangé |
| `no_show_pre_event → archived` | `ArchiveWORMGuard` | **[SC-NO-SHOW-PRE]** Reversal complet depuis deposit\_secured · remboursement organisateur (dépôt brut − frais Stripe) · Talent A = 0$ · MR = 0$ commission · DecisionRecord NO\_SHOW\_CONFIRMED requis |
| `no_show → refunded` | `NoShowGuard` | LOI NO-SHOW-01 · talent 0$ · remboursement cachet\_net\_final au payeur · MR conserve commission · **[D-147/CT-014]** cachet\_net\_final = cachet\_brut\_final\_i (ContractSnapshot phase 2, WORM W2) − commission\_MR\_i |
| `refunded → archived` | `ArchiveWORMGuard` | Remboursement exécuté · ledger équilibré |
| `disputed → payable` | `DisputeResolutionGuard` | DecisionRecord DISPUTE\_RESOLVED\_TALENT · SettlementInstruction émise |
| `disputed → partially_settled` | `DisputeResolutionGuard` | **[SC-08-PARTIEL]** DecisionRecord DISPUTE\_RESOLVED\_PARTIAL · deliveryRecognizedRatio défini |
| `disputed → refunded` | `DisputeResolutionGuard` | DecisionRecord DISPUTE\_RESOLVED\_PAYER · remboursement décidé |
| `partially_settled → archived` | `ArchiveWORMGuard` | Ledger équilibré · LOI LEDGER-02 vérifiée |
| `* → disputed` **(Frein d'Urgence)** | `DisputeGuard` | **[D-019-B]** Applicable depuis : `proposed`, `negotiating`, `accepted`, `placed`, `deposit_pending`, `deposit_secured`, `event_sealed`, `performed` uniquement. Temporalité : aucune fenêtre — accès instantané et permanent. Standing validé · EvidenceBundle soumis · LOI DISPUTE-01 déclenchée. |
| `disputed → *` | `DisputeResolutionGuard` | DecisionRecord existant · SettlementInstruction émise · acteur admin autorisé |

**Toute transition non listée ici est interdite par défaut — fail-closed.**

**Note sur isSelfOrganized :** *(inchangée — voir V11)*

## 2.7.2 EngagementAmendment — Extension de plage horaire sur accord mutuel

**[D-147] — Décision fondateur 20 mai 2026**

**Principe fondateur :**

*Le contrat documente l'intention. La réalité peut s'en écarter légèrement — dans les deux sens.
L'amendment documente l'écart avec consentement. Le no-show documente l'absence sans consentement.*

Un `EngagementAmendment` est un sous-processus déclenché depuis l'état `performed`, distinct de
la machine d'état principale. Il ne crée pas un nouvel Engagement — il étend la plage horaire
de l'Engagement existant avec le consentement explicite des deux parties.

**Cas typique :** DJ warmup (signé 200$/h, plage 1h) accepte d'étendre sa plage de 2h
supplémentaires à la demande de l'organisateur, le headliner étant absent. Le headliner reste
en `no_show` avec impact réputationnel. Le warmup fait son contrat étendu.

**Règles invariantes :**

1. **Le taux contractuel est WORM W2 — immuable.** Seule la durée change.
   Le nouveau cachet = taux horaire implicite × nouvelle durée totale.
   `taux_horaire_implicite = cachet_brut_final_i / duree_signee_minutes × 60`
   Ce taux n'est pas stocké — il est recalculé depuis le ContractSnapshot phase 2.

2. **Double consentement obligatoire.** Talent (action explicite dans l'app) + organisateur
   (action explicite dans l'app). Sans les deux consentements, l'amendment ne peut pas être créé.
   Si le fondateur est présent sur place : AdminAction requise.

3. **Uniquement depuis l'état `performed`.** L'amendment ne peut pas être créé après
   `event_completed`. La plage est figée dès que l'event est complété.

4. **Le talent absent reste en no-show.** L'extension du warmup ne couvre pas
   institutionnellement le headliner. Le headliner reçoit `NO_SHOW_CONFIRMED` dans son
   `ReputationLedger` indépendamment de ce que fait le warmup.

5. **Calcul financier de l'amendment :**
   - `nouveau_cachet_brut_final = taux_horaire_implicite × nouvelle_duree_minutes / 60`
   - `delta_cachet = nouveau_cachet_brut_final − cachet_brut_final_original`
   - `delta_commission_MR = delta_cachet × taux_effectif_snapshot`
   - `delta_talent_net = delta_cachet − delta_commission_MR`
   - L'organisateur est facturé le delta (si positive) ou remboursé le delta (si negative).
   - LOI LEDGER-02 doit être vérifiée après amendment.

6. **Le no-show du headliner et l'amendment du warmup sont deux événements indépendants**
   traités séquentiellement. D'abord : remboursement no-show headliner (cachet\_net\_final
   headliner au payeur, commission MR conservée). Ensuite, si amendment warmup : facturation
   delta au payeur.

**Objet `EngagementAmendment` :**

```
id                      systemId (AMD-)
engagementId            référence à l'Engagement original
amendmentType           'PLAGE_EXTENSION' (seul type MVP)
originalDurationMinutes durée contractuelle originale
newDurationMinutes      nouvelle durée totale
originalCachetBrutFinalCents  ContractSnapshot phase 2 — WORM W2
newCachetBrutFinalCents       calculé depuis taux horaire implicite
deltaCachetCents        newCachetBrutFinalCents − originalCachetBrutFinalCents
deltaCommissionMrCents  deltaCachetCents × taux_effectif_snapshot
deltaTalentNetCents     deltaCachetCents − deltaCommissionMrCents
talentConsentAt         timestamp consentement talent
organizerConsentAt      timestamp consentement organisateur
adminActionId           si fondateur présent sur place
reasonCode              obligatoire
createdAt               timestamp création
```

**Configs concernées :** `EngagementAmendmentPolicyConfig`
(champs : `maxExtensionMinutes`, `requireDoubleConsent`, `allowedFromState`)

**Test P0 à créer :** `AMENDMENT-01` — vérifier que l'amendment ne peut pas être créé hors
état `performed`, que le taux est immuable, que le double consentement est requis, et que
LOI LEDGER-02 est respectée après application du delta.

## 2.8 EventLocation et Checkpoint

*(inchangé — voir V11)*

## 2.9 IDFactory

*(inchangé — voir V11 + ajout préfixe AMD- pour EngagementAmendment)*

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
- Soir J : Solde reçu + Event SEALED 🔒🔒 · GPS OK · cachet\_brut\_final gravé (WORM W2)
- 23h→01h : Alex performe PERFORMED
- J+24h : Fenêtre SOTS close → SOTS\_WINDOW\_CLOSED 🔒 → CONTESTATION\_WINDOW ouverte
- J+48h : Fenêtre de contestation expirée sans dispute → PAYABLE → exécution batch
- SETTLED · Pour toujours : Mémoire créée ARCHIVED 🔒🔒🔒

*Note : `balance_pending` supprimé (D-014-A). `contestation_window` inséré entre
`sots_window_closed` et `payable` (D-019-B). La séquence nominale comporte désormais
deux fenêtres post-event : SOTS (24h) puis Contestation de Prestation (24h configurable).*

---

# PARTIE XV — TESTS ET QUALITÉ

*(Inchangée — voir V11. Les suites de tests P0 doivent être mises à jour pour refléter V13 et V14 :
`balance_pending` absent de WORM\_STATES · `payable` absent de WORM\_STATES ·
`contestation_window` ajouté au chemin nominal · `sots_window_closed → payable` supprimé ·
Nouveaux tests P0 requis : SC-08-PARTIEL-01, DEPOSIT-FAIL-01, CONTESTATION-WINDOW-01,
AMENDMENT-01, SC-07-COEFFICIENT-01.)*

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
Talent A = 0$, MR = 0$ commission.
SC-08-PARTIEL : commission MR proportionnelle au `deliveryRecognizedRatio`.
**[D-147] LOI NO-SHOW-01 appliquée sur cachet\_brut\_final (ContractSnapshot phase 2, WORM W2).**
Le remboursement organisateur = cachet\_net\_final = cachet\_brut\_final\_i − commission\_MR\_i,
où cachet\_brut\_final\_i inclut le coefficient de vente. Les Engagements des autres talents
ne sont pas affectés (D-044).)*

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

**[D-147] EngagementAmendment :**

*Un talent qui choisit de rester plus longtemps mérite d'être payé pour le temps réel qu'il passe.
Le contrat ne change pas — il s'étend. Le taux est le même. La durée est différente.
L'absent reste absent.*

**[D-147/CT-014] Coefficient et no-show :**

*Le coefficient augmente les talents au moment du scellement. Après ce point, chaque Engagement
est indépendant. Un no-show ne recalcule pas le coefficient. Il ne redistribue pas l'argent de
l'absent sur les présents. Il rembourse l'organisateur de ce qui n'a pas été livré — au prix
réel auquel il avait signé, coefficient compris.*

---

## DÉCISIONS FORMELLES — AMENDEMENTS D-014

### D-014-A | Amendement formel de D-014 — Retrait de `balance_pending` des moments WORM

**Statut :** VALIDÉ — Décision fondateur Mai 2026
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

**Statut :** VALIDÉ — Décision fondateur Mai 2026
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

*(inchangé — voir V13)*

---

### D-019-B | Séparation souveraine des deux régimes de litige

*(inchangé — voir V13)*

---

## SCÉNARIOS ÉCONOMIQUES — V13

### SC-NO-SHOW-PRE | No-show pré-event après transfert échoué

*(inchangé — voir V13)*

---

### SC-DEPOSIT-FAIL | Échec Stripe sur deposit\_pending

*(inchangé — voir V13)*

---

### SC-08-PARTIEL | Résolution partielle de litige

*(inchangé — voir V13)*

---

## SCÉNARIOS ÉCONOMIQUES — V14

### SC-07-AMENDMENT | No-show talent + amendment sur un autre Engagement du même event

**Statut :** VALIDÉ — 20 mai 2026
**Déclencheur :** `no_show` sur Engagement A + `EngagementAmendment` sur Engagement B
**Précondition :** `event_sealed` atteint · coefficient de vente gravé dans ContractSnapshot phase 2
**Décision souveraine :** Les deux événements sont traités indépendamment dans cet ordre.
D-044 s'applique : les Engagements sont indépendants.

**Exemple de référence :**

Event multi-talent. Lineup signé total : 1 000$ (warmup 200$/h × 1h + headliner 800$/h × 2h).
Prix vendu : 1 500$. Coefficient : 1,5.

À `event_sealed` (WORM W2) :
- Warmup cachet\_brut\_final : 300$ (200$ × 1,5)
- Headliner cachet\_brut\_final : 1 200$ (800$ × 1,5)

**Scénario :** headliner absent. Warmup accepte d'étendre sa plage de 1h à 3h.

**Étape 1 — Traitement no-show headliner (D-041 + D-044 + CT-014) :**

```
cachet_net_headliner = 1 200$ − commission_MR_headliner
remboursement_organisateur = cachet_net_headliner

MR conserve commission_MR_headliner (service de mise en relation rendu)
Headliner = 0$ · ReputationLedger : NO_SHOW_CONFIRMED
```

**Étape 2 — EngagementAmendment warmup (D-147) :**

```
taux_horaire_implicite_warmup = 300$ / 60min × 60 = 300$/h
nouveau_cachet_brut_final_warmup = 300$/h × 3h = 900$
delta_cachet = 900$ − 300$ = 600$
delta_commission_MR = 600$ × taux_effectif_warmup
delta_talent_net = 600$ − delta_commission_MR

Facturation delta au payeur. LOI LEDGER-02 vérifiée.
```

**Résultat net organisateur :**
A payé 1 500$ pour un event de deux talents. Reçoit le service du warmup pendant 3h (valeur 900$)
au lieu du programme initial. Est remboursé le cachet\_net du headliner absent.

**Règle invariante :** Le no-show du headliner ne modifie pas le coefficient. Le coefficient a
été calculé à `event_sealed` sur le lineup complet — il est WORM W2 et ne se recalcule pas.

---

## DÉCISIONS FORMELLES — V14

### D-147 | EngagementAmendment — Extension de plage horaire sur accord mutuel

**Statut :** VALIDÉ — 20 mai 2026
**Bloc :** BLOC 1 — Ontologie du produit
**Complète :** D-041, D-044, D-013
**Distinct de :** Transfert (D-013 — changement de talent), No-show (D-041 — absence sans consentement)

**Phrase canonique :**

*"Un talent qui choisit de rester plus longtemps mérite d'être payé pour le temps réel qu'il passe.
Le contrat ne change pas — il s'étend. Le taux est le même. La durée est différente.
L'absent reste absent."*

**Contenu :**

Un `EngagementAmendment` de type `PLAGE_EXTENSION` modifie la durée d'un Engagement existant
en état `performed`, avec le consentement explicite du talent et de l'organisateur. Il ne
crée pas de nouvel Engagement. Le taux horaire implicite (dérivé du ContractSnapshot phase 2)
est invariant.

**Conditions :**

1. Engagement en état `performed`
2. Double consentement : talent + organisateur (actions explicites dans l'app)
3. Si admin sur place : AdminAction requise avec reasonCode
4. `newDurationMinutes > originalDurationMinutes` (extension, pas réduction)
5. `newDurationMinutes ≤ originalDurationMinutes + EngagementAmendmentPolicyConfig.maxExtensionMinutes`
6. Créé uniquement avant `event_completed` — la plage est figée après

**Formule :**

```
taux_horaire_implicite_cents = cachet_brut_final_cents (ContractSnapshot phase 2) / duree_signee_minutes × 60
nouveau_cachet_brut_final_cents = taux_horaire_implicite_cents × new_duration_minutes / 60
delta_cachet_cents = nouveau_cachet_brut_final_cents − cachet_brut_final_cents
delta_commission_mr_cents = floor(delta_cachet_cents × taux_effectif_snapshot_ppm / 1_000_000)
delta_talent_net_cents = delta_cachet_cents − delta_commission_mr_cents
```

**Invariants :**

- Le talent absent en no-show sur un autre Engagement du même event reste NO\_SHOW\_CONFIRMED
- L'amendment ne modifie pas le coefficient de vente (déjà WORM W2)
- LOI LEDGER-02 doit être vérifiée après application du delta
- L'amendment est append-only dans le FinancialLedger (pas de modification des écritures existantes)
- Un `EngagementAmendmentRecord` immuable est créé à la validation

**Objet `EngagementAmendment` :** voir section 2.7.2

**Configs concernées :** `EngagementAmendmentPolicyConfig`

**Décision sur le WORM :** `EngagementAmendment` ne viole pas EVENT\_SEALED (W2).
EVENT\_SEALED grave les montants du ContractSnapshot phase 2. L'amendment crée des entrées
ledger supplémentaires (delta) — il n'efface pas les entrées existantes. C'est un ajout
post-scellement avec consentement, pas une modification d'un enregistrement existant.
Conforme à WORM-APPEND-01 (append-only, pas de suppression).

---

### CT-014 | Clarification SC-07 multi-talent avec coefficient — base de calcul remboursement

**Statut :** VALIDÉ — 20 mai 2026
**Résout :** ZA-07 de l'audit constitutionnel du 19 mai 2026
**Complète :** D-041, D-044, D-049

**Contradiction résolue :**
D-041 dit "organisateur remboursé du cachet net talent". D-044 dit "Engagements indépendants".
Ni l'un ni l'autre ne précisait explicitement la base de calcul quand le coefficient > 1
et que le ContractSnapshot phase 2 diffère du phase 1.

**Décision :**

La base du remboursement organisateur pour un no-show est le **ContractSnapshot phase 2**
(WORM W2, gravé à `event_sealed`), pas le ContractSnapshot phase 1.

```
remboursement_organisateur = cachet_net_final = cachet_brut_final_i − commission_MR_i

où :
  cachet_brut_final_i = signed_price_cents × coefficient  (ContractSnapshot phase 2)
  commission_MR_i     = floor(cachet_brut_final_i × taux_effectif_snapshot_ppm / 1_000_000)
  cachet_net_final_i  = cachet_brut_final_i − commission_MR_i
```

**Justification :**
L'organisateur a accepté et payé le prix incluant le coefficient. Le cachet\_brut\_final est
ce pour quoi il a payé. C'est ce montant (net de commission) qu'il n'a pas reçu. C'est donc
ce montant qui lui est remboursé.

**Règle invariante (LOI NO-SHOW-01 précisée) :**
No-show confirmé = talent payé 0$, organisateur remboursé du **cachet\_net\_final** du talent
absent (ContractSnapshot phase 2), Micro Rave conserve sa commission sur ce talent.
Le no-show d'un talent ne modifie pas le coefficient ni les ContractSnapshots des autres talents.

---

## CHANGELOG

**V14 — 20 mai 2026 :**

D-147 — EngagementAmendment · Extension de plage horaire sur accord mutuel depuis `performed` ·
Objet `EngagementAmendment` · taux horaire implicite invariant (WORM W2) · double consentement
obligatoire · headliner absent reste NO\_SHOW\_CONFIRMED · section 2.7.2 ajoutée ·
SC-07-AMENDMENT ajouté · IDFactory préfixe AMD- · `EngagementAmendmentPolicyConfig`

CT-014 — Clarification LOI NO-SHOW-01 multi-talent avec coefficient · base remboursement =
ContractSnapshot phase 2 (cachet\_brut\_final\_i, WORM W2) · ZA-07 fermé · D-041 complété

**V13 — 19 mai 2026, 18:07 EST :**

D-019-A · D-019-B · contestation\_window · D-045 abrogé ·
SC-NO-SHOW-PRE · SC-DEPOSIT-FAIL · SC-08-PARTIEL

**V12 — Mai 2026 :**
D-014-A · D-014-B · balance\_pending retiré · payable non-WORM

**V11 — Mai 2026 :**
Q1/Q2/Q3 · table 2.7.1 corrigée · Pierre de Rosette

Fondateur : Frédérik Gélin — Montréal, 20 mai 2026
*"Une capacité culturelle locale devient un engagement de prestation vérifiable, puis un règlement économique, puis une mémoire territoriale."*