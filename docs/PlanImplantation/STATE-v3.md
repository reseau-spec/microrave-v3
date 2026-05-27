# MICRO RAVE V3 — STATE.md V3
# Charger en tête de toute nouvelle session de développement.
# Mis à jour : 27 mai 2026 — post-PHASE 1 + clarification architecture Base44

╔══════════════════════════════════════════════════════════════════╗
║  CLARIFICATION ARCHITECTURALE DÉFINITIVE (27 mai 2026)          ║
╠══════════════════════════════════════════════════════════════════╣
║  Base44 est un environnement CLOUD FERMÉ.                        ║
║  Les fonctions Deno (codeBase44_v3/base44/functions/) s'exécutent║
║  dans le cloud Base44 — elles n'ont PAS accès aux fichiers src/  ║
║  Node du repo VS Code.                                           ║
║                                                                  ║
║  codeBase44_v3/ = EXPORT LOCAL de référence seulement.          ║
║  src/           = CODE NODE.JS (Visual Studio / tests P0).       ║
║  Ces deux univers sont séparés — aucun import cross-env.         ║
║                                                                  ║
║  Pattern Base44 natif (dans tout entry.ts) :                     ║
║    import { createClientFromRequest } from 'npm:@base44/sdk@X'   ║
║    Deno.serve(async (req) => { ... })                            ║
║    const base44 = createClientFromRequest(req)                   ║
║    const me = await base44.auth.me()  ← ASYNC, pas sync         ║
║                                                                  ║
║  La logique canonique (adaptateur, guards) est reproduite        ║
║  INLINE dans chaque entry.ts lors du réalignement PHASE 3.       ║
╚══════════════════════════════════════════════════════════════════╝

---

## ÉTAT GLOBAL

```
PHASE 1 — PORTAGE CANONIQUE                          ✅ COMPLÈTE
  ✅ PORT-1    ESM global · 121 fichiers · 41/44 → 46/46 P0
  ✅ PORT-1b   Split LedgerRepository (DETTE-PORT-006 résolue)
               · LedgerRecordRepository.js créé
               · LedgerCodeMapRepository.js séparé
               · POLICYCONFIG-FAILCLOSED-01 : seed CSV mode
  ✅ PORT-2    base44-adapter.js · 18 sous-objets
               · Barrière LOI_TRANSITION_01_VIOLATION ancrée
  ✅ PORT-3    _port3TestImport corrigé (pattern Base44 natif)
               · PORT-3-INTEGRATION-01 : 13/13 PASSED
               · Règle 9 exécutoire côté Node

TESTS P0 ACTUELS : 46/46 PASSED (sur repo réel fourni 27 mai 2026)
GIT : commit 48a300a (head du repo fourni)

PHASE 2 — FONDATIONS CANONIQUES                      ❌ À DÉMARRER
  ❌ 1A-1   IDFactory Crockford
  ❌ 1A-2   Checkpoint entity + seed CP-PLATEAU-0001
  ❌ 1B-1   Schéma ContractSnapshot enrichi
  ❌ 1B-2   CS1 créé à accepted (CS1-CREATION-01 PASSED)
  ❌ 1B-3   CS2 créé à event_sealed (CS2-CREATION-01 PASSED)

PHASE 3 — RÉALIGNEMENT BASE44                        ❌ APRÈS PHASE 2
  12 fonctions Base44 à réécrire en purs adapteurs
  (pattern _port3TestImport · createBase44Repositories inline)
```

---

## ORDRE DE PRIORITÉ ABSOLU

```
PORT-1 → PORT-2 → PORT-3 → (1A-1 ∥ 1A-2 ∥ 1B-1) → 1B-2 → 1B-3
  ✅       ✅       ✅       ← PHASE 2 commence ici
```

---

## PHASE 2 — DÉTAIL DES TÂCHES

### 1A-1 — IDFactory Crockford

**Fichier :** `src/core/IDFactory.js`

**Problème actuel :**
Le générateur de suffixe utilise `Math.random().toString(36)` qui peut
produire les caractères `0`, `O`, `I`, `1` — ambigus visuellement et
source d'erreurs humaines lors de la saisie/lecture des systemId.

**Ce que la tâche fait :**
Remplacer le suffixe aléatoire par l'alphabet Crockford Base32 :
`0123456789ABCDEFGHJKMNPQRSTVWXYZ` (exclut O, I, L, U)

**Implémentation attendue :**
```js
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
function randomCrockford(length) {
  let result = '';
  for (let i = 0; i < length; i++) {
    result += CROCKFORD[Math.floor(Math.random() * 32)];
  }
  return result;
}
// Remplacer dans generate() :
// AVANT : Math.random().toString(36).slice(2, 8).toUpperCase().padEnd(6, '0')
// APRÈS : randomCrockford(6)
```

**Test de DONE :**
```
node tests/p0/IDFACTORY-CROCKFORD-01.js → PASSED
```
Le test vérifie :
- 10 000 ID générés sans jamais produire O, I, L, U dans le suffixe
- Format PREFIX-TIMESTAMP-SUFFIX respecté
- Tous les types existants (30+) génèrent sans erreur
- validate() retourne true pour les IDs générés

---

### 1A-2 — Checkpoint entity + seed CP-PLATEAU-0001

**Contexte :**
L'event de test canonique V3 est : DJ Alex Dubois, 200 CAD net,
Le Trèfle bar, checkpoint CP-PLATEAU-0001. Ce Checkpoint doit
exister en base (il est l'acceptance test physique de V3).

**Ce que la tâche fait :**
1. Vérifier que `Checkpoint.jsonc` existe dans `codeBase44_v3/base44/entities/`
2. Créer un script `scripts/seed-checkpoint-plateau.js` qui insère
   CP-PLATEAU-0001 en base via l'API Base44
3. Test de DONE : le script s'exécute sans erreur et retourne
   `{ ok: true, systemId: 'CKP-...' }`

**Données du seed :**
```js
{
  systemId: IDFactory.generate('Checkpoint'),  // CKP-...
  slug: 'CP-PLATEAU-0001',
  name: 'Le Trèfle — Plateau-Mont-Royal',
  city: 'Montréal',
  neighborhood: 'Plateau-Mont-Royal',
  active: true,
}
```

---

### 1B-1 — Schéma ContractSnapshot enrichi

**Fichier :** `codeBase44_v3/base44/entities/ContractSnapshot.jsonc`

**Contexte :**
Le ContractSnapshot actuel (phase, engagementId, createdAt) est trop
minimal. CS1 (phase accepted) et CS2 (phase event_sealed) doivent
capturer un snapshot financier complet au moment de la transition.

**Champs à ajouter au schéma :**
```
cachetSigneCents, tauxPpm, commissionMrCents, talentNetCents,
depositCents, balanceCents, prixVenduClientCents,
tpsCents, tvqCents, currency,
talentUserId, organizerUserId, eventId,
transitionKey, transitionedAt, transitionedByUserId,
immutableAt  (timestamp WORM — ne pas modifier après création)
```

**Test de DONE :**
```
node tests/p0/CONTRACT-SNAPSHOT-SCHEMA-01.js → PASSED
```

---

### 1B-2 — CS1 créé à accepted

**Dépend de :** 1B-1

**Ce que la tâche fait :**
Dans `src/core/transitionEngagement.js`, à la transition
`deposit_secured → event_sealed` (non — c'est `deposit_pending →
deposit_secured`... vérifier la machine d'état), insérer la création
d'un CS1 via `repositories.contractSnapshots.create()`.

**Test de DONE :**
```
node tests/p0/CS1-CREATION-01.js → PASSED
```

---

### 1B-3 — CS2 créé à event_sealed

**Dépend de :** 1B-2

**Ce que la tâche fait :**
À la transition `deposit_secured → event_sealed`, créer un CS2.

**Test de DONE :**
```
node tests/p0/CS2-CREATION-01.js → PASSED
```

---

## RÈGLES INVARIANTES (rappel)

```
Règle 4  : Toute logique métier vit dans src/. Jamais inline dans Base44.
           → En PHASE 3 : la logique inline dans entry.ts est une VIOLATION
             temporaire tolérée jusqu'au réalignement.
Règle 9  : Zéro logique métier dans Base44 (EXÉCUTOIRE depuis PORT-3).
Règle 7  : Annoncer les bloquants avant de coder.
LOI GREFFIER-01 : Ledger append-only. Jamais de DELETE/UPDATE sur LedgerRecord.
LOI TRANSITION-01 : transitionEngagement() est la seule porte pour modifier status.
D-064 : amountCents = entiers en centimes. Jamais float.
D-060 : Tous les codes comptables viennent de LedgerCodeMap. Jamais hardcodés.
FinancialNumericStandard : PPM pour les taux (jamais float), centimes pour les montants.
```

---

## STRUCTURE DU REPO (rappel post-clarification)

```
microrave-v3/
├── src/                          ← CODE NODE.JS (Visual Studio)
│   ├── core/
│   │   ├── transitionEngagement.js  ← moteur canonique
│   │   ├── IDFactory.js             ← générateur systemId
│   │   └── policy-config-resolver.js
│   ├── repositories/
│   │   ├── adapters/
│   │   │   └── base44-adapter.js    ← pont vers Base44 SDK (Node)
│   │   ├── LedgerRecordRepository.js
│   │   ├── LedgerCodeMapRepository.js
│   │   └── index.js
│   ├── services/
│   └── adapters/
├── tests/p0/                     ← 46 tests (tous PASSED)
├── scripts/                      ← outils one-shot
├── codeBase44_v3/                ← EXPORT LOCAL BASE44 (référence seulement)
│   ├── base44/
│   │   ├── entities/*.jsonc      ← schémas des entités (lecture)
│   │   └── functions/            ← fonctions Deno (cloud Base44)
│   │       └── _port3TestImport/ ← fonction de validation PORT-3
│   ├── src/                      ← frontend React/Vite
│   └── dataBase/                 ← exports CSV
├── codeBase44_v2/                ← V2 référence (ne pas modifier)
└── codeBase44_v1/                ← V1 référence (ne pas modifier)
```

---

## CONVENTION DE DÉMARRAGE DE SESSION

Charger ce fichier en tête de session. Puis :
1. Vérifier le repo fourni (git log, ls src/)
2. Lancer la batterie P0 : `BASE44_API_KEY=dummy node tests/p0/*.js`
3. Confirmer 46/46 avant de commencer
4. Attaquer dans l'ordre : 1A-1 → 1A-2 → 1B-1 → 1B-2 → 1B-3

---

## PHRASE SOUVERAINE

*"Une capacité culturelle locale devient un engagement de prestation
vérifiable, puis un règlement économique, puis une mémoire territoriale."*