/**
 * Bug N1 (POS-CARRITO-LINEAS-NOTAS.md): la nota de la línea y «Excluir
 * impuesto» vivían solo en el estado de React; la siguiente operación de
 * `POSService` (cantidad, descuento, agregar) releía `pos_carts_<org>` y los
 * perdía, y al recargar también. Ahora se guardan con la línea.
 *
 * Además: el flag se guarda con la MISMA semántica (no recalcula y
 * `calculateCartTotals` sigue sin leerlo: los números de
 * `impuestosLineaCarrito.test.ts` no cambian), guardar no borra los carritos
 * `hold_with_debt`, y una línea con nota no absorbe unidades sin nota (N4).
 *
 * Datos inventados: organización 120, sucursal 7.
 */

jest.mock('@/lib/supabase/config', () => {
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'is', 'in', 'order', 'limit', 'neq', 'gte', 'lte', 'or', 'not']) {
    chain[m] = () => chain;
  }
  chain.maybeSingle = () => Promise.resolve({ data: { price: '20000' }, error: null });
  chain.single = () => Promise.resolve({ data: null, error: null });
  chain.then = (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
    Promise.resolve({ data: [], error: null }).then(onFulfilled, onRejected);
  // Precio vigente del producto (getProductPrice ya no convierte «sin fila» en 0).
  const precios: Record<string, unknown> = { ...chain };
  for (const m of ['select', 'eq', 'is', 'in', 'order', 'limit', 'lte', 'or']) precios[m] = () => precios;
  precios.then = (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
    Promise.resolve({ data: [{ price: '20000', effective_from: '2026-01-01T00:00:00Z', effective_to: null }], error: null })
      .then(onFulfilled, onRejected);
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
  get length(): number {
    return this.map.size;
  }
  key(i: number): string | null {
    return Array.from(this.map.keys())[i] ?? null;
  }
}

const storage = new MemoryStorage();
const g = globalThis as unknown as Record<string, unknown>;
g.window = globalThis;
Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true, writable: true });
if (typeof g.addEventListener !== 'function') {
  g.addEventListener = () => undefined;
  g.removeEventListener = () => undefined;
}

import { POSService } from '@/lib/services/posService';
import type { Cart, CartItem, Product } from '@/components/pos/types';

const KEY = 'pos_carts_120';
const IVA = { id: 'iva-19', name: 'IVA', rate: 19, is_default: true, is_active: true };

function linea(id: string, extra: Partial<CartItem> = {}): CartItem {
  return {
    id,
    cart_id: 'cart-1',
    product_id: 1001,
    product: { id: 1001, name: 'Hamburguesa', sku: 'H1' } as never,
    quantity: 2,
    unit_price: 10000,
    total: 20000,
    discount_amount: 0,
    tax_amount: 0,
    tax_rate: 0,
    created_at: '2026-09-23T12:00:00.000Z',
    updated_at: '2026-09-23T12:00:00.000Z',
    ...extra,
  };
}

function guardar(carts: Array<Partial<Cart>>) {
  storage.setItem(KEY, JSON.stringify(carts));
}
const leer = (): Cart[] => JSON.parse(storage.getItem(KEY) || '[]');

beforeEach(() => {
  storage.clear();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(POSService, 'getProductTaxes').mockResolvedValue([{ product_id: 1001, tax_id: IVA.id, organization_taxes: IVA }]);
});
afterEach(() => jest.restoreAllMocks());

describe('la nota de la línea se guarda y sobrevive a las operaciones del servicio', () => {
  it('nota de cocina, alergia y nota del cliente siguen tras cambiar cantidad y descuento', async () => {
    guardar([{ id: 'cart-1', organization_id: 120, branch_id: 7, status: 'active', items: [linea('l1')] }]);
    await POSService.updateCartItemNote('cart-1', 'l1', { cocina: 'sin cebolla', alergia: true });
    await POSService.updateCartItemNote('cart-1', 'l1', { cliente: 'empacar aparte' });
    await POSService.updateCartItemQuantity('cart-1', 'l1', 3);
    const cart = await POSService.updateCartItemDiscount('cart-1', 'l1', 1000);
    expect(cart.items[0]).toMatchObject({ notes: 'sin cebolla', is_allergy: true, customer_note: 'empacar aparte', quantity: 3 });
    // «Al recargar»: lo que queda en el almacenamiento.
    expect(leer()[0].items[0]).toMatchObject({ notes: 'sin cebolla', is_allergy: true, customer_note: 'empacar aparte' });
  });

  it('«Excluir impuesto» se guarda y sobrevive; no recalcula (misma semántica)', async () => {
    guardar([{ id: 'cart-1', organization_id: 120, branch_id: 7, status: 'active', items: [linea('l1')] }]);
    const antes = await POSService.recalculateCart('cart-1');
    const conFlag = await POSService.updateCartItemTaxExcluded('cart-1', 'l1', true);
    // Guardar el flag no cambia ningún importe del carrito.
    expect(conFlag.total).toBe(antes.total);
    expect(conFlag.items[0].tax_amount).toBe(antes.items[0].tax_amount);
    const tras = await POSService.updateCartItemQuantity('cart-1', 'l1', 3);
    expect(tras.items[0].tax_excluded).toBe(true);
    // calculateCartTotals sigue sin leerlo: 3 × 10.000 + 19 % = 35.700 (igual que sin el flag).
    expect(tras.total).toBe(35700);
    expect(leer()[0].items[0].tax_excluded).toBe(true);
    const quitado = await POSService.updateCartItemTaxExcluded('cart-1', 'l1', false);
    expect(quitado.items[0].tax_excluded).toBe(false);
  });

  it('guardar la nota no borra los carritos en deuda (lee la lista completa)', async () => {
    guardar([
      { id: 'cart-1', organization_id: 120, branch_id: 7, status: 'active', items: [linea('l1')] },
      { id: 'cart-deuda', organization_id: 120, branch_id: 7, status: 'hold_with_debt', items: [] },
    ]);
    await POSService.updateCartItemNote('cart-1', 'l1', { cocina: 'x' });
    expect(leer().map((c) => c.id)).toEqual(['cart-1', 'cart-deuda']);
  });

  it('carrito o línea inexistente → error y nada cambia', async () => {
    guardar([{ id: 'cart-1', organization_id: 120, branch_id: 7, status: 'active', items: [linea('l1')] }]);
    await expect(POSService.updateCartItemNote('otro', 'l1', { cocina: 'x' })).rejects.toThrow('Carrito no encontrado');
    await expect(POSService.updateCartItemTaxExcluded('cart-1', 'zz', true)).rejects.toThrow('Item no encontrado');
    expect(leer()[0].items[0].notes).toBeUndefined();
  });
});

describe('vínculo con cocina persistido', () => {
  it('la llave de la ronda y lo enviado por línea quedan en el carrito guardado', async () => {
    guardar([{ id: 'cart-1', organization_id: 120, branch_id: 7, status: 'active', items: [linea('l1')] }]);
    await POSService.setCartKitchenRoundKey('cart-1', 'k-1');
    expect(leer()[0].kitchen_round_key).toBe('k-1');
    const cart = await POSService.applyKitchenRound('cart-1', {
      replayed: false,
      first_ticket_id: 208,
      tickets: [],
      lines: [{ line_id: 'l1', sent_qty: 2, sent_note: null, sent_allergy: false }],
    });
    expect(cart.kitchen_ticket_id).toBe(208);
    expect(cart.kitchen_round_key).toBeNull();
    expect(leer()[0]).toMatchObject({ kitchen_ticket_id: 208, kitchen_round_key: null });
    expect(leer()[0].items[0].kitchen_sent_qty).toBe(2);
    // Y sobrevive a la siguiente operación del servicio (antes se perdía: N2).
    const tras = await POSService.updateCartItemQuantity('cart-1', 'l1', 3);
    expect(tras.kitchen_ticket_id).toBe(208);
    expect(tras.items[0].kitchen_sent_qty).toBe(2);
  });
});

describe('agregar el mismo producto (N4)', () => {
  it('no se suma a una línea con nota: crea otra línea', async () => {
    guardar([{ id: 'cart-1', organization_id: 120, branch_id: 7, status: 'active', items: [linea('l1', { quantity: 1, notes: 'sin cebolla' })] }]);
    const producto = { id: 1001, name: 'Hamburguesa' } as Product;
    const cart = await POSService.addItemToCart('cart-1', producto, 1);
    expect(cart.items).toHaveLength(2);
    expect(cart.items[0]).toMatchObject({ quantity: 1, notes: 'sin cebolla' });
    // Sin nota en ninguna de las dos: se suma como siempre.
    const otra = await POSService.addItemToCart('cart-1', producto, 1);
    expect(otra.items).toHaveLength(2);
    expect(otra.items[1].quantity).toBe(2);
  });
});
