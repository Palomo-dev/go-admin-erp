// ============================================================================
// L14 · Seriales de compra.
//
// Al crear: un serial por número con producto, organización, sucursal,
// proveedor, factura y costo de compra (quedan `in_stock`, lo pone el
// servicio de seriales). Al editar: se borran SOLO los `in_stock` de la factura
// y se crean los del formulario. La RPC nueva conserva las dos reglas.
// ============================================================================

jest.mock('@/lib/services/timezoneResolver', () => ({ resolveTimezone: async () => 'America/Bogota' }));
jest.mock('@/lib/hooks/useOrganization', () => ({
  getOrganizationId: () => 120,
  getCurrentBranchId: () => 7,
  getCurrentUserId: async () => 'u-1',
}));
jest.mock('@/lib/services/monedaOrganizacion', () => ({ resolveOrgCurrency: async () => ({ code: 'COP' }) }));
jest.mock('@/lib/services/stockMovementService', () => ({ stockMovementService: {}, describeSkippedItems: () => '' }));

const createSerials = jest.fn<Promise<{ data: unknown[]; errors: string[] }>, [unknown]>(async () => ({ data: [], errors: [] }));
jest.mock('@/lib/services/serialTrackingService', () => ({
  serialTrackingService: { createSerials: (x: unknown) => createSerials(x) },
}));

import { DobleCompras } from './dobleCompras';

let doble = new DobleCompras();
jest.mock('@/lib/supabase/config', () => ({
  get supabase() {
    return doble;
  },
}));

import { FacturasCompraService } from '@/components/finanzas/facturas-compra/FacturasCompraService';

type FormCrear = Parameters<typeof FacturasCompraService.crearFactura>[0];

const form = {
  supplier_id: 3,
  number_ext: 'F-1',
  tax_included: false,
  items: [
    { product_id: 9, description: 'Celular', qty: 2, unit_price: 800, serial_numbers: ['IMEI-1', 'IMEI-2'] },
    { product_id: 10, description: 'Funda', qty: 1, unit_price: 20 },
  ],
} as unknown as FormCrear;

describe('L14 · seriales', () => {
  beforeEach(() => createSerials.mockClear());

  test('al crear: un serial por número con proveedor, factura y costo', async () => {
    doble = new DobleCompras({ invoice_purchase: [{ data: { id: 'f-1' }, error: null }] });
    await FacturasCompraService.crearFactura(form, 7);
    expect(createSerials).toHaveBeenCalledTimes(1);
    expect(createSerials.mock.calls[0][0]).toEqual([
      { product_id: 9, organization_id: 120, branch_id: 7, serial: 'IMEI-1', supplier_id: 3, purchase_invoice_id: 'f-1', cost_at_purchase: 800 },
      { product_id: 9, organization_id: 120, branch_id: 7, serial: 'IMEI-2', supplier_id: 3, purchase_invoice_id: 'f-1', cost_at_purchase: 800 },
    ]);
  });

  test('al editar: borra solo los in_stock de la factura', async () => {
    doble = new DobleCompras({
      invoice_purchase: [
        { data: { id: 'f-1', status: 'draft', branch_id: 7 }, error: null },
        { data: { total: 1620, balance: 1620 }, error: null },
        { data: { id: 'f-1' }, error: null },
      ],
    });
    await FacturasCompraService.actualizarFactura('f-1', form);
    const borrado = doble.escrituras('serial_numbers', 'delete')[0];
    expect(borrado.filtros).toEqual(
      expect.arrayContaining([
        { metodo: 'eq', columna: 'purchase_invoice_id', valor: 'f-1' },
        { metodo: 'eq', columna: 'status', valor: 'in_stock' },
      ]),
    );
    expect(createSerials).toHaveBeenCalledTimes(1);
  });
});
