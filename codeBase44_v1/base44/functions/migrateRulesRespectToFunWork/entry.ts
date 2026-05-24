// deploy: v2
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ ok: false, error: 'Admin only' }, { status: 403 });
    }

    const service = base44.asServiceRole;
    const summary = {
      sotsLog:       { checked: 0, migrated: 0, skipped: 0, errors: 0 },
      talentProfile: { checked: 0, migrated: 0, skipped: 0, errors: 0 },
      session:       { checked: 0, migrated: 0, skipped: 0, errors: 0 },
    };

    // ── 1. SOTSLog ────────────────────────────────────────────────────────────
    const allLogs = await service.entities.SOTSLog.filter({});
    summary.sotsLog.checked = allLogs.length;

    for (const log of allLogs) {
      // Guard: skip if funWork already present
      if (log.funWork != null) {
        summary.sotsLog.skipped++;
        continue;
      }
      // Only migrate if rulesRespect exists
      if (log.rulesRespect == null) {
        summary.sotsLog.skipped++;
        continue;
      }
      try {
        await service.entities.SOTSLog.update(log.id, { funWork: log.rulesRespect });
        summary.sotsLog.migrated++;
      } catch (e) {
        console.error(`[migrate] SOTSLog ${log.id} failed:`, e.message);
        summary.sotsLog.errors++;
      }
    }
    console.log('[migrate] SOTSLog:', JSON.stringify(summary.sotsLog));

    // ── 2. Session (sotsBreakdown.rulesRespect inside participants) ──────────
    // Sessions don't store rulesRespect directly, but sotsBreakdown may have it.
    // We check session-level fields only — participants have their own vote tracking.
    // Nothing to migrate at the Session level for this field.
    summary.session.skipped = 0;
    console.log('[migrate] Session: no direct rulesRespect field to migrate');

    // ── 3. TalentProfile — ensure talentStatus + xpGlobal are set ────────────
    // This re-runs computeSOTS logic for all profiles missing talentStatus.
    const allProfiles = await service.entities.TalentProfile.filter({});
    summary.talentProfile.checked = allProfiles.length;

    for (const profile of allProfiles) {
      // Guard: skip if talentStatus already set
      if (profile.talentStatus != null) {
        summary.talentProfile.skipped++;
        continue;
      }
      try {
        // Derive talentStatus from existing sotsGlobalScore + totalVotes
        const gs = profile.sotsGlobalScore || 0;
        const tv = profile.totalVotes || 0;
        let talentStatus = 'candidat';
        if (tv >= 3) {
          if (gs >= 3.5) talentStatus = 'vitrine';
          else if (gs >= 2.5) talentStatus = 'actif';
          else talentStatus = 'exploratoire';
        }

        // Sync xpGlobal from DomainProgress if missing
        let xpGlobal = profile.xpGlobal || 0;
        try {
          const progress = await service.entities.DomainProgress.filter({ userId: profile.userId });
          if (progress && progress.length > 0) {
            xpGlobal = progress.reduce((sum, dp) => sum + (dp.xp || 0), 0);
          }
        } catch (xpErr) {
          console.warn(`[migrate] TalentProfile ${profile.id} xpGlobal sync failed (non-fatal):`, xpErr.message);
        }

        await service.entities.TalentProfile.update(profile.id, { talentStatus, xpGlobal });
        summary.talentProfile.migrated++;
      } catch (e) {
        console.error(`[migrate] TalentProfile ${profile.id} failed:`, e.message);
        summary.talentProfile.errors++;
      }
    }
    console.log('[migrate] TalentProfile:', JSON.stringify(summary.talentProfile));

    const totalMigrated = summary.sotsLog.migrated + summary.talentProfile.migrated;
    const totalSkipped  = summary.sotsLog.skipped  + summary.talentProfile.skipped;
    const totalErrors   = summary.sotsLog.errors   + summary.talentProfile.errors;

    return Response.json({
      ok: true,
      totalMigrated,
      totalSkipped,
      totalErrors,
      details: summary,
    });
  } catch (error) {
    console.error('migrateRulesRespectToFunWork error:', error);
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});