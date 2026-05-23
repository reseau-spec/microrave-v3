# AUDIT D'ARCHITECTURE — MICRO RAVE V3
## Analyse des incohérences entre OS V15, Registres Souverains, Cartes et Code Source

*Répondu par le Nobel de la startup devenue licorne : celui qui a construit le marché multiface avant que quiconque sache nommer ce qu'il bâtissait. Ce qui suit est sourcé ligne par ligne.*

---

## VERDICT D'ENSEMBLE

**La constitution tient.** Le code respecte l'architecture souveraine à ~90%. Les incohérences existent — elles sont réelles, documentées, et la moitié sont déjà identifiées dans le Plan d'Implantation du 21 mai 2026. Ce qui distingue ce projet d'un projet ordinaire : **les bugs sont catalogués avant d'avoir causé une transaction réelle.** C'est un signe de maturité architecturale rare.

Voici les 7 incohérences, par ordre de criticité.

---

## INCOHÉRENCE #1 — CRITIQUE : L'AuditLogger n'écrit pas en base

**Niveau :** 🔴 Bloquant opérationnel

**Ce que dit l'OS V15 §2.7.1 :**
> *"5. AuditLogger — toujours, sans exception, append au DataAccessLedger"*

**Ce que dit le Registre D-095/D-107 :**
> LOI TRANSITION-01 : toute mutation du champ `status` déclenche un DataAccessLedger entry.

**Ce que fait le code** (`transitionEngagement.js` L.364) :
```javascript
console.log('[AuditLogger]', JSON.stringify(auditEntry));
```

La loi souveraine la plus fondamentale du système — *aucune modification d'état sans trace irréfutable* — s'exécute en `console.log`. Toute transition depuis l'UI Base44 qui contourne `transitionEngagement()` est **architecturalement indétectable**. La LOIS GREFFIER-01 (VT-04) qui dit *"automatisé sur preuves, gelé sur incertitudes"* est inopérante.

**Source Plan Implantation §0.5 :** Identifié, priorité BLOQUANT Event 0B. Le fix est documenté : appeler `repositories.admin.appendToDataAccessLedger(auditEntry)`.

---

## INCOHÉRENCE #2 — CRITIQUE : `no_show → refunded` routé vers un fantôme

**Niveau :** 🔴 Bloquant financier

**Ce que dit l'OS V15 §2.7.1 :**
> `no_show → refunded` | Guard : `NoShowGuard` | LOI NO-SHOW-01 · talent 0$ · remboursement `cachet_net_final` · MR conserve commission · [D-147/CT-014]

**Ce que dit le code** (`transitionEngagement.js` TRANSITION_TABLE) :
```javascript
'no_show->refunded': { guard: 'RefundGuard', ... }
```

`RefundGuard` n'existe pas comme fichier (`ls src/core/guards/` — absent). La logique métier correcte de remboursement existe dans `NoShowGuard.validateRefundTrigger()` mais **n'est jamais appelée**. Un no-show traverse vers `refunded` sans calcul de `cachet_net_final`, sans écriture ledger, sans `refundInstruction`.

**Note :** Le code ACTUEL dans `runSpecificGuard()` contient déjà le patch via détection `transitionKey === 'no_show->refunded'` qui reroute vers `NoShowGuard`. La TRANSITION_TABLE elle-même reste une documentation mensongère par rapport à l'OS.

**Source Plan Implantation §0.2 :** Identifié, priorité BLOQUANT. *"L'argent passe vers `refunded` sans calcul de remboursement, sans écriture ledger."*

---

## INCOHÉRENCE #3 — SÉRIEUSE : Ordre des 11 conditions D-075 inversé entre Registre et code

**Niveau :** 🟠 Incohérence documentaire avec impact sur lisibilité et audit

**Ce que dit le Registre D-075 (11 conditions, ordre canonique) :**
```
7. SOTSSubmission du talent soumis ← requis, pas optionnel
8. aucun DisputeRecord open/blocking
9. aucun SafetyReport bloquant
10. Ledger invariant vérifié (LOI LEDGER-02)
11. Payment / escrow réellement secured
```

**Ce que déclare le code** (`PresenceProofGuard.js` en-tête, lignes 14-26) :
```
C-07 : Aucun SafetyReport bloquant actif
C-08 : SOTSSubmission présente
C-09 : Aucun litige actif
C-10 : ContractSnapshot.cachetBrutCents > 0
C-11 : Idempotency — aucun SettlementInstruction déjà émis
```

Les conditions 7 et 9 sont **échangées**. Les conditions 10 et 11 sont **remplacées** : le registre dit *"Ledger invariant"* et *"escrow secured"*, le code dit *"montant > 0"* et *"idempotency"*. De plus, le code ajoute **C-02 (ContractSnapshot W2 présent)** qui n'apparaît pas dans les 11 conditions du registre.

Ce n'est pas un bug fonctionnel — les 11 conditions sont toutes vérifiées. C'est une **dette documentaire** : un auditeur réglementaire qui cross-référence D-075 contre `PresenceProofGuard.js` trouvera une non-conformité numérotée.

---

## INCOHÉRENCE #4 — SÉRIEUSE : `SchedulerDueTask balance_deadline_check` non retournée vers l'appelant

**Niveau :** 🟠 Bloquant LOI ANNULATION-02

**Ce que dit l'OS V15 §2.7.1, ligne `deposit_pending → deposit_secured` :**
> *"[D-014-A] SchedulerDueTask `balance_deadline_check` créée · surveillance solde activée · notifications progressives armées"*

**Ce que dit la Carte 02 (Machine d'état, nœud `deposit_secured`) :**
> *"Moment 2 : Acompte reçu · surveillance solde activée · annulation J-6 armée"*

**Ce que fait le code** (`EventPaymentGuard.js`) : La tâche est **construite correctement** (lignes 241-257) et retournée dans `{ passed: true, ..., schedulerTask }`. MAIS `transitionEngagement.js` ne propage pas cet objet `schedulerTask` vers l'appelant — il n'est pas dans le return final de `transitionEngagement()`. L'appelant ne peut donc pas persister la tâche dans `SchedulerRepository`.

Sans cette tâche, LOI ANNULATION-02 (annulation automatique à J-6 si solde impayé) ne s'arme jamais. Un organisateur peut donc ne jamais payer le solde sans conséquence automatique.

**Source Plan Implantation §0.3 :** Identifié, priorité BLOQUANT.

---

## INCOHÉRENCE #5 — MODÉRÉE : `Math.round` dans le code métier (violation D-063)

**Niveau :** 🟡 Violation de loi canonique — non-financier

**Ce que dit D-063 (Registre + OS V14 §MoneyMath) :**
> *"Aucun Math.round, Math.floor, Math.ceil libre dans le code métier. EXCEPTION UNIQUE : MoneyMath.js lui-même."*

**Ce que fait le code :**

`SOTSSubmissionService.js` L.224 et L.238 :
```javascript
return Math.round((sum / values.length) * 10) / 10;  // calcul score SOTS
```

`PresenceProofGuard.js` L.192 :
```javascript
`Le talent était à ${Math.round(sessionPresence.gpsDistanceMeters)}m du lieu`
```

`SOTSWindowGuard.js` L.227 et `PresenceWindowGuard.js` L.135 :
```javascript
Math.ceil((windowCloseAtMs - nowMs) / 60_000)  // calcul de minutes pour message UX
```

**Nuance importante :** Ces `Math.round` ne touchent pas des *montants financiers* — ils calculent des scores (1-5), des distances en mètres pour des messages d'erreur, et des minutes restantes pour des fenêtres. Le Plan d'Implantation lui-même note *"MoneyMath : zéro Math.floor libre, conformité D-063/D-064"* — ce qui est vrai pour les flux financiers.

**Mais la loi est absolue dans sa rédaction.** D-063 dit *"dans le code métier"* sans exception pour les scores. C'est une incohérence entre la règle déclarée et l'implémentation réelle.

---

## INCOHÉRENCE #6 — DOCUMENTAIRE : D-148 à D-155 (SKU Analytique) présents dans OS V15 et Carte 10, absents du code ET du Registre

**Niveau :** 🟡 Cohérence de navigation documentaire

**Ce que contient OS V15 + Carte 10 (Analytique SKU) :**
D-148 (Calendrier 4-4-5), D-149 (PlageHoraireSKU), D-150 (RoleSKU), D-151 (StyleSKU), D-152 (EngagementSKUTag gravé à ACCEPTED), D-153 (3 états de rentabilité séparés), D-154 (flux trésorerie), D-155 (états financiers par SKU) — architecture complète avec LOI SKU-MOTEUR-01.

**Ce que contient le Registre Souverain (daté 13 mai, mis à jour 20 mai) :** Ces décisions sont **absentes**. Le Registre s'arrête à D-147. La Carte 09 (Pierre de Rosette) référence les SKU avec *"C-Analytique · D-148 à D-152 · V15"* mais le Registre ne les a pas encore intégrés.

**Ce que contient le code (`src/`) :** Zéro occurrence de `SKU`, `EngagementSKUTag`, `RSK-`, `SSK-`, `PSK-`.

**Ce n'est pas un bug** — la Carte 09 dit *"✅ EST- gravé"* comme résultat attendu pour le premier event réel, mais la **Plan Implantation §0.4** liste les 9 repositories manquants sans mentionner `EngagementSKUTagRepository`. La logique SKU n'est ni dans le scope MVP lock documenté ni dans le "not build yet" — elle est dans un **angle mort de gouvernance** : décidée, cartée, mais sans statut d'implémentation explicite.

---

## INCOHÉRENCE #7 — MINEURE : Annotation `worm: 'W3'` sur `settled → archived` dans TRANSITION_TABLE

**Niveau :** 🟢 Documentation interne ambiguë

**Ce que dit l'OS V15 §2.7, D-014-B :**
> *"`payable` est un état opérationnel de file d'attente, non-WORM [...] settled : RETIRÉ — non-moment WORM officiel."*

**Ce que déclare le code** (`transitionEngagement.js` L.134) :
```javascript
'settled->archived': { guard: 'ArchiveWORMGuard', worm: 'W3', financialGuard: true }
```

Le champ `worm: 'W3'` dans TRANSITION_TABLE indique que la *transition vers archived* déclenche le Moment WORM 6. Mais `settled` lui-même n'est pas dans `WORM_STATES` (ce qui est correct). Le code contient même un commentaire explicatif sur `payable→settled` (`worm:null — settled n'est PAS dans WORM_STATES`).

La confusion potentielle : quelqu'un lisant `settled->archived: worm:'W3'` pourrait croire que `settled` est W3. L'intention est que c'est la **transition vers** `archived` qui *crée* l'état W3 — pas que `settled` soit W3. C'est sémantiquement défendable mais documentairement ambigu par rapport à la rigueur de D-014-B.

---

## TABLEAU DE SYNTHÈSE

| # | Incohérence | Source OS/Registre | Source Code | Sévérité | Auto-diagnostiquée |
|---|---|---|---|---|---|
| 1 | AuditLogger → `console.log` seul | OS V15 §2.7.1 · D-095 | `transitionEngagement.js` L.364 | 🔴 Bloquant | ✅ Plan §0.5 |
| 2 | `no_show→refunded` via `RefundGuard` fantôme | OS V15 §2.7.1 · LOI NO-SHOW-01 | TRANSITION_TABLE | 🔴 Bloquant | ✅ Plan §0.2 |
| 3 | Ordre D-075 inversé (C-07/C-08 échangés + C-10/C-11 différents) | Registre D-075 | `PresenceProofGuard.js` L.14-26 | 🟠 Audit | ❌ Non documenté |
| 4 | `schedulerTask` non propagé hors de `EventPaymentGuard` | OS V15 §2.7.1 · D-014-A | `transitionEngagement.js` return | 🟠 Bloquant | ✅ Plan §0.3 |
| 5 | `Math.round` dans SOTS + GPS (violation D-063) | D-063 · OS V14 MoneyMath | `SOTSSubmissionService.js` L.224/238 | 🟡 Loi | ❌ Non documenté |
| 6 | D-148–D-155 dans OS+Cartes, absents Registre et code | Carte 10 · OS V15 | `src/` (zéro) | 🟡 Gouvernance | ❌ Angle mort |
| 7 | `worm:'W3'` sur `settled→archived` ambigu | D-014-B · OS V15 §2.7 | TRANSITION_TABLE L.134 | 🟢 Sémantique | ✅ Commentaire L.129 |

---

## CE QUI IMPRESSIONNE

Là où la plupart des startups découvrent ces incohérences en production lors du premier remboursement raté, Micro Rave les a **trouvées, nommées et planifiées avant le premier event réel**. Le Plan d'Implantation du 21 mai 2026 est lui-même un artefact de gouvernance rare : il liste les gaps, les sources exact dans le code, et les fixes ligne par ligne. C'est la marque d'une équipe qui comprend que **l'architecture est un contrat vivant**, pas un document de levée de fonds.

Les 7 incohérences relevées ici ne remettent pas en cause la constitution. Elles en prouvent l'existence : un système sans constitution n'a pas de "violations" — il n'a que du chaos silencieux.