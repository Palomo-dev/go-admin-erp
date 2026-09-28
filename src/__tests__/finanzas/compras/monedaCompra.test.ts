// ============================================================================
// L5 · La moneda de la factura de compra se respeta; sin moneda, la pone la base.
//
// El payload no manda una moneda supuesta: con `currency: null` actúa
// `trg_00_moneda_base_por_defecto` (moneda base de la organización). Al editar
// sin moneda elegida, no se pisa la que ya tiene la factura.
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

const form = (extra: Partial<FormCrear> = {}): FormCrear =>
  ({
    supplier_id: 3,
    number_ext: 'F-1',
    issue_date: '2026-09-24T12:00:00-05:00',
    due_date: '2026-10-24T12:00:00-05:00',
    currency: '',
    notes: '',
    payment_terms: 30,
    tax_included: false,
    items: [{ product_id: 9, description: 'P', qty: 1, unit_price: 100, tax_rate: 0, discount_amount: 0 }],
    ...extra,
  }) as unknown as FormCrear;

describe('L5 · moneda de la compra', () => {
  test('sin moneda elegida: currency null (la pone la base)', async () => {
    doble = new DobleCompras({ invoice_purchase: [{ data: { id: 'f-1', currency: 'COP' }, error: null }] });
    await FacturasCompraService.crearFactura(form(), 7);
    const cab = doble.escrituras('invoice_purchase', 'insert')[0].payload as Record<string, unknown>;
    expect(cab.currency).toBeNull();
  });

  test('con moneda elegida: esa', async () => {
    doble = new DobleCompras({ invoice_purchase: [{ data: { id: 'f-1', currency: 'USD' }, error: null }] });
    await FacturasCompraService.crearFactura(form({ currency: 'USD' } as Partial<FormCrear>), 7);
    const cab = doble.escrituras('invoice_purchase', 'insert')[0].payload as Record<string, unknown>;
    expect(cab.currency).toBe('USD');
  });

  test('al editar sin moneda no se envía currency', async () => {
    doble = new DobleCompras({
      invoice_purchase: [
        { data: { id: 'f-1', status: 'draft', branch_id: 7 }, error: null },
        { data: { total: 100, balance: 100 }, error: null },
        { data: { id: 'f-1' }, error: null },
      ],
    });
    await FacturasCompraService.actualizarFactura('f-1', form());
    const upd = doble.escrituras('invoice_purchase', 'update')[0].payload as Record<string, unknown>;
    expect('currency' in upd).toBe(false);
  });
});
