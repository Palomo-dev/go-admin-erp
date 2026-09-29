/**
 * Una pesada del POS (docs/design/PRODUCTOS-POR-PESO-BASCULA.md §2.6, §2.9).
 *
 * Fase 2 (sin báscula): el peso se escribe a mano, solo con el permiso
 * «Pesar a mano en el POS» (`pos.peso_manual`, resuelto en el servidor con
 * `pos_pesaje_contexto`) y nunca en un producto que «exige báscula».
 * El servidor repite las mismas reglas (`fn_pos_validar_pesaje`): decimales,
 * mínimo y origen del peso en `notes.pesaje`.
 */

import { codigoUnidad, decimalesCantidad, esPorPeso, redondearCantidadProducto, type ProductoModoVenta } from './modoVenta';

export type OrigenPeso = 'bascula' | 'manual' | 'etiqueta';

/** Lo que viaja en `sale_items.notes.pesaje` (el checkout copia `notes` tal cual). */
export interface Pesaje {
  origen: OrigenPeso;
  neto: number;
  unidad: string;
  bruto?: number;
  tara?: number;
  estable?: boolean;
  bascula_id?: string;
  leido_en?: string;
  codigo_etiqueta?: string;
  autorizado_por?: string;
}

export type ErrorPesada =
  | 'peso_invalido'
  | 'demasiados_decimales'
  | 'bajo_minimo'
  | 'manual_sin_permiso'
  | 'exige_bascula';

export type ResultadoPesada =
  | { ok: true; cantidad: number }
  | { ok: false; error: ErrorPesada; minimo?: number; decimales?: number };

/** ¿Puede esta persona escribir el peso a mano para este producto? */
export function puedePesarAMano(
  producto: Pick<ProductoModoVenta, 'require_scale'>,
  permisoPesoManual: boolean,
): boolean {
  return !!permisoPesoManual && !producto.require_scale;
}

/** Venta mínima del producto (`min_sale_qty`) o `null`. */
export function minimoDeVenta(producto: Pick<ProductoModoVenta, 'min_sale_qty'>): number | null {
  const n = Number(producto.min_sale_qty);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Valida la cantidad de una pesada (o de una cantidad por medida) antes de
 * agregarla. La cantidad ya viene leída (`cantidadDesdeTexto`) o `null` si el
 * texto no era válido.
 */
export function validarPesada(params: {
  producto: ProductoModoVenta;
  cantidad: number | null;
  origen: OrigenPeso;
  permisoPesoManual: boolean;
}): ResultadoPesada {
  const { producto, cantidad, origen } = params;
  const dec = decimalesCantidad(producto);
  if (cantidad === null || !Number.isFinite(cantidad) || cantidad <= 0) return { ok: false, error: 'peso_invalido', decimales: dec };
  const redondeada = redondearCantidadProducto(cantidad, dec);
  if (Math.abs(redondeada - cantidad) > 1e-9) return { ok: false, error: 'demasiados_decimales', decimales: dec };
  const minimo = minimoDeVenta(producto);
  if (minimo !== null && redondeada < minimo) return { ok: false, error: 'bajo_minimo', minimo };
  if (esPorPeso(producto) && origen === 'manual') {
    if (producto.require_scale) return { ok: false, error: 'exige_bascula' };
    if (!params.permisoPesoManual) return { ok: false, error: 'manual_sin_permiso' };
  }
  return { ok: true, cantidad: redondeada };
}

/** El registro de una pesada a mano para `notes.pesaje`. */
export function pesajeManual(producto: Pick<ProductoModoVenta, 'unit_code'>, neto: number, ahora: Date = new Date()): Pesaje {
  return { origen: 'manual', neto, unidad: codigoUnidad(producto.unit_code) || 'KG', leido_en: ahora.toISOString() };
}

/**
 * Importe exacto de la pesada (sin redondear: la línea guarda el importe exacto
 * y se redondea solo al mostrar y al cobrar, decisión 3 del dueño).
 */
export function importePesada(cantidad: number, precioPorUnidad: number): number {
  return (Number(cantidad) || 0) * (Number(precioPorUnidad) || 0);
}
