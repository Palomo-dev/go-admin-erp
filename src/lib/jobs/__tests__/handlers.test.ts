/**
 * Tests de los handlers F0 (`crm_event`, `maintenance`) y del listener
 * `stageChangedActivity` con Supabase mockeado (query builder encadenable).
 * Añadidos por el tester de la ronda 1 (JOBS-0): el builder solo cubría runner + dispatcher.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { crmEventHandler } from '../handlers/crmEvent';
import { maintenanceHandler } from '../handlers/maintenance';
import { stageChangedActivityListener } from '../dispatch/listeners/stageChangedActivity';
import { clearCrmEventListeners, onCrmEvent } from '../dispatch/eventDispatcher';
import { JobFatalError, JobRetryableError, type CrmEvent, type JobContext, type OutboundJob } from '../types';

interface Resp {
  data?: unknown;
  error?: { message: string } | null;
  count?: number | null;
}
interface Op {
  method: string;
  args: unknown[];
}
interface Query {
  table: string;
  ops: Op[];
}

/**
 * `from(table)` devuelve un builder encadenable; al hacer `await` se resuelve
 * con la siguiente respuesta de la cola de esa tabla (FIFO). Registra todas las
 * consultas en `queries` para afirmar filtros (organization_id, etc.).
 */
function makeSupabase(responses: Record<string, Resp[]>, rpcImpl?: (fn: string, args: Record<string, unknown>) => Resp) {
  const queries: Query[] = [];
  const rpc = jest.fn(async (fn: string, args: Record<string, unknown>) => rpcImpl?.(fn, args) ?? { data: null, error: null });
  const from = jest.fn((table: string) => {
    const q: Query = { table, ops: [] };
    queries.push(q);
    const builder: Record<string, unknown> = {};
    const chain = (method: string) =>
      jest.fn((...args: unknown[]) => {
        q.ops.push({ method, args });
        return builder;
      });
    for (const m of ['select', 'insert', 'update', 'delete', 'eq', 'in', 'lt', 'gt', 'gte', 'lte', 'or', 'order', 'limit', 'range', 'maybeSingle', 'single']) {
      builder[m] = chain(m);
    }
    builder.then = (resolve: (v: Resp) => void, reject?: (e: unknown) => void) => {
      const next = responses[table]?.shift();
      if (!next) {
        const err = new Error(`sin respuesta mock para ${table} (${q.ops.map((o) => o.method).join('.')})`);
        return reject ? reject(err) : Promise.reject(err);
      }
      return resolve({ data: null, error: null, ...next });
    };
    return builder;
  });
  return { sb: { rpc, from } as unknown as SupabaseClient, queries, rpc, from };
}

const hasEq = (q: Query, col: string, val?: unknown) =>
  q.ops.some((o) => o.method === 'eq' && o.args[0] === col && (val === undefined || o.args[1] === val));
const opArg = (q: Query, method: string) => q.ops.find((o) => o.method === method)?.args[0];

const log = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };

function makeJob(payload: Record<string, unknown>, kind: OutboundJob['kind'] = 'crm_event'): OutboundJob {
  return {
    id: 'job-1',
    organization_id: 105,
    kind,
    payload,
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

function makeEvent(partial: Partial<CrmEvent> = {}): CrmEvent {
  return {
    id: 'ev-1',
    organization_id: 105,
    event_type: 'opportunity.stage_changed',
    entity_type: 'opportunity',
    entity_id: 'opp-1',
    payload: { from_stage_id: 's1', to_stage_id: 's2', changed_by: 'user-1' },
    status: 'pending',
    created_at: '2026-09-08T12:00:00.000Z',
    processed_at: null,
    ...partial,
  };
}

const ctx = (sb: SupabaseClient, job: OutboundJob, signal = new AbortController().signal): JobContext => ({
  job,
  supabase: sb,
  orgId: job.organization_id,
  log,
  signal,
});

beforeEach(() => {
  clearCrmEventListeners();
  jest.clearAllMocks();
});

describe('crmEventHandler', () => {
  it('sin payload.event_id → JobFatalError (sin tocar la BD)', async () => {
    const { sb, from } = makeSupabase({});
    await expect(crmEventHandler(ctx(sb, makeJob({})))).rejects.toBeInstanceOf(JobFatalError);
    expect(from).not.toHaveBeenCalled();
  });

  it('evento inexistente → JobFatalError; error de select → JobRetryableError; filtra por organization_id', async () => {
    const { sb, queries } = makeSupabase({ crm_events: [{ data: null }, { data: null, error: { message: 'timeout' } }] });
    await expect(crmEventHandler(ctx(sb, makeJob({ event_id: 'ev-x' })))).rejects.toThrow('event_not_found:ev-x');
    expect(hasEq(queries[0], 'organization_id', 105)).toBe(true);
    expect(hasEq(queries[0], 'id', 'ev-x')).toBe(true);
    await expect(crmEventHandler(ctx(sb, makeJob({ event_id: 'ev-x' })))).rejects.toBeInstanceOf(JobRetryableError);
  });

  it('evento ya processed|skipped → {skipped} sin escribir', async () => {
    const { sb, queries } = makeSupabase({ crm_events: [{ data: makeEvent({ status: 'processed' }) }] });
    const res = await crmEventHandler(ctx(sb, makeJob({ event_id: 'ev-1' })));
    expect(res).toMatchObject({ skipped: true, reason: 'already_processed' });
    expect(queries).toHaveLength(1);
  });

  it('sin listeners → marca skipped + processed_at y devuelve no_listeners', async () => {
    const { sb, queries } = makeSupabase({ crm_events: [{ data: makeEvent({ event_type: 'x.y' }) }, {}] });
    const res = await crmEventHandler(ctx(sb, makeJob({ event_id: 'ev-1' })));
    expect(res).toMatchObject({ skipped: true, reason: 'no_listeners', event_type: 'x.y' });
    const upd = opArg(queries[1], 'update') as Record<string, unknown>;
    expect(upd.status).toBe('skipped');
    expect(typeof upd.processed_at).toBe('string');
  });

  it('listener ok → processed; listener falla → evento failed + JobRetryableError', async () => {
    const seen: string[] = [];
    onCrmEvent('opportunity.stage_changed', async (ev) => { seen.push(ev.id); return { ok: 1 }; }, 'l1');
    const { sb, queries } = makeSupabase({ crm_events: [{ data: makeEvent() }, {}] });
    const res = await crmEventHandler(ctx(sb, makeJob({ event_id: 'ev-1' })));
    expect(seen).toEqual(['ev-1']);
    expect(res).toMatchObject({ event_id: 'ev-1', listeners: 1 });
    expect((opArg(queries[1], 'update') as Record<string, unknown>).status).toBe('processed');

    clearCrmEventListeners();
    onCrmEvent('opportunity.stage_changed', async () => { throw new Error('kaput'); }, 'bad');
    const second = makeSupabase({ crm_events: [{ data: makeEvent({ attempts: 1 }) }, {}] });
    await expect(crmEventHandler(ctx(second.sb, makeJob({ event_id: 'ev-1' })))).rejects.toBeInstanceOf(JobRetryableError);
    const upd = opArg(second.queries[1], 'update') as Record<string, unknown>;
    expect(upd.status).toBe('failed');
    expect(upd.attempts).toBe(2); // DB-r2: attempts+1 y last_error
    expect(String(upd.last_error)).toContain('kaput');
    expect(hasEq(second.queries[1], 'organization_id', 105)).toBe(true);
    expect(second.queries).toHaveLength(2);
  });

  it('si crm_events aún no tiene attempts/last_error (PGRST204) repite el UPDATE solo con status=failed', async () => {
    onCrmEvent('opportunity.stage_changed', async () => { throw new Error('kaput'); }, 'bad');
    const { sb, queries } = makeSupabase({
      crm_events: [{ data: makeEvent() }, { error: { message: "Could not find the 'attempts' column of 'crm_events' in the schema cache", code: 'PGRST204' } as never }, {}],
    });
    await expect(crmEventHandler(ctx(sb, makeJob({ event_id: 'ev-1' })))).rejects.toBeInstanceOf(JobRetryableError);
    expect(queries).toHaveLength(3);
    expect(opArg(queries[2], 'update')).toEqual({ status: 'failed' });
  });

  it('si el UPDATE a processed falla, el evento queda failed y el job se reintenta (no se pierde)', async () => {
    onCrmEvent('opportunity.stage_changed', async () => undefined, 'l1');
    const { sb, queries } = makeSupabase({ crm_events: [{ data: makeEvent() }, { error: { message: 'conn reset' } }, {}] });
    await expect(crmEventHandler(ctx(sb, makeJob({ event_id: 'ev-1' })))).rejects.toThrow('crm_events update');
    expect((opArg(queries[2], 'update') as Record<string, unknown>).status).toBe('failed');
  });
});

describe('maintenanceHandler', () => {
  it('borra done/failed/dead >30 d y eventos finales+failed >30 d, y re-encola crm_event para eventos pending|failed de 2 min–7 d con dedupe y attempts<3', async () => {
    const stale = [
      { id: 'e1', organization_id: 105, status: 'pending' }, // sin columna attempts (pre DB-r2) → 0
      { id: 'e2', organization_id: 7, status: 'failed', attempts: 2 },
      { id: 'e3', organization_id: 7, status: 'failed', attempts: 3 }, // abandonado (F-8)
    ];
    const rpcCalls: Record<string, unknown>[] = [];
    const { sb, queries } = makeSupabase(
      { outbound_jobs: [{ count: 3 }, { count: 4 }], crm_events: [{ count: 2 }, { count: 1 }, { data: stale }] },
      (fn, args) => {
        rpcCalls.push({ fn, ...args });
        return { data: `job-${args.p_org}` };
      },
    );
    const res = await maintenanceHandler(ctx(sb, makeJob({}, 'maintenance')));
    expect(res).toMatchObject({ jobs_deleted: 3, jobs_terminal_deleted: 4, events_deleted: 2, events_failed_deleted: 1, events_resynced: 2, events_abandoned: 1 });

    // 1) outbound_jobs: delete status=done, updated_at < cutoff(30 d)
    const q1 = queries[0];
    expect(q1.table).toBe('outbound_jobs');
    expect(hasEq(q1, 'status', 'done')).toBe(true);
    const cutoff = new Date(q1.ops.find((o) => o.method === 'lt')?.args[1] as string).getTime();
    expect(Date.now() - cutoff).toBeGreaterThan(29 * 24 * 3600 * 1000);
    // 2) outbound_jobs failed|dead (F-8)
    expect(queries[1].table).toBe('outbound_jobs');
    expect(queries[1].ops.find((o) => o.method === 'in')?.args).toEqual(['status', ['failed', 'dead']]);
    // 3) crm_events processed|skipped; 4) crm_events failed por created_at (F-8)
    expect(opArg(queries[2], 'in')).toBe('status');
    expect(hasEq(queries[3], 'status', 'failed')).toBe(true);
    expect(opArg(queries[3], 'lt')).toBe('created_at');
    // 5) resync: cada evento con su propia org, dedupe crm_event:{id}, max 3; e3 no se re-encola
    expect(rpcCalls).toEqual([
      expect.objectContaining({ fn: 'fn_enqueue_job', p_org: 105, p_kind: 'crm_event', p_dedupe_key: 'crm_event:e1', p_max_attempts: 3 }),
      expect.objectContaining({ fn: 'fn_enqueue_job', p_org: 7, p_kind: 'crm_event', p_dedupe_key: 'crm_event:e2', p_max_attempts: 3 }),
    ]);
    expect((rpcCalls[0].p_payload as Record<string, unknown>).event_id).toBe('e1');
  });

  it('un fallo de enqueue no aborta el resto; signal abortada antes del resync → JobRetryableError', async () => {
    const stale = [
      { id: 'e1', organization_id: 105, status: 'pending' },
      { id: 'e2', organization_id: 105, status: 'pending' },
    ];
    let n = 0;
    const { sb } = makeSupabase({ outbound_jobs: [{ count: 0 }, { count: 0 }], crm_events: [{ count: 0 }, { count: 0 }, { data: stale }] }, () => {
      n += 1;
      return n === 1 ? { error: { message: 'boom' } } : { data: 'job-2' };
    });
    const res = await maintenanceHandler(ctx(sb, makeJob({}, 'maintenance')));
    expect(res).toMatchObject({ events_resynced: 1 });
    expect(log.warn).toHaveBeenCalledWith('resync_enqueue_failed', expect.objectContaining({ event_id: 'e1' }));

    const aborted = new AbortController();
    aborted.abort();
    const second = makeSupabase({ outbound_jobs: [{ count: 0 }, { count: 0 }], crm_events: [{ count: 0 }, { count: 0 }] });
    await expect(maintenanceHandler(ctx(second.sb, makeJob({}, 'maintenance'), aborted.signal))).rejects.toBeInstanceOf(JobRetryableError);
  });
});

describe('stageChangedActivityListener', () => {
  const lctx = (sb: SupabaseClient) => ({ supabase: sb, orgId: 105, log, signal: new AbortController().signal });

  it('ignora entidades que no son oportunidad y eventos sin to_stage_id', async () => {
    const { sb, from } = makeSupabase({});
    await expect(stageChangedActivityListener(makeEvent({ entity_type: 'customer' }), lctx(sb))).resolves.toMatchObject({ skipped: true, reason: 'entity_not_opportunity' });
    await expect(stageChangedActivityListener(makeEvent({ payload: { from_stage_id: 's1' } }), lctx(sb))).resolves.toMatchObject({ skipped: true, reason: 'no_to_stage' });
    expect(from).not.toHaveBeenCalled();
  });

  it('dedupe por stage_history_id: no inserta si ya existe la activity', async () => {
    const { sb, queries } = makeSupabase({
      opportunity_stage_history: [{ data: { id: 'h1', changed_by: null, changed_at: '2026-09-08T12:00:00Z' } }],
      activities: [{ data: { id: 'act-old' } }],
    });
    const res = await stageChangedActivityListener(makeEvent(), lctx(sb));
    expect(res).toMatchObject({ skipped: true, reason: 'dup_stage_history', activity_id: 'act-old' });
    expect(hasEq(queries[0], 'organization_id', 105)).toBe(true);
    expect(hasEq(queries[0], 'opportunity_id', 'opp-1')).toBe(true);
    expect(hasEq(queries[1], 'organization_id', 105)).toBe(true);
    expect(hasEq(queries[1], 'related_type', 'opportunity')).toBe(true);
    expect(hasEq(queries[1], 'activity_type', 'system')).toBe(true);
    expect(hasEq(queries[1], 'metadata->>stage_history_id', 'h1')).toBe(true);
    expect(queries).toHaveLength(2);
  });

  it('dedupe por ventana ±90 s cubre la activity del cliente (metadata.to_stage_id)', async () => {
    const { sb, queries } = makeSupabase({
      opportunity_stage_history: [{ data: null }],
      activities: [{ data: { id: 'act-client' } }],
    });
    const res = await stageChangedActivityListener(makeEvent(), lctx(sb));
    expect(res).toMatchObject({ skipped: true, reason: 'dup_window' });
    const q = queries[1];
    expect(hasEq(q, 'metadata->>to_stage_id', 's2')).toBe(true);
    const gte = new Date(q.ops.find((o) => o.method === 'gte')?.args[1] as string).getTime();
    const lte = new Date(q.ops.find((o) => o.method === 'lte')?.args[1] as string).getTime();
    expect(lte - gte).toBe(180_000);
  });

  it('inserta la activity system con nombres de etapa, user_id del payload y metadata completa', async () => {
    const { sb, queries } = makeSupabase({
      opportunity_stage_history: [{ data: { id: 'h1', changed_by: 'user-hist', changed_at: '2026-09-08T12:00:00Z' } }],
      activities: [{ data: null }, { data: null }, { data: { id: 'act-new' } }],
      stages: [{ data: [{ id: 's1', name: 'Nuevo' }, { id: 's2', name: 'Propuesta' }] }],
    });
    const res = await stageChangedActivityListener(makeEvent(), lctx(sb));
    expect(res).toMatchObject({ activity_id: 'act-new', from: 'Nuevo', to: 'Propuesta' });
    const insert = queries.find((q) => q.table === 'activities' && q.ops[0].method === 'insert');
    const row = insert?.ops[0].args[0] as Record<string, unknown>;
    expect(row).toMatchObject({
      organization_id: 105,
      activity_type: 'system',
      user_id: 'user-1',
      related_type: 'opportunity',
      related_id: 'opp-1',
      occurred_at: '2026-09-08T12:00:00.000Z',
      notes: 'Etapa cambiada de Nuevo a Propuesta',
    });
    expect(row.metadata).toMatchObject({ source: 'crm_event', crm_event_id: 'ev-1', stage_history_id: 'h1', from_stage_id: 's1', to_stage_id: 's2' });
    // Hallazgo documentado: la consulta a `stages` no filtra por organization_id.
    const stagesQ = queries.find((q) => q.table === 'stages');
    expect(stagesQ && hasEq(stagesQ, 'organization_id')).toBe(false);
  });

  it('sin from_stage_id y sin fila de historial: "Sin etapa" y stage_history_id null; user_id null si no hay changed_by', async () => {
    const { sb, queries } = makeSupabase({
      opportunity_stage_history: [{ data: null }],
      activities: [{ data: null }, { data: { id: 'act-2' } }],
      stages: [{ data: [{ id: 's2', name: 'Propuesta' }] }],
    });
    const res = await stageChangedActivityListener(makeEvent({ payload: { to_stage_id: 's2' } }), lctx(sb));
    expect(res).toMatchObject({ from: 'Sin etapa', to: 'Propuesta' });
    const insert = queries.find((q) => q.table === 'activities' && q.ops[0].method === 'insert');
    const row = insert?.ops[0].args[0] as Record<string, unknown>;
    expect(row.user_id).toBeNull();
    expect((row.metadata as Record<string, unknown>).stage_history_id).toBeNull();
  });
});
