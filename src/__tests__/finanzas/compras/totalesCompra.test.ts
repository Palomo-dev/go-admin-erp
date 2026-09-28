// ============================================================================
// §0.2 · El impuesto de la compra no se pierde al guardar.
//
// `fn_recalc_invoice_totals` arma la cabecera con Σ `total_line`: quien escribe
// líneas debe escribir el BRUTO. «HOY» fija el defecto del formulario viejo
// (`total_line` sin IVA → `tax_total` 0 y CxP sin IVA); la regla nueva es
// `calcularLineaCompra`, la misma que `fn_factura_compra_guardar` (F-51) y que
// audita `fn_normalizar_impuesto_linea`.
// ============================================================================

jest.mock('@/lib/services/timezoneResolver', () => ({ resolveTimezone: async () => 'America/Bogota' }));
jest.mock('@/lib/hooks/useOrganization', () => ({
  getOrganizationId: () => 120,
  getCurrentBranchId: () => 7,
  getCurrentUserId: async () => 'u-1',
}));
jest.mock('@/lib/services/monedaOrganizacion', () => ({ resolveOrgCurrency: async () => ({ code: 'COP' }) }));
jest.mock('@/lib/services/stockMovementService', () => ({ stockMovementService: {}, describeSkippedItems: () => '' }));
jest.mock('@/lib/services/serialTrackingService', () => ({
  serialTrackingService: { createSerials: jest.fn(async () => ({ data: [], errors: [] })) },
}));

import { DobleCompras } from './dobleCompras';

let doble = new DobleCompras();
jest.mock('@/lib/supabase/config', () => ({
  get supabase() {
    return doble;
  },
}));

import { calcularLineaCompra, calcularTotalesCompra } from '@/lib/services/compras/logica';
import { FacturasCompraService } from '@/components/finanzas/facturas-compra/FacturasCompraService';

describe('regla nueva', () => {
  test('IVA adicional: total_line lleva el IVA', () => {
    expect(calcularLineaCompra({ qty: 2, unit_price: 50000, tax_rate: 19 }, false)).toEqual({ base: 100000, impuesto: 19000, total_line: 119000 });
  });

  test('IVA incluido: la base sale por splitGrossLine', () => {
    expect(calcularLineaCompra({ qty: 1, unit_price: 119000, tax_rate: 19 }, true)).toEqual({ base: 100000, impuesto: 19000, total_line: 119000 });
  });

  test('descuento antes del impuesto', () => {
    expect(calcularLineaCompra({ qty: 10, unit_price: 1000, discount_amount: 500, tax_rate: 19 }, false).total_line).toBe(11305);
  });

  test('D4: neto a pagar = total − retenciones', () => {
    const t = calcularTotalesCompra(
      [
        { qty: 1, unit_price: 100000, tax_rate: 19 },
        { qty: 1, unit_price: 50000, tax_rate: 0 },
      ],
      false,
      [{ concepto: 'Retención en la fuente 4 %', base: 150000, tarifa: 4 }],
    );
    expect(t).toMatchObject({ subtotal: 150000, impuestos: 19000, total: 169000, retenciones: 6000, netoAPagar: 163000 });
    expect(t.porTarifa).toEqual([
      { tarifa: 0, base: 50000, impuesto: 0 },
      { tarifa: 19, base: 100000, impuesto: 19000 },
    ]);
  });
});

describe('HOY: el formulario viejo', () => {
  test('HOY (bug §0.2): total_line se escribe sin IVA', async () => {
    doble = new DobleCompras({ invoice_purchase: [{ data: { id: 'f-1' }, error: null }] });
    await FacturasCompraService.crearFactura(
      {
        supplier_id: 3,
        number_ext: 'F-1',
        tax_included: false,
        items: [{ product_id: 9, description: 'P', qty: 2, unit_price: 50000, tax_rate: 19, discount_amount: 0 }],
      } as unknown as Parameters<typeof FacturasCompraService.crearFactura>[0],
      7,
    );
    const lineas = doble.escrituras('invoice_items', 'insert')[0].payload as Array<{ total_line: number }>;
    expect(lineas[0].total_line).toBe(100000);
    expect(lineas[0].total_line).not.toBe(calcularLineaCompra({ qty: 2, unit_price: 50000, tax_rate: 19 }, false).total_line);
  });

  test('HOY (bug §0.3): la CxP se crea desde el navegador al guardar el borrador', async () => {
    doble = new DobleCompras({ invoice_purchase: [{ data: { id: 'f-1' }, error: null }] });
    await FacturasCompraService.crearFactura(
      { supplier_id: 3, number_ext: 'F-1', tax_included: false, items: [{ product_id: 9, description: 'P', qty: 1, unit_price: 1 }] } as unknown as Parameters<
        typeof FacturasCompraService.crearFactura
      >[0],
      7,
    );
    expect(doble.escrituras('accounts_payable', 'insert')).toHaveLength(1);
  });
});
