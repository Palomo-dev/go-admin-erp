import { planDelay, classifySendError, PER_RECIPIENT_MIN_MS } from '../campaignBatch';
import { providerErrorAction } from '../campaignEvents';
import { countContacts } from '../campaignService';
import { WhatsAppError } from '../types';

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
