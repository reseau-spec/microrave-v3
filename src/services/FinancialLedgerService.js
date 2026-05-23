/**
 * MICRO RAVE V3 — FinancialLedgerService
 * ============================================================
 * Service de persistance des écritures comptables en double-entrée.
 *
 * INVARIANT ABSOLU : chaque transaction est un groupe de lignes
 * dont la somme des DEBIT = la somme des CREDIT.
 * Aucun groupe n'est persisté si l'invariant est violé.
 *
 * Source : D-038 · D-060 · D-064 · LOI LEDGER-01 · LOI LEDGER-02
 *
 * LOI LEDGER-01 : Aucun revenu n'est reconnu tant que l'Engagement
 *   n'est pas archivé. La commission MR vit en 4530 (passif — revenu
 *   différé) jusqu'à archivage. Elle passe en 7110 (revenu) uniquement
 *   à l'archivage.
 *
 * LOI LEDGER-02 : sum(nets) + sum(commissions) + roundingCents
 *   = prix_vendu_client. Vérifié par LedgerInvariantGuard avant
 *   chaque transition financière.
 *
 * APPEND-ONLY : aucun DELETE, aucun UPDATE. Toute correction passe
 *   par une écriture compensatoire avec nouveau transactionGroupId.
 *   Source : LOI GREFFIER-01.
 *
 * Standard numérique : entiers en centimes (D-064). Jamais float.
 * ============================================================
 */

'use strict';

const IDFactory = require('../core/IDFactory');

/**
 * Comptes autorisés — LedgerCodeMap V3 (D-060, D-060-A).
 * Cet ensemble sert de garde-fou : toute écriture vers un compte
 * non listé ici est rejetée. Source de vérité : D-060.
 */
const VALID_ACCOUNTS = new Set([
  // Capitaux propres
  '1100', '1150', '1200', '1300', '1400',
  // Passifs LT
  '1600', '1700', '1800', '1900',
  // Actifs LT
  '2100', '2110', '2200', '2300', '2600', '2610', '2700', '2900',
  // Actifs courants
  '4110', '4120', '4130', '4190',
  // Passifs talents / escrow
  '4310', '4320', '4325', '4326', '4330', '4335', '4350', '4360', '4365', '4370',
  // Revenus différés
  '4530', '4535', '4540', '4541', '4545',
  // Fiscal MR
  '4410', '4420', '4450',
  // Fournisseurs
  '4510', '4520', '4610', '4620', '4690',
  // Liquidités
  '5100', '5200', '5300', '5400', '5500', '5900',
  // Frais de vente
  '6110', '6115', '6116', '6119', '6120', '6130', '6140', '6150', '6155', '6160',
  // Exploitation
  '6210', '6220', '6230', '6240', '6250', '6260', '6270',
  // Personnel
  '6310', '6320', '6330',
  // Autres charges
  '6370', '6410', '6510', '6590', '6591', '6610', '6690',
  // Revenus courtage
  '7110', '7120', '7130', '7190',
  // Revenus SaaS
  '7210', '7220', '7230', '7240', '7280', '7290',
  // Revenus billetterie
  '7410', '7415', '7420', '7490',
  // Revenus commandites
  '7510', '7515', '7520', '7590',
  // Autres produits
  '7910', '7990',
]);

/**
 * SKU codes autorisés — moteurs économiques Micro Rave V3.
 */
const VALID_SKU_CODES = new Set([
  'SKU-COURTAGE',
  'SKU-SAAS',
  'SKU-BILLETTERIE',
  'SKU-COMMANDITES',
  'SKU-INTERNE',       // écritures non liées à un moteur économique (capital, etc.)
]);

/**
 * Valide une ligne individuelle avant persistance.
 * Lève une erreur descriptive si un champ est invalide.
 */
function validateEntry(entry, index) {
  const prefix = `FINANCIAL_LEDGER_VALIDATION [ligne ${index}]`;

  if (!entry.account || !VALID_ACCOUNTS.has(entry.account)) {
    throw new Error(
      `${prefix}: compte "${entry.account}" invalide. ` +
      `Doit être un code LedgerCodeMap V3 (D-060). ` +
      `Comptes valides : ${VALID_ACCOUNTS.size} codes.`
    );
  }

  if (entry.direction !== 'DEBIT' && entry.direction !== 'CREDIT') {
    throw new Error(
      `${prefix}: direction "${entry.direction}" invalide. ` +
      `Doit être "DEBIT" ou "CREDIT".`
    );
  }

  if (!Number.isInteger(entry.amountCents) || entry.amountCents < 0) {
    throw new Error(
      `${prefix}: amountCents=${entry.amountCents} invalide. ` +
      `Doit être un entier >= 0 en centimes (D-064).`
    );
  }

  if (entry.amountCents === 0) {
    throw new Error(
      `${prefix}: amountCents=0. Une écriture à zéro cent n'a pas de sens comptable. ` +
      `Si c'est intentionnel, documenter le cas.`
    );
  }

  if (entry.skuCode && !VALID_SKU_CODES.has(entry.skuCode)) {
    throw new Error(
      `${prefix}: skuCode "${entry.skuCode}" invalide. ` +
      `Valeurs autorisées : ${[...VALID_SKU_CODES].join(', ')}.`
    );
  }
}

/**
 * Enregistre un groupe de transactions dans le FinancialLedger.
 *
 * INVARIANT : sum(DEBIT) === sum(CREDIT). Si cette condition est
 * violée, rien n'est persisté et une erreur est levée.
 *
 * Chaque appel produit N lignes dans la table LedgerRecord, liées
 * par un transactionGroupId commun (TXG-*).
 *
 * @param {object}   params
 * @param {string}   params.transactionType   — type métier ('encaissement_depot', 'encaissement_solde',
 *                                              'reconnaissance_revenu', 'payout_executed',
 *                                              'remise_tps', 'remise_tvq', 'refund', 'reversal',
 *                                              'encaissement_saas', 'encaissement_billet',
 *                                              'encaissement_commandite', 'ajustement_arrondi',
 *                                              'ecart_processeur', 'amendment_delta', 'chargeback',
 *                                              'retroactive_pierre_de_rosette')
 * @param {string}   params.engagementId      — ENG-* (ou null si non lié à un Engagement)
 * @param {string}   params.eventId           — EVT-* (ou null)
 * @param {string}   params.skuCode           — SKU-COURTAGE, SKU-SAAS, etc.
 * @param {string}   [params.subSkuCode]      — sous-code (SUB-COURT-DJ, etc.)
 * @param {string}   [params.currency]        — 'cad' par défaut
 * @param {string}   [params.note]            — note libre
 * @param {object}   [params.metadata]        — données contextuelles (stripeRef, etc.)
 * @param {Array}    params.entries           — lignes de la transaction
 * @param {string}   params.entries[].account     — code compte (ex: '5200')
 * @param {string}   params.entries[].direction   — 'DEBIT' ou 'CREDIT'
 * @param {number}   params.entries[].amountCents — montant en centimes entiers
 * @param {string}   [params.entries[].note]      — note spécifique à la ligne
 * @param {object}   params.repositories     — { ledgerRecords: { append() } }
 * @returns {object} { transactionGroupId, entries: [...persistedRecords], balanced: true }
 */
async function recordTransaction({
  transactionType,
  engagementId  = null,
  eventId       = null,
  skuCode       = 'SKU-COURTAGE',
  subSkuCode    = null,
  currency      = 'cad',
  note          = '',
  metadata      = {},
  entries       = [],
  repositories,
}) {
  // ── Validation structurelle ─────────────────────────────────

  if (!repositories?.ledgerRecords?.append) {
    throw new Error(
      'FINANCIAL_LEDGER_ERROR: repositories.ledgerRecords.append() absent. ' +
      'Fournir le repository LedgerRecord. Source : D-128.'
    );
  }

  if (!transactionType) {
    throw new Error(
      'FINANCIAL_LEDGER_ERROR: transactionType obligatoire. ' +
      'Exemples : encaissement_depot, payout_executed, reconnaissance_revenu.'
    );
  }

  if (!Array.isArray(entries) || entries.length < 2) {
    throw new Error(
      'FINANCIAL_LEDGER_ERROR: une transaction double-entrée exige au moins ' +
      '2 lignes (1 DEBIT + 1 CREDIT). ' +
      `Reçu : ${entries.length} ligne(s).`
    );
  }

  // ── Validation de chaque ligne ──────────────────────────────

  entries.forEach((entry, i) => validateEntry(entry, i));

  // ── Invariant DR = CR ───────────────────────────────────────

  let totalDebit  = 0;
  let totalCredit = 0;

  for (const entry of entries) {
    if (entry.direction === 'DEBIT')  totalDebit  += entry.amountCents;
    if (entry.direction === 'CREDIT') totalCredit += entry.amountCents;
  }

  if (totalDebit !== totalCredit) {
    throw new Error(
      `FINANCIAL_LEDGER_IMBALANCE: DR ${totalDebit} ≠ CR ${totalCredit}. ` +
      `Écart : ${Math.abs(totalDebit - totalCredit)} centimes. ` +
      `Transaction "${transactionType}" rejetée — LOI LEDGER-02. ` +
      `RIEN n'a été persisté.`
    );
  }

  // ── Génération du transactionGroupId ────────────────────────

  const transactionGroupId = IDFactory.generate('TransactionGroup');
  const now = new Date().toISOString();

  // ── Persistance atomique (best-effort sans transaction DB) ──

  const persistedRecords = [];

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const systemId = IDFactory.generate('LedgerEntry');

    const record = await repositories.ledgerRecords.append({
      systemId,
      transactionGroupId,
      transactionType,
      lineIndex:      i,
      engagementId,
      eventId,
      skuCode,
      subSkuCode,
      account:        entry.account,
      direction:      entry.direction,
      amountCents:    entry.amountCents,
      currency,
      note:           entry.note || note,
      metadata:       {
        ...metadata,
        transactionGroupId,
        lineCount: entries.length,
      },
      createdAt:      now,
    });

    persistedRecords.push(record);
  }

  return {
    transactionGroupId,
    transactionType,
    totalDebit,
    totalCredit,
    balanced:  true,
    lineCount: entries.length,
    entries:   persistedRecords,
    createdAt: now,
  };
}

/**
 * Vérifie l'équilibre de toutes les transactions d'un Engagement.
 * Retourne un rapport de vérification.
 *
 * @param {string}  engagementId   — ENG-*
 * @param {object}  repositories   — { ledgerRecords }
 * @returns {object} { balanced, totalDebit, totalCredit, ecart, groups }
 */
async function verifyBalance({ engagementId, repositories }) {
  if (!repositories?.ledgerRecords?.findByEngagementId) {
    throw new Error(
      'FINANCIAL_LEDGER_ERROR: repositories.ledgerRecords.findByEngagementId() absent.'
    );
  }

  const records = await repositories.ledgerRecords.findByEngagementId(engagementId);

  let totalDebit  = 0;
  let totalCredit = 0;
  const groups    = {};

  for (const record of records) {
    const dir       = record.direction;
    const amount    = record.amountCents || 0;
    const groupId   = record.transactionGroupId || 'SANS_GROUPE';

    if (dir === 'DEBIT')  totalDebit  += amount;
    if (dir === 'CREDIT') totalCredit += amount;

    if (!groups[groupId]) {
      groups[groupId] = { debit: 0, credit: 0, lines: 0, type: record.transactionType };
    }
    groups[groupId][dir === 'DEBIT' ? 'debit' : 'credit'] += amount;
    groups[groupId].lines += 1;
  }

  // Vérifier chaque groupe individuellement
  const imbalancedGroups = [];
  for (const [groupId, group] of Object.entries(groups)) {
    if (group.debit !== group.credit) {
      imbalancedGroups.push({
        groupId,
        type:   group.type,
        debit:  group.debit,
        credit: group.credit,
        ecart:  Math.abs(group.debit - group.credit),
      });
    }
  }

  return {
    engagementId,
    balanced:         totalDebit === totalCredit && imbalancedGroups.length === 0,
    totalDebit,
    totalCredit,
    ecart:            Math.abs(totalDebit - totalCredit),
    totalRecords:     records.length,
    groupCount:       Object.keys(groups).length,
    imbalancedGroups,
  };
}

/**
 * Produit un bilan instantané depuis le FinancialLedger.
 *
 * Méthode : pour chaque LedgerRecord dont createdAt <= asOfDate,
 * on agrège les soldes par compte. Le solde d'un compte est :
 *   - Actif (classes 2, 4.1xx, 5) : sum(DEBIT) - sum(CREDIT) = solde positif normal
 *   - Passif (classes 1, 4.3xx-4.6xx) : sum(CREDIT) - sum(DEBIT) = solde positif normal
 *   - Revenu (classe 7) : sum(CREDIT) - sum(DEBIT)
 *   - Charge (classe 6) : sum(DEBIT) - sum(CREDIT)
 *
 * @param {object}   params
 * @param {string}   [params.asOfDate]    — ISO date, défaut = maintenant
 * @param {string}   [params.eventId]     — filtre par event
 * @param {string}   [params.engagementId] — filtre par engagement
 * @param {object}   params.repositories  — { ledgerRecords }
 * @returns {object}  bilan structuré
 */
async function generateBalanceSnapshot({
  asOfDate       = new Date().toISOString(),
  eventId        = null,
  engagementId   = null,
  repositories,
}) {
  let records;

  if (engagementId) {
    records = await repositories.ledgerRecords.findByEngagementId(engagementId);
  } else if (eventId) {
    records = await repositories.ledgerRecords.findByEventId(eventId);
  } else {
    // Pas de filtre — il faudrait un findAll, mais pour l'instant on exige un filtre
    throw new Error(
      'FINANCIAL_LEDGER_ERROR: engagementId ou eventId requis pour générer un bilan. ' +
      'Un findAll() sera nécessaire pour le bilan global (Sprint 4).'
    );
  }

  // Filtrer par date
  const cutoff    = new Date(asOfDate).getTime();
  const filtered  = records.filter(r => new Date(r.createdAt).getTime() <= cutoff);

  // Agréger par compte
  const balances = {};
  for (const record of filtered) {
    const acct = record.account;
    if (!balances[acct]) {
      balances[acct] = { debit: 0, credit: 0 };
    }
    if (record.direction === 'DEBIT')  balances[acct].debit  += record.amountCents;
    if (record.direction === 'CREDIT') balances[acct].credit += record.amountCents;
  }

  // Classifier les comptes et calculer les soldes naturels
  const bilan = {
    asOfDate,
    actifs:           {},
    passifs:          {},
    capitauxPropres:  {},
    revenus:          {},
    charges:          {},
    totalActifs:      0,
    totalPassifs:     0,
    totalCapitaux:    0,
    totalRevenus:     0,
    totalCharges:     0,
    resultatNet:      0,
    bilanEquilibre:   false,
  };

  for (const [acct, { debit, credit }] of Object.entries(balances)) {
    const code = parseInt(acct, 10);

    if (code >= 5000 && code < 6000) {
      // Liquidités — actif, solde normal = DR - CR
      const solde = debit - credit;
      bilan.actifs[acct] = solde;
      bilan.totalActifs += solde;
    } else if (code >= 4100 && code < 4200) {
      // Actifs courants (4110-4190) — actif, solde normal = DR - CR
      const solde = debit - credit;
      bilan.actifs[acct] = solde;
      bilan.totalActifs += solde;
    } else if (code >= 2000 && code < 3000) {
      // Actifs LT — solde normal = DR - CR
      const solde = debit - credit;
      bilan.actifs[acct] = solde;
      bilan.totalActifs += solde;
    } else if (code >= 1000 && code < 2000) {
      // Capitaux propres + passifs LT — solde normal = CR - DR
      const solde = credit - debit;
      bilan.capitauxPropres[acct] = solde;
      bilan.totalCapitaux += solde;
    } else if (code >= 4200 && code < 5000) {
      // Passifs (4310-4690) — solde normal = CR - DR
      const solde = credit - debit;
      bilan.passifs[acct] = solde;
      bilan.totalPassifs += solde;
    } else if (code >= 6000 && code < 7000) {
      // Charges — solde normal = DR - CR
      const solde = debit - credit;
      bilan.charges[acct] = solde;
      bilan.totalCharges += solde;
    } else if (code >= 7000 && code < 8000) {
      // Revenus — solde normal = CR - DR
      const solde = credit - debit;
      bilan.revenus[acct] = solde;
      bilan.totalRevenus += solde;
    }
  }

  bilan.resultatNet = bilan.totalRevenus - bilan.totalCharges;

  // Vérification de l'équilibre du bilan :
  // Actifs = Passifs + Capitaux Propres + Résultat Net
  // (les revenus différés sont dans les passifs, les revenus reconnus sont dans le résultat)
  bilan.bilanEquilibre = (
    bilan.totalActifs === bilan.totalPassifs + bilan.totalCapitaux + bilan.resultatNet
  );

  return bilan;
}

module.exports = {
  recordTransaction,
  verifyBalance,
  generateBalanceSnapshot,
  VALID_ACCOUNTS,
  VALID_SKU_CODES,
};