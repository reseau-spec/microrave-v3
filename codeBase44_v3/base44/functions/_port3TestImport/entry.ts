/**
 * MICRO RAVE V3 — _port3TestImport
 * ============================================================
 * PORT-3 — validation pattern Base44 natif · 27 mai 2026
 *
 * RÔLE : Valider que l'adaptateur canonique createBase44Repositories
 * fonctionne dans le runtime Deno cloud Base44.
 *
 * ============================================================
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

function createBase44Repositories(base44) {
  if (!base44)          throw new Error('ADAPTER_ERROR: base44 SDK requis.');
  if (!base44.entities) throw new Error('ADAPTER_ERROR: base44.entities manquant.');
  return {
    engagements: {
      findById: async (id) => {
        const rows = await base44.entities.Engagement.filter({ systemId: id }, '-created_date', 1);
        return rows?.[0] ?? null;
      },
      update: async (id, data) => {
        if (data && Object.prototype.hasOwnProperty.call(data, 'status')) {
          throw new Error('LOI_TRANSITION_01_VIOLATION: update() ne peut pas modifier status. Utiliser transitionEngagement().');
        }
        return base44.entities.Engagement.update(id, data);
      },
      updateStatus: () => {
        throw new Error('LOI_TRANSITION_01_VIOLATION: updateStatus() interdit. Utiliser transitionEngagement().');
      },
    },
    contractSnapshots: {
      create: (data) => base44.entities.ContractSnapshot.create({
        ...data, createdAt: data.createdAt || new Date().toISOString(),
      }),
      findByEngagementId: (engagementId) =>
        base44.entities.ContractSnapshot.filter({ engagementId }, '-created_date'),
    },
    ledgerRecords: {
      append: (data) => base44.entities.LedgerRecord.create(data),
      findByEngagementId: (engagementId) =>
        base44.entities.LedgerRecord.filter({ engagementId }, 'created_date'),
      findByTransactionGroupId: (transactionGroupId) =>
        base44.entities.LedgerRecord.filter({ transactionGroupId }, 'created_date'),
      findByEventId: (eventId) =>
        base44.entities.LedgerRecord.filter({ eventId }, 'created_date'),
    },
    admin: {
      appendToDataAccessLedger: (data) => base44.entities.DataAccessLedgerEntry.create(data),
      createAdminIncidentRecord: (data) => base44.entities.AdminIncidentRecord.create(data),
    },
    scheduler: {
      createTask: (data) => base44.entities.SchedulerDueTask.create({
        ...data, status: 'PENDING', attemptCount: 0, createdAt: new Date().toISOString(),
      }),
    },
    policyConfig: {
      getConfig: async (key) => {
        const rows = await base44.entities.PolicyConfig.filter({ key }, '-created_date', 1);
        return rows?.[0]?.value ?? null;
      },
    },
    sessionPresence: {
      create: (data) => base44.entities.SessionPresence.create(data),
      findByEngagementId: (engagementId) =>
        base44.entities.SessionPresence.filter({ engagementId }, '-created_date'),
      updateCheckout: (id, data) => base44.entities.SessionPresence.update(id, data),
    },
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    if (!me?.id) {
      return Response.json({ ok: false, error: 'AUTH_REQUIRED' }, { status: 401 });
    }
    const repositories = createBase44Repositories(base44);
    let barrierIsPhysical = false;
    try { repositories.engagements.updateStatus('ENG-FAKE', 'x'); }
    catch (err) { barrierIsPhysical = err.message.includes('LOI_TRANSITION_01_VIOLATION'); }
    let updateBarrierOK = false;
    try { await repositories.engagements.update('ENG-FAKE', { status: 'x' }); }
    catch (err) { updateBarrierOK = err.message.includes('LOI_TRANSITION_01_VIOLATION'); }
    const interfaceOK = (
      typeof repositories.engagements?.findById          === 'function' &&
      typeof repositories.ledgerRecords?.append          === 'function' &&
      typeof repositories.contractSnapshots?.create      === 'function' &&
      typeof repositories.admin?.appendToDataAccessLedger === 'function' &&
      typeof repositories.scheduler?.createTask          === 'function' &&
      typeof repositories.policyConfig?.getConfig        === 'function'
    );
    const allOK = barrierIsPhysical && updateBarrierOK && interfaceOK;
    return Response.json({
      ok: allOK,
      diagnostics: { barrierIsPhysical, updateBarrierOK, interfaceOK,
        runtime: typeof Deno !== 'undefined' ? 'deno' : 'node', meId: me.id },
      message: allOK ? 'PORT-3 OK — adaptateur canonique V3 validé dans Base44.'
                     : 'PORT-3 KO — vérifier les diagnostics.',
    }, { status: allOK ? 200 : 500 });
  } catch (error) {
    console.error('[_port3TestImport]', error.message);
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});
