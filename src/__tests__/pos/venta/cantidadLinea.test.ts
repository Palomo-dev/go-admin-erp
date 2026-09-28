/**
 * L7 (docs/implementacion/POS-PLAN.md §2.1): cambiar la cantidad de una línea.
 * Cantidad ≤ 0 QUITA la línea, sin confirmar (hoy). El diseño añade una
 * confirmación al llegar a 0 (C-11): será UI; esta prueba fija el servicio.
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
  guardarCarritos([carrito('cart-1', { items: [linea('l1'), linea('l2', { product_id: 1002, unit_price: 5000, total: 10000 })] })]);
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(POSService, 'getProductTaxes').mockResolvedValue([]);
});
afterEach(() => jest.restoreAllMocks());

describe('cantidad de la línea (L7)', () => {
  it('una cantidad positiva reemplaza la de la línea y recalcula el total del carrito', async () => {
    const cart = await POSService.updateCartItemQuantity('cart-1', 'l1', 5);
    expect(cart.items.find((i) => i.id === 'l1')).toMatchObject({ quantity: 5, total: 50000 });
    expect(cart.total).toBe(60000);
  });

  it.each([0, -1])('cantidad %d quita la línea sin pedir confirmación', async (cantidad) => {
    const cart = await POSService.updateCartItemQuantity('cart-1', 'l1', cantidad);
    expect(cart.items.map((i) => i.id)).toEqual(['l2']);
    expect(leerCarritos()[0].items.map((i) => i.id)).toEqual(['l2']);
    expect(cart.total).toBe(10000);
  });

  it('una línea que no existe es un error y el carrito no cambia', async () => {
    await expect(POSService.updateCartItemQuantity('cart-1', 'nada', 3)).rejects.toThrow('Item no encontrado');
    expect(leerCarritos()[0].items).toHaveLength(2);
  });
});
