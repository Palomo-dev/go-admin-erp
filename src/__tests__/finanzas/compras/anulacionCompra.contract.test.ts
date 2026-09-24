// ============================================================================
// L4 · La anulación de una factura de compra la hace la base, en una RPC.
//
// `fn_void_purchase_invoice` bloquea si hay pagos, revierte el stock recibido,
// deja la cuenta por pagar en cero y registra el contra-asiento espejo, sin
// borrar asientos. El cliente no escribe nada más: solo llama a la RPC.
// ============================================================================

jest.mock('@/lib/services/timezoneResolver', () => ({ resolveTimezone: async () => 'America/Bogota' }));
jest.mock('@/lib/hooks/useOrganization', () => ({
  getOrganizationId: () => 120,
  getCurrentBranchId: () => 7,
  getCurrentUserId: async () => '00000000-0000-0000-0000-00000000000a',
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

describe('L4 · anular factura de compra', () => {
  test('llama solo a fn_void_purchase_invoice con factura, motivo y usuario', async () => {
    doble = new DobleCompras();
    await FacturasCompraService.anularFactura('fac-9', 'Mercancía devuelta');
    expect(doble.rpcs).toEqual([
      {
        fn: 'fn_void_purchase_invoice',
        args: { p_invoice_id: 'fac-9', p_reason: 'Mercancía devuelta', p_user: '00000000-0000-0000-0000-00000000000a' },
      },
    ]);
    expect(doble.llamadas).toHaveLength(0);
  });

  test('el error de la base (p. ej. «tiene pagos») llega al llamador', async () => {
    doble = new DobleCompras({}, {
      fn_void_purchase_invoice: [{ error: { message: 'No se puede anular: la factura tiene pagos registrados' } }],
    });
    await expect(FacturasCompraService.anularFactura('fac-9', '')).rejects.toMatchObject({ message: expect.stringMatching(/pagos/) });
  });
});
