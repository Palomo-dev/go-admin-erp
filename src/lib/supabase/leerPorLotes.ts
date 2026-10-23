/**
 * Lectura por lotes de ids que pagina cada consulta.
 *
 * PostgREST responde como máximo 1.000 filas. Un `.in('product_id', lote)`
 * de unos cientos de productos, con varias imágenes, precios, existencias o
 * etiquetas, pasa de ese tope: el corte no es estable y en cada corrida
 * faltan filas distintas. Cada lote se pide con `.range()` hasta que la
 * página venga corta. El llamador ordena por una clave única (`id`, o
 * `product_id` + `tag_id` si la tabla no tiene `id`).
 */

export const TOPE_FILAS_POSTGREST = 1000;

/** Ids por `.in()`. Con ~10 imágenes por producto, 100 ids caben en una página; igual se pagina. */
export const LOTE_IDS = 100;

export interface PaginaConsulta {
  data: unknown;
  error: { message: string } | null;
}

export async function leerPorLotes<T>(
  ids: readonly number[],
  consulta: (lote: readonly number[], desde: number, hasta: number) => PromiseLike<PaginaConsulta>,
  opciones?: { lote?: number; pagina?: number },
): Promise<T[]> {
  const tamLote = opciones?.lote ?? LOTE_IDS;
  const tamPagina = opciones?.pagina ?? TOPE_FILAS_POSTGREST;
  const vistos = new Set<number>();
  const lista: number[] = [];
  for (const id of ids) {
    if (!Number.isFinite(id) || vistos.has(id)) continue;
    vistos.add(id);
    lista.push(id);
  }
  const salida: T[] = [];
  for (let i = 0; i < lista.length; i += tamLote) {
    const lote = lista.slice(i, i + tamLote);
    let marca = '';
    for (let desde = 0; ; desde += tamPagina) {
      const { data, error } = await consulta(lote, desde, desde + tamPagina - 1);
      if (error) throw error;
      const pagina = (Array.isArray(data) ? data : []) as T[];
      // La página entera, no la primera fila: dos filas distintas pueden
      // coincidir en las columnas pedidas y no por eso el rango está quieto.
      const firma = JSON.stringify(pagina);
      if (pagina.length > 0 && firma === marca) throw new Error('La consulta no avanzó de página');
      marca = firma;
      salida.push(...pagina);
      if (pagina.length < tamPagina) break;
    }
  }
  return salida;
}
