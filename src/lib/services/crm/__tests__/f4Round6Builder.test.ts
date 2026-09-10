/**
 * BUILDER F4 · ronda 6 — los tres defectos de `TEST-F4-r5.md` (nota 9,2).
 *
 *  - D1-D3: enmascarado v5. La batería COMPLETA de las CUATRO versiones
 *    anteriores (aciertos, falsos positivos y límites de `f4Round5Builder`
 *    C1-C3) MÁS los ocho sustantivos que la v4 dejaba pasar (tester r5 N2) y
 *    los límites nuevos, en un solo sitio. Se escribió ANTES de tocar la regla.
 *  - D4-D5: la guarda de trabajo vivo en el camino de COLA de `/transcribe`
 *    (tester r5 N1) y su gemelo de interfaz en los DOS paneles.
 *  - D6: el memo del cierre rechazado, comparado por CIERRE y no por importe
 *    (tester r5 N3).
 *
 * Dobles en memoria y lectura de fuentes: sin red ni BD.
 */
import fs from 'fs';
import path from 'path';

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

import { maskSensitiveForLlm } from '@/lib/services/crm/callAnalysisRules';
import { CreditLedger } from '@/lib/services/crm/transcriptionService';

const ROUTES = path.resolve(__dirname, '../../../../app/api/crm/calls/[id]');
const COMPONENTS = path.resolve(__dirname, '../../../../components/crm/calls');
const src = (p: string) => fs.readFileSync(path.join(ROUTES, p), 'utf8');
const cmp = (p: string) => fs.readFileSync(path.join(COMPONENTS, p), 'utf8');

let errors: string[] = [];
let origError: typeof console.error;
let origWarn: typeof console.warn;
beforeEach(() => {
  jest.clearAllMocks();
  refundAiCredits.mockResolvedValue(true);
  errors = [];
  origError = console.error;
  origWarn = console.warn;
  console.error = (...a: unknown[]) => { errors.push(a.map(String).join(' ')); };
  console.warn = () => {};
});
afterEach(() => { console.error = origError; console.warn = origWarn; });

// ══════════════════════════════════════════════════════════════════════════
// D1-D3 · enmascarado v5: la batería de las CUATRO versiones, a la vez (N2)
// ══════════════════════════════════════════════════════════════════════════
describe('D-A · enmascarado v5: aciertos, falsos positivos y límites', () => {
  it('D1 · ACIERTOS heredados: todo lo que las cuatro versiones exigían ocultar se sigue ocultando', () => {
    // Tarjetas (r2 R25-R28, r3, U7).
    expect(maskSensitiveForLlm('mi tarjeta es 4111-1111-1111-1111')).toBe('mi tarjeta es [TARJETA ****1111]');
    expect(maskSensitiveForLlm('4539 1488 0343 6467 por favor')).toBe('[TARJETA ****6467] por favor');
    expect(maskSensitiveForLlm('anota 4111.1111.1111.1111')).toBe('anota [TARJETA ****1111]');
    const partida = maskSensitiveForLlm('[00:10] [CLIENTE]: 4111 1111\n[00:12] [CLIENTE]: 1111 1111');
    expect(partida).toContain('[TARJETA ****1111]');
    expect(partida).toContain('\n');
    // Palabras clave FUERTES + dígitos (r2 R30/R32, r4 B6).
    expect(maskSensitiveForLlm('cvv: 123')).toBe('cvv: [OCULTO]');
    expect(maskSensitiveForLlm('el cvv es 123')).toBe('el cvv es [OCULTO]');
    expect(maskSensitiveForLlm('el código de seguridad es 4321')).toBe('el código de seguridad es [OCULTO]');
    expect(maskSensitiveForLlm('el pin de mi tarjeta es 4321')).toBe('el pin de mi tarjeta es [OCULTO]');
    expect(maskSensitiveForLlm('el otp es 123456')).toBe('el otp es [OCULTO]');
    // Credenciales alfanuméricas (r3 R29, r4 B5/T9, r5 C1).
    expect(maskSensitiveForLlm('La clave de acceso es Secreta99')).toBe('La clave de acceso es [OCULTO]');
    expect(maskSensitiveForLlm('la contraseña es Secreta99')).toBe('la contraseña es [OCULTO]');
    expect(maskSensitiveForLlm('mi clave personal es Sol2024')).toBe('mi clave personal es [OCULTO]');
    expect(maskSensitiveForLlm('la clave, apúntala bien, es Ana1990')).toBe('la clave, apúntala bien, es [OCULTO]');
    expect(maskSensitiveForLlm('la contraseña que usamos siempre es Verano2025')).toBe('la contraseña que usamos siempre es [OCULTO]');
    expect(maskSensitiveForLlm('Apunta la contraseña: Sol2024')).toBe('Apunta la contraseña: [OCULTO]');
    expect(maskSensitiveForLlm('la clave del wifi es Sol2024')).toBe('la clave del wifi es [OCULTO]');
  });

  it('D1b · FUGA CERRADA (tester r5 N2/V1): los sustantivos declarados «de credencial» ya no cortan la búsqueda', () => {
    const frases = [
      'la clave del router es Admin2024',
      'la clave del sistema es Sol2024',
      'la clave del portal es Verano2025',
      'la clave de la red es Ana1990',
      'la clave de la plataforma es Secreta99',
      'la clave del modem es Casa2020',
      'la clave de ingreso es Sol2024',
      'la clave de login es Sol2024',
    ];
    const filtradas = frases.filter((s) => maskSensitiveForLlm(s).includes('[OCULTO]'));
    expect(filtradas).toEqual(frases); // las ocho, no siete
  });

  it('D1c · el ejemplo del propio doc con su grafía habitual (tester r5 V4)', () => {
    expect(maskSensitiveForLlm('la clave del wifi es Sol2024')).toContain('[OCULTO]');
    expect(maskSensitiveForLlm('la clave del Wi-Fi es Sol2024')).toContain('[OCULTO]');
    expect(maskSensitiveForLlm('la clave del wi-fi es Sol2024')).toContain('[OCULTO]');
  });

  it('D1d · «la palabra clave DE ACCESO» vuelve a leerse como credencial (tester r5 V2, mitad rescatada)', () => {
    expect(maskSensitiveForLlm('la palabra clave de acceso es Verano2025')).toContain('[OCULTO]');
    expect(maskSensitiveForLlm('la palabra clave del wifi es Sol2024')).toContain('[OCULTO]');
  });

  it('D2 · FALSOS POSITIVOS: nada de lo que cada versión destrozaba se toca ya', () => {
    for (const frase of [
      // r2 nº 8 (frases comerciales con «clave»).
      'La clave del negocio es el servicio',
      'La clave está en el precio',
      'El factor clave para cerrar es la garantía',
      // r3 N3 (cifras y años tras «clave»).
      'La clave es 20000000 al mes',
      'El dato clave es 2026',
      'la clave del trimestre es 15 por ciento',
      'el factor clave son 30000 pesos',
      'La clave está en el precio, cerramos por 45000 pesos',
      'la clave es 1234567',
      // r4 P1 (productos, normas y cifras sin unidad).
      'La clave del negocio es el iPhone16',
      'el factor clave fue el plan Pro2026',
      'la clave del proyecto es Fase2',
      'la clave del éxito es Windows11',
      'nuestro código de seguridad interno es ISO9001',
      'la clave está en el Modelo3 que vende más',
      'el número clave es 150000',
      'la cifra clave es 4500',
      'la clave es 300000, lo hablamos mañana',
      // Contexto que el análisis necesita (r2 R26/R33, P3).
      'la referencia 1234567890123456',
      'Habla Ana Ruiz de Acme, el presupuesto es 20000000 y el teléfono 3001234567',
      '[00:00] [AGENTE]: Hola Ana Ruiz de Acme, hablamos de 20000000 COP al 3001112233',
      // r6: los sustantivos nuevos NO deben abrir la vía de sólo dígitos tras «clave»
      // (siguen siendo cifras de negocio) ni tocar frases sin valor alfanumérico.
      'la clave del sistema es 150000',
      'la clave de la plataforma es el servicio',
      'la palabra clave del negocio es el iPhone16',
      'nuestras palabras clave son marketing y ventas',
    ]) {
      expect(maskSensitiveForLlm(frase)).toBe(frase);
    }
  });

  it('D3 · LÍMITES DECLARADOS L1-L12: lo que la heurística NO cubre, fijado por prueba', () => {
    expect(maskSensitiveForLlm('la clave es Girasol')).toBe('la clave es Girasol'); // L1
    expect(maskSensitiveForLlm('la contraseña es girasol')).toBe('la contraseña es girasol'); // L1
    expect(maskSensitiveForLlm('la clave es 1234567')).toBe('la clave es 1234567'); // L2
    expect(maskSensitiveForLlm('mi contraseña es 987654321')).toBe('mi contraseña es 987654321'); // L3
    expect(maskSensitiveForLlm('Sol2024 es mi clave')).toBe('Sol2024 es mi clave'); // L4
    expect(maskSensitiveForLlm('Te digo el pin. Es 4321')).toBe('Te digo el pin. Es 4321'); // L5
    const fuera = 'la clave que te dije por teléfono el otro día es Sol2024';
    expect(maskSensitiveForLlm(fuera)).toBe(fuera); // L6
    expect(maskSensitiveForLlm('nuestra clave interna es Sol2024')).toBe('nuestra clave interna es Sol2024'); // L7
    expect(maskSensitiveForLlm('la clave es el iPhone16')).toBe('la clave es el [OCULTO]'); // L8: FP vivo
    // L9 (r5 V2): «palabra clave» sin genitivo de credencial sigue siendo «keyword».
    expect(maskSensitiveForLlm('mi palabra clave es Sol2024')).toBe('mi palabra clave es Sol2024');
    // L10 (r5 V3): cualquier separador dentro del valor parte el token y corta.
    expect(maskSensitiveForLlm('mi contraseña es Sol-2024')).toBe('mi contraseña es Sol-2024');
    expect(maskSensitiveForLlm('mi contraseña es Sol_2024')).toBe('mi contraseña es Sol_2024');
    expect(maskSensitiveForLlm('mi contraseña es Sol.2024')).toBe('mi contraseña es Sol.2024');
    expect(maskSensitiveForLlm('la clave de acceso es Sol 2024')).toBe('la clave de acceso es Sol 2024');
    // L11 (r5 V3): «el pin es el numero 4321» — `numero` no es conector.
    expect(maskSensitiveForLlm('el pin es el numero 4321')).toBe('el pin es el numero 4321');
    // L12 (NUEVO, coste declarado del arreglo de N2): un sustantivo de credencial
    // usado en sentido comercial arrastra el valor alfanumérico que le sigue si no
    // hay ninguna palabra ajena por medio.
    expect(maskSensitiveForLlm('la clave del sistema es Windows11')).toContain('[OCULTO]');
    expect(maskSensitiveForLlm('la clave de la plataforma es Pro2026')).toContain('[OCULTO]');
    // Con una palabra ajena por medio el corte de L7 lo salva igualmente.
    const modulo = 'la clave de la plataforma es el modulo Pro2026';
    expect(maskSensitiveForLlm(modulo)).toBe(modulo);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// D4-D5 · la guarda de trabajo vivo en el camino de COLA y en la interfaz (N1)
// ══════════════════════════════════════════════════════════════════════════
describe('D-B · el gemelo de `/analyze`: el camino de cola de `/transcribe`', () => {
  it('D4 · el camino de COLA consulta el job vivo ANTES de encolar el reintento', () => {
    const t = src('transcribe/route.ts');
    const enqueue = t.indexOf('enqueueTranscribe(');
    const colaBlock = t.slice(t.indexOf('// Sufijo de reintento'), enqueue);
    expect(colaBlock).toContain('forceRetryBucket()');
    expect(colaBlock).toContain('findLiveCallJob('); // ← el hueco de la r5, cerrado
    expect(colaBlock).toContain("'transcribe'");
    // Devuelve el job vivo en vez de crear otro, igual que `/analyze`.
    expect(t).toMatch(/deduped: true/);
    // Y si la consulta falla no se finge que no había job.
    expect(t.slice(enqueue)).toContain('dedupe_checked');
  });

  it('D4b · `/analyze` conserva su guarda (no-regresión de r5 P4)', () => {
    const a = src('analyze/route.ts');
    expect(a.slice(0, a.indexOf('enqueueAnalyze('))).toContain('if (force) live = await findLiveCallJob(');
    expect(a).toMatch(/deduped: true/);
  });

  it('D5 · la interfaz deja de prometer una segunda transcripción/análisis cuando el job ya existe', () => {
    const panelT = cmp('CallTranscriptPanel.tsx');
    const panelA = cmp('CallAnalysisPanel.tsx');
    // Los dos paneles leen `deduped` de la respuesta y lo dicen.
    expect(panelT).toContain('json.data?.deduped');
    expect(panelA).toContain('json.data?.deduped');
    expect(panelT).toMatch(/ya (hab[íi]a|hay)/i);
    expect(panelA).toMatch(/ya (hab[íi]a|hay)/i);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// D6 · el memo del cierre rechazado compara por CIERRE, no por importe (N3)
// ══════════════════════════════════════════════════════════════════════════
describe('D-C · el libro mayor: idempotencia del cierre aunque el saldo cambie', () => {
  it('D6 · tras un cierre rechazado, un ajuste AL ALZA no reabre la RPC ni duplica la deuda', async () => {
    const filas: Array<Record<string, unknown>> = [];
    const sb = { from: () => ({ insert: async (row: Record<string, unknown>) => { filas.push(row); return { error: null }; } }) } as never;
    refundAiCredits.mockResolvedValue(false);
    chargeAiCredits.mockResolvedValue({ ok: true });
    const l = new CreditLedger({ orgId: 7, actionType: 'call_analyze', model: 'm', provider: 'google', charged: 30, logId: 1, supabase: sb });

    const r1 = await l.refundOutstanding('boom');
    expect(r1).toEqual({ refunded: 0, ok: false, error: 'refund_ai_credits devolvió false' });
    expect(l.unrefunded).toBe(30);

    // El saldo vivo CAMBIA (ajuste al alza aceptado): 30 → 35.
    const settled = await l.settle({ realCredits: 35 });
    expect(settled.ok).toBe(true);
    expect(l.outstanding).toBe(35);

    // Segunda llamada al cierre con OTRO importe: sigue sin repetir la RPC.
    const r2 = await l.refundOutstanding('boom');
    expect(refundAiCredits).toHaveBeenCalledTimes(1);
    expect(r2).toEqual(r1);
    // Ronda 7 (tester r6 F5): la RPC sigue sin reabrirse —eso era N3— pero la
    // deuda declarada ya no infradeclara la diferencia: 30 + 5 = 35, nunca 65.
    expect(l.unrefunded).toBe(35); // no 65 (duplicar) ni 30 (infradeclarar)
    expect(filas).toHaveLength(2); // la del cierre (30) y la de la diferencia (5)
    expect(filas.map((f) => (f.metadata as { pending_refund_credits: number }).pending_refund_credits)).toEqual([30, 5]);
    expect(errors.filter((e) => /REEMBOLSO FALLIDO \(close\)/.test(e))).toHaveLength(2);
  });

  it('D6b · no-regresión r5 P5: mismo saldo, mismo resultado, una sola RPC', async () => {
    const filas: Array<Record<string, unknown>> = [];
    const sb = { from: () => ({ insert: async (row: Record<string, unknown>) => { filas.push(row); return { error: null }; } }) } as never;
    refundAiCredits.mockResolvedValue(false);
    const l = new CreditLedger({ orgId: 7, actionType: 'call_analyze', model: 'm', provider: 'google', charged: 30, logId: 1, supabase: sb });
    const r1 = await l.refundOutstanding('boom');
    const r2 = await l.refundOutstanding('boom');
    expect(refundAiCredits).toHaveBeenCalledTimes(1);
    expect(r2).toEqual(r1);
    expect(l.unrefunded).toBe(30);
    expect(l.outstanding).toBe(30);
    expect(filas).toHaveLength(1);
  });
});
