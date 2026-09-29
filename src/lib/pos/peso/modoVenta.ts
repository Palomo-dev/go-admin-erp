/**
 * «Cómo se vende» un producto (docs/design/PRODUCTOS-POR-PESO-BASCULA.md §2.1).
 *
 *   unit    → cantidad entera (hoy)
 *   weight  → kg o lb, 3 decimales (gramos), con «Pesar»
 *   measure → metro o litro, 2 decimales, cantidad escrita
 *
 * Espejo de `fn_producto_decimales_cantidad` en la base: el servidor rechaza
 * una cantidad con más decimales que los del producto (`fn_pos_validar_pesaje`).
 * Puro: lo usan el POS, el carrito, el formulario del producto, las
 * devoluciones, los documentos y los tests.
 */

import { redondearCantidad } from '@/lib/inventario/nucleo/costo';

export type ModoVenta = 'unit' | 'weight' | 'measure';

export const MODOS_VENTA: readonly ModoVenta[] = ['unit', 'weight', 'measure'] as const;

/** Campos del producto que deciden cómo se vende (columnas de `products`). */
export interface ProductoModoVenta {
  sale_mode?: string | null;
  qty_decimals?: number | null;
  unit_code?: string | null;
  price_ref_qty?: number | string | null;
  price_ref_unit_code?: string | null;
  min_sale_qty?: number | string | null;
  default_tare_qty?: number | string | null;
  tare_required?: boolean | null;
  require_scale?: boolean | null;
}

/** Unidades de venta por peso y por medida (códigos de `units`, sin relleno). */
export const UNIDADES_PESO = ['KG', 'LB'] as const;
export const UNIDADES_MEDIDA = ['MT', 'LT'] as const;

export function modoVenta(p: Pick<ProductoModoVenta, 'sale_mode'> | null | undefined): ModoVenta {
  const m = (p?.sale_mode ?? '').trim();
  return m === 'weight' || m === 'measure' ? m : 'unit';
}

/** ¿Se vende por peso (kg/lb)? */
export function esPorPeso(p: Pick<ProductoModoVenta, 'sale_mode'> | null | undefined): boolean {
  return modoVenta(p) === 'weight';
}

/** ¿La cantidad lleva decimales (peso o medida)? */
export function esMedido(p: Pick<ProductoModoVenta, 'sale_mode'> | null | undefined): boolean {
  return modoVenta(p) !== 'unit';
}

/** Decimales de la cantidad: unit 0; weight `qty_decimals` o 3; measure `qty_decimals` o 2. */
export function decimalesCantidad(p: Pick<ProductoModoVenta, 'sale_mode' | 'qty_decimals'> | null | undefined): number {
  const modo = modoVenta(p);
  if (modo === 'unit') return 0;
  const d = Math.trunc(Number(p?.qty_decimals ?? 0));
  if (Number.isFinite(d) && d > 0) return Math.min(3, d);
  return modo === 'weight' ? 3 : 2;
}

/** Redondea la cantidad a los decimales del producto (medio hacia arriba, como `round` de Postgres). */
export function redondearCantidadProducto(cantidad: number, decimales: number): number {
  const d = Math.max(0, Math.min(3, Math.trunc(decimales)));
  const base = redondearCantidad(Number(cantidad) || 0);
  // Desplazamiento decimal por texto: 1.005 × 100 da 100,4999… en binario.
  return Math.sign(base) * Number(`${Math.round(Number(`${Math.abs(base)}e${d}`))}e-${d}`);
}

/** Código de unidad sin el relleno de `character(4)`. */
export function codigoUnidad(unit: string | null | undefined): string {
  return (unit ?? '').trim().toUpperCase();
}

const SIMBOLOS: Record<string, string> = {
  KG: 'kg',
  LB: 'lb',
  GR: 'g',
  MT: 'm',
  CM: 'cm',
  LT: 'L',
  ML: 'ml',
  M2: 'm²',
  M3: 'm³',
};

/** Símbolo corto de la unidad de venta («kg», «lb», «m», «L»); vacío si no tiene. */
export function simboloUnidad(unit: string | null | undefined): string {
  return SIMBOLOS[codigoUnidad(unit)] ?? '';
}

/**
 * Unidad que se imprime y se muestra junto a la cantidad: solo en productos
 * por peso o medida (una línea por unidad sigue saliendo «3x»).
 */
export function unidadVisible(p: ProductoModoVenta | null | undefined): string | null {
  if (!esMedido(p)) return null;
  return simboloUnidad(p?.unit_code) || null;
}

/**
 * Cantidad escrita por la persona. Acepta coma o punto decimal («0,735»,
 * «1.5») y hasta `decimales` decimales; `null` si está vacía, no es un número,
 * no es mayor que 0 o trae más decimales de los permitidos (nunca se trunca
 * en silencio). Con `decimales = 0` solo enteros, como hoy.
 */
export function cantidadDesdeTexto(texto: string, decimales = 0): number | null {
  const t = (texto ?? '').trim().replace(/\s/g, '');
  if (!t) return null;
  const d = Math.max(0, Math.min(3, Math.trunc(decimales)));
  const re = d === 0 ? /^\d+$/ : new RegExp(`^\\d+(?:[.,]\\d{1,${d}})?$|^[.,]\\d{1,${d}}$`);
  if (!re.test(t)) return null;
  const n = Number(t.replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? redondearCantidadProducto(n, d) : null;
}

/**
 * Cantidad con su unidad, en el formato del idioma: «0,735 kg», «2,50 m»,
 * «3». Para imprimir se usa el formateador del agente (`@printing/quantity`),
 * que aplica la misma regla.
 */
export function formatoCantidad(
  cantidad: number,
  p: ProductoModoVenta | null | undefined,
  locale = 'es-CO',
): string {
  const n = Number(cantidad) || 0;
  if (!esMedido(p)) {
    return new Intl.NumberFormat(locale, { maximumFractionDigits: 3, useGrouping: false }).format(n);
  }
  const d = decimalesCantidad(p);
  const texto = new Intl.NumberFormat(locale, { minimumFractionDigits: d, maximumFractionDigits: d }).format(n);
  const u = simboloUnidad(p?.unit_code);
  return (u ? `${texto} ${u}` : texto).replace(/[  ]/g, ' ');
}

/** Paso del campo numérico (`step`) según los decimales: 1, 0.1, 0.01, 0.001. */
export function pasoCantidad(decimales: number): number {
  const d = Math.max(0, Math.min(3, Math.trunc(decimales)));
  return d === 0 ? 1 : Number((1 / 10 ** d).toFixed(d));
}
