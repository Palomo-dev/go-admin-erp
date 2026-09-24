/**
 * Validación del motivo obligatorio de `DialogoMotivo` (anular venta, anular
 * factura, anular pago, cerrar la caja de otro, ajustar saldo). Sin React.
 */

export const MOTIVO_MINIMO = 5;
export const MOTIVO_MAXIMO = 500;

export type ErrorMotivo = 'vacio' | 'corto' | 'largo';

export interface ResultadoMotivo {
  valido: boolean;
  error: ErrorMotivo | null;
  /** El motivo sin espacios sobrantes: es lo que se envía. */
  limpio: string;
  /** Caracteres que cuentan (tras limpiar). */
  largo: number;
}

/** Colapsa espacios y recorta; no toca mayúsculas ni tildes. */
export function limpiarMotivo(texto: string | null | undefined): string {
  return (texto ?? '').replace(/\s+/g, ' ').trim();
}

export function validarMotivo(
  texto: string | null | undefined,
  { minimo = MOTIVO_MINIMO, maximo = MOTIVO_MAXIMO }: { minimo?: number; maximo?: number } = {},
): ResultadoMotivo {
  const limpio = limpiarMotivo(texto);
  const largo = Array.from(limpio).length;
  let error: ErrorMotivo | null = null;
  if (largo === 0) error = 'vacio';
  else if (largo < minimo) error = 'corto';
  else if (largo > maximo) error = 'largo';
  return { valido: error === null, error, limpio, largo };
}

/**
 * Motivo rápido elegido + detalle escrito: «Error de digitación · cliente pidió
 * otro producto». Si el detalle ya empieza por el motivo rápido, no se repite.
 */
export function componerMotivo(rapido: string | null | undefined, detalle: string | null | undefined): string {
  const r = limpiarMotivo(rapido);
  const d = limpiarMotivo(detalle);
  if (!r) return d;
  if (!d) return r;
  if (d.toLowerCase().startsWith(r.toLowerCase())) return d;
  return `${r} · ${d}`;
}
