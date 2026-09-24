// ============================================================================
// L11 · Los pagos de una factura de compra son los directos
// (`source='invoice_purchase'`) más los de su cuenta por pagar
// (`source='account_payable'`), sin duplicados y del más reciente al más
// antiguo. Es lo mismo que suman los disparadores de saldo.
// ============================================================================

jest.mock('@/lib/services/timezoneResolver', () => ({ resolveTimezone: async () => 'America/Bogota' }));
jest.mock('@/lib/hooks/useOrganization', () => ({
  getOrganizationId: () => 120,
  getCurrentBranchId: () => 7,
  getCurrentUserId: async () => 'u-1',
}));
jest.mock('@/lib/services/monedaOrganizacion', () => ({ resolveOrgCurrency: async () => ({ code: 'COP' }) }));
jest.mock('@/lib/services/stockMovementService', () => ({ stockMovementService: {}, describeSkippedItems: () => '' }));
jest.mock('@/lib/services/serialTrackingService', () => ({ serialTrackingService: {} }));

import { DobleCompras } from './dobleCompras';

let doble = new DobleCompras();
jest.mock('@/lib/supabase/config', () => ({
  get supabase() {
    return doble;
  },
}));

import { FacturasCompraService } from '@/components/finanzas/facturas-compra/FacturasCompraService';
import { fusionarPagos } from '@/lib/services/compras/logica';

const p = (id: string, created_at: string) => ({ id, created_at });

describe('L11 · historial de pagos de la factura', () => {
  test('hoy: une directos e indirectos y ordena por fecha descendente', async () => {
    doble = new DobleCompras({
      payments: [
        { data: [p('d1', '2026-09-20T10:00:00Z'), p('d2', '2026-09-22T10:00:00Z')], error: null },
        { data: [p('i1', '2026-09-21T10:00:00Z')], error: null },
      ],
      accounts_payable: [{ data: [{ id: 'cxp-1' }], error: null }],
    });
    const pagos = await FacturasCompraService.obtenerPagosFactura('fac-1');
    expect(pagos.map((x) => x.id)).toEqual(['d2', 'i1', 'd1']);
    expect(doble.filtro('payments', 'in', 'source_id')).toEqual(['cxp-1']);
  });

  test('fusionarPagos: mismo orden y sin duplicados', () => {
    const directos = [p('d1', '2026-09-20T10:00:00Z'), p('d2', '2026-09-22T10:00:00Z')];
    const cuenta = [p('i1', '2026-09-21T10:00:00Z'), p('d2', '2026-09-22T10:00:00Z')];
    expect(fusionarPagos(directos, cuenta).map((x) => x.id)).toEqual(['d2', 'i1', 'd1']);
  });

  test('fusionarPagos prefiere payment_date sobre created_at', () => {
    const a: { id: string; created_at: string; payment_date: string | null } = {
      id: 'a',
      created_at: '2026-09-25T00:00:00Z',
      payment_date: '2026-09-01T00:00:00Z',
    };
    const b: typeof a = { id: 'b', created_at: '2026-09-10T00:00:00Z', payment_date: null };
    expect(fusionarPagos([a], [b]).map((x) => x.id)).toEqual(['b', 'a']);
  });
});
