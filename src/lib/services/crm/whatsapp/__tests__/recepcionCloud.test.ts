import { receiveWhatsAppCloud } from '../recepcionCloudService';
import { makeSupabase, has, type TableResolver } from './mockSupabase';
import { fakeTable } from './fakeTable';
import type { WhatsAppWebhookMessage, WhatsAppWebhookContact } from '@/lib/services/integrations/whatsapp/whatsappCloudTypes';

jest.mock('@/lib/supabase/server-service', () => ({ getServiceClient: () => { throw new Error('cliente implícito prohibido'); } }));
const message = (from = '573109876543'): WhatsAppWebhookMessage => ({ id: 'wamid.fixture', from, timestamp: '1790840000', type: 'text', text: { body: 'START' } });
const result = { message_id: 'm-1', customer_id: 'c-1', conversation_id: 'q-1', duplicate: false, consent: 'opted_in', activity_id: 'a-1', campaign_id: null, opportunity_id: null, notified_user_id: null };
const contact = (wa_id: string, name: string): WhatsAppWebhookContact => ({ wa_id, profile: { name } });
const row = { id: 'c-1', organization_id: 7, phone: '+57 310 987 6543', status: 'active' };
const setup = (tables: Record<string, TableResolver> = {}, rpcResult: unknown = result) => makeSupabase({
  crm_inbound_message_receipts: () => ({ data: null }),
  provider_configs: () => ({ data: { settings: { default_country_code: '57' } } }),
  customer_channel_identities: () => ({ data: null }),
  customers: fakeTable([row]).resolver, ...tables,
}, () => ({ data: rpcResult }));

describe('recepción Cloud certificada', () => {
  test('cliente con separadores: prueba CAS y una sola RPC para todas las escrituras', async () => {
    const { sb, calls, rpcCalls } = setup();
    await expect(receiveWhatsAppCloud(7, 'ch-1', message(), undefined, { text: 'START' }, sb)).resolves.toEqual(result);
    expect(rpcCalls).toEqual([{ fn: 'crm_receive_whatsapp_cloud', args: { p_org: 7, p_channel: 'ch-1', p_request: {
      external_id: message().id, phone_digits: message().from, raw: message(), content: 'START', content_type: 'text', payload: { text: 'START' }, profile_name: message().from,
      customer_proof: { id: row.id, phone: row.phone, status: 'active', resolved_id: row.id, resolved_phone: row.phone, phone_matches: true },
    } } }]);
    expect(calls.every((c) => !c.ops.some((o) => ['insert', 'update', 'upsert', 'delete'].includes(o.method)))).toBe(true);
    expect(calls.every((c) => has(c.ops, 'eq', 'organization_id', 7))).toBe(true);
  });

  test('cada remitente toma su nombre de contacts por wa_id aunque el orden del lote cambie', async () => {
    const { sb, rpcCalls } = setup({ customers: () => ({ data: [] }) });
    await receiveWhatsAppCloud(7, 'ch-1', message(), [contact('14155550100', 'Otro'), contact(message().from, 'Correcto')], {}, sb);
    expect(rpcCalls[0].args.p_request).toMatchObject({ profile_name: 'Correcto', customer_proof: null });
  });

  test('el replay privado no depende del teléfono actual del cliente ni vuelve a buscarlo', async () => {
    const { sb, calls, rpcCalls } = setup({ crm_inbound_message_receipts: () => ({ data: { message_id: 'm-1' } }) }, { ...result, duplicate: true });
    await expect(receiveWhatsAppCloud(7, 'ch-1', message(), undefined, {}, sb)).resolves.toMatchObject({ duplicate: true });
    expect(calls.map((c) => c.table)).toEqual(['crm_inbound_message_receipts']);
    expect(rpcCalls[0].args.p_request).toMatchObject({ customer_proof: null });
    expect(calls[0].ops).toEqual(expect.arrayContaining([
      { method: 'eq', args: ['organization_id', 7] }, { method: 'eq', args: ['channel_id', 'ch-1'] }, { method: 'eq', args: ['provider_external_id', message().id] },
    ]));
  });

  test('una identidad archivada resuelve la fusión real y no autoriza el teléfono diferente del principal', async () => {
    const primary = { ...row, id: 'c-2', phone: '+573009999999' };
    const { sb, rpcCalls } = setup({ customers: fakeTable([{ ...row, status: 'merged' }, primary]).resolver,
      customer_merges: fakeTable([{ organization_id: 7, secondary_customer_id: row.id, primary_customer_id: primary.id, undone_at: null }]).resolver });
    await receiveWhatsAppCloud(7, 'ch-1', message(), undefined, {}, sb);
    expect(rpcCalls[0].args.p_request).toMatchObject({ customer_proof: {
      id: row.id, status: 'merged', resolved_id: primary.id, resolved_phone: primary.phone, phone_matches: false,
    } });
  });

  test('la identidad de un alias permite recibir una baja conservando el número real', async () => {
    const { sb, calls, rpcCalls } = setup({ customer_channel_identities: () => ({ data: { customer_id: row.id } }),
      customers: fakeTable([{ ...row, phone: '+573009999999' }]).resolver });
    await receiveWhatsAppCloud(7, 'ch-1', message(), undefined, {}, sb);
    expect(rpcCalls[0].args.p_request).toMatchObject({ phone_digits: message().from, customer_proof: { phone_matches: false } });
    const identity = calls.find((c) => c.table === 'customer_channel_identities');
    expect(identity?.ops).toEqual(expect.arrayContaining([{ method: 'eq', args: ['identity_type', 'whatsapp_phone'] }, { method: 'eq', args: ['channel_id', 'ch-1'] }]));
    expect(calls.filter((c) => c.table === 'customers')).toHaveLength(1);
  });

  test.each(['3109876543', '4155550100', 'abc', '', '+573109876543'])('remitente fuera del protocolo %p falla antes de consultar o crear', async (phone) => {
    const { sb, calls, rpcCalls } = setup();
    await expect(receiveWhatsAppCloud(7, 'ch-1', message(phone), undefined, {}, sb)).rejects.toMatchObject({ status: 400 });
    expect(calls).toHaveLength(0); expect(rpcCalls).toHaveLength(0);
  });

  test.each(['573109876543', '14155550100'])('conserva el indicativo internacional del proveedor %p', async (phone) => {
    const { sb, rpcCalls } = setup({ customers: () => ({ data: [] }) });
    await receiveWhatsAppCloud(7, 'ch-1', message(phone), undefined, {}, sb);
    expect(rpcCalls[0].args.p_request).toMatchObject({ phone_digits: phone, customer_proof: null });
  });

  test.each(['crm_inbound_message_receipts', 'provider_configs', 'customer_channel_identities', 'customers'])('fallo en %s impide crear cualquier registro', async (table) => {
    const { sb, rpcCalls } = setup({ [table]: () => ({ error: { message: 'fallo lectura' } }) });
    await expect(receiveWhatsAppCloud(7, 'ch-1', message(), undefined, {}, sb)).rejects.toThrow('fallo lectura');
    expect(rpcCalls).toHaveLength(0);
  });

  test('una fusión sin principal propio falla en lugar de crear un cliente nuevo', async () => {
    const { sb, rpcCalls } = setup({ customers: fakeTable([{ ...row, status: 'merged' }]).resolver, customer_merges: () => ({ data: null }) });
    await expect(receiveWhatsAppCloud(7, 'ch-1', message(), undefined, {}, sb)).rejects.toMatchObject({ status: 409 });
    expect(rpcCalls).toHaveLength(0);
  });

  test.each(['40001', 'P0001'])('el error SQL %s se propaga para que el webhook pueda reintentarse', async code => {
    const mock = setup();
    mock.sb.rpc = jest.fn(async () => ({ data: null, error: { code, message: 'cliente_entrante_cambio' } })) as unknown as typeof mock.sb.rpc;
    await expect(receiveWhatsAppCloud(7, 'ch-1', message(), undefined, {}, mock.sb)).rejects.toThrow();
  });

  test.each([null, {}, { ...result, duplicate: undefined }, { ...result, activity_id: null }, { ...result, consent: 'yes' }])('una respuesta incompleta %p no confirma recepción', async (value) => {
    const { sb } = setup({}, value);
    await expect(receiveWhatsAppCloud(7, 'ch-1', message(), undefined, {}, sb)).rejects.toMatchObject({ status: 500 });
  });
});
