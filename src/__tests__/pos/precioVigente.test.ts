/**
 * Punto 4 (2026-09-24): precio gratis y precio vencido.
 *
 * - `getProductPrice` devolvía 0 si la consulta fallaba o no había fila: el
 *   producto entraba GRATIS al carrito sin aviso. Ahora falla con
 *   `ProductoSinPrecioError` y el carrito no cambia.
 * - La vigencia es una sola regla (`effective_from <= ahora < effective_to`)
 *   para el catálogo, las variantes, el carrito y el catálogo local.
 *
 * Datos inventados: organización 120, sucursal 7.
 */

let preciosRespuesta: { data: unknown; error: unknown } = { data: [], error: null };
const consultasPrecio: Array<{ metodo: string; args: unknown[] }> = [];

jest.mock('@/lib/supabase/config', () => {
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'is', 'in', 'order', 'limit', 'neq', 'gte', 'lte', 'or', 'not']) {
    chain[m] = () => chain;
  }
  chain.then = (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
    Promise.resolve({ data: [], error: null }).then(onFulfilled, onRejected);
  const precios: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'is', 'in', 'order', 'limit', 'lte', 'or']) {
    precios[m] = (...args: unknown[]) => {
      consultasPrecio.push({ metodo: m, args });
      return precios;
    };
  }
  precios.then = (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
    Promise.resolve(preciosRespuesta).then(onFulfilled, onRejected);
  return { supabase: { from: (tabla: string) => (tabla === 'product_prices' ? precios : chain) } };
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

class MemoryStorage {
  private map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.has(key) ? (this.map.get(key) as string) : null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, String(value));
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  clear(): void {
    this.map.clear();
  }
}

const storage = new MemoryStorage();
Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true, writable: true });

import { POSService } from '@/lib/services/posService';
import { esPrecioVigente, precioVigente, importePrecioVigente, ProductoSinPrecioError } from '@/lib/pos/precioVigente';
import type { Product } from '@/components/pos/types';

const AHORA = new Date('2026-09-24T15:00:00.000Z');

describe('regla única de vigencia', () => {
  it('desde incluido, hasta excluido', () => {
    expect(esPrecioVigente({ price: 1, effective_from: '2026-09-24T15:00:00Z', effective_to: null }, AHORA)).toBe(true);
    expect(esPrecioVigente({ price: 1, effective_from: '2026-09-01T00:00:00Z', effective_to: '2026-09-24T15:00:00Z' }, AHORA)).toBe(false);
    expect(esPrecioVigente({ price: 1, effective_from: '2026-09-01T00:00:00Z', effective_to: '2026-09-24T15:00:01Z' }, AHORA)).toBe(true);
  });

  it('un precio vencido no gana aunque sea el último registrado', () => {
    const filas = [
      { price: 9000, effective_from: '2026-01-01T00:00:00Z', effective_to: null },
      { price: 5000, effective_from: '2026-09-01T00:00:00Z', effective_to: '2026-09-10T00:00:00Z' },
    ];
    expect(importePrecioVigente(filas, AHORA)).toBe(9000);
  });

  it('un precio programado a futuro no rige todavía', () => {
    const filas = [
      { price: 9000, effective_from: '2026-01-01T00:00:00Z', effective_to: null },
      { price: 12000, effective_from: '2026-10-01T00:00:00Z', effective_to: null },
    ];
    expect(importePrecioVigente(filas, AHORA)).toBe(9000);
  });

  it('un precio vigente con fecha de cierre futura sí rige (antes el carrito lo ignoraba)', () => {
    const filas = [{ price: '7000', effective_from: '2026-09-20T00:00:00Z', effective_to: '2026-09-30T00:00:00Z' }];
    expect(importePrecioVigente(filas, AHORA)).toBe(7000);
  });

  it('entre dos vigentes gana el de effective_from más reciente; sin vigentes → null', () => {
    const filas = [
      { price: 1, effective_from: '2026-01-01T00:00:00Z', effective_to: null },
      { price: 2, effective_from: '2026-09-01T00:00:00Z', effective_to: null },
    ];
    expect(precioVigente(filas, AHORA)?.price).toBe(2);
    expect(precioVigente([], AHORA)).toBeNull();
    expect(importePrecioVigente(null, AHORA)).toBeNull();
  });
});

describe('agregar al carrito un producto sin precio ya no lo regala', () => {
  const producto = { id: 1001, name: 'Hamburguesa' } as Product;

  beforeEach(() => {
    storage.clear();
    consultasPrecio.length = 0;
    storage.setItem('pos_carts_120', JSON.stringify([
      { id: 'cart-1', organization_id: 120, branch_id: 7, status: 'active', items: [] },
    ]));
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(POSService, 'getProductTaxes').mockResolvedValue([]);
  });
  afterEach(() => jest.restoreAllMocks());

  it('la consulta falla → error claro y el carrito no cambia (antes: precio 0)', async () => {
    preciosRespuesta = { data: null, error: { message: 'timeout' } };
    const promesa = POSService.addItemToCart('cart-1', producto, 1);
    await expect(promesa).rejects.toBeInstanceOf(ProductoSinPrecioError);
    await expect(POSService.addItemToCart('cart-1', producto, 1)).rejects.toMatchObject({ causa: 'consulta_fallida' });
    expect(JSON.parse(storage.getItem('pos_carts_120') as string)[0].items).toHaveLength(0);
  });

  it('sin fila vigente → error «sin precio» (antes: precio 0)', async () => {
    preciosRespuesta = { data: [], error: null };
    await expect(POSService.addItemToCart('cart-1', producto, 1)).rejects.toMatchObject({ causa: 'sin_precio', productId: 1001 });
    expect(JSON.parse(storage.getItem('pos_carts_120') as string)[0].items).toHaveLength(0);
  });

  it('con precio vigente entra con ese precio y la consulta pide la vigencia real', async () => {
    preciosRespuesta = { data: [{ price: '20000', effective_from: '2026-01-01T00:00:00Z', effective_to: null }], error: null };
    const cart = await POSService.addItemToCart('cart-1', producto, 1);
    expect(cart.items[0].unit_price).toBe(20000);
    const metodos = consultasPrecio.map((c) => c.metodo);
    expect(metodos).toContain('lte');
    expect(metodos).toContain('or');
    // Ya no se pide solo `effective_to IS NULL`.
    expect(metodos).not.toContain('is');
    const or = consultasPrecio.find((c) => c.metodo === 'or');
    expect(String(or?.args[0])).toMatch(/^effective_to\.is\.null,effective_to\.gt\./);
  });

  it('un precio 0 configurado a propósito sigue siendo válido', async () => {
    preciosRespuesta = { data: [{ price: '0', effective_from: '2026-01-01T00:00:00Z', effective_to: null }], error: null };
    const cart = await POSService.addItemToCart('cart-1', producto, 1);
    expect(cart.items[0].unit_price).toBe(0);
  });
});
