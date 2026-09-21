/**
 * F4 — `analyzeCall` (callAnalysisService) en sus ramas de dinero y de fallo,
 * más bordes puros de `callAnalysisRules`. Complementa a `f4AnalysisApply`
 * (camino feliz, applyAnalysis). Consolidado el 2026-09-21 a partir de
 * `f4Adversarial` (E4, E6, E7, E10, E16), `f4Round2` (R6-R8, R10, R16, R17,
 * R34, R43, R45), `f4Round3` (T3, T4, T7), `f4Round4Builder` (B1, B3) y
 * `f4Round4Tester` (U8-U10, U12b).
 *
 * Sin red ni BD.
 */
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
jest.mock('@/lib/services/providerCredentials.server', () => ({ getProviderCredentials: jest.fn(), getProviderSettings: jest.fn() }));
jest.mock('@/lib/services/crm/stageGateService', () => ({ evaluateStageGate: jest.fn(async () => ({ ok: true, missing: [] })) }));

import { getCallAiPolicy } from '@/lib/services/crm/callAiPolicy';
import { analyzeCall, AnalysisError } from '@/lib/services/crm/callAnalysisService';
import { assertDbEnum, AI_AUTHOR_VALUE, buildTaskRow, mapObjectionsToCatalog, mapTaskPriority, mapTaskStatus, validateSuggestedStage } from '@/lib/services/crm/callAnalysisRules';
import { analysisZod } from '@/lib/services/crm/prompts/callAnalysisPrompt';
import { TASK_PRIORITIES, TASK_STATUSES } from '@/lib/crm/enums';

const POLICY = { sttProvider: 'elevenlabs', analysisProvider: 'google', analysisModel: 'gemini-3.8-flash', language: 'spa', dualTranscribe: true, autoTranscribe: true, autoAnalyze: true, apply: 'suggest' as const, stageConfidenceThreshold: 0.8, minDurationSeconds: 5, asyncWebhook: false, source: { stt: 'env' as const, analysis: 'env' as const } };
const LLM = {
  summary: 'El cliente pide propuesta formal.', sentiment: 'positive', sentiment_score: 0.6, quality_score: 72,
  quality_breakdown: { greeting: 8, discovery: 7, pitch: 7, objection_handling: 6, closing: 7, professionalism: 9 },
  talk_ratio_agent: 0.55, talk_ratio_customer: 0.45, longest_monologue_seconds: 22, questions_asked: 5,
  next_steps: [], objections: [], competitors: [], budget_mentioned: null, decision_maker_identified: true,
  discovery: { budget: null, authority: null, need: 'CRM', timeline: null, goals: null, obstacles: null, consequences: null },
  suggested_stage_id: null, suggested_stage_confidence: 0, suggested_tasks: [], tags: [], temperature: 'warm',
};

function analysisDb(over: Record<string, any[]> = {}) {
  return new FakeDb({
    tables: {
      calls: [{ id: 'call-a', organization_id: 7, direction: 'outbound', mode: 'browser', status: 'completed', answered_by: 'human', started_at: '2026-09-01T10:00:00Z', ended_at: '2026-09-01T10:01:00Z', duration_seconds: 120, customer_id: null, opportunity_id: null, user_id: 'usr-1' }],
      customers: [], opportunities: [], stages: [], objections: [], call_tags: [], call_tag_relations: [],
      call_transcripts: [{ id: 'tr-a', organization_id: 7, call_id: 'call-a', provider: 'elevenlabs', provider_model: 'scribe_v2', language: 'spa', status: 'completed', full_text: 'Hola, buenas tardes.', word_count: 4, speaker_count: 2, duration_seconds: 120, raw_response: {}, created_at: '2026-09-01T10:02:00Z' }],
      call_transcript_segments: [], call_analyses: [], activities: [], tasks: [], opportunity_objections: [],
      ai_usage_logs: [{ id: 101, model: 'gemini-3.8-flash', metadata: { provider: 'google', unit_sku: 'gemini_3_8_flash_in', cost_amount: 0.01 } }],
      ...over,
    },
    checks: { call_analyses: { sentiment: ['positive', 'neutral', 'negative', 'mixed'] }, tasks: { priority: TASK_PRIORITIES, status: TASK_STATUSES }, opportunity_objections: { detected_by: ['manual', 'ia'] }, call_tag_relations: { source: ['manual', 'ia'] } },
  });
}
const runner = (usage: { input: number; output: number } | null = { input: 100, output: 50 }) => jest.fn(async () => ({ parsed: LLM, usage }));
const analyze = (db: FakeDb, r = runner()) => analyzeCall(7, 'call-a', { supabase: db.client(), runners: { google: r } as any });
const totalRefunded = () => (refundAiCredits.mock.calls as unknown as Array<[{ credits?: number }]>).reduce((n, c) => n + (c[0].credits ?? 0), 0);
const failedRows = (db: FakeDb) => db.rows('ai_usage_logs').filter((r: any) => r.action_type === 'call_analyze:refund_failed');
const ctx = { orgId: 7, callId: 'c', opportunityId: null, customerId: null, assignedTo: null, createdBy: null, analysisId: 'a' };
let errors: string[] = [];

beforeEach(() => {
  jest.clearAllMocks();
  errors = [];
  (getCallAiPolicy as jest.Mock).mockResolvedValue(POLICY);
  getUnitCost.mockResolvedValue(0.75);
  refundAiCredits.mockResolvedValue(true);
  chargeAiCredits.mockResolvedValue({ credits: 30, logId: 101 });
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation((...a: unknown[]) => { errors.push(a.map(String).join(' ')); });
});
afterEach(() => jest.restoreAllMocks());

describe('analyzeCall: conservación de créditos en el fallo de persistencia (r2 R6-R8, r3 T4/T7, r4 U9)', () => {
  it('R6 · sobrecobro ajustado + fallo al persistir devuelve EXACTAMENTE lo cobrado en dos movimientos (29 del ajuste + 1 del cierre)', async () => {
    const db = analysisDb();
    db.failOn['call_analyses:insert'] = 'boom persistiendo';
    await expect(analyze(db)).rejects.toMatchObject({ code: 'PERSIST_ERROR' });
    expect(totalRefunded()).toBe(30);
    expect((refundAiCredits.mock.calls as any).map((c: any) => c[0].credits)).toEqual([29, 1]);
  });

  it('R7 · infracobro ajustado + fallo al persistir devuelve TAMBIÉN el débito extra', async () => {
    const db = analysisDb();
    db.failOn['call_analyses:insert'] = 'boom persistiendo';
    chargeAiCredits.mockResolvedValueOnce({ credits: 1, logId: 101 }).mockResolvedValue({ credits: 99, logId: 102 });
    await expect(analyze(db, runner({ input: 50_000_000, output: 10_000_000 }))).rejects.toMatchObject({ code: 'PERSIST_ERROR' });
    const adjust = chargeAiCredits.mock.calls.find((c) => (c[0] as any).actionType === 'call_analyze:adjust');
    expect(adjust).toBeDefined();
    const adjustCredits = (adjust![0] as any).credits as number;
    expect(adjustCredits).toBeGreaterThan(0);
    expect(totalRefunded()).toBe(1 + adjustCredits);
  });

  it('R8/T7 · si el reembolso del cierre falla, el error LO DICE (importe y tabla, con «devolver»), y queda fila conciliable', async () => {
    const db = analysisDb();
    db.failOn['call_analyses:insert'] = 'boom';
    chargeAiCredits.mockResolvedValue({ credits: 6, logId: 101 });
    refundAiCredits.mockResolvedValue(false);
    const err = await analyze(db, runner({ input: 600, output: 100 })).catch((e) => e);
    expect(err).toBeInstanceOf(AnalysisError);
    expect(err).toMatchObject({ code: 'PERSIST_ERROR', retryable: false });
    const msg = String((err as Error).message);
    expect(msg).toMatch(/no se pudieron devolver 6 créditos/i);
    expect(msg).toContain("ai_usage_logs 'call_analyze:refund_failed'");
    expect(msg).not.toMatch(/devolver (?:5|11) créditos/i); // no infla la cifra con el ajuste rechazado
    expect(msg).not.toMatch(/reembols/i);
    const close = failedRows(db).find((r: any) => r.metadata?.stage === 'close');
    expect(close).toMatchObject({ credits_consumed: 0, metadata: expect.objectContaining({ pending_refund_credits: 6 }) });
  });

  it('T4 · la RPC rechaza sólo el ajuste (29): el cierre devuelve los 30 completos, no 1, y el mensaje no habla de créditos perdidos', async () => {
    const db = analysisDb();
    db.failOn['call_analyses:insert'] = 'boom persistiendo';
    refundAiCredits.mockImplementation(async (a: any) => a.credits !== 29);
    const err = await analyze(db).catch((e) => e);
    expect(err).toBeInstanceOf(AnalysisError);
    expect(totalRefunded()).toBe(59); // intentados: 29 (rechazado) + 30 (cierre)
    const aceptados: number[] = [];
    for (let i = 0; i < refundAiCredits.mock.calls.length; i++) if (await (refundAiCredits.mock.results[i].value as Promise<boolean>)) aceptados.push((refundAiCredits.mock.calls[i][0] as any).credits);
    expect(aceptados).toEqual([30]);
    expect(failedRows(db)).toHaveLength(1);
    expect(failedRows(db)[0].metadata).toMatchObject({ stage: 'settle', pending_refund_credits: 29 });
    expect(String((err as Error).message)).not.toMatch(/no se pudieron devolver/i);
  });

  it('U9 · ajuste y cierre rechazados: dos filas (59 en suma ingenua) pero la conciliación por `refunded_log_id`/stage da 30, igual que el mensaje', async () => {
    const db = analysisDb();
    db.failOn['call_analyses:insert'] = 'boom';
    refundAiCredits.mockResolvedValue(false);
    const err = await analyze(db).catch((e) => e);
    expect(String((err as Error).message)).toMatch(/no se pudieron devolver 30 créditos/i);
    const filas = failedRows(db);
    expect(filas).toHaveLength(2);
    expect(filas.reduce((s: number, r: any) => s + r.metadata.pending_refund_credits, 0)).toBe(59);
    const porLog = new Map<number, any>();
    for (const f of filas as any[]) {
      const previa = porLog.get(f.metadata.refunded_log_id);
      if (!previa || (previa.metadata.stage === 'settle' && f.metadata.stage === 'close')) porLog.set(f.metadata.refunded_log_id, f);
    }
    expect([...porLog.values()].reduce((s: number, r: any) => s + r.metadata.pending_refund_credits, 0)).toBe(30);
  });
});

describe('analyzeCall: camino feliz con ajustes y reconciliación (r2 R10/R16/R17/R34/R45, r3 T3, r4 B1/B3/U8/U10/U12b)', () => {
  it('R10 · raw_response refleja credits_charged, credits_adjustment (<0) y credits = suma', async () => {
    const a = await analyze(analysisDb());
    expect(a.raw_response?.credits_charged).toBe(30);
    expect(a.raw_response?.credits_adjustment).toBeLessThan(0);
    expect(a.raw_response?.credits).toBe(30 + (a.raw_response!.credits_adjustment as number));
  });

  it('T3/U8 · ajuste a la baja rechazado por la RPC: el importe publicado dice la verdad (30), pending_refund_credits=29, fila stage=settle y console.error', async () => {
    const db = analysisDb();
    refundAiCredits.mockResolvedValue(false);
    const a = await analyze(db);
    expect((refundAiCredits.mock.calls[0][0] as any).credits).toBe(29);
    expect(a.raw_response).toMatchObject({ credits: 30, credits_charged: 30, credits_adjustment: 0, pending_refund_credits: 29 });
    expect(String(a.raw_response?.credit_settlement_error)).toMatch(/refund_ai_credits/);
    expect(failedRows(db)).toHaveLength(1);
    expect(failedRows(db)[0]).toMatchObject({ credits_consumed: 0, metadata: expect.objectContaining({ stage: 'settle', pending_refund_credits: 29 }) });
    expect(errors.some((e) => /REEMBOLSO FALLIDO \(settle\)/.test(e))).toBe(true);
  });

  it('U10 · el ajuste AL ALZA rechazado informa el motivo y NO publica deuda de reembolso (ni clave ni fila)', async () => {
    const db = analysisDb();
    chargeAiCredits.mockResolvedValueOnce({ credits: 1, logId: 101 }).mockRejectedValue(new InsufficientCreditsError());
    const a = await analyze(db, runner({ input: 50_000_000, output: 10_000_000 }));
    expect(a.raw_response).toMatchObject({ credits: 1, credits_adjustment: 0 });
    expect(a.raw_response?.credit_settlement_error).toMatch(/insuficientes/i);
    expect(Object.keys(a.raw_response ?? {})).not.toContain('pending_refund_credits');
    expect(failedRows(db)).toHaveLength(0);
  });

  it('R16 · cost_amount usa tokens de ENTRADA y SALIDA reales con la tarifa de cada SKU', async () => {
    const db = analysisDb();
    getUnitCost.mockImplementation(async (_p: any, sku: any) => (String(sku).endsWith('_out') ? 3.75 : 0.75));
    await analyze(db, runner({ input: 1_000_000, output: 1_000_000 }));
    const log = db.tables.ai_usage_logs.find((r) => r.id === 101)!;
    expect(log.cost_amount).toBeCloseTo(0.75 + 3.75, 4);
    expect(log.metadata).toMatchObject({ real_tokens_in: 1_000_000, real_tokens_out: 1_000_000, cost_source: 'provider_usage' });
  });

  it('R17 · si el proveedor NO devuelve usage, no se inventa costo real ni se reconcilia', async () => {
    const db = analysisDb();
    const before = JSON.stringify(db.tables.ai_usage_logs[0]);
    await analyze(db, runner(null));
    expect(JSON.stringify(db.tables.ai_usage_logs[0])).toBe(before);
  });

  it('B1/B3 · reconciliación de ai_usage_logs: log inexistente → usage_log_reconciled=false + console.error; log real → true, sin error y con la tarifa real', async () => {
    chargeAiCredits.mockResolvedValue({ credits: 4, logId: 999 });
    const a = await analyze(analysisDb());
    expect(a.raw_response?.usage_log_reconciled).toBe(false);
    expect(errors.some((e) => /reconciliación de ai_usage_logs=999 falló/.test(e))).toBe(true);
    errors = [];
    const db = analysisDb();
    chargeAiCredits.mockResolvedValue({ credits: 4, logId: 101 });
    const b = await analyze(db);
    expect(b.raw_response?.usage_log_reconciled).toBe(true);
    expect(errors.some((e) => /reconciliación/.test(e))).toBe(false);
    expect(db.rows('ai_usage_logs').find((r: any) => r.id === 101)!.metadata.unit_cost_usd).toBe(0.75);
  });

  it('R34 · el enmascarado no rompe el pipeline: completa igual con una tarjeta en la transcripción', async () => {
    const db = analysisDb({ call_transcripts: [{ id: 'tr-a', organization_id: 7, call_id: 'call-a', provider: 'elevenlabs', provider_model: 'scribe_v2', language: 'spa', status: 'completed', full_text: 'Mi tarjeta es 4111-1111-1111-1111 y el cvv 123.', word_count: 9, speaker_count: 2, duration_seconds: 120, raw_response: {}, created_at: '2026-09-01T10:02:00Z' }] });
    const r = runner();
    expect((await analyze(db, r)).summary).toBe(LLM.summary);
    expect(r).toHaveBeenCalled();
  });

  it('R45 · un CHECK violado en el etiquetado NO se traga: el análisis (ya pagado) sale y raw_response.tagging_error lo dice', async () => {
    const db = analysisDb({ call_tags: [{ id: 'tag-1', organization_id: 7, name: 'Tibio' }] });
    db.failOn['call_tag_relations:insert'] = 'new row violates check constraint "call_tag_relations_source_check"';
    const a = await analyze(db);
    expect(a.summary).toBe(LLM.summary);
    expect(db.tables.call_tag_relations).toHaveLength(0);
    expect(String(a.raw_response?.tagging_error)).toMatch(/call_tag_relations_source_check/);
    expect(a.raw_response?.tagging_failed_at).toBeTruthy();
    expect(String(db.tables.call_analyses[0].raw_response.tagging_error)).toMatch(/call_tag_relations_source_check/);
  });

  it('U12b · LÍMITE DECLARADO: la exclusión vive en las rutas; dos analyzeCall simultáneos cobran dos veces (§16.2 exige cerrojo en BD)', async () => {
    const db = analysisDb();
    const client = db.client();
    const [a, b] = await Promise.all([
      analyzeCall(7, 'call-a', { supabase: client, runners: { google: runner() } as any }),
      analyzeCall(7, 'call-a', { supabase: client, runners: { google: runner() } as any }),
    ]);
    expect(chargeAiCredits).toHaveBeenCalledTimes(2);
    expect(db.rows('call_analyses')).toHaveLength(2);
    expect(a.id).not.toBe(b.id);
  });
});

describe('callAnalysisRules: bordes puros (adversarial E4/E6/E7/E10/E16, r2 R43)', () => {
  const stages = [{ id: 'st-1', name: 'Descubrimiento', position: 1 }, { id: 'st-2', name: 'Propuesta', position: 2 }];

  it('E4 · confianza fuera de rango se recorta a [0,1] también por debajo', () => {
    expect(validateSuggestedStage('st-2', 5, stages, 'st-1').confidence).toBe(1);
    expect(validateSuggestedStage('st-2', -3, stages, 'st-1').confidence).toBe(0);
  });

  it('E6 · quality_score fuera de 0..100 → rechazado por el esquema zod', () => {
    expect(() => analysisZod.parse({ ...LLM, quality_score: 5000 })).toThrow();
    expect(() => analysisZod.parse(LLM)).not.toThrow();
  });

  it('E7 · tareas: priority y status quedan SIEMPRE dentro del CHECK real, con basura incluida; «urgente» → critical', () => {
    for (const p of ['urgente', 'medium', 'ALTA', 'baja', undefined, null, 'basura', 42]) {
      const row = buildTaskRow({ title: 't', priority: p as any }, 0, ctx);
      expect(TASK_PRIORITIES).toContain(row.priority as any);
      expect(TASK_STATUSES).toContain(row.status as any);
    }
    expect(mapTaskPriority('urgente')).toBe('critical');
    expect(mapTaskStatus('completed')).toBe('done');
  });

  it('E10 · título de tarea larguísimo se trunca a 200 caracteres', () => {
    expect(buildTaskRow({ title: 'x'.repeat(500) }, 0, ctx).title).toHaveLength(200);
  });

  it('E14/E15/E16 · catálogo SIN detection_signals: título parecido → match title; id inventado sin parecido → null; catálogo vacío → null', () => {
    const catalog = [{ id: 'ob-9', title: 'Precio elevado' }];
    expect(mapObjectionsToCatalog([{ objection_id: null, label: 'El precio es muy elevado', quote: 'q', confidence: 0.8 }] as any, catalog)[0]).toMatchObject({ objection_id: 'ob-9', match: 'title' });
    expect(mapObjectionsToCatalog([{ objection_id: 'ob-inexistente', label: 'zzzz qqqq', quote: 'q', confidence: 0.9 }] as any, catalog)[0]).toMatchObject({ objection_id: null, match: null });
    expect(mapObjectionsToCatalog([{ objection_id: 'x', label: 'Precio', quote: 'q', confidence: 0.9 }] as any, [])[0]).toMatchObject({ objection_id: null, match: null });
  });

  it('R43 · assertDbEnum lanza para cualquier valor fuera del CHECK; AI_AUTHOR_VALUE es "ia"', () => {
    expect(() => assertDbEnum('ai', ['manual', 'ia'], 'opportunity_objections.detected_by')).toThrow(/fuera del CHECK/);
    expect(assertDbEnum('ia', ['manual', 'ia'], 'x')).toBe('ia');
    expect(AI_AUTHOR_VALUE).toBe('ia');
  });
});
