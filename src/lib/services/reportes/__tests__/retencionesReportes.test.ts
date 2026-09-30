// ============================================================================
// Reportes de retenciones practicadas — lo que ve el contador
// ============================================================================
// Los dos reportes («Retenciones practicadas» y «Retenciones por proveedor»)
// leen el mismo jsonb de `fn_reporte_retenciones_practicadas`. Aquí se fija
// cómo se presenta: KPIs por clase y total a declarar, filas por concepto y
// tarifa, y totales que no suman bases (la misma factura es base de varias
// retenciones).
// ============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { finanzasReports } from '../modulos/finanzasReports';
import type { PeriodoCierre, DefinicionModulo } from '../types';

jest.mock('@/lib/utils/timezone', () => ({
  getOrgDateRange: jest.fn(async () => ({
    start: '2026-09-01T05:00:00.000Z',
    end: '2026-10-01T04:59:59.999Z',
  })),
}));
jest.mock('@/lib/supabase/config', () => ({ supabase: {} }));

const PERIODO: PeriodoCierre = {
  tipo: 'mensual',
  fechaInicio: '2026-09-01',
  fechaFin: '2026-09-30',
  etiqueta: 'Septiembre 2026',
};

const RESPUESTA = {
  totales: { retefuente: 237500, reteiva: 57000, reteica: 39330, total: 333830, facturas: 3, proveedores: 2 },
  por_tipo: [
    { clase: 'retefuente', concepto: 'Compras generales', cuenta: '236540', tarifa: 2.5, base: 9500000, retenido: 237500, facturas: 3 },
    { clase: 'reteiva', concepto: 'ReteIVA 15 %', cuenta: '236701', tarifa: 15, base: 380000, retenido: 57000, facturas: 1 },
    { clase: 'reteica', concepto: 'ReteICA comercio', cuenta: '236801', tarifa: 0.414, base: 9500000, retenido: 39330, facturas: 3 },
    { clase: 'otra', concepto: 'Sin clase conocida', cuenta: null, tarifa: null, base: null, retenido: null, facturas: null },
  ],
  por_proveedor: [
    { proveedor_id: 11, proveedor: 'Proveedor A', nit: '900111222-3', facturas: 2, retefuente: 150000, reteiva: 57000, reteica: 24840, retenido: 231840 },
    { proveedor_id: 12, proveedor: null, nit: null, facturas: 1, retefuente: 87500, reteiva: 0, reteica: 14490, retenido: 101990 },
  ],
};

function cliente(data: unknown, error: unknown = null): SupabaseClient {
  return { rpc: jest.fn(async () => ({ data, error })) } as unknown as SupabaseClient;
}

function reporte(id: string): DefinicionModulo {
  const def = finanzasReports.find((d) => d.id === id);
  if (!def) throw new Error(`No existe el reporte ${id}`);
  return def;
}

describe('reporte retenciones-practicadas', () => {
  it('muestra ReteFuente, ReteIVA, ReteICA y el total a declarar como KPIs', async () => {
    const r = await reporte('retenciones-practicadas').fetch(120, PERIODO, null, cliente(RESPUESTA));
    expect(r.kpis).toEqual([
      { titulo: 'ReteFuente', valor: 237500, formato: 'moneda' },
      { titulo: 'ReteIVA', valor: 57000, formato: 'moneda' },
      { titulo: 'ReteICA', valor: 39330, formato: 'moneda' },
      { titulo: 'Total a declarar', valor: 333830, formato: 'moneda' },
    ]);
  });

  it('una fila por concepto y tarifa, con el rótulo DIAN de la clase', async () => {
    const r = await reporte('retenciones-practicadas').fetch(120, PERIODO, null, cliente(RESPUESTA));
    expect(r.columnas.map((c) => c.key)).toEqual(['tipo', 'concepto', 'cuenta', 'base', 'tarifa', 'retenido', 'facturas']);
    expect(r.columnas.find((c) => c.key === 'tarifa')!.tipo).toBe('porcentaje');
    expect(r.filas[0]).toEqual({
      tipo: 'ReteFuente', concepto: 'Compras generales', cuenta: '236540', base: 9500000, tarifa: 2.5, retenido: 237500, facturas: 3,
    });
    expect(r.filas.map((f) => f.tipo)).toEqual(['ReteFuente', 'ReteIVA', 'ReteICA', 'otra']);
    // Los nulos llegan como 0, nunca como NaN.
    expect(r.filas[3]).toMatchObject({ base: 0, tarifa: 0, retenido: 0, facturas: 0 });
  });

  it('el total no suma bases: solo lo retenido y las facturas distintas', async () => {
    const r = await reporte('retenciones-practicadas').fetch(120, PERIODO, null, cliente(RESPUESTA));
    expect(r.totales).toEqual({ tipo: 'Total a declarar', retenido: 333830, facturas: 3 });
    expect(r.totales).not.toHaveProperty('base');
  });

  it('sin retenciones en el período devuelve ceros y ninguna fila', async () => {
    const r = await reporte('retenciones-practicadas').fetch(120, PERIODO, null, cliente(null));
    expect(r.filas).toEqual([]);
    expect(r.kpis.every((k) => k.valor === 0)).toBe(true);
  });

  it('propaga el error de la RPC (p. ej. 42501 fuera de la organización)', async () => {
    const error = { code: '42501', message: 'ORG_FORBIDDEN' };
    await expect(reporte('retenciones-practicadas').fetch(120, PERIODO, null, cliente(null, error))).rejects.toBe(error);
  });
});

describe('retenciones-practicadas trae la vista «Por proveedor»', () => {
  it('con las mismas filas y totales que el alias retenciones-por-proveedor', async () => {
    const unificado = await reporte('retenciones-practicadas').fetch(120, PERIODO, 7, cliente(RESPUESTA));
    const alias = await reporte('retenciones-por-proveedor').fetch(120, PERIODO, 7, cliente(RESPUESTA));
    expect(unificado.vistaPrincipal).toBe('Por tipo');
    const vista = unificado.vistas!.find((v) => v.id === 'por-proveedor')!;
    expect(vista.columnas).toEqual(alias.columnas);
    expect(vista.filas).toEqual(alias.filas);
    expect(vista.totales).toEqual(alias.totales);
  });
});

describe('reporte retenciones-por-proveedor', () => {
  it('una fila por proveedor con las tres clases y el total retenido', async () => {
    const r = await reporte('retenciones-por-proveedor').fetch(120, PERIODO, 7, cliente(RESPUESTA));
    expect(r.columnas.map((c) => c.key)).toEqual(['proveedor', 'nit', 'facturas', 'retefuente', 'reteiva', 'reteica', 'retenido']);
    expect(r.filas[0]).toEqual({
      proveedor: 'Proveedor A', nit: '900111222-3', facturas: 2, retefuente: 150000, reteiva: 57000, reteica: 24840, retenido: 231840,
    });
  });

  it('un proveedor sin nombre se identifica por su id, no queda en blanco', async () => {
    const r = await reporte('retenciones-por-proveedor').fetch(120, PERIODO, 7, cliente(RESPUESTA));
    expect(r.filas[1]).toMatchObject({ proveedor: 'Proveedor #12', nit: '' });
  });

  it('los totales cuadran con los KPIs del período', async () => {
    const r = await reporte('retenciones-por-proveedor').fetch(120, PERIODO, 7, cliente(RESPUESTA));
    expect(r.totales).toEqual({
      proveedor: 'Total', facturas: 3, retefuente: 237500, reteiva: 57000, reteica: 39330, retenido: 333830,
    });
    expect(r.kpis[3].valor).toBe(r.totales!.retenido);
  });
});
