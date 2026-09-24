/**
 * Utilidades de las pruebas de servicio del POS (paso 1 de
 * docs/implementacion/POS-PLAN.md): localStorage en memoria y carritos y
 * líneas de ejemplo. No es un archivo de prueba (no termina en `.test.ts`).
 *
 * Datos inventados: organización 120, sucursal 7.
 */
import type { Cart, CartItem } from '@/components/pos/types';

export const CLAVE_CARRITOS = 'pos_carts_120';

class AlmacenEnMemoria {
  private mapa = new Map<string, string>();
  getItem(k: string): string | null {
    return this.mapa.has(k) ? (this.mapa.get(k) as string) : null;
  }
  setItem(k: string, v: string): void {
    this.mapa.set(k, String(v));
  }
  removeItem(k: string): void {
    this.mapa.delete(k);
  }
  clear(): void {
    this.mapa.clear();
  }
  get length(): number {
    return this.mapa.size;
  }
  key(i: number): string | null {
    return Array.from(this.mapa.keys())[i] ?? null;
  }
}

export const almacen = new AlmacenEnMemoria();

/** Instala el almacén como `localStorage` global (llamar antes de importar el servicio). */
export function instalarAlmacen(): void {
  Object.defineProperty(globalThis, 'localStorage', { value: almacen, configurable: true, writable: true });
}

export function linea(id: string, extra: Partial<CartItem> = {}): CartItem {
  return {
    id,
    cart_id: 'cart-1',
    product_id: 1001,
    product: { id: 1001, name: 'Hamburguesa', sku: 'H1' } as CartItem['product'],
    quantity: 2,
    unit_price: 10000,
    total: 20000,
    discount_amount: 0,
    tax_amount: 0,
    tax_rate: 0,
    created_at: '2026-09-24T12:00:00.000Z',
    updated_at: '2026-09-24T12:00:00.000Z',
    ...extra,
  };
}

export function carrito(id: string, extra: Partial<Cart> = {}): Cart {
  return {
    id,
    organization_id: 120,
    branch_id: 7,
    status: 'active',
    items: [],
    subtotal: 0,
    tax_amount: 0,
    tax_total: 0,
    discount_amount: 0,
    discount_total: 0,
    total: 0,
    created_at: '2026-09-24T12:00:00.000Z',
    updated_at: '2026-09-24T12:00:00.000Z',
    ...extra,
  };
}

export function guardarCarritos(carts: Cart[]): void {
  almacen.setItem(CLAVE_CARRITOS, JSON.stringify(carts));
}

export function leerCarritos(): Cart[] {
  return JSON.parse(almacen.getItem(CLAVE_CARRITOS) || '[]');
}
