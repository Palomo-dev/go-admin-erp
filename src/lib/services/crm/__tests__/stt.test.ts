/**
 * Adaptadores STT (FASE-04 §9.1): mapeo de respuestas reales de cada
 * proveedor a `TranscriptResult` y cascada `transcribeWithFallback`.
 * Sin red: los SDKs se importan dinámicamente solo dentro de `transcribe()`.
 */
import {
  mapScribeResponse,
  toScribeLanguage,
  mapGeminiSegments,
  parseTimestampToMs,
  recommendedGeminiModel,
  GEMINI_STT_MODEL,
  splitTextIntoSegments,
  groupWordsIntoSegments,
  logprobToConfidence,
  normalizeSttProvider,
  transcribeWithFallback,
  SttChainError,
  SttProviderError,
  toSttError,
  type SttAdapter,
  type SttInput,
  type TranscriptResult,
} from '../stt';
import { scribeSingleChannel, scribeMultiChannel, scribeWebhookTranscription, geminiSegmentsJson } from './fixtures/sttFixtures';

const baseInput: SttInput = { audio: Buffer.alloc(2048), mimeType: 'audio/mpeg', language: 'spa', channels: 1, durationSeconds: 9 };

describe('ElevenLabs Scribe — mapScribeResponse', () => {
  it('single-channel: agrupa words por hablante/pausa, ignora spacing/audio_event y conserva ids', () => {
    const r = mapScribeResponse(scribeSingleChannel as never, { language: 'spa', durationSeconds: 8 });
    expect(r.provider).toBe('elevenlabs');
    expect(r.model).toBe('scribe_v2');
    expect(r.language).toBe('spa');
    expect(r.language_probability).toBe(0.98);
    expect(r.provider_request_id).toBe('stt_single_001');
    expect(r.text).toBe(scribeSingleChannel.text);
    expect(r.speaker_count).toBe(2);
    // speaker_0 (0.1-2.3) | speaker_1 (2.9-4.5) | pausa 1.3 s > 800 ms → nuevo segmento speaker_1 (5.8-6.9) | speaker_0 (7.3-8.0)
    expect(r.segments.map((s) => [s.speaker_label, s.start_ms, s.end_ms])).toEqual([
      ['speaker_0', 100, 2300],
      ['speaker_1', 2900, 4500],
      ['speaker_1', 5800, 6900],
      ['speaker_0', 7300, 8000],
    ]);
    expect(r.segments[0].text).toBe('Hola, buenas tardes, llamo por la cotización.');
    expect(r.segments[0].text).not.toContain('(risas)');
    expect(r.segments[0].confidence).toBeGreaterThan(0.9);
    expect(r.segments.every((s) => s.channel_index === null)).toBe(true);
    expect(r.duration_seconds).toBe(8);
    expect(r.cost_usd).toBeCloseTo((8 / 3600) * 0.22, 6);
    // raw sin words (peso) salvo CALL_AI_DEBUG
    expect(r.raw.words).toBeUndefined();
    expect(r.raw.word_count).toBe(20);
  });

  it('multicanal (use_multi_channel): cada palabra lleva channel_index y el hablante es chN', () => {
    const r = mapScribeResponse(scribeMultiChannel as never, { language: 'spa', durationSeconds: null });
    expect(r.provider_request_id).toBe('stt_multi_001');
    expect(r.duration_seconds).toBe(9);
    expect(r.speaker_count).toBe(2);
    const labels = new Set(r.segments.map((s) => s.speaker_label));
    expect(labels).toEqual(new Set(['ch0', 'ch1']));
    expect(r.segments.every((s) => s.channel_index === 0 || s.channel_index === 1)).toBe(true);
    // Ordenados en el tiempo aunque vengan por canal
    const starts = r.segments.map((s) => s.start_ms);
    expect([...starts].sort((a, b) => a - b)).toEqual(starts);
    expect(r.segments[0]).toMatchObject({ speaker_label: 'ch0', channel_index: 0, text: 'Buenas tardes, le habla Ana de GO Admin.' });
    expect(r.segments[1]).toMatchObject({ speaker_label: 'ch1', channel_index: 1 });
    expect(r.text).toContain('el precio es muy alto');
    expect(r.raw.channels).toBe(2);
  });

  it('webhook (snake_case): speaker_id / transcription_id / audio_duration_secs', () => {
    const r = mapScribeResponse(scribeWebhookTranscription as never, { language: 'spa', durationSeconds: null });
    expect(r.provider_request_id).toBe('stt_webhook_001');
    expect(r.duration_seconds).toBe(4);
    expect(r.language_probability).toBe(0.96);
    expect(r.segments.map((s) => s.speaker_label)).toEqual(['speaker_0', 'speaker_1']);
    expect(r.segments[1].text).toBe('Sí, cuéntame.');
  });

  it('toScribeLanguage normaliza es/es-CO → spa y respeta códigos ISO', () => {
    expect(toScribeLanguage('es')).toBe('spa');
    expect(toScribeLanguage('es-CO')).toBe('spa');
    expect(toScribeLanguage('eng')).toBe('eng');
    expect(toScribeLanguage('en')).toBe('en');
    expect(toScribeLanguage(undefined)).toBe('spa');
    expect(toScribeLanguage('portugues-brasil')).toBe('spa');
  });

  it('logprobToConfidence acota 0..1', () => {
    expect(logprobToConfidence(0)).toBe(1);
    expect(logprobToConfidence(-0.6931)).toBeCloseTo(0.5, 3);
    expect(logprobToConfidence(null)).toBeNull();
  });
});

describe('groupWordsIntoSegments', () => {
  it('corta por cambio de hablante o pausa > pauseMs y promedia confianza', () => {
    const segs = groupWordsIntoSegments(
      [
        { text: 'a', start_ms: 0, end_ms: 100, speaker: 's0', confidence: 1 },
        { text: 'b', start_ms: 150, end_ms: 200, speaker: 's0', confidence: 0.5 },
        { text: 'c', start_ms: 1500, end_ms: 1600, speaker: 's0', confidence: 0.8 },
        { text: 'd', start_ms: 1650, end_ms: 1700, speaker: 's1' },
        { text: '', start_ms: 1700, end_ms: 1700, speaker: 's1' },
      ],
      800,
    );
    expect(segs).toHaveLength(3);
    expect(segs[0]).toMatchObject({ speaker_label: 's0', start_ms: 0, end_ms: 200, text: 'a b', confidence: 0.75 });
    expect(segs[1]).toMatchObject({ speaker_label: 's0', start_ms: 1500, text: 'c' });
    expect(segs[2]).toMatchObject({ speaker_label: 's1', text: 'd', confidence: null });
  });
});

describe('Gemini — mapGeminiSegments', () => {
  it('parsea timestamps MM:SS.mmm, descarta segmentos vacíos y calcula costo por tokens de audio', () => {
    const r = mapGeminiSegments(geminiSegmentsJson, { language: 'spa', durationSeconds: 8 }, { id: 'int_1', api: 'interactions' });
    expect(r.provider).toBe('google');
    expect(r.model).toBe(GEMINI_STT_MODEL);
    expect(r.language).toBe('es');
    expect(r.segments).toHaveLength(3);
    expect(r.segments[0]).toMatchObject({ speaker_label: 'speaker_0', start_ms: 200, end_ms: 2400, channel_index: null, confidence: null });
    expect(r.segments[1].start_ms).toBe(2800);
    expect(r.speaker_count).toBe(2);
    expect(r.duration_seconds).toBe(8);
    expect(r.provider_request_id).toBe('int_1');
    expect(r.cost_usd).toBeGreaterThan(0);
    expect(r.text).toContain('Perfecto, le envío la propuesta hoy.');
  });

  it('sin `segments` → SttProviderError 502 reintentable', () => {
    expect(() => mapGeminiSegments({ language: 'es' }, { language: 'spa', durationSeconds: null })).toThrow(SttProviderError);
    try {
      mapGeminiSegments({}, { language: 'spa', durationSeconds: null });
    } catch (e) {
      expect((e as SttProviderError).retryable).toBe(true);
      expect((e as SttProviderError).status).toBe(502);
    }
  });

  it('recommendedGeminiModel extrae el modelo sugerido del 404 "no longer available" (visto en E2E)', () => {
    const msg = '404 This model models/gemini-2.5-flash is no longer available to new users. Please update your code to use models/gemini-3.6-flash for the latest features and improvements. We recommend you to use the Interactions API.';
    expect(recommendedGeminiModel(new Error(msg))).toBe('gemini-3.6-flash');
    expect(recommendedGeminiModel({ message: msg, status: 404 })).toBe('gemini-3.6-flash');
    expect(recommendedGeminiModel(new Error('429 Resource exhausted'))).toBeNull();
    expect(recommendedGeminiModel(new Error('404 model not found'))).toBeNull();
    expect(recommendedGeminiModel(null)).toBeNull();
  });

  it('parseTimestampToMs acepta MM:SS.mmm, H:MM:SS, segundos y números', () => {
    expect(parseTimestampToMs('00:02.400')).toBe(2400);
    expect(parseTimestampToMs('1:02:03')).toBe(3723000);
    expect(parseTimestampToMs('12.5')).toBe(12500);
    expect(parseTimestampToMs('3,25')).toBe(3250);
    expect(parseTimestampToMs(4.2)).toBe(4200);
    expect(parseTimestampToMs('abc')).toBe(0);
    expect(parseTimestampToMs(null)).toBe(0);
  });
});

describe('OpenAI — splitTextIntoSegments', () => {
  it('divide por frases y reparte la duración proporcionalmente (un solo hablante)', () => {
    const segs = splitTextIntoSegments('Hola, buenas tardes. ¿Cómo está? Le llamo por la cotización.', 10);
    expect(segs).toHaveLength(3);
    expect(segs.every((s) => s.speaker_label === 'speaker_0' && s.channel_index === null)).toBe(true);
    expect(segs[0].start_ms).toBe(0);
    expect(segs[2].end_ms).toBe(10000);
    for (let i = 1; i < segs.length; i++) expect(segs[i].start_ms).toBe(segs[i - 1].end_ms);
    expect(segs.map((s) => s.text)).toEqual(['Hola, buenas tardes.', '¿Cómo está?', 'Le llamo por la cotización.']);
  });
  it('texto vacío → sin segmentos', () => {
    expect(splitTextIntoSegments('   ', 5)).toEqual([]);
  });
});

describe('normalizeSttProvider / toSttError', () => {
  it('alias', () => {
    expect(normalizeSttProvider('gemini')).toBe('google');
    expect(normalizeSttProvider('ElevenLabs')).toBe('elevenlabs');
    expect(normalizeSttProvider('whisper')).toBe('openai');
    expect(normalizeSttProvider('deepgram')).toBeNull();
  });
  it('429/5xx/red reintentables; 401/400/413 no', () => {
    expect(toSttError('openai', { status: 429, message: 'rate' }).retryable).toBe(true);
    expect(toSttError('openai', { statusCode: 503, message: 'down' }).retryable).toBe(true);
    expect(toSttError('google', new Error('fetch failed')).retryable).toBe(true);
    expect(toSttError('elevenlabs', { status: 401, message: 'bad key' }).retryable).toBe(false);
    expect(toSttError('elevenlabs', { status: 413, message: 'too big' }).retryable).toBe(false);
    expect(toSttError('elevenlabs', new Error('schema mismatch')).retryable).toBe(false);
  });
});

function fakeAdapter(name: SttAdapter['name'], impl: (i: SttInput) => Promise<TranscriptResult>, maxDurationSeconds = 36000): SttAdapter {
  return { name, supportsDiarization: true, maxDurationSeconds, transcribe: jest.fn(impl) };
}
const okResult = (provider: SttAdapter['name']): TranscriptResult => ({
  provider,
  model: 'm',
  language: 'spa',
  text: 'ok',
  segments: [{ speaker_label: 'speaker_0', start_ms: 0, end_ms: 1000, text: 'ok', confidence: null, channel_index: null }],
  speaker_count: 1,
  duration_seconds: 1,
  raw: {},
  cost_usd: 0.001,
});

describe('transcribeWithFallback (cascada ElevenLabs → Gemini → OpenAI)', () => {
  beforeEach(() => jest.spyOn(console, 'warn').mockImplementation(() => undefined));
  afterEach(() => jest.restoreAllMocks());

  it('preferido 429 → cae al siguiente; registra intentos y fellBack', async () => {
    const a = fakeAdapter('elevenlabs', async () => { throw { status: 429, message: 'Too many requests' }; });
    const b = fakeAdapter('google', async () => okResult('google'));
    const c = fakeAdapter('openai', async () => okResult('openai'));
    const out = await transcribeWithFallback(1, baseInput, { adapters: [a, b, c] });
    expect(out.provider).toBe('google');
    expect(out.fellBack).toBe(true);
    expect(out.attempts.map((x) => [x.provider, x.ok, x.status ?? null])).toEqual([['elevenlabs', false, 429], ['google', true, null]]);
    expect(c.transcribe).not.toHaveBeenCalled();
  });

  it('todos fallan → SttChainError reintentable si hubo 429/5xx/red', async () => {
    const a = fakeAdapter('elevenlabs', async () => { throw { status: 401, message: 'invalid api key' }; });
    const b = fakeAdapter('google', async () => { throw { status: 503, message: 'overloaded' }; });
    await expect(transcribeWithFallback(1, baseInput, { adapters: [a, b] })).rejects.toBeInstanceOf(SttChainError);
    try {
      await transcribeWithFallback(1, baseInput, { adapters: [a, b] });
    } catch (e) {
      const err = e as SttChainError;
      expect(err.retryable).toBe(true);
      expect(err.attempts).toHaveLength(2);
      expect(err.message).toContain('elevenlabs=401');
      expect(err.message).toContain('google=503');
    }
  });

  it('todos fallan con errores no reintentables → retryable=false', async () => {
    const a = fakeAdapter('elevenlabs', async () => { throw { status: 401, message: 'invalid api key' }; });
    const b = fakeAdapter('openai', async () => { throw { status: 400, message: 'bad request' }; });
    await expect(transcribeWithFallback(1, baseInput, { adapters: [a, b] })).rejects.toMatchObject({ retryable: false });
  });

  it('sin adaptadores con credenciales → SttChainError no reintentable', async () => {
    await expect(transcribeWithFallback(1, baseInput, { adapters: [] })).rejects.toMatchObject({ name: 'SttChainError', retryable: false });
  });

  it('salta el proveedor cuya duración máxima se supera (413) sin invocarlo', async () => {
    const a = fakeAdapter('openai', async () => okResult('openai'), 1500);
    const b = fakeAdapter('elevenlabs', async () => okResult('elevenlabs'));
    const out = await transcribeWithFallback(1, { ...baseInput, durationSeconds: 3600 }, { adapters: [a, b] });
    expect(a.transcribe).not.toHaveBeenCalled();
    expect(out.provider).toBe('elevenlabs');
    expect(out.attempts[0]).toMatchObject({ provider: 'openai', ok: false, status: 413 });
  });
});
