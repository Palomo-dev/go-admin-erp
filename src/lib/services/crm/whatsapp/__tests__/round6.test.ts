/**
 * FASE-16 · ronda 6 — lo que el tester r5 encontró sin red:
 *
 *  - T11: la rama `metadata->>state.is.null` de `CLAIMABLE_STATE_FILTER` no
 *    tenía prueba. Una fila con `metadata = '{}'` (el DEFAULT de la columna,
 *    verificado por MCP: `jsonb NULL DEFAULT '{}'`) o con `metadata = NULL`
 *    cuenta como `pending` en `countContacts`, así que `remaining > 0`; si la
 *    consulta de reclamación no la devuelve, ningún lote la reclama y la
 *    campaña acaba en `stalled_no_progress` con pendientes: «otra pausa
 *    falsa». Quitar la rama pone estas pruebas en rojo.
 *  - N-5: `fakeTable.filter()` ignoraba en silencio cualquier operador que no
 *    fuera `match`/`imatch`; ahora lanza, como `.or()`.
 */
import { runCampaignBatch, CLAIMABLE_STATE_FILTER } from '../campaignBatch';
import { makeSupabase, has, opArg, type TableResolver } from './mockSupabase';
import { fakeTable, rowPasses, type Row } from './fakeTable';

jest.mock('@/lib/supabase/server-service', () => ({ getServiceClient: () => { throw new Error('no service client en tests'); } }));
const mockEnqueueJob = jest.fn(async (args: unknown) => (void args, 'job-1'));
jest.mock('@/lib/jobs/enqueue', () => ({ enqueueJob: (args: unknown) => mockEnqueueJob(args) }));
jest.mock('@/lib/services/crm/pricingService', () => ({ getUnitCost: jest.fn(async () => 0.0125) }));
jest.mock('@/lib/services/crm/email/variables', () => {
  const actual = jest.requireActual('@/lib/services/crm/email/variables');
  return { ...actual, buildContext: jest.fn(async () => ({ ...actual.emptyContext(), contact: { first_name: 'Laura' }, custom: {} })) };
});

beforeEach(() => { mockEnqueueJob.mockClear(); });

const UUID_C = '66666666-6666-4666-8666-666666666666';
const T0 = Date.parse('2026-09-14T15:00:00.000Z');

/** Campaña con `statistics` PERSISTENTES entre lotes (los update se aplican). */
function statefulCampaign(stats: Record<string, unknown>) {
  const row: Row = {
    id: UUID_C, organization_id: 7, name: 'F16R6T', channel: 'whatsapp', status: 'sending', scheduled_at: null,
    template_id: null, segment_id: null, content: 'hola',
    statistics: { throttle_mps: 10, respect_allowed_hours: false, next_batch_no: 2, ...stats },
    created_by: null, created_at: '', updated_at: '',
  };
  const pausas: Record<string, unknown>[] = [];
  const resolver: TableResolver = (ops) => {
    if (has(ops, 'update')) {
      const patch = opArg<Record<string, unknown>>(ops, 'update') ?? {};
      if (patch.statistics) row.statistics = patch.statistics;
      if (patch.status) row.status = patch.status;
      const st = (row.statistics ?? {}) as Record<string, unknown>;
      if (st.state === 'paused') pausas.push(st);
      return { data: row };
    }
    return { data: row };
  };
  return { row, pausas, resolver };
}

const ok = (i: { customerId: string }) => ({ message_id: `m-${i.customerId}`, conversation_id: 'c', activity_id: null, customer_id: i.customerId, channel_id: 'ch', scheduled: false });

/** Fila tal y como la deja el DEFAULT de la columna: `metadata = '{}'`. */
function defaultMetaRow(id: string): Row {
  return { id, campaign_id: UUID_C, customer_id: `cust-${id}`, state: null, replied_at: null, created_at: '2026-09-14T14:00:00.000Z', metadata: {} };
}
/** Fila con `metadata = NULL` (la columna es NULL-able). */
function nullMetaRow(id: string): Row {
  return { id, campaign_id: UUID_C, customer_id: `cust-${id}`, state: null, replied_at: null, created_at: '2026-09-14T14:00:00.000Z', metadata: null };
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

describe('F16 r6 · T11: filas con metadata `{}` (DEFAULT de la columna) o NULL cuentan como pendientes y SE RECLAMAN', () => {
  it('el filtro de reclamación conserva la rama `metadata->>state.is.null`', () => {
    expect(CLAIMABLE_STATE_FILTER).toContain('metadata->>state.in.(pending,queued)');
    expect(CLAIMABLE_STATE_FILTER).toContain('metadata->>state.is.null');
    // Y con la semántica de PostgREST que evalúa `fakeTable`: `{}` y NULL pasan.
    const ops = [{ method: 'or', args: [CLAIMABLE_STATE_FILTER] }];
    expect(rowPasses(defaultMetaRow('a'), ops)).toBe(true);
    expect(rowPasses(nullMetaRow('b'), ops)).toBe(true);
    expect(rowPasses({ ...defaultMetaRow('c'), metadata: { state: 'skipped' } }, ops)).toBe(false);
  });

  it('5 filas con metadata `{}`: se reclaman y se envían en el primer lote; la campaña acaba «completed» sin pausa', async () => {
    const filas: Row[] = [];
    for (let i = 0; i < 5; i += 1) filas.push(defaultMetaRow(`df-${i}`));
    const contacts = fakeTable(filas);
    const camp = statefulCampaign({ stalled_batches: 0 });
    const { sb } = makeSupabase({ campaigns: camp.resolver, campaign_contacts: contacts.resolver, messages: () => ({ data: [] }), provider_configs: () => ({ data: null }), message_events: () => ({ data: [] }) }, () => ({ data: true }));
    const send = jest.fn(async (i: { customerId: string }) => ok(i));
    const r = await runUntilDone(sb, send);
    expect(send).toHaveBeenCalledTimes(5);
    expect(r.batch_no).toBe(2);
    expect(r.claimed).toBe(5);
    expect(r.sent).toBe(5);
    expect(r.finished).toBe(true);
    expect(r.reason).toBe('completed');
    expect(camp.pausas).toHaveLength(0);
    expect(camp.row.status).toBe('sent');
    expect(contacts.rows.every((x) => (x.metadata as Record<string, unknown>).state === 'sent')).toBe(true);
  });

  it('5 filas con metadata NULL: igual, se reclaman y se envían; nada queda «pendiente» sin reclamar', async () => {
    const filas: Row[] = [];
    for (let i = 0; i < 5; i += 1) filas.push(nullMetaRow(`nl-${i}`));
    const contacts = fakeTable(filas);
    const camp = statefulCampaign({ stalled_batches: 0 });
    const { sb } = makeSupabase({ campaigns: camp.resolver, campaign_contacts: contacts.resolver, messages: () => ({ data: [] }), provider_configs: () => ({ data: null }), message_events: () => ({ data: [] }) }, () => ({ data: true }));
    const send = jest.fn(async (i: { customerId: string }) => ok(i));
    const r = await runUntilDone(sb, send);
    expect(send).toHaveBeenCalledTimes(5);
    expect(r.claimed).toBe(5);
    expect(r.sent).toBe(5);
    expect(r.reason).toBe('completed');
    expect(camp.pausas).toHaveLength(0);
    expect(contacts.rows.every((x) => (x.metadata as Record<string, unknown>).state === 'sent')).toBe(true);
  });

  it('mezcla realista: 3 `pending` explícitas + 3 `{}` + 3 NULL + 2 saltadas → 9 envíos, 2 saltadas intactas, «completed»', async () => {
    const filas: Row[] = [];
    for (let i = 0; i < 3; i += 1) filas.push({ ...defaultMetaRow(`p-${i}`), metadata: { state: 'pending', recipient: '573100000001', attempts: 0 } });
    for (let i = 0; i < 3; i += 1) filas.push(defaultMetaRow(`d-${i}`));
    for (let i = 0; i < 3; i += 1) filas.push(nullMetaRow(`n-${i}`));
    for (let i = 0; i < 2; i += 1) filas.push({ ...defaultMetaRow(`s-${i}`), metadata: { state: 'skipped', skipped_reason: 'window_required' } });
    const contacts = fakeTable(filas);
    const camp = statefulCampaign({ stalled_batches: 0 });
    const { sb } = makeSupabase({ campaigns: camp.resolver, campaign_contacts: contacts.resolver, messages: () => ({ data: [] }), provider_configs: () => ({ data: null }), message_events: () => ({ data: [] }) }, () => ({ data: true }));
    const send = jest.fn(async (i: { customerId: string }) => ok(i));
    const r = await runUntilDone(sb, send);
    expect(send).toHaveBeenCalledTimes(9);
    expect(r.sent).toBe(9);
    expect(r.reason).toBe('completed');
    expect(camp.pausas).toHaveLength(0);
    const estados = contacts.rows.map((x) => (x.metadata as Record<string, unknown>).state);
    expect(estados.filter((s) => s === 'sent')).toHaveLength(9);
    expect(estados.filter((s) => s === 'skipped')).toHaveLength(2);
  });
});

describe('F16 r6 · N-5: `fakeTable.filter()` no se traga operadores que no evalúa', () => {
  it('`match` e `imatch` se evalúan; cualquier otro operador lanza (como `.or()`)', () => {
    const row: Row = { phone: '+57 310 987 6543' };
    expect(rowPasses(row, [{ method: 'filter', args: ['phone', 'imatch', '6543$'] }])).toBe(true);
    expect(rowPasses(row, [{ method: 'filter', args: ['phone', 'match', '^\\+57'] }])).toBe(true);
    expect(rowPasses(row, [{ method: 'filter', args: ['phone', 'match', '^\\+1'] }])).toBe(false);
    expect(() => rowPasses(row, [{ method: 'filter', args: ['phone', 'ilike', '%6543'] }])).toThrow(/filter\(\) no soportado/);
    expect(() => rowPasses(row, [{ method: 'filter', args: ['phone', 'eq', 'x'] }])).toThrow(/filter\(\) no soportado/);
  });
});
