/**
 * BUILDER F4 · ronda 4 — cobertura propia de lo que la ronda 4 corrige o cierra.
 *
 * Cubre exactamente tres huecos señalados por `TEST-F4-r3.md`:
 *  - ítem 10 / N7: la reconciliación fallida se declaraba corregida y NINGÚN test
 *    lo afirmaba (B1-B3);
 *  - N3: el enmascarado fallaba en los dos sentidos con frases comerciales
 *    corrientes; aquí quedan fijadas las dos reglas nuevas y también LO QUE NO
 *    cubre, para no volver a declararlo cerrado (B4-B8);
 *  - N4: la mitigación del doble cobro de análisis (dedupe del reintento forzado
 *    y comprobación de job vivo en el camino `?sync=1`) (B9-B12).
 *
 * Todo con dobles en memoria: sin red ni BD.
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
import { transcribeCall, CreditLedger } from '@/lib/services/crm/transcriptionService';
import { analyzeCall } from '@/lib/services/crm/callAnalysisService';
import { maskSensitiveForLlm } from '@/lib/services/crm/callAnalysisRules';
import { forceRetryBucket, FORCE_RETRY_WINDOW_MS, findLiveCallJob, ANALYZE_DEDUPE } from '@/lib/services/crm/callIntelligenceService';
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
      calls: [{ id: 'call-r4', organization_id: 7, direction: 'outbound', mode: 'browser', status: 'completed', answered_by: 'human', started_at: '2026-09-01T10:00:00Z', ended_at: '2026-09-01T10:01:00Z', duration_seconds: 120, customer_id: null, opportunity_id: null, user_id: 'usr-1' }],
      customers: [], opportunities: [], stages: [], objections: [], call_tags: [], call_tag_relations: [],
      call_transcripts: [{ id: 'tr-r4', organization_id: 7, call_id: 'call-r4', provider: 'elevenlabs', provider_model: 'scribe_v2', language: 'spa', status: 'completed', full_text: 'Hola, buenas tardes.', word_count: 4, speaker_count: 2, duration_seconds: 120, raw_response: {}, created_at: '2026-09-01T10:02:00Z' }],
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

function sttDb(over: Record<string, any[]> = {}, storagePath = 'org_7/2026/09/call-b.wav', bytes = 90000) {
  return new FakeDb({
    tables: {
      calls: [{ id: 'call-b', organization_id: 7, direction: 'outbound', mode: 'browser', status: 'completed', answered_by: 'human', started_at: '2026-09-01T10:00:00Z', ended_at: '2026-09-01T10:01:00Z', duration_seconds: 3600, customer_id: null, opportunity_id: null, user_id: 'usr-1' }],
      call_recordings: [{ id: 'rec-b', organization_id: 7, call_id: 'call-b', storage_path: storagePath, storage_provider: 'supabase', channels: '2', duration_seconds: 3600, size_bytes: bytes, status: 'ready' }],
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

let errors: string[] = [];

beforeEach(() => {
  jest.clearAllMocks();
  errors = [];
  (getCallAiPolicy as jest.Mock).mockResolvedValue(POLICY);
  getUnitCost.mockResolvedValue(0.75);
  refundAiCredits.mockResolvedValue(true);
  chargeAiCredits.mockResolvedValue({ credits: 1, logId: 101, cost_amount: 0.001 });
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation((...a: unknown[]) => {
    errors.push(a.map(String).join(' '));
  });
});
afterEach(() => jest.restoreAllMocks());

// ═══════════════════════════════════════════════════════════════════════════
// B · ítem 10 del tester (r2 nº 10): la reconciliación fallida deja rastro.
//     Estaba corregida en el código y sin NINGÚN test que lo afirmara (r3 N7):
//     si alguien quitaba la traza, las 208 pruebas de F4 seguían verdes.
// ═══════════════════════════════════════════════════════════════════════════
describe('B-A · reconciliación de ai_usage_logs fallida: se ve', () => {
  it('B1 · analyzeCall: log inexistente → raw_response.usage_log_reconciled=false + console.error', async () => {
    const db = analysisDb();
    // logId que no existe en ai_usage_logs: la reconciliación no puede aplicarse.
    chargeAiCredits.mockResolvedValue({ credits: 4, logId: 999 });
    const a = await analyzeCall(7, 'call-r4', { supabase: db.client(), runners: { google: jest.fn(async () => ({ parsed: LLM, usage: { input: 100, output: 50 } })) } as any });
    expect(a.raw_response?.usage_log_reconciled).toBe(false);
    expect(errors.some((e) => /reconciliación de ai_usage_logs=999 falló/.test(e))).toBe(true);
  });

  it('B2 · transcribeCall: mismo caso en la rama STT', async () => {
    const db = sttDb();
    chargeAiCredits.mockResolvedValue({ credits: 22, logId: 999, cost_amount: 0.22 });
    transcribeWithFallbackMock.mockResolvedValue(okSttResult('openai', 'gpt-transcribe', 0.01));
    const t = await transcribeCall(7, 'call-b', { supabase: db.client() as SupabaseClient });
    expect(t.raw_response?.usage_log_reconciled).toBe(false);
    expect(errors.some((e) => /reconciliación de ai_usage_logs=999 falló/.test(e))).toBe(true);
  });

  it('B3 · cuando SÍ se reconcilia, la fila lo dice y no hay error', async () => {
    const db = analysisDb();
    chargeAiCredits.mockResolvedValue({ credits: 4, logId: 101 });
    const a = await analyzeCall(7, 'call-r4', { supabase: db.client(), runners: { google: jest.fn(async () => ({ parsed: LLM, usage: { input: 100, output: 50 } })) } as any });
    expect(a.raw_response?.usage_log_reconciled).toBe(true);
    expect(errors.some((e) => /reconciliación/.test(e))).toBe(false);
    // y la fila de ai_usage_logs quedó con la economía real, no la estimada
    const log = db.rows('ai_usage_logs').find((r: any) => r.id === 101)!;
    expect(log.metadata.unit_cost_usd).toBe(0.75);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// B-B · enmascarado (tester r3 N3). Se fijan las DOS reglas nuevas y, sobre
//       todo, lo que la heurística NO cubre: no se declara cerrada.
// ═══════════════════════════════════════════════════════════════════════════
describe('B-B · enmascarado: las dos reglas nuevas y sus límites', () => {
  it('B4 · cifras de negocio tras «clave» quedan intactas (importes, años, porcentajes)', () => {
    for (const frase of [
      'La clave es 20000000 al mes',
      'El dato clave es 2026',
      'la clave del trimestre es 15 por ciento',
      'el factor clave son 30000 pesos',
      'La clave está en el precio',
      'La clave del negocio es el servicio',
    ]) {
      expect(maskSensitiveForLlm(frase)).toBe(frase);
    }
  });

  it('B5 · una credencial con letras Y dígitos se oculta aunque haya palabras sueltas por medio', () => {
    expect(maskSensitiveForLlm('mi clave personal es Sol2024')).toBe('mi clave personal es [OCULTO]');
    expect(maskSensitiveForLlm('la clave, apúntala bien, es Ana1990')).toBe('la clave, apúntala bien, es [OCULTO]');
    expect(maskSensitiveForLlm('La clave de acceso es Secreta99')).toBe('La clave de acceso es [OCULTO]');
    expect(maskSensitiveForLlm('la contraseña que usamos siempre es Verano2025')).toContain('[OCULTO]');
  });

  it('B6 · las palabras clave FUERTES admiten números cortos; «clave» sola no admite números largos', () => {
    expect(maskSensitiveForLlm('cvv: 123')).toBe('cvv: [OCULTO]');
    expect(maskSensitiveForLlm('el código de seguridad es 4321')).toBe('el código de seguridad es [OCULTO]');
    expect(maskSensitiveForLlm('el pin de mi tarjeta es 4321')).toBe('el pin de mi tarjeta es [OCULTO]');
    expect(maskSensitiveForLlm('el otp es 123456')).toBe('el otp es [OCULTO]');
    // «clave» + número de más de 6 cifras = importe, no credencial.
    expect(maskSensitiveForLlm('la clave es 1234567')).toBe('la clave es 1234567');
  });

  it('B7 · una frase que menciona «clave» y más adelante una cifra ajena no se toca', () => {
    const t = 'La clave está en el precio, cerramos por 45000 pesos';
    expect(maskSensitiveForLlm(t)).toBe(t);
  });

  it('B8 · LÍMITE DECLARADO (no corregido): una credencial de sólo letras NO se oculta', () => {
    // Es el precio de no destrozar frases comerciales; queda dicho aquí y en el
    // doc §14.2 para que nadie declare el enmascarado "cerrado".
    expect(maskSensitiveForLlm('la clave es Girasol')).toBe('la clave es Girasol');
    expect(maskSensitiveForLlm('la contraseña es girasol')).toBe('la contraseña es girasol');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// B-C · doble cobro de análisis (tester r3 N4): mitigación REAL de los dos
//       caminos que dispara la UI.
// ═══════════════════════════════════════════════════════════════════════════
describe('B-C · dedupe del reintento forzado y del camino ?sync=1', () => {
  it('B9 · dos clics en la misma ventana comparten dedupe_key; una ventana después, no', () => {
    const t0 = 1_770_000_000_000;
    expect(forceRetryBucket(t0)).toBe(forceRetryBucket(t0 + 900));
    expect(forceRetryBucket(t0)).toBe(forceRetryBucket(t0 + FORCE_RETRY_WINDOW_MS - 1));
    expect(forceRetryBucket(t0)).not.toBe(forceRetryBucket(t0 + FORCE_RETRY_WINDOW_MS));
    // La clave que llega a outbound_jobs es idéntica en la misma ventana: el
    // índice único parcial (queued|running) sólo deja pasar el primer job.
    const key = (n: number) => `${ANALYZE_DEDUPE('call-r4')}:retry:${n}`;
    expect(key(forceRetryBucket(t0))).toBe(key(forceRetryBucket(t0 + 900)));
  });

  it('B10 · findLiveCallJob encuentra el job vivo de la llamada (y sólo el de su organización)', async () => {
    const rows = [
      { id: 'job-1', organization_id: 7, kind: 'analyze', status: 'queued', dedupe_key: 'analyze:call-r4' },
      { id: 'job-2', organization_id: 9, kind: 'analyze', status: 'queued', dedupe_key: 'analyze:call-r4' },
      { id: 'job-3', organization_id: 7, kind: 'analyze', status: 'done', dedupe_key: 'analyze:call-r4' },
    ];
    const sb = stubJobsClient(rows);
    const live = await findLiveCallJob(7, 'call-r4', 'analyze', sb);
    expect(live).toEqual({ jobId: 'job-1', checked: true, error: null });

    const vacio = await findLiveCallJob(7, 'otra-llamada', 'analyze', stubJobsClient(rows));
    expect(vacio).toEqual({ jobId: null, checked: true, error: null });
  });

  it('B11 · si la comprobación falla NO se finge que no hay job: checked=false y console.error', async () => {
    const sb = stubJobsClient([], 'outbound_jobs caído');
    const live = await findLiveCallJob(7, 'call-r4', 'analyze', sb);
    expect(live.checked).toBe(false);
    expect(live.jobId).toBeNull();
    expect(live.error).toBe('outbound_jobs caído');
    expect(errors.some((e) => /no se pudo comprobar si hay un job analyze vivo/.test(e))).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// B-D · invariante de dinero con el ajuste rechazado (tester r3 N1).
// ═══════════════════════════════════════════════════════════════════════════
describe('B-D · conservación con ajuste a la baja rechazado', () => {
  it('B12 · ajuste rechazado + cierre aceptado devuelve EXACTAMENTE lo cobrado', async () => {
    // La RPC rechaza el movimiento de 29 (ajuste) y acepta el de 30 (cierre).
    refundAiCredits.mockImplementation(async (a: any) => a.credits !== 29);
    const led = new CreditLedger({ orgId: 7, actionType: 'call_analyze', model: 'm', provider: 'google', charged: 30, logId: 1 });
    const settled = await led.settle({ realCredits: 1 });
    expect(settled.ok).toBe(false);
    expect(settled.unrefunded).toBe(29);
    expect(led.outstanding).toBe(30);
    const close = await led.refundOutstanding('fallo posterior');
    expect(close).toEqual({ refunded: 30, ok: true, error: null });
    expect(led.refunded).toBe(30);
    expect(led.outstanding).toBe(0);
    expect(led.unrefunded).toBe(0); // el cierre sí volvió: no hay deuda definitiva
  });

  it('B13 · ajuste rechazado + cierre rechazado: la deuda definitiva es el cobro, no la suma de intentos', async () => {
    refundAiCredits.mockResolvedValue(false);
    const led = new CreditLedger({ orgId: 7, actionType: 'call_transcribe', model: 'm', provider: 'openai', charged: 30, logId: 1 });
    await led.settle({ realCredits: 1 });
    const close = await led.refundOutstanding('fallo posterior');
    expect(close.ok).toBe(false);
    expect(close.refunded).toBe(0);
    expect(led.unrefunded).toBe(30); // no 59 (29 del ajuste + 30 del cierre)
    expect(led.unsettled).toBe(29);
  });
});

/** Cliente mínimo para `findLiveCallJob`: select/eq/in/like/limit sobre outbound_jobs. */
function stubJobsClient(rows: Array<Record<string, unknown>>, failWith?: string): SupabaseClient {
  return {
    from: (_t: string) => {
      let out = [...rows];
      const b: any = {
        select: () => b,
        eq: (col: string, val: unknown) => {
          out = out.filter((r) => String(r[col]) === String(val));
          return b;
        },
        in: (col: string, vals: unknown[]) => {
          out = out.filter((r) => vals.map(String).includes(String(r[col])));
          return b;
        },
        like: (col: string, pattern: string) => {
          const re = new RegExp(`^${pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*')}$`);
          out = out.filter((r) => re.test(String(r[col])));
          return b;
        },
        limit: (n: number) => {
          out = out.slice(0, n);
          return b;
        },
        then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
          Promise.resolve(failWith ? { data: null, error: { message: failWith } } : { data: out, error: null }).then(res, rej),
      };
      return b;
    },
  } as unknown as SupabaseClient;
}
