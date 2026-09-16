/**
 * Tester F0-JOBS r4 — `sendWhatsApp` REAL (F16) con la harness de sus tests:
 * el handler `whatsapp` delega en él con `clientRequestId`, y allí se repite
 * `findByClientRequestId` ANTES de descontar créditos. Si esa segunda consulta
 * falla, el envío debe abortar (fail-closed): ni `deduct_comm_credits` ni
 * INSERT en `messages`. Y si encuentra el previo, `duplicate:true` sin cobrar.
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
const rpcOk = (fn: string) => ({ data: fn === 'fn_can_contact' ? true : fn === 'deduct_comm_credits' ? true : null });
const isIdemQuery = (ops: Parameters<TableResolver>[0]) => has(ops, 'eq', 'metadata->>client_request_id');

describe('tester r4 — sendWhatsApp real: la comprobación de idempotencia es fail-closed también en F16', () => {
  it('la consulta por client_request_id falla ⇒ rechaza con "findByClientRequestId:", SIN deduct_comm_credits ni INSERT en messages', async () => {
    const { sb, calls, rpcCalls } = makeSupabase(
      baseTables({ messages: (ops) => (isIdemQuery(ops) ? { data: null, error: { message: 'canceling statement due to statement timeout' } } : has(ops, 'insert') ? { data: { id: 'msg-1' } } : { data: null, count: 0 }) }),
      rpcOk,
    );
    await expect(sendWhatsApp({ orgId: 7, customerId: 'cust-1', channelId: 'chan-1', text: 'hola', clientRequestId: 'job:job-1' }, sb, sb, NOW)).rejects.toThrow('findByClientRequestId: canceling statement due to statement timeout');
    expect(rpcCalls.some((r) => r.fn === 'deduct_comm_credits')).toBe(false);
    expect(calls.some((c) => c.table === 'messages' && has(c.ops, 'insert'))).toBe(false);
  });

  it('la consulta encuentra el previo ⇒ duplicate:true con el message_id original, sin cobrar ni insertar', async () => {
    const { sb, calls, rpcCalls } = makeSupabase(
      baseTables({ messages: (ops) => (isIdemQuery(ops) ? { data: { id: 'msg-previo', conversation_id: 'conv-1' } } : { data: null, count: 0 }) }),
      rpcOk,
    );
    const r = await sendWhatsApp({ orgId: 7, customerId: 'cust-1', channelId: 'chan-1', text: 'hola', clientRequestId: 'job:job-1' }, sb, sb, NOW);
    expect(r).toMatchObject({ message_id: 'msg-previo', duplicate: true });
    expect(rpcCalls.some((r) => r.fn === 'deduct_comm_credits')).toBe(false);
    expect(calls.some((c) => c.table === 'messages' && has(c.ops, 'insert'))).toBe(false);
  });

  it('sin previo ⇒ cobra e inserta con metadata.client_request_id (camino feliz)', async () => {
    const { sb, calls, rpcCalls } = makeSupabase(baseTables(), rpcOk);
    const r = await sendWhatsApp({ orgId: 7, customerId: 'cust-1', channelId: 'chan-1', text: 'hola', clientRequestId: 'job:job-1' }, sb, sb, NOW);
    expect(r).toMatchObject({ message_id: 'msg-1', scheduled: false });
    expect(rpcCalls.some((r) => r.fn === 'deduct_comm_credits')).toBe(true);
    const ins = calls.find((c) => c.table === 'messages' && has(c.ops, 'insert'))!;
    expect((opArg<Record<string, unknown>>(ins.ops, 'insert')!.metadata as Record<string, unknown>).client_request_id).toBe('job:job-1');
  });
});
