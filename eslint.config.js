// eslint.config.js — Micro Rave V3
// ESLint flat config (Node 22, ESLint v9+)
// Règle centrale : D-063 — aucun Math.floor/ceil/round libre dans le code métier.
// EXCEPTION UNIQUE : src/core/MoneyMath.js est le seul fichier autorisé.

'use strict';

module.exports = [
  // ── Règle globale : bannir Math.floor / Math.ceil / Math.round ────────────
  {
    files: ['src/**/*.js', 'tests/**/*.js'],
    rules: {
      'no-restricted-syntax': [
        'error',
        // Math.floor(...)
        {
          selector: "CallExpression[callee.type='MemberExpression'][callee.object.name='Math'][callee.property.name='floor']",
          message:
            '[D-063] Math.floor interdit dans le code métier. ' +
            'Utiliser MoneyMath.applyRatePpm(), MoneyMath.prorataCents(), ' +
            'MoneyMath.lineupCoefficientPpm() ou MoneyMath.depositAmount() selon le cas. ' +
            'Seul src/core/MoneyMath.js peut appeler Math.floor directement.',
        },
        // Math.ceil(...)
        {
          selector: "CallExpression[callee.type='MemberExpression'][callee.object.name='Math'][callee.property.name='ceil']",
          message:
            '[D-063] Math.ceil interdit dans le code métier. ' +
            'Tout arrondi vers le haut doit passer par MoneyMath. ' +
            'Seul src/core/MoneyMath.js peut appeler Math.ceil directement.',
        },
        // Math.round(...)
        {
          selector: "CallExpression[callee.type='MemberExpression'][callee.object.name='Math'][callee.property.name='round']",
          message:
            '[D-063] Math.round interdit dans le code métier. ' +
            'Tout arrondi doit passer par MoneyMath. ' +
            'Seul src/core/MoneyMath.js peut appeler Math.round directement.',
        },
      ],
    },
  },

  // ── Exception : MoneyMath.js seul a le droit d'appeler Math.floor/ceil/round ─
  {
    files: ['src/core/MoneyMath.js'],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },
];