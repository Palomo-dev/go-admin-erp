/**
 * Productor de kinds programados (tester r1 F-1): `maintenance` corre directo
 * (global) y `recording_cleanup` solo encola por org cuando F3 registre el
 * handler real.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

jest.mock('../handlers', () => ({}));
jest.mock('../handlers/maintenance', () => ({
  runMaintenance: jest.fn(async () => ({ jobs_deleted: 1, jobs_terminal_deleted: 0, events_deleted: 0, events_failed_deleted: 0, events_resynced: 0, events_abandoned: 0, cutoff: 'x' })),
}));

import { runMaintenance } from '../handlers/maintenance';
import { clearJobHandlers, registerJobHandler } from '../registry';
import { hasScheduledKinds, runScheduledKinds } from '../scheduler';

function makeSupabase(orgs: number[]) {
  const rpc = jest.fn(async (_fn: string, args: Record<string, unknown>) => ({ data: `job-${args.p_org}`, error: null }));
  const from = jest.fn(() => {
    const chain: Record<string, unknown> = {};
    chain.select = jest.fn(() => chain);
    chain.eq = jest.fn(() => chain);
    chain.limit = jest.fn(() => chain);
    chain.then = (resolve: (v: unknown) => void) => resolve({ data: orgs.map((organization_id) => ({ organization_id })), error: null });
    return chain;
  });
  return { sb: { rpc, from } as unknown as SupabaseClient, rpc, from };
}

beforeEach(() => {
  clearJobHandlers();
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('runScheduledKinds', () => {
  it('hasScheduledKinds solo con maintenance|recording_cleanup', () => {
    expect(hasScheduledKinds(undefined)).toBe(false);
    expect(hasScheduledKinds(['email'])).toBe(false);
    expect(hasScheduledKinds(['email', 'maintenance'])).toBe(true);
    expect(hasScheduledKinds(['recording_cleanup'])).toBe(true);
  });

  it('maintenance se ejecuta directamente (sin encolar) y devuelve el resultado', async () => {
    const { sb, rpc } = makeSupabase([]);
    const out = await runScheduledKinds({ kinds: ['maintenance'], budgetMs: 1000, worker: 'w', supabase: sb });
    expect(runMaintenance).toHaveBeenCalledTimes(1);
    expect(out.maintenance).toMatchObject({ ok: true, result: { jobs_deleted: 1 } });
    expect(rpc).not.toHaveBeenCalled();
    expect(out.recording_cleanup).toBeUndefined();
  });

  it('maintenance que falla no lanza: ok=false con el error', async () => {
    (runMaintenance as jest.Mock).mockRejectedValueOnce(new Error('db down'));
    const { sb } = makeSupabase([]);
    const out = await runScheduledKinds({ kinds: ['maintenance'], budgetMs: 1000, worker: 'w', supabase: sb });
    expect(out.maintenance).toMatchObject({ ok: false, error: 'Error: db down' });
  });

  it('recording_cleanup con placeholder (F0) no encola nada', async () => {
    registerJobHandler('recording_cleanup', async () => ({ skipped: true }), { placeholder: true });
    const { sb, rpc } = makeSupabase([105, 106]);
    const out = await runScheduledKinds({ kinds: ['recording_cleanup'], budgetMs: 1000, worker: 'w', supabase: sb });
    expect(out.recording_cleanup).toEqual({ enqueued: 0, orgs: 0, reason: 'handler_not_registered' });
    expect(rpc).not.toHaveBeenCalled();
    expect(runMaintenance).not.toHaveBeenCalled();
  });

  it('recording_cleanup con handler real (F3) encola un singleton diario por org activa', async () => {
    registerJobHandler('recording_cleanup', async () => ({}));
    const { sb, rpc } = makeSupabase([105, 106, 105]);
    const now = new Date('2026-09-08T08:30:00Z');
    const out = await runScheduledKinds({ kinds: ['recording_cleanup', 'maintenance'], budgetMs: 1000, worker: 'w', supabase: sb, now });
    expect(out.recording_cleanup).toEqual({ enqueued: 2, orgs: 2 });
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_org: 105, p_kind: 'recording_cleanup', p_dedupe_key: 'recording_cleanup:2026-09-08', p_max_attempts: 3 });
    expect(rpc.mock.calls[1][1]).toMatchObject({ p_org: 106 });
    expect(out.maintenance?.ok).toBe(true);
  });
});
