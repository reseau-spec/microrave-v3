# DETTES TECHNIQUES DÉTECTÉES PENDANT PORT-1
# Date : 27 mai 2026
# Règle 2 — tripwire linguistique : signaler, ne pas corriger inline.
# Ces points seront à traiter dans une phase ultérieure ou via D-XXX.

────────────────────────────────────────────────────────────────────
DETTE-PORT-001 — Imports orphelins dans FinancialLedgerService.js
────────────────────────────────────────────────────────────────────

Fichier : src/services/FinancialLedgerService.js
Ligne   : 105 (avant conversion)

Code original :
  const { StripeReferenceGuard, Account6690DualApprovalGuard } =
    require('../core/guards/StripeReferenceGuard');

Problème :
  StripeReferenceGuard.js n'exporte PAS de propriétés portant ces noms.
  Il exporte 6 fonctions plates :
    validateStripeReference, verifyStripeTransferGroup,
    VALID_STRIPE_PREFIXES, STRIPE_TRANSACTION_TYPES,
    validateAccount6690DualApproval,
    ACCOUNT_6690_DUAL_APPROVAL_THRESHOLD_CENTS

  En CJS, le destructuring assignait silencieusement undefined.
  En ESM strict, le comportement reste le même (named imports
  manquants donnent undefined sans erreur de chargement, mais
  Node 20 émet un warning si on essaie d'accéder).

Impact :
  Aucun impact runtime : les variables StripeReferenceGuard et
  Account6690DualApprovalGuard ne sont JAMAIS utilisées dans
  FinancialLedgerService.js (vérifié par grep). C'est du code
  mort dormant.

Action PORT-1 :
  Ma conversion ESM préserve la sémantique d'origine. Les imports
  destructurés transformés deviennent :
    import { StripeReferenceGuard, Account6690DualApprovalGuard }
      from '../core/guards/StripeReferenceGuard.js';
  → également undefined à l'exécution, comportement identique au CJS.

Action future (à arbitrer par fil souverain) :
  Soit (a) supprimer l'import mort, soit (b) ajouter les exports
  agrégés dans StripeReferenceGuard.js si l'intention était que
  ces objets existent. Le commentaire interne du fichier
  ("GUARD 1 — StripeReferenceGuard") suggère que l'intention était
  un namespace, pas des fonctions plates — option (b) plus probable,
  mais c'est une décision métier.

  ⚠️ Ne pas trancher pendant PORT-1 ; la transformation est
  mécanique par contrat. C'est exactement la Règle 4 : pourquoi
  la correction ne peut-elle pas être dans src/ ? Réponse :
  parce qu'elle est dans src/ — il manque un export. Inscrire
  la dette plutôt que la propager.

────────────────────────────────────────────────────────────────────
DETTE-PORT-002 — repositories/index.js n'est pas exporté du package
────────────────────────────────────────────────────────────────────

Le adapteur Node HTTP du SDK Base44 (src/repositories/index.js) est
distinct du futur src/repositories/adapters/base44-adapter.ts qui
sera créé en PORT-2 pour le runtime Deno. Cette dualité est
légitime (cf. décision fil souverain Q2/réponse). À documenter
clairement dans SECTION 4 de STATE.md V2 après PORT-2 pour éviter
qu'un futur lecteur prenne ça pour une bifurcation au sens D-001.

────────────────────────────────────────────────────────────────────

────────────────────────────────────────────────────────────────────
DETTE-PORT-003 — require('stripe') dynamique lazy dans StripeAdapter
────────────────────────────────────────────────────────────────────

Fichier : src/services/StripeAdapter.js, ligne 47 (CJS original)

Code original :
  _stripe = require('stripe')(key);

Pattern : require dynamique lazy intentionnel, pour différer le chargement
du SDK Stripe jusqu'à ce qu'une clé soit disponible. Le commentaire ligne 8
documente : "Ce module est le SEUL endroit où require('stripe') est appelé".

Action PORT-1 :
  Shim createRequire injecté en tête de fichier :
    import { createRequire as __createRequire } from 'node:module';
    const require = __createRequire(import.meta.url);
  Le require('stripe')(key) ligne 47 reste textuellement identique.
  Sémantique préservée : chargement synchrone lazy, comportement CJS.

Action future (à arbitrer) :
  Migrer vers import('stripe') dynamique (async). C'est un changement
  de signature (getStripe devient async), donc tous les appelants en
  amont doivent être await-és. Hors périmètre PORT-1 — c'est un
  changement de logique, pas de syntaxe.

────────────────────────────────────────────────────────────────────

────────────────────────────────────────────────────────────────────
DETTE-PORT-004 — require lazy intra-bloc dans transitionEngagement
────────────────────────────────────────────────────────────────────

Fichier : src/core/transitionEngagement.js, ligne 295 (CJS original)

Code original :
  if (rule.financialGuard) {
    const { COVERED_TRANSITIONS: ledgerCovered } =
      require('./guards/LedgerInvariantGuard');
    if (ledgerCovered.has(transitionKey)) { ... }
  }

Problème ESM : import statique interdit à l'intérieur d'un bloc.

Choix de correction PORT-1 :
  LedgerInvariantGuard est déjà importé en default au top-level
  (ligne 63 : import LedgerInvariantGuard from './guards/LedgerInvariantGuard.js').
  Le convertisseur émet maintenant default + named pour chaque module,
  donc LedgerInvariantGuard.COVERED_TRANSITIONS est accessible sans
  réimport. Code après correction :
    if (rule.financialGuard) {
      const ledgerCovered = LedgerInvariantGuard.COVERED_TRANSITIONS;
      if (ledgerCovered.has(transitionKey)) { ... }
    }

Sémantique : strictement identique au CJS d'origine (même valeur,
même moment d'évaluation — l'accès à .COVERED_TRANSITIONS est lazy
au moment où le bloc s'exécute, comme l'était le require()).

Raison du lazy require d'origine probable : éviter une dépendance
circulaire au chargement du module. À vérifier en exécution des tests.
Si une circularité ré-émerge, fallback : utiliser dynamic import
async dans le bloc (la fonction est déjà async).

────────────────────────────────────────────────────────────────────

────────────────────────────────────────────────────────────────────
DETTE-PORT-005 — Test LEDGER-V4-01 T-21 pré-existant échec
────────────────────────────────────────────────────────────────────

Fichier : tests/p0/LEDGER-V4-01.js, test T-21 ligne 475
Symbole manquant : LedgerRepository.findByTransactionGroupId

Constat :
  Le test attend que LedgerRepository expose findByTransactionGroupId().
  Cette méthode n'existe pas dans src/repositories/LedgerRepository.js
  ni dans la version pristine CJS (vérifié par grep). Le test échouait
  donc déjà AVANT PORT-1. C'est une dette pré-existante exposée par
  l'inventaire actuel.

Évaluation :
  - Le test LEDGER-V4-01 affiche maintenant "24 passés · 1 échoués"
    au lieu de l'erreur SyntaxError ESM précédente. C'est une
    amélioration substantielle (24 assertions passent).
  - Le seul échec T-21 attend une méthode non implémentée.

Action future (à arbitrer par fil souverain) :
  Soit (a) implémenter findByTransactionGroupId() dans LedgerRepository
  (méthode probablement nécessaire pour vérifier l'intégrité d'un TXG),
  soit (b) retirer le test T-21 s'il n'est plus pertinent.

  Hors périmètre PORT-1 — pas une régression de la conversion ESM.

────────────────────────────────────────────────────────────────────

────────────────────────────────────────────────────────────────────
DETTE-PORT-006 — Confusion LedgerRepository / LedgerCodeMapRepository
────────────────────────────────────────────────────────────────────

Fichier : src/repositories/LedgerRepository.js
Symboles : LedgerRepository.append, LedgerRepository.findByEngagementId, etc.

Constat :
  Le fichier nommé LedgerRepository.js contient en réalité le code
  de LedgerCodeMapRepository (validation des comptes/SKU codes du
  LedgerCodeMap V4 — pas la persistance des LedgerRecord). Le fichier
  expose : getValidAccounts, getValidSkuCodes, isValid, findByCode...
  mais NE expose PAS : append, findByEngagementId, findByTransactionGroupId.

  L'index src/repositories/index.js importe :
    import LedgerRepository from './LedgerRepository.js';
  puis alias :
    ledger:         LedgerRepository,
    ledgerRecords:  LedgerRepository,  // alias interface PayoutExecutor D-101

  → repositories.ledger et repositories.ledgerRecords pointent vers
  un objet qui n'a PAS append(), donc tout appel comme
  repositories.ledger.append(...) lance "append is not a function".

État :
  Bug pré-existant à PORT-1 (confirmé par grep sur le pristine CJS).
  Le test REPOSITORIES-01 expose ce bug (6 échecs T-01..T-04, T-27, T-28).
  PORT-1 ne l'a ni introduit ni amplifié.

Impact suspect :
  Si transitionEngagement() appelle repositories.ledgerRecords.append()
  en chemin nominal, le pilote Pierre de Rosette a dû le faire via
  un autre chemin (peut-être Base44 SDK direct, hors src/) — ce qui
  est précisément le pattern bypass que D-001 demande d'éliminer.

Action future (à arbitrer par fil souverain — PRIORITÉ ÉLEVÉE) :
  Soit (a) renommer le fichier en LedgerCodeMapRepository.js et créer
  un vrai LedgerRepository.js avec append/findBy*, soit (b) ajouter
  les méthodes manquantes à LedgerCodeMapRepository (mauvais nom),
  soit (c) découvrir où le pilote a écrit ses LDG-* (probablement
  via base44.entities.LedgerRecord direct, à canoniser).

  Critique pour PHASE 3 (réalignement Base44) : aucune fonction
  Base44 ne pourra appeler une logique src/ qui écrit dans le ledger
  tant que ce bug n'est pas résolu.

────────────────────────────────────────────────────────────────────
