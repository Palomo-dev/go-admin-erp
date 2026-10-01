import type { WhatsAppWebhookMessage, WhatsAppWebhookValue } from '@/lib/services/integrations/whatsapp/whatsappCloudTypes';
import { handleWhatsAppInbound } from '../inboundService';
import { makeSupabase, has, type TableResolver } from './mockSupabase';

jest.mock('@/lib/supabase/server-service', () => ({ getServiceClient: () => { throw new Error('Cliente no inyectado'); } }));

const input = { orgId: 7, channelId: 'channel-fixture', conversationId: 'conversation-fixture', customerId: 'customer-fixture', messageId: 'message-fixture', text: 'No se confía en este texto', contentType: 'text' };
const saved = { consent: 'opted_out', campaign_id: 'campaign-fixture', opportunity_id: null, activity_id: 'activity-fixture', notified_user_id: null };

test('transmite solo contexto al postprocesado y devuelve el resultado privado', async () => {
  const mock = makeSupabase({}, () => ({ data: saved }));
  await expect(handleWhatsAppInbound(input, mock.sb)).resolves.toEqual(saved);
  expect(mock.rpcCalls).toEqual([{ fn: 'crm_process_whatsapp_inbound', args: { p_org: 7, p_message: input.messageId, p_channel: input.channelId, p_conversation: input.conversationId, p_customer: input.customerId } }]);
  expect(mock.calls).toEqual([]);
});

test('repetición conserva el resultado sin publicar actividad o notificación desde Node', async () => {
  const mock = makeSupabase({}, () => ({ data: { ...saved, already_applied: true } }));
  await expect(handleWhatsAppInbound({ ...input, text: 'START' }, mock.sb)).resolves.toMatchObject({ ...saved, already_applied: true });
  expect(mock.calls).toEqual([]);
});

test.each([
  { data: null }, { data: {} }, { data: { ...saved, activity_id: null } },
  { data: { ...saved, consent: 'unknown' } }, { data: { ...saved, campaign_id: 5 } },
  { error: { message: 'Fixture fallo transaccional' } },
])('falla de persistencia o respuesta inválida se propaga', async (response) => {
  const mock = makeSupabase({}, () => response);
  await expect(handleWhatsAppInbound(input, mock.sb)).rejects.toMatchObject({ status: 500 });
});

test('Cloud usa el recibo privado antes de buscar clientes y deja el replay a SQL', async () => {
  const { whatsappCloudService } = await import('@/lib/services/integrations/whatsapp/whatsappCloudService');
  const cloud = whatsappCloudService as unknown as { processIncomingMessage: (s: unknown, channel: string, org: number, message: WhatsAppWebhookMessage, value: WhatsAppWebhookValue) => Promise<void> };
  const message = { id: 'wamid.fixture', from: '12025550198', timestamp: '1790830000', type: 'text', text: { body: 'STOP' } } as WhatsAppWebhookMessage;
  const value = { messaging_product: 'whatsapp' } as WhatsAppWebhookValue;
  const mock = makeSupabase({
    crm_inbound_message_receipts: (ops) => {
      expect(has(ops, 'eq', 'organization_id', 7)).toBe(true);
      expect(has(ops, 'eq', 'channel_id', input.channelId)).toBe(true);
      expect(has(ops, 'eq', 'provider_external_id', message.id)).toBe(true);
      return { data: { message_id: input.messageId } };
    },
  }, () => ({ data: { ...saved, message_id: input.messageId, customer_id: input.customerId, conversation_id: input.conversationId, duplicate: true } }));
  await cloud.processIncomingMessage(mock.sb, input.channelId, 7, message, value);
  expect(mock.rpcCalls[0].fn).toBe('crm_receive_whatsapp_cloud');
  expect(mock.rpcCalls[0].args).toMatchObject({ p_org: 7, p_channel: input.channelId, p_request: { customer_proof: null, external_id: message.id, raw: message } });
  expect(mock.calls.every((call) => !has(call.ops, 'insert') && !has(call.ops, 'update'))).toBe(true);
  const failed = makeSupabase({ crm_inbound_message_receipts: () => ({ data: { message_id: input.messageId } }) }, () => ({ error: { message: 'Fixture fallo' } }));
  await expect(cloud.processIncomingMessage(failed.sb, input.channelId, 7, message, value)).rejects.toMatchObject({ code: 'INBOUND_NOT_PERSISTED' });
});

test('Cloud falla antes de mutar si la búsqueda del mensaje o contexto no responde', async () => {
  const { whatsappCloudService } = await import('@/lib/services/integrations/whatsapp/whatsappCloudService');
  const cloud = whatsappCloudService as unknown as { processIncomingMessage: (s: unknown, channel: string, org: number, message: WhatsAppWebhookMessage, value: WhatsAppWebhookValue) => Promise<void> };
  const message = { id: 'wamid.fixture', from: '12025550198', timestamp: '1790830000', type: 'text', text: { body: 'STOP' } } as WhatsAppWebhookMessage;
  const scenarios: Array<Record<string, TableResolver>> = [
    { crm_inbound_message_receipts: () => ({ error: { message: 'Fixture lectura fallida' } }) },
    { crm_inbound_message_receipts: () => ({ data: null }), provider_configs: () => ({ error: { message: 'Fixture configuración fallida' } }) },
  ];
  for (const tables of scenarios) {
    const mock = makeSupabase(tables);
    await expect(cloud.processIncomingMessage(mock.sb, input.channelId, 7, message, { messaging_product: 'whatsapp' } as WhatsAppWebhookValue)).rejects.toMatchObject({ code: 'INBOUND_NOT_PERSISTED' });
    expect(mock.rpcCalls).toEqual([]);
    expect(mock.calls.every((call) => !has(call.ops, 'insert') && !has(call.ops, 'update'))).toBe(true);
  }
});
