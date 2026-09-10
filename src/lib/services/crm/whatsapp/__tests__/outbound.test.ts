import { sendWhatsApp } from '../outboundService';
import { WhatsAppError } from '../types';
import { makeSupabase, has, opArg, type TableResolver } from './mockSupabase';

jest.mock('@/lib/supabase/server-service', () => ({ getServiceClient: () => { throw new Error('no service client en tests'); } }));
jest.mock('@/lib/jobs/enqueue', () => ({ enqueueJob: jest.fn(async () => 'job-1') }));
jest.mock('@/lib/services/crm/email/variables', () => ({
  buildContext: jest.fn(async (_org: number, refs: { custom?: Record<string, unknown> }) => ({ contact: { first_name: 'Laura', full_name: 'Laura Gómez' }, opportunity: { name: 'Plan Pro' }, org: { name: 'ACME' }, custom: refs.custom ?? {} })),
  renderVariables: (tpl: string, ctx: Record<string, Record<string, unknown>>) => ({ out: tpl.replace(/\{\{\s*([^}|]+)(?:\|([^}]*))?\s*\}\}/g, (_m, p: string, d?: string) => { const [a, b] = p.trim().split('.'); const v = (ctx[a] as Record<string, unknown> | undefined)?.[b]; return v != null && v !== '' ? String(v) : (d ?? ''); }), missing: [] }),
}));

const NOW = new Date('2026-09-08T15:00:00Z');
const OPEN = new Date(NOW.getTime() - 3600_000).toISOString();
const CLOSED = new Date(NOW.getTime() - 30 * 3600_000).toISOString();

function baseTables(overrides: Partial<Record<string, TableResolver>> = {}, lastInbound: string | null = OPEN): Record<string, TableResolver> {
  const conversations: TableResolver = (ops) => (has(ops, 'select') && has(ops, 'order') ? { data: { id: 'conv-1', last_inbound_at: lastInbound } } : has(ops, 'insert') ? { data: { id: 'conv-new' } } : { data: { id: 'conv-1', channel_id: 'chan-1' } });
  return {
    customers: (ops) => (has(ops, 'select', 'phone') || opArg<string>(ops, 'select') === 'phone' ? { data: { phone: '+57 310 987 6543' } } : { data: { id: 'cust-1', full_name: 'Laura Gómez', first_name: 'Laura', phone: '+57 310 987 6543' } }),
    opportunities: () => ({ data: { id: 'opp-1', customer_id: 'cust-1' } }),
    channels: () => ({ data: { id: 'chan-1', name: 'Ventas CO', status: 'active', type: 'whatsapp' } }),
    channel_credentials: () => ({ data: { provider: 'meta' } }),
    customer_channel_identities: () => ({ data: null }),
    conversations,
    provider_configs: () => ({ data: null }),
    messages: (ops) => (has(ops, 'insert') ? { data: { id: 'msg-1', created_at: NOW.toISOString() } } : { data: [], count: 0 }),
    activities: (ops) => (has(ops, 'insert') ? { data: { id: 'act-1' } } : { data: null }),
    comm_usage_logs: () => ({ data: null }),
    templates: () => ({ data: null }),
    ...overrides,
  };
}

const rpcOk = (fn: string) => ({ data: fn === 'fn_can_contact' ? true : fn === 'deduct_comm_credits' ? true : null });

describe('sendWhatsApp (outboundService)', () => {
  test('opt-out → 422 OPTED_OUT sin insertar en messages', async () => {
    const { sb, calls } = makeSupabase(baseTables(), (fn) => ({ data: fn === 'fn_can_contact' ? false : true }));
    await expect(sendWhatsApp({ orgId: 7, customerId: 'cust-1', channelId: 'chan-1', text: 'hola' }, sb, sb, NOW)).rejects.toMatchObject({ code: 'OPTED_OUT', status: 422 });
    expect(calls.some((c) => c.table === 'messages' && has(c.ops, 'insert'))).toBe(false);
  });

  test('ventana cerrada + texto libre → 422 WINDOW_CLOSED', async () => {
    const { sb } = makeSupabase(baseTables({}, CLOSED), rpcOk);
    await expect(sendWhatsApp({ orgId: 7, customerId: 'cust-1', channelId: 'chan-1', text: 'hola' }, sb, sb, NOW)).rejects.toMatchObject({ code: 'WINDOW_CLOSED' });
  });

  test('ventana abierta + texto → inserta messages con la shape viva y crea activity', async () => {
    const { sb, calls, rpcCalls } = makeSupabase(baseTables(), rpcOk);
    const r = await sendWhatsApp({ orgId: 7, customerId: 'cust-1', opportunityId: 'opp-1', channelId: 'chan-1', text: 'Hola Laura', senderMemberId: 42, senderUserId: 'u-1', clientRequestId: 'req-1' }, sb, sb, NOW);
    expect(r).toMatchObject({ message_id: 'msg-1', conversation_id: 'conv-1', activity_id: 'act-1', scheduled: false });
    const ins = calls.find((c) => c.table === 'messages' && has(c.ops, 'insert'))!;
    const row = opArg<Record<string, unknown>>(ins.ops, 'insert')!;
    expect(row).toMatchObject({ organization_id: 7, conversation_id: 'conv-1', channel_id: 'chan-1', direction: 'outbound', role: 'agent', sender_member_id: 42, content_type: 'text', content: 'Hola Laura', related_opportunity_id: 'opp-1', is_read: true });
    expect(row.payload).toEqual({ text: { body: 'Hola Laura', preview_url: false } });
    expect((row.metadata as Record<string, unknown>).to).toBe('573109876543');
    expect((row.metadata as Record<string, unknown>).client_request_id).toBe('req-1');
    const act = calls.find((c) => c.table === 'activities' && has(c.ops, 'insert'))!;
    expect(opArg<Record<string, unknown>>(act.ops, 'insert')).toMatchObject({ activity_type: 'whatsapp', message_id: 'msg-1', conversation_id: 'conv-1', related_type: 'opportunity', related_id: 'opp-1' });
    expect(rpcCalls.map((r) => r.fn)).toEqual(expect.arrayContaining(['fn_can_contact', 'deduct_comm_credits']));
  });

  test('texto libre con {{...}} → se interpola con el motor de F7 (no se envía literal)', async () => {
    const { sb, calls } = makeSupabase(baseTables(), rpcOk);
    await sendWhatsApp({ orgId: 7, customerId: 'cust-1', channelId: 'chan-1', text: 'Hola {{contact.first_name}}, tu {{opportunity.name}} sigue activo' }, sb, sb, NOW);
    const ins = calls.find((c) => c.table === 'messages' && has(c.ops, 'insert'))!;
    const row = opArg<Record<string, unknown>>(ins.ops, 'insert')!;
    expect(row.content).toBe('Hola Laura, tu Plan Pro sigue activo');
    expect(row.payload).toEqual({ text: { body: 'Hola Laura, tu Plan Pro sigue activo', preview_url: false } });
  });

  test('texto sin {{...}} no llama a buildContext', async () => {
    const { buildContext } = jest.requireMock('@/lib/services/crm/email/variables') as { buildContext: jest.Mock };
    buildContext.mockClear();
    const { sb } = makeSupabase(baseTables(), rpcOk);
    await sendWhatsApp({ orgId: 7, customerId: 'cust-1', channelId: 'chan-1', text: 'Hola Laura' }, sb, sb, NOW);
    expect(buildContext).not.toHaveBeenCalled();
  });

  test('ventana cerrada + plantilla APROBADA → content_type template y payload named params', async () => {
    const tpl = { id: 'tpl-1', organization_id: 7, name: 'seguimiento_propuesta', description: null, body_html: 'Hola {{nombre}}, propuesta "{{oportunidad}}".', is_active: true, created_at: '', updated_at: '', metadata: { provider: 'meta', status: 'APPROVED', category: 'utility', language: 'es', parameter_format: 'named', components: [{ type: 'BODY', text: 'Hola {{nombre}}, propuesta "{{oportunidad}}".' }], variable_map: { nombre: 'contact.first_name|cliente', oportunidad: 'opportunity.name' } } };
    const { sb, calls } = makeSupabase(baseTables({ templates: () => ({ data: tpl }) }, CLOSED), rpcOk);
    await sendWhatsApp({ orgId: 7, customerId: 'cust-1', opportunityId: 'opp-1', channelId: 'chan-1', template: { templateId: 'tpl-1' } }, sb, sb, NOW);
    const row = opArg<Record<string, unknown>>(calls.find((c) => c.table === 'messages' && has(c.ops, 'insert'))!.ops, 'insert')!;
    expect(row.content_type).toBe('template');
    expect(row.content).toBe('Hola Laura, propuesta "Plan Pro".');
    const payload = row.payload as { template: { name: string; language: { code: string }; components: Array<{ type: string; parameters: Array<{ parameter_name: string; text: string }> }> } };
    expect(payload.template.name).toBe('seguimiento_propuesta');
    expect(payload.template.language).toEqual({ code: 'es' });
    expect(payload.template.components[0].parameters).toEqual([{ type: 'text', parameter_name: 'nombre', text: 'Laura' }, { type: 'text', parameter_name: 'oportunidad', text: 'Plan Pro' }]);
  });

  test('plantilla PENDING → 422 TEMPLATE_NOT_APPROVED', async () => {
    const tpl = { id: 'tpl-1', organization_id: 7, name: 'x', body_html: 'Hola', metadata: { status: 'PENDING', category: 'utility', components: [{ type: 'BODY', text: 'Hola' }] } };
    const { sb } = makeSupabase(baseTables({ templates: () => ({ data: tpl }) }, CLOSED), rpcOk);
    await expect(sendWhatsApp({ orgId: 7, customerId: 'cust-1', channelId: 'chan-1', template: { templateId: 'tpl-1' } }, sb, sb, NOW)).rejects.toBeInstanceOf(WhatsAppError);
    await expect(sendWhatsApp({ orgId: 7, customerId: 'cust-1', channelId: 'chan-1', template: { templateId: 'tpl-1' } }, sb, sb, NOW)).rejects.toMatchObject({ code: 'TEMPLATE_NOT_APPROVED' });
  });

  test('sin créditos → 402 NO_CREDITS', async () => {
    const { sb } = makeSupabase(baseTables(), (fn) => ({ data: fn === 'deduct_comm_credits' ? false : true }));
    await expect(sendWhatsApp({ orgId: 7, customerId: 'cust-1', channelId: 'chan-1', text: 'hola' }, sb, sb, NOW)).rejects.toMatchObject({ code: 'NO_CREDITS', status: 402 });
  });

  test('cliente de otra org → 404', async () => {
    const { sb } = makeSupabase(baseTables({ customers: () => ({ data: null }) }), rpcOk);
    await expect(sendWhatsApp({ orgId: 7, customerId: 'cust-x', channelId: 'chan-1', text: 'hola' }, sb, sb, NOW)).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 });
  });
});
