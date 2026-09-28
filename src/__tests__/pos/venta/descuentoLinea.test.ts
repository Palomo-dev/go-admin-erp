/**
 * L8 (docs/implementacion/POS-PLAN.md §2.1): el descuento de una línea se
 * acota a cantidad × precio; un negativo queda en 0. El total del carrito lo
 * resta. Caracterización de `POSService.updateCartItemDiscount`.
 *
 * Datos inventados: organización 120, sucursal 7.
 */
const mockRespuestas: Record<string, { data: unknown; error: unknown }> = {};
jest.mock('@/lib/supabase/config', () => {
  const tabla = (nombre: string) => {
    const chain: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'is', 'in', 'order', 'limit', 'neq', 'gt', 'gte', 'lte', 'or', 'not']) chain[m] = () => chain;
    const respuesta = () => mockRespuestas[nombre] ?? { data: [], error: null };
    chain.maybeSingle = () => Promise.resolve(respuesta());
    chain.single = () => Promise.resolve(respuesta());
    chain.then = (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve(respuesta()).then(ok, ko);
    return chain;
  };
  return { supabase: { from: tabla } };
});
jest.mock('@/lib/hooks/useOrganization', () => ({
  getOrganizationId: () => 120,
  getCurrentBranchId: () => 7,
  getCurrentBranchIdWithFallback: () => 7,
  getCurrentUserId: () => 'user-1',
}));
jest.mock('@/lib/services/promotionEngine', () => ({
  promotionEngine: { evaluate: async () => ({ discountTotal: 0, itemDiscounts: {}, applied: [] }) },
}));
jest.mock('@/lib/pos/display/posDisplay', () => ({
  getPosDisplayEmitter: () => ({ onCartsSaved: () => undefined, setMode: () => undefined, setTotals: () => undefined }),
}));

import { POSService } from '@/lib/services/posService';
import { almacen, carrito, guardarCarritos, instalarAlmacen, leerCarritos, linea } from './utilesServicio';

beforeAll(() => instalarAlmacen());
beforeEach(() => {
  almacen.clear();
  // 2 × 10.000 = 20.000
  guardarCarritos([carrito('cart-1', { items: [linea('l1')] })]);
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(POSService, 'getProductTaxes').mockResolvedValue([]);
});
afterEach(() => jest.restoreAllMocks());

describe('descuento de la línea (L8)', () => {
  it('dentro del tope se guarda tal cual y el total del carrito lo resta', async () => {
    const cart = await POSService.updateCartItemDiscount('cart-1', 'l1', 3000);
    expect(cart.items[0].discount_amount).toBe(3000);
    expect(cart).toMatchObject({ subtotal: 20000, discount_total: 3000, total: 17000 });
    expect(leerCarritos()[0].items[0].discount_amount).toBe(3000);
  });

  it('por encima de cantidad × precio se acota al tope (la línea queda en 0, nunca negativa)', async () => {
    const cart = await POSService.updateCartItemDiscount('cart-1', 'l1', 50000);
    expect(cart.items[0].discount_amount).toBe(20000);
    expect(cart.total).toBe(0);
  });

  it('un descuento negativo queda en 0', async () => {
    const cart = await POSService.updateCartItemDiscount('cart-1', 'l1', -500);
    expect(cart.items[0].discount_amount).toBe(0);
    expect(cart.total).toBe(20000);
  });
});
