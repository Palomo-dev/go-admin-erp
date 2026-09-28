import { normalizarBusqueda } from './arbol';

/** Filtra las opciones de un `MultiSelect` sin tildes ni mayúsculas. */
export function filtrarOpcionesMulti<T extends { etiqueta: string; descripcion?: string }>(
  opciones: readonly T[],
  busqueda: string,
): T[] {
  const q = normalizarBusqueda(busqueda);
  if (!q) return [...opciones];
  return opciones.filter(
    (o) => normalizarBusqueda(o.etiqueta).includes(q) || (o.descripcion ? normalizarBusqueda(o.descripcion).includes(q) : false),
  );
}

/** Agrega o quita un valor conservando el orden de selección. */
export function alternarValorMulti(valores: readonly string[], valor: string): string[] {
  return valores.includes(valor) ? valores.filter((v) => v !== valor) : [...valores, valor];
}
