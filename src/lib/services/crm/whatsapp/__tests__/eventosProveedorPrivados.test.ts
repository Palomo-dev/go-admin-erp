import type { WhatsAppWebhookStatus } from '@/lib/services/integrations/whatsapp/whatsappCloudTypes';
import { recordWhatsAppProviderStatus, syncCampaignProviderReceipts } from '../campaignEvents';
import { getUnitCost } from '@/lib/services/crm/pricingService';
import { makeSupabase } from './mockSupabase';

jest.mock('@/lib/services/crm/pricingService', () => ({ getUnitCost: jest.fn() }));
jest.mock('@/lib/supabase/server-service', () => ({ getServiceClient: () => { throw new Error('Cliente no inyectado'); } }));

const status: WhatsAppWebhookStatus = {
  id: 'wamid.fixture', status: 'delivered', timestamp: '1790830000', recipient_id: '573109876543',
  pricing: { billable: true, pricing_model: 'PMP', category: 'utility' },
};
const saved = { receipt_id: 'receipt-fixture', applied: true, pending: false, state: 'delivered' };
const pricing = jest.mocked(getUnitCost);

beforeEach(() => { pricing.mockReset(); pricing.mockResolvedValue(0.003); });

test('conserva todo el evento firmado y el ámbito autorizado en una sola RPC', async () => {
  const mock = makeSupabase({}, () => ({ data: saved }));
  await expect(recordWhatsAppProviderStatus(7, 'channel-fixture', status, mock.sb)).resolves.toEqual(saved);
  expect(mock.rpcCalls).toEqual([{ fn: 'crm_record_provider_status', args: { p_org: 7, p_channel: 'channel-fixture', p_status: status, p_unit_cost: 0.003 } }]);
  expect(mock.calls).toEqual([]);
  expect(pricing).toHaveBeenCalledWith('meta', 'wa_utility_co');
});

test('callback temprano queda pendiente; replay conserva la respuesta privada', async () => {
  for (const result of [{ ...saved, applied: false, pending: true }, { ...saved, already_applied: true }]) {
    const mock = makeSupabase({}, () => ({ data: result }));
    await expect(recordWhatsAppProviderStatus(7, 'channel-fixture', status, mock.sb)).resolves.toEqual(result);
    expect(mock.calls).toEqual([]);
  }
});

test.each([
  ['mx', '5215512345678', 'marketing'], ['us', '12025550198', 'utility'], ['co', '573109876543', 'authentication'],
])('tarifa configurada de %s/%s/%s, sin cambiar categoría ni inventar país', async (country, recipient, category) => {
  const mock = makeSupabase({}, () => ({ data: saved }));
  await recordWhatsAppProviderStatus(7, 'channel-fixture', { ...status, recipient_id: recipient, pricing: { ...status.pricing!, category } }, mock.sb);
  expect(pricing).toHaveBeenCalledWith('meta', `wa_${category}_${country}`);
});

test.each([
  { ...status, recipient_id: '442012345678' },
  { ...status, pricing: { ...status.pricing!, category: 'unknown' } },
  { ...status, pricing: undefined },
  { ...status, status: 'failed' as const },
])('costo desconocido permanece null', async (input) => {
  const mock = makeSupabase({}, () => ({ data: saved }));
  await recordWhatsAppProviderStatus(7, 'channel-fixture', input, mock.sb);
  expect(mock.rpcCalls[0].args.p_unit_cost).toBeNull();
  expect(pricing).not.toHaveBeenCalled();
});

test('billable=false publica cero; precio inexistente o inválido no publica cero', async () => {
  const mock = makeSupabase({}, () => ({ data: saved }));
  await recordWhatsAppProviderStatus(7, 'channel-fixture', { ...status, pricing: { ...status.pricing!, billable: false } }, mock.sb);
  expect(mock.rpcCalls[0].args.p_unit_cost).toBe(0);
  expect(pricing).not.toHaveBeenCalled();
  for (const value of [null, NaN, Infinity, -1]) {
    pricing.mockResolvedValue(value);
    await recordWhatsAppProviderStatus(7, 'channel-fixture', status, mock.sb);
    expect(mock.rpcCalls.at(-1)?.args.p_unit_cost).toBeNull();
  }
});

test.each([{ data: null }, { data: {} }, { data: null, error: { message: 'Fixture fallo de persistencia' } }])('error o respuesta inválida se propaga para reintentar el webhook', async (response) => {
  const mock = makeSupabase({}, () => response);
  await expect(recordWhatsAppProviderStatus(7, 'channel-fixture', status, mock.sb)).rejects.toMatchObject({ status: 500 });
});

test('respaldo aplica solo constancias privadas propias sin escanear contactos/eventos', async () => {
  const mock = makeSupabase({}, () => ({ data: 2405 }));
  await expect(syncCampaignProviderReceipts(7, 'campaign-fixture', mock.sb)).resolves.toBe(2405);
  expect(mock.rpcCalls).toEqual([{ fn: 'crm_reconcile_provider_status', args: { p_org: 7, p_message: null, p_campaign: 'campaign-fixture' } }]);
  expect(mock.calls).toEqual([]);
});

test.each([{ data: null }, { data: -1 }, { data: '1' }, { data: 1.5 }, { error: { message: 'Fixture lectura fallida' } }])('respaldo no oculta falla ni acepta recuentos inválidos', async (response) => {
  const mock = makeSupabase({}, () => response);
  await expect(syncCampaignProviderReceipts(7, 'campaign-fixture', mock.sb)).rejects.toMatchObject({ status: 500 });
});

test('Cloud entrega el canal autorizado y propaga falla de persistencia', async () => {
  const { whatsappCloudService } = await import('@/lib/services/integrations/whatsapp/whatsappCloudService');
  const cloud = whatsappCloudService as unknown as { processStatusUpdate: (s: unknown, org: number, channel: string, input: WhatsAppWebhookStatus) => Promise<void> };
  const mock = makeSupabase({}, () => ({ data: saved }));
  await cloud.processStatusUpdate(mock.sb, 7, 'channel-fixture', status);
  expect(mock.rpcCalls[0].args).toMatchObject({ p_org: 7, p_channel: 'channel-fixture', p_status: status });
  const failed = makeSupabase({}, () => ({ error: { message: 'Fixture fallo' } }));
  await expect(cloud.processStatusUpdate(failed.sb, 7, 'channel-fixture', status)).rejects.toMatchObject({ status: 500 });
});
