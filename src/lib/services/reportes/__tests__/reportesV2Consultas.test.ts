// ============================================================================
// Reportes v2 — forma de los reportes que leen las consultas nuevas
// ============================================================================
// Las RPC devuelven jsonb; aquí se fija cómo lo convierte cada reporte: el
// estado de resultados resumido por grupo del PUC, la rentabilidad con costo
// real y la lectura rápida que avisa de lo que falta para cerrar.
// ============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { contabilidadReports, resumirEstadoResultados, type CuentaResultado } from '../modulos/contabilidadReports';
import { vistaRentabilidadProducto } from '../modulos/rentabilidadProducto';
import type { DefinicionModulo, PeriodoCierre } from '../types';

jest.mock('@/lib/utils/timezone', () => ({
  getOrgDateRange: jest.fn(async () => ({
    start: '2026-09-01T05:00:00.000Z',
    end: '2026-10-01T04:59:59.999Z',
    timezone: 'America/Bogota',
  })),
}));
jest.mock('@/lib/supabase/config', () => ({ supabase: {} }));

const PERIODO: PeriodoCierre = { tipo: 'mensual', fechaInicio: '2026-09-01', fechaFin: '2026-09-30', etiqueta: 'Septiembre 2026' };

function cliente(respuestas: Record<string, unknown>): SupabaseClient {
  return {
    rpc: jest.fn(async (fn: string) => ({ data: respuestas[fn] ?? {}, error: null })),
  } as unknown as SupabaseClient;
}

function reporte(id: string): DefinicionModulo {
  const def = contabilidadReports.find((d) => d.id === id);
  if (!def) throw new Error(`no existe ${id}`);
  return def;
}

const DETALLE: CuentaResultado[] = [
  { cuenta: '413505', nombre: 'Ventas', tipo: 'income', rubro: 'ingreso', monto: 1000 },
  { cuenta: '421005', nombre: 'Intereses', tipo: 'income', rubro: 'ingreso', monto: 50 },
  { cuenta: '613505', nombre: 'Costo de ventas', tipo: 'expense', rubro: 'costo', monto: 400 },
  { cuenta: '510506', nombre: 'Sueldos', tipo: 'expense', rubro: 'gasto', monto: 200 },
  { cuenta: '523505', nombre: 'Publicidad', tipo: 'expense', rubro: 'gasto', monto: 100 },
  { cuenta: '530505', nombre: 'Gastos bancarios', tipo: 'expense', rubro: 'gasto', monto: 30 },
  { cuenta: '540505', nombre: 'Impuesto de renta', tipo: 'expense', rubro: 'gasto', monto: 60 },
];

describe('resumirEstadoResultados', () => {
  const lineas = resumirEstadoResultados(DETALLE);
  const monto = (concepto: string) => lineas.find((l) => l.concepto === concepto)?.monto;

  test('cascada del PUC: bruta, operacional, antes de impuestos y neta', () => {
    expect(monto('Ingresos operacionales')).toBe(1000);
    expect(monto('Costo de ventas')).toBe(-400);
    expect(monto('Utilidad bruta')).toBe(600);
    expect(monto('Utilidad operacional')).toBe(300);
    expect(monto('Ingresos no operacionales')).toBe(50);
    expect(monto('Gastos no operacionales')).toBe(-30);
    expect(monto('Utilidad antes de impuestos')).toBe(320);
    expect(monto('Impuesto de renta')).toBe(-60);
    expect(monto('Utilidad neta')).toBe(260);
  });

  test('la utilidad neta cuadra con ingresos menos costos y gastos', () => {
    const ingresos = 1050;
    const egresos = 400 + 200 + 100 + 30 + 60;
    expect(monto('Utilidad neta')).toBe(ingresos - egresos);
  });

  test('el porcentaje es sobre los ingresos totales y los subtotales se marcan', () => {
    expect(lineas.find((l) => l.concepto === 'Utilidad neta')).toMatchObject({ porcentaje: 24.76, nivel: 'subtotal' });
    expect(lineas.find((l) => l.concepto === 'Costo de ventas')?.nivel).toBe('linea');
  });

  test('«Otros gastos» solo aparece si hay gastos fuera de 51 a 54', () => {
    expect(lineas.some((l) => l.concepto === 'Otros gastos')).toBe(false);
    const conOtros = resumirEstadoResultados([...DETALLE, { cuenta: '590505', nombre: 'Otros', tipo: 'expense', rubro: 'gasto', monto: 10 }]);
    expect(conOtros.find((l) => l.concepto === 'Otros gastos')?.monto).toBe(-10);
    expect(conOtros.find((l) => l.concepto === 'Utilidad neta')?.monto).toBe(250);
  });

  test('sin rubro (RPC anterior) clasifica por tipo y por clase 6/7', () => {
    const sinRubro = DETALLE.map((c) => ({ cuenta: c.cuenta, nombre: c.nombre, tipo: c.tipo, monto: c.monto }));
    expect(resumirEstadoResultados(sinRubro).find((l) => l.concepto === 'Utilidad neta')?.monto).toBe(260);
  });

  test('sin ingresos el porcentaje es 0, no NaN ni Infinity', () => {
    const r = resumirEstadoResultados([{ cuenta: '510506', nombre: 'Sueldos', tipo: 'expense', monto: 100 }]);
    expect(r.every((l) => l.porcentaje === 0)).toBe(true);
  });
});

describe('estado de resultados', () => {
  test('trae la vista resumida, las cuatro vistas y avisa la pérdida', async () => {
    const data = await reporte('estado-resultados').fetch(144, PERIODO, null, cliente({
      fn_reporte_estado_resultados: {
        ingresos: 100, costos: 80, gastos: 40, utilidad_bruta: 20, utilidad_neta: -20,
        detalle: [
          { cuenta: '413505', nombre: 'Ventas', tipo: 'income', rubro: 'ingreso', monto: 100 },
          { cuenta: '613505', nombre: 'Costo', tipo: 'expense', rubro: 'costo', monto: 80 },
          { cuenta: '510506', nombre: 'Sueldos', tipo: 'expense', rubro: 'gasto', monto: 40 },
        ],
      },
      fn_reporte_resultados_desglose: {
        por_sucursal: [{ sucursal_id: 1, sucursal: 'Centro', ingresos: 100, costos: 80, gastos: 40, utilidad: -20 }],
        por_centro_costo: [{ centro_id: null, codigo: null, centro: 'Sin centro de costo', ingresos: 100, costos: 80, gastos: 40, utilidad: -20 }],
        tendencia: [],
      },
    }));
    expect(data.vistaPrincipal).toBe('Resumido');
    expect(data.vistas?.map((v) => v.id)).toEqual(['por-cuenta', 'por-sucursal', 'por-centro-costo', 'tendencia']);
    expect(data.vistas?.[1].filas[0]).toMatchObject({ sucursal: 'Centro', utilidad: -20, margen: -20 });
    expect(data.lectura?.map((l) => l.tono)).toEqual(['alerta', 'info']);
    expect(data.kpis.find((k) => k.titulo === 'Margen neto')?.valor).toBe(-20);
  });

  test('con la RPC vacía no revienta y dice que no hay asientos', async () => {
    const data = await reporte('estado-resultados').fetch(144, PERIODO, null, cliente({}));
    expect(data.lectura?.[0].tono).toBe('info');
    expect(data.vistas?.every((v) => Array.isArray(v.filas))).toBe(true);
  });
});

describe('balance de prueba y periodo fiscal', () => {
  test('el balance de prueba avisa el descuadre', async () => {
    const data = await reporte('balance-prueba').fetch(144, PERIODO, null, cliente({
      fn_reporte_balance_prueba: { cuentas: [{ cuenta: '1105', nombre: 'Caja', saldo_inicial: 0, debitos: 10, creditos: 0, saldo_final: 10 }], totales: { debitos: 10, creditos: 9, diferencia: 1, cuentas: 1 } },
    }));
    expect(data.lectura?.[0]).toMatchObject({ tono: 'alerta', href: '/app/finanzas/contabilidad/asientos' });
  });

  test('el periodo fiscal lista cada pendiente con su enlace', async () => {
    const data = await reporte('periodo-fiscal').fetch(144, PERIODO, null, cliente({
      fn_reporte_periodo_fiscal: {
        periodos: [{ anio: 2026, mes: 9, tipo: 'monthly', inicio: '2026-09-01', fin: '2026-09-30', estado: 'open' }],
        asientos_sin_publicar: 2, asientos_descuadrados: 0, cajas_abiertas: 1, compras_en_borrador: 0,
        cuentas_bancarias: 2, cuentas_conciliadas: 1,
      },
    }));
    expect(data.lectura?.map((l) => l.href)).toEqual([
      '/app/finanzas/contabilidad/asientos',
      '/app/pos/cajas',
      '/app/finanzas/conciliacion-bancaria',
    ]);
    expect(data.vistas?.[0].filas[0]).toMatchObject({ periodo: '09/2026', estado: 'Abierto' });
  });

  test('sin pendientes, el periodo está listo para cerrarse', async () => {
    const data = await reporte('periodo-fiscal').fetch(144, PERIODO, null, cliente({
      fn_reporte_periodo_fiscal: { periodos: [], cuentas_bancarias: 0, cuentas_conciliadas: 0 },
    }));
    expect(data.lectura).toEqual([{ tono: 'bien', texto: expect.stringContaining('listo') }]);
  });
});

describe('vistaRentabilidadProducto', () => {
  const v = vistaRentabilidadProducto({
    totales: { productos: 2, cantidad: 3, ingreso: 300, costo: 120, margen: 180, margen_pct: 60, lineas_sin_costo: 1 },
    productos: [
      { producto_id: 1, nombre: 'Tenis', sku: 'T1', categoria: 'Calzado', cantidad: 2, ingreso: 200, costo: 120, margen: 80, margen_pct: 40, sin_costo: false },
      { producto_id: 2, nombre: 'Medias', sku: null, categoria: null, cantidad: 1, ingreso: 100, costo: 0, margen: 100, margen_pct: 100, sin_costo: true },
    ],
    truncado: false,
  });

  test('marca los productos sin costo y avisa en la lectura', () => {
    expect(v.filas[1]).toMatchObject({ nombre: 'Medias (sin costo)', categoria: 'Sin categoría' });
    expect(v.lectura[0]).toMatchObject({ tono: 'aviso' });
  });

  test('la vista por categoría agrupa y recalcula el margen', () => {
    expect(v.vistas[0].filas).toEqual([
      { categoria: 'Calzado', productos: 1, cantidad: 2, ingreso: 200, costo: 120, margen: 80, margen_pct: 40 },
      { categoria: 'Sin categoría', productos: 1, cantidad: 1, ingreso: 100, costo: 0, margen: 100, margen_pct: 100 },
    ]);
  });

  test('con el doble vacío devuelve todo en cero', () => {
    const vacio = vistaRentabilidadProducto({});
    expect(vacio.filas).toEqual([]);
    expect(vacio.lectura).toEqual([]);
    expect(vacio.kpis.every((k) => k.valor === 0)).toBe(true);
  });
});
