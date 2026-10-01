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

const preparado = { message_id: 'msg-1', conversation_id: 'conv-1', activity_id: 'act-1', customer_id: 'cust-1', channel_id: 'chan-1', scheduled: false };
const rpcOk = (fn: string) => ({ data: fn === 'fn_can_contact' ? true : fn === 'crm_prepare_whatsapp_outbound' ? preparado : null });

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

  test('ventana abierta + texto → una RPC publica contexto, reserva y actividad', async () => {
    const { sb, calls, rpcCalls } = makeSupabase(baseTables(), rpcOk);
    const r = await sendWhatsApp({ orgId: 7, customerId: 'cust-1', opportunityId: 'opp-1', channelId: 'chan-1', text: 'Hola Laura', senderMemberId: 42, senderUserId: 'u-1', clientRequestId: 'req-1' }, sb, sb, NOW);
    expect(r).toEqual(preparado);
    expect(rpcCalls.filter((r) => r.fn === 'crm_prepare_whatsapp_outbound')).toEqual([{ fn: 'crm_prepare_whatsapp_outbound', args: {
      p_org: 7, p_request: expect.objectContaining({ customer_id: 'cust-1', channel_id: 'chan-1', opportunity_id: 'opp-1', sender_member_id: 42, sender_user_id: 'u-1', role: 'agent', content_type: 'text', content: 'Hola Laura', recipient: '573109876543', client_request_id: 'req-1', purpose: 'utility', payload: { text: { body: 'Hola Laura', preview_url: false } } }),
    } }]);
    expect(rpcCalls.some((r) => r.fn === 'deduct_comm_credits')).toBe(false);
    expect(calls.some((c) => has(c.ops, 'insert') || has(c.ops, 'update') || has(c.ops, 'delete'))).toBe(false);
  });

  test('texto libre con {{...}} → se interpola con el motor de F7 (no se envía literal)', async () => {
    const { sb, rpcCalls } = makeSupabase(baseTables(), rpcOk);
    await sendWhatsApp({ orgId: 7, customerId: 'cust-1', channelId: 'chan-1', text: 'Hola {{contact.first_name}}, tu {{opportunity.name}} sigue activo' }, sb, sb, NOW);
    const row = rpcCalls.find((r) => r.fn === 'crm_prepare_whatsapp_outbound')!.args.p_request as Record<string, unknown>;
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
    const { sb, rpcCalls } = makeSupabase(baseTables({ templates: () => ({ data: tpl }) }, CLOSED), rpcOk);
    await sendWhatsApp({ orgId: 7, customerId: 'cust-1', opportunityId: 'opp-1', channelId: 'chan-1', template: { templateId: 'tpl-1' } }, sb, sb, NOW);
    const row = rpcCalls.find((r) => r.fn === 'crm_prepare_whatsapp_outbound')!.args.p_request as Record<string, unknown>;
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
    const { sb } = makeSupabase(baseTables(), (fn) => fn === 'crm_prepare_whatsapp_outbound' ? { error: { message: 'creditos_insuficientes' } } : { data: true });
    await expect(sendWhatsApp({ orgId: 7, customerId: 'cust-1', channelId: 'chan-1', text: 'hola' }, sb, sb, NOW)).rejects.toMatchObject({ code: 'NO_CREDITS', status: 402 });
  });

  test('fallo de ventana o preparación no permite publicar un mensaje', async () => {
    const read = makeSupabase(baseTables({ conversations: () => ({ error: { message: 'timeout' } }) }), rpcOk);
    await expect(sendWhatsApp({ orgId: 7, customerId: 'cust-1', channelId: 'chan-1', text: 'hola' }, read.sb, read.sb, NOW)).rejects.toMatchObject({ status: 500 });
    expect(read.rpcCalls.some((r) => r.fn === 'crm_prepare_whatsapp_outbound')).toBe(false);
    const empty = makeSupabase(baseTables(), (fn) => ({ data: fn === 'fn_can_contact' ? true : null }));
    await expect(sendWhatsApp({ orgId: 7, customerId: 'cust-1', channelId: 'chan-1', text: 'hola' }, empty.sb, empty.sb, NOW)).rejects.toMatchObject({ status: 500 });
    const wrong = makeSupabase(baseTables(), (fn) => ({ data: fn === 'fn_can_contact' ? true : { ...preparado, customer_id: 'otro' } }));
    await expect(sendWhatsApp({ orgId: 7, customerId: 'cust-1', channelId: 'chan-1', text: 'hola' }, wrong.sb, wrong.sb, NOW)).rejects.toMatchObject({ status: 500 });
  });

  test('el lote transmite su testigo privado y el envío manual no lo inventa', async () => {
    const h = makeSupabase(baseTables(), rpcOk);
    await sendWhatsApp({ orgId: 7, customerId: 'cust-1', channelId: 'chan-1', text: 'hola', source: 'campaign', campaignId: 'camp-1', campaignClaimToken: 'token-1', clientRequestId: 'campaign:camp-1:cust-1' }, h.sb, h.sb, NOW);
    expect(h.rpcCalls.find((r) => r.fn === 'crm_prepare_whatsapp_outbound')?.args.p_request).toMatchObject({ campaign_id: 'camp-1', campaign_claim_token: 'token-1' });
  });

  test('cliente de otra org → 404', async () => {
    const { sb } = makeSupabase(baseTables({ customers: () => ({ data: null }) }), rpcOk);
    await expect(sendWhatsApp({ orgId: 7, customerId: 'cust-x', channelId: 'chan-1', text: 'hola' }, sb, sb, NOW)).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 });
  });
});
