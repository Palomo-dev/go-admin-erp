// ============================================================================
// L2 · El monto de un pago no puede superar el saldo.
//
// Regla extraída a `validarMontoPago` (logica.ts) con el mismo resultado que
// la comparación que hacían los servicios; en la base la vuelve a exigir la RPC.
// ============================================================================

const ORG = 120;

jest.mock('@/lib/services/timezoneResolver', () => ({ resolveTimezone: async () => 'America/Bogota' }));
jest.mock('@/lib/hooks/useOrganization', () => ({
  getOrganizationId: () => ORG,
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

import { validarMontoPago } from '@/lib/services/compras/logica';
import { FacturasCompraService } from '@/components/finanzas/facturas-compra/FacturasCompraService';
import { CuentasPorPagarService } from '@/components/finanzas/cuentas-por-pagar/CuentasPorPagarService';

describe('validarMontoPago', () => {
  test.each([
    [100, 100, { valido: true }],
    [100, 99.99, { valido: true }],
    [100, 100.01, { valido: false, motivo: 'excede_saldo' }],
    [0.3, 0.1 + 0.2, { valido: true }],
    [100, 0, { valido: false, motivo: 'monto_invalido' }],
    [100, -5, { valido: false, motivo: 'monto_invalido' }],
    [100, 'abc', { valido: false, motivo: 'monto_invalido' }],
  ])('saldo %p, monto %p', (saldo, monto, esperado) => {
    expect(validarMontoPago(saldo, monto as number)).toEqual(esperado);
  });
});

describe('los servicios de hoy rechazan lo que excede el saldo (misma regla)', () => {
  test('factura de compra', async () => {
    doble = new DobleCompras({ invoice_purchase: [{ data: { id: 'f', balance: 100, currency: 'COP' }, error: null }] });
    await expect(FacturasCompraService.registrarPago('f', { amount: 100.01, payment_method: 'cash' }, 7)).rejects.toThrow(
      /exceder el balance/,
    );
    expect(doble.escrituras('payments')).toHaveLength(0);
    expect(validarMontoPago(100, 100.01).valido).toBe(false);
  });

  test('cuenta por pagar', async () => {
    doble = new DobleCompras({ accounts_payable: [{ data: { id: 'c', balance: 50 }, error: null }] });
    await expect(
      CuentasPorPagarService.registrarPago({ account_payable_id: 'c', amount: 51, payment_method: 'cash' } as Parameters<
        typeof CuentasPorPagarService.registrarPago
      >[0]),
    ).rejects.toThrow(/mayor al saldo/);
    expect(doble.escrituras('payments')).toHaveLength(0);
  });
});
