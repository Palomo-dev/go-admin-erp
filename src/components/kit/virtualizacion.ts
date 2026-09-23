/**
 * Ventana de filas visibles para tablas largas. Por encima de
 * `UMBRAL_VIRTUALIZACION` filas en el navegador, `DataTable` solo monta las
 * que caben en pantalla más un margen, con dos espaciadores arriba y abajo.
 */

export const UMBRAL_VIRTUALIZACION = 500;

export interface Ventana {
  inicio: number;
  /** Exclusivo. */
  fin: number;
  espacioArriba: number;
  espacioAbajo: number;
}

export function calcularVentana(p: {
  scrollTop: number;
  altoVisible: number;
  altoFila: number;
  total: number;
  margen?: number;
}): Ventana {
  const { altoFila, total } = p;
  const margen = p.margen ?? 8;
  if (total <= 0 || altoFila <= 0) return { inicio: 0, fin: 0, espacioArriba: 0, espacioAbajo: 0 };
  const primera = Math.floor(Math.max(0, p.scrollTop) / altoFila);
  const visibles = Math.ceil(Math.max(0, p.altoVisible) / altoFila) + 1;
  const inicio = Math.min(Math.max(0, primera - margen), Math.max(0, total - 1));
  const fin = Math.min(total, primera + visibles + margen);
  return { inicio, fin, espacioArriba: inicio * altoFila, espacioAbajo: (total - fin) * altoFila };
}
