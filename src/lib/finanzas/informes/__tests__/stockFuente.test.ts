import { cargarStockInformes } from '@/lib/services/finanzas/informesStock.server';
import type { SupabaseClient } from '@supabase/supabase-js';

function cliente(paginas: Array<Array<Record<string, unknown>>>, error: Error | null = null) {
  const query = {
    select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), lte: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(), range: jest.fn(),
  };
  paginas.forEach((data) => query.range.mockResolvedValueOnce({ data, error }));
  const from = jest.fn(() => query);
  return { db: { from } as unknown as SupabaseClient, from, query };
}
const fila = (id = 1) => ({ id, organization_id: 10, branch_id: 2, product_id: 3, direction: 'in', qty: '2.5', unit_cost: '100.25', source: 'purchase', source_id: '99', created_at: '2026-03-01T02:30:00Z', avg_cost_after: '100.25' });

describe('fuente histórica del inventario para informes', () => {
  test('filtra organización y sucursal, pagina más de 1000 filas y convierte fecha a la zona de la organización', async () => {
    const c = cliente([Array.from({ length: 1000 }, (_, i) => fila(i)), [fila(1001)]]);
    const resultado = await cargarStockInformes(c.db, 10, { hasta: '2026-02-28', branchId: 2 }, 'America/Bogota');
    expect(c.from).toHaveBeenCalledWith('stock_movements');
    expect(c.query.eq).toHaveBeenCalledWith('organization_id', 10);
    expect(c.query.eq).toHaveBeenCalledWith('branch_id', 2);
    expect(c.query.range.mock.calls).toEqual([[0, 999], [1000, 1999]]);
    expect(c.query.lte.mock.calls[0][0]).toBe('created_at');
    expect(new Date(c.query.lte.mock.calls[0][1]).getTime()).toBe(Date.UTC(2026, 2, 1, 4, 59, 59, 999));
    expect(resultado.movimientos).toHaveLength(1001);
    expect(resultado.movimientos[0]).toMatchObject({ fecha: '2026-02-28', qty: 2.5, unit_cost: 100.25 });
    expect(resultado.stockCompleto).toBe(true);
    expect(resultado.motivoStockIncompleto).toBeNull();
  });

  test('con centro de costo comunica que la conciliación no es comparable', async () => {
    const c = cliente([[fila()]]);
    const resultado = await cargarStockInformes(c.db, 10, { hasta: '2026-03-01', costCenterId: 'centro' }, 'UTC');
    expect(resultado.stockCompleto).toBe(false);
    expect(resultado.motivoStockIncompleto).toBe('centro_costo');
    expect(resultado.movimientos).toEqual([]);
    expect(c.from).not.toHaveBeenCalled();
    expect(resultado.advertencias.join(' ')).toContain('no se presentan');
  });

  test('propaga errores de consulta en lugar de ocultarlos como inventario vacío', async () => {
    const c = cliente([[]], new Error('lectura falló'));
    await expect(cargarStockInformes(c.db, 10, { hasta: '2026-03-01' }, 'UTC')).rejects.toThrow('lectura falló');
  });

  test('un dato faltante en la primera página no oculta un fallo de consulta posterior', async () => {
    const c = cliente([Array.from({ length: 1000 }, (_, i) => ({ ...fila(i), unit_cost: null }))]);
    c.query.range.mockResolvedValueOnce({ data: null, error: new Error('falló página siguiente') });
    await expect(cargarStockInformes(c.db, 10, { hasta: '2026-03-01' }, 'UTC')).rejects.toThrow('falló página siguiente');
  });

  test.each([{ unit_cost: null }, { qty: null }, { unit_cost: -1 }, { qty: 'NaN' }, { avg_cost_after: 'Infinity' }, { direction: 'desconocida' }])('historial no verificable %p omite todo el stock sin convertir faltantes en cero', async (cambio) => {
    const d = cliente([[fila(1), { ...fila(2), ...cambio }]]);
    const resultado = await cargarStockInformes(d.db, 10, { hasta: '2026-03-01' }, 'UTC');
    expect(resultado).toMatchObject({ movimientos: [], stockCompleto: false, motivoStockIncompleto: 'datos_no_verificables' });
    expect(resultado.advertencias.join(' ')).toContain('No se sustituyeron importes faltantes por cero');
    expect(resultado.advertencias.join(' ')).not.toContain('centro de costo');
  });

  test('no inicia consulta sin organización válida', async () => {
    const c = cliente([[]]);
    await expect(cargarStockInformes(c.db, 0, { hasta: '2026-03-01' }, 'UTC')).rejects.toThrow('Organización inválida');
    expect(c.from).not.toHaveBeenCalled();
  });
});
