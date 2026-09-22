/**
 * F4 — `transcribeCall` (transcriptionService) sobre dobles en memoria: casos
 * estables consolidados el 2026-09-21 a partir de `f4Adversarial` (grupos A y
 * B) y `f4Round2` (R-F). Única batería que ejercita el servicio real contra
 * `FakeDb`: validaciones previas (org, grabación, tamaño, duración), orden
 * cobro→proveedor, reembolso, idempotencia por UNIQUE(call_id), `force`,
 * reintento de `failed`, `markFailed` que conserva `raw_response` y la cadena
 * STT (`resolveSttChain`). Ids de caso originales de cada ronda. Sin red ni BD.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { FakeDb } from './fixtures/fakeSupabase';

const chargeAiCredits = jest.fn();
const refundAiCredits = jest.fn(async (_a: unknown) => true);
class InsufficientCreditsError extends Error { status = 402; constructor() { super('Créditos de IA insuficientes'); this.name = 'InsufficientCreditsError'; } }
jest.mock('@/lib/supabase/server-service', () => ({ getServiceClient: jest.fn(() => ({})), assertServerOnly: jest.fn() }));
jest.mock('@/lib/services/crm/aiCostService', () => ({
  chargeAiCredits: (...a: unknown[]) => chargeAiCredits(...a),
  refundAiCredits: (...a: unknown[]) => refundAiCredits(...(a as [unknown])),
  InsufficientCreditsError,
}));
jest.mock('@/lib/services/crm/pricingService', () => ({ getUnitCost: jest.fn(async () => 0.22), round6: (n: number) => n }));
jest.mock('@/lib/services/crm/callAiPolicy', () => ({ getCallAiPolicy: jest.fn() }));
jest.mock('@/lib/services/crm/recordingStorageService', () => ({ downloadFromTwilio: jest.fn() }));
jest.mock('@/lib/services/providerCredentials.server', () => ({ getProviderCredentials: jest.fn(), getProviderSettings: jest.fn() }));

const transcribeWithFallbackMock = jest.fn();
jest.mock('@/lib/services/crm/stt', () => {
  const actual = jest.requireActual('@/lib/services/crm/stt');
  return { ...actual, transcribeWithFallback: (...a: unknown[]) => transcribeWithFallbackMock(...a) };
});

import { getCallAiPolicy } from '@/lib/services/crm/callAiPolicy';
import { getProviderCredentials } from '@/lib/services/providerCredentials.server';
import { resolveSttChain, SttChainError, type SttAdapter, type SttInput, type TranscriptResult } from '@/lib/services/crm/stt';
import { ElevenLabsScribeAdapter } from '@/lib/services/crm/stt/elevenLabsScribe';
import { GeminiAudioAdapter } from '@/lib/services/crm/stt/geminiAudio';
import { OpenAiTranscribeAdapter } from '@/lib/services/crm/stt/openaiTranscribe';
import { transcribeCall, reconcileAiUsageModel, TranscriptionError, estimateSttCharge, creditsForUsd, renderTranscriptForLlm, STT_MAX_AUDIO_BYTES } from '@/lib/services/crm/transcriptionService';

const realCascade = (jest.requireActual('@/lib/services/crm/stt') as typeof import('@/lib/services/crm/stt')).transcribeWithFallback;

const POLICY = { sttProvider: 'elevenlabs', analysisProvider: 'google', analysisModel: 'gemini-3.8-flash', language: 'spa', dualTranscribe: true, autoTranscribe: true, autoAnalyze: true, apply: 'suggest' as const, stageConfidenceThreshold: 0.8, minDurationSeconds: 5, asyncWebhook: false, source: { stt: 'env' as const, analysis: 'env' as const } };

function fakeAdapter(name: SttAdapter['name'], opts: { maxBytes?: number } = {}): SttAdapter {
  return {
    name, supportsDiarization: name === 'elevenlabs', maxDurationSeconds: 10_000, ...opts,
    transcribe: jest.fn(async (input: SttInput): Promise<TranscriptResult> => ({ provider: name, model: `${name}-model`, language: input.language, text: 'Buenas tardes.', segments: [{ speaker_label: 'speaker_0', start_ms: 0, end_ms: 2000, text: 'Buenas tardes.', confidence: 0.9, channel_index: null }], speaker_count: 1, duration_seconds: 60, raw: {}, cost_usd: 0.0042, provider_request_id: null })),
  };
}

const WAV = 'org_7/2026/09/call-1.wav';
function baseDb(overrides: Record<string, any[]> = {}, bytes = 90000) {
  return new FakeDb({
    tables: {
      calls: [{ id: 'call-1', organization_id: 7, direction: 'outbound', mode: 'browser', status: 'completed', answered_by: 'human', started_at: '2026-09-01T10:00:00Z', ended_at: '2026-09-01T10:01:00Z', duration_seconds: 60, customer_id: 'cus-1', opportunity_id: 'opp-1', user_id: 'usr-1' }],
      call_recordings: [{ id: 'rec-1', organization_id: 7, call_id: 'call-1', storage_path: WAV, storage_provider: 'supabase', channels: '2', duration_seconds: 60, size_bytes: bytes, status: 'ready' }],
      call_transcripts: [], call_transcript_segments: [], ai_usage_logs: [],
      ...overrides,
    },
    storage: { [WAV]: Buffer.alloc(bytes, 1) },
    checks: { call_transcripts: { status: ['pending', 'processing', 'completed', 'failed'] } },
    unique: { call_transcripts: ['call_id'] },
  });
}

const okOutcome = (provider: 'elevenlabs' | 'google' | 'openai', model = 'm', fellBack = false) => ({
  result: { provider, model, language: 'spa', text: 'Hola, buenas tardes. Le llamo por la propuesta.', segments: [{ speaker_label: 'speaker_0', start_ms: 0, end_ms: 1000, text: 'Hola, buenas tardes.', confidence: 0.9, channel_index: 0 }, { speaker_label: 'speaker_1', start_ms: 1000, end_ms: 2000, text: 'Le llamo por la propuesta.', confidence: 0.8, channel_index: 1 }], speaker_count: 2, duration_seconds: 60, raw: {}, cost_usd: 0.0042, provider_request_id: 'req-9' },
  attempts: [{ provider, ok: true, ms: 10 }], provider, fellBack,
});
const totalRefunded = () => (refundAiCredits.mock.calls as unknown as Array<[{ credits?: number }]>).reduce((n, c) => n + (c[0].credits ?? 0), 0);

beforeEach(() => {
  jest.clearAllMocks();
  (getCallAiPolicy as jest.Mock).mockResolvedValue(POLICY);
  refundAiCredits.mockResolvedValue(true);
  chargeAiCredits.mockResolvedValue({ credits: 1, logId: 101, cost_amount: 0.0002 });
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('cadena STT: resolveSttChain y bordes de la cascada (adversarial A3/A9-A11, r2 B24)', () => {
  const creds = (fn: (p: string) => { credentials: Record<string, string>; isActive: boolean }) =>
    (getProviderCredentials as jest.Mock).mockImplementation(async (_o: number, _c: string, p?: string) => ({ provider: p ?? 'elevenlabs', settings: {}, ...fn(p ?? 'elevenlabs') }));

  it('A3 · primer adaptador OK → fellBack=false y un solo intento', async () => {
    const out = await realCascade(7, { audio: Buffer.alloc(10), mimeType: 'audio/wav', language: 'spa', channels: 1 }, { adapters: [fakeAdapter('elevenlabs')] });
    expect(out.fellBack).toBe(false);
    expect(out.attempts).toHaveLength(1);
  });

  it('B24 · el adaptador cuyo maxBytes no alcanza se salta con 413 sin invocarlo', async () => {
    const small = fakeAdapter('openai', { maxBytes: 1024 });
    const out = await realCascade(7, { audio: Buffer.alloc(4096), mimeType: 'audio/wav', language: 'spa', channels: 1 }, { adapters: [small, fakeAdapter('google')] });
    expect(out.provider).toBe('google');
    expect(out.attempts[0]).toMatchObject({ provider: 'openai', ok: false, status: 413 });
    expect(small.transcribe).not.toHaveBeenCalled();
  });

  it('A9 · excluye proveedores sin API key (ElevenLabs vacía) y conserva `preferred`', async () => {
    creds((p) => ({ isActive: true, credentials: (p === 'google' ? { GOOGLE_AI_API_KEY: 'g' } : p === 'openai' ? { OPENAI_API_KEY: 'o' } : {}) as Record<string, string> }));
    const chain = await resolveSttChain(7);
    expect(chain.adapters.map((a) => a.name)).toEqual(['google', 'openai']);
    expect(chain.preferred).toBe('elevenlabs');
  });

  it('A10 · `preferred` fuerza el primero de la cadena; A11 · isActive=false excluye al proveedor', async () => {
    const all = { ELEVENLABS_API_KEY: 'e', GOOGLE_AI_API_KEY: 'g', OPENAI_API_KEY: 'o' };
    creds(() => ({ isActive: true, credentials: all }));
    expect((await resolveSttChain(7, 'openai')).adapters[0].name).toBe('openai');
    creds((p) => ({ isActive: p === 'openai', credentials: all }));
    expect((await resolveSttChain(7)).adapters.map((a) => a.name)).toEqual(['openai']);
  });
});

describe('transcribeCall: validaciones previas (adversarial B1-B4, B23; r2 R41-R42)', () => {
  it('B1 · llamada de otra organización → CALL_NOT_FOUND, sin fila ni cobro', async () => {
    const db = baseDb();
    await expect(transcribeCall(999, 'call-1', { supabase: db.client() })).rejects.toMatchObject({ code: 'CALL_NOT_FOUND' });
    expect(db.rows('call_transcripts')).toHaveLength(0);
    expect(chargeAiCredits).not.toHaveBeenCalled();
  });

  it('B2 · sin grabación `ready` → NO_RECORDING con error_code/error_message en BD', async () => {
    const db = baseDb({ call_recordings: [{ id: 'rec-1', organization_id: 7, call_id: 'call-1', storage_path: 'p', status: 'processing' }] });
    await expect(transcribeCall(7, 'call-1', { supabase: db.client() })).rejects.toMatchObject({ code: 'NO_RECORDING' });
    const t = db.rows('call_transcripts')[0];
    expect(t).toMatchObject({ status: 'failed', error_code: 'NO_RECORDING' });
    expect(String(t.error_message)).toMatch(/ready/);
  });

  it('B3 · audio < 1024 bytes → AUDIO_EMPTY sin llamar al proveedor; B4 · duración por debajo del mínimo → AUDIO_TOO_SHORT', async () => {
    const db = baseDb();
    db.storageFiles[WAV] = Buffer.alloc(100);
    await expect(transcribeCall(7, 'call-1', { supabase: db.client() })).rejects.toMatchObject({ code: 'AUDIO_EMPTY' });
    expect(db.rows('call_transcripts')[0]).toMatchObject({ status: 'failed', error_code: 'AUDIO_EMPTY' });
    expect(transcribeWithFallbackMock).not.toHaveBeenCalled();
    const short = baseDb({ call_recordings: [{ id: 'rec-1', organization_id: 7, call_id: 'call-1', storage_path: WAV, storage_provider: 'supabase', channels: '1', duration_seconds: 2, status: 'ready' }] });
    await expect(transcribeCall(7, 'call-1', { supabase: short.client() })).rejects.toMatchObject({ code: 'AUDIO_TOO_SHORT' });
    expect(short.rows('call_transcripts')[0].error_code).toBe('AUDIO_TOO_SHORT');
  });

  it('B23/R41 · audio > tope de la cascada (25 MB, el del adaptador más restrictivo) → AUDIO_TOO_LARGE sin cobrar ni llamar', async () => {
    expect(STT_MAX_AUDIO_BYTES).toBe(25 * 1024 * 1024);
    const thirty = 30 * 1024 * 1024;
    expect(new ElevenLabsScribeAdapter('k').maxBytes!).toBeGreaterThan(thirty);
    expect(new GeminiAudioAdapter('k').maxBytes!).toBeGreaterThan(thirty);
    expect(new OpenAiTranscribeAdapter('k').maxBytes!).toBeLessThan(thirty);
    const db = baseDb({}, thirty);
    await expect(transcribeCall(7, 'call-1', { supabase: db.client() })).rejects.toMatchObject({ code: 'AUDIO_TOO_LARGE', retryable: false });
    expect(chargeAiCredits).not.toHaveBeenCalled();
    expect(transcribeWithFallbackMock).not.toHaveBeenCalled();
    expect(db.rows('call_transcripts')[0].error_code).toBe('AUDIO_TOO_LARGE');
  });

  it('R42 · un audio de 24 MB (por debajo del tope) sigue pasando', async () => {
    const db = baseDb({}, 24 * 1024 * 1024);
    transcribeWithFallbackMock.mockResolvedValue(okOutcome('openai'));
    expect((await transcribeCall(7, 'call-1', { supabase: db.client() as SupabaseClient })).status).toBe('completed');
  });

  it('R41b · sin cadena STT resoluble (sin credenciales, o error al resolverla) el tope cae al fallback de 25 MB y la fila registra el motivo', async () => {
    (getProviderCredentials as jest.Mock).mockResolvedValue({ provider: 'elevenlabs', isActive: true, credentials: {}, settings: {} });
    const a = baseDb({}, 30 * 1024 * 1024);
    await expect(transcribeCall(7, 'call-1', { supabase: a.client() })).rejects.toMatchObject({ code: 'AUDIO_TOO_LARGE' });
    expect(a.rows('call_transcripts')[0].raw_response).toMatchObject({ max_bytes: 25 * 1024 * 1024, max_bytes_source: 'fallback', max_bytes_reason: expect.stringMatching(/credenciales/) });
    (getProviderCredentials as jest.Mock).mockRejectedValue(new Error('provider_configs caído'));
    const b = baseDb({}, 30 * 1024 * 1024);
    await expect(transcribeCall(7, 'call-1', { supabase: b.client() })).rejects.toMatchObject({ code: 'AUDIO_TOO_LARGE' });
    expect(b.rows('call_transcripts')[0].raw_response).toMatchObject({ max_bytes_source: 'fallback', max_bytes_reason: 'provider_configs caído' });
  });
});

describe('transcribeCall: créditos, errores del proveedor y persistencia (adversarial B5-B13, B18, B22)', () => {
  it('B5 · los créditos se cobran ANTES de llamar al proveedor (D6)', async () => {
    const order: string[] = [];
    chargeAiCredits.mockImplementation(async () => { order.push('charge'); return { credits: 1, logId: 101, cost_amount: 0.0002 }; });
    transcribeWithFallbackMock.mockImplementation(async () => { order.push('provider'); return okOutcome('elevenlabs'); });
    await transcribeCall(7, 'call-1', { supabase: baseDb().client() });
    expect(order).toEqual(['charge', 'provider']);
  });

  it('B6/B7 · fallo total del proveedor → PROVIDER_ERROR, reembolso exacto y attempts en raw_response', async () => {
    const db = baseDb();
    chargeAiCredits.mockResolvedValue({ credits: 3, logId: 55, cost_amount: 0.03 });
    transcribeWithFallbackMock.mockRejectedValue(new SttChainError('todos fallaron', [{ provider: 'elevenlabs', ok: false, status: 401, ms: 5 }, { provider: 'openai', ok: false, status: 500, ms: 7 }], false));
    await expect(transcribeCall(7, 'call-1', { supabase: db.client() })).rejects.toMatchObject({ code: 'PROVIDER_ERROR', retryable: false });
    expect(refundAiCredits).toHaveBeenCalledWith(expect.objectContaining({ orgId: 7, credits: 3, logId: 55, actionType: 'call_transcribe' }));
    const t = db.rows('call_transcripts')[0];
    expect(t.error_code).toBe('PROVIDER_ERROR');
    expect(t.raw_response.attempts).toHaveLength(2);
  });

  it('B8 · SttChainError retryable=true → TranscriptionError.retryable=true', async () => {
    transcribeWithFallbackMock.mockRejectedValue(new SttChainError('x', [], true));
    const err = await transcribeCall(7, 'call-1', { supabase: baseDb().client() }).catch((e) => e as TranscriptionError);
    expect(err).toMatchObject({ code: 'PROVIDER_ERROR', retryable: true });
  });

  it('B9 · sin créditos → INSUFFICIENT_CREDITS, sin proveedor ni reembolso', async () => {
    const db = baseDb();
    chargeAiCredits.mockRejectedValue(new InsufficientCreditsError());
    await expect(transcribeCall(7, 'call-1', { supabase: db.client() })).rejects.toMatchObject({ code: 'INSUFFICIENT_CREDITS', retryable: false });
    expect(transcribeWithFallbackMock).not.toHaveBeenCalled();
    expect(refundAiCredits).not.toHaveBeenCalled();
    expect(db.rows('call_transcripts')[0].error_code).toBe('INSUFFICIENT_CREDITS');
  });

  it('B10 · éxito → una fila completed con word_count y cost_amount reales y sus segmentos', async () => {
    const db = baseDb();
    transcribeWithFallbackMock.mockResolvedValue(okOutcome('elevenlabs'));
    const t = await transcribeCall(7, 'call-1', { supabase: db.client() });
    expect(t).toMatchObject({ status: 'completed', word_count: 8, cost_amount: 0.0042 });
    expect(db.rows('call_transcripts')).toHaveLength(1);
    expect(db.rows('call_transcript_segments')).toHaveLength(2);
  });

  it('B11 · IDEMPOTENCIA: transcribir dos veces deja UNA fila, un cobro y una llamada al proveedor', async () => {
    const db = baseDb();
    const sb = db.client();
    transcribeWithFallbackMock.mockResolvedValue(okOutcome('elevenlabs'));
    await transcribeCall(7, 'call-1', { supabase: sb });
    expect((await transcribeCall(7, 'call-1', { supabase: sb })).status).toBe('completed');
    expect(db.rows('call_transcripts')).toHaveLength(1);
    expect(chargeAiCredits).toHaveBeenCalledTimes(1);
    expect(transcribeWithFallbackMock).toHaveBeenCalledTimes(1);
  });

  it('B12 · force=true reprocesa con UPDATE (una fila, sin duplicar segmentos) y vuelve a cobrar', async () => {
    const db = baseDb();
    const sb = db.client();
    transcribeWithFallbackMock.mockResolvedValue(okOutcome('elevenlabs'));
    await transcribeCall(7, 'call-1', { supabase: sb });
    await transcribeCall(7, 'call-1', { supabase: sb, force: true });
    expect(db.rows('call_transcripts')).toHaveLength(1);
    expect(db.rows('call_transcript_segments')).toHaveLength(2);
    expect(chargeAiCredits).toHaveBeenCalledTimes(2);
  });

  it('B13 · una transcripción `failed` previa se reintenta con UPDATE, no INSERT', async () => {
    const db = baseDb({ call_transcripts: [{ id: 'tr-old', organization_id: 7, call_id: 'call-1', provider: 'pending', language: 'spa', status: 'failed', error_code: 'PROVIDER_ERROR', raw_response: {} }] });
    transcribeWithFallbackMock.mockResolvedValue(okOutcome('google'));
    const t = await transcribeCall(7, 'call-1', { supabase: db.client() });
    expect(t.id).toBe('tr-old');
    expect(db.rows('call_transcripts')).toHaveLength(1);
    expect(t.error_code).toBeNull();
  });

  it('B18 · markFailed CONSERVA el raw_response previo y añade el contexto del fallo (credits, refunded, last_error_code)', async () => {
    const db = baseDb();
    transcribeWithFallbackMock.mockRejectedValue(new SttChainError('x', [], false));
    await expect(transcribeCall(7, 'call-1', { supabase: db.client() })).rejects.toThrow();
    expect(db.rows('call_transcripts')[0].raw_response).toMatchObject({ recording_id: 'rec-1', credits: 1, refunded: true, last_error_code: 'PROVIDER_ERROR' });
  });

  it('B18b · el provider_request_id del modo webhook (fila `processing` previa) sobrevive a markFailed', async () => {
    const db = baseDb({ call_transcripts: [{ id: 'tr-w', organization_id: 7, call_id: 'call-1', provider: 'elevenlabs', language: 'spa', status: 'processing', started_at: new Date(Date.now() - 20 * 60 * 1000).toISOString(), raw_response: { provider_request_id: 'req-scribe-1', pending: true, credits: 2 } }] });
    transcribeWithFallbackMock.mockRejectedValue(new SttChainError('x', [], false));
    await expect(transcribeCall(7, 'call-1', { supabase: db.client() })).rejects.toThrow();
    expect(db.rows('call_transcripts')[0].raw_response.provider_request_id).toBe('req-scribe-1');
  });

  it('B22 · un fallo determinista al persistir → PERSIST_ERROR no reintentable y se devuelve EXACTAMENTE lo cobrado', async () => {
    const db = baseDb();
    chargeAiCredits.mockResolvedValue({ credits: 5, logId: 90, cost_amount: 0.05 });
    transcribeWithFallbackMock.mockResolvedValue(okOutcome('elevenlabs'));
    db.failOn['call_transcripts:update'] = 'null value in column violates not-null constraint';
    const err = await transcribeCall(7, 'call-1', { supabase: db.client() }).catch((e) => e as TranscriptionError);
    expect(err).toBeInstanceOf(TranscriptionError);
    expect(err).toMatchObject({ code: 'PERSIST_ERROR', retryable: false });
    // El reembolso puede llegar en dos movimientos (ajuste al costo real + cierre): lo que importa es la conservación.
    expect(totalRefunded()).toBe(5);
    for (const c of refundAiCredits.mock.calls as unknown as Array<[{ logId?: number; actionType?: string }]>) expect(c[0]).toMatchObject({ logId: 90, actionType: 'call_transcribe' });
  });
});

describe('helpers puros y reconciliación básica (adversarial B16, B17, B19-B21)', () => {
  it('B16 · sin cambio de proveedor ni de modelo → no se toca ai_usage_logs; B17 · sin logId → false', async () => {
    const db = baseDb({ ai_usage_logs: [{ id: 101, model: 'scribe_v2', metadata: { provider: 'elevenlabs' } }] });
    transcribeWithFallbackMock.mockResolvedValue(okOutcome('elevenlabs', 'scribe_v2'));
    await transcribeCall(7, 'call-1', { supabase: db.client() });
    expect(db.rows('ai_usage_logs')[0].model).toBe('scribe_v2');
    expect(await reconcileAiUsageModel(db.client(), null, { provider: 'openai', model: 'x' })).toBe(false);
  });

  it('B19 · estimateSttCharge usa los SKU sembrados en provider_pricing; B20 · creditsForUsd nunca baja de 1 y redondea hacia arriba', async () => {
    expect((await estimateSttCharge('google', 60)).unitSku).toBe('gemini_2_5_flash_audio_in');
    expect((await estimateSttCharge('openai', 60)).unitSku).toBe('gpt_transcribe');
    expect((await estimateSttCharge('elevenlabs', 60)).unitSku).toBe('scribe');
    expect([creditsForUsd(null), creditsForUsd(0), creditsForUsd(-5), creditsForUsd(0.031)]).toEqual([1, 1, 1, 4]);
  });

  it('B21 · renderTranscriptForLlm etiqueta AGENTE/CLIENTE/HABLANTE con marca de tiempo', () => {
    const out = renderTranscriptForLlm([{ speaker_role: 'agent', start_ms: 0, text: 'Hola' }, { speaker_role: 'customer', start_ms: 65000, text: 'Sí' }, { speaker_role: null, start_ms: 70000, text: 'mmm' }] as any);
    expect(out).toContain('[00:00] [AGENTE]: Hola');
    expect(out).toContain('[01:05] [CLIENTE]: Sí');
    expect(out).toContain('[HABLANTE]');
  });
});
