import { ejecutarRecuentoSegmento } from '../segmentosRecuentoService';
import { cifrasSegmentoVacias } from '../segmentosAudiencia';
import { runSegmentCounts } from '@/lib/jobs/scheduled/segmentCounts';
import { makeSupabase } from '../whatsapp/__tests__/mockSupabase';
import { U } from '@/app/api/crm/__tests__/ola1Fake';
import { JobFatalError, type JobContext } from '@/lib/jobs/types';

const version = '2026-10-01T00:00:00.001Z', log = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
function setup(options: { total?: number; stale?: boolean; fail?: boolean; attempts?: number } = {}) {
  const segment = { id: U(5), organization_id: 120, is_dynamic: true, filter_json: [], updated_at: version, count_job_id: options.stale ? U(10) : U(6) };
  const rows = Array.from({ length: options.total ?? 1000 }, (_, i) => ({ id: U(i + 100), consent: {}, email: 'fixture@example.invalid', can_email: true }));
  const mock = makeSupabase({ segments: () => ({ data: segment }) }, (fn) => {
    if (fn === 'crm_segment_context_page') return options.fail ? { error: { message: 'fixture' } } : { data: rows };
    if (fn === 'crm_continue_segment_recount') return { data: { continued: true } };
    throw new Error(`RPC inesperada ${fn}`);
  });
  const rpc = mock.sb.rpc;
  mock.sb.rpc = ((...args: Parameters<typeof rpc>) => { const promise = rpc(...args); return Object.assign(promise, { abortSignal: () => promise }); }) as typeof rpc;
  const ctx: JobContext = { supabase: mock.sb, orgId: 120, log, signal: new AbortController().signal,
    job: { id: U(6), organization_id: 120, kind: 'noop', status: 'running', run_at: version,
      last_error: null, result: null, locked_at: version, locked_by: 'fixture', dedupe_key: null,
      created_at: version, updated_at: version, attempts: options.attempts ?? 1, max_attempts: 5,
      payload: { segment_id: U(5), expected_updated_at: version,
      as_of: version, after: null, counts: cifrasSegmentoVacias() } } };
  return { ...mock, ctx };
}
test('mil filas dejan cursor y conteo acumulado para la siguiente página, sin publicar un total parcial', async () => {
  const { ctx, rpcCalls } = setup();
  await ejecutarRecuentoSegmento(ctx);
  expect(rpcCalls.at(-1)?.args).toMatchObject({ p_org: 120, p_job: U(6), p_after: U(1099), p_done: false,
    p_counts: { total: 1000, base: 1000, email_contactable: 1000 } });
});
test('una segunda página suma la primera y completa el conteo', async () => {
  const { ctx, rpcCalls } = setup({ total: 206 });
  ctx.job.payload.counts = { ...cifrasSegmentoVacias(), total: 1000, base: 1000, email_contactable: 1000 };
  ctx.job.payload.after = U(99);
  await ejecutarRecuentoSegmento(ctx);
  expect(rpcCalls.at(-1)?.args).toMatchObject({ p_done: true, p_counts: { total: 1206, base: 1206, email_contactable: 1206 } });
});
test('una versión abandonada no lee clientes ni escribe métricas', async () => {
  const { ctx, rpcCalls } = setup({ stale: true });
  expect(await ejecutarRecuentoSegmento(ctx)).toMatchObject({ skipped: true });
  expect(rpcCalls).toHaveLength(0);
});
test('error transitorio conserva cursor; agotamiento registra error sin inventar cifras', async () => {
  const transient = setup({ fail: true });
  await expect(ejecutarRecuentoSegmento(transient.ctx)).rejects.toMatchObject({ message: 'fixture' });
  expect(transient.rpcCalls).toHaveLength(1);
  const terminal = setup({ fail: true, attempts: 5 });
  await expect(ejecutarRecuentoSegmento(terminal.ctx)).rejects.toMatchObject({ message: 'fixture' });
  expect(terminal.rpcCalls.at(-1)?.args.p_error).toBe('No se pudo actualizar el conteo');
});
test('payload malformado no ejecuta SQL y un aborto no cierra el conteo', async () => {
  const invalid = setup(); invalid.ctx.job.payload.counts = { total: -1 };
  await expect(ejecutarRecuentoSegmento(invalid.ctx)).rejects.toBeInstanceOf(JobFatalError);
  expect(invalid.rpcCalls).toHaveLength(0);
  const aborted = setup(); const controller = new AbortController(); controller.abort(); aborted.ctx.signal = controller.signal;
  await expect(ejecutarRecuentoSegmento(aborted.ctx)).rejects.toBeDefined();
  expect(aborted.rpcCalls).toHaveLength(0);
});
test('productor continúa por lotes y no consulta con presupuesto agotado', async () => {
  let n = 0;
  const { sb, rpcCalls } = makeSupabase({}, () => ({ data: { enqueued: n++ === 0 ? 50 : 2 } }));
  const rpc = sb.rpc;
  sb.rpc = ((...args: Parameters<typeof rpc>) => { const promise = rpc(...args); return Object.assign(promise, { abortSignal: () => promise }); }) as typeof rpc;
  expect(await runSegmentCounts(sb, log, new AbortController().signal, { budgetMs: 10000 })).toEqual({ enqueued: 52, truncated: false });
  expect(rpcCalls).toHaveLength(2);
  expect(await runSegmentCounts(sb, log, new AbortController().signal, { budgetMs: 0 })).toEqual({ enqueued: 0, truncated: true });
  expect(rpcCalls).toHaveLength(2);
});
