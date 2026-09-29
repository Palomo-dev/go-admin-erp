/**
 * Precio «cada tanto» (docs/design/PRODUCTOS-POR-PESO-BASCULA.md §2.2).
 *
 * El precio se guarda SIEMPRE por la unidad de venta (por kg) en
 * `product_prices`, con su vigencia. «Cada 100 g» es solo cómo se escribe y se
 * muestra: $ 1.890 cada 100 g se guarda como $ 18.900 / kg
 * (`products.price_ref_qty = 100`, `price_ref_unit_code = 'GR'`).
 *
 * Solo se admiten referencias que dan un precio por kg exacto (×1, ×2, ×4,
 * ×10, ×20): 1 kg, 500 g, 250 g, 100 g y 50 g. En libras y por medida, solo
 * «por lb», «por m» y «por L».
 */

import { codigoUnidad } from './modoVenta';

export interface ReferenciaPrecio {
  /** Cantidad de la referencia («100»). */
  cantidad: number;
  /** Código de unidad de la referencia («GR», «KG», «LB»). */
  unidad: string;
}

const GRAMOS_KG = [1000, 500, 250, 100, 50] as const;

/** Referencias que el formulario ofrece para la unidad de venta. */
export function referenciasPermitidas(unitCode: string | null | undefined): ReferenciaPrecio[] {
  const u = codigoUnidad(unitCode);
  if (u === 'KG') {
    return GRAMOS_KG.map((g) => (g === 1000 ? { cantidad: 1, unidad: 'KG' } : { cantidad: g, unidad: 'GR' }));
  }
  return u ? [{ cantidad: 1, unidad: u }] : [];
}

/** Referencia del producto (sin datos: 1 unidad de venta). */
export function referenciaDelProducto(p: {
  unit_code?: string | null;
  price_ref_qty?: number | string | null;
  price_ref_unit_code?: string | null;
}): ReferenciaPrecio {
  const cantidad = Number(p.price_ref_qty);
  const unidad = codigoUnidad(p.price_ref_unit_code);
  if (Number.isFinite(cantidad) && cantidad > 0 && unidad) return { cantidad, unidad };
  return { cantidad: 1, unidad: codigoUnidad(p.unit_code) };
}

/** ¿La referencia es una de las permitidas para la unidad de venta? */
export function referenciaValida(ref: ReferenciaPrecio, unitCode: string | null | undefined): boolean {
  return referenciasPermitidas(unitCode).some((r) => r.cantidad === ref.cantidad && r.unidad === codigoUnidad(ref.unidad));
}

/** Unidades de venta que contiene la referencia (100 GR en KG → 0,1). `null` si no es convertible. */
export function factorReferencia(ref: ReferenciaPrecio, unitCode: string | null | undefined): number | null {
  const venta = codigoUnidad(unitCode);
  const r = codigoUnidad(ref.unidad);
  if (!(ref.cantidad > 0) || !venta) return null;
  if (r === venta) return ref.cantidad;
  if (r === 'GR' && venta === 'KG') return ref.cantidad / 1000;
  return null;
}

function redondearMoneda(n: number, decimales: number): number {
  const f = 10 ** Math.max(0, Math.min(4, Math.trunc(decimales)));
  return Math.sign(n) * Math.round(Math.abs(n) * f + Number.EPSILON) / f;
}

/**
 * Precio por unidad de venta (lo que se guarda) desde el precio escrito para
 * la referencia: $ 1.890 cada 100 g → $ 18.900 / kg. `null` si la referencia
 * no es válida para la unidad.
 */
export function precioPorUnidadDesdeReferencia(
  precioEscrito: number,
  ref: ReferenciaPrecio,
  unitCode: string | null | undefined,
  decimalesMoneda = 2,
): number | null {
  const f = factorReferencia(ref, unitCode);
  if (f === null || !referenciaValida(ref, unitCode)) return null;
  return redondearMoneda((Number(precioEscrito) || 0) / f, decimalesMoneda);
}

/** Precio para mostrar en la referencia desde el precio guardado: $ 18.900 / kg → $ 1.890 cada 100 g. */
export function precioEnReferencia(
  precioUnidad: number,
  ref: ReferenciaPrecio,
  unitCode: string | null | undefined,
  decimalesMoneda = 2,
): number {
  const f = factorReferencia(ref, unitCode) ?? 1;
  return redondearMoneda((Number(precioUnidad) || 0) * f, decimalesMoneda);
}

/** ¿La referencia es la propia unidad de venta (por kg, por lb)? */
export function esReferenciaUnidad(ref: ReferenciaPrecio, unitCode: string | null | undefined): boolean {
  return ref.cantidad === 1 && codigoUnidad(ref.unidad) === codigoUnidad(unitCode);
}
