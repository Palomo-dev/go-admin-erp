/**
 * Errores de las RPC de existencias del bloque B1 (y de B2 que llegan por la
 * fachada de «Registrar entrada/salida») → clave de i18n.
 *
 * Primero los códigos propios de B1 (`inventarioStock.errores.<clave>`); si no es
 * uno de ellos, el mapa del núcleo (`inventario.errores.<clave>`, B0).
 */
import { claveErrorInventario, type ErrorRpc } from '@/lib/inventario/nucleo/errores';

export const ERRORES_B1 = [
  'motivo_requerido',
  'razon_requerida',
  'costo_invalido',
  'costo_requerido',
  'producto_con_variantes',
  'producto_sin_seguimiento',
  'producto_sin_control_stock',
  'producto_con_seriales',
  'producto_eliminado',
  'lote_requerido',
  'lote_repetido',
  'lote_con_existencias',
  'lote_con_movimientos',
  'proveedor_invalido',
  'sucursal_requerida',
  'fecha_invalida',
  'items_invalidos',
] as const;

export type ErrorB1 = (typeof ERRORES_B1)[number];

export type ClaveMensajeError = { espacio: 'b1'; clave: ErrorB1 } | { espacio: 'nucleo'; clave: ReturnType<typeof claveErrorInventario> };

export function claveErrorB1(error: ErrorRpc | null | undefined): ClaveMensajeError {
  const mensaje = (error?.message ?? '').trim();
  const propio = (ERRORES_B1 as readonly string[]).find((c) => mensaje === c || mensaje.startsWith(`${c}:`));
  if (propio) return { espacio: 'b1', clave: propio as ErrorB1 };
  if (error?.code === '23505') return { espacio: 'b1', clave: 'lote_repetido' };
  return { espacio: 'nucleo', clave: claveErrorInventario(error) };
}
