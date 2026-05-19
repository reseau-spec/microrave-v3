# **AUDIT CONSTITUTIONNEL ET ADVERSARIAL — MICRO RAVE V3**

**Auditeur :** Mode Procureur — Confrontation totale Registres (D-001 à D-146) ↔ OS V11 ↔ Cartes V4 ↔ Code V10.1  
 **Date :** 19 mai 2026  
 **Scope de départ obligatoire :** D-019 (Machine d'état / No-Show / Annulations) confronté au Ledger et à la réalité technique

---

## **I. CARTOGRAPHIE DES CONTRADICTIONS**

| ID | Risque | Catégorie | Preuve Chaînée | Conséquence |
| ----- | ----- | ----- | ----- | ----- |
| **AUD-01** | 🔴 Critique | **Dette Constitutionnelle** | D-014 liste 6 moments WORM officiels (ACCEPTED, DEPOSIT\_SECURED, EVENT\_SEALED, EVENT\_COMPLETED, SOTS\_WINDOW\_CLOSED, ARCHIVED). `payable` est **absent**. OS V11 l'ajoute unilatéralement dans `WORM_STATES` avec commentaire "protection pragmatique". Code V10.1 : `'payable': 'W1'`. Aucune décision D-0XX ne valide ce 7e moment WORM. | `payable` est WORM W1 dans le code sans mandat souverain. Toute tentative de modifier un Engagement en état `payable` déclenche un warning W1 institutionnellement non fondé. |
| **AUD-02** | 🔴 Critique | **Contradiction** | D-045 (SC-08) : *"Ouverture dispute : jusqu'à 24h après `event_completed`"*. OS V11 Q3 : *"litige accessible depuis TOUS les états actifs sans restriction"*. D-019 confirme : `sots_window_closed → disputed`. La fenêtre temporelle D-045 est donc incompatible avec Q3 : un organisateur peut-il ouvrir un litige à J-3 (état `deposit_secured`) ? La fenêtre de 24h post-`event_completed` s'applique-t-elle ou Q3 annule-t-elle cette contrainte ? Les deux règles sont souveraines et contradictoires. | Un litige ouvert depuis `proposed` (J-60) avant même le dépôt n'a pas de procédure EvidenceBundle viable. L'architecture de DisputeRecord suppose un event terminé. Juridiquement, geler des fonds non encore reçus est impossible. |
| **AUD-03** | 🔴 Critique | **Contradiction** | D-019 : `sots_window_closed → payable / disputed / no_show`. OS V11 section 4.2 résumé chemin : *"→ sots\_window\_closed → payable → settled"* (pas de `/disputed/no_show` dans ce résumé). OS V11 table 2.7.1 : n'inclut **pas** `sots_window_closed→payable` dans la table souveraine des guards. Le guard pour cette transition est `PresenceProofGuard` dans le code mais **absent de la table 2.7.1 de l'OS V11**. | La transition la plus critique du chemin nominal — le moment où les 11 conditions sont vérifiées et l'argent est libéré — n'a pas de guard documenté dans la table souveraine. |
| **AUD-04** | 🔴 Critique | **Loi Fantôme** | D-014 : 6 moments WORM, `balance_pending` **absent**. OS V11 V11 changelog : *"balance\_pending ajouté dans WORM\_STATES W1"*. Les Registres (D-001 à D-146) ne contiennent **aucune décision** numérotée ajoutant `balance_pending` aux moments WORM officiels. D-014 est une décision VALIDÉE. La modifier requiert une décision D-0XX. L'OS V11 a créé un moment WORM par annotation de changelog sans décision souveraine. | `balance_pending` est WORM W1 dans le code par fiat de l'OS, sans ratification dans les Registres. Si D-014 est la loi suprême, `balance_pending` n'est pas WORM officiellement. |
| **AUD-05** | 🔴 Critique | **Contradiction** | Carte V4\_02 : `event_completed → no_show [absent confirmé]`. D-019 : `event_completed → sots_window_closed` seulement — pas de `event_completed → no_show`. Code V10.1 : suit D-019, pas la carte. Mais la carte V4 est un document constitutionnel (hiérarchie de vérité niveau 3). La carte dit que le no-show est constaté **avant** la fenêtre SOTS. D-019 dit qu'il est constaté **après** (`sots_window_closed → no_show`). | Différence opérationnelle majeure : si le no-show est constaté avant SOTS, les notes SOTS ne sont pas soumises. Si après, la fenêtre SOTS s'écoule pour un event sans talent — qui note ? Les organisateurs déposent-ils un SOTS pour un no-show ? |
| **AUD-06** | 🔴 Critique | **Contradiction** | Carte V4\_02 : `no_show_pre_event → no_show` (arête présente). D-019 : `no_show_pre_event → archived` seulement. Code V10.1 : suit D-019. La carte dit que `no_show_pre_event` mène à `no_show` (impliquant un remboursement via `no_show → refunded → archived`). D-019 dit archivage direct. Les conséquences financières sont **radicalement différentes** : avec la carte, l'organisateur est remboursé (LOI NO-SHOW-01, D-041) ; avec D-019, il n'y a aucun remboursement documenté pour `no_show_pre_event → archived`. | Si un talent ne se présente pas après un transfert échoué et que l'acompte est sécurisé, D-019 archive sans rembourser. C'est financièrement injuste et non documenté dans le waterfall. Aucun SC (scénario) ne couvre `no_show_pre_event`. |
| **AUD-07** | 🔴 Critique | **Loi Fantôme** | Le code a `disputed→partially_settled`. D-019 (Registres) liste bien `disputed → payable / partially_settled / refunded`. Mais **aucun guard n'est documenté** pour `partially_settled` dans la table OS V11 section 2.7.1. Le guard `DisputeResolutionGuard` dans le code est une attribution tacite. La `SettlementInstruction` avec `deliveryRecognizedRatio` (D-045) suppose un calcul — mais qui le vérifie ? Aucun test P0 ne couvre `partially_settled`. | Un état financier critique (`partially_settled`) existe dans la machine d'état sans guard souverain documenté, sans test P0, et sans waterfall explicite. Le ledger pour ce cas est décrit conceptuellement (D-045) mais pas en écritures comptables (aucun SC pour la résolution partielle). |
| **AUD-08** | 🟠 Important | **Dérive** | Le code a `deposit_failed → archived`. D-019 liste `deposit_pending → deposit_failed`. Mais D-019 ne liste **pas** `deposit_failed → archived`. Aucune décision des Registres ne documente ce chemin terminal ni son waterfall financier. Si un paiement Stripe échoue (`deposit_failed`), que se passe-t-il avec les fonds partiellement capturés, les taxes déjà provisionnées, les SchedulerDueTasks créées ? | Un état créé par D-019 n'a pas de sortie documentée dans D-019. La machine d'état du code complète silencieusement ce vide. |
| **AUD-09** | 🟠 Important | **Choix Politique Implicite** | D-019 : `accepted → placed / cancelled_pre_deposit`. Carte V4\_02 : `placed → cancelled_pre_deposit` seulement — pas d'arête `accepted → cancelled_pre_deposit`. Le code suit D-019 (correct). Mais la carte dit que l'annulation sans frais n'est possible qu'après placement dans le Lineup. D-019 dit qu'elle est possible dès `accepted`. Question non tranchée : si annulation depuis `accepted`, a-t-on créé un ContractSnapshot phase 1 (WORM W1) ? Peut-on annuler un engagement WORM ? | Annuler depuis `accepted` signifie annuler un état WORM W1. Le WORMGuard du code émet un warning W1 — mais l'annulation passe quand même (W1 ne bloque pas). Cette permissivité n'est pas documentée comme règle. |
| **AUD-10** | 🟠 Important | **Dérive** | D-063 : *"Aucun `Math.round`, `Math.floor`, `Math.ceil` libre dans le code métier. Tous les calculs financiers passent par `MoneyMath`."* PLACEMENT-01.js (test P0) ligne 171 : `const expected = Math.floor(25000 * 200000 / 1_000_000)`. C'est un test, pas du code métier — mais c'est un test P0 qui valide la logique de `depositCents`. Si le guard réel utilise `MoneyMath` et le test utilise `Math.floor`, un écart d'arrondi entre les deux implémentations pourrait ne pas être détecté. | Un test P0 qui contourne D-063 crée une dérive : la règle d'arrondi souveraine n'est pas vérifiée par le test lui-même. |
| **AUD-11** | 🟠 Important | **Loi Fantôme** | Code V10.1 : `performed → payable` (payout urgence). OS V11 table 2.7.1 : présent avec note "SoloFounderOverride". D-106 valide le mécanisme SoloFounderOverride. Mais **aucune décision des Registres** ne liste explicitement `performed → payable` comme transition autorisée. D-019 ne la liste pas. La transition existe par héritage de l'OS V11, pas par décision D-0XX. | Une transition qui court-circuite les 11 conditions de payout (D-075) n'est pas dans les Registres. Elle bypass `event_completed`, `sots_window_closed`, et SOTS Condition 7\. |
| **AUD-12** | 🟠 Important | **Dérive** | D-045 dit : fenêtre d'ouverture dispute \= "jusqu'à 24h après `event_completed`". Le code V10.1 a `sots_window_closed → disputed` (conforme à D-019). Mais D-019 et D-045 créent ensemble un conflit : si la fenêtre de 24h est mesurée depuis `event_completed`, et que `sots_window_closed` survient 24h après, alors ouvrir une dispute depuis `sots_window_closed` est **hors fenêtre**. L'état `disputed` devient inaccessible au moment précis où D-019 dit qu'il est accessible. | Deadlock institutionnel : à `sots_window_closed`, la fenêtre de dispute (D-045) est expirée, mais D-019 autorise la transition. Deux règles souveraines simultanément applicables produisent un résultat impossible. |
| **AUD-13** | 🟡 Mineur | **Dérive** | D-041 (LOI NO-SHOW-01) : *"organisateur remboursé du cachet net talent"*. Aucune décision ne précise si ce remboursement s'applique quand l'event est multi-talent et qu'un seul talent est absent. D-044 dit *"chaque Engagement traité indépendamment"*. Mais si le coefficient de vente a rehaussé tous les cachets, le remboursement du cachet net du talent absent est-il calculé sur `cachet_brut_signé × coefficient` ou sur `cachet_brut_signé` (coefficient \= 1 par défaut no-show) ? | Ambiguïté financière : le montant remboursé à l'organisateur peut différer selon l'interprétation choisie. |
| **AUD-14** | 🟡 Mineur | **Dérive** | D-039 (SC-05, `cancelled_J30`) : waterfall documenté avec comptes 4320, 4410, 4420 reversals. D-019 : `cancelled_J30 → archived` directement. Aucun SC ledger n'existe pour les annulations `cancelled_pre_deposit` et `cancelled_J7` vers `archived` direct. Seuls SC-05 (J-30) et SC-06 (J-7 balance) ont des écritures comptables documentées. `cancelled_pre_deposit → archived` est dans le code mais son waterfall ledger est **inexistant** dans les Registres. | Sans SC pour `cancelled_pre_deposit`, le comportement du ledger est une loi fantôme — il sera inventé par le développeur. |

---

## **II. ANALYSE DES POINTS DE NON-RETOUR**

### **Inventaire des irréversibilités**

**ACCEPTED (W1) — Légitimité : SOUVERAINE** D-014 Moment 1, validé. Ce qui devient immuable : cachet brut, tier, taux, historique négociation. Verrouillage justifié.

**DEPOSIT\_SECURED (W1) — Légitimité : SOUVERAINE** D-014 Moment 2, validé. Liaison contractuelle des parties. Verrouillage justifié.

**BALANCE\_PENDING (W1) — Légitimité : NON SOUVERAINE ⚠️** D-014 ne liste pas ce moment. OS V11 changelog l'ajoute par annotation. Aucune décision D-0XX ne le ratifie. C'est un verrouillage institué par l'OS V11 sans mandat des Registres. Catégorie : **CRITICITÉ MAJEURE** — irréversibilité non souveraine.

**EVENT\_SEALED (W2) — Légitimité : SOUVERAINE** D-014 Moment 3, validé. WORM financier complet. ContractSnapshot phase 2\. Verrouillage justifié et le plus fort après ARCHIVED.

**EVENT\_COMPLETED (W1) — Légitimité : SOUVERAINE** D-014 Moment 4, validé. Ouverture fenêtre SOTS.

**SOTS\_WINDOW\_CLOSED (W1) — Légitimité : SOUVERAINE** D-014 Moment 5, validé. WORM réputationnel.

**PAYABLE (W1) — Légitimité : NON SOUVERAINE ⚠️** Absent de D-014. Code commente "protection pragmatique". Aucune décision D-0XX. C'est le second verrouillage non souverain. **CRITICITÉ MAJEURE.**

**ARCHIVED (W3) — Légitimité : SOUVERAINE** D-014 Moment 6, validé. Irréversibilité architecturale totale.

**CONTRACTED\_SNAPSHOT Phase 1 à ACCEPTED — Légitimité : SOUVERAINE** D-035. WORM immédiat à `accepted`. Justifié.

**CONTRACTED\_SNAPSHOT Phase 2 à EVENT\_SEALED — Légitimité : SOUVERAINE** D-035. WORM complémentaire. Justifié.

---

## **III. ZONE D'OMBRE & DÉCISIONS REQUISES**

Les zones ci-dessous sont soit silencieuses, soit ambiguës dans les Registres. Chacune est un terrain fertile pour une loi fantôme.

**ZA-01 — Waterfall `no_show_pre_event → archived`** D-019 stipule ce chemin. Aucun SC comptable. Si l'acompte est reçu (`deposit_secured`) et que le transfert échoue → `no_show_pre_event → archived`, qu'advient-il des fonds ? Sont-ils restitués à l'organisateur ? Conservés par MR ? Distribués aux autres talents du Lineup ? **Décision urgente requise.**

**ZA-02 — Waterfall `deposit_failed → archived`** D-019 crée l'état `deposit_failed`. Aucun SC. Si Stripe échoue partiellement (pré-autorisation capturée), les comptes 5200/4190 sont-ils déjà crédités ? Le reversal est-il automatique ? **Décision urgente requise.**

**ZA-03 — Waterfall `cancelled_pre_deposit → archived`** D-039 (SC-05) couvre `cancelled_J30`. Rien pour `cancelled_pre_deposit`. Aucun argent n'a été reçu — donc pas de remboursement. Mais les taxes provisionnées ? Les `SchedulerDueTasks` créées lors du `placed` ? **Décision de clarification requise.**

**ZA-04 — `partially_settled` : waterfall, guard, test P0** D-019 et D-045 mentionnent `partially_settled`. Aucun guard documenté dans OS V11 table 2.7.1. Aucun SC comptable avec `deliveryRecognizedRatio`. Aucun test P0. C'est un état financier dont le ledger sera inventé au moment de l'implémentation. **Décision urgente requise.**

**ZA-05 — Fenêtre temporelle de dispute : Q3 vs D-045** Q3 dit "tous états actifs, sans restriction". D-045 dit "24h après `event_completed`". Ces deux règles sont souveraines et incompatibles. Il faut trancher : Q3 annule-t-il la fenêtre temporelle de D-045, ou la fenêtre s'applique-t-elle uniquement aux disputes de type "post-event" ? **Décision architecturale urgente.**

**ZA-06 — Ratification de `balance_pending` et `payable` dans D-014** Si la souveraineté des Registres est absolue, il faut émettre une décision D-0XX (D-147 ou amendement D-014-A) ratifiant officiellement ces deux états WORM. L'OS V11 ne peut pas amender D-014 unilatéralement. **Décision formelle requise.**

**ZA-07 — No-show coefficient** D-044 : Engagements indépendants. D-041 : remboursement sur cachet net talent. Si coefficient \> 1, le cachet net remboursé est-il sur le `cachet_brut_final` (rehaussé) ou sur le `cachet_brut_signé` (base) ? La règle est silencieuse. **Décision requise avant implémentation SC-07 multi-talent.**

**ZA-08 — SOTS sur no-show** D-019 : `sots_window_closed → no_show`. La fenêtre SOTS s'est écoulée — mais le talent était absent. Les SOTSSubmissions des spectateurs comptent-elles pour un no-show confirmé ? L'organisateur soumet-il un SOTS ? La Condition 7 du payout (SOTSSubmission requis) est-elle contournée ou maintenue pour l'organisateur qui demande le remboursement ? **Ambiguïté opérationnelle.**

**ZA-09 — A-056 et A-057 (ouvertes)** `maxDistancePolicy` et `minDurationPolicy` sont des paramètres ouverts dans les Registres. Les Conditions 4 et 5 des 11 conditions de payout (D-075) dépendent entièrement de valeurs non définies. Tout payout automatique est aujourd'hui impossible à valider formellement. **Décision de valeurs requise.**

**ZA-10 — `performed → payable` sans D-0XX** Cette transition court-circuite `event_completed`, `sots_window_closed`, SOTS (Condition 7), et la fenêtre dispute. Elle bypass 4 des 11 conditions. Elle n'apparaît ni dans D-019 ni dans D-014. Son existence repose uniquement sur OS V11. **Décision souveraine requise ou suppression.**

---

## **IV. ANALYSE DES EFFETS ÉMERGENTS**

### **Effet 1 — Le Deadlock SOTS/Dispute (AUD-12 amplifié)**

Trois règles légitimes combinées produisent un état impossible :

**Règle A (D-045)** : fenêtre dispute \= 24h après `event_completed`  
 **Règle B (D-019)** : `sots_window_closed → disputed` autorisé  
 **Règle C (D-014)** : `event_completed → sots_window_closed` \= 24h écoulées

Résultat : au moment exact où `sots_window_closed` devient accessible, la fenêtre de 24h de D-045 est **expirée**. La transition `sots_window_closed → disputed` est structurellement morte. Un organisateur qui attend la fin de la fenêtre SOTS pour rassembler ses preuves ne peut plus ouvrir de dispute. Ce n'est pas un edge-case — c'est le timing normal du système.

### **Effet 2 — La Cascade de Réputation Irréversible pour le no-show pré-event**

Un talent demande un transfert (légitimement, D-013). Le transfert échoue (`transfer_requested → no_show_pre_event`). La réputation de Talent A est affectée (D-013 : *"Réputation de Talent A affectée"*). L'engagement va `archived`. Mais :

* Aucun `NO_SHOW_CONFIRMED` n'est documenté pour ce cas (D-072 ne distingue pas)  
* Aucun `DecisionRecord` n'est requis (pas de SC documenté)  
* La réputation est dégradée sans procédure arbitrale  
* Il n'y a pas de `NO_SHOW_CONTESTED` possible si le talent conteste la raison du transfert échoué

C'est une **accumulation irréversible de dette réputationnelle sans due process**. Le talent peut être pénalisé pour une situation systémique (personne de disponible pour remplacer) sans recours documenté.

### **Effet 3 — Le Verrouillage Systémique `isSelfOrganized`**

Condition 6 du payout : validée par l'organisateur OU expiration du délai. Exception `isSelfOrganized` : délai uniquement. Si le talent est aussi l'organisateur et que le `SessionPresence` est contesté par un tiers (SafetyReport), la Condition 9 bloque le payout. La Condition 6 ne peut pas être satisfaite activement (même personne). Le délai s'écoule. Si le `SafetyReport` n'est pas résolu avant l'expiration du délai d'appel : **le payout est bloqué définitivement** pour un événement dont les fonds sont en `event_sealed` (W2). Il n'y a aucun chemin documenté pour débloquer ce cas.

### **Effet 4 — L'Asymétrie SOTS/Payout pour le talent à SOTS élevé**

Un talent avec un score SOTS excellent a un `multiplier_ppm < 1_000_000` (commission réduite, D-080). Son cachet net est donc plus élevé. Simultanément, la Condition 7 du payout exige que ce même talent soumette son propre SOTSSubmission. Si le talent refuse de soumettre un SOTS (Condition 7 non remplie), il bloque **son propre payout**. Il n'y a aucun mécanisme documenté pour forcer ou substituer la soumission SOTS du talent. Le talent peut théoriquement choisir de ne pas être payé pour contester le système — situation absurde mais architecturalement possible.

### **Effet 5 — La Boucle de Pouvoir `SoloFounderOverride` \+ `performed → payable`**

`performed → payable` (AUD-11) bypasse les 11 conditions. D-106 autorise `SoloFounderOverride`. La transition `performed → payable` n'est dans aucun Registre. Le fondateur peut donc déclencher un payout sans :

* Preuve de présence (Conditions 3-6)  
* SOTSSubmission (Condition 7\)  
* Vérification de litige ouvert (Condition 8\)  
* Ledger invariant (Condition 10\)

Ce n'est pas une critique de D-106 en soi — `SoloFounderOverride` est documenté avec traces obligatoires. Mais la transition `performed → payable` **sans décision souveraine** permet une route de payout non ratifiée. D-106 rend l'exception traçable ; l'absence de décision rend la route elle-même illégitime.

### **Effet 6 — L'Accumulation de Dette Réputationnelle pour le Transfert Légitime**

D-013 : seuil de cancellations déraisonnables \< 72h. Un talent peut légitimement transférer son engagement 5 jours avant l'event. Si le nouveau talent est accepté (`transfer_accepted → placed`), l'histoire est tracée. Mais que trace-t-on exactement ? Si Talent A transfère 5 fois dans l'année (tous légitimes), l'EMA (D-081) intègre-t-elle les transferts ? Le `ReputationLedger` enregistre-t-il des transferts légitimes comme signal négatif ? Il n'y a aucune décision distinguant "transfert légitime" et "comportement problématique" dans le système de réputation.

---

## **V. VERDICT DE LOYAUTÉ INSTITUTIONNELLE**

### **Note : 6,5 / 10**

Le système est structurellement loyal à sa vision sur les éléments fondamentaux — le waterfall financier (D-049, D-038), la doctrine WORM sur les 6 moments officiels, la LOI TRANSITION-01, et les décisions Q1/Q2/Q3 qui ont été correctement propagées dans le code.

Mais trois fractures de loyauté de fond interdisent une note plus haute :

**Fracture 1 — Deux verrouillages WORM non souverains.** `balance_pending` et `payable` sont dans `WORM_STATES` du code sans décision D-0XX. D-014 est la loi suprême sur les moments WORM. La modifier par annotation de changelog OS V11 sans décision formelle est exactement le type de dérive que ce système est censé prévenir.

**Fracture 2 — La contradiction Q3 × D-045 est une bombe à retardement.** Ces deux règles sont souveraines, en vigueur simultanément, et produisent ensemble un deadlock opérationnel. Le fondateur a ratifié Q3. Le fondateur a ratifié D-045. Personne n'a vu la contradiction. Elle sera découverte en production, lors du premier litige post-SOTS.

**Fracture 3 — Cinq états financiers sans waterfall.** `no_show_pre_event → archived`, `deposit_failed → archived`, `cancelled_pre_deposit → archived`, `partially_settled`, et le no-show multi-talent avec coefficient sont dans le code mais leurs conséquences comptables sont inexistantes dans les Registres. Un développeur devra inventer ces règles. Chaque invention est une loi fantôme.

Le système a créé une infrastructure juridique et architecturale rigoureuse — et a laissé des trous précisément dans les chemins d'exception où les litiges réels se produiront.

