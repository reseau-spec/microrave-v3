/**
 * MICRO RAVE V3 — Seed de database — PAS du code métier
 * ============================================================
 * RÔLE UNIQUE : insérer ces valeurs UNE FOIS en database.
 *
 * RÈGLES ABSOLUES :
 * - Ce fichier n'est JAMAIS importé dans la logique de calcul.
 * - La logique passe toujours par getConfig('clé').
 * - Modifier une valeur ici sans l'insérer en database = aucun effet.
 * - Les valeurs financières vivent en database, pas dans ce fichier.
 * - Ce fichier est un point d'entrée pour l'initialisation uniquement.
 *
 * Source : OS V10 section 3.2 — aucune constante financière dans le code.
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

  // ── CONDITIONS DE PAYOUT ET PRÉSENCE (A-056, A-057) ───────
  //
  // Logique de validation de présence (Condition 4 + Condition 5) :
  //
  //   Condition 4 — GPS :
  //     distance réelle ≤ maxDistancePolicy (mètres)
  //
  //   Condition 5 — Durée :
  //     La règle s'applique en deux couches :
  //       a) Si durée contractuelle connue (ContractSnapshot.durationMinutes présent) :
  //          durée_réelle ≥ max(minDurationFloorMinutes, durée_contractuelle × minDurationRatioPpm / 1_000_000)
  //       b) Si durée contractuelle absente (champ non renseigné) :
  //          durée_réelle ≥ minDurationFloorMinutes (plancher absolu)
  //
  //   Les deux clés sont indépendantes et malléables en database.
  //   Modifier l'une n'affecte pas l'autre.
  //   Source : D-075 Condition 5 — OS V14
  //
  {
    key:         'maxDistancePolicy',
    value:       '500',
    value_type:  'INTEGER',
    category:    'CRITIQUE',
    description: 'A-056 : Distance maximale en mètres tolérée entre la position GPS du talent et le lieu de l\'événement pour valider la Condition 4 de présence. Malléable en database — jamais codé en dur. Valeur ratifiée par le fondateur le 2026-05-20.'
  },
  {
    key:         'minDurationFloorMinutes',
    value:       '30',
    value_type:  'INTEGER',
    category:    'CRITIQUE',
    description: 'A-057a : Plancher absolu de durée de présence en minutes. S\'applique toujours, même si la durée contractuelle est absente du ContractSnapshot. La règle complète est : max(minDurationFloorMinutes, durée_contractuelle × minDurationRatioPpm / 1_000_000). Malléable en database — jamais codé en dur. Valeur ratifiée par le fondateur le 2026-05-20.'
  },
  {
    key:         'minDurationRatioPpm',
    value:       '950000',
    value_type:  'PPM',
    category:    'CRITIQUE',
    description: 'A-057b : Ratio minimal de présence en ppm exprimé en fraction de la durée contractuelle. 950000 = 95%. S\'applique quand ContractSnapshot.durationMinutes est présent. La règle complète est : max(minDurationFloorMinutes, durée_contractuelle × minDurationRatioPpm / 1_000_000). Malléable en database — jamais codé en dur. Valeur ratifiée par le fondateur le 2026-05-20.'
  },

  // ── ENGAGEMENT AMENDMENT (D-147) ───────────────────────────
  //
  // Paramètres du sous-processus d'extension de plage horaire.
  // Tous malléables en database — jamais codés en dur.
  // Source : D-147 · OS V14 section 2.7.2 · EngagementAmendmentPolicyConfig
  //
  {
    key:         'amendment_max_extension_minutes',
    value:       '180',
    value_type:  'INTEGER',
    category:    'STANDARD',
    description: 'D-147 : Extension maximale autorisée en minutes au-delà de la durée contractuelle originale. 180 = 3h max. Malléable en database — jamais codé en dur.',
  },
  {
    key:         'amendment_require_double_consent',
    value:       'true',
    value_type:  'BOOLEAN',
    category:    'CRITIQUE',
    description: 'D-147 Condition 2 : Double consentement talent + organisateur obligatoire. true = talentConsentAt et organizerConsentAt obligatoires. Malléable en database — jamais codé en dur.',
  },

  // ── FENÊTRE DE CONTESTATION (D-019-B) ──────────────────────
  {
    key:         'contestationWindowDurationHours',
    value:       '24',
    value_type:  'INTEGER',
    category:    'CRITIQUE',
    description: 'D-019-B : Durée en heures de la fenêtre de contestation ouverte après sots_window_closed. Passé ce délai sans litige, la transition contestation_window → payable est déclenchée automatiquement par SchedulerDueTask. Malléable en database — jamais codé en dur. Valeur ratifiée par le fondateur le 2026-05-20.'
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

// ── Clés critiques exportées pour validateCriticalConfigs() ──
// Source unique de vérité — une seule liste à maintenir.
// Ajouter une config CRITIQUE ici = elle est automatiquement
// validée au démarrage. Zéro liste à maintenir dans deux endroits.
// Source : OS V10 section 9.6 — configs critiques double validation.
const CRITICAL_CONFIG_KEYS = POLICY_CONFIGS_FONDAMENTALES
  .filter(c => c.category === 'CRITIQUE')
  .map(c => c.key);

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

module.exports = {
  getFoundationalConfigs,
  isFundamental,
  POLICY_CONFIGS_FONDAMENTALES,
  CRITICAL_CONFIG_KEYS,
};