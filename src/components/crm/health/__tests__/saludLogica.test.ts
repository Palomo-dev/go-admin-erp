/**
 * Salud de clientes (Figma 1415:19, 1424:17, 1424:932): orden de la lista,
 * «Por qué», acción sugerida, tendencia, detalle de factores y configuración.
 */
import { composeHealthResult } from '@/lib/services/crm/healthScoreServer';
import { DEFAULT_HEALTH_CONFIG, parseHealthConfig, parseHealthConfigEditable, validateHealthConfig, type HealthRpcRow } from '@/lib/services/crm/healthBands';
import type { HealthScoreResult } from '@/lib/services/crm/healthScoreService';
import {
  accionSugerida,
  aFilaSalud,
  cambiosDeBanda,
  conEncendido,
  conPeso,
  csvSalud,
  factoresDetalle,
  filtrarPanel,
  lunesDe,
  motivosSalud,
  nombreVisible,
  ordenarPanel,
  partesUmbral,
  resumenBandas,
  resumenTendencia,
  semanasDeSnapshots,
  senalesRecientes,
  sumaPesos,
  vistaPrevia,
} from '../saludLogica';

const fila = (p: Partial<HealthRpcRow> = {}): HealthRpcRow => ({
  customer_id: 'c1',
  invoices_12m: 11,
  revenue_12m: 48_600_000,
  days_since_last_invoice: 94,
  days_since_last_activity: 23,
  overdue_balance: 3_200_000,
  overdue_ratio: 0.21,
  score: 30,
  band: 'critical',
  ...p,
});

const CONFIG = parseHealthConfig(DEFAULT_HEALTH_CONFIG)!;
const resultado = (p: Partial<HealthRpcRow> = {}, config = CONFIG): HealthScoreResult => composeHealthResult(fila(p), config, 'Cliente', 'COP');

describe('configuración por defecto (Figma 1424:932)', () => {
  test('cinco factores 30/25/20/15/10 que suman 100 y validan', () => {
    expect(DEFAULT_HEALTH_CONFIG.indicators.map((i) => i.weight)).toEqual([30, 25, 20, 15, 10]);
    expect(sumaPesos(DEFAULT_HEALTH_CONFIG)).toBe(100);
    expect(validateHealthConfig(DEFAULT_HEALTH_CONFIG)).toEqual([]);
  });

  test('el ejemplo del detalle: 94 días sin compra = 0 de 30; cartera 21 % = 0; 11 facturas = 12 de 20', () => {
    const r = resultado();
    const f = factoresDetalle(r)!;
    expect(f.find((x) => x.key === 'days_since_last_invoice')).toMatchObject({ puntos: 0, maximo: 30, peso: 30 });
    expect(f.find((x) => x.key === 'overdue_ratio')).toMatchObject({ puntos: 0, maximo: 25 });
    expect(f.find((x) => x.key === 'invoices_12m')).toMatchObject({ puntos: 12, maximo: 20 });
    // Los puntos del detalle suman el puntaje (misma función: scoreFromConfig).
    expect(f.reduce((s, x) => s + x.puntos, 0)).toBeCloseTo(r.score, -1);
  });

  test('validar: pesos ≠ 100, clave desconocida, bandas invertidas, todo apagado', () => {
    expect(validateHealthConfig(conPeso(DEFAULT_HEALTH_CONFIG, 'revenue_12m', 20))).toContain('pesos');
    expect(validateHealthConfig({ ...DEFAULT_HEALTH_CONFIG, indicators: [{ ...DEFAULT_HEALTH_CONFIG.indicators[0], key: 'inventado', weight: 100 }] })).toContain('clave');
    expect(validateHealthConfig({ ...DEFAULT_HEALTH_CONFIG, bands: { green: 40, yellow: 70, red: 0 } })).toContain('bandas');
    const apagado = DEFAULT_HEALTH_CONFIG.indicators.reduce((c, i) => conEncendido(c, i.key, false), DEFAULT_HEALTH_CONFIG);
    expect(validateHealthConfig(apagado)).toContain('sinIndicadores');
  });

  test('apagar un indicador lo conserva en la config editable y lo saca del puntaje', () => {
    const c = conPeso(conPeso(conEncendido(DEFAULT_HEALTH_CONFIG, 'revenue_12m', false), 'invoices_12m', 30), 'revenue_12m', 10);
    expect(sumaPesos(c)).toBe(100);
    const editable = parseHealthConfigEditable(JSON.parse(JSON.stringify(c)))!;
    expect(editable.indicators.find((i) => i.key === 'revenue_12m')?.enabled).toBe(false);
    expect(parseHealthConfig(c)!.indicators.map((i) => i.key)).not.toContain('revenue_12m');
    expect(conEncendido(c, 'revenue_12m', true).indicators.find((i) => i.key === 'revenue_12m')).not.toHaveProperty('enabled');
  });

  test('textos de umbrales por tramos (Figma 1424:1393): «menos de 30 d = 100 · 30–90 d = 50 · más de 90 d = 0»', () => {
    expect(partesUmbral(DEFAULT_HEALTH_CONFIG.indicators[0])).toEqual([
      { tipo: 'menosDe', valor: 30, puntos: 100 },
      { tipo: 'rango', valor: 30, hasta: 90, puntos: 50 },
      { tipo: 'masDe', valor: 90, puntos: 0 },
    ]);
    // «0 % = 100 · hasta 10 % = 60 · …»
    expect(partesUmbral(DEFAULT_HEALTH_CONFIG.indicators[1]).slice(0, 2)).toEqual([
      { tipo: 'igual', valor: 0, puntos: 100 },
      { tipo: 'menosDe', valor: 0.1, puntos: 60 },
    ]);
    // «12 o más = 100 · 6–11 = 60 · menos de 6 = 20»
    expect(partesUmbral(DEFAULT_HEALTH_CONFIG.indicators[2])).toEqual([
      { tipo: 'desde', valor: 12, puntos: 100 },
      { tipo: 'rango', valor: 6, hasta: 11, puntos: 60 },
      { tipo: 'menosDe', valor: 6, puntos: 20 },
    ]);
    // Importes: el tramo no resta 1 («$ 30–100 M»).
    expect(partesUmbral(DEFAULT_HEALTH_CONFIG.indicators[4])[1]).toEqual({ tipo: 'rango', valor: 30_000_000, hasta: 100_000_000, puntos: 50 });
    expect(partesUmbral({ direction: 'lower_better', thresholds: [{ max: 30, score: 100 }, { max: 90, score: 50 }] }).at(-1)).toEqual({ tipo: 'rango', valor: 30, hasta: 90, puntos: 50 });
  });
});

describe('«Por qué» y acción sugerida (anotación 1415:1161)', () => {
  test('con config: los dos factores que más restan, sin repetir familia', () => {
    const m = motivosSalud(resultado());
    expect(m.map((x) => x.factor)).toEqual(['compras', 'cartera']);
    expect(accionSugerida(m)).toBe('llamar');
  });

  test('cartera dominante → cobro; actividad → secuencia; caída de compras → visita comercial', () => {
    expect(accionSugerida(motivosSalud(resultado({ days_since_last_invoice: 5, overdue_ratio: 0.5 })))).toBe('cobro');
    expect(accionSugerida([{ factor: 'actividad', perdidos: 10 }])).toBe('secuencia');
    expect(accionSugerida([{ factor: 'frecuencia', perdidos: 10 }])).toBe('visita');
    expect(accionSugerida([])).toBeNull();
  });

  test('sin config: los descuentos de fn_customer_health', () => {
    const r = composeHealthResult(fila({ days_since_last_invoice: 150, days_since_last_activity: 20, overdue_ratio: 0, invoices_12m: 5 }), null, 'X');
    expect(motivosSalud(r)).toEqual([{ factor: 'compras', perdidos: 15 }]);
  });

  test('un cliente saludable no lleva motivos ni acción', () => {
    const f = aFilaSalud({ ...resultado(), band: 'green' });
    expect(f.motivos).toEqual([]);
    expect(f.accion).toBeNull();
  });
});

describe('lista priorizada', () => {
  const base = (id: string, band: 'red' | 'yellow' | 'green', ingresos: number, cambio: number | null, score = 40) => ({ id, band, ingresos, cambio, score, responsableId: id === 'a' ? 'u1' : null });

  test('rojo primero; dentro, ingresos 12 m × caída', () => {
    const orden = ordenarPanel([
      base('verde', 'green', 900, -50),
      base('a', 'red', 48_600_000, -21),
      base('b', 'red', 41_200_000, -12),
      base('c', 'red', 9_800_000, -4),
      base('d', 'yellow', 99_000_000, -30),
      base('e', 'red', 12_400_000, null),
    ]).map((f) => f.id);
    expect(orden).toEqual(['a', 'b', 'c', 'e', 'd', 'verde']);
  });

  test('chips: bandas (unión; ninguna = todas), «Bajaron este mes», «Mis clientes»; y resumen por banda', () => {
    const filas = [base('a', 'red', 10, -3), base('b', 'red', 20, null), base('c', 'green', 5, 2), base('d', 'yellow', 1, -1)];
    expect(filtrarPanel(filas, { chips: ['red'] }, null).map((f) => f.id)).toEqual(['a', 'b']);
    expect(filtrarPanel(filas, { chips: ['red', 'yellow'] }, null).map((f) => f.id)).toEqual(['a', 'b', 'd']);
    expect(filtrarPanel(filas, { chips: [] }, null)).toHaveLength(4);
    expect(filtrarPanel(filas, { chips: ['bajaron'] }, null).map((f) => f.id)).toEqual(['a', 'd']);
    expect(filtrarPanel(filas, { chips: ['mios'] }, 'u1').map((f) => f.id)).toEqual(['a']);
    expect(filtrarPanel(filas, { chips: ['mios'] }, null)).toEqual([]);
    expect(resumenBandas(filas.slice(0, 3))).toEqual({ total: 3, conteo: { red: 2, yellow: 0, green: 1 }, ingresos: { red: 30, yellow: 0, green: 5 } });
  });

  test('orden «puntaje» y «caída»', () => {
    const filas = [base('a', 'red', 10, -3, 40), base('b', 'yellow', 20, -9, 60), base('c', 'red', 5, null, 20)];
    expect(ordenarPanel(filas, 'puntaje').map((f) => f.id)).toEqual(['c', 'a', 'b']);
    expect(ordenarPanel(filas, 'caida').map((f) => f.id)).toEqual(['b', 'a', 'c']);
  });

  test('CSV: comillas y comas escapadas', () => {
    const csv = csvSalud([{ celdas: ['Ana, S.A.', 32, 'dijo "no"'] }], ['Cliente', 'Puntaje', 'Nota']).split('\n');
    expect(csv[0]).toBe('Cliente,Puntaje,Nota');
    expect(csv[1]).toBe('"Ana, S.A.",32,' + '"dijo ""no""' + '"');
  });

  test('resumen por banda (sin chips)', () => {
    const filas = [base('a', 'red', 10, null), base('b', 'red', 20, null), base('c', 'green', 5, null)];
    expect(resumenBandas(filas)).toEqual({ total: 3, conteo: { red: 2, yellow: 0, green: 1 }, ingresos: { red: 30, yellow: 0, green: 5 } });
  });

  test('cambio 30 d contra el snapshot de hace 30 días; null sin él', () => {
    const r = resultado();
    expect(aFilaSalud(r, { score: r.score + 21, band: 'yellow', created_at: '2026-10-01T00:00:00Z' }).cambio).toBe(-21);
    expect(aFilaSalud(r, null).cambio).toBeNull();
  });

  test('nombre visible: la empresa arriba y la persona como contacto', () => {
    expect(nombreVisible({ customer_name: 'Ana', cliente: { full_name: 'Ana Gómez', trade_name: 'Ferretería', company_name: null, owner_id: null, email: null, phone: null, do_not_call: null } })).toEqual({ nombre: 'Ferretería', contacto: 'Ana Gómez' });
    expect(nombreVisible({ customer_name: 'Ana Gómez' })).toEqual({ nombre: 'Ana Gómez', contacto: null });
  });
});

describe('tendencia', () => {
  test('resumen de 12 semanas: actual, delta y primera semana', () => {
    const semanas = Array.from({ length: 14 }, (_, i) => ({ semana: `2026-08-${String(i + 1).padStart(2, '0')}`, promedio: 72 - i * 0.5, clientes: 10 }));
    const r = resumenTendencia(semanas)!;
    expect(r.barras).toHaveLength(12);
    expect(r.desde).toBe('2026-08-03');
    expect(r.actual).toBe(66);
    expect(r.delta).toBe(-5); // 65,5 − 71 = −5,5 → −5
    expect(resumenTendencia([])).toBeNull();
    expect(resumenTendencia([{ semana: '2026-11-09', promedio: 50, clientes: 1 }])).toMatchObject({ delta: null, desde: null });
  });

  test('serie de un cliente: último snapshot de cada semana', () => {
    const snaps = [
      { score: 60, created_at: '2026-11-10T10:00:00Z' },
      { score: 55, created_at: '2026-11-12T10:00:00Z' },
      { score: 40, created_at: '2026-11-03T10:00:00Z' },
    ];
    const s = semanasDeSnapshots(snaps, (iso) => lunesDe(iso.slice(0, 10)));
    expect(s.map((x) => [x.semana, x.promedio])).toEqual([['2026-11-02', 40], ['2026-11-09', 55]]);
    expect(lunesDe('2026-11-15')).toBe('2026-11-09');
    expect(lunesDe('2026-11-09')).toBe('2026-11-09');
  });
});

describe('señales recientes y vista previa', () => {
  test('cambios de banda + cartera + última compra, del más reciente al más antiguo', () => {
    const hist = [
      { band: 'yellow' as const, created_at: '2026-08-01T00:00:00Z' },
      { band: 'yellow' as const, created_at: '2026-08-15T00:00:00Z' },
      { band: 'red' as const, created_at: '2026-09-12T00:00:00Z' },
    ];
    expect(cambiosDeBanda(hist)).toEqual([{ fecha: '2026-09-12T00:00:00Z', banda: 'red' }]);
    const s = senalesRecientes(hist, { ultimaFactura: { fecha: '2026-08-20T00:00:00Z', total: 4_100_000 }, vencida: { fecha: '2026-09-02T00:00:00Z', saldo: 1, dias: 31 } });
    expect(s.map((x) => x.tipo)).toEqual(['banda', 'vencida', 'compra']);
  });

  test('vista previa: subir el corte de saludable mueve clientes a observación', () => {
    const rs = [resultado({ customer_id: 'a', days_since_last_invoice: 5, overdue_ratio: 0, overdue_balance: 0, invoices_12m: 12, days_since_last_activity: 3, revenue_12m: 10 })];
    expect(rs[0].band).toBe('green');
    const p = vistaPrevia(rs, { ...DEFAULT_HEALTH_CONFIG, bands: { green: 99, yellow: 45, red: 0 } });
    expect(p.antes).toEqual({ red: 0, yellow: 0, green: 1 });
    expect(p.despues).toEqual({ red: 0, yellow: 1, green: 0 });
  });
});
