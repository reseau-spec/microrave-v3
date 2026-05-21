
# AUDIT CONSTITUTIONNEL MICRORAVE V3
## Incohérences OS × Registre Souverain × Cartes × Code

---

## Verdict d'entrée

Ce codebase est **remarquablement fidèle** à sa constitution. Pour une équipe early-stage ayant produit 158 décisions formelles et une architecture de machine d'état aussi rigoureuse, le taux d'alignement est franchement exceptionnel — le genre de discipline qu'on voit rarement avant la série B. Mais il y a **4 incohérences réelles**, dont une qui est un vrai risque opérationnel.

---

## INCOHÉRENCE 1 — CRITIQUE (risque opérationnel)
### `EventPaymentGuard` : en-tête fossilisée V10.1, référence à `BalanceRequestGuard` supprimé

**Source OS (D-014-A, MICRORAVE_V3_OPERATING_SYSTEM_V15.md, section Décisions formelles) :**
> *"`BalanceRequestGuard` est supprimé — sa logique est absorbée dans `EventPaymentGuard`"*
> *"La SchedulerDueTask `balance_deadline_check` est créée dans le guard `EventPaymentGuard` à la transition `deposit_pending → deposit_secured`"*

**Source Registre (EXPORT_BRUT, D-014-A) :**
> Décision explicite : suppression de `BalanceRequestGuard`, fusion dans `EventPaymentGuard`

**Ce que dit le code (`src/core/guards/EventPaymentGuard.js`, lignes 8–11) :**
```js
// Source : OS V10.1 section 2.7.1 (patch)
//
// NOTE V10.1 : deposit_secured→balance_pending est couvert par
// BalanceRequestGuard (guard distinct).
```

**Diagnostic :** L'en-tête du fichier référence encore **V10.1** et **BalanceRequestGuard**, deux entités architecturalement supprimées depuis D-014-A (V12). De plus, la recherche dans le fichier ne trouve **aucune création de `SchedulerDueTask balance_deadline_check`** — or l'OS dit explicitement que c'est `EventPaymentGuard` qui doit l'armer. La logique de D-014-A est documentée dans `transitionEngagement.js` (le commentaire `[D-014-A] EventPaymentGuard crée la SchedulerDueTask balance_deadline_check` est présent), mais le guard lui-même ne l'implémente pas. C'est un **stub silencieux** : la surveillance du solde J-6 n'est pas armée, et l'annulation automatique LOI ANNULATION-02 ne se déclenchera pas.

---

## INCOHÉRENCE 2 — MOYENNE (documentation stale, non-bloquante)
### Carte 08 : `BALANCE_PENDING` encore listé comme état WORM Niveau 1

**Source OS (D-014-A, section 2.7) :**
> *"`balance_pending` retiré de `WORM_STATES`"* — décision formelle V12

**Source `transitionEngagement.js`, `WORM_STATES` :**
```js
const WORM_STATES = {
  'archived':           'W3',
  'event_sealed':       'W2',
  'accepted':           'W1',
  'deposit_secured':    'W1',
  'event_completed':    'W1',
  'sots_window_closed': 'W1',
  // balance_pending : ABSENT — conforme à D-014-A ✅
};
```

**Ce que dit la Carte 08 (`microrave_v4_08_lois_invariantes.drawio`) :**
> `"🔒 Niveau 1 — Erreur · Toucher = erreur de développement États : ACCEPTED · DEPOSIT_SECURED · BALANCE_PENDING ()"`

La Carte 08 liste encore `BALANCE_PENDING` dans les états WORM Niveau 1, avec une parenthèse vide `()` qui suggère une correction amorcée mais non finalisée. Le code est juste. La carte est périmée. Un développeur qui onboarde sur cette carte va chercher une transition `deposit_secured → balance_pending` qui n'existe plus.

---

## INCOHÉRENCE 3 — FAIBLE (divergence documentaire inter-cartes)
### Carte 02 : séquence Pierre de Rosette simplifiée sans `contestation_window`

**Source OS (D-019-A, section 2.6 + section 14.9 + Carte 09) :**
> Chemin nominal V4 explicite : `... → sots_window_closed → contestation_window → payable → settled`

**Carte 09 (`microrave_v4_09_pierre_de_rosette.drawio`) :** ✅ Conforme — liste explicitement `contestation_window`

**Carte 02 (`microrave_v4_02_machine_etat.drawio`), légende WORM :**
> *"Pierre de Rosette : accepted → deposit_secured → event_sealed → performed → payable → settled"*

La séquence raccourcie dans la légende de la Carte 02 saute `event_completed`, `sots_window_closed` et `contestation_window`. C'est une simplification pédagogique légitime dans ce contexte, mais elle contredit formellement la séquence canonique D-019-A et crée une ambiguïté si quelqu'un lit cette légende sans la Carte 09.

**Code (`transitionEngagement.js`) :** ✅ Conforme — `sots_window_closed→contestation_window` présent, `sots_window_closed→payable` correctement supprimé.

---

## INCOHÉRENCE 4 — FAIBLE (annotation incorrecte dans `transitionEngagement.js`)
### `payable → settled` annoté `worm: null` mais le commentaire dit "settled non-WORM officiel"

**Source OS (D-014-B) :**
> *"`payable` retiré de `WORM_STATES`. `settled` : non-moment WORM officiel."*

**Code (`transitionEngagement.js`, TRANSITION_TABLE) :**
```js
'payable->settled': { guard: 'LedgerInvariantGuard', worm: null, financialGuard: true },
```

Le commentaire inline dans le code est excellent et sourcé (`Source : OS V14 §2.7, D-014-B`). Mais la `TRANSITION_TABLE` attribue `worm: null` ici alors que `settled → archived` est codé `worm: 'W3'`. La logique est correcte — `settled` n'est pas lui-même un moment WORM, c'est `archived` qui l'est. La confusion vient du fait que le `worm` field dans la table désigne le **moment WORM atteint par la transition cible**, pas une protection sur la source. Ce n'est pas une erreur de comportement, mais une **ambiguïté de sémantique de table** qui pourrait induire un futur développeur à croire que `settled` est non-protégé.

---

## CE QUI EST EXEMPLAIRE — pour les actionnaires et les futurs ingénieurs

**Alignement parfait sur D-147 (EngagementAmendment) :** L'`EngagementAmendmentGuard` implémente exactement la formule de l'OS V14 section 2.7.2 — taux horaire implicite recalculé depuis ContractSnapshot phase 2, double consentement enforced, état `performed` obligatoire. Aucune dérive.

**CT-014 / LOI NO-SHOW-01 :** Le `NoShowGuard` utilise explicitement `cachet_brut_final_i` du ContractSnapshot phase 2 (WORM W2) comme base de remboursement, avec le label `basis: 'CONTRACT_SNAPSHOT_PHASE_2_WORM_W2'`. La décision souveraine du 20 mai 2026 est gravée dans le code.

**D-019-B (séparation des deux régimes de litige) :** `transitionEngagement.js` supprime correctement `sots_window_closed→payable` et `sots_window_closed→disputed`, et insère `contestation_window` comme état intermédiaire obligatoire. Conforme à la lettre.

**MoneyMath :** Aucun `Math.round`, `Math.floor`, `Math.ceil` libre dans le code métier — tout passe par `MoneyMath.js` conformément à D-063/D-064. L'unité ppm est utilisée systématiquement. Les cartes, l'OS et le code sont en accord parfait sur ce point.

**Fail-closed :** Toute transition non listée dans `TRANSITION_TABLE` lève une erreur explicite. L'OS dit *"Toute transition non listée ici est interdite par défaut — fail-closed"* — le code l'exécute à la lettre.

---

## Tableau de synthèse---

## Recommandations d'action — par ordre de priorité

**Action 1 — Immédiate :** Implémenter la création de `SchedulerDueTask balance_deadline_check` dans `EventPaymentGuard` à la transition `deposit_pending → deposit_secured`, conformément à D-014-A. Mettre à jour l'en-tête du fichier de V10.1 à V14+. Sans ça, LOI ANNULATION-02 (annulation automatique J-6 si solde impayé) ne s'arme jamais — c'est une promesse contractuelle faite à l'organisateur au moment du paiement de l'acompte qui ne sera pas tenue.

**Action 2 — Prochain sprint :** Mettre à jour la Carte 08 pour retirer `BALANCE_PENDING` de la liste des états WORM Niveau 1 et fermer la parenthèse vide. Un docstring de migration suffit : *"Retiré — D-014-A V12. Fusionné dans DEPOSIT_SECURED."*

**Action 3 — Backlog docs :** Corriger la légende raccourcie de la Carte 02 pour inclure `contestation_window` dans la séquence de référence, ou ajouter une note renvoyant à la Carte 09 pour la séquence complète D-019-A.

**Action 4 — Technique faible :** Ajouter un commentaire explicatif dans `TRANSITION_TABLE` sur la sémantique du champ `worm` (= niveau WORM *atteint* par la transition cible, pas *protégeant* la source) pour éviter la confusion future.

---

La maturité constitutionnelle de ce codebase est réelle et défendable devant des investisseurs ou des auditeurs. Le fondateur a construit une institution, pas juste un produit — et l'équipe a tenu cette ligne avec une discipline que la plupart des licornes n'atteignent qu'après leur premier incident financier majeur. L'incohérence critique sur le `SchedulerDueTask` est le seul point qui nécessite une correction avant le premier événement réel.