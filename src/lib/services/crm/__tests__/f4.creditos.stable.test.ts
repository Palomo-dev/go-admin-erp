/**
 * F4 — dinero de la transcripción: `settleCreditDelta`, `CreditLedger`,
 * reconciliación de `ai_usage_logs` al proveedor REAL, rama webhook (pending),
 * `expireStuckTranscript` y `markFailed`. Consolidado el 2026-09-21 a partir de
 * `f4Adversarial` (B14/B15), `f4Round2` (R1-R5, R12-R15, R18, R19, R36-R39),
 * `f4Round3` (T1, T2, T5), `f4Round4Builder` (B2, B12, B13), `f4Round4Tester`
 * (U11), `f4Round5Builder` (C7) y `f4Round7Builder` (E5, E5b, E5c).
 *
 * Invariante que vigilan todos: la organización recupera EXACTAMENTE lo cobrado
 * (ni el doble por sumar intentos, ni de menos por dar por devuelto lo que la
 * RPC rechazó). Sin red ni BD.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { FakeDb } from './fixtures/fakeSupabase';

const chargeAiCredits = jest.fn();
const refundAiCredits = jest.fn(async (_a: unknown) => true);
class InsufficientCreditsError extends Error {
  status = 402;
  constructor() {
    super('Créditos de IA insuficientes');
    this.name = 'InsufficientCreditsError';
  }
}
jest.mock('@/lib/supabase/server-service', () => ({ getServiceClient: jest.fn(() => ({})), assertServerOnly: jest.fn() }));
jest.mock('@/lib/services/crm/aiCostService', () => ({
  chargeAiCredits: (...a: unknown[]) => chargeAiCredits(...a),
  refundAiCredits: (...a: unknown[]) => refundAiCredits(...(a as [unknown])),
  InsufficientCreditsError,
}));
const getUnitCost = jest.fn(async (_p: string, _sku: string): Promise<number | null> => 0.75);
jest.mock('@/lib/services/crm/pricingService', () => ({ getUnitCost: (...a: unknown[]) => (getUnitCost as unknown as (...x: unknown[]) => Promise<number | null>)(...a), round6: (n: number) => n }));
jest.mock('@/lib/services/crm/callAiPolicy', () => ({ getCallAiPolicy: jest.fn() }));
jest.mock('@/lib/services/crm/recordingStorageService', () => ({ downloadFromTwilio: jest.fn() }));
jest.mock('@/lib/services/providerCredentials.server', () => ({ getProviderCredentials: jest.fn(), getProviderSettings: jest.fn() }));

const transcribeWithFallbackMock = jest.fn();
jest.mock('@/lib/services/crm/stt', () => {
  const actual = jest.requireActual('@/lib/services/crm/stt');
  return { ...actual, transcribeWithFallback: (...a: unknown[]) => transcribeWithFallbackMock(...a) };
});

import { getCallAiPolicy } from '@/lib/services/crm/callAiPolicy';
import { transcribeCall, settleCreditDelta, CreditLedger, expireStuckTranscript, reconcileAiUsageModel, TranscriptionError, MAX_PROCESSING_MS } from '@/lib/services/crm/transcriptionService';

const POLICY = { sttProvider: 'elevenlabs', analysisProvider: 'google', analysisModel: 'gemini-3.8-flash', language: 'spa', dualTranscribe: true, autoTranscribe: true, autoAnalyze: true, apply: 'suggest' as const, stageConfidenceThreshold: 0.8, minDurationSeconds: 5, asyncWebhook: false, source: { stt: 'env' as const, analysis: 'env' as const } };
const WAV = 'org_7/2026/09/call-s.wav';

function sttDb(over: Record<string, any[]> = {}) {
  return new FakeDb({
    tables: {
      calls: [{ id: 'call-s', organization_id: 7, direction: 'outbound', mode: 'browser', status: 'completed', answered_by: 'human', started_at: '2026-09-01T10:00:00Z', ended_at: '2026-09-01T10:01:00Z', duration_seconds: 3600, customer_id: null, opportunity_id: null, user_id: 'usr-1' }],
      call_recordings: [{ id: 'rec-s', organization_id: 7, call_id: 'call-s', storage_path: WAV, storage_provider: 'supabase', channels: '2', duration_seconds: 3600, size_bytes: 90000, status: 'ready' }],
      call_transcripts: [], call_transcript_segments: [],
      ai_usage_logs: [{ id: 90, model: 'scribe_v2', metadata: { provider: 'elevenlabs', unit_sku: 'scribe', cost_amount: 0.0002, unit_cost_usd: 0.22 } }],
      ...over,
    },
    storage: { [WAV]: Buffer.alloc(90000, 1) },
    checks: { call_transcripts: { status: ['pending', 'processing', 'completed', 'failed'] } },
    unique: { call_transcripts: ['call_id'] },
  });
}
const okSttResult = (provider: string, model: string, cost: number | null, extra: Record<string, unknown> = {}) => ({
  result: { provider, model, language: 'spa', text: 'Buenas tardes.', segments: [{ speaker_label: 'speaker_0', start_ms: 0, end_ms: 2000, text: 'Buenas tardes.', confidence: 0.9, channel_index: null }], speaker_count: 1, duration_seconds: 3600, raw: {}, cost_usd: cost, provider_request_id: null, ...extra },
  attempts: [{ provider, ok: true, ms: 1 }], provider, fellBack: true,
});
/** Cliente mínimo para `CreditLedger`: sólo registra las filas `:refund_failed` que inserta. */
const ledgerSb = (filas: Array<Record<string, unknown>>) => ({ from: () => ({ insert: async (row: Record<string, unknown>) => { filas.push(row); return { error: null }; } }) }) as never;
const ledger = (charged: number, sb?: never) => new CreditLedger({ orgId: 7, actionType: 'call_analyze', model: 'm', provider: 'google', charged, logId: 1, supabase: sb });
const totalRefunded = () => (refundAiCredits.mock.calls as unknown as Array<[{ credits?: number }]>).reduce((n, c) => n + (c[0].credits ?? 0), 0);
const adjustCall = (kind: string) => chargeAiCredits.mock.calls.find((c) => (c[0] as any).actionType === `${kind}:adjust`);
const failedRows = (db: FakeDb) => db.rows('ai_usage_logs').filter((r: any) => String(r.action_type ?? '').includes('refund_failed'));
let errors: string[] = [];

beforeEach(() => {
  jest.clearAllMocks();
  errors = [];
  (getCallAiPolicy as jest.Mock).mockResolvedValue(POLICY);
  getUnitCost.mockResolvedValue(0.75);
  refundAiCredits.mockResolvedValue(true);
  chargeAiCredits.mockResolvedValue({ credits: 22, logId: 90, cost_amount: 0.22 });
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation((...a: unknown[]) => { errors.push(a.map(String).join(' ')); });
});
afterEach(() => jest.restoreAllMocks());

describe('settleCreditDelta (r2 R1-R5, r3 T1, r5 C7)', () => {
  const settle = (chargedCredits: number, realCredits: number, actionType = 'call_analyze') => settleCreditDelta({ orgId: 7, actionType, model: 'm', provider: 'google', chargedCredits, realCredits, logId: 1 });

  it('R1 · delta 0 no toca créditos y declara unrefunded/error explícitos', async () => {
    expect(await settle(5, 5)).toEqual({ credits: 5, delta: 0, ok: true, unrefunded: 0, error: null });
    expect(chargeAiCredits).not.toHaveBeenCalled();
    expect(refundAiCredits).not.toHaveBeenCalled();
  });

  it('R2 · infracobro → débito extra con action_type "<accion>:adjust"; R3 · sobrecobro → reembolso EXACTO de la diferencia', async () => {
    chargeAiCredits.mockResolvedValue({ credits: 9, logId: 2 });
    expect(await settle(22, 31, 'call_transcribe')).toEqual({ credits: 31, delta: 9, ok: true, unrefunded: 0, error: null });
    expect(chargeAiCredits.mock.calls[0][0]).toMatchObject({ actionType: 'call_transcribe:adjust', credits: 9 });
    expect(await settle(27, 22, 'call_transcribe')).toEqual({ credits: 22, delta: -5, ok: true, unrefunded: 0, error: null });
    expect(totalRefunded()).toBe(5);
  });

  it('R4/R5/C7 · el ajuste AL ALZA rechazado (sin saldo) no tumba el trabajo, no entra en bucle, dice el motivo y NO declara deuda', async () => {
    chargeAiCredits.mockRejectedValue(new InsufficientCreditsError());
    const s = await settle(1, 999999);
    expect(s).toMatchObject({ credits: 1, delta: 0, ok: false, unrefunded: 0 });
    expect(s.error).toMatch(/insuficientes/i);
    expect(chargeAiCredits).toHaveBeenCalledTimes(1);
  });

  it('T1 · COMPRUEBA el booleano de refundAiCredits: la RPC rechaza → ok:false, delta 0 y los 29 quedan como no devueltos', async () => {
    refundAiCredits.mockResolvedValue(false);
    const s = await settle(30, 1);
    expect(refundAiCredits).toHaveBeenCalledTimes(1);
    expect((refundAiCredits.mock.calls[0][0] as any).credits).toBe(29);
    expect(s).toEqual({ credits: 30, delta: 0, ok: false, unrefunded: 29, error: 'refund_ai_credits devolvió false' });
  });
});

describe('CreditLedger (r3 T2, r4 B12/B13, r4 U11, r7 E5/E5b/E5c)', () => {
  it('T2 · ajuste rechazado: refunded 0, outstanding sigue en 30, unsettled 29 y aún sin deuda definitiva', async () => {
    refundAiCredits.mockResolvedValue(false);
    const led = ledger(30);
    await led.settle({ realCredits: 1 });
    expect([led.refunded, led.outstanding, led.unsettled, led.unrefunded]).toEqual([0, 30, 29, 0]);
  });

  it('B12 · ajuste rechazado + cierre aceptado devuelve EXACTAMENTE lo cobrado (30, no 59 ni 1)', async () => {
    refundAiCredits.mockImplementation(async (a: any) => a.credits !== 29);
    const led = ledger(30);
    expect(await led.settle({ realCredits: 1 })).toMatchObject({ ok: false, unrefunded: 29 });
    expect(await led.refundOutstanding('fallo posterior')).toEqual({ refunded: 30, ok: true, error: null });
    expect([led.refunded, led.outstanding, led.unrefunded]).toEqual([30, 0, 0]);
  });

  it('B13 · ajuste rechazado + cierre rechazado: la deuda definitiva es el cobro (30), no la suma de intentos (59)', async () => {
    refundAiCredits.mockResolvedValue(false);
    const led = new CreditLedger({ orgId: 7, actionType: 'call_transcribe', model: 'm', provider: 'openai', charged: 30, logId: 1 });
    await led.settle({ realCredits: 1 });
    expect(await led.refundOutstanding('fallo posterior')).toMatchObject({ ok: false, refunded: 0 });
    expect([led.unrefunded, led.unsettled]).toEqual([30, 29]);
  });

  it('U11/E5b · refundOutstanding es idempotente con la RPC aceptando (una RPC, deuda 0) y rechazando (una RPC, una fila, deuda 30)', async () => {
    const ok = ledger(30);
    await ok.refundOutstanding('x');
    await ok.refundOutstanding('x');
    expect(refundAiCredits).toHaveBeenCalledTimes(1);
    expect([ok.refunded, ok.unrefunded]).toEqual([30, 0]);
    jest.clearAllMocks();
    refundAiCredits.mockResolvedValue(false);
    const filas: Array<Record<string, unknown>> = [];
    const ko = ledger(30, ledgerSb(filas));
    const r1 = await ko.refundOutstanding('boom');
    const r2 = await ko.refundOutstanding('boom');
    expect(refundAiCredits).toHaveBeenCalledTimes(1);
    expect(r1).toEqual({ refunded: 0, ok: false, error: 'refund_ai_credits devolvió false' });
    expect(r2).toEqual(r1);
    expect([ko.unrefunded, ko.outstanding]).toEqual([30, 30]);
    expect(filas).toHaveLength(1);
    expect(errors.filter((e) => /REEMBOLSO FALLIDO \(close\)/.test(e))).toHaveLength(1);
  });

  it('E5 · tras un cierre rechazado, un ajuste AL ALZA aceptado declara la diferencia (30 + 5 = 35) sin reabrir la RPC', async () => {
    const filas: Array<Record<string, unknown>> = [];
    refundAiCredits.mockResolvedValue(false);
    chargeAiCredits.mockResolvedValue({ ok: true });
    const l = ledger(30, ledgerSb(filas));
    const r1 = await l.refundOutstanding('boom');
    expect(l.unrefunded).toBe(30);
    expect((await l.settle({ realCredits: 35 })).ok).toBe(true);
    expect(l.outstanding).toBe(35);
    const r2 = await l.refundOutstanding('boom');
    expect(refundAiCredits).toHaveBeenCalledTimes(1);
    expect(r2).toEqual(r1);
    expect(l.unrefunded).toBe(35); // ni 30 (infradeclarar) ni 65 (duplicar)
    expect(filas.map((f) => (f.metadata as { pending_refund_credits: number }).pending_refund_credits)).toEqual([30, 5]);
    expect(errors.filter((e) => /REEMBOLSO FALLIDO \(close\)/.test(e))).toHaveLength(2);
  });

  it('E5c · un ajuste a la BAJA aceptado tras el cierre rechazado no reescribe hacia abajo la deuda declarada', async () => {
    const filas: Array<Record<string, unknown>> = [];
    refundAiCredits.mockResolvedValue(false);
    const l = ledger(30, ledgerSb(filas));
    await l.refundOutstanding('boom');
    refundAiCredits.mockResolvedValue(true);
    expect((await l.settle({ realCredits: 25 })).ok).toBe(true);
    expect(l.outstanding).toBe(25);
    expect((await l.refundOutstanding('boom')).ok).toBe(false);
    expect(l.unrefunded).toBe(30);
    expect(filas).toHaveLength(1);
  });
});

describe('transcribeCall: reconciliación al proveedor REAL y ajuste de créditos (adversarial B15, r2 R13-R15/R18/R19, r3 T5, r4 B2)', () => {
  const openaiCheaper = () => getUnitCost.mockImplementation(async (_p: any, sku: any) => (sku === 'gpt_transcribe' ? 0.0045 : 0.22));

  it('B15/R13/R15 · cascada elevenlabs→openai: model, provider, unit_sku, units (60 min), cost_amount y unit_cost_usd son los del proveedor que respondió; lo estimado se conserva', async () => {
    const db = sttDb();
    openaiCheaper();
    transcribeWithFallbackMock.mockResolvedValue(okSttResult('openai', 'gpt-transcribe', 0.27));
    await transcribeCall(7, 'call-s', { supabase: db.client() as SupabaseClient });
    const log = db.tables.ai_usage_logs.find((r) => r.id === 90)!;
    expect(log.model).toBe('gpt-transcribe');
    expect(log.cost_amount).toBe(0.27);
    expect(log.metadata).toMatchObject({ provider: 'openai', unit_sku: 'gpt_transcribe', unit_cost_usd: 0.0045, cost_amount: 0.27, estimated_model: 'scribe_v2', estimated_provider: 'elevenlabs', estimated_unit_sku: 'scribe', estimated_cost_amount: 0.0002 });
    expect(log.metadata.units).toBeCloseTo(60, 3);
  });

  it('R14 · los créditos se ajustan al proveedor real (infracobro → débito extra ":adjust" y raw_response.credits=27)', async () => {
    const db = sttDb();
    openaiCheaper();
    chargeAiCredits.mockResolvedValueOnce({ credits: 22, logId: 90, cost_amount: 0.22 }).mockResolvedValue({ credits: 5, logId: 91 });
    transcribeWithFallbackMock.mockResolvedValue(okSttResult('openai', 'gpt-transcribe', 0.27));
    const t = await transcribeCall(7, 'call-s', { supabase: db.client() as SupabaseClient });
    expect((adjustCall('call_transcribe')![0] as any).credits).toBe(27 - 22);
    expect(t.raw_response?.credits).toBe(27);
  });

  it('T5 · la RPC rechaza el ajuste a la baja: credits sigue siendo lo cobrado, pending_refund_credits > 0 y fila ":refund_failed" stage=settle', async () => {
    const db = sttDb();
    getUnitCost.mockImplementation(async (_p: any, sku: any) => (sku === 'gpt_transcribe' ? 0.0001 : 0.22));
    refundAiCredits.mockResolvedValue(false);
    transcribeWithFallbackMock.mockResolvedValue(okSttResult('openai', 'gpt-transcribe', 0.01));
    const t = await transcribeCall(7, 'call-s', { supabase: db.client() as SupabaseClient });
    expect(t.status).toBe('completed');
    expect(refundAiCredits).toHaveBeenCalled();
    expect(t.raw_response?.credits_adjustment).toBe(0);
    expect(t.raw_response?.credits).toBe(t.raw_response?.credits_charged);
    expect(t.raw_response?.pending_refund_credits as number).toBeGreaterThan(0);
    expect(failedRows(db)).toHaveLength(1);
    expect(failedRows(db)[0]).toMatchObject({ action_type: 'call_transcribe:refund_failed', metadata: expect.objectContaining({ stage: 'settle' }) });
  });

  it('R18/R19/B2 · si la reconciliación falla no rompe la transcripción, pero se ve: usage_log_reconciled=false, console.error y el log intacto', async () => {
    const db = sttDb();
    db.failOn['ai_usage_logs:update'] = 'permiso denegado';
    transcribeWithFallbackMock.mockResolvedValue(okSttResult('openai', 'gpt-transcribe', 0.27));
    const t = await transcribeCall(7, 'call-s', { supabase: db.client() as SupabaseClient });
    expect(t.status).toBe('completed');
    expect(t.raw_response?.usage_log_reconciled).toBe(false);
    expect(errors.some((e) => /reconciliación de ai_usage_logs=90 falló/.test(e))).toBe(true);
    const log = db.tables.ai_usage_logs.find((r) => r.id === 90)!;
    expect(log.model).toBe('scribe_v2');
    expect(log.cost_amount).toBeUndefined();
    expect(await reconcileAiUsageModel(db.client(), 90, { provider: 'openai', model: 'gpt-transcribe', costUsd: 0.3, unitSku: 'gpt_transcribe', units: 60 })).toBe(false);
  });

  it('R12 · la rama webhook (pending) está DENTRO del try/catch: si su UPDATE falla, reembolsa y es PERSIST_ERROR no reintentable', async () => {
    (getCallAiPolicy as jest.Mock).mockResolvedValue({ ...POLICY, asyncWebhook: true });
    const db = sttDb();
    transcribeWithFallbackMock.mockResolvedValue({ ...okSttResult('elevenlabs', 'scribe_v2', null, { text: '', segments: [], speaker_count: 0, duration_seconds: null, provider_request_id: 'req-1', pending: true }), fellBack: false });
    const client = db.client();
    const orig = (client as any).from;
    (client as any).from = (t: string) => {
      const b = orig(t);
      if (t === 'call_transcripts') {
        const origUpdate = b.update.bind(b);
        b.update = (p: any) => { if (p.raw_response?.pending === true) db.failOn['call_transcripts:update'] = 'update pending falló'; return origUpdate(p); };
      }
      return b;
    };
    const err = await transcribeCall(7, 'call-s', { supabase: client as SupabaseClient }).catch((e) => e);
    expect(err).toBeInstanceOf(TranscriptionError);
    expect(err).toMatchObject({ code: 'PERSIST_ERROR', retryable: false });
    expect(totalRefunded()).toBe(22);
  });
});

describe('caducidad de `processing` y markFailed (r2 R36-R39)', () => {
  const stuck = (started: string, extra: Record<string, unknown> = {}) => ({ id: 'tr-s', organization_id: 7, call_id: 'call-s', status: 'processing', provider: 'elevenlabs', language: 'spa', started_at: started, created_at: started, raw_response: { provider_request_id: 'req-9', credits: 22, recording_id: 'rec-s' }, ...extra });

  it('R36 · expireStuckTranscript marca failed WEBHOOK_TIMEOUT conservando raw_response; R37 · no caduca antes de MAX_PROCESSING_MS', async () => {
    const old = new Date(Date.now() - MAX_PROCESSING_MS - 60000).toISOString();
    const out = await expireStuckTranscript(7, 'call-s', sttDb({ call_transcripts: [stuck(old)] }).client());
    expect(out).toMatchObject({ status: 'failed', error_code: 'WEBHOOK_TIMEOUT', raw_response: expect.objectContaining({ provider_request_id: 'req-9', credits: 22, expired: true }) });
    const fresh = new Date(Date.now() - 60_000).toISOString();
    expect(await expireStuckTranscript(7, 'call-s', sttDb({ call_transcripts: [stuck(fresh)] }).client())).toBeNull();
  });

  it('R38 · COMPORTAMIENTO ACTUAL (defecto documentado en r2, sin corregir): con force, un fallo del proveedor marca failed una transcripción YA completada y conserva su texto', async () => {
    const db = sttDb({ call_transcripts: [{ id: 'tr-s', organization_id: 7, call_id: 'call-s', status: 'completed', provider: 'openai', language: 'spa', full_text: 'Transcripción buena anterior', word_count: 4, started_at: '2026-09-01T10:00:00Z', created_at: '2026-09-01T10:00:00Z', raw_response: { provider_request_id: 'req-viejo' } }] });
    transcribeWithFallbackMock.mockRejectedValue(new Error('proveedor caído'));
    await expect(transcribeCall(7, 'call-s', { force: true, supabase: db.client() as SupabaseClient })).rejects.toThrow();
    const row = db.tables.call_transcripts[0];
    expect(row.status).toBe('failed');
    expect(row.full_text).toBe('Transcripción buena anterior'); // texto bueno + estado failed: incoherente
    expect(row.raw_response.provider_request_id).toBe('req-viejo'); // esto sí se conserva
  });

  it('R39 · markFailed (NO_RECORDING con force) conserva el raw_response previo y añade failed_at/last_error_code', async () => {
    const db = sttDb({ call_transcripts: [stuck('2026-09-01T10:00:00Z', { provider: 'pending', raw_response: { provider_request_id: 'req-9', estimated_cost_usd: 0.22 } })], call_recordings: [] });
    await expect(transcribeCall(7, 'call-s', { force: true, supabase: db.client() as SupabaseClient })).rejects.toMatchObject({ code: 'NO_RECORDING' });
    const raw = db.tables.call_transcripts[0].raw_response;
    expect(raw).toMatchObject({ provider_request_id: 'req-9', estimated_cost_usd: 0.22, last_error_code: 'NO_RECORDING' });
    expect(raw.failed_at).toBeTruthy();
  });
});
