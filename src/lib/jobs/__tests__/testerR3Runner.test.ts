/**
 * Tester F0-JOBS r3 — runner: `complete_failed` terminal (QA r2 N-4), lock
 * perdido en `fn_complete_job`, timeout advisory con handler que sigue vivo,
 * `Set` de ids ejecutados (N-8) y sus bordes (fallo de `fn_release_job` en el
 * repetido, repetido en el MISMO lote, `sawRepeat` no corta los demás).
 *
 * Los casos `it.failing` documentan huecos: pasan mientras el hueco exista y
 * fallan («expected to fail») cuando el builder lo cierre, para que se vuelvan
 * `it` normales.
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
type RpcOverride = (fn: string, args: Record<string, unknown>, n: number) => { data: unknown; error: { code?: string; message: string } | null } | undefined;

function makeSupabase(batches: OutboundJob[][], override?: RpcOverride) {
  const calls: RpcCall[] = [];
  const all = batches.flat();
  let batchIdx = 0;
  const sb = {
    rpc: jest.fn(async (fn: string, args: Record<string, unknown>) => {
      calls.push({ fn, args });
      const o = override?.(fn, args, calls.filter((c) => c.fn === fn).length);
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
      chain.update = jest.fn(() => chain);
      chain.eq = jest.fn(() => chain);
      chain.then = (resolve: (v: unknown) => void) => resolve({ error: null });
      return chain;
    }),
  };
  return { sb: sb as unknown as SupabaseClient, calls };
}

const byFn = (calls: RpcCall[], fn: string) => calls.filter((c) => c.fn === fn);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

beforeEach(() => {
  clearJobHandlers();
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('tester r3 — complete_failed (N-4)', () => {
  it('handler OK + fn_complete_job falla 2 veces ⇒ fn_fail_job(-1) con last_error complete_failed y, en la SIGUIENTE invocación, el job no vuelve (terminal)', async () => {
    const handler = jest.fn(async () => ({ sent: true }));
    registerJobHandler('noop', handler);
    // Simula la BD: tras fn_fail_job(-1) el job es `failed` y el claim ya no lo devuelve.
    const store = { status: 'running' };
    const a = makeJob({ id: 'a', kind: 'noop' });
    const { sb, calls } = makeSupabase([[a], [a], [a]], (fn, args) => {
      if (fn === 'fn_claim_jobs') return { data: store.status === 'running' ? [a] : [], error: null };
      if (fn === 'fn_complete_job') return { data: null, error: { message: 'statement timeout' } };
      if (fn === 'fn_fail_job' && (args.p_retry_after_seconds as number) < 0) { store.status = 'failed'; return { data: 'failed', error: null }; }
      return undefined;
    });
    const s1 = await runJobs({ supabase: sb, worker: 'w' });
    const s2 = await runJobs({ supabase: sb, worker: 'w' });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(s1).toMatchObject({ claimed: 1, done: 0, retried: 0, failed: 1, completeFailed: 1 });
    expect(s2).toMatchObject({ claimed: 0 });
    expect(byFn(calls, 'fn_fail_job')).toHaveLength(1);
    expect(byFn(calls, 'fn_fail_job')[0].args).toMatchObject({ p_retry_after_seconds: -1, p_error: expect.stringMatching(/^complete_failed: Error: fn_complete_job: statement timeout/) });
  });

  it('fn_complete_job devuelve false (lock perdido por el reclaim) ⇒ complete_ignored: no se reintenta la RPC, no hay fn_fail_job, done:0', async () => {
    registerJobHandler('noop', async () => ({ ok: 1 }));
    const { sb, calls } = makeSupabase([[makeJob({ id: 'a', kind: 'noop' })]], (fn) => (fn === 'fn_complete_job' ? { data: false, error: null } : undefined));
    const summary = await runJobs({ supabase: sb, worker: 'w' });
    expect(byFn(calls, 'fn_complete_job')).toHaveLength(1);
    expect(byFn(calls, 'fn_fail_job')).toHaveLength(0);
    expect(summary).toMatchObject({ claimed: 1, done: 0, failed: 0, retried: 0 });
    expect(summary.completeFailed).toBeUndefined();
  });

  it('fn_complete_job lanza la 1ª vez y devuelve false la 2ª ⇒ ignored (lock perdido), sin fn_fail_job y sin completeFailed', async () => {
    registerJobHandler('noop', async () => ({ ok: 1 }));
    const { sb, calls } = makeSupabase([[makeJob({ id: 'a', kind: 'noop' })]], (fn, _a, n) =>
      fn === 'fn_complete_job' ? (n === 1 ? { data: null, error: { message: 'red' } } : { data: false, error: null }) : undefined,
    );
    const summary = await runJobs({ supabase: sb, worker: 'w' });
    expect(byFn(calls, 'fn_fail_job')).toHaveLength(0);
    expect(summary.completeFailed).toBeUndefined();
    expect(summary.done).toBe(0);
  });

  it('complete_failed y fn_fail_job devuelve "ignored" (lock perdido entre medias) ⇒ completeFailed:1 pero failed:0', async () => {
    registerJobHandler('noop', async () => ({ ok: 1 }));
    const { sb } = makeSupabase([[makeJob({ id: 'a', kind: 'noop' })]], (fn) => {
      if (fn === 'fn_complete_job') return { data: null, error: { message: 'red' } };
      if (fn === 'fn_fail_job') return { data: 'ignored', error: null };
      return undefined;
    });
    const summary = await runJobs({ supabase: sb, worker: 'w' });
    expect(summary).toMatchObject({ completeFailed: 1, failed: 0, done: 0 });
  });

  it('el reintento de fn_complete_job es INMEDIATO (sin espera): un fallo transitorio de red de >0 ms se cierra como failed terminal', async () => {
    // Hueco de diseño (bajo): el reintento único no espera nada; un blip de red
    // que dura unos ms convierte un job exitoso en `failed` terminal.
    registerJobHandler('noop', async () => ({ ok: 1 }));
    const t: number[] = [];
    const { sb, calls } = makeSupabase([[makeJob({ id: 'a', kind: 'noop' })]], (fn) => {
      if (fn !== 'fn_complete_job') return undefined;
      t.push(Date.now());
      return { data: null, error: { message: 'ECONNRESET' } };
    });
    const summary = await runJobs({ supabase: sb, worker: 'w' });
    expect(byFn(calls, 'fn_complete_job')).toHaveLength(2);
    expect(t[1] - t[0]).toBeLessThan(50);
    expect(summary.failed).toBe(1);
  });
});

describe('tester r3 — timeout advisory y handler que sigue vivo', () => {
  it('handler que tarda más que jobTimeoutMs ⇒ queued (retry) y el handler SIGUE ejecutándose tras el fail: dos efectos si no mira signal', async () => {
    let effects = 0;
    let sawAbort = false;
    registerJobHandler('noop', async ({ signal }) => {
      await sleep(120);
      sawAbort = signal.aborted;
      effects += 1; // handler "no cooperativo": no mira signal
      return { ok: 1 };
    });
    const { sb, calls } = makeSupabase([[makeJob({ id: 'a', kind: 'noop' })]]);
    const summary = await runJobs({ supabase: sb, worker: 'w', jobTimeoutMs: 30 });
    expect(summary.retried).toBe(1);
    expect(byFn(calls, 'fn_fail_job')[0].args.p_error).toMatch(/timeout after 30ms/);
    await sleep(150);
    expect(effects).toBe(1); // el efecto ocurre DESPUÉS de que el job volviera a la cola
    expect(sawAbort).toBe(true); // la señal sí estaba abortada: los handlers deben mirarla
    // El siguiente drenaje lo ejecutará otra vez ⇒ el handler es el único que puede evitar el doble efecto.
  });

  it('el timeout del job se recorta al margen restante del deadline (remaining - 500 ms), nunca por debajo de 250 ms', async () => {
    const seen: number[] = [];
    registerJobHandler('noop', async ({ signal }) => {
      const t0 = Date.now();
      await new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve()));
      seen.push(Date.now() - t0);
      throw new JobRetryableError('abortado');
    });
    const { sb } = makeSupabase([[makeJob({ id: 'a', kind: 'noop' })]]);
    // deadline 2 000 ms ⇒ remaining ≈ 2 000 ⇒ timeout ≈ 1 500 ms (< jobTimeoutMs 30 000)
    await runJobs({ supabase: sb, worker: 'w', deadlineMs: 2_000 });
    expect(seen[0]).toBeGreaterThanOrEqual(1_300);
    expect(seen[0]).toBeLessThan(1_900);
  });
});

describe('tester r3 — Set de ids ejecutados (N-8)', () => {
  it('el mismo id repetido DENTRO del mismo lote ⇒ el segundo se libera, released:1, y el resto del lote sigue', async () => {
    const handler = jest.fn(async () => ({ ok: 1 }));
    registerJobHandler('noop', handler);
    const a = makeJob({ id: 'a', kind: 'noop' });
    const c = makeJob({ id: 'c', kind: 'noop' });
    const { sb, calls } = makeSupabase([[a, a, c]], undefined);
    const summary = await runJobs({ supabase: sb, worker: 'w', limit: 10 });
    expect(handler).toHaveBeenCalledTimes(2);
    expect(summary).toMatchObject({ claimed: 2, done: 2, released: 1 });
    expect(byFn(calls, 'fn_release_job').map((x) => x.args.p_job_id)).toEqual(['a']);
  });

  it('repetido y fn_release_job falla con error real ⇒ release_failed, released:0, el job queda running con nuestro lock (reclaim 10 min) y el bucle termina', async () => {
    registerJobHandler('noop', async () => { throw new JobRetryableError('x', 0); });
    const a = makeJob({ id: 'a', kind: 'noop' });
    const { sb, calls } = makeSupabase([[a], [a], [a]], (fn) => (fn === 'fn_release_job' ? { data: null, error: { code: '57014', message: 'canceling statement' } } : undefined));
    const summary = await runJobs({ supabase: sb, worker: 'w', limit: 1 });
    expect(summary.released).toBe(0);
    expect(byFn(calls, 'fn_claim_jobs')).toHaveLength(2);
    expect(byFn(calls, 'fn_fail_job')).toHaveLength(1); // solo el intento real
    expect(sb.from).not.toHaveBeenCalled(); // sin fallback UPDATE (el error no es "missing")
  });

  it('el repetido NO cuenta como claimed ni consume intento: un solo fn_fail_job por id aunque el claim lo devuelva 3 veces', async () => {
    registerJobHandler('noop', async () => { throw new JobRetryableError('x', 0); });
    const a = makeJob({ id: 'a', kind: 'noop' });
    const { sb, calls } = makeSupabase([[a], [a], [a]]);
    const summary = await runJobs({ supabase: sb, worker: 'w', limit: 1 });
    expect(summary.claimed).toBe(1);
    expect(byFn(calls, 'fn_fail_job')).toHaveLength(1);
    expect(byFn(calls, 'fn_release_job')).toHaveLength(1);
  });

  it('el Set es por invocación: dos runJobs seguidos con el mismo id lo ejecutan una vez cada uno (el siguiente cron sí lo reintenta)', async () => {
    const handler = jest.fn(async () => { throw new JobRetryableError('x', 0); });
    registerJobHandler('noop', handler);
    const a = makeJob({ id: 'a', kind: 'noop' });
    const s1 = makeSupabase([[a]]);
    const s2 = makeSupabase([[a]]);
    await runJobs({ supabase: s1.sb, worker: 'w' });
    await runJobs({ supabase: s2.sb, worker: 'w' });
    expect(handler).toHaveBeenCalledTimes(2);
  });
});
