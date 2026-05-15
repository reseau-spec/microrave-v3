# GUIDE D'IMPORT GITHUB — Micro Rave V3
## Pour quelqu'un qui débute avec GitHub

---

## CE QUE CE DOSSIER CONTIENT

Tout le code de fondation de l'Étape 0. Rien ne manque.
Il suffit de copier ce dossier dans votre repo GitHub local et de faire un commit.

---

## ÉTAPE 1 — Copier les fichiers dans votre repo local

Votre repo s'appelle **microrave-v3** et il est déjà sur votre ordinateur
(vous l'avez vu dans GitHub Desktop tout à l'heure).

1. Ouvrir **GitHub Desktop**
2. Cliquer sur **Show in Explorer** (ou Repository → Show in Explorer)
3. Vous voyez le dossier `microrave-v3` sur votre ordinateur
4. **Copier TOUS les fichiers** de ce zip dans ce dossier
   - Si le dossier est vide → tout coller dedans
   - Si des fichiers existent déjà → remplacer

---

## ÉTAPE 2 — Vérifier que vous êtes sur la branche `dev`

Dans GitHub Desktop, en haut au milieu :
- Vous devriez voir **Current branch : dev**
- Si vous voyez autre chose → cliquer et choisir `dev`

---

## ÉTAPE 3 — Faire votre premier commit

1. Dans GitHub Desktop, vous verrez tous les fichiers apparaître à gauche
   sous "Changes" avec des petits `+` verts
2. En bas à gauche, dans le champ **Summary** :
   écrire : `chore: fondations Étape 0 — IDFactory, PolicyConfig, Webhook test`
3. Cliquer sur le bouton bleu **Commit to dev**

---

## ÉTAPE 4 — Publier sur GitHub

1. Cliquer sur **Publish branch** (bouton bleu en haut à droite)
2. Cela envoie vos fichiers sur GitHub.com

---

## ÉTAPE 5 — Vérifier sur GitHub.com

1. Aller sur github.com/votre-compte/microrave-v3
2. Vous devriez voir tous vos fichiers dans la branche `dev`
3. Les branches `main` et `staging` restent vides pour l'instant — c'est normal

---

## ÉTAPE 6 — Protéger la branche `main`

Sur GitHub.com :
1. Aller dans **Settings** → **Branches**
2. Cliquer sur **Add branch protection rule**
3. Branch name pattern : `main`
4. Cocher **Require a pull request before merging**
5. Sauvegarder

Cela empêche d'écrire directement sur `main` par accident.

---

## STRUCTURE DES FICHIERS IMPORTÉS

```
microrave-v3/
│
├── README.md                          ← Description du projet
├── .gitignore                         ← Fichiers à NE PAS envoyer sur GitHub
├── .env.example                       ← Variables requises (sans les vraies valeurs)
├── package.json                       ← Dépendances npm
│
├── .github/
│   └── PULL_REQUEST_TEMPLATE.md       ← Checklist automatique pour chaque PR
│
├── src/
│   ├── core/
│   │   ├── IDFactory.js               ← Générateur d'identifiants souverains
│   │   └── policy-config-resolver.js  ← Accès configs avec fail-closed
│   │
│   ├── repositories/
│   │   └── PolicyConfigRepository.js  ← Interface d'accès aux configs
│   │
│   └── adapters/
│       └── base44/
│           └── PolicyConfigAdapter.js ← Couche Base44 (à connecter)
│
├── stripe-webhook-proxy/
│   └── index.js                       ← Proxy Stripe (si nécessaire)
│
├── config/
│   └── policy-config-schema.js        ← Les 12 configs à insérer en database
│
└── tests/
    └── p0/
        ├── IDFACTORY-01.js            ← Test : IDFactory fonctionne
        ├── WEBHOOK-RAWBODY-01.js      ← Test : Stripe raw body intact
        └── POLICYCONFIG-FAILCLOSED-01.js ← Test : fail-closed fonctionne
```

---

## APRÈS L'IMPORT — Quoi faire ensuite

### 1. Installer les dépendances (une seule fois)
Ouvrir un terminal dans le dossier `microrave-v3` et taper :
```
npm install
```

### 2. Exécuter les tests P0
```
npm run test:p0:idfactory
```
Vous devriez voir : `IDFACTORY-01 : ✓ PASSED`

### 3. Connecter Base44
Ouvrir `src/adapters/base44/PolicyConfigAdapter.js`
Remplacer les placeholders par les vrais appels Base44.

### 4. Insérer les 12 configs en database
Ouvrir `config/policy-config-schema.js`
Ce fichier contient les 12 valeurs à insérer dans Base44.

### 5. Tester le webhook Stripe
```
npm run test:p0:webhook
```

---

## RÈGLE D'OR POUR LES COMMITS

- Toujours travailler sur `dev`
- Pour passer sur `main` : créer une Pull Request dans GitHub
- Ne jamais écrire directement sur `main`
