// ============================================================================
// L12 · Comisión de compra: se registra al crear si hay comisionista.
//
// Campos que la RPC nueva (`fn_factura_compra_guardar`) debe conservar:
// `source_type='invoice_purchase'`, `source_id` = factura, moneda de la
// factura, `status='accrued'`, base = subtotal. El disparador de la base solo
// actúa al pasar a `paid` (ningún camino lo hace), así que no duplica.
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

import { FacturasCompraService } from '@/components/finanzas/facturas-compra/FacturasCompraService';

type FormCrear = Parameters<typeof FacturasCompraService.crearFactura>[0];

describe('L12 · comisión al crear', () => {
  test('con comisionista y tarifa > 0 se inserta una comisión accrued en la moneda de la factura', async () => {
    doble = new DobleCompras({
      invoice_purchase: [{ data: { id: 'f-1', currency: 'USD' }, error: null }],
      profiles: [{ data: { first_name: 'Ana', last_name: 'Ruiz' }, error: null }],
    });
    await FacturasCompraService.crearFactura(
      {
        supplier_id: 3,
        number_ext: 'F-1',
        issue_date: '2026-09-24T12:00:00-05:00',
        due_date: null,
        currency: '',
        tax_included: false,
        salesperson_id: 'vend-1',
        commission_rate: 5,
        commission_type: 'salesperson',
        commission_method: 'percentage',
        commission_amount: 5,
        items: [{ product_id: 9, description: 'P', qty: 1, unit_price: 100, tax_rate: 0, discount_amount: 0 }],
        _calculatedTotals: { subtotal: 100, taxTotal: 0, total: 100 },
      } as unknown as FormCrear,
      7,
    );
    const com = doble.escrituras('commissions', 'insert');
    expect(com).toHaveLength(1);
    expect(com[0].payload).toMatchObject({
      organization_id: 120,
      branch_id: 7,
      commission_type: 'salesperson',
      source_type: 'invoice_purchase',
      source_id: 'f-1',
      payee_type: 'employee',
      payee_id: 'vend-1',
      payee_name: 'Ana Ruiz',
      base_amount: 100,
      commission_rate: 5,
      commission_amount: 5,
      currency: 'USD',
      status: 'accrued',
    });
  });

  test('sin comisionista no hay comisión', async () => {
    doble = new DobleCompras({ invoice_purchase: [{ data: { id: 'f-1' }, error: null }] });
    await FacturasCompraService.crearFactura(
      {
        supplier_id: 3,
        number_ext: 'F-2',
        tax_included: false,
        items: [{ product_id: 9, description: 'P', qty: 1, unit_price: 100 }],
      } as unknown as FormCrear,
      7,
    );
    expect(doble.escrituras('commissions')).toHaveLength(0);
  });
});
