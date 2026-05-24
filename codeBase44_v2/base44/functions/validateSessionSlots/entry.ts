/**
 * validateSessionSlots.js
 * Tests / validations minimales pour les helpers sessionSlots.
 * Admin uniquement. Retourne les résultats de tous les cas de test.
 *
 * Cas A: quickplay session (sans slots)  => normalizeSlots(undefined) === []
 * Cas B: event session sans slots + rolesNeeded => buildSlotsFromRolesNeeded génère slots corrects
 * Cas C: event session avec slots déjà présents => backfill skip (simulé)
 * Cas D: event session sans rolesNeeded => backfill skip (simulé)
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import {
  normalizeSlots,
  findSlot,
  assertSlotState,
  buildSlotsFromRolesNeeded,
} from './sessionSlots.js';

function assert(condition, message) {
  if (!condition) throw new Error(`FAIL: ${message}`);
  return `PASS: ${message}`;
}

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const results = [];
    let passed = 0;
    let failed = 0;

    const run = (label, fn) => {
      try {
        const msg = fn();
        results.push({ label, status: 'PASS', detail: msg || null });
        passed++;
      } catch (err) {
        results.push({ label, status: 'FAIL', detail: err.message });
        failed++;
      }
    };

    // ── CAS A: normalizeSlots sur undefined/null/non-array ──────────────────
    run('A1: normalizeSlots(undefined) => []', () => {
      const r = normalizeSlots(undefined);
      assert(deepEqual(r, []), `expected [] got ${JSON.stringify(r)}`);
    });

    run('A2: normalizeSlots(null) => []', () => {
      const r = normalizeSlots(null);
      assert(deepEqual(r, []), `expected [] got ${JSON.stringify(r)}`);
    });

    run('A3: normalizeSlots("string") => []', () => {
      const r = normalizeSlots('invalid');
      assert(deepEqual(r, []), `expected [] got ${JSON.stringify(r)}`);
    });

    run('A4: normalizeSlots([]) => []', () => {
      const r = normalizeSlots([]);
      assert(deepEqual(r, []), `expected [] got ${JSON.stringify(r)}`);
    });

    run('A5: normalizeSlots with invalid entry filtered', () => {
      const r = normalizeSlots([{ bad: true }, { slotId: 'SL-x-0', roleSystemId: 'RL-001' }]);
      assert(r.length === 1, `expected 1 valid slot`);
      assert(r[0].slotId === 'SL-x-0', 'slotId mismatch');
    });

    run('A6: normalizeSlots sets defaults correctly', () => {
      const r = normalizeSlots([{ slotId: 'SL-x-0', roleSystemId: 'RL-001' }]);
      assert(r[0].status === 'open', 'status default');
      assert(r[0].candidateUserId === null, 'candidateUserId default');
      assert(deepEqual(r[0].candidateStyleSystemIds, []), 'candidateStyleSystemIds default');
      assert(r[0].confirmedAt === null, 'confirmedAt default');
      assert(r[0].confirmedBy === null, 'confirmedBy default');
    });

    // ── CAS B: buildSlotsFromRolesNeeded ─────────────────────────────────────
    run('B1: buildSlotsFromRolesNeeded generates correct slots', () => {
      const sessionId = 'sess-abc123';
      const rolesNeeded = ['RL-001', 'RL-002', 'RL-003'];
      const slots = buildSlotsFromRolesNeeded(sessionId, rolesNeeded);

      assert(slots.length === 3, `expected 3 slots, got ${slots.length}`);
      assert(slots[0].slotId === 'SL-sess-abc123-0', `slotId[0] mismatch: ${slots[0].slotId}`);
      assert(slots[1].slotId === 'SL-sess-abc123-1', `slotId[1] mismatch: ${slots[1].slotId}`);
      assert(slots[2].slotId === 'SL-sess-abc123-2', `slotId[2] mismatch: ${slots[2].slotId}`);
      assert(slots[0].roleSystemId === 'RL-001', 'roleSystemId[0]');
      assert(slots[1].roleSystemId === 'RL-002', 'roleSystemId[1]');
      assert(slots[2].roleSystemId === 'RL-003', 'roleSystemId[2]');
      assert(slots.every(s => s.status === 'open'), 'all status=open');
      assert(slots.every(s => s.candidateUserId === null), 'all candidateUserId=null');
      assert(slots.every(s => deepEqual(s.candidateStyleSystemIds, [])), 'all candidateStyleSystemIds=[]');
      assert(slots.every(s => s.confirmedAt === null), 'all confirmedAt=null');
      assert(slots.every(s => s.confirmedBy === null), 'all confirmedBy=null');
    });

    run('B2: buildSlotsFromRolesNeeded with empty array => []', () => {
      const slots = buildSlotsFromRolesNeeded('sess-x', []);
      assert(deepEqual(slots, []), 'expected []');
    });

    run('B3: slotId is stable (same input => same output)', () => {
      const a = buildSlotsFromRolesNeeded('sess-stable', ['RL-001']);
      const b = buildSlotsFromRolesNeeded('sess-stable', ['RL-001']);
      assert(a[0].slotId === b[0].slotId, 'slotId must be stable');
    });

    // ── CAS C: session already has slots => backfill skip logic ───────────────
    run('C1: normalizeSlots on existing slots returns them (skip logic)', () => {
      const existing = buildSlotsFromRolesNeeded('sess-existing', ['RL-001', 'RL-002']);
      const normalized = normalizeSlots(existing);
      assert(normalized.length === 2, 'should return 2 slots');
      // Simulate backfill guard: if existingSlots.length > 0 => skip
      const wouldBackfill = normalized.length === 0;
      assert(!wouldBackfill, 'should NOT backfill when slots exist');
    });

    // ── CAS D: no rolesNeeded => skip ────────────────────────────────────────
    run('D1: buildSlotsFromRolesNeeded(undefined) => []', () => {
      const slots = buildSlotsFromRolesNeeded('sess-x', undefined);
      assert(deepEqual(slots, []), 'expected []');
      const wouldBackfill = slots.length > 0;
      assert(!wouldBackfill, 'should NOT backfill when no rolesNeeded');
    });

    // ── findSlot tests ────────────────────────────────────────────────────────
    run('findSlot: finds correct slot', () => {
      const slots = buildSlotsFromRolesNeeded('sess-find', ['RL-001', 'RL-002']);
      const { slot, index } = findSlot(slots, 'SL-sess-find-1');
      assert(slot.slotId === 'SL-sess-find-1', 'slotId');
      assert(index === 1, 'index');
    });

    run('findSlot: throws SLOT_NOT_FOUND', () => {
      const slots = buildSlotsFromRolesNeeded('sess-find', ['RL-001']);
      try {
        findSlot(slots, 'SL-nonexistent');
        assert(false, 'should have thrown');
      } catch (err) {
        assert(err.code === 'SLOT_NOT_FOUND', `expected SLOT_NOT_FOUND, got ${err.code}`);
      }
    });

    // ── assertSlotState tests ─────────────────────────────────────────────────
    run('assertSlotState: passes when status in allowed', () => {
      const slot = { slotId: 'SL-x-0', status: 'open' };
      assertSlotState(slot, ['open', 'pending']); // should not throw
    });

    run('assertSlotState: throws INVALID_SLOT_STATE', () => {
      const slot = { slotId: 'SL-x-0', status: 'confirmed' };
      try {
        assertSlotState(slot, ['open'], 'test context');
        assert(false, 'should have thrown');
      } catch (err) {
        assert(err.code === 'INVALID_SLOT_STATE', `expected INVALID_SLOT_STATE, got ${err.code}`);
        assert(err.slotId === 'SL-x-0', 'slotId in error');
        assert(err.currentStatus === 'confirmed', 'currentStatus in error');
      }
    });

    return Response.json({
      ok: failed === 0,
      summary: { passed, failed, total: passed + failed },
      results,
    });

  } catch (error) {
    console.error('[validateSessionSlots] Fatal:', error?.message || error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});