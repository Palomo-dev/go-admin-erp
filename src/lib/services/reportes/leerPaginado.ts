// ============================================================
// Lectura completa de una consulta de reporte, página por página.
//
// PostgREST corta en 1.000 filas por defecto y los `.limit(n)` que había en
// algunos reportes calculaban los KPI sobre una muestra sin avisar. Aquí se
// lee todo; si el periodo trae más filas que `TOPE_FILAS`, el reporte falla
// con un mensaje que pide acotar el periodo, en vez de mostrar cifras
// incompletas. La consulta debe tener un orden estable (termina en `id`).
// ============================================================

export const PAGINA_FILAS = 1000;
export const TOPE_FILAS = 50_000;

interface Respuesta<T> {
  data: T[] | null;
  error: unknown;
}

export class ReporteDemasiadoGrandeError extends Error {
  constructor() {
    super(`El periodo tiene más de ${TOPE_FILAS.toLocaleString('es-CO')} filas. Acota el periodo o filtra por sucursal.`);
    this.name = 'ReporteDemasiadoGrandeError';
  }
}

/**
 * @param pagina Construye la consulta para las filas `desde`..`hasta`
 *   (incluidas). Se llama una vez por página: el constructor de Supabase no
 *   se reutiliza entre peticiones.
 */
export async function leerPaginado<T>(
  pagina: (desde: number, hasta: number) => PromiseLike<Respuesta<T>>,
): Promise<T[]> {
  const filas: T[] = [];
  for (let desde = 0; ; desde += PAGINA_FILAS) {
    if (desde >= TOPE_FILAS) throw new ReporteDemasiadoGrandeError();
    const { data, error } = await pagina(desde, desde + PAGINA_FILAS - 1);
    if (error) throw error;
    const lote = data ?? [];
    filas.push(...lote);
    if (lote.length < PAGINA_FILAS) return filas;
  }
}
