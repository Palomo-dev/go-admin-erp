// ============================================================================
// L6 · Recepción de compra al kardex.
//
// Contrato de `stockMovementService.incrementOnPurchase` (hoy) que la RPC
// `fn_kardex_entrada_compra` reproduce en la base:
//   - producto con `track_stock=false` se salta con motivo `not_tracked`;
//   - cantidad ≤ 0 se salta con `invalid_qty`; sin producto, `no_product`;
//   - `stock_levels` se busca con `lot_id IS NULL` (nunca `upsert onConflict`,
//     el UNIQUE incluye `lot_id` y admite NULL);
//   - promedio ponderado: con existencia previa ≤ 0 el promedio es el costo de
//     la entrada; si no, (q·p + n·c)/(q + n);
//   - movimiento `direction='in'` con `unit_cost` = costo de la línea.
// ============================================================================

import { DobleCompras } from './dobleCompras';

let doble = new DobleCompras();
jest.mock('@/lib/supabase/config', () => ({
  get supabase() {
    return doble;
  },
}));

import { stockMovementService } from '@/lib/services/stockMovementService';
import { promedioPonderado, costoUnitarioCompra } from '@/lib/services/compras/logica';

describe('L6 · incrementOnPurchase (hoy)', () => {
  test('sin stock previo: inserta stock_levels con lot_id null y avg_cost = costo', async () => {
    doble = new DobleCompras({
      products: [{ data: { track_stock: true, name: 'Arroz' }, error: null }],
      stock_levels: [{ data: null, error: null }],
    });
    const r = await stockMovementService.incrementOnPurchase(120, 7, 'fac-1', [{ product_id: 9, quantity: 4, unit_price: 2500 }], 'purchase', 'u-1');
    expect(r.errors).toEqual([]);
    const sl = doble.escrituras('stock_levels', 'insert')[0].payload as Record<string, unknown>;
    expect(sl).toMatchObject({ product_id: 9, branch_id: 7, lot_id: null, qty_on_hand: 4, avg_cost: 2500 });
    expect(doble.filtro('stock_levels', 'is', 'lot_id')).toBeNull();
    const mov = doble.escrituras('stock_movements', 'insert')[0].payload as Record<string, unknown>;
    expect(mov).toMatchObject({ direction: 'in', qty: 4, unit_cost: 2500, source: 'purchase', source_id: 'fac-1', updated_by: 'u-1' });
  });

  test('con stock previo: promedio ponderado', async () => {
    doble = new DobleCompras({
      products: [{ data: { track_stock: true, name: 'Arroz' }, error: null }],
      stock_levels: [{ data: { id: 1, qty_on_hand: 6, avg_cost: 2000 }, error: null }],
    });
    await stockMovementService.incrementOnPurchase(120, 7, 'fac-1', [{ product_id: 9, quantity: 4, unit_price: 2500 }]);
    const upd = doble.escrituras('stock_levels', 'update')[0].payload as Record<string, unknown>;
    expect(upd.qty_on_hand).toBe(10);
    expect(upd.avg_cost).toBeCloseTo(2200, 6);
    expect(promedioPonderado(6, 2000, 4, 2500)).toBeCloseTo(2200, 6);
  });

  test('existencia negativa: el promedio es el costo de la entrada', () => {
    expect(promedioPonderado(-3, 1000, 5, 1200)).toBe(1200);
    expect(promedioPonderado(0, 1000, 5, 1200)).toBe(1200);
  });

  test('no inventariable, cantidad inválida y sin producto se saltan con motivo', async () => {
    doble = new DobleCompras({ products: [{ data: { track_stock: false, name: 'Servicio' }, error: null }] });
    const r = await stockMovementService.incrementOnPurchase(120, 7, 'fac-1', [
      { product_id: 5, quantity: 1, unit_price: 10 },
      { product_id: 6, quantity: 0, unit_price: 10 },
      { product_id: null as unknown as number, quantity: 1, unit_price: 10 },
    ]);
    expect(r.skippedItems.map((s) => s.reason).sort()).toEqual(['invalid_qty', 'no_product', 'not_tracked']);
    expect(doble.escrituras('stock_movements')).toHaveLength(0);
  });
});

describe('costo unitario que entra al kardex (D6)', () => {
  test('neto de descuento y sin IVA descontable', () => {
    // 10 × 1.000 − 500 = 9.500 base; +19 % → el costo sigue siendo 950.
    expect(costoUnitarioCompra({ qty: 10, unit_price: 1000, discount_amount: 500, tax_rate: 19 }, false)).toBe(950);
  });
  test('precio con IVA incluido: el costo es la base', () => {
    expect(costoUnitarioCompra({ qty: 1, unit_price: 1190, tax_rate: 19 }, true)).toBe(1000);
  });
  test('no responsable de IVA: el IVA va al costo', () => {
    expect(costoUnitarioCompra({ qty: 1, unit_price: 1000, tax_rate: 19 }, false, true)).toBe(1190);
  });
});
