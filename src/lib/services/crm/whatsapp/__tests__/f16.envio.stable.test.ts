/**
 * F16 · Consolidación de las rondas (2026-09-21) — el ENVÍO INDIVIDUAL
 * (`sendWhatsApp`): modo estricto de variables, bloqueo de marketing a EE.UU.
 * e idempotencia por `clientRequestId`. La RPC privada conserva la clave histórica;
 * el lector de compatibilidad del job todavía consulta siete días.
 *
 * Casos únicos rescatados de: tester r1 (`testerR1.test.ts`), builder r4
 * (`round4.test.ts`), builder r5 (`round5.test.ts`). `outbound.test.ts` ya
 * cubre opt-out, ventana, plantilla aprobada/pendiente, créditos y shape.
 * `buildContext` se dobla (necesita media base de datos); `renderVariables`
 * es el REAL, que es justo lo que hace que `strictPaths` muerda.
 */
import { CLIENT_REQUEST_ID_WINDOW_MS, findByClientRequestId, sendWhatsApp } from '../outboundService';
import { makeSupabase, has, type TableResolver } from './mockSupabase';
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
const preparado = { message_id: 'msg-1', conversation_id: 'conv-7', activity_id: 'act-1', customer_id: 'cust-1', channel_id: 'chan-1', scheduled: false };
const rpcOk = (fn: string) => ({ data: fn === 'fn_can_contact' ? true : fn === 'crm_prepare_whatsapp_outbound' ? preparado : null });
const solicitudes = (r: ReturnType<typeof makeSupabase>) => r.rpcCalls.filter((c) => c.fn === 'crm_prepare_whatsapp_outbound');
const solicitud = (r: ReturnType<typeof makeSupabase>) => solicitudes(r)[0].args.p_request as Record<string, unknown>;
const insertsEn = (calls: Array<{ table: string; ops: Parameters<typeof has>[0] }>, table: string) => calls.filter((c) => c.table === table && has(c.ops, 'insert'));

// ─── N-7 · modo estricto de variables en el envío individual (r4 · tester r1) ───

describe('sendWhatsApp · variables', () => {
  it('B4.N7 · un {{1}} posicional o una llave que no es ruta ({{nombre cliente}}) → 422 MISSING_VARIABLES sin insertar', async () => {
    for (const text of ['Hola {{1}}, tu pedido llegó', 'Hola {{nombre cliente}}, ¿todo bien?']) {
      const { sb, calls, rpcCalls } = makeSupabase(sendTables(), rpcOk);
      await expect(sendWhatsApp({ orgId: 7, customerId: 'cust-1', channelId: 'chan-1', text }, sb, sb, NOW)).rejects.toMatchObject({ code: 'MISSING_VARIABLES', status: 422 });
      expect(insertsEn(calls, 'messages')).toHaveLength(0);
      expect(rpcCalls.some((r) => r.fn === 'crm_prepare_whatsapp_outbound')).toBe(false);
    }
  });

  it('T1.1 · una ruta válida sin valor ({{invoice.total}}) también para en 422 y el literal nunca llega a messages.content', async () => {
    const { sb, calls, rpcCalls } = makeSupabase(sendTables(), rpcOk);
    await expect(sendWhatsApp({ orgId: 7, customerId: 'cust-1', channelId: 'chan-1', text: 'Hola {{contact.first_name}}, tu saldo es {{invoice.total}}' }, sb, sb, NOW)).rejects.toMatchObject({ code: 'MISSING_VARIABLES', status: 422 });
    expect(rpcCalls.some((r) => r.fn === 'crm_prepare_whatsapp_outbound')).toBe(false);
    expect(insertsEn(calls, 'messages')).toHaveLength(0);
  });

  it('B4.N7 · una ruta válida y resoluble sí se envía interpolada; con default `|` no cuenta como faltante', async () => {
    const a = makeSupabase(sendTables(), rpcOk);
    await sendWhatsApp({ orgId: 7, customerId: 'cust-1', channelId: 'chan-1', text: 'Hola {{contact.first_name}}' }, a.sb, a.sb, NOW);
    expect(solicitud(a).content).toBe('Hola Laura');
    const b = makeSupabase(sendTables(), rpcOk);
    await sendWhatsApp({ orgId: 7, customerId: 'cust-1', channelId: 'chan-1', text: 'Hola {{contact.nickname|cliente}}' }, b.sb, b.sb, NOW);
    expect(solicitud(b).content).toBe('Hola cliente');
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
    expect(solicitudes(co)).toHaveLength(1);
    expect(solicitud(co).purpose).toBe('marketing');
    expect(solicitudes(us)).toHaveLength(0);
  });
});

it('una plantilla marketing no permite usar force con el propósito utility para saltar horario', async () => {
  const r = makeSupabase(sendTables({ templates: () => ({ data: APROBADA_MKT }), provider_configs: () => ({ data: { settings: { allowed_hours: { tz: 'UTC', days: [1], from: '08:00', to: '09:00' } } } }) }), rpcOk);
  await expect(sendWhatsApp({ orgId: 7, customerId: 'cust-1', channelId: 'chan-1', template: { templateId: 'tpl-mkt' }, purpose: 'utility', force: true }, r.sb, r.sb, NOW)).rejects.toMatchObject({ code: 'OUTSIDE_HOURS' });
  expect(solicitudes(r)).toHaveLength(0);
});

// ─── N-5 · la clave de idempotencia se COMPRUEBA antes de insertar (r4) ─────────

describe('sendWhatsApp · clientRequestId', () => {
  it('B4.N5 · transmite la misma clave y conserva el resultado duplicado de SQL, sin débito separado', async () => {
    let veces = 0;
    const r = makeSupabase(sendTables(), (fn) => fn === 'crm_prepare_whatsapp_outbound'
      ? { data: { ...preparado, duplicate: ++veces > 1 } } : rpcOk(fn));
    const input = { orgId: 7, customerId: 'cust-1', channelId: 'chan-1', text: 'hola', clientRequestId: KEY };
    const a = await sendWhatsApp(input, r.sb, r.sb, NOW);
    const b = await sendWhatsApp(input, r.sb, r.sb, NOW);
    expect(b).toMatchObject({ message_id: a.message_id, duplicate: true });
    expect(solicitudes(r)).toHaveLength(2);
    expect(solicitudes(r)[0].args).toEqual(solicitudes(r)[1].args);
    expect(r.rpcCalls.some((c) => c.fn === 'deduct_comm_credits')).toBe(false);
    expect(insertsEn(r.calls, 'messages')).toHaveLength(0);
  });

  it('B4.N5 · claves distintas llegan separadas a la RPC', async () => {
    const r = makeSupabase(sendTables(), rpcOk);
    for (const key of ['k-1', 'k-2']) await sendWhatsApp({ orgId: 7, customerId: 'cust-1', channelId: 'chan-1', text: 'hola', clientRequestId: key }, r.sb, r.sb, NOW);
    expect(solicitudes(r).map((c) => (c.args.p_request as Record<string, unknown>).client_request_id)).toEqual(['k-1', 'k-2']);
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

  it('B5.R07 · vincula la preparación a la organización de la sesión', async () => {
    const r = makeSupabase(sendTables(), rpcOk);
    await sendWhatsApp({ orgId: 7, customerId: 'cust-1', channelId: 'chan-1', text: 'hola', clientRequestId: KEY }, r.sb, r.sb, NOW);
    expect(solicitudes(r)[0].args.p_org).toBe(7);
    expect(solicitud(r).client_request_id).toBe(KEY);
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

  it('B5.R23 · conserva un duplicado histórico devuelto por SQL sin volver a insertar ni cobrar', async () => {
    const r = makeSupabase(sendTables(), (fn) => fn === 'crm_prepare_whatsapp_outbound'
      ? { data: { ...preparado, message_id: 'msg-viejo', duplicate: true } } : rpcOk(fn));
    const result = await sendWhatsApp({ orgId: 7, customerId: 'cust-1', channelId: 'chan-1', text: 'hola', clientRequestId: KEY }, r.sb, r.sb, NOW);
    expect(result).toMatchObject({ message_id: 'msg-viejo', duplicate: true });
    expect(insertsEn(r.calls, 'messages')).toHaveLength(0);
    expect(r.rpcCalls.some((c) => c.fn === 'deduct_comm_credits')).toBe(false);
  });
});
