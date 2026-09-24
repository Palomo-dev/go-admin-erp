/**
 * L6 (docs/implementacion/POS-PLAN.md §2.1): precio de la línea = precio
 * vigente + extras de los modificadores. Contrato vigente desde c92e25d8: un
 * producto SIN precio vigente ya no entra a $ 0, lanza
 * `ProductoSinPrecioError` y el carrito no cambia (el caso sin modificadores
 * y la regla de vigencia ya los fija `src/__tests__/pos/precioVigente.test.ts`;
 * aquí, con modificadores y al sumar a una línea existente).
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
import { ProductoSinPrecioError } from '@/lib/pos/precioVigente';
import type { CartItemModifier, Product } from '@/components/pos/types';
import { almacen, carrito, guardarCarritos, instalarAlmacen, leerCarritos } from './utilesServicio';

const producto = { id: 1001, name: 'Hamburguesa' } as Product;
const extras: CartItemModifier[] = [
  { groupId: 1, groupName: 'Extras', modifierId: 11, name: 'Queso', extraPrice: 2500 },
  { groupId: 1, groupName: 'Extras', modifierId: 12, name: 'Tocineta', extraPrice: 3000 },
];
const precio = (valor: string) => ({ data: [{ price: valor, effective_from: '2026-01-01T00:00:00Z', effective_to: null }], error: null });

beforeAll(() => instalarAlmacen());
beforeEach(() => {
  almacen.clear();
  guardarCarritos([carrito('cart-1')]);
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(POSService, 'getProductTaxes').mockResolvedValue([]);
});
afterEach(() => jest.restoreAllMocks());

describe('precio de la línea (L6)', () => {
  it('precio vigente + extras de los modificadores; el total de la línea es cantidad × ese precio', async () => {
    mockRespuestas.product_prices = precio('18000');
    const cart = await POSService.addItemToCart('cart-1', producto, 2, extras);
    expect(cart.items[0]).toMatchObject({ unit_price: 23500, total: 47000 });
    expect(cart.subtotal).toBe(47000);
  });

  it('un precio 0 configurado entra a $ 0 más los extras (no se bloquea)', async () => {
    mockRespuestas.product_prices = precio('0');
    const cart = await POSService.addItemToCart('cart-1', producto, 1, extras);
    expect(cart.items[0].unit_price).toBe(5500);
  });

  it('sin precio vigente lanza ProductoSinPrecioError aunque traiga modificadores, y el carrito no cambia', async () => {
    mockRespuestas.product_prices = { data: [], error: null };
    await expect(POSService.addItemToCart('cart-1', producto, 1, extras)).rejects.toBeInstanceOf(ProductoSinPrecioError);
    expect(leerCarritos()[0].items).toHaveLength(0);
  });

  it('al sumar a una línea existente no se vuelve a consultar el precio: conserva el de la línea', async () => {
    mockRespuestas.product_prices = precio('10000');
    await POSService.addItemToCart('cart-1', producto, 1);
    mockRespuestas.product_prices = precio('12000');
    const cart = await POSService.addItemToCart('cart-1', producto, 1);
    expect(cart.items[0]).toMatchObject({ quantity: 2, unit_price: 10000, total: 20000 });
  });
});
