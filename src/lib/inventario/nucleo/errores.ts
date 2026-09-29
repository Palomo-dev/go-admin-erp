/**
 * Traducción de los errores del núcleo de existencias a claves de i18n
 * (`inventario.errores.<clave>` en messages/*.json).
 *
 * Las RPC levantan el código de negocio en `message` (p. ej. 'stock_insuficiente')
 * y el SQLSTATE en `code` (23514, 42501, 22023). Si el mensaje no es uno del
 * núcleo, se cae al SQLSTATE y, por último, a `desconocido`.
 */
import { ERRORES_NUCLEO, type ErrorNucleo } from './tipos';

export type ClaveErrorInventario = ErrorNucleo | 'sin_permiso' | 'desconocido';

export interface ErrorRpc {
  message?: string | null;
  code?: string | null;
  details?: string | null;
}

export function claveErrorInventario(error: ErrorRpc | null | undefined): ClaveErrorInventario {
  const mensaje = (error?.message ?? '').trim();
  const conocido = (ERRORES_NUCLEO as readonly string[]).find((c) => mensaje === c || mensaje.startsWith(`${c}:`) || mensaje.includes(c));
  if (conocido) return conocido as ErrorNucleo;
  if (error?.code === '42501') return 'sin_permiso';
  if (error?.code === '23514') return 'stock_insuficiente';
  return 'desconocido';
}

/** Detalle de `stock_insuficiente` (la primitiva lo manda como JSON en `details`). */
export interface DetalleStockInsuficiente {
  product_id: number;
  branch_id: number;
  lot_id: number | null;
  disponible: number;
  solicitado: number;
}

export function detalleStockInsuficiente(error: ErrorRpc | null | undefined): DetalleStockInsuficiente | null {
  if (!error?.details) return null;
  try {
    const d = JSON.parse(error.details) as Partial<DetalleStockInsuficiente>;
    if (typeof d.product_id !== 'number' || typeof d.solicitado !== 'number') return null;
    return {
      product_id: d.product_id,
      branch_id: Number(d.branch_id),
      lot_id: d.lot_id ?? null,
      disponible: Number(d.disponible) || 0,
      solicitado: d.solicitado,
    };
  } catch {
    return null;
  }
}
