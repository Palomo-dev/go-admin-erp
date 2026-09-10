/**
 * BUILDER F4 · ronda 7 — los cinco puntos bajos de `TEST-F4-r6.md` (fase ya
 * aprobada con 9,6). Ninguno es bloqueante; se cierran sin cambiar el alcance.
 *
 *  - E1 (F3): el PLURAL de los sustantivos de credencial, arreglado por la raíz
 *    (derivación), no caso por caso.
 *  - E2 (F4): el docblock afirmaba algo FALSO («clave» se descarta entera cuando
 *    se usa como adjetivo). El comportamiento no cambia; el texto sí.
 *  - E3 (F1): el gemelo del gemelo — `dedupe_checked`/`dedupe_error` los publican
 *    las dos rutas y ningún panel los leía.
 *  - E4 (F2): simetría de las dos guardas `?sync=1`.
 *  - E5 (F5): residuo aritmético del arreglo de r5 N3 (infradeclaraba 5).
 *
 * Escrito ANTES de tocar el código (mtime). Dobles en memoria: sin red ni BD.
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

const SRC = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');
const RULES = path.resolve(__dirname, '../callAnalysisRules.ts');
const masked = (s: string) => maskSensitiveForLlm(s).includes('[OCULTO]');
/** Docblock aplanado: los saltos de línea del comentario no deben esconder la frase. */
const flat = (s: string) => s.replace(/\n\s*\*\s?/g, ' ').replace(/\s+/g, ' ');

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
// E1 · F3 — el plural, por la raíz
// ══════════════════════════════════════════════════════════════════════════
describe('E-A · enmascarado v6: el número gramatical deja de decidir', () => {
  it('E1 · el PLURAL de los sustantivos de credencial se oculta igual que el singular (tester r6 F3)', () => {
    // Las nueve frases de W1 (`f4Round6Tester`), textualmente las mismas.
    for (const s of [
      'la clave de los sistemas es Sol2024',
      'la clave de las cuentas es Sol2024',
      'la clave de los usuarios es Sol2024',
      'la clave de las redes es Sol2024',
      'la clave de los accesos es Sol2024',
      'la clave de los portales es Sol2024',
      'la contraseña de los sistemas es Sol2024',
      'la contraseña de las cuentas es Sol2024',
      'el pin de las tarjetas es 4321',
    ]) {
      expect(masked(s)).toBe(true);
    }
    // Plurales de los préstamos y de los que hacen `-es`.
    expect(masked('la clave de los routers es Admin2024')).toBe(true);
    expect(masked('la clave de las plataformas es Sol2024')).toBe(true);
    // El singular, intacto.
    expect(masked('la clave del sistema es Sol2024')).toBe(true);
    expect(masked('la contraseña de la cuenta es Sol2024')).toBe(true);
    expect(masked('el pin de la tarjeta es 4321')).toBe(true);
  });

  it('E1c · GEMELO de F3 en el mismo archivo: la lista HERMANA (cabezas adjetivas) también deriva el plural', () => {
    // `WEAK_ADJECTIVE_HEADS` llevaba los plurales a mano y le faltaba `momentos`:
    // «el MOMENTO clave» protegía y «los MOMENTOS clave» no. Mismo defecto de
    // familia que F3, en el mismo archivo y a doce líneas.
    expect(masked('el momento clave es Pro2026')).toBe(false);
    expect(masked('los momentos clave son Pro2026')).toBe(false);
    // Y las que ya estaban a mano siguen protegiendo (no-regresión).
    expect(masked('los factores clave son Pro2026')).toBe(false);
    expect(masked('las ideas clave son Fase2')).toBe(false);
  });

  it('E1b · NO REGRESIÓN: las frases comerciales en plural siguen intactas', () => {
    for (const s of [
      'la clave de los negocios es el iPhone16',
      'la clave de los proyectos es Fase2',
      'nuestras palabras clave son marketing y ventas',
      'la clave del negocio es el iPhone16',
      'el factor clave fue el plan Pro2026',
      'la clave es 20000000 al mes',
      'la cifra clave del sistema es 150000',
    ]) {
      expect(masked(s)).toBe(false);
    }
    expect(maskSensitiveForLlm('mi tarjeta es 4111-1111-1111-1111')).toBe('mi tarjeta es [TARJETA ****1111]');
  });
});

// ══════════════════════════════════════════════════════════════════════════
// E2 · F4 — el docblock decía algo falso
// ══════════════════════════════════════════════════════════════════════════
describe('E-B · el comentario dice la verdad', () => {
  it('E2 · el docblock ya NO afirma que «clave» se descarte entera por la cabeza adjetiva', () => {
    const doc = flat(fs.readFileSync(RULES, 'utf8'));
    // La frase falsa desde la r6 (tester r6 F4).
    expect(doc).not.toContain('se descarta entera cuando la frase la usa como adjetivo');
    // Y se dice el mecanismo real: el genitivo de credencial manda sobre la cabeza.
    expect(doc).toContain('el genitivo de credencial manda sobre la cabeza adjetiva');
    // L12 documenta el caso con el ejemplo del tester.
    expect(doc).toContain('el tema clave de la cuenta es Premium2024');
  });

  it('E2b · el COMPORTAMIENTO no cambia (F4 era documental): W2/W3 siguen igual', () => {
    for (const s of [
      'el tema clave de la cuenta es Premium2024',
      'la idea clave de la red es Fibra600',
      'el punto clave del portal es Magento2',
      'el codigo de seguridad del sistema es ISO9001',
    ]) {
      expect(masked(s)).toBe(true);
    }
    expect(masked('nuestro codigo de seguridad interno es ISO9001')).toBe(false);
    expect(masked('el punto clave del negocio es el iPhone16')).toBe(false);
    expect(masked('el dato clave del proyecto es Fase2')).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// E3-E4 · F1 y F2 — el gemelo del gemelo y la simetría
// ══════════════════════════════════════════════════════════════════════════
describe('E-C · rutas y paneles', () => {
  it('E3 · los DOS paneles leen `dedupe_checked`, no sólo `deduped` (tester r6 F1)', () => {
    const panelT = SRC('src/components/crm/calls/CallTranscriptPanel.tsx');
    const panelA = SRC('src/components/crm/calls/CallAnalysisPanel.tsx');
    for (const p of [panelT, panelA]) {
      expect(p).toContain('json.data?.deduped');
      expect(p).toContain('json.data?.dedupe_checked');
      // Y el texto degradado no promete lo que no se pudo comprobar.
      expect(p).toContain('No se pudo comprobar');
    }
  });

  it('E4 · `/analyze?sync=1` comprueba los DOS kinds, como `/transcribe?sync=1` (tester r6 F2)', () => {
    const a = SRC('src/app/api/crm/calls/[id]/analyze/route.ts');
    const aSync = a.slice(a.indexOf('if (sync)'), a.indexOf('enqueueAnalyze('));
    expect(aSync).toContain("findLiveCallJob(ctx.organizationId, id, 'analyze', sb)");
    expect(aSync).toContain("findLiveCallJob(ctx.organizationId, id, 'transcribe', sb)");
    expect(aSync).toContain('TRANSCRIPTION_IN_PROGRESS');
    expect(aSync).toContain('ANALYSIS_IN_PROGRESS');
    // La guarda del camino de COLA no se toca (r5 P4).
    expect(a.slice(0, a.indexOf('enqueueAnalyze('))).toContain('if (force) live = await findLiveCallJob(');
  });
});

// ══════════════════════════════════════════════════════════════════════════
// E5 · F5 — el residuo aritmético
// ══════════════════════════════════════════════════════════════════════════
describe('E-D · el libro mayor: la deuda declarada es la deuda real', () => {
  it('E5 · tras un cierre rechazado, un ajuste AL ALZA declara la diferencia (no la duplica ni la omite)', async () => {
    const filas: Array<Record<string, unknown>> = [];
    const sb = { from: () => ({ insert: async (row: Record<string, unknown>) => { filas.push(row); return { error: null }; } }) } as never;
    refundAiCredits.mockResolvedValue(false);
    chargeAiCredits.mockResolvedValue({ ok: true });
    const l = new CreditLedger({ orgId: 7, actionType: 'call_analyze', model: 'm', provider: 'google', charged: 30, logId: 1, supabase: sb });

    const r1 = await l.refundOutstanding('boom');
    expect(r1).toEqual({ refunded: 0, ok: false, error: 'refund_ai_credits devolvió false' });
    expect(l.unrefunded).toBe(30);

    const settled = await l.settle({ realCredits: 35 });
    expect(settled.ok).toBe(true);
    expect(l.outstanding).toBe(35);

    const r2 = await l.refundOutstanding('boom');
    expect(refundAiCredits).toHaveBeenCalledTimes(1); // la RPC NO se reabre (r5 N3)
    expect(r2).toEqual(r1);
    expect(l.unrefunded).toBe(35); // ni 30 (infradeclarar) ni 65 (duplicar)
    // Dos filas conciliables que SUMAN la deuda: 30 + 5.
    expect(filas).toHaveLength(2);
    const pend = filas.map((f) => (f.metadata as { pending_refund_credits: number }).pending_refund_credits);
    expect(pend).toEqual([30, 5]);
    expect(pend.reduce((a, b) => a + b, 0)).toBe(35);
  });

  it('E5b · NO REGRESIÓN (r5 P5 / r6 D6b): mismo saldo, una sola RPC y una sola fila', async () => {
    const filas: Array<Record<string, unknown>> = [];
    const sb = { from: () => ({ insert: async (row: Record<string, unknown>) => { filas.push(row); return { error: null }; } }) } as never;
    refundAiCredits.mockResolvedValue(false);
    const l = new CreditLedger({ orgId: 7, actionType: 'call_analyze', model: 'm', provider: 'google', charged: 30, logId: 1, supabase: sb });
    const r1 = await l.refundOutstanding('boom');
    const r2 = await l.refundOutstanding('boom');
    expect(refundAiCredits).toHaveBeenCalledTimes(1);
    expect(r2).toEqual(r1);
    expect(l.unrefunded).toBe(30);
    expect(filas).toHaveLength(1);
    expect(errors.filter((e) => /REEMBOLSO FALLIDO \(close\)/.test(e))).toHaveLength(1);
  });

  it('E5c · un ajuste a la BAJA tras el cierre rechazado no baja la deuda declarada', async () => {
    const filas: Array<Record<string, unknown>> = [];
    const sb = { from: () => ({ insert: async (row: Record<string, unknown>) => { filas.push(row); return { error: null }; } }) } as never;
    refundAiCredits.mockResolvedValue(false);
    const l = new CreditLedger({ orgId: 7, actionType: 'call_analyze', model: 'm', provider: 'google', charged: 30, logId: 1, supabase: sb });
    await l.refundOutstanding('boom');
    expect(l.unrefunded).toBe(30);
    // Baja ACEPTADA por la RPC: `outstanding` cae a 25, pero lo ya declarado
    // como deuda del cierre no se reescribe hacia abajo.
    refundAiCredits.mockResolvedValue(true);
    const settled = await l.settle({ realCredits: 25 });
    expect(settled.ok).toBe(true);
    expect(l.outstanding).toBe(25);
    const r2 = await l.refundOutstanding('boom');
    expect(r2.ok).toBe(false);
    expect(l.unrefunded).toBe(30);
    expect(filas).toHaveLength(1); // ninguna fila nueva: no hay diferencia al alza
  });
});
