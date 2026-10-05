// ============================================================================
// «Stock crítico»: la base devuelve las filas críticas y aquí se agrupan.
// ============================================================================
// Hasta 2026-10-05 el reporte bajaba todas las existencias de la organización
// (29 500 en la más grande) y filtraba en el navegador. Ahora el filtro y el
// costo efectivo están en `fn_reporte_stock_critico_detalle`; la agrupación
// por producto/padre, el faltante y el estado siguen aquí y deben dar lo
// mismo que antes.
// ============================================================================

jest.mock('@/lib/supabase/config', () => ({ supabase: {} }));

import type { SupabaseClient } from '@supabase/supabase-js';
import { agruparStockCritico, inventarioReports, type FilaStockCritico } from '../modulos/inventarioReports';
import type { PeriodoCierre } from '../types';

function fila(p: Partial<FilaStockCritico> & { producto_id: number }): FilaStockCritico {
  return {
    padre_id: null,
    sku: `SKU-${p.producto_id}`,
    nombre: `Producto ${p.producto_id}`,
    categoria: 'Bebidas',
    sucursal: 'Centro',
    stock: 0,
    minimo: 0,
    costo: 0,
    padre_sku: null,
    padre_nombre: null,
    ...p,
  };
}

describe('agruparStockCritico', () => {
  it('agotado en una sucursal: estado «Agotado» y sin faltante si no hay mínimo', () => {
    const [f] = agruparStockCritico([fila({ producto_id: 1, stock: 0, minimo: 0, costo: 500 })]);
    expect(f).toMatchObject({ sku: 'SKU-1', estado: 'Agotado', faltante: 0, valor_faltante: 0, sucursales: 'Centro (0)' });
  });

  it('bajo el mínimo: faltante al costo efectivo', () => {
    const [f] = agruparStockCritico([fila({ producto_id: 2, stock: '3', minimo: '10', costo: '1200' })]);
    expect(f).toMatchObject({ estado: 'Bajo mínimo', stock_actual: 3, stock_minimo: 10, faltante: 7, valor_faltante: 8400, sucursales: 'Centro (✓)' });
  });

  it('las variantes se agrupan bajo su padre, con su nombre y su SKU', () => {
    const filas = agruparStockCritico([
      fila({ producto_id: 11, padre_id: 10, padre_sku: 'PADRE', padre_nombre: 'Camiseta', nombre: 'Talla S', stock: 0, sucursal: 'Norte' }),
      fila({ producto_id: 12, padre_id: 10, padre_sku: 'PADRE', padre_nombre: 'Camiseta', nombre: 'Talla M', stock: 0, sucursal: 'Sur' }),
    ]);
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({ sku: 'PADRE', nombre: 'Camiseta > Talla S', sucursales: 'Norte (0), Sur (0)' });
  });

  it('sin padre visible se usa el propio nombre (pero se agrupa por el id del padre)', () => {
    const filas = agruparStockCritico([fila({ producto_id: 21, padre_id: 20, nombre: 'Huérfana', stock: -2 })]);
    expect(filas[0]).toMatchObject({ sku: 'SKU-21', nombre: 'Huérfana', estado: 'Sin stock en sucursal', stock_actual: -2 });
  });

  it('ordena por faltante y luego por nombre; nulos cuentan como cero', () => {
    const filas = agruparStockCritico([
      fila({ producto_id: 1, nombre: 'B', stock: 1, minimo: 2 }),
      fila({ producto_id: 2, nombre: 'A', stock: 1, minimo: 2 }),
      fila({ producto_id: 3, nombre: 'C', stock: 0, minimo: 9 }),
      fila({ producto_id: 4, nombre: null, categoria: null, sucursal: null, stock: null, minimo: null, costo: null }),
    ]);
    expect(filas.map((f) => f.nombre)).toEqual(['C', 'A', 'B', '—']);
    expect(filas[3]).toMatchObject({ categoria: 'Sin categoría', sucursales: '— (0)', estado: 'Agotado' });
  });
});

describe('reporte stock-critico', () => {
  const PERIODO: PeriodoCierre = { tipo: 'diario', fechaInicio: '2026-10-05', fechaFin: '2026-10-05', etiqueta: '5 oct' };
  const def = inventarioReports.find((d) => d.id === 'stock-critico')!;

  it('una sola llamada RPC (sin leer tablas desde el navegador) y KPI desde su respuesta', async () => {
    const from = jest.fn();
    const rpc = jest.fn(async () => ({
      data: { total: 29500, filas: [fila({ producto_id: 1, stock: 2, minimo: 5, costo: 100 }), fila({ producto_id: 2, stock: 0 })] },
      error: null,
    }));
    const data = await def.fetch(137, PERIODO, null, { rpc, from } as unknown as SupabaseClient);
    expect(from).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith('fn_reporte_stock_critico_detalle', { p_organization_id: 137, p_branch_id: null });
    const kpi = Object.fromEntries(data.kpis.map((k) => [k.titulo, k.valor]));
    expect(kpi).toMatchObject({ 'Total Productos': 29500, 'Productos Críticos': 2, Agotados: 1, 'Bajo Mínimo': 1, 'Valor Faltante': 300 });
  });

  it('propaga el error de la RPC (p. ej. alcance de sucursal)', async () => {
    const rpc = jest.fn(async () => ({ data: null, error: { message: 'BRANCH_SCOPE_REQUIRED' } }));
    await expect(def.fetch(137, PERIODO, null, { rpc } as unknown as SupabaseClient)).rejects.toMatchObject({ message: 'BRANCH_SCOPE_REQUIRED' });
  });
});
