/**
 * Qué hace el agente de voz ante el desinterés definitivo (decisión del dueño,
 * 2026-10-07): modo de la organización, excepción por valor (con monedas),
 * excepción por etapa y precedencia «la opción más restrictiva gana».
 * Configuración ausente = marcar perdida directo, sin excepciones.
 */

import {
  CONFIG_DESINTERES_POR_DEFECTO,
  configDesdeFila,
  configDesinteresSchema,
  convertirMonto,
  decidirAccionDesinteres,
  leerConfigDesinteres,
  masRestrictiva,
  necesitaDatosDeExcepciones,
  type ConfigDesinteres,
  type EntradaDecision,
} from '@/lib/services/crm/voiceAgent/desinteresConfig';
import type { SupabaseClient } from '@supabase/supabase-js';

const TASAS = [{ base_currency: 'USD', target_currency: 'COP', rate: 4000, effective_date: '2026-10-01' }];

function config(parcial: Partial<ConfigDesinteres> = {}): ConfigDesinteres {
  return { ...CONFIG_DESINTERES_POR_DEFECTO, guardada: true, ...parcial };
}

function entrada(parcial: Partial<EntradaDecision> = {}): EntradaDecision {
  return {
    config: config(),
    politicaEtapa: null,
    oportunidad: { monto: 10_000_000, moneda: 'COP' },
    monedaBase: 'COP',
    tasas: TASAS,
    etapaActual: { pipelineId: 'p1', position: 2 },
    etapaAvanzada: null,
    ...parcial,
  };
}

const conValor = (monto: number, moneda = 'COP') => config({ excepcionValor: { activa: true, monto, moneda } });

describe('configuración ausente = comportamiento actual', () => {
  test('sin fila: marcar perdida directo, sin excepciones', () => {
    const c = configDesdeFila(null);
    expect(c).toEqual(CONFIG_DESINTERES_POR_DEFECTO);
    expect(c.guardada).toBe(false);
    expect(decidirAccionDesinteres(entrada({ config: c, oportunidad: { monto: 9e12, moneda: 'COP' } }))).toEqual({
      accion: 'perdida',
      razones: ['modo_perdida'],
      valorComparado: null,
    });
  });

  test('leerConfigDesinteres: sin fila → por defecto; error de lectura → tarea (nunca se cierra a ciegas)', async () => {
    const cliente = (r: { data: unknown; error: unknown }) =>
      ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => r }) }) }) }) as unknown as SupabaseClient;
    expect((await leerConfigDesinteres(cliente({ data: null, error: null }), 120)).modo).toBe('mark_lost');
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    expect((await leerConfigDesinteres(cliente({ data: null, error: { message: 'caída' } }), 120)).modo).toBe('task_only');
  });

  test('una fila con modo desconocido no rompe: vuelve a marcar perdida', () => {
    const c = configDesdeFila({ organization_id: 1, mode: 'raro', value_exception_enabled: false, value_threshold: null, value_currency: null, stage_exception_enabled: false, advanced_stage_id: null, updated_by: null, updated_at: null });
    expect(c.modo).toBe('mark_lost');
  });
});

describe('modos', () => {
  test.each([
    ['mark_lost', 'perdida'],
    ['task_only', 'tarea'],
    ['log_only', 'nada'],
  ] as const)('%s → %s', (modo, accion) => {
    expect(decidirAccionDesinteres(entrada({ config: config({ modo }) })).accion).toBe(accion);
  });
});

describe('excepción por valor (igual o más que el monto → tarea)', () => {
  test.each([
    [19_999_999, 'perdida'],
    [20_000_000, 'tarea'],
    [20_000_001, 'tarea'],
  ])('oportunidad de %d COP con umbral 20.000.000 COP → %s', (monto, accion) => {
    const d = decidirAccionDesinteres(entrada({ config: conValor(20_000_000), oportunidad: { monto, moneda: 'COP' } }));
    expect(d.accion).toBe(accion);
    expect(d.valorComparado).toEqual({ monto, moneda: 'COP' });
  });

  test('monto como texto (numeric de Postgres) también compara', () => {
    expect(decidirAccionDesinteres(entrada({ config: conValor(100), oportunidad: { monto: '100.00', moneda: 'COP' } })).accion).toBe('tarea');
  });

  test('sin monto o en 0: la excepción no aplica', () => {
    expect(decidirAccionDesinteres(entrada({ config: conValor(0), oportunidad: { monto: null, moneda: 'COP' } })).accion).toBe('perdida');
    expect(decidirAccionDesinteres(entrada({ config: conValor(0), oportunidad: { monto: 0, moneda: 'COP' } })).accion).toBe('perdida');
  });

  test('desactivada: no aplica aunque haya monto guardado', () => {
    const c = config({ excepcionValor: { activa: false, monto: 1, moneda: 'COP' } });
    expect(decidirAccionDesinteres(entrada({ config: c })).accion).toBe('perdida');
  });
});

describe('monedas', () => {
  test('oportunidad en USD y umbral en COP: convierte con la tasa de la organización', () => {
    const debajo = decidirAccionDesinteres(entrada({ config: conValor(20_000_000), oportunidad: { monto: 4_999, moneda: 'USD' } }));
    expect(debajo.accion).toBe('perdida');
    expect(debajo.valorComparado).toEqual({ monto: 19_996_000, moneda: 'COP' });
    const igual = decidirAccionDesinteres(entrada({ config: conValor(20_000_000), oportunidad: { monto: 5_000, moneda: 'USD' } }));
    expect(igual.accion).toBe('tarea');
  });

  test('umbral en USD y oportunidad en COP: la tasa se usa al revés', () => {
    const d = decidirAccionDesinteres(entrada({ config: conValor(5_000, 'USD'), oportunidad: { monto: 20_000_000, moneda: 'COP' } }));
    expect(d.valorComparado).toEqual({ monto: 5_000, moneda: 'USD' });
    expect(d.accion).toBe('tarea');
  });

  test('oportunidad sin moneda: se toma la de la organización', () => {
    const d = decidirAccionDesinteres(entrada({ config: conValor(5_000, 'USD'), oportunidad: { monto: 19_000_000, moneda: null } }));
    expect(d.valorComparado?.moneda).toBe('USD');
    expect(d.accion).toBe('perdida');
  });

  test('sin tasa: no se inventa, gana la tarea', () => {
    const d = decidirAccionDesinteres(entrada({ config: conValor(1_000, 'EUR'), oportunidad: { monto: 10, moneda: 'MXN' }, tasas: [] }));
    expect(d.accion).toBe('tarea');
    expect(d.razones).toContain('excepcion_valor_sin_tasa');
  });

  test('conversión cruzada pasando por la moneda base', () => {
    const tasas = [...TASAS, { base_currency: 'EUR', target_currency: 'COP', rate: 4400, effective_date: '2026-10-01' }];
    expect(convertirMonto(100, 'EUR', 'USD', 'COP', tasas)).toBeCloseTo(110);
    expect(convertirMonto(100, 'COP', 'COP', 'COP', [])).toBe(100);
  });
});

describe('excepción por etapa avanzada', () => {
  const conEtapa = config({ excepcionEtapa: { activa: true, etapaId: 'st-neg' } });
  test.each([
    [3, 'perdida'],
    [4, 'tarea'],
    [5, 'tarea'],
  ])('etapa actual en posición %d con umbral en 4 → %s', (position, accion) => {
    const d = decidirAccionDesinteres(entrada({ config: conEtapa, etapaActual: { pipelineId: 'p1', position }, etapaAvanzada: { pipelineId: 'p1', position: 4 } }));
    expect(d.accion).toBe(accion);
  });

  test('otro pipeline: no aplica', () => {
    const d = decidirAccionDesinteres(entrada({ config: conEtapa, etapaActual: { pipelineId: 'p2', position: 9 }, etapaAvanzada: { pipelineId: 'p1', position: 4 } }));
    expect(d.accion).toBe('perdida');
  });

  test('etapa configurada que ya no existe: no aplica', () => {
    expect(decidirAccionDesinteres(entrada({ config: conEtapa, etapaAvanzada: null })).accion).toBe('perdida');
  });
});

describe('precedencia: la opción más restrictiva gana', () => {
  test('orden: nada > tarea > perdida', () => {
    expect(masRestrictiva('perdida', 'tarea')).toBe('tarea');
    expect(masRestrictiva('nada', 'tarea')).toBe('nada');
    expect(masRestrictiva('perdida', 'perdida')).toBe('perdida');
  });

  test('etapa en «Sugerir» con la organización en marcar perdida → tarea', () => {
    const d = decidirAccionDesinteres(entrada({ politicaEtapa: 'suggest' }));
    expect(d.accion).toBe('tarea');
    expect(d.razones).toEqual(['modo_perdida', 'politica_etapa']);
  });

  test('etapa en «Sugerir» no convierte «no hacer nada» en tarea', () => {
    expect(decidirAccionDesinteres(entrada({ config: config({ modo: 'log_only' }), politicaEtapa: 'suggest' })).accion).toBe('nada');
  });

  test('etapa en «auto» no relaja «solo tarea» de la organización', () => {
    expect(decidirAccionDesinteres(entrada({ config: config({ modo: 'task_only' }), politicaEtapa: 'auto' })).accion).toBe('tarea');
  });

  test('una excepción no relaja «no hacer nada»', () => {
    const c = config({ modo: 'log_only', excepcionValor: { activa: true, monto: 1, moneda: 'COP' } });
    expect(decidirAccionDesinteres(entrada({ config: c })).accion).toBe('nada');
  });
});

describe('qué datos hacen falta', () => {
  test('sin excepciones no se consulta nada más', () => {
    expect(necesitaDatosDeExcepciones(config())).toEqual({ etapas: false, valor: false });
    expect(necesitaDatosDeExcepciones(conValor(1))).toEqual({ etapas: false, valor: true });
  });
});

describe('validación (la misma que el servidor)', () => {
  const ok = { modo: 'mark_lost', excepcionValor: { activa: true, monto: 20_000_000, moneda: 'cop' }, excepcionEtapa: { activa: false, etapaId: null } };
  test('válido: la moneda se normaliza a mayúsculas', () => {
    const r = configDesinteresSchema.safeParse(ok);
    expect(r.success && r.data.excepcionValor.moneda).toBe('COP');
  });
  test.each([
    ['monto negativo', { ...ok, excepcionValor: { ...ok.excepcionValor, monto: -1 } }, 'monto_negativo'],
    ['moneda inválida', { ...ok, excepcionValor: { ...ok.excepcionValor, moneda: 'PESOS' } }, 'moneda_invalida'],
    ['monto requerido', { ...ok, excepcionValor: { ...ok.excepcionValor, monto: null } }, 'monto_requerido'],
    ['moneda requerida', { ...ok, excepcionValor: { ...ok.excepcionValor, moneda: null } }, 'moneda_requerida'],
    ['etapa requerida', { ...ok, excepcionEtapa: { activa: true, etapaId: null } }, 'etapa_requerida'],
    ['modo desconocido', { ...ok, modo: 'borrar_todo' }, null],
    ['claves de más (strict)', { ...ok, organization_id: 121 }, null],
  ])('%s → 400', (_n, cuerpo, codigo) => {
    const r = configDesinteresSchema.safeParse(cuerpo);
    expect(r.success).toBe(false);
    if (!r.success && codigo) expect(r.error.issues.map((i) => i.message)).toContain(codigo);
  });
});
