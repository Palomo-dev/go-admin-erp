/**
 * Tester F0-JOBS r2 — casos borde de `runJobs` no cubiertos por `runner.test.ts`:
 * `fn_release_job` con error real (no "missing"), fallo de `fn_complete_job`
 * tras un handler exitoso (doble ejecución), `retryAfterSeconds` 0/negativo,
 * resultado no-objeto del handler, `fn_fail_job` que devuelve 'ignored' y
 * un kind fuera del enum devuelto por el claim.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

jest.mock('../handlers', () => ({}));

import { runJobs } from '../runner';
import { clearJobHandlers, registerJobHandler } from '../registry';
import { JobRetryableError, type OutboundJob } from '../types';

function makeJob(partial: Partial<OutboundJob> & Pick<OutboundJob, 'id' | 'kind'>): OutboundJob {
  return {
    organization_id: 105,
    payload: {},
    status: 'running',
    run_at: new Date().toISOString(),
    attempts: 1,
    max_attempts: 3,
    last_error: null,
    result: null,
    locked_at: new Date().toISOString(),
    locked_by: 'test',
    dedupe_key: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...partial,
  };
}

interface RpcCall { fn: string; args: Record<string, unknown> }

type RpcOverride = (fn: string, args: Record<string, unknown>) => { data: unknown; error: { code?: string; message: string } | null } | undefined;

function makeSupabase(batches: OutboundJob[][], override?: RpcOverride) {
  const calls: RpcCall[] = [];
  const updates: Record<string, unknown>[] = [];
  const all = batches.flat();
  let batchIdx = 0;
  const sb = {
    rpc: jest.fn(async (fn: string, args: Record<string, unknown>) => {
      calls.push({ fn, args });
      const o = override?.(fn, args);
      if (o) return o;
      if (fn === 'fn_release_job') return { data: true, error: null };
      if (fn === 'fn_claim_jobs') {
        const batch = batches[batchIdx] ?? [];
        batchIdx += 1;
        return { data: batch, error: null };
      }
      if (fn === 'fn_fail_job') {
        const job = all.find((j) => j.id === args.p_job_id);
        const ra = args.p_retry_after_seconds as number | null;
        if (ra !== null && ra < 0) return { data: 'failed', error: null };
        if (job && job.attempts >= job.max_attempts) return { data: 'dead', error: null };
        return { data: 'queued', error: null };
      }
      if (fn === 'fn_complete_job') return { data: true, error: null };
      return { data: null, error: null };
    }),
    from: jest.fn(() => {
      const chain: Record<string, unknown> = {};
      chain.update = jest.fn((values: Record<string, unknown>) => { updates.push(values); return chain; });
      chain.eq = jest.fn(() => chain);
      chain.then = (resolve: (v: unknown) => void) => resolve({ error: null });
      return chain;
    }),
  };
  return { sb: sb as unknown as SupabaseClient, calls, updates };
}

const byFn = (calls: RpcCall[], fn: string) => calls.filter((c) => c.fn === fn);

beforeEach(() => {
  clearJobHandlers();
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('tester r2 — runJobs', () => {
  it('fn_release_job con error REAL (no missing): no usa el fallback UPDATE, no lanza, released=0 y el job queda running (lo rescata el reclaim de 10 min)', async () => {
    registerJobHandler('noop', async () => new Promise((r) => setTimeout(() => r({ ok: true }), 400)));
    const jobs = [makeJob({ id: 'a', kind: 'noop' }), makeJob({ id: 'b', kind: 'noop' }), makeJob({ id: 'c', kind: 'noop' })];
    const { sb, calls, updates } = makeSupabase([jobs], (fn) =>
      fn === 'fn_release_job' ? { data: null, error: { code: '42501', message: 'permission denied for function fn_release_job' } } : undefined,
    );
    const summary = await runJobs({ supabase: sb, worker: 'w', deadlineMs: 1_900, limit: 3 });
    expect(summary.released).toBe(0);
    expect(summary.releasedWithoutRpc).toBeUndefined();
    expect(updates).toHaveLength(0); // no se cae al UPDATE directo con un error que no es "función ausente"
    expect(byFn(calls, 'fn_fail_job')).toHaveLength(0);
    expect(byFn(calls, 'fn_release_job').length).toBeGreaterThanOrEqual(1);
  });

  // r3 (QA r2 N-4): el efecto YA ocurrió; el job nunca vuelve a `queued`.
  it('fn_complete_job lanza tras un handler EXITOSO ⇒ se reintenta la RPC una vez y el job se cierra `failed` terminal (complete_failed), nunca `queued`', async () => {
    const handler = jest.fn(async () => ({ sent: true }));
    registerJobHandler('noop', handler);
    const { sb, calls } = makeSupabase([[makeJob({ id: 'a', kind: 'noop' })]], (fn) =>
      fn === 'fn_complete_job' ? { data: null, error: { message: 'canceling statement due to statement timeout' } } : undefined,
    );
    const summary = await runJobs({ supabase: sb, worker: 'w' });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(byFn(calls, 'fn_complete_job')).toHaveLength(2); // reintento único de la RPC
    expect(summary.done).toBe(0);
    expect(summary.retried).toBe(0);
    expect(summary.completeFailed).toBe(1);
    expect(summary.failed).toBe(1);
    const fail = byFn(calls, 'fn_fail_job')[0];
    expect(fail.args.p_error).toMatch(/^complete_failed: .*fn_complete_job/);
    expect(fail.args.p_retry_after_seconds).toBe(-1); // terminal: el handler NO volverá a ejecutarse
  });

  it('fn_complete_job falla solo la primera vez ⇒ el reintento de la RPC lo completa (done:1, sin fn_fail_job)', async () => {
    registerJobHandler('noop', async () => ({ sent: true }));
    let completes = 0;
    const { sb, calls } = makeSupabase([[makeJob({ id: 'a', kind: 'noop' })]], (fn) => {
      if (fn !== 'fn_complete_job') return undefined;
      completes += 1;
      return completes === 1 ? { data: null, error: { message: 'timeout' } } : undefined;
    });
    const summary = await runJobs({ supabase: sb, worker: 'w' });
    expect(summary.done).toBe(1);
    expect(summary.completeFailed).toBeUndefined();
    expect(byFn(calls, 'fn_fail_job')).toHaveLength(0);
  });

  it('fn_complete_job Y fn_fail_job fallan tras un handler exitoso ⇒ completeFailed:1, failed:0, el job queda running (reclaim) y el runner no lanza', async () => {
    registerJobHandler('noop', async () => ({ sent: true }));
    const { sb } = makeSupabase([[makeJob({ id: 'a', kind: 'noop' })]], (fn) =>
      fn === 'fn_complete_job' || fn === 'fn_fail_job' ? { data: null, error: { message: 'db down' } } : undefined,
    );
    const summary = await runJobs({ supabase: sb, worker: 'w' });
    expect(summary.completeFailed).toBe(1);
    expect(summary.failed + summary.retried + summary.done).toBe(0);
  });

  it('JobRetryableError(retryAfterSeconds: 0) ⇒ p_retry_after_seconds 0 (reintento inmediato, sin backoff)', async () => {
    registerJobHandler('noop', async () => { throw new JobRetryableError('rate limited', 0); });
    const { sb, calls } = makeSupabase([[makeJob({ id: 'a', kind: 'noop' })]]);
    await runJobs({ supabase: sb, worker: 'w' });
    expect(byFn(calls, 'fn_fail_job')[0].args.p_retry_after_seconds).toBe(0);
  });

  // r3 (N-8): el mismo job re-encolado con run_at=now() vuelve en el siguiente lote de la MISMA invocación.
  it('el claim devuelve el mismo job en dos lotes ⇒ handler invocado UNA vez, released:1 y el bucle termina', async () => {
    const handler = jest.fn(async () => { throw new JobRetryableError('rate limited', 0); });
    registerJobHandler('noop', handler);
    const a = makeJob({ id: 'a', kind: 'noop' });
    const b = makeJob({ id: 'b', kind: 'noop' });
    const { sb, calls } = makeSupabase([[a, b], [a, b], [a, b]]);
    const summary = await runJobs({ supabase: sb, worker: 'w', limit: 2 });
    expect(handler).toHaveBeenCalledTimes(2); // a y b una vez cada uno
    expect(summary.claimed).toBe(2);
    expect(summary.released).toBe(2);
    expect(byFn(calls, 'fn_release_job').map((c) => c.args.p_job_id)).toEqual(['a', 'b']);
    expect(byFn(calls, 'fn_claim_jobs')).toHaveLength(2); // el tercer lote nunca se pide
  });

  it('JobRetryableError(retryAfterSeconds: -30) NO se convierte en terminal: se recorta a 0', async () => {
    registerJobHandler('noop', async () => { throw new JobRetryableError('negativo', -30); });
    const { sb, calls } = makeSupabase([[makeJob({ id: 'a', kind: 'noop' })]]);
    const summary = await runJobs({ supabase: sb, worker: 'w' });
    expect(byFn(calls, 'fn_fail_job')[0].args.p_retry_after_seconds).toBe(0);
    expect(summary.failed).toBe(0);
    expect(summary.retried).toBe(1);
  });

  it('JobRetryableError(retryAfterSeconds: 86400.9) ⇒ entero 86400 (Meta 131049)', async () => {
    registerJobHandler('noop', async () => { throw new JobRetryableError('meta 131049', 86400.9); });
    const { sb, calls } = makeSupabase([[makeJob({ id: 'a', kind: 'noop' })]]);
    await runJobs({ supabase: sb, worker: 'w' });
    expect(byFn(calls, 'fn_fail_job')[0].args.p_retry_after_seconds).toBe(86400);
  });

  it('handler que devuelve un string / número / array ⇒ p_result null y done (no revienta el jsonb)', async () => {
    const values: unknown[] = ['ok', 42, [1, 2]];
    for (const v of values) {
      clearJobHandlers();
      registerJobHandler('noop', (async () => v) as never);
      const { sb, calls } = makeSupabase([[makeJob({ id: 'a', kind: 'noop' })]]);
      const summary = await runJobs({ supabase: sb, worker: 'w' });
      const complete = byFn(calls, 'fn_complete_job')[0];
      // r3 (N-9): un array también es "object" pero no es un registro plano ⇒ p_result null explícito
      expect(complete.args.p_result).toBeNull();
      expect(summary.done).toBe(1);
    }
  });

  it('fn_fail_job devuelve "ignored" (lock perdido) ⇒ no cuenta failed/retried/dead', async () => {
    registerJobHandler('noop', async () => { throw new Error('boom'); });
    const { sb } = makeSupabase([[makeJob({ id: 'a', kind: 'noop' })]], (fn) =>
      fn === 'fn_fail_job' ? { data: 'ignored', error: null } : undefined,
    );
    const summary = await runJobs({ supabase: sb, worker: 'w' });
    expect(summary.claimed).toBe(1);
    expect(summary.failed + summary.retried + summary.dead + summary.done).toBe(0);
  });

  it('el claim devuelve un kind FUERA del enum (CHECK ampliado en BD sin actualizar enums.ts) ⇒ failed terminal no_handler, nunca dead ni excepción', async () => {
    const { sb, calls } = makeSupabase([[makeJob({ id: 'a', kind: 'agent_orchestration' as never })]]);
    const summary = await runJobs({ supabase: sb, worker: 'w' });
    expect(summary.failed).toBe(1);
    const fail = byFn(calls, 'fn_fail_job')[0];
    expect(fail.args).toMatchObject({ p_error: 'no_handler', p_retry_after_seconds: -1 });
  });

  it('el error del handler se trunca a 4000 chars en p_error', async () => {
    registerJobHandler('noop', async () => { throw new Error('x'.repeat(10_000)); });
    const { sb, calls } = makeSupabase([[makeJob({ id: 'a', kind: 'noop' })]]);
    await runJobs({ supabase: sb, worker: 'w' });
    expect(String(byFn(calls, 'fn_fail_job')[0].args.p_error).length).toBeLessThanOrEqual(4000);
  });

  it('limit fuera de rango: 0 ⇒ 1, 999 ⇒ 200', async () => {
    const { sb, calls } = makeSupabase([[]]);
    await runJobs({ supabase: sb, worker: 'w', limit: 0 });
    expect(byFn(calls, 'fn_claim_jobs')[0].args.p_limit).toBe(1);
    const second = makeSupabase([[]]);
    await runJobs({ supabase: second.sb, worker: 'w', limit: 999 });
    expect(byFn(second.calls, 'fn_claim_jobs')[0].args.p_limit).toBe(200);
  });

  it('deadline ya vencido al entrar (deadlineMs: 0) ⇒ no reclama nada', async () => {
    const { sb, calls } = makeSupabase([[makeJob({ id: 'a', kind: 'noop' })]]);
    const summary = await runJobs({ supabase: sb, worker: 'w', deadlineMs: 0 });
    expect(byFn(calls, 'fn_claim_jobs')).toHaveLength(0);
    expect(summary.claimed).toBe(0);
  });
});
