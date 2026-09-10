/**
 * TESTER F4 — análisis IA end-to-end sobre dobles: `analyzeCall` con runners
 * LLM inyectados y `applyAnalysis` (etapa/gate, tareas, discovery, objeciones,
 * etiquetas) contra un Supabase en memoria que simula los CHECK reales.
 */
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
jest.mock('@/lib/services/crm/pricingService', () => ({ getUnitCost: jest.fn(async () => 0.75), round6: (n: number) => n }));
jest.mock('@/lib/services/crm/callAiPolicy', () => ({ getCallAiPolicy: jest.fn() }));
jest.mock('@/lib/services/providerCredentials.server', () => ({ getProviderCredentials: jest.fn(), getProviderSettings: jest.fn() }));
jest.mock('@/lib/services/crm/stageGateService', () => ({ evaluateStageGate: jest.fn(async () => ({ ok: true, missing: [] })) }));

import { getCallAiPolicy } from '@/lib/services/crm/callAiPolicy';
import { evaluateStageGate } from '@/lib/services/crm/stageGateService';
import { analyzeCall, applyAnalysis, runPostAnalysisActions, runAnalysisLlm, AnalysisError, getAnalysis } from '@/lib/services/crm/callAnalysisService';
import { TASK_PRIORITIES, TASK_STATUSES } from '@/lib/crm/enums';
import { buildObjectionRow, OBJECTION_DETECTED_BY_VALUES, maskSensitiveForLlm } from '@/lib/services/crm/callAnalysisRules';

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
  objections: [{ objection_id: 'ob-1', label: 'Precio elevado', quote: 'está caro', confidence: 0.8 }],
  competitors: ['OtroCRM'],
  budget_mentioned: 20000000,
  decision_maker_identified: true,
  discovery: { budget: '20M', authority: 'CEO', need: 'CRM', timeline: 'Q4', goals: null, obstacles: null, consequences: null },
  suggested_stage_id: 'st-2',
  suggested_stage_confidence: 0.92,
  suggested_tasks: [{ title: 'Enviar propuesta', type: 'email', priority: 'high', due_date: '2026-09-15' }],
  tags: ['Interesado'],
  temperature: 'hot',
};

function db(over: Record<string, any[]> = {}) {
  return new FakeDb({
    tables: {
      calls: [{ id: 'call-1', organization_id: 7, direction: 'outbound', mode: 'browser', status: 'completed', answered_by: 'human', started_at: '2026-09-01T10:00:00Z', ended_at: '2026-09-01T10:01:00Z', duration_seconds: 120, customer_id: 'cus-1', opportunity_id: 'opp-1', user_id: 'usr-1' }],
      customers: [{ id: 'cus-1', organization_id: 7, first_name: 'Ana', last_name: 'Ruiz', full_name: 'Ana Ruiz', company_name: 'Acme', phone: '+57300' }],
      opportunities: [{ id: 'opp-1', organization_id: 7, name: 'Acme CRM', amount: 1000, currency: 'COP', stage_id: 'st-1', pipeline_id: 'pl-1', discovery_data: {}, salesperson_id: 'usr-2' }],
      stages: [
        { id: 'st-1', organization_id: 7, pipeline_id: 'pl-1', name: 'Descubrimiento', position: 1, exit_criteria: null },
        { id: 'st-2', organization_id: 7, pipeline_id: 'pl-1', name: 'Propuesta', position: 2, exit_criteria: null },
        { id: 'st-otro', organization_id: 7, pipeline_id: 'pl-OTRO', name: 'Cierre', position: 9, exit_criteria: null },
      ],
      objections: [{ id: 'ob-1', organization_id: 7, title: 'Precio elevado', category: 'precio', detection_signals: ['caro'], is_active: true, sort_order: 1 }],
      call_tags: [{ id: 'tag-int', organization_id: 7, name: 'Interesado' }],
      call_tag_relations: [],
      call_transcripts: [{ id: 'tr-1', organization_id: 7, call_id: 'call-1', provider: 'elevenlabs', provider_model: 'scribe_v2', language: 'spa', status: 'completed', full_text: 'Hola, buenas tardes.', word_count: 4, speaker_count: 2, duration_seconds: 120, raw_response: {}, created_at: '2026-09-01T10:02:00Z' }],
      call_transcript_segments: [
        { id: 'sg-1', transcript_id: 'tr-1', organization_id: 7, speaker_label: 's0', speaker_role: 'agent', start_ms: 0, end_ms: 1000, text: 'Hola, buenas tardes.', confidence: 0.9 },
        { id: 'sg-2', transcript_id: 'tr-1', organization_id: 7, speaker_label: 's1', speaker_role: 'customer', start_ms: 1000, end_ms: 2000, text: 'Está caro pero me interesa.', confidence: 0.9 },
      ],
      call_analyses: [],
      activities: [],
      tasks: [],
      opportunity_objections: [],
      ai_usage_logs: [{ id: 101, model: 'gemini-3.8-flash', metadata: { provider: 'google', unit_sku: 'gemini_3_8_flash_in' } }],
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

const runners = (overrides: Partial<Record<'google' | 'openai', any>> = {}) => ({
  google: jest.fn(async () => ({ parsed: LLM, usage: { input: 5000, output: 900 } })),
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  (getCallAiPolicy as jest.Mock).mockResolvedValue(POLICY);
  (evaluateStageGate as jest.Mock).mockResolvedValue({ ok: true, missing: [] });
  chargeAiCredits.mockResolvedValue({ credits: 1, logId: 101, cost_amount: 0.001 });
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('G · analyzeCall', () => {
  it('G1 · camino feliz: guarda análisis con sentiment válido, etapa validada y objeciones mapeadas', async () => {
    const d = db();
    const a = await analyzeCall(7, 'call-1', { supabase: d.client(), runners: runners() as any });
    expect(a.sentiment).toBe('positive');
    expect(a.suggested_stage_id).toBe('st-2');
    expect(a.suggested_stage_confidence).toBeCloseTo(0.92);
    expect(a.detected_objections?.[0]).toMatchObject({ objection_id: 'ob-1', match: 'id' });
    expect(a.raw_response?.prompt_version).toBe('v1');
    expect(d.rows('call_analyses')).toHaveLength(1);
  });

  it('G2 · llamada de otra organización → CALL_NOT_FOUND', async () => {
    await expect(analyzeCall(999, 'call-1', { supabase: db().client(), runners: runners() as any })).rejects.toMatchObject({ code: 'CALL_NOT_FOUND' });
  });

  it('G3 · sin transcripción completada → NO_TRANSCRIPT y sin cobrar créditos', async () => {
    const d = db({ call_transcripts: [{ id: 'tr-1', organization_id: 7, call_id: 'call-1', status: 'failed', full_text: null, raw_response: {} }] });
    await expect(analyzeCall(7, 'call-1', { supabase: d.client(), runners: runners() as any })).rejects.toMatchObject({ code: 'NO_TRANSCRIPT' });
    expect(chargeAiCredits).not.toHaveBeenCalled();
  });

  it('G4 · IDEMPOTENCIA: analizar dos veces sin force → UNA sola fila y un solo cobro', async () => {
    const d = db();
    const sb = d.client();
    const r = runners();
    await analyzeCall(7, 'call-1', { supabase: sb, runners: r as any });
    await analyzeCall(7, 'call-1', { supabase: sb, runners: r as any });
    expect(d.rows('call_analyses')).toHaveLength(1);
    expect(chargeAiCredits).toHaveBeenCalledTimes(1);
    expect(r.google).toHaveBeenCalledTimes(1);
  });

  it('G5 · force=true crea un análisis NUEVO (histórico) y getAnalysis devuelve el último', async () => {
    const d = db();
    const sb = d.client();
    await analyzeCall(7, 'call-1', { supabase: sb, runners: runners() as any });
    await new Promise((r) => setTimeout(r, 5));
    await analyzeCall(7, 'call-1', { supabase: sb, force: true, runners: runners() as any });
    expect(d.rows('call_analyses')).toHaveLength(2);
    expect(await getAnalysis('call-1', 7, sb)).not.toBeNull();
  });

  it('G6 · CORREGIDO (r2): si el INSERT de call_analyses falla (CHECK de sentiment) el error es AnalysisError PERSIST_ERROR no reintentable y los créditos SE reembolsan', async () => {
    const d = db();
    chargeAiCredits.mockResolvedValue({ credits: 6, logId: 101, cost_amount: 0.06 });
    const bad = { google: jest.fn(async () => ({ parsed: { ...LLM, sentiment: 'eufórico' }, usage: null })) };
    const err = await analyzeCall(7, 'call-1', { supabase: d.client(), runners: bad as any }).catch((e) => e);
    expect(d.rows('call_analyses')).toHaveLength(0);
    expect(err).toBeInstanceOf(AnalysisError);
    expect(err).toMatchObject({ code: 'PERSIST_ERROR', retryable: false });
    expect(String(err.message)).toMatch(/call_analyses insert falló/);
    // Ronda 3: el reembolso puede llegar en DOS movimientos (ajuste al costo real
    // + cierre del saldo vivo). Se comprueba la conservación —se devuelve
    // exactamente lo cobrado— en vez de exigir un único movimiento de 6.
    const refunded = (refundAiCredits.mock.calls as unknown as Array<[{ credits?: number }]>).reduce((n, c) => n + (c[0].credits ?? 0), 0);
    expect(refunded).toBe(6);
    for (const c of refundAiCredits.mock.calls as unknown as Array<[{ logId?: number; actionType?: string }]>) {
      expect(c[0]).toMatchObject({ logId: 101, actionType: 'call_analyze' });
    }
  });

  it('G6b · el esquema zod del prompt sí rechaza un sentiment fuera del CHECK (camino real del proveedor)', () => {
    const { analysisZod } = jest.requireActual('@/lib/services/crm/prompts/callAnalysisPrompt') as typeof import('@/lib/services/crm/prompts/callAnalysisPrompt');
    expect(() => analysisZod.parse({ ...LLM, sentiment: 'eufórico' })).toThrow();
    expect(() => analysisZod.parse(LLM)).not.toThrow();
  });

  it('G7 · suggested_stage_id de OTRO pipeline → se guarda null (no contamina la oportunidad)', async () => {
    const d = db();
    const r = { google: jest.fn(async () => ({ parsed: { ...LLM, suggested_stage_id: 'st-otro' }, usage: null })) };
    const a = await analyzeCall(7, 'call-1', { supabase: d.client(), runners: r as any });
    expect(a.suggested_stage_id).toBeNull();
    expect(a.raw_response?.rejected_stage_id).toBe('st-otro');
  });

  it('G8 · fallo de todos los proveedores → reembolso de créditos y AnalysisError', async () => {
    const d = db();
    chargeAiCredits.mockResolvedValue({ credits: 4, logId: 77, cost_amount: 0.04 });
    const r = { google: jest.fn(async () => { throw new Error('503'); }), openai: jest.fn(async () => { throw new Error('401'); }) };
    await expect(analyzeCall(7, 'call-1', { supabase: d.client(), runners: r as any })).rejects.toMatchObject({ code: 'PROVIDER_ERROR' });
    expect(refundAiCredits).toHaveBeenCalledWith(expect.objectContaining({ credits: 4, logId: 77, actionType: 'call_analyze' }));
  });

  it('G9 · sin créditos → INSUFFICIENT_CREDITS y no se llama al LLM', async () => {
    chargeAiCredits.mockRejectedValue(new InsufficientCreditsError());
    const r = runners();
    await expect(analyzeCall(7, 'call-1', { supabase: db().client(), runners: r as any })).rejects.toMatchObject({ code: 'INSUFFICIENT_CREDITS' });
    expect(r.google).not.toHaveBeenCalled();
  });

  it('G10 · cascada google→openai: se reconcilia ai_usage_logs al modelo REAL usado', async () => {
    const d = db();
    const r = {
      google: jest.fn(async () => { throw new Error('404 model not available'); }),
      openai: jest.fn(async () => ({ parsed: LLM, usage: { input: 100, output: 100 } })),
    };
    const a = await analyzeCall(7, 'call-1', { supabase: d.client(), runners: r as any });
    expect(a.provider).toBe('openai');
    const log = d.rows('ai_usage_logs')[0];
    expect(log.model).toBe('gpt-5.6-luna');
    expect(log.metadata.provider).toBe('openai');
    expect(log.metadata.estimated_model).toBe('gemini-3.8-flash');
  });

  it('G11 · etiquetas automáticas: se crea/reutiliza la etiqueta y la relación con source=ia', async () => {
    const d = db();
    await analyzeCall(7, 'call-1', { supabase: d.client(), runners: runners() as any });
    const rels = d.rows('call_tag_relations');
    expect(rels.length).toBeGreaterThan(0);
    expect(rels.every((r) => r.source === 'ia')).toBe(true);
    expect(d.rows('call_tags').some((t) => t.name === 'Caliente')).toBe(true);
  });

  it('G12 · etiquetas: repetir el análisis no duplica relaciones (idempotente)', async () => {
    const d = db();
    const sb = d.client();
    await analyzeCall(7, 'call-1', { supabase: sb, runners: runners() as any });
    const n = d.rows('call_tag_relations').length;
    await analyzeCall(7, 'call-1', { supabase: sb, force: true, runners: runners() as any });
    expect(d.rows('call_tag_relations')).toHaveLength(n);
  });

  it('G13 · el LLM sugiere etiquetas que NO existen en la org → no se inventan (solo temperatura)', async () => {
    const d = db();
    const r = { google: jest.fn(async () => ({ parsed: { ...LLM, tags: ['EtiquetaFantasma'] }, usage: null })) };
    const a = await analyzeCall(7, 'call-1', { supabase: d.client(), runners: r as any });
    expect(a.raw_response?.suggested_tags).not.toContain('EtiquetaFantasma');
    expect(a.raw_response?.suggested_tags).toContain('Caliente');
  });

  it('G14 · calidad < 50 añade la etiqueta "Calidad baja"', async () => {
    const d = db();
    const r = { google: jest.fn(async () => ({ parsed: { ...LLM, quality_score: 30 }, usage: null })) };
    await analyzeCall(7, 'call-1', { supabase: d.client(), runners: r as any });
    expect(d.rows('call_tags').some((t) => t.name === 'Calidad baja')).toBe(true);
  });

  it('G15 · runAnalysisLlm respeta el orden de la política (openai primero)', async () => {
    const order: string[] = [];
    const r = {
      google: jest.fn(async () => { order.push('google'); return { parsed: LLM, usage: null }; }),
      openai: jest.fn(async () => { order.push('openai'); return { parsed: LLM, usage: null }; }),
    };
    const out = await runAnalysisLlm(7, 'p', { ...POLICY, analysisProvider: 'openai' } as any, r as any);
    expect(order[0]).toBe('openai');
    expect(out.provider).toBe('openai');
  });

  it('G17 · CORREGIDO (r2): aunque no cambie el proveedor, ai_usage_logs queda con el costo REAL (tokens de entrada Y salida)', async () => {
    const d = db();
    chargeAiCredits.mockImplementation(async (input: any) => {
      // reproduce lo que hace aiCostService: guarda units/cost estimados en metadata
      d.rows('ai_usage_logs')[0].metadata = { ...d.rows('ai_usage_logs')[0].metadata, units: input.units, cost_amount: input.units * 0.75 };
      return { credits: 1, logId: 101, cost_amount: input.units * 0.75 };
    });
    const a = await analyzeCall(7, 'call-1', { supabase: d.client(), runners: runners() as any });
    const log = d.rows('ai_usage_logs')[0];
    expect(log.metadata.estimated_model).toBeUndefined(); // no hubo fallback: el modelo no cambia
    expect(log.metadata.cost_amount).toBeCloseTo(a.raw_response!.cost_usd as number, 8);
    expect(log.metadata.real_tokens_in).toBe(5000);
    expect(log.metadata.real_tokens_out).toBe(900);
    expect(log.metadata.cost_source).toBe('provider_usage');
  });

  it('G18 · CORREGIDO (r2): un fallo determinista DESPUÉS del LLM es fatal para el job (un solo cobro) y se reembolsa', async () => {
    const { JobFatalError, JobRetryableError } = jest.requireActual('@/lib/jobs/types') as typeof import('@/lib/jobs/types');
    const d = db();
    const sb = d.client();
    const bad = { google: jest.fn(async () => ({ parsed: { ...LLM, sentiment: 'eufórico' }, usage: null })) };
    const err = await analyzeCall(7, 'call-1', { supabase: sb, runners: bad as any }).catch((e) => e);
    expect(err).toBeInstanceOf(AnalysisError);
    expect((err as AnalysisError).retryable).toBe(false);
    // Mismo mapeo que hace src/lib/jobs/handlers/analyze.ts con un AnalysisError.
    const mapped = (e: AnalysisError) => (e.retryable ? new JobRetryableError(e.message) : new JobFatalError(`${e.code}: ${e.message}`));
    expect(mapped(err as AnalysisError)).toBeInstanceOf(JobFatalError); // 1 intento = 1 cobro
    expect(chargeAiCredits).toHaveBeenCalledTimes(1);
    expect(bad.google).toHaveBeenCalledTimes(1);
    expect(refundAiCredits).toHaveBeenCalledTimes(1);
  });

  it('G19 · CORREGIDO (r2): el fallo del PROVEEDOR sí sigue siendo reintentable (no se confunde con el determinista)', async () => {
    const d = db();
    const r = { google: jest.fn(async () => { throw Object.assign(new Error('503 upstream'), { status: 503 }); }), openai: jest.fn(async () => { throw Object.assign(new Error('503 upstream'), { status: 503 }); }) };
    const err = await analyzeCall(7, 'call-1', { supabase: d.client(), runners: r as any }).catch((e) => e as AnalysisError);
    expect(err).toMatchObject({ code: 'PROVIDER_ERROR', retryable: true });
    expect(refundAiCredits).toHaveBeenCalledTimes(1);
  });

  it('G20 · CORREGIDO (r2): al caer a otro proveedor los créditos se ajustan a la tarifa del que respondió', async () => {
    const d = db();
    chargeAiCredits.mockResolvedValue({ credits: 1, logId: 101, cost_amount: 0.001 });
    const r = {
      google: jest.fn(async () => { throw new Error('404 model not available'); }),
      // 4M tokens de entrada: a $0.75/1M son 3 USD → 300 créditos frente al 1 cobrado.
      openai: jest.fn(async () => ({ parsed: LLM, usage: { input: 4_000_000, output: 0 } })),
    };
    const a = await analyzeCall(7, 'call-1', { supabase: d.client(), runners: r as any });
    expect(a.provider).toBe('openai');
    expect(a.raw_response?.credits_adjustment).toBe(299);
    expect(chargeAiCredits).toHaveBeenLastCalledWith(expect.objectContaining({ actionType: 'call_analyze:adjust', credits: 299 }));
  });

  it('G21 · CORREGIDO (r2): si la tarifa real es MENOR se reembolsa la diferencia (nunca se sobrecobra)', async () => {
    const d = db();
    chargeAiCredits.mockResolvedValue({ credits: 50, logId: 101, cost_amount: 0.5 });
    const a = await analyzeCall(7, 'call-1', { supabase: d.client(), runners: runners() as any });
    expect(a.raw_response?.credits_adjustment).toBeLessThan(0);
    expect(refundAiCredits).toHaveBeenCalledWith(expect.objectContaining({ reason: 'credit_settlement_overcharge' }));
  });

  it('G16 · el costo real se calcula con los tokens devueltos, no con la estimación', async () => {
    const d = db();
    const a = await analyzeCall(7, 'call-1', { supabase: d.client(), runners: runners() as any });
    // 5000 in + 900 out con unit cost mockeado 0.75 → 0.004425
    expect(a.raw_response?.cost_usd).toBeCloseTo((5000 / 1e6) * 0.75 + (900 / 1e6) * 0.75, 6);
  });
});

describe('H · applyAnalysis', () => {
  async function seeded() {
    const d = db();
    const sb = d.client();
    const a = await analyzeCall(7, 'call-1', { supabase: sb, runners: runners() as any });
    return { d, sb, a };
  }

  it('H1 · aplicar etapa con gate OK → mueve la oportunidad', async () => {
    const { d, sb, a } = await seeded();
    const res = await applyAnalysis(a.id, 7, 'usr-1', sb, { stage: true });
    expect(res?.applied).toContain('stage');
    expect(d.rows('opportunities')[0].stage_id).toBe('st-2');
  });

  it('H2 · gate NO cumplido → no mueve la etapa y devuelve gate_not_met', async () => {
    (evaluateStageGate as jest.Mock).mockResolvedValue({ ok: false, missing: [{ field: 'budget' }] });
    const { d, sb, a } = await seeded();
    const res = await applyAnalysis(a.id, 7, 'usr-1', sb, { stage: true });
    expect(res?.applied).not.toContain('stage');
    expect(res?.skipped).toContainEqual({ action: 'stage', reason: 'gate_not_met' });
    expect(d.rows('opportunities')[0].stage_id).toBe('st-1');
  });

  it('H3 · ignoreGate fuerza el movimiento aunque el gate falle', async () => {
    (evaluateStageGate as jest.Mock).mockResolvedValue({ ok: false, missing: [] });
    const { d, sb, a } = await seeded();
    await applyAnalysis(a.id, 7, 'usr-1', sb, { stage: true }, { ignoreGate: true });
    expect(d.rows('opportunities')[0].stage_id).toBe('st-2');
  });

  it('H4 · tareas: se crean con priority/status dentro del CHECK y related_to_*', async () => {
    const { d, sb, a } = await seeded();
    const res = await applyAnalysis(a.id, 7, 'usr-1', sb, { tasks: 'all' });
    expect(res?.applied).toContain('task:0');
    const t = d.rows('tasks')[0];
    expect(TASK_PRIORITIES).toContain(t.priority);
    expect(t.status).toBe('open');
    expect(t).toMatchObject({ related_to_type: 'opportunity', related_to_id: 'opp-1' });
    expect(t.related_id).toBeUndefined();
  });

  it('H5 · IDEMPOTENCIA: aplicar dos veces no duplica tareas', async () => {
    const { d, sb, a } = await seeded();
    await applyAnalysis(a.id, 7, 'usr-1', sb, { tasks: 'all' });
    const res2 = await applyAnalysis(a.id, 7, 'usr-1', sb, { tasks: 'all' });
    expect(d.rows('tasks')).toHaveLength(1);
    expect(res2?.skipped.some((s) => s.action === 'tasks')).toBe(true);
  });

  it('H6 · índices de tarea fuera de rango se ignoran', async () => {
    const { d, sb, a } = await seeded();
    await applyAnalysis(a.id, 7, 'usr-1', sb, { tasks: [42] });
    expect(d.rows('tasks')).toHaveLength(0);
  });

  it('H7 · discovery: rellena solo los campos vacíos de la oportunidad', async () => {
    const { d, sb, a } = await seeded();
    await applyAnalysis(a.id, 7, 'usr-1', sb, { discovery: true });
    expect(d.rows('opportunities')[0].discovery_data).toMatchObject({ budget: '20M', authority: 'CEO', need: 'CRM' });
  });

  it('H8 · discovery: segunda pasada → nothing_new / already_applied', async () => {
    const { sb, a } = await seeded();
    await applyAnalysis(a.id, 7, 'usr-1', sb, { discovery: true });
    const r2 = await applyAnalysis(a.id, 7, 'usr-1', sb, { discovery: true });
    expect(r2?.applied).not.toContain('discovery');
  });

  it('H9 · CORREGIDO (r2): aplicar objeciones inserta detected_by="ia" (dentro del CHECK manual|ia)', async () => {
    const { d, sb, a } = await seeded();
    const res = await applyAnalysis(a.id, 7, 'usr-1', sb, { objections: true });
    expect(res?.applied).toContain('objections');
    expect(d.rows('opportunity_objections')).toHaveLength(1);
    expect(d.rows('opportunity_objections')[0]).toMatchObject({
      organization_id: 7,
      opportunity_id: 'opp-1',
      objection_id: 'ob-1',
      detected_by: 'ia',
      resolved: false,
      notes: 'está caro',
    });
    expect(OBJECTION_DETECTED_BY_VALUES).toContain(d.rows('opportunity_objections')[0].detected_by);
  });

  it('H9b · CORREGIDO (r2): repetir la acción no duplica la objeción (idempotente)', async () => {
    const { d, sb, a } = await seeded();
    await applyAnalysis(a.id, 7, 'usr-1', sb, { objections: true });
    const r2 = await applyAnalysis(a.id, 7, 'usr-1', sb, { objections: true });
    expect(d.rows('opportunity_objections')).toHaveLength(1);
    expect(r2?.skipped).toContainEqual({ action: 'objections', reason: 'already_applied' });
  });

  it('H9c · CORREGIDO (r2): buildObjectionRow rechaza cualquier valor fuera del CHECK real', () => {
    expect(buildObjectionRow({ orgId: 7, opportunityId: 'o', objectionId: 'x' }).detected_by).toBe('ia');
    expect(() => buildObjectionRow({ orgId: 7, opportunityId: 'o', objectionId: 'x', detectedBy: 'ai' as never })).toThrow(/fuera del CHECK/);
  });

  it('H10 · análisis de OTRA organización → null (sin efectos)', async () => {
    const { d, sb, a } = await seeded();
    expect(await applyAnalysis(a.id, 999, 'usr-1', sb, { stage: true, tasks: 'all' })).toBeNull();
    expect(d.rows('tasks')).toHaveLength(0);
    expect(d.rows('opportunities')[0].stage_id).toBe('st-1');
  });

  it('H11 · applied_actions queda registrado en raw_response y `applied` se marca', async () => {
    const { d, sb, a } = await seeded();
    await applyAnalysis(a.id, 7, 'usr-1', sb, { tasks: 'all', discovery: true });
    const row = d.rows('call_analyses').find((r) => r.id === a.id)!;
    expect(row.applied).toBe(true);
    expect(row.raw_response.applied_actions).toEqual(expect.arrayContaining(['task:0', 'discovery']));
    expect(row.raw_response.last_apply_source).toBe('user');
  });

  it('H12 · política `suggest` NUNCA mueve etapa ni crea tareas', async () => {
    const { d, sb, a } = await seeded();
    await runPostAnalysisActions(7, a, { ...POLICY, apply: 'suggest' } as any, sb);
    expect(d.rows('opportunities')[0].stage_id).toBe('st-1');
    expect(d.rows('tasks')).toHaveLength(0);
  });

  it('H13 · política `auto` con confianza ≥ umbral mueve etapa y crea tareas', async () => {
    const { d, sb, a } = await seeded();
    await runPostAnalysisActions(7, a, { ...POLICY, apply: 'auto' } as any, sb);
    expect(d.rows('opportunities')[0].stage_id).toBe('st-2');
    expect(d.rows('tasks')).toHaveLength(1);
  });

  it('H14 · política `auto` con confianza < umbral NO mueve etapa (gate de confianza)', async () => {
    const d = db();
    const sb = d.client();
    const r = { google: jest.fn(async () => ({ parsed: { ...LLM, suggested_stage_confidence: 0.4 }, usage: null })) };
    const a = await analyzeCall(7, 'call-1', { supabase: sb, runners: r as any });
    await runPostAnalysisActions(7, a, { ...POLICY, apply: 'auto' } as any, sb);
    expect(d.rows('opportunities')[0].stage_id).toBe('st-1');
  });

  it('H15 · sin acciones solicitadas → no cambia nada', async () => {
    const { d, sb, a } = await seeded();
    const res = await applyAnalysis(a.id, 7, 'usr-1', sb, {});
    expect(res?.applied).toHaveLength(0);
    expect(d.rows('tasks')).toHaveLength(0);
  });
});

describe('P · Enmascarado de datos sensibles antes del LLM (r2)', () => {
  it('P1 · una tarjeta dictada en la llamada no sale hacia el proveedor', () => {
    const out = maskSensitiveForLlm('[00:10] [CLIENTE]: mi tarjeta es 4539 1488 0343 6467, apúntala');
    expect(out).not.toContain('4539');
    expect(out).toContain('[TARJETA ****6467]');
  });

  it('P2 · CVV y claves se ocultan', () => {
    expect(maskSensitiveForLlm('el cvv: 123')).toBe('el cvv: [OCULTO]');
    expect(maskSensitiveForLlm('la contraseña es Secreta99')).toContain('[OCULTO]');
  });

  it('P3 · NO se enmascara lo que el análisis necesita (nombres, importes, teléfonos cortos)', () => {
    const t = '[00:00] [AGENTE]: Hola Ana Ruiz de Acme, hablamos de 20000000 COP al 3001112233';
    expect(maskSensitiveForLlm(t)).toBe(t);
  });
});
