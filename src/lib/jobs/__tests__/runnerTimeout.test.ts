/**
 * Runner: comportamiento tras el timeout por job (tester JOBS-0 r1).
 * Un handler que ignora el AbortSignal sigue corriendo en segundo plano; el
 * runner no debe llamar a fn_complete_job con su resultado tardío y debe
 * haber marcado el job como fallido (retry) por timeout.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

jest.mock('../handlers', () => ({}));

import { runJobs } from '../runner';
import { clearJobHandlers, registerJobHandler } from '../registry';
import type { OutboundJob } from '../types';

function job(id: string): OutboundJob {
  return {
    id,
    organization_id: 105,
    kind: 'transcribe',
    payload: {},
    status: 'running',
    run_at: new Date().toISOString(),
    attempts: 1,
    max_attempts: 3,
    last_error: null,
    result: null,
    locked_at: null,
    locked_by: 'w',
    dedupe_key: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

beforeEach(() => {
  clearJobHandlers();
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('runJobs timeout por job', () => {
  it('handler que ignora el abort: fn_fail_job(timeout) y nunca fn_complete_job, aunque resuelva tarde', async () => {
    let lateResolved = false;
    let abortSeen = false;
    registerJobHandler('transcribe', async ({ signal }) => {
      signal.addEventListener('abort', () => { abortSeen = true; });
      await new Promise((r) => setTimeout(r, 500)); // ignora el abort
      lateResolved = true;
      return { late: true };
    });
    const calls: { fn: string; args: Record<string, unknown> }[] = [];
    let batch = 0;
    const sb = {
      rpc: jest.fn(async (fn: string, args: Record<string, unknown>) => {
        calls.push({ fn, args });
        if (fn === 'fn_claim_jobs') return { data: batch++ === 0 ? [job('t1')] : [], error: null };
        if (fn === 'fn_fail_job') return { data: 'queued', error: null };
        return { data: true, error: null };
      }),
      from: jest.fn(),
    } as unknown as SupabaseClient;

    const summary = await runJobs({ supabase: sb, worker: 'w', jobTimeoutMs: 150, deadlineMs: 10_000 });
    expect(abortSeen).toBe(true);
    expect(summary.retried).toBe(1);
    expect(summary.done).toBe(0);
    const fail = calls.find((c) => c.fn === 'fn_fail_job');
    expect(String(fail?.args.p_error)).toContain('timeout after 150ms');

    await new Promise((r) => setTimeout(r, 600));
    expect(lateResolved).toBe(true);
    expect(calls.some((c) => c.fn === 'fn_complete_job')).toBe(false);
  });

  it('un handler que lanza algo que no es Error se serializa en p_error sin romper el runner', async () => {
    registerJobHandler('transcribe', async () => {
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw { code: 'E_WEIRD' };
    });
    const calls: { fn: string; args: Record<string, unknown> }[] = [];
    let batch = 0;
    const sb = {
      rpc: jest.fn(async (fn: string, args: Record<string, unknown>) => {
        calls.push({ fn, args });
        if (fn === 'fn_claim_jobs') return { data: batch++ === 0 ? [job('t2')] : [], error: null };
        if (fn === 'fn_fail_job') return { data: 'queued', error: null };
        return { data: true, error: null };
      }),
      from: jest.fn(),
    } as unknown as SupabaseClient;
    const summary = await runJobs({ supabase: sb, worker: 'w' });
    expect(summary.retried).toBe(1);
    expect(calls.find((c) => c.fn === 'fn_fail_job')?.args.p_error).toBe('[object Object]');
  });
});
