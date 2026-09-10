/**
 * TESTER F4 · ronda 4 — casos adversariales NUEVOS sobre lo que el constructor
 * declara corregido en `F4-r4.md`.
 *
 *  - U1-U7: tercera versión del enmascarado. Las dos anteriores fallaban en los
 *    dos sentidos; aquí se ataca con frases que NO están en la suite del builder.
 *  - U8-U11: dinero. Se comprueba la separación de las dos deudas, la traza y se
 *    buscan defectos de la MISMA familia en el sitio contiguo.
 *  - U12: el camino `?sync=1` de transcripción, que encadena análisis en línea.
 *
 * Todo con dobles en memoria: sin red ni BD.
 */
import fs from 'fs';
import path from 'path';
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
jest.mock('@/lib/services/crm/pricingService', () => ({ getUnitCost: jest.fn(async () => 0.75), round6: (n: number) => n }));
jest.mock('@/lib/services/crm/callAiPolicy', () => ({ getCallAiPolicy: jest.fn() }));
jest.mock('@/lib/services/crm/recordingStorageService', () => ({ downloadFromTwilio: jest.fn() }));
jest.mock('@/lib/services/providerCredentials.server', () => ({ getProviderCredentials: jest.fn(), getProviderSettings: jest.fn() }));
jest.mock('@/lib/services/crm/stageGateService', () => ({ evaluateStageGate: jest.fn(async () => ({ ok: true, missing: [] })) }));

import { getCallAiPolicy } from '@/lib/services/crm/callAiPolicy';
import { CreditLedger } from '@/lib/services/crm/transcriptionService';
import { analyzeCall } from '@/lib/services/crm/callAnalysisService';
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
      calls: [{ id: 'call-u', organization_id: 7, direction: 'outbound', mode: 'browser', status: 'completed', answered_by: 'human', started_at: '2026-09-01T10:00:00Z', ended_at: '2026-09-01T10:01:00Z', duration_seconds: 120, customer_id: null, opportunity_id: null, user_id: 'usr-1' }],
      customers: [], opportunities: [], stages: [], objections: [], call_tags: [], call_tag_relations: [],
      call_transcripts: [{ id: 'tr-u', organization_id: 7, call_id: 'call-u', provider: 'elevenlabs', provider_model: 'scribe_v2', language: 'spa', status: 'completed', full_text: 'Hola, buenas tardes.', word_count: 4, speaker_count: 2, duration_seconds: 120, raw_response: {}, created_at: '2026-09-01T10:02:00Z' }],
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

const runner = () => jest.fn(async () => ({ parsed: LLM, usage: { input: 100, output: 50 } }));

let errors: string[] = [];
let origError: typeof console.error;

beforeEach(() => {
  jest.clearAllMocks();
  (getCallAiPolicy as jest.Mock).mockResolvedValue(POLICY);
  chargeAiCredits.mockResolvedValue({ credits: 30, logId: 101 });
  refundAiCredits.mockResolvedValue(true);
  errors = [];
  origError = console.error;
  console.error = (...a: unknown[]) => { errors.push(a.map(String).join(' ')); };
});
afterEach(() => { console.error = origError; });

// ══════════════════════════════════════════════════════════════════════════
// U1-U7 · enmascarado v3: ataque con frases NUEVAS
// ══════════════════════════════════════════════════════════════════════════
describe('U-A · enmascarado (tercera versión): ataque con frases nuevas', () => {
  it('U1 · CORREGIDO (r5): un producto/modelo alfanumérico tras «clave» queda INTACTO', () => {
    // La vía (a) vuelve a cortar por conector y «clave» se descarta cuando la
    // frase la usa como adjetivo, modismo o genitivo ajeno a una credencial.
    const casos = [
      'La clave del negocio es el iPhone16',
      'el factor clave fue el plan Pro2026',
      'la clave está en el Modelo3 que vende más',
      'la clave del proyecto es Fase2',
      'la clave del éxito es Windows11',
      'nuestro código de seguridad interno es ISO9001',
    ];
    for (const c of casos) {
      expect(maskSensitiveForLlm(c)).toBe(c);
    }
  });

  it('U2 · CORREGIDO (r5): una cifra de negocio de 3-6 dígitos SIN unidad tras «clave» queda INTACTA', () => {
    // Tras «clave» (palabra débil) la vía de sólo dígitos está cerrada.
    expect(maskSensitiveForLlm('el número clave es 150000')).toBe('el número clave es 150000');
    expect(maskSensitiveForLlm('la cifra clave es 4500')).toBe('la cifra clave es 4500');
    expect(maskSensitiveForLlm('la clave es 300000, lo hablamos mañana')).toBe('la clave es 300000, lo hablamos mañana');
  });

  it('U3 · LÍMITE DECLARADO (L3): contraseña de sólo dígitos larga tras palabra FUERTE no se oculta', () => {
    // Ahora está escrito en el docblock de `maskSensitiveForLlm` y en el doc §14.2.
    expect(maskSensitiveForLlm('mi contraseña es 987654321')).toBe('mi contraseña es 987654321');
    expect(maskSensitiveForLlm('el pin de la app es 1234567890')).toBe('el pin de la app es 1234567890');
  });

  it('U4 · LÍMITE DECLARADO (L4): el valor ANTES de la palabra clave nunca se oculta', () => {
    expect(maskSensitiveForLlm('Sol2024 es mi clave')).toBe('Sol2024 es mi clave');
    expect(maskSensitiveForLlm('anota 4321, ese es el pin de la tarjeta')).toContain('4321');
  });

  it('U5 · LÍMITE DECLARADO (L5): el fin de frase corta aunque el secreto siga', () => {
    expect(maskSensitiveForLlm('Te digo el pin. Es 4321')).toContain('4321');
    expect(maskSensitiveForLlm('Apunta la contraseña: Sol2024')).toContain('[OCULTO]'); // los dos puntos NO cortan
  });

  it('U6 · LÍMITE DECLARADO (L6): fuera de la ventana de 6 palabras el secreto se salva', () => {
    const t = 'la clave que te dije por teléfono el otro día es Sol2024';
    expect(maskSensitiveForLlm(t)).toBe(t);
  });

  it('U6b · LÍMITE DECLARADO (L7/L8): palabra ajena por medio y producto sin genitivo', () => {
    // L7: el corte por conector es lo que salva a `ISO9001`, y su precio es éste.
    expect(maskSensitiveForLlm('nuestra clave interna es Sol2024')).toBe('nuestra clave interna es Sol2024');
    // L8: un producto anunciado sin genitivo ni adjetivo sigue borrándose.
    expect(maskSensitiveForLlm('la clave es el iPhone16')).toContain('[OCULTO]');
  });

  it('U6c · la batería COMPLETA de las tres versiones pasa a la vez (aciertos)', () => {
    // Aciertos exigidos por f4Round2 (R25-R32), f4Round3 (T8-T10) y f4Round4Builder (B4-B8).
    expect(maskSensitiveForLlm('mi tarjeta es 4111-1111-1111-1111')).toContain('[TARJETA ****1111]');
    expect(maskSensitiveForLlm('4539 1488 0343 6467 por favor')).toContain('[TARJETA ****6467]');
    expect(maskSensitiveForLlm('La clave de acceso es Secreta99')).toBe('La clave de acceso es [OCULTO]');
    expect(maskSensitiveForLlm('mi clave personal es Sol2024')).toBe('mi clave personal es [OCULTO]');
    expect(maskSensitiveForLlm('la clave, apúntala bien, es Ana1990')).toBe('la clave, apúntala bien, es [OCULTO]');
    expect(maskSensitiveForLlm('la contraseña que usamos siempre es Verano2025')).toContain('[OCULTO]');
    expect(maskSensitiveForLlm('el pin de mi tarjeta es 4321')).toBe('el pin de mi tarjeta es [OCULTO]');
    expect(maskSensitiveForLlm('el código de seguridad es 4321')).toBe('el código de seguridad es [OCULTO]');
    expect(maskSensitiveForLlm('el otp es 123456')).toBe('el otp es [OCULTO]');
  });

  it('U6d · la batería COMPLETA de las tres versiones pasa a la vez (falsos positivos)', () => {
    for (const frase of [
      'La clave del negocio es el servicio',
      'La clave está en el precio',
      'El factor clave para cerrar es la garantía',
      'La clave es 20000000 al mes',
      'El dato clave es 2026',
      'la clave del trimestre es 15 por ciento',
      'el factor clave son 30000 pesos',
      'La clave está en el precio, cerramos por 45000 pesos',
      'la clave es 1234567',
      'la clave es Girasol',
      'la contraseña es girasol',
      'la referencia 1234567890123456',
      'Habla Ana Ruiz de Acme, el presupuesto es 20000000 y el teléfono 3001234567',
    ]) {
      expect(maskSensitiveForLlm(frase)).toBe(frase);
    }
  });

  it('U7 · NO REGRESIÓN: lo que ya funcionaba en r3 sigue funcionando', () => {
    expect(maskSensitiveForLlm('anota 4111 1111 1111 1111')).toBe('anota [TARJETA ****1111]');
    expect(maskSensitiveForLlm('anota 4111.1111.1111.1111')).toBe('anota [TARJETA ****1111]');
    expect(maskSensitiveForLlm('el cvv es 123')).toBe('el cvv es [OCULTO]');
    expect(maskSensitiveForLlm('La clave está en el precio')).toBe('La clave está en el precio');
    expect(maskSensitiveForLlm('La clave del negocio es el servicio')).toBe('La clave del negocio es el servicio');
    expect(maskSensitiveForLlm('La clave es 20000000 al mes')).toBe('La clave es 20000000 al mes');
  });
});

// ══════════════════════════════════════════════════════════════════════════
// U8-U12 · dinero: separación de deudas, traza y sitio contiguo
// ══════════════════════════════════════════════════════════════════════════
describe('U-B · dinero: las dos deudas, la traza y el sitio contiguo', () => {
  it('U8 · las dos cifras NO se solapan y el importe publicado dice la verdad (camino feliz)', async () => {
    const db = analysisDb();
    chargeAiCredits.mockResolvedValue({ credits: 30, logId: 101 });
    refundAiCredits.mockResolvedValue(false); // la RPC rechaza el ajuste a la baja
    const a = await analyzeCall(7, 'call-u', { supabase: db.client(), runners: { google: runner() } as any });
    // El importe cobrado NO se rebaja: la organización sigue debiendo 30.
    expect(a.raw_response?.credits).toBe(30);
    expect(a.raw_response?.credits_charged).toBe(30);
    expect(a.raw_response?.credits_adjustment).toBe(0);
    expect(a.raw_response?.pending_refund_credits).toBe(29);
    expect(a.raw_response?.credit_settlement_error).toBeTruthy();
    // Fila conciliable con la etapa `settle` y sin movimiento de saldo.
    const filas = db.rows('ai_usage_logs').filter((r: any) => r.action_type === 'call_analyze:refund_failed');
    expect(filas).toHaveLength(1);
    expect(filas[0].credits_consumed).toBe(0);
    expect(filas[0].metadata.stage).toBe('settle');
    expect(filas[0].metadata.pending_refund_credits).toBe(29);
    expect(errors.some((e) => /REEMBOLSO FALLIDO \(settle\)/.test(e))).toBe(true);
  });

  it('U9 · la conciliación DOCUMENTADA (filtrando por `stage`) da 30; la suma ingenua daría 59', async () => {
    const db = analysisDb();
    db.failOn['call_analyses:insert'] = 'boom';
    chargeAiCredits.mockResolvedValue({ credits: 30, logId: 101 });
    refundAiCredits.mockResolvedValue(false);
    const err = await analyzeCall(7, 'call-u', { supabase: db.client(), runners: { google: runner() } as any }).catch((e) => e);
    // El MENSAJE está bien: dice 30, la deuda real.
    expect(String((err as Error).message)).toMatch(/no se pudieron devolver 30 créditos/i);
    const filas = db.rows('ai_usage_logs').filter((r: any) => r.action_type === 'call_analyze:refund_failed');
    expect(filas).toHaveLength(2);
    const suma = filas.reduce((s: number, r: any) => s + r.metadata.pending_refund_credits, 0);
    expect(suma).toBe(59); // ← la query "ingenua" de conciliación daría 59 por una deuda de 30
    // La query de conciliación que documenta §16.6: una sola fila por
    // `refunded_log_id`, quedándose con la etapa `close` cuando existe.
    const porLog = new Map<number, any>();
    for (const f of filas as any[]) {
      const previa = porLog.get(f.metadata.refunded_log_id);
      if (!previa || (previa.metadata.stage === 'settle' && f.metadata.stage === 'close')) porLog.set(f.metadata.refunded_log_id, f);
    }
    const deudaReal = [...porLog.values()].reduce((s: number, r: any) => s + r.metadata.pending_refund_credits, 0);
    expect(deudaReal).toBe(30); // coincide con el mensaje de error
  });

  it('U10 · CORREGIDO (r5): el ajuste AL ALZA rechazado ya NO publica una deuda de reembolso de 0', async () => {
    const db = analysisDb();
    chargeAiCredits.mockResolvedValueOnce({ credits: 1, logId: 101 }).mockRejectedValue(new InsufficientCreditsError());
    const a = await analyzeCall(7, 'call-u', {
      supabase: db.client(),
      runners: { google: jest.fn(async () => ({ parsed: LLM, usage: { input: 50_000_000, output: 10_000_000 } })) } as any,
    });
    expect(a.raw_response?.credits).toBe(1);
    expect(a.raw_response?.credits_adjustment).toBe(0);
    expect(a.raw_response?.credit_settlement_error).toMatch(/insuficientes/i);
    // En un INFRAcobro no se debe nada: la clave de deuda no aparece (P6).
    expect(a.raw_response?.pending_refund_credits).toBeUndefined();
    expect(Object.keys(a.raw_response ?? {})).not.toContain('pending_refund_credits');
    // Y NO hay fila :refund_failed (correcto: no hubo reembolso que aplicar).
    expect(db.rows('ai_usage_logs').filter((r: any) => r.action_type === 'call_analyze:refund_failed')).toHaveLength(0);
  });

  it('U11 · CORREGIDO (r5): `refundOutstanding` es idempotente también cuando la RPC rechaza', async () => {
    // Con la RPC aceptando, la segunda llamada no hace nada (invariante de r3).
    refundAiCredits.mockResolvedValue(true);
    const ok = new CreditLedger({ orgId: 7, actionType: 'call_analyze', model: 'm', provider: 'google', charged: 30, logId: 1 });
    await ok.refundOutstanding('x');
    await ok.refundOutstanding('x');
    expect(refundAiCredits).toHaveBeenCalledTimes(1);
    expect(ok.unrefunded).toBe(0);

    // Con la RPC rechazando, `outstanding` NO baja (es correcto: el saldo sigue
    // debitado), pero el intento queda anotado: la segunda llamada devuelve el
    // mismo resultado sin repetir la RPC ni duplicar la deuda declarada.
    jest.clearAllMocks();
    refundAiCredits.mockResolvedValue(false);
    const ko = new CreditLedger({ orgId: 7, actionType: 'call_analyze', model: 'm', provider: 'google', charged: 30, logId: 1 });
    const r1 = await ko.refundOutstanding('x');
    const r2 = await ko.refundOutstanding('x');
    expect(refundAiCredits).toHaveBeenCalledTimes(1);
    expect(ko.unrefunded).toBe(30); // ← la deuda es la del cobro, no el doble
    expect(r1.ok).toBe(false);
    expect(r2).toEqual(r1);
    expect(ko.outstanding).toBe(30); // el saldo sigue debitado: nadie lo devolvió
  });

  it('U12 · CORREGIDO (r5): las DOS rutas `?sync=1` consultan el job vivo antes de ejecutar', () => {
    // El defecto era que sólo `/analyze` comprobaba `findLiveCallJob`, mientras
    // `POST /transcribe?sync=1` entraba en el pipeline con `inlineAnalyze: true`
    // y llegaba al cobro de análisis sin guardia.
    const base = path.resolve(__dirname, '../../../../app/api/crm/calls/[id]');
    const analyze = fs.readFileSync(path.join(base, 'analyze/route.ts'), 'utf8');
    const transcribe = fs.readFileSync(path.join(base, 'transcribe/route.ts'), 'utf8');
    for (const [src, pipeline] of [[analyze, 'runAnalysisPipeline('], [transcribe, 'runTranscribePipeline(']] as const) {
      expect(src).toContain('findLiveCallJob');
      // el guardia va ANTES de ejecutar el pipeline en línea
      expect(src.indexOf('findLiveCallJob(')).toBeLessThan(src.indexOf(pipeline));
      // y si la consulta falla, se publica en vez de tragarse
      expect(src).toContain('dedupe_checked');
    }
    expect(transcribe).toContain("findLiveCallJob(ctx.organizationId, id, 'analyze'");
    expect(transcribe).toContain("findLiveCallJob(ctx.organizationId, id, 'transcribe'");
  });

  it('U12b · LÍMITE DECLARADO: la exclusión vive en las rutas, no en el servicio', async () => {
    // Dos `analyzeCall` verdaderamente simultáneos (dos procesos que pasan el
    // guardia a la vez) siguen pudiendo cobrar dos veces: es el riesgo asumido
    // por escrito en §16.2, que exige un cerrojo en BD para cerrarse.
    const db = analysisDb();
    const client = db.client();
    chargeAiCredits.mockResolvedValue({ credits: 30, logId: 101 });
    const [a, b] = await Promise.all([
      analyzeCall(7, 'call-u', { supabase: client, runners: { google: runner() } as any }),
      analyzeCall(7, 'call-u', { supabase: client, runners: { google: runner() } as any }),
    ]);
    expect(chargeAiCredits).toHaveBeenCalledTimes(2);
    expect(db.rows('call_analyses').length).toBe(2);
    expect(a.id).not.toBe(b.id);
  });
});
