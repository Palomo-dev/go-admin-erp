/**
 * L57 (docs/implementacion/POS-PLAN.md §2.7, G-07): «Deuda» sin red queda
 * BLOQUEADA. No hay cola offline para la deuda: si pos_checkout_v1 no
 * responde, `POSService.holdCartWithDebt` falla, el carrito sigue ACTIVO (no
 * pasa a «en deuda» ni gana factura) y conserva el id del intento, así que
 * reintentar con red es la misma deuda (el reintento lo fija
 * `src/lib/offline/__tests__/deudaYAnulacion.test.ts`).
 *
 * Datos inventados: organización 120, sucursal 7.
 */
const mockRpc = jest.fn();
jest.mock('@/lib/supabase/config', () => ({
  supabase: {
    from: () => {
      const chain: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'is', 'in', 'order', 'limit', 'gt', 'lte', 'or', 'maybeSingle']) chain[m] = () => chain;
      chain.then = (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(ok, ko);
      return chain;
    },
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
}));
jest.mock('@/lib/hooks/useOrganization', () => ({
  getOrganizationId: () => 120,
  getCurrentBranchId: () => 7,
  getCurrentBranchIdWithFallback: () => 7,
  getCurrentUserId: () => 'user-1',
}));
jest.mock('@/lib/services/promotionEngine', () => ({ promotionEngine: { evaluate: async () => ({ discountTotal: 0, itemDiscounts: {}, applied: [] }) } }));
jest.mock('@/lib/pos/display/posDisplay', () => ({ getPosDisplayEmitter: () => ({ onCartsSaved: () => undefined }) }));
jest.mock('@/lib/services/organizationTimezoneService', () => ({ getOrganizationTimezone: async () => 'America/Bogota' }));

import { POSService } from '@/lib/services/posService';
import { __resetCheckoutRpcForTests, POS_CHECKOUT_RPC } from '@/lib/offline/checkoutRpc';
import { almacen, carrito, guardarCarritos, instalarAlmacen, leerCarritos, linea } from './utilesServicio';

beforeAll(() => instalarAlmacen());
beforeEach(() => {
  almacen.clear();
  __resetCheckoutRpcForTests();
  mockRpc.mockReset();
  jest.spyOn(POSService, 'getBaseCurrency').mockResolvedValue({ code: 'USD', name: 'USD', symbol: '$', decimals: 2, is_base: true, is_active: true });
  guardarCarritos([carrito('cart-1', { items: [linea('l1')], total: 20000, customer_id: 'cli-1' })]);
});
afterEach(() => jest.restoreAllMocks());

describe('deuda sin red (L57)', () => {
  it('la llamada falla por red: error, el carrito sigue activo y sin factura, con el id del intento guardado', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'TypeError: Failed to fetch', code: '' } });
    await expect(POSService.holdCartWithDebt({ cartId: 'cart-1', reason: 'Paga el viernes' })).rejects.toThrow();
    expect(mockRpc).toHaveBeenCalledWith(POS_CHECKOUT_RPC, expect.anything());
    const [guardado] = leerCarritos();
    expect(guardado.status).toBe('active');
    expect(guardado.invoice_id).toBeUndefined();
    expect(typeof guardado.debt_attempt_id).toBe('string');
  });

  it('sin la RPC de cobro disponible tampoco se registra nada: mensaje de servicio no disponible', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } });
    await expect(POSService.holdCartWithDebt({ cartId: 'cart-1', reason: 'x' })).rejects.toThrow(/servicio de cobro no está disponible/);
    expect(leerCarritos()[0].status).toBe('active');
  });
});
