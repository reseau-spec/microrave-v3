/**
 * MICRO RAVE V3 — PolicyConfig fondamentales
 * ============================================================
 * Les 12 configurations à insérer en database AVANT d'écrire
 * la moindre logique financière.
 *
 * UTILISATION :
 * Ce fichier définit la structure. Les valeurs sont dans ce tableau.
 * À insérer dans la table policy_config de Base44 manuellement
 * ou via un script d'initialisation.
 *
 * RÈGLE : Aucune de ces valeurs ne doit apparaître dans le code.
 *         Tout passe par getConfig('clé').
 * ============================================================
 */

const POLICY_CONFIGS_FONDAMENTALES = [
  // ── STRIPE ─────────────────────────────────────────────────
  {
    key:         'stripe_ppm',
    value:       '29000',
    value_type:  'PPM',
    category:    'STANDARD',
    description: 'Taux Stripe en parts par million. 29000 = 2.9%. Formule: ceil(sous_total * stripe_ppm / 1_000_000) + stripe_fixe_cents'
  },
  {
    key:         'stripe_fixe_cents',
    value:       '30',
    value_type:  'CENTS',
    category:    'STANDARD',
    description: 'Frais fixe Stripe par transaction en cents. 30 = 0.30$'
  },

  // ── FISCALITÉ ───────────────────────────────────────────────
  {
    key:         'payment_fees_tax_treatment',
    value:       'DEBOURS',
    value_type:  'ENUM',
    category:    'CRITIQUE',
    description: 'Traitement fiscal des frais Stripe. DEBOURS = remboursement de débours non taxable. TAXABLE_SERVICE = fourniture taxable. ABSENT = BLOCAGE ABSOLU (fail-closed). Valeur explicite obligatoire — jamais héritée.'
  },
  {
    key:         'tps_ppm',
    value:       '50000',
    value_type:  'PPM',
    category:    'CRITIQUE',
    description: 'Taux TPS en parts par million. 50000 = 5.0%. Base taxable = prix_vendu_client (jamais la commission MR).'
  },
  {
    key:         'tvq_ppm',
    value:       '99750',
    value_type:  'PPM',
    category:    'CRITIQUE',
    description: 'Taux TVQ en parts par million. 99750 = 9.975%. Base taxable = prix_vendu_client.'
  },

  // ── WATERFALL ───────────────────────────────────────────────
  {
    key:         'free_weight_cents',
    value:       '100',
    value_type:  'CENTS',
    category:    'STANDARD',
    description: 'Poids symbolique en cents attribué à un talent signé à 0$. Permet la répartition anti-extraction. 100 = 1.00$. LOI FREE-WEIGHT-01.'
  },

  // ── PAIEMENTS ───────────────────────────────────────────────
  {
    key:         'event_payment_cap_cents',
    value:       '350000',
    value_type:  'CENTS',
    category:    'CRITIQUE',
    description: 'Plafond MVP par event en cents. 350000 = 3500$ CAD. Exception contrôlée à 500000 avec SoloFounderOverride.'
  },
  {
    key:         'deposit_ratio_ppm',
    value:       '200000',
    value_type:  'PPM',
    category:    'STANDARD',
    description: 'Ratio du dépôt sur le total en parts par million. 200000 = 20%. Réserve le Lineup complet — pas un talent individuel.'
  },

  // ── LEDGER — PLAN COMPTABLE ─────────────────────────────────
  {
    key:         'ledger_4310',
    value:       'talent_payable',
    value_type:  'STRING',
    category:    'OPERATIONNEL',
    description: 'Compte 4310 — Talent payable. Passif civil envers le talent. Net talent = prix_vendu - commission_MR.'
  },
  {
    key:         'ledger_4325',
    value:       'tps_fourniture_a_remettre',
    value_type:  'STRING',
    category:    'OPERATIONNEL',
    description: 'Compte 4325 — TPS liée à la fourniture événementielle. Passif fiscal envers l\'État. Doctrine A : 4325 = TPS sur prix_vendu_total. 4410 = 0 à l\'encaissement.'
  },
  {
    key:         'ledger_4326',
    value:       'tvq_fourniture_a_remettre',
    value_type:  'STRING',
    category:    'OPERATIONNEL',
    description: 'Compte 4326 — TVQ liée à la fourniture événementielle. Passif fiscal envers l\'État. Doctrine A : 4326 = TVQ sur prix_vendu_total.'
  },
  {
    key:         'ledger_4530',
    value:       'revenus_differes_mr',
    value_type:  'STRING',
    category:    'OPERATIONNEL',
    description: 'Compte 4530 — Revenus différés Micro Rave. Commission MR reconnue SEULEMENT à l\'archivage (→ 7110). Jamais à l\'encaissement.'
  },
];

/**
 * Retourne la liste des configs fondamentales.
 * Utiliser pour initialiser la database ou vérifier la conformité.
 */
function getFoundationalConfigs() {
  return POLICY_CONFIGS_FONDAMENTALES;
}

/**
 * Vérifie qu'une config est dans la liste fondamentale.
 */
function isFundamental(key) {
  return POLICY_CONFIGS_FONDAMENTALES.some(c => c.key === key);
}

module.exports = { getFoundationalConfigs, isFundamental, POLICY_CONFIGS_FONDAMENTALES };
