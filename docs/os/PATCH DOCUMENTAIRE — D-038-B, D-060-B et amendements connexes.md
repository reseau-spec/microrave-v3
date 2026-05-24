# PATCH DOCUMENTAIRE — D-038-B, D-060-B et amendements connexes

**Auteur :** Chef comptable fiscaliste (revue externe)
**Date :** 2026-05-23
**Contexte :** Suite aux groupes G5 (réconciliation 5,39 $) et G6 (intégration capture taxes Principal absorbées) sur la transaction pilote Pierre de Rosette, mise à jour documentaire de la doctrine financière Micro Rave.
**Statut Doctrine MR :** Principal — Institution de règlement (validée par fondateur, en attente de validation fiscaliste externe formelle)

---

## VUE D'ENSEMBLE — 5 modifications, 2 fichiers

| # | Fichier | Section | Action |
|---|---|---|---|
| 1 | EXPORT_BRUT_REGISTRES_SOUVERAINS | Après D-038 | **AJOUT** D-038-B (stripeTransferId champ natif) |
| 2 | EXPORT_BRUT_REGISTRES_SOUVERAINS | Après D-060-A | **AJOUT** D-060-B (compte 6690 Charges fiscales absorbées) |
| 3 | EXPORT_BRUT_REGISTRES_SOUVERAINS | Après D-060-B | **AJOUT** D-060-C (clé de réconciliation universelle `reconciliationKey`) |
| 4 | EXPORT_BRUT_REGISTRES_SOUVERAINS | Table entités (ligne FinancialLedger) | **MODIFICATION** ajout `stripeTransferId, reconciliationKey, status` |
| 5 | EXPORT_BRUT_REGISTRES_SOUVERAINS | Section invariants / KPI | **AJOUT** invariant K-FISCAL-01 (seuil 6690) |

L'OS V15 ne nécessite pas de modification (référence D-038 globalement, pas le schéma).
Les cartes drawio 03 et 09 sont à amender ultérieurement (voir section "Suite").

---

## 1️⃣ MODIFICATION 1 — Ajout D-038-B (raffiné)

**Emplacement :** EXPORT_BRUT_REGISTRES_SOUVERAINS_MICRO_RAVE_V3.md, immédiatement après D-038 (ligne ~644)

```markdown
---

### **D-038-B | stripeTransferId — champ natif LedgerRecord (clé de réconciliation Stripe)**

**Statut :** VALIDÉ — amendement D-038 **Bloc :** BLOC 4 — Money Waterfall

**Règle invariante :** Tout LedgerRecord appartenant à un groupe (`transactionGroupId`) qui implique un mouvement Stripe réel (PaymentIntent, Charge, Transfer, Payout, Refund, Dispute) DOIT porter `stripeTransferId` en champ de premier niveau du schéma — pas seulement dans `metadata`. La propagation du champ est faite sur TOUTES les lignes du groupe, pas seulement sur celle qui mouvemente 5100/5200.

**Justification :** la réconciliation doit pouvoir partir de n'importe quelle ligne du groupe. Si seule la ligne « banque » porte la référence, alors une requête sur les comptes 4310 ou 7110 pour un audit Stripe ne peut pas remonter à la transaction d'origine. La propagation symétrique élimine cette asymétrie.

**Format accepté pour `stripeTransferId` :**
- `pi_xxx` — PaymentIntent (encaissement client)
- `ch_xxx` — Charge (capture)
- `tr_xxx` — Transfer (vers compte Connect)
- `po_xxx` — Payout (vers compte bancaire)
- `re_xxx` — Refund
- `dp_xxx` — Dispute (chargeback)

**Multi-référence :** si un groupe touche plusieurs objets Stripe (ex. capture + remboursement partiel dans le même reversal), le champ accepte un tableau `stripeReferences[]` avec ordre d'application explicite. Le champ scalaire `stripeTransferId` reste rempli avec la référence primaire pour rétrocompatibilité.

**Portée des écritures sans Stripe :** Les groupes qui ne touchent PAS Stripe (régularisations internes, écritures d'ajustement, reclassements, écritures de clôture) laissent `stripeTransferId = null` mais DOIVENT renseigner `reconciliationKey` (voir D-060-C).

**Implémentation :** `FinancialLedgerService.recordTransaction()` accepte `stripeTransferId` (ou `stripeReferences[]`) en paramètre de premier niveau et le propage à chaque LedgerRecord du groupe via `repositories.ledgerRecords.append()`.

**Corollaire côté Stripe :** `transfer_group` doit être peuplé avec l'engagementId MR au format `'event_EVT-xxx'`. Cela permet la réconciliation bidirectionnelle :
- Stripe → Ledger : par `stripeTransferId`
- Ledger → Stripe : par `transfer_group`

**Guard requis :** `StripeReferenceGuard` (à créer) — bloque l'écriture d'un groupe « Stripe » sans `stripeTransferId` valide, et vérifie que `transfer_group` côté Stripe matche `engagementId`.

**Migration des écritures antérieures :** les écritures historiques sans `stripeTransferId` sont migrées par un script `backfill-stripe-refs.js` qui reconstruit la liaison à partir du `metadata.stripeTransferId` (s'il existe) ou marque la ligne `reconciliationStatus: 'PRE_D-038-B'` pour traitement manuel.

**Décisions sources :** issu de l'incident pilote Pierre de Rosette (groupes G1-G6), 2026-05-23.
```

---

## 2️⃣ MODIFICATION 2 — Ajout D-060-B (nouveau compte 6690)

**Emplacement :** Immédiatement après D-060-A (ligne ~1012)

```markdown
---

### **D-060-B | Ajout 6690 au LedgerCodeMap V3 — Charges fiscales absorbées**

**Statut :** VALIDÉ — amendement D-060 **Bloc :** BLOC 6 — Ledger et comptabilité

**Règle invariante :** Le compte **6690 — Charges fiscales absorbées** est introduit dans le LedgerCodeMap V3 pour comptabiliser les taxes (TPS/TVQ/HST) que Micro Rave doit à l'État en tant que Principal MAIS qui n'ont PAS été perçues du client. Ce compte est strictement réservé à la régularisation de transactions où la perception des taxes au client a été omise (transactions pilotes hors Checkout, erreurs de facturation, écritures de régularisation post-audit).

**Nature comptable :** Charge d'exploitation — section "Charges fiscales et réglementaires".

**Contrepartie obligatoire :** Toute écriture en DEBIT du compte 6690 doit avoir comme contrepartie en CREDIT les comptes de passifs fiscaux (4410, 4420, ou équivalent juridiction) pour reconnaître la dette envers l'État.

**Écriture-type — Régularisation de taxes Principal non perçues :**

```
DR  6690  Charges fiscales absorbées        44,92 $
    CR  4410  TPS à remettre                15,00 $
    CR  4420  TVQ à remettre                29,92 $
```

**Règles d'usage strictes :**

1. **Interdit en flux nominal :** Aucune écriture en 6690 ne doit apparaître sur une transaction passée par Stripe Checkout dans le flux nominal D-038. Si le système Checkout est correctement configuré, les taxes sont toujours perçues du client → 4410/4420 sont alimentés par le crédit client, pas par 6690.

2. **`interventionType` obligatoire :** toute écriture en 6690 doit comporter dans son `metadata.interventionType` une valeur explicite parmi :
   - `PRINCIPAL_TAX_REGULARIZATION_PILOT` (transaction pilote hors Checkout)
   - `PRINCIPAL_TAX_REGULARIZATION_ERROR` (erreur de facturation détectée a posteriori)
   - `PRINCIPAL_TAX_REGULARIZATION_AUDIT` (régularisation suite à audit interne ou externe)

3. **DualApprovalGuard requis :** toute écriture en 6690 supérieure à 100,00 $ par transaction nécessite l'approbation duale (FOUNDER + ADMIN_FINANCE) avant persistance. Voir Carte 06.

4. **DecisionRecord obligatoire :** chaque écriture en 6690 doit être liée à un DecisionRecord de type `TAX_ABSORPTION_DECISION` qui documente :
   - La raison de la non-perception
   - L'analyse coût-bénéfice (pourquoi absorber plutôt que refacturer le client)
   - La validation par le fiscaliste si applicable
   - Le plan d'action correctif pour éviter récurrence

**KPI de surveillance — Invariant K-FISCAL-01 (voir D-060-D) :**
- Ratio `Total 6690 / Total 7110` calculé mensuellement
- Seuil VERT : < 1 % — fonctionnement normal
- Seuil JAUNE : 1 % à 5 % — alerte, analyse requise dans les 7 jours
- Seuil ORANGE : 5 % à 15 % — alerte critique, plan correctif requis dans les 30 jours
- Seuil ROUGE : > 15 % — **arrêt commercial obligatoire**, audit complet du pipeline fiscal

**Justification de l'introduction :** sous doctrine Principal, MR est le fournisseur taxable au sens des LTA/LTVQ. La dette fiscale envers l'État naît à la fourniture du service, pas à la perception des taxes au client. Si MR omet de facturer les taxes, l'obligation demeure et doit être réglée par les fonds propres de MR — d'où la charge en 6690. Ce compte rend visible et auditable cette absorption au lieu de la diluer dans des comptes de passage ou des comptes correctifs flous.

**Décision source :** révision de la régularisation pilote Pierre de Rosette (groupes G5/G6), 2026-05-23.
```

---

## 3️⃣ MODIFICATION 3 — Ajout D-060-C (clé de réconciliation universelle)

**Emplacement :** Immédiatement après D-060-B

```markdown
---

### **D-060-C | `reconciliationKey` — clé de réconciliation universelle LedgerRecord**

**Statut :** VALIDÉ — amendement D-038 et D-060 **Bloc :** BLOC 6 — Ledger et comptabilité

**Règle invariante :** Tout LedgerRecord, indépendamment de la nature de la transaction (Stripe, banque, régularisation, ajustement, clôture), DOIT porter un champ `reconciliationKey` en premier niveau qui pointe vers la pièce justificative externe ou interne lui correspondant. Aucune écriture ne peut être persistée sans `reconciliationKey` non-nulle.

**Format :** chaîne préfixée par le type de source :
- `stripe:tr_xxx` — référence Stripe (alias de `stripeTransferId`, voir D-038-B)
- `bank:VIRMTL-20260523-001` — virement bancaire (banque + référence)
- `invoice:INV-2026-00042` — facture interne
- `creditnote:CN-2026-00007` — note de crédit
- `journal:JNL-2026-00123` — écriture de journal (régularisation interne)
- `closing:FY2026-CLOSING` — écriture de clôture d'exercice
- `decision:DR-MPIxxxx-yyyy` — écriture déclenchée par un DecisionRecord
- `reversal:LDG-MPIxxxx-yyyy` — reversal d'une écriture antérieure

**Justification :** une bonne pratique comptable exige que chaque écriture soit traçable à une pièce justificative. Le `stripeTransferId` couvre seulement les flux Stripe — il laisse 30 à 50 % du ledger sans clé de réconciliation (régularisations, ajustements, clôtures, écritures pilotes). Sans `reconciliationKey` universelle, un audit externe ne peut pas valider la couverture documentaire du grand livre.

**Implémentation :**
- Ajout du champ `reconciliationKey` (string, NOT NULL) au schéma LedgerRecord
- `FinancialLedgerService.recordTransaction()` exige le paramètre en entrée
- Pour les groupes Stripe, le service génère automatiquement `reconciliationKey = 'stripe:' + stripeTransferId` si non fourni
- Pour les groupes hors-Stripe, le caller doit fournir explicitement la clé (sinon l'écriture est rejetée par `ReconciliationKeyGuard`)

**Migration des écritures antérieures :** script `backfill-reconciliation-keys.js` qui reconstruit les clés à partir de :
1. `stripeTransferId` natif ou en metadata → `stripe:xxx`
2. Pour les autres, génération de `journal:LEGACY-MIGRATION-{systemId}` avec investigation manuelle requise.

**Décision source :** revue de complétude documentaire du ledger Pierre de Rosette, 2026-05-23.
```

---

## 4️⃣ MODIFICATION 4 — Mise à jour table entités (FinancialLedger)

**Emplacement :** EXPORT_BRUT_REGISTRES_SOUVERAINS, ligne ~2571

**AVANT (état actuel) :**

```
| FinancialLedger | Registre comptable append-only | Source de vérité financière | id, transactionGroupId, accountCode, debitCents, creditCents, description, createdAt, [immuable] | D-038, D-060 | MVP |
```

**APRÈS (à appliquer) :**

```
| FinancialLedger | Registre comptable append-only | Source de vérité financière | id, transactionGroupId, accountCode, debitCents, creditCents, description, stripeTransferId, reconciliationKey, status, createdAt, [immuable] | D-038, D-038-B, D-060, D-060-B, D-060-C | MVP |
```

**Notes sur les nouveaux champs :**

- `stripeTransferId` (string, nullable) — voir D-038-B
- `reconciliationKey` (string, NOT NULL) — voir D-060-C
- `status` (enum: `POSTED` | `REVERSED` | `REVERSAL_OF`) — ajouté pour distinguer les écritures actives des écritures annulées. Une écriture `REVERSED` a été contre-passée par une autre. Une écriture `REVERSAL_OF` est elle-même un reversal. Une écriture `POSTED` est vivante. Permet aux requêtes de calcul de bilan de filtrer les écritures annulées sans casser l'invariant WORM (les lignes restent en base, mais leur statut change via une écriture de métadonnée séparée — pas un UPDATE).

⚠️ **Note importante sur le `status` :** la mutation de status ne contrevient PAS à LOI GREFFIER-01, car elle est gérée par une table parallèle `LedgerRecordStatusHistory` append-only qui horodate chaque changement. La valeur `status` exposée par le repository est calculée comme la dernière entrée de cette table. Le LedgerRecord original n'est jamais modifié. Cette mécanique doit être formalisée dans D-060-E (à venir).

---

## 5️⃣ MODIFICATION 5 — Ajout invariant K-FISCAL-01

**Emplacement :** Section "Invariants & Lois", à proximité des autres lois LEDGER

```markdown
---

### **K-FISCAL-01 | Ratio de charges fiscales absorbées — seuil de viabilité commerciale**

**Statut :** VALIDÉ **Bloc :** BLOC 6 — Ledger et comptabilité

**Règle invariante :** À tout moment, le ratio `Total 6690 (sur période roulante 90 jours) / Total 7110 (sur même période)` doit rester sous le seuil d'arrêt commercial.

**Définition formelle :**

```
ratio_absorption = sum(6690.amountCents, 90d) / sum(7110.amountCents, 90d)
```

**Seuils d'alerte :**

| Seuil | Plage | Action |
|---|---|---|
| 🟢 VERT | < 1 % | Fonctionnement normal — surveillance routine |
| 🟡 JAUNE | 1 % à 5 % | Alerte — analyse cause racine sous 7 jours |
| 🟠 ORANGE | 5 % à 15 % | Alerte critique — plan correctif sous 30 jours + notification fondateur |
| 🔴 ROUGE | > 15 % | **Arrêt commercial obligatoire** — audit complet pipeline fiscal + validation fiscaliste externe avant reprise |

**Justification :** sous doctrine Principal, chaque dollar en 6690 est de l'argent que MR donne à l'État sans avoir été indemnisé par le client. C'est une fuite de marge pure. Au-delà de 15 %, le modèle économique n'est plus viable et signale une défaillance systémique du pipeline de facturation (Checkout, taxation, configuration des prix).

**Calcul automatique :** un job quotidien `kpi-fiscal-absorption-ratio.js` calcule le ratio, le compare aux seuils, et déclenche les notifications appropriées. Le KPI est exposé sur le dashboard FOUNDER en permanence.

**Décision source :** prévention de dégradation silencieuse de la marge sous doctrine Principal, 2026-05-23.
```

---

## SUITE — Cartes drawio à amender

**Carte 03 (Money Waterfall) :**
- Ajouter un encart `D-038-B` indiquant que `stripeTransferId` est propagé sur toutes les lignes du groupe
- Ajouter un encart `D-060-C` indiquant la `reconciliationKey` universelle
- Distinguer visuellement les groupes "Stripe" (avec `stripeTransferId`) des groupes "Régularisation" (avec `reconciliationKey` interne)

**Carte 07 (Fiscalité) :**
- Sous doctrine Principal (à formaliser dans une révision V5 de la carte), ajouter le compte 6690 dans l'enveloppe B (taxes propres MR)
- Documenter le scénario "transaction pilote hors Checkout = 6690 alimenté"
- Ajouter le KPI K-FISCAL-01 avec ses seuils

**Carte 09 (Pierre de Rosette) :**
- Aucune modification structurelle, mais ajouter une annexe documentant les groupes G1-G6 comme cas d'école pédagogique de "comment ne PAS faire et comment corriger sous LOI GREFFIER-01".

---

## TESTS DE NON-RÉGRESSION RECOMMANDÉS

Avant publication des amendements, exécuter les tests suivants :

1. **Test schéma :** `LedgerRecord.append({stripeTransferId: null, reconciliationKey: null})` doit échouer (guard `ReconciliationKeyGuard`)
2. **Test propagation :** un groupe avec 4 lignes et `stripeTransferId: 'tr_xxx'` doit produire 4 LedgerRecords avec la même valeur
3. **Test guard 6690 :** une écriture en 6690 sans `interventionType` doit échouer
4. **Test guard 6690 montant :** une écriture > 100 $ en 6690 sans dual approval doit échouer
5. **Test KPI :** simuler 90 jours avec ratio 6690/7110 = 20 % doit déclencher l'arrêt commercial
6. **Test reversal :** un reversal doit conserver le `stripeTransferId` original et marquer `status: REVERSAL_OF`
7. **Test bilan :** le calcul de bilan doit ignorer les lignes `status: REVERSED`

---

## CHECKLIST DE PUBLICATION

- [ ] Patch D-038-B inséré dans EXPORT_BRUT_REGISTRES_SOUVERAINS
- [ ] Patch D-060-B inséré (compte 6690)
- [ ] Patch D-060-C inséré (`reconciliationKey`)
- [ ] Table entités FinancialLedger mise à jour
- [ ] Invariant K-FISCAL-01 documenté
- [ ] Mise à jour de l'index/sommaire en tête du Registre Souverain pour référencer les nouvelles décisions
- [ ] Cartes drawio 03, 07, 09 mises à jour ou ticket créé pour le faire
- [ ] Tests de non-régression écrits
- [ ] `FinancialLedgerService` patché conformément
- [ ] `LedgerCodeMap V3` mis à jour avec le compte 6690
- [ ] Guards ajoutés : `StripeReferenceGuard`, `ReconciliationKeyGuard`, `Account6690Guard`, `Account6690DualApprovalGuard`
- [ ] Job KPI `kpi-fiscal-absorption-ratio.js` créé
- [ ] DecisionRecord créé pour la régularisation Pierre de Rosette en tant que `TAX_ABSORPTION_DECISION` avec contexte complet

---

## NOTE FINALE DU CHEF COMPTABLE

L'introduction du compte 6690 est **techniquement correcte** pour absorber les taxes Principal non perçues, mais elle est **commercialement dangereuse** si elle devient routinière. Une transaction pilote en 6690 = pédagogique. 100 transactions/mois en 6690 = signal d'alarme. 1000 transactions/mois en 6690 = soit changement de doctrine (passage à Mandataire mieux outillé), soit refonte complète du pipeline de facturation.

**La discipline imposée par K-FISCAL-01 est ce qui distingue un système comptable "qui marche" d'un système comptable "qui protège l'entreprise". Sans ce KPI, le compte 6690 devient un trou noir.**

— Fin du patch documentaire —