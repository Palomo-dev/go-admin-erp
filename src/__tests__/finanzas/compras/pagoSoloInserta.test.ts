// ============================================================================
// L1 · Registrar un pago a proveedor SOLO inserta en `payments`.
//
// El saldo de la factura y el de la cuenta por pagar los recalculan los
// disparadores (`trg_recalc_invoice_balance_from_payments`,
// `tr_update_accounts_payable_on_payment`). Escribirlos también desde el
// cliente los dejaba en la mitad. La moneda del pago es la de la factura o, sin
// ella, la base de la organización; `payment_date` es el día elegido a la hora
// de la sucursal.
// ============================================================================

const ORG = 120;
const USUARIO = '00000000-0000-0000-0000-000000000001';

jest.mock('@/lib/services/timezoneResolver', () => ({
  resolveTimezone: async (): Promise<string> => 'America/Bogota',
}));

jest.mock('@/lib/hooks/useOrganization', () => ({
  getOrganizationId: () => ORG,
  getCurrentBranchId: () => 7,
  getCurrentUserId: async () => USUARIO,
}));

jest.mock('@/lib/services/monedaOrganizacion', () => ({
  resolveOrgCurrency: async () => ({ code: 'MXN', locale: 'es-MX' }),
  resolverContextoMoneda: async () => ({ code: 'MXN', locale: 'es-MX' }),
}));

jest.mock('@/lib/services/stockMovementService', () => ({
  stockMovementService: { incrementOnPurchase: jest.fn() },
  describeSkippedItems: () => '',
}));

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
import { CuentasPorPagarService } from '@/components/finanzas/cuentas-por-pagar/CuentasPorPagarService';

const FACTURA = { id: 'fac-1', organization_id: ORG, currency: 'USD', balance: 500, total: 500, status: 'received' };

describe('L1 · pago desde la factura de compra', () => {
  beforeEach(() => {
    doble = new DobleCompras({
      invoice_purchase: [{ data: FACTURA, error: null }],
      payments: [{ data: { id: 'pago-1' }, error: null }],
    });
  });

  test('hace exactamente un insert en payments y ninguna escritura de saldos', async () => {
    await FacturasCompraService.registrarPago('fac-1', { amount: 200, payment_method: 'cash', payment_date: '2026-09-24' }, 7);

    const inserts = doble.escrituras('payments', 'insert');
    expect(inserts).toHaveLength(1);
    expect(doble.escrituras('accounts_payable')).toHaveLength(0);
    expect(doble.escrituras('invoice_purchase')).toHaveLength(0);

    const payload = inserts[0].payload as Record<string, unknown>;
    expect(payload).toMatchObject({
      organization_id: ORG,
      branch_id: 7,
      source: 'invoice_purchase',
      source_id: 'fac-1',
      amount: 200,
      currency: 'USD',
      status: 'completed',
    });
    // Día elegido en Bogotá, no el día UTC del navegador.
    expect(String(payload.payment_date)).toMatch(/^2026-09-2[45]T/);
  });

  test('sin moneda en la factura, la base de la organización (nunca COP supuesto)', async () => {
    doble = new DobleCompras({
      invoice_purchase: [{ data: { ...FACTURA, currency: null }, error: null }],
      payments: [{ data: { id: 'pago-1' }, error: null }],
    });
    await FacturasCompraService.registrarPago('fac-1', { amount: 1, payment_method: 'cash' }, 7);
    const payload = doble.escrituras('payments', 'insert')[0].payload as Record<string, unknown>;
    expect(payload.currency).toBe('MXN');
  });
});

describe('L1 · pago desde la cuenta por pagar', () => {
  test('inserta un pago account_payable y no toca accounts_payable', async () => {
    doble = new DobleCompras({
      accounts_payable: [
        { data: { id: 'cxp-1', balance: 300, supplier_id: 3, invoice_id: 'fac-1' }, error: null },
      ],
      payments: [{ data: { id: 'pago-2' }, error: null }],
    });
    await CuentasPorPagarService.registrarPago({
      account_payable_id: 'cxp-1',
      amount: 100,
      payment_method: 'transfer',
    } as Parameters<typeof CuentasPorPagarService.registrarPago>[0]);

    const inserts = doble.escrituras('payments', 'insert');
    expect(inserts).toHaveLength(1);
    expect(inserts[0].payload).toMatchObject({ source: 'account_payable', source_id: 'cxp-1', amount: 100, status: 'completed' });
    expect(doble.escrituras('accounts_payable', 'update')).toHaveLength(0);
    expect(doble.escrituras('invoice_purchase', 'update')).toHaveLength(0);
  });
});
