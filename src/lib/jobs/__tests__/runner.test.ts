/**
 * Tests del runner de `outbound_jobs` (FASE-00 §9.1) con Supabase mockeado.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

// El runner importa './handlers' como side-effect; lo neutralizamos para
// registrar handlers controlados por el test.
jest.mock('../handlers', () => ({}));

import { runJobs } from '../runner';
import { clearJobHandlers, registerJobHandler } from '../registry';
import { JobFatalError, JobRetryableError, type OutboundJob } from '../types';

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

interface RpcCall {
  fn: string;
  args: Record<string, unknown>;
}

/**
 * Mock mínimo: `rpc` devuelve lotes en orden; `from().update()` registra releases
 * (fallback) y sus valores. `fn_fail_job` imita la RPC real: p_retry_after_seconds < 0
 * → 'failed'; attempts >= max_attempts → 'dead'; si no → 'queued'.
 * `fn_release_job` (DB-r2) existe solo si `releaseRpc = true`; si no, responde
 * PGRST202 como PostgREST y el runner debe usar el fallback UPDATE.
 */
function makeSupabase(batches: OutboundJob[][], opts: { releaseRpc?: boolean } = {}) {
  const calls: RpcCall[] = [];
  const releases: string[] = [];
  const updates: Record<string, unknown>[] = [];
  const all = batches.flat();
  let batchIdx = 0;
  const sb = {
    rpc: jest.fn(async (fn: string, args: Record<string, unknown>) => {
      calls.push({ fn, args });
      if (fn === 'fn_release_job') {
        if (opts.releaseRpc) {
          releases.push(String(args.p_job_id));
          return { data: true, error: null };
        }
        return { data: null, error: { code: 'PGRST202', message: 'Could not find the function public.fn_release_job' } };
      }
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
      const self = () => chain;
      chain.update = jest.fn((values: Record<string, unknown>) => {
        updates.push(values);
        return chain;
      });
      chain.eq = jest.fn((col: string, val: string) => {
        if (col === 'id') releases.push(val);
        return chain;
      });
      chain.then = (resolve: (v: unknown) => void) => resolve({ error: null });
      void self;
      return chain;
    }),
  };
  return { sb: sb as unknown as SupabaseClient, calls, releases, updates };
}

beforeEach(() => {
  clearJobHandlers();
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('runJobs', () => {
  it('completa el job con handler y marca failed (terminal) el job sin handler', async () => {
    registerJobHandler('noop', async ({ job }) => ({ ok: true, id: job.id }));
    const { sb, calls } = makeSupabase([[makeJob({ id: 'a', kind: 'noop' }), makeJob({ id: 'b', kind: 'email' })]]);

    const summary = await runJobs({ supabase: sb, worker: 'w1', limit: 25 });

    expect(summary.claimed).toBe(2);
    expect(summary.done).toBe(1);
    expect(summary.failed).toBe(1);
    expect(summary.dead).toBe(0);
    expect(summary.retried).toBe(0);
    expect(summary.byKind.noop?.done).toBe(1);
    expect(summary.byKind.email?.failed).toBe(1);

    const complete = calls.find((c) => c.fn === 'fn_complete_job');
    expect(complete?.args).toMatchObject({ p_job_id: 'a', p_worker: 'w1', p_result: { ok: true, id: 'a' } });

    const fail = calls.find((c) => c.fn === 'fn_fail_job');
    expect(fail?.args).toEqual({ p_job_id: 'b', p_worker: 'w1', p_error: 'no_handler', p_retry_after_seconds: -1 });
  });

  it('un handler que lanza llama a fn_fail_job con el error; retryAfterSeconds, fatal y max_attempts', async () => {
    registerJobHandler('whatsapp', async () => {
      throw new JobRetryableError('meta 131049', 86400);
    });
    registerJobHandler('sms', async () => {
      throw new Error('boom');
    });
    registerJobHandler('analyze', async () => {
      throw new JobFatalError('budget_exceeded');
    });
    registerJobHandler('transcribe', async () => {
      throw new Error('last try');
    });
    const { sb, calls } = makeSupabase([
      [
        makeJob({ id: 'wa', kind: 'whatsapp' }),
        makeJob({ id: 'sms', kind: 'sms' }),
        makeJob({ id: 'an', kind: 'analyze' }),
        makeJob({ id: 'tr', kind: 'transcribe', attempts: 3, max_attempts: 3 }),
      ],
    ]);

    const summary = await runJobs({ supabase: sb, worker: 'w2' });

    expect(summary.retried).toBe(2);
    expect(summary.failed).toBe(1);
    expect(summary.dead).toBe(1);
    const fails = calls.filter((c) => c.fn === 'fn_fail_job');
    expect(fails).toHaveLength(4);
    expect(fails[0].args).toMatchObject({ p_job_id: 'wa', p_worker: 'w2', p_retry_after_seconds: 86400 });
    expect(String(fails[0].args.p_error)).toContain('meta 131049');
    expect(fails[1].args).toMatchObject({ p_job_id: 'sms', p_retry_after_seconds: null });
    expect(String(fails[1].args.p_error)).toContain('boom');
    expect(fails[2].args).toMatchObject({ p_job_id: 'an', p_retry_after_seconds: -1 });
    expect(String(fails[2].args.p_error)).toContain('budget_exceeded');
    expect(fails[3].args).toMatchObject({ p_job_id: 'tr', p_retry_after_seconds: null });
    expect(summary.byKind.transcribe?.dead).toBe(1);
  });

  it('si fn_complete_job devuelve false (lock perdido) no cuenta done', async () => {
    registerJobHandler('noop', async () => ({}));
    const { sb } = makeSupabase([[makeJob({ id: 'z', kind: 'noop' })]]);
    (sb.rpc as jest.Mock).mockImplementation(async (fn: string) =>
      fn === 'fn_claim_jobs' ? { data: [makeJob({ id: 'z', kind: 'noop' })], error: null } : { data: false, error: null },
    );
    const summary = await runJobs({ supabase: sb, worker: 'w8' });
    expect(summary.claimed).toBe(1);
    expect(summary.done).toBe(0);
  });

  it('cuenta skipped cuando el handler devuelve {skipped:true} y sigue siendo done', async () => {
    registerJobHandler('campaign_batch', async () => ({ skipped: true, reason: 'handler_not_registered' }));
    const { sb } = makeSupabase([[makeJob({ id: 'c', kind: 'campaign_batch' })]]);
    const summary = await runJobs({ supabase: sb, worker: 'w3' });
    expect(summary.done).toBe(1);
    expect(summary.skipped).toBe(1);
  });

  it('respeta el deadline: aborta el job lento, libera el resto del lote y no lanza', async () => {
    registerJobHandler('transcribe', async ({ signal }) => {
      await new Promise<void>((resolve) => {
        const t = setTimeout(resolve, 5_000);
        signal.addEventListener('abort', () => {
          clearTimeout(t);
          resolve();
        });
      });
      return { ok: true };
    });
    const { sb, calls, releases, updates } = makeSupabase([
      [makeJob({ id: 't1', kind: 'transcribe' }), makeJob({ id: 't2', kind: 'transcribe', attempts: 2 }), makeJob({ id: 't3', kind: 'transcribe' })],
    ]);

    const started = Date.now();
    const summary = await runJobs({ supabase: sb, worker: 'w4', deadlineMs: 2_000, jobTimeoutMs: 30_000 });
    const elapsed = Date.now() - started;

    expect(elapsed).toBeLessThan(4_000);
    // t1 corre hasta que el timeout dinámico (deadline-500ms) lo aborta → retry con backoff
    const fails = calls.filter((c) => c.fn === 'fn_fail_job');
    expect(fails).toHaveLength(1);
    expect(fails[0].args.p_job_id).toBe('t1');
    expect(fails[0].args.p_retry_after_seconds).toBeNull();
    expect(String(fails[0].args.p_error)).toContain('timeout');
    expect(summary.retried).toBe(1);
    // t2 y t3 se liberan sin ejecutarse. Sin fn_release_job (PGRST202) → fallback
    // UPDATE que devuelve el intento del claim (F-4) y NO toca last_error.
    expect(releases).toEqual(expect.arrayContaining(['t2', 't3']));
    expect(summary.released).toBe(2);
    expect(summary.releasedWithoutRpc).toBe(2);
    expect(summary.claimed).toBe(1);
    expect(calls.filter((c) => c.fn === 'fn_release_job')).toHaveLength(1); // se memoriza que falta
    expect(updates).toEqual([
      { status: 'queued', locked_at: null, locked_by: null, attempts: 1 },
      { status: 'queued', locked_at: null, locked_by: null, attempts: 0 },
    ]);
    expect(updates.some((u) => 'last_error' in u)).toBe(false);
  });

  it('libera con fn_release_job(p_job_id, p_worker) cuando la RPC existe (DB-r2) sin UPDATE directo', async () => {
    registerJobHandler('transcribe', async ({ signal }) => {
      await new Promise<void>((resolve) => {
        const t = setTimeout(resolve, 5_000);
        signal.addEventListener('abort', () => {
          clearTimeout(t);
          resolve();
        });
      });
    });
    const { sb, calls, releases, updates } = makeSupabase(
      [[makeJob({ id: 'r1', kind: 'transcribe' }), makeJob({ id: 'r2', kind: 'transcribe' })]],
      { releaseRpc: true },
    );
    const summary = await runJobs({ supabase: sb, worker: 'w9', deadlineMs: 2_000 });
    expect(summary.released).toBe(1);
    expect(summary.releasedWithoutRpc).toBeUndefined();
    expect(releases).toEqual(['r2']);
    expect(calls.find((c) => c.fn === 'fn_release_job')?.args).toEqual({ p_job_id: 'r2', p_worker: 'w9' });
    expect(updates).toEqual([]);
  });

  it('no vuelve a reclamar cuando el lote viene incompleto y nunca lanza si el claim falla', async () => {
    registerJobHandler('noop', async () => ({}));
    const { sb, calls } = makeSupabase([[makeJob({ id: 'x', kind: 'noop' })], [makeJob({ id: 'y', kind: 'noop' })]]);
    const summary = await runJobs({ supabase: sb, worker: 'w5', limit: 25 });
    expect(summary.claimed).toBe(1);
    expect(calls.filter((c) => c.fn === 'fn_claim_jobs')).toHaveLength(1);

    const broken = {
      rpc: jest.fn(async () => ({ data: null, error: { message: 'relation outbound_jobs does not exist' } })),
      from: jest.fn(),
    } as unknown as SupabaseClient;
    await expect(runJobs({ supabase: broken, worker: 'w6' })).resolves.toMatchObject({ claimed: 0, done: 0 });
  });

  it('kinds pedidos pero ninguno válido ⇒ NO reclama nada (F-3); sin kinds ⇒ p_kinds null; mezcla ⇒ solo válidos', async () => {
    const onlyBad = makeSupabase([[]]);
    const summary = await runJobs({ supabase: onlyBad.sb, worker: 'w7', kinds: ['nope' as never] });
    expect(summary.claimed).toBe(0);
    expect(onlyBad.calls).toHaveLength(0);

    const none = makeSupabase([[]]);
    await runJobs({ supabase: none.sb, worker: 'w7' });
    expect(none.calls[0].args).toMatchObject({ p_kinds: null, p_limit: 25, p_worker: 'w7' });

    const mixed = makeSupabase([[]]);
    await runJobs({ supabase: mixed.sb, worker: 'w7', kinds: ['nope' as never, 'maintenance'] });
    expect(mixed.calls[0].args).toMatchObject({ p_kinds: ['maintenance'] });
  });
});
