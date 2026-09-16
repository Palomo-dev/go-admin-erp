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

jest.mock('../scheduled/healthRecalculate', () => ({
  runHealthRecalculate: jest.fn(async () => ({ orgs: 2, processed: 2, snapshots_written: 3, errors: 0, aborted: false, by_org: [] })),
}));
jest.mock('../scheduled/renewalsSync', () => ({
  runRenewalsSync: jest.fn(async () => ({ orgs: 2, processed: 2, created: 1, updated: 0, errors: 0, aborted: false, by_org: [] })),
}));

import { runMaintenance } from '../handlers/maintenance';
import { runHealthRecalculate } from '../scheduled/healthRecalculate';
import { runRenewalsSync } from '../scheduled/renewalsSync';
import { clearJobHandlers, registerJobHandler } from '../registry';
import { enqueueRecordingCleanup, hasScheduledKinds, runScheduledKinds } from '../scheduler';
import { makeJobLogger } from '../runner';

/**
 * r3: el productor lee `comm_settings` (activas), `call_recordings` (vencidas)
 * y `organizations` (zona horaria). `expired` son filas de grabaciones (puede
 * repetir org); `timezones` por org (las ausentes caen a America/Bogota).
 */
type Query = { table: string; ops: [string, unknown[]][] };
function makeSupabase(orgs: number[], opts: { expired?: number[]; timezones?: Record<number, string>; enqueueMs?: number; queries?: Query[] } = {}) {
  const expired = opts.expired ?? orgs;
  const rpc = jest.fn(async (_fn: string, args: Record<string, unknown>) => {
    if (opts.enqueueMs) await new Promise((r) => setTimeout(r, opts.enqueueMs));
    return { data: `job-${args.p_org}`, error: null };
  });
  const from = jest.fn((table: string) => {
    const q: Query = { table, ops: [] };
    opts.queries?.push(q);
    const chain: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'lt', 'in', 'limit']) {
      chain[m] = jest.fn((...args: unknown[]) => {
        q.ops.push([m, args]);
        return chain;
      });
    }
    chain.then = (resolve: (v: unknown) => void) => {
      if (table === 'comm_settings') return resolve({ data: orgs.map((organization_id) => ({ organization_id })), error: null });
      if (table === 'call_recordings') return resolve({ data: expired.map((organization_id) => ({ organization_id })), error: null });
      if (table === 'organizations') {
        const ids = (q.ops.find(([m]) => m === 'in')?.[1][1] as number[]) ?? [];
        return resolve({ data: ids.map((id) => ({ id, timezone: opts.timezones?.[id] ?? 'America/Bogota' })), error: null });
      }
      return resolve({ data: [], error: null });
    };
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
  it('hasScheduledKinds solo con maintenance|recording_cleanup|health_recalculate|renewals_sync', () => {
    expect(hasScheduledKinds(undefined)).toBe(false);
    expect(hasScheduledKinds(['email'])).toBe(false);
    expect(hasScheduledKinds(['email', 'maintenance'])).toBe(true);
    expect(hasScheduledKinds(['recording_cleanup'])).toBe(true);
    expect(hasScheduledKinds(['health_recalculate'])).toBe(true);
    expect(hasScheduledKinds(['renewals_sync'])).toBe(true);
  });

  it('F11: health_recalculate y renewals_sync corren EN PROCESO (sin encolar) y devuelven su resultado', async () => {
    const { sb, rpc } = makeSupabase([]);
    const now = new Date('2026-09-15T08:30:00Z');
    const out = await runScheduledKinds({ kinds: ['health_recalculate', 'renewals_sync'], budgetMs: 4000, worker: 'w', supabase: sb, now });
    expect(runHealthRecalculate).toHaveBeenCalledTimes(1);
    expect((runHealthRecalculate as jest.Mock).mock.calls[0][1]).toBe(now);
    expect((runHealthRecalculate as jest.Mock).mock.calls[0][3]).toBeInstanceOf(AbortSignal);
    expect(runRenewalsSync).toHaveBeenCalledTimes(1);
    expect(out.health_recalculate).toMatchObject({ ok: true, result: { snapshots_written: 3 } });
    expect(out.renewals_sync).toMatchObject({ ok: true, result: { created: 1 } });
    expect(rpc).not.toHaveBeenCalled(); // nada en outbound_jobs
    expect(runMaintenance).not.toHaveBeenCalled();
    expect(out.maintenance).toBeUndefined();
  });

  it('F11: solo se ejecuta la tarea pedida; una que lanza queda ok=false sin tumbar la otra', async () => {
    (runHealthRecalculate as jest.Mock).mockRejectedValueOnce(new Error('caída'));
    const { sb } = makeSupabase([]);
    const out = await runScheduledKinds({ kinds: ['health_recalculate', 'renewals_sync'], budgetMs: 4000, worker: 'w', supabase: sb });
    expect(out.health_recalculate).toMatchObject({ ok: false, error: 'Error: caída' });
    expect(out.renewals_sync).toMatchObject({ ok: true });

    jest.clearAllMocks();
    const only = await runScheduledKinds({ kinds: ['renewals_sync'], budgetMs: 4000, worker: 'w', supabase: sb });
    expect(runHealthRecalculate).not.toHaveBeenCalled();
    expect(only.health_recalculate).toBeUndefined();
    expect(only.renewals_sync).toMatchObject({ ok: true });

    jest.clearAllMocks();
    const onlyHealth = await runScheduledKinds({ kinds: ['health_recalculate'], budgetMs: 4000, worker: 'w', supabase: sb });
    expect(runRenewalsSync).not.toHaveBeenCalled();
    expect(onlyHealth.renewals_sync).toBeUndefined();
    expect(onlyHealth.health_recalculate).toMatchObject({ ok: true });
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

  it('recording_cleanup con handler real (F3) encola un singleton diario por org activa CON grabaciones vencidas', async () => {
    registerJobHandler('recording_cleanup', async () => ({}));
    const queries: Query[] = [];
    const { sb, rpc } = makeSupabase([105, 106, 105], { expired: [106, 105, 105], queries });
    const now = new Date('2026-09-08T08:30:00Z');
    const out = await runScheduledKinds({ kinds: ['recording_cleanup', 'maintenance'], budgetMs: 1000, worker: 'w', supabase: sb, now });
    expect(out.recording_cleanup).toMatchObject({ enqueued: 2, orgs: 2 });
    expect(out.recording_cleanup?.truncated).toBeUndefined();
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_org: 105, p_kind: 'recording_cleanup', p_dedupe_key: 'recording_cleanup:2026-09-08', p_max_attempts: 3 });
    expect(rpc.mock.calls[1][1]).toMatchObject({ p_org: 106 });
    expect(out.maintenance?.ok).toBe(true);
    // Selección: `call_recordings` status=ready y retention_until < día UTC del productor
    const rec = queries.find((q) => q.table === 'call_recordings') as Query;
    expect(rec.ops).toEqual(expect.arrayContaining([['eq', ['status', 'ready']], ['lt', ['retention_until', '2026-09-08']]]));
  });

  // r3 (N-6): 83 de 84 jobs diarios eran ruido (`deleted:0`).
  it('recording_cleanup: una org activa SIN grabaciones vencidas no se encola; una con vencidas pero inactiva tampoco', async () => {
    registerJobHandler('recording_cleanup', async () => ({}));
    const { sb, rpc } = makeSupabase([105, 106], { expired: [106, 107] });
    const out = await runScheduledKinds({ kinds: ['recording_cleanup'], budgetMs: 1000, worker: 'w', supabase: sb, now: new Date('2026-09-08T08:30:00Z') });
    expect(out.recording_cleanup).toMatchObject({ enqueued: 1, orgs: 1 });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_org: 106 });

    const none = makeSupabase([105, 106], { expired: [] });
    const out2 = await runScheduledKinds({ kinds: ['recording_cleanup'], budgetMs: 1000, worker: 'w', supabase: none.sb });
    expect(out2.recording_cleanup).toMatchObject({ enqueued: 0, orgs: 0, reason: 'no_expired_recordings' });
    expect(none.rpc).not.toHaveBeenCalled();
  });

  // r3 (N-7): `retention_until` es `date` ⇒ la clave y `scheduled_for` usan el día de la ORGANIZACIÓN.
  it('recording_cleanup: la clave diaria y scheduled_for salen del día calendario de cada org (no del día UTC)', async () => {
    registerJobHandler('recording_cleanup', async () => ({}));
    // 2026-09-16 03:00 UTC = 2026-09-15 22:00 en Bogotá, 2026-09-16 12:00 en Tokio
    const now = new Date('2026-09-16T03:00:00Z');
    const { sb, rpc } = makeSupabase([105, 106], { timezones: { 105: 'America/Bogota', 106: 'Asia/Tokyo' } });
    await runScheduledKinds({ kinds: ['recording_cleanup'], budgetMs: 1000, worker: 'w', supabase: sb, now });
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_org: 105, p_dedupe_key: 'recording_cleanup:2026-09-15', p_payload: { scheduled_for: '2026-09-15' } });
    expect(rpc.mock.calls[1][1]).toMatchObject({ p_org: 106, p_dedupe_key: 'recording_cleanup:2026-09-16', p_payload: { scheduled_for: '2026-09-16' } });
  });

  // r3 (N-1): el bucle de encolado respeta presupuesto y signal.
  it('recording_cleanup: 120 orgs con enqueueJob de 100 ms y budget 1 s ⇒ enqueued < 120, truncated y pending_org_ids; ningún enqueue tras el corte', async () => {
    registerJobHandler('recording_cleanup', async () => ({}));
    const orgs = Array.from({ length: 120 }, (_, i) => 1000 + i);
    const { sb, rpc } = makeSupabase(orgs, { enqueueMs: 100 });
    const started = Date.now();
    const out = await runScheduledKinds({ kinds: ['recording_cleanup'], budgetMs: 1_000, totalBudgetMs: 60_000, worker: 'w', supabase: sb });
    const elapsed = Date.now() - started;
    const rc = out.recording_cleanup as NonNullable<typeof out.recording_cleanup>;
    expect(rc.orgs).toBe(120);
    expect(rc.enqueued).toBeLessThan(120);
    expect(rc.enqueued).toBeGreaterThan(0);
    expect(rc.truncated).toBe(true);
    expect(rc.pending_org_ids).toHaveLength(120 - rc.enqueued);
    expect(rc.pending_org_ids?.[0]).toBe(1000 + rc.enqueued);
    expect(rpc).toHaveBeenCalledTimes(rc.enqueued);
    expect(elapsed).toBeLessThan(2_500);
  });

  it('totalBudgetMs agotado por maintenance ⇒ el encolado recibe 0 ms: no consulta ni encola nada, truncated con reason budget_exhausted (r4, T-3)', async () => {
    registerJobHandler('recording_cleanup', async () => ({}));
    (runMaintenance as jest.Mock).mockImplementationOnce(async () => {
      await new Promise((r) => setTimeout(r, 300));
      return { jobs_deleted: 0 };
    });
    const { sb, rpc, from } = makeSupabase([105, 106]);
    const out = await runScheduledKinds({ kinds: ['maintenance', 'recording_cleanup'], budgetMs: 5_000, totalBudgetMs: 250, worker: 'w', supabase: sb });
    expect(out.maintenance?.ok).toBe(true);
    expect(out.recording_cleanup).toMatchObject({ enqueued: 0, orgs: 0, truncated: true, reason: 'budget_exhausted' });
    expect(from).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('presupuesto agotado tras seleccionar las orgs (antes de cargar zonas) ⇒ truncated con pending_org_ids = todas y sin consultar organizations', async () => {
    registerJobHandler('recording_cleanup', async () => ({}));
    const queries: Query[] = [];
    const { sb, rpc } = makeSupabase([105, 106], { queries });
    const controller = new AbortController();
    // La señal se aborta durante la selección (primer round-trip).
    const sbAborting = { ...sb, from: (table: string) => { controller.abort(); return (sb.from as (t: string) => unknown)(table); } } as unknown as typeof sb;
    const out = await enqueueRecordingCleanup(sbAborting, new Date('2026-09-15T08:30:00Z'), makeJobLogger({ worker: 'w' }), { signal: controller.signal, budgetMs: 60_000 });
    expect(out).toMatchObject({ enqueued: 0, orgs: 2, truncated: true, pending_org_ids: [105, 106], reason: 'budget_exhausted' });
    expect(queries.map((q) => q.table)).toEqual(['comm_settings', 'call_recordings']);
    expect(rpc).not.toHaveBeenCalled();
  });
});
