/**
 * TESTER F4 — batería adversarial de FASE-04 (transcripción, análisis IA,
 * actividad automática). Cubre cascada STT, créditos (cobro/reembolso/
 * reconciliación), idempotencia, roles por canal, reglas de análisis y la
 * llamada manual. Todo con dobles en memoria (fakeSupabase) — sin red ni BD.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { FakeDb } from './fixtures/fakeSupabase';

// ─── Mocks de infraestructura ────────────────────────────────────────────────
const chargeAiCredits = jest.fn();
const refundAiCredits = jest.fn(async () => true);
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
  refundAiCredits: (...a: unknown[]) => refundAiCredits(...(a as [])),
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
import {
  transcribeWithFallback,
  resolveSttChain,
  SttChainError,
  SttProviderError,
  toSttError,
  normalizeSttProvider,
  splitTextIntoSegments,
  type SttAdapter,
  type SttInput,
  type TranscriptResult,
} from '@/lib/services/crm/stt';
import { transcribeCall, reconcileAiUsageModel, TranscriptionError, estimateSttCharge, creditsForUsd, renderTranscriptForLlm, STT_MAX_AUDIO_BYTES } from '@/lib/services/crm/transcriptionService';
import { buildRoleMap, assignSpeakerRoles, channelRoleMap } from '@/lib/services/crm/callChannelRoles';
import { upsertCallActivity, buildActivityMetadata, mapCallStatusToOutcome, callChannel } from '@/lib/services/crm/callActivityService';
import { activityChannelForMode } from '@/lib/services/crm/callActivitySync';
import { validateSuggestedStage, mapObjectionsToCatalog, buildTaskRow, mapTaskPriority, mapTaskStatus, normalizeDueDate, mergeDiscovery } from '@/lib/services/crm/callAnalysisRules';
import { analysisZod } from '@/lib/services/crm/prompts/callAnalysisPrompt';
import { detectAudioKind, estimateDurationSeconds, createManualCallWithAudio, ManualCallError, MANUAL_AUDIO_MAX_BYTES } from '@/lib/services/crm/manualCallService';
import { TASK_PRIORITIES, TASK_STATUSES } from '@/lib/crm/enums';

const POLICY = {
  sttProvider: 'elevenlabs',
  analysisProvider: 'google',
  analysisModel: 'gemini-3.8-flash',
  language: 'spa',
  dualTranscribe: true,
  autoTranscribe: true,
  autoAnalyze: true,
  apply: 'suggest' as const,
  stageConfidenceThreshold: 0.8,
  minDurationSeconds: 5,
  asyncWebhook: false,
  source: { stt: 'env' as const, analysis: 'env' as const },
};

function fakeAdapter(name: 'elevenlabs' | 'google' | 'openai', behaviour: 'ok' | Error, opts: { maxDuration?: number; segments?: any[] } = {}): SttAdapter {
  return {
    name,
    supportsDiarization: name === 'elevenlabs',
    maxDurationSeconds: opts.maxDuration ?? 10_000,
    transcribe: jest.fn(async (input: SttInput): Promise<TranscriptResult> => {
      if (behaviour !== 'ok') throw behaviour;
      return {
        provider: name,
        model: `${name}-model`,
        language: input.language,
        text: 'Buenas tardes, le llamo por la propuesta.',
        segments: opts.segments ?? [{ speaker_label: 'speaker_0', start_ms: 0, end_ms: 2000, text: 'Buenas tardes.', confidence: 0.9, channel_index: null }],
        speaker_count: 1,
        duration_seconds: 60,
        raw: {},
        cost_usd: 0.0042,
        provider_request_id: null,
      };
    }),
  };
}

function baseDb(overrides: Record<string, any[]> = {}) {
  return new FakeDb({
    tables: {
      calls: [{ id: 'call-1', organization_id: 7, direction: 'outbound', mode: 'browser', status: 'completed', answered_by: 'human', started_at: '2026-09-01T10:00:00Z', ended_at: '2026-09-01T10:01:00Z', duration_seconds: 60, customer_id: 'cus-1', opportunity_id: 'opp-1', user_id: 'usr-1' }],
      call_recordings: [{ id: 'rec-1', organization_id: 7, call_id: 'call-1', storage_path: 'org_7/2026/09/call-1.wav', storage_provider: 'supabase', channels: '2', duration_seconds: 60, size_bytes: 90000, status: 'ready' }],
      call_transcripts: [],
      call_transcript_segments: [],
      ai_usage_logs: [],
      ...overrides,
    },
    storage: { 'org_7/2026/09/call-1.wav': Buffer.alloc(90000, 1) },
    checks: {
      call_transcripts: { status: ['pending', 'processing', 'completed', 'failed'] },
      opportunity_objections: { detected_by: ['manual', 'ia'] },
      tasks: { priority: TASK_PRIORITIES, status: TASK_STATUSES },
      call_tag_relations: { source: ['manual', 'ia'] },
      activities: { activity_type: ['call', 'email', 'whatsapp', 'sms', 'meeting', 'visit', 'note', 'system', 'ai_call', 'task'] },
    },
    unique: { call_transcripts: ['call_id'] },
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  (getCallAiPolicy as jest.Mock).mockResolvedValue(POLICY);
  chargeAiCredits.mockResolvedValue({ credits: 1, logId: 101, cost_amount: 0.0002 });
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

// ═══════════════════════════════════════════════════════════════════════════
describe('A · Cascada STT (transcribeWithFallback / resolveSttChain)', () => {
  // El módulo está mockeado para el grupo B; aquí se ejercita la cascada REAL.
  const transcribeWithFallback = (jest.requireActual('@/lib/services/crm/stt') as typeof import('@/lib/services/crm/stt')).transcribeWithFallback;
  const e401 = new SttProviderError('elevenlabs', 'invalid_api_key', 401, false);

  it('A1 · ElevenLabs 401 → cae a google y responde google', async () => {
    const out = await transcribeWithFallback(7, { audio: Buffer.alloc(10), mimeType: 'audio/wav', language: 'spa', channels: 2 }, {
      adapters: [fakeAdapter('elevenlabs', e401), fakeAdapter('google', 'ok')],
    });
    expect(out.provider).toBe('google');
    expect(out.fellBack).toBe(true);
  });

  it('A2 · ElevenLabs 401 + google 500 → cae a openai (el job no se pierde)', async () => {
    const out = await transcribeWithFallback(7, { audio: Buffer.alloc(10), mimeType: 'audio/wav', language: 'spa', channels: 2 }, {
      adapters: [fakeAdapter('elevenlabs', e401), fakeAdapter('google', new SttProviderError('google', 'boom', 500)), fakeAdapter('openai', 'ok')],
    });
    expect(out.provider).toBe('openai');
    expect(out.attempts).toHaveLength(3);
    expect(out.attempts.map((a) => a.ok)).toEqual([false, false, true]);
    expect(out.attempts[0].status).toBe(401);
  });

  it('A3 · primer adaptador OK → fellBack=false y un solo intento', async () => {
    const out = await transcribeWithFallback(7, { audio: Buffer.alloc(10), mimeType: 'audio/wav', language: 'spa', channels: 1 }, { adapters: [fakeAdapter('elevenlabs', 'ok')] });
    expect(out.fellBack).toBe(false);
    expect(out.attempts).toHaveLength(1);
  });

  it('A4 · todos fallan con 401 → SttChainError retryable=false', async () => {
    await expect(
      transcribeWithFallback(7, { audio: Buffer.alloc(10), mimeType: 'audio/wav', language: 'spa', channels: 1 }, {
        adapters: [fakeAdapter('elevenlabs', e401), fakeAdapter('openai', new SttProviderError('openai', 'bad key', 401, false))],
      }),
    ).rejects.toMatchObject({ name: 'SttChainError', retryable: false });
  });

  it('A5 · algún 429 → SttChainError retryable=true', async () => {
    const err = await transcribeWithFallback(7, { audio: Buffer.alloc(10), mimeType: 'audio/wav', language: 'spa', channels: 1 }, {
      adapters: [fakeAdapter('elevenlabs', e401), fakeAdapter('google', new SttProviderError('google', 'rate limit', 429))],
    }).catch((e) => e as SttChainError);
    expect(err).toBeInstanceOf(SttChainError);
    expect((err as SttChainError).retryable).toBe(true);
  });

  it('A6 · sin adaptadores con credenciales → SttChainError no reintentable', async () => {
    await expect(transcribeWithFallback(7, { audio: Buffer.alloc(10), mimeType: 'audio/wav', language: 'spa', channels: 1 }, { adapters: [] })).rejects.toMatchObject({ retryable: false });
  });

  it('A7 · duración > máximo del proveedor → se salta con 413 y sigue la cadena', async () => {
    const out = await transcribeWithFallback(7, { audio: Buffer.alloc(10), mimeType: 'audio/wav', language: 'spa', channels: 1, durationSeconds: 5000 }, {
      adapters: [fakeAdapter('openai', 'ok', { maxDuration: 1500 }), fakeAdapter('google', 'ok')],
    });
    expect(out.provider).toBe('google');
    expect(out.attempts[0]).toMatchObject({ provider: 'openai', ok: false, status: 413 });
  });

  it('A8 · toSttError clasifica 429/5xx/red como reintentables y 4xx como no', () => {
    expect(toSttError('google', { status: 503, message: 'x' }).retryable).toBe(true);
    expect(toSttError('google', { status: 429, message: 'x' }).retryable).toBe(true);
    expect(toSttError('google', { status: 400, message: 'x' }).retryable).toBe(false);
    expect(toSttError('google', new Error('fetch failed')).retryable).toBe(true);
  });

  it('A9 · resolveSttChain excluye proveedores sin API key (ElevenLabs vacía)', async () => {
    (getProviderCredentials as jest.Mock).mockImplementation(async (_o: number, _c: string, p?: string) => ({
      provider: p ?? 'elevenlabs',
      isActive: true,
      credentials: p === 'google' ? { GOOGLE_AI_API_KEY: 'g' } : p === 'openai' ? { OPENAI_API_KEY: 'o' } : {},
      settings: {},
    }));
    const chain = await resolveSttChain(7);
    expect(chain.adapters.map((a) => a.name)).toEqual(['google', 'openai']);
    expect(chain.preferred).toBe('elevenlabs');
  });

  it('A10 · resolveSttChain: `preferred` fuerza el primero de la cadena', async () => {
    (getProviderCredentials as jest.Mock).mockImplementation(async (_o: number, _c: string, p?: string) => ({
      provider: p ?? 'elevenlabs',
      isActive: true,
      credentials: { ELEVENLABS_API_KEY: 'e', GOOGLE_AI_API_KEY: 'g', OPENAI_API_KEY: 'o' },
      settings: {},
    }));
    const chain = await resolveSttChain(7, 'openai');
    expect(chain.adapters[0].name).toBe('openai');
  });

  it('A11 · resolveSttChain: isActive=false excluye al proveedor', async () => {
    (getProviderCredentials as jest.Mock).mockImplementation(async (_o: number, _c: string, p?: string) => ({
      provider: p ?? 'elevenlabs',
      isActive: p === 'openai',
      credentials: { ELEVENLABS_API_KEY: 'e', GOOGLE_AI_API_KEY: 'g', OPENAI_API_KEY: 'o' },
      settings: {},
    }));
    const chain = await resolveSttChain(7);
    expect(chain.adapters.map((a) => a.name)).toEqual(['openai']);
  });

  it('A12 · normalizeSttProvider acepta alias y rechaza basura', () => {
    expect(normalizeSttProvider('gemini')).toBe('google');
    expect(normalizeSttProvider('whisper')).toBe('openai');
    expect(normalizeSttProvider('scribe')).toBe('elevenlabs');
    expect(normalizeSttProvider('deepgram')).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('B · transcribeCall: persistencia, créditos y errores', () => {
  const okOutcome = (provider: 'elevenlabs' | 'google' | 'openai', model = 'm', fellBack = false) => ({
    result: { provider, model, language: 'spa', text: 'Hola, buenas tardes. Le llamo por la propuesta.', segments: [{ speaker_label: 'speaker_0', start_ms: 0, end_ms: 1000, text: 'Hola, buenas tardes.', confidence: 0.9, channel_index: 0 }, { speaker_label: 'speaker_1', start_ms: 1000, end_ms: 2000, text: 'Le llamo por la propuesta.', confidence: 0.8, channel_index: 1 }], speaker_count: 2, duration_seconds: 60, raw: {}, cost_usd: 0.0042, provider_request_id: 'req-9' },
    attempts: [{ provider, ok: true, ms: 10 }],
    provider,
    fellBack,
  });

  it('B1 · llamada de otra organización → CALL_NOT_FOUND y no crea transcripción', async () => {
    const db = baseDb();
    await expect(transcribeCall(999, 'call-1', { supabase: db.client() })).rejects.toMatchObject({ code: 'CALL_NOT_FOUND' });
    expect(db.rows('call_transcripts')).toHaveLength(0);
    expect(chargeAiCredits).not.toHaveBeenCalled();
  });

  it('B2 · sin grabación `ready` → NO_RECORDING y error_code/error_message en BD', async () => {
    const db = baseDb({ call_recordings: [{ id: 'rec-1', organization_id: 7, call_id: 'call-1', storage_path: 'p', status: 'processing' }] });
    await expect(transcribeCall(7, 'call-1', { supabase: db.client() })).rejects.toMatchObject({ code: 'NO_RECORDING' });
    const t = db.rows('call_transcripts')[0];
    expect(t).toMatchObject({ status: 'failed', error_code: 'NO_RECORDING' });
    expect(String(t.error_message)).toMatch(/ready/);
  });

  it('B3 · audio < 1024 bytes → AUDIO_EMPTY registrado y sin llamar al proveedor', async () => {
    const db = new FakeDb({ ...(baseDb() as any), tables: baseDb().tables, storage: { 'org_7/2026/09/call-1.wav': Buffer.alloc(100) } });
    await expect(transcribeCall(7, 'call-1', { supabase: db.client() })).rejects.toMatchObject({ code: 'AUDIO_EMPTY' });
    expect(db.rows('call_transcripts')[0]).toMatchObject({ status: 'failed', error_code: 'AUDIO_EMPTY' });
    expect(transcribeWithFallbackMock).not.toHaveBeenCalled();
  });

  it('B4 · duración por debajo del mínimo → AUDIO_TOO_SHORT', async () => {
    const db = baseDb({ call_recordings: [{ id: 'rec-1', organization_id: 7, call_id: 'call-1', storage_path: 'org_7/2026/09/call-1.wav', storage_provider: 'supabase', channels: '1', duration_seconds: 2, status: 'ready' }] });
    await expect(transcribeCall(7, 'call-1', { supabase: db.client() })).rejects.toMatchObject({ code: 'AUDIO_TOO_SHORT' });
    expect(db.rows('call_transcripts')[0].error_code).toBe('AUDIO_TOO_SHORT');
  });

  it('B5 · los créditos se cobran ANTES de llamar al proveedor (D6)', async () => {
    const db = baseDb();
    const order: string[] = [];
    chargeAiCredits.mockImplementation(async () => {
      order.push('charge');
      return { credits: 1, logId: 101, cost_amount: 0.0002 };
    });
    transcribeWithFallbackMock.mockImplementation(async () => {
      order.push('provider');
      return okOutcome('elevenlabs');
    });
    await transcribeCall(7, 'call-1', { supabase: db.client() });
    expect(order).toEqual(['charge', 'provider']);
  });

  it('B6 · fallo total del proveedor → se reembolsan exactamente los créditos cobrados', async () => {
    const db = baseDb();
    chargeAiCredits.mockResolvedValue({ credits: 3, logId: 55, cost_amount: 0.03 });
    transcribeWithFallbackMock.mockRejectedValue(new SttChainError('todos fallaron', [{ provider: 'elevenlabs', ok: false, status: 401, ms: 5 }], false));
    await expect(transcribeCall(7, 'call-1', { supabase: db.client() })).rejects.toMatchObject({ code: 'PROVIDER_ERROR', retryable: false });
    expect(refundAiCredits).toHaveBeenCalledWith(expect.objectContaining({ orgId: 7, credits: 3, logId: 55, actionType: 'call_transcribe' }));
  });

  it('B7 · fallo del proveedor → error_code=PROVIDER_ERROR y attempts en raw_response', async () => {
    const db = baseDb();
    transcribeWithFallbackMock.mockRejectedValue(new SttChainError('todos fallaron', [{ provider: 'elevenlabs', ok: false, status: 401, ms: 5 }, { provider: 'openai', ok: false, status: 500, ms: 7 }], true));
    await expect(transcribeCall(7, 'call-1', { supabase: db.client() })).rejects.toThrow();
    const t = db.rows('call_transcripts')[0];
    expect(t.error_code).toBe('PROVIDER_ERROR');
    expect(t.raw_response.attempts).toHaveLength(2);
  });

  it('B8 · SttChainError retryable=true se propaga como TranscriptionError.retryable=true', async () => {
    const db = baseDb();
    transcribeWithFallbackMock.mockRejectedValue(new SttChainError('x', [], true));
    const err = await transcribeCall(7, 'call-1', { supabase: db.client() }).catch((e) => e as TranscriptionError);
    expect((err as TranscriptionError).retryable).toBe(true);
  });

  it('B9 · sin créditos → INSUFFICIENT_CREDITS, sin llamar al proveedor ni reembolsar', async () => {
    const db = baseDb();
    chargeAiCredits.mockRejectedValue(new InsufficientCreditsError());
    await expect(transcribeCall(7, 'call-1', { supabase: db.client() })).rejects.toMatchObject({ code: 'INSUFFICIENT_CREDITS', retryable: false });
    expect(transcribeWithFallbackMock).not.toHaveBeenCalled();
    expect(refundAiCredits).not.toHaveBeenCalled();
    expect(db.rows('call_transcripts')[0].error_code).toBe('INSUFFICIENT_CREDITS');
  });

  it('B10 · éxito → una fila completed con full_text, word_count y cost_amount reales', async () => {
    const db = baseDb();
    transcribeWithFallbackMock.mockResolvedValue(okOutcome('elevenlabs'));
    const t = await transcribeCall(7, 'call-1', { supabase: db.client() });
    expect(t.status).toBe('completed');
    expect(t.word_count).toBe(8);
    expect(t.cost_amount).toBe(0.0042);
    expect(db.rows('call_transcripts')).toHaveLength(1);
    expect(db.rows('call_transcript_segments')).toHaveLength(2);
  });

  it('B11 · IDEMPOTENCIA: transcribir dos veces deja UNA sola fila (UNIQUE call_id)', async () => {
    const db = baseDb();
    const sb = db.client();
    transcribeWithFallbackMock.mockResolvedValue(okOutcome('elevenlabs'));
    await transcribeCall(7, 'call-1', { supabase: sb });
    const second = await transcribeCall(7, 'call-1', { supabase: sb });
    expect(db.rows('call_transcripts')).toHaveLength(1);
    expect(second.status).toBe('completed');
    expect(chargeAiCredits).toHaveBeenCalledTimes(1); // la 2.ª no vuelve a cobrar
    expect(transcribeWithFallbackMock).toHaveBeenCalledTimes(1);
  });

  it('B12 · force=true reprocesa con UPDATE (sigue habiendo UNA fila) y sin duplicar segmentos', async () => {
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

  it('B14 · cascada que cambia de proveedor → reconcilia ai_usage_logs al modelo REAL', async () => {
    const db = baseDb({ ai_usage_logs: [{ id: 101, model: 'scribe_v2', metadata: { provider: 'elevenlabs', unit_sku: 'scribe', cost_amount: 0.0002 } }] });
    transcribeWithFallbackMock.mockResolvedValue(okOutcome('openai', 'gpt-transcribe', true));
    await transcribeCall(7, 'call-1', { supabase: db.client() });
    const log = db.rows('ai_usage_logs')[0];
    expect(log.model).toBe('gpt-transcribe');
    expect(log.metadata.provider).toBe('openai');
    expect(log.metadata.estimated_model).toBe('scribe_v2');
    expect(log.metadata.estimated_provider).toBe('elevenlabs');
  });

  it('B15 · CORREGIDO (r2): la reconciliación ajusta también cost_amount, unit_sku y units al proveedor real', async () => {
    const db = baseDb({ ai_usage_logs: [{ id: 101, model: 'scribe_v2', metadata: { provider: 'elevenlabs', unit_sku: 'scribe', cost_amount: 0.0002, unit_cost_usd: 0.22 } }] });
    transcribeWithFallbackMock.mockResolvedValue(okOutcome('openai', 'gpt-transcribe', true));
    await transcribeCall(7, 'call-1', { supabase: db.client() });
    const log = db.rows('ai_usage_logs')[0];
    expect(log.model).toBe('gpt-transcribe');
    expect(log.metadata.provider).toBe('openai');
    expect(log.metadata.unit_sku).toBe('gpt_transcribe');    // sku del proveedor que respondió
    expect(log.metadata.cost_amount).toBe(0.0042);           // costo REAL, no la tarifa del estimado
    expect(log.metadata.estimated_unit_sku).toBe('scribe');  // se conserva lo estimado
    expect(log.metadata.estimated_cost_amount).toBe(0.0002);
    expect(log.metadata.units).toBeCloseTo(1, 6);            // 60 s = 1 minuto (unidad de OpenAI)
  });

  it('B16 · sin cambio de proveedor ni de modelo → no se toca ai_usage_logs', async () => {
    const db = baseDb({ ai_usage_logs: [{ id: 101, model: 'scribe_v2', metadata: { provider: 'elevenlabs' } }] });
    transcribeWithFallbackMock.mockResolvedValue({ ...okOutcome('elevenlabs', 'scribe_v2'), fellBack: false });
    await transcribeCall(7, 'call-1', { supabase: db.client() });
    expect(db.rows('ai_usage_logs')[0].model).toBe('scribe_v2');
  });

  it('B17 · reconcileAiUsageModel devuelve false si no hay logId', async () => {
    const db = baseDb();
    expect(await reconcileAiUsageModel(db.client(), null, { provider: 'openai', model: 'x' })).toBe(false);
  });

  it('B18 · CORREGIDO (r2): markFailed CONSERVA el raw_response previo y añade el contexto del fallo', async () => {
    const db = baseDb();
    transcribeWithFallbackMock.mockRejectedValue(new SttChainError('x', [], false));
    await expect(transcribeCall(7, 'call-1', { supabase: db.client() })).rejects.toThrow();
    const raw = db.rows('call_transcripts')[0].raw_response;
    expect(raw.recording_id).toBe('rec-1'); // sobrevive al fallo
    expect(raw.credits).toBe(1);
    expect(raw.refunded).toBe(true);
    expect(raw.last_error_code).toBe('PROVIDER_ERROR');
  });

  it('B18b · CORREGIDO (r2): el provider_request_id del modo webhook sobrevive a markFailed', async () => {
    const db = baseDb({
      call_transcripts: [{ id: 'tr-w', organization_id: 7, call_id: 'call-1', provider: 'elevenlabs', language: 'spa', status: 'processing', started_at: new Date(Date.now() - 20 * 60 * 1000).toISOString(), raw_response: { provider_request_id: 'req-scribe-1', pending: true, credits: 2 } }],
    });
    transcribeWithFallbackMock.mockRejectedValue(new SttChainError('x', [], false));
    await expect(transcribeCall(7, 'call-1', { supabase: db.client() })).rejects.toThrow();
    expect(db.rows('call_transcripts')[0].raw_response.provider_request_id).toBe('req-scribe-1');
  });

  it('B22 · CORREGIDO (r2): un fallo determinista al persistir reembolsa los créditos y NO es reintentable', async () => {
    const db = baseDb();
    chargeAiCredits.mockResolvedValue({ credits: 5, logId: 90, cost_amount: 0.05 });
    transcribeWithFallbackMock.mockResolvedValue(okOutcome('elevenlabs'));
    db.failOn['call_transcripts:update'] = 'null value in column violates not-null constraint';
    const err = await transcribeCall(7, 'call-1', { supabase: db.client() }).catch((e) => e as TranscriptionError);
    expect(err).toBeInstanceOf(TranscriptionError);
    expect(err).toMatchObject({ code: 'PERSIST_ERROR', retryable: false }); // el job NO reintenta ni vuelve a cobrar
    // Ronda 3: el reembolso puede llegar en DOS movimientos (el ajuste al costo
    // real de `settleCreditDelta` + el cierre del saldo vivo). Lo que importa es
    // la conservación: se devuelve exactamente lo cobrado, ni más (r2 nº 1) ni
    // menos (r2 nº 2). Antes se exigía un único movimiento de 5.
    const refunded = (refundAiCredits.mock.calls as unknown as Array<[{ credits?: number }]>).reduce((n, c) => n + (c[0].credits ?? 0), 0);
    expect(refunded).toBe(5);
    for (const c of refundAiCredits.mock.calls as unknown as Array<[{ logId?: number; actionType?: string }]>) {
      expect(c[0]).toMatchObject({ logId: 90, actionType: 'call_transcribe' });
    }
  });

  it('B23 · CORREGIDO (r2): audio por encima del máximo de la cascada → AUDIO_TOO_LARGE sin cobrar ni llamar al proveedor', async () => {
    const db = baseDb();
    db.storageFiles['org_7/2026/09/call-1.wav'] = Buffer.alloc(STT_MAX_AUDIO_BYTES + 1, 1);
    await expect(transcribeCall(7, 'call-1', { supabase: db.client() })).rejects.toMatchObject({ code: 'AUDIO_TOO_LARGE', retryable: false });
    expect(chargeAiCredits).not.toHaveBeenCalled();
    expect(transcribeWithFallbackMock).not.toHaveBeenCalled();
    expect(db.rows('call_transcripts')[0].error_code).toBe('AUDIO_TOO_LARGE');
  });

  it('B24 · CORREGIDO (r2): la cascada salta el adaptador cuyo maxBytes no alcanza (413) sin gastar la llamada', async () => {
    const real = (jest.requireActual('@/lib/services/crm/stt') as typeof import('@/lib/services/crm/stt')).transcribeWithFallback;
    const small = { ...fakeAdapter('openai', 'ok'), maxBytes: 1024 };
    const out = await real(7, { audio: Buffer.alloc(4096), mimeType: 'audio/wav', language: 'spa', channels: 1 }, { adapters: [small, fakeAdapter('google', 'ok')] });
    expect(out.provider).toBe('google');
    expect(out.attempts[0]).toMatchObject({ provider: 'openai', ok: false, status: 413 });
    expect(small.transcribe).not.toHaveBeenCalled();
  });

  it('B19 · estimateSttCharge usa los SKU sembrados en provider_pricing', async () => {
    expect((await estimateSttCharge('google', 60)).unitSku).toBe('gemini_2_5_flash_audio_in');
    expect((await estimateSttCharge('openai', 60)).unitSku).toBe('gpt_transcribe');
    expect((await estimateSttCharge('elevenlabs', 60)).unitSku).toBe('scribe');
  });

  it('B20 · creditsForUsd nunca baja de 1 crédito', () => {
    expect(creditsForUsd(null)).toBe(1);
    expect(creditsForUsd(0)).toBe(1);
    expect(creditsForUsd(-5)).toBe(1);
    expect(creditsForUsd(0.031)).toBe(4);
  });

  it('B21 · renderTranscriptForLlm etiqueta AGENTE/CLIENTE y trunca', () => {
    const out = renderTranscriptForLlm([
      { speaker_role: 'agent', start_ms: 0, text: 'Hola' },
      { speaker_role: 'customer', start_ms: 65000, text: 'Sí' },
      { speaker_role: null, start_ms: 70000, text: 'mmm' },
    ] as any);
    expect(out).toContain('[00:00] [AGENTE]: Hola');
    expect(out).toContain('[01:05] [CLIENTE]: Sí');
    expect(out).toContain('[HABLANTE]');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('C · Roles por canal (D1)', () => {
  const seg = (label: string, ch: number | null, start = 0, end = 1000) => ({ speaker_label: label, start_ms: start, end_ms: end, text: 't', confidence: 0.9, channel_index: ch });

  it('C1 · outbound: canal 0 = agente, canal 1 = cliente', () => {
    const { segments, map } = assignSpeakerRoles([seg('s0', 0), seg('s1', 1, 1000, 2000)], { direction: 'outbound', mode: 'browser' });
    expect(map.method).toBe('channel');
    expect(map.confidence).toBe(1);
    expect(segments.map((s) => s.speaker_role)).toEqual(['agent', 'customer']);
  });

  it('C2 · inbound: canal 0 = cliente (invertido)', () => {
    const { segments, map } = assignSpeakerRoles([seg('s0', 0), seg('s1', 1, 1000, 2000)], { direction: 'inbound', mode: 'inbound' });
    expect(map.method).toBe('channel');
    expect(segments.map((s) => s.speaker_role)).toEqual(['customer', 'agent']);
  });

  it('C3 · bridge (outbound) se comporta como outbound: canal 0 = agente', () => {
    const { segments } = assignSpeakerRoles([seg('s0', 0), seg('s1', 1, 1000, 2000)], { direction: 'outbound', mode: 'bridge' });
    expect(segments[0].speaker_role).toBe('agent');
    expect(channelRoleMap({ direction: 'outbound', mode: 'bridge' })).toEqual({ '0': 'agent', '1': 'customer' });
  });

  it('C4 · CONFIRMADO: sin channel_index y un solo hablante → method=single y TODO queda como AGENTE (outbound)', () => {
    const { segments, map } = assignSpeakerRoles([seg('speaker_0', null, 0, 1000), seg('speaker_0', null, 1000, 2000), seg('speaker_0', null, 2000, 3000)], { direction: 'outbound', mode: 'manual' });
    expect(map.method).toBe('single');
    expect(map.confidence).toBe(0.5);
    expect(new Set(segments.map((s) => s.speaker_role))).toEqual(new Set(['agent']));
  });

  it('C5 · single en inbound → todo como CLIENTE', () => {
    const { segments, map } = assignSpeakerRoles([seg('speaker_0', null)], { direction: 'inbound', mode: 'inbound' });
    expect(map.method).toBe('single');
    expect(segments[0].speaker_role).toBe('customer');
  });

  it('C6 · heurística: 2 hablantes sin canal, outbound → el primero es el agente', () => {
    const { segments, map } = assignSpeakerRoles([seg('a', null, 0, 1000), seg('b', null, 1000, 5000)], { direction: 'outbound', mode: 'browser' });
    expect(map.method).toBe('heuristic');
    expect(map.confidence).toBe(0.6);
    expect(segments.map((s) => s.speaker_role)).toEqual(['agent', 'customer']);
  });

  it('C7 · heurística inbound: el primero es el cliente', () => {
    const { segments } = assignSpeakerRoles([seg('a', null, 0, 1000), seg('b', null, 1000, 5000)], { direction: 'inbound', mode: 'inbound' });
    expect(segments.map((s) => s.speaker_role)).toEqual(['customer', 'agent']);
  });

  it('C8 · menos del 90% de segmentos con canal → cae a heurística (no a channel)', () => {
    const segs = [seg('a', 0, 0, 1000), seg('b', null, 1000, 2000), seg('a', null, 2000, 3000)];
    expect(buildRoleMap(segs, { direction: 'outbound' }).method).toBe('heuristic');
  });

  it('C9 · 3 hablantes en heurística → el tercero queda `unknown`', () => {
    const { segments } = assignSpeakerRoles([seg('a', null, 0, 1000), seg('b', null, 1000, 9000), seg('c', null, 9000, 9500)], { direction: 'outbound' });
    expect(segments.map((s) => s.speaker_role)).toEqual(['agent', 'customer', 'unknown']);
  });

  it('C10 · un hablante repartido por igual entre canales → unknown', () => {
    const map = buildRoleMap([seg('a', 0, 0, 1000), seg('a', 1, 1000, 2000)], { direction: 'outbound' });
    expect(map.bySpeaker.a).toBe('unknown');
  });

  it('C11 · el adaptador OpenAI produce un único speaker_0 → siempre method=single', () => {
    const segs = splitTextIntoSegments('Hola. Qué tal. Adiós.', 30);
    expect(new Set(segs.map((s) => s.speaker_label))).toEqual(new Set(['speaker_0']));
    expect(buildRoleMap(segs, { direction: 'outbound' }).method).toBe('single');
  });

  it('C12 · sin segmentos → single sin hablantes', () => {
    const map = buildRoleMap([], { direction: 'outbound' });
    expect(map.method).toBe('single');
    expect(Object.keys(map.bySpeaker)).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('D · Actividad idempotente', () => {
  const call = { id: 'call-1', organization_id: 7, direction: 'outbound', mode: 'browser', status: 'completed', answered_by: 'human', started_at: '2026-09-01T10:00:00Z', ended_at: '2026-09-01T10:01:00Z', duration_seconds: 60, customer_id: 'cus-1', opportunity_id: 'opp-1', user_id: 'usr-1' };

  it('D1 · upsertCallActivity dos veces → UNA sola fila en activities', async () => {
    const db = baseDb({ activities: [] });
    const sb = db.client();
    const a = await upsertCallActivity(7, 'call-1', { supabase: sb, enrich: { summary: 'primero' } });
    const b = await upsertCallActivity(7, 'call-1', { supabase: sb, enrich: { summary: 'segundo' } });
    expect(a?.created).toBe(true);
    expect(b?.created).toBe(false);
    expect(a?.activityId).toBe(b?.activityId);
    expect(db.rows('activities')).toHaveLength(1);
    expect(db.rows('activities')[0].notes).toBe('segundo');
  });

  it('D2 · la actividad usa activity_type=call, channel=phone y related_type=opportunity', async () => {
    const db = baseDb({ activities: [] });
    await upsertCallActivity(7, 'call-1', { supabase: db.client() });
    expect(db.rows('activities')[0]).toMatchObject({ activity_type: 'call', channel: 'phone', related_type: 'opportunity', related_id: 'opp-1', outcome: 'answered' });
  });

  it('D3 · mode=ai_agent → channel voice_ai', async () => {
    const db = baseDb({ activities: [], calls: [{ ...call, mode: 'ai_agent' }] });
    await upsertCallActivity(7, 'call-1', { supabase: db.client() });
    expect(db.rows('activities')[0].channel).toBe('voice_ai');
  });

  it('D4 · una disposición manual previa (F3) NO se pisa con el resultado del análisis', async () => {
    const db = baseDb({ activities: [{ id: 'act-1', organization_id: 7, call_id: 'call-1', notes: 'n', metadata: { disposition_outcome: 'voicemail' }, outcome: 'voicemail' }] });
    await upsertCallActivity(7, 'call-1', { supabase: db.client(), enrich: { summary: 'resumen IA' } });
    expect(db.rows('activities')[0].outcome).toBe('voicemail');
  });

  it('D5 · sin oportunidad → related_type=customer', async () => {
    const db = baseDb({ activities: [], calls: [{ ...call, opportunity_id: null }] });
    await upsertCallActivity(7, 'call-1', { supabase: db.client() });
    expect(db.rows('activities')[0]).toMatchObject({ related_type: 'customer', related_id: 'cus-1' });
  });

  it('D6 · llamada de otra org → null y no crea actividad', async () => {
    const db = baseDb({ activities: [] });
    expect(await upsertCallActivity(999, 'call-1', { supabase: db.client() })).toBeNull();
    expect(db.rows('activities')).toHaveLength(0);
  });

  it('D7 · CORREGIDO (r2): dos upserts CONCURRENTES dejan UNA sola actividad (cerrojo por call_id)', async () => {
    const db = baseDb({ activities: [] });
    const sb = db.client();
    const [a, b] = await Promise.all([upsertCallActivity(7, 'call-1', { supabase: sb }), upsertCallActivity(7, 'call-1', { supabase: sb })]);
    expect(db.rows('activities')).toHaveLength(1);
    expect(a?.activityId).toBe(b?.activityId);
    expect([a?.created, b?.created].filter(Boolean)).toHaveLength(1); // solo una creó
  });

  it('D7b · CORREGIDO (r2): si el INSERT falla por una carrera entre procesos, se reutiliza la fila ganadora', async () => {
    const db = baseDb({ activities: [{ id: 'act-ganadora', organization_id: 7, call_id: 'call-1', metadata: {}, notes: null, created_at: '2026-09-01T10:00:00Z' }] });
    db.failOn['activities:insert'] = 'duplicate key value violates unique constraint';
    const r = await upsertCallActivity(7, 'call-1', { supabase: db.client() });
    expect(r).toMatchObject({ created: false });
    expect(db.rows('activities')).toHaveLength(1);
  });

  it('D10 · CORREGIDO (r2): mode=bridge da el MISMO canal por las dos rutas (F3 y F4)', () => {
    expect(callChannel('bridge')).toBe('mobile');
    expect(activityChannelForMode('bridge')).toBe(callChannel('bridge'));
    expect(activityChannelForMode('ai_agent')).toBe('voice_ai');
    expect(activityChannelForMode('browser')).toBe('phone');
  });

  it('D8 · buildActivityMetadata conserva la metadata previa y añade ids del análisis', () => {
    const meta = buildActivityMetadata({ disposition_outcome: 'answered', foo: 1 }, call as any, { transcriptId: 'tr', analysisId: 'an', sentiment: 'mixed', qualityScore: 70, tags: ['Tibio'] });
    expect(meta).toMatchObject({ disposition_outcome: 'answered', foo: 1, transcript_id: 'tr', analysis_id: 'an', sentiment: 'mixed', quality_score: 70, source: 'call_ai' });
  });

  it('D9 · mapCallStatusToOutcome cubre buzón, ocupado y en curso', () => {
    expect(mapCallStatusToOutcome('completed', 'machine')).toBe('voicemail');
    expect(mapCallStatusToOutcome('completed', 'human')).toBe('answered');
    expect(mapCallStatusToOutcome('busy')).toBe('busy');
    expect(mapCallStatusToOutcome('ringing')).toBe('in_progress');
    expect(mapCallStatusToOutcome('marciano')).toBe('unknown');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('E · Reglas del análisis', () => {
  const stages = [{ id: 'st-1', name: 'Descubrimiento', position: 1 }, { id: 'st-2', name: 'Propuesta', position: 2 }];

  it('E1 · suggested_stage_id de OTRO pipeline → null y queda registrado como rechazado', () => {
    const v = validateSuggestedStage('st-99-de-otro-pipeline', 0.95, stages, 'st-1');
    expect(v.stageId).toBeNull();
    expect(v.rejectedStageId).toBe('st-99-de-otro-pipeline');
    expect(v.confidence).toBe(0);
  });

  it('E2 · etapa sugerida igual a la actual → null (no mueve)', () => {
    expect(validateSuggestedStage('st-1', 0.99, stages, 'st-1').stageId).toBeNull();
  });

  it('E3 · el LLM devuelve el NOMBRE en vez del id → se resuelve al id', () => {
    expect(validateSuggestedStage('Propuesta', 0.9, stages, 'st-1').stageId).toBe('st-2');
  });

  it('E4 · confianza fuera de rango se recorta a [0,1]', () => {
    expect(validateSuggestedStage('st-2', 5 as number, stages, 'st-1').confidence).toBe(1);
    expect(validateSuggestedStage('st-2', -3 as number, stages, 'st-1').confidence).toBe(0);
  });

  it('E5 · sentiment fuera del CHECK → el esquema zod lo rechaza (error controlado)', () => {
    const base = {
      summary: 's', sentiment: 'furioso', sentiment_score: 0, quality_score: 50,
      quality_breakdown: { greeting: 1, discovery: 1, pitch: 1, objection_handling: 1, closing: 1, professionalism: 1 },
      talk_ratio_agent: 0.5, talk_ratio_customer: 0.5, longest_monologue_seconds: 1, questions_asked: 1,
      next_steps: [], objections: [], competitors: [], budget_mentioned: null, decision_maker_identified: false,
      discovery: { budget: null, authority: null, need: null, timeline: null, goals: null, obstacles: null, consequences: null },
      suggested_stage_id: null, suggested_stage_confidence: 0, suggested_tasks: [], tags: [], temperature: 'warm',
    };
    expect(() => analysisZod.parse(base)).toThrow();
    expect(() => analysisZod.parse({ ...base, sentiment: 'mixed' })).not.toThrow();
  });

  it('E6 · quality_score fuera de 0..100 → rechazado por el esquema', () => {
    const base: any = { summary: 's', sentiment: 'neutral', sentiment_score: 0, quality_score: 5000, quality_breakdown: { greeting: 1, discovery: 1, pitch: 1, objection_handling: 1, closing: 1, professionalism: 1 }, talk_ratio_agent: 0.5, talk_ratio_customer: 0.5, longest_monologue_seconds: 1, questions_asked: 1, next_steps: [], objections: [], competitors: [], budget_mentioned: null, decision_maker_identified: false, discovery: { budget: null, authority: null, need: null, timeline: null, goals: null, obstacles: null, consequences: null }, suggested_stage_id: null, suggested_stage_confidence: 0, suggested_tasks: [], tags: [], temperature: 'warm' };
    expect(() => analysisZod.parse(base)).toThrow();
  });

  it('E7 · tareas: priority y status siempre dentro del CHECK real', () => {
    for (const p of ['urgente', 'medium', 'ALTA', 'baja', undefined, null, 'basura', 42]) {
      const row = buildTaskRow({ title: 't', priority: p as any }, 0, { orgId: 7, callId: 'c', opportunityId: 'o', customerId: null, assignedTo: null, createdBy: null, analysisId: 'a' });
      expect(TASK_PRIORITIES).toContain(row.priority as any);
      expect(TASK_STATUSES).toContain(row.status as any);
    }
    expect(mapTaskPriority('urgente')).toBe('critical');
    expect(mapTaskStatus('completed')).toBe('done');
  });

  it('E8 · tareas: usa related_to_id/related_to_type (NO related_id)', () => {
    const row = buildTaskRow({ title: 't' }, 0, { orgId: 7, callId: 'c1', opportunityId: 'opp-1', customerId: 'cus', assignedTo: 'u', createdBy: 'u', analysisId: 'an' });
    expect(row).toMatchObject({ related_to_id: 'opp-1', related_to_type: 'opportunity' });
    expect((row as Record<string, unknown>).related_id).toBeUndefined();
  });

  it('E9 · sin oportunidad la tarea se relaciona con la llamada', () => {
    const row = buildTaskRow({ title: 't' }, 1, { orgId: 7, callId: 'c1', opportunityId: null, customerId: null, assignedTo: null, createdBy: null, analysisId: 'an' });
    expect(row).toMatchObject({ related_to_id: 'c1', related_to_type: 'call' });
  });

  it('E10 · título de tarea larguísimo se trunca a 200 caracteres', () => {
    const row = buildTaskRow({ title: 'x'.repeat(500) }, 0, { orgId: 7, callId: 'c', opportunityId: null, customerId: null, assignedTo: null, createdBy: null, analysisId: 'a' });
    expect(row.title).toHaveLength(200);
  });

  it('E11 · due_date en lenguaje natural ("mañana") → null', () => {
    expect(normalizeDueDate('mañana')).toBeNull();
    expect(normalizeDueDate('2026-09-15')).toBe('2026-09-15');
    expect(normalizeDueDate(null)).toBeNull();
  });

  it('E12 · tipo de tarea desconocido → `task`', () => {
    expect(buildTaskRow({ title: 't', type: 'telepatia' }, 0, { orgId: 7, callId: 'c', opportunityId: null, customerId: null, assignedTo: null, createdBy: null, analysisId: 'a' }).type).toBe('task');
  });

  it('E13 · objeciones: id válido del catálogo → match por id', () => {
    const out = mapObjectionsToCatalog([{ objection_id: 'ob-1', label: 'Precio alto', quote: 'q', confidence: 0.9 }] as any, [{ id: 'ob-1', title: 'Precio elevado' }]);
    expect(out[0]).toMatchObject({ objection_id: 'ob-1', match: 'id' });
  });

  it('E14 · objeciones: sin id pero con título parecido → match por similitud', () => {
    const out = mapObjectionsToCatalog([{ objection_id: null, label: 'El precio es muy elevado', quote: 'q', confidence: 0.8 }] as any, [{ id: 'ob-9', title: 'Precio elevado' }]);
    expect(out[0].objection_id).toBe('ob-9');
    expect(out[0].match).toBe('title');
  });

  it('E15 · objeciones: id inventado y sin parecido → objection_id null (no se inventa)', () => {
    const out = mapObjectionsToCatalog([{ objection_id: 'ob-inexistente', label: 'zzzz qqqq', quote: 'q', confidence: 0.9 }] as any, [{ id: 'ob-1', title: 'Precio elevado' }]);
    expect(out[0].objection_id).toBeNull();
    expect(out[0].match).toBeNull();
  });

  it('E16 · catálogo vacío (estado real de la BD hoy) → todas las objeciones sin id', () => {
    const out = mapObjectionsToCatalog([{ objection_id: 'x', label: 'Precio', quote: 'q', confidence: 0.9 }] as any, []);
    expect(out[0].objection_id).toBeNull();
  });

  it('E17 · mergeDiscovery no pisa valores existentes', () => {
    const { merged, added } = mergeDiscovery({ budget: '10M', need: '' }, { budget: '20M', need: 'CRM', authority: 'CEO' });
    expect(merged.budget).toBe('10M');
    expect(merged.need).toBe('CRM');
    expect(added.sort()).toEqual(['authority', 'need']);
  });

  it('E18 · mergeDiscovery ignora null/undefined/vacío', () => {
    const { added } = mergeDiscovery({}, { a: null, b: undefined, c: '', d: 'ok' } as any);
    expect(added).toEqual(['d']);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('F · Llamada manual con audio', () => {
  const WAV = (() => {
    const b = Buffer.alloc(2048);
    b.write('RIFF', 0, 'latin1');
    b.write('WAVE', 8, 'latin1');
    b.writeUInt32LE(16000, 28); // byteRate
    b.write('data', 36, 'latin1');
    b.writeUInt32LE(1000, 40);
    return b;
  })();

  function manualDb() {
    const db = baseDb({
      calls: [],
      call_recordings: [],
      activities: [],
      opportunities: [{ id: 'opp-1', organization_id: 7, customer_id: 'cus-1' }],
      customers: [{ id: 'cus-1', organization_id: 7, phone: '+573001112233' }],
    });
    db.storageFiles = {};
    return db;
  }

  it('F1 · magic bytes: .txt renombrado a .wav → rechazado con 415', async () => {
    const fake = Buffer.from('esto es texto plano, no audio, aunque se llame call.wav');
    expect(detectAudioKind(fake)).toBeNull();
    const db = manualDb();
    await expect(createManualCallWithAudio(7, 'usr-1', { audio: fake, opportunityId: 'opp-1', originalFilename: 'call.wav' }, db.client())).rejects.toMatchObject({ status: 415 });
    expect(db.rows('calls')).toHaveLength(0);
  });

  it('F2 · audio > 40 MB → 413 y no crea nada', async () => {
    const big = Buffer.alloc(MANUAL_AUDIO_MAX_BYTES + 1);
    big.write('RIFF', 0, 'latin1');
    big.write('WAVE', 8, 'latin1');
    const db = manualDb();
    await expect(createManualCallWithAudio(7, 'usr-1', { audio: big, opportunityId: 'opp-1' }, db.client())).rejects.toMatchObject({ status: 413 });
    expect(db.rows('calls')).toHaveLength(0);
  });

  it('F3 · sin oportunidad ni cliente → 400', async () => {
    const db = manualDb();
    await expect(createManualCallWithAudio(7, 'usr-1', { audio: WAV }, db.client())).rejects.toMatchObject({ status: 400 });
  });

  it('F4 · audio vacío → 400', async () => {
    const db = manualDb();
    await expect(createManualCallWithAudio(7, 'usr-1', { audio: Buffer.alloc(0), opportunityId: 'opp-1' }, db.client())).rejects.toMatchObject({ status: 400 });
  });

  it('F5 · oportunidad de OTRA organización → 404', async () => {
    const db = manualDb();
    await expect(createManualCallWithAudio(999, 'usr-1', { audio: WAV, opportunityId: 'opp-1' }, db.client())).rejects.toMatchObject({ status: 404 });
  });

  it('F6 · cliente de OTRA organización → 404', async () => {
    const db = manualDb();
    await expect(createManualCallWithAudio(999, 'usr-1', { audio: WAV, customerId: 'cus-1' }, db.client())).rejects.toMatchObject({ status: 404 });
  });

  it('F7 · camino feliz: crea call+recording+activity y sube al path org_{id}/{yyyy}/{mm}/{callId}.wav', async () => {
    const db = manualDb();
    const out = await createManualCallWithAudio(7, 'usr-1', { audio: WAV, opportunityId: 'opp-1', occurredAt: '2026-03-04T08:00:00Z' }, db.client());
    expect(out.storagePath).toBe(`org_7/2026/03/${out.callId}.wav`);
    expect(db.storageCalls.some((c) => c.op === 'upload' && c.bucket === 'crm-call-recordings')).toBe(true);
    expect(db.rows('call_recordings')[0]).toMatchObject({ status: 'ready', channels: '1', storage_provider: 'supabase' });
    expect(db.rows('activities')).toHaveLength(1);
  });

  it('F8 · from_number/to_number nunca quedan nulos (NOT NULL) y usan el teléfono del cliente', async () => {
    const db = manualDb();
    await createManualCallWithAudio(7, 'usr-1', { audio: WAV, opportunityId: 'opp-1' }, db.client());
    const call = db.rows('calls')[0];
    expect(call.from_number).toBe('manual');
    expect(call.to_number).toBe('+573001112233');
    expect(call.mode).toBe('manual');
    expect(call.duration_source).toBe('manual');
  });

  it('F9 · inbound invierte from/to', async () => {
    const db = manualDb();
    await createManualCallWithAudio(7, 'usr-1', { audio: WAV, opportunityId: 'opp-1', direction: 'inbound' }, db.client());
    expect(db.rows('calls')[0]).toMatchObject({ from_number: '+573001112233', to_number: 'manual', direction: 'inbound' });
  });

  it('F10 · cliente sin teléfono → to_number="manual" (nunca null)', async () => {
    const db = manualDb();
    db.tables.customers = [{ id: 'cus-1', organization_id: 7, phone: null }];
    await createManualCallWithAudio(7, 'usr-1', { audio: WAV, opportunityId: 'opp-1' }, db.client());
    expect(db.rows('calls')[0].to_number).toBe('manual');
  });

  it('F11 · fallo al subir el audio → se borra la llamada creada (sin huérfanos)', async () => {
    const db = manualDb();
    db.failOn['storage:upload'] = 'bucket lleno';
    await expect(createManualCallWithAudio(7, 'usr-1', { audio: WAV, opportunityId: 'opp-1' }, db.client())).rejects.toMatchObject({ status: 500 });
    expect(db.rows('calls')).toHaveLength(0);
  });

  it('F12 · fallo al registrar la grabación → borra llamada y objeto de storage', async () => {
    const db = manualDb();
    db.failOn['call_recordings:insert'] = 'boom';
    await expect(createManualCallWithAudio(7, 'usr-1', { audio: WAV, opportunityId: 'opp-1' }, db.client())).rejects.toMatchObject({ status: 500 });
    expect(db.rows('calls')).toHaveLength(0);
    expect(Object.keys(db.storageFiles)).toHaveLength(0);
  });

  it('F13 · detectAudioKind reconoce wav/ogg/webm/m4a/mp3(ID3)/mp3(framesync)', () => {
    const mk = (fn: (b: Buffer) => void) => {
      const b = Buffer.alloc(16);
      fn(b);
      return b;
    };
    expect(detectAudioKind(mk((b) => { b.write('RIFF', 0, 'latin1'); b.write('WAVE', 8, 'latin1'); }))).toBe('wav');
    expect(detectAudioKind(mk((b) => b.write('OggS', 0, 'latin1')))).toBe('ogg');
    expect(detectAudioKind(mk((b) => { b[0] = 0x1a; b[1] = 0x45; b[2] = 0xdf; b[3] = 0xa3; }))).toBe('webm');
    expect(detectAudioKind(mk((b) => b.write('ftyp', 4, 'latin1')))).toBe('m4a');
    expect(detectAudioKind(mk((b) => b.write('ID3', 0, 'latin1')))).toBe('mp3');
    expect(detectAudioKind(mk((b) => { b[0] = 0xff; b[1] = 0xfb; }))).toBe('mp3');
    expect(detectAudioKind(Buffer.alloc(4))).toBeNull();
  });

  it('F14 · estimateDurationSeconds lee la cabecera WAV y no devuelve 0', () => {
    expect(estimateDurationSeconds(WAV, 'wav')).toBeGreaterThanOrEqual(1);
    expect(estimateDurationSeconds(Buffer.alloc(160000), 'mp3')).toBeGreaterThan(0);
  });

  it('F15 · CORREGIDO (r2): el tope de subida es el que la cascada puede transcribir (25 MB), no 40 MB', () => {
    expect(MANUAL_AUDIO_MAX_BYTES).toBe(25 * 1024 * 1024);
    expect(MANUAL_AUDIO_MAX_BYTES).toBe(STT_MAX_AUDIO_BYTES);
  });

  it('F16 · CORREGIDO (r2): 30 MB se rechazan con 413 ANTES de subir, crear la llamada y cobrar', async () => {
    const big = Buffer.alloc(30 * 1024 * 1024);
    big.write('RIFF', 0, 'latin1');
    big.write('WAVE', 8, 'latin1');
    const db = manualDb();
    await expect(createManualCallWithAudio(7, 'usr-1', { audio: big, opportunityId: 'opp-1' }, db.client())).rejects.toMatchObject({ status: 413 });
    expect(db.rows('calls')).toHaveLength(0);
    expect(db.rows('call_recordings')).toHaveLength(0);
    expect(db.storageCalls).toHaveLength(0);
    expect(chargeAiCredits).not.toHaveBeenCalled();
  });
});
