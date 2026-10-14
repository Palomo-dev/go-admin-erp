import { filtrarPorTexto } from './searchSelectLogica';

/** Filtra las opciones de un `MultiSelect` sin tildes ni mayúsculas. */
export function filtrarOpcionesMulti<T extends { etiqueta: string; descripcion?: string }>(
  opciones: readonly T[],
  busqueda: string,
): T[] {
  return filtrarPorTexto(opciones, busqueda, (o) => [o.etiqueta, o.descripcion]);
}

/** Agrega o quita un valor conservando el orden de selección. */
export function alternarValorMulti(valores: readonly string[], valor: string): string[] {
  return valores.includes(valor) ? valores.filter((v) => v !== valor) : [...valores, valor];
}
