/**
 * FASE-16 · ronda 5 — dos guardas de `findByClientRequestId` que sobrevivieron
 * a las mutaciones del tester r4 porque ninguna prueba las mordía:
 *
 *  - R07: `.eq('organization_id')`. Es la clave de idempotencia consultada con
 *    service role: sin ese filtro, la MISMA clave en otra organización
 *    devuelve «duplicado» y el envío se calla sin error.
 *  - R23: la ventana de 7 días (`gte created_at`). Sin ella, un mensaje de hace
 *    meses con la misma clave sigue bloqueando el envío para siempre.
 *
 * Con `fakeTable` los filtros se evalúan de verdad: quitar cualquiera de los
 * dos pone en rojo su caso.
 *
 * Y T-4: «siempre el más antiguo» no era cierto entre el camino rápido
 * (igualdad E.164) y el lento de `findCustomerIdByPhone`.
 */
import { CLIENT_REQUEST_ID_WINDOW_MS, findByClientRequestId, sendWhatsApp } from '../outboundService';
import { findCustomerIdByPhone } from '../channelService';
import { makeSupabase, has, type TableResolver } from './mockSupabase';
import { fakeTable, type Row } from './fakeTable';

jest.mock('@/lib/supabase/server-service', () => ({ getServiceClient: () => { throw new Error('no service client en tests'); } }));
jest.mock('@/lib/jobs/enqueue', () => ({ enqueueJob: jest.fn(async () => 'job-1') }));
jest.mock('@/lib/services/crm/pricingService', () => ({ getUnitCost: jest.fn(async () => 0.0125) }));
jest.mock('@/lib/services/crm/email/variables', () => {
  const actual = jest.requireActual('@/lib/services/crm/email/variables');
  return { ...actual, buildContext: jest.fn(async () => ({ ...actual.emptyContext(), contact: { first_name: 'Laura' }, custom: {} })) };
});

const T0 = Date.parse('2026-09-14T15:00:00.000Z');
const KEY = 'F16R5T:individual:abc';

function mensaje(id: string, organization_id: number, ageMs: number, extra: Partial<Row> = {}): Row {
  return { id, organization_id, direction: 'outbound', conversation_id: `conv-${organization_id}`, created_at: new Date(T0 - ageMs).toISOString(), metadata: { client_request_id: KEY }, ...extra };
}

function sendTables(mensajes: ReturnType<typeof fakeTable>): Record<string, TableResolver> {
  return {
    customers: () => ({ data: { id: 'cust-1', full_name: 'Laura', first_name: 'Laura', phone: '+57 310 987 6543' } }),
    channels: () => ({ data: { id: 'chan-1', name: 'Ventas', status: 'active', type: 'whatsapp' } }),
    channel_credentials: () => ({ data: { channel_id: 'chan-1', provider: 'meta' } }),
    customer_channel_identities: () => ({ data: null }),
    conversations: (ops) => (has(ops, 'insert') ? { data: { id: 'conv-new' } } : { data: { id: 'conv-7', channel_id: 'chan-1', last_inbound_at: new Date(T0 - 3600_000).toISOString() } }),
    provider_configs: () => ({ data: { settings: { default_country_code: '57' } } }),
    messages: mensajes.resolver,
    activities: (ops) => (has(ops, 'insert') ? { data: { id: 'act-1' } } : { data: null }),
    comm_usage_logs: () => ({ data: null }),
    message_events: () => ({ data: [] }),
  };
}

describe('F16 r5 · R07 · findByClientRequestId filtra por organización', () => {
  it('la misma clave en OTRA organización no cuenta como duplicado', async () => {
    const mensajes = fakeTable([mensaje('msg-otra', 8, 60_000)]);
    const { sb } = makeSupabase({ messages: mensajes.resolver });
    expect(await findByClientRequestId(7, KEY, sb, new Date(T0))).toBeNull();
    expect(await findByClientRequestId(8, KEY, sb, new Date(T0))).toEqual({ id: 'msg-otra', conversation_id: 'conv-8' });
  });

  it('la consulta lleva `eq(organization_id, <org>)` (no basta con filtrar en memoria: es service role)', async () => {
    const mensajes = fakeTable([]);
    const { sb } = makeSupabase({ messages: mensajes.resolver });
    await findByClientRequestId(7, KEY, sb, new Date(T0));
    expect(mensajes.selects[0].some((o) => o.method === 'eq' && o.args[0] === 'organization_id' && o.args[1] === 7)).toBe(true);
  });

  it('de punta a punta: un envío individual con una clave que ya usó OTRA organización SÍ sale (no se calla)', async () => {
    const mensajes = fakeTable([mensaje('msg-otra', 8, 60_000)]);
    const { sb, rpcCalls } = makeSupabase(sendTables(mensajes), () => ({ data: true }));
    const r = await sendWhatsApp({ orgId: 7, customerId: 'cust-1', channelId: 'chan-1', text: 'hola', clientRequestId: KEY }, sb, sb, new Date(T0));
    expect(r.duplicate).toBeUndefined();
    expect(mensajes.rows).toHaveLength(2);
    expect(mensajes.rows[1].organization_id).toBe(7);
    expect(rpcCalls.filter((c) => c.fn === 'deduct_comm_credits')).toHaveLength(1);
  });

  it('y con la clave ya usada en la MISMA organización, se calla (duplicado) sin cobrar', async () => {
    const mensajes = fakeTable([mensaje('msg-mia', 7, 60_000)]);
    const { sb, rpcCalls } = makeSupabase(sendTables(mensajes), () => ({ data: true }));
    const r = await sendWhatsApp({ orgId: 7, customerId: 'cust-1', channelId: 'chan-1', text: 'hola', clientRequestId: KEY }, sb, sb, new Date(T0));
    expect(r.duplicate).toBe(true);
    expect(r.message_id).toBe('msg-mia');
    expect(mensajes.rows).toHaveLength(1);
    expect(rpcCalls.filter((c) => c.fn === 'deduct_comm_credits')).toHaveLength(0);
  });
});

describe('F16 r5 · R23 · la clave solo protege durante la ventana de 7 días', () => {
  it('la constante es de 7 días exactos', () => {
    expect(CLIENT_REQUEST_ID_WINDOW_MS).toBe(7 * 24 * 3600 * 1000);
  });

  it('un mensaje de hace 7 días + 1 s ya no bloquea; uno de hace 7 días − 1 s sí', async () => {
    const viejo = fakeTable([mensaje('msg-viejo', 7, CLIENT_REQUEST_ID_WINDOW_MS + 1000)]);
    const reciente = fakeTable([mensaje('msg-reciente', 7, CLIENT_REQUEST_ID_WINDOW_MS - 1000)]);
    expect(await findByClientRequestId(7, KEY, makeSupabase({ messages: viejo.resolver }).sb, new Date(T0))).toBeNull();
    expect(await findByClientRequestId(7, KEY, makeSupabase({ messages: reciente.resolver }).sb, new Date(T0))).toEqual({ id: 'msg-reciente', conversation_id: 'conv-7' });
  });

  it('la consulta lleva `gte(created_at, ahora − 7 d)`', async () => {
    const mensajes = fakeTable([]);
    const { sb } = makeSupabase({ messages: mensajes.resolver });
    await findByClientRequestId(7, KEY, sb, new Date(T0));
    const g = mensajes.selects[0].find((o) => o.method === 'gte' && o.args[0] === 'created_at');
    expect(g).toBeDefined();
    expect(Date.parse(String(g!.args[1]))).toBe(T0 - CLIENT_REQUEST_ID_WINDOW_MS);
  });

  it('con un viejo (8 d) y uno reciente (1 h) con la misma clave, devuelve el reciente', async () => {
    const mensajes = fakeTable([mensaje('msg-viejo', 7, 8 * 24 * 3600_000), mensaje('msg-reciente', 7, 3600_000)]);
    const { sb } = makeSupabase({ messages: mensajes.resolver });
    expect((await findByClientRequestId(7, KEY, sb, new Date(T0)))?.id).toBe('msg-reciente');
  });

  it('de punta a punta: un mensaje de hace 30 días con la misma clave no impide el envío', async () => {
    const mensajes = fakeTable([mensaje('msg-viejo', 7, 30 * 24 * 3600_000)]);
    const { sb } = makeSupabase(sendTables(mensajes), () => ({ data: true }));
    const r = await sendWhatsApp({ orgId: 7, customerId: 'cust-1', channelId: 'chan-1', text: 'hola', clientRequestId: KEY }, sb, sb, new Date(T0));
    expect(r.duplicate).toBeUndefined();
    expect(mensajes.rows).toHaveLength(2);
  });

  it('solo cuentan los SALIENTES: un entrante con la misma clave no bloquea', async () => {
    const mensajes = fakeTable([mensaje('msg-in', 7, 60_000, { direction: 'inbound' })]);
    const { sb } = makeSupabase({ messages: mensajes.resolver });
    expect(await findByClientRequestId(7, KEY, sb, new Date(T0))).toBeNull();
  });
});

// ─── T-4 · «siempre el más antiguo» también entre formatos ───────────────────

describe('F16 r5 · T-4 · findCustomerIdByPhone devuelve el más antiguo aunque el más nuevo esté en formato canónico', () => {
  const clientes = (rows: Row[]) => makeSupabase({ customers: fakeTable(rows).resolver });

  it('ficha vieja con separadores + ficha nueva en E.164 exacto → la VIEJA (2 grupos reales el 2026-09-14)', async () => {
    const filas: Row[] = [
      { id: 'c-nuevo-canonico', organization_id: 7, phone: '+573109876543', created_at: '2024-05-05T00:00:00Z' },
      { id: 'c-viejo-separadores', organization_id: 7, phone: '+57 310 987 6543', created_at: '2019-02-02T00:00:00Z' },
    ];
    await expect(findCustomerIdByPhone(7, '573109876543', clientes(filas).sb, { defaultCountry: '57' })).resolves.toBe('c-viejo-separadores');
    await expect(findCustomerIdByPhone(7, '573109876543', clientes([...filas].reverse()).sb, { defaultCountry: '57' })).resolves.toBe('c-viejo-separadores');
  });

  it('ficha vieja nacional («310 987 6543») + ficha nueva «573109876543» → la VIEJA', async () => {
    const filas: Row[] = [
      { id: 'c-nuevo', organization_id: 7, phone: '573109876543', created_at: '2024-05-05T00:00:00Z' },
      { id: 'c-viejo', organization_id: 7, phone: '310 987 6543', created_at: '2019-02-02T00:00:00Z' },
    ];
    await expect(findCustomerIdByPhone(7, '573109876543', clientes(filas).sb, { defaultCountry: '57' })).resolves.toBe('c-viejo');
  });

  it('una sola consulta a customers: prefiltro `imatch` + `eq(organization_id)` + orden (created_at, id) + limit', async () => {
    const t = fakeTable([{ id: 'c-1', organization_id: 7, phone: '+573109876543', created_at: '2021-01-01T00:00:00Z' }]);
    const { sb } = makeSupabase({ customers: t.resolver });
    await expect(findCustomerIdByPhone(7, '573109876543', sb)).resolves.toBe('c-1');
    expect(t.selects).toHaveLength(1);
    const ops = t.selects[0];
    expect(ops.some((o) => o.method === 'eq' && o.args[0] === 'organization_id' && o.args[1] === 7)).toBe(true);
    expect(ops.some((o) => o.method === 'filter' && o.args[0] === 'phone' && o.args[1] === 'imatch')).toBe(true);
    expect(ops.filter((o) => o.method === 'order').map((o) => String(o.args[0]))).toEqual(['created_at', 'id']);
    expect(ops.some((o) => o.method === 'in')).toBe(false);
  });
});
