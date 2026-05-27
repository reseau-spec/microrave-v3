# ARTEFACT 6 (NOUVEAU) — CHECKLIST DE VALIDATION HUMAINE

## À utiliser après réception du Rapport Base44

**Responsable :** Frédérik ou développeur Micro Rave V3 avec accès au code

**Durée estimée :** 2-3 heures

---

## I. PRE-VALIDATION (Avant de commencer)

### ✓ Cartouches présentes ?
```
Lisez les 10 premiers blocs du rapport.
Est-ce que CHAQUE bloc a un cartouche avec :
  - CHEMIN ABSOLU
  - DERNIÈRE MOD
  - CONFIANCE
  - RISQUE D'ERREUR

Si NON : Rapport REJETÉ. Demander à Base44 de refaire.
Si OUI : Continuer.
```

### ✓ Contre-preuves présentes ?
```
Lisez BLOC 0 (Constitution & Guards).
Pour chaque Guard, Base4 a-t-il écrit :
  "Pourquoi ce code pourrait NE PAS faire ce qu'il prétend ?"

Si la plupart sont vides : Rapport REJETÉ (pas respecté le protocole).
Si oui : Continuer.
```

---

## II. VALIDATION BLOC PAR BLOC (30% minimum)

Vous devez valider **au minimum 30% de chaque bloc critique**.

### BLOC 0 : Constitution & Guards (VALIDATION OBLIGATOIRE)
**Criticité :** 🔴 CRITIQUE

Sélectionnez 2 guards au hasard. Pour chacun :

#### Test 1 : Le code existe-t-il vraiment ?

```
Base44 affirme : 
  "SealingGuard existe en /server/guards/SealingGuard.ts"

VOUS FAITES :
  1. Ouvrez le fichier
  2. Cherchez la fonction / classe exacte
  3. Copiez 5 lignes du code réel
  
RÉSULTAT :
  ✓ MATCH : Base4 dit la vérité
  ✗ DIFFÉRENT : Les détails divergent
  ✗ INTROUVABLE : Base4 a hallucié
```

**Décision :**
- ✓ MATCH → Continue
- ✗ DIVERGENT → Notez la différence et continuez
- ✗ INTROUVABLE → RAPPORT REJETÉ

#### Test 2 : Qui l'appelle réellement ?

```
Base4 affirme :
  "SealingGuard est appelé par transitionEngagement (ligne 342)"

VOUS FAITES :
  1. Allez à transitionEngagement
  2. Cherchez l'import de SealingGuard
  3. Cherchez l'appel réel (ex: if (!SealingGuard.check(...)))
  4. Vérifiez que c'est OBLIGATOIRE (pas conditionnel)

RÉSULTAT :
  ✓ APPELÉ OBLIGATOIREMENT
  ? APPELÉ CONDITIONNELLEMENT (config var / env var)
  ✗ JAMAIS APPELÉ (code mort)
```

**Décision :**
- ✓ OBLIGATOIRE → Base4 dit vrai
- ? CONDITIONNEL → Base4 a omis une condition (note-le)
- ✗ JAMAIS APPELÉ → Base4 A ERRÉ (erreur majeure)

#### Test 3 : Qui pourrait le contourner ?

```
Base4 affirme :
  "SealingGuard bloque une transition DRAFT → SEALED"

VOUS TESTEZ (en tête) :
  1. Avez-vous connaissance d'une API admin qui bypasse les guards ?
  2. Y a-t-il un webhookhook Stripe qui modifie directement le statut ?
  3. Y a-t-il une migration de base qui changerait l'état ?
  4. Y a-t-il un script de maintenance qui contournerait ça ?

RÉSULTAT :
  ✓ AUCUN CONTOURNEMENT IDENTIFIÉ
  ? UN CONTOURNEMENT POSSIBLE (décrivez-le)
  ✗ CONTOURNEMENT CERTIFIÉ (erreur grave)
```

**Décision :**
- ✓ Sûr → Continue
- ? Possible → Base4 a omis une contre-preuve
- ✗ Certifié → RAPPORT REJETÉ (sécurité brisée)

---

### BLOC 1 : Ontologie (Engagement, ContractSnapshot)
**Criticité :** 🟠 HAUTE

Sélectionnez 2 assertions au hasard. Par exemple :

#### Test 1 : "ContractSnapshot Phase 1 est créée quand Engagement.status = SEALED"

```
VOUS FAITES :
  1. Ouvrez le code qui crée ContractSnapshot
  2. Vérifiez le condition d'appel (if statement)
  3. Vérifiez le timing (avant/après sealage)
  
RÉSULTAT :
  ✓ MATCH avec l'assertion de Base4
  ✗ DIVERGENCE : La condition est différente
```

#### Test 2 : "ContractSnapshot est WORM après Phase 1"

```
VOUS FAITES :
  1. Essayez (ou imaginez) une modification du ContractSnapshot
  2. Cherchez qui bloque ça (Guard ? Trigger DB ? Index unique ?)
  3. Vérifiez que le blocage fonctionne
  
RÉSULTAT :
  ✓ IMMUABLE (vrai WORM)
  ? PARTIELLEMENT IMMUABLE (certains champs modifiables)
  ✗ MUTABLE (pas WORM du tout)
```

---

### BLOC 2 : Persistance (FinancialLedger, Invariants)
**Criticité :** 🔴 CRITIQUE

Sélectionnez 2 assertions. Par exemple :

#### Test 1 : "FinancialLedger est append-only"

```
VOUS FAITES :
  1. Cherchez le schéma FinancialLedger en base
  2. Cherchez un trigger / constraint qui empêche les delete/update
  3. Ou cherchez le code applicatif qui le valide
  
RÉSULTAT :
  ✓ APPEND-ONLY ASSURÉ
  ? PARTIELLEMENT (admins peuvent modifié)
  ✗ MUTABLE (base4 se trompe)
```

#### Test 2 : "Invariant zéro cent : somme(FinancialLedger) == 0"

```
VOUS FAITES :
  1. Trouvez la fonction qui vérifie
  2. Testez-la mentalement :
     - Charge de 100 CAD
     - Payout de 100 CAD
     - Somme doit être = 0
  3. Vérifiez que c'est appelé AVANT chaque payout
  
RÉSULTAT :
  ✓ VÉRIFICATION CORRECTE
  ? TIMING INCERTAIN (après vs avant)
  ✗ VÉRIFICATION ABSENTE
```

---

### BLOC 3 : Stripe & Paiements
**Criticité :** 🔴 CRITIQUE

#### Test 1 : "Webhook Stripe valide la signature"

```
VOUS FAITES :
  1. Trouvez le webhook handler
  2. Cherchez la validation de signature (ex: stripe.webhooks.constructEvent)
  3. Vérifiez que le secret est en variable d'env (pas hardcodé)
  
RÉSULTAT :
  ✓ SIGNATURE VALIDÉE CORRECTEMENT
  ✗ SIGNATURE NON VALIDÉE (SÉCURITÉ BRISÉE)
```

#### Test 2 : "KYC est obligatoire avant payout"

```
VOUS FAITES :
  1. Trouvez la fonction qui execute le payout
  2. Cherchez if (kyc !== "VERIFIED") { reject }
  3. Vérifiez que c'est IMPOSSIBLE à contourner
  
RÉSULTAT :
  ✓ KYC OBLIGATOIRE
  ✗ KYC OPTIONNEL (risque)
```

---

### BLOC 4 : Présence & SOTS
**Criticité :** 🟠 HAUTE

#### Test 1 : "PresenceProofResolver utilise GPS + radius"

```
VOUS FAITES :
  1. Trouvez la fonction PresenceProofResolver
  2. Vérifiez la logique (distance <= rayon ?)
  3. Testez mentalement : talent à 500m du lieu. Accepté ? Rejeté ?
  
RÉSULTAT :
  ✓ LOGIQUE CORRECTE
  ? LOGIQUE FLOUS
  ✗ LOGIQUE ABSENTE / STUB
```

#### Test 2 : "Auto-note est bloquée"

```
VOUS FAITES :
  1. Trouvez où les notes sont écrites
  2. Cherchez la vérification (if (rater_id == talent_id) { reject })
  3. Vérifiez que c'est en base ou appli
  
RÉSULTAT :
  ✓ BLOQUÉE
  ✗ NON BLOQUÉE (bug)
```

---

### BLOC 5 : UI
**Criticité :** 🟡 MOYEN

#### Test 1 : "Bouton Sceller appelle l'endpoint correct"

```
VOUS FAITES :
  1. Trouvez le handler onClick du bouton
  2. Vérifiez l'endpoint appelé (POST /api/engagement/seal ?)
  3. Vérifiez la validation avant envoi
  
RÉSULTAT :
  ✓ ENDPOINT CORRECT
  ✗ ENDPOINT MANQUANT
```

---

### BLOC 6 : Infrastructure
**Criticité :** 🟡 MOYEN

#### Test 1 : "Logs sont centralisés"

```
VOUS FAITES :
  1. Cherchez où les logs sont écrits
  2. Vérifiez qu'ils ne sont pas juste sur disque local
  3. Vérifiez la rétention
  
RÉSULTAT :
  ✓ CENTRALISÉ
  ✗ ÉPARPILLÉ / PERDU AU REDÉMARRAGE
```

---

## III. MATRICE DE SYNTHÈSE (Validation finale)

### ✓ La matrice est-elle complète ?

```
Cherchez les patterns :
  ✓ ✓ ✓ ✓ (Parfait)
  ✓ ✓ ✓ ? (Acceptable, avec réserves)
  ✓ ✓ ✗ ✗ (Problématique)
  ✗ ✗ ✗ ✗ (Rapport À REJETER)

RÈGLE :
  Si > 3 "✗" dans BLOC 0 → REJETÉ
  Si > 5 "?" dans n'importe quel bloc → Demander clarification
```

---

## IV. ABSENCES CRITIQUES (Bloc 0 surtout)

### ✓ Y a-t-il un élément manquant ?

```
Lisez le fichier "ABSENCES DOCUMENTÉES" du rapport.

Cherchez :
  NON IMPLÉMENTÉ : [liste]
  STUB : [liste]
  PARTIEL : [liste]

QUESTIONS :
  1. Est-ce que ces absences bloquent la première transaction ?
  2. Si OUI : RAPPORT REJETÉ (manque du code critique)
  3. Si NON : Notez-les comme "reportables"
```

---

## V. VERDICT FINAL

Remplissez cette grille :

```
BLOC 0 (Constitution)   | ✓ / ? / ✗
BLOC 1 (Ontologie)      | ✓ / ? / ✗
BLOC 2 (Persistance)    | ✓ / ? / ✗
BLOC 3 (Stripe)         | ✓ / ? / ✗
BLOC 4 (Présence)       | ✓ / ? / ✗
BLOC 5 (UI)             | ✓ / ? / ✗
BLOC 6 (Infrastructure) | ✓ / ? / ✗
───────────────────────────────────
TOTAL                   | [COUNT]

RÈGLES DE DÉCISION :
  Si TOTAL ≥ 5 "✗" → RAPPORT REJETÉ
  Si TOTAL ≥ 3 "✗" ET BLOC 0 a une → RAPPORT REJETÉ
  Si TOTAL ≤ 2 "✗" → APPROUVÉ avec réserves
  Si TOTAL = 0 "✗" → APPROUVÉ
```

---

## VI. SIGNATURE FINALE

```
VALIDATEUR : [Nom & Prénom]
DATE : [JJ/MM/AAAA]
VERDICT : [ ] APPROUVÉ  [ ] APPROUVÉ AVEC RÉSERVES  [ ] REJETÉ
RAISON (si rejeté) : [Courte explication]
SIGNATURE : [Hand-written ou digital]
```

---

## VII. SI REJETÉ

```
Vous remplissez :

RAISON(S) DU REJET :
  1. [Assertion Base4 qui est fausse]
  2. [Élément introuvable]
  3. [Contradiction trouvée]

ACTION :
  □ Demander à Base4 de refaire complètement
  □ Demander à Base4 de corriger la section X
  □ Conduire l'audit manuellement (sans Base4)

BASE4 CORRIGE → Vous refaites la checklist
```

---

## VIII. SI APPROUVÉ

```
Vous remettez :
  1. Cette checklist signée
  2. Le rapport Base4
  3. La matrice de synthèse

À Claude.AI avec :
  + ZIP du code
  + ZIP de la base
  + Artefacts 01-04

CLAUDE procède à la validation croisée.
```

---

## NOTES FINALES

- **Vous êtes la dernière personne capable de valider ce rapport.**
- **Si vous dites APPROUVÉ, vous êtes responsable de sa véracité.**
- **Si vous trouvez une erreur, ce n'est PAS une mauvaise chose. C'est comme ça qu'on trouve les bugs.**
- **Soyez sévère. Honnêteté > complaisance.**

---

**Fin de la Checklist**

Allez. Bonne validation.