/**
 * TESTER F4 · ronda 3 — re-test adversarial de las correcciones del builder.
 *
 * Ataca EXCLUSIVAMENTE lo que la ronda 3 dice haber corregido y lo que esa
 * corrección pudo dejar abierto: el libro mayor `CreditLedger`, el reembolso
 * fallido visible, el enmascarado reescrito y el etiquetado que ya no se traga.
 *
 * Todo con dobles en memoria (fakeSupabase): sin red ni BD.
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
jest.mock('@/lib/services/crm/stageGateService', () => ({ evaluateStageGate: jest.fn(async () => ({ ok: true, missing: [] })) }));

const transcribeWithFallbackMock = jest.fn();
jest.mock('@/lib/services/crm/stt', () => {
  const actual = jest.requireActual('@/lib/services/crm/stt');
  return { ...actual, transcribeWithFallback: (...a: unknown[]) => transcribeWithFallbackMock(...a) };
});

import { getCallAiPolicy } from '@/lib/services/crm/callAiPolicy';
import { transcribeCall, settleCreditDelta, CreditLedger, TranscriptionError } from '@/lib/services/crm/transcriptionService';
import { analyzeCall, AnalysisError } from '@/lib/services/crm/callAnalysisService';
import { maskSensitiveForLlm } from '@/lib/services/crm/callAnalysisRules';
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
  next_steps: [],
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
      calls: [{ id: 'call-r3', organization_id: 7, direction: 'outbound', mode: 'browser', status: 'completed', answered_by: 'human', started_at: '2026-09-01T10:00:00Z', ended_at: '2026-09-01T10:01:00Z', duration_seconds: 120, customer_id: null, opportunity_id: null, user_id: 'usr-1' }],
      customers: [], opportunities: [], stages: [], objections: [], call_tags: [], call_tag_relations: [],
      call_transcripts: [{ id: 'tr-r3', organization_id: 7, call_id: 'call-r3', provider: 'elevenlabs', provider_model: 'scribe_v2', language: 'spa', status: 'completed', full_text: 'Hola, buenas tardes.', word_count: 4, speaker_count: 2, duration_seconds: 120, raw_response: {}, created_at: '2026-09-01T10:02:00Z' }],
      call_transcript_segments: [], call_analyses: [], activities: [], tasks: [], opportunity_objections: [],
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
      call_transcripts: [], call_transcript_segments: [],
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
/** Créditos que la RPC ACEPTÓ devolver (las llamadas que devolvieron true). */
const totalActuallyReturned = () => (refundAiCredits.mock.results as Array<{ value: Promise<boolean> }>).length;

// ═══════════════════════════════════════════════════════════════════════════
describe('T-A · el libro mayor ya NO da por devuelto lo que la RPC rechazó (ajuste a la baja) — corregido r4', () => {
  it('T1 · settleCreditDelta COMPRUEBA el booleano de refundAiCredits: ok:false y el importe sigue debitado', async () => {
    refundAiCredits.mockResolvedValue(false); // la RPC rechaza el reembolso (no lanza)
    const s = await settleCreditDelta({ orgId: 7, actionType: 'call_analyze', model: 'm', provider: 'google', chargedCredits: 30, realCredits: 1, logId: 1 });
    expect(refundAiCredits).toHaveBeenCalledTimes(1);
    expect((refundAiCredits.mock.calls[0][0] as any).credits).toBe(29);
    // CORREGIDO: no se informa de un ajuste que no ocurrió. El cobro sigue en 30,
    // el ajuste no se aplicó (delta 0) y los 29 quedan marcados como no devueltos.
    expect(s).toEqual({ credits: 30, delta: 0, ok: false, unrefunded: 29, error: 'refund_ai_credits devolvió false' });
  });

  it('T2 · CreditLedger no se lo cree: outstanding sigue en 30 y los 29 quedan como pendientes', async () => {
    refundAiCredits.mockResolvedValue(false);
    const led = new CreditLedger({ orgId: 7, actionType: 'call_analyze', model: 'm', provider: 'google', charged: 30, logId: 1 });
    await led.settle({ realCredits: 1 });
    expect(led.refunded).toBe(0); // la RPC devolvió false: no se apunta nada como devuelto
    expect(led.outstanding).toBe(30); // el saldo vivo NO baja: el cierre lo reintentará entero
    expect(led.unsettled).toBe(29); // ajuste rechazado, visible
    expect(led.unrefunded).toBe(0); // aún no hubo cierre: no hay deuda definitiva
  });

  it('T3 · analyzeCall camino FELIZ: el ajuste rechazado deja traza y raw_response dice la verdad', async () => {
    const db = analysisDb();
    chargeAiCredits.mockResolvedValue({ credits: 30, logId: 101 });
    refundAiCredits.mockResolvedValue(false);
    const a = await analyzeCall(7, 'call-r3', { supabase: db.client(), runners: { google: jest.fn(async () => ({ parsed: LLM, usage: { input: 100, output: 50 } })) } as any });
    expect((refundAiCredits.mock.calls[0][0] as any).credits).toBe(29);
    // La fila ya NO publica un importe rebajado que la org no recuperó:
    expect(a.raw_response?.credits).toBe(30);
    expect(a.raw_response?.credits_charged).toBe(30);
    expect(a.raw_response?.credits_adjustment).toBe(0);
    expect(a.raw_response?.pending_refund_credits).toBe(29);
    expect(String(a.raw_response?.credit_settlement_error)).toMatch(/refund_ai_credits/);
    // …y existe la fila conciliable, con el importe vivo y credits_consumed 0.
    const failedRows = db.rows('ai_usage_logs').filter((r: any) => String(r.action_type ?? '').includes('refund_failed'));
    expect(failedRows).toHaveLength(1);
    expect(failedRows[0].action_type).toBe('call_analyze:refund_failed');
    expect(failedRows[0].credits_consumed).toBe(0);
    expect(failedRows[0].metadata.pending_refund_credits).toBe(29);
    expect(failedRows[0].metadata.stage).toBe('settle');
  });

  it('T4 · analyzeCall con fallo al persistir: el cierre devuelve los 30 completos, no 1', async () => {
    const db = analysisDb();
    db.failOn['call_analyses:insert'] = 'boom persistiendo';
    chargeAiCredits.mockResolvedValue({ credits: 30, logId: 101 });
    // La RPC sólo rechaza el movimiento del AJUSTE (29); el resto sí funciona.
    refundAiCredits.mockImplementation(async (a: any) => a.credits !== 29);
    const err = await analyzeCall(7, 'call-r3', { supabase: db.client(), runners: { google: jest.fn(async () => ({ parsed: LLM, usage: { input: 100, output: 50 } })) } as any }).catch((e) => e);
    expect(err).toBeInstanceOf(AnalysisError);
    // Se intentan 29 (ajuste, rechazado) + 30 (cierre del saldo vivo íntegro).
    expect(totalRefunded()).toBe(59);
    const aceptados: number[] = [];
    for (let i = 0; i < refundAiCredits.mock.calls.length; i++) {
      if (await (refundAiCredits.mock.results[i].value as Promise<boolean>)) aceptados.push((refundAiCredits.mock.calls[i][0] as any).credits);
    }
    // La org recupera EXACTAMENTE lo cobrado: ni 1 ni 59, los 30.
    expect(aceptados).toEqual([30]);
    expect(aceptados.reduce((n, c) => n + c, 0)).toBe(30);
    // El ajuste rechazado dejó su fila conciliable (el cierre sí funcionó, así que
    // no hay fila de cierre y el mensaje no habla de créditos perdidos).
    const failedRows = db.rows('ai_usage_logs').filter((r: any) => String(r.action_type ?? '').includes('refund_failed'));
    expect(failedRows).toHaveLength(1);
    expect(failedRows[0].metadata.stage).toBe('settle');
    expect(failedRows[0].metadata.pending_refund_credits).toBe(29);
    expect(String((err as Error).message)).not.toMatch(/no se pudieron devolver/i);
  });

  it('T5 · transcribeCall camino FELIZ: la rama STT se comporta igual', async () => {
    const db = sttDb();
    getUnitCost.mockImplementation(async (_p: any, sku: any) => (sku === 'gpt_transcribe' ? 0.0001 : 0.22));
    chargeAiCredits.mockResolvedValue({ credits: 22, logId: 90, cost_amount: 0.22 });
    refundAiCredits.mockResolvedValue(false);
    transcribeWithFallbackMock.mockResolvedValue(okSttResult('openai', 'gpt-transcribe', 0.01));
    const t = await transcribeCall(7, 'call-s', { supabase: db.client() as SupabaseClient });
    expect(t.status).toBe('completed');
    expect(refundAiCredits).toHaveBeenCalled();
    // El ajuste NO se da por bueno: `credits` sigue siendo lo cobrado y se dice
    // cuánto quedó sin devolver.
    expect(t.raw_response?.credits_adjustment).toBe(0);
    expect(t.raw_response?.credits).toBe(t.raw_response?.credits_charged);
    expect(t.raw_response?.pending_refund_credits as number).toBeGreaterThan(0);
    const failedRows = db.rows('ai_usage_logs').filter((r: any) => String(r.action_type ?? '').includes('refund_failed'));
    expect(failedRows).toHaveLength(1);
    expect(failedRows[0].action_type).toBe('call_transcribe:refund_failed');
    expect(failedRows[0].metadata.stage).toBe('settle');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('T-B · reembolso fallido en el CIERRE: aquí sí hay traza (corrección r3 nº 4)', () => {
  it('T6 · el cierre rechazado deja fila ai_usage_logs ":refund_failed" y sufijo en el mensaje', async () => {
    const db = analysisDb();
    db.failOn['call_analyses:insert'] = 'boom';
    chargeAiCredits.mockResolvedValue({ credits: 6, logId: 101 });
    refundAiCredits.mockResolvedValue(false);
    const err = await analyzeCall(7, 'call-r3', { supabase: db.client(), runners: { google: jest.fn(async () => ({ parsed: LLM, usage: { input: 6_000_000, output: 100 } })) } as any }).catch((e) => e);
    expect(err).toBeInstanceOf(AnalysisError);
    const failedRows = db.rows('ai_usage_logs').filter((r: any) => String(r.action_type ?? '').includes('refund_failed'));
    expect(failedRows.length).toBeGreaterThan(0);
    expect(failedRows[0].credits_consumed).toBe(0);
    expect(failedRows[0].metadata.pending_refund_credits).toBeGreaterThan(0);
    expect(String((err as Error).message)).toMatch(/no se pudieron devolver/i);
  });

  it('T7 · el aviso del cierre usa "devolver" y nombra la tabla donde conciliar (R8 reescrito en r4)', async () => {
    const db = analysisDb();
    db.failOn['call_analyses:insert'] = 'boom';
    chargeAiCredits.mockResolvedValue({ credits: 6, logId: 101 });
    refundAiCredits.mockResolvedValue(false);
    const err = await analyzeCall(7, 'call-r3', { supabase: db.client(), runners: { google: jest.fn(async () => ({ parsed: LLM, usage: { input: 6_000_000, output: 100 } })) } as any }).catch((e) => e);
    // Ronda 3: R8 (f4Round2) afirmaba `.not.toMatch(/reembols/i)` y pasaba sólo
    // porque el mensaje usa "devolver" y no "reembolso" — no vigilaba nada.
    // Ronda 4: R8 se reescribió para exigir el importe y la tabla; este caso
    // conserva la comprobación de la FORMA del mensaje (mismo escenario y datos).
    expect(String((err as Error).message)).not.toMatch(/reembols/i);
    expect(String((err as Error).message)).toMatch(/ai_usage_logs/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('T-C · enmascarado: los dos sentidos, corregidos en r4', () => {
  it('T8 · CORREGIDO: un importe o un año anunciados tras "clave" quedan INTACTOS', () => {
    expect(maskSensitiveForLlm('La clave es 20000000 al mes')).toBe('La clave es 20000000 al mes');
    expect(maskSensitiveForLlm('El dato clave es 2026')).toBe('El dato clave es 2026');
  });

  it('T9 · CORREGIDO: una palabra fuera de la lista de conectores ya no salva el secreto', () => {
    expect(maskSensitiveForLlm('mi clave personal es Sol2024')).toBe('mi clave personal es [OCULTO]');
    expect(maskSensitiveForLlm('la clave, apúntala bien, es Ana1990')).toBe('la clave, apúntala bien, es [OCULTO]');
  });

  it('T10 · lo declarado sigue funcionando (no hay regresión)', () => {
    expect(maskSensitiveForLlm('mi tarjeta es 4111-1111-1111-1111')).toContain('[TARJETA ****1111]');
    expect(maskSensitiveForLlm('cvv: 123')).toBe('cvv: [OCULTO]');
    expect(maskSensitiveForLlm('La clave está en el precio')).toBe('La clave está en el precio');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('T-D · no se pasó de frenada', () => {
  it('T11 · un 503 del proveedor STT sigue siendo reintentable y devuelve el saldo vivo', async () => {
    const db = sttDb();
    chargeAiCredits.mockResolvedValue({ credits: 22, logId: 90, cost_amount: 0.22 });
    const { SttChainError } = jest.requireActual('@/lib/services/crm/stt') as any;
    transcribeWithFallbackMock.mockRejectedValue(new SttChainError('503 del proveedor', [], true));
    const err = await transcribeCall(7, 'call-s', { supabase: db.client() as SupabaseClient }).catch((e) => e);
    expect(err).toBeInstanceOf(TranscriptionError);
    expect((err as TranscriptionError).code).toBe('PROVIDER_ERROR');
    expect((err as TranscriptionError).retryable).toBe(true);
    expect(totalRefunded()).toBe(22);
  });

  it('T12 · llamar dos veces al cierre no duplica el reembolso (idempotencia del libro mayor)', async () => {
    const led = new CreditLedger({ orgId: 7, actionType: 'call_analyze', model: 'm', provider: 'google', charged: 10, logId: 1 });
    const a = await led.refundOutstanding('x');
    const b = await led.refundOutstanding('x');
    expect(a.refunded).toBe(10);
    expect(b.refunded).toBe(0);
    expect(totalRefunded()).toBe(10);
    expect(totalActuallyReturned()).toBe(1);
  });
});
