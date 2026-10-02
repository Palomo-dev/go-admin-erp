/** Cron nativo → tarea en proceso → RPC real, con todas las lecturas en memoria. */
import fs from 'fs';
import path from 'path';
import type { SupabaseClient } from '@supabase/supabase-js';

jest.mock('../handlers', () => ({}));
jest.mock('../handlers/maintenance', () => ({ runMaintenance: jest.fn(async () => ({ jobs_deleted: 0 })) }));
jest.mock('../scheduled/healthRecalculate', () => ({ runHealthRecalculate: jest.fn(async () => ({ snapshots_written: 0 })) }));
jest.mock('../scheduled/renewalsSync', () => ({ runRenewalsSync: jest.fn(async () => ({ created: 0 })) }));
jest.mock('../scheduled/voiceCampaigns', () => ({ runVoiceCampaigns: jest.fn() }));
jest.mock('../scheduled/segmentCounts', () => ({ runSegmentCounts: jest.fn() }));
jest.mock('@/lib/supabase/config', () => ({ supabase: {} }));

import { clearJobHandlers } from '../registry';
import { VERCEL_SCHEDULE_KINDS, JOBS_RUN_PATH } from '../schedule';
import { isScheduledTask, splitScheduledKinds } from '../scheduledOrgs';
import { hasScheduledKinds, runScheduledKinds, SCHEDULED_KINDS } from '../scheduler';

const instant = new Date('2026-10-02T08:30:00Z');
const since = new Date(instant.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();

function memoryClient(failingOrg?: number) {
  const abortSignal = jest.fn(async (signal: AbortSignal) => {
    if (signal.aborted) throw new Error('signal_aborted');
    return { data: { processed: 4, written: 2, next: null }, error: null };
  });
  const rpc = jest.fn((_name: string, args: { p_org: number }) => ({
    abortSignal: (signal: AbortSignal) => args.p_org === failingOrg
      ? Promise.resolve({ data: null, error: new Error('mineria_no_disponible') })
      : abortSignal(signal),
  }));
  const filters: [string, unknown][] = [];
  type ModuleResult = { data: { organization_id: number; module_code: string; is_active: boolean }[]; error: null };
  interface ModuleChain {
    select: jest.Mock<ModuleChain, []>;
    eq: jest.Mock<ModuleChain, [string, unknown]>;
    limit: jest.Mock<Promise<ModuleResult>, []>;
  }
  const chain: ModuleChain = {
    select: jest.fn(() => chain),
    eq: jest.fn((field: string, value: unknown) => { filters.push([field, value]); return chain; }),
    limit: jest.fn(async () => ({ data: [
      { organization_id: 120, module_code: 'crm', is_active: true },
      { organization_id: 120, module_code: 'crm', is_active: true },
      { organization_id: 125, module_code: 'crm', is_active: true },
      { organization_id: 126, module_code: 'crm', is_active: false },
      { organization_id: 127, module_code: 'pms', is_active: true },
    ], error: null })),
  };
  const from = jest.fn((table: string) => {
    if (table !== 'organization_modules') throw new Error(`tabla_inesperada:${table}`);
    return chain;
  });
  return { sb: { from, rpc } as unknown as SupabaseClient, from, rpc, abortSignal, filters };
}

beforeEach(() => {
  clearJobHandlers();
  jest.clearAllMocks();
  jest.spyOn(Date, 'now').mockReturnValue(instant.getTime());
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('minería de objeciones en el cron nativo', () => {
  it('el cron diario registrado invoca minería acotada por org activa sin encolar esta tarea', async () => {
    const native = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../../vercel.json'), 'utf8'));
    expect(native.crons.filter((cron: { path: string; schedule: string }) =>
      cron.path === JOBS_RUN_PATH && cron.schedule === '30 8 * * *'))
      .toEqual([{ path: JOBS_RUN_PATH, schedule: '30 8 * * *' }]);
    const kinds = VERCEL_SCHEDULE_KINDS['30 8 * * *'];
    expect(kinds).toEqual(['recording_cleanup', 'maintenance', 'health_recalculate', 'renewals_sync', 'objection_mining']);
    expect(splitScheduledKinds(kinds)).toEqual({
      jobKinds: ['recording_cleanup', 'maintenance'],
      tasks: ['health_recalculate', 'renewals_sync', 'objection_mining'],
    });
    expect(isScheduledTask('objection_mining')).toBe(true);
    expect(SCHEDULED_KINDS).toContain('objection_mining');
    expect(hasScheduledKinds(['objection_mining'])).toBe(true);

    const client = memoryClient();
    const result = await runScheduledKinds({ kinds, budgetMs: 3000, taskBudgetMs: 1000, worker: 'test-local', supabase: client.sb });
    expect(client.from.mock.calls).toEqual([['organization_modules']]);
    expect(client.filters).toEqual([['module_code', 'crm'], ['is_active', true]]);
    // RPC minera real: el test fallaría si se añadiera un enqueue_job o se
    // consultara una organización inactiva, otro módulo o la misma dos veces.
    expect(client.rpc.mock.calls).toEqual([
      ['crm_objection_mine', { p_org: 120, p_since: since, p_after: null, p_limit: 100 }],
      ['crm_objection_mine', { p_org: 125, p_since: since, p_after: null, p_limit: 100 }],
    ]);
    expect(client.abortSignal).toHaveBeenCalledTimes(2);
    for (const [signal] of client.abortSignal.mock.calls) {
      expect(signal).toBeInstanceOf(AbortSignal);
      expect(signal.aborted).toBe(false);
    }
    expect(result.objection_mining).toEqual({
      ok: true, ms: 0, result: { processed: 8, written: 4, pending_org_ids: [], errors: [] },
    });
  });

  it('una RPC fallida registra su org y continúa con la siguiente', async () => {
    const client = memoryClient(120);
    const result = await runScheduledKinds({ kinds: ['objection_mining'], budgetMs: 1000, worker: 'test-local', supabase: client.sb });
    expect(client.rpc.mock.calls.map(([, args]) => args.p_org)).toEqual([120, 125]);
    expect(result.objection_mining).toEqual({
      ok: true, ms: 0, result: {
        processed: 4, written: 2, pending_org_ids: [],
        errors: [{ organization_id: 120, error: 'mineria_no_disponible' }],
      },
    });
  });

  it('con presupuesto agotado devuelve un fallo explícito sin lecturas ni RPC', async () => {
    const client = memoryClient();
    const result = await runScheduledKinds({ kinds: ['objection_mining'], budgetMs: 1000, totalBudgetMs: 0, worker: 'test-local', supabase: client.sb });
    expect(result).toEqual({ objection_mining: { ok: false, ms: 0, error: 'budget_exhausted', reason: 'budget_exhausted' } });
    expect(client.from).not.toHaveBeenCalled();
    expect(client.rpc).not.toHaveBeenCalled();
  });
});
