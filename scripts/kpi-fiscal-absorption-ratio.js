#!/usr/bin/env node
/**
 * MICRO RAVE V3 — scripts/kpi-fiscal-absorption-ratio.js
 * ============================================================
 * Job quotidien — K-FISCAL-01
 * Source : D-060-B · K-FISCAL-01 · 2026-05-23
 *
 * Calcule le ratio d'absorption fiscale sur fenêtre roulante 90 jours :
 *
 *   ratio = sum(6690.amountCents, 90j) / sum(7110.amountCents, 90j)
 *
 * Seuils (D-060-B / K-FISCAL-01) :
 *   🟢 VERT    < 1 %    surveillance routine
 *   🟡 JAUNE   1-5 %    analyse cause racine sous 7j
 *   🟠 ORANGE  5-15 %   plan correctif sous 30j + notification fondateur
 *   🔴 ROUGE   > 15 %   ARRÊT COMMERCIAL OBLIGATOIRE
 *
 * MESURE TRANSITOIRE :
 *   Tant que la validation fiscaliste Doctrine Principal n'est pas
 *   obtenue, le seuil rouge est temporairement relevé à 50 % pour
 *   les transactions pilotes documentées. Les transactions réelles
 *   restent soumises au seuil 15 %.
 *   Contrôlé par K_FISCAL_01_PILOT_MODE=true dans .env
 *
 * USAGE :
 *   node scripts/kpi-fiscal-absorption-ratio.js [--verbose]
 *
 * SORTIES :
 *   - Console (toujours)
 *   - KpiSnapshot persisté (table dédiée pour dashboard FOUNDER)
 *   - Notifications selon le seuil atteint (ADMIN_FINANCE puis FOUNDER)
 *   - CommercialOperationGuard activé si seuil rouge atteint
 *
 * EXIT CODES :
 *   0 — VERT ou JAUNE (fonctionnement normal)
 *   1 — ORANGE (alerte critique)
 *   2 — ROUGE (arrêt commercial déclenché)
 *   3 — erreur d'exécution du job
 * ============================================================
 */

'use strict';

require('dotenv').config();

const repositories = require('../src/repositories');

const VERBOSE = process.argv.includes('--verbose');
const PILOT_MODE = process.env.K_FISCAL_01_PILOT_MODE === 'true';

// Seuils définitifs (D-060-B / K-FISCAL-01)
const THRESHOLD_YELLOW_PCT = 1;
const THRESHOLD_ORANGE_PCT = 5;
const THRESHOLD_RED_PCT    = PILOT_MODE ? 50 : 15;

// Fenêtre roulante 90 jours
const WINDOW_DAYS = 90;

function section(title) {
  console.log(`\n${'─'.repeat(64)}`);
  console.log(`  ${title}`);
  console.log(`${'─'.repeat(64)}`);
}

function fmt$(cents) {
  return `${(cents / 100).toFixed(2)} $`;
}

/**
 * Détermine le niveau d'alerte à partir du ratio.
 */
function classifyRatio(ratioPct) {
  if (ratioPct < THRESHOLD_YELLOW_PCT) return 'VERT';
  if (ratioPct < THRESHOLD_ORANGE_PCT) return 'JAUNE';
  if (ratioPct < THRESHOLD_RED_PCT)    return 'ORANGE';
  return 'ROUGE';
}

function levelEmoji(level) {
  return { VERT: '🟢', JAUNE: '🟡', ORANGE: '🟠', ROUGE: '🔴' }[level] || '⚪';
}

function levelExitCode(level) {
  return { VERT: 0, JAUNE: 0, ORANGE: 1, ROUGE: 2 }[level] ?? 3;
}

/**
 * Agrège les montants pour un compte sur la fenêtre roulante.
 * Filtre uniquement les écritures actives (statut POSTED ou REVERSAL_OF).
 */
async function aggregateAccount({ account, cutoffDate, repositories }) {
  // Trouver toutes les lignes du compte sur la fenêtre
  const lines = await repositories.ledgerRecords.findByAccountSince({
    account,
    sinceDate: cutoffDate.toISOString(),
  });

  // Filtrer pour ne garder que les actives (D-060-E)
  let activeLines = lines;
  if (repositories.ledgerRecordStatusHistory?.filterActive) {
    activeLines = await repositories.ledgerRecordStatusHistory.filterActive(lines);
  }

  // Solde naturel : pour 6690 (charge) c'est DR - CR
  //                 pour 7110 (revenu) c'est CR - DR
  let debit = 0;
  let credit = 0;
  for (const l of activeLines) {
    if (l.direction === 'DEBIT')  debit  += l.amountCents;
    if (l.direction === 'CREDIT') credit += l.amountCents;
  }

  const code = parseInt(account, 10);
  const naturalBalance = (code >= 6000 && code < 7000)
    ? debit - credit   // charge
    : credit - debit;  // revenu

  return {
    account,
    linesCount:    lines.length,
    activeCount:   activeLines.length,
    reversedCount: lines.length - activeLines.length,
    debit,
    credit,
    naturalBalance,
  };
}

async function main() {
  const now = new Date();
  const cutoffDate = new Date(now.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000);

  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  MICRO RAVE V3 — KPI K-FISCAL-01 (ratio absorption fiscale) ║');
  console.log(`║  Fenêtre : ${cutoffDate.toISOString().slice(0, 10)} → ${now.toISOString().slice(0, 10)}    ║`);
  console.log(`║  Mode    : ${PILOT_MODE ? 'PILOTE (seuil rouge = 50 %)             ' : 'PRODUCTION (seuil rouge = 15 %)         '} ║`);
  console.log('╚══════════════════════════════════════════════════════════════╝');

  section('Agrégation des comptes 6690 et 7110');

  const account6690 = await aggregateAccount({
    account: '6690', cutoffDate, repositories,
  });
  const account7110 = await aggregateAccount({
    account: '7110', cutoffDate, repositories,
  });

  console.log(`  6690 — Charges fiscales absorbées :`);
  console.log(`    Lignes brutes  : ${account6690.linesCount}`);
  console.log(`    Lignes actives : ${account6690.activeCount} (${account6690.reversedCount} reversées exclues)`);
  console.log(`    Solde naturel  : ${fmt$(account6690.naturalBalance)}`);

  console.log(`\n  7110 — Revenus courtage :`);
  console.log(`    Lignes brutes  : ${account7110.linesCount}`);
  console.log(`    Lignes actives : ${account7110.activeCount} (${account7110.reversedCount} reversées exclues)`);
  console.log(`    Solde naturel  : ${fmt$(account7110.naturalBalance)}`);

  section('Calcul du ratio');

  let ratioPct;
  let level;
  if (account7110.naturalBalance === 0) {
    if (account6690.naturalBalance === 0) {
      // Aucune activité : statut neutre
      ratioPct = 0;
      level = 'VERT';
      console.log(`  Aucune activité sur la fenêtre. Ratio = N/A → VERT par défaut.`);
    } else {
      // 6690 sans 7110 : situation anormale, traiter comme ROUGE
      ratioPct = Infinity;
      level = 'ROUGE';
      console.log(`  ⚠ 6690 actif (${fmt$(account6690.naturalBalance)}) sans aucun revenu 7110.`);
      console.log(`  Cas anormal — traité comme ROUGE.`);
    }
  } else {
    ratioPct = (account6690.naturalBalance / account7110.naturalBalance) * 100;
    level = classifyRatio(ratioPct);
    console.log(`  Ratio = ${account6690.naturalBalance} / ${account7110.naturalBalance}`);
    console.log(`        = ${ratioPct.toFixed(2)} %`);
    console.log(`  Niveau : ${levelEmoji(level)} ${level}`);
  }

  section('Seuils K-FISCAL-01');
  console.log(`  🟢 VERT    : < ${THRESHOLD_YELLOW_PCT} %        surveillance routine`);
  console.log(`  🟡 JAUNE   : ${THRESHOLD_YELLOW_PCT}-${THRESHOLD_ORANGE_PCT} %      analyse cause racine sous 7j`);
  console.log(`  🟠 ORANGE  : ${THRESHOLD_ORANGE_PCT}-${THRESHOLD_RED_PCT} %     plan correctif + notification FOUNDER`);
  console.log(`  🔴 ROUGE   : > ${THRESHOLD_RED_PCT} %       ${PILOT_MODE ? '(pilote — relevé)' : 'ARRÊT COMMERCIAL'}`);

  // Persistance du snapshot pour le dashboard
  if (repositories.kpiSnapshots?.append) {
    section('Persistance KpiSnapshot');
    await repositories.kpiSnapshots.append({
      kpiCode:        'K-FISCAL-01',
      computedAt:     now.toISOString(),
      windowStart:    cutoffDate.toISOString(),
      windowEnd:      now.toISOString(),
      ratioValue:     ratioPct,
      ratioFormatted: `${ratioPct.toFixed(2)} %`,
      level,
      pilotMode:      PILOT_MODE,
      thresholds: {
        yellow: THRESHOLD_YELLOW_PCT,
        orange: THRESHOLD_ORANGE_PCT,
        red:    THRESHOLD_RED_PCT,
      },
      data: {
        account6690: account6690.naturalBalance,
        account7110: account7110.naturalBalance,
        details:     { account6690, account7110 },
      },
    });
    console.log(`  ✓ Snapshot persisté pour dashboard FOUNDER`);
  }

  // Notifications selon le seuil
  if (level === 'JAUNE' || level === 'ORANGE' || level === 'ROUGE') {
    section('Notifications');

    if (repositories.notifications?.send) {
      // Notification ADMIN_FINANCE (toujours pour JAUNE+)
      await repositories.notifications.send({
        recipientRole: 'ADMIN_FINANCE',
        severity:      level,
        subject:       `K-FISCAL-01 — Niveau ${level} (${ratioPct.toFixed(2)} %)`,
        body:          `Le ratio d'absorption fiscale 6690/7110 a atteint ${ratioPct.toFixed(2)} % ` +
                       `sur les ${WINDOW_DAYS} derniers jours.\n\n` +
                       `Niveau : ${level}\n` +
                       `Seuils : VERT < ${THRESHOLD_YELLOW_PCT} %, JAUNE < ${THRESHOLD_ORANGE_PCT} %, ` +
                       `ORANGE < ${THRESHOLD_RED_PCT} %, ROUGE > ${THRESHOLD_RED_PCT} %\n\n` +
                       `Action requise : voir D-060-B.`,
      });
      console.log(`  ✓ Notification envoyée à ADMIN_FINANCE`);

      // Notification FOUNDER (ORANGE et ROUGE)
      if (level === 'ORANGE' || level === 'ROUGE') {
        await repositories.notifications.send({
          recipientRole: 'FOUNDER',
          severity:      level,
          subject:       `🚨 K-FISCAL-01 — Niveau ${level} — Action immédiate requise`,
          body:          `Le ratio d'absorption fiscale a franchi le seuil ${level}.\n\n` +
                         `Ratio courant : ${ratioPct.toFixed(2)} %\n` +
                         (level === 'ROUGE'
                            ? `⛔ ARRÊT COMMERCIAL ${PILOT_MODE ? 'PILOTE' : 'AUTOMATIQUE'} DÉCLENCHÉ.\n`
                            : `Plan correctif à documenter sous 30 jours.\n`) +
                         `\nVoir D-060-B et K-FISCAL-01.`,
        });
        console.log(`  ✓ Notification envoyée à FOUNDER`);
      }
    }

    // Activation CommercialOperationGuard (ROUGE seulement)
    if (level === 'ROUGE' && repositories.commercialOperationLock?.activate) {
      await repositories.commercialOperationLock.activate({
        reason:    `K-FISCAL-01 ROUGE — ratio ${ratioPct.toFixed(2)} %`,
        triggeredBy: 'kpi-fiscal-absorption-ratio',
        triggeredAt: now.toISOString(),
      });
      console.log(`  ⛔ CommercialOperationGuard ACTIVÉ — nouvelles transactions bloquées`);
    }
  }

  section('Résumé');
  console.log(`  Ratio        : ${ratioPct.toFixed(2)} %`);
  console.log(`  Niveau       : ${levelEmoji(level)} ${level}`);
  console.log(`  Action       : ${
    level === 'VERT'   ? 'Aucune' :
    level === 'JAUNE'  ? 'Analyse sous 7j' :
    level === 'ORANGE' ? 'Plan correctif sous 30j' :
                         'ARRÊT COMMERCIAL — audit pipeline fiscal'
  }`);
  console.log(`  Mode pilote  : ${PILOT_MODE ? 'OUI' : 'NON'}`);
  console.log(`  Exit code    : ${levelExitCode(level)}`);

  process.exit(levelExitCode(level));
}

main().catch(err => {
  console.error('\n ❌ ERREUR FATALE :', err.message);
  console.error(err.stack);
  process.exit(3);
});