/**
 * Selección múltiple de listados (PATRONES-TRANSVERSALES.md §1 y §12.7).
 *
 * La casilla de la cabecera va marcada si toda la página está seleccionada,
 * en indeterminado si solo parte y vacía si nada. La selección es un conjunto
 * de ids que sobrevive al cambio de página: «Seleccionar los N» la amplía.
 */

export type EstadoCasilla = boolean | 'indeterminate';

export function estadoCasillaCabecera(seleccion: ReadonlySet<string>, idsPagina: readonly string[]): EstadoCasilla {
  if (idsPagina.length === 0) return false;
  let marcados = 0;
  for (const id of idsPagina) if (seleccion.has(id)) marcados++;
  if (marcados === 0) return false;
  return marcados === idsPagina.length ? true : 'indeterminate';
}

/** Clic en la casilla de cabecera: si toda la página está, la quita; si no, la agrega entera. */
export function alternarPagina(seleccion: ReadonlySet<string>, idsPagina: readonly string[]): Set<string> {
  const siguiente = new Set(seleccion);
  const todos = idsPagina.length > 0 && idsPagina.every((id) => seleccion.has(id));
  for (const id of idsPagina) {
    if (todos) siguiente.delete(id);
    else siguiente.add(id);
  }
  return siguiente;
}

export function alternarId(seleccion: ReadonlySet<string>, id: string): Set<string> {
  const siguiente = new Set(seleccion);
  if (siguiente.has(id)) siguiente.delete(id);
  else siguiente.add(id);
  return siguiente;
}
