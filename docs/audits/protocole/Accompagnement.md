# ARTEFACT 5 (V5 FINAL) — INSTRUCTIONS D'UTILISATION

## Pour : Agent d'infrastructure Base44
## Date : Janvier 2025
## Statut : Prêt pour production

---

## RÉSUMÉ EXÉCUTIF

Vous trouverez ci-joint le **Protocole de Saisie Forensique (Artefact 5 V5)**.

Ce document transforme Base44 en instrument scientifique de mesure de l'infrastructure Micro Rave V3.

### Ce que ce protocole fait

1. **Force Base44 à extraire** plutôt que d'interpréter
2. **Ancre chaque assertion** dans des preuves matérielles vérifiables
3. **Force le doute** sur chaque conclusion
4. **Classe les absences** (non-implémentations) au lieu de les ignorer
5. **Produit une matrice de synthèse** pour cross-validation humaine/IA

### Ce que ce protocole NE fait PAS

- ❌ Permet l'hallucination
- ❌ Autorise la narrativisation libre
- ❌ Accepte les assertions sans ancre
- ❌ Ignore les silences (les absences sont des découvertes)
- ❌ Prononce un verdict final (c'est le rôle de l'humain)

---

## MODE D'EMPLOI

### Étape 1 : Lecture du protocole
Vous devez lire **Section I à VIII** en entier. C'est très structuré, donc ça prend ~30 minutes.

### Étape 2 : Extraction complète
Appliquez le protocole à **l'intégralité du code Micro Rave V3**. Cela signifie :

- Tous les fichiers du projet
- La base de données complète (schémas, contenu)
- Les logs si disponibles

**Durée estimée :** 3-6 heures selon l'ampleur du code

### Étape 3 : Production du rapport
Vous produisez un document qui comprend :

- **BLOC 0 (Constitution)** : Guards + Invariants
- **BLOC 1 (Ontologie)** : Engagement, ContractSnapshot, MissionSlot
- **BLOC 2 (Persistance)** : FinancialLedger, DataAccessLedger, Invariants
- **BLOC 3 (Stripe)** : Webhooks, Paiements, KYC
- **BLOC 4 (Présence)** : SessionPresence, PresenceProofResolver, SOTS
- **BLOC 5 (UI)** : Boutons critiques, handlers, vérité perçue
- **BLOC 6 (Infrastructure)** : Database, Logging, Audit trail

+ Matrice de synthèse (tableau récapitulatif)

### Étape 4 : Livrable
Vous remettez :

1. **Ce rapport forensique** (texte brut ou document structuré)
2. **Matrice de synthèse** (tableau Excel ou texte tabulé)
3. **Listing des absences** (Bloc par bloc)

---

## POINTS CRITIQUES À RESPECTER

### 🔴 RÈGLE #1 : Cartouche d'authenticité obligatoire

Chaque bloc d'extraction DOIT avoir ce cartouche. SANS lui, c'est rejeté.

```
BLOC : [NOM]
CHEMIN ABSOLU : [path exact]
DERNIÈRE MOD : [timestamp / SHA]
CONFIANCE : [CERTITUDE / PROBABLE / INFÉRENCE / INCONNU]
RISQUE D'ERREUR : [Pourquoi c'est peut-être faux]
```

### 🔴 RÈGLE #2 : Contre-preuve pour chaque assertion

Vous affirmer quelque chose ? Vous DEVEZ dire pourquoi c'est peut-être faux.

Exemple BON :
```
ASSERTION : SealingGuard existe et fonctionne
CONTRE-PREUVE : 
  - Mais c'est peut-être du code mort (jamais appelé)
  - Ou c'est un stub qui retourne toujours true
  - Ou il existe un bypass via webhook
```

Exemple MAUVAIS :
```
SealingGuard fonctionne bien.
```

### 🔴 RÈGLE #3 : Nommer les absences

Si quelque chose est introuvable, ce n'est PAS "probablement implémenté".

Classifiez :
- `NON IMPLÉMENTÉ` : Zéro trace
- `STUB` : Code existe mais vide
- `NOM RÉFÉRENCÉ SANS SOURCE` : Appelé mais fichier introuvable
- `PARTIEL` : Existe pour 50% du cas
- etc.

### 🔴 RÈGLE #4 : Les preuves en base comptent

Pas juste du code. Si vous affirmez :
> "Engagement peut passer de DRAFT à SEALED"

Vous devez montrer :
```
PREUVES EN BASE :
- Nombre d'Engagements actuels : [N]
- Distribution par statut : DRAFT [X], SEALED [Y], PAID [Z]
- Exemple réel : [Engagement ID avec statuts]
```

---

## STRUCTURE DE CHAQUE BLOC

Chaque bloc suit ce pattern :

```
╔═══════════════════════════════════════════════════╗
║ [CARTOUCHE D'AUTHENTICITÉ]                        ║
╚═══════════════════════════════════════════════════╝

SECTION 1 : EXTRACTION TEXTUELLE
[Code exact, numéros de ligne]

SECTION 2 : ANALYSE STRUCTURELLE
- Déclaration
- Appelants
- Chaîne d'imports
- Conditions d'activation

SECTION 3 : CONTRE-PREUVE
Pourquoi c'est peut-être faux ?

SECTION 4 : LACUNES
BLOQUANT / DÉGRADANT / REPORTABLE
```

---

## MATRICE DE SYNTHÈSE (Format final)

À la fin du rapport, produisez ce tableau :

```
ÉLÉMENT                    | STATUT | CONFIANCE | RISQUE      | BLOC
───────────────────────────|────────|───────────|─────────────|─────
Engagement (Schéma)        | ✓      | CERT      | BAS         | 1
Engagement (États)         | ✓      | CERT      | BAS         | 1
Engagement (Verrouillage)  | ✓      | PROBABLE  | MOYEN       | 1
ContractSnapshot (P1)      | ✓      | CERT      | BAS         | 1
ContractSnapshot (P2)      | ?      | INFÉRENCE | ÉLEVÉ       | 1
ContractSnapshot (WORM)    | ✓      | CERT      | BAS         | 1
...
```

Légende :
- `✓` = Trouvé et vérifiable
- `?` = Conditionnel ou inférence
- `✗` = Non trouvé

---

## CLAUSE D'INVALIDATION HUMAINE

**IMPORTANT :** Ce rapport n'est JAMAIS définitif.

Une personne humaine (Frédérik ou un développeur Base44) DOIT :

1. Lire 30% minimum des extraits de code
2. Tester au moins 3 assertions (ex: "SealingGuard fonctionne réellement ?")
3. Prononcer : **APPROUVÉ** ou **REJETÉ**

Si rejeté, dire pourquoi et corriger le rapport.

---

## LIVRABLE FINAL

Vous remettez les fichiers à Frédérik avec :

```
📦 Artefact 5 (V5 FINAL) - RAPPORT FORENSIQUE
│
├── 1. Rapport complet (texte ou PDF)
│   ├── Bloc 0 (Constitution & Guards)
│   ├── Bloc 1 (Ontologie)
│   ├── Bloc 2 (Persistance)
│   ├── Bloc 3 (Stripe)
│   ├── Bloc 4 (Présence)
│   ├── Bloc 5 (UI)
│   ├── Bloc 6 (Infrastructure)
│   └── Matrice de synthèse
│
├── 2. Fichier Excel (matrice + absences)
│
└── 3. Listing des absences (si > 0)
    ├── NON IMPLÉMENTÉ : [liste]
    ├── STUB : [liste]
    ├── PARTIEL : [liste]
    └── DÉCLARÉ SEUL : [liste]
```

---

## CE QUI SE PASSE ENSUITE

Une fois que Base44 livre ce rapport :

```
BASE44 RAPPORT FORENSIQUE
    ↓
+ ZIP du code source
+ ZIP de la base
+ Artefacts 01-04 (Contexte, Domaines, Synthèse, Check)
    ↓
CLAUDE.AI (avec tout en main)
    ↓
CROSS-VALIDATION : Claude vérifie le rapport vs. code réel
    ↓
CONTRE-RENDU : Chemin critique, TOP 3 obstacles, verdict
    ↓
HUMAN VALIDATION : Frédérik ou développeur approuve
    ↓
DÉCISION : Go/No-Go pour première transaction
```

---

## RESSOURCES

- **Artefact 5 (V5 FINAL)** : `/05_-_ARTEFACT_5_SAISIE_FORENSIQUE_V5_FINAL.docx`
- **Version Markdown** : `/05_-_PROMPT_ARTEFACT_5_SAISIE_FORENSIQUE_V5_FINAL.md`

---

## QUESTIONS FRÉQUENTES

**Q: Combien de temps ça prend ?**
A: 3-6 heures selon la taille du code. ~100K lignes = 5-6h.

**Q: Et si je ne trouve pas quelque chose ?**
A: C'est une découverte majeure. Classifiez-la (NON IMPLÉMENTÉ, etc.) et documentez.

**Q: Mon analyse peut-elle être fausse ?**
A: Oui, c'est normal. La clause d'invalidation humaine corrigera les erreurs.

**Q: Je dois citer CHAQUE ligne de code ?**
A: Non, les sections critiques. Mais pour les Guards, oui : code complet.

**Q: Que faire si le code est vraiment immonde ?**
A: Documentez quand même. Les absences et les stubs sont importants à identifier.

---

## FIN DES INSTRUCTIONS

Vous êtes prêt. Bonne saisie forensique.

Rappel : **Aucune narrative sans ancre. Aucune affirmation sans contre-preuve.**