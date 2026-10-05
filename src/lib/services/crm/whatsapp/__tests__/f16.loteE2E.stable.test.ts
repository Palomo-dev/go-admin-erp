/** Orquestación con reloj y proveedor doblados; transacciones reales probadas por MCP (migraciones 23–25). */
import { runCampaignBatch } from '../campaignBatch';
import { CAMP, NOW, campaign, contact, prepared, harness, writes } from './batchHarness';

jest.mock('@/lib/supabase/server-service', () => ({ getServiceClient: () => { throw new Error('sin cliente implícito'); } }));

test('respeta throttle y libera el resto al agotarse el presupuesto sin declarar enviado', async () => {
  let clock = NOW;
  const h = harness({ rows: [contact(), contact('cc-2')] });
  const send = jest.fn(async (input: Parameters<typeof prepared>[0]) => { const r = prepared(input); clock += 20; return r; });
  const sleep = jest.fn(async (ms: number) => { clock += ms; });
  const r = await runCampaignBatch({ campaign_id: CAMP, batch_no: 2 }, h.sb, { expectedOrgId: 7, now: () => clock, send, sleep, deadlineMs: 40 });
  expect(r).toMatchObject({ claimed: 2, prepared: 1, sent: 0, next_batch_no: 2 });
  expect(send).toHaveBeenCalledTimes(1);
  expect(h.rpcCalls.filter((c) => c.fn === 'crm_finish_campaign_contact').map((c) => c.args.p_action)).toEqual(['prepared', 'release']);
  expect(h.rpcCalls.find((c) => c.args.p_action === 'release')?.args).toMatchObject({ p_contact: 'cc-2', p_token: 'token-cc-2', p_reason: 'batch_interrupted' });
  expect(writes(h)).toHaveLength(0);
});

test('espera global entre preparaciones; sigue sin contabilizar entrega', async () => {
  let clock = NOW;
  const waits: number[] = [];
  const h = harness({ rows: [contact(), contact('cc-2')] });
  const send = jest.fn(prepared);
  const r = await runCampaignBatch({ campaign_id: CAMP }, h.sb, { expectedOrgId: 7, now: () => clock, send, sleep: async (ms) => { waits.push(ms); clock += ms; } });
  expect(r).toMatchObject({ prepared: 2, sent: 0 });
  expect(waits).toEqual([50]);
});

test('abort durante la espera no inicia el envío y libera con token', async () => {
  const controller = new AbortController();
  const h = harness({ recent: [{ id: 'msg-recent', created_at: new Date(NOW - 1000).toISOString(), metadata: { to: '573100000001' } }] });
  const send = jest.fn(prepared);
  const sleep = jest.fn(async () => { controller.abort(); });
  await runCampaignBatch({ campaign_id: CAMP }, h.sb, { expectedOrgId: 7, now: () => NOW, send, sleep, signal: controller.signal });
  expect(sleep).toHaveBeenCalledWith(5000);
  expect(send).not.toHaveBeenCalled();
  expect(h.rpcCalls.find((c) => c.fn === 'crm_finish_campaign_contact')?.args.p_action).toBe('release');
});

test('abort antes del claim no genera ningún efecto', async () => {
  const controller = new AbortController(); controller.abort();
  const h = harness();
  await expect(runCampaignBatch({ campaign_id: CAMP }, h.sb, { expectedOrgId: 7, now: () => NOW, signal: controller.signal })).rejects.toMatchObject({ code: 'INTERNAL' });
  expect(h.rpcCalls).toHaveLength(0);
});

test('campaña futura programa el siguiente trabajo por RPC; no deduplica contra el job que termina', async () => {
  const at = new Date(NOW + 3600_000).toISOString();
  const h = harness({ campaign: { ...campaign, status: 'scheduled', scheduled_at: at } as typeof campaign });
  const send = jest.fn(prepared);
  await runCampaignBatch({ campaign_id: CAMP, batch_no: 2 }, h.sb, { expectedOrgId: 7, now: () => NOW, send });
  expect(h.rpcCalls).toEqual([{ fn: 'crm_campaign_batch_progress', args: { p_org: 7, p_campaign: CAMP, p_batch: 2, p_not_before: at } }]);
  expect(send).not.toHaveBeenCalled();
});

test('el ajuste antiguo respect_allowed_hours=false no permite saltar el horario', async () => {
  const h = harness({ campaign: { ...campaign, statistics: { ...campaign.statistics, respect_allowed_hours: false } } as typeof campaign,
    settings: { allowed_hours: { tz: 'UTC', days: [1], from: '08:00', to: '09:00' } } });
  const send = jest.fn(prepared);
  await runCampaignBatch({ campaign_id: CAMP }, h.sb, { expectedOrgId: 7, now: () => NOW, send });
  expect(h.rpcCalls.map((c) => c.fn)).toEqual(['crm_campaign_batch_progress']);
  expect(send).not.toHaveBeenCalled();
  expect(Date.parse(String(h.rpcCalls[0].args.p_not_before))).toBeGreaterThan(NOW);
});

test('un lote sin contactos no se considera completo mientras SQL espera al proveedor', async () => {
  const h = harness({ rows: [], progress: { finished: false, next_batch_no: 4, counts: { pending: 0, queued: 1, sent: 0 } } });
  const send = jest.fn(prepared);
  expect(await runCampaignBatch({ campaign_id: CAMP, batch_no: 3 }, h.sb, { expectedOrgId: 7, now: () => NOW, send })).toMatchObject({ claimed: 0, sent: 0, finished: false, next_batch_no: 4 });
  expect(send).not.toHaveBeenCalled();
});

test('timeout después del commit conserva queued y no se cuenta como reintento liberado', async () => {
  const h = harness({ rpc: (fn) => fn === 'crm_finish_campaign_contact' ? { data: { applied: false, reason: 'message_already_prepared', state: 'queued' } } : undefined });
  const send = jest.fn(async () => { throw new Error('respuesta perdida tras el commit'); });
  expect(await runCampaignBatch({ campaign_id: CAMP }, h.sb, { expectedOrgId: 7, now: () => NOW, send })).toMatchObject({ sent: 0, requeued: 0, finished: false });
  expect(send).toHaveBeenCalledTimes(1);
  expect(writes(h)).toHaveLength(0);
});

test('pausa por conciliación devuelta por SQL queda visible en el resultado', async () => {
  const h = harness({ rows: [], progress: { finished: false, reason: 'paused_dispatch_reconciliation_required' } });
  expect(await runCampaignBatch({ campaign_id: CAMP }, h.sb, { expectedOrgId: 7, now: () => NOW })).toMatchObject({ sent: 0, finished: false, reason: 'paused_dispatch_reconciliation_required' });
});
