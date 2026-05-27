# AMENDEMENT STATE.md V2 — Correction PORT-1
# Date : 27 mai 2026
# Source : Décision Fil Souverain post-arbitrage Q1/Q2
# Origine technique : audit du périmètre réel sur le repo extrait

────────────────────────────────────────────────────────────────────
BLOC 1 — SECTION 2, TÂCHE PORT-1 : remplacer le bloc entier par :
────────────────────────────────────────────────────────────────────

─────────────────────────────────────────────────────
TÂCHE PORT-1 — CONVERTIR LE REPO NODE.JS → ESM (BASCULE GLOBALE)
─────────────────────────────────────────────────────

STRATÉGIE : Option B — bascule globale via "type": "module" dans
package.json. Un seul format dans le repo. Conforme à D-001 :
"src/ fait loi, un seul format". Pas de coexistence CJS/ESM.

PÉRIMÈTRE RÉEL PORT-1 (mesuré sur le repo) :
  src/core/             : 4 fichiers
  src/core/guards/      : 20 fichiers
  src/services/         : 11 fichiers
  src/repositories/     : 14 fichiers  ← inclus (dépendance transitive)
  src/adapters/base44/  : 2 fichiers   ← inclus
  config/               : 1 fichier    ← inclus
  tests/p0/             : 44 fichiers  ← inclus (sinon DONE impossible)
  scripts/cron.js       : 1 fichier
  TOTAL RÉEL            : ~97 fichiers (pas 35)

JUSTIFICATION DE L'EXTENSION DU PÉRIMÈTRE :
  src/core/policy-config-resolver.js importe transitivement
  src/repositories/PolicyConfigRepository et
  config/policy-config-schema.js. Si ces fichiers restent en CJS
  pendant que src/core/ est en ESM, l'import chain casse à
  l'exécution. PORT-1 sans eux ne peut pas satisfaire sa définition
  de DONE. Idem pour tests/p0/*.js qui require() src/core/ — un
  test CJS ne peut pas require() un module ESM (ERR_REQUIRE_ESM).

TRANSFORMATION UNIQUE PAR FICHIER :
  package.json : ajouter "type": "module"
  *.js         : require(X)                      → import X from './X.js'
                 const { Y } = require('./X')    → import { Y } from './X.js'
                 module.exports = { X, Y }       → export { X, Y }
                 module.exports = X              → export default X
                                                   (et adapter les consommateurs)
                 __dirname / __filename / require → fileURLToPath(import.meta.url)
                                                   + createRequire si nécessaire
  Extension    : garder .js (Node 20+ supporte ESM .js via type:module)
  Chemins      : ESM exige l'extension explicite dans les imports relatifs
                 ('./X' devient './X.js'). Aucune exception.

DURÉE ESTIMÉE CORRIGÉE : 2 sessions (pas 1).

ORDRE DE CONVERSION (feuille de route, par dépendances) :
  Batch 1 — Feuilles pures (zéro dépendance src/) :
    src/core/IDFactory.js
    src/core/MoneyMath.js
    config/policy-config-schema.js

  Batch 2 — Guards purs (dépendent de Batch 1 uniquement) :
    guards/*.js sans usage de repositories

  Batch 3 — Repositories + adapters base44 (Node HTTP) :
    src/repositories/*.js (14 fichiers)
    src/adapters/base44/*.js (2 fichiers)

  Batch 4 — Guards avec repositories :
    guards/*.js qui utilisent repositories.X

  Batch 5 — Services (dépendent de Batch 1-4) :
    FinancialLedgerService, PayoutExecutor, StripeAdapter,
    StripeConnectService, WebhookProcessor, SessionPresenceService,
    SOTSSubmissionService, SchedulerService, MembershipPlanService,
    EngagementAmendmentService, SignalConsumerService

  Batch 6 — Orchestrateurs :
    src/core/transitionEngagement.js
    src/core/policy-config-resolver.js

  Batch 7 — Tests + scripts :
    tests/p0/*.js (44 fichiers)
    scripts/cron.js
    stripe-webhook-proxy/*.js

DONE QUAND (définition inchangée, mesurée par 2 conditions vérifiables) :
  (1) node tests/p0/TRANSITION-01.js → 34/34 PASSED
      (sans --experimental-vm-modules : avec type:module, Node 20
       résout les imports ESM nativement)
  (2) grep -rn "require(" src/ tests/ scripts/ config/ → 0 résultat
      (sauf createRequire intentionnel pour interop, à documenter ligne par ligne)

────────────────────────────────────────────────────────────────────
BLOC 2 — SECTION 1, ÉTAT DES TÂCHES : remplacer la ligne PORT-1 :
────────────────────────────────────────────────────────────────────

AVANT :
  ❌  PORT-1  Convertir src/core/*.js et src/services/*.js → ESM

APRÈS :
  ❌  PORT-1  Conversion ESM globale (~97 fichiers · type:module · 2 sessions)

────────────────────────────────────────────────────────────────────
NOTE ARCHITECTURALE (à ajouter en SECTION 4) :
────────────────────────────────────────────────────────────────────

7. PORT-1 amendé le 27 mai 2026. L'estimation initiale "35 fichiers,
   1 session" sous-estimait la cascade transitive. Le périmètre réel
   est ~97 fichiers répartis sur 7 batchs, 2 sessions. C'est la
   Règle 4 ("Pourquoi la correction ne peut-elle pas être dans src/ ?")
   appliquée à l'estimation elle-même : la convertir vite et partielle
   produirait un "passed: true sans vérification réelle" (Règle 2)
   parce que les tests P0 ne pourraient pas tourner sur du code mixte
   CJS/ESM. L'amendement préserve l'invariant "DONE = tests PASSED".

────────────────────────────────────────────────────────────────────
FIN DE L'AMENDEMENT
Mise à jour suivante du STATE.md : après PORT-1 complète (Batch 7 inclus)
────────────────────────────────────────────────────────────────────
