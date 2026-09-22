/**
 * Proyección del carrito del POS a lo que ve el cliente en la pantalla.
 *
 * Es el ÚNICO sitio donde se construye un DisplayCart (PLAN §8): es el
 * contrato que ve el cliente y no puede divergir del recibo. Por eso:
 *
 * - `subtotal` es SIEMPRE Σ `line.total` (bruto, qty × unitPrice). No se
 *   copia `cart.subtotal` ni se acepta por override: así la suma de líneas
 *   que el cliente ve cuadra con el subtotal que el cliente ve, sin
 *   excepciones.
 * - `discountTotal`, `taxTotal` y `total` NO se recalculan aquí. Hay TRES
 *   motores de totales en el POS y no coinciden: posService.calculateCartTotals
 *   escribe cart.discount_total/tax_total/total al guardar; TaxSummary (lo
 *   que el cajero ve bajo el carrito) y CheckoutDialog (lo que cobra y lo que
 *   va al recibo) recalculan con `calculateCartTaxes` de
 *   src/lib/utils/taxCalculations.ts, que honra `item.tax_excluded` («Excluir
 *   impuesto de este producto», un botón que además no recalcula el carrito)
 *   y el override de `organization_taxes`. La pantalla debe repetir lo que el
 *   recibo repetirá (PLAN §4.3), es decir, el motor de TaxSummary/
 *   CheckoutDialog. Decisión: esta función NO reimplementa ese motor (sería
 *   un cuarto, y no tiene acceso a organization_taxes sin ir a la BD). En su
 *   lugar acepta `opts.totals` (DisplayTotalsOverride): la Parte B lo calcula
 *   con el MISMO motor que ve el cajero (`calculateCartTaxes`) y lo pasa aquí;
 *   sin override se usan los campos del cart (posService) tal cual.
 * - Cada línea lleva `taxExcluded` y `taxIncluded` para que la pantalla lo
 *   diga y la Parte B pueda decidir el override sin volver a leer el carrito.
 * - No lleva el objeto `product` completo: con 200 líneas son ~30 KB. De
 *   `product` solo salen `name` y `variant_data` (como badges, igual que
 *   CartView y el recibo).
 * - Es pura y determinista: mismo carrito → mismo resultado, sin fechas ni
 *   aleatoriedad. Nunca lanza: con `cart` null/undefined devuelve un
 *   DisplayCart vacío (la caja la llama tras cada mutación y un TypeError
 *   aquí rompería la venta por culpa de la pantalla, PLAN §5.5).
 */

import type { Cart, CartItem, CartItemModifier } from '@/components/pos/types';
import type { DisplayCart, DisplayLine, DisplayModifier, DisplayVariantAttribute } from './protocol';

/**
 * Totales que sustituyen a los del carrito. La Parte B pasa aquí los
 * `calculatedTotals` del mismo motor que el recibo (calculateCartTaxes vía
 * TaxSummary/CheckoutDialog); sin override se copian los del carrito.
 * No incluye `subtotal`: ese es siempre Σ líneas (ver cabecera).
 *
 * Correspondencia con `calculatedTotals` de TaxSummary/CheckoutDialog:
 * `discountTotal = cart.discount_total`, `taxTotal =
 * calculatedTotals.totalTaxAmount`, `total = calculatedTotals.finalTotal`.
 */
export interface DisplayTotalsOverride {
  discountTotal: number;
  taxTotal: number;
  total: number;
}

export interface ProjectCartOptions {
  /**
   * Código ISO de la moneda de la organización (p. ej. "COP"). Si no es un
   * string no vacío se usa 'COP' y se avisa una vez por console.warn.
   */
  currency: string;
  /** Línea que acaba de cambiar, para el resaltado de 600 ms. */
  lastChangedLineId?: string | null;
  /**
   * Si viene, sustituye a `cart.discount_total`, `tax_total` y `total`. Ver
   * DisplayTotalsOverride. Se normaliza igual que los del carrito (número
   * finito o 0; descuento nunca negativo).
   */
  totals?: DisplayTotalsOverride | null;
  /**
   * ¿Puede viajar el nombre del cliente? Por defecto sí, por compatibilidad
   * con quien no lo pase. El emisor lo ata a `showCustomerName` (PLAN §5.2,
   * «privacidad primero»): con el ajuste apagado el nombre no se filtra solo
   * al pintar, no sale del emisor, así que tampoco cruza el canal remoto ni
   * aparece en las herramientas de desarrollo de la pantalla.
   */
  includeCustomerName?: boolean;
}

/** Moneda de respaldo cuando la Parte B no pasa una válida. */
const FALLBACK_CURRENCY = 'COP';

/** Solo se avisa una vez por carga: la caja llama a esta función tras cada tecla. */
let warnedAboutCurrency = false;

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

function resolveCurrency(currency: unknown): string {
  if (typeof currency === 'string' && currency.length > 0) return currency;
  if (!warnedAboutCurrency) {
    warnedAboutCurrency = true;
    console.warn(`[pos-display] currency inválida en projectCartForDisplay; se usa ${FALLBACK_CURRENCY}`);
  }
  return FALLBACK_CURRENCY;
}

function projectModifier(mod: CartItemModifier): DisplayModifier {
  return {
    name: typeof mod.name === 'string' ? mod.name : '',
    extraPrice: toAmount(mod.extraPrice),
  };
}

/**
 * `product.variant_data` (Record<string, string> en la BD; el tipo Product del
 * POS no lo declara pero CartView, CheckoutDialog y el recibo lo leen). Solo
 * pares con valor no vacío, en el orden en que vienen. null si no es variante.
 */
function projectVariant(product: unknown): DisplayVariantAttribute[] | null {
  if (typeof product !== 'object' || product === null) return null;
  const data = (product as { variant_data?: unknown }).variant_data;
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return null;
  const pairs: DisplayVariantAttribute[] = [];
  for (const [attr, raw] of Object.entries(data as Record<string, unknown>)) {
    const value = typeof raw === 'string' ? raw.trim() : typeof raw === 'number' && Number.isFinite(raw) ? String(raw) : '';
    if (attr.length > 0 && value.length > 0) pairs.push({ attr, value });
  }
  return pairs.length > 0 ? pairs : null;
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
  // pantalla es siempre bruta, así Σ líneas === subtotal y el descuento se
  // resta una sola vez, en `discount`. Sin redondear: es la misma aritmética
  // que calculateCartTotals (reduce de qty × unit_price), y redondear aquí
  // rompía la igualdad en centavos con productos por peso (3 × 0.3 × 3333.33
  // → 3000 vs 2999.997). La pantalla formatea con Intl.NumberFormat.
  const total = qty * unitPrice;
  const discount = toAmount(item.discount_amount);
  const note = typeof item.notes === 'string' && item.notes.trim().length > 0 ? item.notes.trim() : null;

  return {
    id: lineId(item, index),
    name: typeof item.product?.name === 'string' ? item.product.name : '',
    variant: projectVariant(item.product),
    qty,
    unitPrice,
    total,
    modifiers: Array.isArray(item.modifiers) ? item.modifiers.filter(isEntry).map(projectModifier) : [],
    discount: discount > 0 ? discount : null,
    note,
    taxExcluded: Boolean(item.tax_excluded),
    taxIncluded: Boolean(item.tax_included),
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
 * Nombre del cliente del carrito (Fase 4) o null. Solo `customer.full_name`
 * (columna GENERATED de la BD); nunca documento, teléfono ni correo: a la
 * pantalla del cliente no viaja ningún otro dato personal. Recortado y, si
 * queda vacío, null. La pantalla solo lo pinta con `showCustomerName`.
 */
function projectCustomerName(cart: Cart): string | null {
  const raw = (cart.customer as { full_name?: unknown } | undefined)?.full_name;
  if (typeof raw !== 'string') return null;
  const name = raw.trim();
  return name.length > 0 ? name : null;
}

/** DisplayCart sin carrito: lo que se proyecta cuando la caja no tiene carrito activo. */
function emptyDisplayCart(currency: string): DisplayCart {
  return {
    id: '',
    currency,
    lines: [],
    subtotal: 0,
    discountTotal: 0,
    discountLabel: null,
    taxTotal: 0,
    taxIncluded: false,
    total: 0,
    lastChangedLineId: null,
    customerName: null,
  };
}

/**
 * Proyecta el carrito de la caja al contrato de la pantalla del cliente.
 *
 * Con `cart` null o undefined (sin carrito activo) devuelve un DisplayCart
 * vacío (id '', sin líneas, totales 0, taxIncluded false) en vez de lanzar.
 * En ese caso la Parte B debe emitir `mode: 'idle'` con `cart: null`, no
 * este vacío: existe solo para que la llamada tras cada mutación nunca
 * rompa la venta.
 *
 * `discountLabel`: hoy `Cart` no guarda el cupón ni la promoción que originó
 * el descuento (promotionEngine escribe solo `discount_amount` en cada
 * línea), así que queda en null. Cuando el carrito lleve ese dato, este es
 * el único punto que hay que tocar.
 */
export function projectCartForDisplay(cart: Cart | null | undefined, opts: ProjectCartOptions): DisplayCart {
  const currency = resolveCurrency(opts.currency);
  if (!isEntry(cart)) return emptyDisplayCart(currency);

  const items = Array.isArray(cart.items) ? cart.items.filter(isEntry) : [];
  const lines = items.map(projectLine);
  const lastChangedLineId = opts.lastChangedLineId ?? null;
  // Con override, descuento/impuesto/total vienen del motor del recibo (ver cabecera); sin él, del carrito.
  const totals = isEntry(opts.totals) ? opts.totals : null;

  return {
    id: typeof cart.id === 'string' ? cart.id : '',
    currency,
    lines,
    // Σ líneas brutas, nunca cart.subtotal: lo que el cliente suma es lo que el cliente ve.
    subtotal: lines.reduce((sum, line) => sum + line.total, 0),
    // Un descuento negativo es un bug de la caja, no un descuento: se muestra 0 (misma regla que la línea).
    discountTotal: Math.max(0, toAmount(totals ? totals.discountTotal : cart.discount_total)),
    discountLabel: null,
    taxTotal: toAmount(totals ? totals.taxTotal : cart.tax_total),
    taxIncluded: resolveTaxIncluded(items, cart.tax_included),
    total: toAmount(totals ? totals.total : cart.total),
    // Solo se resalta una línea que exista en el carrito proyectado.
    lastChangedLineId: lastChangedLineId !== null && lines.some((l) => l.id === lastChangedLineId) ? lastChangedLineId : null,
    customerName: opts.includeCustomerName === false ? null : projectCustomerName(cart),
  };
}
