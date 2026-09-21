/**
 * F16 · Consolidación de las rondas (2026-09-21) — el LOTE de PUNTA A PUNTA,
 * con reloj simulado y `statistics` persistentes entre lotes:
 *  - N-1: fallo transitorio a 60 s → no pausa → el reintento sale al vencer.
 *  - N-2: lote muerto → la re-ejecución respeta el testigo → rescate a los
 *    15 min sin intervención.
 *  - N-5: el proceso muere entre el INSERT del mensaje y `fn_campaign_mark_sent`:
 *    el rescate no duplica ni cobra dos veces.
 *  - T-1: 200 saltadas/fallidas delante no atascan la ventana de reclamación.
 *  - T11: filas con `metadata = '{}'` (DEFAULT) o NULL cuentan como pendientes
 *    y SE RECLAMAN.
 *
 * Casos únicos rescatados de: tester r4 (`testerR4.test.ts`) y builder r6
 * (`round6.test.ts`).
 */
import { runCampaignBatch, STALE_CLAIM_MS, MAX_STALLED_BATCHES } from '../campaignBatch';
import { sendWhatsApp } from '../outboundService';
import { makeSupabase, has, opArg, type TableResolver } from './mockSupabase';
import { fakeTable, type Row } from './fakeTable';

jest.mock('@/lib/supabase/server-service', () => ({ getServiceClient: () => { throw new Error('no service client en tests'); } }));
const mockEnqueueJob = jest.fn(async (args: unknown) => (void args, 'job-1'));
jest.mock('@/lib/jobs/enqueue', () => ({ enqueueJob: (args: unknown) => mockEnqueueJob(args) }));
jest.mock('@/lib/services/crm/pricingService', () => ({ getUnitCost: jest.fn(async () => 0.0125) }));
jest.mock('@/lib/services/crm/email/variables', () => {
  const actual = jest.requireActual('@/lib/services/crm/email/variables');
  return { ...actual, buildContext: jest.fn(async () => ({ ...actual.emptyContext(), contact: { first_name: 'Laura' }, custom: {} })) };
});

beforeEach(() => { mockEnqueueJob.mockClear(); });

const UUID_C = '44444444-4444-4444-8444-444444444444';
const T0 = Date.parse('2026-09-14T15:00:00.000Z');
const runAtOf = (call: number): number => { const a = mockEnqueueJob.mock.calls[call][0] as { runAt: Date | string }; return typeof a.runAt === 'string' ? Date.parse(a.runAt) : a.runAt.getTime(); };
const batchNoOf = (call: number): number => (mockEnqueueJob.mock.calls[call][0] as { payload: { batch_no: number } }).payload.batch_no;
const ok = (i: { customerId: string }) => ({ message_id: `m-${i.customerId}`, conversation_id: 'c', activity_id: null, customer_id: i.customerId, channel_id: 'ch', scheduled: false });
const meta = (row: Row) => row.metadata as Record<string, unknown>;

/** Campaña con `statistics` PERSISTENTES entre lotes (los update se aplican). */
function statefulCampaign(stats: Record<string, unknown>) {
  const row: Row = { id: UUID_C, organization_id: 7, name: 'F16', channel: 'whatsapp', status: 'sending', scheduled_at: null, template_id: null, segment_id: null, content: 'hola', statistics: { throttle_mps: 10, respect_allowed_hours: false, next_batch_no: 2, ...stats }, created_by: null, created_at: '', updated_at: '' };
  const pausas: Record<string, unknown>[] = [];
  const resolver: TableResolver = (ops) => {
    if (has(ops, 'update')) {
      const patch = opArg<Record<string, unknown>>(ops, 'update') ?? {};
      if (patch.statistics) row.statistics = patch.statistics;
      if (patch.status) row.status = patch.status;
      if ((row.statistics as Record<string, unknown>)?.state === 'paused') pausas.push(row.statistics as Record<string, unknown>);
    }
    return { data: row };
  };
  return { row, pausas, resolver };
}
function pendingRow(id: string, metadata: unknown = { state: 'pending', recipient: '573100000001', attempts: 0 }): Row {
  return { id, campaign_id: UUID_C, customer_id: `cust-${id}`, state: null, replied_at: null, created_at: '2026-09-14T14:00:00.000Z', metadata };
}
function tablas(camp: ReturnType<typeof statefulCampaign>, contacts: ReturnType<typeof fakeTable>) {
  return makeSupabase({ campaigns: camp.resolver, campaign_contacts: contacts.resolver, messages: () => ({ data: [], count: 0 }), provider_configs: () => ({ data: null }), message_events: () => ({ data: [] }) }, () => ({ data: true })).sb;
}
/** Hasta 6 lotes con reloj simulado; se detiene al acabar o al pausarse. */
async function runUntilDone(sb: ReturnType<typeof makeSupabase>['sb'], send: jest.Mock) {
  let clock = T0;
  let r;
  for (let b = 2; b <= 7; b += 1) {
    r = await runCampaignBatch({ campaign_id: UUID_C, batch_no: b }, sb, { send: send as never, now: () => clock, sleep: async () => undefined });
    clock += 5000;
    if (r.reason === 'stalled_no_progress' || r.finished) break;
  }
  return r!;
}

// ─── N-1 · fallo transitorio → no pausa → sale al vencer (tester r4) ────────────

describe('N-1 de punta a punta', () => {
  it('T4.N1 · lote con fallo → lote 1 s después sin reclamar (contador al tope) → lote al vencer envía y completa', async () => {
    const contacts = fakeTable([pendingRow('cc-1')]);
    const camp = statefulCampaign({ stalled_batches: MAX_STALLED_BATCHES - 1 });
    const sb = tablas(camp, contacts);
    let clock = T0;
    let fallar = true;
    const send = jest.fn(async (i: { customerId: string }) => { if (fallar) throw new Error('ECONNRESET proveedor'); return ok(i); });
    const deps = { send: send as never, now: () => clock, sleep: async () => undefined };

    const r2 = await runCampaignBatch({ campaign_id: UUID_C, batch_no: 2 }, sb, deps);
    expect(r2.requeued).toBe(1);
    expect(r2.reason).toBeUndefined();
    expect(meta(contacts.rows[0]).state).toBe('pending');
    expect(Date.parse(String(meta(contacts.rows[0]).retry_after))).toBe(T0 + 60_000);
    expect(batchNoOf(0)).toBe(3);
    expect(runAtOf(0)).toBeLessThan(T0 + 60_000);

    clock = runAtOf(0);
    const r3 = await runCampaignBatch({ campaign_id: UUID_C, batch_no: 3 }, sb, deps);
    expect(r3.claimed).toBe(0);
    expect(r3.reason).not.toBe('stalled_no_progress');
    expect(camp.pausas).toHaveLength(0);
    expect(batchNoOf(1)).toBe(4);
    expect(runAtOf(1)).toBe(T0 + 60_000);
    expect((camp.row.statistics as Record<string, unknown>).stalled_batches).toBe(0); // el lote 2 tuvo progreso; esperar no lo sube

    clock = runAtOf(1);
    fallar = false;
    const r4 = await runCampaignBatch({ campaign_id: UUID_C, batch_no: 4 }, sb, deps);
    expect(r4).toMatchObject({ claimed: 1, sent: 1, finished: true, reason: 'completed' });
    expect(camp.pausas).toHaveLength(0);
    expect(send).toHaveBeenCalledTimes(2);
  });
});

// ─── N-2 · lote muerto → rescate a los 15 min sin intervención (tester r4) ──────

describe('N-2 de punta a punta', () => {
  const muerta = (token: string, claimedAt: number): Row => pendingRow('cc-1', { state: 'queued', recipient: '573100000001', attempts: 1, batch_no: 2, claim_token: token, claimed_at: new Date(claimedAt).toISOString() });

  it('T4.N2 · la re-ejecución del job respeta el testigo vivo, programa el rescate al caducar y el rescate envía', async () => {
    const contacts = fakeTable([muerta('b2:muerto', T0)]);
    const camp = statefulCampaign({ stalled_batches: MAX_STALLED_BATCHES - 1 });
    const sb = tablas(camp, contacts);
    let clock = T0 + 10 * 60_000; // fn_claim_jobs re-encola el job muerto a los 10 min
    const send = jest.fn(async (i: { customerId: string }) => ok(i));
    const deps = { send: send as never, now: () => clock, sleep: async () => undefined };

    const rerun = await runCampaignBatch({ campaign_id: UUID_C, batch_no: 2 }, sb, deps);
    expect(rerun.claimed).toBe(0);
    expect(rerun.reason).not.toBe('stalled_no_progress');
    expect(camp.pausas).toHaveLength(0);
    expect(send).not.toHaveBeenCalled();
    expect(runAtOf(0)).toBe(T0 + STALE_CLAIM_MS);
    expect(batchNoOf(0)).toBe(3);

    clock = runAtOf(0);
    const rescate = await runCampaignBatch({ campaign_id: UUID_C, batch_no: 3 }, sb, deps);
    expect(rescate).toMatchObject({ claimed: 1, sent: 1, finished: true });
    expect(send).toHaveBeenCalledTimes(1);
    expect(meta(contacts.rows[0]).state).toBe('sent');
    expect(camp.pausas).toHaveLength(0);
  });

  it('T4.N2 · un segundo antes de caducar el testigo, el rescate todavía NO roba la fila', async () => {
    const contacts = fakeTable([muerta('b2:vivo', T0)]);
    const sb = tablas(statefulCampaign({}), contacts);
    const send = jest.fn(async (i: { customerId: string }) => ok(i));
    const r = await runCampaignBatch({ campaign_id: UUID_C, batch_no: 3 }, sb, { send: send as never, now: () => T0 + STALE_CLAIM_MS - 1000, sleep: async () => undefined });
    expect(r.claimed).toBe(0);
    expect(send).not.toHaveBeenCalled();
    expect(runAtOf(0)).toBe(T0 + STALE_CLAIM_MS);
  });
});

// ─── N-5 · muerte entre la respuesta del proveedor y la marca de enviado (tester r4) ──

describe('N-5 de punta a punta', () => {
  it('T4.N5 · el rescate a los 15 min no inserta un segundo mensaje ni descuenta créditos otra vez', async () => {
    let clock = T0;
    let n = 0;
    const mensajes = fakeTable([], { onInsert: (row) => { row.id = `msg-${++n}`; row.created_at = new Date(clock).toISOString(); return row; } });
    const contacts = fakeTable([pendingRow('cc-1')]);
    const camp = statefulCampaign({ channel_id: 'chan-1' });
    const tables: Record<string, TableResolver> = {
      customers: () => ({ data: { id: 'cust-cc-1', full_name: 'Laura', first_name: 'Laura', phone: '+57 310 987 6543' } }),
      channels: () => ({ data: { id: 'chan-1', name: 'Ventas', status: 'active', type: 'whatsapp' } }),
      channel_credentials: () => ({ data: { channel_id: 'chan-1', provider: 'meta' } }),
      customer_channel_identities: () => ({ data: null }),
      conversations: (ops) => (has(ops, 'insert') ? { data: { id: 'conv-new' } } : { data: { id: 'conv-1', channel_id: 'chan-1', last_inbound_at: new Date(T0 - 3600_000).toISOString() } }),
      provider_configs: () => ({ data: { settings: { default_country_code: '57' } } }),
      messages: mensajes.resolver, activities: (ops) => (has(ops, 'insert') ? { data: { id: 'act-1' } } : { data: null }),
      comm_usage_logs: () => ({ data: null }), message_events: () => ({ data: [] }),
      campaigns: camp.resolver, campaign_contacts: contacts.resolver,
    };
    const rpcCalls: string[] = [];
    let morir = true;
    const { sb } = makeSupabase(tables, (fn) => { rpcCalls.push(fn); if (fn === 'fn_campaign_mark_sent' && morir) return new Promise(() => undefined); return { data: true }; });
    const deps = { send: (i: never, s: never) => sendWhatsApp(i, s, s, new Date(clock)), now: () => clock, sleep: async () => undefined };

    const muerto = runCampaignBatch({ campaign_id: UUID_C, batch_no: 2 }, sb, deps as never); // muere en fn_campaign_mark_sent: nunca vuelve
    await new Promise((r) => setTimeout(r, 20));
    expect(mensajes.rows).toHaveLength(1);
    expect(meta(contacts.rows[0]).state).toBe('queued');
    expect(rpcCalls.filter((f) => f === 'deduct_comm_credits')).toHaveLength(1);
    void muerto;

    clock = T0 + STALE_CLAIM_MS + 1000;
    morir = false;
    const r = await runCampaignBatch({ campaign_id: UUID_C, batch_no: 3 }, sb, deps as never);
    expect(r).toMatchObject({ claimed: 1, sent: 1 });
    expect(mensajes.rows).toHaveLength(1); // sin duplicado
    expect(rpcCalls.filter((f) => f === 'deduct_comm_credits')).toHaveLength(1); // sin doble cobro
    expect(meta(contacts.rows[0])).toMatchObject({ state: 'sent', message_id: 'msg-1' });
  });
});

// ─── T-1 · 200 filas no reclamables delante de las pendientes (tester r4) ───────

describe('T-1 · la ventana de reclamación', () => {
  const skippedRow = (i: number, metadata: unknown = { state: 'skipped', skipped_reason: 'window_required', recipient: null, attempts: 0 }): Row =>
    pendingRow(`sk-${String(i).padStart(4, '0')}`, metadata);

  it('T4.T1 · 200 saltadas (mismo created_at) + 10 pendientes: envía las 10 en el PRIMER lote y acaba «completed»', async () => {
    const filas: Row[] = [];
    for (let i = 0; i < 200; i += 1) filas.push(skippedRow(i));
    for (let i = 0; i < 10; i += 1) filas.push(pendingRow(`zz-${i}`));
    const contacts = fakeTable(filas);
    const camp = statefulCampaign({ stalled_batches: 0 });
    const send = jest.fn(async (i: { customerId: string }) => ok(i));
    const r = await runUntilDone(tablas(camp, contacts), send);
    expect(send).toHaveBeenCalledTimes(10);
    expect(r).toMatchObject({ batch_no: 2, claimed: 10, sent: 10, finished: true, reason: 'completed' });
    expect(camp.pausas).toHaveLength(0);
    expect(camp.row.status).toBe('sent');
    const estados = contacts.rows.map((x) => meta(x).state);
    expect(estados.filter((s) => s === 'pending')).toHaveLength(0);
    expect(estados.filter((s) => s === 'sent')).toHaveLength(10);
    expect(estados.filter((s) => s === 'skipped')).toHaveLength(200);
  });

  it('T4.T1 · con 200 FALLIDAS delante pasa lo mismo', async () => {
    const filas: Row[] = [];
    for (let i = 0; i < 200; i += 1) filas.push(skippedRow(i, { state: 'failed', error_code: 'INTERNAL', recipient: '573100000009', attempts: 3 }));
    for (let i = 0; i < 3; i += 1) filas.push(pendingRow(`zz-${i}`));
    const camp = statefulCampaign({ stalled_batches: 0 });
    const r = await runCampaignBatch({ campaign_id: UUID_C, batch_no: 2 }, tablas(camp, fakeTable(filas)), { send: jest.fn(async (i: { customerId: string }) => ok(i)) as never, now: () => T0, sleep: async () => undefined });
    expect(r).toMatchObject({ claimed: 3, sent: 3, reason: 'completed' });
    expect(camp.pausas).toHaveLength(0);
  });

  it('T4.T1 · el desempate por `id` es determinista y el filtro de estado va EN la consulta (order created_at, id)', async () => {
    const filas: Row[] = [];
    for (let i = 9; i >= 0; i -= 1) filas.push(pendingRow(`zz-${i}`)); // orden inverso, mismo created_at
    const contacts = fakeTable(filas);
    const orden: string[] = [];
    const send = jest.fn(async (i: { customerId: string }) => { orden.push(i.customerId); return ok(i); });
    await runCampaignBatch({ campaign_id: UUID_C, batch_no: 2 }, tablas(statefulCampaign({ stalled_batches: 0 }), contacts), { send: send as never, now: () => T0, sleep: async () => undefined });
    expect(orden).toEqual(Array.from({ length: 10 }, (_, i) => `cust-zz-${i}`));
    const claimSelect = contacts.selects.find((ops) => ops.some((o) => o.method === 'or'))!;
    expect(claimSelect).toBeDefined();
    expect(claimSelect.filter((o) => o.method === 'order').map((o) => String(o.args[0]))).toEqual(['created_at', 'id']);
    expect(String(claimSelect.find((o) => o.method === 'or')!.args[0])).toContain('metadata->>state.in.(pending,queued)');
  });
});

// ─── T11 · metadata `{}` (DEFAULT) o NULL cuentan como pendientes y SE RECLAMAN (r6) ──

describe('T11 · filas sin metadata.state', () => {
  it.each([
    ['metadata {}', {}],
    ['metadata NULL', null],
  ])('B6.T11 · 5 filas con %s: se reclaman y envían en el primer lote; «completed» sin pausa', async (_n, metadata) => {
    const filas: Row[] = [];
    for (let i = 0; i < 5; i += 1) filas.push(pendingRow(`x-${i}`, metadata));
    const contacts = fakeTable(filas);
    const camp = statefulCampaign({ stalled_batches: 0 });
    const send = jest.fn(async (i: { customerId: string }) => ok(i));
    const r = await runUntilDone(tablas(camp, contacts), send);
    expect(send).toHaveBeenCalledTimes(5);
    expect(r).toMatchObject({ batch_no: 2, claimed: 5, sent: 5, finished: true, reason: 'completed' });
    expect(camp.pausas).toHaveLength(0);
    expect(camp.row.status).toBe('sent');
    expect(contacts.rows.every((x) => meta(x).state === 'sent')).toBe(true);
  });

  it('B6.T11 · mezcla realista: 3 pending + 3 `{}` + 3 NULL + 2 saltadas → 9 envíos, 2 saltadas intactas, «completed»', async () => {
    const filas: Row[] = [];
    for (let i = 0; i < 3; i += 1) filas.push(pendingRow(`p-${i}`));
    for (let i = 0; i < 3; i += 1) filas.push(pendingRow(`d-${i}`, {}));
    for (let i = 0; i < 3; i += 1) filas.push(pendingRow(`n-${i}`, null));
    for (let i = 0; i < 2; i += 1) filas.push(pendingRow(`s-${i}`, { state: 'skipped', skipped_reason: 'window_required' }));
    const contacts = fakeTable(filas);
    const camp = statefulCampaign({ stalled_batches: 0 });
    const send = jest.fn(async (i: { customerId: string }) => ok(i));
    const r = await runUntilDone(tablas(camp, contacts), send);
    expect(send).toHaveBeenCalledTimes(9);
    expect(r).toMatchObject({ sent: 9, reason: 'completed' });
    expect(camp.pausas).toHaveLength(0);
    const estados = contacts.rows.map((x) => meta(x).state);
    expect(estados.filter((s) => s === 'sent')).toHaveLength(9);
    expect(estados.filter((s) => s === 'skipped')).toHaveLength(2);
  });
});
