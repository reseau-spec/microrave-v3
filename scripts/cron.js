/**
 * MICRO RAVE V3 — scripts/cron.js
 * ============================================================
 * Script cron externe — appele toutes les 5 minutes.
 *
 * Source : Plan Phase 2.2 · Decision fondateur 2026-05-21 Option B
 *
 * Modes d'execution :
 *   A) Script one-shot (Railway/Render scheduled job) :
 *      railway run node scripts/cron.js
 *      npm run cron
 *
 *   B) Daemon local node-cron (dev/staging) :
 *      node scripts/cron-daemon.js  (a creer si besoin)
 *      schedule("* /5 * * * *", () => require('./cron.js'))  // note: no space in real usage
 *
 * Sortie :
 *   process.exit(0) si tasksProcessed >= 0 et tasksFailed === 0
 *   process.exit(1) si tasksFailed > 0 — permet a Railway de detecter l'echec
 *
 * REGLE ARCHITECTURE :
 *   cron.js est le SEUL fichier qui fait des require directs sur les repositories.
 *   SchedulerService ne connait pas les repositories — injection uniquement.
 * ============================================================
 */

'use strict';

require('dotenv').config();

const SchedulerService       = require('../src/services/SchedulerService');
const SchedulerRepository    = require('../src/repositories/SchedulerRepository');
const AdminRepository        = require('../src/repositories/AdminRepository');
const PolicyConfigRepository = require('../src/repositories/PolicyConfigRepository');
const EngagementRepository   = require('../src/repositories/EngagementRepository');
const LedgerRepository       = require('../src/repositories/LedgerRepository');

// ── Instanciation des repositories ───────────────────────────
// Tous injectes dans SchedulerService — aucun require direct la-bas.
const repositories = {
  scheduler:    SchedulerRepository,
  admin:        AdminRepository,
  policyConfig: PolicyConfigRepository,
  engagements:  EngagementRepository,
  ledger:       LedgerRepository,
};

// ── Execution ─────────────────────────────────────────────────
async function main() {
  const startedAt = new Date().toISOString();
  console.log(`[cron] ${startedAt} — SchedulerService.runDueTasks() demarrage`);

  let result;
  try {
    result = await SchedulerService.runDueTasks({ repositories });
  } catch (fatalErr) {
    console.error(`[cron] ERREUR FATALE : ${fatalErr.message}`);
    process.exit(1);
  }

  const { runId, tasksProcessed, tasksFailed, results } = result;

  console.log(`[cron] runId=${runId} | traites=${tasksProcessed} | echecs=${tasksFailed}`);

  if (results && results.length > 0) {
    for (const r of results) {
      const status = r.outcome === 'done'    ? 'OK'      :
                     r.outcome === 'failed'  ? 'ECHEC'   :
                     r.outcome === 'skipped' ? 'IGNORE'  : r.outcome;
      console.log(`  [${status}] ${r.taskId} (${r.taskType || r.reason || ''})`);
    }
  } else {
    console.log(`  [cron] Aucune tache due.`);
  }

  if (tasksFailed > 0) {
    console.error(`[cron] ${tasksFailed} tache(s) echouee(s). Voir AdminIncidentRecord.`);
    process.exit(1);
  }

  console.log(`[cron] Termine avec succes.`);
  process.exit(0);
}

main();