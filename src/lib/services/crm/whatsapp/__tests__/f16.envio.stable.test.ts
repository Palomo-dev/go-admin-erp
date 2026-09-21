/**
 * F16 · Consolidación de las rondas (2026-09-21) — el ENVÍO INDIVIDUAL
 * (`sendWhatsApp`): modo estricto de variables, bloqueo de marketing a EE.UU.
 * e idempotencia por `clientRequestId` (organización + ventana de 7 días).
 *
 * Casos únicos rescatados de: tester r1 (`testerR1.test.ts`), builder r4
 * (`round4.test.ts`), builder r5 (`round5.test.ts`). `outbound.test.ts` ya
 * cubre opt-out, ventana, plantilla aprobada/pendiente, créditos y shape.
 * `buildContext` se dobla (necesita media base de datos); `renderVariables`
 * es el REAL, que es justo lo que hace que `strictPaths` muerda.
 */
import { CLIENT_REQUEST_ID_WINDOW_MS, findByClientRequestId, sendWhatsApp } from '../outboundService';
import { makeSupabase, has, opArg, type TableResolver } from './mockSupabase';
import { fakeTable, type Row } from './fakeTable';

jest.mock('@/lib/supabase/server-service', () => ({ getServiceClient: () => { throw new Error('no service client en tests'); } }));
jest.mock('@/lib/jobs/enqueue', () => ({ enqueueJob: jest.fn(async () => 'job-1') }));
jest.mock('@/lib/services/crm/pricingService', () => ({ getUnitCost: jest.fn(async () => 0.0125) }));
jest.mock('@/lib/services/crm/email/variables', () => {
  const actual = jest.requireActual('@/lib/services/crm/email/variables');
  return {
    ...actual,
    buildContext: jest.fn(async (_org: number, refs: { custom?: Record<string, unknown> }) => ({ ...actual.emptyContext(), contact: { first_name: 'Laura', full_name: 'Laura Gómez' }, opportunity: { name: 'Plan Pro' }, org: { name: 'ACME' }, custom: refs.custom ?? {} })),
  };
});

const T0 = Date.parse('2026-09-14T15:00:00.000Z');
const NOW = new Date(T0);
const KEY = 'F16R5T:individual:abc';

const APROBADA_MKT = {
  id: 'tpl-mkt', organization_id: 7, name: 'promo', description: null, body_html: 'Hola {{nombre}}, tenemos promo.', is_active: true, created_at: '', updated_at: '',
  metadata: { provider: 'meta', status: 'APPROVED', category: 'marketing', language: 'es', parameter_format: 'named', components: [{ type: 'BODY', text: 'Hola {{nombre}}, tenemos promo.' }], variable_map: { nombre: 'contact.first_name|cliente' } },
};

function sendTables(over: Partial<Record<string, TableResolver>> = {}, phone = '+57 310 987 6543'): Record<string, TableResolver> {
  return {
    customers: () => ({ data: { id: 'cust-1', full_name: 'Laura Gómez', first_name: 'Laura', phone } }),
    opportunities: () => ({ data: { id: 'opp-1', customer_id: 'cust-1' } }),
    channels: () => ({ data: { id: 'chan-1', name: 'Ventas CO', status: 'active', type: 'whatsapp' } }),
    channel_credentials: () => ({ data: { channel_id: 'chan-1', provider: 'meta' } }),
    customer_channel_identities: () => ({ data: null }),
    conversations: (ops) => (has(ops, 'insert') ? { data: { id: 'conv-new' } } : { data: { id: 'conv-7', channel_id: 'chan-1', last_inbound_at: new Date(T0 - 3600_000).toISOString() } }),
    provider_configs: () => ({ data: { settings: { default_country_code: '57' } } }),
    messages: (ops) => (has(ops, 'insert') ? { data: { id: 'msg-1', created_at: NOW.toISOString() } } : { data: [], count: 0 }),
    activities: (ops) => (has(ops, 'insert') ? { data: { id: 'act-1' } } : { data: null }),
    comm_usage_logs: () => ({ data: null }),
    message_events: () => ({ data: [] }),
    templates: () => ({ data: null }),
    ...over,
  };
}
const rpcOk = (fn: string) => ({ data: fn === 'fn_can_contact' ? true : fn === 'deduct_comm_credits' ? true : null });
const insertsEn = (calls: Array<{ table: string; ops: Parameters<typeof has>[0] }>, table: string) => calls.filter((c) => c.table === table && has(c.ops, 'insert'));
const mensajesFake = () => fakeTable([], { onInsert: (row) => { row.created_at = NOW.toISOString(); row.id = 'msg-1'; return row; } });

// ─── N-7 · modo estricto de variables en el envío individual (r4 · tester r1) ───

describe('sendWhatsApp · variables', () => {
  it('B4.N7 · un {{1}} posicional o una llave que no es ruta ({{nombre cliente}}) → 422 MISSING_VARIABLES sin insertar', async () => {
    for (const text of ['Hola {{1}}, tu pedido llegó', 'Hola {{nombre cliente}}, ¿todo bien?']) {
      const { sb, calls } = makeSupabase(sendTables(), rpcOk);
      await expect(sendWhatsApp({ orgId: 7, customerId: 'cust-1', channelId: 'chan-1', text }, sb, sb, NOW)).rejects.toMatchObject({ code: 'MISSING_VARIABLES', status: 422 });
      expect(insertsEn(calls, 'messages')).toHaveLength(0);
    }
  });

  it('T1.1 · una ruta válida sin valor ({{invoice.total}}) también para en 422 y el literal nunca llega a messages.content', async () => {
    const { sb, calls } = makeSupabase(sendTables(), rpcOk);
    await expect(sendWhatsApp({ orgId: 7, customerId: 'cust-1', channelId: 'chan-1', text: 'Hola {{contact.first_name}}, tu saldo es {{invoice.total}}' }, sb, sb, NOW)).rejects.toMatchObject({ code: 'MISSING_VARIABLES', status: 422 });
    for (const ins of insertsEn(calls, 'messages')) expect(String(opArg<Record<string, unknown>>(ins.ops, 'insert')!.content)).not.toContain('{{');
    expect(insertsEn(calls, 'messages')).toHaveLength(0);
  });

  it('B4.N7 · una ruta válida y resoluble sí se envía interpolada; con default `|` no cuenta como faltante', async () => {
    const a = makeSupabase(sendTables(), rpcOk);
    await sendWhatsApp({ orgId: 7, customerId: 'cust-1', channelId: 'chan-1', text: 'Hola {{contact.first_name}}' }, a.sb, a.sb, NOW);
    expect(opArg<Record<string, unknown>>(insertsEn(a.calls, 'messages')[0].ops, 'insert')!.content).toBe('Hola Laura');
    const b = makeSupabase(sendTables(), rpcOk);
    await sendWhatsApp({ orgId: 7, customerId: 'cust-1', channelId: 'chan-1', text: 'Hola {{contact.nickname|cliente}}' }, b.sb, b.sb, NOW);
    expect(opArg<Record<string, unknown>>(insertsEn(b.calls, 'messages')[0].ops, 'insert')!.content).toBe('Hola cliente');
  });
});

// ─── N-7 · bloqueo de marketing a EE.UU. (r4) ───────────────────────────────────

describe('sendWhatsApp · marketing a EE.UU.', () => {
  it('B4.N7 · plantilla de marketing a un número de EE.UU. → 422 US_MARKETING_BLOCKED; a uno colombiano sí sale', async () => {
    const us = makeSupabase(sendTables({ templates: () => ({ data: APROBADA_MKT }) }, '+1 415 555 0100'), rpcOk);
    await expect(sendWhatsApp({ orgId: 7, customerId: 'cust-1', channelId: 'chan-1', template: { templateId: 'tpl-mkt' } }, us.sb, us.sb, NOW)).rejects.toMatchObject({ code: 'US_MARKETING_BLOCKED', status: 422 });
    expect(insertsEn(us.calls, 'messages')).toHaveLength(0);
    const co = makeSupabase(sendTables({ templates: () => ({ data: APROBADA_MKT }) }), rpcOk);
    await sendWhatsApp({ orgId: 7, customerId: 'cust-1', channelId: 'chan-1', template: { templateId: 'tpl-mkt' } }, co.sb, co.sb, NOW);
    expect(insertsEn(co.calls, 'messages')).toHaveLength(1);
  });
});

// ─── N-5 · la clave de idempotencia se COMPRUEBA antes de insertar (r4) ─────────

describe('sendWhatsApp · clientRequestId', () => {
  it('B4.N5 · dos envíos con la misma clave insertan UN solo mensaje, el 2.º es duplicate y no vuelve a descontar créditos', async () => {
    const mensajes = mensajesFake();
    const { sb, calls, rpcCalls } = makeSupabase(sendTables({ messages: mensajes.resolver }), rpcOk);
    const a = await sendWhatsApp({ orgId: 7, customerId: 'cust-1', channelId: 'chan-1', text: 'hola', clientRequestId: 'campaign:x:cust-1' }, sb, sb, NOW);
    const antes = rpcCalls.filter((r) => r.fn === 'deduct_comm_credits').length;
    const b = await sendWhatsApp({ orgId: 7, customerId: 'cust-1', channelId: 'chan-1', text: 'hola', clientRequestId: 'campaign:x:cust-1' }, sb, sb, NOW);
    expect(insertsEn(calls, 'messages')).toHaveLength(1);
    expect(b.message_id).toBe(a.message_id);
    expect(b.duplicate).toBe(true);
    expect(rpcCalls.filter((r) => r.fn === 'deduct_comm_credits')).toHaveLength(antes);
  });

  it('B4.N5 · claves distintas siguen insertando mensajes distintos', async () => {
    const mensajes = fakeTable([], { onInsert: (row) => { row.created_at = NOW.toISOString(); return row; } });
    const { sb, calls } = makeSupabase(sendTables({ messages: mensajes.resolver }), rpcOk);
    await sendWhatsApp({ orgId: 7, customerId: 'cust-1', channelId: 'chan-1', text: 'hola', clientRequestId: 'k-1' }, sb, sb, NOW);
    await sendWhatsApp({ orgId: 7, customerId: 'cust-1', channelId: 'chan-1', text: 'hola', clientRequestId: 'k-2' }, sb, sb, NOW);
    expect(insertsEn(calls, 'messages')).toHaveLength(2);
  });
});

// ─── R07 / R23 · findByClientRequestId: organización y ventana de 7 días (r5) ───

function mensaje(id: string, organization_id: number, ageMs: number, extra: Partial<Row> = {}): Row {
  return { id, organization_id, direction: 'outbound', conversation_id: `conv-${organization_id}`, created_at: new Date(T0 - ageMs).toISOString(), metadata: { client_request_id: KEY }, ...extra };
}

describe('findByClientRequestId', () => {
  it('B5.R07 · la misma clave en OTRA organización no cuenta como duplicado y la consulta lleva eq(organization_id) (service role)', async () => {
    const mensajes = fakeTable([mensaje('msg-otra', 8, 60_000)]);
    const { sb } = makeSupabase({ messages: mensajes.resolver });
    expect(await findByClientRequestId(7, KEY, sb, NOW)).toBeNull();
    expect(await findByClientRequestId(8, KEY, sb, NOW)).toEqual({ id: 'msg-otra', conversation_id: 'conv-8' });
    expect(mensajes.selects[0].some((o) => o.method === 'eq' && o.args[0] === 'organization_id' && o.args[1] === 7)).toBe(true);
  });

  it('B5.R07 · de punta a punta: la clave que ya usó OTRA org SÍ sale (y cobra); en la MISMA org se calla (duplicado) sin cobrar', async () => {
    const otra = fakeTable([mensaje('msg-otra', 8, 60_000)]);
    const a = makeSupabase(sendTables({ messages: otra.resolver }), rpcOk);
    const ra = await sendWhatsApp({ orgId: 7, customerId: 'cust-1', channelId: 'chan-1', text: 'hola', clientRequestId: KEY }, a.sb, a.sb, NOW);
    expect(ra.duplicate).toBeUndefined();
    expect(otra.rows).toHaveLength(2);
    expect(otra.rows[1].organization_id).toBe(7);
    expect(a.rpcCalls.filter((c) => c.fn === 'deduct_comm_credits')).toHaveLength(1);
    const mia = fakeTable([mensaje('msg-mia', 7, 60_000)]);
    const b = makeSupabase(sendTables({ messages: mia.resolver }), rpcOk);
    const rb = await sendWhatsApp({ orgId: 7, customerId: 'cust-1', channelId: 'chan-1', text: 'hola', clientRequestId: KEY }, b.sb, b.sb, NOW);
    expect(rb).toMatchObject({ duplicate: true, message_id: 'msg-mia' });
    expect(mia.rows).toHaveLength(1);
    expect(b.rpcCalls.filter((c) => c.fn === 'deduct_comm_credits')).toHaveLength(0);
  });

  it('B5.R23 · la ventana es de 7 días exactos: 7 d + 1 s ya no bloquea, 7 d − 1 s sí, y la consulta lleva gte(created_at, ahora − 7 d)', async () => {
    expect(CLIENT_REQUEST_ID_WINDOW_MS).toBe(7 * 24 * 3600 * 1000);
    const viejo = fakeTable([mensaje('msg-viejo', 7, CLIENT_REQUEST_ID_WINDOW_MS + 1000)]);
    const reciente = fakeTable([mensaje('msg-reciente', 7, CLIENT_REQUEST_ID_WINDOW_MS - 1000)]);
    expect(await findByClientRequestId(7, KEY, makeSupabase({ messages: viejo.resolver }).sb, NOW)).toBeNull();
    expect(await findByClientRequestId(7, KEY, makeSupabase({ messages: reciente.resolver }).sb, NOW)).toEqual({ id: 'msg-reciente', conversation_id: 'conv-7' });
    const g = viejo.selects[0].find((o) => o.method === 'gte' && o.args[0] === 'created_at');
    expect(g).toBeDefined();
    expect(Date.parse(String(g!.args[1]))).toBe(T0 - CLIENT_REQUEST_ID_WINDOW_MS);
  });

  it('B5.R23 · con uno viejo (8 d) y uno reciente (1 h) devuelve el reciente; solo cuentan los SALIENTES', async () => {
    const ambos = fakeTable([mensaje('msg-viejo', 7, 8 * 24 * 3600_000), mensaje('msg-reciente', 7, 3600_000)]);
    expect((await findByClientRequestId(7, KEY, makeSupabase({ messages: ambos.resolver }).sb, NOW))?.id).toBe('msg-reciente');
    const entrante = fakeTable([mensaje('msg-in', 7, 60_000, { direction: 'inbound' })]);
    expect(await findByClientRequestId(7, KEY, makeSupabase({ messages: entrante.resolver }).sb, NOW)).toBeNull();
  });

  it('B5.R23 · de punta a punta: un mensaje de hace 30 días con la misma clave no impide el envío', async () => {
    const mensajes = fakeTable([mensaje('msg-viejo', 7, 30 * 24 * 3600_000)]);
    const { sb } = makeSupabase(sendTables({ messages: mensajes.resolver }), rpcOk);
    const r = await sendWhatsApp({ orgId: 7, customerId: 'cust-1', channelId: 'chan-1', text: 'hola', clientRequestId: KEY }, sb, sb, NOW);
    expect(r.duplicate).toBeUndefined();
    expect(mensajes.rows).toHaveLength(2);
  });
});
