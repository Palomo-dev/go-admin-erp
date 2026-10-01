import { planDelay, classifySendError, PER_RECIPIENT_MIN_MS } from '../campaignBatch';
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
