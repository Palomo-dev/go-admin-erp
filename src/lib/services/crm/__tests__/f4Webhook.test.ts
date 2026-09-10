/**
 * TESTER F4 — webhook asíncrono de ElevenLabs Scribe (FASE-04 §4.3).
 * Se firma el body con el MISMO algoritmo del SDK (HMAC-SHA256 sobre
 * `${t}.${rawBody}`) para ejercer la verificación real, no un doble.
 */
import { createHmac } from 'crypto';
import { NextRequest } from 'next/server';
import { FakeDb } from './fixtures/fakeSupabase';

let fake: FakeDb;
const enqueueAnalyze = jest.fn(async () => 'job-analyze-1');
jest.mock('@/lib/supabase/server-service', () => ({ getServiceClient: jest.fn(() => fake.client()), assertServerOnly: jest.fn() }));
jest.mock('@/lib/services/crm/callIntelligenceService', () => ({ enqueueAnalyze: (...a: unknown[]) => enqueueAnalyze(...(a as [])) }));
jest.mock('@/lib/services/crm/callAiPolicy', () => ({ getCallAiPolicy: jest.fn(async () => ({ autoAnalyze: true })) }));

import { POST } from '@/app/api/crm/webhooks/elevenlabs/route';
import { completeTranscriptFromWebhook } from '@/lib/services/crm/transcriptionService';

const SECRET = 'wsec_test_f4';

function sign(body: string, secret = SECRET, tsSeconds = Math.floor(Date.now() / 1000)): string {
  const digest = createHmac('sha256', secret).update(`${tsSeconds}.${body}`).digest('hex');
  return `t=${tsSeconds},v0=${digest}`;
}

function req(body: string, sig?: string): NextRequest {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (sig) headers.set('elevenlabs-signature', sig);
  return new NextRequest('http://localhost/api/crm/webhooks/elevenlabs', { method: 'POST', headers, body });
}

const SCRIBE_PAYLOAD = {
  transcription_id: 'req-abc',
  language_code: 'spa',
  language_probability: 0.99,
  audio_duration_secs: 45,
  text: 'Buenas tardes, le llamo por la propuesta. Perfecto, la espero.',
  words: [
    { text: 'Buenas', start: 0.0, end: 0.4, speaker_id: 'speaker_0', type: 'word' },
    { text: 'tardes', start: 0.4, end: 0.9, speaker_id: 'speaker_0', type: 'word' },
    { text: 'Perfecto', start: 5.0, end: 5.5, speaker_id: 'speaker_1', type: 'word' },
  ],
};

function seed(status = 'processing') {
  return new FakeDb({
    tables: {
      calls: [{ id: 'call-1', organization_id: 7, direction: 'outbound', mode: 'browser' }],
      call_transcripts: [{ id: 'tr-1', organization_id: 7, call_id: 'call-1', provider: 'elevenlabs', language: 'spa', status, duration_seconds: 45, raw_response: { provider_request_id: 'req-abc', pending: true, credits: 2, recording_id: 'rec-1' } }],
      call_transcript_segments: [],
    },
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.ELEVENLABS_WEBHOOK_SECRET = SECRET;
  fake = seed();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  jest.restoreAllMocks();
  delete process.env.ELEVENLABS_WEBHOOK_SECRET;
});

describe('W · Webhook ElevenLabs (fail-closed)', () => {
  it('W1 · sin ELEVENLABS_WEBHOOK_SECRET → 401 (nunca "warn & continue")', async () => {
    delete process.env.ELEVENLABS_WEBHOOK_SECRET;
    const res = await POST(req(JSON.stringify({ type: 'speech_to_text_transcription' })));
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: 'webhook not configured' });
  });

  it('W2 · con secreto pero sin cabecera de firma → 401', async () => {
    const res = await POST(req(JSON.stringify({ type: 'speech_to_text_transcription' })));
    expect(res.status).toBe(401);
  });

  it('W3 · firma inválida → 401 y no toca la BD', async () => {
    const body = JSON.stringify({ type: 'speech_to_text_transcription', data: SCRIBE_PAYLOAD });
    const res = await POST(req(body, 't=9999999999,v0=deadbeef'));
    expect(res.status).toBe(401);
    expect(fake.rows('call_transcripts')[0].status).toBe('processing');
  });

  it('W4 · firma con el secreto EQUIVOCADO → 401', async () => {
    const body = JSON.stringify({ type: 'speech_to_text_transcription', data: SCRIBE_PAYLOAD });
    const res = await POST(req(body, sign(body, 'otro-secreto')));
    expect(res.status).toBe(401);
  });

  it('W5 · replay: timestamp de hace 2 horas → 401 (fuera de tolerancia)', async () => {
    const body = JSON.stringify({ type: 'speech_to_text_transcription', data: SCRIBE_PAYLOAD });
    const old = Math.floor(Date.now() / 1000) - 2 * 3600;
    const res = await POST(req(body, sign(body, SECRET, old)));
    expect(res.status).toBe(401);
  });

  it('W6 · body manipulado tras firmar → 401', async () => {
    const original = JSON.stringify({ type: 'speech_to_text_transcription', data: SCRIBE_PAYLOAD });
    const sig = sign(original);
    const tampered = JSON.stringify({ type: 'speech_to_text_transcription', data: { ...SCRIBE_PAYLOAD, text: 'texto inyectado' } });
    const res = await POST(req(tampered, sig));
    expect(res.status).toBe(401);
  });

  it('W7 · firma válida + request_id desconocido → 200 matched:false (sin enumeración)', async () => {
    const body = JSON.stringify({ type: 'speech_to_text_transcription', data: { ...SCRIBE_PAYLOAD, request_id: 'no-existe' } });
    const res = await POST(req(body, sign(body)));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ received: true, matched: false });
    expect(enqueueAnalyze).not.toHaveBeenCalled();
  });

  it('W8 · firma válida + otro tipo de evento → 200 ignorado', async () => {
    const body = JSON.stringify({ type: 'post_call_transcription', data: {} });
    const res = await POST(req(body, sign(body)));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ignored: 'post_call_transcription' });
  });

  it('W9 · firma válida + request_id conocido → completa la transcripción y encola analyze', async () => {
    const body = JSON.stringify({ type: 'speech_to_text_transcription', data: { request_id: 'req-abc', transcription: SCRIBE_PAYLOAD } });
    const res = await POST(req(body, sign(body)));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json).toMatchObject({ matched: true, status: 'completed' });
    const t = fake.rows('call_transcripts')[0];
    expect(t.status).toBe('completed');
    expect(t.full_text).toContain('Buenas tardes');
    expect(fake.rows('call_transcript_segments').length).toBeGreaterThan(0);
    expect(enqueueAnalyze).toHaveBeenCalledWith(7, 'call-1', {}, expect.anything());
  });

  it('W10 · evento DUPLICADO → idempotente: no reescribe ni duplica segmentos', async () => {
    const body = JSON.stringify({ type: 'speech_to_text_transcription', data: { request_id: 'req-abc', transcription: SCRIBE_PAYLOAD } });
    await POST(req(body, sign(body)));
    const segs = fake.rows('call_transcript_segments').length;
    const completedAt = fake.rows('call_transcripts')[0].completed_at;
    const res2 = await POST(req(body, sign(body)));
    expect(res2.status).toBe(200);
    expect(fake.rows('call_transcripts')).toHaveLength(1);
    expect(fake.rows('call_transcript_segments')).toHaveLength(segs);
    expect(fake.rows('call_transcripts')[0].completed_at).toBe(completedAt);
  });

  it('W11 · CORREGIDO (r2): el evento duplicado NO vuelve a encolar `analyze` (idempotencia en la propia ruta)', async () => {
    const body = JSON.stringify({ type: 'speech_to_text_transcription', data: { request_id: 'req-abc', transcription: SCRIBE_PAYLOAD } });
    const r1 = await POST(req(body, sign(body)));
    const r2 = await POST(req(body, sign(body)));
    expect(enqueueAnalyze).toHaveBeenCalledTimes(1);
    expect(await r1.json()).toMatchObject({ duplicate: false, analyze_job_id: 'job-analyze-1' });
    expect(await r2.json()).toMatchObject({ duplicate: true, analyze_job_id: null });
  });

  it('W11b · CORREGIDO (r2): cinco reintentos del proveedor siguen dejando UN solo analyze', async () => {
    const body = JSON.stringify({ type: 'speech_to_text_transcription', data: { request_id: 'req-abc', transcription: SCRIBE_PAYLOAD } });
    for (let i = 0; i < 5; i++) await POST(req(body, sign(body)));
    expect(enqueueAnalyze).toHaveBeenCalledTimes(1);
    expect(fake.rows('call_transcripts')).toHaveLength(1);
  });

  it('W12 · la organización NUNCA se toma del payload (viene de la fila localizada)', async () => {
    const body = JSON.stringify({ type: 'speech_to_text_transcription', data: { request_id: 'req-abc', organization_id: 999, transcription: SCRIBE_PAYLOAD } });
    await POST(req(body, sign(body)));
    expect(enqueueAnalyze).toHaveBeenCalledWith(7, 'call-1', {}, expect.anything());
    expect(fake.rows('call_transcripts')[0].organization_id).toBe(7);
  });

  it('W13 · completeTranscriptFromWebhook con request_id desconocido devuelve null', async () => {
    expect(await completeTranscriptFromWebhook('nope', { request_id: 'nope' }, fake.client())).toBeNull();
  });

  it('W14 · completeTranscriptFromWebhook sobre una transcripción ya completed la devuelve sin reescribir', async () => {
    fake = seed('completed');
    const t = await completeTranscriptFromWebhook('req-abc', { request_id: 'req-abc', transcription: SCRIBE_PAYLOAD }, fake.client());
    expect(t?.status).toBe('completed');
    expect(fake.rows('call_transcript_segments')).toHaveLength(0);
  });
});
