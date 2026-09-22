/**
 * Regresión 2026-09-21: cerrar la pestaña de un carrito en /app/pos solo lo
 * quitaba del estado de React; `pos_carts_<org>` conservaba el carrito y al
 * volver al POS reaparecían todos los cerrados (32 «activos» con productos
 * en una caja real). `POSService.removeCart` es ahora público y es lo que
 * llama la página al descartar.
 *
 * Además, `removeCart` filtraba sobre `getActiveCarts()` (solo active/hold)
 * y al guardar borraba de paso los `hold_with_debt` y `cancelled`, que
 * `getInvoiceForCart` y devoluciones necesitan.
 */

jest.mock('@/lib/supabase/config', () => {
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'is', 'in', 'order', 'limit', 'neq', 'gte', 'lte', 'or', 'not']) {
    chain[m] = () => chain;
  }
  chain.maybeSingle = () => Promise.resolve({ data: null, error: null });
  chain.single = () => Promise.resolve({ data: null, error: null });
  chain.then = (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
    Promise.resolve({ data: [], error: null }).then(onFulfilled, onRejected);
  return { supabase: { from: () => chain } };
});

jest.mock('@/lib/hooks/useOrganization', () => ({
  getOrganizationId: () => 120,
  getCurrentBranchId: () => 7,
  getCurrentBranchIdWithFallback: () => 7,
  getCurrentUserId: () => 'user-1',
}));

jest.mock('@/lib/services/promotionEngine', () => ({
  promotionEngine: {
    evaluate: async () => ({ discountTotal: 0, itemDiscounts: {}, applied: [] }),
  },
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
import type { Cart } from '@/components/pos/types';

const KEY = 'pos_carts_120';
const readCarts = (): Cart[] => JSON.parse(storage.getItem(KEY) || '[]');

describe('POSService.removeCart (descartar carrito desde la página)', () => {
  beforeEach(() => storage.clear());

  it('borra el carrito de pos_carts_<org>: al volver al POS ya no reaparece', async () => {
    const a = await POSService.createCart(7);
    const b = await POSService.createCart(7);
    expect((await POSService.getActiveCarts()).map((c) => c.id)).toEqual([a.id, b.id]);

    await POSService.removeCart(a.id);

    expect(readCarts().map((c) => c.id)).toEqual([b.id]);
    expect((await POSService.getActiveCarts()).map((c) => c.id)).toEqual([b.id]);
  });

  it('conserva los carritos hold_with_debt y cancelled que getActiveCarts no devuelve', async () => {
    const a = await POSService.createCart(7);
    const b = await POSService.createCart(7);
    const stored = readCarts();
    const debt: Cart = { ...stored[1], id: 'deuda-1', status: 'hold_with_debt' };
    const cancelled: Cart = { ...stored[1], id: 'anulada-1', status: 'cancelled' };
    storage.setItem(KEY, JSON.stringify([...stored, debt, cancelled]));

    await POSService.removeCart(a.id);

    expect(readCarts().map((c) => c.id)).toEqual([b.id, 'deuda-1', 'anulada-1']);
  });

  it('es idempotente: un id inexistente no altera la lista', async () => {
    const a = await POSService.createCart(7);
    await POSService.removeCart('no-existe');
    expect(readCarts().map((c) => c.id)).toEqual([a.id]);
  });
});
