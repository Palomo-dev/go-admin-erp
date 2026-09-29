/**
 * Validación en línea del formulario de factura de venta v2 (mejora M4: los
 * errores quedan en su campo y en el resumen de arriba, no en toasts). Pura:
 * devuelve CLAVES de mensaje; la pantalla las traduce.
 *
 * Guardar el borrador exige lo mínimo que acepta `fn_factura_venta_guardar`
 * (cliente, sucursal, líneas válidas, como el formulario anterior); emitir exige además los seriales
 * completos (L9: los seriales se venden al emitir).
 */
import { calcularLineaVenta, errorComision, type LineaVenta } from '@/lib/finanzas/ventas/lineasFacturaVenta';

export type ErroresFacturaVenta = Partial<Record<string, string>>;

export interface EntradaValidacion {
  cliente: string | null;
  sucursal: number | null;
  emision: string;
  vence: string;
  lineas: readonly LineaVenta[];
  seriales: Record<number, readonly number[]>;
  tasaComision: number;
  metodoComision: 'percentage' | 'fixed_amount';
  subtotal: number;
  total: number;
  paraEmitir: boolean;
}

/** Claves de `facturasVenta.v2.errores.*`. */
export type ClaveError =
  | 'cliente'
  | 'sucursal'
  | 'emision'
  | 'vence'
  | 'lineas'
  | 'descripcion'
  | 'cantidad'
  | 'precio'
  | 'descuento'
  | 'seriales'
  | 'comisionPorcentaje'
  | 'comisionMonto';

export function validarClaves(e: EntradaValidacion): Partial<Record<string, ClaveError>> {
  const r: Partial<Record<string, ClaveError>> = {};
  if (!e.cliente) r.cliente = 'cliente';
  if (!e.sucursal) r.sucursal = 'sucursal';
  if (!e.emision) r.emision = 'emision';
  if (e.vence && e.emision && e.vence < e.emision) r.vence = 'vence';
  if (e.lineas.length === 0) r.lineas = 'lineas';
  for (const l of e.lineas) {
    const clave = `linea.${l.clave}`;
    if (!l.descripcion.trim()) r[clave] = 'descripcion';
    else if (!(Number(l.cantidad) > 0)) r[clave] = 'cantidad';
    else if (!(Number(l.precio) >= 0)) r[clave] = 'precio';
    else if ((Number(l.descuento) || 0) < 0 || calcularLineaVenta(l, false).neto < 0) r[clave] = 'descuento';
    else if (e.paraEmitir && l.serial && l.product_id && (e.seriales[l.product_id]?.length ?? 0) !== Number(l.cantidad)) r[clave] = 'seriales';
  }
  const com = errorComision(e.metodoComision, e.tasaComision, e.subtotal, e.total);
  if (com === 'porcentajeExcede') r.comision = 'comisionPorcentaje';
  if (com === 'montoExcede') r.comision = 'comisionMonto';
  return r;
}

/** Igual que `validarClaves`, con el texto ya traducido por `traducir`. */
export function validarFacturaVenta(e: EntradaValidacion, traducir?: (clave: ClaveError) => string): ErroresFacturaVenta {
  const claves = validarClaves(e);
  const r: ErroresFacturaVenta = {};
  for (const [campo, clave] of Object.entries(claves)) if (clave) r[campo] = traducir ? traducir(clave) : clave;
  return r;
}
