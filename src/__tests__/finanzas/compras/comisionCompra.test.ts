// ============================================================================
// L12 · Comisión de compra: se registra al crear si hay comisionista, en la
// BASE (fn_fc_guardar_int, dentro de `fn_factura_compra_guardar`):
// `source_type='invoice_purchase'`, `source_id` = factura, moneda de la
// factura, `status='accrued'`, base = subtotal. El disparador de la base solo
// actúa al pasar a `paid` (ningún camino lo hace), así que no duplica.
//
// 20260928213000: `commissions` solo admite SELECT para la sesión. El servicio
// viejo del navegador (`crearFactura`, formulario sin importadores) ya no la
// escribe: aquí se fija que no lo intente y que la RPC conserva los campos.
// ============================================================================

import { readFileSync } from 'fs';
import { join } from 'path';

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
  test('con comisionista y tarifa > 0 el navegador NO escribe commissions (lo hace la RPC de la factura de compra)', async () => {
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
    expect(doble.escrituras('commissions')).toHaveLength(0);
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

describe('L12 · la comisión de compra la devenga la base', () => {
  test('fn_fc_guardar_int inserta la comisión accrued con base subtotal y la moneda de la factura', () => {
    const sql = readFileSync(join(process.cwd(), 'supabase/migrations/20260926130000_compras_f1_rpc_factura.sql'), 'utf8');
    const bloque = sql.slice(sql.indexOf('insert into public.commissions'));
    expect(bloque).toMatch(/'invoice_purchase', v_id::text/);
    expect(bloque).toMatch(/case when coalesce\(v_subtotal, 0\) > 0 then v_subtotal else coalesce\(v_total, 0\) end/);
    expect(bloque).toMatch(/\(select currency from public\.invoice_purchase where id = v_id\), 'accrued'/);
  });
});
