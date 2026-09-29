/**
 * Cantidades de las líneas de una mesa con productos por peso o medida
 * (docs/design/PRODUCTOS-POR-PESO-BASCULA.md §2.6 «Mesas» y §10).
 *
 * Puro (sin React ni Supabase): lo usan el carrito de «Agregar productos»,
 * la tarjeta del plato, el traslado, la cuenta dividida y los tests. Reutiliza
 * la lógica del POS (`@/lib/pos/peso`): nada de reglas propias.
 *
 * - Una línea por unidad sigue igual: enteros, ±1 y se funde con otra igual.
 * - Una línea por peso o medida lleva los decimales del producto (3 en kg),
 *   nunca se funde (cada pesada es su propia línea) y se muestra «0,500 kg».
 */

import {
  cantidadDesdeTexto,
  decimalesCantidad,
  esMedido,
  formatoCantidad,
  redondearCantidadProducto,
  type ProductoModoVenta,
} from '@/lib/pos/peso';
import type { ProductToAdd, SaleItem } from './types';

/** «Cómo se vende» de una línea de la mesa (el producto viene en `item.product`). */
export function modoVentaLinea(item: Pick<SaleItem, 'product'> | null | undefined): ProductoModoVenta {
  const p = (item?.product ?? null) as ProductoModoVenta | null;
  return {
    sale_mode: p?.sale_mode ?? null,
    qty_decimals: p?.qty_decimals ?? null,
    unit_code: p?.unit_code ?? null,
  };
}

/** Decimales admitidos en la cantidad de la línea (0 por unidad). */
export function decimalesLinea(item: Pick<SaleItem, 'product'> | null | undefined): number {
  return decimalesCantidad(modoVentaLinea(item));
}

/** «0,500 kg» en una línea por peso; «3» en una por unidad. */
export function formatoCantidadLinea(
  cantidad: number | string,
  item: Pick<SaleItem, 'product'> | null | undefined,
  locale = 'es-CO',
): string {
  return formatoCantidad(Number(cantidad) || 0, modoVentaLinea(item), locale);
}

/**
 * Cantidad escrita (coma o punto) con los decimales de la línea; `null` si
 * no vale. Con 0 decimales solo enteros, como antes (`parseInt`), pero sin
 * convertir «1,5» en 1 en silencio.
 */
export function leerCantidadLinea(texto: string, decimales: number): number | null {
  return cantidadDesdeTexto(texto, decimales);
}

/** Resta con los decimales de la línea (0,735 − 0,5 = 0,235 y no 0,23499…). */
export function restarCantidad(total: number | string, parte: number, decimales: number): number {
  return redondearCantidadProducto((Number(total) || 0) - (Number(parte) || 0), Math.max(0, decimales));
}

/** Suma con los decimales de la línea. */
export function sumarCantidades(valores: readonly number[], decimales: number): number {
  return redondearCantidadProducto(
    valores.reduce((s, v) => s + (Number(v) || 0), 0),
    Math.max(0, decimales),
  );
}

export type ErrorTraslado = 'invalida' | 'excede';

/** Cantidad a trasladar a otra mesa: > 0, con los decimales de la línea y ≤ lo que hay. */
export function validarTraslado(cantidad: number | null, disponible: number | string, decimales: number): ErrorTraslado | null {
  if (cantidad === null || !Number.isFinite(cantidad) || cantidad <= 0) return 'invalida';
  if (redondearCantidadProducto(cantidad, decimales) !== cantidad) return 'invalida';
  if (cantidad > (Number(disponible) || 0) + 1e-9) return 'excede';
  return null;
}

/**
 * Lo que se asigna a una parte de la cuenta dividida: la cantidad pedida,
 * topada en lo que queda y redondeada a los decimales de la línea.
 */
export function asignacionParte(pedida: number, restante: number, decimales: number): number {
  const q = Math.max(0, Math.min(Number(pedida) || 0, Math.max(0, Number(restante) || 0)));
  return redondearCantidadProducto(q, Math.max(0, decimales));
}

// ─── Carrito de «Agregar productos» de la mesa ──────────────────────────────

/** Carrito de la mesa: clave de línea → línea. */
export type CarritoMesa = Map<string, ProductToAdd>;

/** Clave de una línea por unidad: el producto (se funde con otra igual, como antes). */
export function claveUnidad(productId: number): string {
  return `p:${productId}`;
}

/** Clave de una pesada: única (cada pesada es su propia línea). */
export function clavePesada(productId: number, secuencia: number): string {
  return `p:${productId}:w${secuencia}`;
}

/** ¿La línea del carrito se vende por peso o medida? */
export function lineaMedida(linea: Pick<ProductToAdd, 'sale_mode'>): boolean {
  return esMedido({ sale_mode: linea.sale_mode ?? null });
}

/**
 * Agrega una línea al carrito sin mutarlo. Por unidad: si ya está el
 * producto, suma la cantidad. Por peso o medida: siempre una línea nueva con
 * `clave` (la de `clavePesada`).
 */
export function agregarLinea(carrito: CarritoMesa, linea: ProductToAdd, clave: string): CarritoMesa {
  const nuevo = new Map(carrito);
  if (!lineaMedida(linea)) {
    const k = claveUnidad(linea.product_id);
    const existente = nuevo.get(k);
    nuevo.set(k, existente ? { ...existente, quantity: existente.quantity + linea.quantity } : { ...linea });
    return nuevo;
  }
  nuevo.set(clave, { ...linea });
  return nuevo;
}

/** Cantidad de una línea del carrito: «0,735 kg» por peso; «3» por unidad. */
export function formatoCantidadCarrito(linea: Pick<ProductToAdd, 'quantity' | 'sale_mode' | 'qty_decimals' | 'unit_code'>, locale = 'es-CO'): string {
  return formatoCantidad(
    Number(linea.quantity) || 0,
    { sale_mode: linea.sale_mode ?? null, qty_decimals: linea.qty_decimals ?? null, unit_code: linea.unit_code ?? null },
    locale,
  );
}

/** ¿Hay alguna línea de ese producto en el carrito? */
export function productoEnCarrito(carrito: CarritoMesa, productId: number): boolean {
  return Array.from(carrito.values()).some((l) => l.product_id === productId);
}

/**
 * Lo que dice la insignia de la tarjeta del producto: «3» por unidad o el
 * total medido «1,235 kg» (suma de las pesadas).
 */
export function resumenProductoEnCarrito(carrito: CarritoMesa, productId: number, locale = 'es-CO'): string | null {
  const lineas = Array.from(carrito.values()).filter((l) => l.product_id === productId);
  if (lineas.length === 0) return null;
  const primera = lineas[0];
  const modo: ProductoModoVenta = { sale_mode: primera.sale_mode ?? null, qty_decimals: primera.qty_decimals ?? null, unit_code: primera.unit_code ?? null };
  const total = sumarCantidades(lineas.map((l) => l.quantity), decimalesCantidad(modo));
  return formatoCantidad(total, modo, locale);
}
