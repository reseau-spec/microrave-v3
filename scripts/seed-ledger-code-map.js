/**
 * MICRO RAVE V3 — scripts/seed-ledger-code-map.js
 * ============================================================
 * Peuple l'entité Base44 `LedgerCodeMap` depuis le plan
 * comptable LedgerCodeMap V4 (D-060 à D-060-E).
 *
 * Ce script est la migration unique qui transforme les
 * constantes hardcodées de FinancialLedgerService.js en
 * lignes de base de données conformes au Market Pivot.
 *
 * À exécuter UNE SEULE FOIS en production, puis à utiliser
 * pour tout ajout futur via LedgerCodeMapRepository.addCode().
 *
 * IDEMPOTENT : vérifie l'existence de chaque code avant
 * insertion — peut être relancé sans doublon.
 *
 * USAGE :
 *   node scripts/seed-ledger-code-map.js [--dry-run]
 *
 * Source : D-060, D-060-A, D-060-B, D-060-C · LedgerCodeMap V4
 * ============================================================
 */

'use strict';
require('dotenv').config();

const repo = require('../src/repositories/LedgerCodeMapRepository');

const DRY_RUN = process.argv.includes('--dry-run');

// ── Plan comptable complet V4 ─────────────────────────────────
// Chaque entrée : { code, type, description, category, jurisdiction, source, presentationOrder }
const LEDGER_CODE_MAP_V4 = [

  // ── COMPTES — Capitaux propres ────────────────────────────
  { code: '1100', type: 'ACCOUNT', category: 'CAPITAUX_PROPRES',    jurisdiction: '*',    presentationOrder: 10,  source: 'D-060', description: 'Actions ordinaires + primes d\'émission' },
  { code: '1150', type: 'ACCOUNT', category: 'CAPITAUX_PROPRES',    jurisdiction: '*',    presentationOrder: 11,  source: 'D-060', description: 'Actions préférentielles' },
  { code: '1200', type: 'ACCOUNT', category: 'CAPITAUX_PROPRES',    jurisdiction: '*',    presentationOrder: 12,  source: 'D-060', description: 'Bénéfices non distribués' },
  { code: '1300', type: 'ACCOUNT', category: 'CAPITAUX_PROPRES',    jurisdiction: '*',    presentationOrder: 13,  source: 'D-060', description: 'Résultat net de l\'exercice (compte de clôture)' },
  { code: '1400', type: 'ACCOUNT', category: 'CAPITAUX_PROPRES',    jurisdiction: '*',    presentationOrder: 14,  source: 'D-060', description: 'Actions propres (treasury stock)' },

  // ── COMPTES — Passifs LT ──────────────────────────────────
  { code: '1600', type: 'ACCOUNT', category: 'PASSIF_LT',           jurisdiction: '*',    presentationOrder: 20,  source: 'D-060', description: 'Dette long terme' },
  { code: '1700', type: 'ACCOUNT', category: 'PASSIF_LT',           jurisdiction: '*',    presentationOrder: 21,  source: 'D-060', description: 'Impôt différé' },
  { code: '1800', type: 'ACCOUNT', category: 'PASSIF_LT',           jurisdiction: '*',    presentationOrder: 22,  source: 'D-060', description: 'Intérêts minoritaires' },
  { code: '1900', type: 'ACCOUNT', category: 'PASSIF_LT',           jurisdiction: '*',    presentationOrder: 23,  source: 'D-060', description: 'Autres passifs LT' },

  // ── COMPTES — Actifs LT ───────────────────────────────────
  { code: '2100', type: 'ACCOUNT', category: 'ACTIF_LT',            jurisdiction: '*',    presentationOrder: 30,  source: 'D-060', description: 'Actifs incorporels (logiciels développés)' },
  { code: '2110', type: 'ACCOUNT', category: 'ACTIF_LT',            jurisdiction: '*',    presentationOrder: 31,  source: 'D-060', description: 'Amortissement cumulé — logiciels (contre-actif)' },
  { code: '2200', type: 'ACCOUNT', category: 'ACTIF_LT',            jurisdiction: '*',    presentationOrder: 32,  source: 'D-060', description: 'Dépôts et garanties versés' },
  { code: '2300', type: 'ACCOUNT', category: 'ACTIF_LT',            jurisdiction: '*',    presentationOrder: 33,  source: 'D-060', description: 'Investissements LT' },
  { code: '2600', type: 'ACCOUNT', category: 'ACTIF_LT',            jurisdiction: '*',    presentationOrder: 34,  source: 'D-060', description: 'PP&E (immobilisations corporelles)' },
  { code: '2610', type: 'ACCOUNT', category: 'ACTIF_LT',            jurisdiction: '*',    presentationOrder: 35,  source: 'D-060', description: 'Amortissement cumulé — immobilisations corporelles' },
  { code: '2700', type: 'ACCOUNT', category: 'ACTIF_LT',            jurisdiction: '*',    presentationOrder: 36,  source: 'D-060', description: 'Goodwill net' },
  { code: '2900', type: 'ACCOUNT', category: 'ACTIF_LT',            jurisdiction: '*',    presentationOrder: 37,  source: 'D-060', description: 'Autres actifs LT' },

  // ── COMPTES — Actifs courants ─────────────────────────────
  { code: '4110', type: 'ACCOUNT', category: 'ACTIF_COURANT',       jurisdiction: '*',    presentationOrder: 40,  source: 'D-060', description: 'Créances clients nettes' },
  { code: '4120', type: 'ACCOUNT', category: 'ACTIF_COURANT',       jurisdiction: 'QC-CA', presentationOrder: 41, source: 'D-060', description: 'TPS à récupérer (crédit de taxe sur intrants — CTI)' },
  { code: '4130', type: 'ACCOUNT', category: 'ACTIF_COURANT',       jurisdiction: 'QC-CA', presentationOrder: 42, source: 'D-060', description: 'TVQ à récupérer (remboursement taxe intrants — RTI)' },
  { code: '4190', type: 'ACCOUNT', category: 'ACTIF_COURANT',       jurisdiction: '*',    presentationOrder: 43,  source: 'D-060', description: 'Frais Stripe différés — événements non complétés' },

  // ── COMPTES — Passifs courants (talents / escrow) ─────────
  { code: '4310', type: 'ACCOUNT', category: 'PASSIF_COURANT',      jurisdiction: '*',    presentationOrder: 50,  source: 'D-060', description: 'Cachets talents nets à verser' },
  { code: '4320', type: 'ACCOUNT', category: 'PASSIF_COURANT',      jurisdiction: '*',    presentationOrder: 51,  source: 'D-060', description: 'Cachets talents en attente J-30 / annulation anticipée' },
  { code: '4325', type: 'ACCOUNT', category: 'PASSIF_COURANT',      jurisdiction: 'QC-CA', presentationOrder: 52, source: 'D-060', description: 'TPS de tiers en transit (talent, billetterie, sponsor)' },
  { code: '4326', type: 'ACCOUNT', category: 'PASSIF_COURANT',      jurisdiction: 'QC-CA', presentationOrder: 53, source: 'D-060', description: 'TVQ de tiers en transit (talent, billetterie, sponsor)' },
  { code: '4330', type: 'ACCOUNT', category: 'PASSIF_COURANT',      jurisdiction: '*',    presentationOrder: 54,  source: 'D-060', description: 'Commissions vendeurs événementielles à verser' },
  { code: '4335', type: 'ACCOUNT', category: 'PASSIF_COURANT',      jurisdiction: '*',    presentationOrder: 55,  source: 'D-060', description: 'Fonds Stripe Connect non ventilés — clearing temporaire' },
  { code: '4350', type: 'ACCOUNT', category: 'PASSIF_COURANT',      jurisdiction: '*',    presentationOrder: 56,  source: 'D-060', description: 'Billetterie à remettre aux ayants droit' },
  { code: '4360', type: 'ACCOUNT', category: 'PASSIF_COURANT',      jurisdiction: '*',    presentationOrder: 57,  source: 'D-060', description: 'Commissions vendeurs commandites à verser' },
  { code: '4365', type: 'ACCOUNT', category: 'PASSIF_COURANT',      jurisdiction: '*',    presentationOrder: 58,  source: 'D-060', description: 'Commissions vendeurs billetterie à verser' },
  { code: '4370', type: 'ACCOUNT', category: 'PASSIF_COURANT',      jurisdiction: '*',    presentationOrder: 59,  source: 'D-060', description: 'Commandites à remettre aux ayants droit' },

  // ── COMPTES — Revenus différés ────────────────────────────
  { code: '4530', type: 'ACCOUNT', category: 'PASSIF_COURANT',      jurisdiction: '*',    presentationOrder: 60,  source: 'D-060', description: 'Revenus différés événementiels (commissions MR en escrow)' },
  { code: '4535', type: 'ACCOUNT', category: 'PASSIF_COURANT',      jurisdiction: '*',    presentationOrder: 61,  source: 'D-060', description: 'Revenus différés SaaS / memberships' },
  { code: '4540', type: 'ACCOUNT', category: 'PASSIF_COURANT',      jurisdiction: '*',    presentationOrder: 62,  source: 'D-060', description: 'Revenus différés billetterie' },
  { code: '4541', type: 'ACCOUNT', category: 'PASSIF_COURANT',      jurisdiction: '*',    presentationOrder: 63,  source: 'D-060', description: 'Revenus différés — frais de service billetterie' },
  { code: '4545', type: 'ACCOUNT', category: 'PASSIF_COURANT',      jurisdiction: '*',    presentationOrder: 64,  source: 'D-060', description: 'Revenus différés commandites' },

  // ── COMPTES — Fiscal MR ───────────────────────────────────
  { code: '4410', type: 'ACCOUNT', category: 'PASSIF_COURANT',      jurisdiction: 'QC-CA', presentationOrder: 65, source: 'D-060', description: 'TPS perçue à remettre — fournitures MR (ARC)' },
  { code: '4420', type: 'ACCOUNT', category: 'PASSIF_COURANT',      jurisdiction: 'QC-CA', presentationOrder: 66, source: 'D-060', description: 'TVQ perçue à remettre — fournitures MR (RQ)' },
  { code: '4430', type: 'ACCOUNT', category: 'PASSIF_COURANT',      jurisdiction: 'ON-CA', presentationOrder: 67, source: 'D-060', description: 'HST perçue à remettre (Ontario — futur)' },
  { code: '4440', type: 'ACCOUNT', category: 'PASSIF_COURANT',      jurisdiction: '*',    presentationOrder: 68,  source: 'D-060', description: 'Autres taxes juridictionnelles à remettre' },
  { code: '4450', type: 'ACCOUNT', category: 'PASSIF_COURANT',      jurisdiction: '*',    presentationOrder: 69,  source: 'D-060', description: 'Impôt sur le résultat à payer' },

  // ── COMPTES — Fournisseurs / autres passifs courants ──────
  { code: '4510', type: 'ACCOUNT', category: 'PASSIF_COURANT',      jurisdiction: '*',    presentationOrder: 70,  source: 'D-060', description: 'Comptes fournisseurs' },
  { code: '4520', type: 'ACCOUNT', category: 'PASSIF_COURANT',      jurisdiction: '*',    presentationOrder: 71,  source: 'D-060', description: 'Charges à payer (accrued liabilities)' },
  { code: '4610', type: 'ACCOUNT', category: 'PASSIF_COURANT',      jurisdiction: '*',    presentationOrder: 72,  source: 'D-060', description: 'Dette CT (court terme)' },
  { code: '4620', type: 'ACCOUNT', category: 'PASSIF_COURANT',      jurisdiction: '*',    presentationOrder: 73,  source: 'D-060', description: 'Dette LT arrivant à échéance CT' },
  { code: '4690', type: 'ACCOUNT', category: 'PASSIF_COURANT',      jurisdiction: '*',    presentationOrder: 74,  source: 'D-060', description: 'Autres passifs courants' },

  // ── COMPTES — Liquidités ──────────────────────────────────
  { code: '5100', type: 'ACCOUNT', category: 'ACTIF_COURANT',       jurisdiction: '*',    presentationOrder: 80,  source: 'D-060', description: 'Compte Stripe — disponible' },
  { code: '5200', type: 'ACCOUNT', category: 'ACTIF_COURANT',       jurisdiction: '*',    presentationOrder: 81,  source: 'D-060', description: 'Compte Stripe — en attente de règlement' },
  { code: '5300', type: 'ACCOUNT', category: 'ACTIF_COURANT',       jurisdiction: '*',    presentationOrder: 82,  source: 'D-060', description: 'Compte bancaire principal (virement depuis Stripe)' },
  { code: '5400', type: 'ACCOUNT', category: 'ACTIF_COURANT',       jurisdiction: '*',    presentationOrder: 83,  source: 'D-060', description: 'Petite caisse / autres liquidités' },
  { code: '5500', type: 'ACCOUNT', category: 'ACTIF_COURANT',       jurisdiction: '*',    presentationOrder: 84,  source: 'D-060', description: 'Inventaire et stocks' },
  { code: '5900', type: 'ACCOUNT', category: 'ACTIF_COURANT',       jurisdiction: '*',    presentationOrder: 85,  source: 'D-060', description: 'Autres actifs courants' },

  // ── COMPTES — Frais de vente ──────────────────────────────
  { code: '6110', type: 'ACCOUNT', category: 'CHARGE_VENTE',        jurisdiction: '*',    presentationOrder: 90,  source: 'D-060', description: 'Frais Stripe — courtage événementiel' },
  { code: '6115', type: 'ACCOUNT', category: 'CHARGE_VENTE',        jurisdiction: '*',    presentationOrder: 91,  source: 'D-060', description: 'Frais Stripe — billetterie' },
  { code: '6116', type: 'ACCOUNT', category: 'CHARGE_VENTE',        jurisdiction: '*',    presentationOrder: 92,  source: 'D-060', description: 'Frais Stripe — commandites' },
  { code: '6119', type: 'ACCOUNT', category: 'CHARGE_VENTE',        jurisdiction: '*',    presentationOrder: 93,  source: 'D-060-A', description: 'Frais Stripe — écarts frais de paiement / frais processeur' },
  { code: '6120', type: 'ACCOUNT', category: 'CHARGE_VENTE',        jurisdiction: '*',    presentationOrder: 94,  source: 'D-060', description: 'Frais Stripe — abonnements SaaS' },
  { code: '6130', type: 'ACCOUNT', category: 'CHARGE_VENTE',        jurisdiction: '*',    presentationOrder: 95,  source: 'D-060', description: 'Frais Stripe Connect — transferts talents' },
  { code: '6140', type: 'ACCOUNT', category: 'CHARGE_VENTE',        jurisdiction: '*',    presentationOrder: 96,  source: 'D-060', description: 'Frais Stripe — remboursements absorbés' },
  { code: '6150', type: 'ACCOUNT', category: 'CHARGE_VENTE',        jurisdiction: '*',    presentationOrder: 97,  source: 'D-060', description: 'Commissions vendeurs — courtage événementiel' },
  { code: '6155', type: 'ACCOUNT', category: 'CHARGE_VENTE',        jurisdiction: '*',    presentationOrder: 98,  source: 'D-060', description: 'Commissions vendeurs — billetterie' },
  { code: '6160', type: 'ACCOUNT', category: 'CHARGE_VENTE',        jurisdiction: '*',    presentationOrder: 99,  source: 'D-060', description: 'Commissions vendeurs — commandites' },

  // ── COMPTES — Charges d'exploitation ─────────────────────
  { code: '6210', type: 'ACCOUNT', category: 'CHARGE_EXPLOITATION',  jurisdiction: '*',   presentationOrder: 100, source: 'D-060', description: 'Hébergement & infrastructure' },
  { code: '6220', type: 'ACCOUNT', category: 'CHARGE_EXPLOITATION',  jurisdiction: '*',   presentationOrder: 101, source: 'D-060', description: 'Frais de développement logiciel' },
  { code: '6230', type: 'ACCOUNT', category: 'CHARGE_EXPLOITATION',  jurisdiction: '*',   presentationOrder: 102, source: 'D-060', description: 'Marketing et acquisition' },
  { code: '6240', type: 'ACCOUNT', category: 'CHARGE_EXPLOITATION',  jurisdiction: '*',   presentationOrder: 103, source: 'D-060', description: 'Honoraires professionnels' },
  { code: '6250', type: 'ACCOUNT', category: 'CHARGE_EXPLOITATION',  jurisdiction: '*',   presentationOrder: 104, source: 'D-060', description: 'Assurances' },
  { code: '6260', type: 'ACCOUNT', category: 'CHARGE_EXPLOITATION',  jurisdiction: '*',   presentationOrder: 105, source: 'D-060', description: 'Télécommunications et logiciels SaaS tiers' },
  { code: '6270', type: 'ACCOUNT', category: 'CHARGE_EXPLOITATION',  jurisdiction: '*',   presentationOrder: 106, source: 'D-060', description: 'Frais bancaires et financiers (hors Stripe)' },
  { code: '6310', type: 'ACCOUNT', category: 'CHARGE_PERSONNEL',     jurisdiction: '*',   presentationOrder: 110, source: 'D-060', description: 'Salaires et traitements' },
  { code: '6320', type: 'ACCOUNT', category: 'CHARGE_PERSONNEL',     jurisdiction: '*',   presentationOrder: 111, source: 'D-060', description: 'Charges sociales patronales' },
  { code: '6330', type: 'ACCOUNT', category: 'CHARGE_PERSONNEL',     jurisdiction: '*',   presentationOrder: 112, source: 'D-060', description: 'Avantages sociaux' },
  { code: '6370', type: 'ACCOUNT', category: 'CHARGE_RD',            jurisdiction: '*',   presentationOrder: 113, source: 'D-060', description: 'R&D (Recherche & Développement)' },
  { code: '6410', type: 'ACCOUNT', category: 'CHARGE_DEPRECIATION',  jurisdiction: '*',   presentationOrder: 114, source: 'D-060', description: 'Dépréciation' },
  { code: '6510', type: 'ACCOUNT', category: 'CHARGE_FINANCIERE',    jurisdiction: '*',   presentationOrder: 115, source: 'D-060', description: 'Charges d\'intérêts' },
  { code: '6590', type: 'ACCOUNT', category: 'CHARGE_FINANCIERE',    jurisdiction: '*',   presentationOrder: 116, source: 'D-060', description: 'Autres charges financières' },
  { code: '6591', type: 'ACCOUNT', category: 'CHARGE_FINANCIERE',    jurisdiction: '*',   presentationOrder: 117, source: 'D-060', description: 'Ajustement d\'arrondi (rounding_adjustment — réconciliation mensuelle)' },
  { code: '6610', type: 'ACCOUNT', category: 'CHARGE_IMPOT',         jurisdiction: '*',   presentationOrder: 118, source: 'D-060', description: 'Charge d\'impôts sur le résultat' },
  { code: '6690', type: 'ACCOUNT', category: 'CHARGE_NON_RECURRENTE', jurisdiction: '*',  presentationOrder: 119, source: 'D-060-B', description: 'Charges fiscales absorbées — Doctrine Principal (usage restreint, voir D-060-B)' },

  // ── COMPTES — Revenus ─────────────────────────────────────
  { code: '7110', type: 'ACCOUNT', category: 'REVENU_COURTAGE',      jurisdiction: '*',   presentationOrder: 120, source: 'D-060', description: 'Commissions sur events complétés' },
  { code: '7120', type: 'ACCOUNT', category: 'REVENU_COURTAGE',      jurisdiction: '*',   presentationOrder: 121, source: 'D-060', description: 'Commissions sur events annulés (balance J-7 retenue)' },
  { code: '7130', type: 'ACCOUNT', category: 'REVENU_COURTAGE',      jurisdiction: '*',   presentationOrder: 122, source: 'D-060', description: 'Revenus d\'ajustement (suppléments, demandes complémentaires)' },
  { code: '7190', type: 'ACCOUNT', category: 'REVENU_COURTAGE',      jurisdiction: '*',   presentationOrder: 123, source: 'D-060', description: 'Remboursements / renversements courtage événementiel (contre-revenu)' },
  { code: '7210', type: 'ACCOUNT', category: 'REVENU_SAAS',          jurisdiction: '*',   presentationOrder: 124, source: 'D-060', description: 'Revenus SaaS reconnus — Plan Base' },
  { code: '7220', type: 'ACCOUNT', category: 'REVENU_SAAS',          jurisdiction: '*',   presentationOrder: 125, source: 'D-060', description: 'Revenus SaaS reconnus — Plan Pro' },
  { code: '7230', type: 'ACCOUNT', category: 'REVENU_SAAS',          jurisdiction: '*',   presentationOrder: 126, source: 'D-060', description: 'Revenus SaaS reconnus — Plan Studio' },
  { code: '7240', type: 'ACCOUNT', category: 'REVENU_SAAS',          jurisdiction: '*',   presentationOrder: 127, source: 'D-060', description: 'Revenus SaaS reconnus — Plan Fondateur' },
  { code: '7280', type: 'ACCOUNT', category: 'REVENU_SAAS',          jurisdiction: '*',   presentationOrder: 128, source: 'D-060', description: 'Revenus SaaS autres / legacy' },
  { code: '7290', type: 'ACCOUNT', category: 'REVENU_SAAS',          jurisdiction: '*',   presentationOrder: 129, source: 'D-060', description: 'Remboursements abonnements SaaS (contre-revenu)' },
  { code: '7320', type: 'ACCOUNT', category: 'REVENU_PRODUCTION',    jurisdiction: '*',   presentationOrder: 130, source: 'D-060', description: 'Revenus Ristourne Alcool Vendues' },
  { code: '7410', type: 'ACCOUNT', category: 'REVENU_BILLETTERIE',   jurisdiction: '*',   presentationOrder: 131, source: 'D-060', description: 'Revenus Billetterie Événements Micro Rave' },
  { code: '7415', type: 'ACCOUNT', category: 'REVENU_BILLETTERIE',   jurisdiction: '*',   presentationOrder: 132, source: 'D-060', description: 'Frais de service billetterie - événements transigés' },
  { code: '7420', type: 'ACCOUNT', category: 'REVENU_BILLETTERIE',   jurisdiction: '*',   presentationOrder: 133, source: 'D-060', description: 'Revenus billetterie annulée / non remboursable selon policy' },
  { code: '7490', type: 'ACCOUNT', category: 'REVENU_BILLETTERIE',   jurisdiction: '*',   presentationOrder: 134, source: 'D-060', description: 'Remboursements billetterie Micro Rave (contre-revenu)' },
  { code: '7510', type: 'ACCOUNT', category: 'REVENU_COMMANDITE',    jurisdiction: '*',   presentationOrder: 135, source: 'D-060', description: 'Revenus de commandites' },
  { code: '7515', type: 'ACCOUNT', category: 'REVENU_COMMANDITE',    jurisdiction: '*',   presentationOrder: 136, source: 'D-060', description: 'Revenus d\'activation commanditaire / publicité' },
  { code: '7520', type: 'ACCOUNT', category: 'REVENU_COMMANDITE',    jurisdiction: '*',   presentationOrder: 137, source: 'D-060', description: 'Revenus commandites annulées / livrables partiels selon policy' },
  { code: '7590', type: 'ACCOUNT', category: 'REVENU_COMMANDITE',    jurisdiction: '*',   presentationOrder: 138, source: 'D-060', description: 'Remboursements commandites / activation commanditaire (contre-revenu)' },
  { code: '7610', type: 'ACCOUNT', category: 'CHARGE_PRODUCTION',    jurisdiction: '*',   presentationOrder: 139, source: 'D-060', description: 'COGS pré-production événementielle' },
  { code: '7620', type: 'ACCOUNT', category: 'CHARGE_PRODUCTION',    jurisdiction: '*',   presentationOrder: 140, source: 'D-060', description: 'COGS production événementielle' },
  { code: '7630', type: 'ACCOUNT', category: 'CHARGE_PRODUCTION',    jurisdiction: '*',   presentationOrder: 141, source: 'D-060', description: 'COGS post-production événementielle' },
  { code: '7910', type: 'ACCOUNT', category: 'AUTRE_PRODUIT',        jurisdiction: '*',   presentationOrder: 142, source: 'D-060', description: 'Revenus d\'intérêts' },
  { code: '7990', type: 'ACCOUNT', category: 'AUTRE_PRODUIT',        jurisdiction: '*',   presentationOrder: 143, source: 'D-060', description: 'Produits exceptionnels / non récurrents' },

  // ── SKU CODES ─────────────────────────────────────────────
  { code: 'SKU-COURTAGE',     type: 'SKU', category: 'MOTEUR_ECONOMIQUE', jurisdiction: '*', presentationOrder: 1, source: 'D-060', description: 'Courtage événementiel — flux principal MR' },
  { code: 'SKU-SAAS',         type: 'SKU', category: 'MOTEUR_ECONOMIQUE', jurisdiction: '*', presentationOrder: 2, source: 'D-060', description: 'Abonnements SaaS memberships' },
  { code: 'SKU-BILLETTERIE',  type: 'SKU', category: 'MOTEUR_ECONOMIQUE', jurisdiction: '*', presentationOrder: 3, source: 'D-060', description: 'Billetterie événements' },
  { code: 'SKU-COMMANDITES',  type: 'SKU', category: 'MOTEUR_ECONOMIQUE', jurisdiction: '*', presentationOrder: 4, source: 'D-060', description: 'Commandites et activation commanditaire' },
  { code: 'SKU-INTERNE',      type: 'SKU', category: 'MOTEUR_ECONOMIQUE', jurisdiction: '*', presentationOrder: 5, source: 'D-060', description: 'Opérations internes / régularisations' },

  // ── PASSIFS FISCAUX (contreparties autorisées de 6690) ────
  { code: '4410', type: 'FISCAL_LIABILITY', category: 'FISCAL_QC', jurisdiction: 'QC-CA', presentationOrder: 1, source: 'D-060-B', description: 'TPS à remettre ARC — passif fiscal autorisé contrepartie 6690' },
  { code: '4420', type: 'FISCAL_LIABILITY', category: 'FISCAL_QC', jurisdiction: 'QC-CA', presentationOrder: 2, source: 'D-060-B', description: 'TVQ à remettre RQ — passif fiscal autorisé contrepartie 6690' },
  { code: '4430', type: 'FISCAL_LIABILITY', category: 'FISCAL_ON', jurisdiction: 'ON-CA', presentationOrder: 3, source: 'D-060-B', description: 'HST à remettre — passif fiscal autorisé contrepartie 6690 (Ontario)' },
  { code: '4440', type: 'FISCAL_LIABILITY', category: 'FISCAL_OTHER', jurisdiction: '*',  presentationOrder: 4, source: 'D-060-B', description: 'Autres taxes juridictionnelles — passif fiscal autorisé contrepartie 6690' },

  // ── INTERVENTION TYPES 6690 ───────────────────────────────
  { code: 'PRINCIPAL_TAX_REGULARIZATION_PILOT', type: 'INTERVENTION_TYPE', category: 'FISCAL_ABSORPTION', jurisdiction: '*', presentationOrder: 1, source: 'D-060-B', description: 'Régularisation fiscale — transaction pilote hors Checkout' },
  { code: 'PRINCIPAL_TAX_REGULARIZATION_ERROR', type: 'INTERVENTION_TYPE', category: 'FISCAL_ABSORPTION', jurisdiction: '*', presentationOrder: 2, source: 'D-060-B', description: 'Régularisation fiscale — erreur de facturation détectée a posteriori' },
  { code: 'PRINCIPAL_TAX_REGULARIZATION_AUDIT', type: 'INTERVENTION_TYPE', category: 'FISCAL_ABSORPTION', jurisdiction: '*', presentationOrder: 3, source: 'D-060-B', description: 'Régularisation fiscale — suite à audit interne ou externe' },
];

// ── Main ──────────────────────────────────────────────────────
async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║  Seed LedgerCodeMap V4 — Market Pivot conforme          ║');
  console.log(`║  Mode : ${DRY_RUN ? 'DRY-RUN (aucune écriture)         ' : 'LIVE — écriture en base             '}  ║`);
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log(`\n  ${LEDGER_CODE_MAP_V4.length} entrées à traiter\n`);

  let inserted = 0;
  let skipped  = 0;
  let errors   = 0;

  // Charger l'existant pour idempotence
  let existing = new Set();
  try {
    const cache = await repo.loadCache();
    // Clé d'unicité : code + type
    for (const row of cache.allRows) {
      existing.add(`${row.code}::${row.type}`);
    }
    console.log(`  ${existing.size} entrées déjà en base\n`);
  } catch (e) {
    console.log('  Base vide ou inaccessible — insertion complète\n');
  }

  for (const entry of LEDGER_CODE_MAP_V4) {
    const key = `${entry.code}::${entry.type}`;
    if (existing.has(key)) {
      skipped++;
      continue;
    }

    if (DRY_RUN) {
      console.log(`  [DRY] INSÉRER : ${entry.code} (${entry.type}) — ${entry.description}`);
      inserted++;
      continue;
    }

    try {
      await repo.addCode(entry);
      console.log(`  ✓ ${entry.code} (${entry.type})`);
      inserted++;
    } catch (err) {
      console.error(`  ✗ ${entry.code} (${entry.type}) — ${err.message}`);
      errors++;
    }
  }

  console.log('\n' + '─'.repeat(58));
  console.log(`  Insérés : ${inserted} | Existants : ${skipped} | Erreurs : ${errors}`);
  if (errors === 0) {
    console.log('  ✓ LedgerCodeMap V4 en base — Market Pivot activé');
  } else {
    console.log('  ✗ Erreurs détectées — corriger avant lancement');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('\n ❌ ERREUR FATALE :', err.message);
  process.exit(1);
});