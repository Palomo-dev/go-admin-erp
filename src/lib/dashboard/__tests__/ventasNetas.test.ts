/**
 * Una sola regla de «ventas netas» (decisión del dueño, 2026-11-23, con criterio
 * del Contador): sin IVA ni INC, sin propinas y restando devoluciones y notas
 * crédito del periodo. Vive en UN lugar de la base (`fn_ventas_netas_cifras`,
 * migración 20261123233000) y la leen el widget de Ventas del Inicio y las
 * cifras de «Todas las ventas».
 *
 * Lo que se garantiza aquí:
 *  1. Cerrado el día, el número es idéntico en las dos pantallas: las dos rutas
 *     piden a la base el MISMO rango de instantes y leen la misma cifra.
 *  2. En SQL, las dos funciones de lectura toman «ventas» de la regla única y
 *     la fórmula es la acordada.
 *  3. Cada comparación dice contra qué compara (Inicio: el mismo día de la
 *     semana pasada a esta hora; Todas las ventas: periodo anterior de días
 *     completos o, si incluye hoy, a esta misma hora).
 *  4. Mini-gráficas y enlaces con filtro del widget.
 * Cifras ficticias; sin nombres de clientes.
 */
import fs from 'fs';
import path from 'path';

jest.mock('@/lib/services/organizationTimezoneService', () => ({
  getOrganizationTimezone: jest.fn(async () => 'America/Bogota'),
}));
jest.mock('@/lib/services/organizationOperatingHoursService', () => ({
  getOperatingHours: jest.fn(async () => null),
}));

import { calcularRangoPeriodo } from '../periodo';
import { getDateRange } from '@/lib/utils/dateRanges';
import { leerVentasInicio, diasDelRango } from '../ventasWidgetInicio.server';
import { acumulada, armarVentas, type CrudoVentasWidget } from '../ventasWidgetInicio';
import { cifrasVentas } from '@/lib/pos/ventas/listadoServidor';
import { finComparacionAEstaHora, incluyeHoy, sucursalDeEnlace, diasDelPeriodo } from '@/lib/pos/ventas/filtrosVentas';

const MIGRACION = fs.readFileSync(
  path.resolve(__dirname, '../../../../supabase/migrations/20261123233000_ventas_netas_regla_unica.sql'),
  'utf8',
);

/** Tramo del SQL entre dos marcas. */
function tramo(desde: string, hasta: string): string {
  const i = MIGRACION.indexOf(desde);
  const j = MIGRACION.indexOf(hasta, i + desde.length);
  expect(i).toBeGreaterThanOrEqual(0);
  expect(j).toBeGreaterThan(i);
  return MIGRACION.slice(i, j);
}

// ─── 1. Cerrado el día, el mismo número en las dos pantallas ────────────────

/**
 * «Base» falsa: ventas netas = función determinista del rango pedido. Si las
 * dos pantallas piden el mismo rango, la cifra es la misma.
 */
function netasFalsas(desde: string, hasta: string): number {
  return Math.round((Date.parse(hasta) - Date.parse(desde)) / 1000) + Date.parse(desde) / 1e9;
}

function supabaseFalso(llamadas: Array<{ fn: string; args: Record<string, unknown> }>) {
  return {
    rpc: jest.fn(async (fn: string, args: Record<string, unknown>) => {
      llamadas.push({ fn, args });
      const netas = netasFalsas(String(args.p_desde), String(args.p_hasta));
      if (fn === 'fn_inicio_ventas_widget') {
        return { data: { moneda: 'COP', periodo: { ventas: netas, efectivas: 3, ticket_promedio: 1 }, hay_ventas: true }, error: null };
      }
      if (fn === 'pos_ventas_cifras') {
        return { data: { desde: args.p_desde, hasta: args.p_hasta, actual: { ventas: netas, efectivas: 3 }, anterior: null }, error: null };
      }
      if (fn === 'pos_ventas_listado_v2') return { data: { total: 0, filas: [] }, error: null };
      return { data: null, error: { message: `rpc inesperada ${fn}` } };
    }),
  };
}

describe('cerrado el día, «ventas» es idéntico en el Inicio y en Todas las ventas', () => {
  const zona = 'America/Bogota';

  test.each([
    ['sin horas de operación', null],
    ['con horas de operación que cruzan la medianoche', { start_time: '18:00', end_time: '02:00' }],
    ['con horas de operación del mismo día', { start_time: '08:00', end_time: '20:00' }],
  ])('el rango de «Ayer» del Inicio es el del filtro desde=hasta=ayer de Todas las ventas (%s)', (_n, horas) => {
    const ahora = new Date('2026-11-23T20:00:00Z');
    const inicio = calcularRangoPeriodo({ periodo: 'ayer', hoyOperativo: '2026-11-23', zona, horasOrg: horas, ahora });
    const ventas = getDateRange('2026-11-22', '2026-11-22', zona, horas);
    expect(inicio.inicio).toBe(ventas.start);
    expect(inicio.fin).toBe(ventas.end);
  });

  test('las dos lecturas piden la misma cifra a la base y muestran el mismo número', async () => {
    const ahora = new Date('2026-11-23T20:00:00Z');
    const rango = calcularRangoPeriodo({ periodo: 'ayer', hoyOperativo: '2026-11-23', zona, horasOrg: null, ahora });
    const rangoHoy = calcularRangoPeriodo({ periodo: 'hoy', hoyOperativo: '2026-11-23', zona, horasOrg: null, ahora });

    const llamadas: Array<{ fn: string; args: Record<string, unknown> }> = [];
    const ctx = { organizationId: 42, userId: 'u', supabase: supabaseFalso(llamadas) } as never;

    const lectura = await leerVentasInicio(ctx, { rango, rangoHoy, dia: '2026-11-23', sucursal: null, zona });
    const widget = armarVentas({
      crudo: lectura.crudo,
      ultimas: lectura.ultimas,
      dias: lectura.dias,
      monedaBase: 'COP',
      periodoEsHoy: false,
      sucursal: null,
      cajas: { abiertas: 0, anteriores: 0 },
      href: (p) => p,
    });
    const cifras = await cifrasVentas(ctx, { desde: '2026-11-22', hasta: '2026-11-22' }, null);

    const deInicio = llamadas.find((l) => l.fn === 'fn_inicio_ventas_widget')!.args;
    const deVentas = llamadas.find((l) => l.fn === 'pos_ventas_cifras')!.args;
    expect(deInicio.p_desde).toBe(deVentas.p_desde);
    expect(deInicio.p_hasta).toBe(deVentas.p_hasta);
    expect(deInicio.p_branch_id).toBe(deVentas.p_branch_id);

    const periodo = widget.kpis.find((k) => k.id === 'periodo')!;
    expect(periodo.cifra).toEqual({ tipo: 'moneda', valor: cifras.actual.ventas, moneda: 'COP' });
    // Y el enlace de la cifra abre Todas las ventas con ese mismo día.
    expect(periodo.href).toBe('/app/pos/ventas?desde=2026-11-22&hasta=2026-11-22');
  });
});

// ─── 2. La regla vive en un solo lugar de la base ───────────────────────────

describe('regla única en SQL (migración 20261123233000)', () => {
  const movimientos = tramo('create or replace function public.fn_ventas_netas_movimientos', 'create or replace function public.fn_ventas_netas_cifras');
  const cifrasNetas = tramo('create or replace function public.fn_ventas_netas_cifras', 'create or replace function public.pos_ventas_cifras');
  const posCifras = tramo('create or replace function public.pos_ventas_cifras', 'create or replace function public.fn_inicio_ventas_widget');
  const widget = tramo('create or replace function public.fn_inicio_ventas_widget', 'create or replace function public.fn_inicio_ventas_rango');

  test('fórmula: total − IVA/INC − propina; notas crédito y devoluciones restan su base', () => {
    expect(movimientos).toMatch(/coalesce\(x\.total, 0\) - coalesce\(x\.tax_total, 0\) - coalesce\(s\.tip_amount, 0\)/);
    expect(movimientos).toMatch(/n\.document_type = 'credit_note'/);
    expect(movimientos).toMatch(/-\(red\.bruto - red\.impuestos\)/);
    // Una devolución con nota crédito válida no se resta dos veces.
    expect(movimientos).toMatch(/not exists \(\s*select 1 from public\.invoice_sales n\s*where n\.id = r\.credit_note_invoice_id/);
    // Las ventas originales pasan por los mismos filtros del listado.
    expect(movimientos.match(/public\.pos_ventas_filtradas\(/g)).toHaveLength(2);
  });

  test('solo fn_ventas_netas_cifras agrega la fórmula', () => {
    expect(cifrasNetas).toMatch(/from public\.fn_ventas_netas_movimientos\(/);
    expect(cifrasNetas).toMatch(/'ventas', round\(coalesce\(sum\(m\.neto\), 0\), 2\)/);
  });

  test('Todas las ventas y el widget del Inicio leen «ventas» de la regla única, nunca Σ total', () => {
    expect(posCifras).toMatch(/'ventas', v_netas -> 'ventas'/);
    expect(posCifras).not.toMatch(/sum\(total\)/);
    expect(widget).toMatch(/v_periodo := public\.fn_ventas_netas_cifras\(/);
    expect(widget).toMatch(/v_hoy := public\.fn_ventas_netas_cifras\(/);
    expect(widget).not.toMatch(/sum\(x\.total\)/);
  });

  test('las funciones internas nacen cerradas; las de lectura comprueban pertenencia', () => {
    expect(MIGRACION).toMatch(/revoke all on function public\.fn_ventas_netas_movimientos\([^)]*\) from public, anon, authenticated;/);
    expect(MIGRACION).toMatch(/revoke all on function public\.fn_ventas_netas_cifras\([^)]*\) from public, anon, authenticated;/);
    expect(posCifras).toMatch(/perform public\.fn_assert_acceso_org\(p_organization_id\)/);
    expect(widget).toMatch(/perform public\.fn_assert_acceso_org\(p_organization_id\)/);
  });

  test('«Recaudado del periodo» aclara la propina de lo cobrado y suma «por cobrar»', () => {
    expect(MIGRACION).toMatch(/'propinas', round\(coalesce\(\(select sum\(propina\) from cs where periodo = 'actual'\), 0\), 2\)/);
    expect(MIGRACION).toMatch(/'por_cobrar', v_por_cobrar/);
  });
});

// ─── 3. Contra qué compara cada pantalla ────────────────────────────────────

const CRUDO: CrudoVentasWidget = {
  moneda: 'COP',
  periodo: { ventas: 1000, efectivas: 10, ticket_promedio: 100 },
  anterior: { ventas: 800, efectivas: 8 },
  hoy: { ventas: 300, efectivas: 3 },
  semana: { ventas: 200, efectivas: 2 },
  semana_dia: 1,
  serie_hoy: [{ b: '2026-11-23T08', v: 100 }, { b: '2026-11-23T09', v: 0 }, { b: '2026-11-23T10', v: 200 }],
  serie_periodo: [{ b: '2026-11-21', v: 400, n: 4, t: 100 }, { b: '2026-11-22', v: 300, n: 3, t: 100 }, { b: '2026-11-23', v: 300, n: 3, t: 100 }],
  por_canal: [{ canal: 'pos', ventas: 700, efectivas: 7 }, { canal: 'tienda_web', ventas: 300, efectivas: 3 }],
  por_sede: [{ id: 5, nombre: 'Principal', ventas: 600 }, { id: 6, nombre: 'Norte', ventas: 400 }],
  sucursales: 2,
  pedidos: { pendientes: 0 },
  hay_ventas: true,
};

const armar = (extra: Partial<Parameters<typeof armarVentas>[0]> = {}) =>
  armarVentas({
    crudo: CRUDO,
    ultimas: [],
    dias: { periodo: { desde: '2026-11-21', hasta: '2026-11-23' }, hoy: '2026-11-23' },
    monedaBase: 'COP',
    periodoEsHoy: false,
    sucursal: null,
    cajas: { abiertas: 0, anteriores: 0 },
    href: (p) => p,
    ...extra,
  });

describe('Inicio: «Ventas de hoy» dice contra qué día compara', () => {
  test('«vs. el lunes pasado a esta hora»: el día sale de la base y se traduce en el cliente', () => {
    const hoy = armar().kpis.find((k) => k.id === 'hoy')!;
    expect(hoy.delta).toBeCloseTo(50);
    expect(hoy.comparadoCon).toEqual({ clave: 'ventas.comparado.diaPasadoHora', params: { dia: 1 } });
  });
  test('sin el día (base anterior), lo dice sin nombrarlo', () => {
    const hoy = armarVentas({ ...armarEntrada(), crudo: { ...CRUDO, semana_dia: undefined } }).kpis[0];
    expect(hoy.comparadoCon).toEqual({ clave: 'ventas.comparado.semanaPasadaHora' });
  });
  test('«Ventas del periodo» compara con el periodo anterior y lo dice', () => {
    expect(armar().kpis.find((k) => k.id === 'periodo')!.comparadoCon).toEqual({ clave: 'ventas.comparado.periodoAnterior' });
  });
});

function armarEntrada(): Parameters<typeof armarVentas>[0] {
  return {
    crudo: CRUDO,
    ultimas: [],
    dias: { periodo: { desde: '2026-11-21', hasta: '2026-11-23' }, hoy: '2026-11-23' },
    monedaBase: 'COP',
    periodoEsHoy: false,
    sucursal: null,
    cajas: { abiertas: 0, anteriores: 0 },
    href: (p) => p,
  };
}

describe('Todas las ventas: periodo anterior de días completos o a esta misma hora', () => {
  test('si el filtro incluye hoy, la comparación se corta a esta misma hora', () => {
    expect(incluyeHoy('2026-11-01', '2026-11-23', '2026-11-23')).toBe(true);
    expect(incluyeHoy('2026-11-01', '2026-11-22', '2026-11-23')).toBe(false);
    // 1–23 nov (23 días) a las 15:00 → el anterior termina 23 días antes a las 15:00.
    const ahora = new Date('2026-11-23T20:00:00Z');
    const fin = finComparacionAEstaHora('2026-10-09T05:00:00.000Z', '2026-11-01T04:59:59.999Z', diasDelPeriodo('2026-11-01', '2026-11-23'), ahora);
    expect(fin).toBe('2026-10-31T20:00:00.000Z');
  });
  test('«hoy» frente al mismo día de la semana pasada hasta esta hora', () => {
    const ahora = new Date('2026-11-23T20:00:00Z');
    expect(finComparacionAEstaHora('2026-11-16T05:00:00.000Z', '2026-11-17T04:59:59.999Z', 7, ahora)).toBe('2026-11-16T20:00:00.000Z');
  });
  test('el corte nunca sale del rango anterior', () => {
    const ahora = new Date('2026-11-23T20:00:00Z');
    expect(finComparacionAEstaHora('2026-11-16T05:00:00.000Z', '2026-11-16T06:00:00.000Z', 7, ahora)).toBe('2026-11-16T06:00:00.000Z');
    expect(finComparacionAEstaHora('2026-11-16T21:00:00.000Z', '2026-11-17T04:59:59.999Z', 7, ahora)).toBe('2026-11-16T21:00:00.000Z');
  });
});

// ─── 4. Mini-gráficas y enlaces con filtro ──────────────────────────────────

describe('widget de Ventas: mini-gráficas y enlaces a Todas las ventas filtrada', () => {
  test('hoy y periodo acumulados (el último punto es la cifra); ticket por tramo', () => {
    const k = armar().kpis;
    expect(k.find((x) => x.id === 'hoy')!.serie).toEqual([100, 100, 300]);
    expect(k.find((x) => x.id === 'periodo')!.serie).toEqual([400, 700, 1000]);
    expect(k.find((x) => x.id === 'ticket')!.serie).toEqual([100, 100, 100]);
    expect(acumulada([])).toEqual([]);
  });

  test('cada cifra abre Todas las ventas con el periodo, el canal o la sede', () => {
    const v = armar();
    expect(v.kpis.find((x) => x.id === 'hoy')!.href).toBe('/app/pos/ventas?desde=2026-11-23&hasta=2026-11-23');
    expect(v.kpis.find((x) => x.id === 'periodo')!.href).toBe('/app/pos/ventas?desde=2026-11-21&hasta=2026-11-23');
    expect(v.porCanal!.tramos.map((t) => t.href)).toEqual([
      '/app/pos/ventas?desde=2026-11-21&hasta=2026-11-23&canal=pos',
      '/app/pos/ventas?desde=2026-11-21&hasta=2026-11-23&canal=tienda_web',
    ]);
    expect(v.porSede!.tramos.map((t) => t.href)).toEqual([
      '/app/pos/ventas?desde=2026-11-21&hasta=2026-11-23&sucursal=5',
      '/app/pos/ventas?desde=2026-11-21&hasta=2026-11-23&sucursal=6',
    ]);
  });

  test('sin la página en el menú de la persona no hay enlaces', () => {
    const v = armar({ href: () => null });
    expect(v.kpis.every((k) => !k.href)).toBe(true);
    expect(v.porCanal!.tramos.every((t) => !t.href)).toBe(true);
  });

  test('los días del enlace salen del rango en la zona de la organización', () => {
    expect(diasDelRango({ inicio: '2026-11-21T05:00:00.000Z', fin: '2026-11-23T20:00:00.000Z' }, 'America/Bogota')).toEqual({
      desde: '2026-11-21',
      hasta: '2026-11-23',
    });
    // Fin exclusivo a medianoche: el último día es el anterior.
    expect(diasDelRango({ inicio: '2026-11-22T05:00:00.000Z', fin: '2026-11-23T05:00:00.000Z' }, 'America/Bogota')).toEqual({
      desde: '2026-11-22',
      hasta: '2026-11-22',
    });
  });

  test('Todas las ventas solo acepta del enlace una sede que la persona ve', () => {
    expect(sucursalDeEnlace('5', [5, 6])).toBe(5);
    expect(sucursalDeEnlace('7', [5, 6])).toBeNull();
    expect(sucursalDeEnlace('5 or 1=1', [5])).toBeNull();
    expect(sucursalDeEnlace(null, [5])).toBeNull();
  });
});
