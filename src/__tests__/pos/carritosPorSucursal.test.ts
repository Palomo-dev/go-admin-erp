/**
 * Punto 7 (2026-09-24): carritos por sucursal.
 *
 * `pos_carts_<org>` guarda en una sola lista los carritos de todas las
 * sucursales. Antes el POS de la sede A mostraba, cobraba y fiaba carritos de
 * la B (el efectivo quedaba en la caja equivocada), y cada mutación guardaba
 * la lista filtrada: borraba de paso los carritos en deuda. Ahora
 * `getActiveCarts` filtra por sucursal y las mutaciones leen y guardan la
 * lista completa.
 *
 * Datos inventados: organización 120, sucursales 7 y 9.
 */

jest.mock('@/lib/supabase/config', () => {
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'is', 'in', 'order', 'limit', 'neq', 'gte', 'lte', 'or', 'not']) chain[m] = () => chain;
  chain.then = (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) =>
    Promise.resolve({ data: [{ price: '1000', effective_from: '2026-01-01T00:00:00Z', effective_to: null }], error: null }).then(ok, ko);
  return { supabase: { from: () => chain } };
});
let sucursalActual: number | null = 7;
jest.mock('@/lib/hooks/useOrganization', () => ({
  getOrganizationId: () => 120,
  getCurrentBranchId: () => sucursalActual,
  getCurrentBranchIdWithFallback: () => sucursalActual,
  getCurrentUserId: () => 'user-1',
}));
jest.mock('@/lib/services/promotionEngine', () => ({
  promotionEngine: { evaluate: async () => ({ discountTotal: 0, itemDiscounts: {}, applied: [] }) },
}));
jest.mock('@/lib/pos/display/posDisplay', () => ({
  getPosDisplayEmitter: () => ({ onCartsSaved: () => undefined, setMode: () => undefined }),
}));

const mapa = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
  value: {
    getItem: (k: string) => (mapa.has(k) ? mapa.get(k)! : null),
    setItem: (k: string, v: string) => void mapa.set(k, String(v)),
    removeItem: (k: string) => void mapa.delete(k),
    clear: () => mapa.clear(),
  },
  configurable: true,
  writable: true,
});

import { POSService } from '@/lib/services/posService';
import type { Cart, Product } from '@/components/pos/types';

const KEY = 'pos_carts_120';
const carrito = (id: string, branch_id: number | undefined, status: Cart['status'] = 'active'): Partial<Cart> =>
  ({ id, organization_id: 120, branch_id: branch_id as number, status, items: [] });
const leer = (): Cart[] => JSON.parse(mapa.get(KEY) || '[]');

beforeEach(() => {
  mapa.clear();
  sucursalActual = 7;
  mapa.set(KEY, JSON.stringify([
    carrito('a7', 7),
    carrito('b9', 9),
    carrito('espera7', 7, 'hold'),
    carrito('deuda9', 9, 'hold_with_debt'),
    carrito('viejo', undefined),
  ]));
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(POSService, 'getProductTaxes').mockResolvedValue([]);
});
afterEach(() => jest.restoreAllMocks());

describe('getActiveCarts filtra por sucursal', () => {
  it('la sucursal 7 ve sus carritos vivos y los que no tienen sucursal; no los de la 9', async () => {
    expect((await POSService.getActiveCarts(7)).map((c) => c.id)).toEqual(['a7', 'espera7', 'viejo']);
    expect((await POSService.getActiveCarts(9)).map((c) => c.id)).toEqual(['b9', 'viejo']);
  });

  it('sin argumento usa la sucursal seleccionada; «Todas» (null) no filtra', async () => {
    sucursalActual = 9;
    expect((await POSService.getActiveCarts()).map((c) => c.id)).toEqual(['b9', 'viejo']);
    expect((await POSService.getActiveCarts(null)).map((c) => c.id)).toEqual(['a7', 'b9', 'espera7', 'viejo']);
  });
});

describe('las mutaciones guardan la lista completa', () => {
  it('agregar un producto en la sucursal 7 no borra los carritos de la 9 ni los en deuda', async () => {
    await POSService.addItemToCart('a7', { id: 1, name: 'A' } as Product, 1);
    expect(leer().map((c) => c.id)).toEqual(['a7', 'b9', 'espera7', 'deuda9', 'viejo']);
    expect(leer()[0].items).toHaveLength(1);
  });

  it('cantidad, descuento, cliente, espera y quitar tampoco borran carritos ajenos', async () => {
    const cart = await POSService.addItemToCart('a7', { id: 1, name: 'A' } as Product, 1);
    await POSService.updateCartItemQuantity('a7', cart.items[0].id, 3);
    await POSService.updateCartItemDiscount('a7', cart.items[0].id, 100);
    await POSService.holdCart('a7', 'cliente vuelve');
    await POSService.removeItemFromCart('a7', cart.items[0].id);
    expect(leer().map((c) => c.id)).toEqual(['a7', 'b9', 'espera7', 'deuda9', 'viejo']);
  });

  it('un carrito en deuda sigue sin poder editarse como carrito vivo', async () => {
    await expect(POSService.addItemToCart('deuda9', { id: 1, name: 'A' } as Product, 1)).rejects.toThrow('Carrito no encontrado');
  });
});
