/**
 * BUILDER F4 · ronda 5 — casos de los defectos de `TEST-F4-r4.md` (nota 9,0).
 *
 *  - C1-C3: enmascarado v4. La batería COMPLETA de las tres versiones anteriores
 *    (aciertos y falsos positivos) en un solo sitio, para que la próxima versión
 *    no vuelva a romper por donde la anterior no rompía (P1).
 *  - C4-C5: las dos rutas `?sync=1` y el caso mixto force/cadena automática
 *    (P2, P4), comprobados sobre el fuente real de las rutas.
 *  - C6-C7: idempotencia del cierre en su rama de fallo (P5) y la deuda de 0 que
 *    ya no se publica (P6).
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
import { CreditLedger, settleCreditDelta } from '@/lib/services/crm/transcriptionService';

const ROUTES = path.resolve(__dirname, '../../../../app/api/crm/calls/[id]');
const src = (p: string) => fs.readFileSync(path.join(ROUTES, p), 'utf8');

let errors: string[] = [];
let origError: typeof console.error;
beforeEach(() => {
  jest.clearAllMocks();
  refundAiCredits.mockResolvedValue(true);
  errors = [];
  origError = console.error;
  console.error = (...a: unknown[]) => { errors.push(a.map(String).join(' ')); };
});
afterEach(() => { console.error = origError; });

// ══════════════════════════════════════════════════════════════════════════
// C1-C3 · enmascarado v4: la batería de las TRES versiones, a la vez (P1)
// ══════════════════════════════════════════════════════════════════════════
describe('C-A · enmascarado v4: aciertos y falsos positivos de las tres versiones', () => {
  it('C1 · ACIERTOS: todo lo que cada versión exigía ocultar se sigue ocultando', () => {
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
    // Credenciales alfanuméricas (r3 R29, r4 B5/T9), incluidas las que la ronda 3
    // dejaba a la vista por una palabra fuera de la lista de conectores.
    expect(maskSensitiveForLlm('La clave de acceso es Secreta99')).toBe('La clave de acceso es [OCULTO]');
    expect(maskSensitiveForLlm('la contraseña es Secreta99')).toBe('la contraseña es [OCULTO]');
    expect(maskSensitiveForLlm('mi clave personal es Sol2024')).toBe('mi clave personal es [OCULTO]');
    expect(maskSensitiveForLlm('la clave, apúntala bien, es Ana1990')).toBe('la clave, apúntala bien, es [OCULTO]');
    expect(maskSensitiveForLlm('la contraseña que usamos siempre es Verano2025')).toBe('la contraseña que usamos siempre es [OCULTO]');
    expect(maskSensitiveForLlm('Apunta la contraseña: Sol2024')).toBe('Apunta la contraseña: [OCULTO]');
    expect(maskSensitiveForLlm('la clave del wifi es Sol2024')).toBe('la clave del wifi es [OCULTO]');
  });

  it('C2 · FALSOS POSITIVOS: nada de lo que cada versión destrozaba se toca ya', () => {
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
    ]) {
      expect(maskSensitiveForLlm(frase)).toBe(frase);
    }
  });

  it('C3 · LÍMITES DECLARADOS L1-L8: lo que la heurística NO cubre, fijado por prueba', () => {
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
  });
});

// ══════════════════════════════════════════════════════════════════════════
// C4-C5 · exclusión antes del cobro en las dos rutas (P2, P4)
// ══════════════════════════════════════════════════════════════════════════
describe('C-B · el guardia de trabajo vivo, en los DOS caminos que cobran', () => {
  it('C4 · `transcribe?sync=1` comprueba job vivo (transcribe Y analyze) antes del pipeline', () => {
    const t = src('transcribe/route.ts');
    expect(t).toContain("findLiveCallJob(ctx.organizationId, id, 'transcribe'");
    expect(t).toContain("findLiveCallJob(ctx.organizationId, id, 'analyze'");
    expect(t.indexOf('findLiveCallJob(')).toBeLessThan(t.indexOf('runTranscribePipeline('));
    expect(t).toContain('TRANSCRIPTION_IN_PROGRESS');
    expect(t).toContain('ANALYSIS_IN_PROGRESS');
    // El error de la consulta no se traga: se publica.
    expect(t).toContain('dedupe_checked');
  });

  it('C5 · «Reanalizar» consulta el job vivo antes de encolar (caso mixto force/cadena)', () => {
    const a = src('analyze/route.ts');
    // El force ya no encola a ciegas con otra clave: si hay job vivo lo devuelve.
    expect(a).toMatch(/if \(force\) live = await findLiveCallJob\(/);
    expect(a).toMatch(/deduped: true/);
    expect(a.indexOf('findLiveCallJob(')).toBeLessThan(a.indexOf('enqueueAnalyze('));
    expect(a).toContain('dedupe_checked');
  });
});

// ══════════════════════════════════════════════════════════════════════════
// C6-C7 · libro mayor: idempotencia en la rama de fallo y deuda de 0 (P5, P6)
// ══════════════════════════════════════════════════════════════════════════
describe('C-C · el libro mayor en sus ramas de fallo', () => {
  it('C6 · el cierre rechazado no se repite: misma deuda, una sola fila, una sola RPC', async () => {
    const filas: Array<Record<string, unknown>> = [];
    const sb = { from: () => ({ insert: async (row: Record<string, unknown>) => { filas.push(row); return { error: null }; } }) } as never;
    refundAiCredits.mockResolvedValue(false);
    const l = new CreditLedger({ orgId: 7, actionType: 'call_analyze', model: 'm', provider: 'google', charged: 30, logId: 1, supabase: sb });
    const r1 = await l.refundOutstanding('boom');
    const r2 = await l.refundOutstanding('boom');
    expect(refundAiCredits).toHaveBeenCalledTimes(1);
    expect(r2).toEqual(r1);
    expect(l.unrefunded).toBe(30);
    expect(l.outstanding).toBe(30); // sigue debitado: nadie lo devolvió
    expect(filas).toHaveLength(1);
    expect(errors.filter((e) => /REEMBOLSO FALLIDO \(close\)/.test(e))).toHaveLength(1);
  });

  it('C7 · el ajuste AL ALZA rechazado informa el motivo y NO declara deuda de reembolso', async () => {
    chargeAiCredits.mockRejectedValue(new InsufficientCreditsError());
    const settled = await settleCreditDelta({
      orgId: 7, actionType: 'call_analyze', model: 'm', provider: 'google',
      chargedCredits: 1, realCredits: 50, logId: 1,
    });
    expect(settled.ok).toBe(false);
    expect(settled.delta).toBe(0);
    expect(settled.credits).toBe(1);
    expect(settled.unrefunded).toBe(0); // infracobro: no se debe nada
    expect(settled.error).toMatch(/insuficientes/i);
  });
});
