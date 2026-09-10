import { planDelay, classifySendError, runCampaignBatch, PER_RECIPIENT_MIN_MS } from '../campaignBatch';
import { providerErrorAction, applyMessageEventToCampaign } from '../campaignEvents';
import { countContacts } from '../campaignService';
import { WhatsAppError, type CampaignContactMeta } from '../types';
import { makeSupabase, has, opArg } from './mockSupabase';

jest.mock('@/lib/supabase/server-service', () => ({ getServiceClient: () => { throw new Error('no service client en tests'); } }));
jest.mock('@/lib/services/crm/pricingService', () => ({ getUnitCost: jest.fn(async () => 0.0008) }));
const enqueueJob = jest.fn(async () => 'job-next');
jest.mock('@/lib/jobs/enqueue', () => ({ enqueueJob: (...a: unknown[]) => enqueueJob(...(a as [])) }));

describe('planDelay (throttle global ≤80 mps y 1 msg / 6 s por wa_id)', () => {
  test('respeta 1000/throttle_mps entre envíos', () => {
    expect(planDelay({ now: 1000, lastGlobalAt: 950, throttleMps: 10, lastToRecipientAt: null })).toBe(50);
    expect(planDelay({ now: 1000, lastGlobalAt: 800, throttleMps: 10, lastToRecipientAt: null })).toBe(0);
  });
  test('nunca supera 80 mps aunque se pida más', () => {
    expect(planDelay({ now: 1000, lastGlobalAt: 995, throttleMps: 500, lastToRecipientAt: null })).toBe(8);
  });
  test('mismo destinatario en menos de 6 s espera el resto', () => {
    expect(planDelay({ now: 10_000, lastGlobalAt: null, throttleMps: 80, lastToRecipientAt: 6_000 })).toBe(PER_RECIPIENT_MIN_MS - 4_000);
  });
});

describe('classifySendError / providerErrorAction', () => {
  test('422 de negocio → skip con razón; 402 → pause; desconocido reintenta hasta 3', () => {
    expect(classifySendError(new WhatsAppError('OPTED_OUT'), 1)).toEqual({ action: 'skip', reason: 'opted_out' });
    expect(classifySendError(new WhatsAppError('WINDOW_CLOSED'), 1)).toEqual({ action: 'skip', reason: 'window_required' });
    expect(classifySendError(new WhatsAppError('NO_CREDITS'), 1)).toEqual({ action: 'pause', reason: 'no_credits' });
    expect(classifySendError(new Error('boom'), 1)).toEqual({ action: 'retry', afterMs: 60_000 });
    expect(classifySendError(new Error('boom'), 3)).toMatchObject({ action: 'fail', code: 'INTERNAL' });
  });
  test('131049 → skipped rate_limited_24h (sin reintento); 131056 → +6 s; 130429 → +30 s', () => {
    expect(providerErrorAction('131049')).toEqual({ state: 'skipped', skipped_reason: 'rate_limited_24h' });
    expect(providerErrorAction('131056')).toEqual({ state: 'pending', retry_after_ms: 6000 });
    expect(providerErrorAction('130429')).toEqual({ state: 'pending', retry_after_ms: 30000 });
    expect(providerErrorAction('131026')).toEqual({ state: 'failed' });
  });
});

describe('applyMessageEventToCampaign', () => {
  test('failed 131049 → contacto skipped:rate_limited_24h, error_summary y evidencia en consents', async () => {
    const updates: Array<{ table: string; row: Record<string, unknown> }> = [];
    const { sb } = makeSupabase({
      campaign_contacts: (ops) => {
        if (has(ops, 'update')) { updates.push({ table: 'campaign_contacts', row: opArg(ops, 'update')! }); return { data: null }; }
        return { data: { id: 'cc-1', campaign_id: 'camp-1', customer_id: 'cust-1', state: 'sent', metadata: { state: 'sent', message_id: 'msg-1', attempts: 1 }, replied_at: null } };
      },
      contact_consents: (ops) => (has(ops, 'update') ? (updates.push({ table: 'contact_consents', row: opArg(ops, 'update')! }), { data: null }) : { data: { id: 'cs-1', evidence: {} } }),
      campaigns: (ops) => (has(ops, 'update') ? (updates.push({ table: 'campaigns', row: opArg(ops, 'update')! }), { data: null }) : { data: { statistics: { error_summary: { '131049': 2 } } } }),
    });
    const r = await applyMessageEventToCampaign({ message_id: 'msg-1', event_type: 'failed', error_code: '131049', error_message: 'Marketing limit' }, sb);
    expect(r).toEqual({ applied: true, state: 'skipped' });
    const cc = updates.find((u) => u.table === 'campaign_contacts')!.row;
    expect(cc.state).toBeNull();
    expect((cc.metadata as CampaignContactMeta)).toMatchObject({ state: 'skipped', skipped_reason: 'rate_limited_24h', error_code: '131049' });
    expect((updates.find((u) => u.table === 'contact_consents')!.row.evidence as Record<string, unknown>).meta_131049_until).toBeDefined();
    expect((updates.find((u) => u.table === 'campaigns')!.row.statistics as { error_summary: Record<string, number> }).error_summary['131049']).toBe(3);
  });

  test('delivered con pricing billable → delivered_at + cost_amount; read es monótono', async () => {
    let meta: CampaignContactMeta = { state: 'read', message_id: 'msg-1' };
    const { sb } = makeSupabase({
      campaign_contacts: (ops) => {
        if (has(ops, 'update')) { meta = (opArg<Record<string, unknown>>(ops, 'update')!.metadata as CampaignContactMeta); return { data: null }; }
        return { data: { id: 'cc-1', campaign_id: 'camp-1', customer_id: 'cust-1', state: 'sent', metadata: meta, replied_at: null } };
      },
    });
    await applyMessageEventToCampaign({ message_id: 'msg-1', event_type: 'delivered', provider_payload: { pricing: { billable: true, category: 'utility' }, recipient_id: '5731' } }, sb);
    expect(meta.state).toBe('read');
    expect(meta.cost_amount).toBe(0.0008);
    expect(meta.delivered_at).toBeDefined();
  });
});

describe('runCampaignBatch', () => {
  const contacts: Array<{ id: string; customer_id: string; state: null; metadata: CampaignContactMeta }> = [
    { id: 'cc-1', customer_id: 'c1', state: null, metadata: { state: 'pending', recipient: '573100000001', opportunity_id: 'o1', attempts: 0 } },
    { id: 'cc-2', customer_id: 'c2', state: null, metadata: { state: 'pending', recipient: '573100000002', attempts: 0 } },
    { id: 'cc-3', customer_id: 'c3', state: null, metadata: { state: 'pending', recipient: '573100000003', attempts: 0 } },
  ];
  const campaign = { id: 'camp-1', organization_id: 7, name: 'Test', channel: 'whatsapp', status: 'sending', scheduled_at: null, template_id: 'tpl-1', segment_id: null, content: null, statistics: { throttle_mps: 20, channel_id: 'chan-1', purpose: 'utility', respect_allowed_hours: false, next_batch_no: 1, default_variables: { fecha: 'hoy' } }, created_by: 'u-1', created_at: '', updated_at: '' };

  function setup(states: Record<string, CampaignContactMeta>, canContact: (id: string) => boolean = () => true) {
    const metas: Record<string, CampaignContactMeta> = { ...states };
    const mock = makeSupabase({
      campaigns: (ops) => (has(ops, 'update') ? { data: { ...campaign, statistics: opArg<Record<string, unknown>>(ops, 'update')!.statistics, status: (opArg<Record<string, unknown>>(ops, 'update')!.status as string) ?? campaign.status } } : { data: campaign }),
      campaign_contacts: (ops) => {
        if (has(ops, 'update')) {
          const id = ops.find((o) => o.method === 'eq' && o.args[0] === 'id')?.args[1] as string;
          metas[id] = opArg<Record<string, unknown>>(ops, 'update')!.metadata as CampaignContactMeta;
          return { data: { id } };
        }
        if (has(ops, 'not')) return { data: [] }; // syncCampaignFromEvents
        return { data: contacts.map((c) => ({ ...c, metadata: metas[c.id] })) };
      },
      provider_configs: () => ({ data: null }),
      messages: () => ({ data: [] }),
    }, (fn, args) => ({ data: fn === 'fn_can_contact' ? canContact(String(args.p_customer)) : null }));
    return { ...mock, metas };
  }

  test('envía ≤50 con throttle, marca sent (fn_campaign_mark_sent) y cierra la campaña en sent cuando no quedan pendientes', async () => {
    const { sb, metas, rpcCalls, calls } = setup(Object.fromEntries(contacts.map((c) => [c.id, c.metadata])));
    const send = jest.fn(async (input: { customerId?: string | null; template?: { variables?: Record<string, unknown> } | null }) => ({ message_id: `msg-${input.customerId}`, conversation_id: 'conv', activity_id: null, customer_id: input.customerId!, channel_id: 'chan-1', scheduled: false }));
    const sleeps: number[] = [];
    let t = 1_000_000;
    const r = await runCampaignBatch({ campaign_id: 'camp-1', batch_no: 1 }, sb, { send, sleep: async (ms) => { sleeps.push(ms); t += ms; }, now: () => (t += 5) });
    expect(r).toMatchObject({ claimed: 3, sent: 3, skipped: 0, failed: 0, finished: true, reason: 'completed' });
    expect(send).toHaveBeenCalledTimes(3);
    expect(send.mock.calls[0][0]).toMatchObject({ orgId: 7, channelId: 'chan-1', customerId: 'c1', opportunityId: 'o1', source: 'campaign', campaignId: 'camp-1', force: true, template: { templateId: 'tpl-1', variables: { fecha: 'hoy' } } });
    expect(rpcCalls.filter((c) => c.fn === 'fn_campaign_mark_sent')).toHaveLength(3);
    expect(metas['cc-2']).toMatchObject({ state: 'sent', message_id: 'msg-c2', batch_no: 1, attempts: 1 });
    // 20 mps → ≥50 ms entre envíos consecutivos
    expect(sleeps.length).toBeGreaterThanOrEqual(2);
    expect(Math.min(...sleeps)).toBeGreaterThanOrEqual(30);
    const closing = calls.filter((c) => c.table === 'campaigns' && has(c.ops, 'update')).map((c) => opArg<Record<string, unknown>>(c.ops, 'update')!);
    expect(closing[closing.length - 1].status).toBe('sent');
    expect(enqueueJob).not.toHaveBeenCalled();
  });

  test('opt-out en el recheck → skipped; error OPTED_OUT del envío → skipped; NO_CREDITS → pausa y no sigue', async () => {
    enqueueJob.mockClear();
    const { sb, metas } = setup(Object.fromEntries(contacts.map((c) => [c.id, c.metadata])), (id) => id !== 'c1');
    const send = jest.fn(async (input: { customerId?: string | null }) => {
      if (input.customerId === 'c2') throw new WhatsAppError('NO_CREDITS', 'sin créditos', 402);
      return { message_id: 'm', conversation_id: 'conv', activity_id: null, customer_id: input.customerId!, channel_id: 'chan-1', scheduled: false };
    });
    const r = await runCampaignBatch({ campaign_id: 'camp-1', batch_no: 1 }, sb, { send, sleep: async () => undefined, now: () => Date.now() });
    expect(metas['cc-1']).toMatchObject({ state: 'skipped', skipped_reason: 'opted_out' });
    expect(metas['cc-2'].state).toBe('pending');
    expect(metas['cc-3'].state).toBe('pending');
    expect(r.reason).toBe('paused_no_credits');
    expect(r.finished).toBe(false);
    expect(enqueueJob).not.toHaveBeenCalled();
  });

  test('deadline agotado → lo no procesado vuelve a pending y se encola el lote n+1 con dedupe campaign_batch:{id}:{n+1}', async () => {
    enqueueJob.mockClear();
    const { sb, metas } = setup(Object.fromEntries(contacts.map((c) => [c.id, c.metadata])));
    let t = 0;
    const send = jest.fn(async (input: { customerId?: string | null }) => ({ message_id: 'm', conversation_id: 'conv', activity_id: null, customer_id: input.customerId!, channel_id: 'chan-1', scheduled: false }));
    const r = await runCampaignBatch({ campaign_id: 'camp-1', batch_no: 2 }, sb, { send, sleep: async () => undefined, now: () => (t += 3000), deadlineMs: 6000 });
    expect(r.sent).toBeLessThan(3);
    expect(r.next_batch_no).toBe(3);
    expect(Object.values(metas).some((m) => m.state === 'pending')).toBe(true);
    expect(Object.values(metas).some((m) => m.state === 'queued')).toBe(false);
    expect(enqueueJob).toHaveBeenCalledWith(expect.objectContaining({ kind: 'campaign_batch', dedupeKey: 'campaign_batch:camp-1:3', payload: { campaign_id: 'camp-1', batch_no: 3 } }));
  });

  test('campaña pausada → no reclama nada', async () => {
    const { sb } = makeSupabase({ campaigns: () => ({ data: { ...campaign, statistics: { ...campaign.statistics, state: 'paused' } } }) });
    const r = await runCampaignBatch({ campaign_id: 'camp-1', batch_no: 1 }, sb, { send: jest.fn() });
    expect(r).toMatchObject({ claimed: 0, finished: true, reason: 'status_paused' });
  });
});

describe('countContacts', () => {
  test('agrega estados reales y de metadata', () => {
    const c = countContacts([
      { state: null, metadata: { state: 'pending' } },
      { state: 'sent', metadata: { state: 'delivered', cost_amount: 0.01 } },
      { state: 'sent', metadata: { state: 'read' } },
      { state: 'replied', metadata: { state: 'replied' }, replied_at: 'x' },
      { state: null, metadata: { state: 'failed' } },
      { state: null, metadata: { state: 'skipped' } },
    ]);
    expect(c).toMatchObject({ total: 6, pending: 1, sent: 3, delivered: 3, read: 2, replied: 1, failed: 1, skipped: 1, cost: 0.01 });
  });
});
