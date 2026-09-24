/**
 * L5 (docs/implementacion/POS-PLAN.md §2.1): agregar el mismo producto con los
 * mismos modificadores suma cantidad; con otros modificadores crea otra
 * línea. Prueba de caracterización de `POSService.addItemToCart` (la regla
 * vive en el servicio, no se extrae). «Una línea con nota no absorbe unidades»
 * ya lo fija `src/__tests__/pos/notaLineaPersistida.test.ts` (N4).
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
import type { CartItemModifier, Product } from '@/components/pos/types';
import { almacen, carrito, guardarCarritos, instalarAlmacen, leerCarritos } from './utilesServicio';

const producto = { id: 1001, name: 'Hamburguesa' } as Product;
const mod = (modifierId: number, extraPrice = 0): CartItemModifier => ({ groupId: 1, groupName: 'Salsas', modifierId, name: `M${modifierId}`, extraPrice });

beforeAll(() => instalarAlmacen());
beforeEach(() => {
  almacen.clear();
  mockRespuestas.product_prices = { data: [{ price: '10000', effective_from: '2026-01-01T00:00:00Z', effective_to: null }], error: null };
  guardarCarritos([carrito('cart-1')]);
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(POSService, 'getProductTaxes').mockResolvedValue([]);
});
afterEach(() => jest.restoreAllMocks());

describe('agregar al carrito (L5)', () => {
  it('el mismo producto sin modificadores suma cantidad en la misma línea y recalcula su total', async () => {
    await POSService.addItemToCart('cart-1', producto, 1);
    const cart = await POSService.addItemToCart('cart-1', producto, 2);
    expect(cart.items).toHaveLength(1);
    expect(cart.items[0]).toMatchObject({ quantity: 3, unit_price: 10000, total: 30000 });
    expect(leerCarritos()[0].items[0].quantity).toBe(3);
  });

  it('los modificadores se comparan ordenados: [2,1] y [1,2] son la misma línea', async () => {
    await POSService.addItemToCart('cart-1', producto, 1, [mod(2), mod(1)]);
    const cart = await POSService.addItemToCart('cart-1', producto, 1, [mod(1), mod(2)]);
    expect(cart.items).toHaveLength(1);
    expect(cart.items[0].quantity).toBe(2);
  });

  it('otros modificadores (o ninguno frente a alguno) crean otra línea', async () => {
    await POSService.addItemToCart('cart-1', producto, 1, [mod(1)]);
    await POSService.addItemToCart('cart-1', producto, 1, [mod(2)]);
    const cart = await POSService.addItemToCart('cart-1', producto, 1);
    expect(cart.items).toHaveLength(3);
    expect(cart.items.map((i) => i.modifiers?.map((m) => m.modifierId) ?? null)).toEqual([[1], [2], null]);
  });
});
