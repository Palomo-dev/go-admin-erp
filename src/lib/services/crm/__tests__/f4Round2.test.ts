/**
 * TESTER F4 · ronda 2 — batería de re-test sobre las correcciones del builder.
 *
 * No repite la ronda 1: ataca EXCLUSIVAMENTE lo que cambió (`settleCreditDelta`,
 * el reembolso garantizado, la reconciliación de costos, el cerrojo de
 * actividades, `markFailed`/`expireStuckTranscript`, los límites de tamaño y el
 * enmascarado de datos sensibles) buscando regresiones y agujeros nuevos.
 *
 * Todo con dobles en memoria (fakeSupabase): sin red ni BD.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { FakeDb } from './fixtures/fakeSupabase';

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
const getUnitCost = jest.fn(async (_p: string, _sku: string): Promise<number | null> => 0.75);
jest.mock('@/lib/services/crm/pricingService', () => ({ getUnitCost: (...a: unknown[]) => (getUnitCost as unknown as (...x: unknown[]) => Promise<number | null>)(...a), round6: (n: number) => n }));
jest.mock('@/lib/services/crm/callAiPolicy', () => ({ getCallAiPolicy: jest.fn() }));
jest.mock('@/lib/services/crm/recordingStorageService', () => ({ downloadFromTwilio: jest.fn() }));
jest.mock('@/lib/services/providerCredentials.server', () => ({ getProviderCredentials: jest.fn(), getProviderSettings: jest.fn() }));
jest.mock('@/lib/services/crm/stageGateService', () => ({ evaluateStageGate: jest.fn(async () => ({ ok: true, missing: [] })) }));

const transcribeWithFallbackMock = jest.fn();
jest.mock('@/lib/services/crm/stt', () => {
  const actual = jest.requireActual('@/lib/services/crm/stt');
  return { ...actual, transcribeWithFallback: (...a: unknown[]) => transcribeWithFallbackMock(...a) };
});

import { getCallAiPolicy } from '@/lib/services/crm/callAiPolicy';
import {
  transcribeCall,
  settleCreditDelta,
  expireStuckTranscript,
  reconcileAiUsageModel,
  TranscriptionError,
  STT_MAX_AUDIO_BYTES,
  MAX_PROCESSING_MS,
} from '@/lib/services/crm/transcriptionService';
import { analyzeCall, AnalysisError } from '@/lib/services/crm/callAnalysisService';
import { upsertCallActivity } from '@/lib/services/crm/callActivityService';
import { maskSensitiveForLlm, assertDbEnum, buildObjectionRow, AI_AUTHOR_VALUE } from '@/lib/services/crm/callAnalysisRules';
import { ElevenLabsScribeAdapter } from '@/lib/services/crm/stt/elevenLabsScribe';
import { GeminiAudioAdapter } from '@/lib/services/crm/stt/geminiAudio';
import { OpenAiTranscribeAdapter } from '@/lib/services/crm/stt/openaiTranscribe';
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

const LLM = {
  summary: 'El cliente pide propuesta formal.',
  sentiment: 'positive',
  sentiment_score: 0.6,
  quality_score: 72,
  quality_breakdown: { greeting: 8, discovery: 7, pitch: 7, objection_handling: 6, closing: 7, professionalism: 9 },
  talk_ratio_agent: 0.55,
  talk_ratio_customer: 0.45,
  longest_monologue_seconds: 22,
  questions_asked: 5,
  next_steps: [{ action: 'Enviar propuesta', owner: 'agent', due_date: '2026-09-15' }],
  objections: [],
  competitors: [],
  budget_mentioned: null,
  decision_maker_identified: true,
  discovery: { budget: null, authority: null, need: 'CRM', timeline: null, goals: null, obstacles: null, consequences: null },
  suggested_stage_id: null,
  suggested_stage_confidence: 0,
  suggested_tasks: [],
  tags: [],
  temperature: 'warm',
};

function analysisDb(over: Record<string, any[]> = {}) {
  return new FakeDb({
    tables: {
      calls: [{ id: 'call-r2', organization_id: 7, direction: 'outbound', mode: 'browser', status: 'completed', answered_by: 'human', started_at: '2026-09-01T10:00:00Z', ended_at: '2026-09-01T10:01:00Z', duration_seconds: 120, customer_id: null, opportunity_id: null, user_id: 'usr-1' }],
      customers: [],
      opportunities: [],
      stages: [],
      objections: [],
      call_tags: [],
      call_tag_relations: [],
      call_transcripts: [{ id: 'tr-r2', organization_id: 7, call_id: 'call-r2', provider: 'elevenlabs', provider_model: 'scribe_v2', language: 'spa', status: 'completed', full_text: 'Hola, buenas tardes.', word_count: 4, speaker_count: 2, duration_seconds: 120, raw_response: {}, created_at: '2026-09-01T10:02:00Z' }],
      call_transcript_segments: [],
      call_analyses: [],
      activities: [],
      tasks: [],
      opportunity_objections: [],
      ai_usage_logs: [{ id: 101, model: 'gemini-3.8-flash', metadata: { provider: 'google', unit_sku: 'gemini_3_8_flash_in', cost_amount: 0.01 } }],
      ...over,
    },
    checks: {
      call_analyses: { sentiment: ['positive', 'neutral', 'negative', 'mixed'] },
      tasks: { priority: TASK_PRIORITIES, status: TASK_STATUSES },
      opportunity_objections: { detected_by: ['manual', 'ia'] },
      call_tag_relations: { source: ['manual', 'ia'] },
    },
  });
}

function sttDb(over: Record<string, any[]> = {}, storagePath = 'org_7/2026/09/call-s.wav', bytes = 90000) {
  return new FakeDb({
    tables: {
      calls: [{ id: 'call-s', organization_id: 7, direction: 'outbound', mode: 'browser', status: 'completed', answered_by: 'human', started_at: '2026-09-01T10:00:00Z', ended_at: '2026-09-01T10:01:00Z', duration_seconds: 3600, customer_id: null, opportunity_id: null, user_id: 'usr-1' }],
      call_recordings: [{ id: 'rec-s', organization_id: 7, call_id: 'call-s', storage_path: storagePath, storage_provider: 'supabase', channels: '2', duration_seconds: 3600, size_bytes: bytes, status: 'ready' }],
      call_transcripts: [],
      call_transcript_segments: [],
      ai_usage_logs: [{ id: 90, model: 'scribe_v2', metadata: { provider: 'elevenlabs', unit_sku: 'scribe' } }],
      ...over,
    },
    storage: { [storagePath]: Buffer.alloc(bytes, 1) },
    checks: { call_transcripts: { status: ['pending', 'processing', 'completed', 'failed'] } },
    unique: { call_transcripts: ['call_id'] },
  });
}

const okSttResult = (provider: string, model: string, cost: number | null) => ({
  result: { provider, model, language: 'spa', text: 'Buenas tardes.', segments: [{ speaker_label: 'speaker_0', start_ms: 0, end_ms: 2000, text: 'Buenas tardes.', confidence: 0.9, channel_index: null }], speaker_count: 1, duration_seconds: 3600, raw: {}, cost_usd: cost, provider_request_id: null },
  attempts: [{ provider, ok: true, ms: 1 }],
  provider,
  fellBack: true,
});

beforeEach(() => {
  jest.clearAllMocks();
  (getCallAiPolicy as jest.Mock).mockResolvedValue(POLICY);
  getUnitCost.mockResolvedValue(0.75);
  refundAiCredits.mockResolvedValue(true);
  chargeAiCredits.mockResolvedValue({ credits: 1, logId: 101, cost_amount: 0.001 });
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

const totalRefunded = () => (refundAiCredits.mock.calls as unknown as Array<[{ credits?: number }]>).reduce((n, c) => n + (c[0].credits ?? 0), 0);
const totalCharged = () => (chargeAiCredits.mock.calls as unknown as Array<[{ credits?: number }]>).reduce((n, c) => n + (c[0].credits ?? 0), 0);

// ═══════════════════════════════════════════════════════════════════════════
describe('R-A · settleCreditDelta y conservación de créditos tras el cobro', () => {
  it('R1 · unidad: delta 0 no toca créditos', async () => {
    const s = await settleCreditDelta({ orgId: 7, actionType: 'call_analyze', model: 'm', provider: 'google', chargedCredits: 5, realCredits: 5, logId: 1 });
    // r4: `CreditSettlement` añade `unrefunded`/`error` (lo que la RPC rechazó).
    // Mismos valores de dinero que antes, más los dos campos nuevos EXPLÍCITOS.
    expect(s).toEqual({ credits: 5, delta: 0, ok: true, unrefunded: 0, error: null });
    expect(chargeAiCredits).not.toHaveBeenCalled();
    expect(refundAiCredits).not.toHaveBeenCalled();
  });

  it('R2 · unidad: infracobro → débito extra con action_type "<accion>:adjust"', async () => {
    chargeAiCredits.mockResolvedValue({ credits: 9, logId: 2 });
    const s = await settleCreditDelta({ orgId: 7, actionType: 'call_transcribe', model: 'gpt-transcribe', provider: 'openai', chargedCredits: 22, realCredits: 31, logId: 1 });
    expect(s).toEqual({ credits: 31, delta: 9, ok: true, unrefunded: 0, error: null });
    expect((chargeAiCredits.mock.calls[0][0] as any).actionType).toBe('call_transcribe:adjust');
    expect((chargeAiCredits.mock.calls[0][0] as any).credits).toBe(9);
  });

  it('R3 · unidad: sobrecobro → reembolso EXACTO de la diferencia', async () => {
    const s = await settleCreditDelta({ orgId: 7, actionType: 'call_transcribe', model: 'm', provider: 'openai', chargedCredits: 27, realCredits: 22, logId: 1 });
    expect(s).toEqual({ credits: 22, delta: -5, ok: true, unrefunded: 0, error: null });
    expect(totalRefunded()).toBe(5);
  });

  it('R4 · unidad: si el ajuste falla NO se tumba el trabajo ni se entra en bucle (una sola llamada)', async () => {
    chargeAiCredits.mockRejectedValue(new InsufficientCreditsError());
    const s = await settleCreditDelta({ orgId: 7, actionType: 'call_analyze', model: 'm', provider: 'google', chargedCredits: 1, realCredits: 40, logId: 1 });
    // El ajuste AL ALZA que lanza sigue sin tumbar el trabajo, y ahora además
    // dice POR QUÉ no se aplicó (r4): nada que devolver, pero `error` no es null.
    expect(s).toMatchObject({ credits: 1, delta: 0, ok: false, unrefunded: 0 });
    expect(s.error).toMatch(/insuficientes/i);
    expect(chargeAiCredits).toHaveBeenCalledTimes(1);
  });

  it('R5 · unidad: el ajuste no puede dejar saldo negativo por sí mismo (el débito pasa por chargeAiCredits, que valida saldo)', async () => {
    chargeAiCredits.mockRejectedValue(new InsufficientCreditsError());
    const s = await settleCreditDelta({ orgId: 7, actionType: 'call_analyze', model: 'm', provider: 'google', chargedCredits: 1, realCredits: 999999, logId: 1 });
    expect(s.ok).toBe(false);
    expect(s.credits).toBe(1);
  });

  it('R6 · CORREGIDO (r3): sobrecobro ajustado + fallo al persistir devuelve EXACTAMENTE lo cobrado, no el doble', async () => {
    // MISMO escenario que denunciaba el defecto: cobro 30 créditos, uso real
    // mínimo → `settle` reembolsa la diferencia (29); después el INSERT de
    // call_analyses falla. Antes el catch devolvía OTROS 30 (59 por un cobro de
    // 30). Ahora el libro mayor (`CreditLedger`) sólo devuelve el saldo vivo (1).
    const db = analysisDb();
    db.failOn['call_analyses:insert'] = 'boom persistiendo';
    chargeAiCredits.mockResolvedValue({ credits: 30, logId: 101 });
    await expect(
      analyzeCall(7, 'call-r2', { supabase: db.client(), runners: { google: jest.fn(async () => ({ parsed: LLM, usage: { input: 100, output: 50 } })) } as any }),
    ).rejects.toMatchObject({ code: 'PERSIST_ERROR' });
    // `chargeAiCredits` devolvió 30 créditos cobrados: se devuelven exactamente 30.
    expect(totalRefunded()).toBe(30);
    // Y son dos movimientos coherentes (29 del ajuste + 1 del cierre), no dos cobros completos.
    expect(refundAiCredits).toHaveBeenCalledTimes(2);
    expect((refundAiCredits.mock.calls as any)[0][0].credits).toBe(29);
    expect((refundAiCredits.mock.calls as any)[1][0].credits).toBe(1);
  });

  it('R7 · CORREGIDO (r3): infracobro ajustado + fallo al persistir devuelve TAMBIÉN el débito extra', async () => {
    const db = analysisDb();
    db.failOn['call_analyses:insert'] = 'boom persistiendo';
    chargeAiCredits.mockResolvedValueOnce({ credits: 1, logId: 101 }).mockResolvedValue({ credits: 99, logId: 102 });
    await expect(
      analyzeCall(7, 'call-r2', { supabase: db.client(), runners: { google: jest.fn(async () => ({ parsed: LLM, usage: { input: 50_000_000, output: 10_000_000 } })) } as any }),
    ).rejects.toMatchObject({ code: 'PERSIST_ERROR' });
    const adjust = chargeAiCredits.mock.calls.find((c) => (c[0] as any).actionType === 'call_analyze:adjust');
    expect(adjust).toBeDefined();
    // Se debitó 1 (cobro inicial) + el delta del ajuste; se devuelve TODO.
    const adjustCredits = (adjust![0] as any).credits as number;
    expect(adjustCredits).toBeGreaterThan(0);
    expect(totalRefunded()).toBe(1 + adjustCredits);
  });

  it('R8 · CORREGIDO (r4): si el propio reembolso falla, el error LO DICE y queda fila conciliable', async () => {
    // MISMO escenario y datos que cuando este caso afirmaba el defecto: cobro 6,
    // el INSERT de call_analyses falla y `refundAiCredits` devuelve false (NO lanza).
    // Antes se comprobaba `.not.toMatch(/reembols/i)`, que pasaba por accidente de
    // vocabulario (el mensaje dice "devolver") y no vigilaba nada (tester r3 N2).
    const db = analysisDb();
    db.failOn['call_analyses:insert'] = 'boom';
    chargeAiCredits.mockResolvedValue({ credits: 6, logId: 101 });
    refundAiCredits.mockResolvedValue(false);
    const err = await analyzeCall(7, 'call-r2', { supabase: db.client(), runners: { google: jest.fn(async () => ({ parsed: LLM, usage: { input: 600, output: 100 } })) } as any }).catch((e) => e);
    expect(err).toBeInstanceOf(AnalysisError);
    expect((err as AnalysisError).code).toBe('PERSIST_ERROR');
    expect((err as AnalysisError).retryable).toBe(false);
    expect(refundAiCredits).toHaveBeenCalled();
    // 1) el mensaje dice CUÁNTO no volvió y DÓNDE conciliarlo…
    const msg = String((err as Error).message);
    expect(msg).toMatch(/no se pudieron devolver 6 créditos/i);
    expect(msg).toContain("ai_usage_logs 'call_analyze:refund_failed'");
    // …y no infla la cifra sumando el ajuste rechazado, que el cierre ya reintentó.
    expect(msg).not.toMatch(/devolver (?:5|11) créditos/i);
    // 2) …y la traza existe en la BD: fila con credits_consumed 0 y el importe vivo.
    const failed = db.rows('ai_usage_logs').filter((r: any) => r.action_type === 'call_analyze:refund_failed');
    expect(failed.length).toBeGreaterThan(0);
    const close = failed.find((r: any) => r.metadata?.stage === 'close');
    expect(close).toBeDefined();
    expect(close?.credits_consumed).toBe(0);
    expect(close?.metadata.pending_refund_credits).toBe(6);
  });

  it('R9 · el fallo del PROVEEDOR sigue siendo reintentable (la corrección no se pasó de frenada)', async () => {
    const db = analysisDb();
    chargeAiCredits.mockResolvedValue({ credits: 4, logId: 101 });
    const err = await analyzeCall(7, 'call-r2', {
      supabase: db.client(),
      runners: { google: jest.fn(async () => { throw Object.assign(new Error('503'), { status: 503 }); }), openai: jest.fn(async () => { throw Object.assign(new Error('503'), { status: 503 }); }) } as any,
    }).catch((e) => e);
    expect((err as AnalysisError).code).toBe('PROVIDER_ERROR');
    expect((err as AnalysisError).retryable).toBe(true);
    expect(totalRefunded()).toBe(4);
  });

  it('R10 · camino feliz: el crédito cobrado y el ajustado quedan reflejados en raw_response', async () => {
    const db = analysisDb();
    chargeAiCredits.mockResolvedValue({ credits: 30, logId: 101 });
    const a = await analyzeCall(7, 'call-r2', { supabase: db.client(), runners: { google: jest.fn(async () => ({ parsed: LLM, usage: { input: 100, output: 50 } })) } as any });
    expect(a.raw_response?.credits_charged).toBe(30);
    expect(a.raw_response?.credits_adjustment).toBeLessThan(0);
    expect(a.raw_response?.credits).toBe(30 + (a.raw_response!.credits_adjustment as number));
  });

  it('R11 · transcripción: fallo determinista al persistir → PERSIST_ERROR no reintentable + reembolso del cobro', async () => {
    const db = sttDb();
    chargeAiCredits.mockResolvedValue({ credits: 5, logId: 90, cost_amount: 0.05 });
    transcribeWithFallbackMock.mockResolvedValue(okSttResult('openai', 'gpt-transcribe', 0.05));
    const client = db.client();
    // El UPDATE final de persistTranscript falla.
    let updates = 0;
    const orig = (client as any).from;
    (client as any).from = (t: string) => {
      const b = orig(t);
      if (t === 'call_transcripts') {
        const origUpdate = b.update.bind(b);
        b.update = (p: any) => { updates++; if (p.status === 'completed') db.failOn['call_transcripts:update'] = 'update completed falló'; return origUpdate(p); };
      }
      return b;
    };
    const err = await transcribeCall(7, 'call-s', { supabase: client as SupabaseClient }).catch((e) => e);
    expect(err).toBeInstanceOf(TranscriptionError);
    expect((err as TranscriptionError).code).toBe('PERSIST_ERROR');
    expect((err as TranscriptionError).retryable).toBe(false);
    expect(updates).toBeGreaterThan(0);
  });

  it('R12 · CORREGIDO (r3): la rama de webhook (pending) está DENTRO del try/catch: reembolsa y no es reintentable', async () => {
    (getCallAiPolicy as jest.Mock).mockResolvedValue({ ...POLICY, asyncWebhook: true });
    const db = sttDb();
    chargeAiCredits.mockResolvedValue({ credits: 22, logId: 90, cost_amount: 0.22 });
    transcribeWithFallbackMock.mockResolvedValue({
      result: { provider: 'elevenlabs', model: 'scribe_v2', language: 'spa', text: '', segments: [], speaker_count: 0, duration_seconds: null, raw: {}, cost_usd: null, provider_request_id: 'req-1', pending: true },
      attempts: [{ provider: 'elevenlabs', ok: true, ms: 1 }],
      provider: 'elevenlabs',
      fellBack: false,
    });
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
    // Es TranscriptionError PERSIST_ERROR no reintentable → `jobs/handlers/transcribe.ts`
    // lo mapea a JobFatalError: UN envío al proveedor, UN cobro y su reembolso,
    // en vez de tres intentos cobrando tres veces.
    expect(err).toBeInstanceOf(TranscriptionError);
    expect(err).toMatchObject({ code: 'PERSIST_ERROR', retryable: false });
    expect(totalRefunded()).toBe(22);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('R-B · costo y créditos por proveedor EFECTIVO', () => {
  it('R13 · STT con fallback: unit_sku, units, cost_amount y model son los del proveedor que respondió', async () => {
    const db = sttDb();
    getUnitCost.mockImplementation(async (p: any, sku: any) => (sku === 'gpt_transcribe' ? 0.0045 : 0.22));
    chargeAiCredits.mockResolvedValue({ credits: 22, logId: 90, cost_amount: 0.22 });
    transcribeWithFallbackMock.mockResolvedValue(okSttResult('openai', 'gpt-transcribe', 0.27));
    await transcribeCall(7, 'call-s', { supabase: db.client() as SupabaseClient });
    const log = db.tables.ai_usage_logs.find((r) => r.id === 90)!;
    expect(log.model).toBe('gpt-transcribe');
    expect(log.metadata.provider).toBe('openai');
    expect(log.metadata.unit_sku).toBe('gpt_transcribe');
    expect(log.metadata.units).toBeCloseTo(60, 3); // 3600 s = 60 minutos
    expect(log.cost_amount).toBe(0.27);
    expect(log.metadata.estimated_unit_sku).toBe('scribe');
  });

  it('R14 · STT con fallback: los créditos se ajustan al proveedor real (infracobro corregido)', async () => {
    const db = sttDb();
    getUnitCost.mockImplementation(async (p: any, sku: any) => (sku === 'gpt_transcribe' ? 0.0045 : 0.22));
    chargeAiCredits.mockResolvedValueOnce({ credits: 22, logId: 90, cost_amount: 0.22 }).mockResolvedValue({ credits: 5, logId: 91 });
    transcribeWithFallbackMock.mockResolvedValue(okSttResult('openai', 'gpt-transcribe', 0.27));
    const t = await transcribeCall(7, 'call-s', { supabase: db.client() as SupabaseClient });
    const adjust = chargeAiCredits.mock.calls.find((c) => (c[0] as any).actionType === 'call_transcribe:adjust');
    expect(adjust).toBeDefined();
    expect((adjust![0] as any).credits).toBe(27 - 22);
    expect(t.raw_response?.credits).toBe(27);
  });

  it('R15 · CORREGIDO (r3): unit_cost_usd del log se reconcilia en STT con la tarifa del proveedor que respondió', async () => {
    const db = sttDb({ ai_usage_logs: [{ id: 90, model: 'scribe_v2', metadata: { provider: 'elevenlabs', unit_sku: 'scribe', unit_cost_usd: 0.22 } }] });
    getUnitCost.mockImplementation(async (p: any, sku: any) => (sku === 'gpt_transcribe' ? 0.0045 : 0.22));
    chargeAiCredits.mockResolvedValue({ credits: 22, logId: 90, cost_amount: 0.22 });
    transcribeWithFallbackMock.mockResolvedValue(okSttResult('openai', 'gpt-transcribe', 0.27));
    await transcribeCall(7, 'call-s', { supabase: db.client() as SupabaseClient });
    const log = db.tables.ai_usage_logs.find((r) => r.id === 90)!;
    expect(log.metadata.unit_sku).toBe('gpt_transcribe');
    // Tarifa de OpenAI por minuto, no los $0.22/h de ElevenLabs (que sólo queda como estimación).
    expect(log.metadata.unit_cost_usd).toBe(0.0045);
    expect(log.metadata.estimated_unit_sku).toBe('scribe');
  });

  it('R16 · análisis sin fallback: cost_amount usa tokens de ENTRADA y SALIDA reales, no prompt.length/4', async () => {
    const db = analysisDb();
    getUnitCost.mockImplementation(async (p: any, sku: any) => (String(sku).endsWith('_out') ? 3.75 : 0.75));
    chargeAiCredits.mockResolvedValue({ credits: 3, logId: 101 });
    await analyzeCall(7, 'call-r2', { supabase: db.client(), runners: { google: jest.fn(async () => ({ parsed: LLM, usage: { input: 1_000_000, output: 1_000_000 } })) } as any });
    const log = db.tables.ai_usage_logs.find((r) => r.id === 101)!;
    expect(log.cost_amount).toBeCloseTo(0.75 + 3.75, 4);
    expect(log.metadata.real_tokens_in).toBe(1_000_000);
    expect(log.metadata.real_tokens_out).toBe(1_000_000);
    expect(log.metadata.cost_source).toBe('provider_usage');
  });

  it('R17 · si el proveedor NO devuelve usage, no se inventa costo real y no se reconcilia', async () => {
    const db = analysisDb();
    chargeAiCredits.mockResolvedValue({ credits: 3, logId: 101 });
    const before = JSON.stringify(db.tables.ai_usage_logs[0]);
    await analyzeCall(7, 'call-r2', { supabase: db.client(), runners: { google: jest.fn(async () => ({ parsed: LLM, usage: null })) } as any });
    expect(JSON.stringify(db.tables.ai_usage_logs[0])).toBe(before);
  });

  it('R18 · DEFECTO: si la reconciliación falla se traga el error y el log queda con la economía equivocada', async () => {
    const db = sttDb();
    db.failOn['ai_usage_logs:update'] = 'permiso denegado';
    getUnitCost.mockImplementation(async (p: any, sku: any) => (sku === 'gpt_transcribe' ? 0.0045 : 0.22));
    chargeAiCredits.mockResolvedValue({ credits: 22, logId: 90, cost_amount: 0.22 });
    transcribeWithFallbackMock.mockResolvedValue(okSttResult('openai', 'gpt-transcribe', 0.27));
    const t = await transcribeCall(7, 'call-s', { supabase: db.client() as SupabaseClient });
    expect(t.status).toBe('completed'); // no rompe…
    const log = db.tables.ai_usage_logs.find((r) => r.id === 90)!;
    expect(log.model).toBe('scribe_v2'); // …pero el log sigue mintiendo
    expect(log.cost_amount).toBeUndefined();
  });

  it('R19 · reconcileAiUsageModel devuelve false (no lanza) cuando el UPDATE falla', async () => {
    const db = sttDb();
    db.failOn['ai_usage_logs:update'] = 'boom';
    const ok = await reconcileAiUsageModel(db.client(), 90, { provider: 'openai', model: 'gpt-transcribe', costUsd: 0.3, unitSku: 'gpt_transcribe', units: 60 });
    expect(ok).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('R-C · índice único de actividad por llamada', () => {
  const actDb = (callId: string) =>
    new FakeDb({
      tables: {
        calls: [{ id: callId, organization_id: 7, direction: 'outbound', mode: 'bridge', status: 'completed', answered_by: 'human', started_at: '2026-09-01T10:00:00Z', ended_at: null, duration_seconds: 60, customer_id: 'cus-1', opportunity_id: null, user_id: 'usr-1' }],
        activities: [],
      },
      checks: { activities: { activity_type: ['call', 'email', 'whatsapp', 'sms', 'meeting', 'visit', 'note', 'system', 'ai_call', 'task'] } },
      unique: { activities: ['call_id'] }, // el índice activities_call_id_uidx YA existe en la BD
    });

  it('R20 · dos upserts concurrentes con el UNIQUE real activo → UNA actividad y ninguna excepción', async () => {
    const db = actDb('call-u1');
    const sb = db.client();
    const [a, b] = await Promise.all([upsertCallActivity(7, 'call-u1', { supabase: sb }), upsertCallActivity(7, 'call-u1', { supabase: sb })]);
    expect(db.tables.activities.length).toBe(1);
    expect(a!.activityId).toBe(b!.activityId);
    expect([a!.created, b!.created].filter(Boolean).length).toBe(1);
  });

  it('R21 · cinco upserts concurrentes → sigue habiendo UNA actividad', async () => {
    const db = actDb('call-u2');
    const sb = db.client();
    const res = await Promise.all(Array.from({ length: 5 }, () => upsertCallActivity(7, 'call-u2', { supabase: sb })));
    expect(db.tables.activities.length).toBe(1);
    expect(new Set(res.map((r) => r!.activityId)).size).toBe(1);
  });

  it('R22 · conflicto de UNIQUE entre procesos: el INSERT perdedor RELEE y reutiliza la fila ganadora (no propaga la excepción)', async () => {
    const db = actDb('call-u3');
    const sb = db.client();
    // Simula que otro proceso insertó entre el SELECT y el INSERT.
    db.tables.activities.push({ id: 'act-ganadora', organization_id: 7, call_id: 'call-u3', activity_type: 'call', created_at: '2026-09-01T09:00:00Z' });
    db.failOn['activities:insert'] = 'duplicate key value violates unique constraint "activities_call_id_uidx"';
    const r = await upsertCallActivity(7, 'call-u3', { supabase: sb, call: db.tables.calls[0] as any });
    expect(r).toEqual({ activityId: 'act-ganadora', created: false });
    expect(db.tables.activities.length).toBe(1);
  });

  it('R23 · si el INSERT falla y NO hay fila ganadora, el error sí se propaga (no se traga en silencio)', async () => {
    const db = actDb('call-u4');
    db.failOn['activities:insert'] = 'columna inexistente';
    await expect(upsertCallActivity(7, 'call-u4', { supabase: db.client() })).rejects.toThrow(/activities insert falló/);
  });

  it('R24 · el canal escrito para mode=bridge es "mobile" y la columna activities.channel no tiene CHECK (verificado en BD)', async () => {
    const db = actDb('call-u5');
    await upsertCallActivity(7, 'call-u5', { supabase: db.client() });
    expect(db.tables.activities[0].channel).toBe('mobile');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('R-D · enmascarado de datos sensibles', () => {
  it('R25 · tarjeta con guiones y con espacios: se enmascara dejando los 4 últimos', () => {
    expect(maskSensitiveForLlm('mi tarjeta es 4111-1111-1111-1111')).toContain('[TARJETA ****1111]');
    expect(maskSensitiveForLlm('4539 1488 0343 6467 por favor')).toContain('[TARJETA ****6467]');
  });

  it('R26 · un número de 16 dígitos que NO pasa Luhn no se toca (evita destrozar referencias)', () => {
    expect(maskSensitiveForLlm('la referencia 1234567890123456')).toContain('1234567890123456');
  });

  it('R27 · CORREGIDO (r3): tarjeta dictada con puntos como separador SÍ se enmascara', () => {
    const out = maskSensitiveForLlm('anota 4111.1111.1111.1111');
    expect(out).not.toContain('4111.1111.1111.1111');
    expect(out).toContain('[TARJETA ****1111]');
  });

  it('R28 · CORREGIDO (r3): tarjeta partida entre dos líneas de la transcripción SÍ se enmascara', () => {
    // renderTranscriptForLlm produce una línea por segmento: un número dictado a
    // caballo entre dos segmentos queda separado por `\n[mm:ss] [ROL]: `, que el
    // patrón admite ahora como separador. Los saltos se conservan para no fundir
    // las líneas de la transcripción.
    const out = maskSensitiveForLlm('[00:10] [CLIENTE]: 4111 1111\n[00:12] [CLIENTE]: 1111 1111');
    expect(out).toContain('[TARJETA ****1111]');
    expect(out).not.toMatch(/4111\s*1111\s*1111\s*1111/);
    expect(out).toContain('\n'); // sigue habiendo dos líneas
  });

  it('R29 · CORREGIDO (r3): "la clave de acceso es Secreta99" oculta el secreto (los conectores ya no rompen la relación)', () => {
    const out = maskSensitiveForLlm('La clave de acceso es Secreta99');
    expect(out).toBe('La clave de acceso es [OCULTO]');
    expect(out).not.toContain('Secreta99');
  });

  it('R30 · CORREGIDO (r3): "el pin de mi tarjeta es 4321" ya no deja el PIN a la vista', () => {
    const out = maskSensitiveForLlm('el pin de mi tarjeta es 4321');
    expect(out).not.toContain('4321');
    expect(out).toContain('[OCULTO]');
  });

  it('R31 · CORREGIDO (r3): frases comerciales con "clave" quedan INTACTAS (el valor debe parecer un secreto)', () => {
    // La regla nueva exige que el valor contenga al menos un dígito, así que una
    // palabra normal ("negocio", "está", "la garantía") nunca se oculta.
    expect(maskSensitiveForLlm('La clave del negocio es el servicio')).toBe('La clave del negocio es el servicio');
    expect(maskSensitiveForLlm('La clave está en el precio')).not.toContain('[OCULTO]');
    expect(maskSensitiveForLlm('El factor clave para cerrar es la garantía')).not.toContain('[OCULTO]');
  });

  it('R32 · CVV y código de seguridad sí se ocultan en las formas declaradas', () => {
    expect(maskSensitiveForLlm('cvv: 123')).toBe('cvv: [OCULTO]');
    expect(maskSensitiveForLlm('el código de seguridad es 4321')).toContain('[OCULTO]');
  });

  it('R33 · lo que el análisis necesita NO se enmascara (nombre, empresa, importe, teléfono)', () => {
    const t = 'Habla Ana Ruiz de Acme, el presupuesto es 20000000 y el teléfono 3001234567';
    expect(maskSensitiveForLlm(t)).toBe(t);
  });

  it('R34 · el enmascarado no rompe el análisis: el pipeline completa igual con una tarjeta en la transcripción', async () => {
    const db = analysisDb({
      call_transcripts: [{ id: 'tr-r2', organization_id: 7, call_id: 'call-r2', provider: 'elevenlabs', provider_model: 'scribe_v2', language: 'spa', status: 'completed', full_text: 'Mi tarjeta es 4111-1111-1111-1111 y el cvv 123.', word_count: 9, speaker_count: 2, duration_seconds: 120, raw_response: {}, created_at: '2026-09-01T10:02:00Z' }],
    });
    const runner = jest.fn(async () => ({ parsed: LLM, usage: { input: 100, output: 50 } }));
    const a = await analyzeCall(7, 'call-r2', { supabase: db.client(), runners: { google: runner } as any });
    expect(a.summary).toBe(LLM.summary);
    expect(runner).toHaveBeenCalled();
  });

  it('R35 · el enmascarado NO se aplica a lo que se guarda: la tarjeta queda en claro en call_transcripts', () => {
    // Documental: maskSensitiveForLlm sólo se usa al construir el prompt.
    const stored = 'Mi tarjeta es 4111-1111-1111-1111';
    expect(stored).toContain('4111-1111-1111-1111');
    expect(maskSensitiveForLlm(stored)).not.toContain('4111-1111-1111-1111');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('R-E · conservación de contenido y caducidad de "processing"', () => {
  it('R36 · expireStuckTranscript marca failed WEBHOOK_TIMEOUT conservando raw_response', async () => {
    const started = new Date(Date.now() - MAX_PROCESSING_MS - 60000).toISOString();
    const db = sttDb({ call_transcripts: [{ id: 'tr-s', organization_id: 7, call_id: 'call-s', status: 'processing', provider: 'elevenlabs', language: 'spa', started_at: started, created_at: started, raw_response: { provider_request_id: 'req-9', credits: 22, recording_id: 'rec-s' } }] });
    const out = await expireStuckTranscript(7, 'call-s', db.client());
    expect(out!.status).toBe('failed');
    expect(out!.error_code).toBe('WEBHOOK_TIMEOUT');
    expect(out!.raw_response!.provider_request_id).toBe('req-9');
    expect(out!.raw_response!.credits).toBe(22);
    expect((out!.raw_response as any).expired).toBe(true);
  });

  it('R37 · no caduca antes de MAX_PROCESSING_MS (no rompe una transcripción en curso)', async () => {
    const started = new Date(Date.now() - 60_000).toISOString();
    const db = sttDb({ call_transcripts: [{ id: 'tr-s', organization_id: 7, call_id: 'call-s', status: 'processing', provider: 'elevenlabs', language: 'spa', started_at: started, created_at: started, raw_response: {} }] });
    expect(await expireStuckTranscript(7, 'call-s', db.client())).toBeNull();
  });

  it('R38 · DEFECTO: con force, un fallo del proveedor marca failed una transcripción YA completada y conserva su texto en un estado incoherente', async () => {
    const db = sttDb({ call_transcripts: [{ id: 'tr-s', organization_id: 7, call_id: 'call-s', status: 'completed', provider: 'openai', language: 'spa', full_text: 'Transcripción buena anterior', word_count: 4, started_at: '2026-09-01T10:00:00Z', created_at: '2026-09-01T10:00:00Z', raw_response: { provider_request_id: 'req-viejo' } }] });
    chargeAiCredits.mockResolvedValue({ credits: 5, logId: 90, cost_amount: 0.05 });
    transcribeWithFallbackMock.mockRejectedValue(new Error('proveedor caído'));
    await expect(transcribeCall(7, 'call-s', { force: true, supabase: db.client() as SupabaseClient })).rejects.toThrow();
    const row = db.tables.call_transcripts[0];
    expect(row.status).toBe('failed');
    expect(row.full_text).toBe('Transcripción buena anterior'); // texto bueno + estado failed
    expect(row.raw_response.provider_request_id).toBe('req-viejo'); // esto SÍ se conservó (fix nº 8 OK)
  });

  it('R39 · markFailed conserva el raw_response previo y añade failed_at/last_error_code', async () => {
    const db = sttDb({ call_transcripts: [{ id: 'tr-s', organization_id: 7, call_id: 'call-s', status: 'processing', provider: 'pending', language: 'spa', started_at: '2026-09-01T10:00:00Z', created_at: '2026-09-01T10:00:00Z', raw_response: { provider_request_id: 'req-9', estimated_cost_usd: 0.22 } }], call_recordings: [] });
    await expect(transcribeCall(7, 'call-s', { force: true, supabase: db.client() as SupabaseClient })).rejects.toMatchObject({ code: 'NO_RECORDING' });
    const row = db.tables.call_transcripts[0];
    expect(row.raw_response.provider_request_id).toBe('req-9');
    expect(row.raw_response.estimated_cost_usd).toBe(0.22);
    expect(row.raw_response.last_error_code).toBe('NO_RECORDING');
    expect(row.raw_response.failed_at).toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('R-F · límites de tamaño de audio', () => {
  it('R40 · el tope global es 25 MB (el del adaptador MÁS restrictivo)', () => {
    expect(STT_MAX_AUDIO_BYTES).toBe(25 * 1024 * 1024);
  });

  it('R41 · DEFECTO: un audio de 30 MB se rechaza aunque ElevenLabs (1 GB) y Gemini (2 GB) lo aceptarían', async () => {
    const eleven = new ElevenLabsScribeAdapter('k');
    const gemini = new GeminiAudioAdapter('k');
    const openai = new OpenAiTranscribeAdapter('k');
    const thirty = 30 * 1024 * 1024;
    expect(eleven.maxBytes!).toBeGreaterThan(thirty);
    expect(gemini.maxBytes!).toBeGreaterThan(thirty);
    expect(openai.maxBytes!).toBeLessThan(thirty);
    // …y aun así el servicio corta antes de llegar a la cascada:
    const db = sttDb({}, 'org_7/2026/09/big.wav', thirty);
    db.tables.call_recordings[0].storage_path = 'org_7/2026/09/big.wav';
    const err = await transcribeCall(7, 'call-s', { supabase: db.client() as SupabaseClient }).catch((e) => e);
    expect((err as TranscriptionError).code).toBe('AUDIO_TOO_LARGE');
    expect(chargeAiCredits).not.toHaveBeenCalled();
    expect(transcribeWithFallbackMock).not.toHaveBeenCalled();
  });

  it('R42 · un audio de 24 MB (por debajo del tope) sigue pasando', async () => {
    const size = 24 * 1024 * 1024;
    const db = sttDb({}, 'org_7/2026/09/ok.wav', size);
    db.tables.call_recordings[0].storage_path = 'org_7/2026/09/ok.wav';
    chargeAiCredits.mockResolvedValue({ credits: 5, logId: 90, cost_amount: 0.05 });
    transcribeWithFallbackMock.mockResolvedValue(okSttResult('openai', 'gpt-transcribe', 0.05));
    const t = await transcribeCall(7, 'call-s', { supabase: db.client() as SupabaseClient });
    expect(t.status).toBe('completed');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('R-G · literales contra CHECK reales', () => {
  it('R43 · assertDbEnum lanza para cualquier valor fuera del CHECK', () => {
    expect(() => assertDbEnum('ai', ['manual', 'ia'], 'opportunity_objections.detected_by')).toThrow(/fuera del CHECK/);
    expect(assertDbEnum('ia', ['manual', 'ia'], 'x')).toBe('ia');
    expect(AI_AUTHOR_VALUE).toBe('ia');
  });

  it('R44 · buildObjectionRow produce detected_by="ia" y rechaza cualquier otro', () => {
    expect(buildObjectionRow({ orgId: 7, opportunityId: 'o', objectionId: 'ob' }).detected_by).toBe('ia');
    expect(() => buildObjectionRow({ orgId: 7, opportunityId: 'o', objectionId: 'ob', detectedBy: 'ai' as any })).toThrow();
  });

  it('R45 · CORREGIDO (r3): un CHECK violado en el etiquetado NO se traga: queda en raw_response.tagging_error', async () => {
    const db = analysisDb({ call_tags: [{ id: 'tag-1', organization_id: 7, name: 'Tibio' }] });
    db.failOn['call_tag_relations:insert'] = 'new row violates check constraint "call_tag_relations_source_check"';
    chargeAiCredits.mockResolvedValue({ credits: 2, logId: 101 });
    const a = await analyzeCall(7, 'call-r2', { supabase: db.client(), runners: { google: jest.fn(async () => ({ parsed: LLM, usage: { input: 100, output: 50 } })) } as any });
    // El análisis (ya pagado) no se tumba…
    expect(a.summary).toBe(LLM.summary);
    expect(db.tables.call_tag_relations.length).toBe(0);
    // …pero el motivo real queda visible en la propia fila y en la BD.
    expect(String(a.raw_response?.tagging_error)).toMatch(/call_tag_relations_source_check/);
    expect(a.raw_response?.tagging_failed_at).toBeTruthy();
    expect(String(db.tables.call_analyses[0].raw_response.tagging_error)).toMatch(/call_tag_relations_source_check/);
  });
});
