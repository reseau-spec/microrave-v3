# DETTE-PORT-002 — FERMÉE (contrainte permanente de runtime)

**Date de fermeture :** 28 mai 2026  
**Article 5 déclenché :** oui — déploiement réel, invalidation d'hypothèse

---

## Demande originale

Consolider les 13 blocs `createBase44Repositories` inline (un par fonction Deno)  
vers un module partagé `codeBase44_v3/shared/base44-repositories.js`.

## Ce qui a été tenté

PHASE 3 a créé `codeBase44_v3/shared/` et remplacé les 13 blocs inline  
par des imports relatifs `../../shared/base44-repositories.js`.  
Tests locaux : 425/425 PASSED.

## Résultat du déploiement

```
Deployment Error
The deployment failed: Module not found "file:///shared/base44-repositories.js".
```

Le runtime Deno cloud Base44 résout `../../shared/base44-repositories.js`  
en `file:///shared/base44-repositories.js`. Les segments `../` sont ignorés.  
Le chemin est ancré à la racine du filesystem virtuel — `shared/` n'existe pas là.

## Investigation documentation Base44

Source : docs.base44.com/developers/backend/overview/project-structure

Structure documentée :
```
functions/
  <function-name>/
    entry.ts
    function.jsonc   ← optionnel (nom custom + automations uniquement)
```

**Aucun** `deno.json`, `import_map.json`, ni mécanisme de modules partagés  
n'est documenté dans Base44. Chaque `entry.ts` est un îlot autonome.

## Décision

Les 13 blocs inline `createBase44Repositories` sont le **pattern correct et définitif**  
pour le runtime Base44. Non-négociable jusqu'à changement de plateforme.

Ce n'est pas une violation de la doctrine — c'est le prix d'entrée du runtime.  
La logique métier reste dans `src/core/` (unique, souveraine).  
Le bloc inline est un driver d'environnement (dupliqué, inévitable).

```
Fonction Base44
  └── bloc inline createBase44Repositories()   ← driver d'environnement (×13, inévitable)
        └── appelle src/core/transitionEngagement.js  ← logique métier (unique, souveraine)
```

## Ce qui reste dans le repo

`codeBase44_v3/shared/` est **conservé comme référence documentaire** :  
- `shared/base44-repositories.js` — contrat canonique du bloc inline (non déployé)  
- `shared/transition-rules.js` — référence des règles de transition (non déployé)  
- `shared/financial-helpers.js` — référence des helpers financiers (non déployé)

Ces fichiers ne sont **jamais déployés sur Base44**.  
Ils servent de vérité documentaire et sont couverts par `PORT-4-SHARED-01`  
qui valide la cohérence du contrat localement (Node ESM).

## Chemins vers la résolution future (si applicable)

- Changement de plateforme cloud (Deno Deploy, Cloudflare Workers) : résolu.
- Publication `npm:@microrave/shared` (registre privé) : résolu, coût opérationnel élevé.
- Support natif de `deno.json` / `import_map.json` par Base44 : résolu si documenté.
