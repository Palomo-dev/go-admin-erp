/** Contrato del consumidor SQL de lotes; sustituyó los UPDATE/CAS desde Node. */
import { runCampaignBatch } from '../campaignBatch';
import { WhatsAppError } from '../types';
import { CAMP, NOW, campaign, contact, prepared, harness, writes } from './batchHarness';

jest.mock('@/lib/supabase/server-service', () => ({ getServiceClient: () => { throw new Error('sin cliente implícito'); } }));
const deps = () => ({ expectedOrgId: 7, now: () => NOW, sleep: async () => undefined, send: jest.fn(prepared) });

test('la organización del job es obligatoria antes de leer', async () => {
  const h = harness();
  await expect(runCampaignBatch({ campaign_id: CAMP }, h.sb)).rejects.toMatchObject({ code: 'VALIDATION' });
  expect(h.calls).toHaveLength(0);
});

test('una campaña ajena no aparece ni permite reservar contactos', async () => {
  const h = harness({ campaign: null });
  const d = deps();
  expect(await runCampaignBatch({ campaign_id: CAMP }, h.sb, d)).toMatchObject({ reason: 'campaign_not_found', claimed: 0 });
  expect(h.calls[0].ops).toEqual(expect.arrayContaining([{ method: 'eq', args: ['organization_id', 7] }]));
  expect(h.rpcCalls).toHaveLength(0);
  expect(d.send).not.toHaveBeenCalled();
});

test('campaña pausada no reserva ni envía', async () => {
  const h = harness({ campaign: { ...campaign, statistics: { ...campaign.statistics, state: 'paused' } } as typeof campaign });
  expect(await runCampaignBatch({ campaign_id: CAMP }, h.sb, deps())).toMatchObject({ reason: 'status_paused', claimed: 0 });
  expect(h.rpcCalls).toHaveLength(0);
});

test('publicar conserva sent en cero; SQL decide recuento y próximo job', async () => {
  const h = harness();
  const d = deps();
  expect(await runCampaignBatch({ campaign_id: CAMP, batch_no: 3 }, h.sb, d)).toMatchObject({ claimed: 1, prepared: 1, sent: 0, finished: false, next_batch_no: 2 });
  expect(h.rpcCalls.map((r) => r.fn)).toEqual(['crm_claim_campaign_batch', 'crm_finish_campaign_contact', 'crm_campaign_batch_progress']);
  expect(h.rpcCalls[0].args).toEqual({ p_org: 7, p_campaign: CAMP, p_batch: 3, p_limit: 50 });
  expect(h.rpcCalls[1].args).toMatchObject({ p_org: 7, p_campaign: CAMP, p_contact: 'cc-1', p_token: 'token-cc-1', p_action: 'prepared' });
  expect(d.send.mock.calls[0][0]).toMatchObject({ orgId: 7, source: 'campaign', campaignId: CAMP, campaignClaimToken: 'token-cc-1', force: false, clientRequestId: `campaign:${CAMP}:cust-cc-1` });
  expect(writes(h)).toHaveLength(0);
  expect(h.rpcCalls.some((r) => ['deduct_comm_credits', 'fn_campaign_mark_sent'].includes(r.fn))).toBe(false);
});

it.each([['OPTED_OUT', 'skip', 'opted_out'], ['NO_CREDITS', 'pause', 'no_credits'], ['WINDOW_CLOSED', 'skip', 'window_required']] as const)('%s usa resultado privado %s con el testigo actual', async (code, action, reason) => {
  const h = harness();
  const d = { ...deps(), send: jest.fn(async () => { throw new WhatsAppError(code); }) };
  await runCampaignBatch({ campaign_id: CAMP }, h.sb, d);
  expect(h.rpcCalls.find((r) => r.fn === 'crm_finish_campaign_contact')?.args).toMatchObject({ p_action: action, p_reason: reason, p_token: 'token-cc-1' });
  expect(writes(h)).toHaveLength(0);
});

test('callback que perdió el testigo no se cuenta como omisión nueva', async () => {
  const h = harness({ rpc: (fn) => fn === 'crm_finish_campaign_contact' ? { data: { applied: false, reason: 'stale_claim' } } : undefined });
  const d = { ...deps(), send: jest.fn(async () => { throw new WhatsAppError('OPTED_OUT'); }) };
  expect(await runCampaignBatch({ campaign_id: CAMP }, h.sb, d)).toMatchObject({ skipped: 0 });
});

test('fallo de preparación programa backoff por RPC sin publicar otro mensaje', async () => {
  const h = harness();
  const d = { ...deps(), send: jest.fn(async () => { throw new Error('timeout'); }) };
  expect(await runCampaignBatch({ campaign_id: CAMP }, h.sb, d)).toMatchObject({ requeued: 1 });
  expect(h.rpcCalls.find((r) => r.fn === 'crm_finish_campaign_contact')?.args).toMatchObject({ p_action: 'release', p_retry_at: new Date(NOW + 60_000).toISOString() });
});

test('fallo de RPC tras preparar se propaga: no se emite release ni otro envío', async () => {
  const h = harness({ rpc: (fn) => fn === 'crm_finish_campaign_contact' ? { error: { message: 'timeout resultado' } } : undefined });
  const d = deps();
  await expect(runCampaignBatch({ campaign_id: CAMP }, h.sb, d)).rejects.toThrow('timeout resultado');
  expect(d.send).toHaveBeenCalledTimes(1);
  expect(h.rpcCalls.filter((r) => r.fn === 'crm_finish_campaign_contact')).toHaveLength(1);
});

test('respuesta de claim discordante no llega al envío', async () => {
  const h = harness({ rpc: (fn) => fn === 'crm_claim_campaign_batch' ? { data: { campaign: { ...campaign, organization_id: 8 }, rows: [contact()] } } : undefined });
  const d = deps();
  await expect(runCampaignBatch({ campaign_id: CAMP }, h.sb, d)).rejects.toMatchObject({ code: 'INTERNAL' });
  expect(d.send).not.toHaveBeenCalled();
});

test('fallo de lectura o de claim impide enviar', async () => {
  const h = harness({ rpc: (fn) => fn === 'crm_claim_campaign_batch' ? { error: { message: 'timeout claim' } } : undefined });
  const d = deps();
  await expect(runCampaignBatch({ campaign_id: CAMP }, h.sb, d)).rejects.toThrow('timeout claim');
  expect(d.send).not.toHaveBeenCalled();
});
