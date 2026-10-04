/**
 * Tester F0-JOBS r4 — `sendWhatsApp` REAL (F16) con la harness de sus tests:
 * el handler delega la clave al envío. SQL prepara la reserva y el mensaje
 * juntos; cualquier fallo debe propagarse y el duplicado conservar su ID.
 */
import { sendWhatsApp } from '@/lib/services/crm/whatsapp/outboundService';
import { makeSupabase, has, opArg, type TableResolver } from '@/lib/services/crm/whatsapp/__tests__/mockSupabase';

jest.mock('@/lib/supabase/server-service', () => ({ getServiceClient: () => { throw new Error('no service client en tests'); } }));
jest.mock('@/lib/jobs/enqueue', () => ({ enqueueJob: jest.fn(async () => 'job-1') }));
jest.mock('@/lib/services/crm/email/variables', () => ({
  buildContext: jest.fn(async () => ({ contact: {}, opportunity: {}, org: {}, custom: {} })),
  renderVariables: (tpl: string) => ({ out: tpl, missing: [] }),
}));

const NOW = new Date('2026-09-15T15:00:00Z');
const OPEN = new Date(NOW.getTime() - 3600_000).toISOString();

function baseTables(overrides: Partial<Record<string, TableResolver>> = {}): Record<string, TableResolver> {
  const conversations: TableResolver = (ops) => (has(ops, 'select') && has(ops, 'order') ? { data: { id: 'conv-1', last_inbound_at: OPEN } } : has(ops, 'insert') ? { data: { id: 'conv-new' } } : { data: { id: 'conv-1', channel_id: 'chan-1' } });
  return {
    customers: (ops) => (has(ops, 'select', 'phone') || opArg<string>(ops, 'select') === 'phone' ? { data: { phone: '+57 310 987 6543' } } : { data: { id: 'cust-1', full_name: 'Laura Gómez', first_name: 'Laura', phone: '+57 310 987 6543' } }),
    opportunities: () => ({ data: { id: 'opp-1', customer_id: 'cust-1' } }),
    channels: () => ({ data: { id: 'chan-1', name: 'Ventas CO', status: 'active', type: 'whatsapp' } }),
    channel_credentials: () => ({ data: { provider: 'meta' } }),
    customer_channel_identities: () => ({ data: null }),
    conversations,
    provider_configs: () => ({ data: null }),
    messages: (ops) => (has(ops, 'insert') ? { data: { id: 'msg-1', created_at: NOW.toISOString() } } : { data: null, count: 0 }),
    activities: (ops) => (has(ops, 'insert') ? { data: { id: 'act-1' } } : { data: null }),
    comm_usage_logs: () => ({ data: null }),
    templates: () => ({ data: null }),
    ...overrides,
  };
}
const resultado = { message_id: 'msg-1', conversation_id: 'conv-1', activity_id: null, customer_id: 'cust-1', channel_id: 'chan-1', scheduled: false };
const rpcOk = (fn: string) => ({ data: fn === 'fn_can_contact' ? true : fn === 'crm_prepare_whatsapp_outbound' ? resultado : null });

describe('tester r4 — sendWhatsApp real: preparación e idempotencia privadas', () => {
  it('timeout de preparación ⇒ falla sin publicación ni débito separados', async () => {
    const { sb, calls, rpcCalls } = makeSupabase(baseTables(), (fn) => fn === 'crm_prepare_whatsapp_outbound'
      ? { error: { message: 'canceling statement due to statement timeout' } } : rpcOk(fn));
    await expect(sendWhatsApp({ orgId: 7, customerId: 'cust-1', channelId: 'chan-1', text: 'hola', clientRequestId: 'job:job-1' }, sb, sb, NOW)).rejects.toThrow('canceling statement due to statement timeout');
    expect(rpcCalls.some((r) => r.fn === 'deduct_comm_credits')).toBe(false);
    expect(calls.some((c) => has(c.ops, 'insert'))).toBe(false);
  });

  it('SQL encuentra el previo ⇒ devuelve duplicate y el mensaje original', async () => {
    const { sb, calls, rpcCalls } = makeSupabase(baseTables(), (fn) => fn === 'crm_prepare_whatsapp_outbound'
      ? { data: { ...resultado, message_id: 'msg-previo', duplicate: true } } : rpcOk(fn));
    const r = await sendWhatsApp({ orgId: 7, customerId: 'cust-1', channelId: 'chan-1', text: 'hola', clientRequestId: 'job:job-1' }, sb, sb, NOW);
    expect(r).toMatchObject({ message_id: 'msg-previo', duplicate: true });
    expect(rpcCalls.some((r) => r.fn === 'deduct_comm_credits')).toBe(false);
    expect(calls.some((c) => has(c.ops, 'insert'))).toBe(false);
  });

  it('camino nuevo ⇒ prepara la clave de job en una RPC con organización', async () => {
    const { sb, calls, rpcCalls } = makeSupabase(baseTables(), rpcOk);
    const r = await sendWhatsApp({ orgId: 7, customerId: 'cust-1', channelId: 'chan-1', text: 'hola', clientRequestId: 'job:job-1' }, sb, sb, NOW);
    expect(r).toMatchObject({ message_id: 'msg-1', scheduled: false });
    expect(rpcCalls.filter((r) => r.fn === 'crm_prepare_whatsapp_outbound')).toEqual([{ fn: 'crm_prepare_whatsapp_outbound', args: { p_org: 7, p_request: expect.objectContaining({ client_request_id: 'job:job-1' }) } }]);
    expect(calls.some((c) => has(c.ops, 'insert'))).toBe(false);
  });
});
