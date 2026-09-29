// ============================================================================
// L6 · Recepción de compra al kardex.
//
// Desde el núcleo B0, `stockMovementService.incrementOnPurchase` es una fachada
// de `fn_kardex_entrada_compra`, que en la base garantiza:
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
import { costoPromedioTrasEntrada } from '@/lib/inventario/nucleo/costo';

describe('L6 · incrementOnPurchase va por fn_kardex_entrada_compra (núcleo B0)', () => {
  // Desde el bloque B0 (INVENTARIO-PLAN §5.1) la fachada ya no lee ni escribe
  // stock_levels/stock_movements: la entrada, el bloqueo, el promedio ponderado y
  // el costo con vigencia los hace la RPC en una transacción. Aquí se fija el
  // contrato con la RPC; el cálculo se prueba en la base (begin … rollback) y en
  // src/__tests__/db/inventarioNucleo.test.ts.
  test('una sola RPC con las líneas, el costo de cada una y sin idempotencia por documento', async () => {
    doble = new DobleCompras({}, {
      fn_kardex_entrada_compra: [{ data: { ya_recepcionado: false, procesadas: [{ product_id: 9 }], saltadas: [] }, error: null }],
    });
    const r = await stockMovementService.incrementOnPurchase(120, 7, 'fac-1', [{ product_id: 9, quantity: 4, unit_price: 2500 }], 'purchase', 'u-1');
    expect(r.errors).toEqual([]);
    expect(doble.rpcs).toEqual([
      {
        fn: 'fn_kardex_entrada_compra',
        args: {
          p_org: 120, p_branch: 7, p_source: 'purchase', p_source_id: 'fac-1',
          p_lineas: [{ product_id: 9, qty: 4, unit_cost: 2500 }],
          p_user: 'u-1', p_supplier_id: null, p_idempotente: false,
        },
      },
    ]);
    expect(doble.escrituras('stock_levels')).toHaveLength(0);
    expect(doble.escrituras('stock_movements')).toHaveLength(0);
  });

  test('promedio ponderado: la regla única que aplica el servidor', () => {
    expect(promedioPonderado(6, 2000, 4, 2500)).toBeCloseTo(2200, 6);
    expect(costoPromedioTrasEntrada(6, 2000, 4, 2500)).toBeCloseTo(promedioPonderado(6, 2000, 4, 2500), 9);
  });

  test('existencia negativa: el promedio es el costo de la entrada', () => {
    expect(promedioPonderado(-3, 1000, 5, 1200)).toBe(1200);
    expect(promedioPonderado(0, 1000, 5, 1200)).toBe(1200);
    expect(costoPromedioTrasEntrada(-3, 1000, 5, 1200)).toBe(1200);
  });

  test('cantidad inválida y sin producto se saltan antes; no inventariable lo informa el servidor', async () => {
    doble = new DobleCompras({}, {
      fn_kardex_entrada_compra: [{ data: { ya_recepcionado: false, procesadas: [], saltadas: [{ product_id: 5, product_name: 'Servicio', reason: 'not_tracked' }] }, error: null }],
    });
    const r = await stockMovementService.incrementOnPurchase(120, 7, 'fac-1', [
      { product_id: 5, quantity: 1, unit_price: 10 },
      { product_id: 6, quantity: 0, unit_price: 10 },
      { product_id: null as unknown as number, quantity: 1, unit_price: 10 },
    ]);
    expect(r.skippedItems.map((s) => s.reason).sort()).toEqual(['invalid_qty', 'no_product', 'not_tracked']);
    expect((doble.rpcs[0].args?.p_lineas as unknown[]).length).toBe(1);
    expect(doble.escrituras('stock_movements')).toHaveLength(0);
  });

  test('un origen que no es de compra no llega a la RPC', async () => {
    doble = new DobleCompras();
    const r = await stockMovementService.incrementOnPurchase(120, 7, 'x', [{ product_id: 9, quantity: 1, unit_price: 1 }], 'sale');
    expect(r.success).toBe(false);
    expect(doble.rpcs).toHaveLength(0);
  });

  test('la reversión del folio entra al costo de salida, no al precio de venta', async () => {
    doble = new DobleCompras({}, { fn_inv_reversion_entrada: [{ data: { procesadas: [{ product_id: 9 }], saltadas: [] }, error: null }] });
    const r = await stockMovementService.incrementOnPurchase(120, 7, 'folio-1', [{ product_id: 9, quantity: 2, unit_price: 99000 }], 'folio_item_reversal');
    expect(r.errors).toEqual([]);
    expect(doble.rpcs[0]).toEqual({
      fn: 'fn_inv_reversion_entrada',
      args: { p_org: 120, p_branch: 7, p_source: 'folio_item_reversal', p_source_id: 'folio-1', p_lineas: [{ product_id: 9, quantity: 2 }] },
    });
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
