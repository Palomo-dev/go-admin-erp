/**
 * Proyección del carrito del POS a lo que ve el cliente en la pantalla.
 *
 * Es el ÚNICO sitio donde se construye un DisplayCart (PLAN §8): es el
 * contrato que ve el cliente y no puede divergir del recibo. Por eso:
 * - No recalcula totales: la caja (posService.calculateCartTotals) es la
 *   fuente de verdad y aquí solo se copian `subtotal`, `discount_total`,
 *   `tax_total` y `total` tal como los guarda el carrito. La única cifra que
 *   se deriva es `line.total` = qty × unitPrice (bruto), porque `item.total`
 *   del carrito cambia de significado según el impuesto (ver projectLine).
 * - No lleva el objeto `product` completo: con 200 líneas son ~30 KB.
 * - Es pura y determinista: mismo carrito → mismo resultado, sin fechas ni
 *   aleatoriedad.
 */

import type { Cart, CartItem, CartItemModifier } from '@/components/pos/types';
import type { DisplayCart, DisplayLine, DisplayModifier } from './protocol';

export interface ProjectCartOptions {
  /** Código ISO de la moneda de la organización (p. ej. "COP"). */
  currency: string;
  /** Línea que acaba de cambiar, para el resaltado de 600 ms. */
  lastChangedLineId?: string | null;
}

/** Convierte cualquier valor numérico del carrito a un número finito (0 si no lo es). */
function toAmount(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Un carrito guardado por una versión vieja del POS puede traer `null`,
 * `undefined` o un primitivo dentro de `items` o de `modifiers`. Se filtran
 * antes de proyectar: la caja llama a esta función tras cada mutación y un
 * TypeError aquí rompería la venta por culpa de la pantalla (PLAN §5.5).
 */
function isEntry<T extends object>(value: T | null | undefined): value is T {
  return typeof value === 'object' && value !== null;
}

function projectModifier(mod: CartItemModifier): DisplayModifier {
  return {
    name: typeof mod.name === 'string' ? mod.name : '',
    extraPrice: toAmount(mod.extraPrice),
  };
}

/**
 * Id de la línea para la pantalla. Se copia `item.id`; si falta (carrito
 * viejo o corrupto) se deriva uno estable de `product_id` + posición, con un
 * prefijo que no puede chocar con un UUID real, para que la UI siempre tenga
 * `key` y el resaltado de `lastChangedLineId` pueda apuntar a ella.
 */
function lineId(item: CartItem, index: number): string {
  if (typeof item.id === 'string' && item.id.length > 0) return item.id;
  const productId = typeof item.product_id === 'number' || typeof item.product_id === 'string' ? String(item.product_id) : 'x';
  return `linea:${productId}:${index}`;
}

function projectLine(item: CartItem, index: number): DisplayLine {
  const qty = toAmount(item.quantity);
  // `unit_price` ya incluye el extra de los modificadores (posService.addItem
  // suma `extraPrice` al precio base). Los modificadores se listan solo como
  // información, igual que en CartView.
  const unitPrice = toAmount(item.unit_price);
  // Nunca se copia `item.total`: posService.calculateItemTaxes lo reescribe como
  // neto (impuesto incluido) o neto + impuesto (excluido) y solo lo deja en
  // qty × unit_price cuando el producto no tiene impuestos. La línea de la
  // pantalla es siempre bruta, así Σ líneas === subtotal (calculateCartTotals)
  // y el descuento se resta una sola vez, en `discount`. Sin redondear: es la
  // misma aritmética que calculateCartTotals (reduce de qty × unit_price), y
  // redondear aquí rompía la igualdad en centavos con productos por peso
  // (3 × 0.3 × 3333.33 → 3000 vs 2999.997). La pantalla formatea con
  // Intl.NumberFormat.
  const total = qty * unitPrice;
  const discount = toAmount(item.discount_amount);
  const note = typeof item.notes === 'string' && item.notes.trim().length > 0 ? item.notes.trim() : null;

  return {
    id: lineId(item, index),
    name: typeof item.product?.name === 'string' ? item.product.name : '',
    qty,
    unitPrice,
    total,
    modifiers: Array.isArray(item.modifiers) ? item.modifiers.filter(isEntry).map(projectModifier) : [],
    discount: discount > 0 ? discount : null,
    note,
  };
}

/**
 * Resuelve si el impuesto va incluido en los precios con la misma regla que
 * posService.calculateCartTotals (posService.ts:2407): decide SOLO con
 * `items.some(i => i.tax_included)` —truthy, no `=== true`, para que un 1 o
 * un 'true' llegado de localStorage se anuncie igual que la caja lo calcula—
 * y nunca lee `cart.tax_included`. Con el toggle por ítem (CartView →
 * updateItemTaxIncluded) el flag del carrito puede quedar desfasado, y la
 * pantalla debe anunciar lo que la caja calculó. `cart.tax_included` solo
 * sirve para etiquetar un carrito sin líneas.
 */
function resolveTaxIncluded(items: CartItem[], cartFlag: unknown): boolean {
  if (items.length === 0) return Boolean(cartFlag);
  return items.some((item) => Boolean(item.tax_included));
}

/**
 * Proyecta el carrito de la caja al contrato de la pantalla del cliente.
 *
 * `discountLabel`: hoy `Cart` no guarda el cupón ni la promoción que originó
 * el descuento (promotionEngine escribe solo `discount_amount` en cada
 * línea), así que queda en null. Cuando el carrito lleve ese dato, este es
 * el único punto que hay que tocar.
 */
export function projectCartForDisplay(cart: Cart, opts: ProjectCartOptions): DisplayCart {
  const items = Array.isArray(cart.items) ? cart.items.filter(isEntry) : [];
  const lines = items.map(projectLine);
  const lastChangedLineId = opts.lastChangedLineId ?? null;

  return {
    id: cart.id,
    currency: opts.currency,
    lines,
    subtotal: toAmount(cart.subtotal),
    discountTotal: toAmount(cart.discount_total),
    discountLabel: null,
    taxTotal: toAmount(cart.tax_total),
    taxIncluded: resolveTaxIncluded(items, cart.tax_included),
    total: toAmount(cart.total),
    // Solo se resalta una línea que exista en el carrito proyectado.
    lastChangedLineId: lastChangedLineId !== null && lines.some((l) => l.id === lastChangedLineId) ? lastChangedLineId : null,
  };
}
