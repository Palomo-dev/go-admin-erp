/**
 * Lee todas las filas de una consulta de Supabase en lotes.
 *
 * PostgREST devuelve como máximo 1.000 filas por petición (`max-rows`): una
 * consulta sin `range` se corta en 1.000 sin avisar. Aquí se pide lote tras lote
 * con `range(desde, hasta)` hasta que uno llega incompleto.
 *
 * La consulta tiene que tener un orden total (p. ej. `created_at` y luego `id`):
 * si dos filas empatan en el orden, un lote puede repetir una y saltarse otra.
 * `construir` se llama en cada lote porque un query builder ya esperado no se
 * puede volver a usar.
 */
export const LOTE_SUPABASE = 1000;

/** Tope de seguridad: más allá de esto la pantalla debe paginar en el servidor. */
export const TOPE_FILAS = 50_000;

export async function leerEnLotes<T>(
  construir: (desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  opciones: { lote?: number; tope?: number } = {},
): Promise<T[]> {
  const lote = opciones.lote ?? LOTE_SUPABASE;
  const tope = opciones.tope ?? TOPE_FILAS;
  const salida: T[] = [];
  for (let desde = 0; desde < tope; desde += lote) {
    const { data, error } = await construir(desde, Math.min(desde + lote, tope) - 1);
    if (error) throw error;
    const filas = data ?? [];
    salida.push(...filas);
    if (filas.length < lote) break;
  }
  return salida;
}
