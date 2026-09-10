/**
 * Reglas del análisis IA (FASE-04 §9.1): enums reales de BD (sentiment `mixed`,
 * tasks priority `med`/status `open`), etapa sugerida validada contra el
 * pipeline, objeciones ↔ catálogo, discovery merge.
 */
import { analysisZod, renderCallAnalysisPrompt, CALL_ANALYSIS_JSON_SCHEMA, type CallAnalysisLlm } from '../prompts/callAnalysisPrompt';
import { buildTaskRow, mapObjectionsToCatalog, mapTaskPriority, mapTaskStatus, mergeDiscovery, normalizeDueDate, tokenSimilarity, validateSuggestedStage } from '../callAnalysisRules';
import { policyFromSettings, DEFAULT_CALL_AI_POLICY } from '../callAiPolicy';
import { TASK_PRIORITIES, TASK_STATUSES } from '@/lib/crm/enums';

const sample: CallAnalysisLlm = {
  summary: 'El cliente pidió cotización; objeta el precio.',
  sentiment: 'mixed',
  sentiment_score: 0.1,
  quality_score: 72,
  quality_breakdown: { greeting: 80, discovery: 70, pitch: 75, objection_handling: 60, closing: 65, professionalism: 85 },
  talk_ratio_agent: 0.55,
  talk_ratio_customer: 0.45,
  longest_monologue_seconds: 40,
  questions_asked: 6,
  next_steps: [{ action: 'Enviar propuesta', owner: 'agent', due_date: '2026-09-10' }],
  objections: [
    { objection_id: null, label: 'El precio es muy alto', quote: 'el precio es muy alto', confidence: 0.9 },
    { objection_id: 'obj-timing', label: 'No es el momento', quote: 'hablemos en enero', confidence: 0.7 },
    { objection_id: 'obj-inexistente', label: 'Ya trabajo con otro proveedor', quote: 'tengo otro proveedor', confidence: 0.8 },
    { objection_id: null, label: 'Algo totalmente distinto zzz', quote: '', confidence: 0.4 },
  ],
  competitors: ['Acme'],
  budget_mentioned: 5000000,
  decision_maker_identified: true,
  discovery: { budget: '5M COP', authority: 'Gerente', need: 'Facturación', timeline: null, goals: null, obstacles: null, consequences: null },
  suggested_stage_id: 'st-2',
  suggested_stage_confidence: 0.86,
  suggested_tasks: [
    { title: 'Enviar propuesta', type: 'email', priority: 'high', due_date: '2026-09-10' },
    { title: 'Llamar de seguimiento', type: 'call', priority: 'med', due_date: null },
  ],
  tags: ['Objeción precio', 'Inventada'],
  temperature: 'warm',
};

const stages = [
  { id: 'st-1', name: 'Prospecto', position: 1 },
  { id: 'st-2', name: 'Calificado', position: 2 },
  { id: 'st-3', name: 'Propuesta', position: 3 },
];

describe('analysisZod (schema v1)', () => {
  it('acepta `mixed` y las prioridades reales de tasks', () => {
    const parsed = analysisZod.parse(sample);
    expect(parsed.sentiment).toBe('mixed');
    expect(parsed.suggested_tasks[1].priority).toBe('med');
  });
  it('rechaza sentimientos/prioridades fuera del CHECK de BD', () => {
    expect(() => analysisZod.parse({ ...sample, sentiment: 'angry' })).toThrow();
    expect(() => analysisZod.parse({ ...sample, suggested_tasks: [{ title: 'x', type: 'task', priority: 'medium', due_date: null }] })).toThrow();
    expect(() => analysisZod.parse({ ...sample, temperature: 'lukewarm' })).toThrow();
  });
  it('JSON schema estricto: todas las claves required y additionalProperties=false', () => {
    expect(CALL_ANALYSIS_JSON_SCHEMA.additionalProperties).toBe(false);
    expect(new Set(CALL_ANALYSIS_JSON_SCHEMA.required)).toEqual(new Set(Object.keys(CALL_ANALYSIS_JSON_SCHEMA.properties)));
    expect((CALL_ANALYSIS_JSON_SCHEMA.properties.sentiment as unknown as { enum: readonly string[] }).enum).toContain('mixed');
  });
  it('el prompt incluye catálogo de etapas con ids, objeciones y la transcripción en español', () => {
    const prompt = renderCallAnalysisPrompt({
      call: { direction: 'outbound', durationSeconds: 300, startedAt: '2026-09-08T10:00:00Z' },
      customer: { fullName: 'Juan Pérez', companyName: 'Acme SAS' },
      opportunity: { name: 'Licencia ERP', amount: 5000000, currency: 'COP', stageId: 'st-1', stageName: 'Prospecto', stages: stages.map((s) => ({ ...s, exitCriteriaText: '' })), discoveryData: {} },
      objections: [{ id: 'obj-price', title: 'Precio alto', category: 'price', signalsText: 'caro, costoso' }],
      tags: ['Objeción precio'],
      recentActivities: [],
      transcript: { text: '[00:00] [AGENTE]: Hola Juan', segmentCount: 1 },
    });
    expect(prompt).toContain('st-2');
    expect(prompt).toContain('Calificado');
    expect(prompt).toContain('obj-price');
    expect(prompt).toContain('[AGENTE]: Hola Juan');
    expect(prompt).toMatch(/mixed/);
  });
});

describe('validateSuggestedStage', () => {
  it('id válido del pipeline y distinto de la actual → se conserva con su confianza', () => {
    expect(validateSuggestedStage('st-2', 0.86, stages, 'st-1')).toEqual({ stageId: 'st-2', confidence: 0.86, rejectedStageId: null });
  });
  it('id inexistente (alucinado) → null + rejectedStageId', () => {
    expect(validateSuggestedStage('st-otro-pipeline', 0.9, stages, 'st-1')).toEqual({ stageId: null, confidence: 0, rejectedStageId: 'st-otro-pipeline' });
  });
  it('misma etapa actual → null sin rechazo; nombre en vez de id → tolerado; confianza acotada', () => {
    expect(validateSuggestedStage('st-1', 0.9, stages, 'st-1').stageId).toBeNull();
    expect(validateSuggestedStage('propuesta', 1.7, stages, 'st-1')).toEqual({ stageId: 'st-3', confidence: 1, rejectedStageId: null });
    expect(validateSuggestedStage(null, 0.5, stages, 'st-1').stageId).toBeNull();
  });
});

describe('tareas: enums reales', () => {
  it('mapTaskPriority/mapTaskStatus → CHECK de BD', () => {
    expect(mapTaskPriority('medium')).toBe('med');
    expect(mapTaskPriority('urgent')).toBe('critical');
    expect(mapTaskPriority('high')).toBe('high');
    expect(mapTaskPriority('baja')).toBe('low');
    expect(mapTaskPriority(undefined)).toBe('med');
    expect(mapTaskStatus('pending')).toBe('open');
    expect(mapTaskStatus('completed')).toBe('done');
    for (const p of ['low', 'medium', 'high', 'urgent', 'xxx']) expect(TASK_PRIORITIES).toContain(mapTaskPriority(p));
    for (const s of ['pending', 'todo', 'open', 'done']) expect(TASK_STATUSES).toContain(mapTaskStatus(s));
  });
  it('buildTaskRow: status open, priority válida, related_to_* a la oportunidad y assigned_to', () => {
    const row = buildTaskRow({ title: 'Enviar propuesta', type: 'email', priority: 'medium', due_date: 'mañana' }, 0, {
      orgId: 7, callId: 'call-1', opportunityId: 'opp-1', customerId: 'cus-1', assignedTo: 'user-sales', createdBy: 'user-1', analysisId: 'an-1',
    });
    expect(row).toMatchObject({ organization_id: 7, status: 'open', priority: 'med', related_to_id: 'opp-1', related_to_type: 'opportunity', assigned_to: 'user-sales', customer_id: 'cus-1', type: 'email', due_date: null });
    expect(row.tags).toContain('analysis:an-1');
    // Sin oportunidad → related a la llamada
    const row2 = buildTaskRow({ title: 'x', type: 'weird' }, 1, { orgId: 7, callId: 'call-1', opportunityId: null, customerId: null, assignedTo: null, createdBy: null, analysisId: 'an-1' });
    expect(row2).toMatchObject({ related_to_id: 'call-1', related_to_type: 'call', type: 'task', priority: 'med' });
  });
  it('normalizeDueDate solo acepta YYYY-MM-DD', () => {
    expect(normalizeDueDate('2026-09-10')).toBe('2026-09-10');
    expect(normalizeDueDate('2026-09-10T10:00:00Z')).toBe('2026-09-10');
    expect(normalizeDueDate('mañana')).toBeNull();
    expect(normalizeDueDate('2026-13-40')).toBeNull();
  });
});

describe('mapObjectionsToCatalog', () => {
  const catalog = [
    { id: 'obj-price', title: 'Precio alto', category: 'price', detection_signals: ['muy caro', 'el precio es alto', 'costoso'] },
    { id: 'obj-timing', title: 'No es el momento', category: 'timing', detection_signals: ['más adelante'] },
    { id: 'obj-competitor', title: 'Ya tiene proveedor', category: 'competition', detection_signals: ['otro proveedor'] },
  ];
  it('id válido → match id; sin id → similitud con título/señales; id inválido → similitud; sin parecido → null', () => {
    const mapped = mapObjectionsToCatalog(sample.objections, catalog);
    expect(mapped[0]).toMatchObject({ objection_id: 'obj-price', match: 'title' });
    expect(mapped[1]).toMatchObject({ objection_id: 'obj-timing', match: 'id', confidence: 0.7 });
    expect(mapped[2]).toMatchObject({ objection_id: 'obj-competitor', match: 'title' });
    expect(mapped[3]).toMatchObject({ objection_id: null, match: null, confidence: 0.4 });
  });
  it('tokenSimilarity ignora acentos y stopwords', () => {
    expect(tokenSimilarity('El precio es muy alto', 'Precio alto')).toBe(1);
    expect(tokenSimilarity('Cotización', 'cotizacion')).toBe(1);
    expect(tokenSimilarity('abc', '')).toBe(0);
  });
});

describe('mergeDiscovery', () => {
  it('no pisa valores existentes y reporta claves añadidas', () => {
    const { merged, added } = mergeDiscovery({ budget: 'ya definido', need: '' }, { budget: 'nuevo', need: 'Facturación', timeline: null, goals: 'x' });
    expect(merged).toEqual({ budget: 'ya definido', need: 'Facturación', goals: 'x' });
    expect(added).toEqual(['need', 'goals']);
  });
});

describe('policyFromSettings (provider_configs stt/analysis)', () => {
  it('defaults con settings vacíos; auto_apply=auto y umbral acotado', () => {
    const d = policyFromSettings({ provider: 'none', settings: {}, source: 'none' }, { provider: 'none', settings: {}, source: 'none' });
    expect(d).toMatchObject({ ...DEFAULT_CALL_AI_POLICY, asyncWebhook: false });
    const p = policyFromSettings(
      { provider: 'google', settings: { language_code: 'es', dual_transcribe: 'false', min_duration_seconds: '10' }, source: 'org' },
      { provider: 'openai', settings: { auto_apply: 'auto', stage_confidence_threshold: 1.5, model: 'gpt-5.6-luna', auto_analyze: false }, source: 'org' },
    );
    expect(p).toMatchObject({ sttProvider: 'google', analysisProvider: 'openai', analysisModel: 'gpt-5.6-luna', language: 'es', dualTranscribe: false, minDurationSeconds: 10, apply: 'auto', stageConfidenceThreshold: 1, autoAnalyze: false });
  });
});
