/**
 * L33 (docs/implementacion/POS-PLAN.md §2.4): el cliente es obligatorio SOLO
 * para «Deuda» (la FE no lo exige hoy, E-31). Dos niveles, los dos de hoy:
 * - el botón «Deuda» de `CartView.tsx` (`puedeRegistrarDeuda`) y su diálogo
 *   (`puedeConfirmarDeuda`): cliente y carrito ni en espera ni en deuda;
 *   motivo escrito para confirmar;
 * - `POSService.holdCartWithDebt` exige además líneas, total > 0 y estado
 *   activo, y rechaza sin llamar al servidor lo que el botón deja pasar.
 * Que la deuda sea UNA llamada a pos_checkout_v1 y que sin cliente no se
 * llame al servidor lo fija `src/lib/offline/__tests__/deudaYAnulacion.test.ts`.
 *
 * Datos inventados: organización 120, sucursal 7.
 */
const mockRpc = jest.fn();
jest.mock('@/lib/supabase/config', () => ({
  supabase: {
    from: () => {
      const chain: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'is', 'in', 'order', 'limit', 'gt', 'lte', 'or']) chain[m] = () => chain;
      chain.then = (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(ok, ko);
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

import { POSService } from '@/lib/services/posService';
import { puedeConfirmarDeuda, puedeRegistrarDeuda } from '@/lib/pos/venta/requisitosCarrito';
import type { Cart } from '@/components/pos/types';
import { almacen, carrito, guardarCarritos, instalarAlmacen, leerCarritos, linea } from './utilesServicio';

const lleno = (extra: Partial<Cart> = {}) => carrito('cart-1', { items: [linea('l1')], total: 20000, customer_id: 'cli-1', ...extra });

beforeAll(() => instalarAlmacen());
beforeEach(() => {
  almacen.clear();
  mockRpc.mockReset();
});

describe('botón y diálogo «Deuda» (L33)', () => {
  it('el botón exige cliente y un carrito ni en espera ni ya en deuda', () => {
    expect(puedeRegistrarDeuda(lleno())).toBe(true);
    expect(puedeRegistrarDeuda(lleno({ customer_id: undefined }))).toBe(false);
    expect(puedeRegistrarDeuda(lleno({ status: 'hold' }))).toBe(false);
    expect(puedeRegistrarDeuda(lleno({ status: 'hold_with_debt' }))).toBe(false);
    expect(puedeRegistrarDeuda(lleno({ items: [] }))).toBe(false);
    // HOY el botón no mira el total: un carrito a $ 0 con cliente lo habilita.
    expect(puedeRegistrarDeuda(lleno({ total: 0 }))).toBe(true);
  });

  it('confirmar pide motivo escrito (no solo espacios) y cliente', () => {
    expect(puedeConfirmarDeuda(lleno(), 'Paga el viernes')).toBe(true);
    expect(puedeConfirmarDeuda(lleno(), '   ')).toBe(false);
    expect(puedeConfirmarDeuda(lleno({ customer_id: undefined }), 'x')).toBe(false);
  });
});

describe('el servicio rechaza lo que el botón deja pasar (L33)', () => {
  it.each([
    ['total 0', { total: 0 }, 'El total del carrito debe ser mayor a cero'],
    ['sin líneas', { items: [] }, 'El carrito debe tener items para generar deuda'],
    ['sin cliente', { customer_id: undefined }, 'El carrito debe tener un cliente asignado para generar deuda'],
    ['en espera', { status: 'hold' as const }, 'Solo se pueden poner en espera carritos activos'],
  ])('%s: error claro, sin llamar al servidor, y el carrito no cambia', async (_caso, extra, mensaje) => {
    guardarCarritos([lleno(extra as Partial<Cart>)]);
    const antes = JSON.stringify(leerCarritos());
    await expect(POSService.holdCartWithDebt({ cartId: 'cart-1', reason: 'x' })).rejects.toThrow(mensaje);
    expect(mockRpc).not.toHaveBeenCalled();
    expect(JSON.stringify(leerCarritos())).toBe(antes);
  });
});
